#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const nconf = require('nconf');
const {
	normalizeResultPayload,
	getPredictionOutcome,
} = require('../lib/result-sync');

const appRoot = path.resolve(__dirname, '..', '..', '..');
const defaultConfigFile = fs.existsSync('/opt/config/config.json') ?
	'/opt/config/config.json' :
	path.resolve(appRoot, 'config.json');

require(path.join(appRoot, 'src/load-env'))();

nconf.argv().env({
	separator: '__',
});

process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const prestart = require(path.join(appRoot, 'src/prestart'));
const configFile = nconf.any(['config', 'CONFIG']) || defaultConfigFile;
prestart.loadConfig(configFile);
prestart.setupWinston();

let db;
let meta;

function parseArgs(argv) {
	const options = {
		file: '',
		dryRun: false,
		round: '',
		stage: '',
	};

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === '--file' && argv[i + 1]) {
			options.file = argv[++i];
		} else if (arg === '--round' && argv[i + 1]) {
			options.round = String(argv[++i]).trim();
		} else if (arg === '--stage' && argv[i + 1]) {
			options.stage = String(argv[++i]).trim();
		} else if (arg === '--dry-run') {
			options.dryRun = true;
		} else if (!options.file) {
			options.file = arg;
		}
	}

	if (!options.file) {
		throw new Error('Missing results file path');
	}

	return options;
}

function parseCsvLine(line) {
	const values = [];
	let current = '';
	let quoted = false;

	for (let i = 0; i < line.length; i += 1) {
		const ch = line[i];
		if (ch === '"') {
			if (quoted && line[i + 1] === '"') {
				current += '"';
				i += 1;
			} else {
				quoted = !quoted;
			}
		} else if (ch === ',' && !quoted) {
			values.push(current);
			current = '';
		} else {
			current += ch;
		}
	}

	values.push(current);
	return values.map(value => value.trim());
}

function parseCsvFile(filePath) {
	const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
	const lines = raw.split(/\r?\n/).filter(Boolean);
	if (lines.length < 2) {
		return [];
	}

	const headers = parseCsvLine(lines[0]);
	return lines.slice(1).map((line, index) => {
		const columns = parseCsvLine(line);
		const row = { _line: index + 2 };
		headers.forEach((header, headerIndex) => {
			row[header] = columns[headerIndex] || '';
		});
		return row;
	});
}

async function bootstrap() {
	db = require(path.join(appRoot, 'src/database'));
	meta = require(path.join(appRoot, 'src/meta'));
	await db.init();
	await meta.configs.init();
}

function calculatePoints(match, result, prediction) {
	if (!match || !result || !prediction) {
		return 0;
	}

	if (prediction.type === 'result') {
		return getPredictionOutcome(match, prediction) === result.result ? 1 : 0;
	}

	const predictedResult = getPredictionOutcome(match, prediction);
	if (
		prediction.homeScore === result.homeScore &&
		prediction.awayScore === result.awayScore &&
		predictedResult === result.result
	) {
		return 3;
	}

	return predictedResult === result.result ? 1 : 0;
}

async function rebuildLeaderboard(matches) {
	const userScores = {};

	for (const matchId of Object.keys(matches)) {
		const match = matches[matchId];
		if (!match || !match.result) {
			continue;
		}

		const participantUids = await db.getSetMembers(`predictor:match:${matchId}:participants`);
		for (const uid of participantUids) {
			const prediction = await db.getObject(`predictor:predictions:${matchId}:${uid}`);
			if (!prediction || !prediction.prediction) {
				continue;
			}

			let parsedPrediction;
			try {
				parsedPrediction = JSON.parse(prediction.prediction);
			} catch (err) {
				continue;
			}

			const points = calculatePoints(match, match.result, parsedPrediction);
			const key = String(uid);
			userScores[key] = userScores[key] || {
				username: prediction.username || '',
				points: 0,
			};
			userScores[key].points += points;
		}
	}

	await db.delete('predictor:leaderboard');
	const entries = Object.values(userScores).filter(entry => entry.username);
	if (entries.length) {
		await db.sortedSetAdd(
			'predictor:leaderboard',
			entries.map(entry => entry.points),
			entries.map(entry => entry.username)
		);
	}
}

function normalizeResultRow(row) {
	const matchId = String(row.matchId || '').trim();
	if (!matchId) {
		throw new Error(`line ${row._line}: matchId is required`);
	}

	return {
		matchId,
		round: String(row.round || '').trim(),
		stage: String(row.stage || '').trim(),
		payload: {
			homeScore: row.homeScore,
			awayScore: row.awayScore,
			winner: row.winner || row.winnerSide || '',
			decidedBy: row.decidedBy || '',
			note: row.note || '',
			source: String(row.source || 'manual').trim(),
			sourceUrl: String(row.sourceUrl || '').trim(),
		},
		status: String(row.status || row.resultStatus || 'finished').trim() || 'finished',
		_line: row._line,
	};
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const rows = parseCsvFile(path.resolve(process.cwd(), options.file)).map(normalizeResultRow);
	if (!rows.length) {
		throw new Error(`No result rows found in ${options.file}`);
	}

	await bootstrap();
	const matches = await db.getObject('predictor:matches') || {};

	let updated = 0;
	for (const row of rows) {
		const match = matches[row.matchId];
		if (!match) {
			throw new Error(`line ${row._line}: match not found: ${row.matchId}`);
		}
		if (options.round && String(match.round || '') !== options.round) {
			continue;
		}
		if (options.stage && String(match.stage || '').trim() !== options.stage) {
			continue;
		}

		const result = normalizeResultPayload({
			...row.payload,
			status: row.status,
		}, match);
		if (!result) {
			throw new Error(`line ${row._line}: invalid result payload, knockout draw requires winner`);
		}

		const nextMatch = {
			...match,
			status: row.status,
			result: {
				...result,
				status: row.status,
			},
		};

		if (options.dryRun) {
			console.log(`DRYRUN ${row.matchId} ${match.home.name} ${result.homeScore}:${result.awayScore} ${match.away.name}`);
		} else {
			matches[row.matchId] = nextMatch;
			console.log(`UPDATED ${row.matchId} ${match.home.name} ${result.homeScore}:${result.awayScore} ${match.away.name}`);
		}
		updated += 1;
	}

	if (!options.dryRun) {
		await db.setObject('predictor:matches', matches);
		await rebuildLeaderboard(matches);
	}

	console.log(`Done. updated=${updated}${options.round ? ` round=${options.round}` : ''}${options.stage ? ` stage=${options.stage}` : ''}`);
}

main().then(() => {
	process.exit(0);
}).catch((err) => {
	console.error(err.stack || err.message);
	process.exit(1);
});

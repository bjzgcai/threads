#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const nconf = require('nconf');
const {
	normalizeResultPayload,
	fetchResultFromSerpApi,
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
		matchId: '',
		round: '',
		dryRun: false,
		serpapiKey: process.env.SERPAPI_KEY || '',
		hl: process.env.SERPAPI_HL || 'zh-cn',
		gl: process.env.SERPAPI_GL || 'us',
		source: 'SerpApi',
		sourceUrl: '',
		query: '',
		homeScore: '',
		awayScore: '',
	};

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === '--match-id' && argv[i + 1]) {
			options.matchId = String(argv[++i]).trim();
		} else if (arg === '--round' && argv[i + 1]) {
			options.round = String(argv[++i]).trim();
		} else if (arg === '--serpapi-key' && argv[i + 1]) {
			options.serpapiKey = String(argv[++i]).trim();
		} else if (arg === '--hl' && argv[i + 1]) {
			options.hl = String(argv[++i]).trim();
		} else if (arg === '--gl' && argv[i + 1]) {
			options.gl = String(argv[++i]).trim();
		} else if (arg === '--query' && argv[i + 1]) {
			options.query = String(argv[++i]).trim();
		} else if (arg === '--source' && argv[i + 1]) {
			options.source = String(argv[++i]).trim();
		} else if (arg === '--source-url' && argv[i + 1]) {
			options.sourceUrl = String(argv[++i]).trim();
		} else if (arg === '--home-score' && argv[i + 1]) {
			options.homeScore = String(argv[++i]).trim();
		} else if (arg === '--away-score' && argv[i + 1]) {
			options.awayScore = String(argv[++i]).trim();
		} else if (arg === '--dry-run') {
			options.dryRun = true;
		}
	}

	return options;
}

async function bootstrap() {
	db = require(path.join(appRoot, 'src/database'));
	meta = require(path.join(appRoot, 'src/meta'));
	await db.init();
	await meta.configs.init();
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

			const points = calculatePoints(match.result, parsedPrediction);
			if (points <= 0) {
				continue;
			}

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

function calculatePoints(result, prediction) {
	if (!result || !prediction) {
		return 0;
	}

	if (prediction.type === 'result') {
		return prediction.result === result.result ? 1 : 0;
	}

	if (prediction.homeScore === result.homeScore && prediction.awayScore === result.awayScore) {
		return 3;
	}

	const predictedResult = prediction.homeScore === prediction.awayScore ? 'draw' : (prediction.homeScore > prediction.awayScore ? 'home' : 'away');
	return predictedResult === result.result ? 1 : 0;
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	await bootstrap();

	const matches = await db.getObject('predictor:matches') || {};
	const targetMatchIds = Object.keys(matches).filter((matchId) => {
		if (options.matchId) {
			return matchId === options.matchId;
		}
		if (options.round) {
			return String(matches[matchId].round || '') === options.round;
		}
		return true;
	});

	if (!targetMatchIds.length) {
		throw new Error('No matches selected');
	}

	for (const matchId of targetMatchIds) {
		const match = matches[matchId];
		let result;

		if (options.homeScore !== '' && options.awayScore !== '') {
			result = normalizeResultPayload({
				homeScore: options.homeScore,
				awayScore: options.awayScore,
				source: options.source || 'manual',
				sourceUrl: options.sourceUrl,
			});
		} else {
			result = await fetchResultFromSerpApi(match, options);
		}

		if (!result) {
			throw new Error(`Unable to resolve result for ${matchId}`);
		}

		const nextMatch = {
			...match,
			status: 'finished',
			result,
		};

		if (options.dryRun) {
			console.log(`DRYRUN ${matchId} ${match.home.name} ${result.homeScore}:${result.awayScore} ${match.away.name}`);
		} else {
			matches[matchId] = nextMatch;
			console.log(`UPDATED ${matchId} ${match.home.name} ${result.homeScore}:${result.awayScore} ${match.away.name}`);
		}
	}

	if (!options.dryRun) {
		await db.setObject('predictor:matches', matches);
		await rebuildLeaderboard(matches);
	}
}

main().then(() => {
	process.exit(0);
}).catch((err) => {
	console.error(err.stack || err.message);
	process.exit(1);
});

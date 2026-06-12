#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const nconf = require('nconf');
const { resolveTeamFlag, normalizeTeamName } = require('./team-flags');

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
	};

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === '--dry-run') {
			options.dryRun = true;
		} else if (arg === '--file' && argv[i + 1]) {
			options.file = argv[i + 1];
			i += 1;
		} else if (!options.file) {
			options.file = arg;
		}
	}

	return options;
}

function readStdin() {
	return new Promise((resolve, reject) => {
		let input = '';
		process.stdin.setEncoding('utf8');
		process.stdin.on('data', chunk => {
			input += chunk;
		});
		process.stdin.on('end', () => resolve(input));
		process.stdin.on('error', reject);
	});
}

function parseCsvLine(line) {
	/** @type {string[]} */
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

function parseCsv(input) {
	const lines = String(input || '')
		.replace(/^\uFEFF/, '')
		.split(/\r?\n/)
		.filter(Boolean);

	if (lines.length < 2) {
		return [];
	}

	const headers = parseCsvLine(lines[0]);
	return lines.slice(1).map((line, index) => {
		const columns = parseCsvLine(line);
		const row = {};
		headers.forEach((header, headerIndex) => {
			row[header] = columns[headerIndex] || '';
		});
		row._line = index + 2;
		return row;
	});
}

function parseJson(input) {
	const data = JSON.parse(input);
	if (!Array.isArray(data)) {
		throw new Error('JSON root must be an array');
	}
	return data.map((row, index) => ({ ...row, _line: index + 1 }));
}

function normalizeMatch(row, fallbackId) {
	const matchId = String(row.matchId || fallbackId || '').trim();
	if (!matchId) {
		throw new Error(`line ${row._line}: matchId is required`);
	}

	const homeTeam = normalizeTeamName(row.homeTeam);
	const awayTeam = normalizeTeamName(row.awayTeam);
	if (!homeTeam || !awayTeam) {
		throw new Error(`line ${row._line}: homeTeam and awayTeam are required`);
	}

	const match = {
		id: matchId,
		round: parseInt(row.round, 10) || 0,
		format: String(row.format || '').trim() || 'group',
		date: String(row.date || '').trim(),
		time: String(row.time || '').trim(),
		stage: String(row.stage || '').trim() || '小组赛',
		group: String(row.group || '').trim(),
		status: String(row.status || '').trim() || 'upcoming',
		home: {
			name: homeTeam,
			flag: resolveTeamFlag(homeTeam, row.homeFlag),
		},
		away: {
			name: awayTeam,
			flag: resolveTeamFlag(awayTeam, row.awayFlag),
		},
	};

	const homeScore = parseInt(row.homeScore, 10);
	const awayScore = parseInt(row.awayScore, 10);
	if (Number.isInteger(homeScore) && homeScore >= 0 && Number.isInteger(awayScore) && awayScore >= 0) {
		match.result = {
			homeScore,
			awayScore,
			result: homeScore === awayScore ? 'draw' : (homeScore > awayScore ? 'home' : 'away'),
			status: String(row.resultStatus || row.status || '').trim() || 'finished',
			source: String(row.resultSource || '').trim(),
			sourceUrl: String(row.resultSourceUrl || '').trim(),
			updatedAt: Date.now(),
		};
		match.status = match.result.status;
	}

	return match;
}

async function loadInput(options) {
	if (options.file) {
		const filePath = path.resolve(process.cwd(), options.file);
		const raw = fs.readFileSync(filePath, 'utf8');
		return {
			raw,
			type: /\.json$/i.test(filePath) ? 'json' : 'csv',
			source: filePath,
		};
	}

	const raw = await readStdin();
	return {
		raw,
		type: raw.trim().startsWith('[') ? 'json' : 'csv',
		source: 'stdin',
	};
}

async function bootstrap() {
	db = require(path.join(appRoot, 'src/database'));
	meta = require(path.join(appRoot, 'src/meta'));
	await db.init();
	await meta.configs.init();
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const input = await loadInput(options);
	const rows = input.type === 'json' ? parseJson(input.raw) : parseCsv(input.raw);
	if (!rows.length) {
		throw new Error(`No matches found in ${input.source}`);
	}

	const matches = {};
	rows.forEach((row, index) => {
		const fallbackId = `${row.date || 'match'}-${index + 1}`;
		const match = normalizeMatch(row, fallbackId);
		if (matches[match.id]) {
			throw new Error(`Duplicate matchId: ${match.id}`);
		}
		matches[match.id] = match;
	});

	if (options.dryRun) {
		console.log(`Dry run OK: ${Object.keys(matches).length} matches parsed from ${input.source}`);
		console.log(JSON.stringify(Object.values(matches).slice(0, 3), null, 2));
		return;
	}

	await bootstrap();
	await db.setObject('predictor:matches', matches);
	console.log(`Imported ${Object.keys(matches).length} matches from ${input.source}`);
}

main().then(() => {
	process.exit(0);
}).catch((err) => {
	console.error(err.stack || err.message);
	process.exit(1);
});

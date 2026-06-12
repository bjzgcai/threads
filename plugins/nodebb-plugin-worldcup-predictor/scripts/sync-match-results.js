#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const nconf = require('nconf');

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

function normalizeResultPayload(payload) {
	if (!payload || typeof payload !== 'object') {
		return null;
	}

	const homeScore = parseInt(payload.homeScore, 10);
	const awayScore = parseInt(payload.awayScore, 10);
	if (!Number.isInteger(homeScore) || homeScore < 0 || !Number.isInteger(awayScore) || awayScore < 0) {
		return null;
	}

	return {
		homeScore,
		awayScore,
		result: homeScore === awayScore ? 'draw' : (homeScore > awayScore ? 'home' : 'away'),
		status: 'finished',
		source: String(payload.source || 'manual').trim(),
		sourceUrl: String(payload.sourceUrl || '').trim(),
		updatedAt: Date.now(),
	};
}

function buildDefaultQuery(match) {
	const roundText = match.format === 'knockout' ? match.stage : `${match.stage}${match.group ? ` ${match.group}组` : ''}`;
	return `${match.home.name} vs ${match.away.name} ${roundText} ${match.date}`;
}

function buildQueryCandidates(match, options) {
	if (options.query) {
		return [options.query];
	}

	const date = String(match.date || '').trim();
	const year = /^\d{4}-/.test(date) ? date.slice(0, 4) : '';
	const stage = String(match.stage || '').trim();
	const group = String(match.group || '').trim();
	const groupText = group ? `${group}组` : '';

	return Array.from(new Set([
		buildDefaultQuery(match),
		`${match.home.name} ${match.away.name} ${date}`,
		`${match.home.name} ${match.away.name} 比分 ${date}`,
		`${match.home.name} ${match.away.name} 世界杯 ${date}`,
		`${match.home.name} 对 ${match.away.name} 世界杯 ${date}`,
		`${match.home.name} ${match.away.name} ${stage} ${groupText} ${date}`.trim(),
		`${match.home.name} ${match.away.name} FIFA World Cup ${year}`.trim(),
		`${match.home.name} vs ${match.away.name} score ${date}`,
	].filter(Boolean)));
}

function requestJson(url) {
	return new Promise((resolve, reject) => {
		https.get(url, (res) => {
			let body = '';
			res.setEncoding('utf8');
			res.on('data', chunk => {
				body += chunk;
			});
			res.on('end', () => {
				if (res.statusCode < 200 || res.statusCode >= 300) {
					return reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
				}

				try {
					resolve(JSON.parse(body));
				} catch (err) {
					reject(err);
				}
			});
		}).on('error', reject);
	});
}

function normalizeName(value) {
	return String(value || '')
		.toLowerCase()
		.replace(/\s+/g, '')
		.replace(/[()\-_.:：,，]/g, '');
}

function matchesTeam(expected, actual) {
	const left = normalizeName(expected);
	const right = normalizeName(actual);
	return !!left && !!right && (left.includes(right) || right.includes(left));
}

function pickScore(candidate, match) {
	if (!candidate || !Array.isArray(candidate.teams) || candidate.teams.length < 2) {
		return null;
	}

	const teams = candidate.teams.map(team => ({
		name: String(team.name || team.team || '').trim(),
		score: parseInt(team.score, 10),
	}));
	if (!Number.isInteger(teams[0].score) || !Number.isInteger(teams[1].score)) {
		return null;
	}

	const direct = matchesTeam(match.home.name, teams[0].name) && matchesTeam(match.away.name, teams[1].name);
	const reverse = matchesTeam(match.home.name, teams[1].name) && matchesTeam(match.away.name, teams[0].name);
	if (direct) {
		return {
			homeScore: teams[0].score,
			awayScore: teams[1].score,
		};
	}
	if (reverse) {
		return {
			homeScore: teams[1].score,
			awayScore: teams[0].score,
		};
	}
	return null;
}

function flattenCandidates(node, output) {
	if (!node || typeof node !== 'object') {
		return;
	}

	if (Array.isArray(node)) {
		node.forEach(item => flattenCandidates(item, output));
		return;
	}

	if (Array.isArray(node.teams) && node.teams.length >= 2) {
		output.push(node);
	}

	Object.keys(node).forEach(key => {
		flattenCandidates(node[key], output);
	});
}

function buildSerpApiUrl(options, query) {
	const url = new URL('https://serpapi.com/search.json');
	url.searchParams.set('engine', 'google');
	url.searchParams.set('q', query);
	url.searchParams.set('api_key', options.serpapiKey);
	url.searchParams.set('hl', options.hl);
	url.searchParams.set('gl', options.gl);
	return { url: url.toString(), query };
}

async function fetchResultFromSerpApi(match, options) {
	if (!options.serpapiKey) {
		throw new Error('Missing SERPAPI_KEY or --serpapi-key');
	}

	const queries = buildQueryCandidates(match, options);
	const tried = [];

	for (const query of queries) {
		const { url } = buildSerpApiUrl(options, query);
		const data = await requestJson(url);
		const candidates = [];
		flattenCandidates(data.sports_results || data, candidates);
		tried.push(query);

		for (const candidate of candidates) {
			const score = pickScore(candidate, match);
			if (score) {
				return normalizeResultPayload({
					...score,
					source: options.source || 'SerpApi',
					sourceUrl: options.sourceUrl || data.search_metadata?.google_url || '',
				});
			}
		}
	}

	throw new Error(`No finished score found from SerpApi. tried queries: ${tried.join(' | ')}`);
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

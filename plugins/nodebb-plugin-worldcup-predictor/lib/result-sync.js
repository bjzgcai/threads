'use strict';

const https = require('https');

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

module.exports = {
	normalizeResultPayload,
	buildDefaultQuery,
	buildQueryCandidates,
	fetchResultFromSerpApi,
};

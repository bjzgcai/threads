#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const nconf = require('nconf');
const { resolveTeamFlag, normalizeTeamName } = require('./team-flags');

const TOPIC_MAP_KEY = 'predictor:topic-match-map';
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
let topics;

function parseArgs(argv) {
	const options = {
		file: '',
		round: '',
		stage: '',
		cid: 0,
		uid: 1,
		mode: 'result',
		dryRun: false,
		force: false,
		content: '',
		contentFile: '',
	};

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === '--file' && argv[i + 1]) {
			options.file = argv[++i];
		} else if (arg === '--round' && argv[i + 1]) {
			options.round = String(argv[++i]).trim();
		} else if (arg === '--stage' && argv[i + 1]) {
			options.stage = String(argv[++i]).trim();
		} else if (arg === '--cid' && argv[i + 1]) {
			options.cid = parseInt(argv[++i], 10) || 0;
		} else if (arg === '--uid' && argv[i + 1]) {
			options.uid = parseInt(argv[++i], 10) || 1;
		} else if (arg === '--mode' && argv[i + 1]) {
			options.mode = String(argv[++i]).trim() || 'score';
		} else if (arg === '--content' && argv[i + 1]) {
			options.content = argv[++i];
		} else if (arg === '--content-file' && argv[i + 1]) {
			options.contentFile = argv[++i];
		} else if (arg === '--dry-run') {
			options.dryRun = true;
		} else if (arg === '--force') {
			options.force = true;
		}
	}

	if (!options.file) {
		throw new Error('Missing --file');
	}
	if (!options.round && !options.stage) {
		throw new Error('Missing --round or --stage');
	}
	if (!options.cid) {
		throw new Error('Missing --cid');
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
	const headers = parseCsvLine(lines[0] || '');
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

function normalizeMode(mode) {
	return mode === 'result' ? 'result' : 'score';
}

function normalizeRound(value) {
	return String(value || '').trim();
}

function normalizeStage(value) {
	return String(value || '').trim();
}

function formatRoundLabel(match) {
	if (match.format !== 'group') {
		return match.stage;
	}

	const map = {
		'1': '小组赛第一轮',
		'2': '小组赛第二轮',
		'3': '小组赛第三轮',
	};

	return map[String(match.round)] || `小组赛第${match.round}轮`;
}

function formatTitleTime(match) {
	const date = String(match.date || '').trim();
	const time = String(match.time || '').trim();
	const monthDay = date.match(/^\d{4}-(\d{2}-\d{2})$/) ? date.slice(5, 10) : date;
	const hourMinute = time.match(/^\d{2}:\d{2}/) ? time.slice(0, 5) : time;
	const value = [monthDay, hourMinute].filter(Boolean).join(' ');
	return value ? `（${value}）` : '';
}

function normalizeRow(row) {
	const homeTeam = normalizeTeamName(row.homeTeam);
	const awayTeam = normalizeTeamName(row.awayTeam);

	return {
		_line: row._line,
		matchId: String(row.matchId || '').trim(),
		round: normalizeRound(row.round),
		format: String(row.format || '').trim() || 'group',
		stage: String(row.stage || '').trim() || '小组赛',
		group: String(row.group || '').trim(),
		date: String(row.date || '').trim(),
		time: String(row.time || '').trim(),
		homeTeam,
		awayTeam,
		homeFlag: resolveTeamFlag(homeTeam, row.homeFlag),
		awayFlag: resolveTeamFlag(awayTeam, row.awayFlag),
	};
}

function buildDefaultContent(match) {
	if (match.format === 'knockout') {
		return `本帖用于${match.stage}竞猜与讨论，请直接使用上方竞猜卡提交你的胜负预测，也欢迎在回复区讨论比赛。`;
	}
	return `本帖用于${match.group}组本场比赛竞猜与讨论，请直接使用上方竞猜卡提交你的预测，也欢迎在回复区讨论比赛。`;
}

function buildTitle(match) {
	const roundLabel = formatRoundLabel(match);
	const titleTime = formatTitleTime(match);

	if (match.format === 'knockout') {
		return `【世界杯竞猜（${roundLabel}）】${match.homeTeam} vs ${match.awayTeam}${titleTime}`;
	}
	return `【世界杯竞猜（${roundLabel}）】${match.group}组 ${match.homeTeam} vs ${match.awayTeam}${titleTime}`;
}

function loadContentTemplate(options) {
	if (options.content) {
		return options.content;
	}
	if (options.contentFile) {
		return fs.readFileSync(path.resolve(process.cwd(), options.contentFile), 'utf8').trim();
	}
	return '';
}

async function bootstrap() {
	db = require(path.join(appRoot, 'src/database'));
	meta = require(path.join(appRoot, 'src/meta'));
	topics = require(path.join(appRoot, 'src/topics'));
	await db.init();
	await meta.configs.init();
}

async function getExistingTopicTid(matchId) {
	const tid = parseInt(await db.getObjectField(TOPIC_MAP_KEY, matchId), 10) || 0;
	if (!tid) {
		return 0;
	}

	const topicData = await topics.getTopicFields(tid, ['tid', 'cid', 'deleted']);
	if (!topicData || !topicData.tid || !topicData.cid || parseInt(topicData.deleted, 10) === 1) {
		await db.deleteObjectField(TOPIC_MAP_KEY, matchId);
		return 0;
	}

	return tid;
}

async function rememberTopic(matchId, tid) {
	await db.setObjectField(TOPIC_MAP_KEY, matchId, tid);
}

function resolvePredictionMode(match, options) {
	if (match && match.format === 'knockout') {
		return 'result';
	}
	return normalizeMode(options.mode);
}

async function bindTopicToMatch(tid, match, options) {
	await topics.setTopicFields(tid, {
		title: buildTitle(match),
		predictorMatchId: match.matchId,
		predictorPredictionMode: resolvePredictionMode(match, options),
	});
}

async function createTopicForMatch(match, options, contentTemplate) {
	const content = contentTemplate || buildDefaultContent(match);
	if (options.dryRun) {
		return {
			skipped: false,
			dryRun: true,
			title: buildTitle(match),
			content,
		};
	}

	const existingTid = await getExistingTopicTid(match.matchId);
	if (existingTid) {
		if (!options.force) {
			return { skipped: true, reason: `already published as tid ${existingTid}`, tid: existingTid };
		}

		await bindTopicToMatch(existingTid, match, options);
		await rememberTopic(match.matchId, existingTid);
		return {
			skipped: false,
			tid: existingTid,
			updated: true,
		};
	}

	const result = await topics.post({
		uid: options.uid,
		cid: options.cid,
		title: buildTitle(match),
		content,
	});

	await bindTopicToMatch(result.topicData.tid, match, options);
	await rememberTopic(match.matchId, result.topicData.tid);
	return {
		skipped: false,
		tid: result.topicData.tid,
		pid: result.postData.pid,
	};
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const rows = parseCsvFile(path.resolve(process.cwd(), options.file)).map(normalizeRow);
	const matches = rows.filter((row) => {
		if (options.round && row.round !== normalizeRound(options.round)) {
			return false;
		}
		if (options.stage && row.stage !== normalizeStage(options.stage)) {
			return false;
		}
		return true;
	});

	if (!matches.length) {
		throw new Error(`No matches found for round=${options.round || 'any'} stage=${options.stage || 'any'}`);
	}

	const contentTemplate = loadContentTemplate(options);

	if (!options.dryRun) {
		await bootstrap();
	}

	let created = 0;
	let skipped = 0;

	for (const match of matches) {
		if (!match.matchId) {
			throw new Error(`line ${match._line}: matchId is required`);
		}

		const result = await createTopicForMatch(match, options, contentTemplate);
		if (result.skipped) {
			skipped += 1;
			console.log(`SKIP ${match.matchId} ${result.reason}`);
			continue;
		}

		created += 1;
		if (options.dryRun) {
			console.log(`DRYRUN ${match.matchId} -> ${result.title}`);
		} else if (result.updated) {
			console.log(`UPDATED ${match.matchId} -> tid ${result.tid}`);
		} else {
			console.log(`CREATED ${match.matchId} -> tid ${result.tid}`);
		}
	}

	console.log(`Done. round=${options.round || 'any'} stage=${options.stage || 'any'} created=${created} skipped=${skipped} total=${matches.length}`);
}

main().then(() => {
	process.exit(0);
}).catch((err) => {
	console.error(err.stack || err.message);
	process.exit(1);
});

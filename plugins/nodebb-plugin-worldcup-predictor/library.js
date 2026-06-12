'use strict';

const fs = require('fs');
const path = require('path');
const express = require.main.require('express');
const { CronJob } = require.main.require('cron');
const db = require.main.require('./src/database');
const topics = require.main.require('./src/topics');
const privileges = require.main.require('./src/privileges');
const user = require.main.require('./src/user');
const nconf = require.main.require('nconf');
const winston = require.main.require('winston');
const jsesc = require.main.require('jsesc');
const {
	normalizeResultPayload,
	fetchResultFromSerpApi,
} = require('./lib/result-sync');
const { Router } = express;

const plugin = module.exports;

let middleware;
let inlineStyles;
let resultSyncJob;
const ASSET_VERSION = '20260611-reply-plain-v2';
const TOPIC_MAP_KEY = 'predictor:topic-match-map';
const RESULT_SYNC_LOCK_KEY = 'predictor:result-sync:lock';
const RESULT_SYNC_META_PREFIX = 'predictor:result-sync:meta:';
const RESULT_SYNC_RETRY_MINUTES = [0, 3, 5, 10];

const Predictor = {};

plugin.init = async function () {
	winston.info('[worldcup-predictor] Plugin initialized');
	Predictor.startResultSyncJob();
};

plugin.addRoutes = async function (data) {
	const app = data.app;
	if (!middleware) {
		middleware = data.middleware || require.main.require('./src/middleware');
	}

	const router = data.router || Router();

	router.get('/predictor', middleware.buildHeader, renderPredictorPage);
	router.get('/predictor/my-results', middleware.buildHeader, renderMyResultsPage);
	router.get('/predictor/leaderboard', middleware.buildHeader, renderLeaderboardPage);
	router.get('/api/v3/predictor/matches', getMatches);
	router.get('/api/v3/predictor/topic/:tid', getTopicPredictorContext);
	router.post('/api/v3/predictor/predictions', createPrediction);
	router.post('/api/v3/predictor/topic/:tid/predict', createTopicPrediction);
	router.get('/api/v3/predictor/my-predictions', getUserPredictions);
	router.get('/api/v3/predictor/leaderboard', getLeaderboard);
	router.post('/api/v3/predictor/publish-result', publishResultAsPost);

	if (!data.router) {
		app.use('/', router);
	}

	winston.info('[worldcup-predictor] Routes registered');
};

plugin.filterTopicCreate = async function (hookData) {
	const matchId = String(hookData.data.predictorMatchId || '').trim();
	if (!matchId) {
		return hookData;
	}

	const matches = await Predictor.getMatches();
	if (!matches[matchId]) {
		throw new Error('[[error:invalid-data]]');
	}

	const predictionMode = Predictor.normalizePredictionMode(hookData.data.predictorPredictionMode);
	hookData.topic.predictorMatchId = matchId;
	hookData.topic.predictorPredictionMode = predictionMode;
	return hookData;
};

plugin.addHeaderAssets = async function (hookData) {
	const customHTML = hookData.templateData.customHTML || '';
	if (!customHTML.includes('data-worldcup-predictor-styles')) {
		hookData.templateData.useCustomHTML = true;
		hookData.templateData.customHTML = `${customHTML}
<style data-worldcup-predictor-styles>
${getInlineStyles()}
</style>`;
	}
	return hookData;
};


function getInlineStyles() {
	if (!inlineStyles) {
		inlineStyles = fs.readFileSync(path.join(__dirname, 'static/css/predictor.css'), 'utf8');
	}
	return inlineStyles;
}

plugin.filterTopicGet = async function (hookData) {
	if (!hookData.topic || !hookData.topic.predictorMatchId) {
		return hookData;
	}

	const matches = await Predictor.getMatches();
	const match = matches[hookData.topic.predictorMatchId];
	hookData.topic.predictorMatch = match || null;
	hookData.topic.predictorPredictionMode = Predictor.normalizePredictionMode(
		hookData.topic.predictorPredictionMode
	);
	return hookData;
};

async function renderPredictorPage(req, res, next) {
	return renderPredictorPageWithTab(req, res, next, 'matches');
}

async function renderMyResultsPage(req, res, next) {
	return renderPredictorPageWithTab(req, res, next, 'my-predictions');
}

async function renderLeaderboardPage(req, res, next) {
	return renderPredictorPageWithTab(req, res, next, 'leaderboard');
}

async function renderPredictorPageWithTab(req, res, next, activeTab) {
	try {
		const matchesData = await Predictor.getMatches();
		const userData = req.user ? {
			uid: req.user.uid,
			username: req.user.username,
		} : null;

		res.render('predictor', {
			matchesJSON: jsesc(JSON.stringify(matchesData), { isScriptContext: true }),
			userJSON: jsesc(JSON.stringify(userData), { isScriptContext: true }),
			configJSON: jsesc(JSON.stringify({
				relative_path: nconf.get('relative_path'),
				activeTab,
			}), { isScriptContext: true }),
			title: '世界杯竞猜',
		});
	} catch (err) {
		next(err);
	}
}

async function getMatches(req, res, next) {
	try {
		const matches = await Predictor.getMatches();
		res.json(matches);
	} catch (err) {
		next(err);
	}
}

async function getTopicPredictorContext(req, res, next) {
	try {
		const tid = parseInt(req.params.tid, 10);
		if (!Number.isInteger(tid) || tid <= 0) {
			return res.status(400).json({ error: 'Invalid tid' });
		}

		const topicData = await topics.getTopicData(tid);
		if (!topicData || !topicData.predictorMatchId) {
			return res.json({ enabled: false });
		}

		const matches = await Predictor.getMatches();
		const match = matches[topicData.predictorMatchId];
		if (!match) {
			return res.json({ enabled: false });
		}

		const uid = req.user ? req.user.uid : 0;
		const prediction = uid ? await Predictor.getTopicPrediction(tid, uid) : null;
		const canViewPredictionDetails = uid ? await privileges.topics.isAdminOrMod(tid, uid) : false;
		const participantCount = await db.setCount(`predictor:topic:${tid}:participants`);
		const shouldShowPredictionSummary = !!prediction || canViewPredictionDetails;
		const predictionSummary = shouldShowPredictionSummary ? await Predictor.getTopicPredictionSummary(tid, topicData, match) : null;
		const publicPredictionSummary = predictionSummary ? { ...predictionSummary, details: undefined } : null;
		const kickoffTimestamp = Predictor.getMatchKickoffTimestamp(match);
		const predictionOpen = Predictor.isPredictionOpen(match);
		const matchResult = Predictor.getMatchResult(match);
		const myPredictionVerdict = Predictor.evaluatePrediction(match, prediction ? prediction.prediction : null);

		res.json({
			enabled: true,
			tid,
			matchId: topicData.predictorMatchId,
			predictionMode: Predictor.normalizePredictionMode(topicData.predictorPredictionMode),
			match,
			myPrediction: prediction,
			participantCount,
			predictionSummary: publicPredictionSummary,
			predictionDetails: canViewPredictionDetails && predictionSummary ? predictionSummary.details : [],
			canViewPredictionDetails,
			loggedIn: !!uid,
			predictionOpen,
			kickoffTimestamp,
			matchResult,
			myPredictionVerdict,
		});
	} catch (err) {
		next(err);
	}
}

async function createPrediction(req, res, next) {
	try {
		if (!req.uid || !req.loggedIn) {
			return res.status(403).json({ error: '[[error:no-privileges]]' });
		}

		const { matchId } = req.body;
		const prediction = Predictor.normalizePredictionPayload(req.body.prediction, 'score');
		const uid = req.user.uid;
		const matches = await Predictor.getMatches();

		if (!matchId || !matches[matchId]) {
			return res.status(400).json({ error: 'Missing or invalid matchId' });
		}
		if (!Predictor.isPredictionOpen(matches[matchId])) {
			return res.status(409).json({ error: '比赛已开始，不能再提交预测' });
		}

		await Predictor.savePrediction({
			matchId,
			uid,
			username: req.user.username,
			prediction,
		});

		res.json({ success: true, data: { matchId, prediction } });
	} catch (err) {
		next(err);
	}
}

async function createTopicPrediction(req, res, next) {
	try {
		if (!req.uid || !req.loggedIn) {
			return res.status(403).json({ error: '[[error:no-privileges]]' });
		}

		const tid = parseInt(req.params.tid, 10);
		const uid = req.user.uid;
		const topicData = await topics.getTopicData(tid);

		if (!topicData || !topicData.predictorMatchId) {
			return res.status(404).json({ error: 'No predictor match bound to this topic' });
		}

		const matchId = topicData.predictorMatchId;
		const matches = await Predictor.getMatches();
		topicData.predictorMatch = matches[matchId] || null;
		if (!topicData.predictorMatch) {
			return res.status(404).json({ error: 'Match not found' });
		}
		if (!Predictor.isPredictionOpen(topicData.predictorMatch)) {
			return res.status(409).json({ error: '比赛已开始，不能再提交预测' });
		}
		const predictionMode = Predictor.normalizePredictionMode(topicData.predictorPredictionMode);
		const existingPrediction = await Predictor.getTopicPrediction(tid, uid);
		if (existingPrediction) {
			return res.status(409).json({ error: '你已经在本帖提交过预测' });
		}
		const prediction = Predictor.normalizePredictionPayload(req.body.prediction, predictionMode);

		await Predictor.savePrediction({
			matchId,
			uid,
			username: req.user.username,
			prediction,
			tid,
		});
		await Predictor.saveTopicPrediction({
			tid,
			matchId,
			uid,
			username: req.user.username,
			prediction,
		});

		res.json({
			success: true,
			data: {
				matchId,
				prediction,
				reply: null,
			},
		});
	} catch (err) {
		next(err);
	}
}

async function getUserPredictions(req, res, next) {
	try {
		if (!req.uid || !req.loggedIn) {
			return res.status(403).json({ error: '[[error:no-privileges]]' });
		}

		const uid = req.user.uid;
		const matches = await Predictor.getMatches();
		const entries = await Predictor.getUserPredictionEntries(uid, matches);
		const predictions = entries.reduce((memo, entry) => {
			memo[entry.matchId] = entry;
			return memo;
		}, {});
		const summary = Predictor.summarizePredictionEntries(entries);
		summary.accuracy = Predictor.getAccuracySummary(summary);

		res.json({ predictions, entries, summary });
	} catch (err) {
		next(err);
	}
}

async function getLeaderboard(req, res, next) {
	try {
		const matches = await Predictor.getMatches();
		const leaderboard = await Predictor.getLeaderboardEntries(matches, 100);
		res.json({ leaderboard });
	} catch (err) {
		next(err);
	}
}

async function publishResultAsPost(req, res, next) {
	try {
		if (!req.uid || !req.loggedIn) {
			return res.status(403).json({ error: '[[error:no-privileges]]' });
		}

		const uid = req.user.uid;
		const { matchId, categoryId, title, content, predictionMode } = req.body;

		if (!categoryId || !title || !content) {
			return res.status(400).json({ error: 'Missing required fields' });
		}

		const canCreate = await privileges.categories.can('topics:create', categoryId, uid);
		if (!canCreate) {
			return res.status(403).json({ error: 'Permission denied' });
		}

		const result = await topics.post({
			uid,
			cid: categoryId,
			title,
			content,
			tags: ['世界杯', '竞猜'],
			predictorMatchId: matchId,
			predictorPredictionMode: Predictor.normalizePredictionMode(predictionMode),
			req,
		});

		if (matchId) {
			await db.setAdd(`predictor:published:${matchId}`, result.topicData.tid);
		}

		res.json({
			success: true,
			data: {
				tid: result.topicData.tid,
				url: `${nconf.get('relative_path')}/topic/${result.topicData.slug}`,
			},
		});
	} catch (err) {
		next(err);
	}
}

Predictor.normalizePredictionMode = function (mode) {
	return mode === 'result' ? 'result' : 'score';
};

Predictor.normalizeMatchResultPayload = function (result) {
	return normalizeResultPayload(result);
};

Predictor.getMatchKickoffTimestamp = function (match) {
	if (!match || !match.date || !match.time) {
		return 0;
	}

	const timestamp = Date.parse(`${match.date}T${match.time}:00+08:00`);
	return Number.isFinite(timestamp) ? timestamp : 0;
};

Predictor.isPredictionOpen = function (match) {
	const kickoffTimestamp = Predictor.getMatchKickoffTimestamp(match);
	if (!kickoffTimestamp) {
		return true;
	}

	return Date.now() < kickoffTimestamp;
};

Predictor.getMatchResult = function (match) {
	return Predictor.normalizeMatchResultPayload(match && match.result);
};

Predictor.isMatchFinished = function (match) {
	const result = Predictor.getMatchResult(match);
	if (result && result.status === 'finished') {
		return true;
	}
	return String(match && match.status || '').trim() === 'finished';
};

Predictor.evaluatePrediction = function (match, prediction) {
	const result = Predictor.getMatchResult(match);
	if (!prediction) {
		return null;
	}
	if (!result || !Predictor.isMatchFinished(match)) {
		return {
			status: 'pending',
			correct: null,
			points: 0,
			label: '待结算',
			variant: 'secondary',
		};
	}

	if (prediction.type === 'result') {
		const correct = prediction.result === result.result;
		return {
			status: correct ? 'correct' : 'wrong',
			correct,
			points: correct ? 1 : 0,
			label: correct ? '猜中胜平负' : '未猜中',
			variant: correct ? 'success' : 'danger',
		};
	}

	const sameScore = prediction.homeScore === result.homeScore && prediction.awayScore === result.awayScore;
	const sameResult = (
		(prediction.homeScore === prediction.awayScore && result.result === 'draw') ||
		(prediction.homeScore > prediction.awayScore && result.result === 'home') ||
		(prediction.homeScore < prediction.awayScore && result.result === 'away')
	);
	if (sameScore) {
		return {
			status: 'exact',
			correct: true,
			points: 3,
			label: '比分完全命中',
			variant: 'success',
		};
	}

	if (sameResult) {
		return {
			status: 'correct',
			correct: true,
			points: 1,
			label: '猜中胜平负',
			variant: 'warning',
		};
	}

	return {
		status: 'wrong',
		correct: false,
		points: 0,
		label: '未猜中',
		variant: 'danger',
	};
};

Predictor.normalizePredictionPayload = function (prediction, predictionMode) {
	if (!prediction || typeof prediction !== 'object') {
		throw new Error('Invalid prediction');
	}

	if (predictionMode === 'result') {
		if (!['home', 'away', 'draw'].includes(prediction.result)) {
			throw new Error('Invalid prediction result');
		}
		return {
			type: 'result',
			result: prediction.result,
		};
	}

	const homeScore = parseInt(prediction.homeScore, 10);
	const awayScore = parseInt(prediction.awayScore, 10);
	if (!Number.isInteger(homeScore) || homeScore < 0 || !Number.isInteger(awayScore) || awayScore < 0) {
		throw new Error('Invalid prediction score');
	}

	return {
		type: 'score',
		homeScore,
		awayScore,
	};
};

Predictor.savePrediction = async function ({ matchId, uid, username, prediction, tid }) {
	const key = `predictor:predictions:${matchId}:${uid}`;
	await db.setObject(key, {
		uid,
		username,
		matchId,
		tid: tid || '',
		prediction: JSON.stringify(prediction),
		createdAt: Date.now(),
	});
	await db.setAdd(`predictor:user:predictions:${uid}`, matchId);
	await db.setAdd(`predictor:match:${matchId}:participants`, uid);
	if (tid) {
		await db.setAdd(`predictor:topic:${tid}:participants`, uid);
	}
};

Predictor.getPrediction = async function (matchId, uid) {
	const key = `predictor:predictions:${matchId}:${uid}`;
	const prediction = await db.getObject(key);
	if (!prediction) {
		return null;
	}
	return {
		...prediction,
		prediction: JSON.parse(prediction.prediction),
	};
};

Predictor.saveTopicPrediction = async function ({ tid, matchId, uid, username, prediction }) {
	const key = `predictor:topic:${tid}:prediction:${uid}`;
	await db.setObject(key, {
		uid,
		username,
		matchId,
		tid,
		prediction: JSON.stringify(prediction),
		createdAt: Date.now(),
	});
};

Predictor.getTopicPrediction = async function (tid, uid) {
	const key = `predictor:topic:${tid}:prediction:${uid}`;
	const prediction = await db.getObject(key);
	if (!prediction) {
		return null;
	}
	return {
		...prediction,
		prediction: JSON.parse(prediction.prediction),
	};
};

Predictor.getTopicPredictionSummary = async function (tid, topicData, match) {
	const participantUids = await db.getSetMembers(`predictor:topic:${tid}:participants`);
	const usersByUid = await getPredictionUsersByUid(participantUids);
	const predictionMode = Predictor.normalizePredictionMode(topicData.predictorPredictionMode);
	const counts = predictionMode === 'result' ? {
		home: 0,
		draw: 0,
		away: 0,
	} : {};
	const details = [];

	await Promise.all(participantUids.map(async (uid) => {
		const entry = await Predictor.getTopicPrediction(tid, uid);
		if (!entry || !entry.prediction) {
			return;
		}

		const label = Predictor.formatPredictionLabel(match, entry.prediction);
		if (predictionMode === 'result') {
			const result = entry.prediction.result;
			if (Object.prototype.hasOwnProperty.call(counts, result)) {
				counts[result] += 1;
			}
		} else {
			counts[label] = (counts[label] || 0) + 1;
		}

		const userData = usersByUid[String(entry.uid)] || {};
		const displayname = userData.username || entry.username || '';
		details.push({
			uid: entry.uid,
			username: userData.username || entry.username || '',
			fullname: userData.fullname || '',
			displayname,
			userslug: userData.userslug || '',
			picture: userData.picture || '',
			iconBgColor: userData['icon:bgColor'] || '',
			iconText: userData['icon:text'] || (displayname ? displayname.slice(0, 1) : ''),
			prediction: entry.prediction,
			label,
			createdAt: entry.createdAt,
		});
	}));

	details.sort((a, b) => (parseInt(a.createdAt, 10) || 0) - (parseInt(b.createdAt, 10) || 0));

	return {
		total: details.length,
		mode: predictionMode,
		counts,
		labels: {
			home: `${match.home.name} 胜`,
			draw: '平局',
			away: `${match.away.name} 胜`,
		},
		details,
	};
};

async function getPredictionUsersByUid(uids) {
	if (!Array.isArray(uids) || !uids.length) {
		return {};
	}

	const users = await user.getUsersFields(uids, [
		'uid', 'username', 'fullname', 'userslug', 'picture', 'icon:bgColor', 'icon:text',
	]);
	return users.reduce((memo, userData) => {
		if (userData && userData.uid) {
			memo[String(userData.uid)] = userData;
		}
		return memo;
	}, {});
}

Predictor.formatPredictionLabel = function (match, prediction) {
	if (prediction.type === 'result') {
		if (prediction.result === 'home') {
			return `${match.home.name} 胜`;
		}
		if (prediction.result === 'away') {
			return `${match.away.name} 胜`;
		}
		return '平局';
	}

	return `${match.home.name} ${prediction.homeScore} : ${prediction.awayScore} ${match.away.name}`;
};

Predictor.buildPredictionReplyText = function (topicData, prediction) {
	const match = topicData.predictorMatch;
	if (!match) {
		return '我已提交本场比赛预测。';
	}

	if (prediction.type === 'result') {
		if (prediction.result === 'home') {
			return `我预测：${match.home.name} 胜。`;
		}
		if (prediction.result === 'away') {
			return `我预测：${match.away.name} 胜。`;
		}
		return `我预测：${match.home.name} 与 ${match.away.name} 打平。`;
	}

	return `我预测：${match.home.name} ${prediction.homeScore} : ${prediction.awayScore} ${match.away.name}。`;
};

Predictor.getUserPredictionEntries = async function (uid, matches) {
	const matchIds = await db.getSetMembers(`predictor:user:predictions:${uid}`);
	const entries = [];

	for (const matchId of matchIds) {
		const prediction = await Predictor.getPrediction(matchId, uid);
		const match = matches[matchId];
		if (!prediction || !match) {
			continue;
		}

		entries.push({
			...prediction,
			match,
			topicUrl: match.topicUrl || '',
			matchResult: Predictor.getMatchResult(match),
			verdict: Predictor.evaluatePrediction(match, prediction.prediction),
		});
	}

	entries.sort((a, b) => {
		const left = Predictor.getMatchKickoffTimestamp(a.match) || 0;
		const right = Predictor.getMatchKickoffTimestamp(b.match) || 0;
		return left - right;
	});

	return entries;
};

Predictor.summarizePredictionEntries = function (entries) {
	return entries.reduce((memo, entry) => {
		const verdict = entry.verdict || {};
		memo.total += 1;
		if (verdict.status === 'pending') {
			memo.pending += 1;
		} else if (verdict.correct) {
			memo.correct += 1;
		} else if (verdict.status) {
			memo.wrong += 1;
		}
		memo.points += parseInt(verdict.points, 10) || 0;
		return memo;
	}, {
		total: 0,
		pending: 0,
		correct: 0,
		wrong: 0,
		points: 0,
	});
};

Predictor.getMatches = async function () {
	try {
		let matches = await db.getObject('predictor:matches');
		if (!matches || Object.keys(matches).length === 0) {
			matches = await Predictor.initializeDefaultMatches();
		}
		const preparedMatches = Object.keys(matches).reduce((memo, matchId) => {
			memo[matchId] = Predictor.prepareMatchRecord(matches[matchId]);
			return memo;
		}, {});
		await Predictor.attachTopicUrls(preparedMatches);
		return preparedMatches;
	} catch (err) {
		winston.error(`[predictor] Error getting matches: ${err.message}`);
		return {};
	}
};

Predictor.prepareMatchRecord = function (match) {
	if (!match || typeof match !== 'object') {
		return match;
	}

	const prepared = {
		...match,
		home: match.home || { name: '', flag: '' },
		away: match.away || { name: '', flag: '' },
	};
	const result = Predictor.getMatchResult(prepared);
	if (result) {
		prepared.result = result;
		if (result.status === 'finished') {
			prepared.status = 'finished';
		}
	}
	return prepared;
};

Predictor.attachTopicUrls = async function (matches) {
	const matchIds = Object.keys(matches || {});
	if (!matchIds.length) {
		return matches;
	}

	const mappedTids = await db.getObjectFields(TOPIC_MAP_KEY, matchIds);
	await Promise.all(matchIds.map(async (matchId, index) => {
		const tid = parseInt(Array.isArray(mappedTids) ? mappedTids[index] : mappedTids && mappedTids[matchId], 10) || 0;
		if (!tid) {
			return;
		}

		const topicData = await topics.getTopicFields(tid, ['slug']);
		if (topicData && topicData.slug) {
			matches[matchId].topicTid = tid;
			matches[matchId].topicUrl = `${nconf.get('relative_path')}/topic/${topicData.slug}`;
		}
	}));

	return matches;
};

Predictor.setMatchResult = async function (matchId, result, extraFields) {
	const matches = await Predictor.getMatches();
	const match = matches[matchId];
	if (!match) {
		throw new Error(`Match not found: ${matchId}`);
	}

	const normalizedResult = Predictor.normalizeMatchResultPayload(result);
	if (!normalizedResult) {
		throw new Error('Invalid result payload');
	}

	const nextMatch = Predictor.prepareMatchRecord({
		...match,
		...extraFields,
		status: normalizedResult.status || 'finished',
		result: normalizedResult,
	});

	matches[matchId] = nextMatch;
	await db.setObject('predictor:matches', matches);
	await Predictor.rebuildLeaderboard();
	return nextMatch;
};

Predictor.rebuildLeaderboard = async function () {
	const matches = await Predictor.getMatches();
	const allMatchIds = Object.keys(matches);
	const userScores = {};

	for (const matchId of allMatchIds) {
		const participantUids = await db.getSetMembers(`predictor:match:${matchId}:participants`);
		for (const uid of participantUids) {
			const prediction = await Predictor.getPrediction(matchId, uid);
			if (!prediction) {
				continue;
			}
			const verdict = Predictor.evaluatePrediction(matches[matchId], prediction.prediction);
			if (!verdict || verdict.status === 'pending') {
				continue;
			}
			const scoreEntry = userScores[String(uid)] || {
				points: 0,
				username: prediction.username || '',
			};
			scoreEntry.points += parseInt(verdict.points, 10) || 0;
			if (!scoreEntry.username && prediction.username) {
				scoreEntry.username = prediction.username;
			}
			userScores[String(uid)] = scoreEntry;
		}
	}

	await db.delete('predictor:leaderboard');
	const usernames = Object.values(userScores)
		.filter(entry => entry.username)
		.map(entry => entry.username);
	const scores = Object.values(userScores)
		.filter(entry => entry.username)
		.map(entry => entry.points);
	if (usernames.length) {
		await db.sortedSetAdd('predictor:leaderboard', scores, usernames);
	}
};

Predictor.getAccuracySummary = function (summary) {
	const settled = Math.max((summary.correct || 0) + (summary.wrong || 0), 0);
	const percent = settled ? Math.round(((summary.correct || 0) / settled) * 100) : 0;
	return {
		settled,
		percent,
	};
};

Predictor.getLeaderboardEntries = async function (matches, limit) {
	const allMatchIds = Object.keys(matches || {});
	const statsByUid = {};

	for (const matchId of allMatchIds) {
		const match = matches[matchId];
		const participantUids = await Predictor.getMatchParticipantUids(matchId);
		const topicTids = await Predictor.getMatchTopicTids(matchId);
		for (const uid of participantUids) {
			let prediction = await Predictor.getPrediction(matchId, uid);
			if (!prediction && topicTids.length) {
				for (const tid of topicTids) {
					// eslint-disable-next-line no-await-in-loop
					const topicPrediction = await Predictor.getTopicPrediction(tid, uid);
					if (topicPrediction) {
						prediction = topicPrediction;
						break;
					}
				}
			}
			if (!prediction) {
				continue;
			}

			const verdict = Predictor.evaluatePrediction(match, prediction.prediction);
			const key = String(uid);
			if (!statsByUid[key]) {
				statsByUid[key] = {
					uid: parseInt(uid, 10) || 0,
					username: prediction.username || '',
					score: 0,
					total: 0,
					correct: 0,
					exact: 0,
					wrong: 0,
					pending: 0,
					recent: [],
				};
			}

			const stats = statsByUid[key];
			stats.total += 1;
			stats.score += parseInt(verdict && verdict.points, 10) || 0;
			if (verdict) {
				if (verdict.status === 'pending') {
					stats.pending += 1;
				} else if (verdict.status === 'exact') {
					stats.correct += 1;
					stats.exact += 1;
				} else if (verdict.correct) {
					stats.correct += 1;
				} else {
					stats.wrong += 1;
				}
			}

			stats.recent.push({
				matchId,
				status: verdict ? verdict.status : '',
				label: verdict ? verdict.label : '',
				kickoffTimestamp: Predictor.getMatchKickoffTimestamp(match),
			});
		}
	}

	const uids = Object.keys(statsByUid).map(uid => parseInt(uid, 10)).filter(Boolean);
	const usersByUid = await getPredictionUsersByUid(uids);
	let entries = Object.values(statsByUid).map((entry) => {
		const userData = usersByUid[String(entry.uid)] || {};
		const accuracy = Predictor.getAccuracySummary({
			correct: entry.correct,
			wrong: entry.wrong,
		});
		const recent = entry.recent
			.sort((a, b) => (b.kickoffTimestamp || 0) - (a.kickoffTimestamp || 0))
			.slice(0, 5)
			.map(item => ({
				matchId: item.matchId,
				status: item.status,
				label: item.label,
			}));

		return {
			uid: entry.uid,
			username: userData.username || entry.username || '',
			fullname: userData.fullname || '',
			displayname: userData.username || entry.username || '',
			userslug: userData.userslug || '',
			picture: userData.picture || '',
			score: entry.score,
			total: entry.total,
			correct: entry.correct,
			exact: entry.exact,
			wrong: entry.wrong,
			pending: entry.pending,
			accuracy: accuracy.percent,
			recent,
		};
	});

	entries = entries.sort((a, b) => (
		(b.score - a.score) ||
		(b.correct - a.correct) ||
		(b.exact - a.exact) ||
		(a.pending - b.pending) ||
		a.username.localeCompare(b.username, 'zh-Hans-CN')
	));

	return entries.slice(0, limit || 100);
};

Predictor.getMatchTopicTids = async function (matchId) {
	const tids = new Set();
	const mappedTid = parseInt(await db.getObjectField(TOPIC_MAP_KEY, matchId), 10) || 0;
	if (mappedTid) {
		tids.add(String(mappedTid));
	}

	const publishedTids = await db.getSetMembers(`predictor:published:${matchId}`);
	if (Array.isArray(publishedTids)) {
		publishedTids.forEach((tid) => {
			const parsed = parseInt(tid, 10) || 0;
			if (parsed) {
				tids.add(String(parsed));
			}
		});
	}

	return Array.from(tids).map(tid => parseInt(tid, 10)).filter(Boolean);
};

Predictor.getMatchParticipantUids = async function (matchId) {
	const uids = new Set();
	const matchParticipants = await db.getSetMembers(`predictor:match:${matchId}:participants`);
	if (Array.isArray(matchParticipants)) {
		matchParticipants.forEach((uid) => {
			const parsed = parseInt(uid, 10) || 0;
			if (parsed) {
				uids.add(String(parsed));
			}
		});
	}

	const topicTids = await Predictor.getMatchTopicTids(matchId);
	for (const tid of topicTids) {
		// eslint-disable-next-line no-await-in-loop
		const topicParticipants = await db.getSetMembers(`predictor:topic:${tid}:participants`);
		if (Array.isArray(topicParticipants)) {
			topicParticipants.forEach((uid) => {
				const parsed = parseInt(uid, 10) || 0;
				if (parsed) {
					uids.add(String(parsed));
				}
			});
		}
	}

	return Array.from(uids);
};

Predictor.startResultSyncJob = function () {
	const enabled = /^1|true|yes$/i.test(String(process.env.PREDICTOR_AUTO_SYNC_ENABLED || 'true'));
	if (!enabled) {
		winston.verbose('[worldcup-predictor] auto result sync disabled by PREDICTOR_AUTO_SYNC_ENABLED');
		return;
	}
	if (!String(process.env.SERPAPI_KEY || '').trim()) {
		winston.warn('[worldcup-predictor] auto result sync skipped: missing SERPAPI_KEY');
		return;
	}
	if (resultSyncJob) {
		return;
	}

	const cronExpr = String(process.env.PREDICTOR_AUTO_SYNC_CRON || '0 * * * * *').trim();
	const tz = String(process.env.PREDICTOR_AUTO_SYNC_TZ || 'Asia/Shanghai').trim();
	resultSyncJob = new CronJob(cronExpr, async () => {
		try {
			await Predictor.runAutoResultSync();
		} catch (err) {
			winston.error(`[worldcup-predictor] auto result sync failed: ${err.stack || err.message}`);
		}
	}, null, true, tz);

	winston.info(`[worldcup-predictor] auto result sync job started cron="${cronExpr}" tz="${tz}"`);
};

Predictor.runAutoResultSync = async function () {
	const lockTs = parseInt(await db.get(RESULT_SYNC_LOCK_KEY), 10) || 0;
	if (lockTs && (Date.now() - lockTs) < 55000) {
		return;
	}

	await db.set(RESULT_SYNC_LOCK_KEY, Date.now());
	try {
		const matches = await Predictor.getMatches();
		const pendingMatches = Object.values(matches).filter(match => Predictor.shouldAttemptResultSync(match));

		for (const match of pendingMatches) {
			// eslint-disable-next-line no-await-in-loop
			await Predictor.tryAutoSyncMatchResult(match);
		}
	} finally {
		await db.delete(RESULT_SYNC_LOCK_KEY);
	}
};

Predictor.shouldAttemptResultSync = function (match) {
	if (!match || Predictor.getMatchResult(match)) {
		return false;
	}

	const kickoff = Predictor.getMatchKickoffTimestamp(match);
	if (!kickoff) {
		return false;
	}

	const firstAttemptAt = kickoff + (120 * 60 * 1000);
	return Date.now() >= firstAttemptAt;
};

Predictor.getResultSyncMetaKey = function (matchId) {
	return `${RESULT_SYNC_META_PREFIX}${matchId}`;
};

Predictor.getNextRetryTimestamp = function (kickoffTimestamp, attempts) {
	const delayMinutes = RESULT_SYNC_RETRY_MINUTES[Math.min(attempts, RESULT_SYNC_RETRY_MINUTES.length - 1)];
	return kickoffTimestamp + ((120 + delayMinutes) * 60 * 1000);
};

Predictor.tryAutoSyncMatchResult = async function (match) {
	const metaKey = Predictor.getResultSyncMetaKey(match.id || match.matchId);
	const kickoffTimestamp = Predictor.getMatchKickoffTimestamp(match);
	const meta = await db.getObject(metaKey) || {};
	const attempts = parseInt(meta.attempts, 10) || 0;
	const nextAttemptAt = parseInt(meta.nextAttemptAt, 10) || Predictor.getNextRetryTimestamp(kickoffTimestamp, attempts);

	if (Date.now() < nextAttemptAt) {
		return false;
	}

	const serpApiOptions = {
		serpapiKey: String(process.env.SERPAPI_KEY || '').trim(),
		hl: String(process.env.SERPAPI_HL || 'zh-cn').trim(),
		gl: String(process.env.SERPAPI_GL || 'us').trim(),
		source: 'SerpApi',
		sourceUrl: '',
		query: '',
	};

	try {
		const result = await fetchResultFromSerpApi(match, serpApiOptions);
		await Predictor.setMatchResult(match.id || match.matchId, result);
		await db.delete(metaKey);
		winston.info(`[worldcup-predictor] auto synced result for ${match.id || match.matchId}`);
		return true;
	} catch (err) {
		const nextAttempts = attempts + 1;
		const exhausted = nextAttempts >= RESULT_SYNC_RETRY_MINUTES.length;
		const nextTs = exhausted ? 0 : Predictor.getNextRetryTimestamp(kickoffTimestamp, nextAttempts);
		await db.setObject(metaKey, {
			attempts: nextAttempts,
			lastAttemptAt: Date.now(),
			nextAttemptAt: nextTs,
			lastError: err.message || String(err),
			manualRequired: exhausted ? '1' : '0',
		});
		winston.warn(`[worldcup-predictor] auto sync miss for ${match.id || match.matchId}: ${err.message}`);
		return false;
	}
};

Predictor.initializeDefaultMatches = async function () {
	const matches = {
		'2026-06-12-1': {
			id: '2026-06-12-1',
			date: '2026-06-12',
			time: '03:00',
			home: { name: '阿根廷', flag: '🇦🇷' },
			away: { name: '摩洛哥', flag: '🇲🇦' },
			stage: '小组赛',
			group: 'A',
			status: 'upcoming',
		},
		'2026-06-12-2': {
			id: '2026-06-12-2',
			date: '2026-06-12',
			time: '10:00',
			home: { name: '韩国', flag: '🇰🇷' },
			away: { name: '乌拉圭', flag: '🇺🇾' },
			stage: '小组赛',
			group: 'F',
			status: 'upcoming',
		},
		'2026-06-13-1': {
			id: '2026-06-13-1',
			date: '2026-06-13',
			time: '03:00',
			home: { name: '加拿大', flag: '🇨🇦' },
			away: { name: '波兰', flag: '🇵🇱' },
			stage: '小组赛',
			group: 'E',
			status: 'upcoming',
		},
	};

	try {
		await db.setObject('predictor:matches', matches);
	} catch (err) {
		winston.error(`[predictor] Error initializing matches: ${err.message}`);
	}

	return matches;
};

plugin.Predictor = Predictor;

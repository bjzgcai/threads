'use strict';

const express = require.main.require('express');
const db = require.main.require('./src/database');
const topics = require.main.require('./src/topics');
const privileges = require.main.require('./src/privileges');
const nconf = require.main.require('nconf');
const winston = require.main.require('winston');
const { Router } = express;

const plugin = module.exports;

let middleware;

const Predictor = {};

plugin.init = async function () {
	winston.info('[worldcup-predictor] Plugin initialized');
};

plugin.addRoutes = async function (data) {
	const app = data.app;
	if (!middleware) {
		middleware = data.middleware || require.main.require('./src/middleware');
	}

	const router = data.router || Router();

	router.get('/predictor', renderPredictorPage);
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
	try {
		const matchesData = await Predictor.getMatches();
		const userData = req.user ? {
			uid: req.user.uid,
			username: req.user.username,
		} : null;

		res.render('predictor', {
			matchesJSON: JSON.stringify(matchesData),
			userJSON: JSON.stringify(userData),
			configJSON: JSON.stringify({ relative_path: nconf.get('relative_path') }),
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
		const participantCount = await db.setCount(`predictor:topic:${tid}:participants`);
		const kickoffTimestamp = Predictor.getMatchKickoffTimestamp(match);
		const predictionOpen = Predictor.isPredictionOpen(match);

		res.json({
			enabled: true,
			tid,
			matchId: topicData.predictorMatchId,
			predictionMode: Predictor.normalizePredictionMode(topicData.predictorPredictionMode),
			match,
			myPrediction: prediction,
			participantCount,
			loggedIn: !!uid,
			predictionOpen,
			kickoffTimestamp,
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
		const matchIds = await db.getSetMembers(`predictor:user:predictions:${uid}`);
		const predictions = {};

		for (const matchId of matchIds) {
			const prediction = await Predictor.getPrediction(matchId, uid);
			if (prediction) {
				predictions[matchId] = prediction;
			}
		}

		res.json({ predictions });
	} catch (err) {
		next(err);
	}
}

async function getLeaderboard(req, res, next) {
	try {
		const leaderboard = await db.getSortedSetRevRange('predictor:leaderboard', 0, 99);
		const data = [];

		for (const entry of leaderboard) {
			const score = await db.getSortedSetScore('predictor:leaderboard', entry);
			data.push({
				username: entry,
				score,
			});
		}

		res.json({ leaderboard: data });
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

Predictor.getMatches = async function () {
	try {
		let matches = await db.getObject('predictor:matches');
		if (!matches || Object.keys(matches).length === 0) {
			matches = await Predictor.initializeDefaultMatches();
		}
		return matches;
	} catch (err) {
		winston.error(`[predictor] Error getting matches: ${err.message}`);
		return {};
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

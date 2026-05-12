
'use strict';

const nconf = require('nconf');
const validator = require('validator');

const user = require('../user');
const topics = require('../topics');
const meta = require('../meta');
const pagination = require('../pagination');
const helpers = require('./helpers');
const recentController = require('./recent');
const utils = require('../utils');

const popularController = module.exports;

popularController.get = async function (req, res, next) {
	const data = await recentController.getData(req, 'popular', 'posts');
	if (!data) {
		return next();
	}
	const page = parseInt(req.query.page, 10) || 1;
	const term = helpers.terms[req.query.term] || 'alltime';
	if (req.originalUrl.startsWith(`${nconf.get('relative_path')}/api/popular`) || req.originalUrl.startsWith(`${nconf.get('relative_path')}/popular`)) {
		data.title = `[[pages:popular-${term}]]`;
		const breadcrumbs = [{ text: '[[global:header.popular]]' }];
		data.breadcrumbs = helpers.buildBreadcrumbs(breadcrumbs);
	}

	if (!data['feeds:disableRSS'] && data.rssFeedUrl) {
		const feedQs = data.rssFeedUrl.split('?')[1];
		data.rssFeedUrl = `${nconf.get('relative_path')}/popular/${validator.escape(String(req.query.term || 'alltime'))}.rss`;
		if (req.loggedIn) {
			data.rssFeedUrl += `?${feedQs}`;
		}
	}

	const [settings, weightedHotTopics] = await Promise.all([
		user.getSettings(req.uid),
		getWeightedHotTopics({
			uid: req.uid,
			query: req.query,
		}),
	]);

	const start = Math.max(0, (page - 1) * settings.topicsPerPage);
	const stop = start + settings.topicsPerPage;

	data.hotTopicsTop10 = buildHotTopicsDisplayData(weightedHotTopics.topics);
	data.topics = weightedHotTopics.topics.slice(start, stop);
	data.topicCount = weightedHotTopics.topics.length;
	data.nextStart = stop;

	const pageCount = Math.max(1, Math.ceil(data.topicCount / settings.topicsPerPage));
	data.pagination = pagination.create(page, pageCount, req.query);
	if (res.locals) {
		res.locals.linkTags = [];
	}
	helpers.addLinkTags({
		url: 'popular',
		res: res,
		tags: data.pagination.rel,
		page: page,
	});
	res.render('popular', data);
};

function buildHotTopicsDisplayData(topicData) {
	const displayTopics = topicData.slice(0, 30).map((topic, index) => {
		topic.rank = index + 1;
		topic.isExtraHotTopic = index >= 10;
		return topic;
	});

	return {
		topics: displayTopics,
		hasTopics: displayTopics.length > 0,
		hasMore: displayTopics.length > 10,
	};
}

async function getWeightedHotTopics(params) {
	const { uid, query } = params;
	const now = Date.now();
	const candidateLimit = meta.config.recentMaxTopics || 200;
	const term = helpers.terms[query.term || 'alltime'] || 'alltime';
	const sortedTopics = await topics.getSortedTopics({
		cids: query.cid,
		tags: query.tag,
		uid: uid,
		start: 0,
		stop: candidateLimit - 1,
		filter: query.filter || '',
		term: term,
		sort: 'posts',
		floatPinned: query.pinned,
		query: query,
	});

	if (!sortedTopics.topics.length) {
		return {
			topics: [],
		};
	}

	const hotTopics = sortedTopics.topics
		.filter(topic => topic && !topic.scheduled)
		.map((topic) => {
			const metrics = buildHotMetrics(topic, now);
			topic.hotMetrics = metrics;
			topic.hotScore = metrics.score;
			topic.hotExcerpt = buildHotExcerpt(topic);
			return topic;
		})
		.sort((a, b) => {
			if (b.hotScore !== a.hotScore) {
				return b.hotScore - a.hotScore;
			}
			return b.lastposttime - a.lastposttime;
		});

	return {
		topics: hotTopics,
	};
}

function buildHotMetrics(topic, now) {
	const replies = Math.max(0, (parseInt(topic.postcount, 10) || 0) - 1);
	const votes = Math.max(0, parseInt(topic.votes, 10) || 0);
	const views = Math.max(0, parseInt(topic.viewcount, 10) || 0);
	const lastActive = Math.max(parseInt(topic.lastposttime, 10) || 0, parseInt(topic.timestamp, 10) || 0);
	const ageDays = Math.max(0, (now - lastActive) / 86400000);
	const recencyWeight = getRecencyWeight(ageDays);
	const baseScore = (replies * 5) + (votes * 8) + (views * 0.15);
	const score = Math.round(baseScore * recencyWeight);

	return {
		replies,
		votes,
		views,
		ageDays,
		recencyWeight,
		score,
		bucketLabel: getBucketLabel(ageDays),
	};
}

function getRecencyWeight(ageDays) {
	if (ageDays <= 3) {
		return 1.45;
	}
	if (ageDays <= 7) {
		return 1.25;
	}
	if (ageDays <= 15) {
		return 1.0;
	}
	if (ageDays <= 30) {
		return 0.8;
	}
	return 0.6;
}

function getBucketLabel(ageDays) {
	if (ageDays <= 3) {
		return '3d';
	}
	if (ageDays <= 7) {
		return '7d';
	}
	if (ageDays <= 15) {
		return '15d';
	}
	if (ageDays <= 30) {
		return '30d';
	}
	return '30d+';
}

function buildHotExcerpt(topic) {
	const raw = topic && topic.teaser && topic.teaser.content ? topic.teaser.content : '';
	const text = utils.stripHTMLTags(utils.decodeHTMLEntities(String(raw || '')))
		.replace(/\s+/g, ' ')
		.trim();

	if (!text) {
		return '';
	}

	return text.length > 260 ? `${text.slice(0, 260).trim()}...` : text;
}

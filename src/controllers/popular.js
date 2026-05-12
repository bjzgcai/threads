
'use strict';

const nconf = require('nconf');
const validator = require('validator');

const helpers = require('./helpers');
const hotTopics = require('./hotTopics');
const recentController = require('./recent');

const popularController = module.exports;
const hotTopicsCategoryCid = process.env.NODEBB_HOT_TOPICS_CATEGORY_CID;

popularController.get = async function (req, res, next) {
	const data = await recentController.getData(req, 'popular', 'posts');
	if (!data) {
		return next();
	}
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

	data.hotTopics = await hotTopics.getHotTopics({
		uid: req.uid,
		query: req.query,
		excludedCid: hotTopicsCategoryCid,
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
	const createdAt = parseInt(topic.timestamp, 10) || parseInt(topic.lastposttime, 10) || 0;
	const ageDays = Math.max(0, (now - createdAt) / 86400000);
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
	const ageBucket = Math.max(1, Math.ceil(ageDays));
	if (ageBucket <= 3) {
		return 4 - ageBucket;
	}
	return 1 / ageBucket;
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

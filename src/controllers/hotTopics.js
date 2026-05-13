'use strict';

const topics = require('../topics');
const posts = require('../posts');
const helpers = require('./helpers');

async function getHotTopics(params) {
	const {
		uid,
		query = {},
		excludedCid,
		candidateLimit = 200,
	} = params;

	const topicCandidates = await getHotTopicCandidates({
		uid,
		query,
		excludedCid,
		candidateLimit,
	});
	if (!topicCandidates.length) {
		return {
			topics: [],
			hasTopics: false,
			hasMore: false,
		};
	}

	const hotTopics = topicCandidates
		.filter(topic => topic && !topic.scheduled)
		.map((topic, index) => {
			topic.rank = index + 1;
			topic.heat = buildHeat(topic);
			topic.isExtraHotTopic = index >= 10;
			return topic;
		})
		.sort((a, b) => {
			if (b.heat !== a.heat) {
				return b.heat - a.heat;
			}
			return b.timestamp - a.timestamp;
		})
		.map((topic, index) => {
			topic.rank = index + 1;
			topic.isExtraHotTopic = index >= 10;
			return topic;
		})
		.slice(0, 30);
	await attachMainPostTeasers(hotTopics, uid);

	return {
		topics: hotTopics,
		hasTopics: hotTopics.length > 0,
		hasMore: hotTopics.length > 10,
	};
}

async function attachMainPostTeasers(topicData, uid) {
	if (!Array.isArray(topicData) || !topicData.length) {
		return;
	}

	const mainPids = topicData
		.map(topic => topic && topic.mainPid)
		.filter(Boolean);
	if (!mainPids.length) {
		return;
	}

	const mainPosts = await posts.getPostSummaryByPids(mainPids, uid, { stripTags: true });
	const tidToMainPost = {};
	mainPosts.forEach((post) => {
		if (post && post.tid) {
			tidToMainPost[String(post.tid)] = post;
		}
	});

	topicData.forEach((topic) => {
		const mainPost = topic && tidToMainPost[String(topic.tid)];
		if (!mainPost) {
			return;
		}

		topic.teaser = Object.assign({}, topic.teaser, {
			content: mainPost.content,
			pid: mainPost.pid,
			timestamp: mainPost.timestamp,
			timestampISO: mainPost.timestampISO,
			user: mainPost.user,
		});
	});
}

function buildHeat(topic) {
	const replies = Math.max(0, (parseInt(topic.postcount, 10) || 0) - 1);
	const votes = Math.max(0, parseInt(topic.votes, 10) || 0);
	const views = Math.max(0, parseInt(topic.viewcount, 10) || 0);
	const lastActiveAt = parseInt(topic.lastposttime, 10) || parseInt(topic.timestamp, 10) || 0;
	const ageDays = Math.max(0, (Date.now() - lastActiveAt) / 86400000);
	const ageBucket = Math.max(1, Math.ceil(ageDays));
	const recencyWeight = 1 / ageBucket;

	return ((replies * 5) + (votes * 3) + (views * 0.15)) * recencyWeight;
}

async function getHotTopicCandidates(params) {
	const { uid, query = {}, excludedCid, candidateLimit = 200 } = params;
	const term = helpers.terms[query.term || 'alltime'] || 'alltime';
	const topicParams = sort => ({
		cids: query.cid,
		tags: query.tag,
		uid: uid,
		start: 0,
		stop: candidateLimit - 1,
		filter: query.filter || '',
		term: term,
		sort: sort,
		floatPinned: query.pinned,
		query: query,
	});
	const [viewTopics, postTopics, voteTopics] = await Promise.all([
		topics.getSortedTopics(topicParams('views')),
		topics.getSortedTopics(topicParams('posts')),
		topics.getSortedTopics(topicParams('votes')),
	]);

	const seen = new Set();
	return viewTopics.topics.concat(postTopics.topics, voteTopics.topics)
		.filter((topic) => {
			if (!topic || seen.has(String(topic.tid)) || String(topic.cid) === String(excludedCid)) {
				return false;
			}
			seen.add(String(topic.tid));
			return true;
		});
}

module.exports = {
	getHotTopics,
};

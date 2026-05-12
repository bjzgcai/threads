'use strict';

const topics = require('../topics');
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

	return {
		topics: hotTopics,
		hasTopics: hotTopics.length > 0,
		hasMore: hotTopics.length > 10,
	};
}

function buildHeat(topic) {
	const replies = Math.max(0, (parseInt(topic.postcount, 10) || 0) - 1);
	const votes = Math.max(0, parseInt(topic.votes, 10) || 0);
	const views = Math.max(0, parseInt(topic.viewcount, 10) || 0);
	return replies + votes + views;
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

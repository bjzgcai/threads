'use strict';

const api = require('../api');
const search = require('../search');
const manifest = require('../skills/manifest');
const helpers = require('./helpers');

const Skills = module.exports;

const CONTENT_MAX = 20000;
const TITLE_MAX = 200;
const QUERY_MAX = 200;
const TAG_MAX = 5;

function asPositiveInt(value, name) {
	const num = parseInt(value, 10);
	if (!Number.isFinite(num) || num <= 0) {
		throw new Error(`${name}-must-be-positive-integer`);
	}
	return num;
}

function asString(value, name, maxLen) {
	if (typeof value !== 'string') {
		throw new Error(`${name}-must-be-string`);
	}
	const trimmed = value.trim();
	if (!trimmed.length) {
		throw new Error(`${name}-must-not-be-empty`);
	}
	if (trimmed.length > maxLen) {
		throw new Error(`${name}-too-long`);
	}
	return trimmed;
}

function normalizeTags(tags) {
	if (tags === undefined) {
		return [];
	}
	if (!Array.isArray(tags)) {
		throw new Error('tags-must-be-array');
	}
	if (tags.length > TAG_MAX) {
		throw new Error('too-many-tags');
	}
	return tags.map(tag => asString(tag, 'tag', 30));
}

Skills.getManifest = async (req, res) => {
	helpers.formatApiResponse(200, res, manifest);
};

Skills.execute = async (req, res) => {
	const { skill } = req.params;
	const skillDef = manifest.skills[skill];
	if (!skillDef) {
		return helpers.formatApiResponse(404, res, new Error('skill-not-found'));
	}

	const input = req.body && req.body.input ? req.body.input : {};
	const caller = { uid: req.uid, ip: req.ip };
	let response;

	if (skill === 'search_topics') {
		const query = asString(input.query, 'query', QUERY_MAX);
		const page = input.page ? asPositiveInt(input.page, 'page') : 1;
		const itemsPerPage = input.limit ? Math.min(asPositiveInt(input.limit, 'limit'), 20) : 10;
		const categories = Array.isArray(input.categories) ? input.categories : undefined;

		const result = await search.search({
			uid: req.uid,
			query,
			page,
			itemsPerPage,
			searchIn: 'titlesposts',
			categories,
		});

		response = {
			query,
			page,
			limit: itemsPerPage,
			matchCount: result.matchCount,
			pageCount: result.pageCount,
			posts: (result.posts || []).map(post => ({
				pid: post.pid,
				tid: post.tid,
				uid: post.uid,
				timestamp: post.timestamp,
				content: post.content,
				topic: post.topic ? {
					tid: post.topic.tid,
					title: post.topic.title,
					slug: post.topic.slug,
				} : null,
			})),
		};
	} else if (skill === 'get_post_raw') {
		const pid = asPositiveInt(input.pid, 'pid');
		const content = await api.posts.getRaw(caller, { pid });
		if (content === null) {
			return helpers.formatApiResponse(404, res, new Error('post-not-found-or-not-visible'));
		}

		response = {
			pid,
			content,
		};
	} else if (skill === 'create_topic_or_reply') {
		const content = asString(input.content, 'content', CONTENT_MAX);
		const title = input.title !== undefined ? asString(input.title, 'title', TITLE_MAX) : undefined;
		const tags = normalizeTags(input.tags);

		if (input.tid !== undefined && input.tid !== null) {
			const tid = asPositiveInt(input.tid, 'tid');
			const post = await api.topics.reply(caller, { tid, content });
			response = {
				mode: 'reply',
				tid,
				pid: post.pid,
				timestamp: post.timestamp,
			};
		} else {
			const cid = asPositiveInt(input.cid, 'cid');
			if (!title) {
				throw new Error('title-required-for-topic');
			}

			const topic = await api.topics.create(caller, { cid, title, content, tags });
			response = {
				mode: 'topic',
				tid: topic.tid,
				cid,
				title: topic.title,
				mainPid: topic.mainPid,
				slug: topic.slug,
			};
		}
	} else {
		return helpers.formatApiResponse(501, res, new Error('skill-not-implemented'));
	}

	helpers.formatApiResponse(200, res, {
		skill,
		response,
	});
};

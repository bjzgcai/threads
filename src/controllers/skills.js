'use strict';

const api = require('../api');
const categories = require('../categories');
const search = require('../search');
const manifest = require('../skills/manifest');
const skillTokens = require('../skills/tokens');
const topics = require('../topics');
const helpers = require('./helpers');
const user = require('../user');

const Skills = module.exports;

const CONTENT_MAX = 20000;
const TITLE_MAX = 200;
const QUERY_MAX = 200;
const TAG_MAX = 5;
const LIST_LIMIT_MAX = 20;
const UNREAD_FILTERS = new Set(['', 'new', 'watched', 'unreplied']);

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

function asOptionalPositiveInt(value, name) {
	if (value === undefined || value === null || value === '') {
		return undefined;
	}
	return asPositiveInt(value, name);
}

function normalizeCategoryIds(categories) {
	if (categories === undefined) {
		return undefined;
	}
	if (!Array.isArray(categories)) {
		throw new Error('categories-must-be-array');
	}
	return categories.map(cid => asPositiveInt(cid, 'category'));
}

function normalizeOptionalTags(tags) {
	if (tags === undefined) {
		return undefined;
	}
	return normalizeTags(tags);
}

function normalizeListPaging(input) {
	const page = input.page ? asPositiveInt(input.page, 'page') : 1;
	const limit = input.limit ? Math.min(asPositiveInt(input.limit, 'limit'), LIST_LIMIT_MAX) : 10;
	return {
		page,
		limit,
		start: (page - 1) * limit,
		stop: (page * limit) - 1,
	};
}

function normalizeUnreadFilter(value) {
	const filter = value === undefined || value === null ? '' : String(value).trim();
	if (!UNREAD_FILTERS.has(filter)) {
		throw new Error('invalid-unread-filter');
	}
	return filter;
}

function mapTopicSummary(topic) {
	if (!topic) {
		return null;
	}

	return {
		tid: topic.tid,
		cid: topic.cid,
		uid: topic.uid,
		title: topic.title,
		slug: topic.slug,
		timestamp: topic.timestamp,
		lastposttime: topic.lastposttime,
		postcount: topic.postcount,
		viewcount: topic.viewcount,
		votes: topic.votes,
		pinned: !!topic.pinned,
		locked: !!topic.locked,
		unread: !!topic.unread,
		isFollowed: !!topic.isFollowed,
		category: topic.category ? {
			cid: topic.category.cid,
			name: topic.category.name,
			slug: topic.category.slug,
			icon: topic.category.icon,
		} : null,
		user: topic.user ? {
			uid: topic.user.uid,
			username: topic.user.username,
			userslug: topic.user.userslug,
		} : null,
		teaser: topic.teaser ? {
			pid: topic.teaser.pid,
			uid: topic.teaser.uid,
			timestamp: topic.teaser.timestamp,
			content: topic.teaser.content,
		} : null,
		tags: Array.isArray(topic.tags) ? topic.tags.map(tag => ({
			value: tag && tag.value,
			score: tag && tag.score,
		})) : [],
	};
}

function mapCategorySummary(category) {
	if (!category) {
		return null;
	}

	return {
		cid: category.cid,
		name: category.name,
		slug: category.slug,
		handle: category.handle,
		description: category.description,
		icon: category.icon,
		bgColor: category.bgColor,
		color: category.color,
		parentCid: category.parentCid,
		topic_count: category.topic_count,
		post_count: category.post_count,
		disabled: !!category.disabled,
		order: category.order,
	};
}

function normalizeCategoryLookup(value) {
	if (value === undefined || value === null) {
		return '';
	}
	if (typeof value !== 'string') {
		throw new Error('category-must-be-string');
	}
	return value.trim().toLowerCase();
}

async function resolveCategoryId(input, uid) {
	const cid = asOptionalPositiveInt(input.cid, 'cid');
	if (cid) {
		return cid;
	}

	const lookup = normalizeCategoryLookup(input.category || input.categoryName || input.categorySlug || input.categoryHandle);
	if (!lookup) {
		throw new Error('cid-required-for-topic');
	}

	const visibleCategories = await categories.getCategoriesByPrivilege('categories:cid', uid, 'topics:read');
	const matched = visibleCategories.filter((category) => {
		if (!category || category.disabled) {
			return false;
		}

		const slug = String(category.slug || '').toLowerCase();
		const slugTail = slug.includes('/') ? slug.split('/').slice(1).join('/') : slug;
		return [
			String(category.name || '').trim().toLowerCase(),
			String(category.handle || '').trim().toLowerCase(),
			slug,
			slugTail,
		].includes(lookup);
	});

	if (!matched.length) {
		throw new Error('category-not-found');
	}
	if (matched.length > 1) {
		throw new Error('category-ambiguous');
	}
	return parseInt(matched[0].cid, 10);
}

Skills.getManifest = async (req, res) => {
	helpers.formatApiResponse(200, res, manifest);
};

async function assertSkillsTokenCanBeManagedByRequester(req) {
	const requireDingtalkSso = String(process.env.SKILLS_TOKEN_REQUIRE_DINGTALK_SSO || 'true').toLowerCase() === 'true';
	if (!requireDingtalkSso) {
		return;
	}

	const isDingTalkSSO = String(await user.getUserField(req.uid, 'dingtalk:sso') || '') === '1';
	if (!isDingTalkSSO) {
		throw new Error('skills-token-requires-dingtalk-sso-login');
	}
}

Skills.listTokens = async (req, res) => {
	await assertSkillsTokenCanBeManagedByRequester(req);
	const tokens = await skillTokens.list(req.uid);
	helpers.formatApiResponse(200, res, { tokens });
};

Skills.createToken = async (req, res) => {
	await assertSkillsTokenCanBeManagedByRequester(req);
	const token = await skillTokens.create(req.uid, {
		name: req.body.name,
		scopes: req.body.scopes,
		expiresInDays: req.body.expiresInDays,
	});
	helpers.formatApiResponse(200, res, token);
};

Skills.revokeToken = async (req, res) => {
	await assertSkillsTokenCanBeManagedByRequester(req);
	await skillTokens.revoke(req.uid, req.params.token);
	helpers.formatApiResponse(200, res);
};

Skills.rollToken = async (req, res) => {
	await assertSkillsTokenCanBeManagedByRequester(req);
	const token = await skillTokens.roll(req.uid, req.params.token);
	helpers.formatApiResponse(200, res, token);
};

Skills.execute = async (req, res) => {
	const { skill } = req.params;
	const skillDef = manifest.skills[skill];
	if (!skillDef) {
		return helpers.formatApiResponse(404, res, new Error('skill-not-found'));
	}

	const input = req.body && req.body.input ? req.body.input : {};
	const actorUid = req.skillActorUid || req.uid;
	const caller = { uid: actorUid, ip: req.ip };
	let response;

	if (skill === 'list_categories') {
		const categoriesData = await categories.getCategoriesByPrivilege('categories:cid', actorUid, 'topics:read');
		response = {
			matchCount: categoriesData.length,
			categories: categoriesData.map(mapCategorySummary).filter(Boolean),
		};
	} else if (skill === 'latest_topics') {
		const { page, limit, start, stop } = normalizeListPaging(input);
		const categories = normalizeCategoryIds(input.categories);
		const tags = normalizeOptionalTags(input.tags);
		const result = await topics.getSortedTopics({
			cids: categories,
			tags,
			uid: actorUid,
			start,
			stop,
			filter: '',
			term: 'alltime',
			sort: 'recent',
			floatPinned: 0,
			query: {},
		});

		response = {
			page,
			limit,
			matchCount: result.topicCount,
			topics: (result.topics || []).map(mapTopicSummary).filter(Boolean),
		};
	} else if (skill === 'unread_topics') {
		const { page, limit, start, stop } = normalizeListPaging(input);
		const categories = normalizeCategoryIds(input.categories);
		const tags = normalizeOptionalTags(input.tags);
		const filter = normalizeUnreadFilter(input.filter);
		const result = await topics.getUnreadTopics({
			cid: categories,
			tag: tags,
			uid: actorUid,
			start,
			stop,
			filter,
			query: {},
		});

		response = {
			page,
			limit,
			filter,
			matchCount: result.topicCount || 0,
			topics: (result.topics || []).map(mapTopicSummary).filter(Boolean),
		};
	} else if (skill === 'search_topics') {
		const query = asString(input.query, 'query', QUERY_MAX);
		const { page, limit: itemsPerPage } = normalizeListPaging(input);
		const categories = normalizeCategoryIds(input.categories);

		const result = await search.search({
			uid: actorUid,
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
			const cid = await resolveCategoryId(input, actorUid);
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
		actor: req.externalActor || {},
		actorUid,
		response,
	});
};

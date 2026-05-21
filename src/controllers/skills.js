'use strict';

const api = require('../api');
const categories = require('../categories');
const db = require('../database');
const search = require('../search');
const manifest = require('../skills/manifest');
const skillTokens = require('../skills/tokens');
const posts = require('../posts');
const topics = require('../topics');
const helpers = require('./helpers');
const user = require('../user');
const privileges = require('../privileges');

const Skills = module.exports;

const CONTENT_MAX = 20000;
const TITLE_MAX = 200;
const QUERY_MAX = 200;
const TAG_MAX = 5;
const LIST_LIMIT_MAX = 20;
const DIGEST_LIMIT_MAX = 30;
const DIGEST_SCAN_LIMIT_MAX = 500;
const DELETE_TOPICS_MAX = 5;
const DELETE_POSTS_MAX = 5;
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

function normalizeTopicIds(value) {
	if (!Array.isArray(value)) {
		throw new Error('tids-must-be-array');
	}
	if (!value.length) {
		throw new Error('tids-must-not-be-empty');
	}
	if (value.length > DELETE_TOPICS_MAX) {
		throw new Error('too-many-topics-to-delete');
	}

	return [...new Set(value.map(tid => asPositiveInt(tid, 'tid')))];
}

function normalizePostIds(value) {
	if (!Array.isArray(value)) {
		throw new Error('pids-must-be-array');
	}
	if (!value.length) {
		throw new Error('pids-must-not-be-empty');
	}
	if (value.length > DELETE_POSTS_MAX) {
		throw new Error('too-many-posts-to-delete');
	}

	return [...new Set(value.map(pid => asPositiveInt(pid, 'pid')))];
}

function normalizeOptionalQuery(value) {
	if (value === undefined || value === null) {
		return '';
	}
	if (typeof value !== 'string') {
		throw new Error('query-must-be-string');
	}
	const query = value.trim();
	if (query.length > QUERY_MAX) {
		throw new Error('query-too-long');
	}
	return query;
}

function normalizeOptionalStringList(value, name, maxItems = 20, maxLen = 80) {
	if (value === undefined || value === null || value === '') {
		return [];
	}
	const items = Array.isArray(value) ? value : String(value).split(/[,，、\n\r\t]/);
	if (items.length > maxItems) {
		throw new Error(`${name}-too-many-items`);
	}
	return items.map(item => String(item || '').trim())
		.filter(Boolean)
		.map(item => item.slice(0, maxLen));
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

function normalizeDigestPaging(input) {
	const limit = input.limit ? Math.min(asPositiveInt(input.limit, 'limit'), DIGEST_LIMIT_MAX) : 10;
	const scanLimit = input.scanLimit ?
		Math.min(asPositiveInt(input.scanLimit, 'scanLimit'), DIGEST_SCAN_LIMIT_MAX) : 200;
	return { limit, scanLimit };
}

function normalizeDigestCategoryIds(input) {
	const explicit = normalizeCategoryIds(input.categories);
	if (explicit && explicit.length) {
		return explicit;
	}

	return [
		2,
		parseInt(process.env.ARTICLE_AUTO_PUBLISH_CID, 10) || 0,
		parseInt(process.env.WECHAT_AUTO_PUBLISH_CID, 10) || 0,
	].filter(Boolean).filter((cid, index, cids) => cids.indexOf(cid) === index);
}

function mapPostSummary(post) {
	if (!post) {
		return null;
	}

	return {
		pid: post.pid,
		tid: post.tid,
		uid: post.uid,
		timestamp: post.timestamp,
		deleted: !!post.deleted,
		content: post.content,
		topic: post.topic ? {
			tid: post.topic.tid,
			title: post.topic.title,
			slug: post.topic.slug,
		} : null,
	};
}

function buildTopicUrl(topic) {
	if (!topic || !topic.slug) {
		return '';
	}
	return `/topic/${topic.slug}`;
}

function startOfDayTimestamp(input) {
	const dateInput = String(input.date || '').trim();
	const date = dateInput && /^\d{4}-\d{2}-\d{2}$/.test(dateInput) ?
		new Date(`${dateInput}T00:00:00`) : new Date();
	date.setHours(0, 0, 0, 0);
	return date.getTime();
}

function tokenizeForDigest(values) {
	const tokens = new Set();
	values.forEach((value) => {
		String(value || '')
			.split(/[\s,，、;；/|｜\n\r\t]+/)
			.map(part => part.trim())
			.filter(part => part.length >= 2)
			.forEach(part => tokens.add(part.toLowerCase()));
	});
	return Array.from(tokens).slice(0, 40);
}

function getTextPreview(content, maxLen = 240) {
	return String(content || '')
		.replace(/<[^>]*>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, maxLen);
}

function scoreDigestTopic(topic, content, keywords) {
	const haystack = [
		topic.titleRaw || topic.title,
		Array.isArray(topic.tags) ? topic.tags.map(tag => tag.value).join(' ') : '',
		content,
	].join(' ').toLowerCase();
	const matched = [];
	let score = 0;

	keywords.forEach((keyword) => {
		if (!keyword || !haystack.includes(keyword)) {
			return;
		}
		matched.push(keyword);
		score += String(topic.titleRaw || topic.title || '').toLowerCase().includes(keyword) ? 3 : 1;
		if (Array.isArray(topic.tags) && topic.tags.some(tag => String(tag.value || '').toLowerCase() === keyword)) {
			score += 2;
		}
	});

	return { score, matched };
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

	const lookup = normalizeCategoryLookup(
		input.category || input.categoryName || input.categorySlug || input.categoryHandle
	);
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
		const result = actorUid > 0 ?
			await topics.getUnreadTopics({
				cid: categories,
				tag: tags,
				uid: actorUid,
				start,
				stop,
				filter,
				query: {},
			}) :
			await topics.getSortedTopics({
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
			filter,
			mode: actorUid > 0 ? 'unread' : 'public-latest',
			matchCount: result.topicCount || 0,
			topics: (result.topics || []).map(mapTopicSummary).filter(Boolean),
		};
	} else if (skill === 'department_daily_digest') {
		const { limit, scanLimit } = normalizeDigestPaging(input);
		const digestCategories = normalizeDigestCategoryIds(input);
		if (!digestCategories.length) {
			throw new Error('digest-categories-required');
		}

		const department = normalizeOptionalQuery(input.department);
		const person = normalizeOptionalQuery(input.person || input.name);
		const attributes = normalizeOptionalStringList(input.attributes || input.profile, 'attributes');
		const keywords = tokenizeForDigest([
			department,
			person,
			...attributes,
			...normalizeOptionalStringList(input.keywords, 'keywords'),
		]);
		const start = startOfDayTimestamp(input);
		const end = input.endTimestamp ? asPositiveInt(input.endTimestamp, 'endTimestamp') : Date.now();
		const tids = await db.getSortedSetRevRangeByScore(
			digestCategories.map(cid => `cid:${cid}:tids:create`),
			0,
			scanLimit,
			end,
			start
		);
		const visibleTids = await privileges.topics.filterTids('topics:read', tids, actorUid);
		const topicData = await topics.getTopicsByTids(visibleTids, {
			uid: actorUid,
			tags: true,
		});
		const mainPids = topicData.map(topic => topic && topic.mainPid).filter(Boolean);
		const mainPosts = await posts.getPostsFields(mainPids, ['pid', 'content']);
		const pidToPost = Object.fromEntries(mainPosts.map(post => [String(post && post.pid), post]));
		let items = topicData.map((topic) => {
			const post = pidToPost[String(topic && topic.mainPid)] || {};
			const relevance = keywords.length ? scoreDigestTopic(topic, post.content, keywords) : {
				score: 1,
				matched: [],
			};
			return {
				tid: topic.tid,
				cid: topic.cid,
				title: topic.titleRaw || topic.title,
				url: buildTopicUrl(topic),
				timestamp: topic.timestamp,
				timestampISO: topic.timestampISO,
				category: topic.category ? {
					cid: topic.category.cid,
					name: topic.category.name,
					slug: topic.category.slug,
				} : null,
				tags: Array.isArray(topic.tags) ? topic.tags.map(tag => tag.value).filter(Boolean) : [],
				relevanceScore: relevance.score,
				matchedKeywords: relevance.matched,
				excerpt: getTextPreview(post.content),
			};
		}).filter(item => item && item.relevanceScore > 0);

		items = items.sort((a, b) => (
			b.relevanceScore - a.relevanceScore ||
			b.timestamp - a.timestamp
		)).slice(0, limit);

		response = {
			date: input.date || new Date(start).toISOString().slice(0, 10),
			department,
			person,
			attributes,
			keywords,
			categories: digestCategories,
			scannedCount: tids.length,
			matchCount: items.length,
			topics: items,
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
	} else if (skill === 'search_own_posts') {
		const query = normalizeOptionalQuery(input.query);
		const { page, limit, start, stop } = normalizeListPaging(input);
		let result;

		if (query) {
			const username = await user.getUserField(actorUid, 'username');
			result = await search.search({
				uid: actorUid,
				query,
				page,
				itemsPerPage: limit,
				searchIn: 'posts',
				postedBy: username,
			});
		} else {
			let pids = await db.getSortedSetRevRange(`uid:${actorUid}:posts`, start, stop);
			const postsFields = await posts.getPostsFields(pids, ['pid', 'tid', 'deleted']);
			const tids = [...new Set(postsFields.map(post => post && post.tid).filter(Boolean))];
			const topicsFields = await topics.getTopicsFields(tids, ['tid', 'deleted']);
			const tidToTopic = Object.fromEntries(topicsFields.map(topic => [String(topic && topic.tid), topic]));
			pids = postsFields.filter((post) => {
				const topic = tidToTopic[String(post && post.tid)];
				return post && !parseInt(post.deleted, 10) && topic && !parseInt(topic.deleted, 10);
			}).map(post => post.pid);
			const postsData = await posts.getPostSummaryByPids(pids, actorUid, {
				extraFields: ['deleted'],
			});
			result = {
				matchCount: await db.sortedSetCard(`uid:${actorUid}:posts`),
				pageCount: 1,
				posts: postsData,
			};
		}

		response = {
			query,
			page,
			limit,
			matchCount: result.matchCount || 0,
			pageCount: result.pageCount || 1,
			posts: (result.posts || []).map(mapPostSummary).filter(Boolean),
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
	} else if (skill === 'delete_own_topics') {
		const tids = normalizeTopicIds(input.tids);
		const topicsData = await topics.getTopicsFields(tids, ['tid', 'uid', 'title', 'deleted']);
		const missingTopic = topicsData.some(topic => !topic || !topic.tid);
		if (missingTopic) {
			return helpers.formatApiResponse(404, res, new Error('topic-not-found'));
		}

		const notOwnedTopic = topicsData.find(topic => parseInt(topic.uid, 10) !== parseInt(actorUid, 10));
		if (notOwnedTopic) {
			throw new Error('can-only-delete-own-topics');
		}

		const alreadyDeletedTopic = topicsData.find(topic => parseInt(topic.deleted, 10) === 1);
		if (alreadyDeletedTopic) {
			throw new Error('topic-already-deleted');
		}

		await api.topics.delete(caller, { tids });
		response = {
			mode: 'soft_delete',
			limit: DELETE_TOPICS_MAX,
			deletedCount: tids.length,
			topics: topicsData.map(topic => ({
				tid: topic.tid,
				title: topic.title,
			})),
		};
	} else if (skill === 'delete_own_posts') {
		const pids = normalizePostIds(input.pids);
		const postsData = await posts.getPostsFields(pids, ['pid', 'uid', 'tid', 'content', 'deleted']);
		const missingPost = postsData.some(post => !post || !post.pid);
		if (missingPost) {
			return helpers.formatApiResponse(404, res, new Error('post-not-found'));
		}

		const notOwnedPost = postsData.find(post => parseInt(post.uid, 10) !== parseInt(actorUid, 10));
		if (notOwnedPost) {
			throw new Error('can-only-delete-own-posts');
		}

		const alreadyDeletedPost = postsData.find(post => parseInt(post.deleted, 10) === 1);
		if (alreadyDeletedPost) {
			throw new Error('post-already-deleted');
		}

		await Promise.all(pids.map(pid => api.posts.delete(caller, { pid })));
		response = {
			mode: 'soft_delete',
			limit: DELETE_POSTS_MAX,
			deletedCount: pids.length,
			posts: postsData.map(post => ({
				pid: post.pid,
				tid: post.tid,
			})),
		};
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

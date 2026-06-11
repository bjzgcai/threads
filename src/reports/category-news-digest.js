'use strict';

/* eslint-disable no-await-in-loop */

require('../load-env')();

const { CronJob } = require('cron');
const { request } = require('undici');
const validator = require('validator');
const winston = require('winston');

const categories = require('../categories');
const db = require('../database');
const posts = require('../posts');
const privileges = require('../privileges');
const topics = require('../topics');
const utils = require('../utils');
const { parseWechatCategoryCidMap } = require('../wechat-category-routing');

const digest = module.exports;

const ENABLED = /^1|true|yes$/i.test(String(
	process.env.NEWS_DIGEST_ENABLED || process.env.WECHAT_AUTO_PUBLISH_ENABLED || 'false'
));
const CRON_EXPR = String(process.env.NEWS_DIGEST_CRON || '0 0 8 * * *').trim();
const TZ = String(process.env.NEWS_DIGEST_TZ || process.env.WECHAT_AUTO_PUBLISH_TZ || 'Asia/Shanghai').trim();
const CATEGORY_CIDS = parseCategoryCids();
const MAX_TOPICS = Math.max(parseInt(process.env.NEWS_DIGEST_MAX_TOPICS, 10) || 30, 5);
const MODEL = String(process.env.NEWS_DIGEST_AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();
const API_KEY = String(process.env.NEWS_DIGEST_AI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
const API_BASE = String(process.env.NEWS_DIGEST_AI_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const TIMEOUT_MS = Math.max(parseInt(process.env.NEWS_DIGEST_AI_TIMEOUT_MS, 10) || 45000, 5000);
const RUN_LOCK = 'category-news-digest:running';
const RUN_LOCK_STALE_MS = 30 * 60 * 1000;
const DIGEST_KEY_PREFIX = 'category-news-digest';

let job = null;

digest.startJobs = function () {
	if (!ENABLED) {
		winston.verbose('[category-news-digest] disabled by NEWS_DIGEST_ENABLED');
		return;
	}
	if (!CATEGORY_CIDS.length) {
		winston.warn('[category-news-digest] no categories configured, job skipped');
		return;
	}

	job = new CronJob(CRON_EXPR, async () => {
		try {
			await digest.generateDailyDigests();
		} catch (err) {
			winston.error(`[category-news-digest] job failed: ${err.stack || err.message}`);
		}
	}, null, true, TZ);

	winston.info(`[category-news-digest] job started cron="${CRON_EXPR}" tz="${TZ}" cids=${CATEGORY_CIDS.join(',')}`);
};

digest.stopJobs = function () {
	if (job) {
		job.stop();
		job = null;
	}
};

digest.generateDailyDigests = async function () {
	if (await db.exists(RUN_LOCK)) {
		const timestamp = parseInt(await db.getObjectField(RUN_LOCK, 'timestamp'), 10) || 0;
		if (Date.now() - timestamp < RUN_LOCK_STALE_MS) {
			winston.warn('[category-news-digest] previous run is still marked as running, skipped');
			return { generated: 0, skipped: CATEGORY_CIDS.length };
		}
	}

	await db.setObject(RUN_LOCK, { timestamp: Date.now(), pid: process.pid });
	try {
		let generated = 0;
		let skipped = 0;
		for (const cid of CATEGORY_CIDS) {
			try {
				const result = await digest.generateDigestForCategory(cid);
				if (result) {
					generated += 1;
				} else {
					skipped += 1;
				}
			} catch (err) {
				skipped += 1;
				winston.error(`[category-news-digest] cid=${cid} failed: ${err.stack || err.message}`);
			}
		}
		winston.info(`[category-news-digest] generated=${generated} skipped=${skipped}`);
		return { generated, skipped };
	} finally {
		await db.delete(RUN_LOCK);
	}
};

digest.generateDigestForCategory = async function (cid, options = {}) {
	cid = parseInt(cid, 10);
	if (!cid) {
		return null;
	}
	const day = options.day || getLocalDayKey(new Date(), TZ);
	const key = getDigestKey(cid, day);
	if (!options.force && await db.exists(key)) {
		return await db.getObject(key);
	}
	if (!API_KEY) {
		winston.warn('[category-news-digest] missing NEWS_DIGEST_AI_API_KEY/OPENAI_API_KEY, cannot generate AI digest');
		return null;
	}

	const [category, items] = await Promise.all([
		categories.getCategoryFields(cid, ['cid', 'name', 'slug']),
		getTodayTopicItems(cid, day),
	]);
	if (!category || !category.cid || !items.length) {
		await db.delete(key);
		return null;
	}

	const aiDigest = await generateWithAI(category, day, items);
	const payload = normalizeDigestPayload(aiDigest, category, day, items);
	await db.setObject(key, payload);
	await db.setObjectField(`category:${cid}`, 'newsDigestDate', day);
	return payload;
};

digest.getDigestForCategory = async function (cid) {
	if (!utils.isNumber(cid)) {
		return null;
	}
	cid = parseInt(cid, 10);
	if (!CATEGORY_CIDS.includes(cid)) {
		return null;
	}
	const day = getLocalDayKey(new Date(), TZ);
	const data = await db.getObject(getDigestKey(cid, day));
	if (!data || !data.items) {
		return null;
	}
	return formatDigestForTemplate(data);
};

async function getTodayTopicItems(cid, day) {
	const { start, end } = getLocalDayWindow(day, TZ);
	const tids = await db.getSortedSetRevRangeByScore(`cid:${cid}:tids:create`, 0, MAX_TOPICS - 1, end, start);
	const visibleTids = await privileges.topics.filterTids('topics:read', tids, 0);
	const topicData = await topics.getTopicsByTids(visibleTids, { uid: 0, tags: true });
	const mainPids = topicData.map(topic => topic && topic.mainPid).filter(Boolean);
	const mainPosts = await posts.getPostsFields(mainPids, ['pid', 'content']);
	const pidToPost = Object.fromEntries(mainPosts.map(post => [String(post && post.pid), post || {}]));

	return topicData.filter(Boolean).map((topic) => {
		const post = pidToPost[String(topic && topic.mainPid)] || {};
		return {
			tid: topic.tid,
			title: topic.titleRaw || topic.title || '',
			url: `/topic/${topic.slug || topic.tid}`,
			timestamp: parseInt(topic.timestamp, 10) || 0,
			postcount: parseInt(topic.postcount, 10) || 0,
			viewcount: parseInt(topic.viewcount, 10) || 0,
			excerpt: getTextPreview(post.content, 260),
		};
	}).filter(item => item.tid && item.title);
}

async function generateWithAI(category, day, items) {
	const body = {
		model: MODEL,
		response_format: { type: 'json_object' },
		messages: [
			{
				role: 'system',
				content: '你是诸葛菜园论坛的新闻速递编辑。请用亲切、清爽、可信的中文口吻，基于给定文章整理当天版块资讯。只输出 JSON。',
			},
			{
				role: 'user',
				content: JSON.stringify({
					date: day,
					category: category.name,
					instructions: '生成一个总体概要，并识别当天最重要的5条信息。不要编造未提供的事实。JSON 格式：{"intro":"80字以内总体概要","items":[{"tid":数字,"title":"短标题","summary":"一句话说明重要性"}]}。items最多5条，优先重要性和代表性。',
					articles: items,
				}),
			},
		],
		temperature: 0.4,
		stream: true,
	};

	const res = await request(`${API_BASE}/chat/completions`, {
		method: 'POST',
		body: JSON.stringify(body),
		headers: {
			Authorization: `Bearer ${API_KEY}`,
			'Content-Type': 'application/json',
		},
		bodyTimeout: TIMEOUT_MS,
		headersTimeout: TIMEOUT_MS,
	});
	const text = await res.body.text();
	if (res.statusCode < 200 || res.statusCode >= 300) {
		throw new Error(`AI request failed status=${res.statusCode} body=${text.slice(0, 300)}`);
	}
	const content = extractAIContent(text);
	return parseJsonObject(content);
}

function normalizeDigestPayload(aiDigest, category, day, sourceItems) {
	const byTid = new Map(sourceItems.map(item => [String(item.tid), item]));
	let items = Array.isArray(aiDigest.items) ? aiDigest.items : [];
	items = items.map((item) => {
		const source = byTid.get(String(item.tid)) || sourceItems.find(source => source.title === item.title);
		if (!source) {
			return null;
		}
		return {
			tid: source.tid,
			title: String(item.title || source.title).trim().slice(0, 80),
			summary: String(item.summary || source.excerpt).trim().slice(0, 140),
			url: source.url,
		};
	}).filter(Boolean).slice(0, 5);

	if (!items.length) {
		items = sourceItems.slice(0, 5).map(item => ({
			tid: item.tid,
			title: item.title.slice(0, 80),
			summary: item.excerpt.slice(0, 140),
			url: item.url,
		}));
	}

	return {
		cid: category.cid,
		categoryName: category.name,
		date: day,
		intro: String(aiDigest.intro || `今天「${category.name}」有 ${sourceItems.length} 条新资讯，先帮你挑出最值得关注的重点。`).trim().slice(0, 160),
		items: JSON.stringify(items),
		itemCount: items.length,
		generatedAt: Date.now(),
		model: MODEL,
	};
}

function formatDigestForTemplate(data) {
	let items = [];
	try {
		items = JSON.parse(data.items || '[]');
	} catch (err) {
		items = [];
	}
	items = items.map(item => ({
		tid: item.tid,
		title: validator.escape(String(item.title || '')),
		summary: validator.escape(String(item.summary || '')),
		url: validator.escape(String(item.url || '#')),
	}));
	return {
		date: validator.escape(String(data.date || '')),
		intro: validator.escape(String(data.intro || '')),
		items,
		generatedAtISO: new Date(parseInt(data.generatedAt, 10) || Date.now()).toISOString(),
	};
}

function parseCategoryCids() {
	const configured = String(process.env.NEWS_DIGEST_CATEGORY_CIDS || '').trim();
	if (configured) {
		return uniqueInts(configured.split(/[,，\s]+/));
	}
	const map = parseWechatCategoryCidMap(process.env.WECHAT_AUTO_PUBLISH_CATEGORY_CID_MAP || '');
	return uniqueInts(Object.values(map));
}

function uniqueInts(values) {
	return Array.from(new Set(values.map(value => parseInt(value, 10)).filter(Boolean)));
}

function getDigestKey(cid, day) {
	return `${DIGEST_KEY_PREFIX}:${cid}:${day}`;
}

function getTextPreview(content, maxLen) {
	return String(content || '')
		.replace(/<[^>]*>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, maxLen);
}

function parseJsonObject(content) {
	content = String(content || '').trim();
	try {
		return JSON.parse(content);
	} catch (err) {
		const match = content.match(/\{[\s\S]*\}/);
		if (!match) {
			throw err;
		}
		return JSON.parse(match[0]);
	}
}

function extractAIContent(text) {
	text = String(text || '').trim();
	if (!text) {
		return '';
	}

	if (!text.startsWith('data:')) {
		const data = JSON.parse(text);
		return data && data.choices && data.choices[0] && data.choices[0].message ?
			data.choices[0].message.content : '';
	}

	return text.split(/\r?\n/)
		.map(line => line.trim())
		.filter(line => line.startsWith('data:'))
		.map(line => line.slice(5).trim())
		.filter(line => line && line !== '[DONE]')
		.map((payload) => {
			const data = JSON.parse(payload);
			const choice = data.choices && data.choices[0] ? data.choices[0] : {};
			const delta = choice.delta || {};
			return delta.content || (choice.message && choice.message.content) || '';
		})
		.join('');
}

function getLocalDayKey(date, timeZone) {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(date).reduce((memo, part) => {
		memo[part.type] = part.value;
		return memo;
	}, {});
	return `${parts.year}-${parts.month}-${parts.day}`;
}

function getLocalDayWindow(day, timeZone) {
	const [year, month, date] = day.split('-').map(part => parseInt(part, 10));
	const start = zonedTimeToUtc(year, month, date, 0, 0, 0, timeZone);
	const next = new Date(start + 36 * 60 * 60 * 1000);
	const nextDay = getLocalDayKey(next, timeZone);
	const [nextYear, nextMonth, nextDate] = nextDay.split('-').map(part => parseInt(part, 10));
	return {
		start,
		end: zonedTimeToUtc(nextYear, nextMonth, nextDate, 0, 0, 0, timeZone) - 1,
	};
}

function zonedTimeToUtc(year, month, day, hour, minute, second, timeZone) {
	const utc = Date.UTC(year, month - 1, day, hour, minute, second);
	const offset = getTimeZoneOffset(utc, timeZone);
	return utc - offset;
}

function getTimeZoneOffset(timestamp, timeZone) {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hourCycle: 'h23',
	}).formatToParts(new Date(timestamp)).reduce((memo, part) => {
		memo[part.type] = part.value;
		return memo;
	}, {});
	const asUTC = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
	return asUTC - timestamp;
}

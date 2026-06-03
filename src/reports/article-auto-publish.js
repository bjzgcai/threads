'use strict';

/* eslint-disable no-await-in-loop */

require('../load-env')();

const { CronJob } = require('cron');
const { htmlToText } = require('html-to-text');
const { request } = require('undici');
const winston = require('winston');

const articleAutoPublishConfig = require('../article-auto-publish-config');
const db = require('../database');
const topics = require('../topics');

const publisher = module.exports;

const ENABLED = /^1|true|yes$/i.test(String(process.env.ARTICLE_AUTO_PUBLISH_ENABLED || 'false'));
const API_BASE_URL = String(process.env.ARTICLE_AUTO_PUBLISH_API_BASE_URL || 'http://10.1.132.21:8001').replace(/\/+$/, '');
const CRON_EXPR = String(process.env.ARTICLE_AUTO_PUBLISH_CRON || '0 15 8 * * *').trim();
const TZ = String(process.env.ARTICLE_AUTO_PUBLISH_TZ || 'Asia/Shanghai').trim();
const UID = parseInt(process.env.ARTICLE_AUTO_PUBLISH_UID, 10) || 1;
const LOOKBACK_DAYS = Math.max(parseInt(process.env.ARTICLE_AUTO_PUBLISH_LOOKBACK_DAYS, 10) || 1, 1);
const PAGE_SIZE = Math.min(Math.max(parseInt(process.env.ARTICLE_AUTO_PUBLISH_PAGE_SIZE, 10) || 100, 1), 100);
const MAX_ARTICLES = Math.max(parseInt(process.env.ARTICLE_AUTO_PUBLISH_MAX_ARTICLES, 10) || 100, 1);
const MAX_TITLE_LENGTH = Math.max(parseInt(process.env.ARTICLE_AUTO_PUBLISH_MAX_TITLE_LENGTH, 10) || 30, 1);
const DIMENSION = String(process.env.ARTICLE_AUTO_PUBLISH_DIMENSION || '').trim();
const SOURCE_TYPE = String(process.env.ARTICLE_AUTO_PUBLISH_SOURCE_TYPE || '').trim();
const SOURCE_IDS = String(process.env.ARTICLE_AUTO_PUBLISH_SOURCE_IDS || '').trim();
const KEYWORD = String(process.env.ARTICLE_AUTO_PUBLISH_KEYWORD || '').trim();
const TAG_PREFIX = String(process.env.ARTICLE_AUTO_PUBLISH_TAG_PREFIX || '').trim();
const INCLUDE_SOURCE_LINK = !/^0|false|no$/i.test(String(process.env.ARTICLE_AUTO_PUBLISH_INCLUDE_SOURCE_LINK || 'true'));
const IMPORTED_SET = 'article-auto-publish:imported';
const RUN_LOCK = 'article-auto-publish:running';
const RUN_LOCK_STALE_MS = 2 * 60 * 60 * 1000;

let job = null;

publisher.startJobs = function () {
	if (!ENABLED) {
		winston.verbose('[article-auto-publish] disabled by ARTICLE_AUTO_PUBLISH_ENABLED');
		return;
	}

	job = new CronJob(CRON_EXPR, async () => {
		try {
			await publisher.publishDailyArticles();
		} catch (err) {
			winston.error(`[article-auto-publish] job failed: ${err.stack || err.message}`);
		}
	}, null, true, TZ);

	winston.info(
		`[article-auto-publish] job started cron="${CRON_EXPR}" tz="${TZ}" routeConfig="${articleAutoPublishConfig.getCategoryMapFile()}" uid=${UID}`
	);
};

publisher.stopJobs = function () {
	if (job) {
		job.stop();
		job = null;
	}
};

publisher.publishDailyArticles = async function () {
	if (await db.exists(RUN_LOCK)) {
		const timestamp = parseInt(await db.getObjectField(RUN_LOCK, 'timestamp'), 10) || 0;
		if (Date.now() - timestamp < RUN_LOCK_STALE_MS) {
			winston.warn('[article-auto-publish] previous run is still marked as running, skipped');
			return { imported: 0, skipped: 0 };
		}
		winston.warn('[article-auto-publish] clearing stale run lock');
	}

	await db.setObject(RUN_LOCK, { timestamp: Date.now() });
	try {
		const routeConfig = articleAutoPublishConfig.loadCategoryConfig();
		if (!articleAutoPublishConfig.getCategoryIds(routeConfig).length) {
			winston.warn(`[article-auto-publish] no category routes configured in ${routeConfig.file}, job skipped`);
			return { imported: 0, skipped: 0 };
		}

		const { dateFrom, dateTo } = getDateWindow();
		const articles = await fetchArticleList(dateFrom, dateTo);
		let imported = 0;
		let skipped = 0;

		for (const brief of articles.slice(0, MAX_ARTICLES)) {
			const articleId = getArticleId(brief);
			if (!articleId) {
				skipped += 1;
				continue;
			}
			if (!isTitleAllowed(brief.title)) {
				skipped += 1;
				winston.warn(`[article-auto-publish] skipped article ${articleId}: title too long (${getTitleLength(brief.title)} > ${MAX_TITLE_LENGTH})`);
				continue;
			}
			if (await db.isSetMember(IMPORTED_SET, articleId)) {
				skipped += 1;
				continue;
			}

			try {
				const detail = await fetchArticleDetail(articleId);
				const article = { ...brief, ...detail, id: articleId };
				const publishCheck = getPublishEligibility(article, routeConfig);
				if (!publishCheck.allowed) {
					skipped += 1;
					winston.warn(`[article-auto-publish] skipped article ${articleId}: ${publishCheck.reason}`);
					continue;
				}
				if (!isTitleAllowed(article.title)) {
					skipped += 1;
					winston.warn(`[article-auto-publish] skipped article ${articleId}: detail title too long (${getTitleLength(article.title)} > ${MAX_TITLE_LENGTH})`);
					continue;
				}
				const payload = buildTopicPayload(article, routeConfig);
				const result = await topics.post(payload);

				await Promise.all([
					db.setAdd(IMPORTED_SET, articleId),
					db.setObject(`article-auto-publish:article:${articleId}`, {
						tid: result.topicData.tid,
						pid: result.postData.pid,
						cid: payload.cid,
						dimension: String(article.dimension || '').trim(),
						sourceType: String(getArticleFieldValue(article, 'source_type') || '').trim(),
						importedAt: Date.now(),
						sourceUrl: detail.url || brief.url || '',
					}),
				]);
				imported += 1;
			} catch (err) {
				skipped += 1;
				winston.error(`[article-auto-publish] article ${articleId} failed: ${err.stack || err.message}`);
			}
		}

		winston.info(`[article-auto-publish] imported=${imported} skipped=${skipped} window=${dateFrom}..${dateTo}`);
		return { imported, skipped };
	} finally {
		await db.delete(RUN_LOCK);
	}
};

async function fetchArticleList(dateFrom, dateTo) {
	const articles = [];
	let page = 1;

	while (articles.length < MAX_ARTICLES) {
		const data = await getJson('/api/articles', {
			date_from: dateFrom,
			date_to: dateTo,
			sort_by: 'crawled_at',
			order: 'desc',
			page,
			page_size: PAGE_SIZE,
			...(DIMENSION ? { dimension: DIMENSION } : {}),
			...(SOURCE_TYPE ? { source_type: SOURCE_TYPE } : {}),
			...(SOURCE_IDS ? { source_ids: SOURCE_IDS } : {}),
			...(KEYWORD ? { keyword: KEYWORD } : {}),
		});
		const items = Array.isArray(data.items) ? data.items : [];
		articles.push(...items);
		const totalPages = parseInt(data.total_pages, 10) || page;
		if (page >= totalPages || !items.length) {
			break;
		}
		page += 1;
	}

	return articles;
}

async function fetchArticleDetail(articleId) {
	return await getJson(`/api/articles/${encodeURIComponent(articleId)}`);
}

async function getJson(path, params = {}) {
	const url = new URL(`${API_BASE_URL}${path}`);
	Object.entries(params).forEach(([key, value]) => {
		if (value !== undefined && value !== null && value !== '') {
			url.searchParams.set(key, value);
		}
	});

	const { statusCode, body } = await request(url, {
		method: 'GET',
		headersTimeout: 30000,
		bodyTimeout: 30000,
	});
	const text = await body.text();
	if (statusCode >= 400) {
		throw new Error(`GET ${url.pathname} failed with HTTP ${statusCode}: ${text}`);
	}
	return JSON.parse(text);
}

function getPublishEligibility(article, routeConfig) {
	if (DIMENSION && normalizeMatchValue(article.dimension) !== normalizeMatchValue(DIMENSION)) {
		return {
			allowed: false,
			reason: `dimension="${String(article.dimension || '').trim() || 'unknown'}" does not match required dimension="${DIMENSION}"`,
		};
	}

	const articleSourceType = getArticleFieldValue(article, 'source_type');
	if (SOURCE_TYPE && normalizeMatchValue(articleSourceType) !== normalizeMatchValue(SOURCE_TYPE)) {
		return {
			allowed: false,
			reason: `source_type="${String(articleSourceType || '').trim() || 'unknown'}" does not match required source_type="${SOURCE_TYPE}"`,
		};
	}

	if (hasRouteForArticleDimension(article, routeConfig) && !articleMatchesAnyRoute(article, routeConfig)) {
		return {
			allowed: false,
			reason: `no matching article route for dimension="${String(article.dimension || '').trim() || 'unknown'}" source_type="${String(articleSourceType || '').trim() || 'unknown'}"`,
		};
	}

	return { allowed: true };
}

function buildTopicPayload(article, routeConfig = articleAutoPublishConfig.loadCategoryConfig()) {
	const cid = articleAutoPublishConfig.getCategoryIdForArticle(article, routeConfig);
	if (!cid) {
		throw new Error(
			`no target category configured for dimension="${String(article.dimension || '').trim() || 'unknown'}" source_type="${String(getArticleFieldValue(article, 'source_type') || '').trim() || 'unknown'}"`
		);
	}

	const sourceUrl = String(article.url || '').trim();
	const content = pickContent(article);
	const imageMarkdown = getArticleImageMarkdown(article, content);
	const metaLines = [
		article.author ? `Author: ${article.author}` : '',
	].filter(Boolean);
	const body = [
		imageMarkdown,
		content,
		metaLines.length ? `\n---\n${metaLines.join('\n')}` : '',
		INCLUDE_SOURCE_LINK && sourceUrl ? `\nOriginal URL: ${sourceUrl}` : '',
	].filter(Boolean).join('\n');

	return {
		uid: UID,
		cid,
		title: String(article.title || 'Untitled article').trim().slice(0, 255),
		content: body,
		tags: normalizeTags(article),
	};
}

function hasRouteForArticleDimension(article, routeConfig) {
	const dimension = normalizeMatchValue(article && article.dimension);
	if (!dimension) {
		return false;
	}

	return (routeConfig.articleRoutes || []).some(route => (
		route.match &&
		route.match.dimension &&
		route.match.dimension === dimension
	));
}

function articleMatchesAnyRoute(article, routeConfig) {
	return (routeConfig.articleRoutes || []).some(route => articleMatchesRoute(article, route));
}

function articleMatchesRoute(article, route) {
	if (!route || !route.match || !article || typeof article !== 'object') {
		return false;
	}

	return Object.entries(route.match).every(([field, expectedValue]) => (
		normalizeMatchValue(getArticleFieldValue(article, field)) === expectedValue
	));
}

function getArticleFieldValue(article, field) {
	if (!article || typeof article !== 'object') {
		return undefined;
	}
	if (Object.prototype.hasOwnProperty.call(article, field)) {
		return article[field];
	}

	if (field.includes('_')) {
		const camelField = field.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
		return article[camelField];
	}

	return undefined;
}

function normalizeMatchValue(value) {
	return String(value || '').trim().toLowerCase();
}

function getArticleImageMarkdown(article, content = '') {
	const image = getArticleImage(article);
	if (!image) {
		return '';
	}
	if (String(content).includes(`](${image.src})`)) {
		return '';
	}
	return formatMarkdownImage(image.src, image.alt || article.title || 'article image');
}

function getArticleImage(article) {
	const coverImageUrl = String(article.cover_image_url || '').trim();
	if (isHttpUrl(coverImageUrl)) {
		return { src: coverImageUrl, alt: article.title };
	}

	const extraImages = Array.isArray(article.extra && article.extra.images) ? article.extra.images : [];
	for (const image of extraImages) {
		const src = String((image && (image.src || image.url)) || '').trim();
		if (isHttpUrl(src)) {
			return { src, alt: image.alt || article.title };
		}
	}

	return null;
}

function isHttpUrl(value) {
	try {
		const url = new URL(value);
		return url.protocol === 'http:' || url.protocol === 'https:';
	} catch (err) {
		return false;
	}
}

function escapeMarkdownAlt(value) {
	return String(value || '')
		.replace(/\[|\]|\n|\r/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function formatMarkdownImage(src, alt) {
	return `![${escapeMarkdownAlt(alt)}](${src})`;
}

function pickContent(article) {
	const html = String(article.content_html || '').trim();
	if (looksLikeHtml(html)) {
		return formatHtmlContent(html);
	}

	const text = String(article.content || '').trim();
	if (text) {
		return text;
	}

	return String(article.title || 'No content available.').trim();
}

function normalizeTags(article) {
	const tags = new Set();
	const rawTags = Array.isArray(article.tags) ? article.tags : [];
	rawTags.forEach(tag => addTag(tags, tag));
	addTag(tags, article.dimension);
	addTag(tags, article.source_id);
	if (TAG_PREFIX) {
		Array.from(tags).forEach((tag) => {
			tags.delete(tag);
			addTag(tags, `${TAG_PREFIX}${tag}`);
		});
	}
	return Array.from(tags).slice(0, 5);
}

function addTag(tags, value) {
	const tag = String(value || '')
		.trim()
		.replace(/^#/, '')
		.replace(/[,\n\r\t]/g, ' ')
		.replace(/\s+/g, ' ')
		.slice(0, 30);
	if (tag) {
		tags.add(tag);
	}
}

function getArticleId(article) {
	return String((article && (article.id || article.url_hash)) || '').trim();
}

function isTitleAllowed(title) {
	return getTitleLength(title) <= MAX_TITLE_LENGTH;
}

function getTitleLength(title) {
	return Array.from(String(title || '').trim()).length;
}

function getDateWindow() {
	const now = new Date();
	const to = new Date(now);
	to.setHours(23, 59, 59, 999);
	const from = new Date(now);
	from.setDate(from.getDate() - LOOKBACK_DAYS);
	from.setHours(0, 0, 0, 0);
	return {
		dateFrom: from.toISOString(),
		dateTo: to.toISOString(),
	};
}

function looksLikeHtml(content) {
	return /<\/?[a-z][\s\S]*>/i.test(content);
}

function formatHtmlContent(html) {
	const text = htmlToText(html, {
		wordwrap: false,
		preserveNewlines: false,
		formatters: {
			articleImageMarkdown: formatArticleImageMarkdown,
		},
		selectors: [
			{
				selector: 'img',
				format: 'articleImageMarkdown',
				options: { leadingLineBreaks: 2, trailingLineBreaks: 2 },
			},
			{ selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
			{ selector: 'table', format: 'dataTable' },
		],
	});

	return text
		.replace(/\r\n/g, '\n')
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.replace(/[ \t]{2,}/g, ' ')
		.trim();
}

function formatArticleImageMarkdown(elem, walk, builder, formatOptions) {
	const src = getHtmlImageSrc(elem);
	if (!src) {
		return;
	}

	const attribs = elem && elem.attribs ? elem.attribs : {};
	const alt = attribs.alt || attribs.title || 'article image';
	builder.openBlock({ leadingLineBreaks: formatOptions.leadingLineBreaks || 2 });
	builder.addInline(formatMarkdownImage(src, alt), { noWordTransform: true });
	builder.closeBlock({ trailingLineBreaks: formatOptions.trailingLineBreaks || 2 });
}

function getHtmlImageSrc(elem) {
	const attribs = elem && elem.attribs ? elem.attribs : {};
	const candidates = [
		attribs['data-src'],
		attribs.src,
		attribs['data-lazy-src'],
		attribs['data-actualsrc'],
		attribs['data-original'],
		attribs['data-orig-src'],
		attribs['data-url'],
	];

	for (const candidate of candidates) {
		const value = String(candidate || '').trim();
		if (isHttpUrl(value)) {
			return value;
		}
	}

	return '';
}

'use strict';

/* eslint-disable no-await-in-loop */

require('../load-env')();

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { CronJob } = require('cron');
const { htmlToText } = require('html-to-text');
const mime = require('mime');
const nconf = require('nconf');
const { request } = require('undici');
const winston = require('winston');

const categories = require('../categories');
const db = require('../database');
const file = require('../file');
const image = require('../image');
const topics = require('../topics');
const user = require('../user');

const publisher = module.exports;

const ENABLED = /^1|true|yes$/i.test(String(process.env.WECHAT_AUTO_PUBLISH_ENABLED || 'false'));
const CRON_EXPR = String(process.env.WECHAT_AUTO_PUBLISH_CRON || '0 0 7 * * *').trim();
const TZ = String(process.env.WECHAT_AUTO_PUBLISH_TZ || 'Asia/Shanghai').trim();
const CID = parseInt(process.env.WECHAT_AUTO_PUBLISH_CID, 10) || 0;
const CATEGORY_NAME = String(process.env.WECHAT_AUTO_PUBLISH_CATEGORY_NAME || '公众号精选').trim();
const CATEGORY_PARENT_CID = parseInt(process.env.WECHAT_AUTO_PUBLISH_PARENT_CID, 10) || 0;
const UID = parseInt(process.env.WECHAT_AUTO_PUBLISH_UID, 10) || 1;
const EXCEL_PATH = path.resolve(__dirname, '..', '..', process.env.WECHAT_AUTO_PUBLISH_EXCEL_PATH || 'docs/account.csv');
const ACCOUNTS = parseAccounts(process.env.WECHAT_AUTO_PUBLISH_ACCOUNTS || '');
const RESPECT_EXCEL_HOURS = /^1|true|yes$/i.test(String(process.env.WECHAT_AUTO_PUBLISH_RESPECT_EXCEL_HOURS || 'false'));
const MAX_ARTICLES = Math.max(parseInt(process.env.WECHAT_AUTO_PUBLISH_MAX_ARTICLES, 10) || 50, 1);
const TIMEOUT_MS = Math.max(parseInt(process.env.WECHAT_AUTO_PUBLISH_TIMEOUT_MS, 10) || 15000, 1000);
const TASK_API_BASE = String(process.env.WECHAT_AUTO_PUBLISH_TASK_API_BASE || 'http://223.93.145.203:31588').replace(/\/+$/, '');
const TASK_POLL_INTERVAL_MS = Math.max(
	parseInt(process.env.WECHAT_AUTO_PUBLISH_TASK_POLL_INTERVAL_MS, 10) || 10000,
	1000
);
const TASK_MAX_POLL_ATTEMPTS = Math.max(
	parseInt(process.env.WECHAT_AUTO_PUBLISH_TASK_MAX_POLL_ATTEMPTS, 10) || 60,
	1
);
const IMPORTED_SET = 'wechat-auto-publish:imported';
const RUN_LOCK = 'wechat-auto-publish:running';
const RUN_LOCK_STALE_MS = 2 * 60 * 60 * 1000;
const RUN_LOCK_CLEANUP_SIGNALS = ['SIGTERM', 'SIGINT', 'SIGQUIT'];
const WECHAT_IMAGE_SRC_ATTRS = [
	'data-src',
	'src',
	'data-lazy-src',
	'data-actualsrc',
	'data-original',
	'data-orig-src',
	'data-url',
];

let job = null;
let shutdownHooksInstalled = false;
let runLockCleanupPromise = null;

publisher.startJobs = function () {
	if (!ENABLED) {
		winston.verbose('[wechat-auto-publish] disabled by WECHAT_AUTO_PUBLISH_ENABLED');
		return;
	}
	if (!ACCOUNTS.length) {
		winston.warn(`[wechat-auto-publish] no accounts found in WECHAT_AUTO_PUBLISH_ACCOUNTS or ${EXCEL_PATH}, job skipped`);
		return;
	}

	installShutdownHooks();
	job = new CronJob(CRON_EXPR, async () => {
		try {
			await publisher.publishDailyWechatArticles();
		} catch (err) {
			winston.error(`[wechat-auto-publish] job failed: ${err.stack || err.message}`);
		}
	}, null, true, TZ);

	winston.info(`[wechat-auto-publish] job started cron="${CRON_EXPR}" tz="${TZ}" accounts=${ACCOUNTS.length}`);
};

publisher.stopJobs = function () {
	if (job) {
		job.stop();
		job = null;
	}
};

publisher.publishDailyWechatArticles = async function () {
	if (await db.exists(RUN_LOCK)) {
		const timestamp = parseInt(await db.getObjectField(RUN_LOCK, 'timestamp'), 10) || 0;
		if (Date.now() - timestamp < RUN_LOCK_STALE_MS) {
			winston.warn('[wechat-auto-publish] previous run is still marked as running, skipped');
			return { imported: 0, skipped: 0 };
		}
		winston.warn('[wechat-auto-publish] clearing stale run lock');
	}

	await db.setObject(RUN_LOCK, { timestamp: Date.now(), pid: process.pid });
	try {
		const cid = await ensureCategory();
		const window = getYesterdayTimeWindow();
		let imported = 0;
		let skipped = 0;

		for (const account of ACCOUNTS) {
			if (!account.category) {
				skipped += 1;
				winston.warn(`[wechat-auto-publish] skipped account "${account.name}" because category is empty`);
				continue;
			}
			if (!shouldRunAccountNow(account)) {
				winston.info(`[wechat-auto-publish] skipped account "${account.name}" because current hour is not in ${JSON.stringify(account.hoursList)}`);
				continue;
			}

			let articles = [];
			try {
				articles = await fetchAccountArticles(account, window);
			} catch (err) {
				skipped += 1;
				winston.error(`[wechat-auto-publish] account "${account.name}" failed: ${err.stack || err.message}`);
				continue;
			}

			for (const brief of articles.slice(0, MAX_ARTICLES)) {
				const articleId = getArticleId(brief);
				if (!articleId) {
					skipped += 1;
					continue;
				}
				if (await shouldSkipImportedArticle(articleId)) {
					skipped += 1;
					continue;
				}

				try {
					let detail = buildArticleDetail(brief);
					detail = await localizeArticleImages(detail, {
						accountName: account.name,
						articleId,
						sourceUrl: brief.original_url,
					});
					if (!detail.contentText && !detail.htmlContent) {
						skipped += 1;
						continue;
					}

					const interaction = normalizeEngagement(brief.engagement_data);
					const comments = normalizeComments(brief.comments);
					const payload = buildTopicPayload(cid, account, brief, detail, interaction, comments);
					const result = await topics.post(payload);

					await Promise.all([
						db.setAdd(IMPORTED_SET, articleId),
						db.setObject(`wechat-auto-publish:article:${articleId}`, {
							tid: result.topicData.tid,
							pid: result.postData.pid,
							importedAt: Date.now(),
							sourceUrl: brief.original_url,
							account: account.name,
							category: account.category,
						}),
					]);
					imported += 1;
				} catch (err) {
					skipped += 1;
					winston.error(`[wechat-auto-publish] article ${articleId} failed: ${err.stack || err.message}`);
				}
			}
		}

		winston.info(`[wechat-auto-publish] imported=${imported} skipped=${skipped} cid=${cid}`);
		return { imported, skipped };
	} finally {
		await deleteRunLockIfOwned('job completion');
	}
};

function installShutdownHooks() {
	if (shutdownHooksInstalled) {
		return;
	}
	shutdownHooksInstalled = true;

	RUN_LOCK_CLEANUP_SIGNALS.forEach((signal) => {
		process.once(signal, () => {
			void deleteRunLockIfOwned(`signal ${signal}`);
		});
	});
}

async function deleteRunLockIfOwned(reason) {
	if (runLockCleanupPromise) {
		return await runLockCleanupPromise;
	}

	runLockCleanupPromise = (async () => {
		try {
			const runLock = await db.getObject(RUN_LOCK);
			if (!runLock) {
				return false;
			}

			const lockPid = parseInt(runLock.pid, 10) || 0;
			if (lockPid && lockPid !== process.pid) {
				winston.verbose(`[wechat-auto-publish] skip run lock cleanup on ${reason}, owner pid=${lockPid}`);
				return false;
			}

			await db.delete(RUN_LOCK);
			winston.info(`[wechat-auto-publish] cleared run lock on ${reason}`);
			return true;
		} catch (err) {
			winston.warn(`[wechat-auto-publish] failed to clear run lock on ${reason}: ${err.message}`);
			return false;
		} finally {
			runLockCleanupPromise = null;
		}
	})();

	return await runLockCleanupPromise;
}

async function shouldSkipImportedArticle(articleId) {
	const imported = await db.isSetMember(IMPORTED_SET, articleId);
	if (!imported) {
		return false;
	}

	const mappingKey = `wechat-auto-publish:article:${articleId}`;
	const mapping = await db.getObject(mappingKey);
	const tid = parseInt(mapping && mapping.tid, 10) || 0;
	if (!tid) {
		return true;
	}

	const topic = await topics.getTopicFields(tid, ['tid', 'deleted']);
	if (topic && topic.tid && !parseInt(topic.deleted, 10)) {
		return true;
	}

	winston.info(`[wechat-auto-publish] clearing stale imported marker article=${articleId} tid=${tid || 'unknown'}`);
	await Promise.all([
		db.setRemove(IMPORTED_SET, articleId),
		db.delete(mappingKey),
	]);
	return false;
}

async function ensureCategory() {
	if (CID) {
		return CID;
	}

	const cids = await categories.getAllCidsFromSet('categories:cid');
	const allCategories = await categories.getCategoriesFields(cids, ['cid', 'name', 'parentCid', 'disabled']);
	const existing = allCategories.find(category => (
		category &&
		!category.disabled &&
		String(category.name || '').trim() === CATEGORY_NAME &&
		parseInt(category.parentCid, 10) === CATEGORY_PARENT_CID
	));
	if (existing) {
		return parseInt(existing.cid, 10);
	}

	const category = await categories.create({
		name: CATEGORY_NAME,
		description: '每日自动抓取的微信公众号文章',
		parentCid: CATEGORY_PARENT_CID,
		icon: 'fa-weixin',
		bgColor: '#1aad19',
		color: '#ffffff',
	});
	winston.info(`[wechat-auto-publish] created category "${CATEGORY_NAME}" cid=${category.cid}`);
	return parseInt(category.cid, 10);
}

async function fetchAccountArticles(account, window) {
	const submitResponse = await postJson(`${TASK_API_BASE}/submit_task`, {
		account_name: account.name,
		start_time: window.startTime,
		end_time: window.endTime,
		category: account.category,
	});
	const taskId = String((submitResponse && submitResponse.task_id) || '').trim();
	if (!taskId) {
		throw new Error(`submit_task missing task_id for account="${account.name}" category="${account.category}"`);
	}

	const result = await queryTaskUntilDone(taskId, account);
	const articles = result && Array.isArray(result.articles) ? result.articles : [];
	winston.info(`[wechat-auto-publish] task ${taskId} account="${account.name}" category="${account.category}" articles=${articles.length}`);
	return articles.map(article => normalizeTaskArticle(article, account));
}

async function queryTaskUntilDone(taskId, account) {
	for (let attempt = 1; attempt <= TASK_MAX_POLL_ATTEMPTS; attempt += 1) {
		const response = await postJson(`${TASK_API_BASE}/query_task`, { task_id: taskId });
		const status = String((response && response.status) || '').toUpperCase();
		if (status === 'SUCCESS') {
			return response.result || {};
		}
		if (status === 'FAILURE') {
			throw new Error(`query_task failed task_id=${taskId}: ${response.error || response.message || 'unknown error'}`);
		}
		if (attempt < TASK_MAX_POLL_ATTEMPTS) {
			await sleep(TASK_POLL_INTERVAL_MS);
		}
	}
	throw new Error(`query_task timed out task_id=${taskId} account="${account.name}" category="${account.category}"`);
}

function normalizeTaskArticle(article, account) {
	const content = article && article.content && typeof article.content === 'object' ? article.content : {};
	const publishTime = parseInt(article?.publish_time, 10) || 0;
	const originalUrl = String(article?.original_url || '').trim();
	return {
		article_id: String(article?.article_id || '').trim(),
		source_account: String(article?.source_account || account.name).trim(),
		category: String(article?.category || account.category).trim(),
		title: String(article?.title || '').trim(),
		author: String(article?.author || '').trim(),
		publish_time: publishTime,
		post_time_str: publishTime ? formatUnixTime(publishTime) : '',
		fetch_time: parseInt(article?.fetch_time, 10) || 0,
		original_url: originalUrl,
		content,
		engagement_data: article?.engagement_data,
		comments: Array.isArray(article?.comments) ? article.comments : [],
	};
}

function buildArticleDetail(article) {
	return {
		accountName: article.source_account,
		contentText: String((article.content && article.content.text) || '').trim(),
		htmlContent: String((article.content && article.content.html) || '').trim(),
		author: article.author,
		imagePaths: [],
	};
}

async function localizeArticleImages(detail, context) {
	if (!detail.htmlContent || !looksLikeHtml(detail.htmlContent)) {
		return detail;
	}

	const matches = Array.from(detail.htmlContent.matchAll(/<img\b[^>]*>/gi));
	if (!matches.length) {
		return detail;
	}

	const cache = new Map();
	const imagePaths = [];
	let localizedHtml = '';
	let lastIndex = 0;
	let imageIndex = 0;

	for (const match of matches) {
		const tag = match[0];
		const index = match.index || 0;

		localizedHtml += detail.htmlContent.slice(lastIndex, index);
		lastIndex = index + tag.length;

		const remoteUrl = getWechatImageSrcFromTag(tag);
		if (!remoteUrl) {
			localizedHtml += tag;
			continue;
		}

		imageIndex += 1;
		let upload = cache.get(remoteUrl);
		if (!upload && !cache.has(remoteUrl)) {
			try {
				upload = await downloadWechatImage(remoteUrl, {
					...context,
					imageIndex,
				});
			} catch (err) {
				upload = null;
				winston.warn(`[wechat-auto-publish] image import failed account="${context.accountName}" article="${context.articleId}" url="${remoteUrl}": ${err.message}`);
			}
			cache.set(remoteUrl, upload);
		}

		if (!upload) {
			localizedHtml += tag;
			continue;
		}

		if (!imagePaths.includes(upload.relativePath)) {
			imagePaths.push(upload.relativePath);
		}

		localizedHtml += rewriteImageTagSources(tag, upload.url);
	}

	localizedHtml += detail.htmlContent.slice(lastIndex);
	return {
		...detail,
		htmlContent: localizedHtml,
		imagePaths,
	};
}

function normalizeEngagement(data) {
	if (!data || typeof data !== 'object') {
		return null;
	}
	return {
		read_count: numberFromAny(data.read_count, data.read, data.read_num),
		like_count: numberFromAny(data.like_count, data.like, data.zan),
		wow_count: numberFromAny(data.wow_count, data.looking, data.watch_count),
		forward_count: numberFromAny(data.forward_count, data.share_count, data.share_num),
		comment_count: numberFromAny(data.comment_count, data.comments_count),
	};
}

function normalizeComments(comments) {
	return (Array.isArray(comments) ? comments : []).map(comment => ({
		user_nickname: String(comment?.user_nickname || comment?.nick_name || '').trim(),
		comment_text: String(comment?.comment_text || comment?.content || '').trim(),
		like_count: numberFromAny(comment?.like_count, comment?.like_num),
		publish_time: parseInt(comment?.publish_time, 10) || 0,
	})).filter(comment => comment.comment_text || comment.user_nickname);
}

function buildTopicPayload(cid, account, brief, detail, interaction, comments) {
	const content = pickContent(detail);
	const metaLines = [
		`公众号: ${detail.accountName || account.name}`,
		detail.author ? `作者: ${detail.author}` : '',
		brief.post_time_str ? `发布时间: ${brief.post_time_str}` : '',
		interaction ? `阅读 ${interaction.read_count} / 点赞 ${interaction.like_count} / 在看 ${interaction.wow_count} / 转发 ${interaction.forward_count} / 评论 ${interaction.comment_count}` : '',
		`原文: ${brief.original_url}`,
	].filter(Boolean);
	const commentLines = comments.length ? [
		'',
		'热门评论:',
		...comments.slice(0, 20).map(comment => `- ${comment.user_nickname}: ${comment.comment_text}`),
	] : [];

	return {
		uid: UID,
		cid,
		title: normalizeTitle(brief.title),
		content: [content, '', '---', ...metaLines, ...commentLines].join('\n').trim(),
		tags: normalizeTags([account.category, detail.accountName || account.name, '公众号']),
		thumbs: detail.imagePaths && detail.imagePaths.length ? [detail.imagePaths[0]] : [],
	};
}

async function postJson(url, body) {
	return await requestJson(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
}

async function requestJson(url, options) {
	const { statusCode, body } = await request(url, {
		...options,
		headersTimeout: TIMEOUT_MS,
		bodyTimeout: TIMEOUT_MS,
	});
	const text = await body.text();
	if (statusCode >= 400) {
		throw new Error(`HTTP ${statusCode}: ${text}`);
	}
	return JSON.parse(text);
}

function parseAccounts(raw) {
	const excelAccounts = loadAccountsFromExcel(EXCEL_PATH);
	if (excelAccounts.length) {
		return excelAccounts;
	}

	const value = String(raw || '').trim();
	if (!value) {
		return [];
	}
	if (value.startsWith('[')) {
		try {
			const parsed = JSON.parse(value);
			return parsed.map(account => ({
				name: String(account.name || '').trim(),
				category: String(account.category || '').trim(),
				hoursList: parseHours(account.hours || account.hoursList),
			})).filter(account => account.name);
		} catch (err) {
			winston.warn(`[wechat-auto-publish] invalid WECHAT_AUTO_PUBLISH_ACCOUNTS JSON: ${err.message}`);
			return [];
		}
	}
	return value.split(',')
		.map(name => ({ name: name.trim(), category: '' }))
		.filter(account => account.name);
}

function loadAccountsFromExcel(excelPath) {
	if (!fs.existsSync(excelPath)) {
		return [];
	}
	if (path.extname(excelPath).toLowerCase() === '.csv') {
		return loadAccountsFromCsv(excelPath);
	}

	const script = `
import json
import sys
import openpyxl

path = sys.argv[1]

def clean(value):
    return str(value or '').replace('\\ufeff', '').strip()

wb = openpyxl.load_workbook(path, data_only=True)
ws = wb.active
headers = [clean(cell.value) for cell in ws[1]]
rows = list(ws.iter_rows(min_row=2, values_only=True))

def get(row, name):
    if name not in headers:
        return None
    return row[headers.index(name)]

def get_any(row, names, fallback_index=None):
    for name in names:
        value = get(row, name)
        if value:
            return value
    if fallback_index is not None and fallback_index < len(row):
        return row[fallback_index]
    return None

def parse_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value == 1
    return str(value or '').strip().lower() in ('是', '1', 'yes', 'true')

def parse_hours(value):
    result = []
    for part in str(value or '').replace('，', ',').split(','):
        part = part.strip()
        if part.isdigit():
            hour = int(part)
            if 0 <= hour <= 23:
                result.append(hour)
    return result

accounts = []
for row in rows:
    if not row or all(cell is None for cell in row):
        continue
    name = get_any(row, ['账号名称', '公众号名称'], 0)
    if not name:
        continue
    category = get_any(row, ['分类', '类别(category)'], 1)
    accounts.append({
        'name': str(name).strip(),
        'category': str(category or '').strip(),
        'hoursList': parse_hours(get(row, '采集时间点')),
    })

print(json.dumps(accounts, ensure_ascii=False))
`;

	try {
		const output = execFileSync('python', ['-c', script, excelPath], {
			encoding: 'utf8',
			timeout: 15000,
			windowsHide: true,
		});
		const accounts = JSON.parse(output);
		winston.info(`[wechat-auto-publish] loaded ${accounts.length} account(s) from ${excelPath}`);
		return accounts;
	} catch (err) {
		winston.warn(`[wechat-auto-publish] failed to load Excel config ${excelPath}: ${err.message}`);
		return [];
	}
}

function loadAccountsFromCsv(csvPath) {
	try {
		const lines = fs.readFileSync(csvPath, 'utf8')
			.replace(/^\uFEFF/, '')
			.split(/\r?\n/)
			.filter(line => line.trim());
		if (lines.length < 2) {
			return [];
		}

		const headers = parseCsvLine(lines[0]).map(cleanCsvCell);
		const accounts = lines.slice(1).map((line) => {
			const row = parseCsvLine(line).map(cleanCsvCell);
			const name = getCsvValue(row, headers, ['账号名称', '公众号名称'], 0);
			const category = getCsvValue(row, headers, ['分类', '类别(category)'], 1);
			const hours = getCsvValue(row, headers, ['采集时间点'], -1);
			return {
				name,
				category,
				hoursList: parseHours(hours),
			};
		}).filter(account => account.name);

		winston.info(`[wechat-auto-publish] loaded ${accounts.length} account(s) from ${csvPath}`);
		return accounts;
	} catch (err) {
		winston.warn(`[wechat-auto-publish] failed to load CSV config ${csvPath}: ${err.message}`);
		return [];
	}
}

function parseCsvLine(line) {
	const cells = [];
	let current = '';
	let quoted = false;

	for (let index = 0; index < line.length; index += 1) {
		const char = line[index];
		const next = line[index + 1];
		if (char === '"' && quoted && next === '"') {
			current += '"';
			index += 1;
		} else if (char === '"') {
			quoted = !quoted;
		} else if (char === ',' && !quoted) {
			cells.push(current);
			current = '';
		} else {
			current += char;
		}
	}
	cells.push(current);
	return cells;
}

function cleanCsvCell(value) {
	return String(value || '').replace(/^\uFEFF/, '').trim();
}

function getCsvValue(row, headers, names, fallbackIndex) {
	for (const name of names) {
		const index = headers.indexOf(name);
		if (index !== -1 && row[index]) {
			return row[index];
		}
	}
	return fallbackIndex >= 0 && fallbackIndex < row.length ? row[fallbackIndex] : '';
}

function pickContent(detail) {
	if (detail.htmlContent && looksLikeHtml(detail.htmlContent)) {
		const formatted = htmlToText(detail.htmlContent, {
			wordwrap: false,
			preserveNewlines: false,
			formatters: {
				wechatImageMarkdown: formatWechatImageMarkdown,
			},
			selectors: [
				{
					selector: 'img',
					format: 'wechatImageMarkdown',
					options: { leadingLineBreaks: 2, trailingLineBreaks: 2 },
				},
				{ selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
				{ selector: 'table', format: 'dataTable' },
			],
		}).replace(/\r\n/g, '\n')
			.replace(/[ \t]+\n/g, '\n')
			.replace(/\n{3,}/g, '\n\n')
			.replace(/[ \t]{2,}/g, ' ')
			.trim();
		if (formatted) {
			return formatted;
		}
	}
	return String(detail.contentText || '无正文内容').trim();
}

function formatWechatImageMarkdown(elem, walk, builder, formatOptions) {
	const src = getWechatImageSrc(elem);
	if (!src) {
		return;
	}

	const attribs = elem && elem.attribs ? elem.attribs : {};
	const alt = escapeMarkdownAlt(attribs.alt || attribs.title || '文章图片') || '文章图片';
	builder.openBlock({ leadingLineBreaks: formatOptions.leadingLineBreaks || 2 });
	builder.addInline(`![${alt}](${src})`, { noWordTransform: true });
	builder.closeBlock({ trailingLineBreaks: formatOptions.trailingLineBreaks || 2 });
}

function getWechatImageSrc(elem) {
	const attribs = elem && elem.attribs ? elem.attribs : {};
	for (const name of WECHAT_IMAGE_SRC_ATTRS) {
		const value = normalizeRenderableImageUrl(attribs[name]);
		if (value) {
			return value;
		}
	}

	return '';
}

function getWechatImageSrcFromTag(tag) {
	for (const name of WECHAT_IMAGE_SRC_ATTRS) {
		const value = getHtmlAttributeValue(tag, name);
		const normalized = normalizeHttpUrl(value);
		if (normalized) {
			return normalized;
		}
	}
	return '';
}

function getHtmlAttributeValue(tag, name) {
	const pattern = new RegExp(`${escapeRegex(name)}\\s*=\\s*(["'])(.*?)\\1`, 'i');
	const quoted = tag.match(pattern);
	if (quoted) {
		return quoted[2];
	}

	const barePattern = new RegExp(`${escapeRegex(name)}\\s*=\\s*([^\\s"'=<>` + '`' + `]+)`, 'i');
	const bare = tag.match(barePattern);
	return bare ? bare[1] : '';
}

function rewriteImageTagSources(tag, localUrl) {
	let updated = tag;
	for (const name of WECHAT_IMAGE_SRC_ATTRS) {
		updated = replaceHtmlAttributeValue(updated, name, localUrl);
	}

	if (!new RegExp(`\\bsrc\\s*=`, 'i').test(updated)) {
		updated = updated.replace(/<img\b/i, `<img src="${escapeHtmlAttribute(localUrl)}"`);
	}

	return updated;
}

function replaceHtmlAttributeValue(tag, name, value) {
	const escapedValue = escapeHtmlAttribute(value);
	const pattern = new RegExp(`(${escapeRegex(name)}\\s*=\\s*)(["'])(.*?)\\2`, 'gi');
	let updated = tag.replace(pattern, (match, prefix, quote, currentValue) => {
		if (!normalizeHttpUrl(currentValue)) {
			return match;
		}
		return `${prefix}${quote}${escapedValue}${quote}`;
	});

	const barePattern = new RegExp(`(${escapeRegex(name)}\\s*=\\s*)([^\\s"'=<>` + '`' + `]+)`, 'gi');
	updated = updated.replace(barePattern, (match, prefix, currentValue) => {
		if (!normalizeHttpUrl(currentValue)) {
			return match;
		}
		return `${prefix}"${escapedValue}"`;
	});

	return updated;
}

function isHttpUrl(value) {
	try {
		const url = new URL(value);
		return url.protocol === 'http:' || url.protocol === 'https:';
	} catch (err) {
		return false;
	}
}

function normalizeHttpUrl(value) {
	let normalized = String(value || '').trim().replace(/&amp;/g, '&');
	if (normalized.startsWith('//')) {
		normalized = `https:${normalized}`;
	}
	return isHttpUrl(normalized) ? normalized : '';
}

function normalizeRenderableImageUrl(value) {
	const normalized = String(value || '').trim().replace(/&amp;/g, '&');
	const relativePath = String(nconf.get('relative_path') || '');
	const uploadUrl = String(nconf.get('upload_url') || '/assets/uploads');

	if (normalized.startsWith(uploadUrl) || (relativePath && normalized.startsWith(`${relativePath}${uploadUrl}`))) {
		return normalized;
	}

	return normalizeHttpUrl(normalized);
}

function escapeMarkdownAlt(value) {
	return String(value || '')
		.replace(/\[|\]|\n|\r/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function escapeHtmlAttribute(value) {
	return String(value || '')
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;');
}

function escapeRegex(value) {
	return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function downloadWechatImage(imageUrl, context) {
	const { statusCode, headers, body } = await request(imageUrl, {
		method: 'GET',
		maxRedirections: 3,
		headersTimeout: TIMEOUT_MS,
		bodyTimeout: TIMEOUT_MS,
		headers: {
			accept: 'image/*,*/*;q=0.8',
			referer: isHttpUrl(context.sourceUrl) ? context.sourceUrl : TASK_API_BASE,
			'user-agent': 'Mozilla/5.0 (compatible; NodeBB WeChat Auto Publish/1.0)',
		},
	});
	if (statusCode >= 400) {
		throw new Error(`HTTP ${statusCode}`);
	}

	const contentType = String(headers['content-type'] || '').split(';')[0].trim().toLowerCase();
	const extension = resolveImageExtension(imageUrl, contentType);
	const tempPath = path.join(
		os.tmpdir(),
		`wechat-auto-publish-${crypto.randomUUID()}${extension}`
	);

	try {
		const buffer = Buffer.from(await body.arrayBuffer());
		if (!buffer.length) {
			throw new Error('empty image body');
		}

		await fs.promises.writeFile(tempPath, buffer);
		await image.isFileTypeAllowed(tempPath);
		await image.stripEXIF({ path: tempPath, type: contentType });

		const filename = buildWechatImageFilename(context.articleId, context.imageIndex, imageUrl, extension);
		const upload = await file.saveFileToLocal(filename, 'files', tempPath);
		const relativePath = upload.url.replace(`${nconf.get('upload_url')}`, '');
		await user.associateUpload(UID, relativePath);

		return {
			url: upload.url,
			relativePath,
		};
	} finally {
		await file.delete(tempPath);
	}
}

function resolveImageExtension(imageUrl, contentType) {
	const byType = mime.getExtension(contentType || '');
	if (byType) {
		return `.${byType}`;
	}

	try {
		const pathname = new URL(imageUrl).pathname;
		const extension = path.extname(pathname || '').toLowerCase();
		if (extension) {
			return extension;
		}
	} catch (err) {
		// ignore malformed URLs and fall back to a safe default
	}

	return '.jpg';
}

function buildWechatImageFilename(articleId, imageIndex, imageUrl, extension) {
	const safeArticleId = String(articleId || 'article')
		.replace(/[^a-zA-Z0-9_-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48) || 'article';
	const hash = crypto.createHash('md5').update(String(imageUrl || '')).digest('hex').slice(0, 10);
	return `wechat-${safeArticleId}-${imageIndex}-${hash}${extension}`;
}

function getArticleId(article) {
	const rawArticleId = article && article.article_id;
	const rawUrl = article && article.original_url;
	const url = String(rawUrl || '').trim();
	const match = url.match(/https:\/\/mp\.weixin\.qq\.com\/s\/([^?#&]+)/);
	return String(rawArticleId || (match && match[1]) || url).trim();
}

function getYesterdayTimeWindow() {
	const now = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
	const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
	const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);
	return {
		startTime: formatDateTime(start),
		endTime: formatDateTime(end),
	};
}

function shouldRunAccountNow(account) {
	if (!RESPECT_EXCEL_HOURS) {
		return true;
	}
	if (!Array.isArray(account.hoursList) || !account.hoursList.length) {
		return true;
	}
	const hour = parseInt(new Date().toLocaleString('en-US', {
		timeZone: TZ,
		hour: 'numeric',
		hour12: false,
	}), 10);
	return account.hoursList.includes(hour);
}

function normalizeTitle(title) {
	const normalized = String(title || '微信公众号文章').trim();
	return Array.from(normalized).slice(0, 120).join('');
}

function normalizeTags(values) {
	const tags = new Set();
	values.forEach((value) => {
		const tag = String(value || '')
			.trim()
			.replace(/^#/, '')
			.replace(/[,\n\r\t]/g, ' ')
			.replace(/\s+/g, ' ')
			.slice(0, 30);
		if (tag) {
			tags.add(tag);
		}
	});
	return Array.from(tags).slice(0, 5);
}

function looksLikeHtml(content) {
	return /<\/?[a-z][\s\S]*>/i.test(content);
}

function numberFromAny(...values) {
	for (const value of values) {
		const parsed = parseInt(value, 10);
		if (!Number.isNaN(parsed)) {
			return parsed;
		}
	}
	return 0;
}

function parseHours(value) {
	if (Array.isArray(value)) {
		return value.map(hour => parseInt(hour, 10)).filter(hour => hour >= 0 && hour <= 23);
	}
	return String(value || '')
		.replace(/，/g, ',')
		.split(',')
		.map(hour => parseInt(hour.trim(), 10))
		.filter(hour => hour >= 0 && hour <= 23);
}

function formatUnixTime(timestamp) {
	if (!timestamp) {
		return '';
	}
	return formatDateTime(new Date(timestamp * 1000));
}

function formatDateTime(date) {
	const pad = value => String(value).padStart(2, '0');
	return [
		date.getFullYear(),
		pad(date.getMonth() + 1),
		pad(date.getDate()),
	].join('-') + ' ' + [
		pad(date.getHours()),
		pad(date.getMinutes()),
		pad(date.getSeconds()),
	].join(':');
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

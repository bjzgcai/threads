'use strict';

/* eslint-disable no-await-in-loop */

require('../load-env')();

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { CronJob } = require('cron');
const { htmlToText } = require('html-to-text');
const { request } = require('undici');
const winston = require('winston');

const categories = require('../categories');
const db = require('../database');
const topics = require('../topics');

const publisher = module.exports;

const ENABLED = /^1|true|yes$/i.test(String(process.env.WECHAT_AUTO_PUBLISH_ENABLED || 'false'));
const CRON_EXPR = String(process.env.WECHAT_AUTO_PUBLISH_CRON || '0 0 7 * * *').trim();
const TZ = String(process.env.WECHAT_AUTO_PUBLISH_TZ || 'Asia/Shanghai').trim();
const CID = parseInt(process.env.WECHAT_AUTO_PUBLISH_CID, 10) || 0;
const CATEGORY_NAME = String(process.env.WECHAT_AUTO_PUBLISH_CATEGORY_NAME || '公众号精选').trim();
const CATEGORY_PARENT_CID = parseInt(process.env.WECHAT_AUTO_PUBLISH_PARENT_CID, 10) || 0;
const UID = parseInt(process.env.WECHAT_AUTO_PUBLISH_UID, 10) || 1;
const KEY = String(process.env.WECHAT_AUTO_PUBLISH_JZLKEY || '').trim();
const VERIFY_CODE = String(process.env.WECHAT_AUTO_PUBLISH_VERIFY_CODE || '').trim();
const EXCEL_PATH = path.resolve(__dirname, '..', '..', process.env.WECHAT_AUTO_PUBLISH_EXCEL_PATH || 'wechat_config.xlsx');
const ACCOUNTS = parseAccounts(process.env.WECHAT_AUTO_PUBLISH_ACCOUNTS || '');
const LOOKBACK_HOURS = Math.max(parseInt(process.env.WECHAT_AUTO_PUBLISH_LOOKBACK_HOURS, 10) || 24, 1);
const MAX_HISTORY_PAGES = Math.max(parseInt(process.env.WECHAT_AUTO_PUBLISH_MAX_HISTORY_PAGES, 10) || 10, 1);
const MAX_COMMENT_PAGES = Math.max(parseInt(process.env.WECHAT_AUTO_PUBLISH_MAX_COMMENT_PAGES, 10) || 0, 0);
const INCLUDE_INTERACTION = /^1|true|yes$/i.test(String(process.env.WECHAT_AUTO_PUBLISH_INCLUDE_INTERACTION || 'true'));
const INCLUDE_COMMENTS = /^1|true|yes$/i.test(String(process.env.WECHAT_AUTO_PUBLISH_INCLUDE_COMMENTS || 'false'));
const RESPECT_EXCEL_HOURS = /^1|true|yes$/i.test(String(process.env.WECHAT_AUTO_PUBLISH_RESPECT_EXCEL_HOURS || 'false'));
const MAX_ARTICLES = Math.max(parseInt(process.env.WECHAT_AUTO_PUBLISH_MAX_ARTICLES, 10) || 50, 1);
const TIMEOUT_MS = Math.max(parseInt(process.env.WECHAT_AUTO_PUBLISH_TIMEOUT_MS, 10) || 15000, 1000);
const IMPORTED_SET = 'wechat-auto-publish:imported';
const RUN_LOCK = 'wechat-auto-publish:running';
const RUN_LOCK_STALE_MS = 2 * 60 * 60 * 1000;

let job = null;

publisher.startJobs = function () {
	if (!ENABLED) {
		winston.verbose('[wechat-auto-publish] disabled by WECHAT_AUTO_PUBLISH_ENABLED');
		return;
	}
	if (!KEY) {
		winston.warn('[wechat-auto-publish] missing WECHAT_AUTO_PUBLISH_JZLKEY, job skipped');
		return;
	}
	if (!ACCOUNTS.length) {
		winston.warn(`[wechat-auto-publish] no accounts found in WECHAT_AUTO_PUBLISH_ACCOUNTS or ${EXCEL_PATH}, job skipped`);
		return;
	}

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

	await db.setObject(RUN_LOCK, { timestamp: Date.now() });
	try {
		const cid = await ensureCategory();
		const { startTs, endTs } = getTimeWindow();
		let imported = 0;
		let skipped = 0;

		for (const account of ACCOUNTS) {
			if (!shouldRunAccountNow(account)) {
				winston.info(`[wechat-auto-publish] skipped account "${account.name}" because current hour is not in ${JSON.stringify(account.hoursList)}`);
				continue;
			}

			const accountWindow = getTimeWindow(account.timeRangeType);
			const history = await fetchAccountHistory(
				account,
				accountWindow.startTs || startTs,
				accountWindow.endTs || endTs
			);
			for (const brief of history.slice(0, MAX_ARTICLES)) {
				const articleId = getArticleId(brief);
				if (!articleId || await db.isSetMember(IMPORTED_SET, articleId)) {
					skipped += 1;
					continue;
				}

				try {
					const detail = await fetchArticleDetail(brief.original_url);
					if (!detail.contentText && !detail.htmlContent) {
						skipped += 1;
						continue;
					}

					const includeInteraction = account.needInteract === undefined ? INCLUDE_INTERACTION : account.needInteract;
					const includeComments = account.needComment === undefined ? INCLUDE_COMMENTS : account.needComment;
					const interaction = includeInteraction ? await fetchInteraction(brief.original_url) : null;
					const comments = includeComments && interaction && interaction.comment_count > 0 ?
						await fetchComments(brief.original_url) : [];
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
		await db.delete(RUN_LOCK);
	}
};

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

async function fetchAccountHistory(account, startTs, endTs) {
	const articles = [];
	let isOver = false;

	for (let page = 1; page <= MAX_HISTORY_PAGES && !isOver; page += 1) {
		const response = await postJson('https://www.dajiala.com/fbmain/monitor/v3/post_history', {
			biz: account.biz || '',
			url: '',
			name: account.name,
			page,
			key: KEY,
			verifycode: VERIFY_CODE,
		});

		if (response.code === 105) {
			winston.warn(`[wechat-auto-publish] account not found: ${account.name}`);
			break;
		}
		if (response.code !== 0) {
			throw new Error(`post_history code=${response.code}, msg=${response.msg || ''}`);
		}

		for (const article of (Array.isArray(response.data) ? response.data : [])) {
			const postTime = parseInt(article.post_time, 10) || 0;
			if (postTime < startTs) {
				isOver = true;
				break;
			}
			if (postTime > endTs) {
				continue;
			}
			if (String(article.is_deleted || '0') !== '0' || parseInt(article.msg_status, 10) !== 2) {
				continue;
			}
			const url = String(article.url || '').trim();
			const articleId = getArticleId({ original_url: url });
			if (!articleId) {
				continue;
			}
			articles.push({
				article_id: articleId,
				original_url: url,
				title: String(article.title || '').trim(),
				post_time: postTime,
				post_time_str: String(article.post_time_str || '').trim(),
				cover_url: String(article.cover_url || '').trim(),
			});
		}
	}

	return articles;
}

async function fetchArticleDetail(articleUrl) {
	const response = await getJson('https://www.dajiala.com/fbmain/monitor/v3/article_detail', {
		url: articleUrl,
		key: KEY,
		mode: 2,
		verifycode: VERIFY_CODE,
	});
	if (response.code === 101) {
		return {};
	}
	if (response.code !== 0) {
		throw new Error(`article_detail code=${response.code}, msg=${response.msg || ''}`);
	}
	return {
		ghid: String(response.user_name || '').trim(),
		biz: String(response.biz || '').trim(),
		accountName: String(response.nick_name || '').trim(),
		contentText: String(response.content || '').trim(),
		htmlContent: String(response.content_multi_text || '').trim(),
		author: String(response.author || '').trim(),
	};
}

async function fetchInteraction(articleUrl) {
	const response = await postJson('https://www.dajiala.com/fbmain/monitor/v3/read_zan_pro', {
		url: articleUrl,
		key: KEY,
		mode: 1,
		verifycode: VERIFY_CODE,
	});
	if (response.code === 101) {
		return zeroInteraction();
	}
	if (response.code !== 0) {
		throw new Error(`read_zan_pro code=${response.code}, msg=${response.msg || ''}`);
	}
	const data = response.data || {};
	return {
		read_count: parseInt(data.read, 10) || 0,
		like_count: parseInt(data.zan, 10) || 0,
		wow_count: parseInt(data.looking, 10) || 0,
		forward_count: parseInt(data.share_num, 10) || 0,
		comment_count: parseInt(data.comment_count, 10) || 0,
	};
}

async function fetchComments(articleUrl) {
	const comments = [];
	let buffer = '';

	for (let page = 1; page <= MAX_COMMENT_PAGES; page += 1) {
		const response = await postForm('https://www.dajiala.com/fbmain/monitor/v3/article_comment2', {
			url: articleUrl,
			buffer,
			key: KEY,
			verifycode: VERIFY_CODE,
		});
		if (response.code === 101) {
			break;
		}
		if (response.code !== 0) {
			throw new Error(`article_comment2 code=${response.code}, msg=${response.msg || ''}`);
		}
		const data = Array.isArray(response.data) ? response.data : [];
		data.forEach((item) => {
			comments.push({
				user_nickname: String(item.nick_name || '').trim(),
				comment_text: String(item.content || '').trim(),
				like_count: parseInt(item.like_num, 10) || 0,
				publish_time: parseInt(item.create_time_stamp, 10) || 0,
			});
		});
		if (!response.continue_flag || data.length < 100) {
			break;
		}
		buffer = String(response.buffer || '');
	}

	return comments;
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
	};
}

async function getJson(url, params = {}) {
	const requestUrl = new URL(url);
	Object.entries(params).forEach(([key, value]) => {
		if (value !== undefined && value !== null && value !== '') {
			requestUrl.searchParams.set(key, value);
		}
	});
	return await requestJson(requestUrl, { method: 'GET' });
}

async function postJson(url, body) {
	return await requestJson(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
}

async function postForm(url, data) {
	const body = new URLSearchParams();
	Object.entries(data).forEach(([key, value]) => body.set(key, value || ''));
	return await requestJson(url, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: body.toString(),
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
	const value = String(raw || '').trim();
	if (!value) {
		return loadAccountsFromExcel(EXCEL_PATH);
	}
	if (value.startsWith('[')) {
		try {
			const parsed = JSON.parse(value);
			return parsed.map(account => ({
				name: String(account.name || '').trim(),
				biz: String(account.biz || '').trim(),
				category: String(account.category || '').trim(),
			})).filter(account => account.name);
		} catch (err) {
			winston.warn(`[wechat-auto-publish] invalid WECHAT_AUTO_PUBLISH_ACCOUNTS JSON: ${err.message}`);
			return [];
		}
	}
	return value.split(',')
		.map(name => ({ name: name.trim(), biz: '', category: '' }))
		.filter(account => account.name);
}

function loadAccountsFromExcel(excelPath) {
	if (!fs.existsSync(excelPath)) {
		return [];
	}

	const script = `
import json
import sys
import openpyxl

path = sys.argv[1]
wb = openpyxl.load_workbook(path, data_only=True)
ws = wb.active
headers = [cell.value for cell in ws[1]]

def get(row, name):
    if name not in headers:
        return None
    return row[headers.index(name)]

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
for row in ws.iter_rows(min_row=2, values_only=True):
    if not row or all(cell is None for cell in row):
        continue
    name = get(row, '公众号名称')
    if not name:
        continue
    accounts.append({
        'name': str(name).strip(),
        'biz': '',
        'category': str(get(row, '类别(category)') or '').strip(),
        'timeRangeType': str(get(row, '时间范围类型') or '').strip(),
        'needInteract': parse_bool(get(row, '是否获取互动数据')),
        'needComment': parse_bool(get(row, '是否获取评论数据')),
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

function getArticleId(article) {
	const rawArticleId = article && article.article_id;
	const rawUrl = article && article.original_url;
	const url = String(rawUrl || '').trim();
	const match = url.match(/https:\/\/mp\.weixin\.qq\.com\/s\/([^?#&]+)/);
	return String(rawArticleId || (match && match[1]) || url).trim();
}

function getTimeWindow(timeRangeType) {
	const endTs = Math.floor(Date.now() / 1000);
	if (String(timeRangeType || '').trim() === '当天') {
		const start = new Date();
		start.setHours(0, 0, 0, 0);
		return {
			startTs: Math.floor(start.getTime() / 1000),
			endTs,
		};
	}

	return {
		startTs: endTs - (LOOKBACK_HOURS * 60 * 60),
		endTs,
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

function zeroInteraction() {
	return {
		read_count: 0,
		like_count: 0,
		wow_count: 0,
		forward_count: 0,
		comment_count: 0,
	};
}

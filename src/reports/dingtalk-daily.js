'use strict';

require('../load-env')();

const https = require('https');
const crypto = require('crypto');
const { CronJob } = require('cron');
const nconf = require('nconf');
const winston = require('winston');

const db = require('../database');
const analytics = require('../analytics');

const report = module.exports;

const ENABLED = /^1|true|yes$/i.test(String(process.env.DINGTALK_DAILY_REPORT_ENABLED || 'false'));
const WEBHOOK = String(process.env.DINGTALK_DAILY_REPORT_WEBHOOK || '').trim();
const SECRET = String(process.env.DINGTALK_DAILY_REPORT_SECRET || '').trim();
const CRON_EXPR = String(process.env.DINGTALK_DAILY_REPORT_CRON || '0 5 9 * * *').trim();
const TZ = String(process.env.DINGTALK_DAILY_REPORT_TZ || 'Asia/Shanghai').trim();

let job = null;

report.startJobs = function () {
	if (!ENABLED) {
		winston.verbose('[dingtalk-report] disabled by DINGTALK_DAILY_REPORT_ENABLED');
		return;
	}
	if (!WEBHOOK) {
		winston.warn('[dingtalk-report] missing DINGTALK_DAILY_REPORT_WEBHOOK, job skipped');
		return;
	}

	job = new CronJob(CRON_EXPR, async () => {
		try {
			await report.sendDailySummary();
		} catch (err) {
			winston.error(`[dingtalk-report] daily summary failed: ${err.stack || err.message}`);
		}
	}, null, true, TZ);

	winston.info(`[dingtalk-report] job started cron="${CRON_EXPR}" tz="${TZ}"`);
};

report.stopJobs = function () {
	if (job) {
		job.stop();
		job = null;
	}
};

report.sendDailySummary = async function () {
	const data = await report.buildDailySummaryData();
	await sendMarkdown(`社区日报 ${data.dateLabel}`, data.markdown);
	winston.info(`[dingtalk-report] sent daily summary for ${data.dateLabel}`);
};

report.buildDailySummaryData = async function () {
	const now = new Date();
	const dayStart = new Date(now);
	dayStart.setHours(0, 0, 0, 0);
	const yesterdayStart = new Date(dayStart.getTime() - 24 * 60 * 60 * 1000);
	const todayStartTs = dayStart.getTime();
	const dateLabel = formatDate(yesterdayStart);

	const [
		registrations,
		topics,
		posts,
		pageviews,
		uniqueVisitors,
		logins,
		global,
	] = await Promise.all([
		getYesterdayAnalyticsValue('analytics:registrations', todayStartTs),
		getYesterdayAnalyticsValue('analytics:topics', todayStartTs),
		getYesterdayAnalyticsValue('analytics:posts', todayStartTs),
		getYesterdayAnalyticsValue('analytics:pageviews', todayStartTs),
		getYesterdayAnalyticsValue('analytics:uniquevisitors', todayStartTs),
		getYesterdayAnalyticsValue('analytics:logins', todayStartTs),
		db.getObjectFields('global', ['userCount', 'topicCount', 'postCount', 'loginCount']),
	]);

	const metrics = {
		registrations,
		topics,
		posts,
		pageviews,
		uniqueVisitors,
		logins,
	};
	const totals = {
		userCount: toInt(global.userCount),
		topicCount: toInt(global.topicCount),
		postCount: toInt(global.postCount),
		loginCount: toInt(global.loginCount),
	};

	const markdown = [
		`### 社区日报（${dateLabel}）`,
		`- 新增用户：**${registrations}**`,
		`- 新增主题：**${topics}**`,
		`- 新增帖子：**${posts}**`,
		`- 访问量（PV）：**${pageviews}**`,
		`- 访客数（UV）：**${uniqueVisitors}**`,
		`- 登录次数：**${logins}**`,
		'',
		'#### 累计总量',
		`- 用户总数：${totals.userCount}`,
		`- 主题总数：${totals.topicCount}`,
		`- 帖子总数：${totals.postCount}`,
		`- 登录总次数：${totals.loginCount}`,
		'',
		`> 来源：${nconf.get('url') || 'NodeBB'}`,
	].join('\n');

	return {
		dateLabel,
		timestamp: yesterdayStart.getTime(),
		metrics,
		totals,
		markdown,
	};
};

async function getYesterdayAnalyticsValue(key, todayStartTs) {
	// Match admin dashboard aggregation: daily buckets up to today's 00:00, then take yesterday.
	const data = await analytics.getDailyStatsForSet(key, todayStartTs, 60);
	if (!Array.isArray(data) || data.length < 2) {
		return 0;
	}
	return toInt(data[data.length - 2]);
}

function toInt(value) {
	return parseInt(value, 10) || 0;
}

function formatDate(date) {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

async function sendMarkdown(title, text) {
	let url = WEBHOOK;
	if (SECRET) {
		const timestamp = Date.now();
		const sign = createSign(timestamp, SECRET);
		url += `${url.includes('?') ? '&' : '?'}timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`;
	}

	await postJson(url, {
		msgtype: 'markdown',
		markdown: {
			title,
			text,
		},
	});
}

function createSign(timestamp, secret) {
	const stringToSign = `${timestamp}\n${secret}`;
	return crypto.createHmac('sha256', secret).update(stringToSign).digest('base64');
}

function postJson(url, body) {
	return new Promise((resolve, reject) => {
		const payload = JSON.stringify(body);
		const parsed = new URL(url);
		const req = https.request({
			hostname: parsed.hostname,
			path: parsed.pathname + (parsed.search || ''),
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': Buffer.byteLength(payload),
			},
		}, (res) => {
			let data = '';
			res.on('data', chunk => { data += chunk; });
			res.on('end', () => {
				if (res.statusCode >= 400) {
					return reject(new Error(`HTTP ${res.statusCode}: ${data}`));
				}

				try {
					const json = JSON.parse(data);
					if (json.errcode && parseInt(json.errcode, 10) !== 0) {
						return reject(new Error(`DingTalk errcode=${json.errcode}, errmsg=${json.errmsg}`));
					}
					resolve(json);
				} catch (err) {
					reject(new Error(`Invalid JSON response: ${data}`));
				}
			});
		});

		req.setTimeout(15000, () => req.destroy(new Error('DingTalk webhook timeout')));
		req.on('error', reject);
		req.write(payload);
		req.end();
	});
}

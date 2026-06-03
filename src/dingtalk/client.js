'use strict';

const fs = require('fs');
const https = require('https');
const path = require('path');

const winston = require('winston');

const DINGTALK_APP_TOKEN_URL = 'https://api.dingtalk.com/v1.0/oauth2/accessToken';
const DINGTALK_DEPARTMENT_DETAIL_URL = 'https://oapi.dingtalk.com/topapi/v2/department/get';
const DINGTALK_DEPARTMENT_LISTSUB_URL = 'https://oapi.dingtalk.com/topapi/v2/department/listsub';
const DINGTALK_DEPARTMENT_USERS_URL = 'https://oapi.dingtalk.com/topapi/v2/user/list';
const HTTP_TIMEOUT_MS = 10000;
const APP_TOKEN_REFRESH_SKEW_MS = 60 * 1000;

loadDotEnvIfNeeded();

let appAccessTokenCache = {
	token: '',
	expiresAt: 0,
};

const client = module.exports;

client.getAppAccessToken = async function () {
	if (appAccessTokenCache.token && Date.now() < appAccessTokenCache.expiresAt) {
		return appAccessTokenCache.token;
	}

	const response = await postJson(DINGTALK_APP_TOKEN_URL, {
		appKey: getClientId(),
		appSecret: getClientSecret(),
	});

	const token = String((response && response.accessToken) || '').trim();
	const expiresIn = parseInt(response && response.expireIn, 10) || 7200;
	if (!token) {
		throw new Error('DingTalk app accessToken is empty');
	}

	appAccessTokenCache = {
		token,
		expiresAt: Date.now() + Math.max(0, (expiresIn * 1000) - APP_TOKEN_REFRESH_SKEW_MS),
	};
	return token;
};

client.getDepartment = async function (deptId) {
	const token = await client.getAppAccessToken();
	const response = await postForm(
		withAccessToken(DINGTALK_DEPARTMENT_DETAIL_URL, token),
		{
			dept_id: normalizeDeptId(deptId),
			language: 'zh_CN',
		}
	);
	return assertOapiSuccess(response, 'department/get');
};

client.listSubDepartments = async function (deptId) {
	const token = await client.getAppAccessToken();
	const response = await postForm(
		withAccessToken(DINGTALK_DEPARTMENT_LISTSUB_URL, token),
		{
			dept_id: normalizeDeptId(deptId),
			language: 'zh_CN',
		}
	);
	const result = assertOapiSuccess(response, 'department/listsub');
	return Array.isArray(result) ? result : [];
};

client.listDepartmentUsers = async function (deptId) {
	const token = await client.getAppAccessToken();
	const users = [];
	let cursor = 0;
	let hasMore;

	do {
		/* eslint-disable no-await-in-loop */
		const response = await postForm(
			withAccessToken(DINGTALK_DEPARTMENT_USERS_URL, token),
			{
				dept_id: normalizeDeptId(deptId),
				cursor: String(cursor),
				size: '100',
				language: 'zh_CN',
			}
		);
		const result = assertOapiSuccess(response, 'user/list') || {};
		if (Array.isArray(result.list)) {
			users.push(...result.list);
		}
		hasMore = !!result.has_more;
		cursor = parseInt(result.next_cursor, 10) || 0;
	} while (hasMore);

	return users;
};

function getClientId() {
	const clientId = String(process.env.DINGTALK_CLIENT_ID || '').trim();
	if (!clientId) {
		throw new Error('DINGTALK_CLIENT_ID is not configured');
	}
	return clientId;
}

function getClientSecret() {
	const clientSecret = String(process.env.DINGTALK_CLIENT_SECRET || '').trim();
	if (!clientSecret) {
		throw new Error('DINGTALK_CLIENT_SECRET is not configured');
	}
	return clientSecret;
}

function normalizeDeptId(deptId) {
	const value = String(deptId || '').trim();
	if (!value) {
		throw new Error('DingTalk department id is required');
	}
	return value;
}

function withAccessToken(url, token) {
	return `${url}?access_token=${encodeURIComponent(token)}`;
}

function assertOapiSuccess(response, endpoint) {
	if (!response || String(response.errcode) !== '0') {
		throw new Error(`DingTalk ${endpoint} errcode=${response && response.errcode}, errmsg=${response && response.errmsg}`);
	}
	return response.result;
}

function postJson(url, body) {
	return request(url, JSON.stringify(body), {
		'Content-Type': 'application/json',
	});
}

function postForm(url, body) {
	const payload = new URLSearchParams(body).toString();
	return request(url, payload, {
		'Content-Type': 'application/x-www-form-urlencoded',
	});
}

function request(url, payload, headers) {
	return new Promise((resolve, reject) => {
		const parsed = new URL(url);
		const options = {
			hostname: parsed.hostname,
			path: parsed.pathname + (parsed.search || ''),
			method: 'POST',
			headers: {
				...headers,
				'Content-Length': Buffer.byteLength(payload),
			},
		};
		const req = https.request(options, (res) => {
			let data = '';
			res.on('data', (chunk) => { data += chunk; });
			res.on('end', () => {
				try {
					const json = JSON.parse(data);
					if (res.statusCode >= 400) {
						reject(new Error(`DingTalk API error ${res.statusCode}: ${json.message || json.errmsg || data}`));
					} else {
						resolve(json);
					}
				} catch (err) {
					reject(new Error(`Invalid JSON from DingTalk: ${data}`));
				}
			});
		});
		req.setTimeout(HTTP_TIMEOUT_MS, () => {
			req.destroy(new Error('DingTalk API request timeout'));
		});
		req.on('error', reject);
		req.write(payload);
		req.end();
	});
}

function loadDotEnvIfNeeded() {
	try {
		const envPath = path.resolve(__dirname, '..', '..', '.env');
		if (!fs.existsSync(envPath)) {
			return;
		}
		const raw = fs.readFileSync(envPath, 'utf-8');
		raw.split(/\r?\n/).forEach((line) => {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) {
				return;
			}
			const idx = trimmed.indexOf('=');
			if (idx === -1) {
				return;
			}
			const key = trimmed.slice(0, idx).trim();
			let value = trimmed.slice(idx + 1).trim();
			if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
				value = value.slice(1, -1);
			}
			if (!process.env[key]) {
				process.env[key] = value;
			}
		});
	} catch (err) {
		winston.warn(`[dingtalk] Failed to load .env: ${err.message}`);
	}
}

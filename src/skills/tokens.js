'use strict';

const db = require('../database');
const api = require('../api');
const user = require('../user');

const TOKEN_META_PREFIX = 'token:skills:meta:';
const ALLOWED_SCOPES = new Set(['post:read', 'post:write']);
const MAX_EXPIRES_IN_DAYS = 3650;

function normalizeScopes(scopes) {
	const values = Array.isArray(scopes) ? scopes : (scopes ? [scopes] : []);
	const normalized = [...new Set(values.map(scope => String(scope || '').trim()).filter(Boolean))];
	const invalid = normalized.filter(scope => !ALLOWED_SCOPES.has(scope));
	if (invalid.length) {
		throw new Error('skills-token-invalid-scopes');
	}
	return normalized.length ? normalized : ['post:read'];
}

function sanitizeName(name) {
	const value = String(name || '').trim();
	if (!value) {
		return 'Personal Skills Token';
	}
	if (value.length > 128) {
		throw new Error('skills-token-name-too-long');
	}
	return value;
}

function normalizeExpiresInDays(value) {
	if (value === undefined || value === null || value === '') {
		return 90;
	}

	const num = parseInt(value, 10);
	if (!Number.isFinite(num) || num < 0) {
		throw new Error('skills-token-invalid-expiry');
	}
	if (num > MAX_EXPIRES_IN_DAYS) {
		throw new Error('skills-token-expiry-too-long');
	}
	return num;
}

async function getTokenMetaObject(token) {
	return await db.getObject(`${TOKEN_META_PREFIX}${token}`);
}

function parseTokenMeta(meta, tokenObj = {}) {
	if (!meta || String(meta.type || '') !== 'skills') {
		return null;
	}

	let scopes = [];
	try {
		scopes = JSON.parse(meta.scopes || '[]');
	} catch (err) {
		scopes = [];
	}

	const expiresAt = parseInt(meta.expiresAt, 10) || 0;
	const now = Date.now();
	const expired = expiresAt > 0 && expiresAt <= now;

	return {
		token: tokenObj.token,
		tokenPreview: tokenObj.token ? `${tokenObj.token.slice(0, 6)}...${tokenObj.token.slice(-4)}` : '',
		uid: parseInt(meta.uid, 10) || 0,
		name: String(meta.name || ''),
		scopes,
		scopesLabel: scopes.join(', '),
		createdAt: parseInt(meta.createdAt, 10) || 0,
		createdAtISO: meta.createdAt ? new Date(parseInt(meta.createdAt, 10)).toISOString() : null,
		expiresInDays: parseInt(meta.expiresInDays, 10) || 0,
		expiresAt,
		expiresAtISO: expiresAt ? new Date(expiresAt).toISOString() : null,
		expired,
		lastSeen: tokenObj.lastSeen || 0,
		lastSeenISO: tokenObj.lastSeenISO || null,
		lastSeenIp: String(meta.lastSeenIp || ''),
		lastExternalUserId: String(meta.lastExternalUserId || ''),
		lastExternalUserName: String(meta.lastExternalUserName || ''),
	};
}

async function create(uid, { name, scopes, expiresInDays }) {
	const safeName = sanitizeName(name);
	const safeScopes = normalizeScopes(scopes);
	const safeExpiresInDays = normalizeExpiresInDays(expiresInDays);
	const token = await api.utils.tokens.generate({
		uid,
		description: `skills:${safeName}`,
	});
	const expiresAt = safeExpiresInDays > 0 ? Date.now() + safeExpiresInDays * 24 * 60 * 60 * 1000 : 0;

	await db.setObject(`${TOKEN_META_PREFIX}${token.token}`, {
		type: 'skills',
		uid,
		name: safeName,
		scopes: JSON.stringify(safeScopes),
		expiresInDays: safeExpiresInDays,
		createdAt: Date.now(),
		expiresAt,
	});

	return {
		token: token.token,
		name: safeName,
		scopes: safeScopes,
		expiresInDays: safeExpiresInDays,
		expiresAt,
		expiresAtISO: expiresAt ? new Date(expiresAt).toISOString() : null,
	};
}

async function list(uid) {
	const tokens = await db.getSortedSetRangeByScore('tokens:uid', 0, -1, uid, uid);
	if (!tokens.length) {
		return [];
	}

	const [tokenObjs, metaObjs] = await Promise.all([
		api.utils.tokens.get(tokens),
		db.getObjects(tokens.map(token => `${TOKEN_META_PREFIX}${token}`)),
	]);

	let rows = tokenObjs
		.map((tokenObj, index) => parseTokenMeta(metaObjs[index], tokenObj))
		.filter(meta => meta && meta.uid === parseInt(uid, 10));
	rows = await attachUserInfo(rows);
	return rows;
}

async function listAll({ page = 1, resultsPerPage = 50, uid, query } = {}) {
	const safePage = Math.max(1, parseInt(page, 10) || 1);
	const safeResultsPerPage = [20, 50, 100].includes(parseInt(resultsPerPage, 10)) ? parseInt(resultsPerPage, 10) : 50;
	const start = Math.max(0, safePage - 1) * safeResultsPerPage;
	const stop = start + safeResultsPerPage - 1;

	let tokens;
	let count;
	if (uid) {
		const safeUid = parseInt(uid, 10);
		tokens = await db.getSortedSetRangeByScore('tokens:uid', 0, -1, safeUid, safeUid);
		count = tokens.length;
	} else {
		[tokens, count] = await Promise.all([
			db.getSortedSetRevRange('tokens:createtime', 0, -1),
			api.utils.tokens.count(),
		]);
	}

	if (!tokens.length) {
		return {
			tokens: [],
			page: safePage,
			pageCount: 1,
			count: 0,
			resultsPerPage: safeResultsPerPage,
		};
	}

	const [tokenObjs, metaObjs] = await Promise.all([
		api.utils.tokens.get(tokens),
		db.getObjects(tokens.map(token => `${TOKEN_META_PREFIX}${token}`)),
	]);

	let rows = tokenObjs
		.map((tokenObj, index) => parseTokenMeta(metaObjs[index], tokenObj))
		.filter(Boolean);
	count = rows.length;

	if (query) {
		const lowerQuery = String(query).trim().toLowerCase();
		rows = rows.filter(row =>
			String(row.name || '').toLowerCase().includes(lowerQuery) ||
			String(row.uid || '').includes(lowerQuery) ||
			String(row.tokenPreview || '').toLowerCase().includes(lowerQuery)
		);
		count = rows.length;
	}

	const paged = rows.slice(start, stop + 1);
	const enriched = await attachUserInfo(paged);
	return {
		tokens: enriched,
		page: safePage,
		pageCount: Math.max(1, Math.ceil((count || 0) / safeResultsPerPage)),
		count: count || 0,
		resultsPerPage: safeResultsPerPage,
	};
}

async function attachUserInfo(rows) {
	if (!rows.length) {
		return rows;
	}

	const uids = rows.map(row => row.uid);
	const users = await user.getUsersFields(uids, ['uid', 'username', 'userslug']);
	return rows.map((row, index) => ({
		...row,
		username: users[index] && users[index].username ? users[index].username : '',
		userslug: users[index] && users[index].userslug ? users[index].userslug : '',
	}));
}

async function revoke(uid, token) {
	const meta = parseTokenMeta(await getTokenMetaObject(token), { token });
	if (!meta || meta.uid !== parseInt(uid, 10)) {
		throw new Error('skills-token-not-found');
	}

	await Promise.all([
		api.utils.tokens.delete(token),
		db.delete(`${TOKEN_META_PREFIX}${token}`),
	]);
}

async function roll(uid, token) {
	const metaObj = await getTokenMetaObject(token);
	const meta = parseTokenMeta(metaObj, { token });
	if (!meta || meta.uid !== parseInt(uid, 10)) {
		throw new Error('skills-token-not-found');
	}

	let expiresInDays = meta.expiresInDays;
	if (!expiresInDays && meta.expiresAt && meta.createdAt) {
		expiresInDays = Math.max(1, Math.ceil((meta.expiresAt - meta.createdAt) / (24 * 60 * 60 * 1000)));
	}
	const replacement = await create(uid, {
		name: meta.name,
		scopes: meta.scopes,
		expiresInDays,
	});

	await Promise.all([
		api.utils.tokens.delete(token),
		db.delete(`${TOKEN_META_PREFIX}${token}`),
	]);

	return replacement;
}

async function revokeAdmin(token) {
	const meta = parseTokenMeta(await getTokenMetaObject(token), { token });
	if (!meta) {
		throw new Error('skills-token-not-found');
	}

	await Promise.all([
		api.utils.tokens.delete(token),
		db.delete(`${TOKEN_META_PREFIX}${token}`),
	]);
}

async function getByToken(token) {
	const [tokenObj, metaObj] = await Promise.all([
		api.utils.tokens.get(token),
		getTokenMetaObject(token),
	]);
	if (!tokenObj) {
		return null;
	}
	return parseTokenMeta(metaObj, tokenObj);
}

async function recordUsage(token, { ip, externalActor } = {}) {
	const meta = await getTokenMetaObject(token);
	if (!meta || String(meta.type || '') !== 'skills') {
		return;
	}

	await db.setObject(`${TOKEN_META_PREFIX}${token}`, {
		lastSeenIp: String(ip || '').trim().slice(0, 128),
		lastExternalUserId: String(externalActor && externalActor.externalUserId || '').trim().slice(0, 128),
		lastExternalUserName: String(externalActor && externalActor.externalUserName || '').trim().slice(0, 128),
	});
}

module.exports = {
	create,
	list,
	listAll,
	revoke,
	roll,
	revokeAdmin,
	getByToken,
	recordUsage,
	normalizeScopes,
	sanitizeName,
	normalizeExpiresInDays,
};

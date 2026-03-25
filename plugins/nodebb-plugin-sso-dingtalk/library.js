'use strict';

const util = require('util');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const passport = require.main.require('passport');
const nconf = require.main.require('nconf');
const winston = require.main.require('winston');
const validator = require.main.require('validator');
const user = require.main.require('./src/user');
const db = require.main.require('./src/database');
const plugins = require.main.require('./src/plugins');
const authenticationController = require.main.require('./src/controllers/authentication');

const DINGTALK_AUTH_URL = 'https://login.dingtalk.com/oauth2/auth';
const DINGTALK_TOKEN_URL = 'https://api.dingtalk.com/v1.0/oauth2/userAccessToken';
const DINGTALK_USERINFO_URL = 'https://api.dingtalk.com/v1.0/contact/users/me';
const DINGTALK_USER_SEARCH_URL = 'https://api.dingtalk.com/v1.0/contact/users/search';
const DINGTALK_USER_DETAIL_URL = 'https://oapi.dingtalk.com/topapi/v2/user/get';
const HTTP_TIMEOUT_MS = 10000;

loadDotEnvIfNeeded();

// 后台开通「邮箱等个人信息」(fieldEmail) 后，仍须在授权 URL 的 scope 中声明委托权限，
// 否则 userAccessToken 只能拿到最小用户信息（无 email）。参见钉钉百科「浏览器内获取用户委托的访问凭证」。
// 可通过环境变量 DINGTALK_OAUTH_SCOPE 覆盖（空格分隔，与官方文档一致）。
const DINGTALK_SCOPE = process.env.DINGTALK_OAUTH_SCOPE || 'openid corpid Contact.User.Read Contact.User.email';

const CLIENT_ID = process.env.DINGTALK_CLIENT_ID;
const CLIENT_SECRET = process.env.DINGTALK_CLIENT_SECRET;
const DB_KEY = 'dingtalk:openid2uid';

function loadDotEnvIfNeeded() {
	if (process.env.DINGTALK_CLIENT_ID && process.env.DINGTALK_CLIENT_SECRET) {
		return;
	}

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
		winston.warn(`[sso-dingtalk] Failed to load .env: ${err.message}`);
	}
}

async function syncAvatarForExistingUser(uid, profile) {
	if (!profile.avatarUrl) {
		return;
	}

	const userData = await user.getUserFields(uid, ['uploadedpicture', 'picture']);
	const hasCustomUploadedAvatar = Boolean(
		userData.uploadedpicture &&
		userData.uploadedpicture.startsWith(`${nconf.get('relative_path')}/assets/uploads/`)
	);

	if (hasCustomUploadedAvatar) {
		winston.verbose(`[sso-dingtalk] Preserve custom uploaded avatar for uid ${uid}`);
		return;
	}

	if (!userData.picture) {
		await user.setUserField(uid, 'picture', profile.avatarUrl);
	}

	if (!userData.uploadedpicture) {
		await user.setUserField(uid, 'uploadedpicture', profile.avatarUrl);
	}
}

async function assertAndBindDingtalkId(dingtalkId, uid) {
	const existingUidRaw = await db.getObjectField(DB_KEY, dingtalkId);
	const existingUid = existingUidRaw ? parseInt(existingUidRaw, 10) : 0;

	// Never rebind an existing DingTalk identity to a different local user.
	if (existingUid > 0 && existingUid !== uid) {
		throw new Error('DingTalk account already linked to another user');
	}

	if (!existingUid) {
		await db.setObjectField(DB_KEY, dingtalkId, uid);
	}
}

// --- HTTP helpers ---

function postJson(url, body) {
	return postJsonWithHeaders(url, body, {});
}

function postJsonWithHeaders(url, body, extraHeaders) {
	return new Promise((resolve, reject) => {
		const payload = JSON.stringify(body);
		const parsed = new URL(url);
		const options = {
			hostname: parsed.hostname,
			path: parsed.pathname + (parsed.search || ''),
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': Buffer.byteLength(payload),
				...(extraHeaders || {}),
			},
		};
		const req = https.request(options, (res) => {
			let data = '';
			res.on('data', chunk => { data += chunk; });
			res.on('end', () => {
				try {
					const json = JSON.parse(data);
					if (res.statusCode >= 400) {
						reject(new Error(`DingTalk API error ${res.statusCode}`));
					} else {
						resolve(json);
					}
				} catch (e) {
					reject(new Error('Invalid JSON from DingTalk'));
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

function getJson(url, headers) {
	return new Promise((resolve, reject) => {
		const parsed = new URL(url);
		const options = {
			hostname: parsed.hostname,
			path: parsed.pathname + (parsed.search || ''),
			method: 'GET',
			headers: headers || {},
		};
		const req = https.request(options, (res) => {
			let data = '';
			res.on('data', chunk => { data += chunk; });
			res.on('end', () => {
				try {
					const json = JSON.parse(data);
					if (res.statusCode >= 400) {
						reject(new Error(`DingTalk API error ${res.statusCode}`));
					} else {
						resolve(json);
					}
				} catch (e) {
					reject(new Error('Invalid JSON from DingTalk'));
				}
			});
		});
		req.setTimeout(HTTP_TIMEOUT_MS, () => {
			req.destroy(new Error('DingTalk API request timeout'));
		});
		req.on('error', reject);
		req.end();
	});
}

// --- DingTalk Passport Strategy ---

function DingTalkStrategy(options, verify) {
	passport.Strategy.call(this);
	this.name = 'dingtalk';
	this._options = options;
	this._verify = verify;
}

util.inherits(DingTalkStrategy, passport.Strategy);

DingTalkStrategy.prototype.authenticate = function (req, options) {
	const opts = Object.assign({}, this._options, options);
	// DingTalk returns `authCode` (not `code`) in the callback query string
	const authCode = req.query.authCode || req.query.code;

	if (!authCode) {
		// Initiate authorization 鈥?redirect to DingTalk login page
		const params = new URLSearchParams({
			response_type: 'code',
			client_id: opts.clientId,
			redirect_uri: opts.callbackURL,
			scope: opts.scope || DINGTALK_SCOPE,
			prompt: 'consent',
		});
		if (opts.state) {
			params.set('state', opts.state);
		}
		return this.redirect(`${DINGTALK_AUTH_URL}?${params.toString()}`);
	}

	const self = this;

	postJson(DINGTALK_TOKEN_URL, {
		clientId: opts.clientId,
		clientSecret: opts.clientSecret,
		code: authCode,
		grantType: 'authorization_code',
	})
		.then((tokenData) => {
			const accessToken = tokenData.accessToken;
			if (!accessToken) {
				throw new Error('No accessToken in response');
			}
			return getJson(DINGTALK_USERINFO_URL, {
				'x-acs-dingtalk-access-token': accessToken,
			}).then(profile => ({ accessToken, profile }));
		})
		.then(({ accessToken, profile }) => {
			self._verify(req, accessToken, profile, (err, user, info) => {
				if (err) { return self.error(err); }
				if (!user) { return self.fail(info || {}); }
				self.success(user);
			});
		})
		.catch(err => self.error(err));
};

// --- Plugin exports ---

const DingTalkPlugin = module.exports;

DingTalkPlugin.init = async function (params) {
	// No admin routes needed for this simple implementation
	winston.verbose('[sso-dingtalk] Plugin initialized');
};

DingTalkPlugin.customizeComposerFormatting = async function (payload) {
	if (!payload || !Array.isArray(payload.options)) {
		return payload;
	}

	payload.options = payload.options.map((option) => {
		if (option && option.name === 'picture-o') {
			return {
				...option,
				name: 'picture',
				title: '[[modules:composer.upload-picture]]',
			};
		}
		return option;
	});

	return payload;
};

DingTalkPlugin.getStrategy = async function (strategies) {
	const callbackURL = `${nconf.get('url')}/auth/dingtalk/callback`;

	winston.info(`[sso-dingtalk] OAuth authorize scope: ${DINGTALK_SCOPE}`);

	passport.use(new DingTalkStrategy(
		{
			clientId: CLIENT_ID,
			clientSecret: CLIENT_SECRET,
			callbackURL: callbackURL,
			scope: DINGTALK_SCOPE,
		},
		async (req, accessToken, profile, done) => {
			try {
				if (!CLIENT_ID || !CLIENT_SECRET) {
					return done(new Error('DingTalk app credentials not configured'));
				}
				// profile fields: openId, unionId, nick, avatarUrl, mobile, email
				// Use unionId as the stable unique identifier (consistent across all DingTalk apps)
				// Fall back to openId only if unionId is not available
				const dingtalkId = profile.unionId || profile.openId;
				if (!dingtalkId) {
					return done(new Error('DingTalk did not return a unionId or openId'));
				}

				// Check if this DingTalk account is already linked to a NodeBB user
				let uid = await db.getObjectField(DB_KEY, dingtalkId);
				uid = uid ? parseInt(uid, 10) : null;

				if (uid && uid > 0) {
					logDingTalkUserinfoDiagnostics(profile, {
						flow: 'existing-user',
						uid,
						dingtalkIdTail: dingtalkId.slice(-4),
					});
					await user.setUserField(uid, 'dingtalk:sso', 1);
					await syncEmailPreservingExisting(uid, profile, accessToken);
					await syncAvatarForExistingUser(uid, profile);
					return done(null, { uid });
				}

				// If already logged in, link the DingTalk account to the current NodeBB user
				if (req.user && req.user.uid && parseInt(req.user.uid, 10) > 0) {
					uid = parseInt(req.user.uid, 10);
					logDingTalkUserinfoDiagnostics(profile, {
						flow: 'link-session',
						uid,
						dingtalkIdTail: dingtalkId.slice(-4),
					});
					await assertAndBindDingtalkId(dingtalkId, uid);
					await user.setUserField(uid, 'dingtalk:sso', 1);
					await syncEmailPreservingExisting(uid, profile, accessToken);
					return done(null, { uid });
				}

				// New user 鈥?build registration data and create account
				const username = cleanUsername(profile.nick || `dingtalk_${dingtalkId.slice(-6)}`);
				const resolvedEmail = await resolveProfileEmail(accessToken, profile);
				const userData = {
					username: username,
					fullname: profile.nick || '',
					email: resolvedEmail,
					picture: profile.avatarUrl || '',
					joindate: Date.now(),
				};

				logDingTalkUserinfoDiagnostics(profile, {
					flow: 'new-user',
					uid: null,
					dingtalkIdTail: dingtalkId.slice(-4),
					newUserHasEmailField: Boolean(userData.email),
				});

				// Remove empty email so NodeBB prompts for it via interstitial if configured
				if (!userData.email) {
					delete userData.email;
					winston.info('[sso-dingtalk] New user: no email from DingTalk userinfo; NodeBB may send verification after user supplies email');
				}

				const newUid = await createUser(userData);
				await assertAndBindDingtalkId(dingtalkId, newUid);
				await user.setUserField(newUid, 'dingtalk:sso', 1);

				if (profile.avatarUrl) {
					await user.setUserField(newUid, 'uploadedpicture', profile.avatarUrl);
					await user.setUserField(newUid, 'picture', profile.avatarUrl);
				}

				// Auto-confirm the email provided by DingTalk SSO
				if (userData.email) {
					await user.setUserField(newUid, 'email:confirmed', 1);
					await db.sortedSetRemove('users:notvalidated', newUid);
				}

				done(null, { uid: newUid });
			} catch (err) {
				winston.error(`[sso-dingtalk] verify error: ${err.message}`);
				done(err);
			}
		}
	));

	strategies.push({
		name: 'dingtalk',
		url: '/auth/dingtalk',
		callbackURL: '/auth/dingtalk/callback',
		icons: {
			normal: 'fa-comments',
		},
		labels: {
			login: '[[login:dingtalk]]',
		},
		color: '#00B0B0',
		scope: DINGTALK_SCOPE,
		prompt: 'consent',
		checkState: true,
		successUrl: '/',
		failureUrl: '/login',
	});

	if (!CLIENT_ID || !CLIENT_SECRET) {
		winston.error('[sso-dingtalk] Missing required env vars: DINGTALK_CLIENT_ID / DINGTALK_CLIENT_SECRET');
	}

	return strategies;
};

DingTalkPlugin.loginOverride = async function (data) {
	// Not overriding local login 鈥?pass through
	return data;
};

DingTalkPlugin.addInterstitial = async function (data) {
	// No custom interstitials needed; NodeBB handles email prompt natively
	return data;
};

DingTalkPlugin.deleteUserData = async function (data) {
	try {
		const { uid } = data;
		// Remove all dingtalkId (unionId/openId) entries that map to this uid
		const mapping = await db.getObject(DB_KEY);
		if (mapping) {
			const keysToRemove = Object.keys(mapping).filter(k => parseInt(mapping[k], 10) === uid);
			await Promise.all(keysToRemove.map(k => db.deleteObjectField(DB_KEY, k)));
		}
	} catch (err) {
		winston.error(`[sso-dingtalk] deleteUserData error: ${err.message}`);
	}
};

// --- Helpers ---

async function createUser(userData) {
	const username = await ensureUniqueUsername(userData.username);
	return user.create({ ...userData, username });
}

async function ensureUniqueUsername(username) {
	const exists = await user.existsBySlug(user.utils ? user.utils.slugify(username) : username.toLowerCase());
	if (!exists) {
		return username;
	}
	// Append cryptographically strong random suffix to avoid predictable collisions
	return `${username}_${crypto.randomBytes(3).toString('hex')}`;
}

function cleanUsername(name) {
	// NodeBB usernames: letters, numbers, spaces, hyphens, underscores, dots, @
	return name.replace(/[^\w\s\-@.]/gu, '').trim().slice(0, 30) || 'dingtalk_user';
}

function getProfileEmail(profile) {
	if (!profile) {
		return '';
	}

	const candidates = [profile.email, profile.orgEmail, profile.workEmail];
	for (const value of candidates) {
		if (typeof value === 'string' && value.trim()) {
			const email = value.trim().toLowerCase();
			if (email.length <= 254 && validator.isEmail(email)) {
				return email;
			}
		}
	}

	return '';
}

async function searchDingtalkUserIdsByNick(accessToken, nick) {
	if (!accessToken || typeof nick !== 'string' || !nick.trim()) {
		return [];
	}

	const response = await postJsonWithHeaders(
		DINGTALK_USER_SEARCH_URL,
		{
			queryWord: nick.trim(),
			offset: 0,
			size: 10,
			fullMatchField: 1,
		},
		{ 'x-acs-dingtalk-access-token': accessToken }
	);

	const totalCount = parseInt(response && response.totalCount, 10) || 0;
	if (!totalCount || !Array.isArray(response.list)) {
		return [];
	}

	return response.list.map(value => String(value)).filter(Boolean);
}

async function getDingtalkUserByUserId(accessToken, userId) {
	if (!accessToken || !userId) {
		return null;
	}

	const response = await postJson(
		`${DINGTALK_USER_DETAIL_URL}?access_token=${encodeURIComponent(accessToken)}`,
		{ userid: userId }
	);

	if (!response || String(response.errcode) !== '0' || !response.result) {
		return null;
	}

	return response.result;
}

async function getOrgEmailFromNickAndUnionId(accessToken, profile) {
	if (!profile || typeof profile !== 'object') {
		return '';
	}

	const nick = typeof profile.nick === 'string' ? profile.nick.trim() : '';
	const targetUnionId = typeof profile.unionId === 'string' ? profile.unionId.trim() : '';
	if (!nick || !targetUnionId) {
		return '';
	}

	let userIds = [];
	try {
		userIds = await searchDingtalkUserIdsByNick(accessToken, nick);
	} catch (err) {
		winston.warn(`[sso-dingtalk] /contact/users/search failed: ${err.message}`);
		return '';
	}

	if (!userIds.length) {
		return '';
	}

	for (const userId of userIds) {
		try {
			const result = await getDingtalkUserByUserId(accessToken, userId);
			if (!result || String(result.unionid || '').trim() !== targetUnionId) {
				continue;
			}

			const candidates = [result.org_email, result.email];
			for (const value of candidates) {
				const email = String(value || '').trim().toLowerCase();
				if (email && email.length <= 254 && validator.isEmail(email)) {
					return email;
				}
			}
			return '';
		} catch (err) {
			winston.warn(`[sso-dingtalk] /v2/user/get failed for userid ${userId}: ${err.message}`);
		}
	}

	return '';
}

async function resolveProfileEmail(accessToken, profile) {
	const direct = getProfileEmail(profile);
	if (direct) {
		return direct;
	}
	return await getOrgEmailFromNickAndUnionId(accessToken, profile);
}

/**
 * One-line diagnostics for DingTalk /v1.0/contact/users/me — no raw email values.
 */
function logDingTalkUserinfoDiagnostics(profile, meta) {
	if (!profile || typeof profile !== 'object') {
		winston.warn('[sso-dingtalk] userinfo diagnostics: profile missing or not an object');
		return;
	}

	const keys = Object.keys(profile).sort();
	const emailCandidateKeys = ['email', 'orgEmail', 'workEmail'];
	const candidateSummary = emailCandidateKeys.map((key) => {
		const v = profile[key];
		if (typeof v !== 'string' || !v.trim()) {
			return `${key}:empty`;
		}
		const t = v.trim().toLowerCase();
		const ok = t.length <= 254 && validator.isEmail(t);
		return `${key}:len=${t.length},emailFormatOk=${ok}`;
	}).join('; ');

	const resolved = Boolean(getProfileEmail(profile));

	winston.info(`[sso-dingtalk] userinfo diagnostics ${JSON.stringify({
		...meta,
		profileKeyCount: keys.length,
		profileKeys: keys,
		emailCandidates: candidateSummary,
		resolvedUsableEmail: resolved,
	})}`);
}

async function syncEmailPreservingExisting(uid, profile, accessToken) {
	const [currentEmail, profileEmail] = await Promise.all([
		user.getUserField(uid, 'email'),
		Promise.resolve(resolveProfileEmail(accessToken, profile)),
	]);

	if (currentEmail) {
		if (!profileEmail) {
			winston.verbose(`[sso-dingtalk] Preserving existing email for uid ${uid}: DingTalk returned empty email`);
		}
		return;
	}

	if (!profileEmail) {
		winston.info(`[sso-dingtalk] uid ${uid} has no stored email and DingTalk userinfo had no usable email; user may need NodeBB email verification flow`);
		return;
	}

	winston.info(`[sso-dingtalk] Setting email from DingTalk for uid ${uid} (account had no email)`);
	await user.setUserField(uid, 'email', profileEmail);
	await user.setUserField(uid, 'email:confirmed', 1);
	await db.sortedSetRemove('users:notvalidated', uid);
}




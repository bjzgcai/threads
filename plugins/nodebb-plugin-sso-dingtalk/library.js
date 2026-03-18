'use strict';

const util = require('util');
const https = require('https');
const fs = require('fs');
const path = require('path');
const passport = require.main.require('passport');
const nconf = require.main.require('nconf');
const winston = require.main.require('winston');
const user = require.main.require('./src/user');
const db = require.main.require('./src/database');
const plugins = require.main.require('./src/plugins');
const authenticationController = require.main.require('./src/controllers/authentication');

const DINGTALK_AUTH_URL = 'https://login.dingtalk.com/oauth2/auth';
const DINGTALK_TOKEN_URL = 'https://api.dingtalk.com/v1.0/oauth2/userAccessToken';
const DINGTALK_USERINFO_URL = 'https://api.dingtalk.com/v1.0/contact/users/me';

loadDotEnvIfNeeded();

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

// --- HTTP helpers ---

function postJson(url, body) {
	return new Promise((resolve, reject) => {
		const payload = JSON.stringify(body);
		const parsed = new URL(url);
		const options = {
			hostname: parsed.hostname,
			path: parsed.pathname,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': Buffer.byteLength(payload),
			},
		};
		const req = https.request(options, (res) => {
			let data = '';
			res.on('data', chunk => { data += chunk; });
			res.on('end', () => {
				try {
					const json = JSON.parse(data);
					if (res.statusCode >= 400) {
						reject(new Error(`DingTalk API error ${res.statusCode}: ${JSON.stringify(json)}`));
					} else {
						resolve(json);
					}
				} catch (e) {
					reject(new Error(`Invalid JSON from DingTalk: ${data}`));
				}
			});
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
						reject(new Error(`DingTalk API error ${res.statusCode}: ${JSON.stringify(json)}`));
					} else {
						resolve(json);
					}
				} catch (e) {
					reject(new Error(`Invalid JSON from DingTalk: ${data}`));
				}
			});
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
		// Initiate authorization — redirect to DingTalk login page
		const params = new URLSearchParams({
			response_type: 'code',
			client_id: opts.clientId,
			redirect_uri: opts.callbackURL,
			scope: opts.scope || 'openid',
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
				throw new Error(`No accessToken in response: ${JSON.stringify(tokenData)}`);
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

DingTalkPlugin.getStrategy = async function (strategies) {
	const callbackURL = `${nconf.get('url')}/auth/dingtalk/callback`;

	passport.use(new DingTalkStrategy(
		{
			clientId: CLIENT_ID,
			clientSecret: CLIENT_SECRET,
			callbackURL: callbackURL,
			scope: 'openid',
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
					// Existing user — update picture if available
					if (profile.avatarUrl) {
						await user.setUserField(uid, 'uploadedpicture', profile.avatarUrl);
						await user.setUserField(uid, 'picture', profile.avatarUrl);
					}
					return done(null, { uid });
				}

				// If already logged in, link the DingTalk account to the current NodeBB user
				if (req.user && req.user.uid && parseInt(req.user.uid, 10) > 0) {
					uid = parseInt(req.user.uid, 10);
					await db.setObjectField(DB_KEY, dingtalkId, uid);
					return done(null, { uid });
				}

				// New user — build registration data and create account
				const username = cleanUsername(profile.nick || `dingtalk_${dingtalkId.slice(-6)}`);
				const userData = {
					username: username,
					fullname: profile.nick || '',
					email: profile.email || '',
					picture: profile.avatarUrl || '',
					joindate: Date.now(),
				};

				// Remove empty email so NodeBB prompts for it via interstitial if configured
				if (!userData.email) {
					delete userData.email;
				}

				const newUid = await createUser(userData);
				await db.setObjectField(DB_KEY, dingtalkId, newUid);

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
		scope: 'openid',
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
	// Not overriding local login — pass through
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
	// Append random suffix to avoid collision
	return `${username}_${Math.random().toString(36).slice(2, 6)}`;
}

function cleanUsername(name) {
	// NodeBB usernames: letters, numbers, spaces, hyphens, underscores, dots, @
	return name.replace(/[^\w\s\-@.]/gu, '').trim().slice(0, 30) || 'dingtalk_user';
}

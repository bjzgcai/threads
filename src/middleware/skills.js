'use strict';

const crypto = require('crypto');
const https = require('https');
const nconf = require('nconf');
const winston = require('winston');

const cacheCreate = require('../cache/lru');
const db = require('../database');
const helpers = require('../controllers/helpers');
const skillTokens = require('../skills/tokens');

const middleware = module.exports;

const nonceTtlSeconds = parseInt(process.env.SKILLS_NONCE_TTL_SECONDS || '300', 10);
const nonceCache = cacheCreate({
	name: 'skills-nonce',
	ttl: Math.max(1, nonceTtlSeconds) * 1000,
	max: 10000,
});

const rateLimitStore = new Map();
let scopePolicyCache = { raw: null, parsed: {} };
const DINGTALK_USERINFO_URL = 'https://api.dingtalk.com/v1.0/contact/users/me';

function parseList(input) {
	return String(input || '')
		.split(',')
		.map(item => item.trim())
		.filter(Boolean);
}

function getClientIp(req) {
	const forwarded = (req.get('x-forwarded-for') || '').split(',')[0].trim();
	const realIp = (req.get('x-real-ip') || '').trim();
	const rawIp = forwarded || realIp || req.ip || req.socket?.remoteAddress || '';
	return String(rawIp).replace(/^::ffff:/, '');
}

function stableStringify(value) {
	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(',')}]`;
	}
	if (value && typeof value === 'object') {
		const keys = Object.keys(value).sort();
		return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
	}
	return JSON.stringify(value);
}

function buildSigningPayload(req, timestamp, nonce) {
	const body = stableStringify(req.body || {});
	return `${timestamp}.${nonce}.${req.method.toUpperCase()}.${req.path}.${body}`;
}

function safeCompare(a, b) {
	const aa = Buffer.from(String(a || ''), 'utf8');
	const bb = Buffer.from(String(b || ''), 'utf8');
	if (aa.length !== bb.length) {
		return false;
	}
	return crypto.timingSafeEqual(aa, bb);
}

middleware.requireEnabled = async (req, res, next) => {
	const enabled = String(process.env.SKILLS_GATEWAY_ENABLED || 'false').toLowerCase() === 'true';
	if (!enabled) {
		return helpers.formatApiResponse(403, res, new Error('skills-gateway-disabled'));
	}
	next();
};

middleware.requireBearerToken = async (req, res, next) => {
	const token = getTokenFromAuthHeader(req);
	if (!token) {
		return helpers.formatApiResponse(401, res, new Error('skills-bearer-token-required'));
	}
	next();
};

middleware.requireIssuedSkillToken = async (req, res, next) => {
	const required = String(process.env.SKILLS_REQUIRE_ISSUED_TOKENS || 'true').toLowerCase() === 'true';
	if (!required) {
		return next();
	}

	const token = getTokenFromAuthHeader(req);
	if (!token) {
		return helpers.formatApiResponse(401, res, new Error('skills-bearer-token-required'));
	}

	const tokenMeta = await skillTokens.getByToken(token);
	if (!tokenMeta || tokenMeta.uid !== parseInt(req.uid, 10)) {
		return helpers.formatApiResponse(403, res, new Error('skills-issued-token-required'));
	}
	if (tokenMeta.expired) {
		return helpers.formatApiResponse(403, res, new Error('skills-issued-token-expired'));
	}

	req.skillTokenMeta = tokenMeta;
	next();
};

function parseScopes(value) {
	if (!value) {
		return [];
	}
	return String(value)
		.split(',')
		.map(item => item.trim())
		.filter(Boolean);
}

function getTokenFromAuthHeader(req) {
	const authHeader = req.get('authorization') || '';
	const parts = authHeader.split(' ');
	if (parts.length !== 2 || !/^Bearer$/i.test(parts[0])) {
		return '';
	}
	return parts[1].trim();
}

function normalizeExternalActor(req) {
	const bodyActor = req.body && req.body.actor && typeof req.body.actor === 'object' ? req.body.actor : {};
	const externalUserId = String(req.get('x-external-user-id') || bodyActor.externalUserId || '').trim();
	const externalUserName = String(req.get('x-external-user-name') || bodyActor.externalUserName || '').trim();
	const externalSessionId = String(req.get('x-external-session-id') || bodyActor.externalSessionId || '').trim();

	return {
		externalUserId: externalUserId.slice(0, 128),
		externalUserName: externalUserName.slice(0, 128),
		externalSessionId: externalSessionId.slice(0, 128),
	};
}

function getDingtalkAccessToken(req) {
	return String(req.get('x-dingtalk-access-token') || '').trim();
}

function getAllowedDingtalkIds() {
	return new Set(parseList(process.env.SKILLS_DINGTALK_ALLOWED_IDS));
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
				} catch (err) {
					reject(new Error('Invalid JSON from DingTalk'));
				}
			});
		});
		req.setTimeout(10000, () => {
			req.destroy(new Error('DingTalk API request timeout'));
		});
		req.on('error', reject);
		req.end();
	});
}

function getTokenHash(token) {
	return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function getScopePolicy() {
	const raw = process.env.SKILLS_SCOPE_POLICY_JSON || '';
	if (scopePolicyCache.raw === raw) {
		return scopePolicyCache.parsed;
	}

	let parsed = {};
	if (raw) {
		try {
			const value = JSON.parse(raw);
			if (value && typeof value === 'object') {
				parsed = value;
			}
		} catch (err) {
			parsed = {};
		}
	}

	scopePolicyCache = { raw, parsed };
	return parsed;
}

middleware.allowlistedIp = async (req, res, next) => {
	const configured = parseList(process.env.SKILLS_ALLOWED_IPS || process.env.NODEBB_BEARER_ALLOWED_IPS);
	if (!configured.length) {
		return next();
	}

	const clientIp = getClientIp(req);
	if (!configured.includes(clientIp)) {
		return helpers.formatApiResponse(403, res, new Error('skills-ip-not-allowed'));
	}

	next();
};

middleware.verifySignature = async (req, res, next) => {
	const secret = process.env.SKILLS_SIGNING_SECRET;
	if (!secret) {
		return next();
	}

	const timestamp = req.get('x-skills-timestamp');
	const nonce = req.get('x-skills-nonce');
	const signature = req.get('x-skills-signature');
	if (!timestamp || !nonce || !signature) {
		return helpers.formatApiResponse(401, res, new Error('skills-signature-required'));
	}

	const skewSeconds = Math.max(1, parseInt(process.env.SKILLS_SIGNATURE_TTL_SECONDS || '300', 10));
	const now = Math.floor(Date.now() / 1000);
	const ts = parseInt(timestamp, 10);
	if (!Number.isFinite(ts) || Math.abs(now - ts) > skewSeconds) {
		return helpers.formatApiResponse(401, res, new Error('skills-signature-expired'));
	}

	if (nonceCache.has(nonce)) {
		return helpers.formatApiResponse(401, res, new Error('skills-signature-replayed'));
	}

	const payload = buildSigningPayload(req, timestamp, nonce);
	const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
	if (!safeCompare(expected, signature)) {
		return helpers.formatApiResponse(401, res, new Error('skills-signature-invalid'));
	}

	nonceCache.set(nonce, 1);
	next();
};

middleware.requireSkillScopes = (manifest) => async (req, res, next) => {
	const enforceScopes = String(process.env.SKILLS_ENFORCE_SCOPES || 'false').toLowerCase() === 'true';
	if (!enforceScopes) {
		return next();
	}

	const skillName = req.params.skill;
	const skillDef = manifest && manifest.skills ? manifest.skills[skillName] : null;
	if (!skillDef) {
		return helpers.formatApiResponse(404, res, new Error('skill-not-found'));
	}

	const requiredScopes = Array.isArray(skillDef.requiredScopes) ? skillDef.requiredScopes : [];
	if (!requiredScopes.length) {
		return next();
	}

	let scopes = Array.isArray(req.skillTokenMeta && req.skillTokenMeta.scopes) ? req.skillTokenMeta.scopes : [];
	if (!scopes.length) {
		const token = getTokenFromAuthHeader(req);
		if (!token) {
			return helpers.formatApiResponse(401, res, new Error('skills-missing-bearer-token'));
		}

		const tokenHash = getTokenHash(token);
		const policy = getScopePolicy();
		scopes = parseScopes(policy[tokenHash]);
	}
	const allowed = requiredScopes.every(scope => scopes.includes(scope));
	if (!allowed) {
		return helpers.formatApiResponse(403, res, new Error('skills-scope-not-allowed'));
	}

	next();
};

middleware.extractExternalActor = async (req, res, next) => {
	req.externalActor = normalizeExternalActor(req);
	next();
};

middleware.requireDingtalkAuth = async (req, res, next) => {
	const required = String(process.env.SKILLS_REQUIRE_DINGTALK_AUTH || 'false').toLowerCase() === 'true';
	if (!required) {
		return next();
	}

	const accessToken = getDingtalkAccessToken(req);
	if (!accessToken) {
		return helpers.formatApiResponse(401, res, new Error('skills-dingtalk-access-token-required'));
	}

	let profile;
	try {
		profile = await getJson(DINGTALK_USERINFO_URL, {
			'x-acs-dingtalk-access-token': accessToken,
		});
	} catch (err) {
		return helpers.formatApiResponse(401, res, new Error('skills-dingtalk-auth-invalid'));
	}

	const dingtalkId = String(profile.unionId || profile.openId || '').trim();
	if (!dingtalkId) {
		return helpers.formatApiResponse(401, res, new Error('skills-dingtalk-id-missing'));
	}

	const allowedIds = getAllowedDingtalkIds();
	if (allowedIds.size && !allowedIds.has(dingtalkId)) {
		return helpers.formatApiResponse(403, res, new Error('skills-dingtalk-user-not-allowed'));
	}

	const linkedUidRaw = await db.getObjectField('dingtalk:openid2uid', dingtalkId);
	const linkedUid = linkedUidRaw ? parseInt(linkedUidRaw, 10) : 0;
	if (linkedUid <= 0) {
		return helpers.formatApiResponse(403, res, new Error('skills-dingtalk-user-not-linked'));
	}

	req.skillActorUid = linkedUid;
	req.externalActor = {
		...(req.externalActor || {}),
		externalUserId: dingtalkId,
		externalUserName: String(profile.nick || req.externalActor?.externalUserName || '').trim().slice(0, 128),
		externalSessionId: String(req.externalActor?.externalSessionId || '').trim().slice(0, 128),
	};
	req.dingtalkProfile = {
		unionId: String(profile.unionId || '').trim(),
		openId: String(profile.openId || '').trim(),
		nick: String(profile.nick || '').trim(),
	};

	next();
};

middleware.requireExternalActor = async (req, res, next) => {
	const required = String(process.env.SKILLS_REQUIRE_EXTERNAL_ACTOR || 'true').toLowerCase() === 'true';
	if (!required) {
		return next();
	}

	const actor = req.externalActor || normalizeExternalActor(req);
	if (!actor.externalUserId && req.skillTokenMeta) {
		req.externalActor = {
			...actor,
			externalUserId: `uid:${req.uid}`,
			externalUserName: req.skillTokenMeta.name || `uid:${req.uid}`,
		};
		return next();
	}

	if (!actor.externalUserId) {
		return helpers.formatApiResponse(400, res, new Error('skills-external-user-id-required'));
	}

	next();
};

middleware.auditSkillRequest = async (req, res, next) => {
	const startedAt = Date.now();
	res.on('finish', () => {
		const actor = req.externalActor || {};
		if (res.statusCode < 400 && req.skillTokenMeta && req.skillTokenMeta.token) {
			skillTokens.recordUsage(req.skillTokenMeta.token, {
				ip: getClientIp(req),
				externalActor: actor,
			}).catch(err => winston.warn(`[skills-audit] failed to record token usage: ${err.message}`));
		}
		winston.info(
			`[skills-audit] skill=${req.params.skill || 'unknown'} status=${res.statusCode} uid=${req.uid || 0} actorUid=${req.skillActorUid || req.uid || 0} externalUserId=${actor.externalUserId || '-'} externalUserName=${actor.externalUserName || '-'} externalSessionId=${actor.externalSessionId || '-'} ip=${getClientIp(req)} durationMs=${Date.now() - startedAt}`
		);
	});
	next();
};

middleware.rateLimit = async (req, res, next) => {
	const limit = Math.max(1, parseInt(process.env.SKILLS_RATE_LIMIT_PER_MINUTE || '60', 10));
	const windowMs = 60 * 1000;
	const authHeader = req.get('authorization') || '';
	const key = `${authHeader}:${req.params.skill || ''}`;

	const now = Date.now();
	const current = rateLimitStore.get(key);
	if (!current || current.resetAt <= now) {
		rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
		return next();
	}

	if (current.count >= limit) {
		res.set('Retry-After', String(Math.ceil((current.resetAt - now) / 1000)));
		return helpers.formatApiResponse(429, res, new Error('skills-rate-limit-exceeded'));
	}

	current.count += 1;
	rateLimitStore.set(key, current);
	next();
};

middleware.requireJson = async (req, res, next) => {
	if (!req.is('application/json')) {
		return helpers.formatApiResponse(400, res, new Error('skills-content-type-must-be-application-json'));
	}
	next();
};

middleware.enforceBodySize = async (req, res, next) => {
	const limit = Math.max(256, parseInt(process.env.SKILLS_MAX_BODY_BYTES || '65536', 10));
	const size = Buffer.byteLength(JSON.stringify(req.body || {}), 'utf8');
	if (size > limit) {
		return helpers.formatApiResponse(413, res, new Error('skills-payload-too-large'));
	}
	next();
};

middleware.getPublicConfig = () => ({
	enabled: String(process.env.SKILLS_GATEWAY_ENABLED || 'false').toLowerCase() === 'true',
	basePath: `${nconf.get('relative_path') || ''}/api/skills`,
});

'use strict';

const crypto = require('crypto');
const nconf = require('nconf');

const cacheCreate = require('../cache/lru');
const helpers = require('../controllers/helpers');

const middleware = module.exports;

const nonceTtlSeconds = parseInt(process.env.SKILLS_NONCE_TTL_SECONDS || '300', 10);
const nonceCache = cacheCreate({
	name: 'skills-nonce',
	ttl: Math.max(1, nonceTtlSeconds) * 1000,
	max: 10000,
});

const rateLimitStore = new Map();
let scopePolicyCache = { raw: null, parsed: {} };

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

	const token = getTokenFromAuthHeader(req);
	if (!token) {
		return helpers.formatApiResponse(401, res, new Error('skills-missing-bearer-token'));
	}

	const tokenHash = getTokenHash(token);
	const policy = getScopePolicy();
	const scopes = parseScopes(policy[tokenHash]);
	const allowed = requiredScopes.every(scope => scopes.includes(scope));
	if (!allowed) {
		return helpers.formatApiResponse(403, res, new Error('skills-scope-not-allowed'));
	}

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

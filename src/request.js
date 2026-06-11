'use strict';

const dns = require('dns').promises;
require('undici'); // keep this here, needed for SSRF (see `lookup()`)

const nconf = require('nconf');
const ipaddr = require('ipaddr.js');
const { CookieJar } = require('tough-cookie');
const fetchCookie = require('fetch-cookie').default;
const { version } = require('../package.json');

const plugins = require('./plugins');
const ttl = require('./cache/ttl');
const checkCache = ttl({
	name: 'request-check',
	max: 1000,
	ttl: 1000 * 60 * 60, // 1 hour
});
let allowList = new Set();
let initialized = false;

exports.jar = function () {
	return new CookieJar();
};

const userAgent = `NodeBB/${version.split('.').shift()}.x (${nconf.get('url')})`;

async function init() {
	if (initialized) {
		return;
	}

	allowList.add(nconf.get('url_parsed').host);
	const { allowed } = await plugins.hooks.fire('filter:request.init', { allowed: allowList });
	if (allowed instanceof Set) {
		allowList = allowed;
	}
	initialized = true;
}

/**
 * This method (alongside `check()`) guards against SSRF via DNS rebinding.
 *
 *  - `check()` does a DNS lookup and ensures that all returned IPs do not belong to a reserved IP address space
 *  - `lookup()` provides additional logic that uses the cached DNS result from `check()`
 *     instead of doing another lookup (which is where DNS rebinding comes into play.)
 *  - For whatever reason `undici` needs to be required so that lookup can be overwritten properly.
 */
function lookup(hostname, options, callback) {
	const cached = checkCache.get(hostname);
	if (!cached || !cached.ok) {
		process.nextTick(() => callback(new Error('lookup-failed')));
		return;
	}
	let { lookup } = cached;
	lookup = lookup && [...lookup];

	if (!lookup) {
		// trusted, do regular lookup
		dns.lookup(hostname, options).then((addresses) => {
			callback(null, addresses);
		});
		return;
	}

	// Lookup needs to behave asynchronously — https://github.com/nodejs/node/issues/28664
	process.nextTick(() => {
		if (options.all === true) {
			callback(null, lookup);
		} else {
			const { address, family } = lookup.shift();
			callback(null, address, family);
		}
	});
}

// Initialize fetch - somewhat hacky, but it's required for globalDispatcher to be available
async function call(url, method, { body, timeout, jar, ...config } = {}) {
	let urlObj = await validate(url);
	let { ok } = await check(urlObj);
	if (!ok) {
		throw new Error('[[error:reserved-ip-address]]');
	}

	let fetchImpl = fetch;
	if (jar) {
		fetchImpl = fetchCookie(fetch, jar);
	}
	const jsonTest = /application\/([a-z]+\+)?json/;
	const opts = {
		...config,
		method,
		headers: {
			'content-type': 'application/json',
			'user-agent': userAgent,
			...config.headers,
		},
	};
	if (timeout > 0) {
		opts.signal = AbortSignal.timeout(timeout);
	}

	if (body && ['POST', 'PUT', 'PATCH', 'DEL', 'DELETE'].includes(method)) {
		if (opts.headers['content-type'] && jsonTest.test(opts.headers['content-type'])) {
			opts.body = JSON.stringify(body);
		} else {
			opts.body = body;
		}
	}
	// Workaround for https://github.com/nodejs/undici/issues/1305
	if (global[Symbol.for('undici.globalDispatcher.1')] !== undefined) {
		class FetchAgent extends global[Symbol.for('undici.globalDispatcher.1')].constructor {
			dispatch(opts, handler) {
				delete opts.headers['sec-fetch-mode'];
				return super.dispatch(opts, handler);
			}
		}
		opts.dispatcher = new FetchAgent({
			connect: { lookup },
		});
	}

	opts.redirect = 'manual';
	let response = await fetchImpl(urlObj.href, opts);
	let redirects = 0;
	/* eslint-disable no-await-in-loop */
	while ([301, 302, 303, 307, 308].includes(response.status) && redirects < 10) {
		const location = response.headers.get('location');
		if (!location) {
			break;
		}
		urlObj = await validate(new URL(location, urlObj).href);
		({ ok } = await check(urlObj));
		if (!ok) {
			throw new Error('[[error:reserved-ip-address]]');
		}
		if (response.status === 303) {
			opts.method = 'GET';
			delete opts.body;
		}
		response = await fetchImpl(urlObj.href, opts);
		redirects += 1;
	}
	/* eslint-enable no-await-in-loop */
	if ([301, 302, 303, 307, 308].includes(response.status)) {
		throw new Error('[[error:too-many-redirects]]');
	}

	const { headers } = response;
	const contentType = headers.get('content-type');
	const isJSON = contentType && jsonTest.test(contentType);
	let respBody = await response.text();
	if (isJSON && respBody) {
		try {
			respBody = JSON.parse(respBody);
		} catch (err) {
			throw new Error('invalid json in response body', url);
		}
	}

	return {
		body: respBody,
		response: {
			ok: response.ok,
			status: response.status,
			statusCode: response.status,
			statusText: response.statusText,
			headers: Object.fromEntries(response.headers.entries()),
		},
	};
}

// Checks url to ensure it is not in reserved IP range (private, etc.)
async function validate(url) {
	const urlObj = new URL(url);
	if (!['http:', 'https:'].includes(urlObj.protocol)) {
		throw new Error('[[error:invalid-url]]');
	}
	return urlObj;
}

async function check(urlObj) {
	await init();

	const { hostname, host } = urlObj;
	const cached = checkCache.get(hostname);
	if (cached !== undefined) {
		return cached;
	}
	if (allowList.has(host)) {
		const payload = { ok: true };
		checkCache.set(host, payload);
		checkCache.set(hostname, payload);
		return payload;
	}

	const addresses = new Set();
	let lookup;
	if (ipaddr.isValid(hostname)) {
		addresses.add({ address: hostname });
	} else {
		lookup = await dns.lookup(hostname, { all: true });
		lookup.forEach(({ address, family }) => {
			addresses.add({ address, family });
		});
	}

	if (addresses.size < 1) {
		return { ok: false };
	}

	// Every IP address that the host resolves to should be a unicast address
	const ok = Array.from(addresses).every(({ address: ip }) => {
		const parsed = ipaddr.parse(ip);
		return parsed.range() === 'unicast';
	});

	const payload = { ok, lookup };
	checkCache.set(host, payload);
	return payload;
}

/*
const { body, response } = await request.get('someurl?foo=1&baz=2')
*/
exports.get = async (url, config) => call(url, 'GET', config);

exports.head = async (url, config) => call(url, 'HEAD', config);
exports.del = async (url, config) => call(url, 'DELETE', config);
exports.delete = exports.del;
exports.options = async (url, config) => call(url, 'OPTIONS', config);

/*
const { body, response } = await request.post('someurl', { body: { foo: 1, baz: 2}})
*/
exports.post = async (url, config) => call(url, 'POST', config);
exports.put = async (url, config) => call(url, 'PUT', config);
exports.patch = async (url, config) => call(url, 'PATCH', config);



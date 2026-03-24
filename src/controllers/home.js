'use strict';

const plugins = require('../plugins');
const meta = require('../meta');
const user = require('../user');
const topics = require('../topics');

const DANGEROUS_QUERY_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function adminHomePageRoute() {
	const route = ((meta.config.homePageRoute === 'custom' ? meta.config.homePageCustom : meta.config.homePageRoute) || 'categories').replace(/^\//, '');
	return route === 'categories' ? 'unread' : route;
}

async function getUserHomeRoute(uid) {
	const settings = await user.getSettings(uid);
	let route = adminHomePageRoute();

	if (settings.homePageRoute !== 'undefined' && settings.homePageRoute !== 'none') {
		route = (settings.homePageRoute || route).replace(/^\/+/, '');
	}

	return route;
}

function normalizeHomePathname(pathname) {
	if (typeof pathname !== 'string') {
		return 'unread';
	}

	const cleaned = pathname
		.replace(/^\/+/, '')
		.replace(/\/{2,}/g, '/')
		.trim();
	if (!cleaned || cleaned.includes('..') || !/^[a-zA-Z0-9/_-]+$/.test(cleaned)) {
		return 'unread';
	}

	return cleaned;
}

function toSafeQueryObject(searchParams) {
	const safe = Object.create(null);
	for (const [key, value] of searchParams.entries()) {
		if (!DANGEROUS_QUERY_KEYS.has(key)) {
			safe[key] = value;
		}
	}
	return safe;
}

async function rewrite(req, res, next) {
	if (req.path !== '/' && req.path !== '/api/' && req.path !== '/api') {
		return next();
	}
	let route = adminHomePageRoute();
	if (meta.config.allowUserHomePage) {
		route = await getUserHomeRoute(req.uid, next);
	}

	let parsedUrl;
	try {
		parsedUrl = new URL(route, 'http://localhost.com');
	} catch (err) {
		return next(err);
	}

	let pathname = normalizeHomePathname(parsedUrl.pathname);
	if (pathname === 'unread' && parseInt(req.uid, 10) > 0) {
		const unreadCount = await topics.getTotalUnread(req.uid, '');
		if (!unreadCount) {
			const recentData = await topics.getSortedTopics({
				uid: req.uid,
				start: 0,
				stop: 0,
				filter: '',
				term: 'alltime',
				sort: 'recent',
				query: req.query,
			});
			pathname = recentData.topicCount > 0 ? 'recent' : 'categories';
		}
	}
	const hook = `action:homepage.get:${pathname}`;
	if (!plugins.hooks.hasListeners(hook)) {
		req.url = req.path + (!req.path.endsWith('/') ? '/' : '') + pathname;
	} else {
		res.locals.homePageRoute = pathname;
	}
	req.query = Object.assign(toSafeQueryObject(parsedUrl.searchParams), req.query);

	next();
}

exports.rewrite = rewrite;

function pluginHook(req, res, next) {
	const hook = `action:homepage.get:${res.locals.homePageRoute}`;

	plugins.hooks.fire(hook, {
		req: req,
		res: res,
		next: next,
	});
}

exports.pluginHook = pluginHook;

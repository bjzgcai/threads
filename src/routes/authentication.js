'use strict';

const passport = require('passport');
const passportLocal = require('passport-local').Strategy;
const BearerStrategy = require('passport-http-bearer').Strategy;
const winston = require('winston');

const controllers = require('../controllers');
const helpers = require('../controllers/helpers');
const plugins = require('../plugins');
const api = require('../api');
const { generateToken } = require('../middleware/csrf');

let loginStrategies = [];
const ALLOWED_AUTH_METHODS = new Set(['get', 'post']);

const Auth = module.exports;

Auth.initialize = function (app, middleware) {
	app.use(passport.initialize());
	app.use(passport.session());
	app.use((req, res, next) => {
		Auth.setAuthVars(req, res);
		next();
	});

	Auth.app = app;
	Auth.middleware = middleware;
};

Auth.setAuthVars = function setAuthVars(req) {
	const isSpider = req.isSpider();
	req.loggedIn = !isSpider && !!req.user;
	if (req.user) {
		req.uid = parseInt(req.user.uid, 10);
	} else if (isSpider) {
		req.uid = -1;
	} else {
		req.uid = 0;
	}
};

Auth.getLoginStrategies = function () {
	return loginStrategies;
};

Auth.verifyToken = async function (token, done) {
	const tokenObj = await api.utils.tokens.get(token);
	const uid = tokenObj ? tokenObj.uid : undefined;

	if (uid !== undefined) {
		if (parseInt(uid, 10) > 0) {
			done(null, {
				uid: uid,
			});
		} else {
			done(null, {
				master: true,
			});
		}
	} else {
		done(false);
	}
};

Auth.reloadRoutes = async function (params) {
	loginStrategies.length = 0;
	const { router } = params;

	// Local Logins
	if (plugins.hooks.hasListeners('action:auth.overrideLogin')) {
		winston.warn('[authentication] Login override detected, skipping local login strategy.');
		plugins.hooks.fire('action:auth.overrideLogin');
	} else {
		passport.use(new passportLocal({ passReqToCallback: true }, controllers.authentication.localLogin));
	}

	// HTTP bearer authentication
	passport.use('core.api', new BearerStrategy({}, Auth.verifyToken));

	// Additional logins via SSO plugins
	try {
		loginStrategies = await plugins.hooks.fire('filter:auth.init', loginStrategies);
	} catch (err) {
		winston.error(`[authentication] ${err.stack}`);
	}
	loginStrategies = loginStrategies || [];
	loginStrategies.forEach((strategy) => {
		const urlMethod = normalizeAuthMethod(strategy.urlMethod);
		const callbackMethod = normalizeAuthMethod(strategy.callbackMethod);
		const strategyUrl = normalizeAuthPath(strategy.url);
		const strategyCallbackURL = normalizeAuthPath(strategy.callbackURL);

		if ((strategy.url && !strategyUrl) || (strategy.callbackURL && !strategyCallbackURL)) {
			winston.warn(`[authentication] Skipping invalid auth strategy route for "${strategy.name || 'unknown'}".`);
			return;
		}

		if (strategy.url) {
			router[urlMethod](strategyUrl, Auth.middleware.applyCSRF, async (req, res, next) => {
				let opts = {
					scope: strategy.scope,
					prompt: strategy.prompt || undefined,
				};

				if (strategy.checkState !== false) {
					req.session.ssoState = generateToken(req, true);
					opts.state = req.session.ssoState;
				}
				if (typeof req.query.next === 'string' && req.query.next.startsWith('/') && !req.query.next.startsWith('//')) {
					req.session.next = req.query.next;
				}

				// Allow SSO plugins to override/append options (for use in passport prototype authorizationParams)
				({ opts } = await plugins.hooks.fire('filter:auth.options', { req, res, opts }));
				passport.authenticate(strategy.name, opts)(req, res, next);
			});
		}

		if (!strategyCallbackURL) {
			winston.warn(`[authentication] Skipping auth strategy "${strategy.name || 'unknown'}" due to missing callbackURL.`);
			return;
		}

		router[callbackMethod](strategyCallbackURL, (req, res, next) => {
			// Ensure the passed-back state value is identical to the saved ssoState (unless explicitly skipped)
			if (strategy.checkState === false) {
				return next();
			}
			const isValidState = req.query.state && req.session.ssoState && req.query.state === req.session.ssoState;
			delete req.session.ssoState;
			next(isValidState ? null : new Error('[[error:csrf-invalid]]'));
		}, (req, res, next) => {
			passport.authenticate(strategy.name, (err, user, info) => {
				if (err) {
					return next(err);
				}

				if (!user) {
					if (info && info.message) {
						return helpers.redirect(res, `/?register=${encodeURIComponent(info.message)}`);
					}
					return helpers.redirect(res, strategy.failureUrl || '/login');
				}

				res.locals.user = user;
				res.locals.strategy = strategy;
				next();
			})(req, res, next);
		}, Auth.middleware.validateAuth, async (req, res, next) => {
			try {
				// 登录用户
				await new Promise((resolve, reject) => {
					req.login(res.locals.user, { keepSessionInfo: true }, (err) => {
						if (err) {
							return reject(err);
						}
						resolve();
					});
				});
				// 处理登录成功后的逻辑
				await controllers.authentication.onSuccessfulLogin(req, res.locals.user.uid);
				// 重定向到成功页面
				const nextPath = consumeSafeNextPath(req.session);
				helpers.redirect(res, nextPath || strategy.successUrl || '/');
			} catch (err) {
				next(err);
			}
		});
	});

	router.post('/login', Auth.middleware.applyCSRF, Auth.middleware.applyBlacklist, controllers.authentication.login);
	router.post('/logout', Auth.middleware.applyCSRF, controllers.authentication.logout);
};

function normalizeAuthMethod(method) {
	const normalized = String(method || 'get').toLowerCase();
	return ALLOWED_AUTH_METHODS.has(normalized) ? normalized : 'get';
}

function normalizeAuthPath(route) {
	if (!route) {
		return '';
	}
	if (typeof route !== 'string') {
		return '';
	}
	if (!route.startsWith('/') || route.startsWith('//')) {
		return '';
	}
	return route;
}

function consumeSafeNextPath(session) {
	if (!session || typeof session.next !== 'string') {
		return '';
	}

	const nextPath = session.next.trim();
	delete session.next;

	if (!nextPath || !nextPath.startsWith('/') || nextPath.startsWith('//') || /[\r\n]/.test(nextPath)) {
		return '';
	}

	return nextPath;
}

passport.serializeUser((user, done) => {
	done(null, user.uid);
});

passport.deserializeUser((uid, done) => {
	done(null, {
		uid: uid,
	});
});


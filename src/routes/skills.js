'use strict';

const express = require('express');

const controller = require('../controllers/skills');
const middleware = require('../middleware');
const skillMiddleware = require('../middleware/skills');
const helpers = require('./helpers');
const manifest = require('../skills/manifest');

module.exports = function () {
	const router = express.Router();

	const safetyMiddlewares = [
		middleware.autoLocale,
		middleware.applyBlacklist,
		middleware.authenticateRequest,
		middleware.maintenanceMode,
		middleware.registrationComplete,
		middleware.pluginHooks,
		middleware.logApiUsage,
		middleware.ensureLoggedIn,
		skillMiddleware.requireEnabled,
		skillMiddleware.requireJson,
		skillMiddleware.enforceBodySize,
		skillMiddleware.allowlistedIp,
		skillMiddleware.verifySignature,
		skillMiddleware.rateLimit,
		skillMiddleware.requireSkillScopes(manifest),
	];

	router.get('/manifest', helpers.tryRoute(controller.getManifest));
	router.post('/:skill/execute', safetyMiddlewares, helpers.tryRoute(controller.execute));

	return router;
};

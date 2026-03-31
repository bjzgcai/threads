'use strict';

const express = require('express');

const controller = require('../controllers/skills');
const middleware = require('../middleware');
const skillMiddleware = require('../middleware/skills');
const helpers = require('./helpers');
const manifest = require('../skills/manifest');

module.exports = function () {
	const router = express.Router();

	const tokenManagementMiddlewares = [
		middleware.autoLocale,
		middleware.applyBlacklist,
		middleware.authenticateRequest,
		middleware.maintenanceMode,
		middleware.registrationComplete,
		middleware.pluginHooks,
		middleware.ensureLoggedIn,
	];

	const safetyMiddlewares = [
		middleware.autoLocale,
		middleware.applyBlacklist,
		skillMiddleware.requireBearerToken,
		middleware.authenticateRequest,
		middleware.maintenanceMode,
		middleware.registrationComplete,
		middleware.pluginHooks,
		middleware.logApiUsage,
		skillMiddleware.auditSkillRequest,
		middleware.ensureLoggedIn,
		skillMiddleware.requireEnabled,
		skillMiddleware.requireIssuedSkillToken,
		skillMiddleware.requireJson,
		skillMiddleware.enforceBodySize,
		skillMiddleware.allowlistedIp,
		skillMiddleware.verifySignature,
		skillMiddleware.extractExternalActor,
		skillMiddleware.requireDingtalkAuth,
		skillMiddleware.requireExternalActor,
		skillMiddleware.rateLimit,
		skillMiddleware.requireSkillScopes(manifest),
	];

	router.get('/tokens', tokenManagementMiddlewares, helpers.tryRoute(controller.listTokens));
	router.post('/tokens', tokenManagementMiddlewares, helpers.tryRoute(controller.createToken));
	router.post('/tokens/:token/roll', tokenManagementMiddlewares, helpers.tryRoute(controller.rollToken));
	router.delete('/tokens/:token', tokenManagementMiddlewares, helpers.tryRoute(controller.revokeToken));
	router.get('/manifest', helpers.tryRoute(controller.getManifest));
	router.post('/:skill/execute', safetyMiddlewares, helpers.tryRoute(controller.execute));

	return router;
};

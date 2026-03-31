'use strict';

const helpers = require('../helpers');
const skillTokens = require('../../skills/tokens');

const skillsController = module.exports;

skillsController.get = async function (req, res) {
	const payload = res.locals.userData;
	if (!payload || !payload.isSelf) {
		return helpers.notAllowed(req, res);
	}

	payload.tokens = await skillTokens.list(payload.uid);
	payload.title = '[[skills:account.title]]';
	payload.breadcrumbs = helpers.buildBreadcrumbs([
		{ text: payload.username, url: `/user/${payload.userslug}` },
		{ text: '[[skills:account.title]]' },
	]);

	res.render('account/skills', payload);
};

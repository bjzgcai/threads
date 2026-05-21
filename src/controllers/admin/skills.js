'use strict';

const pagination = require('../../pagination');
const skillTokens = require('../../skills/tokens');

const skillsAdminController = module.exports;

skillsAdminController.get = async function (req, res) {
	const data = await skillTokens.listAll({
		page: req.query.page,
		resultsPerPage: req.query.resultsPerPage,
		uid: req.query.uid,
		query: req.query.query,
	});

	res.render('admin/manage/skills', {
		title: '[[skills:admin.title]]',
		tokens: data.tokens,
		query: req.query.query || '',
		filterUid: req.query.uid || '',
		resultsPerPage: data.resultsPerPage,
		count: data.count,
		pagination: pagination.create(data.page, data.pageCount, req.query),
	});
};

skillsAdminController.list = async function (req, res) {
	const data = await skillTokens.listAll({
		page: req.query.page,
		resultsPerPage: req.query.resultsPerPage,
		uid: req.query.uid,
		query: req.query.query,
	});

	res.json({
		tokens: data.tokens,
		count: data.count,
		pagination: pagination.create(data.page, data.pageCount, req.query),
		resultsPerPage: data.resultsPerPage,
	});
};

skillsAdminController.revoke = async function (req, res) {
	await skillTokens.revokeAdmin(req.params.token);
	res.sendStatus(200);
};

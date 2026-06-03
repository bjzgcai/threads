'use strict';

const helpers = require('../helpers');
const user = require('../../user');
const dingtalkDepartments = require('../../dingtalk/departments');

const controller = module.exports;

controller.get = async function (req, res) {
	if (!await assertAdministrator(req, res)) {
		return;
	}
	const state = await dingtalkDepartments.getAdminState();
	res.render('admin/manage/dingtalk-departments', {
		title: '钉钉部门权限',
		...state,
	});
};

controller.getState = async function (req, res) {
	if (!await assertAdministrator(req, res)) {
		return;
	}
	helpers.formatApiResponse(200, res, await dingtalkDepartments.getAdminState());
};

controller.syncDepartments = async function (req, res) {
	if (!await assertAdministrator(req, res)) {
		return;
	}
	helpers.formatApiResponse(200, res, await dingtalkDepartments.syncDepartmentTree());
};

controller.refreshDepartmentDetail = async function (req, res) {
	if (!await assertAdministrator(req, res)) {
		return;
	}
	helpers.formatApiResponse(200, res, {
		department: await dingtalkDepartments.refreshDepartmentDetail(req.params.deptId),
	});
};

controller.syncMembers = async function (req, res) {
	if (!await assertAdministrator(req, res)) {
		return;
	}
	helpers.formatApiResponse(200, res, await dingtalkDepartments.syncDepartmentMembers(req.body || {}));
};

controller.getCategoryConfig = async function (req, res) {
	if (!await assertAdministrator(req, res)) {
		return;
	}
	helpers.formatApiResponse(200, res, await dingtalkDepartments.getCategoryConfig(req.params.cid));
};

controller.saveCategoryConfig = async function (req, res) {
	if (!await assertAdministrator(req, res)) {
		return;
	}
	helpers.formatApiResponse(200, res, await dingtalkDepartments.saveCategoryConfig(req.params.cid, req.body || {}));
};

async function assertAdministrator(req, res) {
	if (req.uid > 0 && await user.isAdministrator(req.uid)) {
		return true;
	}
	await helpers.notAllowed(req, res);
	return false;
}

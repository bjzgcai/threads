'use strict';

const nconf = require('nconf');
const meta = require('../meta');

const dingtalkController = {};

dingtalkController.pcRedirect = async function (req, res) {
	const targetUrl = nconf.get('url');
	const title = meta.config.title || 'NodeBB';
	const dingtalkRedirectUrl = `dingtalk://dingtalkclient/page/link?url=${encodeURIComponent(targetUrl)}&pc_slide=false&title=${encodeURIComponent(title)}`;

	res.render('dingtalk-pc-redirect', {
		title: title,
		dingtalkRedirectUrl,
		targetUrl,
	});
};

module.exports = dingtalkController;

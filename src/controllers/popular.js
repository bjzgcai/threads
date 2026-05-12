
'use strict';

const nconf = require('nconf');
const validator = require('validator');

const helpers = require('./helpers');
const hotTopics = require('./hotTopics');
const recentController = require('./recent');

const popularController = module.exports;
const hotTopicsCategoryCid = process.env.NODEBB_HOT_TOPICS_CATEGORY_CID;

popularController.get = async function (req, res, next) {
	const data = await recentController.getData(req, 'popular', 'posts');
	if (!data) {
		return next();
	}
	const term = helpers.terms[req.query.term] || 'alltime';
	if (req.originalUrl.startsWith(`${nconf.get('relative_path')}/api/popular`) || req.originalUrl.startsWith(`${nconf.get('relative_path')}/popular`)) {
		data.title = `[[pages:popular-${term}]]`;
		const breadcrumbs = [{ text: '[[global:header.popular]]' }];
		data.breadcrumbs = helpers.buildBreadcrumbs(breadcrumbs);
	}

	if (!data['feeds:disableRSS'] && data.rssFeedUrl) {
		const feedQs = data.rssFeedUrl.split('?')[1];
		data.rssFeedUrl = `${nconf.get('relative_path')}/popular/${validator.escape(String(req.query.term || 'alltime'))}.rss`;
		if (req.loggedIn) {
			data.rssFeedUrl += `?${feedQs}`;
		}
	}

	data.hotTopics = await hotTopics.getHotTopics({
		uid: req.uid,
		query: req.query,
		excludedCid: hotTopicsCategoryCid,
	});
	res.render('popular', data);
};

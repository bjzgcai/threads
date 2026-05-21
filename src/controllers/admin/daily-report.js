'use strict';

const report = require('../../reports/dingtalk-daily');

const controller = module.exports;

controller.get = async function (req, res) {
	const data = await report.buildDailySummaryData();

	res.render('admin/dashboard/daily-report', {
		title: '运营日报预览',
		dateLabel: data.dateLabel,
		metrics: data.metrics,
		totals: data.totals,
		markdown: data.markdown,
	});
};


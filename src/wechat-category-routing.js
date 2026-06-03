'use strict';

const DEFAULT_WECHAT_CATEGORY_CID_MAP = Object.freeze({
	'前沿认知': 2,
	'高校资讯': 26,
	'舆情监控': 28,
});

function normalizeWechatCategory(value) {
	return String(value || '').trim();
}

function parseWechatCategoryCidMap(raw, defaults = DEFAULT_WECHAT_CATEGORY_CID_MAP) {
	const categoryCidMap = { ...defaults };
	const value = String(raw || '').trim();
	if (!value) {
		return categoryCidMap;
	}

	let parsed = null;
	try {
		parsed = JSON.parse(value);
	} catch (err) {
		return categoryCidMap;
	}

	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return categoryCidMap;
	}

	Object.entries(parsed).forEach(([category, cid]) => {
		const normalizedCategory = normalizeWechatCategory(category);
		const normalizedCid = parseInt(cid, 10);
		if (normalizedCategory && normalizedCid > 0) {
			categoryCidMap[normalizedCategory] = normalizedCid;
		}
	});

	return categoryCidMap;
}

module.exports = {
	DEFAULT_WECHAT_CATEGORY_CID_MAP,
	normalizeWechatCategory,
	parseWechatCategoryCidMap,
};

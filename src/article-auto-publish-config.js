'use strict';

const fs = require('fs');
const path = require('path');
const winston = require('winston');

const DEFAULT_CATEGORY_MAP_FILE = 'config/article-auto-publish-category-map.json';

function normalizeMatchValue(value) {
	return String(value || '').trim().toLowerCase();
}

function normalizeCategoryId(value) {
	const cid = parseInt(value, 10);
	return Number.isInteger(cid) && cid > 0 ? cid : 0;
}

function getCategoryMapFile() {
	const configuredPath = String(
		process.env.ARTICLE_AUTO_PUBLISH_CATEGORY_MAP_FILE || DEFAULT_CATEGORY_MAP_FILE
	).trim() || DEFAULT_CATEGORY_MAP_FILE;

	return path.isAbsolute(configuredPath) ?
		configuredPath :
		path.resolve(process.cwd(), configuredPath);
}

function getFallbackDefaultCid() {
	return normalizeCategoryId(process.env.ARTICLE_AUTO_PUBLISH_CID);
}

function normalizeMatchObject(rawMatch) {
	if (!rawMatch || typeof rawMatch !== 'object' || Array.isArray(rawMatch)) {
		return {};
	}

	return Object.fromEntries(
		Object.entries(rawMatch)
			.map(([key, value]) => [String(key || '').trim(), normalizeMatchValue(value)])
			.filter(([key, value]) => key && value)
	);
}

function getRawDimensionCidMap(config) {
	if (config.dimensionCidMap && typeof config.dimensionCidMap === 'object' && !Array.isArray(config.dimensionCidMap)) {
		return config.dimensionCidMap;
	}

	return Object.fromEntries(
		Object.entries(config).filter(([key]) => key !== 'defaultCid')
	);
}

function normalizeDimensionCidMap(rawMap) {
	const dimensionCidMap = {};

	if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) {
		return dimensionCidMap;
	}

	Object.entries(rawMap).forEach(([dimension, cidValue]) => {
		const normalizedDimension = normalizeMatchValue(dimension);
		const cid = normalizeCategoryId(cidValue);
		if (normalizedDimension && cid) {
			dimensionCidMap[normalizedDimension] = cid;
		}
	});

	return dimensionCidMap;
}

function normalizeArticleRouteRule(rawRule) {
	if (!rawRule || typeof rawRule !== 'object' || Array.isArray(rawRule)) {
		return null;
	}

	const cid = normalizeCategoryId(rawRule.cid);
	const match = normalizeMatchObject(rawRule.match);
	if (!cid || !Object.keys(match).length) {
		return null;
	}

	return { match, cid };
}

function normalizeArticleRouteRules(rawRules) {
	if (!Array.isArray(rawRules)) {
		return [];
	}

	return rawRules
		.map(normalizeArticleRouteRule)
		.filter(Boolean);
}

function parseCategoryConfig(rawConfig) {
	const config = rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig) ? rawConfig : {};
	const hasDefaultCid = Object.prototype.hasOwnProperty.call(config, 'defaultCid');

	return {
		defaultCid: hasDefaultCid ? normalizeCategoryId(config.defaultCid) : getFallbackDefaultCid(),
		articleRoutes: normalizeArticleRouteRules(config.articleRoutes),
		dimensionCidMap: normalizeDimensionCidMap(getRawDimensionCidMap(config)),
	};
}

function loadCategoryConfig() {
	const file = getCategoryMapFile();

	try {
		const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
		return {
			file,
			...parseCategoryConfig(raw),
		};
	} catch (err) {
		if (err.code !== 'ENOENT') {
			winston.warn(`[article-auto-publish] failed to load category map ${file}: ${err.message}`);
		}

		return {
			file,
			...parseCategoryConfig({}),
		};
	}
}

function getCategoryIdForDimension(dimension, config = loadCategoryConfig()) {
	const normalizedDimension = normalizeMatchValue(dimension);
	return (normalizedDimension && config.dimensionCidMap[normalizedDimension]) || config.defaultCid || 0;
}

function articleMatchesRoute(article, route) {
	if (!route || !route.match || !article || typeof article !== 'object') {
		return false;
	}

	return Object.entries(route.match).every(([field, expectedValue]) => (
		normalizeMatchValue(getArticleFieldValue(article, field)) === expectedValue
	));
}

function getArticleFieldValue(article, field) {
	if (Object.prototype.hasOwnProperty.call(article, field)) {
		return article[field];
	}

	if (field.includes('_')) {
		const camelField = field.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
		return article[camelField];
	}

	return undefined;
}

function getCategoryIdForArticle(article, config = loadCategoryConfig()) {
	const matchedRoute = (config.articleRoutes || []).find(route => articleMatchesRoute(article, route));
	if (matchedRoute) {
		return matchedRoute.cid;
	}

	return getCategoryIdForDimension(article && article.dimension, config);
}

function getCategoryIds(config = loadCategoryConfig()) {
	return Array.from(new Set([
		config.defaultCid,
		...(config.articleRoutes || []).map(route => route.cid),
		...Object.values(config.dimensionCidMap),
	].filter(Boolean)));
}

module.exports = {
	DEFAULT_CATEGORY_MAP_FILE,
	getCategoryMapFile,
	loadCategoryConfig,
	getCategoryIdForArticle,
	getCategoryIdForDimension,
	getCategoryIds,
};

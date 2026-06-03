'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const articleAutoPublishConfig = require('../src/article-auto-publish-config');

describe('article auto publish config', () => {
	let tempDir;
	let configFile;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'article-auto-publish-'));
		configFile = path.join(tempDir, 'category-map.json');
		process.env.ARTICLE_AUTO_PUBLISH_CATEGORY_MAP_FILE = configFile;
		process.env.ARTICLE_AUTO_PUBLISH_CID = '24';
	});

	afterEach(() => {
		delete process.env.ARTICLE_AUTO_PUBLISH_CATEGORY_MAP_FILE;
		delete process.env.ARTICLE_AUTO_PUBLISH_CID;
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it('loads configured dimension routes and default cid', () => {
		fs.writeFileSync(configFile, JSON.stringify({
			defaultCid: 24,
			articleRoutes: [
				{
					match: {
						dimension: 'social',
						source_type: 'social_kol',
					},
					cid: 2,
				},
			],
			dimensionCidMap: {
				beijing_policy: 27,
				technology: '2',
				social: 30,
				' Talent ': '29',
				invalid: 'abc',
			},
		}));

		const loaded = articleAutoPublishConfig.loadCategoryConfig();
		assert.strictEqual(loaded.file, configFile);
		assert.strictEqual(loaded.defaultCid, 24);
		assert.deepStrictEqual(loaded.articleRoutes, [
			{
				match: {
					dimension: 'social',
					source_type: 'social_kol',
				},
				cid: 2,
			},
		]);
		assert.deepStrictEqual(loaded.dimensionCidMap, {
			beijing_policy: 27,
			technology: 2,
			social: 30,
			talent: 29,
		});
		assert.strictEqual(articleAutoPublishConfig.getCategoryIdForDimension('TECHNOLOGY', loaded), 2);
		assert.strictEqual(articleAutoPublishConfig.getCategoryIdForArticle({
			dimension: 'social',
			source_type: 'social_kol',
		}, loaded), 2);
		assert.strictEqual(articleAutoPublishConfig.getCategoryIdForArticle({
			dimension: 'social',
			sourceType: 'social_kol',
		}, loaded), 2);
		assert.strictEqual(articleAutoPublishConfig.getCategoryIdForArticle({
			dimension: 'social',
			source_type: 'media',
		}, loaded), 30);
		assert.strictEqual(articleAutoPublishConfig.getCategoryIdForDimension('unknown', loaded), 24);
		assert.deepStrictEqual(articleAutoPublishConfig.getCategoryIds(loaded).sort((a, b) => a - b), [2, 24, 27, 29, 30]);
	});

	it('falls back to the legacy default cid when the config file omits defaultCid', () => {
		fs.writeFileSync(configFile, JSON.stringify({
			industry: 30,
			events: '30',
		}));

		const loaded = articleAutoPublishConfig.loadCategoryConfig();
		assert.strictEqual(loaded.defaultCid, 24);
		assert.strictEqual(articleAutoPublishConfig.getCategoryIdForDimension('industry', loaded), 30);
		assert.strictEqual(articleAutoPublishConfig.getCategoryIdForDimension('other', loaded), 24);
		assert.deepStrictEqual(articleAutoPublishConfig.getCategoryIds(loaded).sort((a, b) => a - b), [24, 30]);
	});

	it('allows disabling the default fallback when defaultCid is zero', () => {
		fs.writeFileSync(configFile, JSON.stringify({
			defaultCid: 0,
			dimensionCidMap: {
				technology: 2,
			},
		}));

		const loaded = articleAutoPublishConfig.loadCategoryConfig();
		assert.strictEqual(loaded.defaultCid, 0);
		assert.strictEqual(articleAutoPublishConfig.getCategoryIdForDimension('technology', loaded), 2);
		assert.strictEqual(articleAutoPublishConfig.getCategoryIdForDimension('other', loaded), 0);
	});
});

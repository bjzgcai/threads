'use strict';

const assert = require('assert');
const nconf = require('nconf');

require('./mocks/databasemock');

const request = require('../src/request');

describe('Skills Gateway', () => {
	let oldSkillsGatewayEnabled;
	let oldSkillsAllowedIps;
	let oldSkillsPublicUrl;

	before(() => {
		oldSkillsGatewayEnabled = process.env.SKILLS_GATEWAY_ENABLED;
		oldSkillsAllowedIps = process.env.SKILLS_ALLOWED_IPS;
		oldSkillsPublicUrl = process.env.SKILLS_PUBLIC_URL;

		process.env.SKILLS_GATEWAY_ENABLED = 'true';
		process.env.SKILLS_ALLOWED_IPS = '';
		process.env.SKILLS_PUBLIC_URL = 'https://forum.example.com';
	});

	after(() => {
		if (oldSkillsGatewayEnabled === undefined) {
			delete process.env.SKILLS_GATEWAY_ENABLED;
		} else {
			process.env.SKILLS_GATEWAY_ENABLED = oldSkillsGatewayEnabled;
		}

		if (oldSkillsAllowedIps === undefined) {
			delete process.env.SKILLS_ALLOWED_IPS;
		} else {
			process.env.SKILLS_ALLOWED_IPS = oldSkillsAllowedIps;
		}

		if (oldSkillsPublicUrl === undefined) {
			delete process.env.SKILLS_PUBLIC_URL;
		} else {
			process.env.SKILLS_PUBLIC_URL = oldSkillsPublicUrl;
		}
	});

	it('should allow public-read skills without csrf or bearer token', async () => {
		const { response, body } = await request.post(`${nconf.get('url')}/api/skills/latest_topics/execute`, {
			body: {
				input: {},
			},
		});

		assert.strictEqual(response.statusCode, 200);
		assert.strictEqual(body.status.code, 'ok');
		assert(Array.isArray(body.response.topics));
		assert(body.response.topics.length > 0);
		const expectedUrl = `${nconf.get('relative_path') || ''}/topic/${body.response.topics[0].slug}` || `/topic/${body.response.topics[0].slug}`;
		assert.strictEqual(body.response.topics[0].url, expectedUrl);
		assert.strictEqual(body.response.topics[0].fullUrl, `https://forum.example.com${expectedUrl}`);
	});

	it('should still require bearer tokens for token-write skills', async () => {
		const { response, body } = await request.post(`${nconf.get('url')}/api/skills/create_topic_or_reply/execute`, {
			body: {
				input: {},
			},
		});

		assert.strictEqual(response.statusCode, 401);
		assert.strictEqual(body.status.code, 'not-authorised');
		assert.strictEqual(body.status.message, 'skills-bearer-token-required');
	});
});

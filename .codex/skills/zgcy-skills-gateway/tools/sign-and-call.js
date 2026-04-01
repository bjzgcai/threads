#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function readJsonFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(content);
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function usage() {
  console.error('Usage: node tools/sign-and-call.js <skillName> <payloadJsonPath> [configJsonPath]');
  process.exit(1);
}

async function main() {
  const [, , skillName, payloadPath, configPathArg] = process.argv;
  if (!skillName || !payloadPath) {
    usage();
  }

  const defaultConfigPath = path.resolve(__dirname, '..', 'skill-config.json');
  const configPath = configPathArg || process.env.SKILL_CONFIG_PATH || defaultConfigPath;
  const config = readJsonFile(configPath);
  const auth = config.auth || {};

  const baseUrl = process.env.SKILL_BASE_URL || config.baseUrl || '';
  const bearer = process.env.SKILL_BEARER_TOKEN || auth.bearerToken || '';
  const secret = process.env.SKILL_SIGNING_SECRET || auth.signingSecret || '';
  const timeoutMs = Number(process.env.SKILL_TIMEOUT_MS || config.timeoutMs || 15000);
  const userAgent = process.env.SKILL_USER_AGENT || config.userAgent || 'zgcy-skill-client/1.0';

  if (!baseUrl || !bearer) {
    console.error('Missing required config: baseUrl and bearerToken');
    process.exit(1);
  }

  const payload = readJsonFile(payloadPath);
  const stableBody = stableStringify(payload);
  const method = 'POST';
  const requestPath = `/${skillName}/execute`;
  const url = `${baseUrl.replace(/\/$/, '')}${requestPath}`;
  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${bearer}`,
    'user-agent': userAgent,
  };

  if (secret) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomUUID();
    const signingPayload = `${timestamp}.${nonce}.${method}.${requestPath}.${stableBody}`;
    const signature = crypto.createHmac('sha256', secret).update(signingPayload).digest('hex');

    headers['x-skills-timestamp'] = timestamp;
    headers['x-skills-nonce'] = nonce;
    headers['x-skills-signature'] = signature;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const response = await fetch(url, {
    method,
    headers,
    body: stableBody,
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));

  const text = await response.text();
  console.log(`HTTP ${response.status}`);
  console.log(text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

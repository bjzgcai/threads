#!/usr/bin/env node
'use strict';

const fs = require('fs');
const crypto = require('crypto');

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function usage() {
  console.error('Usage: node tools/sign-and-call.js <skillName> <payloadJsonPath>');
  process.exit(1);
}

async function main() {
  const [, , skillName, payloadPath] = process.argv;
  if (!skillName || !payloadPath) usage();

  const baseUrl = process.env.SKILL_BASE_URL;
  const bearer = process.env.SKILL_BEARER_TOKEN;
  const secret = process.env.SKILL_SIGNING_SECRET || '';

  if (!baseUrl || !bearer) {
    console.error('SKILL_BASE_URL and SKILL_BEARER_TOKEN are required');
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
  const method = 'POST';
  const path = `/${skillName}/execute`;
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;

  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${bearer}`,
  };

  if (secret) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomUUID();
    const body = stableStringify(payload);
    const signingPayload = `${timestamp}.${nonce}.${method}.${path}.${body}`;
    const signature = crypto.createHmac('sha256', secret).update(signingPayload).digest('hex');

    headers['x-skills-timestamp'] = timestamp;
    headers['x-skills-nonce'] = nonce;
    headers['x-skills-signature'] = signature;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  console.log(`HTTP ${response.status}`);
  console.log(text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
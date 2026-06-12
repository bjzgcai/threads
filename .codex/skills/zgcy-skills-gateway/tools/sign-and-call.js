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

function parseVersion(version) {
  return String(version || '')
    .trim()
    .split('.')
    .map(part => parseInt(part, 10))
    .map(value => (Number.isFinite(value) ? value : 0));
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const av = a[i] || 0;
    const bv = b[i] || 0;
    if (av > bv) {
      return 1;
    }
    if (av < bv) {
      return -1;
    }
  }
  return 0;
}

function getManifestUrl(baseUrl) {
  const trimmed = String(baseUrl || '').replace(/\/$/, '');
  if (trimmed.endsWith('/manifest')) {
    return trimmed;
  }
  return `${trimmed}/manifest`;
}

async function fetchRemoteManifest(baseUrl, bearer, timeoutMs, userAgent) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetch(getManifestUrl(baseUrl), {
    method: 'GET',
    headers: {
      authorization: `Bearer ${bearer}`,
      accept: 'application/json',
      'user-agent': userAgent,
    },
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));

  if (!response.ok) {
    throw new Error(`Failed to fetch skills manifest: HTTP ${response.status}`);
  }

  return response.json();
}

async function assertPackageVersion(config) {
  const skip = String(process.env.SKILL_SKIP_VERSION_CHECK || config.skipVersionCheck || '').toLowerCase();
  if (skip === '1' || skip === 'true' || skip === 'yes') {
    return;
  }

  const meta = readJsonFile(path.resolve(__dirname, '..', '_meta.json'));
  const packageName = String(meta.packageName || meta.name || '').trim();
  const localVersion = String(meta.version || '').trim();
  if (!packageName || !localVersion) {
    return;
  }

  const manifest = await fetchRemoteManifest(config.baseUrl, config.bearer, config.timeoutMs, config.userAgent);
  const remotePackage = manifest && manifest.packages ? manifest.packages[packageName] : null;
  if (!remotePackage || !remotePackage.version) {
    return;
  }

  const remoteVersion = String(remotePackage.version || '').trim();
  if (compareVersions(localVersion, remoteVersion) === 0) {
    return;
  }

  const hint = String(
    remotePackage.upgradeHint ||
    `Please update ${packageName} from ${localVersion} to ${remoteVersion}.`
  ).trim();
  const err = new Error([
    `Skill package version mismatch for ${packageName}.`,
    `Local version: ${localVersion}`,
    `Remote version: ${remoteVersion}`,
    hint,
  ].join('\n'));
  err.code = 'SKILL_VERSION_MISMATCH';
  throw err;
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

  await assertPackageVersion({
    baseUrl,
    bearer,
    timeoutMs,
    userAgent,
    skipVersionCheck: config.skipVersionCheck,
  });

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

#!/usr/bin/env node
'use strict';

const fs = require('fs');
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
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function usage() {
  console.error('Usage: node tools/sign-and-call.js <skillName> <payloadJsonPath> [configJsonPath]');
  process.exit(1);
}

function normalizeVersion(value) {
  return String(value || '').trim().replace(/^v/i, '');
}

function getRemotePackageVersion(manifest, packageName) {
  if (!manifest || !packageName) {
    return '';
  }

  const candidates = [
    manifest.packages && manifest.packages[packageName] && manifest.packages[packageName].version,
    manifest.skillPacks && manifest.skillPacks[packageName] && manifest.skillPacks[packageName].version,
    manifest.packageVersions && manifest.packageVersions[packageName],
    manifest.versions && manifest.versions[packageName],
    manifest.name === packageName ? manifest.version : '',
  ];

  return candidates.find(Boolean) || '';
}

async function checkForSkillPackageUpdate(config, baseUrl, timeoutMs) {
  const updateCheck = config.updateCheck || {};
  if (updateCheck.enabled === false) {
    return;
  }

  const packageName = updateCheck.packageName || 'zgcy-forum-read';
  const localVersion = updateCheck.localVersion || '';
  if (!localVersion) {
    return;
  }

  const manifestUrl = process.env.SKILL_REMOTE_MANIFEST_URL ||
    updateCheck.remoteManifestUrl ||
    `${baseUrl.replace(/\/$/, '')}/manifest`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(manifestUrl, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error(`[update-check] Could not check ${packageName}: manifest returned HTTP ${response.status}. Continuing.`);
      return;
    }

    const remoteManifest = await response.json();
    const remoteVersion = getRemotePackageVersion(remoteManifest, packageName);
    if (!remoteVersion) {
      console.error(`[update-check] Could not find remote version for ${packageName} in ${manifestUrl}. Continuing.`);
      return;
    }

    if (normalizeVersion(remoteVersion) !== normalizeVersion(localVersion)) {
      console.error(`[update-check] ${packageName} local version ${localVersion} differs from remote version ${remoteVersion}. Please upgrade this local skill package before relying on it for current behavior.`);
    }
  } catch (err) {
    console.error(`[update-check] Could not check ${packageName}: ${err.message}. Continuing.`);
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const [, , skillName, payloadPath, configPathArg] = process.argv;
  if (!skillName || !payloadPath) usage();

  const configPath = configPathArg || process.env.SKILL_CONFIG_PATH || '';
  const config = configPath ? readJsonFile(configPath) : {};
  const auth = config.auth || {};

  const baseUrl = process.env.SKILL_BASE_URL || config.baseUrl || '';
  const bearer = process.env.SKILL_BEARER_TOKEN || auth.bearerToken || '';
  const secret = process.env.SKILL_SIGNING_SECRET || auth.signingSecret || '';
  const timeoutMs = Number(process.env.SKILL_TIMEOUT_MS || config.timeoutMs || 15000);
  const userAgent = process.env.SKILL_USER_AGENT || config.userAgent || 'zgcy-skill-client/1.0';

  if (!baseUrl) {
    console.error('Missing required config: baseUrl (or SKILL_BASE_URL)');
    process.exit(1);
  }

  await checkForSkillPackageUpdate(config, baseUrl, timeoutMs);

  const payload = readJsonFile(payloadPath);
  const stableBody = stableStringify(payload);
  const method = 'POST';
  const path = `/${skillName}/execute`;
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;

  const headers = {
    'content-type': 'application/json',
    'user-agent': userAgent,
  };

  if (bearer) {
    headers.authorization = `Bearer ${bearer}`;
  }

  if (secret) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomUUID();
    const signingPayload = `${timestamp}.${nonce}.${method}.${path}.${stableBody}`;
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

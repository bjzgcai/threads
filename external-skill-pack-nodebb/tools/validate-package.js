#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function stripBom(text) {
  return text.replace(/^\uFEFF/, '');
}

function hasBom(buffer) {
  return buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
}

function checkRequiredFile(rootDir, relativePath, errors) {
  const filePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(filePath)) {
    errors.push(`MISSING ${relativePath}`);
    return false;
  }
  return true;
}

function checkJsonFile(filePath, warnings, errors) {
  const raw = fs.readFileSync(filePath);
  if (hasBom(raw)) {
    warnings.push(`BOM ${path.basename(filePath)}`);
  }

  try {
    JSON.parse(stripBom(raw.toString('utf8')));
  } catch (err) {
    errors.push(`INVALID_JSON ${path.basename(filePath)} ${err.message}`);
  }
}

function walkJsonFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkJsonFiles(fullPath));
    } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.json') {
      results.push(fullPath);
    }
  }
  return results;
}

function main() {
  const rootDir = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..');
  const errors = [];
  const warnings = [];

  const requiredFiles = [
    '_meta.json',
    'SKILL.md',
    'skill-config.json',
    path.join('tools', 'sign-and-call.js'),
    path.join('tools', 'validate-json.js'),
  ];

  const requiredExamples = [
    path.join('examples', 'list_categories.request.json'),
    path.join('examples', 'latest_topics.request.json'),
    path.join('examples', 'unread_topics.request.json'),
    path.join('examples', 'search_topics.request.json'),
    path.join('examples', 'get_post_raw.request.json'),
    path.join('examples', 'create_topic.request.json'),
    path.join('examples', 'create_reply.request.json'),
  ];

  const requiredSkillDocs = [
    path.join('skills', 'list_categories.md'),
    path.join('skills', 'latest_topics.md'),
    path.join('skills', 'unread_topics.md'),
    path.join('skills', 'search_topics.md'),
    path.join('skills', 'get_post_raw.md'),
    path.join('skills', 'create_topic_or_reply.md'),
  ];

  [...requiredFiles, ...requiredExamples, ...requiredSkillDocs].forEach(relativePath => {
    checkRequiredFile(rootDir, relativePath, errors);
  });

  const jsonFiles = walkJsonFiles(rootDir);
  jsonFiles.forEach(filePath => checkJsonFile(filePath, warnings, errors));

  console.log(`PACKAGE ${rootDir}`);
  console.log(`JSON_FILES ${jsonFiles.length}`);

  if (warnings.length) {
    warnings.forEach(item => console.log(`WARN ${item}`));
  }

  if (errors.length) {
    errors.forEach(item => console.error(`ERROR ${item}`));
    process.exit(1);
  }

  console.log('OK package validation passed');
}

main();
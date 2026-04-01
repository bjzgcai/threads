#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function readJsonFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(content);
}

function checkFile(filePath) {
  const raw = fs.readFileSync(filePath);
  const hasBom = raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf;

  try {
    readJsonFile(filePath);
  } catch (err) {
    console.error(`INVALID ${filePath}`);
    console.error(err.message);
    process.exitCode = 1;
    return;
  }

  const status = hasBom ? 'VALID_WITH_BOM' : 'VALID';
  console.log(`${status} ${filePath}`);
}

function main() {
  const files = process.argv.slice(2);
  const targets = files.length ? files : [
    path.resolve(__dirname, '..', 'skill-config.json'),
  ];

  targets.forEach(checkFile);
  if (process.exitCode) {
    process.exit(process.exitCode);
  }
}

main();

#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const overrides = [
	{
		source: 'overrides/nodebb-plugin-dbsearch/lib/postgres.js',
		target: 'node_modules/nodebb-plugin-dbsearch/lib/postgres.js',
	},
];

let appliedCount = 0;

for (const override of overrides) {
	const sourcePath = path.join(projectRoot, override.source);
	const targetPath = path.join(projectRoot, override.target);

	if (!fs.existsSync(sourcePath)) {
		console.error(`[local-overrides] missing source: ${override.source}`);
		process.exitCode = 1;
		continue;
	}

	if (!fs.existsSync(path.dirname(targetPath))) {
		console.warn(`[local-overrides] skipped missing target package: ${override.target}`);
		continue;
	}

	fs.copyFileSync(sourcePath, targetPath);
	appliedCount += 1;
	console.log(`[local-overrides] applied ${override.source} -> ${override.target}`);
}

if (!appliedCount && !process.exitCode) {
	console.log('[local-overrides] no overrides applied');
}

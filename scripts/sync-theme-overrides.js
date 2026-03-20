'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

const overrides = [
	{
		source: 'src/views/partials/header/brand.tpl',
		target: 'node_modules/nodebb-theme-harmony/templates/partials/header/brand.tpl',
	},
	{
		source: 'src/views/account/edit.tpl',
		target: 'node_modules/nodebb-theme-harmony/templates/account/edit.tpl',
	},
	{
		source: 'src/views/account/edit/username.tpl',
		target: 'node_modules/nodebb-theme-harmony/templates/account/edit/username.tpl',
	},
];

function copyOverride(sourceRel, targetRel) {
	const source = path.join(rootDir, sourceRel);
	const target = path.join(rootDir, targetRel);

	if (!fs.existsSync(source)) {
		throw new Error(`Source override not found: ${sourceRel}`);
	}

	const targetDir = path.dirname(target);
	fs.mkdirSync(targetDir, { recursive: true });
	fs.copyFileSync(source, target);
	console.log(`Synced ${sourceRel} -> ${targetRel}`);
}

function main() {
	const missingTheme = overrides.some(item => !fs.existsSync(path.join(rootDir, path.dirname(item.target))));
	if (missingTheme) {
		throw new Error('Harmony theme templates were not found under node_modules. Run dependency install first.');
	}

	overrides.forEach(item => copyOverride(item.source, item.target));
}

main();

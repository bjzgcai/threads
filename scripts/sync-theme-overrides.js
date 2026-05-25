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
	{
		source: 'src/views/popular.tpl',
		target: 'node_modules/nodebb-theme-harmony/templates/popular.tpl',
	},
	{
		source: 'src/views/partials/category/hot-topics-today.tpl',
		target: 'node_modules/nodebb-theme-harmony/templates/partials/category/hot-topics-today.tpl',
	},
	{
		source: 'src/views/partials/topic-list-bar.tpl',
		target: 'node_modules/nodebb-theme-harmony/templates/partials/topic-list-bar.tpl',
	},
	{
		source: 'src/views/topic.tpl',
		target: 'node_modules/nodebb-theme-harmony/templates/topic.tpl',
	},
	{
		source: 'src/views/partials/topic/post.tpl',
		target: 'node_modules/nodebb-theme-harmony/templates/partials/topic/post.tpl',
	},
	{
		source: 'src/views/partials/topic/quickreply.tpl',
		target: 'node_modules/nodebb-theme-harmony/templates/partials/topic/quickreply.tpl',
	},
	{
		source: 'src/views/partials/topic/guest-cta.tpl',
		target: 'node_modules/nodebb-theme-harmony/templates/partials/topic/guest-cta.tpl',
	},
	{
		source: 'src/views/composer.tpl',
		target: 'node_modules/nodebb-plugin-composer-default/static/templates/composer.tpl',
	},
	{
		source: 'src/views/partials/composer-title-container.tpl',
		target: 'node_modules/nodebb-plugin-composer-default/static/templates/partials/composer-title-container.tpl',
	},
	{
		source: 'src/views/partials/composer-write-preview.tpl',
		target: 'node_modules/nodebb-plugin-composer-default/static/templates/partials/composer-write-preview.tpl',
	},
	{
		source: 'src/views/partials/composer-formatting.tpl',
		target: 'node_modules/nodebb-plugin-composer-default/static/templates/partials/composer-formatting.tpl',
	},
];

const staticAssets = [
	{
		source: 'nodebb-local-qr.png',
		target: 'public/images/nodebb-local-qr.png',
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
	if (!fs.existsSync(path.join(rootDir, 'node_modules/nodebb-theme-harmony/templates'))) {
		throw new Error('Harmony theme templates were not found under node_modules. Run dependency install first.');
	}
	if (!fs.existsSync(path.join(rootDir, 'node_modules/nodebb-plugin-composer-default/static/templates'))) {
		throw new Error('Composer templates were not found under node_modules. Run dependency install first.');
	}

	overrides.forEach(item => copyOverride(item.source, item.target));
	staticAssets.forEach(item => copyOverride(item.source, item.target));
}

if (require.main === module) {
	main();
}

module.exports = main;

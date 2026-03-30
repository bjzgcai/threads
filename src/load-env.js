'use strict';

const fs = require('fs');
const path = require('path');

let loaded = false;

module.exports = function loadEnvFile() {
	if (loaded) {
		return false;
	}

	const envPath = path.resolve(__dirname, '..', '.env');
	if (!fs.existsSync(envPath)) {
		loaded = true;
		return false;
	}

	const raw = fs.readFileSync(envPath, 'utf-8');
	raw.split(/\r?\n/).forEach((line) => {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) {
			return;
		}

		const idx = trimmed.indexOf('=');
		if (idx === -1) {
			return;
		}

		const key = trimmed.slice(0, idx).trim();
		let value = trimmed.slice(idx + 1).trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
			value = value.slice(1, -1);
		}

		if (!process.env[key]) {
			process.env[key] = value;
		}
	});

	loaded = true;
	return true;
};

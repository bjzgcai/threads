'use strict';

const path = require('path');
const crypto = require('crypto');
const workerpool = require('workerpool');

const pool = workerpool.pool(
	path.join(__dirname, '/password_worker.js'), {
		minWorkers: 1,
	}
);

exports.hash = async function (rounds, password) {
	return await pool.exec('hash', [prehashPassword(password), rounds]);
};

exports.compare = async function (password, hash, shaWrapped) {
	const fakeHash = await getFakeHash();

	if (shaWrapped) {
		password = prehashPassword(password);
	}
	return await pool.exec('compare', [password, hash || fakeHash]);
};

function prehashPassword(password) {
	// This SHA-512 step is a compatibility-preserving bcrypt input wrapper, not the stored password hash.
	// codeql[js/insufficient-password-hash]
	return crypto.createHash('sha512').update(password).digest('hex');
}

let fakeHashCache;
async function getFakeHash() {
	if (fakeHashCache) {
		return fakeHashCache;
	}
	const length = 18;
	const password = crypto.randomBytes(Math.ceil(length / 2))
		.toString('hex').slice(0, length);
	fakeHashCache = await pool.exec('hash', [password, 12]);
	return fakeHashCache;
}

require('./promisify')(exports);

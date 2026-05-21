'use strict';

function parseList(input) {
	return String(input || '')
		.split(',')
		.map(item => item.trim())
		.filter(Boolean);
}

function normalizeIp(ip) {
	return String(ip || '').trim().replace(/^::ffff:/, '');
}

function isValidIpv4(ip) {
	return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) && ip.split('.').every(part => {
		const num = parseInt(part, 10);
		return num >= 0 && num <= 255;
	});
}

function ipv4ToInt(ip) {
	return ip.split('.').reduce((acc, part) => ((acc << 8) >>> 0) + parseInt(part, 10), 0) >>> 0;
}

function parseCidr(rule) {
	const parts = String(rule || '').split('/');
	if (parts.length !== 2) {
		return null;
	}

	const baseIp = normalizeIp(parts[0]);
	const prefix = parseInt(parts[1], 10);
	if (!isValidIpv4(baseIp) || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
		return null;
	}

	const mask = prefix === 0 ? 0 : ((0xffffffff << (32 - prefix)) >>> 0);
	return {
		base: ipv4ToInt(baseIp),
		mask,
	};
}

function matchesRule(ip, rule) {
	const safeIp = normalizeIp(ip);
	const safeRule = String(rule || '').trim();
	if (!safeIp || !safeRule) {
		return false;
	}

	if (safeRule.includes('/')) {
		if (!isValidIpv4(safeIp)) {
			return false;
		}
		const cidr = parseCidr(safeRule);
		if (!cidr) {
			return false;
		}
		const ipInt = ipv4ToInt(safeIp);
		return (ipInt & cidr.mask) === (cidr.base & cidr.mask);
	}

	return safeIp === normalizeIp(safeRule);
}

function matchesAny(ip, rules) {
	return (Array.isArray(rules) ? rules : []).some(rule => matchesRule(ip, rule));
}

module.exports = {
	parseList,
	normalizeIp,
	matchesRule,
	matchesAny,
};

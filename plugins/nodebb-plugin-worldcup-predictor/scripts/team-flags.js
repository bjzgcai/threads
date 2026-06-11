'use strict';

const TEAM_FLAGS = {
	'阿尔及利亚': '🇩🇿',
	'阿根廷': '🇦🇷',
	'埃及': '🇪🇬',
	'澳大利亚': '🇦🇺',
	'奥地利': '🇦🇹',
	'巴拿马': '🇵🇦',
	'巴拉圭': '🇵🇾',
	'巴西': '🇧🇷',
	'比利时': '🇧🇪',
	'波黑': '🇧🇦',
	'波兰': '🇵🇱',
	'佛得角': '🇨🇻',
	'法国': '🇫🇷',
	'哥伦比亚': '🇨🇴',
	'哥斯达黎加': '🇨🇷',
	'韩国': '🇰🇷',
	'荷兰': '🇳🇱',
	'海地': '🇭🇹',
	'加拿大': '🇨🇦',
	'加纳': '🇬🇭',
	'捷克': '🇨🇿',
	'积分待定': '',
	'德国': '🇩🇪',
	'克罗地亚': '🇭🇷',
	'卡塔尔': '🇶🇦',
	'科特迪瓦': '🇨🇮',
	'摩洛哥': '🇲🇦',
	'美国': '🇺🇸',
	'民主刚果': '🇨🇩',
	'墨西哥': '🇲🇽',
	'南非': '🇿🇦',
	'挪威': '🇳🇴',
	'葡萄牙': '🇵🇹',
	'日本': '🇯🇵',
	'瑞典': '🇸🇪',
	'瑞士': '🇨🇭',
	'塞尔维亚': '🇷🇸',
	'塞内加尔': '🇸🇳',
	'沙特': '🇸🇦',
	'苏格兰': '🏴',
	'突尼斯': '🇹🇳',
	'土耳其': '🇹🇷',
	'威尔士': '🏴',
	'乌拉圭': '🇺🇾',
	'乌兹别克斯坦': '🇺🇿',
	'西班牙': '🇪🇸',
	'新西兰': '🇳🇿',
	'英格兰': '🏴',
	'伊朗': '🇮🇷',
	'意大利': '🇮🇹',
	'约旦': '🇯🇴',
};

function normalizeTeamName(name) {
	return String(name || '').trim();
}

function resolveTeamFlag(name, providedFlag) {
	const normalized = normalizeTeamName(name);
	if (String(providedFlag || '').trim()) {
		return String(providedFlag).trim();
	}
	return TEAM_FLAGS[normalized] || '';
}

module.exports = {
	TEAM_FLAGS,
	resolveTeamFlag,
	normalizeTeamName,
};

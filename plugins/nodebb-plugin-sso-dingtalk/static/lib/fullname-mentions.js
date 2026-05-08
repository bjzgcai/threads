'use strict';

$(window).on('composer:autocomplete:init chat:autocomplete:init', function (ev, data) {
	setTimeout(function () {
		if (!shouldUseFullnameMentions(data)) {
			return;
		}

		const strategy = Array.isArray(data && data.strategies) ?
			data.strategies.find(item => item && item.match && String(item.match) === String(/\B@([^\s\n]*)?$/)) :
			null;
		if (!strategy || strategy._dingtalkFullnamePatched) {
			return;
		}

		const originalTemplate = strategy.template;
		const originalReplace = strategy.replace;

		strategy.template = function (entry) {
			if (entry && entry.uid) {
				return buildUserTemplate(entry);
			}
			return originalTemplate ? originalTemplate(entry) : entry;
		};

		strategy.replace = function (mention) {
			if (mention && mention.uid && mention.fullname) {
				return `@${mention.fullname} `;
			}
			return originalReplace ? originalReplace(mention) : mention;
		};

		strategy._dingtalkFullnamePatched = true;
	}, 0);
});

function shouldUseFullnameMentions(data) {
	const categoryIds = Array.isArray(config.dingtalkMentionCategoryIds) ? config.dingtalkMentionCategoryIds : [];
	if (!categoryIds.length) {
		return false;
	}

	const currentCid = getCurrentComposerCid(data);
	return Number.isInteger(currentCid) && categoryIds.includes(currentCid);
}

function getCurrentComposerCid(data) {
	const directCid = parseCid(ajaxify && ajaxify.data && ajaxify.data.cid);
	if (Number.isInteger(directCid)) {
		return directCid;
	}
	return parseCid(data && data.cid);
}

function parseCid(value) {
	const parsed = parseInt(value, 10);
	return Number.isNaN(parsed) ? null : parsed;
}

function buildUserTemplate(entry) {
	const slugText = entry.username || entry.userslug || '';
	return `${escapeHtml(entry.fullname || slugText)} <span class="text-sm text-secondary">(${escapeHtml(slugText)})</span>`;
}

function escapeHtml(value) {
	return String(value || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

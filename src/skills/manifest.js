'use strict';

module.exports = {
	version: 1,
	skills: {
		list_categories: {
			description: 'List visible categories for the current user',
			riskLevel: 'low',
			requiredScopes: ['post:read'],
		},
		latest_topics: {
			description: 'Get the latest visible topics for the current user',
			riskLevel: 'low',
			requiredScopes: ['post:read'],
		},
		unread_topics: {
			description: 'Get unread topics for the current user',
			riskLevel: 'low',
			requiredScopes: ['post:read'],
		},
		search_topics: {
			description: 'Search topics/posts by keyword',
			riskLevel: 'low',
			requiredScopes: ['post:read'],
		},
		get_post_raw: {
			description: 'Get raw content for a post by pid',
			riskLevel: 'low',
			requiredScopes: ['post:read'],
		},
		create_topic_or_reply: {
			description: 'Create a new topic or reply to an existing topic',
			riskLevel: 'high',
			requiredScopes: ['post:write'],
		},
	},
};

'use strict';

module.exports = {
	version: 1,
	skills: {
		list_categories: {
			description: 'List visible categories for the current user',
			riskLevel: 'low',
			access: 'public-read',
			requiredScopes: [],
		},
		latest_topics: {
			description: 'Get the latest visible topics for the current user',
			riskLevel: 'low',
			access: 'public-read',
			requiredScopes: [],
		},
		unread_topics: {
			description: 'Get unread topics for the current user, or public unread-style topic listings for guests',
			riskLevel: 'low',
			access: 'public-read',
			requiredScopes: [],
		},
		department_daily_digest: {
			description: 'Get today\'s relevant auto-published article topics for a department or person profile',
			riskLevel: 'low',
			access: 'public-read',
			requiredScopes: [],
		},
		search_topics: {
			description: 'Search topics/posts by keyword',
			riskLevel: 'low',
			access: 'public-read',
			requiredScopes: [],
		},
		get_post_raw: {
			description: 'Get raw content for a post by pid',
			riskLevel: 'low',
			access: 'public-read',
			requiredScopes: [],
		},
		create_topic_or_reply: {
			description: 'Create a new topic or reply to an existing topic',
			riskLevel: 'high',
			access: 'token-write',
			requiredScopes: ['post:write'],
		},
		search_own_posts: {
			description: 'Search or list posts created by the token owner',
			riskLevel: 'low',
			access: 'token-write',
			requiredScopes: ['post:read'],
		},
		delete_own_topics: {
			description: 'Soft-delete up to 5 topics created by the current user',
			riskLevel: 'high',
			access: 'token-write',
			requiredScopes: ['post:write'],
		},
		delete_own_posts: {
			description: 'Soft-delete up to 5 posts created by the current user',
			riskLevel: 'high',
			access: 'token-write',
			requiredScopes: ['post:write'],
		},
	},
};

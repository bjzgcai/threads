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
		search_own_posts: {
			description: 'Search or list posts created by the current user',
			riskLevel: 'low',
			requiredScopes: ['post:read'],
		},
		delete_own_topics: {
			description: 'Soft-delete up to 5 topics created by the current user',
			riskLevel: 'high',
			requiredScopes: ['post:write'],
		},
		delete_own_posts: {
			description: 'Soft-delete up to 5 posts created by the current user',
			riskLevel: 'high',
			requiredScopes: ['post:write'],
		},
	},
};

'use strict';

define('topicFilterPrefs', ['api', 'storage'], function (api, storage) {
	const prefs = {};
	const ROUTES = new Set(['recent', 'unread']);
	const FILTER_KEYS = ['cid', 'tag', 'filter', 'term'];
	const STORAGE_KEY = 'topicFilterPrefs:v1';

	prefs.restoreIfNeeded = function (route) {
		if (!shouldHandle(route) || hasFilterParams(utils.params())) {
			return false;
		}

		const saved = normalizeParams(getSavedForRoute(route));
		if (!hasFilterParams(saved)) {
			return false;
		}

		let url = `${config.relative_path}/${route}`;
		const query = $.param(saved);
		if (query) {
			url += `?${query}`;
		}
		ajaxify.go(url);
		return true;
	};

	prefs.saveCurrent = async function (params) {
		const route = getRoute();
		if (!shouldHandle(route)) {
			return;
		}

		const saved = normalizeParams(params || utils.params());
		const allPrefs = {
			...getLocalPrefs(),
			...(ajaxify.data.savedTopicFiltersAll || {}),
		};
		allPrefs[route] = saved;
		ajaxify.data.savedTopicFilters = saved;
		ajaxify.data.savedTopicFiltersAll = allPrefs;
		saveLocalPrefs(allPrefs);

		if (!app.user || !parseInt(app.user.uid, 10)) {
			return;
		}

		await api.put(`/users/${app.user.uid}/settings`, {
			settings: {
				savedTopicFilters: JSON.stringify(allPrefs),
			},
		});
	};

	prefs.initLinkPersistence = function (route) {
		if (!shouldHandle(route)) {
			return;
		}

		$('[component="category/controls"]').off('click.topicFilterPrefs').on(
			'click.topicFilterPrefs',
			'.dropdown-menu a[href]',
			function (ev) {
				const href = $(this).attr('href');
				if (!href || href === '#' || href.startsWith('http')) {
					return;
				}

				const target = new URL(href, window.location.origin);
				const targetRoute = target.pathname.replace(config.relative_path, '').replace(/^\/+/, '').split('/')[0];
				if (targetRoute !== route) {
					return;
				}

				ev.preventDefault();
				const params = {};
				FILTER_KEYS.forEach((key) => {
					const values = target.searchParams.getAll(key);
					if (values.length > 1) {
						params[key] = values;
					} else if (values.length === 1) {
						params[key] = values[0];
					}
				});

				prefs.saveCurrent(params).finally(function () {
					ajaxify.go(target.pathname + target.search);
				});
			}
		);
	};

	function getRoute() {
		if (ajaxify.data.template && ajaxify.data.template.recent) {
			return 'recent';
		}
		if (ajaxify.data.template && ajaxify.data.template.unread) {
			return 'unread';
		}
		return String(ajaxify.data.template && ajaxify.data.template.name || '').replace(/^forum\//, '');
	}

	function shouldHandle(route) {
		return ROUTES.has(route);
	}

	function hasFilterParams(params) {
		return FILTER_KEYS.some(key => params && params[key] !== undefined && params[key] !== '' &&
			(!Array.isArray(params[key]) || params[key].length));
	}

	function normalizeParams(params) {
		const normalized = {};
		FILTER_KEYS.forEach((key) => {
			if (params[key] === undefined || params[key] === '') {
				return;
			}
			if (Array.isArray(params[key])) {
				const values = params[key].map(String).filter(Boolean);
				if (values.length) {
					normalized[key] = values;
				}
			} else {
				normalized[key] = String(params[key]);
			}
		});
		return normalized;
	}

	function getSavedForRoute(route) {
		const serverPrefs = ajaxify.data.savedTopicFiltersAll || {};
		const localPrefs = getLocalPrefs();
		return ajaxify.data.savedTopicFilters || serverPrefs[route] || localPrefs[route] || {};
	}

	function getLocalPrefs() {
		try {
			return JSON.parse(storage.getItem(STORAGE_KEY) || '{}') || {};
		} catch (err) {
			return {};
		}
	}

	function saveLocalPrefs(allPrefs) {
		try {
			storage.setItem(STORAGE_KEY, JSON.stringify(allPrefs || {}));
		} catch (err) {
			// Ignore storage failures; logged-in users still get server-side persistence.
		}
	}

	return prefs;
});

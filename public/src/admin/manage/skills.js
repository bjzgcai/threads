'use strict';

define('admin/manage/skills', ['api', 'bootbox', 'alerts'], function (api, bootbox, alerts) {
	const ACP = {};

	ACP.init = function () {
		bindFilters();
		bindRevoke();
	};

	function bindFilters() {
		$('[data-action="apply-filters"]').on('click', applyFilters);
		$('#skill-token-query, #skill-token-uid').on('keydown', function (ev) {
			if (ev.key === 'Enter') {
				ev.preventDefault();
				applyFilters();
			}
		});
		$('#results-per-page').on('change', applyFilters);
	}

	function applyFilters() {
		const params = new URLSearchParams();
		const query = $('#skill-token-query').val().trim();
		const uid = $('#skill-token-uid').val().trim();
		const resultsPerPage = $('#results-per-page').val();

		if (query) {
			params.set('query', query);
		}
		if (uid) {
			params.set('uid', uid);
		}
		if (resultsPerPage) {
			params.set('resultsPerPage', resultsPerPage);
		}

		const nextUrl = `${config.relative_path}/admin/manage/skills${params.toString() ? `?${params.toString()}` : ''}`;
		ajaxify.go(nextUrl);
	}

	function bindRevoke() {
		$('[component="admin/skills/tokens"]').on('click', '[data-action="revoke-skill-token"]', function () {
			const rowEl = this.closest('[data-token]');
			const token = rowEl && rowEl.getAttribute('data-token');
			if (!token) {
				return;
			}

			bootbox.confirm('Revoke this user token? The linked external agent will lose access immediately.', async function (confirmed) {
				if (!confirmed) {
					return;
				}

				try {
					await api.del(`/api/admin/manage/skills/${encodeURIComponent(token)}`);
					rowEl.remove();
					alerts.success('Skills token revoked');

					if (!$('[component="admin/skills/tokens"] tbody [data-token]').length) {
						ajaxify.refresh();
					}
				} catch (err) {
					alerts.error(err);
				}
			});
		});
	}

	return ACP;
});

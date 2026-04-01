'use strict';


define('forum/account/skills', ['forum/account/header', 'api', 'bootbox', 'alerts', 'translator'], function (header, api, bootbox, alerts, translator) {
	const AccountSkills = {};
	const t = {};

	AccountSkills.init = function () {
		header.init();
		loadTranslations().then(() => {
			bindCreate();
			bindRoll();
			bindRevoke();
		}).catch(alerts.error);
	};

	async function loadTranslations() {
		const keys = [
			'[[skills:modal.create.title]]',
			'[[skills:modal.create.name]]',
			'[[skills:modal.create.name-placeholder]]',
			'[[skills:modal.create.name-help]]',
			'[[skills:error.name-required]]',
			'[[skills:modal.create.scopes]]',
			'[[skills:modal.create.scope-read]]',
			'[[skills:modal.create.scope-write]]',
			'[[skills:modal.create.scopes-help]]',
			'[[skills:modal.create.expiry]]',
			'[[skills:modal.create.expiry-30]]',
			'[[skills:modal.create.expiry-90]]',
			'[[skills:modal.create.expiry-180]]',
			'[[skills:modal.create.expiry-365]]',
			'[[skills:modal.create.expiry-never]]',
			'[[skills:modal.create.expiry-help]]',
			'[[skills:modal.create.cancel]]',
			'[[skills:modal.create.submit]]',
			'[[skills:modal.created.title]]',
			'[[skills:modal.created.warning]]',
			'[[skills:modal.created.scopes]]',
			'[[skills:modal.created.expiry]]',
			'[[skills:modal.created.never-expires]]',
			'[[skills:modal.created.token]]',
			'[[skills:modal.created.copy]]',
			'[[skills:modal.created.done]]',
			'[[skills:modal.roll.confirm]]',
			'[[skills:modal.revoke.confirm]]',
			'[[skills:alert.copied]]',
			'[[skills:alert.copy-failed]]',
			'[[skills:alert.revoked]]',
			'[[skills:alert.rolled]]',
		];
		const translated = await Promise.all(keys.map(key => translator.translate(key)));
		[
			t.createTitle,
			t.nameLabel,
			t.namePlaceholder,
			t.nameHelp,
			t.nameRequired,
			t.scopesLabel,
			t.scopeRead,
			t.scopeWrite,
			t.scopesHelp,
			t.expiryLabel,
			t.expiry30,
			t.expiry90,
			t.expiry180,
			t.expiry365,
			t.expiryNever,
			t.expiryHelp,
			t.cancel,
			t.createSubmit,
			t.createdTitle,
			t.createdWarning,
			t.createdScopes,
			t.createdExpiry,
			t.createdNeverExpires,
			t.createdToken,
			t.copy,
			t.done,
			t.rollConfirm,
			t.revokeConfirm,
			t.copied,
			t.copyFailed,
			t.revoked,
			t.rolled,
		] = translated;
	}

	function bindCreate() {
		$('[data-action="create-skill-token"]').on('click', async function () {
			const dialog = bootbox.dialog({
				title: t.createTitle,
				message: [
					'<form component="account/skills/create-form" class="d-flex flex-column gap-3">',
					'  <div>',
					`    <label class="form-label" for="skill-token-name">${utils.escapeHTML(t.nameLabel)}</label>`,
					`    <input id="skill-token-name" name="name" type="text" class="form-control" maxlength="128" required placeholder="${utils.escapeHTML(t.namePlaceholder)}" />`,
					`    <div class="form-text">${utils.escapeHTML(t.nameHelp)}</div>`,
					'  </div>',
					'  <div>',
					`    <label class="form-label d-block mb-2">${utils.escapeHTML(t.scopesLabel)}</label>`,
					'    <div class="form-check">',
					'      <input class="form-check-input" type="checkbox" id="scope-post-read" name="scopes" value="post:read" checked />',
					`      <label class="form-check-label" for="scope-post-read">${utils.escapeHTML(t.scopeRead)} <code>post:read</code></label>`,
					'    </div>',
					'    <div class="form-check">',
					'      <input class="form-check-input" type="checkbox" id="scope-post-write" name="scopes" value="post:write" />',
					`      <label class="form-check-label" for="scope-post-write">${utils.escapeHTML(t.scopeWrite)} <code>post:write</code></label>`,
					'    </div>',
					`    <div class="form-text">${utils.escapeHTML(t.scopesHelp)}</div>`,
					'  </div>',
					'  <div>',
					`    <label class="form-label" for="skill-token-expiry">${utils.escapeHTML(t.expiryLabel)}</label>`,
					'    <select id="skill-token-expiry" name="expiresInDays" class="form-select">',
					`      <option value="30">${utils.escapeHTML(t.expiry30)}</option>`,
					`      <option value="90" selected>${utils.escapeHTML(t.expiry90)}</option>`,
					`      <option value="180">${utils.escapeHTML(t.expiry180)}</option>`,
					`      <option value="365">${utils.escapeHTML(t.expiry365)}</option>`,
					`      <option value="0">${utils.escapeHTML(t.expiryNever)}</option>`,
					'    </select>',
					`    <div class="form-text">${utils.escapeHTML(t.expiryHelp)}</div>`,
					'  </div>',
					'</form>',
				].join(''),
				buttons: {
					cancel: {
						label: t.cancel,
						className: 'btn-light',
					},
					confirm: {
						label: t.createSubmit,
						className: 'btn-primary',
						callback: async function () {
							const modal = this;
							const formEl = modal.find('form').get(0);
							if (!formEl) {
								return false;
							}

							const nameInput = formEl.querySelector('[name="name"]');
							const payload = {
								name: nameInput.value.trim(),
								scopes: Array.from(formEl.querySelectorAll('[name="scopes"]:checked')).map(el => el.value),
								expiresInDays: formEl.querySelector('[name="expiresInDays"]').value,
							};

							if (!payload.name) {
								nameInput.focus();
								nameInput.classList.add('is-invalid');
								alerts.error(t.nameRequired);
								return false;
							}

							try {
								const tokenObj = await api.post('/api/skills/tokens', payload);
								modal.modal('hide');
								showCreatedToken(tokenObj);
							} catch (err) {
								alerts.error(err);
							}
							return false;
						},
					},
				},
			});

			setTimeout(() => {
				const nameInput = dialog.find('#skill-token-name');
				nameInput.on('input', function () {
					this.classList.remove('is-invalid');
				});
				nameInput.trigger('focus');
			}, 50);
		});
	}

	function showCreatedToken(tokenObj) {
		const rawToken = tokenObj && tokenObj.token ? tokenObj.token : '';
		const scopeText = formatScopes(tokenObj && tokenObj.scopes);
		const expiryText = tokenObj && tokenObj.expiresAt ? formatDateTime(tokenObj.expiresAt) : t.createdNeverExpires;
		const dialog = bootbox.dialog({
			title: t.createdTitle,
			message: [
				'<div class="d-flex flex-column gap-3">',
				`  <div class="alert alert-warning mb-0">${utils.escapeHTML(t.createdWarning)}</div>`,
				'  <div>',
				`    <div class="small text-muted mb-1">${utils.escapeHTML(t.createdScopes)}</div>`,
				`    <div class="fw-semibold">${utils.escapeHTML(scopeText)}</div>`,
				'  </div>',
				'  <div>',
				`    <div class="small text-muted mb-1">${utils.escapeHTML(t.createdExpiry)}</div>`,
				`    <div class="fw-semibold">${utils.escapeHTML(expiryText)}</div>`,
				'  </div>',
				'  <div>',
				`    <label class="form-label" for="created-skill-token">${utils.escapeHTML(t.createdToken)}</label>`,
				`    <textarea id="created-skill-token" class="form-control font-monospace" rows="4" readonly>${utils.escapeHTML(rawToken)}</textarea>`,
				'  </div>',
				'</div>',
			].join(''),
			buttons: {
				copy: {
					label: t.copy,
					className: 'btn-primary',
					callback: function () {
						const textarea = dialog.find('#created-skill-token').get(0);
						if (!textarea) {
							alerts.error(t.copyFailed);
							return false;
						}

						copyText(textarea).then(() => {
							alerts.success(t.copied);
						}).catch((err) => {
							console.error(err);
							alerts.error(t.copyFailed);
						});
						return false;
					},
				},
				done: {
					label: t.done,
					className: 'btn-light',
				},
			},
		});

		dialog.on('hidden.bs.modal', function () {
			ajaxify.refresh();
		});

		setTimeout(() => {
			const textarea = dialog.find('#created-skill-token').get(0);
			if (textarea) {
				textarea.focus();
				textarea.select();
				if (textarea.setSelectionRange) {
					textarea.setSelectionRange(0, textarea.value.length);
				}
			}
		}, 50);
	}

	function formatScopes(scopes) {
		const values = Array.isArray(scopes) ? scopes : [];
		if (!values.length) {
			return '';
		}

		const labels = {
			'post:read': t.scopeRead,
			'post:write': t.scopeWrite,
		};
		return values.map(scope => labels[scope] || scope).join(' / ');
	}

	function formatDateTime(value) {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) {
			return '';
		}

		const pad = num => String(num).padStart(2, '0');
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
	}

	function bindRoll() {
		$('[component="account/skills/tokens"]').on('click', '[data-action="roll-skill-token"]', function () {
			const rowEl = this.closest('[data-token]');
			const token = rowEl && rowEl.getAttribute('data-token');
			if (!token) {
				return;
			}

			bootbox.confirm(t.rollConfirm, async function (confirmed) {
				if (!confirmed) {
					return;
				}

				try {
					const tokenObj = await api.post(`/api/skills/tokens/${encodeURIComponent(token)}/roll`);
					showCreatedToken(tokenObj);
					alerts.success(t.rolled);
				} catch (err) {
					alerts.error(err);
				}
			});
		});
	}

	function bindRevoke() {
		$('[component="account/skills/tokens"]').on('click', '[data-action="revoke-skill-token"]', function () {
			const rowEl = this.closest('[data-token]');
			const token = rowEl && rowEl.getAttribute('data-token');
			if (!token) {
				return;
			}

			bootbox.confirm(t.revokeConfirm, async function (confirmed) {
				if (!confirmed) {
					return;
				}

				try {
					await api.del(`/api/skills/tokens/${encodeURIComponent(token)}`);
					rowEl.remove();
					alerts.success(t.revoked);

					if (!$('[component="account/skills/tokens"] tbody [data-token]').length) {
						ajaxify.refresh();
					}
				} catch (err) {
					alerts.error(err);
				}
			});
		});
	}

	function copyText(textarea) {
		const text = textarea && textarea.value ? textarea.value : '';
		if (!text) {
			return Promise.reject(new Error('empty-token'));
		}

		textarea.focus();
		textarea.select();
		if (textarea.setSelectionRange) {
			textarea.setSelectionRange(0, text.length);
		}

		if (window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText) {
			return navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
		}

		return legacyCopy(text);
	}

	function legacyCopy(text) {
		return new Promise((resolve, reject) => {
			const tempEl = document.createElement('textarea');
			tempEl.value = text;
			tempEl.setAttribute('readonly', 'readonly');
			tempEl.style.position = 'fixed';
			tempEl.style.left = '0';
			tempEl.style.top = '0';
			tempEl.style.opacity = '0';
			document.body.appendChild(tempEl);
			tempEl.focus();
			tempEl.select();
			if (tempEl.setSelectionRange) {
				tempEl.setSelectionRange(0, text.length);
			}

			try {
				const copied = document.execCommand('copy');
				if (!copied) {
					throw new Error('copy-command-failed');
				}
				resolve(true);
			} catch (err) {
				reject(err);
			} finally {
				document.body.removeChild(tempEl);
			}
		});
	}

	return AccountSkills;
});

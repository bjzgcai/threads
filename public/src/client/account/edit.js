'use strict';

define('forum/account/edit', [
	'forum/account/header',
	'accounts/picture',
	'translator',
	'api',
	'hooks',
	'bootbox',
	'alerts',
	'admin/modules/change-email',
], function (header, picture, translator, api, hooks, bootbox, alerts, changeEmail) {
	const AccountEdit = {};

	AccountEdit.init = function () {
		header.init();
		applyAccountEditGuards();

		$('#submitBtn').on('click', updateProfile);

		if (ajaxify.data.groupTitleArray.length === 1 && ajaxify.data.groupTitleArray[0] === '') {
			$('#groupTitle option[value=""]').attr('selected', true);
		}

		handleAccountDelete();
		handleEmailConfirm();
		updateSignature();
		updateAboutMe();
		handleGroupControls();

		if (!ajaxify.data.isSelf && ajaxify.data.canEdit) {
			$(`a[href="${config.relative_path}/user/${ajaxify.data.userslug}/edit/email"]`).on('click', () => {
				changeEmail.init({
					uid: ajaxify.data.uid,
					email: ajaxify.data.email,
					onSuccess: function () {
						alerts.success('[[user:email-updated]]');
					},
				});
				return false;
			});
		}
	};

	function applyAccountEditGuards() {
		const isDingTalkAccount = !!ajaxify.data.disableCredentialEdit;
		if (!isDingTalkAccount) {
			return;
		}

		// Hide dangerous/desired-disabled actions even if theme templates are outdated.
		$('#deleteAccountBtn').closest('.d-flex').remove();
		$(`a[href="${config.relative_path}/user/${ajaxify.data.userslug}/edit/email"]`).closest('li').remove();
		$(`a[href="${config.relative_path}/user/${ajaxify.data.userslug}/edit/password"]`).closest('li').remove();

		// Rename "fullname" -> "姓名" and make it read-only.
		const fullnameLabel = $('label[for="fullname"]');
		const fullnameInput = $('#fullname');
		if (fullnameLabel.length) {
			fullnameLabel.text('姓名');
		}
		if (fullnameInput.length) {
			fullnameInput.attr('readonly', true).attr('disabled', true);
		}

		// Add quick-edit icon near @username in header, jump to username edit page.
		const usernameDisableEdit = !!ajaxify.data['username:disableEdit'];
		const usernameEl = $('.account .username.fw-bold').first();
		if (!usernameDisableEdit && usernameEl.length && !$('#quick-edit-username').length) {
			const usernameEditUrl = `${config.relative_path}/user/${ajaxify.data.userslug}/edit/username`;
			const quickEditHtml = `
				<a id="quick-edit-username" class="text-decoration-none text-secondary ms-1" href="${usernameEditUrl}" title="编辑花名" aria-label="编辑花名">
					<i class="fa fa-pencil"></i>
				</a>
			`;
			usernameEl.after(quickEditHtml);
		}

		// Inject a readonly email field when template does not include it.
		if (!$('#readonly-email').length) {
			const emailValue = ajaxify.data.email ? ajaxify.data.email : '-';
			translator.translate('[[user:email]]', (translatedEmailLabel) => {
				const emailBlock = `
					<div class="mb-3">
						<label class="form-label fw-bold" for="readonly-email">${escapeHtml(translatedEmailLabel)}</label>
						<input class="form-control" type="text" id="readonly-email" value="${escapeHtml(emailValue)}" readonly disabled>
					</div>
				`;
				const fullnameBlock = $('#fullname').closest('.mb-3');
				if (fullnameBlock.length) {
					fullnameBlock.after(emailBlock);
				}
			});
		}
	}

	function escapeHtml(value) {
		return String(value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function updateProfile() {
		function getGroupSelection() {
			const els = $('[component="group/badge/list"] [component="group/badge/item"][data-selected="true"]');
			return els.map((i, el) => $(el).attr('data-value')).get();
		}
		const editForm = $('form[component="profile/edit/form"]');
		const userData = editForm.serializeObject();

		// stringify multi selects
		editForm.find('select[multiple]').each((i, el) => {
			const name = $(el).attr('name');
			if (userData[name] && !Array.isArray(userData[name])) {
				userData[name] = [userData[name]];
			}
			userData[name] = JSON.stringify(userData[name] || []);
		});

		userData.uid = ajaxify.data.uid;
		userData.groupTitle = userData.groupTitle || '';
		userData.groupTitle = JSON.stringify(getGroupSelection());

		hooks.fire('action:profile.update', userData);

		api.put('/users/' + userData.uid, userData).then((res) => {
			alerts.success('[[user:profile-update-success]]');

			if (res.picture) {
				$('#user-current-picture').attr('src', res.picture);
			}

			picture.updateHeader(res.picture);
		}).catch(alerts.error);

		return false;
	}



	function handleAccountDelete() {
		$('#deleteAccountBtn').on('click', function () {
			translator.translate('[[user:delete-account-confirm]]', function (translated) {
				const modal = bootbox.confirm(translated + '<p><input type="password" class="form-control" id="confirm-password" /></p>', function (confirm) {
					if (!confirm) {
						return;
					}

					const confirmBtn = modal.find('.btn-primary');
					confirmBtn.html('<i class="fa fa-spinner fa-spin"></i>');
					confirmBtn.prop('disabled', true);
					api.del(`/users/${ajaxify.data.uid}/account`, {
						password: $('#confirm-password').val(),
					}, function (err) {
						function restoreButton() {
							translator.translate('[[modules:bootbox.confirm]]', function (confirmText) {
								confirmBtn.text(confirmText);
								confirmBtn.prop('disabled', false);
							});
						}

						if (err) {
							restoreButton();
							return alerts.error(err);
						}

						confirmBtn.html('<i class="fa fa-check"></i>');
						window.location.href = `${config.relative_path}/`;
					});

					return false;
				});

				modal.on('shown.bs.modal', function () {
					modal.find('input').focus();
				});
			});
			return false;
		});
	}

	function handleEmailConfirm() {
		$('#confirm-email').on('click', function () {
			const btn = $(this).attr('disabled', true);
			socket.emit('user.emailConfirm', {}, function (err) {
				btn.removeAttr('disabled');
				if (err) {
					return alerts.error(err);
				}
				alerts.success('[[notifications:email-confirm-sent]]');
			});
		});
	}

	function getCharsLeft(el, max) {
		return el.length ? '(' + el.val().length + '/' + max + ')' : '';
	}

	function updateSignature() {
		const el = $('#signature');
		$('#signatureCharCountLeft').html(getCharsLeft(el, ajaxify.data.maximumSignatureLength));

		el.on('keyup change', function () {
			$('#signatureCharCountLeft').html(getCharsLeft(el, ajaxify.data.maximumSignatureLength));
		});
	}

	function updateAboutMe() {
		const el = $('#aboutme');
		$('#aboutMeCharCountLeft').html(getCharsLeft(el, ajaxify.data.maximumAboutMeLength));

		el.on('keyup change', function () {
			$('#aboutMeCharCountLeft').html(getCharsLeft(el, ajaxify.data.maximumAboutMeLength));
		});
	}

	function handleGroupControls() {
		const { allowMultipleBadges } = ajaxify.data;
		$('[component="group/toggle/hide"]').on('click', function () {
			const groupEl = $(this).parents('[component="group/badge/item"]');
			groupEl.attr('data-selected', 'false');
			$(this).addClass('hidden');
			groupEl.find('[component="group/toggle/show"]').removeClass('hidden');
		});

		$('[component="group/toggle/show"]').on('click', function () {
			if (!allowMultipleBadges) {
				$('[component="group/badge/list"] [component="group/toggle/show"]').removeClass('hidden');
				$('[component="group/badge/list"] [component="group/toggle/hide"]').addClass('hidden');
				$('[component="group/badge/list"] [component="group/badge/item"]').attr('data-selected', 'false');
			}
			const groupEl = $(this).parents('[component="group/badge/item"]');
			groupEl.attr('data-selected', 'true');
			$(this).addClass('hidden');
			groupEl.find('[component="group/toggle/hide"]').removeClass('hidden');
		});

		$('[component="group/order/up"]').on('click', function () {
			const el = $(this).parents('[component="group/badge/item"]');
			el.insertBefore(el.prev());
		});
		$('[component="group/order/down"]').on('click', function () {
			const el = $(this).parents('[component="group/badge/item"]');
			el.insertAfter(el.next());
		});
	}

	return AccountEdit;
});

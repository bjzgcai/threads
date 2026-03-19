'use strict';

define('forum/account/edit/username', [
	'forum/account/header', 'api', 'slugify', 'alerts',
], function (header, api, slugify, alerts) {
	const AccountEditUsername = {};

	AccountEditUsername.init = function () {
		header.init();
		const isDingTalkAccount = !!ajaxify.data.disableCredentialEdit;
		let wuxiaPicker = null;
		if (isDingTalkAccount) {
			$('#inputCurrentPassword').closest('.mb-3').remove();
			wuxiaPicker = initWuxiaPicker(ajaxify.data.wuxiaNicknames || []);
		}

		$('#submitBtn').on('click', function updateUsername() {
			const userData = {
				uid: $('#inputUID').val(),
				username: wuxiaPicker ? wuxiaPicker.getSelectedCharacter() : $('#inputNewUsername').val(),
			};
			if (!isDingTalkAccount) {
				userData.password = $('#inputCurrentPassword').val();
			}

			if (wuxiaPicker && !userData.username) {
				return alerts.error('请选择花名');
			}

			if (!userData.username) {
				return;
			}

			if (userData.password && userData.username === userData.password) {
				return alerts.error('[[user:username-same-as-password]]');
			}

			const btn = $(this);
			btn.addClass('disabled').find('i').removeClass('hide');

			api.put('/users/' + userData.uid, userData).then((response) => {
				const userslug = slugify(userData.username);
				if (userData.username && userslug && parseInt(userData.uid, 10) === parseInt(app.user.uid, 10)) {
					$('[component="header/profilelink"]').attr('href', config.relative_path + '/user/' + userslug);
					$('[component="header/profilelink/edit"]').attr('href', config.relative_path + '/user/' + userslug + '/edit');
					$('[component="header/profilelink/settings"]').attr('href', config.relative_path + '/user/' + userslug + '/settings');
					$('[component="header/username"]').text(userData.username);
					$('[component="header/usericon"]').css('background-color', response['icon:bgColor']).text(response['icon:text']);
					$('[component="avatar/icon"]').css('background-color', response['icon:bgColor']).text(response['icon:text']);
				}

				ajaxify.go('user/' + userslug + '/edit');
			}).catch(alerts.error)
				.finally(() => {
					btn.removeClass('disabled').find('i').addClass('hide');
				});

			return false;
		});
	};

	function initWuxiaPicker(novelsData) {
		const usernameInput = $('#inputNewUsername');
		if (!usernameInput.length) {
			return null;
		}
		const novels = Array.isArray(novelsData) ? novelsData.filter(item =>
			item && item.novel && Array.isArray(item.characters) && item.characters.length
		) : [];
		if (!novels.length) {
			return null;
		}

		usernameInput.attr('readonly', true);
		const currentUsername = String(usernameInput.val() || '').trim();
		const pickerHtml = [
			'<div id="wuxia-nickname-picker" class="mb-3">',
			'  <label class="form-label fw-bold" for="wuxiaNovelSelect">小说</label>',
			'  <select class="form-select mb-2" id="wuxiaNovelSelect"></select>',
			'  <label class="form-label fw-bold" for="wuxiaCharacterSelect">人物花名</label>',
			'  <select class="form-select" id="wuxiaCharacterSelect"></select>',
			'</div>',
		].join('');

		const parent = usernameInput.closest('.mb-3');
		if (parent.length) {
			parent.after(pickerHtml);
		}
		const novelSelect = $('#wuxiaNovelSelect');
		const characterSelect = $('#wuxiaCharacterSelect');

		novelSelect.append('<option value="">请选择小说</option>');
		novels.forEach((item, index) => {
			const optionText = item.group ? `${item.group} / ${item.novel}` : item.novel;
			novelSelect.append(`<option value="${index}">${escapeHtml(optionText)}</option>`);
		});
		const populateCharacters = function (novelIndex, selectedName) {
			characterSelect.empty();
			characterSelect.append('<option value="">请选择花名</option>');
			const target = novels[novelIndex];
			if (!target) {
				usernameInput.val('');
				return;
			}
			target.characters.forEach((name) => {
				const escaped = escapeHtml(name);
				const selected = selectedName && selectedName === name ? ' selected' : '';
				characterSelect.append(`<option value="${escaped}"${selected}>${escaped}</option>`);
			});
			usernameInput.val(selectedName || '');
		};

		novelSelect.on('change', function onNovelChange() {
			populateCharacters($(this).val(), '');
		});

		characterSelect.on('change', function onCharacterChange() {
			const selected = String($(this).val() || '').trim();
			usernameInput.val(selected);
		});

		let matchedNovelIndex = '';
		if (currentUsername) {
			const idx = novels.findIndex(item => item.characters.includes(currentUsername));
			if (idx !== -1) {
				matchedNovelIndex = String(idx);
				novelSelect.val(matchedNovelIndex);
				populateCharacters(matchedNovelIndex, currentUsername);
			}
		}
		if (!matchedNovelIndex) {
			populateCharacters('', '');
		}

		return {
			getSelectedCharacter: function getSelectedCharacter() {
				return String(characterSelect.val() || '').trim();
			},
		};
	}

	function escapeHtml(value) {
		return String(value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	return AccountEditUsername;
});

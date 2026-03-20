'use strict';

define('forum/account/edit/username', [
	'forum/account/header', 'api', 'slugify', 'alerts',
], function (header, api, slugify, alerts) {
	const AccountEditUsername = {};

	AccountEditUsername.init = function () {
		header.init();

		const isDingTalkAccount = !!ajaxify.data.disableCredentialEdit;
		const usernameInput = $('#inputNewUsername');
		const submitBtn = $('#submitBtn');
		const currentUsername = String(usernameInput.val() || '').trim();
		let selectedCharacter = '';

		if (isDingTalkAccount) {
			$('#inputCurrentPassword').closest('.mb-3').remove();
			ensureWuxiaPickerMarkup(usernameInput, ajaxify.data.wuxiaNicknames || []);
			initWuxiaPicker(
				ajaxify.data.wuxiaNicknames || [],
				ajaxify.data.takenWuxiaNicknames || [],
				usernameInput,
				function (name) {
					selectedCharacter = String(name || '').trim();
				}
			);
			initUsernameAvailability(usernameInput, currentUsername, submitBtn);
		}

		submitBtn.on('click', function updateUsername() {
			const typedUsername = String(usernameInput.val() || '').trim();
			const userData = {
				uid: $('#inputUID').val(),
				username: typedUsername || selectedCharacter,
			};

			if (!isDingTalkAccount) {
				userData.password = $('#inputCurrentPassword').val();
			}

			if (!userData.username) {
				return alerts.error('请输入花名');
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

	function ensureWuxiaPickerMarkup(usernameInput, novelsData) {
		if ($('#wuxiaNovelSelect').length || !Array.isArray(novelsData) || !novelsData.length) {
			return;
		}

		const firstField = usernameInput.closest('.mb-3');
		if (!firstField.length) {
			return;
		}

		const pickerMarkup = [
			'<div id="wuxia-picker-wrapper">',
			'<div class="mb-3">',
			'<label class="form-label fw-semibold text-sm" for="wuxiaNovelSelect">小说</label>',
			'<select class="form-select" id="wuxiaNovelSelect"><option value="">请选择小说</option></select>',
			'</div>',
			'<div class="mb-3">',
			'<label class="form-label fw-semibold text-sm" for="wuxiaCharacterSearch">人物花名</label>',
			'<input class="form-control mb-2" type="text" id="wuxiaCharacterSearch" placeholder="搜索或选择人物花名" disabled>',
			'<div id="wuxiaCharacterResults" class="list-group small border rounded overflow-auto" style="max-height: 280px;">',
			'<div class="list-group-item text-muted">请先选择小说</div>',
			'</div>',
			'<div class="form-text text-muted">如需自定义花名，可直接在上方输入框手动填写；也可以在这里搜索后直接点选人物花名。</div>',
			'</div>',
			'</div>',
		].join('');

		firstField.after($(pickerMarkup));
	}

	function initWuxiaPicker(novelsData, takenNamesData, usernameInput, onCharacterSelected) {
		const novelSelect = $('#wuxiaNovelSelect');
		const characterSearch = $('#wuxiaCharacterSearch');
		const characterResults = $('#wuxiaCharacterResults');
		const currentUsername = String(usernameInput.val() || '').trim();
		const novels = Array.isArray(novelsData) ? novelsData.filter(item =>
			item && item.novel && Array.isArray(item.characters) && item.characters.length
		) : [];
		const takenNames = new Set(Array.isArray(takenNamesData) ? takenNamesData : []);
		let allCharacters = [];

		if (!novelSelect.length || !characterSearch.length || !characterResults.length || !novels.length) {
			return;
		}

		if (!novelSelect.children().length || novelSelect.children().length === 1) {
			novelSelect.html('<option value="">请选择小说</option>');
			novels.forEach((item, index) => {
				novelSelect.append($('<option></option>').attr('value', String(index)).text(`${item.group} / ${item.novel}`));
			});
		}

		function sortCharacters(characters) {
			return characters.slice().sort((a, b) => {
				const aTaken = takenNames.has(a);
				const bTaken = takenNames.has(b);
				if (aTaken === bTaken) {
					return String(a).localeCompare(String(b), 'zh-CN');
				}
				return aTaken ? 1 : -1;
			});
		}

		function renderCharacterResults(characters, preferredName) {
			const sortedCharacters = sortCharacters(characters);
			if (!sortedCharacters.length) {
				characterResults.html('<div class="list-group-item text-muted">没有匹配的人物花名</div>');
				return;
			}

			characterResults.empty();
			sortedCharacters.forEach((name) => {
				const isTaken = takenNames.has(name);
				const isSelected = preferredName && preferredName === name;
				const classes = [
					'list-group-item',
					'list-group-item-action',
					'd-flex',
					'justify-content-between',
					'align-items-center',
				];
				if (isTaken) {
					classes.push('disabled', 'text-muted');
				}
				if (isSelected) {
					classes.push('active');
				}
				const badge = isTaken ? '<span class="badge text-bg-secondary">已被使用</span>' : '';
				characterResults.append('<button type="button" class="' + classes.join(' ') + '" data-character="' + escapeHtml(name) + '">' + escapeHtml(name) + badge + '</button>');
			});
		}

		function renderCharacters(novelIndex, preferredName) {
			const novel = novels[novelIndex];
			const characters = novel && Array.isArray(novel.characters) ? novel.characters.slice() : [];

			allCharacters = characters;
			if (!characters.length) {
				characterSearch.val('').prop('disabled', true);
				characterResults.html('<div class="list-group-item text-muted">请先选择小说</div>');
				onCharacterSelected('');
				return;
			}

			characterSearch.prop('disabled', false).val(preferredName || '');
			renderCharacterResults(characters, preferredName);
			onCharacterSelected(preferredName || '');
		}

		novelSelect.on('change', function () {
			renderCharacters($(this).val(), '');
		});

		characterResults.on('click', '[data-character]', function () {
			if ($(this).hasClass('disabled')) {
				return;
			}
			const selected = String($(this).attr('data-character') || '').trim();
			usernameInput.val(selected);
			characterSearch.val(selected);
			onCharacterSelected(selected);
			renderCharacterResults(allCharacters, selected);
			usernameInput.trigger('input');
		});

		characterSearch.on('input', function () {
			const keyword = String($(this).val() || '').trim();
			if (!allCharacters.length) {
				return;
			}
			const filtered = keyword ? allCharacters.filter(name => String(name).includes(keyword)) : allCharacters;
			renderCharacterResults(filtered, '');
		});

		const matchedNovelIndex = currentUsername ? novels.findIndex(item => item.characters.includes(currentUsername)) : -1;
		if (matchedNovelIndex !== -1) {
			novelSelect.val(String(matchedNovelIndex));
			renderCharacters(String(matchedNovelIndex), currentUsername);
		} else {
			characterSearch.prop('disabled', true);
			characterResults.html('<div class="list-group-item text-muted">请先选择小说</div>');
		}
	}

	function initUsernameAvailability(usernameInput, currentUsername, submitBtn) {
		if (!usernameInput.length) {
			return;
		}

		const hint = $('<div id="username-availability-hint" class="form-text mt-1 text-muted">可输入自定义花名，也可从下方小说人物中选择</div>');
		usernameInput.after(hint);

		let timer = null;

		async function checkAvailability() {
			const value = String(usernameInput.val() || '').trim();
			if (!value) {
				hint.removeClass('text-danger text-success').addClass('text-muted').text('可输入自定义花名，也可从下方小说人物中选择');
				submitBtn.removeAttr('disabled');
				return;
			}

			if (value === currentUsername) {
				hint.removeClass('text-danger text-muted').addClass('text-success').text('当前花名未变化，可直接提交。');
				submitBtn.removeAttr('disabled');
				return;
			}

			try {
				await api.get('/user/username/' + encodeURIComponent(value));
				hint.removeClass('text-success text-muted').addClass('text-danger').text('该花名已被占用');
				submitBtn.attr('disabled', 'disabled');
			} catch (err) {
				hint.removeClass('text-danger text-muted').addClass('text-success').text('该花名可用');
				submitBtn.removeAttr('disabled');
			}
		}

		usernameInput.on('input', function () {
			clearTimeout(timer);
			hint.removeClass('text-danger text-success').addClass('text-muted').text('正在检查花名是否可用...');
			timer = setTimeout(checkAvailability, 300);
		});
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

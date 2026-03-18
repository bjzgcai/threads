'use strict';


define('forum/login', ['hooks', 'translator', 'jquery-form'], function (hooks, translator) {
	const Login = {
		_capsState: false,
	};

	Login.init = function () {
		const errorEl = $('#login-error-notify');
		const submitEl = $('#login');
		const formEl = $('#login-form');

		submitEl.on('click', async function (e) {
			e.preventDefault();
			const username = $('#username').val();
			const password = $('#password').val();
			errorEl.addClass('hidden').find('p').text('');
			if (!username || !password) {
				errorEl.find('p').translateText('[[error:invalid-username-or-password]]');
				errorEl.removeClass('hidden');
				return;
			}

			if (submitEl.hasClass('disabled')) {
				return;
			}

			submitEl.addClass('disabled');

			try {
				const hookData = await hooks.fire('filter:app.login', {
					username,
					password,
					cancel: false,
				});
				if (hookData.cancel) {
					submitEl.removeClass('disabled');
					return;
				}
			} catch (err) {
				errorEl.find('p').translateText(err.message);
				errorEl.removeClass('hidden');
				submitEl.removeClass('disabled');
				return;
			}

			hooks.fire('action:app.login');
			const formData = new FormData(formEl[0]);
			fetch(formEl.attr('action') || window.location.href, {
				method: formEl.attr('method') || 'POST',
				body: formData,
				headers: {
					'x-csrf-token': config.csrf_token,
				},
			}).then(async (response) => {
				if (response.ok) {
					const data = await response.json();
					hooks.fire('action:app.loggedIn', data);
					const next = data.next;
					const params = new URLSearchParams(next.split('?')[1] || '');
					if (!params.has('loggedin')) {
						params.set('loggedin', 'true');
					}
					// clear register message incase it exists
					params.delete('register');
					const qs = params.toString();
					const newUrl = `${next.split('?')[0]}${qs ? `?${qs}` : ''}`;
					window.location.replace(newUrl);
				} else {
					const errInfo = await response.json().catch(() => ({}));
					let message = response.statusText;
					if (response.status === 403 && response.statusText === 'Forbidden') {
						window.location.href = config.relative_path + '/login?error=csrf-invalid';
					} else if (errInfo && errInfo.hasOwnProperty('banned_until')) {
						message = errInfo.banned_until ?
							translator.compile('error:user-banned-reason-until', (new Date(errInfo.banned_until).toLocaleString()), errInfo.reason) :
							'[[error:user-banned-reason, ' + errInfo.reason + ']]';
					}
					errorEl.find('p').translateText(message);
					errorEl.removeClass('hidden');
					submitEl.removeClass('disabled');
					// Select the entire password if that field has focus
					if ($('#password:focus').length) {
						$('#password').select();
					}
				}
			}).catch((error) => {
				console.error('Error:', error);
				errorEl.find('p').translateText('[[error:invalid-username-or-password]]');
				errorEl.removeClass('hidden');
				submitEl.removeClass('disabled');
			});
		});

		// Guard against caps lock
		Login.capsLockCheck(document.querySelector('#password'), document.querySelector('#caps-lock-warning'));

		if ($('#content #username').val()) {
			$('#content #password').val('').focus();
		} else {
			$('#content #username').focus();
		}
		$('#content #noscript').val('false');
	};

	Login.capsLockCheck = (inputEl, warningEl) => {
		const toggle = (state) => {
			warningEl.classList[state ? 'remove' : 'add']('hidden');
			warningEl.parentNode.classList[state ? 'add' : 'remove']('has-warning');
		};
		if (!inputEl) {
			return;
		}
		inputEl.addEventListener('keyup', function (e) {
			if (Login._capsState && e.key === 'CapsLock') {
				toggle(false);
				Login._capsState = !Login._capsState;
				return;
			}
			Login._capsState = e.getModifierState && e.getModifierState('CapsLock');
			toggle(Login._capsState);
		});

		if (Login._capsState) {
			toggle(true);
		}
	};

	return Login;
});

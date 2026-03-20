'use strict';

const path = require('path');
const fs = require('fs').promises;

const user = require('../../user');
const meta = require('../../meta');
const helpers = require('../helpers');
const groups = require('../../groups');
const privileges = require('../../privileges');
const plugins = require('../../plugins');
const file = require('../../file');
const accountHelpers = require('./helpers');

const editController = module.exports;
const wuxiaNicknamePath = path.join(__dirname, '../../data/wuxia-nicknames.json');
let wuxiaNicknameCache = null;

editController.get = async function (req, res, next) {
	const { userData } = res.locals;
	if (!userData) {
		return next();
	}
	const {
		username,
		userslug,
		isSelf,
		reputation,
		groups: _groups,
		groupTitleArray,
		allowMultipleBadges,
	} = userData;

	const [canUseSignature, canManageUsers, customUserFields] = await Promise.all([
		privileges.global.can('signature', req.uid),
		privileges.admin.can('admin:users', req.uid),
		accountHelpers.getCustomUserFields(req.uid, userData),
	]);

	userData.customUserFields = customUserFields;
	userData.maximumSignatureLength = meta.config.maximumSignatureLength;
	userData.maximumAboutMeLength = meta.config.maximumAboutMeLength;
	userData.allowMultipleBadges = meta.config.allowMultipleBadges === 1;
	// Hide delete-account action in account edit for all users.
	userData.allowAccountDelete = false;
	userData.allowAboutMe = !isSelf || !!meta.config['reputation:disabled'] || reputation >= meta.config['min:rep:aboutme'];
	userData.allowSignature = canUseSignature && (!isSelf || !!meta.config['reputation:disabled'] || reputation >= meta.config['min:rep:signature']);
	userData.defaultAvatar = user.getDefaultAvatar();

	userData.groups = _groups.filter(g => g && g.userTitleEnabled && !groups.isPrivilegeGroup(g.name) && g.name !== 'registered-users');

	if (req.uid === res.locals.uid || canManageUsers) {
		const { associations } = await plugins.hooks.fire('filter:auth.list', { uid: res.locals.uid, associations: [] });
		userData.sso = associations;
	}

	const dingtalkSSOFlag = await user.getUserField(res.locals.uid, 'dingtalk:sso');
	const hasDingTalkAssociation = Array.isArray(userData.sso) && userData.sso.some(item =>
		['name', 'url', 'deauthUrl', 'component'].some(key => String((item && item[key]) || '').toLowerCase().includes('dingtalk'))
	);
	userData.disableCredentialEdit = String(dingtalkSSOFlag || '') === '1' || hasDingTalkAssociation;

	if (!allowMultipleBadges) {
		userData.groupTitle = groupTitleArray[0];
	}

	userData.groups.sort((a, b) => {
		const i1 = groupTitleArray.indexOf(a.name);
		const i2 = groupTitleArray.indexOf(b.name);
		if (i1 === -1) {
			return 1;
		} else if (i2 === -1) {
			return -1;
		}
		return i1 - i2;
	});
	userData.groups.forEach((group) => {
		group.userTitle = group.userTitle || group.displayName;
		group.selected = groupTitleArray.includes(group.name);
	});
	userData.groupSelectSize = Math.min(10, Math.max(5, userData.groups.length + 1));

	userData.title = `[[pages:account/edit, ${username}]]`;
	userData.breadcrumbs = helpers.buildBreadcrumbs([
		{
			text: username,
			url: `/user/${userslug}`,
		},
		{
			text: '[[user:edit]]',
		},
	]);
	userData.editButtons = [];

	res.render('account/edit', userData);
};

editController.password = async function (req, res, next) {
	await renderRoute('password', req, res, next);
};

editController.username = async function (req, res, next) {
	await renderRoute('username', req, res, next);
};

editController.email = async function (req, res, next) {
	await renderRoute('email', req, res, next);
};

async function renderRoute(name, req, res) {
	const { userData } = res.locals;
	const [isAdmin, { username, userslug }, hasPassword, dingtalkSSOFlag] = await Promise.all([
		privileges.admin.can('admin:users', req.uid),
		user.getUserFields(res.locals.uid, ['username', 'userslug']),
		user.hasPassword(res.locals.uid),
		user.getUserField(res.locals.uid, 'dingtalk:sso'),
	]);
	const isDingTalkSSO = String(dingtalkSSOFlag || '') === '1';

	if (meta.config[`${name}:disableEdit`] && !isAdmin) {
		return helpers.notAllowed(req, res);
	}
	if (isDingTalkSSO && name === 'password' && !isAdmin) {
		return helpers.notAllowed(req, res);
	}

	userData.hasPassword = hasPassword;
	userData.disableCredentialEdit = isDingTalkSSO;
	if (name === 'username' && isDingTalkSSO) {
		const wuxiaNicknames = await getWuxiaNicknames();
		userData.wuxiaNicknames = wuxiaNicknames;
		userData.hasWuxiaNicknames = wuxiaNicknames.length > 0;
		userData.takenWuxiaNicknames = await getTakenWuxiaNicknames(wuxiaNicknames, res.locals.uid);
	}
	if (name === 'password') {
		userData.minimumPasswordLength = meta.config.minimumPasswordLength;
		userData.minimumPasswordStrength = meta.config.minimumPasswordStrength;
	}

	userData.title = `[[pages:account/edit/${name}, ${username}]]`;
	userData.breadcrumbs = helpers.buildBreadcrumbs([
		{
			text: username,
			url: `/user/${userslug}`,
		},
		{
			text: '[[user:edit]]',
			url: `/user/${userslug}/edit`,
		},
		{
			text: `[[user:${name}]]`,
		},
	]);

	res.render(`account/edit/${name}`, userData);
}

async function getWuxiaNicknames() {
	if (wuxiaNicknameCache) {
		return wuxiaNicknameCache;
	}

	try {
		const raw = await fs.readFile(wuxiaNicknamePath, 'utf8');
		const parsed = JSON.parse(raw);
		const novels = Array.isArray(parsed.groups) ?
			parsed.groups.flatMap(group => Array.isArray(group && group.novels) ? group.novels : []) :
			(Array.isArray(parsed.novels) ? parsed.novels : []);
		wuxiaNicknameCache = novels
			.filter(item => item && item.novel && Array.isArray(item.characters))
			.map(item => ({
				group: String(item.group || ''),
				novel: String(item.novel || ''),
				characters: item.characters
					.map(name => String(name || '').trim())
					.filter(Boolean),
			}));
		return wuxiaNicknameCache;
	} catch (err) {
		wuxiaNicknameCache = [];
		return wuxiaNicknameCache;
	}
}

async function getTakenWuxiaNicknames(wuxiaNicknames, currentUid) {
	const allowedNames = wuxiaNicknames
		.flatMap(item => Array.isArray(item.characters) ? item.characters : [])
		.map(name => String(name || '').trim())
		.filter(Boolean);

	if (!allowedNames.length) {
		return [];
	}

	const currentUsername = await user.getUserField(currentUid, 'username');
	const lookupNames = Array.from(new Set(allowedNames));
	const matchedUids = await user.getUidsByUsernames(lookupNames);

	return lookupNames.filter((name, index) => {
		const uid = parseInt(matchedUids[index], 10);
		return uid > 0 && uid !== parseInt(currentUid, 10) && name !== currentUsername;
	});
}

editController.uploadPicture = async function (req, res, next) {
	const userPhoto = req.files[0];
	try {
		const updateUid = await user.getUidByUserslug(req.params.userslug);
		const isAllowed = await privileges.users.canEdit(req.uid, updateUid);
		if (!isAllowed) {
			return helpers.notAllowed(req, res);
		}
		await user.checkMinReputation(req.uid, updateUid, 'min:rep:profile-picture');

		const image = await user.uploadCroppedPictureFile({
			callerUid: req.uid,
			uid: updateUid,
			file: userPhoto,
		});

		res.json([{
			name: userPhoto.name,
			url: image.url,
		}]);
	} catch (err) {
		next(err);
	} finally {
		await file.delete(userPhoto.path);
	}
};

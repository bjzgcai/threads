'use strict';

const _ = require('lodash');

const categories = require('../categories');
const batch = require('../batch');
const db = require('../database');
const groups = require('../groups');
const privileges = require('../privileges');
const user = require('../user');
const client = require('./client');

const departments = module.exports;

const ROOT_DEPT_ID = String(process.env.DINGTALK_ROOT_DEPT_ID || '1');
const GROUP_PREFIX = 'dingtalk-dept-';
const DEPT_SET = 'dingtalk:departments:ids';
const META_KEY = 'dingtalk:departments:meta';
const USERID_TO_UID_KEY = 'dingtalk:userid2uid';
const UNIONID_TO_UID_KEY = 'dingtalk:openid2uid';
const CATEGORY_CONFIG_FIELDS = [
	'dingtalk:readDeptIds',
	'dingtalk:postDeptIds',
	'dingtalk:readIncludeChildren',
	'dingtalk:postIncludeChildren',
	'dingtalk:updatedAt',
];
const VIEW_PRIVILEGES = ['groups:find', 'groups:read', 'groups:topics:read'];
const POST_PRIVILEGES = ['groups:topics:create', 'groups:topics:reply'];
const BROAD_VIEW_GROUPS = ['registered-users', 'verified-users', 'unverified-users', 'guests', 'spiders', 'fediverse'];
const BROAD_POST_GROUPS = ['registered-users', 'verified-users', 'unverified-users', 'guests', 'spiders', 'fediverse'];

departments.getAdminState = async function () {
	const [cachedDepartments, categoryList, syncMeta] = await Promise.all([
		departments.getCachedDepartments(),
		categories.buildForSelectAll(['disabled']),
		db.getObject(META_KEY),
	]);

	return {
		departments: cachedDepartments,
		departmentsTree: buildTree(cachedDepartments),
		categories: categoryList,
		syncMeta: syncMeta || {},
	};
};

departments.getCachedDepartments = async function () {
	const deptIds = await db.getSortedSetRange(DEPT_SET, 0, -1);
	if (!deptIds.length) {
		return [];
	}
	const rows = await db.getObjects(deptIds.map(deptId => departmentKey(deptId)));
	return rows
		.filter(Boolean)
		.map(normalizeCachedDepartment)
		.sort(compareDepartments);
};

departments.syncDepartmentTree = async function () {
	const now = Date.now();
	const seen = new Set();
	const queue = [ROOT_DEPT_ID];
	const rows = new Map();

	try {
		const root = await client.getDepartment(ROOT_DEPT_ID);
		rows.set(ROOT_DEPT_ID, normalizeRemoteDepartment(root, {
			dept_id: ROOT_DEPT_ID,
			parent_id: 0,
			updatedAt: now,
			detailLoaded: 1,
		}));
	} catch (err) {
		rows.set(ROOT_DEPT_ID, normalizeRemoteDepartment({
			dept_id: ROOT_DEPT_ID,
			name: '根部门',
			parent_id: 0,
		}, {
			updatedAt: now,
			detailLoaded: 0,
			lastDetailError: err.message,
		}));
	}

	while (queue.length) {
		const deptId = queue.shift();
		if (seen.has(deptId)) {
			continue;
		}
		seen.add(deptId);

		/* eslint-disable no-await-in-loop */
		const children = await client.listSubDepartments(deptId);
		children.forEach((child, index) => {
			const row = normalizeRemoteDepartment(child, {
				parent_id: child.parent_id || child.parentid || deptId,
				order: child.order || index,
				updatedAt: now,
				detailLoaded: 0,
			});
			rows.set(row.deptId, {
				...(rows.get(row.deptId) || {}),
				...row,
			});
			if (!seen.has(row.deptId)) {
				queue.push(row.deptId);
			}
		});
	}

	await saveDepartments(Array.from(rows.values()), now);
	await removeStaleDepartmentCache(Array.from(rows.keys()));
	await db.setObject(META_KEY, {
		lastDepartmentSync: now,
		lastDepartmentSyncISO: new Date(now).toISOString(),
		lastDepartmentSyncError: '',
		departmentCount: rows.size,
	});

	return await departments.getAdminState();
};

departments.refreshDepartmentDetail = async function (deptId) {
	const now = Date.now();
	const detail = await client.getDepartment(deptId);
	const existing = await db.getObject(departmentKey(deptId));
	const row = normalizeRemoteDepartment(detail, {
		...(existing || {}),
		updatedAt: now,
		detailLoaded: 1,
		lastDetailError: '',
	});
	await saveDepartments([row], now);
	return normalizeCachedDepartment(await db.getObject(departmentKey(row.deptId)));
};

departments.getCategoryConfig = async function (cid) {
	const category = await assertCategory(cid);
	const cachedDepartments = await departments.getCachedDepartments();
	const config = await readCategoryConfig(category.cid);
	const expanded = expandConfig(config, cachedDepartments);

	return {
		category,
		config,
		expanded,
	};
};

departments.saveCategoryConfig = async function (cid, data) {
	const category = await assertCategory(cid);
	const cachedDepartments = await departments.getCachedDepartments();
	const previous = await readCategoryConfig(category.cid);
	const next = normalizeCategoryConfig(data);
	const previousExpanded = expandConfig(previous, cachedDepartments);
	const nextExpanded = expandConfig(next, cachedDepartments);

	const currentDeptIds = _.uniq(nextExpanded.readDeptIds.concat(nextExpanded.postDeptIds));
	await departments.ensureDepartmentGroups(currentDeptIds);

	const previousReadGroups = previousExpanded.readDeptIds.map(groupNameForDeptId);
	const previousPostGroups = previousExpanded.postDeptIds.map(groupNameForDeptId);
	const nextReadGroups = nextExpanded.readDeptIds.map(groupNameForDeptId);
	const nextPostGroups = nextExpanded.postDeptIds.map(groupNameForDeptId);

	const readGroupsToRemove = _.difference(previousReadGroups, nextReadGroups);
	const postGroupsToRemove = _.difference(previousPostGroups, nextPostGroups);
	const hasDepartmentRules = !!(nextReadGroups.length || nextPostGroups.length);

	if (readGroupsToRemove.length) {
		await privileges.categories.rescind(VIEW_PRIVILEGES, category.cid, readGroupsToRemove);
	}
	if (postGroupsToRemove.length) {
		await privileges.categories.rescind(POST_PRIVILEGES, category.cid, postGroupsToRemove);
	}
	if (nextReadGroups.length) {
		await privileges.categories.give(VIEW_PRIVILEGES, category.cid, nextReadGroups);
	}
	if (nextPostGroups.length) {
		await privileges.categories.give(POST_PRIVILEGES, category.cid, nextPostGroups);
	}
	if (hasDepartmentRules) {
		await privileges.categories.rescind(VIEW_PRIVILEGES, category.cid, BROAD_VIEW_GROUPS);
		await privileges.categories.rescind(POST_PRIVILEGES, category.cid, BROAD_POST_GROUPS);
	}

	await writeCategoryConfig(category.cid, next);
	return await departments.getCategoryConfig(category.cid);
};

departments.ensureDepartmentGroups = async function (deptIds) {
	const cachedDepartments = await departments.getCachedDepartments();
	const deptById = _.keyBy(cachedDepartments, 'deptId');
	const ids = normalizeDeptIds(deptIds);
	const groupNames = [];

	for (const deptId of ids) {
		/* eslint-disable no-await-in-loop */
		const dept = deptById[deptId] || { deptId, name: `DingTalk ${deptId}` };
		const groupName = groupNameForDeptId(deptId);
		groupNames.push(groupName);

		const exists = await groups.exists(groupName);
		if (!exists) {
			await groups.create({
				name: groupName,
				description: `DingTalk department: ${dept.name || deptId}`,
				userTitle: dept.name || groupName,
				hidden: 1,
				private: 1,
				disableJoinRequests: 1,
				disableLeave: 1,
			});
		} else {
			await groups.update(groupName, {
				description: `DingTalk department: ${dept.name || deptId}`,
				userTitle: dept.name || groupName,
				hidden: 1,
				private: 1,
				disableJoinRequests: 1,
				disableLeave: 1,
			});
		}

		await db.setObjectField(`group:${groupName}`, 'dingtalk:deptId', deptId);
	}

	return groupNames;
};

departments.syncDepartmentMembers = async function (data) {
	const cachedDepartments = await departments.getCachedDepartments();
	const requestedIds = normalizeDeptIds(data && data.deptIds);
	const includeChildren = data && data.includeChildren !== false;
	let deptIds = requestedIds.length ? requestedIds : cachedDepartments.map(dept => dept.deptId);
	if (includeChildren) {
		deptIds = expandDepartmentIds(deptIds, cachedDepartments);
	}
	deptIds = _.uniq(deptIds);

	await departments.ensureDepartmentGroups(deptIds);
	const backfilledMappings = await backfillUserIdMappings();

	const results = [];
	for (const deptId of deptIds) {
		/* eslint-disable no-await-in-loop */
		const result = await syncOneDepartmentMembers(deptId);
		results.push(result);
	}

	const now = Date.now();
	await db.setObject(META_KEY, {
		lastMemberSync: now,
		lastMemberSyncISO: new Date(now).toISOString(),
		lastMemberSyncError: '',
	});

	return {
		backfilledMappings,
		results,
		totals: results.reduce((memo, item) => {
			memo.remoteUsers += item.remoteUsers;
			memo.matchedUsers += item.matchedUsers;
			memo.unmatchedUsers += item.unmatchedUsers;
			memo.added += item.added;
			memo.removed += item.removed;
			return memo;
		}, {
			remoteUsers: 0,
			matchedUsers: 0,
			unmatchedUsers: 0,
			added: 0,
			removed: 0,
		}),
	};
};

departments.groupNameForDeptId = groupNameForDeptId;

async function syncOneDepartmentMembers(deptId) {
	const remoteUsers = await client.listDepartmentUsers(deptId);
	const localUids = await resolveLocalUids(remoteUsers);
	const groupName = groupNameForDeptId(deptId);
	const existingUids = (await groups.getMembers(groupName, 0, -1)).map(uid => String(uid));
	const targetUids = _.uniq(localUids.map(uid => String(uid)));
	const toAdd = _.difference(targetUids, existingUids);
	const toRemove = _.difference(existingUids, targetUids);

	for (const uid of toAdd) {
		/* eslint-disable no-await-in-loop */
		await groups.join(groupName, uid);
	}
	for (const uid of toRemove) {
		/* eslint-disable no-await-in-loop */
		await groups.leave(groupName, uid);
	}

	await db.setObjectField(departmentKey(deptId), 'lastMemberSync', Date.now());
	return {
		deptId,
		groupName,
		remoteUsers: remoteUsers.length,
		matchedUsers: targetUids.length,
		unmatchedUsers: Math.max(0, remoteUsers.length - targetUids.length),
		added: toAdd.length,
		removed: toRemove.length,
	};
}

async function resolveLocalUids(remoteUsers) {
	const results = [];
	for (const remoteUser of remoteUsers) {
		/* eslint-disable no-await-in-loop */
		const uid = await resolveLocalUid(remoteUser);
		if (uid) {
			results.push(uid);
		}
	}
	return results;
}

async function resolveLocalUid(remoteUser) {
	const userId = String((remoteUser && (remoteUser.userid || remoteUser.userId)) || '').trim();
	const unionId = String((remoteUser && (remoteUser.unionid || remoteUser.unionId)) || '').trim();
	let uid = userId ? await db.getObjectField(USERID_TO_UID_KEY, userId) : '';
	if (!uid && unionId) {
		uid = await db.getObjectField(UNIONID_TO_UID_KEY, unionId);
		if (uid && userId) {
			await db.setObjectField(USERID_TO_UID_KEY, userId, uid);
		}
	}
	uid = parseInt(uid, 10);
	if (!uid || !await user.exists(uid)) {
		return 0;
	}
	return uid;
}

async function backfillUserIdMappings() {
	let count = 0;
	await batch.processSortedSet('users:joindate', async (uids) => {
		const rows = await user.getUsersFields(uids, ['uid', 'dingtalk:userid']);
		const mapping = {};
		rows.forEach((row) => {
			const uid = parseInt(row && row.uid, 10);
			const userId = String((row && row['dingtalk:userid']) || '').trim();
			if (uid > 0 && userId) {
				mapping[userId] = uid;
			}
		});
		if (Object.keys(mapping).length) {
			count += Object.keys(mapping).length;
			await db.setObject(USERID_TO_UID_KEY, mapping);
		}
	}, {
		batch: 500,
	});
	return count;
}

async function saveDepartments(rows, timestamp) {
	if (!rows.length) {
		return;
	}
	const normalized = rows.map(row => normalizeCachedDepartment({
		...row,
		updatedAt: row.updatedAt || timestamp,
	}));

	await Promise.all([
		db.sortedSetAdd(DEPT_SET, normalized.map(row => scoreForDept(row.deptId)), normalized.map(row => row.deptId)),
		db.setObjectBulk(normalized.map(row => [departmentKey(row.deptId), row])),
	]);
}

async function removeStaleDepartmentCache(currentDeptIds) {
	const current = new Set(normalizeDeptIds(currentDeptIds));
	const existing = await db.getSortedSetRange(DEPT_SET, 0, -1);
	const stale = existing.filter(deptId => !current.has(String(deptId)));
	if (!stale.length) {
		return;
	}
	await Promise.all([
		db.sortedSetRemove(DEPT_SET, stale),
		db.deleteAll(stale.map(departmentKey)),
	]);
}

async function assertCategory(cid) {
	cid = parseInt(cid, 10);
	if (!cid) {
		throw new Error('[[error:invalid-data]]');
	}
	const category = await categories.getCategoryData(cid);
	if (!category) {
		throw new Error('[[error:no-category]]');
	}
	return category;
}

async function readCategoryConfig(cid) {
	const raw = await db.getObjectFields(`category:${cid}`, CATEGORY_CONFIG_FIELDS);
	return normalizeCategoryConfig({
		readDeptIds: raw['dingtalk:readDeptIds'],
		postDeptIds: raw['dingtalk:postDeptIds'],
		readIncludeChildren: raw['dingtalk:readIncludeChildren'],
		postIncludeChildren: raw['dingtalk:postIncludeChildren'],
		updatedAt: raw['dingtalk:updatedAt'],
	});
}

async function writeCategoryConfig(cid, config) {
	await db.setObject(`category:${cid}`, {
		'dingtalk:readDeptIds': JSON.stringify(config.readDeptIds),
		'dingtalk:postDeptIds': JSON.stringify(config.postDeptIds),
		'dingtalk:readIncludeChildren': config.readIncludeChildren ? 1 : 0,
		'dingtalk:postIncludeChildren': config.postIncludeChildren ? 1 : 0,
		'dingtalk:updatedAt': Date.now(),
	});
}

function normalizeCategoryConfig(data) {
	data = data || {};
	return {
		readDeptIds: normalizeDeptIds(data.readDeptIds),
		postDeptIds: normalizeDeptIds(data.postDeptIds),
		readIncludeChildren: isTruthy(data.readIncludeChildren),
		postIncludeChildren: isTruthy(data.postIncludeChildren),
		updatedAt: parseInt(data.updatedAt, 10) || 0,
	};
}

function expandConfig(config, cachedDepartments) {
	const postDeptIds = expandDepartmentIds(config.postDeptIds, cachedDepartments, config.postIncludeChildren);
	const readDeptIds = _.uniq(
		expandDepartmentIds(config.readDeptIds, cachedDepartments, config.readIncludeChildren)
			.concat(postDeptIds)
	);
	return {
		readDeptIds,
		postDeptIds,
	};
}

function expandDepartmentIds(deptIds, cachedDepartments, includeChildren = true) {
	const ids = normalizeDeptIds(deptIds);
	if (!includeChildren) {
		return ids;
	}
	const childrenByParent = {};
	cachedDepartments.forEach((dept) => {
		childrenByParent[dept.parentId] = childrenByParent[dept.parentId] || [];
		childrenByParent[dept.parentId].push(dept.deptId);
	});

	const expanded = new Set(ids);
	const queue = [...ids];
	while (queue.length) {
		const deptId = queue.shift();
		(childrenByParent[deptId] || []).forEach((childId) => {
			if (!expanded.has(childId)) {
				expanded.add(childId);
				queue.push(childId);
			}
		});
	}
	return Array.from(expanded);
}

function normalizeDeptIds(value) {
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (trimmed.startsWith('[')) {
			try {
				value = JSON.parse(trimmed);
			} catch (err) {
				value = trimmed.split(',');
			}
		} else {
			value = trimmed ? trimmed.split(',') : [];
		}
	}
	if (!Array.isArray(value)) {
		return [];
	}
	return _.uniq(value
		.map(item => String(item || '').trim())
		.filter(Boolean));
}

function normalizeRemoteDepartment(raw, fallback) {
	raw = raw || {};
	fallback = fallback || {};
	const deptId = String(
		raw.dept_id || raw.deptId || raw.id || fallback.dept_id || fallback.deptId || ''
	).trim();
	const parentId = String(
		raw.parent_id || raw.parentId || raw.parentid || fallback.parent_id || fallback.parentId || 0
	).trim();
	return normalizeCachedDepartment({
		deptId,
		parentId,
		name: String(raw.name || fallback.name || deptId || 'DingTalk Department'),
		order: parseInt(raw.order || fallback.order, 10) || 0,
		groupName: groupNameForDeptId(deptId),
		memberCount: parseInt(raw.member_count || raw.memberCount || fallback.memberCount, 10) || 0,
		detailLoaded: fallback.detailLoaded || raw.detailLoaded || 0,
		lastDetailError: fallback.lastDetailError || '',
		raw: JSON.stringify(raw),
		updatedAt: fallback.updatedAt || raw.updatedAt || Date.now(),
		lastMemberSync: fallback.lastMemberSync || raw.lastMemberSync || 0,
	});
}

function normalizeCachedDepartment(row) {
	row = row || {};
	const deptId = String(row.deptId || row.dept_id || '').trim();
	return {
		deptId,
		parentId: String(row.parentId || row.parent_id || 0),
		name: String(row.name || deptId || 'DingTalk Department'),
		order: parseInt(row.order, 10) || 0,
		groupName: row.groupName || groupNameForDeptId(deptId),
		memberCount: parseInt(row.memberCount, 10) || 0,
		detailLoaded: parseInt(row.detailLoaded, 10) || 0,
		lastDetailError: String(row.lastDetailError || ''),
		raw: typeof row.raw === 'string' ? row.raw : JSON.stringify(row.raw || {}),
		updatedAt: parseInt(row.updatedAt, 10) || 0,
		lastMemberSync: parseInt(row.lastMemberSync, 10) || 0,
	};
}

function buildTree(rows) {
	const byParent = _.groupBy(rows, 'parentId');
	function visit(parentId, depth) {
		return (byParent[String(parentId)] || [])
			.sort(compareDepartments)
			.map(dept => ({
				...dept,
				depth,
				children: visit(dept.deptId, depth + 1),
			}));
	}
	const roots = visit('0', 0);
	return roots.length ? roots : visit(ROOT_DEPT_ID, 0);
}

function compareDepartments(a, b) {
	if (a.parentId !== b.parentId) {
		return a.parentId.localeCompare(b.parentId);
	}
	if (a.order !== b.order) {
		return a.order - b.order;
	}
	return a.name.localeCompare(b.name);
}

function groupNameForDeptId(deptId) {
	return `${GROUP_PREFIX}${String(deptId || '').trim()}`;
}

function departmentKey(deptId) {
	return `dingtalk:department:${deptId}`;
}

function scoreForDept(deptId) {
	const score = parseInt(deptId, 10);
	return Number.isFinite(score) ? score : 0;
}

function isTruthy(value) {
	return value === true || value === 'true' || value === '1' || parseInt(value, 10) === 1;
}

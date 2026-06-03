'use strict';

define('admin/manage/dingtalk-departments', ['api', 'alerts'], function (api, alerts) {
	const Departments = {};
	const adminBase = '/api/admin/manage/dingtalk-departments';
	let state = {};
	let selectedDeptId = '';
	let currentCid = 0;
	let readDeptIds = new Set();
	let postDeptIds = new Set();

	Departments.init = function () {
		state = {
			departments: ajaxify.data.departments || [],
			syncMeta: ajaxify.data.syncMeta || {},
		};
		currentCid = parseInt($('#dingtalk-category-select').val(), 10) || 0;

		renderDepartments();
		bindEvents();
		if (currentCid) {
			loadCategoryConfig(currentCid);
		}
	};

	function bindEvents() {
		$('#dingtalk-department-search').on('input', renderDepartments);
		$('#dingtalk-category-select').on('change', function () {
			currentCid = parseInt(this.value, 10) || 0;
			loadCategoryConfig(currentCid);
		});
		$('#dingtalk-read-children, #dingtalk-post-children').on('change', updatePermissionSummary);

		$('[data-action="sync-departments"]').on('click', syncDepartments);
		$('[data-action="sync-members"]').on('click', syncMembers);
		$('[data-action="save-category"]').on('click', saveCategoryConfig);
		$('[data-action="refresh-detail"]').on('click', refreshDepartmentDetail);

		$('[data-component="department-list"]').on('click', '[data-dept-id]', function (ev) {
			if (ev.target && ev.target.matches('input[type="checkbox"]')) {
				return;
			}
			selectDepartment(String(this.getAttribute('data-dept-id') || ''));
		});

		$('[data-component="department-list"]').on('change', 'input[type="checkbox"]', function () {
			const deptId = String(this.getAttribute('data-dept-id') || '');
			const mode = this.getAttribute('data-mode');
			const target = mode === 'post' ? postDeptIds : readDeptIds;
			if (this.checked) {
				target.add(deptId);
			} else {
				target.delete(deptId);
			}
			if (mode === 'post' && this.checked) {
				readDeptIds.add(deptId);
			}
			if (mode === 'read' && !this.checked) {
				postDeptIds.delete(deptId);
			}
			renderDepartments();
			updatePermissionSummary();
		});
	}

	async function syncDepartments() {
		const button = $('[data-action="sync-departments"]');
		setBusy(button, true);
		try {
			const response = await api.post(`${adminBase}/sync-departments`, {});
			state.departments = response.departments || [];
			state.syncMeta = response.syncMeta || {};
			renderDepartments();
			updateSyncMeta();
			alerts.success('钉钉部门已同步');
		} catch (err) {
			alerts.error(err.message);
		} finally {
			setBusy(button, false);
		}
	}

	async function syncMembers() {
		const deptIds = Array.from(new Set(Array.from(readDeptIds).concat(Array.from(postDeptIds))));
		if (!deptIds.length) {
			alerts.warning('请先勾选需要查看或发帖的部门');
			return;
		}
		const button = $('[data-action="sync-members"]');
		setBusy(button, true);
		try {
			const response = await api.post(`${adminBase}/sync-members`, {
				deptIds,
				includeChildren: $('#dingtalk-read-children').is(':checked') || $('#dingtalk-post-children').is(':checked'),
			});
			const totals = response.totals || {};
			alerts.success(`成员同步完成：匹配 ${totals.matchedUsers || 0} 人，新增 ${totals.added || 0}，移除 ${totals.removed || 0}`);
		} catch (err) {
			alerts.error(err.message);
		} finally {
			setBusy(button, false);
		}
	}

	async function loadCategoryConfig(cid) {
		if (!cid) {
			return;
		}
		try {
			const response = await api.get(`${adminBase}/categories/${cid}`, {});
			const config = response.config || {};
			readDeptIds = new Set(config.readDeptIds || []);
			postDeptIds = new Set(config.postDeptIds || []);
			$('#dingtalk-read-children').prop('checked', !!config.readIncludeChildren);
			$('#dingtalk-post-children').prop('checked', !!config.postIncludeChildren);
			renderDepartments();
			updatePermissionSummary();
		} catch (err) {
			alerts.error(err.message);
		}
	}

	async function saveCategoryConfig() {
		if (!currentCid) {
			alerts.error('请选择版块');
			return;
		}
		const button = $('[data-action="save-category"]');
		setBusy(button, true);
		try {
			const response = await api.put(`${adminBase}/categories/${currentCid}`, {
				readDeptIds: Array.from(readDeptIds),
				postDeptIds: Array.from(postDeptIds),
				readIncludeChildren: $('#dingtalk-read-children').is(':checked'),
				postIncludeChildren: $('#dingtalk-post-children').is(':checked'),
			});
			const config = response.config || {};
			readDeptIds = new Set(config.readDeptIds || []);
			postDeptIds = new Set(config.postDeptIds || []);
			renderDepartments();
			updatePermissionSummary();
			alerts.success('版块部门权限已保存');
		} catch (err) {
			alerts.error(err.message);
		} finally {
			setBusy(button, false);
		}
	}

	async function refreshDepartmentDetail() {
		if (!selectedDeptId) {
			return;
		}
		const button = $('[data-action="refresh-detail"]');
		setBusy(button, true);
		try {
			const response = await api.get(`${adminBase}/departments/${encodeURIComponent(selectedDeptId)}`, {});
			const department = response.department;
			if (department) {
				const index = state.departments.findIndex(dept => String(dept.deptId) === String(department.deptId));
				if (index === -1) {
					state.departments.push(department);
				} else {
					state.departments[index] = department;
				}
				renderDepartments();
				selectDepartment(department.deptId);
				alerts.success('部门详情已更新');
			}
		} catch (err) {
			alerts.error(err.message);
		} finally {
			setBusy(button, false);
		}
	}

	function renderDepartments() {
		const list = $('[data-component="department-list"]');
		const query = String($('#dingtalk-department-search').val() || '').trim().toLowerCase();
		const departments = flattenTree(buildTree(state.departments || []))
			.filter((dept) => {
				if (!query) {
					return true;
				}
				return String(dept.name || '').toLowerCase().includes(query) ||
					String(dept.deptId || '').toLowerCase().includes(query);
			});

		if (!departments.length) {
			list.html('<div class="p-3 text-sm text-muted">暂无部门。点击“同步部门”从钉钉读取部门列表。</div>');
			updatePermissionSummary();
			return;
		}

		list.html(departments.map(renderDepartmentRow).join(''));
		updatePermissionSummary();
	}

	function renderDepartmentRow(dept) {
		const deptId = String(dept.deptId || '');
		const selectedClass = selectedDeptId === deptId ? ' selected' : '';
		const readChecked = readDeptIds.has(deptId) ? ' checked' : '';
		const postChecked = postDeptIds.has(deptId) ? ' checked' : '';
		return `
			<div class="dingtalk-dept-row${selectedClass}" data-dept-id="${escapeAttr(deptId)}">
				<div class="dingtalk-dept-name" style="--depth:${Number(dept.depth) || 0}">
					<strong>${escapeHtml(dept.name || deptId)}</strong>
					<span class="dingtalk-dept-id text-muted">${escapeHtml(deptId)} · ${escapeHtml(dept.groupName || '')}</span>
				</div>
				<div class="text-center">
					<input class="form-check-input" type="checkbox" title="允许查看" data-mode="read" data-dept-id="${escapeAttr(deptId)}"${readChecked}>
				</div>
				<div class="text-center">
					<input class="form-check-input" type="checkbox" title="允许发帖" data-mode="post" data-dept-id="${escapeAttr(deptId)}"${postChecked}>
				</div>
			</div>
		`;
	}

	function selectDepartment(deptId) {
		selectedDeptId = String(deptId || '');
		renderDepartments();
		renderDepartmentDetail();
	}

	function renderDepartmentDetail() {
		const dept = getDepartmentById(selectedDeptId);
		const title = $('[data-component="selected-department-title"]');
		const detail = $('[data-component="department-detail"]');
		const refreshButton = $('[data-action="refresh-detail"]');
		if (!dept) {
			title.text('未选择部门');
			detail.html('<div class="text-sm text-muted">从左侧选择一个部门查看详情。</div>');
			refreshButton.prop('disabled', true);
			return;
		}

		refreshButton.prop('disabled', false);
		title.text(`${dept.name || dept.deptId} · ${dept.deptId}`);
		let raw = {};
		try {
			raw = JSON.parse(dept.raw || '{}');
		} catch (err) {
			raw = {};
		}
		const rows = [
			['部门 ID', dept.deptId],
			['上级部门 ID', dept.parentId],
			['部门名称', dept.name],
			['映射用户组', dept.groupName],
			['成员数', dept.memberCount || raw.member_count || ''],
			['详情已读取', dept.detailLoaded ? '是' : '否'],
			['部门同步时间', formatTime(dept.updatedAt)],
			['成员同步时间', formatTime(dept.lastMemberSync)],
		];
		if (dept.lastDetailError) {
			rows.push(['详情错误', dept.lastDetailError]);
		}
		Object.keys(raw).sort().forEach((key) => {
			if (!rows.some(row => row[0] === key)) {
				rows.push([key, formatRawValue(raw[key])]);
			}
		});

		detail.html(`
			<div class="table-responsive">
				<table class="table table-sm mb-0 dingtalk-dept-detail-table">
					<tbody>
						${rows.map(row => `<tr><th class="text-muted">${escapeHtml(row[0])}</th><td>${escapeHtml(row[1])}</td></tr>`).join('')}
					</tbody>
				</table>
			</div>
		`);
	}

	function updatePermissionSummary() {
		const summary = $('[data-component="permission-summary"]');
		const readCount = readDeptIds.size;
		const postCount = postDeptIds.size;
		summary.text(`查看部门 ${readCount} 个，发帖部门 ${postCount} 个；发帖部门会自动获得查看权限。`);
	}

	function updateSyncMeta() {
		const meta = state.syncMeta || {};
		$('[data-component="departments-sync-meta"]').text(
			meta.lastDepartmentSyncISO ? `部门同步：${meta.lastDepartmentSyncISO}` : '尚未同步部门'
		);
	}

	function buildTree(departments) {
		const byParent = {};
		(departments || []).forEach((dept) => {
			const parentId = String(dept.parentId || 0);
			byParent[parentId] = byParent[parentId] || [];
			byParent[parentId].push(dept);
		});
		Object.keys(byParent).forEach((parentId) => {
			byParent[parentId].sort((a, b) => {
				if ((Number(a.order) || 0) !== (Number(b.order) || 0)) {
					return (Number(a.order) || 0) - (Number(b.order) || 0);
				}
				return String(a.name || '').localeCompare(String(b.name || ''));
			});
		});
		function visit(parentId, depth) {
			return (byParent[String(parentId)] || []).map(dept => ({
				...dept,
				depth,
				children: visit(dept.deptId, depth + 1),
			}));
		}
		const roots = visit('0', 0);
		return roots.length ? roots : visit('1', 0);
	}

	function flattenTree(tree) {
		const rows = [];
		(tree || []).forEach((dept) => {
			rows.push(dept);
			rows.push(...flattenTree(dept.children || []));
		});
		return rows;
	}

	function getDepartmentById(deptId) {
		return (state.departments || []).find(dept => String(dept.deptId) === String(deptId));
	}

	function formatRawValue(value) {
		if (value === null || value === undefined) {
			return '';
		}
		if (typeof value === 'object') {
			return JSON.stringify(value);
		}
		return String(value);
	}

	function formatTime(value) {
		const timestamp = parseInt(value, 10);
		return timestamp ? new Date(timestamp).toLocaleString() : '';
	}

	function setBusy(button, busy) {
		button.prop('disabled', busy);
		button.toggleClass('disabled', busy);
	}

	function escapeHtml(value) {
		return $('<div/>').text(value == null ? '' : String(value)).html();
	}

	function escapeAttr(value) {
		return escapeHtml(value).replace(/"/g, '&quot;');
	}

	return Departments;
});

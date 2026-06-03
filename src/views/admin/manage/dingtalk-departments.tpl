<div class="acp-page-container dingtalk-departments-page">
	<div class="d-flex border-bottom py-2 m-0 sticky-top acp-page-main-header align-items-center justify-content-between flex-wrap gap-2">
		<div>
			<h4 class="fw-bold tracking-tight mb-0">钉钉部门权限</h4>
			<div class="text-xs text-muted mt-1">
				<span data-component="departments-sync-meta">
					{{{ if syncMeta.lastDepartmentSyncISO }}}
					部门同步：{syncMeta.lastDepartmentSyncISO}
					{{{ else }}}
					尚未同步部门
					{{{ end }}}
				</span>
			</div>
		</div>
		<div class="d-flex gap-1">
			<button type="button" class="btn btn-light btn-sm text-nowrap" data-action="sync-members">
				<i class="fa fa-fw fa-users"></i> 同步成员
			</button>
			<button type="button" class="btn btn-primary btn-sm fw-semibold text-nowrap" data-action="sync-departments">
				<i class="fa fa-fw fa-rotate"></i> 同步部门
			</button>
		</div>
	</div>

	<div class="row g-3 mt-1">
		<div class="col-12 col-xl-5">
			<div class="border rounded-2 bg-body">
				<div class="border-bottom p-3 d-flex flex-column gap-2">
					<label class="form-label mb-0 fw-semibold" for="dingtalk-department-search">部门信息</label>
					<div class="input-group input-group-sm">
						<span class="input-group-text"><i class="fa fa-fw fa-search"></i></span>
						<input id="dingtalk-department-search" type="search" class="form-control" placeholder="搜索部门名称或 ID" autocomplete="off" />
					</div>
				</div>
				<div class="dingtalk-dept-grid-header text-xs text-muted border-bottom px-3 py-2">
					<div>部门</div>
					<div class="text-center">查看</div>
					<div class="text-center">发帖</div>
				</div>
				<div data-component="department-list" class="dingtalk-dept-list"></div>
			</div>
		</div>

		<div class="col-12 col-xl-7">
			<div class="border rounded-2 bg-body p-3 mb-3">
				<label class="form-label fw-semibold" for="dingtalk-category-select">版块</label>
				<select id="dingtalk-category-select" class="form-select">
					{{{ each categories }}}
					<option value="{categories.cid}">{categories.text}</option>
					{{{ end }}}
				</select>
				<div class="d-flex flex-wrap gap-3 mt-3">
					<div class="form-check">
						<input class="form-check-input" type="checkbox" id="dingtalk-read-children" checked>
						<label class="form-check-label" for="dingtalk-read-children">查看包含子部门</label>
					</div>
					<div class="form-check">
						<input class="form-check-input" type="checkbox" id="dingtalk-post-children" checked>
						<label class="form-check-label" for="dingtalk-post-children">发帖包含子部门</label>
					</div>
				</div>
				<div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3">
					<div class="text-sm text-muted" data-component="permission-summary">请选择部门</div>
					<button type="button" class="btn btn-primary btn-sm fw-semibold text-nowrap" data-action="save-category">
						<i class="fa fa-fw fa-floppy-disk"></i> 保存权限
					</button>
				</div>
			</div>

			<div class="border rounded-2 bg-body">
				<div class="border-bottom p-3 d-flex justify-content-between align-items-center gap-2">
					<div>
						<div class="fw-semibold">部门详情</div>
						<div class="text-xs text-muted" data-component="selected-department-title">未选择部门</div>
					</div>
					<button type="button" class="btn btn-light btn-sm text-nowrap" data-action="refresh-detail" disabled>
						<i class="fa fa-fw fa-circle-info"></i> 获取详情
					</button>
				</div>
				<div class="p-3" data-component="department-detail">
					<div class="text-sm text-muted">从左侧选择一个部门查看详情。</div>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
.dingtalk-dept-grid-header,
.dingtalk-dept-row {
	display: grid;
	grid-template-columns: minmax(0, 1fr) 4.25rem 4.25rem;
	align-items: center;
	gap: .5rem;
}
.dingtalk-dept-list {
	max-height: calc(100vh - 270px);
	min-height: 24rem;
	overflow: auto;
}
.dingtalk-dept-row {
	width: 100%;
	min-height: 2.6rem;
	border: 0;
	border-bottom: 1px solid var(--bs-border-color);
	background: transparent;
	padding: .45rem 1rem;
	text-align: left;
}
.dingtalk-dept-row:hover,
.dingtalk-dept-row.selected {
	background: var(--bs-tertiary-bg);
}
.dingtalk-dept-name {
	padding-left: calc(var(--depth, 0) * 1.1rem);
	min-width: 0;
}
.dingtalk-dept-name strong {
	display: block;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.dingtalk-dept-id {
	font-size: .75rem;
}
.dingtalk-dept-detail-table th {
	width: 9rem;
	white-space: nowrap;
}
</style>

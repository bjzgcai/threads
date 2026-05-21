<div class="manage-skills d-flex flex-column gap-2 px-lg-4 h-100">
	<div class="d-flex border-bottom py-2 m-0 sticky-top acp-page-main-header align-items-center justify-content-between flex-wrap gap-2">
		<div>
			<h4 class="fw-bold tracking-tight mb-0">[[skills:admin.title]]</h4>
		</div>
		<div class="d-flex gap-2 align-items-center flex-wrap">
			<input type="text" class="form-control form-control-sm w-auto" id="skill-token-query" placeholder="[[skills:admin.search-placeholder]]" value="{query}">
			<input type="number" class="form-control form-control-sm w-auto" id="skill-token-uid" placeholder="UID" value="{filterUid}">
			<select id="results-per-page" class="form-select form-select-sm w-auto">
				<option value="20" {{{ if (resultsPerPage == "20") }}}selected{{{ end }}}>20 / page</option>
				<option value="50" {{{ if (resultsPerPage == "50") }}}selected{{{ end }}}>50 / page</option>
				<option value="100" {{{ if (resultsPerPage == "100") }}}selected{{{ end }}}>100 / page</option>
			</select>
			<button type="button" class="btn btn-light btn-sm" data-action="apply-filters">[[skills:admin.apply]]</button>
		</div>
	</div>

	<div class="text-muted small">[[skills:admin.total, {count}]]</div>

	<div class="alert alert-info">
		[[skills:admin.intro]]
	</div>

	<div class="table-responsive flex-grow-1">
		<table class="table table-hover align-middle text-sm" component="admin/skills/tokens">
			<thead>
				<tr>
					<th>[[skills:table.name]]</th>
					<th>[[skills:table.user]]</th>
					<th>[[skills:table.scopes]]</th>
					<th>[[skills:table.preview]]</th>
					<th>[[skills:table.created]]</th>
					<th>[[skills:table.expires]]</th>
					<th>[[skills:table.status]]</th>
					<th>[[skills:table.last-seen]]</th>
					<th>[[skills:table.last-ip]]</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{{{ each tokens }}}
				<tr data-token="{./token}">
					<td class="fw-medium">{./name}</td>
					<td>
						<div>{./uid}</div>
						{{{ if ./username }}}
						<div class="text-muted small">
							<a href="{config.relative_path}/user/{./userslug}">{./username}</a>
						</div>
						{{{ end }}}
					</td>
					<td>{./scopesLabel}</td>
					<td><code>{./tokenPreview}</code></td>
					<td class="text-nowrap">
						{{{ if ./createdAtISO }}}
						<span title="{./createdAtISO}">{./createdAtFormatted}</span>
						{{{ end }}}
					</td>
					<td class="text-nowrap">
						{{{ if ./expiresAtISO }}}
						<span title="{./expiresAtISO}">{./expiresAtFormatted}</span>
						{{{ else }}}
						<em class="text-muted">[[skills:table.never-expires]]</em>
						{{{ end }}}
					</td>
					<td class="text-nowrap">
						{{{ if ./expired }}}
						<span class="badge text-bg-danger">[[skills:table.expired]]</span>
						{{{ else }}}
						<span class="badge text-bg-success">[[skills:table.active]]</span>
						{{{ end }}}
					</td>
					<td class="text-nowrap">
						{{{ if ./lastSeenISO }}}
						<span title="{./lastSeenISO}">{./lastSeenFormatted}</span>
						{{{ else }}}
						<em class="text-muted">[[skills:table.never]]</em>
						{{{ end }}}
					</td>
					<td class="text-nowrap">
						{{{ if ./lastSeenIp }}}
						<code>{./lastSeenIp}</code>
						{{{ else }}}
						<em class="text-muted">[[skills:table.none]]</em>
						{{{ end }}}
					</td>
					<td class="text-end">
						<button type="button" class="btn btn-outline-danger btn-sm" data-action="revoke-skill-token">
							<i class="fa fa-trash"></i> [[skills:admin.revoke]]
						</button>
					</td>
				</tr>
				{{{ else }}}
				<tr>
					<td colspan="10" class="text-center text-muted py-4">[[skills:admin.empty]]</td>
				</tr>
				{{{ end }}}
			</tbody>
		</table>
	</div>

	<!-- IMPORT admin/partials/paginator.tpl -->
</div>

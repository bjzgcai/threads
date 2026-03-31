<div class="account page-user px-lg-4">
	<div class="d-flex flex-wrap justify-content-between align-items-center gap-2 border-bottom py-2 mb-3">
		<div>
			<h3 class="fw-semibold fs-5 mb-0">[[skills:account.title]]</h3>
			<div class="text-muted small">[[skills:account.subtitle]]</div>
		</div>
		<div class="d-flex gap-2">
			<button type="button" class="btn btn-primary btn-sm" data-action="create-skill-token">
				<i class="fa fa-plus"></i> [[skills:account.create]]
			</button>
		</div>
	</div>

	<div class="alert alert-info">
		[[skills:account.intro]]
	</div>

	<div class="table-responsive">
		<table class="table table-hover align-middle text-sm" component="account/skills/tokens">
			<thead>
				<tr>
					<th>[[skills:table.name]]</th>
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
					<td>{./scopesLabel}</td>
					<td><code>{./tokenPreview}</code></td>
					<td class="text-nowrap">
						{{{ if ./createdAtISO }}}
						<span class="timeago" title="{./createdAtISO}"></span>
						{{{ end }}}
					</td>
					<td class="text-nowrap">
						{{{ if ./expiresAtISO }}}
						<span class="timeago" title="{./expiresAtISO}"></span>
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
						<span class="timeago" title="{./lastSeenISO}"></span>
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
					<td class="text-nowrap text-end">
						<button type="button" class="btn btn-outline-secondary btn-sm" data-action="roll-skill-token">
							<i class="fa fa-rotate-right"></i> [[skills:account.roll]]
						</button>
						<button type="button" class="btn btn-outline-danger btn-sm" data-action="revoke-skill-token">
							<i class="fa fa-trash"></i> [[skills:account.revoke]]
						</button>
					</td>
				</tr>
				{{{ else }}}
				<tr>
					<td colspan="9" class="text-center text-muted py-4">[[skills:account.empty]]</td>
				</tr>
				{{{ end }}}
			</tbody>
		</table>
	</div>
</div>

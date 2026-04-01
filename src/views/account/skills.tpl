<div class="account page-user px-lg-4 pt-0 mt-0">
	<div class="d-flex flex-wrap justify-content-between align-items-center gap-2 border-bottom py-1 mb-2">
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

	<div class="alert alert-info py-2 mb-2">
		[[skills:account.intro]]
	</div>

	<div class="row g-2 mb-2">
		<div class="col-12 col-xl-6">
			<div class="card h-100">
				<div class="card-body d-flex flex-column gap-2">
					<h5 class="card-title mb-1">[[skills:account.skill-name-title]]</h5>
					<div class="small text-muted">[[skills:account.skill-name-help]]</div>
					<div><code>zgcy-skills-gateway</code></div>
				</div>
			</div>
		</div>
		<div class="col-12 col-xl-6">
			<div class="card h-100">
				<div class="card-body d-flex flex-column gap-2">
					<h5 class="card-title mb-1">[[skills:account.install-title]]</h5>
					<div class="small text-muted">[[skills:account.install-intro]]</div>
					<ol class="mb-0 ps-3 d-flex flex-column gap-1">
						<li>[[skills:account.install-step-1]]</li>
						<li>[[skills:account.install-step-2]]</li>
						<li>[[skills:account.install-step-3]]</li>
					</ol>
					<div class="small text-muted">[[skills:account.install-note]]</div>
				</div>
			</div>
		</div>
		<div class="col-12">
			<div class="card">
				<div class="card-body d-flex flex-column gap-2">
					<h5 class="card-title mb-1">[[skills:account.capabilities-title]]</h5>
					<div class="small text-muted">[[skills:account.capabilities-intro]]</div>
					<ul class="mb-0 ps-3 d-flex flex-column gap-1">
						<li><code>list_categories</code>: [[skills:account.capability-list-categories]]</li>
						<li><code>latest_topics</code>: [[skills:account.capability-latest-topics]]</li>
						<li><code>unread_topics</code>: [[skills:account.capability-unread-topics]]</li>
						<li><code>search_topics</code>: [[skills:account.capability-search-topics]]</li>
						<li><code>get_post_raw</code>: [[skills:account.capability-get-post-raw]]</li>
						<li><code>create_topic_or_reply</code>: [[skills:account.capability-create-topic-or-reply]]</li>
					</ul>
				</div>
			</div>
		</div>
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

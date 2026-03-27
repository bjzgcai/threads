<style>
	.report-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.75rem;
	}
	@media (max-width: 992px) {
		.report-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 576px) {
		.report-grid {
			grid-template-columns: 1fr;
		}
	}
	.report-card {
		border: 1px solid var(--bs-border-color);
		border-radius: 0.75rem;
		background: var(--bs-body-bg);
		padding: 0.9rem 1rem;
	}
	.report-label {
		font-size: 0.8rem;
		color: var(--bs-secondary-color);
		margin-bottom: 0.25rem;
	}
	.report-value {
		font-size: 1.5rem;
		font-weight: 700;
		line-height: 1.1;
	}
</style>

<div class="d-flex justify-content-between align-items-center mb-3">
	<div>
		<h4 class="mb-1">运营日报预览</h4>
		<div class="text-muted">统计日期：{dateLabel}（昨日）</div>
	</div>
	<div class="d-flex gap-2">
		<a class="btn btn-sm btn-outline-secondary" href="{config.relative_path}/admin/dashboard">返回仪表盘</a>
	</div>
</div>

<div class="card mb-3">
	<div class="card-body">
		<div class="report-grid">
			<div class="report-card">
				<div class="report-label">新增用户</div>
				<div class="report-value text-success">{metrics.registrations}</div>
			</div>
			<div class="report-card">
				<div class="report-label">新增主题</div>
				<div class="report-value text-primary">{metrics.topics}</div>
			</div>
			<div class="report-card">
				<div class="report-label">新增帖子</div>
				<div class="report-value text-primary">{metrics.posts}</div>
			</div>
			<div class="report-card">
				<div class="report-label">访问量（PV）</div>
				<div class="report-value">{metrics.pageviews}</div>
			</div>
			<div class="report-card">
				<div class="report-label">访客数（UV）</div>
				<div class="report-value">{metrics.uniqueVisitors}</div>
			</div>
			<div class="report-card">
				<div class="report-label">登录次数</div>
				<div class="report-value">{metrics.logins}</div>
			</div>
		</div>
	</div>
</div>

<div class="row g-3">
	<div class="col-lg-5">
		<div class="card h-100">
			<div class="card-header fw-semibold">累计总量</div>
			<div class="card-body">
				<table class="table table-sm align-middle mb-0">
					<tbody>
						<tr><td>用户总数</td><td class="text-end fw-semibold">{totals.userCount}</td></tr>
						<tr><td>主题总数</td><td class="text-end fw-semibold">{totals.topicCount}</td></tr>
						<tr><td>帖子总数</td><td class="text-end fw-semibold">{totals.postCount}</td></tr>
						<tr><td>登录总次数</td><td class="text-end fw-semibold">{totals.loginCount}</td></tr>
					</tbody>
				</table>
			</div>
		</div>
	</div>
	<div class="col-lg-7">
		<div class="card h-100">
			<div class="card-header fw-semibold">钉钉消息预览（Markdown）</div>
			<div class="card-body">
				<pre class="mb-0 small bg-light border rounded p-3" style="max-height: 360px; overflow: auto;">{markdown}</pre>
			</div>
		</div>
	</div>
</div>


{{{ if hotTopics }}}
<section class="card border-0 shadow-sm overflow-hidden mb-4" component="category/hot-topics-today">
	<div class="px-4 py-4 text-white" style="background: linear-gradient(135deg, #ff7a18 0%, #ffb347 55%, #ffd27d 100%);">
		<div class="d-flex flex-wrap justify-content-between align-items-start gap-3">
			<div>
				<div class="text-uppercase fw-bold small mb-2" style="letter-spacing: 0.12em; opacity: 0.85;">Trending Board</div>
				<h2 class="fs-4 fw-bold mb-1">[[category:hot-topics]]</h2>
				<p class="mb-0 small" style="opacity: 0.92;">按全站热度实时排序，抓取阅读和回复最能打的帖子。</p>
			</div>
			<div class="rounded-pill px-3 py-2 small fw-semibold text-dark" style="background: rgba(255, 255, 255, 0.88);">
				<i class="fa fa-fire me-1 text-danger"></i>
				[[category:hot-topics-score-label]]
			</div>
		</div>
	</div>
	{{{ if hotTopics.hasTopics }}}
	<ol class="list-unstyled mb-0 px-2 py-2 bg-body-tertiary">
		{{{ each hotTopics.topics }}}
		<li class="mb-2">
			<a
				class="d-flex gap-3 align-items-start text-reset text-decoration-none rounded-3 px-3 py-3 bg-body border shadow-sm-sm"
				href="{config.relative_path}/topic/{./slug}"
				style="transition: transform 0.18s ease, box-shadow 0.18s ease;"
			>
				<span class="d-inline-flex align-items-center justify-content-center rounded-circle fw-bold flex-shrink-0" style="width: 2.4rem; height: 2.4rem; background: linear-gradient(135deg, #ff8a00 0%, #ffc14d 100%); color: #1f2937; box-shadow: inset 0 1px 0 rgba(255,255,255,0.35);">
					{increment(@index, "1")}
				</span>
				<div class="flex-grow-1 min-width-0">
					<div class="d-flex flex-wrap justify-content-between align-items-start gap-2">
						<div class="min-width-0">
							<div class="fw-bold fs-6 text-break lh-sm">{./title}</div>
							<div class="d-flex flex-wrap gap-2 text-muted small mt-2">
								<span class="rounded-pill px-2 py-1 border bg-light-subtle"><i class="fa fa-eye me-1"></i>{humanReadableNumber(./viewcount, 0)} 阅读</span>
								<span class="rounded-pill px-2 py-1 border bg-light-subtle"><i class="fa fa-message me-1"></i>{humanReadableNumber(./postcount, 0)} 回复</span>
							</div>
						</div>
						<div class="text-end flex-shrink-0">
							<div class="small text-muted mb-1">热度值</div>
							<div class="rounded-3 px-3 py-2 fw-bold text-dark" style="background: linear-gradient(135deg, #ffe8b8 0%, #ffd27d 100%); min-width: 5.5rem;">
								<i class="fa fa-fire text-danger me-1"></i>{humanReadableNumber(./heat, 0)}
							</div>
						</div>
					</div>
				</div>
			</a>
		</li>
		{{{ end }}}
	</ol>
	{{{ else }}}
	<div class="px-4 py-4 text-muted">[[category:hot-topics-empty]]</div>
	{{{ end }}}
</section>
{{{ end }}}

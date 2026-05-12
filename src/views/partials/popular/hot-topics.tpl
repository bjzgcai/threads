{{{ if hotTopicsTop10 }}}
<section class="card border-0 shadow-sm overflow-hidden mb-4" component="popular/hot-topics">
	<div class="px-4 py-4 text-white" style="background: linear-gradient(135deg, #ff7a18 0%, #ffb347 55%, #ffd27d 100%);">
		<div class="d-flex flex-wrap justify-content-between align-items-center gap-3">
			<div>
				<div class="text-uppercase fw-bold small mb-2" style="letter-spacing: 0.12em; opacity: 0.85;">Popular Upgrade</div>
				<h2 class="fs-4 fw-bold mb-0">热度 Top 10</h2>
			</div>
			<a
				href="http://10.1.132.21:8080"
				target="_blank"
				rel="noopener noreferrer"
				data-ajaxify="false"
				class="d-inline-flex align-items-center gap-2 rounded-pill border border-white text-white text-decoration-none fw-bold px-4 py-2 ms-auto me-lg-5"
				style="background: rgba(255, 255, 255, 0.12); box-shadow: inset 0 1px 0 rgba(255,255,255,0.28);"
			>
				<i class="fa fa-external-link"></i>
				<span>智策云端</span>
			</a>
		</div>
	</div>

	<div class="px-3 py-3 bg-body-tertiary border-bottom">
		<nav class="topic-list-header bg-body d-flex flex-nowrap p-0 border-0 rounded">
			<div class="d-flex flex-row p-2 card card-header gap-1 border rounded w-100 align-items-center">
				<div component="category/controls" class="d-flex flex-wrap align-items-stretch me-auto mb-0 gap-2">
					<!-- IMPORT partials/topic-terms.tpl -->
					<!-- IMPORT partials/topic-filters.tpl -->
					<!-- IMPORT partials/category/filter-dropdown-left.tpl -->
					<!-- IMPORT partials/tags/filter-dropdown-left.tpl -->
					<!-- IMPORT partials/category/tools-dropdown-left.tpl -->
				</div>
			</div>
		</nav>
	</div>

	{{{ if hotTopicsTop10.hasTopics }}}
	<ol class="list-unstyled mb-0 px-2 py-2 bg-body-tertiary">
		{{{ each hotTopicsTop10.topics }}}
		<li class="mb-2 {{{ if ./isExtraHotTopic }}}d-none{{{ end }}}" component="popular/hot-topic-item" data-extra="{./isExtraHotTopic}">
			<a
				class="d-flex flex-wrap flex-lg-nowrap gap-3 align-items-start text-reset text-decoration-none rounded-3 px-3 py-3 bg-body border shadow-sm-sm"
				href="{config.relative_path}/topic/{./slug}"
				style="transition: transform 0.18s ease, box-shadow 0.18s ease;"
			>
				<div class="d-flex flex-column align-items-center gap-2 flex-shrink-0">
					<span class="d-inline-flex align-items-center justify-content-center rounded-circle fw-bold" style="width: 2.4rem; height: 2.4rem; background: linear-gradient(135deg, #ff8a00 0%, #ffc14d 100%); color: #1f2937; box-shadow: inset 0 1px 0 rgba(255,255,255,0.35);">
						{./rank}
					</span>
					<span class="rounded-pill px-2 py-1 border bg-light-subtle small text-muted">{./hotMetrics.bucketLabel}</span>
				</div>
				<div class="flex-grow-1 min-width-0">
					<div class="d-flex flex-wrap gap-2 align-items-center mb-1">
						{{{ if ./category }}}
						{buildCategoryLabel(./category, "span", "border")}
						{{{ end }}}
					</div>
					<div class="fw-bold fs-6 text-break lh-sm">{./title}</div>
					{{{ if ./hotExcerpt }}}
					<div class="text-muted small mt-2 lh-base text-break line-clamp-3" style="display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">
						{./hotExcerpt}
					</div>
					{{{ end }}}
				</div>
				<div class="d-flex flex-row flex-lg-column gap-2 align-items-start align-items-lg-end flex-shrink-0 ms-lg-auto ps-lg-3">
					<span class="rounded-pill px-2 py-1 border bg-light-subtle small text-nowrap"><i class="fa fa-message text-danger me-1"></i>{humanReadableNumber(./hotMetrics.replies, 0)} 回复</span>
					<span class="rounded-pill px-2 py-1 border bg-light-subtle small text-nowrap"><i class="fa fa-thumbs-up text-primary me-1"></i>{humanReadableNumber(./hotMetrics.votes, 0)} 点赞</span>
					<span class="rounded-pill px-2 py-1 border bg-light-subtle small text-nowrap"><i class="fa fa-eye text-warning me-1"></i>{humanReadableNumber(./hotMetrics.views, 0)} 阅读</span>
				</div>
			</a>
		</li>
		{{{ end }}}
	</ol>
	{{{ if hotTopicsTop10.hasMore }}}
	<div class="px-4 pb-4 pt-2 bg-body-tertiary text-center">
		<button type="button" class="btn btn-light border fw-semibold" component="popular/hot-topics-more">
			显示更多
			<i class="fa fa-chevron-down ms-1"></i>
		</button>
	</div>
	{{{ end }}}
	{{{ else }}}
	<div class="px-4 py-4 text-muted">[[recent:no-popular-topics]]</div>
	{{{ end }}}
</section>
{{{ end }}}

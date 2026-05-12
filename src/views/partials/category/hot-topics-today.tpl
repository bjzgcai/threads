{{{ if hotTopics }}}
<section class="border rounded-1 mb-3" component="category/hot-topics-today">
	<div class="d-flex justify-content-between align-items-center px-3 py-2 border-bottom">
		<h2 class="fs-6 fw-semibold mb-0">[[category:hot-topics]]</h2>
		<span class="text-muted text-xs">[[category:hot-topics-score-label]]</span>
	</div>
	{{{ if hotTopics.hasTopics }}}
	<ol class="list-unstyled mb-0">
		{{{ each hotTopics.topics }}}
		<li class="d-flex gap-3 align-items-start px-3 py-2 border-bottom">
			<span class="badge text-bg-light border mt-1">{increment(@index, "1")}</span>
			<div class="flex-grow-1 min-width-0">
				<a class="fw-semibold text-reset text-decoration-none text-break" href="{config.relative_path}/topic/{./slug}">{./title}</a>
				<div class="d-flex flex-wrap gap-2 text-muted text-xs mt-1">
					<span><i class="fa fa-fire"></i> {humanReadableNumber(./heat, 0)}</span>
					<span><i class="fa fa-eye"></i> {humanReadableNumber(./viewcount, 0)}</span>
					<span><i class="fa fa-message"></i> {humanReadableNumber(./postcount, 0)}</span>
				</div>
			</div>
		</li>
		{{{ end }}}
	</ol>
	{{{ else }}}
	<div class="px-3 py-3 text-muted text-sm">[[category:hot-topics-empty]]</div>
	{{{ end }}}
</section>
{{{ end }}}

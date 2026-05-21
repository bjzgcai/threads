{{{ if widgets.header.length }}}
<div data-widget-area="header">
	{{{each widgets.header}}}
	{{widgets.header.html}}
	{{{end}}}
</div>
{{{ end }}}

<div class="row flex-fill">
	<div class="popular {{{if widgets.sidebar.length }}}col-lg-9 col-sm-12{{{ else }}}col-lg-12{{{ end }}}">
		<div class="category">
			<!-- IMPORT partials/category/hot-topics-today.tpl -->

			{{{ if !hotTopics.hasTopics }}}
			<div class="alert alert-info" id="category-no-topics">[[recent:no-popular-topics]]</div>
			{{{ end }}}
		</div>
	</div>
	<div data-widget-area="sidebar" class="col-lg-3 col-sm-12 {{{ if !widgets.sidebar.length }}}hidden{{{ end }}}">
		{{{ each widgets.sidebar }}}
		{{widgets.sidebar.html}}
		{{{ end }}}
	</div>
</div>

<div data-widget-area="footer">
	{{{each widgets.footer}}}
	{{widgets.footer.html}}
	{{{end}}}
</div>

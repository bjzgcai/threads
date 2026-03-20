{{{ if (config.showSiteTitle || widgets.brand-header.length) }}}
<div class="container-lg px-md-4 brand-container">
	<div class="col-12 d-flex border-bottom pb-3 {{{ if config.theme.centerHeaderElements }}}justify-content-center{{{ end }}}">
		{{{ if config.showSiteTitle }}}
		<div component="brand/wrapper" class="d-flex align-items-center gap-3 p-2 rounded-1 align-content-stretch ">
			<div component="siteTitle" class="text-truncate align-self-stretch align-items-center d-flex gap-2">
				<img src="{relative_path}/assets/logo.png" alt="诸葛菜园" style="width: 32px; height: 32px; object-fit: contain; flex-shrink: 0;" />
				<h1 class="fs-6 fw-bold text-body mb-0">{config.siteTitle}</h1>
			</div>
		</div>
		{{{ end }}}
		{{{ if widgets.brand-header.length }}}
		<div data-widget-area="brand-header" class="flex-fill gap-3 p-2 align-self-center">
			{{{each widgets.brand-header}}}
			{{./html}}
			{{{end}}}
		</div>
		{{{ end }}}
	</div>
</div>
{{{ end }}}

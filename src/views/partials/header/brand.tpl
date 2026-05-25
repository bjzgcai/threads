{{{ if (brand:logo || (config.showSiteTitle || widgets.brand-header.length)) }}}
<div class="container-lg px-md-4 brand-container zgci-brand-container">
	<div class="col-12 d-flex align-items-center justify-content-between gap-3 border-bottom pb-3 zgci-brand-bar {{{ if config.theme.centerHeaderElements }}}justify-content-center{{{ end }}}">
		{{{ if (brand:logo || config.showSiteTitle) }}}
		<a component="brand/wrapper" class="d-flex align-items-center gap-3 p-2 rounded-1 align-content-stretch text-decoration-none zgci-brand" href="{{{ if brand:logo:url }}}{brand:logo:url}{{{ else }}}{{{ if title:url }}}{title:url}{{{ else }}}{relative_path}/{{{ end }}}{{{ end }}}" aria-label="{config.siteTitle}">
			<div component="siteTitle" class="text-truncate align-self-stretch align-items-center d-flex gap-2 min-width-0">
				{{{ if brand:logo }}}
				<span class="zgci-brand-mark d-inline-flex align-items-center justify-content-center">
					<img src="{brand:logo}" alt="{{{ if brand:logo:alt }}}{brand:logo:alt}{{{ end }}}" />
				</span>
				{{{ else }}}
				<span class="zgci-brand-mark d-inline-flex align-items-center justify-content-center">
					<img src="{relative_path}/assets/images/logo.png" alt="" aria-hidden="true" />
				</span>
				{{{ end }}}
				{{{ if config.showSiteTitle }}}
				<span class="d-flex flex-column min-width-0">
					<h1 class="fs-6 fw-bold text-body mb-0 text-truncate">{config.siteTitle}</h1>
					<span class="text-secondary text-xs d-none d-sm-inline">内部知识协作平台</span>
				</span>
				{{{ end }}}
			</div>
		</a>
		{{{ end }}}
		{{{ if widgets.brand-header.length }}}
		<div data-widget-area="brand-header" class="flex-fill gap-3 p-2 align-self-center zgci-brand-widgets">
			{{{each widgets.brand-header}}}
			{{./html}}
			{{{end}}}
		</div>
		{{{ end }}}
	</div>
</div>
{{{ end }}}

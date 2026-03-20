<div data-widget-area="header">
	{{{each widgets.header}}}
	{{widgets.header.html}}
	{{{end}}}
</div>
<style>
	body.user-guest nav[component="sidebar/left"],
	body.user-guest nav[component="sidebar/right"],
	body.user-guest [component="bottombar"],
	body.user-guest .sidebar-toggle-container {
		display: none !important;
	}
	
	/* 缩小登录页面输入框高度 */
	.login-block .form-control {
		height: calc(1.5em + 0.5rem + 2px) !important;
		padding: 0.25rem 0.75rem !important;
		font-size: 0.95rem !important;
	}
</style>
<div class="row login flex-fill">
	<div class="d-flex flex-column gap-2 {{{ if widgets.sidebar.length }}}col-lg-9 col-sm-12{{{ else }}}col-lg-12{{{ end }}}">
		<div class="text-center mb-1">
			<img src="{config.relative_path}/assets/images/zgc.png" alt="诸葛菜园" style="max-width: 340px; width: 100%; height: auto;">
		</div>
		<div class="text-center mb-1">
			<p class="text-secondary mb-1" style="font-size: 1.1rem;">欢迎来到诸葛菜园</p>
			<h2 class="tracking-tight fw-semibold text-center mb-4" style="margin-top: 3.0rem;">[[global:login]]</h2>
		</div>
		<div class="row justify-content-center gap-5">
			{{{ if allowLocalLogin }}}
			<div class="col-12 col-md-5 col-lg-3 px-md-0">
				<div class="login-block">
					<form class="d-flex flex-column gap-3" role="form" method="post" id="login-form">
						<div class="mb-2 d-flex flex-column gap-2">
							<label for="username">{allowLoginWith}</label>
							<input class="form-control" type="text" placeholder="{allowLoginWith}" name="username" id="username" autocorrect="off" autocapitalize="off" autocomplete="nickname" value="{username}" aria-required="true"/>
						</div>

						<div class="mb-2 d-flex flex-column gap-2">
							<label for="password">[[user:password]]</label>
							<div>
								<input class="form-control" type="password" placeholder="[[user:password]]" name="password" id="password" autocomplete="current-password" autocapitalize="off" aria-required="true"/>
								<p id="caps-lock-warning" class="text-danger hidden text-sm mb-0 form-text" aria-live="polite" role="alert" aria-atomic="true">
									<i class="fa fa-exclamation-triangle"></i> [[login:caps-lock-enabled]]
								</p>
							</div>
							{{{ if allowPasswordReset }}}
							<div>
								<a id="reset-link" class="text-sm text-reset text-decoration-underline" href="{config.relative_path}/reset">[[login:forgot-password]]</a>
							</div>
							{{{ end }}}
						</div>

						{{{ each loginFormEntry }}}
						<div class="mb-2 loginFormEntry d-flex flex-column gap-2 {./styleName}">
							<label for="{./inputId}">{./label}</label>
							<div>{{./html}}</div>
						</div>
						{{{ end }}}

						<input type="hidden" name="_csrf" value="{config.csrf_token}" />
						<input type="hidden" name="noscript" id="noscript" value="true" />

						<button class="btn btn-primary" id="login" type="submit">[[global:login]]</button>

						<div class="form-check mb-2">
							<input class="form-check-input" type="checkbox" name="remember" id="remember" checked />
							<label class="form-check-label" for="remember">[[login:remember-me]]</label>
						</div>

						<div class="alert alert-danger {{{ if !error }}} hidden{{{ end }}}" id="login-error-notify" role="alert" aria-atomic="true">
							<strong>[[login:failed-login-attempt]]</strong>
							<p class="mb-0">{error}</p>
						</div>

					</form>
				</div>
			</div>
			{{{ end }}}

			{{{ if alternate_logins }}}
			<div class="col-12 col-md-7 col-lg-5 px-md-0">
				<div class="alt-login-block card border-0 shadow-sm">
					<div class="card-body p-4 p-md-5 d-flex flex-column gap-2">
					<ul class="alt-logins list-unstyled mb-0">
						{{{ each authentication }}}
						<li class="{./name} mb-2">
							<a class="btn btn-primary btn-lg w-100 d-flex align-items-center justify-content-center" rel="nofollow noopener noreferrer" target="_top" href="{config.relative_path}{./url}">
								{{{ if ./icons.svg }}}
								{./icons.svg}
								{{{ else }}}
								<i class="d-none flex-shrink-0 {./icons.normal}"></i>
								{{{ end }}}
								{{{ if ./labels.login }}}
								<div class="text-center">钉钉</div>
								{{{ end }}}
							</a></li>
						{{{ end }}}
					</ul>
					</div>
				</div>
			</div>
			{{{ end }}}
		</div>
	</div>
	<div data-widget-area="sidebar" class="col-lg-3 col-sm-12 {{{ if !widgets.sidebar.length }}}hidden{{{ end }}}">
		{{{each widgets.sidebar}}}
		{{widgets.sidebar.html}}
		{{{end}}}
	</div>
</div>
<div data-widget-area="footer">
	{{{each widgets.footer}}}
	{{widgets.footer.html}}
	{{{end}}}
</div>

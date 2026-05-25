<!-- IMPORT partials/account/header.tpl -->

<div class="zgci-account-edit">
	<div class="zgci-account-toolbar d-flex justify-content-between gap-3 py-3 mb-3 align-items-center position-sticky top-0 bg-body z-1">
		<div>
			<div class="text-uppercase text-secondary fw-semibold text-xs mb-1">Account Settings</div>
			<h3 class="fw-semibold fs-4 mb-0">{{{ if isSelf }}}[[user:edit-profile]]{{{ else }}}[[pages:account/edit, {username}]]{{{ end }}}</h3>
		</div>
		<button id="submitBtn" class="btn btn-primary zgci-save-button">
			<i class="fa fa-save me-1"></i>
			[[global:save-changes]]
		</button>
	</div>

	<div class="row g-4">
		<div class="col-xl-7 col-12">
			<form role="form" component="profile/edit/form" class="d-flex flex-column gap-4">
				<section class="zgci-settings-card">
					<div class="zgci-settings-card-header">
						<div>
							<h4 class="fs-5 fw-semibold mb-1">个人资料</h4>
							<p class="text-secondary text-sm mb-0">用于论坛展示的公开信息。</p>
						</div>
					</div>

					<div class="row g-3">
						<div class="col-md-6 col-12">
							<label class="form-label fw-semibold" for="fullname">[[user:fullname]]</label>
							<input class="form-control" type="text" id="fullname" name="fullname" placeholder="[[user:fullname]]" value="{fullname}">
						</div>

						<div class="col-md-6 col-12">
							<label class="form-label fw-semibold" for="readonly-email">[[user:email]]</label>
								<input class="form-control" type="text" id="readonly-email" value="{{{ if email }}}{email}{{{ else }}}-{{{ end }}}" readonly>
							<div class="form-text">邮箱由钉钉或管理员同步，不能在这里直接修改。</div>
						</div>

						<div class="col-md-6 col-12">
							<label class="form-label fw-semibold" for="birthday">[[user:birthday]]</label>
							<input class="form-control" type="date" id="birthday" name="birthday" value="{birthday}" placeholder="mm/dd/yyyy">
						</div>
					</div>
				</section>

				{{{ if customUserFields.length }}}
				<section class="zgci-settings-card">
					<div class="zgci-settings-card-header">
						<div>
							<h4 class="fs-5 fw-semibold mb-1">扩展信息</h4>
							<p class="text-secondary text-sm mb-0">这些字段由论坛配置决定。</p>
						</div>
					</div>
					<div class="row g-3">
						{{{ each customUserFields }}}
						<div class="col-md-6 col-12">
							<label class="form-label fw-semibold" for="{./key}">{./name}</label>
							{{{ if ((./type == "input-text") || (./type == "input-link")) }}}
							<input class="form-control" type="text" id="{./key}" name="{./key}" value="{./value}">
							{{{ end }}}

							{{{ if (./type == "input-number") }}}
							<input class="form-control" type="number" id="{./key}" name="{./key}" value="{./value}">
							{{{ end }}}

							{{{ if (./type == "input-date") }}}
							<input class="form-control" type="date" id="{./key}" name="{./key}" value="{./value}">
							{{{ end }}}

							{{{ if ((./type == "select") || (./type == "select-multi")) }}}
							<select class="form-select" id="{./key}" name="{./key}" {{{ if (./type == "select-multi") }}} multiple{{{ end }}}>
								{{{ each ./select-options}}}
								<option value="{./value}" {{{ if ./selected }}}selected{{{ end }}}>{./value}</option>
								{{{ end }}}
							</select>
							{{{ end }}}
						</div>
						{{{ end }}}
					</div>
				</section>
				{{{ end }}}

				<section class="zgci-settings-card">
					<div class="zgci-settings-card-header">
						<div>
							<h4 class="fs-5 fw-semibold mb-1">论坛偏好</h4>
							<p class="text-secondary text-sm mb-0">控制你在讨论中的展示方式。</p>
						</div>
					</div>

					{{{ if groups.length }}}
					<div class="mb-3">
						<label class="form-label fw-semibold" for="groupTitle">[[user:grouptitle]]</label>
						<div class="d-flex flex-column gap-2" component="group/badge/list">
							{{{ each groups }}}
							<div component="group/badge/item" class="d-flex gap-2 justify-content-between align-items-center zgci-group-badge-row" data-value="{./displayName}" data-selected="{./selected}">
								<!-- IMPORT partials/groups/badge.tpl -->
								<div class="d-flex gap-1">
										<button component="group/toggle/hide" type="button" class="btn btn-ghost btn-sm {{{ if !./selected }}}hidden{{{ end }}}" title="[[user:hide-group-title]]" aria-label="[[user:hide-group-title]]"><i class="fa fa-fw fa-eye"></i></button>
										<button component="group/toggle/show" type="button" class="btn btn-ghost btn-sm {{{ if ./selected }}}hidden{{{ end }}}" title="[[user:show-group-title]]" aria-label="[[user:show-group-title]]"><i class="fa fa-fw fa-eye-slash"></i></button>
										{{{ if allowMultipleBadges }}}
										<button component="group/order/up" type="button" class="btn btn-ghost btn-sm" title="[[user:order-group-up]]" aria-label="[[user:order-group-up]]"><i class="fa fa-fw fa-chevron-up"></i></button>
										<button component="group/order/down" type="button" class="btn btn-ghost btn-sm" title="[[user:order-group-down]]" aria-label="[[user:order-group-down]]"><i class="fa fa-fw fa-chevron-down"></i></button>
									{{{ end }}}
								</div>
							</div>
							{{{ end }}}
						</div>
					</div>
					{{{ end }}}

					{{{ if allowAboutMe }}}
					<div class="mb-3">
						<label class="form-label fw-semibold" for="aboutme">[[user:aboutme]]</label> <small><label id="aboutMeCharCountLeft"></label></small>
						<textarea class="form-control" id="aboutme" name="aboutme" rows="5">{aboutme}</textarea>
					</div>
					{{{ end }}}

					{{{ if (allowSignature && !disableSignatures) }}}
					<div class="mb-0">
						<label class="form-label fw-semibold" for="signature">[[user:signature]]</label> <small><label id="signatureCharCountLeft"></label></small>
						<textarea class="form-control" id="signature" name="signature" rows="5">{signature}</textarea>
					</div>
					{{{ end }}}
				</section>
			</form>
		</div>

		<aside class="col-xl-5 col-12">
			<div class="d-flex flex-column gap-4 zgci-account-aside">
				<section class="zgci-settings-card">
					<div class="zgci-settings-card-header">
						<div>
							<h4 class="fs-5 fw-semibold mb-1">账号动作</h4>
							<p class="text-secondary text-sm mb-0">头像和论坛身份设置。</p>
						</div>
					</div>
					<ul class="list-group list-group-flush zgci-action-list">
						{{{ if allowProfilePicture }}}
						<li class="list-group-item p-0">
							<a component="profile/change/picture" href="#" class="list-group-item-action d-flex align-items-center justify-content-between p-3 text-reset text-decoration-none">
								<span><i class="fa fa-image me-2 text-primary"></i>[[user:change-picture]]</span>
								<i class="fa fa-chevron-right text-secondary"></i>
							</a>
						</li>
						{{{ end }}}
						{{{ if !username:disableEdit }}}
						<li class="list-group-item p-0">
							<a href="{config.relative_path}/user/{userslug}/edit/username" class="list-group-item-action d-flex align-items-center justify-content-between p-3 text-reset text-decoration-none">
								<span><i class="fa fa-id-badge me-2 text-primary"></i>[[user:change-username]]</span>
								<i class="fa fa-chevron-right text-secondary"></i>
							</a>
						</li>
						{{{ end }}}
						{{{ if (canChangePassword && !disableCredentialEdit) }}}
						<li class="list-group-item p-0">
							<a href="{config.relative_path}/user/{userslug}/edit/password" class="list-group-item-action d-flex align-items-center justify-content-between p-3 text-reset text-decoration-none">
								<span><i class="fa fa-lock me-2 text-primary"></i>[[user:change-password]]</span>
								<i class="fa fa-chevron-right text-secondary"></i>
							</a>
						</li>
						{{{ end }}}
						{{{ each editButtons }}}
						<li class="list-group-item p-0">
							<a href="{config.relative_path}{./link}" class="list-group-item-action d-flex align-items-center justify-content-between p-3 text-reset text-decoration-none">
								<span>{./text}</span>
								<i class="fa fa-chevron-right text-secondary"></i>
							</a>
						</li>
						{{{ end }}}
					</ul>

					{{{ if config.requireEmailConfirmation }}}
					{{{ if (email && isSelf) }}}
					<a id="confirm-email" href="#" class="btn btn-warning mt-3 {{{ if email:confirmed }}}hide{{{ end }}}">[[user:confirm-email]]</a>
					{{{ end }}}
					{{{ end }}}
				</section>

				<section class="zgci-settings-card">
					<div class="zgci-settings-card-header">
						<div>
							<h4 class="fs-5 fw-semibold mb-1">账号与钉钉</h4>
							<p class="text-secondary text-sm mb-0">论坛登录由钉钉统一管理。</p>
						</div>
					</div>

					{{{ if sso.length }}}
					<div class="list-group list-group-flush zgci-action-list">
						{{{ each sso }}}
						<div class="list-group-item d-flex align-items-center justify-content-between gap-3">
							<a class="text-sm text-reset text-decoration-none" data-component="{./component}" href="{{{ if ./url }}}{./url}{{{ else }}}#{{{ end }}}" target="{{{ if ./associated }}}_blank{{{ else }}}_top{{{ end }}}">
								{{{ if ./icon }}}<i class="fa {./icon} me-1"></i>{{{ end }}}
								{{{ if ./associated }}}[[user:sso.associated]]{{{ else }}}[[user:sso.not-associated]]{{{ end }}}
								{./name}
							</a>
							{{{ if ./deauthUrl }}}
							<a data-component="{./component}" class="btn btn-outline-secondary btn-sm" href="{./deauthUrl}">[[user:sso.dissociate]]</a>
							{{{ end }}}
						</div>
						{{{ end }}}
					</div>
					{{{ else }}}
					<div class="text-secondary text-sm">当前没有可展示的第三方账号绑定信息。</div>
					{{{ end }}}
				</section>
			</div>
		</aside>
	</div>
</div>

<!-- IMPORT partials/account/footer.tpl -->

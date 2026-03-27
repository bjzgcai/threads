<!-- IMPORT partials/account/header.tpl -->

<h3 class="fw-semibold fs-5">{{{ if isSelf }}}[[user:change-username]]{{{ else }}}[[pages:{template.name}, {username}]]{{{ end }}}</h3>
<div class="row">
	<div class="col-12 col-lg-6">
		<form class="edit-form">
			<div class="mb-3">
				<label class="form-label fw-semibold text-sm" for="inputNewUsername">[[user:username]]</label>
				<input class="form-control" type="text" id="inputNewUsername" placeholder="[[user:username]]" value="{username}">
			</div>

			{{{ if (disableCredentialEdit && hasWuxiaNicknames) }}}
			<div class="mb-3">
				<label class="form-label fw-semibold text-sm" for="wuxiaNovelSelect">小说</label>
				<select class="form-select" id="wuxiaNovelSelect">
					<option value="">请选择小说</option>
					{{{ each wuxiaNicknames }}}
					<option value="{@index}">{./group} / {./novel}</option>
					{{{ end }}}
				</select>
			</div>

			<div class="mb-3">
				<label class="form-label fw-semibold text-sm" for="wuxiaCharacterSearch">人物花名</label>
				<input class="form-control mb-2" type="text" id="wuxiaCharacterSearch" placeholder="搜索或选择人物花名" disabled>
				<div id="wuxiaCharacterResults" class="list-group small border rounded overflow-auto" style="max-height: 280px;">
					<div class="list-group-item text-muted">请先选择小说</div>
				</div>
				<div class="form-text text-muted">如需自定义花名，可直接在上方输入框手动填写；也可以在这里搜索后直接点选人物花名。</div>
			</div>
			{{{ end }}}

			<!-- disables autocomplete on FF --><input type="password" style="display:none">

			{{{ if (isSelf && !disableCredentialEdit) }}}
			<div class="mb-3">
				<label class="form-label fw-semibold text-sm" for="inputCurrentPassword">[[user:current-password]]</label>
				<input autocomplete="off" class="form-control" type="password" id="inputCurrentPassword" placeholder="[[user:current-password]]" value=""{{{ if !hasPassword }}} disabled{{{ end }}}>
			</div>
			{{{ end }}}

			<input type="hidden" name="uid" id="inputUID" value="{uid}" />

			<div class="form-actions">
				<button id="submitBtn" class="btn btn-primary btn-block"><i class="hide fa fa-spinner fa-spin"></i> [[user:change-username]]</button>
			</div>
		</form>
	</div>
</div>

<!-- IMPORT partials/account/footer.tpl -->

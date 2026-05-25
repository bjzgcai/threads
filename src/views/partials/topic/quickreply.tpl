{{{ if (privileges.topics:create || privileges.topics:reply) }}}
<div component="topic/quickreply/container" class="quick-reply d-flex gap-3 mb-4 zgci-quick-reply">
	<div class="icon hidden-xs">
		<a class="d-inline-block position-relative" href="{{{ if loggedInUser.userslug }}}{config.relative_path}/user/{loggedInUser.userslug}{{{ else }}}#{{{ end }}}">
			{buildAvatar(loggedInUser, "48px", true, "", "user/picture")}
			{{{ if loggedInUser.status }}}<span component="user/status" class="position-absolute top-100 start-100 border border-white border-2 rounded-circle status {loggedInUser.status}"><span class="visually-hidden">[[global:{loggedInUser.status}]]</span></span>{{{ end }}}
		</a>
	</div>
	<form class="flex-grow-1 d-flex flex-column gap-2" method="post" action="{config.relative_path}/compose">
		<input type="hidden" name="tid" value="{tid}" />
		<input type="hidden" name="_csrf" value="{config.csrf_token}" />
		<div class="d-flex align-items-center justify-content-between gap-2 flex-wrap">
			<div>
				<div class="fw-semibold">参与讨论</div>
				<div class="text-secondary text-xs">支持 Markdown，草稿会按现有规则自动保留。</div>
			</div>
			<button type="button" component="topic/quickreply/expand" class="btn btn-ghost btn-sm border" title="[[topic:open-composer]]" aria-label="[[topic:open-composer]]"><i class="fa fa-expand"></i> <span class="d-none d-sm-inline">展开编辑器</span></button>
		</div>
		<div class="quickreply-message position-relative">
			<label class="visually-hidden" for="quickreply-content">[[modules:composer.textarea.placeholder]]</label>
			<textarea id="quickreply-content" rows="4" name="content" component="topic/quickreply/text" class="form-control mousetrap" placeholder="[[modules:composer.textarea.placeholder]]" aria-label="[[modules:composer.textarea.placeholder]]"></textarea>
			<div class="imagedrop"><div>[[topic:composer.drag-and-drop-images]]</div></div>
		</div>
		<div>
			<div class="d-flex justify-content-end gap-2">
				<button type="button" component="topic/quickreply/upload/button" class="btn btn-ghost btn-sm border" aria-label="[[modules:composer.upload-file]]"><i class="fa fa-upload"></i></button>
				<button type="submit" component="topic/quickreply/button" class="btn btn-sm btn-primary">[[topic:post-quick-{{{ if tid }}}reply{{{ else }}}create{{{ end }}}]]</button>
			</div>
		</div>
	</form>
	<form class="d-none" component="topic/quickreply/upload" method="post" enctype="multipart/form-data">
		<input type="file" name="files[]" multiple class="hidden"/>
	</form>
</div>
{{{ end }}}

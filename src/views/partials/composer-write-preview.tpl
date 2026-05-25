<div class="write-preview-container d-flex gap-2 flex-grow-1 overflow-auto zgci-composer-editor">
	<div class="write-container d-flex d-md-flex w-50 position-relative">
		<div component="composer/post-queue/alert" class="m-2 alert alert-info fade pe-none position-absolute top-0 start-0 alert-dismissible">[[modules:composer.post-queue-alert]]<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="关闭"></button></div>
		<div class="draft-icon position-absolute end-0 top-0 mx-2 my-1 hidden-md hidden-lg"></div>
		<label class="visually-hidden" for="composer-body-input">[[modules:composer.textarea.placeholder]]</label>
		<textarea id="composer-body-input" class="write shadow-none rounded-1 w-100 form-control overscroll-behavior-contain" placeholder="[[modules:composer.textarea.placeholder]]" aria-label="[[modules:composer.textarea.placeholder]]">{body}</textarea>
	</div>
	<div class="preview-container d-none d-md-flex w-50">
		<section class="preview w-100 overflow-auto" id="composer-preview-panel" aria-label="[[modules:composer.show-preview]]"></section>
	</div>
</div>

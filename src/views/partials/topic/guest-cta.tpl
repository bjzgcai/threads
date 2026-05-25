<div id="guest-cta-alert" class="alert alert-warning alert-dismissible fade show guest-cta-alert zgci-guest-cta" role="region" aria-label="登录后参与讨论">
	<p><strong>[[topic:guest-cta.title]]</strong></p>
	<p class="mb-2">两院内部成员请使用钉钉登录后参与回复、收藏和发起讨论。</p>
	<a href="{config.relative_path}/login" class="fw-semibold btn btn-sm btn-primary">钉钉登录后参与讨论</a>
	<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="关闭"></button>
</div>
<script>
(() => {
	const alertEl = document.getElementById('guest-cta-alert');
	if (alertEl) {
		if (sessionStorage.getItem('guestAlertDismissed')) {
			alertEl.remove();
			return;
		}
		alertEl.addEventListener('close.bs.alert', function () {
			sessionStorage.setItem('guestAlertDismissed', 'true');
		});
	}
})();
</script>

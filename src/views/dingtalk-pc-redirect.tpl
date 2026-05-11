<div class="flex-fill d-flex align-items-center justify-content-center">
	<div class="text-center">
		<div class="mb-4">
			<i class="fa fa-external-link fa-4x text-primary"></i>
		</div>
		<h2 class="fw-semibold mb-3">正在打开浏览器…</h2>
		<p class="text-secondary mb-4">如果没有自动跳转，请点击下面按钮或复制链接在浏览器中打开。</p>
		<a id="redirectLink" href="{dingtalkRedirectUrl}" rel="nofollow noopener noreferrer" class="btn btn-primary mb-3">打开浏览器</a>
		<div class="mb-3">
			<code class="text-break">{dingtalkRedirectUrl}</code>
		</div>
		<div>
			<a href="{targetUrl}" class="btn btn-link">直接打开站点（浏览器）</a>
		</div>
	</div>
</div>
<script>
	(function () {
		var dingtalkUrl = '{dingtalkRedirectUrl}';
		var targetUrl = '{targetUrl}';
		var isDingTalk = /DingTalk/i.test(navigator.userAgent);

		if (isDingTalk) {
			// 点击钉钉应用图标后，尝试由钉钉客户端打开浏览器
			window.location.href = dingtalkUrl;
			setTimeout(function () {
				var notice = document.createElement('div');
				notice.className = 'alert alert-warning mt-4';
				notice.textContent = '如果浏览器没有自动打开，请点击“打开浏览器”按钮。';
				document.querySelector('.text-center').appendChild(notice);
			}, 2000);
		} else {
			window.location.href = targetUrl;
		}
	})();
</script>

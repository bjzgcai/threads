<div class="flex-fill d-flex align-items-center justify-content-center">
	<div class="text-center" id="dingtalkRedirectContainer">
		<div class="mb-4">
			<i class="fa fa-external-link fa-4x text-primary"></i>
		</div>
		<h2 class="fw-semibold mb-3" id="redirectTitle">正在打开浏览器…</h2>
		<p class="text-secondary mb-4" id="redirectMessage">如果没有自动跳转，请点击下面按钮或复制链接在浏览器中打开。</p>
		<a id="redirectLink" href="{dingtalkRedirectUrl}" rel="nofollow noopener noreferrer" class="btn btn-primary mb-3">打开浏览器</a>
		<div class="mb-3" id="redirectUrlContainer">
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
		var container = document.getElementById('dingtalkRedirectContainer');
		var titleEl = document.getElementById('redirectTitle');
		var messageEl = document.getElementById('redirectMessage');
		var redirectLink = document.getElementById('redirectLink');
		var urlContainer = document.getElementById('redirectUrlContainer');

		function showFallbackNotice() {
			var notice = document.createElement('div');
			notice.className = 'alert alert-warning mt-4';
			notice.textContent = '如果浏览器没有自动打开，请点击“打开浏览器”按钮。';
			container.appendChild(notice);
		}

		function showMinimalMessage() {
			titleEl.textContent = '浏览器已打开';
			messageEl.textContent = '页面已经尝试打开外部浏览器，您可以关闭此页面。';
			redirectLink.style.display = 'none';
			urlContainer.style.display = 'none';
		}

		if (isDingTalk) {
			window.location.href = dingtalkUrl;
			setTimeout(showFallbackNotice, 2000);
			setTimeout(showMinimalMessage, 5000);
		} else {
			window.location.href = targetUrl;
		}
	})();
</script>

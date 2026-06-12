<div class="predictor-page container-xl mt-4">
	<div class="predictor-hero">
		<div class="predictor-hero-copy">
			<h1>世界杯竞猜结果</h1>
			<p class="lead">这里仅用于查看赛程、我的竞猜结果和排行榜。提交竞猜请到各场比赛讨论帖内完成。</p>
		</div>
		<div class="predictor-shortcuts">
			<a class="btn btn-primary" href="{config.relative_path}/predictor">比赛列表</a>
			<a class="btn btn-outline-primary" href="{config.relative_path}/predictor/my-results">我的竞猜结果</a>
			<a class="btn btn-outline-primary" href="{config.relative_path}/predictor/leaderboard">排行榜</a>
		</div>
	</div>

	<ul class="nav nav-tabs predictor-tabs mt-4" role="tablist">
		<li class="nav-item" role="presentation">
			<button class="nav-link active" data-bs-toggle="tab" data-bs-target="#matches" type="button" role="tab">比赛列表</button>
		</li>
		<li class="nav-item" role="presentation">
			<button class="nav-link" data-bs-toggle="tab" data-bs-target="#my-predictions" type="button" role="tab">我的预测</button>
		</li>
		<li class="nav-item" role="presentation">
			<button class="nav-link" data-bs-toggle="tab" data-bs-target="#leaderboard" type="button" role="tab">排行榜</button>
		</li>
	</ul>

	<div class="tab-content">
		<div class="tab-pane fade show active" id="matches" role="tabpanel">
			<div class="predictor-matches mt-4"></div>
		</div>

		<div class="tab-pane fade" id="my-predictions" role="tabpanel">
			{{{ if user.loggedIn }}}
			<div class="predictor-user-predictions mt-4"></div>
			{{{ else }}}
			<div class="alert alert-info mt-4 predictor-login-alert">
				<div class="fw-semibold">登录后可查看你的全部竞猜记录、实际结果和命中率。</div>
				<div class="mt-2">
					<a class="btn btn-primary btn-sm" href="{config.relative_path}/login?redirect={config.relative_path}/predictor/my-results">登录查看</a>
				</div>
			</div>
			{{{ end }}}
		</div>

		<div class="tab-pane fade" id="leaderboard" role="tabpanel">
			<div class="predictor-leaderboard mt-4"></div>
		</div>
	</div>
</div>

<script>
	if (typeof window.predictorData === 'undefined') {
		window.predictorData = {
			matches: JSON.parse('{{matchesJSON}}'),
			user: JSON.parse('{{userJSON}}'),
			config: JSON.parse('{{configJSON}}')
		};
	}
</script>

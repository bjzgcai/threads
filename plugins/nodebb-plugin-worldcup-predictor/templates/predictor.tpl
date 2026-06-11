<div class="predictor-page container-xl mt-4">
	<div class="row">
		<div class="col-12">
			<h1>
				<i class="fa fa-trophy"></i>
				世界杯竞猜中心
			</h1>
			<p class="lead">预测比赛结果，与社区一起竞猜</p>
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
			<div class="alert alert-info mt-4">
				请 <a href="{config.relative_path}/login?redirect={config.relative_path}/predictor">登录</a> 查看你的竞猜
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
		matches: {{{ matchesJSON }}},
		user: {{{ userJSON }}},
		config: {{{ configJSON }}}
	};
}
</script>

<div class="modal fade" id="predictModal" tabindex="-1" aria-hidden="true">
	<div class="modal-dialog">
		<div class="modal-content">
			<div class="modal-header">
				<h5 class="modal-title">竞猜结果</h5>
				<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
			</div>
			<div class="modal-body">
				<div class="match-info mb-3"></div>
				<div class="predict-options">
					<div class="btn-group-vertical w-100">
						<button type="button" class="btn btn-outline-primary predict-btn" data-result="home">
							<span class="home-name"></span> 胜
						</button>
						<button type="button" class="btn btn-outline-primary predict-btn" data-result="draw">
							平局
						</button>
						<button type="button" class="btn btn-outline-primary predict-btn" data-result="away">
							<span class="away-name"></span> 胜
						</button>
					</div>
					<div class="mt-3">
						<label class="form-label">或输入比分</label>
						<div class="input-group">
							<input type="number" class="form-control home-score" min="0" placeholder="主队进球">
							<span class="input-group-text">:</span>
							<input type="number" class="form-control away-score" min="0" placeholder="客队进球">
						</div>
					</div>
				</div>
			</div>
			<div class="modal-footer">
				<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
				<button type="button" class="btn btn-primary" id="submitPrediction">提交竞猜</button>
				<button type="button" class="btn btn-success" id="publishAsPost">发布为帖子</button>
			</div>
		</div>
	</div>
</div>

<div class="modal fade" id="publishModal" tabindex="-1" aria-hidden="true">
	<div class="modal-dialog">
		<div class="modal-content">
			<div class="modal-header">
				<h5 class="modal-title">发布竞猜结果为帖子</h5>
				<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
			</div>
			<div class="modal-body">
				<div class="mb-3">
					<label for="categorySelect" class="form-label">选择分类</label>
					<select class="form-select" id="categorySelect">
						<option value="">-- 请选择分类 --</option>
					</select>
				</div>
				<div class="mb-3">
					<label for="postTitle" class="form-label">帖子标题</label>
					<input type="text" class="form-control" id="postTitle" placeholder="我的世界杯竞猜">
				</div>
				<div class="mb-3">
					<label for="postContent" class="form-label">帖子内容</label>
					<textarea class="form-control" id="postContent" rows="4" placeholder="分享你的竞猜预测"></textarea>
				</div>
			</div>
			<div class="modal-footer">
				<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
				<button type="button" class="btn btn-primary" id="confirmPublish">发布</button>
			</div>
		</div>
	</div>
</div>

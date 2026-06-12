'use strict';

const Predictor = {
	currentMatch: null,
	currentPrediction: null,
	eventsBound: false,
	matches: {},
	config: {},
	user: null,
};

$(function() {
	Predictor.initialize();
});

Predictor.initialize = function() {
	if (!Predictor.eventsBound) {
		Predictor.bindEvents();
		$(window).off('action:ajaxify.end', Predictor.onAjaxifyEnd).on('action:ajaxify.end', Predictor.onAjaxifyEnd);
		Predictor.eventsBound = true;
	}

	if (window.location.pathname.indexOf('/predictor') !== -1 || ajaxify.data?.template?.name === 'predictor') {
		Predictor.init();
	}
};

Predictor.onAjaxifyEnd = function() {
	if (ajaxify.data?.template?.name === 'predictor') {
		Predictor.init();
	}
};

Predictor.init = function() {
	const data = window.predictorData || {};
	Predictor.matches = data.matches || {};
	Predictor.config = data.config || {};
	Predictor.user = data.user || (window.app && app.user && app.user.uid ? { uid: app.user.uid, username: app.user.username } : null);

	Predictor.activateInitialTab();
	Predictor.loadMatches();

	$('[data-bs-target="#leaderboard"]').one('click', Predictor.loadLeaderboard);
	if (Predictor.user) {
		$('[data-bs-target="#my-predictions"]').one('click', Predictor.loadUserPredictions);
	}
	if (Predictor.config.activeTab === 'leaderboard') {
		Predictor.loadLeaderboard();
	}
	if (Predictor.user && Predictor.config.activeTab === 'my-predictions') {
		Predictor.loadUserPredictions();
	}
};

Predictor.activateInitialTab = function() {
	const activeTab = Predictor.config.activeTab;
	if (!activeTab || typeof bootstrap === 'undefined' || !bootstrap.Tab) {
		return;
	}

	const trigger = document.querySelector(`[data-bs-target="#${activeTab}"]`);
	if (trigger) {
		bootstrap.Tab.getOrCreateInstance(trigger).show();
	}
};

Predictor.bindEvents = function() {
	$(document).on('click', '.btn-predict', function() {
		const matchId = $(this).closest('.match-card').data('match-id');
		if (!Predictor.user) {
			window.location.href = `${Predictor.config.relative_path || ''}/login?redirect=${encodeURIComponent((Predictor.config.relative_path || '') + '/predictor')}`;
			return;
		}
		Predictor.openPredictModal(matchId);
	});

	$(document).on('click', '.predict-btn', function() {
		$(this).siblings('.predict-btn').removeClass('selected');
		$(this).addClass('selected');
		Predictor.currentPrediction = {
			type: 'result',
			result: $(this).data('result'),
		};
	});

	$(document).on('input', '.home-score, .away-score', function() {
		const homeScore = $('.home-score').val();
		const awayScore = $('.away-score').val();

		if (homeScore !== '' && awayScore !== '') {
			$('.predict-btn').removeClass('selected');
			Predictor.currentPrediction = {
				type: 'score',
				homeScore: parseInt(homeScore, 10),
				awayScore: parseInt(awayScore, 10),
			};
		}
	});

	$('#submitPrediction').on('click', function() {
		Predictor.submitPrediction();
	});

	$('#publishAsPost').on('click', function() {
		if (!Predictor.user) {
			window.location.href = `${Predictor.config.relative_path || ''}/login?redirect=${encodeURIComponent((Predictor.config.relative_path || '') + '/predictor')}`;
			return;
		}
		$('#predictModal').modal('hide');
		setTimeout(Predictor.openPublishModal, 300);
	});

	$('#confirmPublish').on('click', function() {
		Predictor.publishAsPost();
	});
};

Predictor.loadMatches = function() {
	if (Object.keys(Predictor.matches).length > 0) {
		Predictor.renderMatches();
		if (Predictor.user) {
			Predictor.loadUserPredictions();
		}
		return;
	}

	$.ajax({
		url: `${Predictor.config.relative_path || ''}/api/v3/predictor/matches`,
		type: 'GET',
		dataType: 'json',
		success: function(response) {
			Predictor.matches = response;
			Predictor.renderMatches();
			if (Predictor.user) {
				Predictor.loadUserPredictions();
			}
		},
		error: function(err) {
			console.error('Failed to load matches:', err);
			$('.predictor-matches').html('<div class="alert alert-danger">加载比赛失败，请稍后重试</div>');
		}
	});
};

Predictor.renderMatches = function() {
	const container = $('.predictor-matches');
	container.empty();

	if (Object.keys(Predictor.matches).length === 0) {
		container.html('<div class="alert alert-info">暂无比赛数据</div>');
		return;
	}

	const matchesByDate = {};
	Object.values(Predictor.matches).forEach(match => {
		if (!matchesByDate[match.date]) {
			matchesByDate[match.date] = [];
		}
		matchesByDate[match.date].push(match);
	});

	Object.keys(matchesByDate).sort().forEach(date => {
		const dateLabel = Predictor.formatDate(date);
		const html = `
			<div class="match-date-group">
				<h4 class="date-header">${dateLabel}</h4>
				<div class="matches-list"></div>
			</div>`;
		const group = $(html);

		matchesByDate[date].forEach(match => {
			const cardHtml = Predictor.renderMatchCard(match);
			group.find('.matches-list').append(cardHtml);
		});

		container.append(group);
	});
};

Predictor.renderMatchCard = function(match) {
	const statusClass = match.status || 'upcoming';
	const statusLabel = {
		upcoming: '即将开始',
		live: '正在进行',
		finished: '已结束',
	}[statusClass] || '未知';
	const resultText = Predictor.formatMatchResultText(match);
	const predictionClosed = !Predictor.isPredictionOpen(match);

	return `
		<div class="match-card" data-match-id="${match.id}">
			<span class="match-status ${statusClass}">${statusLabel}</span>
			<div class="match-info">
				<div class="match-team">
					<div class="flag">${match.home.flag}</div>
					<div class="name">${match.home.name}</div>
				</div>
				<div class="match-vs">
					<div class="time">${match.time}</div>
					<div style="font-size: 12px;">VS</div>
				</div>
				<div class="match-team">
					<div class="flag">${match.away.flag}</div>
					<div class="name">${match.away.name}</div>
				</div>
			</div>
			<div class="match-details">
				<span class="badge">${match.stage}</span>
				<span class="badge">第 ${match.group} 组</span>
			</div>
			${resultText ? `<div class="match-result-line">${resultText}</div>` : ''}
			<div class="match-actions">
				<button class="btn btn-predict" ${predictionClosed ? 'disabled' : ''}>${predictionClosed ? '已截止' : '竞猜'}</button>
			</div>
		</div>`;
};

Predictor.openPredictModal = function(matchId) {
	const match = Predictor.matches[matchId];
	if (!match) {
		return;
	}

	Predictor.currentMatch = match;
	Predictor.currentPrediction = null;

	const matchInfo = `
		<div class="match-info-modal">
			<div class="match-info" style="margin: 0;">
				<div class="match-team">
					<div class="flag">${match.home.flag}</div>
					<div class="name">${match.home.name}</div>
				</div>
				<div class="match-vs">
					<div class="time">${match.date} ${match.time}</div>
					<div>VS</div>
				</div>
				<div class="match-team">
					<div class="flag">${match.away.flag}</div>
					<div class="name">${match.away.name}</div>
				</div>
			</div>
		</div>`;

	$('#predictModal .match-info').html(matchInfo);
	$('#predictModal .home-name').text(match.home.name);
	$('#predictModal .away-name').text(match.away.name);
	$('.predict-btn').removeClass('selected');
	$('.home-score').val('');
	$('.away-score').val('');

	const modal = new bootstrap.Modal(document.getElementById('predictModal'));
	modal.show();
};

Predictor.submitPrediction = function() {
	if (!Predictor.currentMatch || !Predictor.currentPrediction) {
		alert('请选择竞猜结果');
		return;
	}

	$.ajax({
		url: `${Predictor.config.relative_path || ''}/api/v3/predictor/predictions`,
		type: 'POST',
		contentType: 'application/json',
		dataType: 'json',
		data: JSON.stringify({
			matchId: Predictor.currentMatch.id,
			prediction: Predictor.currentPrediction,
		}),
		success: function() {
			alert('竞猜已提交！');
			$('#predictModal').modal('hide');
			Predictor.loadUserPredictions();
		},
		error: function(err) {
			console.error('Failed to submit prediction:', err);
			alert('提交失败，请稍后重试');
		},
	});
};

Predictor.openPublishModal = function() {
	const match = Predictor.currentMatch;
	if (!match) {
		return;
	}

	const select = $('#categorySelect');
	select.empty();
	select.append('<option value="">-- 请选择分类 --</option>');

	$.ajax({
		url: `${Predictor.config.relative_path || ''}/api/v3/categories`,
		type: 'GET',
		dataType: 'json',
		success: function(response) {
			const categories = Array.isArray(response) ? response : (response.categories || response.response?.categories || []);
			categories.forEach(cat => {
				select.append(`<option value="${cat.cid}">${cat.name}</option>`);
			});
		},
		error: function(err) {
			console.error('Failed to load categories:', err);
			select.append('<option value="">分类加载失败</option>');
		},
	});

	$('#postTitle').val(`世界杯竞猜: ${match.home.name} vs ${match.away.name}${Predictor.formatTitleTime(match)}`);
	const predictionText = Predictor.currentPrediction.type === 'result'
		? (Predictor.currentPrediction.result === 'home'
			? `${match.home.name} 胜`
			: Predictor.currentPrediction.result === 'away'
				? `${match.away.name} 胜`
				: '平局')
		: `${Predictor.currentPrediction.homeScore} - ${Predictor.currentPrediction.awayScore}`;

	$('#postContent').val(`${match.home.flag} ${match.home.name} vs ${match.away.name} ${match.away.flag}\n\n${predictionText}\n\n比赛时间: ${match.date} ${match.time}`);

	const modal = new bootstrap.Modal(document.getElementById('publishModal'));
	modal.show();
};

Predictor.publishAsPost = function() {
	const cid = $('#categorySelect').val();
	const title = $('#postTitle').val();
	const content = $('#postContent').val();

	if (!cid) {
		alert('请选择分类');
		return;
	}

	if (!title || !content) {
		alert('请填写标题和内容');
		return;
	}

	$.ajax({
		url: `${Predictor.config.relative_path || ''}/api/v3/predictor/publish-result`,
		type: 'POST',
		contentType: 'application/json',
		dataType: 'json',
		data: JSON.stringify({
			matchId: Predictor.currentMatch.id,
			categoryId: cid,
			title,
			content,
			predictionMode: Predictor.currentPrediction?.type === 'result' ? 'result' : 'score',
		}),
		success: function(response) {
			alert('帖子已发布！');
			$('#publishModal').modal('hide');
			if (response.data && response.data.url) {
				window.location.href = response.data.url;
			}
		},
		error: function(err) {
			console.error('Failed to publish post:', err);
			alert('发布失败，请稍后重试');
		},
	});
};

Predictor.loadUserPredictions = function() {
	if (!Predictor.user) {
		return;
	}

	$.ajax({
		url: `${Predictor.config.relative_path || ''}/api/v3/predictor/my-predictions`,
		type: 'GET',
		dataType: 'json',
		success: function(response) {
			Predictor.renderUserPredictions(response);
		},
		error: function(err) {
			console.error('Failed to load user predictions:', err);
		},
	});
};

Predictor.renderUserPredictions = function(response) {
	const container = $('.predictor-user-predictions');
	container.empty();
	const entries = Array.isArray(response && response.entries) ? response.entries : Object.values(response && response.predictions || {});
	const summary = response && response.summary ? response.summary : null;

	if (!entries.length) {
		container.html('<div class="alert alert-info">你还没有进行任何竞猜</div>');
		return;
	}

	if (summary) {
		container.append(Predictor.renderUserPredictionSummary(summary));
	}

	entries.forEach(pred => {
		const match = pred.match || Predictor.matches[pred.matchId];
		if (!match) {
			return;
		}

		const predictionText = Predictor.formatPredictionText(match, pred.prediction || {});
		const resultText = Predictor.formatMatchResultText(match);
		const verdictBadge = Predictor.formatVerdictBadge(pred.verdict);
		const submittedAt = pred.createdAt ? new Date(parseInt(pred.createdAt, 10)).toLocaleString() : '';

		const html = `
			<div class="prediction-item">
				<div class="match-info-mini">
					<span>${match.home.flag} ${match.home.name} vs ${match.away.name} ${match.away.flag}</span>
					<span class="prediction-result">${predictionText}</span>
				</div>
				<div class="prediction-meta-row">
					${verdictBadge}
					<span class="prediction-match-result ${resultText ? '' : 'text-muted'}">${resultText || '比赛未结算'}</span>
				</div>
				${submittedAt ? `<div style="font-size: 12px; color: #999;">提交时间：${submittedAt}</div>` : ''}
			</div>`;

		container.append(html);
	});
};

Predictor.loadLeaderboard = function() {
	$.ajax({
		url: `${Predictor.config.relative_path || ''}/api/v3/predictor/leaderboard`,
		type: 'GET',
		dataType: 'json',
		success: function(response) {
			Predictor.renderLeaderboard(response.leaderboard || []);
		},
		error: function(err) {
			console.error('Failed to load leaderboard:', err);
		},
	});
};

Predictor.renderLeaderboard = function(leaderboard) {
	const container = $('.predictor-leaderboard');
	container.empty();

	if (!Array.isArray(leaderboard) || leaderboard.length === 0) {
		container.html('<div class="alert alert-info">暂无排行榜数据</div>');
		return;
	}

	let html = '<div class="leaderboard-table"><table class="table"><thead><tr><th>排名</th><th>用户</th><th>积分</th></tr></thead><tbody>';

	leaderboard.forEach((entry, index) => {
		const rank = index + 1;
		let rankClass = '';
		let rankSymbol = rank;

		if (rank === 1) {
			rankClass = 'top1';
			rankSymbol = '🥇';
		} else if (rank === 2) {
			rankClass = 'top2';
			rankSymbol = '🥈';
		} else if (rank === 3) {
			rankClass = 'top3';
			rankSymbol = '🥉';
		}

		html += `
			<tr>
				<td class="rank ${rankClass}">${rankSymbol}</td>
				<td>${entry.username}</td>
				<td class="score">${entry.score}</td>
			</tr>`;
	});

	html += '</tbody></table></div>';
	container.html(html);
};

Predictor.formatDate = function(dateStr) {
	const date = new Date(`${dateStr}T00:00:00`);
	const options = { month: 'short', day: 'numeric', weekday: 'short' };
	return date.toLocaleDateString('zh-CN', options);
};

Predictor.formatTitleTime = function(match) {
	const date = String(match.date || '').trim();
	const time = String(match.time || '').trim();
	const monthDay = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(5, 10) : date;
	const hourMinute = /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : time;
	const value = [monthDay, hourMinute].filter(Boolean).join(' ');
	return value ? `（${value}）` : '';
};

Predictor.isPredictionOpen = function(match) {
	if (!match || !match.date || !match.time) {
		return true;
	}

	const kickoff = Date.parse(`${match.date}T${match.time}:00+08:00`);
	return !Number.isFinite(kickoff) || Date.now() < kickoff;
};

Predictor.formatPredictionText = function(match, prediction) {
	if (!prediction) {
		return '';
	}

	if (prediction.type === 'result') {
		if (prediction.result === 'home') {
			return `${match.home.name} 胜`;
		}
		if (prediction.result === 'away') {
			return `${match.away.name} 胜`;
		}
		return '平局';
	}

	return `${match.home.name} ${prediction.homeScore} : ${prediction.awayScore} ${match.away.name}`;
};

Predictor.formatMatchResultText = function(match) {
	if (!match || !match.result) {
		return '';
	}

	const result = match.result;
	const resultLabel = result.result === 'home'
		? `${match.home.name} 胜`
		: result.result === 'away'
			? `${match.away.name} 胜`
			: '平局';
	return `赛果：${match.home.name} ${result.homeScore} : ${result.awayScore} ${match.away.name} · ${resultLabel}`;
};

Predictor.formatVerdictBadge = function(verdict) {
	if (!verdict) {
		return '';
	}

	return `<span class="badge text-bg-${verdict.variant || 'secondary'}">${verdict.label}</span>`;
};

Predictor.renderUserPredictionSummary = function(summary) {
	const accuracy = summary.accuracy || {};
	return `
		<div class="prediction-summary-grid">
			<div class="prediction-summary-card">
				<div class="prediction-summary-label">总场次</div>
				<div class="prediction-summary-value">${summary.total || 0}</div>
			</div>
			<div class="prediction-summary-card">
				<div class="prediction-summary-label">已猜中</div>
				<div class="prediction-summary-value">${summary.correct || 0}</div>
			</div>
			<div class="prediction-summary-card">
				<div class="prediction-summary-label">待结算</div>
				<div class="prediction-summary-value">${summary.pending || 0}</div>
			</div>
			<div class="prediction-summary-card">
				<div class="prediction-summary-label">积分</div>
				<div class="prediction-summary-value">${summary.points || 0}</div>
			</div>
			<div class="prediction-summary-card">
				<div class="prediction-summary-label">命中率</div>
				<div class="prediction-summary-value">${accuracy.percent || 0}%</div>
			</div>
		</div>`;
};

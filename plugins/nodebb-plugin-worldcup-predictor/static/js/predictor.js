'use strict';

const Predictor = {
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
	$(document).on('click', '.predictor-page a[data-ajaxify="false"]', function(ev) {
		const href = $(this).attr('href');
		if (!href) {
			return;
		}

		ev.preventDefault();
		ev.stopPropagation();
		window.location.href = href;
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

		matchesByDate[date]
			.sort(Predictor.compareMatches)
			.forEach(match => {
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
	const kickoffText = `${match.date} ${match.time}`;
	const phaseText = Predictor.isPredictionOpen(match) ? '可在比赛帖内竞猜' : '仅展示赛果与结果';

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
				${Predictor.renderGroupBadge(match)}
				<span class="badge">${kickoffText}</span>
			</div>
			<div class="match-note">${phaseText}</div>
			${resultText ? `<div class="match-result-line">${resultText}</div>` : ''}
			${match.topicUrl ? `
				<div class="match-actions">
					<a class="btn btn-outline-primary" href="${match.topicUrl}" data-ajaxify="false">进入比赛帖</a>
				</div>
			` : ''}
		</div>`;
};

Predictor.loadUserPredictions = function() {
	const container = $('.predictor-user-predictions');
	if (!Predictor.user) {
		container.html(Predictor.renderLoginPrompt());
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
			container.html('<div class="alert alert-danger">加载竞猜记录失败，请稍后重试</div>');
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
				${pred.topicUrl ? `<div class="prediction-link-row"><a class="btn btn-outline-primary btn-sm" href="${pred.topicUrl}" data-ajaxify="false">进入比赛帖</a></div>` : ''}
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

	const podium = leaderboard.slice(0, 3).map((entry, index) => {
		const rank = index + 1;
		const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉';
		return `
			<div class="leaderboard-podium-card rank-${rank}">
				<div class="leaderboard-podium-rank">${medal}</div>
				<div class="leaderboard-podium-name">${Predictor.escapeHtml(entry.displayname || entry.username)}</div>
				<div class="leaderboard-podium-score">${entry.score}</div>
				<div class="leaderboard-podium-meta">命中 ${entry.correct} 场 · 命中率 ${entry.accuracy}%</div>
			</div>`;
	}).join('');

	let html = `
		<div class="leaderboard-summary">
			<div class="leaderboard-summary-title">当前排行榜</div>
			<div class="leaderboard-summary-subtitle">按积分、命中场次、精确比分命中数排序</div>
		</div>
		${podium ? `<div class="leaderboard-podium">${podium}</div>` : ''}
		<div class="leaderboard-table"><table class="table"><thead><tr><th>排名</th><th>用户</th><th>积分</th><th>命中</th><th>命中率</th><th>精确比分</th><th>待结算</th><th>最近结果</th></tr></thead><tbody>`;

	leaderboard.forEach((entry, index) => {
		const rank = index + 1;
		const recent = Predictor.renderRecentVerdicts(entry.recent || []);

		html += `
			<tr>
				<td class="rank ${rank <= 3 ? `top${rank}` : ''}">${rank}</td>
				<td>
					<div class="leaderboard-user">${Predictor.escapeHtml(entry.displayname || entry.username)}</div>
				</td>
				<td class="score">${entry.score}</td>
				<td>${entry.correct}/${entry.total}</td>
				<td>${entry.accuracy}%</td>
				<td>${entry.exact}</td>
				<td>${entry.pending}</td>
				<td>${recent}</td>
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

Predictor.compareMatches = function(left, right) {
	const leftFinished = String(left && left.status || '') === 'finished';
	const rightFinished = String(right && right.status || '') === 'finished';
	if (leftFinished !== rightFinished) {
		return leftFinished ? 1 : -1;
	}

	const leftKickoff = Date.parse(`${left.date}T${left.time}:00+08:00`) || 0;
	const rightKickoff = Date.parse(`${right.date}T${right.time}:00+08:00`) || 0;
	return leftKickoff - rightKickoff;
};

Predictor.renderGroupBadge = function(match) {
	if (!match || !match.group) {
		return '';
	}

	if (match.format === 'group') {
		return `<span class="badge">${match.group}组</span>`;
	}

	return `<span class="badge">${match.group}</span>`;
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

Predictor.renderLoginPrompt = function() {
	return `
		<div class="alert alert-info predictor-login-alert">
			<div class="fw-semibold">登录后可查看你的全部竞猜记录、实际结果和命中率。</div>
			<div class="mt-2">
				<a class="btn btn-primary btn-sm" href="${Predictor.config.relative_path || ''}/login?redirect=${encodeURIComponent((Predictor.config.relative_path || '') + '/predictor/my-results')}">登录查看</a>
			</div>
		</div>`;
};

Predictor.renderRecentVerdicts = function(recent) {
	if (!Array.isArray(recent) || !recent.length) {
		return '<span class="text-muted">暂无</span>';
	}

	return `<div class="leaderboard-recent">${recent.map((item) => {
		let cls = 'pending';
		if (item.status === 'exact') {
			cls = 'exact';
		} else if (item.status === 'correct') {
			cls = 'correct';
		} else if (item.status === 'wrong') {
			cls = 'wrong';
		}
		return `<span class="leaderboard-recent-dot ${cls}" title="${Predictor.escapeHtml(item.label || item.status || '')}"></span>`;
	}).join('')}</div>`;
};

Predictor.escapeHtml = function(value) {
	return String(value || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
};

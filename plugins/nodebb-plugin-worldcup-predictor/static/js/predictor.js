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

	Predictor.ensureGlobalEntry();

	if (window.location.pathname.indexOf('/predictor') !== -1 || ajaxify.data?.template?.name === 'predictor') {
		Predictor.init();
	}
};

Predictor.onAjaxifyEnd = function() {
	Predictor.ensureGlobalEntry();
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

	Predictor.initializeTooltips();
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

	$(document).on('click', '[component="predictor/global-entry"] a', function(ev) {
		const entry = $(this).closest('[component="predictor/global-entry"]');
		if (window.matchMedia && window.matchMedia('(max-width: 767px)').matches && !entry.hasClass('is-expanded')) {
			ev.preventDefault();
			ev.stopPropagation();
			entry.addClass('is-expanded');
			window.setTimeout(function() {
				entry.removeClass('is-expanded');
			}, 2400);
			return;
		}

		const href = $(this).attr('href');
		if (!href) {
			return;
		}

		ev.preventDefault();
		ev.stopPropagation();
		window.location.href = href;
	});

	$(document).on('click', '.predictor-round-tab', function(ev) {
		ev.preventDefault();
		const button = $(this);
		const shell = button.closest('.predictor-round-tabs-shell');
		const index = button.attr('data-round-index');
		shell.find('.predictor-round-tab').removeClass('is-active').attr('aria-selected', 'false');
		button.addClass('is-active').attr('aria-selected', 'true');
		shell.find('.predictor-round-pane').removeClass('is-active');
		shell.find(`.predictor-round-pane[data-round-index="${index}"]`).addClass('is-active');
	});

	$(document).on('click', '.leaderboard-recent-trigger', function(ev) {
		ev.preventDefault();
		ev.stopPropagation();
		const item = $(this).closest('.leaderboard-recent-item');
		const shouldOpen = !item.hasClass('is-open');
		$('.leaderboard-recent-item.is-open').removeClass('is-open');
		if (shouldOpen) {
			item.addClass('is-open');
		}
	});

	$(document).on('click', function() {
		$('.leaderboard-recent-item.is-open').removeClass('is-open');
	});
};

Predictor.ensureGlobalEntry = function() {
	const onPredictorPage = window.location.pathname.indexOf('/predictor') !== -1 || ajaxify.data?.template?.name === 'predictor';
	const onAdminPage = window.location.pathname.indexOf('/admin') === 0 || ajaxify.data?.template?.name?.indexOf('admin/') === 0;
	const body = $('body');

	if (onPredictorPage || onAdminPage) {
		body.find('[component="predictor/global-entry"]').remove();
		return;
	}

	if (body.find('[component="predictor/global-entry"]').length) {
		return;
	}

	body.append(`
		<div component="predictor/global-entry" class="predictor-global-entry">
			<a href="${config.relative_path || ''}/predictor" class="predictor-global-entry-link" data-ajaxify="false" aria-label="进入世界杯竞猜">
				<span class="predictor-global-entry-icon" aria-hidden="true">🏆</span>
				<span class="predictor-global-entry-text">世界杯竞猜</span>
			</a>
		</div>
	`);
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

	const rounds = Predictor.groupMatchesByRound(Object.values(Predictor.matches));
	container.html(Predictor.renderRoundTabs(rounds, '本轮比赛', (round) => {
		let html = '';
		const matchesByDate = {};
		round.matches.forEach((match) => {
			if (!matchesByDate[match.date]) {
				matchesByDate[match.date] = [];
			}
			matchesByDate[match.date].push(match);
		});

		Object.keys(matchesByDate).sort().forEach((date) => {
			const dateLabel = Predictor.formatDate(date);
			html += `
				<div class="match-date-group">
					<h4 class="date-header">${dateLabel}</h4>
					<div class="matches-list">
						${matchesByDate[date].sort(Predictor.compareMatches).map(match => Predictor.renderMatchCard(match)).join('')}
					</div>
				</div>`;
		});
		return html;
	}));
};

Predictor.renderRoundTabs = function(rounds, kicker, renderBody, countText) {
	const safeRounds = Array.isArray(rounds) ? rounds : [];
	if (!safeRounds.length) {
		return '<div class="alert alert-info">暂无数据</div>';
	}

	const nav = safeRounds.map((round, index) => `
		<button class="predictor-round-tab ${index === 0 ? 'is-active' : ''}" type="button" data-round-index="${index}" aria-selected="${index === 0 ? 'true' : 'false'}">
			<span>${Predictor.escapeHtml(round.label)}</span>
			<small>${Predictor.escapeHtml(typeof countText === 'function' ? countText(round) : `${(round.matches || round.entries || []).length} 场`)}</small>
		</button>`).join('');
	const panes = safeRounds.map((round, index) => `
		<div class="predictor-round-pane ${index === 0 ? 'is-active' : ''}" data-round-index="${index}">
			<div class="predictor-round-header">
				<div>
					<div class="predictor-round-kicker">${Predictor.escapeHtml(kicker)}</div>
					<h3>${Predictor.escapeHtml(round.label)}</h3>
				</div>
				<span class="predictor-round-count">${Predictor.escapeHtml(typeof countText === 'function' ? countText(round) : `${(round.matches || round.entries || []).length} 场`)}</span>
			</div>
			<div class="predictor-round-body">${renderBody(round)}</div>
		</div>`).join('');

	return `
		<div class="predictor-round-tabs-shell">
			<div class="predictor-round-tabs" role="tablist" aria-label="轮次切换">${nav}</div>
			<div class="predictor-round-panes">${panes}</div>
		</div>`;
};

Predictor.renderMatchCard = function(match) {
	const statusClass = Predictor.getMatchStatus(match);
	const statusLabel = {
		upcoming: '即将开始',
		live: '进行中',
		finished: '已结束',
	}[statusClass] || '未知';
	const resultText = Predictor.formatMatchResultText(match);
	const kickoffText = `${match.date} ${match.time}`;
	const phaseText = Predictor.isPredictionOpen(match) ? '可在比赛帖内竞猜' : '仅展示赛果与结果';

	return `
		<div class="match-card ${statusClass === 'finished' ? 'finished' : ''}" data-match-id="${match.id}">
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
				<span class="badge match-badge-stage">${match.stage}</span>
				${Predictor.renderGroupBadge(match)}
				<span class="badge match-badge-kickoff">${kickoffText}</span>
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
	const rounds = Array.isArray(response && response.rounds) && response.rounds.length ? response.rounds : Predictor.groupPredictionsByRound(entries);

	if (!entries.length) {
		container.html('<div class="alert alert-info">你还没有进行任何竞猜</div>');
		return;
	}

	container.html(Predictor.renderRoundTabs(rounds, '我的本轮成绩', (round) => {
		return `${round.summary ? Predictor.renderUserPredictionSummary(round.summary) : ''}${(round.entries || []).map(pred => Predictor.renderUserPredictionItem(pred)).join('')}`;
	}, (round) => `${(round.entries || []).length} 场`));
};

Predictor.renderUserPredictionItem = function(pred) {
	const match = pred.match || Predictor.matches[pred.matchId];
	if (!match) {
		return '';
	}

	const predictionText = Predictor.formatPredictionText(match, pred.prediction || {});
	const resultText = Predictor.formatMatchResultText(match);
	const verdictBadge = Predictor.formatVerdictBadge(pred.verdict);
	const submittedAt = pred.createdAt ? new Date(parseInt(pred.createdAt, 10)).toLocaleString() : '';

	return `
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
};

Predictor.loadLeaderboard = function() {
	$.ajax({
		url: `${Predictor.config.relative_path || ''}/api/v3/predictor/leaderboard`,
		type: 'GET',
		dataType: 'json',
		success: function(response) {
			Predictor.renderLeaderboard(response.leaderboard || [], response.rounds || []);
		},
		error: function(err) {
			console.error('Failed to load leaderboard:', err);
		},
	});
};

Predictor.renderLeaderboard = function(leaderboard, rounds) {
	const container = $('.predictor-leaderboard');
	container.empty();

	if (Array.isArray(rounds) && rounds.length) {
		container.html(Predictor.renderRoundTabs(rounds, '本轮排行榜', (round) => {
			return Predictor.renderLeaderboardBlock(round.leaderboard || [], '');
		}, (round) => `${round.matchCount || 0} 场`));
		Predictor.initializeTooltips(container);
		return;
	}

	container.html(Predictor.renderLeaderboardBlock(leaderboard || [], '当前排行榜'));
	Predictor.initializeTooltips(container);
};

Predictor.renderLeaderboardBlock = function(leaderboard, title) {
	if (!Array.isArray(leaderboard) || leaderboard.length === 0) {
		return '<div class="alert alert-info">暂无排行榜数据</div>';
	}

	const podium = leaderboard.slice(0, 3).map((entry, index) => {
		const rank = index + 1;
		const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉';
		return `
			<div class="leaderboard-podium-card rank-${rank}">
				<div class="leaderboard-podium-rank">${medal}</div>
				<div class="leaderboard-podium-name">${Predictor.escapeHtml(entry.displayname || entry.username)}</div>
				<div class="leaderboard-podium-score">${Predictor.formatScore(entry.score)}</div>
				<div class="leaderboard-podium-meta">命中 ${entry.correct} 场 · 命中率 ${entry.accuracy}%</div>
			</div>`;
	}).join('');

	let html = `
		${title ? `<div class="leaderboard-summary">
			<div class="leaderboard-summary-title">${Predictor.escapeHtml(title)}</div>
			<div class="leaderboard-summary-subtitle">按本轮积分、命中场次排序。积分规则：猜中 3 分，猜错 0.5 分，不猜 0 分。</div>
		</div>` : ''}
		${podium ? `<div class="leaderboard-podium">${podium}</div>` : ''}
		<div class="leaderboard-scroll-hint">左右滑动可查看更多数据</div>
		<div class="leaderboard-table"><table class="table"><thead><tr><th>排名</th><th>用户</th><th>积分</th><th>命中</th><th>命中率</th><th>待结算</th><th>最近结果</th></tr></thead><tbody>`;

	leaderboard.forEach((entry, index) => {
		const rank = index + 1;
		const recent = Predictor.renderRecentVerdicts(entry.recent || []);

		html += `
			<tr>
				<td class="rank ${rank <= 3 ? `top${rank}` : ''}">${rank}</td>
				<td><div class="leaderboard-user">${Predictor.escapeHtml(entry.displayname || entry.username)}</div></td>
				<td class="score">${Predictor.formatScore(entry.score)}</td>
				<td>${entry.correct}/${entry.total}</td>
				<td>${entry.accuracy}%</td>
				<td>${entry.pending}</td>
				<td>${recent}</td>
			</tr>`;
	});

	html += '</tbody></table></div>';
	return html;
};

Predictor.getMatchRoundKey = function(match) {
	const round = String(match && match.round || '').trim();
	if (round && round !== '0') {
		return round;
	}
	if (String(match && match.format || '').trim() === 'knockout' && String(match && match.stage || '').trim()) {
		return String(match.stage).trim();
	}
	return 'unassigned';
};

Predictor.getMatchRoundLabel = function(match) {
	const key = Predictor.getMatchRoundKey(match);
	if (key === 'unassigned') {
		return '未分轮次';
	}
	if (String(match && match.format || '').trim() === 'group') {
		const map = { '1': '小组赛第一轮', '2': '小组赛第二轮', '3': '小组赛第三轮' };
		return map[key] || `小组赛第${key}轮`;
	}
	return String(match && match.stage || '').trim() || `第${key}轮`;
};

Predictor.compareRoundKeys = function(leftKey, rightKey) {
	const leftNumber = parseInt(leftKey, 10);
	const rightNumber = parseInt(rightKey, 10);
	const leftIsNumber = Number.isInteger(leftNumber) && String(leftNumber) === String(leftKey);
	const rightIsNumber = Number.isInteger(rightNumber) && String(rightNumber) === String(rightKey);
	if (leftIsNumber && rightIsNumber) {
		return leftNumber - rightNumber;
	}
	if (leftIsNumber !== rightIsNumber) {
		return leftIsNumber ? -1 : 1;
	}
	if (leftKey === 'unassigned' || rightKey === 'unassigned') {
		return leftKey === rightKey ? 0 : (leftKey === 'unassigned' ? 1 : -1);
	}
	return String(leftKey).localeCompare(String(rightKey), 'zh-Hans-CN');
};

Predictor.groupMatchesByRound = function(matches) {
	const groups = {};
	(matches || []).forEach((match) => {
		const key = match.roundKey || Predictor.getMatchRoundKey(match);
		if (!groups[key]) {
			groups[key] = { key, label: match.roundLabel || Predictor.getMatchRoundLabel(match), matches: [] };
		}
		groups[key].matches.push(match);
	});
	return Object.values(groups)
		.sort((a, b) => Predictor.compareRoundKeys(a.key, b.key))
		.map((group) => ({ ...group, matches: group.matches.sort(Predictor.compareMatches) }));
};

Predictor.groupPredictionsByRound = function(entries) {
	return Predictor.groupMatchesByRound((entries || []).map((entry) => entry.match || Predictor.matches[entry.matchId]).filter(Boolean)).map((round) => {
		const roundEntries = (entries || []).filter((entry) => {
			const match = entry.match || Predictor.matches[entry.matchId];
			return match && (match.roundKey || Predictor.getMatchRoundKey(match)) === round.key;
		});
		return { key: round.key, label: round.label, entries: roundEntries, summary: Predictor.summarizePredictionEntries(roundEntries) };
	});
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
	const leftFinished = Predictor.getMatchStatus(left) === 'finished';
	const rightFinished = Predictor.getMatchStatus(right) === 'finished';
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
		return `<span class="badge match-badge-group">${match.group}组</span>`;
	}

	return `<span class="badge match-badge-group">${match.group}</span>`;
};

Predictor.isPredictionOpen = function(match) {
	if (!match || !match.date || !match.time) {
		return true;
	}

	const kickoff = Date.parse(`${match.date}T${match.time}:00+08:00`);
	return !Number.isFinite(kickoff) || Date.now() < kickoff;
};

Predictor.getMatchStatus = function(match) {
	if (!match) {
		return 'upcoming';
	}

	if (match.result) {
		return 'finished';
	}

	const kickoff = Date.parse(`${match.date}T${match.time}:00+08:00`);
	if (Number.isFinite(kickoff) && Date.now() >= kickoff) {
		return 'live';
	}

	return 'upcoming';
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

Predictor.summarizePredictionEntries = function(entries) {
	const summary = (entries || []).reduce((memo, entry) => {
		const verdict = entry.verdict || {};
		memo.total += 1;
		if (verdict.status === 'pending') {
			memo.pending += 1;
		} else if (verdict.correct) {
			memo.correct += 1;
		} else if (verdict.status) {
			memo.wrong += 1;
		}
		memo.points += Number(verdict.points) || 0;
		return memo;
	}, { total: 0, pending: 0, correct: 0, wrong: 0, points: 0 });
	const settled = Math.max(summary.correct + summary.wrong, 0);
	summary.accuracy = { settled, percent: settled ? Math.round((summary.correct / settled) * 100) : 0 };
	return summary;
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
				<div class="prediction-summary-value">${Predictor.formatScore(summary.points || 0)}</div>
			</div>
			<div class="prediction-summary-card">
				<div class="prediction-summary-label">命中率</div>
				<div class="prediction-summary-value">${accuracy.percent || 0}%</div>
			</div>
	</div>`;
};

Predictor.formatScore = function(score) {
	const value = Number(score) || 0;
	return Number.isInteger(value) ? String(value) : value.toFixed(1);
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
		const tooltip = [item.matchLabel, item.label || item.status || ''].filter(Boolean).join(' - ');
		return `
			<span class="leaderboard-recent-item">
				<button class="leaderboard-recent-trigger" type="button" aria-label="${Predictor.escapeHtml(tooltip)}">
					<span class="leaderboard-recent-dot ${cls}"></span>
				</button>
				<span class="leaderboard-recent-panel">${Predictor.escapeHtml(tooltip)}</span>
			</span>`;
	}).join('')}</div>`;
};

Predictor.initializeTooltips = function(scope) {
	if (typeof bootstrap === 'undefined' || !bootstrap.Tooltip) {
		return;
	}

	const root = scope && scope.length ? scope[0] : document;
	const nodes = root.querySelectorAll('[data-bs-toggle="tooltip"]');
	nodes.forEach((node) => {
		bootstrap.Tooltip.getOrCreateInstance(node, {
			container: 'body',
			trigger: node.getAttribute('data-bs-trigger') || 'hover focus',
		});
	});
};

Predictor.escapeHtml = function(value) {
	return String(value || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
};

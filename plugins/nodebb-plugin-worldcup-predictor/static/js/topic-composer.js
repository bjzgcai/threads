'use strict';

(function () {
	const ComposerPredictor = {
		matchesPromise: null,
		topicCardLoadedTid: null,
		topicContextPromise: {},
	};

	function getMatches() {
		if (!ComposerPredictor.matchesPromise) {
			ComposerPredictor.matchesPromise = $.getJSON(`${config.relative_path || ''}/api/v3/predictor/matches`)
				.catch(function () {
					return {};
				});
		}
		return ComposerPredictor.matchesPromise;
	}

	function getTopicContext(tid, force) {
		if (!tid) {
			return Promise.resolve({ enabled: false });
		}

		if (force || !ComposerPredictor.topicContextPromise[tid]) {
			ComposerPredictor.topicContextPromise[tid] = $.getJSON(`${config.relative_path || ''}/api/v3/predictor/topic/${tid}`)
				.catch(function () {
					return { enabled: false };
				});
		}

		return ComposerPredictor.topicContextPromise[tid];
	}

	function buildPredictionText(match, prediction) {
		if (!match || !prediction) {
			return '';
		}

		if (prediction.type === 'result') {
			if (prediction.result === 'home') {
				return `我预测：${match.home.name} 胜。`;
			}
			if (prediction.result === 'away') {
				return `我预测：${match.away.name} 胜。`;
			}
			return `我预测：${match.home.name} 与 ${match.away.name} 打平。`;
		}

		return `我预测：${match.home.name} ${prediction.homeScore} : ${prediction.awayScore} ${match.away.name}。`;
	}

	function applyPredictionSelection(container, prediction) {
		if (!prediction) {
			return;
		}

		if (prediction.type === 'result') {
			const btn = container.find(`.predictor-choice[data-result="${prediction.result}"]`);
			if (btn.length) {
				btn.trigger('click');
			}
			return;
		}

		container.find('.predictor-home-score').val(prediction.homeScore);
		container.find('.predictor-away-score').val(prediction.awayScore);
	}

	function enhanceComposer(payload) {
		const postContainer = payload.postContainer;
		const postData = payload.postData;
		if (!postData) {
			return;
		}

		if (postData.action === 'posts.reply') {
			enhanceReplyComposer(postContainer, postData);
		}
	}

	function renderReplyComposerSection(context) {
		if (!context.predictionOpen || context.myPrediction) {
			return '';
		}

		const resultButtons = `
			<div class="predictor-result-buttons d-flex flex-wrap gap-2">
				<button class="btn btn-outline-primary predictor-choice" type="button" data-type="result" data-result="home">${context.match.home.name} 胜</button>
				<button class="btn btn-outline-primary predictor-choice" type="button" data-type="result" data-result="draw">平局</button>
				<button class="btn btn-outline-primary predictor-choice" type="button" data-type="result" data-result="away">${context.match.away.name} 胜</button>
			</div>
		`;
		const scoreInputs = `
			<div class="predictor-score-inputs d-flex align-items-center gap-2">
				<input type="number" class="form-control predictor-home-score" min="0" placeholder="${context.match.home.name}">
				<span class="fw-semibold">:</span>
				<input type="number" class="form-control predictor-away-score" min="0" placeholder="${context.match.away.name}">
			</div>
		`;

		return `
			<div component="predictor/reply-composer" class="predictor-composer-section predictor-reply-section border rounded-2 p-3 mt-3" data-tid="${context.tid}" data-mode="${context.predictionMode}">
				<div class="d-flex flex-column gap-2">
					<div class="d-flex flex-wrap justify-content-between gap-2 align-items-start">
						<div>
							<div class="form-label fw-semibold mb-1">本帖已绑定比赛</div>
							<div class="small text-muted">${context.match.home.flag} ${context.match.home.name} vs ${context.match.away.name} ${context.match.away.flag} · ${context.match.date} ${context.match.time}</div>
						</div>
						<div class="small text-muted predictor-reply-summary">${predictionText(context)}</div>
					</div>
					<div>
						<div class="small fw-semibold mb-2">回帖时顺手提交预测</div>
						${context.predictionMode === 'result' ? resultButtons : scoreInputs}
					</div>
					<div class="small text-muted">不选择也可以正常回复；选了以后，发帖前会先保存这次预测。</div>
				</div>
			</div>
		`;
	}

	function enhanceReplyComposer(postContainer, postData) {
		// Predictions are submitted only from the topic card. Replies must remain plain replies.
		if (postContainer) {
			postContainer.find('[component="predictor/reply-composer"]').remove();
		}
		if (postData) {
			delete postData.predictorTopicContext;
		}
	}

	function predictionText(context) {
		if (!context.myPrediction || !context.myPrediction.prediction) {
			return '你还没有提交预测';
		}

		const prediction = context.myPrediction.prediction;
		if (prediction.type === 'result') {
			if (prediction.result === 'home') {
				return `我的预测：${context.match.home.name} 胜`;
			}
			if (prediction.result === 'away') {
				return `我的预测：${context.match.away.name} 胜`;
			}
			return '我的预测：平局';
		}

		return `我的预测：${context.match.home.name} ${prediction.homeScore} : ${prediction.awayScore} ${context.match.away.name}`;
	}

	function predictionValueText(context) {
		return predictionText(context).replace(/^我的预测：/, '');
	}

	function formatTitleTime(match) {
		const date = String(match && match.date || '').trim();
		const time = String(match && match.time || '').trim();
		const monthDay = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(5, 10) : date;
		const hourMinute = /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : time;
		return [monthDay, hourMinute].filter(Boolean).join(' ');
	}

	function formatSubmittedAt(value) {
		const timestamp = parseInt(value, 10);
		if (!timestamp) {
			return '';
		}

		const date = new Date(timestamp);
		const pad = number => String(number).padStart(2, '0');
		return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
	}

	function renderMyPredictionDetails(context) {
		if (!context.myPrediction || !context.myPrediction.prediction) {
			return '';
		}

		const submittedAt = formatSubmittedAt(context.myPrediction.createdAt);
		const verdict = context.myPredictionVerdict;
		return `
			<div class="predictor-my-prediction">
				<div class="predictor-my-prediction-label">我的预测</div>
				<div class="predictor-my-prediction-value">${predictionValueText(context)}</div>
				${verdict ? `<div class="predictor-my-prediction-verdict predictor-verdict-${escapeHtml(verdict.variant || 'secondary')}">${escapeHtml(verdict.label || '')}</div>` : ''}
				${submittedAt ? `<div class="predictor-my-prediction-meta">提交时间：${submittedAt}</div>` : ''}
			</div>
		`;
	}

	function renderMatchResult(context) {
		if (!context.matchResult) {
			return '';
		}

		const result = context.matchResult;
		const resultLabel = result.result === 'home'
			? `${context.match.home.name} 胜`
			: result.result === 'away'
				? `${context.match.away.name} 胜`
				: '平局';
		const sourceLine = result.sourceUrl ? `<div class="predictor-result-source"><a href="${escapeHtml(result.sourceUrl)}" target="_blank" rel="noopener noreferrer">查看</a></div>` : '';

		return `
			<div class="predictor-match-result">
				<div class="predictor-match-result-label">比赛结果</div>
				<div class="predictor-match-result-score">${escapeHtml(context.match.home.name)} ${result.homeScore} : ${result.awayScore} ${escapeHtml(context.match.away.name)}</div>
				<div class="predictor-match-result-text">${escapeHtml(resultLabel)}</div>
				${sourceLine}
			</div>
		`;
	}

	function renderResultLinks() {
		return `
			<div class="predictor-topic-links">
				<a class="btn btn-outline-primary btn-sm" href="${config.relative_path || ''}/predictor/my-results" data-ajaxify="false">我的竞猜结果</a>
				<a class="btn btn-outline-primary btn-sm" href="${config.relative_path || ''}/predictor/leaderboard" data-ajaxify="false">排行榜</a>
			</div>
		`;
	}

	function escapeHtml(value) {
		return String(value || '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function renderPredictionSummary(context) {
		const summary = context.predictionSummary;
		if (!summary || !summary.total) {
			return '';
		}

		const counts = summary.counts || {};
		const rows = summary.mode === 'result' ? ['home', 'draw', 'away'].map((key) => {
			const count = parseInt(counts[key], 10) || 0;
			const percent = summary.total ? Math.round((count / summary.total) * 100) : 0;
			return `
				<div class="predictor-summary-row predictor-summary-${key}">
					<div class="predictor-summary-main">
						<div class="predictor-summary-label"><span class="predictor-summary-dot"></span>${escapeHtml(summary.labels && summary.labels[key] || key)}</div>
						<div class="predictor-summary-people">${count} 人选择</div>
					</div>
					<div class="predictor-summary-percent">${percent}%</div>
					<div class="predictor-summary-bar"><span style="width: ${percent}%"></span></div>
				</div>
			`;
		}).join('') : Object.keys(counts).sort((a, b) => counts[b] - counts[a]).map((label) => {
			const count = parseInt(counts[label], 10) || 0;
			const percent = summary.total ? Math.round((count / summary.total) * 100) : 0;
			return `
				<div class="predictor-summary-row predictor-summary-score">
					<div class="predictor-summary-main">
						<div class="predictor-summary-label"><span class="predictor-summary-dot"></span>${escapeHtml(label)}</div>
						<div class="predictor-summary-people">${count} 人选择</div>
					</div>
					<div class="predictor-summary-percent">${percent}%</div>
					<div class="predictor-summary-bar"><span style="width: ${percent}%"></span></div>
				</div>
			`;
		}).join('');

		return `
			<div class="predictor-summary-panel">
				<div class="d-flex justify-content-between flex-wrap gap-2 mb-2">
					<div class="fw-semibold">当前预测情况</div>
					<div class="small text-muted">已参与 ${summary.total} 人</div>
				</div>
				${rows}
			</div>
		`;
	}

	function renderPredictionDetails(context) {
		if (!context.canViewPredictionDetails || !Array.isArray(context.predictionDetails) || !context.predictionDetails.length) {
			return '';
		}

		const rows = context.predictionDetails.map((entry, index) => {
			const submittedAt = formatSubmittedAt(entry.createdAt);
			const displayname = entry.displayname || entry.fullname || entry.username || '未知用户';
			return `
				<tr>
					<td class="predictor-detail-index">${index + 1}</td>
					<td class="predictor-detail-name">${escapeHtml(displayname)}</td>
					<td><span class="predictor-detail-pick">${escapeHtml(entry.label)}</span></td>
					<td class="predictor-detail-time">${escapeHtml(submittedAt)}</td>
				</tr>
			`;
		}).join('');

		return `
			<details class="predictor-details-panel">
				<summary>
					<span>版主/管理员可见：预测明细</span>
					<span class="predictor-details-count">${context.predictionDetails.length} 人</span>
				</summary>
				<div class="predictor-detail-table-wrap mt-3">
					<table class="predictor-detail-table">
						<thead>
							<tr>
								<th>#</th>
								<th>花名</th>
								<th>预测</th>
								<th>提交时间</th>
							</tr>
						</thead>
						<tbody>${rows}</tbody>
					</table>
				</div>
			</details>
		`;
	}

	function predictionClosedText(context) {
		if (context.kickoffTimestamp) {
			return '比赛已开始，胜平负预测已截止。';
		}
		return '当前已停止预测，可继续普通回复讨论。';
	}

	function renderTopicCard(context) {
		const matchTime = formatTitleTime(context.match);
		const resultButtons = `
			<div class="predictor-result-buttons d-flex flex-wrap gap-2">
				<button class="btn btn-outline-primary predictor-choice" data-type="result" data-result="home">${context.match.home.name} 胜</button>
				<button class="btn btn-outline-primary predictor-choice" data-type="result" data-result="draw">平局</button>
				<button class="btn btn-outline-primary predictor-choice" data-type="result" data-result="away">${context.match.away.name} 胜</button>
			</div>
		`;
		const scoreInputs = `
			<div class="predictor-score-inputs d-flex align-items-center gap-2">
				<input type="number" class="form-control predictor-home-score" min="0" placeholder="${context.match.home.name}">
				<span class="fw-semibold">:</span>
				<input type="number" class="form-control predictor-away-score" min="0" placeholder="${context.match.away.name}">
			</div>
		`;

		return `
			<div component="predictor/topic-card" class="predictor-topic-card border rounded-2 p-3 mb-4" data-tid="${context.tid}" data-mode="${context.predictionMode}">
				<div class="d-flex flex-column gap-3">
					<div class="d-flex flex-wrap justify-content-between gap-3 align-items-start">
						<div>
							<div class="small text-muted mb-1">比赛讨论帖</div>
							<div class="d-flex align-items-center gap-3 predictor-topic-headline">
								<span class="predictor-flag">${context.match.home.flag}</span>
								<div class="fw-semibold">${context.match.home.name}</div>
								<div class="predictor-topic-vs">
									<div class="fw-semibold">VS</div>
									${matchTime ? `<div class="small text-muted">${matchTime}</div>` : ''}
								</div>
								<div class="fw-semibold">${context.match.away.name}</div>
								<span class="predictor-flag">${context.match.away.flag}</span>
							</div>
							<div class="mt-2 d-flex flex-wrap gap-2">
								<span class="badge text-bg-light">${context.match.stage}</span>
								<span class="badge text-bg-light">第 ${context.match.group} 组</span>
								<span class="badge text-bg-light">参与预测 ${context.participantCount || 0} 人</span>
								<span class="badge ${context.predictionOpen ? 'text-bg-success' : 'text-bg-secondary'}">${context.predictionOpen ? '预测开放中' : '预测已截止'}</span>
							</div>
					</div>
						<div class="predictor-current">${context.myPrediction ? renderMyPredictionDetails(context) : `<div class="small text-muted">${predictionText(context)}</div>`}</div>
					</div>
					${renderMatchResult(context)}
					${renderResultLinks()}
					${context.predictionSummary ? renderPredictionSummary(context) : ''}
					${renderPredictionDetails(context)}
					${context.loggedIn && !context.myPrediction && context.predictionOpen ? `
						<div class="d-flex flex-column gap-3">
							<div>
								<div class="fw-semibold mb-2">快速预测</div>
								${context.predictionMode === 'result' ? resultButtons : scoreInputs}
							</div>
							<div class="d-flex gap-2 align-items-center">
								<button class="btn btn-primary predictor-submit">提交预测</button>
								<span class="predictor-feedback text-muted small"></span>
							</div>
						</div>
					` : context.loggedIn && context.myPrediction ? `
						<div class="predictor-locked-note">
							<div class="alert alert-success mb-0">
								<div class="fw-semibold">预测已提交</div>
								<div class="small mt-1">你的预测已记录在上方卡片中；本帖预测提交后不可修改，你仍可继续发表普通回复。</div>
							</div>
						</div>
					` : context.loggedIn ? `
						<div class="predictor-locked-note">
							<div class="small text-muted mb-1">胜平负预测</div>
							<div class="fw-semibold">已截止</div>
							<div class="small text-muted mt-2">${predictionClosedText(context)}</div>
						</div>
					` : `
						<div class="alert alert-info mb-0">${context.predictionOpen ? '请先登录后提交预测。' : predictionClosedText(context)}</div>
					`}
				</div>
			</div>
		`;
	}

	function attachTopicCard() {
		if (!ajaxify.data || ajaxify.data.template.name !== 'topic' || !ajaxify.data.tid) {
			$('[component="predictor/topic-card"]').remove();
			ComposerPredictor.topicCardLoadedTid = null;
			return;
		}

		if (ComposerPredictor.topicCardLoadedTid === ajaxify.data.tid) {
			return;
		}

		$.getJSON(`${config.relative_path || ''}/api/v3/predictor/topic/${ajaxify.data.tid}`)
			.done(function (context) {
				if (!context || !context.enabled) {
					return;
				}

				$('[component="predictor/topic-card"]').remove();
				const card = $(renderTopicCard(context));
				const anchor = $('.topic-info').first();
				if (anchor.length) {
					card.insertAfter(anchor);
				} else {
					$('#content').prepend(card);
				}
				ComposerPredictor.topicCardLoadedTid = ajaxify.data.tid;
			});
	}

	function collectPrediction(card) {
		const mode = card.attr('data-mode');
		if (mode === 'result') {
			const selected = card.find('.predictor-choice.active');
			if (!selected.length) {
				return null;
			}
			return {
				type: 'result',
				result: selected.attr('data-result'),
			};
		}

		const homeScore = card.find('.predictor-home-score').val();
		const awayScore = card.find('.predictor-away-score').val();
		if (homeScore === '' || awayScore === '') {
			return null;
		}
		return {
			type: 'score',
			homeScore: parseInt(homeScore, 10),
			awayScore: parseInt(awayScore, 10),
		};
	}

	function submitTopicPrediction(card) {
		const tid = card.data('tid');
		const prediction = collectPrediction(card);
		if (!prediction) {
			card.find('.predictor-feedback').text('请先选择预测结果');
			return;
		}

		card.find('.predictor-submit').prop('disabled', true);
		card.find('.predictor-feedback').text('提交中...');

		$.ajax({
			url: `${config.relative_path || ''}/api/v3/predictor/topic/${tid}/predict`,
			type: 'POST',
			contentType: 'application/json',
			dataType: 'json',
			data: JSON.stringify({
				prediction,
				createReply: false,
			}),
		}).done(function (response) {
			card.find('.predictor-feedback').text('预测已提交');
			ComposerPredictor.topicCardLoadedTid = null;
			ComposerPredictor.topicContextPromise[tid] = null;
			setTimeout(function () {
				ajaxify.refresh();
			}, 300);
		}).fail(function (xhr) {
			const message = xhr.responseJSON && xhr.responseJSON.error ? xhr.responseJSON.error : '提交失败';
			card.find('.predictor-feedback').text(message);
		}).always(function () {
			card.find('.predictor-submit').prop('disabled', false);
		});
	}

	require(['hooks'], function (hooks) {
		hooks.on('action:composer.enhanced', enhanceComposer);
		hooks.on('filter:composer.check', function (payload) {
			if (payload && payload.postContainer) {
				payload.postContainer.find('[component="predictor/reply-composer"]').remove();
			}
			return payload;
		});
		hooks.on('filter:composer.submit', async function (payload) {
			if (payload && payload.composerEl) {
				payload.composerEl.find('[component="predictor/reply-composer"]').remove();
			}
			return payload;
		});
		hooks.on('action:composer.posts.reply', function () {
			ComposerPredictor.topicCardLoadedTid = null;
			if (ajaxify.data && ajaxify.data.tid) {
				ComposerPredictor.topicContextPromise[ajaxify.data.tid] = null;
				setTimeout(attachTopicCard, 250);
			}
		});
		hooks.on('action:ajaxify.end', function () {
			attachTopicCard();
		});
		$(window).on('pageshow popstate', function () {
			ComposerPredictor.topicCardLoadedTid = null;
			if (ajaxify.data && ajaxify.data.tid) {
				ComposerPredictor.topicContextPromise[ajaxify.data.tid] = null;
			}
			setTimeout(attachTopicCard, 50);
		});
		$(function () {
			attachTopicCard();
		});
	});

	$(document).on('click', '.predictor-choice', function () {
		const btn = $(this);
		btn.closest('.predictor-result-buttons').find('.predictor-choice').removeClass('active btn-primary text-white').addClass('btn-outline-primary');
		btn.removeClass('btn-outline-primary').addClass('active btn-primary text-white');
	});

	$(document).on('click', '.predictor-submit', function () {
		submitTopicPrediction($(this).closest('[component="predictor/topic-card"]'));
	});
})();

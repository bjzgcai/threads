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
		if (!context.predictionOpen) {
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
		if (!postData.tid || postContainer.find('[component="predictor/reply-composer"]').length) {
			return;
		}

		getTopicContext(postData.tid).then(function (context) {
			if (!context || !context.enabled) {
				return;
			}

			postData.predictorTopicContext = context;
			const section = $(renderReplyComposerSection(context));
			if (!section.length) {
				return;
			}
			const host = postContainer.find('.composer-container > .p-2, .composer-container').first();
			host.append(section);
			applyPredictionSelection(section, context.myPrediction && context.myPrediction.prediction);
		});
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

	function predictionClosedText(context) {
		if (context.kickoffTimestamp) {
			return '比赛已开始，胜平负预测已截止。';
		}
		return '当前已停止预测，可继续普通回复讨论。';
	}

	function renderTopicCard(context) {
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
								<div class="text-muted">${context.match.date} ${context.match.time}</div>
								<div class="fw-semibold">${context.match.away.name}</div>
								<span class="predictor-flag">${context.match.away.flag}</span>
							</div>
							<div class="mt-2 d-flex flex-wrap gap-2">
								<span class="badge text-bg-light">${context.match.stage}</span>
								<span class="badge text-bg-light">第 ${context.match.group} 组</span>
								<span class="badge text-bg-light">参与预测 ${context.participantCount || 0} 人</span>
							</div>
						</div>
						<div class="predictor-current small text-muted">${context.myPrediction ? '已提交预测' : predictionText(context)}</div>
					</div>
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
							<div class="small text-muted mb-1">你的预测</div>
							<div class="fw-semibold">${predictionValueText(context)}</div>
							<div class="small text-muted mt-2">本帖预测已锁定，你仍可继续发表普通回复。</div>
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
			if (!payload || payload.postData.action !== 'posts.reply') {
				return payload;
			}

			const section = payload.postContainer.find('[component="predictor/reply-composer"]');
			if (!section.length) {
				return payload;
			}

			const context = payload.postData.predictorTopicContext;
			const prediction = collectPrediction(section);
			if (!context || !prediction) {
				return payload;
			}

			if (!payload.bodyEl.val().trim()) {
				const text = buildPredictionText(context.match, prediction);
				payload.bodyEl.val(text);
				payload.bodyLen = text.length;
			}

			return payload;
		});
		hooks.on('filter:composer.submit', async function (payload) {
			if (!payload || payload.action !== 'posts.reply') {
				return payload;
			}

			const section = payload.composerEl.find('[component="predictor/reply-composer"]');
			if (!section.length) {
				return payload;
			}

			const context = payload.postData.predictorTopicContext;
			const prediction = collectPrediction(section);
			if (!context || !prediction) {
				return payload;
			}

			payload.composerData.content = payload.composerEl.find('textarea').val();

			try {
				await $.ajax({
					url: `${config.relative_path || ''}/api/v3/predictor/topic/${context.tid}/predict`,
					type: 'POST',
					contentType: 'application/json',
					dataType: 'json',
					data: JSON.stringify({
						prediction,
						createReply: false,
					}),
				});
				ComposerPredictor.topicCardLoadedTid = null;
				ComposerPredictor.topicContextPromise[context.tid] = null;
			} catch (xhr) {
				const message = xhr.responseJSON && xhr.responseJSON.error ? xhr.responseJSON.error : '预测提交失败';
				require(['alerts'], function (alerts) {
					alerts.error(message);
				});
				throw new Error(message);
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

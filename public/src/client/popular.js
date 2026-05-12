'use strict';


define('forum/popular', ['topicList'], function (topicList) {
	const Popular = {};

	Popular.init = function () {
		app.enterRoom('popular_topics');

		topicList.init('popular');

		$('[component="popular/hot-topics-more"], [component="category/hot-topics-more"]').on('click', function () {
			const btn = $(this);
			$('[component="popular/hot-topic-item"][data-extra="true"], [component="category/hot-topic-item"][data-extra="true"]').removeClass('d-none');
			btn.closest('div').remove();
		});
	};

	return Popular;
});

'use strict';

$(window).on('action:composer.loaded', function (ev, data) {
	if (!data || !data.postContainer) {
		return;
	}

	data.postContainer.find('.img-upload-btn').closest('li').remove();
});

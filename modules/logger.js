'use strict';

const settings = require('./settings');

const logger = {
	debug: (...params) => {
		const { log } = settings;
		if (log && typeof log.debug === 'function') {
			log.debug(...params);
		}
	},

	log: (...params) => {
		const { log } = settings;
		if (log && typeof log.log === 'function') {
			log.log(...params);
		} else {
			console.log('db logger', ...params);
		}
	},

	error: (...params) => {
		const { log } = settings;
		if (log && typeof log.error === 'function') {
			log.error(...params);
		} else {
			console.error('db error', ...params);
		}
	},
};

module.exports = logger;

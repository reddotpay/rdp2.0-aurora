'use strict';

const settings = require('./settings');

const logger = {
	debug: (summary, variable) => {
		const { log } = settings;
		if (log && typeof log.debug === 'function') {
			log.debug(summary, variable);
		}
	},

	log: (summary, variable) => {
		const { log } = settings;
		if (log && typeof log.log === 'function') {
			log.log(summary, variable);
		} else {
			console.log('db logger', summary, variable);
		}
	},

	error: (summary, error) => {
		const { log } = settings;
		if (log && typeof log.error === 'function') {
			log.error(summary, error);
		} else {
			console.error('db error', summary, error);
		}
	},
};

module.exports = logger;

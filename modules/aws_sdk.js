'use strict';

const settings = require('./settings');

/* eslint-disable global-require */
/* eslint-disable import/no-extraneous-dependencies */
let AWS = null;
let secretsManager = null;

const getAWS = () => {
	if (AWS) {
		return AWS;
	}

	if (settings.AWS) {
		AWS = settings.AWS;
	} else {
		AWS = require('aws-sdk');
	}
	return AWS;
};

const getSecretsManager = () => {
	if (secretsManager) {
		return secretsManager;
	}
	const aws = getAWS();
	secretsManager = new aws.SecretsManager();
	return secretsManager;
};
module.exports = {
	getAWS,
	getSecretsManager,
}
'use strict';

const aurora = require('./modules/aurora');
const QueryBuilder = require('./modules/queryBuilder');
const DBModelBase = require('./modules/dbModelBase');
const settings = require('./modules/settings');

const auroraConfig = {
	registerDb: (dbName, dbConfig) => {
		settings.dbSettings[dbName] = {
			settings: () => dbConfig,
		};
		return auroraConfig;
	},

	setDefaultDb: (db) => {
		settings.defaultDb = db;
		return auroraConfig;
	},

	setLogger: (logger) => {
		settings.log = logger;
		return auroraConfig;
	},

};

module.exports = {
	aurora,
	auroraConfig,
	QueryBuilder,
	DBModelBase,
};

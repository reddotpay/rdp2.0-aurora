/* eslint-disable no-await-in-loop */

'use strict';

const DBHandler = require('./dbHandler');
const settings = require('./settings');

const { dbSettings } = settings;

const getDbInfo = (dbName) => {
	const info = dbSettings[dbName].settings();
	return info;
};

class DatabasePool {
	constructor() {
		this.dbList = {};
		this.isInTransaction = false;
	}

	/**
	 * @return {DBHandler}
	 */
	async getDb(name = settings.defaultDb) {
		const info = JSON.parse(JSON.stringify(getDbInfo(name)));
		const hash = info.secretArn ? info.secretArn : JSON.stringify(info);

		if (!info.database) {
			info.database = name;
		}
		if (!this.dbList[hash]) {
			const dbHandler = new DBHandler(info, this);
			await dbHandler.init();
			if (this.isInTransaction) {
				await dbHandler.begin();
			}
			this.dbList[hash] = dbHandler;
		}
		return this.dbList[hash];
	}

	async begin() {
		this.isInTransaction = true;
		const keys = Object.keys(this.dbList);
		for (let i = 0; i < keys.length; i += 1) {
			await this.dbList[keys[i]].begin();
		}
	}

	async commit() {
		const keys = Object.keys(this.dbList);
		for (let i = 0; i < keys.length; i += 1) {
			await this.dbList[keys[i]].commit();
		}
		this.isInTransaction = false;
	}

	async rollback() {
		const keys = Object.keys(this.dbList);
		for (let i = 0; i < keys.length; i += 1) {
			await this.dbList[keys[i]].rollback();
		}
		this.isInTransaction = false;
	}

	async saveAll() {
		const keys = Object.keys(this.dbList);
		for (let i = 0; i < keys.length; i += 1) {
			await this.dbList[keys[i]].saveAll();
		}
	}

	forEachUpdateLog(func) {
		const keys = Object.keys(this.dbList);
		for (let i = 0; i < keys.length; i += 1) {
			this.dbList[keys[i]].forEachUpdateLog(func);
		}
	}

	// you should finish the session before returning any call,
	// to close the db connection.
	// Even though the connection will persist to the next call, if this lambda
	// instance is destroyed, the connection will still exist as a zombie connection for 8 hours.
	async finishSession() {
		const keys = Object.keys(this.dbList);
		for (let i = 0; i < keys.length; i += 1) {
			await this.dbList[keys[i]].close();
			// delete the handler. create a new instance the next time this handler is
			delete this.dbList[keys[i]];
		}
	}
}

const dbPool = new DatabasePool();
module.exports = dbPool;

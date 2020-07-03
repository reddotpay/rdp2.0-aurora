'use strict';

const mysql = require('mysql');
// eslint-disable-next-line import/no-extraneous-dependencies
const AWS = require('aws-sdk');
const logger = require('./logger');

const secretsManager = new AWS.SecretsManager();

class Database {
	constructor(config, dbPool) {
		this.dbPool = dbPool;
		this.config = config;
		this.dbObjs = [];
		this.isActiveConnection = false;
	}

	async init() {
		const settings = {};
		if (this.config.secretArn && typeof this.config.secretArn !== 'undefined') {
			const ret = await secretsManager.getSecretValue({
				SecretId: this.config.secretArn,
			}).promise();
			const secretString = JSON.parse(ret.SecretString);
			const {
				username, password, host, port,
			} = secretString;
			settings.user = username;
			settings.password = password;
			settings.host = host;
			settings.port = port;
		} else {
			settings.user = this.config.username;
			settings.password = this.config.password;
			settings.host = this.config.host;
			settings.port = this.config.port;
		}

		// if default db is specified,
		if (this.config.database) {
			settings.database = this.config.database;
		}

		this.isActiveConnection = false;
		const totalTries = 5;
		let tryNum = 1;
		while (!this.isActiveConnection) {
			try {
				this.connection = mysql.createConnection(settings);
				// eslint-disable-next-line no-await-in-loop
				await this.connect();
				this.isActiveConnection = true;
			} catch (err) {
				logger.error(`db connect error ${tryNum}`, err);
				tryNum += 1;

				// after max attempts, just throw the errors
				if (tryNum > totalTries) {
					throw err;
				}
			}
		}
	}

	getConnection() {
		return this.connection;
	}

	/**
	 * @param {function} getPromiseFunc
	 * @returns {Promise}
	 */
	async dbHandle(getPromiseFunc) {
		if (!this.isActiveConnection) {
			await this.init();
		}

		try {
			const ret = await getPromiseFunc();
			return ret;
		} catch (err) {
			if (err.message === 'Connection lost: The server closed the connection.') {
				await this.close();
			}
			throw err;
		}
	}

	async query(sql, args) {
		const ret = await this.dbHandle(() => this.queryPromise(sql, args));
		return ret;
	}

	queryPromise(sql, args) {
		const promise = new Promise((resolve, reject) => {
			logger.debug(sql, args);
			const connection = this.getConnection();
			connection.query(sql, args, (err, rows) => {
				if (err) {
					logger.log('Error - sql:', {
						sql, varList: args,
					});
					// eslint-disable-next-line no-param-reassign
					err.type = 'DB';
					return reject(err);
				}
				return resolve(rows);
			});
		});

		return promise;
	}

	async begin() {
		await this.dbHandle(() => this.beginPromise());
	}

	beginPromise() {
		const promise = new Promise((resolve, reject) => {
			const connection = this.getConnection();
			connection.beginTransaction((err) => {
				if (err) {
					// eslint-disable-next-line no-param-reassign
					err.type = 'DB';
					return reject(err);
				}
				logger.log('begin');
				return resolve();
			});
		});

		return promise;
	}

	async rollback() {
		if (!this.isActiveConnection) {
			logger.log('skip rollback on closed connection');
		} else {
			await this.dbHandle(() => this.rollbackPromise());
		}
	}

	async rollbackPromise() {
		const promise = new Promise((resolve, reject) => {
			const connection = this.getConnection();
			connection.rollback((err) => {
				if (err) {
					// eslint-disable-next-line no-param-reassign
					err.type = 'DB';
					return reject(err);
				}
				logger.log('rollback');
				return resolve();
			});
		});
		return promise;
	}

	async commit() {
		if (!this.isActiveConnection) {
			logger.log('skip commit on closed connection');
		} else {
			await this.dbHandle(() => this.commitPromise());
		}
	}

	async commitPromise() {
		const promise = new Promise((resolve, reject) => {
			const connection = this.getConnection();
			connection.commit((err) => {
				if (err) {
					// eslint-disable-next-line no-param-reassign
					err.type = 'Query Error';
					return reject(err);
				}
				logger.log('commit');
				return resolve();
			});
		});

		return promise;
	}

	connect() {
		return new Promise((resolve, reject) => {
			const connection = this.getConnection();
			connection.connect((err) => {
				if (err) {
					// eslint-disable-next-line no-param-reassign
					err.type = 'DB';
					return reject(err);
				}
				logger.log('connect');
				this.isActiveConnection = false;
				return resolve();
			});
		});
	}

	close() {
		return new Promise((resolve, reject) => {
			const connection = this.getConnection();
			connection.end((err) => {
				if (err) {
					// eslint-disable-next-line no-param-reassign
					err.type = 'DB';
					return reject(err);
				}
				logger.log('close');
				this.isActiveConnection = false;
				return resolve();
			});
		});
	}

	// //////////////////////////
	// Used by DB Model
	// /////////////////////////
	forEachUpdateLog(func) {
		this.dbObjs.forEach((obj) => {
			const updateLog = obj.updateLogInfo;
			if (updateLog !== null) {
				func(updateLog);
			}
		});
	}

	register(dbObj) {
		this.dbObjs.push(dbObj);
	}

	async saveAll() {
		for (let i = 0; i < this.dbObjs.length; i += 1) {
			// eslint-disable-next-line no-await-in-loop
			await this.dbObjs[i].save();
		}
	}
}

module.exports = Database;
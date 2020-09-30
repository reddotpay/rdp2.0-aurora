'use strict';

const mysql = require('mysql');
// eslint-disable-next-line import/no-extraneous-dependencies
const { getSecretsManager } = require('./aws_sdk');
const logger = require('./logger');


function getQueryStreamRunPerRowFunc (funcForEachRow) {
	return (row, onFinish, onError) => queryStreamRunPerRow(funcForEachRow, row, onFinish, onError);
}
function queryStreamRunPerRow (funcForEachRow, row, onFinish, onError) {
	queryStreamRunPerRowAsync(funcForEachRow, row, onFinish, onError);
}

async function queryStreamRunPerRowAsync (funcForEachRow, row, onFinish, onError) {
	try {
		const ret = funcForEachRow(row, () => {});
		if (ret instanceof Promise) {
			await ret;
		}
		onFinish();
	} catch (err) {
		onError(err);
	}
}

class Database {
	constructor(config, dbPool) {
		this.dbPool = dbPool;
		this.config = config;
		this.dbObjs = [];
		this.isActiveConnection = false;
		this.initQueue = [];
		this.initing = false;
	}

	async init() {
		// only allow 1 initialization.
		if (!this.initing) {
			this.initing = true;
			this.requestInit();
		}

		// register into the promise chain.
		await new Promise((resolve, reject) => {
			if (this.isActiveConnection) {
				resolve();
			}
			this.initQueue.push({
				resolve, reject
			});
		});
	}

	async requestInit() {
		try {
			const secretsManager = getSecretsManager();
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
			this.initQueue.forEach((callbackInfo) => {
				callbackInfo.resolve();
			});

			this.initQueue = [];
			this.initing = false;
		} catch (err ) {
			this.initQueue.forEach((callbackInfo) => {
				callbackInfo.reject(err);
			});

			this.initQueue = [];
			this.initing = false;
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
			logger.log(sql, args);
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

	async queryStream(funcForEachRow, sql, args, bufferSize) {
		// const func = getQueryStreamRunPerRowFunc(funcForEachRow);
		const ret = await this.dbHandle(() => this.queryStreamPromise(funcForEachRow, sql, args, bufferSize));
		return ret;
	}

	async queryStreamPromise(funcForEachRow, sql, args, bufferSize = 10) {
		const promise = new Promise((resolve, reject) => {
			logger.log(sql, args);
			let isPaused = false;
			let isAllLoaded = false;
			let currHandlers = 0;
			const connection = this.getConnection();
			const query = connection.query(sql, args);

			let err = null;
			function checkFinish () {
				if (err) {
					reject(err);
				} else if (currHandlers <= 0 && isAllLoaded) {
					resolve();
				}
			}
			function onFinish () {
				currHandlers -= 1;
				if (currHandlers < bufferSize && isPaused) {
					isPaused = false;
					connection.resume();
				}
				checkFinish();
			}
			function onError (e) {
				logger.log('Error - sql:', {
					sql, varList: args,
				});
				// eslint-disable-next-line no-param-reassign
				e.type = 'DB';
				err = e;
				onFinish();
			}

			query
				.on('error', onError)
				.on('result', (row) => {
					if (err) {
						throw err;
					}
					currHandlers += 1;
					if (currHandlers >= bufferSize) {
						connection.pause();
						isPaused = true;
					}
					// queryStreamRunPerRow(funcForEachRow, row, onFinish, onError);
					funcForEachRow(row, onFinish, onError);
					// run(row);
				})
				.on('end', () => {
					isAllLoaded = true;
					checkFinish();
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

	async checkConnection() {
		logger.log('check connection');
		if (!this.isActiveConnection) {
			return;
		}
		try {
			await this.ping();
		} catch (err) {
			logger.log('check connection failed. removing connection');
			// close this connection
			this.isActiveConnection = false;
			delete this.connection;
		}

	}

	async ping() {
		const promise = new Promise((resolve, reject) => {
			const connection = this.getConnection();
			connection.ping((err) => {
				if (err) {
					// eslint-disable-next-line no-param-reassign
					err.type = 'Ping Error';
					return reject(err);
				}
				logger.log('ping success');
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

	clearModels() {
		for (let i = 0; i < this.dbObjs.length; i += 1) {
			// eslint-disable-next-line no-await-in-loop
			delete this.dbObjs[i];
		}
	}
}

module.exports = Database;

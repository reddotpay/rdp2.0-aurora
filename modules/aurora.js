'use strict';

const db = require('./db');

const aurora = {
	query: async (sql, args) => {
		const dbHandler = await db.getDb();
		return dbHandler.query(sql, args);
	},
	queryStream: async (funcForEachRow, sql, args, bufferSize = 10) => {
		const dbHandler = await db.getDb();
		return dbHandler.queryStream(funcForEachRow, sql, args, bufferSize);
	},
	begin: async () => {
		await db.begin();
	},
	commit: async () => {
		await db.commit();
	},
	rollback: async () => {
		await db.rollback();
	},
	insert: async (tableName, insertObj) => {
		const keys = Object.keys(insertObj);
		const values = Object.values(insertObj);

		const keySql = keys.map(() => '??').join(', ');
		const valueSql = values.map(() => '?').join(', ');

		const sql = `insert into ?? (${keySql}) values (${valueSql})`;

		const args = [];
		args.push(tableName);
		keys.forEach((k) => {
			args.push(k);
		});
		values.forEach((v) => {
			args.push(v);
		});

		return aurora.query(sql, args);
	},
	getLastInsertKey: async () => {
		const ret = await aurora.query('select LAST_INSERT_ID();');
		return (ret[0] || {})['LAST_INSERT_ID()'];
	},
	update: async (tableName, keys, update) => {
		const keysKList = Object.keys(keys);
		const updateKList = Object.keys(update);

		const whereSql = keysKList.map(() => '?? = ?').join(' and ');
		const updateSql = updateKList.map(() => '?? = ?').join(', ');

		const sql = `update ?? set ${updateSql} where ${whereSql}`;
		const args = [];
		args.push(tableName);
		updateKList.forEach((key) => {
			const value = update[key];
			args.push(key);
			args.push(value);
		});
		keysKList.forEach((key) => {
			const value = keys[key];
			args.push(key);
			args.push(value);
		});

		return aurora.query(sql, args);
	},

	/**
	 * @param {string} tableName - name of table
	 * @param {array} colToGet - array of columns to fetch
	 * @param {Object} colWhere - Key-value pair of where conditions { ColName: ColValue } (Only supports AND condition)
	 * @param {Object} colWhere.equal - Key-value pair of where ('key' = 'value') conditions { ColName: ColValue } (Only supports AND condition)
	 * @param {Object} colWhere.like - Key-value pair of where ('key' like 'value') conditions { ColName: ColValue } (Only supports AND condition)
	 * @param {Object} [additionalParams] - Additional Parameters for select statement
	 * @param {Object<string, 'asc'|'desc'>} [additionalParams.order] - order to sort the result { ColName: 'asc' | 'desc' }
	 * @param {Array<number, number>} [additionalParams.limit] - Array for limit condition, Limit x | Limit x, y (Maximum 2 array values)
	 *
	 */
	select: async (tableName, colToGet, colWhere, additionalParams) => {
		const args = [];
		let selectSql = '*';
		if (colToGet) {
			selectSql = colToGet.map(() => '??').join(', ');
			colToGet.forEach((val) => {
				args.push(val);
			});
		}
		args.push(tableName);
		let whereSql = '';
		const whereArray = [];
		if (colWhere) {
			if (colWhere.equal) {
				whereArray.push(Object.keys(colWhere.equal).map(() => '?? = ?'));
				Object.keys(colWhere.equal).forEach((key) => {
					args.push(key);
					args.push(colWhere.equal[key]);
				});
			}
			if (colWhere.like) {
				whereArray.push(Object.keys(colWhere.like).map(() => '?? like ?'));
				Object.keys(colWhere.like).forEach((key) =>	 {
					args.push(key);
					args.push(colWhere.like[key]);
				});
			}
			whereSql = whereArray.flat().join(' and ');
		}
		let additionalSql = '';
		if (additionalParams) {
			if (additionalParams.order) {
				additionalSql += ' order by';
				Object.keys(additionalParams.order).forEach((key) => {
					additionalSql += ` ?? ${additionalParams.order[key]},`;
					args.push(key);
				});
				const trimLastComma = -1;
				additionalSql = additionalSql.slice(0, trimLastComma);
			}
			if (additionalParams.limit) {
				additionalSql += ' limit ';
				additionalSql += additionalParams.limit.join(', ');
			}
		}
		const sql = `select ${selectSql} from ?? where ${whereSql} ${additionalSql}`;
		return aurora.query(sql, args);
	},
	saveAll: async () => {
		await db.saveAll();
	},
	clearModels: () => {
		db.clearModels();
	},

	/**
	 * this will close all db connections
	 */
	finishSession: async () => {
		await db.finishSession();
	},

	/**
	 * Call this at the start of each serverless lambda session.
	 * This will check through any existing connections.
	 * If there are any connections that are no longer open, will open up a new connection.
	 */
	startSession: async () => {
		await db.startSession();
	}
};

module.exports = aurora;

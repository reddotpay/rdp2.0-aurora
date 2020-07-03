'use strict';

const db = require('./db');

const aurora = {
	getHandler: async () => db.getDb(),
	query: async (sql, args) => {
		const dbHandler = await aurora.getHandler();
		return dbHandler.query(sql, args);
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
	finishSession: async () => {
		await db.finishSession();
	},
};

module.exports = aurora;

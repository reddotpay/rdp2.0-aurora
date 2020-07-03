/* eslint-disable func-names */

'use strict';

const _ = require('lodash');
const moment = require('moment');
const uuid = require('uuid');

const settings = require('./settings');
const dbPool = require('./db');
const logger = require('./logger');
const BuilderClass = require('./queryBuilder');

const isLock = {};
class DBModelBase {
	// /////////////////////////////////
	// Table Information. Overwrite these in the subclass if needed
	// /////////////////////////////////

	// overwrite this
	static GetTableName() {
		return '';
	}

	// overwrite this
	static GetPrimaryKeys() {
		return [];
	}

	// overwrite this
	static GetUUIDKeys() {
		return {};
	}

	// overwrite this to true if you do not want to allow write to this table.
	static IsReadOnly() {
		return false;
	}

	// overwrite this
	static GetSpecialColumnType() {
		return {
			// column_name: 'type'
			// TYPE are as follows:
			// 'uuid' <<== auto generate a uuid on create
			// 'create-date' <== auto set the current date on insert
			// 'update-date' <== auto set the current date on update
			// `bool` <== when setting, it will become 1 or 0. when getting, it will auto convert to true or false.
			// 'json' <== when setting, it will auto json.stringify. when getting, it will auto json,parse
		};
	}

	// overwrite this
	static GetAutoIncrementKey() {
		return null;
	}

	static GetDBName() {
		return settings.defaultDb;
	}

	static async GetDbHandler() {
		return dbPool.getDb(this.GetDBName());
	}

	static IsColumnTypeUUIDKey(colName) {
		const uuids = this.GetUUIDKeys();
		if (uuids[colName]) {
			return true;
		}
		const columnType = this.GetSpecialColumnType();
		return columnType[colName] === 'uuid';
	}

	// /////////////////////////////////
	// Constructor.
	// /////////////////////////////////

	constructor(dbName, tableName, primaryKeys, dbValue = {}) {
		this.values = JSON.parse(JSON.stringify(dbValue));
		this.dbName = dbName;
		this.tableName = tableName;
		this.primaryKeys = primaryKeys;

		this.dirty = {};
		this.db = null;
		this.doNotSave = false;
		this.skipLogging = false;
		this.updateLogInfo = null;
		this.isDelete = false;
	}

	setIsDummy() {
		this.doNotSave = true;
	}

	delete() {
		this.isDelete = true;
	}

	doNotLog() {
		this.skipLogging = true;
	}

	registerDb(dbHandler) {
		this.db = dbHandler;
		this.db.register(this);
	}

	static MakeInstance(db = null, values = {}) {
		const model = new this(this.GetDBName(), this.GetTableName(), this.GetPrimaryKeys(), values);
		if (db) {
			model.registerDb(db);
		}
		return model;
	}

	// /////////////////////////////////
	// Fetching and Saving.
	// /////////////////////////////////

	/**
	* @return {BuilderClass} - Query Builder Object
	*/
	static async GetBuilder() {
		const db = await this.GetDbHandler();
		return new BuilderClass(db, this.GetDBName(), this.GetTableName());
	}

	/**
	* Running the next query will get a SQL lock on fetched objects
	*/
	static LockNext() {
		const className = this.name;
		isLock[className] = true;
	}

	/**
	* @return {Array<DBModelBase>} - Array of DBModelBase Object
	*/
	static async QueryFetch(queryBuilder) {
		const className = this.name;
		if (isLock[className]) {
			queryBuilder.lock();
			isLock[className] = false;
		}
		const res = await queryBuilder.exec();
		const dbObjList = [];
		res.forEach((val) => {
			const model = this.MakeInstance(queryBuilder.dbHandler, val);
			dbObjList.push(model);
		});
		return dbObjList;
	}

	async save() {
		if (this.constructor.IsReadOnly()) {
			const tableName = this.GetTableName();
			logger.debug(`Attempting to save to readonly table: ${tableName}`);
			return;
		}

		if (this.isDelete) {
			await this.deleteObj();
			return;
		}

		if (!this.isNew() && this.canSave()) {
			const specialColumnTypes = this.constructor.GetSpecialColumnType();
			Object.keys(specialColumnTypes).forEach((colName) => {
				const type = specialColumnTypes[colName];
				if (type === 'update-date') { // set current timestamp on update
					if (!this.isDirty(colName)) { // if not already updated
						this.set(colName, new Date());
					}
				}
			});
		}

		await this.saveObj();

		if (this.isNew()) {
			const autoIncrementKey = this.constructor.GetAutoIncrementKey();
			if (autoIncrementKey) {
				const ret = await this.db.query('select LAST_INSERT_ID();');
				this.values[autoIncrementKey] = (ret[0] || {})['LAST_INSERT_ID()'];
			}
		}
	}

	async deleteObj() {
		try {
			const dbHandler = this.db;
			if (!dbHandler) {
				throw new Error('DB Handler not specified');
			}

			const varList = [];
			const where = [];
			const updateLog = { key: {} };

			this.primaryKeys.forEach((col) => {
				where.push('?? = ?');
				varList.push(col);
				varList.push(this.values[col]);
				updateLog.key[col] = this.values[col];
			});

			const sql = `DELETE FROM \`${this.dbName}\`.\`${this.tableName}\` where ${where.join(' and ')}`;
			const ret = await dbHandler.query(sql, varList);
			this.clearDirty();
			if (!this.skipLogging) {
				logger.log(`DELETE ${this.dbName}.${this.tableName}:`, updateLog);
			}
			this.updateLogInfo = {
				name: `\`${this.dbName}\`.\`${this.tableName}\``,
				type: 'delete',
				updateLog,
			};
			return ret;
		} catch (err) {
			logger.error('db error', err);
			throw new Error('DB Error');
		}
	}

	async saveObj() {
		let sql = '';
		const varList = [];

		try {
			if (!this.canSave()) {
				return null;
			}

			const dbHandler = this.db;
			if (!dbHandler) {
				throw new Error('DB Handler not specified');
			}
			if (this.isNew()) {
				// insert
				const updateColumns = Object.keys(this.dirty);
				const insertLog = {};
				updateColumns.forEach((col) => {
					const updateVal = this.dirty[col];
					varList.push(updateVal);
					insertLog[col] = DBModelBase.GetValueString(updateVal);
				});
				sql = `insert into \`${this.dbName}\`.\`${this.tableName}\` (??) values (?)`;
				const ret = await dbHandler.query(sql, [updateColumns, varList]);
				this.clearDirty();
				if (!this.skipLogging) {
					logger.log(`insert \`${this.dbName}\`.\`${this.tableName}\``, insertLog);
				}
				this.updateLogInfo = {
					name: `\`${this.dbName}\`.\`${this.tableName}\``,
					type: 'insert',
					insertLog,
				};
				return ret;
			}

			// update
			const where = [];
			const updateLog = DBModelBase.NewUpdateLog();

			const { update } = this.getUpdateChanges(varList, updateLog);

			// nothing to update. just set to true
			if (!update.length) {
				return true;
			}

			this.primaryKeys.forEach((col) => {
				where.push('?? = ?');
				varList.push(col);
				varList.push(this.values[col]);
				updateLog.key[col] = this.values[col];
			});

			sql = `update \`${this.dbName}\`.\`${this.tableName}\` set ${update.join(', ')} where ${where.join(' and ')}`;
			const ret = await dbHandler.query(sql, varList);

			this.clearDirty();
			if (!this.skipLogging) {
				logger.log(`Update ${this.dbName}.${this.tableName}:`, updateLog);
			}
			this.updateLogInfo = {
				name: `\`${this.dbName}\`.\`${this.tableName}\``,
				type: 'update',
				updateLog,
			};
			return ret;
		} catch (err) {
			logger.error('db error', err);
			throw new Error('DB Error');
		}
	}

	/**
	* Create a new instance. From a given Json object
	* Throws an error if a required field is not provided
	* @returns {DBModelBase} New DBModelBase
	*/
	static async NewFromObject(values) {
		const updateVal = JSON.parse(JSON.stringify(values));
		const primaryKeys = this.GetPrimaryKeys();
		const specialColumnTypes = this.GetSpecialColumnType();

		const db = await this.GetDbHandler();
		const obj = this.MakeInstance(db);

		const pKeyHash = {};
		for (let i = 0; i < primaryKeys.length; i += 1) {
			const pKey = primaryKeys[i];
			pKeyHash[pKey] = true;
			const isAutoIncrementKey = this.GetAutoIncrementKey() === pKey;
			if (typeof updateVal[pKey] === 'undefined') {
				if (this.IsColumnTypeUUIDKey(pKey)) {
					obj.set(pKey, uuid.v4());
				} else if (!isAutoIncrementKey) {
					const tableName = this.GetTableName();
					// eslint-disable-next-line no-await-in-loop
					throw new Error(
						`Required Column not found when creating ${tableName} object: ${pKey}`,
					);
				}
			} else if (!isAutoIncrementKey) {
				obj.set(pKey, updateVal[pKey]);
				delete updateVal[pKey];
			}
		}

		Object.keys(updateVal).forEach((key) => {
			const val = updateVal[key];
			obj.set(key, val);
		});

		Object.keys(specialColumnTypes).forEach((colName) => {
			const type = specialColumnTypes[colName];
			if (type === 'update-date' || type === 'create-date') { // set current date on create
				if (!updateVal[colName]) { // if not already set
					obj.set(colName, new Date());
				}
			}
		});
		return obj;
	}

	// /////////////////////////////////
	// Get/Set.
	// /////////////////////////////////

	get(col, getOriginalValue = false) {
		let val;
		if (!getOriginalValue && typeof this.dirty[col] !== 'undefined') {
			val = this.dirty[col];
		} else {
			val = this.values[col];
		}

		const specialColumnTypes = this.constructor.GetSpecialColumnType();
		const type = specialColumnTypes[col];

		if (type === 'json') {
			if (val) {
				return JSON.parse(val);
			}
			return val;
		}
		if (type === 'bool') {
			if (typeof val !== 'undefined' && val !== null) {
				return !!val;
			}
			return val;
		}
		return val;
	}

	set(col, val) {
		if (this.isDelete) {
			throw new Error('Attempting to set on deleted object');
		}
		const specialColumnTypes = this.constructor.GetSpecialColumnType();
		const type = specialColumnTypes[col];
		let setVal;
		if (type === 'json') {
			setVal = JSON.stringify(val);
		} else if (type === 'bool') {
			setVal = val ? 1 : 0;
		} else {
			setVal = val;
		}

		this.dirty[col] = setVal;
	}

	// this change will not be written to DB.
	localSet(col, val) {
		let setVal;
		const specialColumnTypes = this.constructor.GetSpecialColumnType();
		const type = specialColumnTypes[col];
		if (type === 'json') {
			setVal = JSON.stringify(val);
		} else if (type === 'bool') {
			setVal = val ? 1 : 0;
		} else {
			setVal = val;
		}

		this.values[col] = setVal;
	}

	/**
	* Sets the values from a given json object
	* Returns an object containing the keys and values that are not used by this object and have not been set.
	*/
	setFromObject(values) {
		const updateVal = JSON.parse(JSON.stringify(values));
		const primaryKeys = this.constructor.GetPrimaryKeys();

		primaryKeys.forEach((pKey) => {
			// do not allow update primary key
			if (typeof updateVal[pKey] !== 'undefined') {
				delete updateVal[pKey];
			}
		});
		Object.keys(updateVal).forEach((key) => {
			const val = updateVal[key];
			this.set(key, val);
		});
	}

	clearDirty() {
		Object.keys(this.dirty).forEach((col) => {
			this.values[col] = this.dirty[col];
			delete this.dirty[col];
		});
	}

	getDisplayValues() {
		const displayValues = this.getCurrentValues();
		const ret = {};
		Object.keys(displayValues).forEach((colName) => {
			const obj = displayValues[colName];
			ret[colName] = DBModelBase.ConvertValue(obj);
		});

		return ret;
	}

	getCurrentValues() {
		const ret = {
			...this.values,
			...this.dirty,
		};

		const specialColumnTypes = this.constructor.GetSpecialColumnType();
		Object.keys(specialColumnTypes).forEach((colName) => {
			const type = specialColumnTypes[colName];
			const val = ret[colName];
			if (typeof val !== 'undefined' && val !== null) {
				if (type === 'bool') { // set as boolean
					ret[colName] = !!val;
				} else if (type === 'json') {
					if (val) {
						ret[colName] = JSON.parse(val);
					}
				}
			}
		});

		return ret;
	}

	// /////////////////////////////////
	// Misc
	// /////////////////////////////////

	isNew() {
		return _.isEmpty(this.values);
	}

	isDirty(colName) {
		return typeof this.dirty[colName] !== 'undefined'
			&& this.dirty[colName] !== null;
	}

	canSave() {
		if (this.constructor.IsReadOnly()) {
			return false;
		}
		if (this.doNotSave) {
			return false;
		}
		if (this.isNew()) {
			return true;
		}
		const { update } = this.getUpdateChanges([]);
		if (!update.length) {
			return false;
		}
		return true;
	}

	getUpdateChanges(varList, updateLog = null) {
		const update = [];
		Object.keys(this.dirty).forEach((col) => {
			const oldVal = this.values[col];
			const newVal = this.dirty[col];
			if (oldVal !== newVal) {
				update.push('?? = ?');
				varList.push(col);
				varList.push(newVal);
				if (updateLog !== null) {
					const oldValStr = DBModelBase.GetValueString(oldVal);
					const newValStr = DBModelBase.GetValueString(newVal);
					// eslint-disable-next-line no-param-reassign
					updateLog.update[col] = `${oldValStr}->${newValStr}`;
				}
			}
		});
		return {
			update,
		};
	}

	static NewUpdateLog() {
		return {
			key: {},
			update: {},
		};
	}

	static ConvertValue(val) {
		if (moment.isDate(val) || moment.isMoment(val)) {
			return DBModelBase.ToDate(val).toISOString();
		}
		return val;
	}

	static GetValueString(val) {
		return `${this.ConvertValue(val)}`;
	}

	static ToInt(val) {
		if (typeof val === 'string') {
			return parseInt(val, 10);
		}
		return val;
	}

	static ToMoment(val = null) {
		if (val === null || typeof val === 'undefined') {
			return null;
		}
		if (moment.isMoment(val)) {
			return val;
		}
		if (moment.isDate(val)) {
			return moment(val);
		}
		if (typeof val === 'number') {
			return moment.unix(val);
		}
		if (typeof val === 'string') {
			return moment(val);
		}
		throw new Error(`Fail convert to moment: ${val}`);
	}

	static ToDate(val = null) {
		if (val === null || typeof val === 'undefined') {
			return null;
		}
		if (moment.isMoment(val)) {
			return val.toDate();
		}
		if (moment.isDate(val)) {
			return val;
		}
		if (typeof val === 'number') {
			return moment.unix(val).toDate();
		}
		if (typeof val === 'string') {
			return moment(val).toDate();
		}
		throw new Error(`Fail convert to date: ${val}`);
	}
}

module.exports = DBModelBase;

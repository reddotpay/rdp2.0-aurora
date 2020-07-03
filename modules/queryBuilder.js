/* eslint-disable func-names */

'use strict';

const db = require('./db');
const settings = require('./settings');
const logger = require('./logger');

const toInt = (val) => {
	if (typeof val === 'string') {
		return parseInt(val, 10);
	}
	return val;
};
const toArray = (a) => (Array.isArray(a) ? a : [a]);

const newExpBlock = (type, wrapFunction = null) => ({
	type,
	wrapFunction,
	expList: [],
	varList: [],
});
const newAndBlock = (wrapFunction = null) => newExpBlock(' and ', wrapFunction);
const newOrBlock = (wrapFunction = null) => newExpBlock(' or ', wrapFunction);

const QueryBuilder = function (dbHandler, dbName, tableName) {
	this.dbHandler = dbHandler;
	this.dbName = dbName;
	this.tableName = tableName;

	this.queryStack = [];
	this.varList = [];

	this.selectFields = [];
	this.selectArgs = [];

	this.currQuery = newAndBlock();
	this.rootQuery = this.currQuery;
	this.wrapFunction = null;
	this.startIdx = 0;
	this.limitQuery = 0;
	this.isLock = false;

	this.order = [];
	this.orderVarList = [];
};

// block operations
// e.g ( a = 1 AND ( b = 2 or c = 3 ) )

QueryBuilder.prototype.lock = function () {
	this.isLock = true;
	return this;
};

QueryBuilder.prototype.startAndBlock = function () {
	this.addBlock(newAndBlock(this.wrapFunction));
	this.wrapFunction = false;
	return this;
};

QueryBuilder.prototype.startOrBlock = function () {
	this.addBlock(newOrBlock(this.wrapFunction));
	this.wrapFunction = false;
	return this;
};

QueryBuilder.prototype.addBlock = function (block) {
	this.currQuery.expList.push(block);
	this.queryStack.push(this.currQuery);
	this.currQuery = block;
	return this;
};

QueryBuilder.prototype.endBlock = function () {
	if (this.queryStack.length > 0) {
		this.currQuery = this.queryStack.pop();
	}
	return this;
};

QueryBuilder.prototype.func = function (functionName) {
	this.wrapFunction = functionName;
	return this;
};
QueryBuilder.prototype.not = function () {
	this.func('NOT');
	return this;
};

QueryBuilder.prototype.limit = function (val) {
	this.limitQuery = toInt(val);
	return this;
};

QueryBuilder.prototype.page = function (pageSize, pageNum) {
	const size = toInt(pageSize);
	const num = toInt(pageNum);
	this.startIdx = (num - 1) * size;
	this.limitQuery = size;
	return this;
};

QueryBuilder.prototype.customExpr = function (string, arg = null) {
	this.currQuery.expList.push(this.wrapExpression(string));
	if (arg) {
		arg.forEach((k) => {
			this.varList.push(k);
		});
	}
	return this;
};

QueryBuilder.prototype.wrapExpression = function (expr) {
	let ret = '';
	if (this.wrapFunction) {
		ret = `${this.wrapFunction} (${expr})`;
		this.wrapFunction = null;
	} else {
		ret = expr;
	}
	return ret;
};

QueryBuilder.prototype.conditionBetween = function (column, start, end) {
	return this.customExpr('?? between ? and ?', [column, start, end]);
};

QueryBuilder.prototype.condition = function (column, value, comparator = '=') {
	return this.customExpr(`?? ${comparator} ?`, [column, value]);
};

QueryBuilder.prototype.conditionRange = function (name, range) {
	const { start, end } = range;
	if (start && end) {
		return this.conditionBetween(name, start, end);
	}
	if (start) {
		return this.condition(name, start, '>=');
	}
	if (end) {
		return this.condition(name, end, '<=');
	}
	return this;
};

QueryBuilder.prototype.conditionIn = function (column, values) {
	// empty array. use a FALSE instead.
	if (!values || values.length === 0) {
		return this.customExpr('FALSE');
	}
	return this.customExpr('?? in (?)', [column, values]);
};

QueryBuilder.prototype.conditionLike = function (column, values) {
	return this.customExpr('?? like ?', [column, values]);
};

QueryBuilder.prototype.conditionBeginsWithStr = function (column, values) {
	return this.conditionLike(column, `${values}%`);
};
QueryBuilder.prototype.conditionEndsWithStr = function (column, values) {
	return this.conditionLike(column, `%${values}`);
};

QueryBuilder.prototype.conditionStrCmp = function (column, value, comparator = '=') {
	return this.customExpr(`STRCMP(??, ?) ${comparator} 0`, [column, value]);
};

QueryBuilder.prototype.orderByAsc = function (column) {
	return this.orderBy(column, true);
};

QueryBuilder.prototype.orderByDesc = function (column) {
	return this.orderBy(column, false);
};

QueryBuilder.prototype.orderBy = function (column, isAsc = false) {
	const ascStr = isAsc ? 'ASC' : 'DESC';
	this.order.push(`?? ${ascStr}`);
	this.orderVarList.push(column);
	return this;
};

QueryBuilder.prototype.select = function (field, args = []) {
	this.selectFields.push(field);

	toArray(args).forEach((arg) => {
		this.selectArgs.push(arg);
	});
	return this;
};

const getQueryExpression = function (expBlock) {
	if (typeof expBlock === 'string') {
		return expBlock;
	}
	const expList = [];
	expBlock.expList.forEach((exp) => {
		expList.push(getQueryExpression(exp));
	});
	const exp = expList.join(expBlock.type);
	if (expList.length <= 1) {
		return exp;
	}

	if (expBlock.wrapFunction) {
		return `${expBlock.wrapFunction} (${exp})`;
	}
	return `(${exp})`;
};

QueryBuilder.prototype.getParamSql = function () {
	const varList = [];
	const selectStr = this.selectFields && this.selectFields.length > 0 ? this.selectFields.join(',') : '*';
	this.selectArgs.forEach((val) => {
		varList.push(val);
	});

	const exp = getQueryExpression(this.rootQuery);
	const conditionStr = exp ? ` WHERE ${exp}` : '';
	this.varList.forEach((val) => {
		varList.push(val);
	});

	let orderStr = '';
	if (this.orderVarList.length) {
		orderStr = ` ORDER BY ${this.order.join(', ')}`;
		this.orderVarList.forEach((k) => {
			varList.push(k);
		});
	}

	// check if have limit. e.g limit 1
	let limitStr = '';
	if (this.startIdx) {
		limitStr = ' LIMIT ?, ?';
		varList.push(this.startIdx);
		varList.push(this.limitQuery);
	} else if (this.limitQuery) {
		limitStr = ' LIMIT ?';
		varList.push(this.limitQuery);
	}

	const forUpdate = this.isLock ? ' FOR UPDATE' : '';

	const sql = `select ${selectStr} from \`${this.dbName}\`.\`${this.tableName}\`${conditionStr}${orderStr}${limitStr}${forUpdate}`;
	return {
		sql,
		varList,
	};
};

QueryBuilder.prototype.exec = async function () {
	try {
		const { sql, varList } = this.getParamSql();
		return this.dbHandler.query(sql, varList);
	} catch (err) {
		logger.log('query manager err', err);
		throw err;
	}
};

/**
 * @returns {QueryBuilder}
 */
QueryBuilder.CreateBuilder = async function (tableName, dbName = settings.defaultDb) {
	const dbHandler = await db.getDb(dbName);
	return new QueryBuilder(dbHandler, dbName, tableName);
};

module.exports = QueryBuilder;

/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable indent */
/* eslint-disable no-magic-numbers */
/* eslint-disable no-unused-expressions */

'use strict';

const chai = require('chai');
const sinon = require('sinon');
const chaiAsPromised = require('chai-as-promised');

const dbHandler = require('../modules/dbHandler');
const QueryBuilder = require('../modules/queryBuilder');
const { auroraConfig } = require('..');

chai.use(chaiAsPromised);
const { expect } = chai;
const { assert } = sinon;

auroraConfig
	.setDefaultDb('test_db')
	.registerDb('test_db', {
		host: 'localhost',
		port: 3306,
		username: 'test',
		password: 'test',
	})
	.setLogger({
			log: console.log,
			error: () => {},
			debug: console.log
	});


describe('Testing Query Builder', () => {
	let queryStub;
	beforeEach(async () => {
		await sinon.stub(dbHandler.prototype, 'init');
		await sinon.stub(dbHandler.prototype, 'connect');

		queryStub = await sinon.stub(dbHandler.prototype, 'query');
	});

	afterEach(async () => {
		sinon.restore();
	});

	context('Query Builder Check Select', () => {
		/** @type {QueryBuilder} */
		let queryBuilder;
		beforeEach(async () => {
			queryBuilder = await QueryBuilder.CreateBuilder('test_table');
		});

		it('Check Count(*)', async () => {
			queryBuilder.select('COUNT(*)');
			const { sql, varList } = queryBuilder.getParamSql();

			expect(sql).to.be.a('string');
			expect(sql).to.equal('select COUNT(*) from `test_db`.`test_table` `test_table`');
			expect(varList).to.be.an('array').to.be.empty;
		});

		it('Check column with argument', async () => {
			queryBuilder.select('??', ['test_table_id']);
			const { sql, varList } = queryBuilder.getParamSql();

			expect(sql).to.be.a('string');
			expect(sql).to.equal('select ?? from `test_db`.`test_table` `test_table`');
			expect(varList).to.be.an('array').to.not.be.empty;
			expect(varList).to.eql(['test_table_id']);
		});
	});

	context('Query Builder Check Conditions', () => {
		/** @type {QueryBuilder} */
		let queryBuilder;
		beforeEach(async () => {
			queryBuilder = await QueryBuilder.CreateBuilder('test_table');
		});

		it('condition equals', () => {
			queryBuilder.condition('test_table_id', 1);
			const { sql, varList } = queryBuilder.getParamSql();
			expect(sql).to.be.a('string');
			expect(varList).to.be.an('array').to.not.be.empty;
			expect(sql).to.equal('select * from `test_db`.`test_table` `test_table` WHERE ?? = ?');
			expect(varList).to.eql(['test_table_id', 1]);
		});

		it('condition greater than', () => {
			queryBuilder.condition('test', 1, '>');
			const { sql, varList } = queryBuilder.getParamSql();
			expect(sql).to.be.a('string');
			expect(varList).to.be.an('array').to.not.be.empty;
			expect(sql).to.equal('select * from `test_db`.`test_table` `test_table` WHERE ?? > ?');
			expect(varList).to.eql(['test', 1]);
		});

		it('condition in', () => {
			queryBuilder.conditionIn('test', [1, 2, 3]);
			const { sql, varList } = queryBuilder.getParamSql();
			expect(sql).to.be.a('string');
			expect(varList).to.be.an('array').to.not.be.empty;
			expect(sql).to.equal('select * from `test_db`.`test_table` `test_table` WHERE ?? in (?)');
			expect(varList).to.eql(['test', [1, 2, 3]]);
		});

		it('condition in with no inner value', () => {
			queryBuilder.conditionIn('test', []);
			const { sql, varList } = queryBuilder.getParamSql();
			expect(sql).to.be.a('string');
			expect(varList).to.be.an('array').to.be.empty;
			expect(sql).to.equal('select * from `test_db`.`test_table` `test_table` WHERE FALSE');
		});

		it('condition not in', () => {
			queryBuilder.not().conditionIn('test', [1, 2, 3]);
			const { sql, varList } = queryBuilder.getParamSql();
			expect(sql).to.be.a('string');
			expect(varList).to.be.an('array').to.not.be.empty;
			expect(sql).to.equal('select * from `test_db`.`test_table` `test_table` WHERE NOT (?? in (?))');
			expect(varList).to.eql(['test', [1, 2, 3]]);
		});

		it('condition between', () => {
			queryBuilder.conditionBetween('test', 5, 10);
			const { sql, varList } = queryBuilder.getParamSql();
			expect(sql).to.be.a('string');
			expect(varList).to.be.an('array').to.not.be.empty;
			expect(sql).to.equal('select * from `test_db`.`test_table` `test_table` WHERE ?? between ? and ?');
			expect(varList).to.eql(['test', 5, 10]);
		});

		it('condition range all', () => {
			queryBuilder.conditionRange('test', { start: 1, end: 5});
			const { sql, varList } = queryBuilder.getParamSql();
			expect(sql).to.be.a('string');
			expect(varList).to.be.an('array').to.not.be.empty;
			expect(sql).to.equal('select * from `test_db`.`test_table` `test_table` WHERE ?? between ? and ?');
			expect(varList).to.eql(['test', 1, 5]);
		});

		it('condition range only start', () => {
			queryBuilder.conditionRange('test', { start: 1});
			const { sql, varList } = queryBuilder.getParamSql();
			expect(sql).to.be.a('string');
			expect(varList).to.be.an('array').to.not.be.empty;
			expect(sql).to.equal('select * from `test_db`.`test_table` `test_table` WHERE ?? >= ?');
			expect(varList).to.eql(['test', 1]);
		});

		it('condition range only end', () => {
			queryBuilder.conditionRange('test', { end: 5});
			const { sql, varList } = queryBuilder.getParamSql();
			expect(sql).to.be.a('string');
			expect(varList).to.be.an('array').to.not.be.empty;
			expect(sql).to.equal('select * from `test_db`.`test_table` `test_table` WHERE ?? <= ?');
			expect(varList).to.eql(['test', 5]);
		});

		it('condition range empty params', () => {
			queryBuilder.conditionRange('test', {});
			const { sql, varList } = queryBuilder.getParamSql();
			expect(sql).to.be.a('string');
			expect(varList).to.be.an('array').to.be.empty;
			expect(sql).to.equal('select * from `test_db`.`test_table` `test_table`');
			expect(varList).to.eql([]);
		});
		it('condition is null', () => {
			queryBuilder.conditionIsNull('test', []);
			const { sql, varList } = queryBuilder.getParamSql();
			expect(sql).to.be.a('string');
			expect(varList).to.be.an('array').to.not.be.empty;
			expect(sql).to.equal('select * from `test_db`.`test_table` `test_table` WHERE ?? IS NULL');
			expect(varList).to.eql(['test']);
		});

		it('condition is not null', () => {
			queryBuilder
				.not()
				.conditionIsNull('test', []);
			const { sql, varList } = queryBuilder.getParamSql();
			expect(sql).to.be.a('string');
			expect(varList).to.be.an('array').to.not.be.empty;
			expect(sql).to.equal('select * from `test_db`.`test_table` `test_table` WHERE NOT (?? IS NULL)');
			expect(varList).to.eql(['test']);
		});

		it('condition like', () => {
			queryBuilder.conditionLike('name', 'aaa%');
			const { sql, varList } = queryBuilder.getParamSql();
			expect(sql).to.be.a('string');
			expect(varList).to.be.an('array').to.not.be.empty;
			expect(sql).to.equal('select * from `test_db`.`test_table` `test_table` WHERE ?? like ?');
			expect(varList).to.eql(['name', 'aaa%']);
		});

		it('condition conditionBeginsWithStr', () => {
			queryBuilder.conditionBeginsWithStr('name', 'aaa');
			const { sql, varList } = queryBuilder.getParamSql();
			expect(sql).to.be.a('string');
			expect(varList).to.be.an('array').to.not.be.empty;
			expect(sql).to.equal('select * from `test_db`.`test_table` `test_table` WHERE ?? like ?');
			expect(varList).to.eql(['name', 'aaa%']);
		});

		it('condition conditionEndsWithStr', () => {
			queryBuilder.conditionEndsWithStr('name', 'aaa');
			const { sql, varList } = queryBuilder.getParamSql();
			expect(sql).to.be.a('string');
			expect(varList).to.be.an('array').to.not.be.empty;
			expect(sql).to.equal('select * from `test_db`.`test_table` `test_table` WHERE ?? like ?');
			expect(varList).to.eql(['name', '%aaa']);
		});

		it('condition conditionContainsStr', () => {
			queryBuilder.conditionContainsStr('name', 'aaa');
			const { sql, varList } = queryBuilder.getParamSql();
			expect(sql).to.be.a('string');
			expect(varList).to.be.an('array').to.not.be.empty;
			expect(sql).to.equal('select * from `test_db`.`test_table` `test_table` WHERE ?? like ?');
			expect(varList).to.eql(['name', '%aaa%']);
		});

		it('condition strcmp', () => {
			queryBuilder.conditionStrCmp('name', 'aaa');
			const { sql, varList } = queryBuilder.getParamSql();
			expect(sql).to.be.a('string');
			expect(varList).to.be.an('array').to.not.be.empty;
			expect(sql).to.equal('select * from `test_db`.`test_table` `test_table` WHERE STRCMP(??, ?) = 0');
			expect(varList).to.eql(['name', 'aaa']);
		});

		it('condition not equal', () => {
			queryBuilder.conditionStrCmp('name', 'aaa', '<>');
			const { sql, varList } = queryBuilder.getParamSql();
			expect(sql).to.be.a('string');
			expect(varList).to.be.an('array').to.not.be.empty;
			expect(sql).to.equal('select * from `test_db`.`test_table` `test_table` WHERE STRCMP(??, ?) <> 0');
			expect(varList).to.eql(['name', 'aaa']);
		});

		it('complex condition', () => {
			queryBuilder
				.conditionIn('test_table_id', ['1', '2'])
				.condition('test', 2, '>')
				.startOrBlock()
					.condition('status', 'new')
					.condition('ignore_status', true)
					.not()
					.startAndBlock()
						.condition('name', 'test')
						.condition('age', 2, '<')
					.endBlock()
				.endBlock();

			const { sql, varList } = queryBuilder.getParamSql();
			expect(sql).to.be.a('string');
			expect(varList).to.be.an('array').to.not.be.empty;
			expect(sql).to.equal('select * from `test_db`.`test_table` `test_table` WHERE (?? in (?) and ?? > ? and (?? = ? or ?? = ? or NOT (?? = ? and ?? < ?)))');
			expect(varList).to.eql(['test_table_id', ['1', '2'], 'test', 2, 'status', 'new', 'ignore_status', true, 'name', 'test', 'age', 2]);
		});
	});

	context('Test limit and order by', () => {
		/** @type {QueryBuilder} */
		let queryBuilder;
		beforeEach(async () => {
			queryBuilder = await QueryBuilder.CreateBuilder('test_table');
		});

		it('limit', () => {
			queryBuilder.limit('10');

			const { sql, varList } = queryBuilder.getParamSql();
			expect(sql).to.be.a('string');
			expect(varList).to.be.an('array').to.not.be.empty;
			expect(sql).to.equal('select * from `test_db`.`test_table` `test_table` LIMIT ?');
			expect(varList).to.eql([10]);
		});

		it('limit, page', () => {
			queryBuilder.page(10, 2);

			const { sql, varList } = queryBuilder.getParamSql();
			expect(sql).to.be.a('string');
			expect(varList).to.be.an('array').to.not.be.empty;
			expect(sql).to.equal('select * from `test_db`.`test_table` `test_table` LIMIT ?, ?');
			expect(varList).to.eql([10, 10]);
		});

		it('order by', () => {
			queryBuilder.orderBy('test_a');

			const { sql, varList } = queryBuilder.getParamSql();
			expect(sql).to.be.a('string');
			expect(varList).to.be.an('array').to.not.be.empty;
			expect(sql).to.equal('select * from `test_db`.`test_table` `test_table` ORDER BY ?? DESC');
			expect(varList).to.eql(['test_a']);
		});

		it('order by custom asc', () => {
			queryBuilder.orderBy('test_a', true);

			const { sql, varList } = queryBuilder.getParamSql();
			expect(sql).to.be.a('string');
			expect(varList).to.be.an('array').to.not.be.empty;
			expect(sql).to.equal('select * from `test_db`.`test_table` `test_table` ORDER BY ?? ASC');
			expect(varList).to.eql(['test_a']);
		});

		it('order by custom desc', () => {
			queryBuilder.orderBy('test_a', false);

			const { sql, varList } = queryBuilder.getParamSql();
			expect(sql).to.be.a('string');
			expect(varList).to.be.an('array').to.not.be.empty;
			expect(sql).to.equal('select * from `test_db`.`test_table` `test_table` ORDER BY ?? DESC');
			expect(varList).to.eql(['test_a']);
		});

		it('order by asc', () => {
			queryBuilder.orderByAsc('test_a');

			const { sql, varList } = queryBuilder.getParamSql();
			expect(sql).to.be.a('string');
			expect(varList).to.be.an('array').to.not.be.empty;
			expect(sql).to.equal('select * from `test_db`.`test_table` `test_table` ORDER BY ?? ASC');
			expect(varList).to.eql(['test_a']);
		});

		it('order by desc', () => {
			queryBuilder.orderByDesc('test_a');

			const { sql, varList } = queryBuilder.getParamSql();
			expect(sql).to.be.a('string');
			expect(varList).to.be.an('array').to.not.be.empty;
			expect(sql).to.equal('select * from `test_db`.`test_table` `test_table` ORDER BY ?? DESC');
			expect(varList).to.eql(['test_a']);
		});

		it('order by complex', () => {
			queryBuilder
				.orderByAsc('test_a')
				.orderByDesc('test_b');

				const { sql, varList } = queryBuilder.getParamSql();
				expect(sql).to.be.a('string');
				expect(varList).to.be.an('array').to.not.be.empty;
				expect(sql).to.equal('select * from `test_db`.`test_table` `test_table` ORDER BY ?? ASC, ?? DESC');
				expect(varList).to.eql(['test_a', 'test_b']);
		});
	});

	context('Test fetch with limit optimization', async () => {
		/** @type {QueryBuilder} */
		let queryBuilder;
		beforeEach(async () => {
			queryBuilder = await QueryBuilder.CreateBuilder('test_table');
		});


		it('check error if primary key not provided', async () => {
			queryBuilder
			.useOffsetOptimization([])
			.conditionIn('test_table_id', ['1', '2'])
			.condition('test', 2, '>')
			.startOrBlock()
				.condition('status', 'new')
				.condition('ignore_status', true)
				.not()
				.startAndBlock()
					.condition('name', 'test')
					.condition('age', 2, '<')
				.endBlock();
			await expect(queryBuilder.exec()).to.eventually.be.rejected;
		});

		it('do complex calculation', async () => {
			queryBuilder
				.select('??, ??', ['test', 'test2'])
				.selectColumn('pk')
				.conditionIn('test_table_id', ['1', '2'])
				.condition('test', 2, '>')
				.startOrBlock()
					.condition('status', 'new')
					.condition('ignore_status', true)
					.not()
					.startAndBlock()
						.condition('name', 'test')
						.condition('age', 2, '<')
					.endBlock()
				.endBlock()
				.orderByAsc('test_1')
				.orderByDesc('test_2')
				.page('10', 2)
				.useOffsetOptimization(['pk1', 'pk2']);

			const { sql, varList } = queryBuilder.getParamSql();
			expect(sql).to.be.a('string');
			expect(varList).to.be.an('array').to.not.be.empty;

			const expectedSql = 'select ??, ??,`test_table`.?? from `test_db`.`test_table` `test_table` INNER JOIN (select ??, ?? from `test_db`.`test_table` WHERE (?? in (?) and ?? > ? and (?? = ? or ?? = ? or NOT (?? = ? and ?? < ?))) ORDER BY ?? ASC, ?? DESC LIMIT ?, ?) t2 ON `test_table`.?? = t2.?? AND `test_table`.?? = t2.?? ORDER BY `test_table`.?? ASC, `test_table`.?? DESC';
			expect(sql).to.equal(
				// eslint-disable-next-line max-len
				expectedSql,
			);
			expect(varList).to.eql([
				'test',
				'test2',
				'pk',
				'pk1',
				'pk2',
				'test_table_id',
				['1', '2'],
				'test',
				2,
				'status',
				'new',
				'ignore_status',
				true,
				'name',
				'test',
				'age',
				2,
				'test_1',
				'test_2',
				10,
				10,
				'pk1',
				'pk1',
				'pk2',
				'pk2',
				'test_1',
				'test_2',
			]);

			await queryBuilder.exec();
			assert.called(queryStub);
		});

		it('do complex calculation with no ordering', async () => {
			queryBuilder
				.select('??, ??', ['test', 'test2'])
				.selectColumn('pk')
				.conditionIn('test_table_id', ['1', '2'])
				.condition('test', 2, '>')
				.startOrBlock()
					.condition('status', 'new')
					.condition('ignore_status', true)
					.not()
					.startAndBlock()
						.condition('name', 'test')
						.condition('age', 2, '<')
					.endBlock()
				.endBlock()
				.page('10', 2)
				.useOffsetOptimization(['pk1', 'pk2']);

			const { sql, varList } = queryBuilder.getParamSql();
			expect(sql).to.be.a('string');
			expect(varList).to.be.an('array').to.not.be.empty;

			const expectedSql = 'select ??, ??,`test_table`.?? from `test_db`.`test_table` `test_table` INNER JOIN (select ??, ?? from `test_db`.`test_table` WHERE (?? in (?) and ?? > ? and (?? = ? or ?? = ? or NOT (?? = ? and ?? < ?))) LIMIT ?, ?) t2 ON `test_table`.?? = t2.?? AND `test_table`.?? = t2.??';
			expect(sql).to.equal(
				// eslint-disable-next-line max-len
				expectedSql,
			);
			expect(varList).to.eql([
				'test',
				'test2',
				'pk',
				'pk1',
				'pk2',
				'test_table_id',
				['1', '2'],
				'test',
				2,
				'status',
				'new',
				'ignore_status',
				true,
				'name',
				'test',
				'age',
				2,
				10,
				10,
				'pk1',
				'pk1',
				'pk2',
				'pk2',
			]);

			await queryBuilder.exec();
			assert.called(queryStub);
		});
	});

	context('Check Misc', () => {
		/** @type {QueryBuilder} */
		let queryBuilder;
		beforeEach(async () => {
			queryBuilder = await QueryBuilder.CreateBuilder('test_table');
		});

		it('Check Locking', async () => {
			queryBuilder.lock();
			const { sql, varList } = queryBuilder.getParamSql();

			expect(sql).to.be.a('string');
			expect(sql).to.equal('select * from `test_db`.`test_table` `test_table` FOR UPDATE');
			expect(varList).to.be.an('array').to.be.empty;
		});

		it('Check Error when db handler not provided', async () => {
			queryBuilder.dbHandler = null;
			await expect(queryBuilder.exec()).to.eventually.be.rejected;
		});

		it('Check Complex Query With Everything but the kitchen sink thrown in', async () => {
			queryBuilder
				.select('??', ['test'])
				.conditionIn('test_table_id', ['1', '2'])
				.condition('test', 2, '>')
				.not().startOrBlock()
					.condition('status', 'new')
					.condition('ignore_status', true)
					.not()
					.startAndBlock()
						.condition('name', 'test')
						.condition('age', 2, '<')
					.endBlock()
				.endBlock()
				.endBlock() // do 1 error check
				.orderByAsc('test_1')
				.orderByDesc('test_2')
				.page('10', 2);

			const { sql, varList } = queryBuilder.getParamSql();
			expect(sql).to.be.a('string');
			expect(varList).to.be.an('array').to.not.be.empty;
			expect(sql).to.equal(
				// eslint-disable-next-line max-len
				'select ?? from `test_db`.`test_table` `test_table` WHERE (?? in (?) and ?? > ? and NOT (?? = ? or ?? = ? or NOT (?? = ? and ?? < ?))) ORDER BY ?? ASC, ?? DESC LIMIT ?, ?',
			);
			expect(varList).to.eql([
				'test',
				'test_table_id',
				['1', '2'],
				'test',
				2,
				'status',
				'new',
				'ignore_status',
				true,
				'name',
				'test',
				'age',
				2,
				'test_1',
				'test_2',
				10,
				10,
			]);

			await queryBuilder.exec();
			assert.called(queryStub);
		});
	});
});

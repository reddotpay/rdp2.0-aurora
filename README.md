# RDP2.0-Aurora
<!-- [![npm (scoped)](https://img.shields.io/npm/v/@reddotpay/rdp2.0-aurora.svg)](https://www.npmjs.com/package/@reddotpay/rdp2.0-aurora) -->

Aurora npm package for RDP2.0 products

### Install
1. `npm install @reddotpay/rdp2.0-aurora mysql lodash moment`
2. `npm install aws-sdk --save-dev`

### Requirements
AWS Role can refer to *Policy* below.

##### Policy
```
BackendFunctionRole
	Type: AWS::IAM::Role
	Properties:
		AssumeRolePolicyDocument:
		Version: '2012-10-17'
		Statement:
		- Effect: Allow
			Action:
			- 'sts:AssumeRole'
			Principal:
				Service:
				- lambda.amazonaws.com
		Policies:
		- PolicyName: {Product}BackendFunctionRole
			PolicyDocument:
			Version: '2012-10-17'
			Statement:
				- Effect: Allow
				Action: 'secretsmanager:GetSecretValue'
				Resource: '*'
```

### Usage

#### Primary Function

Examples
```js

const AWSXRAY = require('aws-xray-sdk');
const AWS = AWSXRAY.captureAWS(require('aws-sdk'));
const { aurora, auroraConfig } = require('aurora');

auroraConfig
	.setDefaultDb('db_name')
	.registerDb('db_name', {
		// you can provide an AWS secret ARN that stores the DB configuration information
		secretArn: 'secretArn',

		// alternatively, you can provide the following information SQL information to connect to MySQL
		host: 'url',
		port: 3306,
		username: 'user',
		password: 'password',
	})
	// you can provide a custom log handler below. if not provided, logs will be outputted on console.log
	.setLogger({
		log: console.log,
		error: console.error,
		debug: console.log, // if provided, every SQL command will be logged
	})
	// you can provide an AWS object to use when getting secrets manager.
	// if not provided, it will use the base aws-sdk package
	.setAWS(AWS);

// fetch tableOne row given a tableOneId, and get the last update
// if tableOne is not found, return null.
const fetchTableOneLastUpdate = async (testTableId) => {
	try {
		const sql = "select * from ?? where ?? = ?"; // use ?? for column or table names, use ? for values
		const ret = await aurora.query(sql, ['tableOne', 'tableOneId', testTableId]);

		if (ret.length > 0) {
			const row = ret[0];
			const updatedAt = row.updated_at; // this will be a Date object
			return updatedAt;
		}
		return null;
	} catch (err) {
		throw err;
	}
};

// set the selected tableTwo and tableOne row's updated_at field to current timestamp
const updateInTransaction = async (testTableTwoId, testTableId) => {
	try {
		await aurora.begin();
		const now = new Date();

		const updateSql = "update ?? set ?? = ? where ?? = ?";
		const args = ['tableOne', 'updated_at', now, 'tableOneId', testTableId];
		await aurora.query(sql, args);

		const updateTable2 = "update ?? set ?? = ? where ?? = ?";
		await aurora.query(sql, ['tableTwo', 'updated_at', now, 'tableTwoId', testTableTwoId]);

		await aurora.commit();
	} catch (err) {
		await aurora.rollback();
		throw err;
	}
};
```

## Query Builder

Creating a new Query Builder.
NOTE: you will need to await to create the builder.

```js
const { QueryBuilder } = require('aurora');

// creating a query builder that will select from "test" table
const testQueryBuilder = await QueryBuilder.CreateBuilder('test');

// select * from test
const ret = await testQueryBuilder.exect();
```

Selecting specific columns

```js

const { QueryBuilder } = require('aurora');

const testQueryBuilder = await QueryBuilder.CreateBuilder('test');

// to only select specific columns.
testQueryBuilder.select('id');
testQueryBuilder.select('column_a');
testQueryBuilder.select('?, ?', ['desc', 'asc']);  // if you need to safe case the column name to a safe string

// select id, column_a, desc, asc from test
const ret = await testQueryBuilder.exect();
```

Selecting aggregate columns

```js
// by default, this will select all columns. To only select 1 column, e.g count(*)
testQueryBuilder.select('count(*)');
```

### Conditions

Comparators, and what they get translated into

```js
// condition (third argument, by default is '=')
// do not use this to compare strings. use conditionStrCmp instead (see below)
testQueryBuilder.condition('id', 5); // WHERE id = 5
testQueryBuilder.condition('id', 5, '<>'); // WHERE id <> 5
testQueryBuilder.condition('id', 5, '>'); // WHERE id > 5

// string comparison
// this is used to check if the column value is the same as a provided string
// use this instead of using condition() function for strings
testQueryBuilder.conditionStrCmp('name', 'bob'); // WHERE STRCMP('name', 'bobby') = 0
testQueryBuilder.conditionStrCmp('name', 'bob', '<>'); // WHERE STRCMP('name', 'bobby') <> 0

// check if column value is between 2 values
testQueryBuilder.conditionBetween('id', 1, 100); // WHERE id BETWEEN 1 AND 100

// check if column value is between 2 values. if only 1 value is provided, do a direct comparison
conditionRange.conditionRange('date', { // WHERE date BETWEEN '2020-01-01 00:00:00' AND '2020-01-15 23:59:59'
	start: '2020-01-01 00:00:00',
	end: '2020-01-15 23:59:59',
});
testQueryBuilder.conditionRange('date', { // WHERE date >= '2020-01-01 00:00:00'
	start: '2020-01-01 00:00:00',
});
testQueryBuilder.conditionRange('id', { // WHERE date <= '2020-01-15 23:59:59'
	end: '2020-01-15 23:59:59',
});

// check if column value exists inside an array of values.
// if the array is empty, will be automatically evaluated to FALSE
testQueryBuilder.conditionRange('id', [1, 2, 3]); // WHERE id IN (1, 2, 3);
testQueryBuilder.conditionRange('id', []); // WHERE FALSE.

// check if column value contains provided substring
testQueryBuilder.conditionLike('name', '%bob%'); // WHERE name LIKE '%bob%'
testQueryBuilder.conditionBeginsWithStr('name', 'bob'); // WHERE name LIKE 'bob%'
testQueryBuilder.conditionEndsWithStr('name', 'bob'); // WHERE name LIKE '%bob'
testQueryBuilder.conditionContainsStr('name', 'bob'); // WHERE name LIKE '%bob%'

// check if column value is null
testQueryBuilder.conditionIsNull('description'); // WHERE description IS NULL

// custom expression (for complex conditions)
testQueryBuilder.customExpr('DATE_ADD(??, INTERVAL 5 HOURS) <= ?', [ 'created_date', '2020-01-01 00:00:00' ]); // WHERE DATE_ADD(`created_date`, INTERVAL 5 HOURS) <= '2020-01-01 00:00:00'
```

### Negation

To negate, use the `not` function, followed by the condition expression.

```js
// WHERE NOT(`id` IS NULL)
testQueryBuilder.not();
testQueryBuilder.conditionIsNull('id');

// WHERE NOT(`created_at` between '2020-01-01' and '2020-01-02')
testQueryBuilder.not();
testQueryBuilder.conditionBetween('created_at', '2020-01-01', '2020-01-02');
```

### Block Expressions

By default, multiple where expressions are grouped together using the 'AND' clause.

```js
// WHERE id >= 10 AND created_at < '2020-01-01'
queryBuilder.condition('id', 10, '>=');
queryBuilder.condition('created_at', '2020-01-01', '<');
```

You can also explicitly declare a `AND` block.

```js
// WHERE id >= 10 AND created_at < '2020-01-01'
queryBuilder.startAndBlock()
queryBuilder.condition('id', 10, '>=');
queryBuilder.condition('created_at', '2020-01-01', '<');
queryBuilder.endBlock();
```

To create a block where expressions are grouped together using the 'OR' clause, use `startOrBlock`

```js
// WHERE id < 10 OR id > 20
queryBuilder.startOrBlock()
queryBuilder.condition('id', 10, '<');
queryBuilder.condition('id', 20, '>');
queryBuilder.endBlock();
```

You can also negate a whole block expression
```js
// WHERE NOT ( id >= 10 AND created_at < '2020-01-01' )
queryBuilder.not();
queryBuilder.startAndBlock()
queryBuilder.condition('id', 10, '>=');
queryBuilder.condition('created_at', '2020-01-01', '<');
queryBuilder.endBlock();

// WHERE NOT (id < 10 OR id > 20)
queryBuilder.not();
queryBuilder.startOrBlock()
queryBuilder.condition('id', 10, '<');
queryBuilder.condition('id', 20, '>');
queryBuilder.endBlock();
```

#### Complex Block Expressions

From block expressions, you can create sub block expressions, and create complex query expressions

```js

// WHERE
// ( id >= 10 AND created_at < '2020-01-01' )
// OR
// NOT (id < 10 OR id > 20)
queryBuilder.startOrBlock();
	queryBuilder.startAndBlock()
	queryBuilder.condition('id', 10, '>=');
	queryBuilder.condition('created_at', '2020-01-01', '<');
	queryBuilder.endBlock();

	queryBuilder.not();
	queryBuilder.startOrBlock()
	queryBuilder.condition('id', 10, '<');
	queryBuilder.condition('id', 20, '>');
	queryBuilder.endBlock();
querBuilder.endBlock();
```

#### Locking query results. (for handling in transaction)

```js
// SELECT * FROM test FOR UPDATE
queryBuilder.lock();
```

#### Limit Results

```js
// SELECT * FROM test LIMIT 100
queryBuilder.limit(100);
```

#### Pagination

```js
// SELECT * FROM test LIMIT 0, 100
const pageSize = 100;
const pageNum = 1; // starts from 1
queryBuilder.page(100, 1);

// SELECT * FROM test LIMIT 100, 100
const pageSize = 100;
const pageNum = 2; // get page 2
queryBuilder.page(100, 2);
```

#### ORDER BY

```js
queryBuilder.orderBy('id'); // ORDER BY id DESC
queryBuilder.orderBy('id', true); // ORDER BY id ASC
queryBuilder.orderBy('id', false); // ORDER BY id DESC

queryBuilder.orderByDesc('id'); // ORDER BY id DESC
queryBuilder.orderByAsc('id'); // ORDER BY id ASC
```

#### Executing the Query

After your query builder has finished building the query, use `exec` function to execute the query.

```js
const builder = await QueryBuilder.CreateBuilder('test');
...
// create the rest of the query here
...

const ret = await builder.exec();
```

You can also just get the resultant SQL statement and arguments without executing the query.

```js
const queryBuilder = await QueryBuilder.CreateBuilder('test');

// create the rest of the query here

const queryInfo = queryBuilder.getParamSql();
const { sql, varList } = queryInfo; // get the SQL here.

const ret = await aurora.query(sql, varList);
```

#### Chaining Queries

You can chain the queries together to quickly form the SQL expression

```js
const queryBuilder = await QueryBuilder.CreateBuilder('test');

// SELECT `id`, `cost` from `test`
// WHERE
// ( `id` < 5 or `id` > 10 ) AND `description` IS NOT NULL
// LIMIT 20, 10
// ORDER BY `status` DESC, `id` ASC
const ret = await queryBuilder
	.select('id')
	.select('cost')

	.startOrBlock()
		.condition('id', 5, '<')
		.condition('id', 10, '>')
	.endBlock()
	.not().conditionIsNull('description')

	.page(10, 3) // limit by 10, get page 3
	.orderByDesc('status')
	.orderByAsc('id')
	.exec();
```
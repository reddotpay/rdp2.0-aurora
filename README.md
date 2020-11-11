- [RDP2.0-Aurora](#rdp20-aurora)
    + [Install](#install)
    + [Requirements](#requirements)
        * [Policy](#policy)
    + [Usage](#usage)
      - [Primary Function](#primary-function)
  * [Query Builder](#query-builder)
    + [Conditions](#conditions)
    + [Negation](#negation)
    + [Block Expressions](#block-expressions)
      - [Complex Block Expressions](#complex-block-expressions)
      - [Locking query results. (for handling in transaction)](#locking-query-results--for-handling-in-transaction-)
      - [Limit Results](#limit-results)
      - [Pagination](#pagination)
      - [ORDER BY](#order-by)
      - [Executing the Query](#executing-the-query)
      - [Chaining Queries](#chaining-queries)
  * [DBModel System](#dbmodel-system)
    + [Declaring Class](#declaring-class)
    + [Creating new instances](#creating-new-instances)
      - [Creating instances from DB query fetch.](#creating-instances-from-db-query-fetch)
      - [Creating new instances](#creating-new-instances-1)
    + [Setting a column value](#setting-a-column-value)
    + [Setting multiple column values by passing in an object](#setting-multiple-column-values-by-passing-in-an-object)
    + [Getting a column value from an instance](#getting-a-column-value-from-an-instance)
    + [Saving the changes.](#saving-the-changes)
    + [Deleting the object in DB](#deleting-the-object-in-db)
    + [Declaring special column types](#declaring-special-column-types)
    + [Declaring default values](#declaring-default-values)
    + [Declaring read only classes](#declaring-read-only-classes)
    + [Declaring dummy objects](#declaring-dummy-objects)

<small><i><a href='http://ecotrust-canada.github.io/markdown-toc/'>Table of contents generated with markdown-toc</a></i></small>

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
testQueryBuilder.selectColumn('id');

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
const pageNum = 1; // get pagea 1
queryBuilder.page(pageSize, pageNum);

// SELECT * FROM test LIMIT 100, 100
const pageSize = 100;
const pageNum = 2; // get page 2 (the 101st entry onwards)
queryBuilder.page(pageSize, pageNum);
```

##### Pagination Optimization

When the page number is very huge, executing the query results in a very huge query time.
When this happens, use the `useOffsetOptimization` function.
For this to work, you will need to pass in the primary key for the table due to the nature of the optimization.
```js

// Generated statement:
// SELECT * FROM test
// INNER JOIN ( SELECT pk_col from test ORDER BY date_created DESC LIMIT 300000, 100 ) t2
// ON test.pk_col = t2.pk_col
// ORDER BY date_created DESC
const pageSize = 100;
const pageNum = 3000; // get page 3000 (the 300,001 st entry onwards)
queryBuilder.page(pageSize, pageNum);
queryBuilder.orderByDesc('date_created');
queryBuilder.useOffsetOptimization(['pk_col']);
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

## DBModel System

DBModel system is a simple ORM for MySQL.
Each DBModel class, should correspond to 1 DB table.

### Declaring Class

For example, if you have a class `test`, you first have to create a file `test.js`, and declare it to extend `DBModelBase`

Example test.js contents:
```js
// test.js
const { DBModelBase } = require('@reddotpay/rdp2.0-aurora');

class Test extends DBModelBase {

	// (OPTIONAL) declare the database name here.
	// if this is not provided, will default to the value that is set using setDefaultDb
	// when setting aurora config.
	static GetDBName() {
		return 'test_db';
	}

	// declare the table name here
	static GetTableName() {
		return 'test';
	}

	// declare the primary key columns in the table here.
	static GetPrimaryKeys() {
		return ['pk_col_1', 'pk_col_2', 'pk_col_3'];
	}

}
```

### Creating new instances

There are 2 main ways to create a new instance.
1. from DB fetch
2. when creating new instance. (e.g when you want to prepare to insert into DB)

#### Creating instances from DB query fetch.

To create instances from DB query fetch, use query builder.
```js
const Test = require('./test');

// select * from test where pk_col_1 = 1 and pk_col2 = 2;
const builder = await Test.GetBuilder();
builder
	.condition('pk_col_1', 1)
	.condition('pk_col_2', 2);

const testList = await Test.QueryFetch(builder);

testList.forEach((test) => {
	console.log(test instanceOf Test); // true
});

```

You can also request to lock the rows for the next query if you are in a transaction
```js

const Test = require('./test');

// select * from test where pk_col_1 = 1 and pk_col2 = 2 FOR UPDATE;
const builder = await Test.GetBuilder();
builder
	.condition('pk_col_1', 1)
	.condition('pk_col_2', 2);

Test.LockNext();
const testList = await Test.QueryFetch(builder);

```

#### Creating new instances

Use NewFromObject function to create a new instance, and pass in an object with the column values.
Note that if the declared primary keys' values are not provided, an error will be thrown.
```js
const Test = require('./test');

const test = await Test.NewFromObject({
	pk_col_1: 1,
	pk_col_2: 2,
	pk_col_3: 3,
	col_4: 'column_4_value',
	col_5: 'column_5_value',
});
```

### Setting a column value

NOTE: DO NOT OVERWRITE A PRIMARY KEY VALUE
```js
test.set('column_name', 'new_column_value');
```

### Setting multiple column values by passing in an object

NOTE: DO NOT OVERWRITE PRIMARY KEY VALUES
```js
test.setFromObject({
	column_1: 'new_value1',
	column_2: 'new_value2'
});
```

### Getting a column value from an instance

```js
const value = test.get('column_name');
```

You can also get the original value when it is fetched from DB.

Assume there is a row on DB with the following values:
pk_col_1: 1
pk_col_2: 2
pk_col_3: 3
column_name: 'original_value'
```js

const Test = require('./test');

const builder = await Test.GetBuilder();
builder
	.condition('pk_col_1', 1)
	.condition('pk_col_2', 2)
	.condition('pk_col_3', 3);

const testList = await Test.QueryFetch(builder);
const test = testList[0];

const value = test.get('column_name'); // original_value
test.set('column_name', 'new_value');
const newValue = test.get('column_name'); // new_value
const originalValue = test.get('column_name', true); // original_value
```

### Saving the changes.

After you made the changes, you can request to save the changes into DB
```js
await test.save();
```

If the object is created using `NewFromObject`, the row will be inserted to the DB.
If the object is created using `QueryFetch`, the row in the the DB will be updated.

### Deleting the object in DB

```js
test.delete();
await test.save();
```

There is also a `saveAll` function in aurora, which allows saving of all aurora objects.

```js
const { aurora } = require('@reddotpay/rdp2.0-aurora');
const Test = require('./test');

const test1 = // create test 1 instance
const test2 = // create test 2 instance
const test3 = // create test 3 instance

await aurora.saveAll();
```
The above is equivalent to
```js
await test1.save();
await test2.save();
await test3.save();
```

### Declaring special column types

You can declare special column types in your class, that will have special handling.

```js
class Test extends DBModelBase {

	... // other sfuff

	// declare this optional function
	static GetSpecialColumnType() {
		return {
			// column name : type
			primary_key_column: 'uuid'
			column_1: 'created-date',
			column_2: 'update-date',
			column_3: 'bool',
			column_4: 'json'
		};
	}
}
```

Types are as below
1. uuid
	- Only for primary key columns
	- When creating a new object, a uuid v4 will be automatically generated and set into this column.
2. created-date
	- When creating a new object, the current timestamp will be automatically assigned and set into this column.
3. update-date
	- When creating a new object, the current timestamp will be automatically assigned and set into this column.
	- When saving into DB, this column's value will automatically be assigned to the current timestamp
4. bool
	- On MySQL, boolean types are stored as TINYINT. (1 or 0 values)
	- When getting the column's value using the `get` method, will automatically cast the value into a true/false boolean value.
	- When setting the column's value using the `set` method, allows passing in a 'true/false' boolean value.
5. json
	- When getting the column's value using the `get` method, will automatically parse the string value and convert into a js object.
	- When setting the column's value using the `set` method, allows passing in a js object, will automatically do a stringify before saving.

```js
// example

class Test extends DBModelBase {
	... // other sfuff
	// declare this optional function
	static GetSpecialColumnType() {
		return {
			// column name : type
			primary_key_column: 'uuid'
			column_1: 'created-date',
			column_2: 'update-date',
			column_3: 'bool',
			column_4: 'json'
		};
	}
}

// assume test object has the following values:
// column_3: 1
// column_3_not_declared: 1
// column_4: "{\"key1\":\"value\"}"
// column_4_not_declared: "{\"key1\":\"value\"}"

// a = true
const a = test.get('column_3');

// b = 1
const b = test.get('column_3_not_declared');

// c = { key: 'value' }
// typeof c = 'object'
const c = test.get('column_4');

// d = "{\"key1\":\"value\"}"
// typeof d = 'string'
const d = test.get('column_4_not_declared');


const test2 = await Test.newFromObject({});
test2.get('primary_key_column'); // will be an automatically generated uuid
test2.get('created_date'); // will be the current date time
test2.get('update_date'); // will be the current date time

```

### Getting all the column and values in an object

```js
const values = test.getDisplayValues();

class Test extends DBModelBase {
	... // other sfuff
	// declare this optional function
	static GetSpecialColumnType() {
		return {
			column_2: 'bool',
			column_3: 'json'
		};
	}
}

```

Example
```js


// assume test object has the following values:
// primary_key: "key_value"
// column_1: 1
// column_2: 0
// column_4: "{\"key1\":\"value\"}"

const values = test.getDisplayValues();

// values = {
//	primary_key: 'key_value',
//	column_1: 1,
//	column_2: false,
//	column_3: {
//		key1: 'value'
//	},
// }
```

### Declaring default values

You can also declare default values which will be set automatically when creating new object.

```js
class Test extends DBModelBase {
	...// other declarations here

	// declare this optional function
	static DefaultValues() {
		return {
			// column name : default value
			column_1: {},
			column_2: 'value',
			column_3: 12345,
		};
	}


	static GetSpecialColumnType() {
		return {
			// column name : type
			column_1: 'json',
		};
	}
}


const test = await Test.newFromObject({ primary_key_column: 1 });
test.get('column_1'); // {}
test.get('column_2'); // "value"
test.get('column_3'); // 12345
```

### Declaring read only classes

You can declare read-only classes. All object instances will not be saved into DB.

```js
class Test extends DBModelBase {
	// rest of the declarations

	// declare this function
	static IsReadOnly() {
		return true;
	}
}
```

### Declaring dummy objects

You can declare dummy objects. These will not be saved into DB.
```js
const { aurora } = require('@reddotpay/rdp2.0-aurora');
const Test = require('./test');

const test1 = // create test 1 instance
const test2 = // create test 2 instance
const test3 = // create test 3 instance

test1.setIsDummy();
await test1.save(); // NOTHING HAPPENS

await aurora.saveAll(); // ONLY test2 and test3 are saved
```

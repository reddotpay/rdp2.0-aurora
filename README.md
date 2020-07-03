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
	});

// fetch tableOne row given a tableOneId, and get the last update
// if tableOne is not found, return null.
const fetchMerchantLastUpdate = async (testTableId) => {
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

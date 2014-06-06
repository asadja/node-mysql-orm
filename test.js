'use strict';

/*
 * MySQL object-relational mapping
 *
 * (C) 2014 Mark K Cowan, mark@battlesnake.co.uk
 *
 * Released under `GNU General Public License, Version 2`
 *
 */

/*
 * Test / example usage
 */

var mysql = require('mysql');
var async = require('async');
var read = require('read');

var mysql_orm = require('./index');

function test() {

	var schema = {
		$types: {
			'user': ':users',
			'role': ':roles',
			'string': 'varchar(64)',
			'password': 'char(60)',
			'boolean': 'bit'
		},
		users: {
			username: { type: 'string', unique: true },
			password: { type: 'password' },
			role: { type: 'role' },
			lastactive: { type: 'timestamp' },
			admin: { type: 'boolean' },
		},
		roles: {
			name: { type: 'string', unique: true },
			rights: { type: 'string' }
		},
		posts: {
			user: { type: 'user' },
			title: { type: 'string', index: true },
			content: { type: 'text' },
			date: { type: 'timestamp' },
			deleted: { type: 'boolean' }
		}
	};
	var test_data = {
		roles: [
			{ name: 'admin', rights: '*' },
			{ name: 'pleb', rights: 'lol' }
		],
		users: [
			{ username: 'mark', password: Array(61).join('\0'), role: { name: 'admin' } }
		],
		posts: [
			{ user: { username: 'mark' }, title: 'Test post', content: 'This is a test post', deleted: false }
		]
	};
	async.series({
			username: async.apply(read, {prompt:'Database username: '}),
			password: async.apply(read, {prompt:'Database password: ',silent:true,replace:'\u263A'})
		},
		function (err, data) {
			var mysql_params = {
				host: 'localhost',
				user: data.username[0],
				password: data.password[0],
			};
			var orm_options = {
				database: 'mysql-orm-test',
				connection: mysql.createPool(mysql_params),
				recreateDatabase: true,
				recreateTables: true,
			};
			mysql_orm.create(schema, test_data, orm_options, startTests);
		});
	function startTests(err, orm) {
		if (err) {
			console.log('Failed to initialise test data: ' + err);
			return process.exit(1);
		}
	}
};

test();

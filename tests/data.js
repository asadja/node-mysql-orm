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
 * Initializaion data for test
 */

var mysql = require('mysql');
var async = require('async');
var read = require('read');

/*
 * Callback: function (err, obj)
 *
 * obj = { schema, data, orm_options }
 *
 */
module.exports.initialize = function (callback) {

	var schema = {

		$types: {
			'user': ':users',
			'role': ':roles',
			'string': 'varchar(64)',
			'password': 'char(60)',
			'boolean': 'bit',
			'country': ':countries'
		},

		users: {
			$sort: '+username',
			username: { type: 'string', unique: true },
			//password: { type: 'password' },
			role: { type: 'role' },
			lastactive: { type: 'timestamp' },
			admin: { type: 'boolean' },
			country: { type: 'country' }
		},

		roles: {
			name: { type: 'string', unique: true },
			rights: { type: 'string' }
		},

		posts: {
			$sort: '-date',
			user: { type: 'user' },
			title: { type: 'string', index: true },
			content: { type: 'text' },
			date: { type: 'timestamp' },
			deleted: { type: 'boolean' }
		},

		countries: {
			$sort: '+name',
			name: { type: 'string', index: true }
		}

	};

	var data = {

		roles: [
			{ name: 'admin', rights: '*' },
			{ name: 'pleb', rights: 'lol' }
		],

		countries: [
			{ id: 44, name: 'United Kingdom' },
			{ id: 372, name: 'Estonia' },
			{ id: 370, name: 'Lithuania' },
			{ id: 7, name: 'Russia' }
		],

		users: [
			{ username: 'mark', /*password: Array(61).join('\0'),*/ role: { name: 'admin' }, country: { name: 'Estonia' } }
		],

		posts: [
			{ user: { username: 'mark' }, title: 'Test post', content: 'This is a test post', deleted: false }
		]

	};

	async.series({
			username: async.apply(read, {prompt:'Database username: '}),
			password: async.apply(read, {prompt:'Database password: ',silent:true,replace:'\u263A'})
		},
		function (err, params) {
			if (err) {
				return callback(err);
			}
			var mysql_params = {
				host: 'localhost',
				user: params.username[0],
				password: params.password[0],
			};
			var orm_options = {
				mysql: mysql_params,
				database: 'mysql-orm-test',
				recreateDatabase: true,
				recreateTables: true,
			};
			callback(null, {
				schema: schema,
				data: data,
				orm_options: orm_options
			});
		});
};

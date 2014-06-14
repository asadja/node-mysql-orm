'use strict';
/*
 * MySQL object-relational mapping
 * ===============================
 *
 * (C) 2014 Mark K Cowan <mark@battlesnake.co.uk>
 *
 * https://github.com/battlesnake/node-mysql-orm
 *
 * Released under GNU General Public License, Version 2
 *
 */

var mysql = require('mysql');
var async = require('async');
var _ = require('underscore');

var utils = require('./utils');
var names = utils.names;
var shift = utils.shift;
var sql = require('./sql');

var ORM = { prototype: {} };
module.exports = ORM.prototype;

// delete
// ======
// Deletes data from the database

// 
// delete(table, idOrCriteria, callback)
// ------
// 
// Delete one or more rows from a table
// 
//  + table - Table name or reference
//  + IdOrCriteria - primary key value or search criteria
//  + callback - function (error, deletedRowCount)
// 
// ### Example using primary key value
// 
//     delete(schema.users, 2, function (err, res) { ... });
// 
// ### Example using foreign value
// 
//     delete(schema.users, { role: { name: 'guest' } }, callback);
// 
// 
ORM.prototype.delete = function (table, IdOrCriteria, callback) {
	var query = (_(arguments[0]).isFunction() && arguments[0].name === 'query') ? shift(arguments) : this.query;
	table = shift(arguments), IdOrCriteria = shift(arguments), callback = shift(arguments);
	var criteria = sql.getCriteria(IdOrCriteria);
	async.parallel([
			async.apply(sql.delete),
			async.apply(sql.from, this, table, criteria),
			async.apply(sql.where, this, query, table, criteria)
		],
		function (err, sqlParts) {
			if (err) {
				return callback(err);
			}
			query(_(sqlParts).compact().join('\n'), null, function (err, res) {
				if (err) {
					return callback(err);
				}
				return callback(null, res.affectedRows);
			});
		});
};

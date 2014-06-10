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
 * Delete operations
 *
 *  delete(table, id|criteria, callback)
 *
 *    Deletes row(s) that match the given criteria.
 *
 *    delete(schema.users, 2, function (err, res) { ... });
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

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

// save
// ====
// Saves data to the database
//
// NOTE: REPLACE will not be supported as it (quite rightly) wrecks foreign
// keys.  if you want to replace, do a delete followed by a save.
//

// 
// save(table, row, callback)
// ----
// 
// Save a single row to table, updating when the primary key value matches an
// existing row and inserting otherwise.  Foreign key values are looked up
// automatically.
// 
//  + table - A table definition from the schema.
//  + row - An object representing the values to save.  Foreign key values
//    are resolved, see the foreign-keys module for more information.
//     + row.$saveMode - An optional parameter which is cleared by save. It can
//       be 'new', 'existing', or 'always' (default):
//        + new: create new row, fail if row.id already exists
//        + existing: update existing row, fail if row.id is not found
//        + always: create new row if possible, update existing row otherwise.
// 
// ### Example which creates a new record
// 
//     // The following adds a new record as no primary key id was specified
//     save(
//       schema.users,
//       {
//         name: 'mark',
//         role: { value: 'admin' },
//         country: { value: 'Lithuania' }
//       },
//       function (err) { ... });
// 
// ### Example which saves to existing record, or creates new one if not found
// 
//     // The following will update an existing record if the id already
//     // exists in the table, otherwise it will insert a new record
//     save(
//       schema.users,
//       {
//         id: 1,
//         name: 'mark',
//         role: { value: 'admin' },
//         country: { value: 'Lithuania' }
//       },
//       function (err) { ... });
// 
ORM.prototype.save = function (table, row, callback) {
	var query = (_(arguments[0]).isFunction() && arguments[0].name === 'query') ? shift(arguments) : this.query;
	table = shift(arguments), row = shift(arguments), callback = shift(arguments);
	var cols = shift(arguments) || this.listForeignKeys(table);
	var self = this;
	async.waterfall([
			function (callback) {
				self.lookupForeignIds(query, table, row, function (err, res) { row = res; callback(err); }, cols);
			},
			function (callback) {
				var saveMode = row.$saveMode || 'always';
				delete row.$saveMode;
				if (saveMode === 'always') {
					async.parallel([
							async.apply(sql.insertInto, self, table, null),
							async.apply(sql.set, self, names(row), row),
							async.apply(sql.onDuplicateKeyUpdate, self, _(names(row)).without(['id']))
						],
						function (err, data) {
							if (err) {
								return callback(err);
							}
							execQuery(data.join('\n'));
						});
				}
				else if (saveMode === 'new') {
					async.parallel([
							async.apply(sql.insertInto, self, table, null),
							async.apply(sql.set, self, names(row), row),
						],
						function (err, data) {
							if (err) {
								return callback(err);
							}
							execQuery(data.join('\n'));
						});
				}
				else if (saveMode === 'existing') {
					if (!_(row).has('id')) {
						return callback(new Error('Cannot save to existing row: no ID specified'));
					}
					async.parallel([
							async.apply(sql.update, self, table, null),
							async.apply(sql.set, self, _(names(row)).without('id'), row),
							async.apply(sql.where, self, table, { id: row.id })
						],
						function (err, data) {
							if (err) {
								return callback(err);
							}
							execQuery(data.join('\n'));
						});
				}
				else {
					return callback(new Error('Unknown save mode: ' + saveMode));
				}
				/* Executes the query */
				function execQuery(sql) {
					query(sql, null, function (err, res) {
						if (err) {
							return callback(err);
						}
						if (res.affectedRows === 0) {
							return callback(new Error('Failed to save row with mode ' + saveMode));
						}
						if (_(res).has('insertId') && _(res.insertId).isNumber()) {
							if (_(table).has('id')) {
								row.id = res.insertId;
							}
						}
						callback(err);
					});
				}
			}
		],
		function (err) { callback(err); });
};

// 
// saveMany(table, rows, callback)
// --------
// 
// Resolves foreign key values and saves sets of rows to the database
// 
// Saves a load of rows to the table, updating when the primary key value
// matches an existing row and inserting otherwise.  Foreign key values are
// looked up automatically.  Internally, this calls save.
// 
//  + table - A table definition from the schema.
//  + rows - An array of rows to save.  Foreign key values are resolved, see the
//    foreign-keys module for more information.
// 
// Individual rows may have $saveMode set, see save() for information
// about this property.  It is deleted after being read.
// 
// ### Example
// 
//     saveMany(
//       schema.users,
//       [
//         {
//           id: 1,
//           name: 'mark',
//           country: { value: 'United Kingdom' },
//           role: { value: 'admin' }
//         },
//         {
//           id: 2,
//           name: 'marili',
//           country: { value: 'Estonia' },
//           role: { value: 'ploom' },
//           $saveMode: 'existing'
//         },
//       ],
//       function (err) { .. });
// 
ORM.prototype.saveMany = function (table, rows, callback) {
	var query = (_(arguments[0]).isFunction() && arguments[0].name === 'query') ? shift(arguments) : this.query;
	table = shift(arguments), rows = shift(arguments), callback = shift(arguments);
	var cols = shift(arguments) || this.listForeignKeys(table);
	var self = this;
	async.each(rows,
		function (row, callback) {
			self.save(query, table, row, callback, cols);
		},
		function (err) { callback(err); });
};

// 
// saveMultipleTables(data, callback)
// ------------------
// 
// Save sets of rows to several tables, looking up foreign keys where needed.
// 
//  + data - An object of the form { tableName: rows, tableName: rows, ... }.
//    
// $saveMode may be specified on individual rows, it is cleared upon save.
// See save() for more information about this property.
// 
// Note: tables are procesed in the order that their fields appear in the data
// object.  This relies on V8 honouring field order, which ECMAScript specs do
// not require it to do.  This also makes circular dependencies on foreign keys
// impossible to process with a single call to this function.  Internally, this
// calls saveMany.
// 
// ### Example
// 
//     saveMultipletables(
//       {
//         countries: [
//           { id: 44, name: 'United Kingdom' },
//           { id: 372, name: 'Estonia' }],
//         roles: [
//           { name: 'admin', rights: '*' },
//           { name: 'ploom', rights: 'being_awesome,being_a_ploom' }],
//         users: [
//           { 
//             name: 'mark',
//             country: { name: 'United Kingdom' },
//             role: { name: 'admin' }
//           },
//           {
//             name: 'marili',
//             country: { name: 'Estonia' },
//             role: { name: 'ploom' }
//           }]
//       },
//       function (err) { ... });
// 
// 
ORM.prototype.saveMultipleTables = function (data, callback) {
	var self = this;
	this.beginTransaction(function (err, transaction) {
		if (err) {
			return callback(err);
		}
		async.series([
				function (callback) {
					async.eachSeries(names(data),
						function (tableName, callback) {
							self.saveMany(transaction.query, self.schema[tableName], data[tableName], callback);
						},
						callback);
				},
				transaction.commit
			],
			function (err) {
				if (err) {
					return transaction.rollback(function () { callback(err); });
				}
				callback(null);
			});
	});
};

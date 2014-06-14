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

/*
 * Foreign key support
 * -------------------
 *
 *  The options query parameter is a function (format, params, callback),
 *  such as the mysql connection.query method.  This allows intercepting of
 *  queries (e.g. for logging) and transactional operations even when the ORM
 *  is using a connection pool.
 */

var mysql = require('mysql');
var _ = require('underscore');
var async = require('async');

var utils = require('./utils');
var names = utils.names;
var shift = utils.shift;

var ORM = { prototype: {} };
module.exports = ORM.prototype;

/*
 * listForeignKeys(table)
 * ---------------
 *
 * Returns an array of names of fields in the table which have a foreign key
 * constraint.
 *
 * ### Example
 *
 *     var names = listForeignKeys(schema.users);
 */
ORM.prototype.listForeignKeys = function (table) {
	if (_(table).isString()) {
		table = this.schema[table];
	}
	return names(table).filter(function (col) { return !!table[col].references; });
};

/*
 * lookupForeignId([query], field, criteria, callback)
 * ---------------
 *
 * Looks up the id of the parent record, identified by search criteria. Returns
 * an error if no or if multiple parent records are found.  In such a case, the
 * second callback paremeter is zero or two for no or multiple records found.
 *
 * ### Example
 *
 *     lookupForeignKey(schema.users.country, { name: 'Estonia' },
 *       function (err, value) { ... });
 */
ORM.prototype.lookupForeignId = function (field, criteria, callback) {
	var query = (_(arguments[0]).isFunction() && arguments[0].name === 'query') ? shift(arguments) : this.query;
	field = shift(arguments), criteria = shift(arguments), callback = shift(arguments);
	var self = this;
	var foreign = field.references;
	var kvp = [];
	for (var key in criteria) {
		if (_(criteria).has(key)) {
			kvp.push(mysql.escapeId(key) + '=' + mysql.escape(criteria[key]));
		}
	}
	var where = kvp.join(' AND ');
	var localName = arguments[this.length];
	var foreignName = mysql.escapeId(foreign.$table.$name) + '.' + mysql.escapeId(foreign.$name);
	query('SELECT ?? FROM ?? WHERE ' + where + ' LIMIT 2', [foreign.$name, foreign.$table.$name],
		function (err, res) {
			if (err) {
				self.warn('Error occurred while looking up foreign id');
				return callback(err);
			}
			if (res.length !== 1) {
				return callback(new Error(self.warn(
							(res.length > 1 ? 'Multiple' : 'No') +
							' foreign ids (' + foreignName + ') found' +
							(_(localName).isString() ? ' for ' + localName : '') +
							' with criteria ' + JSON.stringify(criteria))),
							res.length);
			}
			callback(null, res[0][foreign.$name]);
		});
};

/*
 *  lookupForeignIds([query], table, row, callback)
 *  ----------------
 *
 * Looks up all foreign key values for a row
 *
 * Any foreign-key fields in row which contain an object are assumed to be
 * search criteria.  lookupForeignId is used to fill in their corresponding id
 * values.  Those values of row are replaced with the id values, then the same
 * (modified) row object is passed to the callback.
 *
 * ### Example
 *
 *     lookupForeignIds(schema.users,
 *       {
 *         name: 'mark',
 *         country: { name: 'Estonia' },
 *         role: { name: 'admin' }
 *       },
 *       function (err, value) { ... });
 *
 *     // value.country = 372, value.role = <some id value>
 */
ORM.prototype.lookupForeignIds = function (table, row, callback) {
	var query = (_(arguments[0]).isFunction() && arguments[0].name === 'query') ? shift(arguments) : this.query;
	table = shift(arguments), row = shift(arguments), callback = shift(arguments);
	var cols = shift(arguments) || this.listForeignKeys(table);
	var self = this;
	async.each(cols,
		function (col, callback) {
			var field = table[col], value = row[col], foreign = field.references;
			var localName = mysql.escapeId(table.$name) + '.' + mysql.escapeId(col);
			if (!_(value).isObject()) {
				return callback(null);
			}
			self.lookupForeignId(query, field, value, function (err, res) {
				if (err) {
					return callback(err);
				}
				row[col] = res;
				callback(null);
			}, localName);
		},
		function (err) {
			callback(err, row);
		});
};

ORM.prototype.lookupForeignRow = function (field, id, callback) {
	var query = (_(arguments[0]).isFunction() && arguments[0].name === 'query') ? shift(arguments) : this.query;
	field = shift(arguments), id = shift(arguments), callback = shift(arguments);
	var self = this;
	var foreign = field.references;
	var localName = arguments[this.length];
	var foreignName = mysql.escapeId(foreign.$table.$name) + '.' + mysql.escapeId(foreign.$name);
	query('SELECT * FROM ?? WHERE ??=?', [foreign.$table.$name, foreign.$name, id],
		function (err, res) {
			if (err) {
				self.warn('Error occurred while looking up foreign row');
				return callback(err);
			}
			if (res.length !== 1) {
				return callback(new Error(self.warn(
							(res.length > 1 ? 'Multiple' : 'No') +
							' foreign rows (' + foreignName + ') found' +
							(_(localName).isString() ? ' for ' + localName : '') +
							' with criteria ' + JSON.stringify(criteria))));
			}
			callback(null, res[0]);
		});
};

/*
 * lookupForeignRow(table, row, callback)
 * ----------------
 *
 * **TODO**: Document lookupForeignRow[s], which operates in a very simular way,
 * but looks up entire rows from ID values instead of ID values from rows...
 */
ORM.prototype.lookupForeignRows = function (table, row, callback) {
	var query = (_(arguments[0]).isFunction() && arguments[0].name === 'query') ? shift(arguments) : this.query;
	table = shift(arguments), row = shift(arguments), callback = shift(arguments);
	var cols = shift(arguments) || this.listForeignKeys(table);
	var self = this;
	async.each(cols,
		function (col, callback) {
			var field = table[col], value = row[col], foreign = field.references;
			var localName = mysql.escapeId(table.$name) + '.' + mysql.escapeId(col);
			if (!_(value).isNumber()) {
				return callback(null);
			}
			self.lookupForeignRow(query, field, value, function (err, res) {
				if (err) {
					return callback(err);
				}
				row[col] = res;
				callback(null);
			}, localName);
		},
		function (err) {
			callback(err, row);
		});
};

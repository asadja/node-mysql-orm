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

/*
 * load(table, id|criteria, callback)
 * ----
 *
 * Retrieves a single row from table where the id matches the id parameter, or
 * where the criteria matches.  Returns an error if more than one row was
 * returned, and null if none were.
 *
 * Same usage as loadMany but obviously the LIMIT specifiers are not used.
 */
ORM.prototype.load = function (table, IdOrCriteria, callback) {
	var criteria = sql.getCriteria(IdOrCriteria);
	delete criteria.$first;
	delete criteria.$last;
	criteria.$limit = 2;
	this.loadMany(table, criteria, function (err, res) {
		if (err) {
			return callback(err);
		}
		if (res.length === 0) {
			return callback(null, null);
		}
		else if (res.length === 1) {
			return callback(null, res[0]);
		}
		else if (res.length > 1) {
			return callback(new Error('Multiple rows were returned for GET operation on table '+(table.$name||table)+' with criteria ' + JSON.stringify(criteria)));
		}
	});
};

/*
 * loadMany(table, [criteria], callback)
 * --------
 *
 * Retrieves multiple rows from table where the criteria evaluates to
 * true, or retrieves all rows if no criteria were specified.
 *
 * criteria may be null to have all records returned using the default
 * sort specified by table.$sort.
 *
 * criteria may be a number or a string, indicating the id to lookup.
 *
 * Ideally, if criteria is not null, it should be an object though.  This
 * makes code more readable and explicit, and also allows some extra query
 * options to be specified:
 *
 * criteria may include $lookup specifying whether to lookup foreign
 * key values.  If not specified, this defaults to true.
 *
 * criteria may include $fields array of field names/references, which
 * specified which fields to retrieve.  All fields are retrieved otherwise.
 *
 * criteria may include $sort which is a field name/reference or an
 * array of field names/references, specifying how to sort the resulting
 * dataset.  A field name may be preceeded by a + or - to indicate sort
 * order.
 *
 * criteria may include $first, $last or $count specifiers for a
 * LIMIT clause.  Some way to calculate $count is mandatory, i.e. either
 * $count must be specified (optionally with either $first or $last)
 * or $first and $last must both be specified.
 *
 * ### Example:
 *
 *     loadMany(
 *       schema.users,
 *       {
 *         // role is a foreign key: pass an object as the value to have it
 *         // looked up in the parent table.  Non-object values will be treated
 *         // as raw values in this table and will not be looked up in the
 *         // parent table.  Cry me a river, but this allows one to look up by
 *         // ID number on a foreign field, in addition to enjoying the lovely
 *         // foreign-key handling provided by this library/framework/module.
 *         role: { value: 'admin' },
 *         $fields: { schema.users.name, schema.users.id, schema.users.country },
 *         $sort: schema.users.name,  //or '+name'
 *         $count: 10
 *       },
 *       function (err, rows) {
 *         if (err) throw err;
 *         rows.forEach(function (row) {
 *           console.log(
 *             'Admin #' + row.id + ' ' +
 *             '"' + row.name + '" ' +
 *             'is from ' + row.country.value);
 *         });
 *       });
 *
 */
ORM.prototype.loadMany = function (table, criteria, callback) {
	var query = (_(arguments[0]).isFunction() && arguments[0].name === 'query') ? shift(arguments) : this.query;
	table = shift(arguments), criteria = shift(arguments), callback = shift(arguments);
	var self = this;
	if (_(criteria).isFunction() && typeof callback === 'undefined') {
		callback = criteria, criteria = {};
	}
	else if (typeof criteria === undefined || criteria === null) {
		criteria = {};
	}
	else if (_(criteria).isString() || _(criteria).isNumber()) {
		criteria = { id: criteria };
	}
	var lookup = !_(criteria).has('$lookup') || criteria.$lookup;
	async.parallel([
			async.apply(sql.select, this, table, criteria),
			async.apply(sql.from, this, table, criteria),
			async.apply(sql.where, this, query, table, criteria),
			async.apply(sql.orderby, this, table, criteria),
			async.apply(sql.limit, this, table, criteria)
			/*
			 * TODO: JOINs so we can get the foreign key stuff in one operation
			 * instead of running several SELECTs on every row which is obviously
			 * going to be insanely slow for large datasets.
			 */
		],
		function (err, sqlParts) {
			if (err) {
				return callback(err);
			}
			query(_(sqlParts).compact().join('\n'), null, function (err, rows) {
				if (err) {
					return callback(err);
				}
				if (!lookup) {
					return callback(null, rows);
				}
				// TODO: Until joins are implemented, check to see whether we
				// actually need to do a lookup before doing one...
				async.each(rows,
					function (row, callback) {
						self.lookupForeignRows(query, table, row, callback);
					},
					function (err) {
						if (err) {
							return callback(err);
						}
						callback(null, rows);
					});
			});
		});
};

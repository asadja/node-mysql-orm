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
 * Load operations
 *
 *  load(table, id|criteria, callback)
 *
 *    Retrieves a single row from `table` where the `id` matches the `id`
 *    parameter, or where the `criteria` evaluates to true.  Returns an
 *    error if more than one row was returned, and null if none were.
 *
 *    Same usage as `loadMany` but obviously the LIMIT specifiers are not used.
 *
 *
 *  loadMany(table, [criteria], callback)
 *
 *    Retrieves multiple rows from `table` where the `criteria` evaluates to
 *    true, or retrieves all rows if no `criteria` were specified.
 *
 *    `criteria` may be null to have all records returned using the default
 *    sort specified by table.$sort.
 *
 *    `criteria` may be a number or a string, indicating the `id` to lookup.
 *
 *    Ideally, if `criteria` is not null, it should be an object though.  This
 *    makes code more readable and explicit, and also allows some extra query
 *    options to be specified:
 *
 *    `criteria` may include `$lookup` specifying whether to lookup foreign
 *    key values.  If not specified, this defaults to true.
 *
 *    `criteria` may include `$fields` array of field names/references, which
 *    specified which fields to retrieve.  All fields are retrieved otherwise.
 *
 *    `criteria` may include `$sort` which is a field name/reference or an
 *    array of field names/references, specifying how to sort the resulting
 *    dataset.  A field name may be preceeded by a + or - to indicate sort
 *    order.
 *
 *    `criteria` may include `$first`, `$last` or `$count` specifiers for a
 *    LIMIT clause.  Some way to calculate `$count` is mandatory, i.e. either
 *    `$count` must be specified (optionally with either `$first` or `$last`)
 *    or `$first` and `$last` must both be specified.
 *
 *    loadMany(
 *      schema.users,
 *      {
 *        // `role` is a foreign key: pass an object as the value to have it
 *        // looked up in the parent table.  Non-object values will be treated
 *        // as raw values in this table and will not be looked up in the
 *        // parent table.  Cry me a river, but this allows one to look up by
 *        // ID number on a foreign field, in addition to enjoying the lovely
 *        // foreign-key handling provided by this library/framework/module.
 *        role: { value: 'admin' },
 *        $fields: { schema.users.name, schema.users.id, schema.users.country },
 *        $sort: schema.users.name,  //or '+name'
 *        $count: 10
 *      },
 *      function (err, rows) {
 *        if (err) throw err;
 *        rows.forEach(function (row) {
 *          console.log(
 *            'Admin #' + row.id + ' ' +
 *            '"' + row.name + '" ' +
 *            'is from ' + row.country.value);
 *        });
 *      });
 *
 */

var mysql = require('mysql');
var async = require('async');
var _ = require('underscore');

var utils = require('./utils');
var names = utils.names;
var shift = utils.shift;

var ORM = { prototype: {} };
module.exports = ORM.prototype;

function select(self, table, criteria, callback) {
	if (_(criteria).has('$fields')) {
		return callback(null, mysql.format('SELECT ??', [criteria.$fields]));
	}
	else {
		return callback(null, 'SELECT *');
	}
}

function from(self, table, criteria, callback) {
	if (_(table).isString()) {
		return callback(null, mysql.format('FROM ??', [table]));
	}
	else if (_(table).has('$name')) {
		return callback(null, mysql.format('FROM ??', [table.$name]));
	}
	else {
		return callback(new Error('Unknown table specification: ' + table));
	}
}

function where(self, table, criteria, callback) {
	var self = shift(arguments);
	var query = (_(arguments[0]).isFunction() && arguments[0].name === 'query') ? shift(arguments) : this.query;
	table = shift(arguments), criteria = shift(arguments), callback = shift(arguments);
	var cols = names(criteria);
	if (cols.length) {
		self.lookupForeignIds(query, table, criteria, function (err, res) {
			if (err) {
				return callback(err);
			}
			return callback(null,
				'WHERE\n\t' + cols
					.map(function (col) {
						return mysql.format('??=?', [col, res[cols]]);
					})
					.join(',\n\t'));
		}, cols);
	}
	else {
		return callback(null);
	}
}

function orderby(self, table, criteria, callback) {
	var sort = _(criteria).has('$sort') ? criteria.$sort : _(table).has('$sort') ? table.$sort : null;
	if (sort !== null && sort.length) {
		if (_(sort).isString()) {
			sort = [sort];
		}
		return callback(null, 'ORDER BY\n\t' + sort.map(function (field) {
			if (typeof field === 'object') {
				if (_(field).has('$name') && _(field).has('$table')) {
					field = field.$name;
				}
				else {
					return callback(new Error('$sort must either be a field name, a field reference, or an array of field names/references'));
				}
			}
			if (field.charAt(0) === '-') {
				return mysql.escapeId(field.substr(1)) + ' DESC';
			}
			else if (field.charAt(0) === '+') {
				return mysql.escapeId(field.substr(1)) + ' ASC';
			}
			else {
				return mysql.escapeId(orderby);
			}
		}).join(',\n\t'));
	}
	else {
		return callback(null);
	}
}

function limit(self, table, criteria, callback) {
	var lparams =
		_(criteria).has('$first')?1:0 +
		_(criteria).has('$count')?2:0 +
		_(criteria).has('$last') ?4:0;
	switch (lparams) {
		case 0: return callback(null);
		case 1: return callback(new Error('$first value for LIMIT specified, but no $last or $count value'));
		case 2: return callback(null, mysql.format('LIMIT ?', [criteria.$count])); break;
		case 3: return callback(null, mysql.format('LIMIT ?\nOFFSET ?', [criteria.$count, criteria.$first])); break;
		case 4:	return callback(new Error('$last value for LIMIT specified, but no $first or $count value'));
		case 5: return callback(null, mysql.format('LIMIT ?\nOFFSET ?', [criteria.$last - criteria.$first, criteria.$first])); break;
		case 6: return callback(null, mysql.format('LIMIT ?\nOFFSET ?', [criteria.$count, criteria.$last - criteria.$count])); break;
		case 7: return callback(new Error('$first, $last, $count were all specified for LIMIT'));
	}
}

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
			async.apply(select, this, table, criteria),
			async.apply(from, this, table, criteria),
			async.apply(where, this, query, table, criteria),
			async.apply(orderby, this, table, criteria),
			async.apply(limit, this, table, criteria)
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
			var sql = _(sqlParts).compact().join('\n');
			query(sql, null, function (err, rows) {
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

ORM.prototype.load = function (table, IdOrCriteria, callback) {
	var criteria = {};
	if (_(IdOrCriteria).isNumber() || _(IdOrCriteria).isString()) {
		criteria.id = IdOrCriteria;
	}
	else {
		for (var prop in IdOrCriteria) {
			if (_(IdOrCriteria).has(prop)) {
				criteria[prop] = IdOrCriteria[prop];
			}
		}
	}
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

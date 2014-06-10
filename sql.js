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
 * SQL clause generators
 * 
 */

var mysql = require('mysql');
var async = require('async');
var _ = require('underscore');

var utils = require('./utils');
var names = utils.names;
var shift = utils.shift;

/*
 * SELECT <fields>
 *
 * `$fields` can contain a mix of field references and field names.
 * Defaults to '*' if no fields are specified.
 * 
 */
module.exports.select = function (self, table, criteria, callback) {
	if (_(criteria).has('$fields')) {
		var fields = criteria.$fields.map(
			function (field) {
				if (_(field).has('$name')) {
					return field.$name;
				}
				else {
					return field;
				}
			}
		);
		return callback(null, mysql.format('SELECT ??', [fields]));
	}
	else {
		return callback(null, 'SELECT *');
	}
};

/*
 * DELETE
 *
 * No point making this async, it can never take parameters.
 * QUICK and IGNORE are irrelevant as performance is not an objective of this
 * package.
 *
 * Then again, I like having my clause lists in async.parallel, and as stated,
 * performance is not important in this library.
 */
module.exports.delete = function (callback) {
	callback(null, 'DELETE');
}

/*
 * Table name: table can be a string or a table reference.
 * 
 */
function tableName(table, callback) {
	if (_(table).isString()) {
		return callback(null, mysql.escapeId(table));
	}
	else if (_(table).has('$name')) {
		return callback(null, mysql.escapeId(table.$name));
	}
	else {
		return callback(new Error('Unknown table specification: ' + table));
	}
}

/*
 * INSERT INTO <table name>
 *
 * `table` can be a table reference or a table name.
 * 
 */
module.exports.insertInto = function (self, table, criteria, callback) {
	tableName(table, function (err, res) {
		if (err) {
			return callback(err);
		}
		callback(null, 'INSERT INTO ' + res);
	});
};

/*
 * UPDATE <table name>
 *
 * `table` can be a table reference or a table name.
 * 
 */
module.exports.update = function (self, table, criteria, callback) {
	tableName(table, function (err, res) {
		if (err) {
			return callback(err);
		}
		callback(null, 'UPDATE ' + res);
	});
};

/*
 * FROM <table name>
 *
 * `table` can be a table reference or a table name.
 * 
 */
module.exports.from = function (self, table, criteria, callback) {
	tableName(table, function (err, res) {
		if (err) {
			return callback(err);
		}
		callback(null, 'FROM ' + res);
	});
};

/*
 * WHERE <criteria>
 *
 * Properties of `criteria` with names that don't begin with '$' are used
 * to generate search constraints.  Foreign row IDs are looked up where
 * necessary to generate these constraints.
 * 
 */
module.exports.where = function (self, table, criteria, callback) {
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
};

/*
 * ORDER BY <field [direction]>
 *
 * `$sort` property of the criteria, or (as fallback) the table are used
 * to generate sorting instructions.  `$sort` can be a field name/reference
 * or an array of such.  Begin field names with +/- to specify ascending or
 * descending sort order.
 * 
 */
module.exports.orderby = function (self, table, criteria, callback) {
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
};

/*
 * LIMIT <count> [OFFSET <start>]
 *
 * Uses a combination of `$first`, `$last` and `$count` to generate a
 * LIMIT clause.
 * 
 */
module.exports.limit = function (self, table, criteria, callback) {
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
};

/*
 * ON DUPLICATE KEY UPDATE <name = VALUES(name), ...>
 *
 * Generates a list of copy assignments
 *
 */
module.exports.onDuplicateKeyUpdate = function (self, keys, callback) {
	callback(null,
		'ON DUPLICATE KEY UPDATE\n\t' + keys.map(
			function (key) {
				return mysql.format('?? = VALUES(??)', [key, key]);
			}
		).join(',\n\t'));
};

/*
 * SET <name = value, ...>
 *
 * Generates a list of assignments
 *
 */
module.exports.set = function (self, keys, row, callback) {
	if (!keys) {
		keys = names(row);
	}
	callback(null,
		'SET\n\t' + keys.map(
			function (key) {
				return mysql.format('?? = ?', [key, row[key]]);
			}
		).join(',\n\t'));
};

/* Returns a criteria object */
/* TODO: Move this to util.js, it isn't a SQL generator */
module.exports.getCriteria = function (IdOrCriteria) {
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
	return criteria;
};

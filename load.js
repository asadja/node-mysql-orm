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
 *  get(table, id|criteria, callback)
 *
 *    Retrieves a single row from `table` where the `id` matches the `id`
 *    parameter, or where the criteria evaluates to true.
 *
 *
 *  list(table, [criteria], callback)
 *
 *    Retrieves multiple rows from `table` where the criteria evaluates to
 *    true, or retrieves all rows if no criteria were specified.
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

module.prototype.get = function (table, criteria, callback) {
	if (_(criteria).isString() || _(criteria).isNumber()) {
		criteria = { id: criteria };
	}
	else if (!criteria) {
		criteria = {};
	}
};

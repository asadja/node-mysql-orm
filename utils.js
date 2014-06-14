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

/* Like Array.prototype.shift, but operates on arguments too */
module.exports.shift = function (args) {
	var shifted = args[0];
	for (var i = 0; i < args.length; i++) {
		args[i] = args[i + 1];
	}
	args.length--;
	return shifted;
}

/* Indents a multiline string */
module.exports.indent = function (str) {
	return '\t' + str.replace(/\n/g, '\n\t');
};

/* Get a list of object names within the given object */
module.exports.names = function (obj) {
	return _(obj).keys().filter(
		function (key) {
			return key.charAt(0) !== '$';
		});
};

'use strict';
/*
 * MySQL object-relational mapping
 *
 * (C) 2014 Mark K Cowan, mark@battlesnake.co.uk
 *
 * Released under `GNU General Public License, Version 2`
 *
 */

var mysql = require('mysql');
var async = require('async');
var _ = require('underscore');

module.exports.create = function (schema, defaultdata, options, onready) {
	return new ORM(schema, defaultdata, options, onready);
};

/* ORM constructor */
/*
 * options:
 * 	- database: Name of database
 * 	- connection: MySQL connection
 * 	? recreateDatabase: Drop the database first
 * 	? recreateTables: Drop the tables first
 * 	? logLevel: Log level (do not set to < 1, default is highest [3])
 */
function ORM(schema, defaultdata, options, onready) {
	var self = this;
	if (!schema || !options || !onready) {
		throw new Error('Required parameter missing');
	}
	if (_(options).has('logLevel')) {
		this.logLevel = options.logLevel;
	}
	if (!options.database) {
		throw new Error('Compulsory option (lol) `database` not specified');
	}
	if (!options.connection) {
		throw new Error('Compulsory option (lol) `connection` not specified');
	}
	this.database = options.database;
	this.schema = schema;
	this.types = schema.$types;
	this.connection = options.connection;
	this.query = this.loggedQuery(this.connection);
	var autogen = require('./autogen');
	autogen.initialise_schema(this);
	async.series(
		[
			async.apply(autogen.create_database, self, options.recreateDatabase),
			async.apply(autogen.create_tables, self, options.recreateTables),
			function (callback) {
				if (defaultdata && (options.recreateTables || options.recreateDatabase)) {
					return self.saveMultipleTables(defaultdata, callback);
				}
				callback(null);
			}
		],
		function (err) {
			self.ready = true;
			if (_(onready).isFunction()) {
				onready(null, self);
			}
		});
}

ORM.prototype = {};
ORM.prototype.constructor = ORM;

_(ORM.prototype).extend(require('./logging'));
_(ORM.prototype).extend(require('./logging-query'));
_(ORM.prototype).extend(require('./transaction'));
_(ORM.prototype).extend(require('./foreign-keys'));
_(ORM.prototype).extend(require('./save'));
_(ORM.prototype).extend(require('./load'));

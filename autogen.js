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
var indent = utils.indent;

/* Parse the schema and set up backreferences in the schema */
module.exports.initialise_schema = initialise_schema;
function initialise_schema(orm) {
	function keys(obj) {
		return _(obj).keys().filter(function (key) { return key.charAt(0) !== '$'; });
	}
	orm.schema.$name = orm.database;
	orm.schema.$orm = orm;
	keys(orm.schema).forEach(function (tableName) {
		orm.info('schema ' + tableName);
		var table = orm.schema[tableName];
		table.$schema = orm.schema;
		table.$name = tableName;
		/* All tables must have a primary key */
		if (!_(table).has('id') && !table.$primary) {
			table.id = { type: '::id' };
		}
		keys(table).forEach(function (fieldName) {
			orm.info('schema ' + Array(tableName.length+1).join(' ') + '.' + fieldName);
			var field = table[fieldName];
			if (_(field).isString()) {
				var f = field.split(',').map(function (s) { return s.trim(); });
				field = {};
				field.type = f.shift();
				field.unique = _(f).contains('unique');
				field.index = _(f).contains('index');
				field.nullable = _(f).contains('nullable');
				if (_(f).contains('cascade')) {
					field.onDelete = 'cascade';
					field.onUpdate = 'cascade';
				}
			}
			/* Resolve aliases */
			if (_(orm.schema.$types).has(field.type)) {
				field.type = orm.schema.$types[field.type];
			}
			/* Builtin primary key type */
			if (field.type === '::id') {
				field.type = 'INTEGER AUTO_INCREMENT';
				if (table.$primary) {
					throw new Error(
						'Cannot parse ::id key "' + fieldName + '": table "' +
						tableName + '" already has primary key(s) specified');
				}
				table.$primary = fieldName;
			}
			field.$schema = orm.schema;
			field.$table = table;
			field.$name = fieldName;
		});
	});
}

/* Create the database if needed (or if recreate is requested) */
module.exports.create_database = create_database;
function create_database(orm, recreate, callback) {
	var queries = [];
	if (recreate) {
		orm.warn('Recreate is specified: dropping database ' + orm.database);
		queries.push(mysql.format('DROP DATABASE IF EXISTS ??', [orm.database]));
	}
	queries.push(mysql.format('CREATE DATABASE IF NOT EXISTS ??', [orm.database]));
	queries.push(mysql.format('USE ??', [orm.database]));
	/* Generate query executing functions from SQL commands */
	queries = queries.map(function (sql) {
		return function (callback) {
			orm.query(sql, null, callback);
		};
	});
	/* Execute queries */
	async.series(queries, callback);
};

/* Create the tables if they don't already exist (or if recreate is requested) */
module.exports.create_tables = create_tables;
function create_tables(orm, recreate, callback) {
	var queries = [];
	/* Generate list of SQL commands */
	queries.push('SET FOREIGN_KEY_CHECKS = 0');
	if (recreate) {
		var tables = names(orm.schema);
		orm.warn('Recreate is specified: dropping tables ' + tables.join(', '));
		if (tables.length) {
			queries.push(mysql.format('DROP TABLE IF EXISTS ??', [tables]));
		}
	}
	names(orm.schema).forEach(function (tableName) {
		queries.push(create_table(orm, orm.schema[tableName]));
	});
	queries.push('SET FOREIGN_KEY_CHECKS = 1');
	/* Execute queries */
	async.series(
		queries.map(function (sql) {
			return async.apply(orm.query, sql, null);
		}),
		callback);
}

/* Generates a CREATE TABLE query for the given table schema */
function create_table(orm, table) {
	var columns = [];
	names(table).forEach(function (fieldName) {
		columns.push(column_definition(orm, table[fieldName]));
	});
	if (table.$primary && table.$primary.length) {
		columns.push(mysql.format('PRIMARY KEY (??)', [table.$primary]));
	}
	var lines = [];
	lines.push(mysql.format('CREATE TABLE IF NOT EXISTS ?? (', table.$name));
	lines.push(indent(columns.join(',\n')));
	lines.push(');');
	return lines.join('\n');
}

/* Helper function to parse reference_option values */
function reference_option(orm, value) {
	value = value.toUpperCase();
	if (!_(['RESTRICT', 'CASCADE', 'SET NULL', 'NO ACTION']).contains(value)) {
		orm.warn('unrecognised reference_option: ' + value);
	}
	return value;
}

/* Generates column_definition clauses for CREATE_TABLE */
function column_definition(orm, field) {
	var name = field.$name, type = field.type, nullable = field.nullable, index = field.index, unique = field.unique, defaultValue = field.default, references = field.references, onUpdate = field.onUpdate, onDelete = field.onDelete, lines = [], fieldFullName = mysql.escapeId(field.$table.$name) + '.' + mysql.escapeId(field.$name);
	/* Automatic foreign key */
	if (type.charAt(0) === ':') {
		var refs = type.split(':');
		refs.shift();
		var ref = refs.shift(), key = refs.shift() || 'id';
		type = 'INTEGER';
		if (!_(orm.schema).has(ref)) {
			return orm.error('Cannot create foreign key: table ' + mysql.escapeId(ref) + ' not found for field ' + fieldFullName);
		}
		if (!_(orm.schema[ref]).has(key)) {
			return orm.error('Cannot create foreign key: field ' + mysql.escapeId(ref) + '.' + mysql.escapeId(key) + ' not found for field ' + fieldFullName);
		}
		if (!_(index).isString()) {
			index = name + '_idx_' + ref + '_' + key;
		}
		if (!_(references).isUndefined()) {
			return orm.error('Cannot define foreign key: a foreign key is already specified for field ' + fieldFullName);
		}
		references = orm.schema[ref][key];
	}
	/* Index */
	if (index) {
		if (!_(index).isString()) {
			index = name + '_idx';
		}
		field.index = index;
		lines.push(['INDEX ?? (??)', [index, name]]);
	}
	/* Unique key */
	if (unique) {
		if (!_(unique).isString()) {
			unique = name + '_uniq';
		}
		field.unique = unique;
		lines.push(['CONSTRAINT ?? UNIQUE KEY (??)', [unique, name]]);
	}
	/* Foreign key */
	if (!_(references).isUndefined()) {
		if (_(references).isString()) {
			references = orm.schema[references].id;
		}
		field.references = references;
		lines.push([_([
			'CONSTRAINT ?? FOREIGN KEY (??) REFERENCES ?? (??)',
			_(onUpdate).isString() && 'ON UPDATE ' + reference_option(orm, onUpdate),
			_(onDelete).isString() && 'ON DELETE ' + reference_option(orm, onDelete),
		]).compact().join(' '),
		[name + '_fk_' + references.$table.$name + '_' + references.$name, name, references.$table.$name, references.$name]]);
	}
	/* Column name and definition */
	lines = lines.map(function (ar) { return mysql.format.apply(mysql, ar); }).map(indent);
	lines.unshift(_([
		mysql.escapeId(name),
		type,
		!nullable && 'NOT NULL',
		defaultValue && ('DEFAULT ' + mysql.escape(defaultValue))
	]).compact().join(' '));
	return lines.join(',\n');
};



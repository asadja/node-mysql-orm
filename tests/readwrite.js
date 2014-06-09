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
 * Read / write tests
 */

var mysql = require('mysql');
var async = require('async');
var _ = require('underscore');

module.exports = function (orm ,callback) {
	async.waterfall([
		function (callback) {
			orm.loadMany(orm.schema.countries, null, callback);
		},
		function (countries, callback) {
			console.log('Countries');
			countries.forEach(function (country) {
				console.log(country.id + ': \t' + country.name);
			});
			console.log('');
			callback(null);
		},
		function (callback) {
			orm.load(orm.schema.users, 1, callback);
		},
		function (user, callback) {
			console.log('Retrieved user #1:');
			console.log(user);
			console.log('Setting user role to "pleb"');
			user.role = { name: 'pleb' };
			orm.save(orm.schema.users, user, callback);
		},
		function (callback) {
			orm.load(orm.schema.users, 1, callback);
		},
		function (user, callback) {
			console.log('Retrieved user #1:');
			console.log(user);
			console.log('Setting user country to "United Kingdom" via raw ID value');
			user.country = 44;
			orm.save(orm.schema.users, user, callback);
		},
		function (callback) {
			orm.load(orm.schema.users, 1, callback);
		},
		function (user, callback) {
			console.log('Retrieved user #1:');
			console.log(user);
			console.log('Replacing country "United Kingdom" with "Scottish Federation"');
			orm.save(orm.schema.countries, { id:44, name:'Scottish Federation' }, callback);
		},
		function (callback) {
			orm.load(orm.schema.users, 1, callback);
		},
		function (user, callback) {
			console.log('Retrieved user #1:');
			console.log(user);
			callback(null);
		}
		],
		callback);
};

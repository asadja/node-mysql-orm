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
 * Colourful logging
 *
 *  logLevel: int
 *
 *    Sets the logging level.
 *      0: all messages are ignored including fatal errors.  Do not use this
 *      level.
 *      1: only fatal errors are logged (and are also thrown).
 *      2: warnings are also logged.
 *      3: info is also logged.
 *      4: for those who use CFLAGS="-O99" because "-O98" code is just too slow.
 *
 *    logLevel = 2 (default)
 *   
 *
 *  log(level, msg)
 *
 *    Logs a message at a custom level
 *
 *    log(cli.olive('POTATO'), 'I am a potato');
 *
 *
 *  error(msg)
 *
 *    Logs the given message at FAIL level, then throws it as an Error, if
 *    logLevel >= 1.  If logLevel !>= 1, stuff will go horribly wrong.
 *
 *    error('Access denied to backend database');
 *
 *
 *  warn(msg)
 *
 *    Logs the given message at WARN level.
 *
 *    warn('dropTables specified, dropping all tables');
 *
 *
 *  info(msg)
 *
 *    Logs the given message at INFO level.
 *
 *    info('Executing query ' + sql);
 *
 */

var cli = require('cli-color');

var ORM = { prototype: {} };
module.exports = ORM.prototype;

/* 0=you_have_deathwish, 1=errors, 2=warnings, 3=info */
ORM.prototype.logLevel = 2;

function sleep(delay) {
	/*
	 * OMG, a blocking operation in node.js, the developer of this package
	 * must be such a useless n00b right?  Just like those damn kernel
	 * developers who use `goto`...
	 */
	var stop = new Date().getTime() + delay;
	while (new Date().getTime() < stop) ;
}

/* Logging with pretty colours */
ORM.prototype.log = function (level, msg) {
	console.log(cli.green('mysql-orm') + ' ' + level + ' ' + msg);
	if (this.debug) sleep(50);
	return msg;
}

/* Throws an exception */
ORM.prototype.error = function (msg) {
	if (this.logLevel >= 1) {
		this.log(cli.red.bold('FAIL'), msg);
		throw (msg instanceof Error ? msg : new Error(msg));
	}
	if (this.debug) sleep(500);
	return msg;
}

/* Warning */
ORM.prototype.warn = function (msg) {
	if (this.logLevel >= 2) {
		this.log(cli.yellow('WARN'), msg);
	}
	if (this.debug) sleep(250);
	return msg;
}

/* Information */
ORM.prototype.info = function (msg) {
	if (this.logLevel >= 3) {
		this.log(cli.cyan('INFO'), msg);
	}
	return msg;
}

/* Testing */
ORM.prototype.test = function (msg) {
	this.log(cli.magenta('TEST'), msg);
	return msg;
}

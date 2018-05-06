'use strict';

const filesystem = require('fs');
const crypto = require('crypto');

try{
	require.resolve('redis');
	var redis = require('redis');
}catch(ex){
	console.log('tiny-cacher: Redis appears to be not installed, note that Redis caching is disabled, to install the module use the command "npm install redis".');
}
try{
	require.resolve('memcached');
	var memcached = require('memcached');
}catch(ex){
	console.log('tiny-cacher: Memcached appears to be not installed, note that Memcached caching is disabled, to install the module use the command "npm install memcached".');
}
try{
	require.resolve('sqlite3');
	var sqlite3 = require('sqlite3');
}catch(ex){
	console.log('tiny-cacher: SQLite3 appears to be not installed, note that SQLite3 caching is disabled, to install the module use the command "npm install sqlite3".');
}

/**
* @var Object staticStorage An object that is used to store cache when using the internal shared strategy, this variable is visible across all the class instances.
*/
let staticStorage = {};

/**
* @var Object garbageCollectorInterval An object representing the interval of the garbage collector.
*/
let garbageCollectorInterval = null;

module.exports = class TinyCacher{
	/**
	* Returns all supported strategies according to installed and loaded modules (drivers).
	*
	* @param Boolean numeric If set to "true" will be returned a sequential array contianing the identifiers of the strategies as integer numbers, otherwise as strings.
	*
	* @return Array A sequential array containing the strategies identifiers.
	*/
	static getSupportedStrategies(numeric){
		let strategies = numeric === true ? new Array(TinyCacher.STRATEGY_LOCAL, TinyCacher.STRATEGY_SHARED) : new Array('local', 'shared');
		if ( typeof(redis) === 'object' && redis !== null ){
			strategies.push(numeric === true ? TinyCacher.STRATEGY_REDIS : 'redis');
		}
		if ( typeof(memcached) !== 'undefined' && memcached !== null ){
			strategies.push(numeric === true ? TinyCacher.STRATEGY_MEMCACHED : 'memcached');
		}
		if ( typeof(sqlite3) === 'object' && sqlite3 !== null ){
			strategies.push(numeric === true ? TinyCacher.STRATEGY_SQLITE3 : 'sqlite3');
		}
		strategies.push(numeric === true ? TinyCacher.STRATEGY_FILE : 'file');
		return strategies;
	}
	
	/**
	* Checks if a given strategy is supported or not.
	*
	* @param Number|String The identifier of the strategy that will be checked.
	*
	* @return Boolean If the given strategy is supported will be returned "true", otherwise "false".
	*/
	static isSupportedStrategy(strategy){
		if ( typeof(strategy) === 'string' ){
			strategy = strategy.toLowerCase();
			return TinyCacher.getSupportedStrategies(false).indexOf(strategy) >= 0 ? true : false;
		}
		if ( strategy === null || isNaN(strategy) === true ){
			return false;
		}
		strategy = Math.floor(strategy);
		return TinyCacher.getSupportedStrategies(true).indexOf(strategy) >= 0 ? true : false;
	}
	
	/**
	* Starts the garbage collector used to remove all expired cache entries according to the TTL, note that this will clean only the global storage (the one shared and available across all class instances).
	*
	* @return Boolean If the garbage collector has been started successfully will be returned "true", otherwise, if seems that it has already been started, will be returned "false".
	*/
	static startGlobalGarbageCollector(){
		if ( garbageCollectorInterval === null ){
			garbageCollectorInterval = setInterval(TinyCacher.runGlobalGarbageCollector, 1000);
			TinyCacher.runGlobalGarbageCollector();
			return true;
		}
		return false;
	}
	
	/**
	* Stops the garbage collector.
	*
	* @return Boolean If the garbage collector appears to be not running will be returned "false", otherwise "true".
	*/
	static stopGlobalGarbageCollector(){
		if ( typeof(garbageCollectorInterval) === 'object' && garbageCollectorInterval !== null ){
			clearInterval(garbageCollectorInterval);
			return true;
		}
		return false;
	}
	
	/**
	* Removes all the expired cache entries, accoring with their TTL, note that it will affect only entries contained in the global storage that is shared and available across all class instances.
	*/
	static runGlobalGarbageCollector(){
		let now = new Date();
		for ( let namespace in staticStorage ){
			for ( let key in staticStorage[namespace] ){
				if ( typeof(staticStorage[namespace][key].expire) === 'object' && staticStorage[namespace][key].expire !== null && staticStorage[namespace][key].expire instanceof Date && staticStorage[namespace][key].expire < now ){
					delete staticStorage[namespace][key];
				}
			}
		}
	}
	
	/**
	* Class constructor.
	*
	* @param Number|String strategy A string containing the name of the strategy to use, alternatively, an integer number representing the strategy, in this case, you can use one of the predefined constants.
	*/
	constructor(strategy){
		this.setStrategy(strategy);
		this.ready = true;
	}
	
	/**
	* Sets the caching strategy, this method is chainable.
	*
	* @param Number|String strategy A string containing the name of the strategy to use, alternatively, an integer number representing the strategy, in this case, you can use one of the predefined constants.
	*/
	setStrategy(strategy){
		switch ( typeof(strategy) === 'string' ? strategy.toLowerCase() : strategy ){
			case TinyCacher.STRATEGY_SHARED:
			case 'shared':{
				strategy = TinyCacher.STRATEGY_SHARED;
			}break;
			case TinyCacher.STRATEGY_REDIS:
			case 'redis':{
				strategy = TinyCacher.STRATEGY_REDIS;
			}break;
			case TinyCacher.STRATEGY_MEMCACHED:
			case 'memcached':{
				strategy = TinyCacher.STRATEGY_MEMCACHED;
			}break;
			case TinyCacher.STRATEGY_SQLITE3:
			case 'sqlite':
			case 'sqlite3':{
				strategy = TinyCacher.STRATEGY_SQLITE3;
			}break;
			case TinyCacher.STRATEGY_FILE:
			case 'file':{
				strategy = TinyCacher.STRATEGY_FILE;
			}break;
			default:{
				strategy = TinyCacher.STRATEGY_INTERNAL;
			}break;
		}
		this.strategy = strategy;
		return this;
	}
	
	/**
	* Returns the caching strategy.
	*
	* @return Number An integer number representing the strategy.
	*/
	getStrategy(){
		return typeof(this.strategy) === 'number' && this.strategy !== 3 && this.strategy > 0 && this.strategy <= 7 ? this.strategy : 1;
	}
	
	/**
	* Returns the name of the caching strategy.
	*
	* @return String A string containing the name of the caching strategy.
	*/
	getStrategyName(){
		switch ( typeof(this.strategy) === 'number' ? this.strategy : null ){
			case TinyCacher.STRATEGY_SHARED:{
				return 'shared';
			}break;
			case TinyCacher.STRATEGY_REDIS:{
				return 'redis';
			}break;
			case TinyCacher.STRATEGY_MEMCACHED:{
				return 'memcached';
			}break;
			case TinyCacher.STRATEGY_SQLITE3:{
				return 'sqlite3';
			}break;
			case TinyCacher.STRATEGY_FILE:{
				return 'file';
			}break;
			default:{
				return 'local';
			}break;
		}
	}
	
	/**
	* Sets an additional string that will be prepend to each key, this method is chainable.
	*
	* @param String namespace A string containing the namespace, if another kind of variable or if an empty string is given, no namespace is set.
	*/
	setNamespace(namespace){
		namespace = typeof(namespace) === 'string' && namespace !== '' ? namespace : '';
		if ( typeof(this.namespace) === 'undefined' || namespace !== this.namespace ){
			this.namaspaceHash = namespace === '' ? '*' : crypto.createHash('md5').update(namespace).digest('hex');
			this.namespace = namespace;
		}
		return this;
	}
	
	/**
	* Returns the additional string that will be prepend to each key.
	*
	* @return String A string containing the namespace or an empty string if no namespace is going to be used.
	*/
	getNamespace(){
		return typeof(this.namespace) === 'string' ? this.namespace : '';
	}
	
	/**
	* Sets the default TTL (Time To Live) for the enries, this method is chainable.
	*
	* @param Number ttl An optional integer number greater than zero representing the ammount of seconds until the elements will expire, if set to zero or an invalid value, no TTL will be used by default.
	*/
	setDefaultTTL(ttl){
		if ( ttl === null || isNaN(ttl) === true ){
			this.defaultTTL = 0;
			return this;
		}
		ttl = Math.floor(ttl);
		this.defaultTTL = ttl <= 0 ? 0 : ttl;
		return this;
	}
	
	/**
	* Returns the default TTL (Time To Live) for the enries.
	*
	* @return Number An integer number representing the default TTL, if not TTL has been defined, 0 will be returned.
	*/
	getDefaultTTL(){
		if ( typeof(this.defaultTTL) === 'undefined' ){
			return 0;
		}
		let defaultTTL = this.defaultTTL;
		if ( defaultTTL === null || isNaN(defaultTTL) === true ){
			return 0;
		}
		let ttl = Math.floor(defaultTTL);
		return ttl <= 0 ? 0 : ttl;
	}
	
	/**
	* Sets if exceptions should be displayed in console or not, this can be very useful in debug, this method is chainable.
	*
	* @param Boolean verbose If set to "true", exceptions and error messages will be displayed in console, otherwise not.
	*/
	setVerbose(verbose){
		this.verbose = verbose === true ? true : false;
		return this;
	}
	
	/**
	* Returns if exceptions should be displayed in console or not.
	*
	* @return Boolean If exceptions and messages are going to be displayed in console, will be returned "true", otherwise "false".
	*/
	getVerbose(){
		return typeof(this.verbose) !== 'undefined' && this.verbose === true ? true : false;
	}
	
	/**
	* Initializes the object that contains the cache or the connection with the external storage engine (such as Redis, Memcached or an SQLite3 database file), this method is used internally by the class and is chainable.
	*
	* @throws exception If no connection with Redis has been found.
	* @throws exception If no connection with Memcached has been found.
	* @throws exception If no connection with the SQLite3 database has been found.
	* @throws exception If no storage path has been defined.
	*/
	init(){
		switch ( this.getStrategy() ){
			case TinyCacher.STRATEGY_SHARED:{
				if ( typeof(staticStorage) !== 'object' || staticStorage === null ){
					staticStorage = {};
				}
			}break;
			case TinyCacher.STRATEGY_REDIS:{
				if ( this.redisConnected() === false ){
					throw 'Redis is not connected.';
				}
			}break;
			case TinyCacher.STRATEGY_MEMCACHED:{
				if ( this.memcachedConnected() === false ){
					throw 'Memcached is not connected.';
				}
			}break;
			case TinyCacher.STRATEGY_SQLITE3:{
				if ( this.SQLite3Connected() === false ){
					throw 'SQLite3 is not connected.';
				}
			}break;
			case TinyCacher.STRATEGY_FILE:{
				if ( typeof(this.storagePath) !== 'string' || this.storagePath === '' ){
					throw 'No storage path defined.';
				}
			}break;
			default:{
				if ( typeof(this.storage) !== 'object' || this.storage === null ){
					this.storage = {};
				}
			}break;
		}
		return this;
	}
	
	/**
	* Starts the garbage collector used to remove all expired cache entries according to the TTL, note that this will clean only the local storage (the one contained in the class instance).
	*
	* @return Boolean If the garbage collector has been started successfully will be returned "true", otherwise, if seems that it has already been started, will be returned "false".
	*/
	startGarbageCollector(){
		if ( typeof(this.garbageCollectorInterval) === 'undefined' || this.garbageCollectorInterval === null ){
			this.garbageCollectorInterval = setInterval(function(){
				this.runGarbageCollector();
			}.bind(this), 1000);
			this.runGarbageCollector();
			return true;
		}
		return false;
	}
	
	/**
	* Stops the garbage collector.
	*
	* @return Boolean If the garbage collector appears to be not running will be returned "false", otherwise "true".
	*/
	stopGlobalGarbageCollector(){
		if ( typeof(this.garbageCollectorInterval) !== 'undefined' && garbageCollectorInterval !== null ){
			clearInterval(this.garbageCollectorInterval);
			return true;
		}
		return false;
	}
	
	/**
	* Removes all the expired cache entries, accoring with their TTL, note that it will affect only entries contained in the local storage of this class instance, this method is chainable.
	*/
	runGarbageCollector(){
		let now = new Date();
		for ( let namespace in this.storage ){
			for ( let key in this.storage[namespace] ){
				if ( typeof(this.storage[namespace][key].expire) === 'object' && this.storage[namespace][key].expire !== null && this.storage[namespace][key].expire instanceof Date && this.storage[namespace][key].expire < now ){
					delete this.storage[namespace][key];
				}
			}
		}
		return this;
	}
	
	/**
	* Removes all the expired cache entries, accoring with their TTL, from the SQLite database that has been set within the class instance as storage for cache, this method is asynchronous with Promise support.
	*
	* @throws exception If an error occurs during database initialisation.
	* @throws exception If an error occurs during the transaction with SQLite3.
	*/
	runSQLite3GarbageCollector(){
		return new Promise(function(resolve, reject){
			let verbose = this.getVerbose();
			try{
				this.init();
			}catch(ex){
				if ( verbose === true ){
					console.log(ex);
				}
				return reject('An error occurred while initialising the storage.');
			}
			try{
				this.sqliteConnection.run('DELETE FROM cache_storage WHERE expire < DATETIME("now");', null, (error) => {
					if ( error !== null ){
						if ( verbose === true ){
							console.log(error);
						}
						return reject('An error occurred during the transaction with SQLite3.');
					}
					return resolve();
				});
			}catch(ex){
				if ( verbose === true ){
					console.log(ex);
				}
				return reject('An error occurred while initialising the storage.');
			}
		}.bind(this));
	}
	
	/**
	* Creates a key that can be used as the element's identifier in database archiviation, preventing problems due to namespace or key length or encoding, this method is used internally by the class.
	*
	* @param String key A string containing the key of the element.
	*
	* @return Object An object containing the hashed namespace and key (using the MD5 algorithm) and the key that can be used to store the element within the database.
	*/
	createKey(key){
		if ( typeof(this.namaspaceHash) !== 'string' || this.namaspaceHash === '' ){
			let namespace = this.getNamespace();
			this.namaspaceHash = namespace === '' ? '*' : crypto.createHash('md5').update(namespace).digest('hex');
		}
		key = {
			namespace: this.namaspaceHash,
			key: typeof(key) === 'string' && key !== '' ? crypto.createHash('md5').update(key).digest('hex') : null
		};
		key.merged = key.key !== null ? ( 'tiny-cacher:' + key.namespace + ':' + key.key ) : null;
		return key;
	}
	
	/**
	* Stores a value with a given key, this method is asynchronous with Promise support.
	*
	* @param String key A string representin the identifier of the value that will be stored.
	* @param Mixed value The value that will be stored, when using Redis or Memcached, the value is converted into a string.
	* @param Boolean overwrite If set to "true" and if the value already exists, it will be overwritten, otherwise an exception will be thrown.
	* @param Number ttl An optional integer number greater than zero representing the ammount of seconds until the element will expire, if not set, default TTL will be used, if no default TTL were found, element has no expire date.
	*
	* @throws exception If an invalid key were given.
	* @throws exception If an error occurs during storage initialisation.
	* @throws exception If the key already exists and if is not going to be overwritten.
	* @throws exception If an error occurs in Redis transaction, for more information enable verbose mode.
	* @throws exception If an error occurs while serializing the given value as JSON string.
	* @throws exception If an error occurs in Memcached transaction, for more information enable verbose mode.
	* @throws exception If an error occurs in transaction with the SQLite3 database, for more information enable verbose mode.
	* @throws exception If an error occurs while checking for the storage directory existence.
	* @throws exception If an error occurs while creating the storage directory.
	* @throws exception If an error occurrs while writing the cache file.
	*/
	push(key, value, overwrite, ttl){
		return new Promise(function(resolve, reject){
			if ( typeof(key) !== 'string' || key === '' ){
				return reject('Invalid key.');
			}
			let currentDate = new Date();
			ttl = ttl !== null && isNaN(ttl) === false ? Math.floor(ttl) : this.getDefaultTTL();
			let expire = new Date();
			if ( ttl <= 0 ){
				ttl = null;
			}else{
				expire.setSeconds(expire.getSeconds() + ttl);
			}
			key = this.createKey(key);
			let verbose = this.getVerbose();
			try{
				this.init();
			}catch(ex){
				if ( verbose === true ){
					console.log(ex);
				}
				return reject('An error occurred while initialising the storage.');
			}
			switch ( this.getStrategy() ){
				case TinyCacher.STRATEGY_SHARED:{
					if ( typeof(staticStorage[key.namespace]) !== 'object' || staticStorage[key.namespace] === null ){
						staticStorage[key.namespace] = {};
					}else{
						if ( overwrite !== true && typeof(staticStorage[key.namespace][key.key]) !== 'undefined' ){
							if ( typeof(staticStorage[key.namespace][key.key].expire) !== 'object' || !staticStorage[key.namespace][key.key].expire instanceof Date || staticStorage[key.namespace][key.key].expire >= currentDate ){
								return reject('This key already exists.');
							}
						}
					}
					staticStorage[key.namespace][key.key] = {
						value: value,
						expire: ttl === null ? null : expire
					};
					return resolve();
				}break;
				case TinyCacher.STRATEGY_REDIS:{
					try{
						value = JSON.stringify(value);
					}catch(ex){
						if ( verbose === true ){
							console.log(ex);
						}
						return reject('Unable to serialise the given value as JSON string.');
					}
					if ( overwrite === true ){
						this.redisConnection.set(key.merged, value, (error) => {
							if ( error !== null ){
								if ( verbose === true ){
									console.log(error);
								}
								return reject('An error occurred in Redis transaction.');
							}
							if ( ttl === null ){
								return resolve();
							}
							this.redisConnection.expire(key.merged, ttl, (error) => {
								if ( error !== null ){
									if ( verbose === true ){
										console.log(error);
									}
									return reject('An error occurred in Redis transaction.');
								}
								return resolve();
							});
						});
					}else{
						this.redisConnection.exists(key.merged, function(error, result){
							if ( error !== null ){
								if ( verbose === true ){
									console.log(error);
								}
								return reject('An error occurred in Redis transaction.');
							}
							if ( result !== 0 ){
								return reject('This key already exists.');
							}
							this.redisConnection.set(key.merged, value, (error) => {
								if ( error !== null ){
									if ( verbose === true ){
										console.log(error);
									}
									return reject('An error occurred in Redis transaction.');
								}
								if ( ttl === null ){
									return resolve();
								}
								this.redisConnection.expire(key.merged, ttl, (error) => {
									if ( error !== null ){
										if ( verbose === true ){
											console.log(error);
										}
										return reject('An error occurred in Redis transaction.');
									}
									return resolve();
								});
							});
						}.bind(this));
					}
				}break;
				case TinyCacher.STRATEGY_MEMCACHED:{
					if ( overwrite === true ){
						this.memcachedConnection.set(key.merged, value, ttl, (error) => {
							if ( typeof(error) !== 'undefined' && error !== null ){
								if ( verbose === true ){
									console.log(error);
								}
								return reject('An error occurred in Memcached transaction.');
							}
							return resolve();
						});
					}else{
						this.memcachedConnection.get(key.merged, function(error, result){
							if ( typeof(error) !== 'undefined' && error !== null ){
								if ( verbose === true ){
									console.log(error);
								}
								return reject('An error occurred in Memcached transaction.');
							}
							if ( typeof(result) !== 'undefined' ){
								return reject('This key already exists.');
							}
							this.memcachedConnection.set(key.merged, value, ttl, (error) => {
								if ( typeof(error) !== 'undefined' && error !== null ){
									if ( verbose === true ){
										console.log(error);
									}
									return reject('An error occurred in Memcached transaction.');
								}
								return resolve();
							});
						}.bind(this));
					}
				}break;
				case TinyCacher.STRATEGY_SQLITE3:{
					let numeric = typeof(value) === 'number' ? 1 : 0;
					try{
						value = JSON.stringify(value);
					}catch(ex){
						if ( verbose === true ){
							console.log(ex);
						}
						return reject('Unable to serialise the given value as JSON string.');
					}
					let query = ( overwrite === true ? 'INSERT OR REPLACE ' : 'INSERT ' ) + 'INTO cache_storage (namespace, key, value, numeric, date, expire) VALUES (?, ?, ?, ?, DATETIME("now"), ?);';
					this.sqliteConnection.run(query, [key.namespace, key.key, value, numeric, ( ttl === null ? null : expire.toISOString().slice(0, 19).replace('T', ' ') )], (error) => {
						if ( error !== null ){
							if ( typeof(error.code) === 'string' && error.code === 'SQLITE_CONSTRAINT' ){
								return reject('This key already exists.');
							}
							if ( verbose === true ){
								console.log(error);
							}
							return reject('An error occurred during the transaction with SQLite3.');
						}
						return resolve();
					});
				}break;
				case TinyCacher.STRATEGY_FILE:{
					try{
						value = JSON.stringify(value);
					}catch(ex){
						if ( verbose === true ){
							console.log(ex);
						}
						return reject('Unable to serialise the given value as JSON string.');
					}
					let path = this.storagePath + '/' + key.namespace;
					let exists = false;
					try{
						exists = filesystem.existsSync(path) === true ? true : false;
					}catch(ex){
						if ( verbose === true ){
							console.log(ex);
						}
						return reject('Unable to check for the storage directory existence.');
					}
					if ( exists === false ){
						try{
							filesystem.mkdirSync(path);
						}catch(ex){
							if ( verbose === true ){
								console.log(ex);
							}
							return reject('An error occurred while creating the storage directory.');
						}
					}
					path += '/' + key.key + '.cache';
					if ( overwrite !== true && filesystem.existsSync(path) === true ){
						return reject('This key already exists.');
					}
					filesystem.writeFile(path, value, (error) => {
						if ( error !== null ){
							if ( verbose === true ){
								console.log(error);
							}
							return reject('An error occurred while writing the file.');
						}
						return resolve();
					});
				}break;
				default:{
					if ( typeof(this.storage[key.namespace]) !== 'object' || this.storage[key.namespace] === null ){
						this.storage[key.namespace] = {};
					}else{
						if ( overwrite !== true && typeof(this.storage[key.namespace][key.key]) !== 'undefined' ){
							if ( typeof(this.storage[key.namespace][key.key].expire) !== 'object' || !this.storage[key.namespace][key.key].expire instanceof Date || this.storage[key.namespace][key.key].expire >= currentDate ){
								return reject('This key already exists.');
							}
						}
					}
					this.storage[key.namespace][key.key] = {
						value: value,
						expire: ttl === null ? null : expire
					};
					return resolve();
				}break;
			}
		}.bind(this));
	}
	
	/**
	* Stores a value with a given key, this method is an alias of the "push" method.
	*
	* @param String key A string representin the identifier of the value that will be stored.
	* @param Mixed value The value that will be stored, when using Redis, the value is converted into a string.
	* @param Boolean overwrite If set to "true" and if the value already exists, it will be overwritten, otherwise an exception will be thrown.
	* @param Number ttl An optional integer number greater than zero representing the ammount of seconds until the element will expire, if not set, default TTL will be used, if no default TTL were found, element has no expire date.
	*
	* @throws exception If an invalid key were given.
	* @throws exception If an error occurs during storage initialisation.
	* @throws exception If the key already exists and if is not going to be overwritten.
	* @throws exception If an error occurs in Redis transaction, for more information enable verbose mode.
	* @throws exception If an error occurs while serializing the given value as JSON string.
	* @throws exception If an error occurs in Memcached transaction, for more information enable verbose mode.
	* @throws exception If an error occurs in transaction with the SQLite3 database, for more information enable verbose mode.
	* @throws exception If an error occurs while checking for the storage directory existence.
	* @throws exception If an error occurs while creating the storage directory.
	* @throws exception If an error occurrs while writing the cache file.
	*/
	set(key, value, overwrite, ttl){
		return this.push(key, value, overwrite, ttl);
	}
	
	/**
	* Stores multiple elements within the cache, this method is asynchronous with Promise support.
	*
	* @param Object elements An object containing the elements that will be stored as key/value pairs.
	* @param Boolean overwrite If set to "true" and if the value already exists, it will be overwritten, otherwise an exception will be thrown.
	* @param Number ttl An optional integer number greater than zero representing the ammount of seconds until the element will expire, if not set, default TTL will be used, if no default TTL were found, element has no expire date.
	*
	* @throws exception If an invalid object is provided.
	* @throws exception If an invalid key within the object were given.
	* @throws exception If an error occurs during storage initialisation.
	* @throws exception If the key already exists and if is not going to be overwritten.
	* @throws exception If an error occurs in Redis transaction, for more information enable verbose mode.
	* @throws exception If an error occurs while serializing the given value as JSON string.
	* @throws exception If an error occurs in Memcached transaction, for more information enable verbose mode.
	* @throws exception If an error occurs in transaction with the SQLite3 database, for more information enable verbose mode.
	* @throws exception If an error occurs while checking for the storage directory existence.
	* @throws exception If an error occurs while creating the storage directory.
	* @throws exception If an error occurrs while writing the cache file.
	*/
	pushMulti(elements, overwrite, ttl){
		return new Promise(function(resolve, reject){
			if ( typeof(elements) !== 'object' || elements === null ){
				return reject('Invalid elements.');
			}
			let empty = true;
			for ( let key in elements ){
				if ( typeof(key) !== 'string' || key === '' ){
					return reject('Invalid key found.');
				}
				empty = false;
			}
			if ( empty === true ){
				return resolve();
			}
			let requests = new Array();
			for ( let key in elements ){
				requests.push(this.push(key, elements[key], overwrite, ttl));
			}
			Promise.all(requests).then(() => {
				return resolve();
			}).catch((ex) => {
				return reject(ex);
			});
		}.bind(this));
	}
	
	/**
	* Stores multiple elements within the cache, this method is an alias of the "pushMulti" method.
	*
	* @param Object elements An object containing the elements that will be stored as key/value pairs.
	* @param Boolean overwrite If set to "true" and if the value already exists, it will be overwritten, otherwise an exception will be thrown.
	* @param Number ttl An optional integer number greater than zero representing the ammount of seconds until the element will expire, if not set, default TTL will be used, if no default TTL were found, element has no expire date.
	*
	* @throws exception If an invalid object is provided.
	* @throws exception If an invalid key within the object were given.
	* @throws exception If an error occurs during storage initialisation.
	* @throws exception If the key already exists and if is not going to be overwritten.
	* @throws exception If an error occurs in Redis transaction, for more information enable verbose mode.
	* @throws exception If an error occurs while serializing the given value as JSON string.
	* @throws exception If an error occurs in Memcached transaction, for more information enable verbose mode.
	* @throws exception If an error occurs in transaction with the SQLite3 database, for more information enable verbose mode.
	* @throws exception If an error occurs while checking for the storage directory existence.
	* @throws exception If an error occurs while creating the storage directory.
	* @throws exception If an error occurrs while writing the cache file.
	*/
	setMulti(elements, overwrite, ttl){
		return this.pushMulti(elements, overwrite, ttl);
	}
	
	/**
	* Returns a value that has been stored within the cache, this method is asynchronous with Promise support.
	*
	* @param String key A string representin the identifier of the value that has been stored.
	* @param Boolean quiet If set to "true" and if the element were not found, will be returned "null" instead of throw an exception, otherwise an exception will be thrown.
	*
	* @return Mixed The value that has been stored.
	*
	* @throws exception If an invalid key were given.
	* @throws exception If an error occurs during storage initialisation.
	* @throws exception If no value with the given identifier were found.
	* @throws exception If the element found has expired.
	* @throws exception If the element is not stored properly and some information are missing.
	* @throws exception If an error occurs in Redis transaction, for more information enable verbose mode.
	* @throws exception If an error occurs in Memcached transaction, for more information enable verbose mode.
	* @throws exception If an error occurs in transaction with the SQLite3 database, for more information enable verbose mode.
	* @throws exception If an error occurs while parsing the JSON representation of the serialised value.
	* @throws exception If an error occurs while checking for the file existence.
	* @throws exception If an error occurs while reading the file content.
	*/
	pull(key, quiet){
		return new Promise(function(resolve, reject){
			if ( typeof(key) !== 'string' || key === '' ){
				return reject('Key cannot be an empty string.');
			}
			let currentDate = new Date();
			key = this.createKey(key);
			let verbose = this.getVerbose();
			try{
				this.init();
			}catch(ex){
				if ( verbose === true ){
					console.log(ex);
				}
				return reject('An error occurred while initialising the storage.');
			}
			switch ( this.getStrategy() ){
				case TinyCacher.STRATEGY_SHARED:{
					if ( typeof(staticStorage[key.namespace][key.key]) === 'object' && staticStorage[key.namespace][key.key] !== null && typeof(staticStorage[key.namespace][key.key].value) !== 'undefined' ){
						if ( typeof(staticStorage[key.namespace][key.key].expire) === 'undefined' || ( !staticStorage[key.namespace][key.key].expire instanceof Date && staticStorage[key.namespace][key.key].expire !== null ) ){
							if ( staticStorage[key.namespace][key.key].expire !== null && staticStorage[key.namespace][key.key].expire < currentDate ){
								delete staticStorage[key.namespace][key.key];
								return quiet === true ? resolve(null) : reject('Element has expired.');
							}
							return quiet === true ? resolve(null) : reject('Malformed element.');
						}
						return resolve(staticStorage[key.namespace][key.key].value);
					}
					return quiet === true ? resolve(null) : reject('No such element found.');
				}break;
				case TinyCacher.STRATEGY_REDIS:{
					this.redisConnection.get(key.merged, (error, value) => {
						if ( error !== null ){
							if ( verbose === true ){
								console.log(error);
							}
							return reject('An error occurred in Redis transaction.');
						}
						if ( typeof(value) !== 'undefined' && value !== null ){
							try{
								return resolve(JSON.parse(value));
							}catch(ex){
								if ( verbose === true ){
									console.log(ex);
								}
								return reject('An error occurred while parsing the serialised data.');
							}
						}
						return quiet === true ? resolve(null) : reject('No such element found.');
					});
				}break;
				case TinyCacher.STRATEGY_MEMCACHED:{
					this.memcachedConnection.get(key.merged, (error, value) => {
						if ( typeof(error) !== 'undefined' && error !== null ){
							if ( verbose === true ){
								console.log(error);
							}
							return reject('An error occurred in Memcached transaction.');
						}
						if ( typeof(value) === 'undefined' ){
							return quiet === true ? resolve(null) : reject('No such element found.');
						}
						return resolve(value);
					});
				}break;
				case TinyCacher.STRATEGY_SQLITE3:{
					this.sqliteConnection.get('SELECT value FROM cache_storage WHERE namespace = ? AND key = ? AND ( expire = NULL OR expire >= DATETIME("now") ) LIMIT 1;', [key.namespace, key.key], (error, element) => {
						if ( error !== null ){
							if ( verbose === true ){
								console.log(error);
							}
							return reject('An error occurred during the transaction with SQLite3.');
						}
						if ( typeof(element) === 'undefined' ){
							return quiet === true ? resolve(null) : reject('No such element found.');
						}
						try{
							return resolve(JSON.parse(element.value));
						}catch(ex){
							if ( verbose === true ){
								console.log(ex);
							}
							return reject('An error occurred while parsing the serialised data.');
						}
					});
				}break;
				case TinyCacher.STRATEGY_FILE:{
					let path = this.storagePath + '/' + key.namespace + '/' + key.key + '.cache';
					let exists = false;
					try{
						exists = filesystem.existsSync(path) === true ? true : false;
					}catch(ex){
						if ( verbose === true ){
							console.log(ex);
						}
						return reject('Unable to check for the file existence.');
					}
					if ( exists === false ){
						return quiet === true ? resolve(null) : reject('No such element found.');
					}
					let data = null;
					try{
						data = filesystem.readFileSync(path, 'utf8');
					}catch(ex){
						if ( verbose === true ){
							console.log(ex);
						}
						return reject('An error occurred while reading the file content.');
					}
					try{
						return resolve(JSON.parse(data.toString()));
					}catch(ex){
						if ( verbose === true ){
							console.log(ex);
						}
						return reject('An error occurred while parsing the serialised data.');
					}
				}break;
				default:{
					if ( typeof(this.storage[key.namespace][key.key]) === 'object' && this.storage[key.namespace][key.key] !== null && typeof(this.storage[key.namespace][key.key].value) !== 'undefined' ){
						if ( typeof(this.storage[key.namespace][key.key].expire) === 'undefined' || ( !this.storage[key.namespace][key.key].expire instanceof Date && this.storage[key.namespace][key.key].expire !== null ) ){
							if ( this.storage[key.namespace][key.key].expire !== null && this.storage[key.namespace][key.key].expire < currentDate ){
								delete this.storage[key.namespace][key.key];
								return quiet === true ? resolve(null) : reject('Element has expired.');
							}
							return quiet === true ? resolve(null) : reject('Malformed element.');
						}
						return resolve(this.storage[key.namespace][key.key].value);
					}
					return quiet === true ? resolve(null) : reject('No such element found.');
				}break;
			}
		}.bind(this));
	}
	
	/**
	* Returns a value that has been stored within the cache, this method is an alias of the "pull" method.
	*
	* @param String key A string representin the identifier of the value that has been stored.
	* @param Boolean quiet If set to "true" and if the element were not found, will be returned "null" instead of throw an exception, otherwise an exception will be thrown.
	*
	* @return Mixed The value that has been stored.
	*
	* @throws exception If an invalid key were given.
	* @throws exception If an error occurs during storage initialisation.
	* @throws exception If no value with the given identifier were found.
	* @throws exception If the element found has expired.
	* @throws exception If the element is not stored properly and some information are missing.
	* @throws exception If an error occurs in Redis transaction, for more information enable verbose mode.
	* @throws exception If an error occurs in Memcached transaction, for more information enable verbose mode.
	* @throws exception If an error occurs in transaction with the SQLite3 database, for more information enable verbose mode.
	* @throws exception If an error occurs while parsing the JSON representation of the serialised value.
	* @throws exception If an error occurs while checking for the file existence.
	* @throws exception If an error occurs while reading the file content.
	*/
	get(key, quiet){
		return this.pull(key, quiet);
	}
	
	/**
	* Returns multiple values that have been stored within the cache, this method is asynchronous with Promise support.
	*
	* @param Array keys A sequential array of strings containing the keys of the elements that will be returned.
	* @param Boolean quiet If set to "true" and if the element were not found, will be returned "null" instead of throw an exception, otherwise an exception will be thrown.
	* @param Boolean omitNotFound If set to "true", all elements not found will not be included in the returned object, otherwise they will be included with "null" as value, note that this option takes sense in quiet mode only.
	*
	* @return Object An object containing as key the entry key and as value its value or "null" if the element was not found.
	*
	* @throws exception If an invalid array were given.
	* @throws exception If an invalid key within the array were given.
	* @throws exception If an error occurs during storage initialisation.
	* @throws exception If no value with the given identifier were found.
	* @throws exception If the element found has expired.
	* @throws exception If the element is not stored properly and some information are missing.
	* @throws exception If an error occurs in Redis transaction, for more information enable verbose mode.
	* @throws exception If an error occurs in Memcached transaction, for more information enable verbose mode.
	* @throws exception If an error occurs in transaction with the SQLite3 database, for more information enable verbose mode.
	* @throws exception If an error occurs while parsing the JSON representation of the serialised value.
	* @throws exception If an error occurs while checking for the file existence.
	* @throws exception If an error occurs while reading the file content.
	*/
	pullMulti(keys, quiet, omitNotFound){
		return new Promise(function(resolve, reject){
			if ( Array.isArray(keys) === false ){
				return reject('Invalid keys.');
			}
			if ( keys.length === 0 ){
				return resolve({});
			}
			for ( let i = 0 ; i < keys.length ; i++ ){
				if ( typeof(keys[i]) !== 'string' || keys[i] === '' ){
					return reject('Invalid key found.');
				}
			}
			let requests = new Array();
			for ( let i = 0 ; i < keys.length ; i++ ){
				requests.push(this.pull(keys[i], quiet));
			}
			Promise.all(requests).then((elements) => {
				let data = {};
				if ( omitNotFound === true ){
					for ( let i = 0 ; i < keys.length ; i++ ){
						if ( elements[i] !== null ){
							data[keys[i]] = elements[i];
						}
					}
					return resolve(data);
				}
				for ( let i = 0 ; i < keys.length ; i++ ){
					data[keys[i]] = elements[i];
				}
				return resolve(data);
			}).catch((ex) => {
				return reject(ex);
			});
		}.bind(this));
	}
	
	/**
	* Returns multiple values that have been stored within the cache, this method is an alias of the "pullMulti" method.
	*
	* @param Array keys A sequential array of strings containing the keys of the elements that will be returned.
	* @param Boolean quiet If set to "true" and if the element were not found, will be returned "null" instead of throw an exception, otherwise an exception will be thrown.
	* @param Boolean omitNotFound If set to "true", all elements not found will not be included in the returned object, otherwise they will be included with "null" as value, note that this option takes sense in quiet mode only.
	*
	* @return Object An object containing as key the entry key and as value its value or "null" if the element was not found.
	*
	* @throws exception If an array were given.
	* @throws exception If an invalid key within the array were given.
	* @throws exception If an error occurs during storage initialisation.
	* @throws exception If no value with the given identifier were found.
	* @throws exception If the element found has expired.
	* @throws exception If the element is not stored properly and some information are missing.
	* @throws exception If an error occurs in Redis transaction, for more information enable verbose mode.
	* @throws exception If an error occurs in Memcached transaction, for more information enable verbose mode.
	* @throws exception If an error occurs in transaction with the SQLite3 database, for more information enable verbose mode.
	* @throws exception If an error occurs while parsing the JSON representation of the serialised value.
	* @throws exception If an error occurs while checking for the file existence.
	* @throws exception If an error occurs while reading the file content.
	*/
	getMulti(keys, quiet, omitNotFound){
		return this.pullMulti(keys, quiet, omitNotFound);
	}
	
	/**
	* Checks if exists an element with the given identifier within the cache, this method is asynchronous with Promise support.
	*
	* @param String key A string representin the identifier of the value that will be looked for.
	*
	* @return Boolean If the element is found will be returned "true", otherwise "false".
	*
	* @throws exception If an invalid key were given.
	* @throws exception If an error occurs during storage initialisation.
	* @throws exception If an error occurs in Redis transaction, for more information enable verbose mode.
	* @throws exception If an error occurs in Memcached transaction, for more information enable verbose mode.
	* @throws exception If an error occurs in transaction with the SQLite3 database, for more information enable verbose mode.
	* @throws exception If an error occurs while checking for the file existence.
	*/
	has(key){
		return new Promise(function(resolve, reject){
			if ( typeof(key) !== 'string' || key === '' ){
				return reject('Key cannot be an empty string.');
			}
			key = this.createKey(key);
			let verbose = this.getVerbose();
			try{
				this.init();
			}catch(ex){
				if ( verbose === true ){
					console.log(ex);
				}
				return reject('An error occurred while initialising the storage.');
			}
			switch ( this.getStrategy() ){
				case TinyCacher.STRATEGY_SHARED:{
					if ( typeof(staticStorage[key.namespace][key.key]) === 'object' && staticStorage[key.namespace][key.key] !== null && typeof(staticStorage[key.namespace][key.key].value) !== 'undefined' ){
						if ( typeof(staticStorage[key.namespace][key.key].expire) === 'undefined' || ( !staticStorage[key.namespace][key.key].expire instanceof Date && staticStorage[key.namespace][key.key].expire !== null ) ){
							if ( staticStorage[key.namespace][key.key].expire !== null && staticStorage[key.namespace][key.key].expire < currentDate ){
								delete staticStorage[key.namespace][key.key];
								return resolve(false);
							}
							return resolve(false);
						}
						return resolve(true);
					}
					return resolve(false);
				}break;
				case TinyCacher.STRATEGY_REDIS:{
					this.redisConnection.exists(key.merged, (error, value) => {
						if ( error !== null ){
							if ( verbose === true ){
								console.log(error);
							}
							return reject('An error occurred in Redis transaction.');
						}
						return resolve(value === 0 ? false : true);
					});
				}break;
				case TinyCacher.STRATEGY_MEMCACHED:{
					this.memcachedConnection.get(key.merged, (error, value) => {
						if ( typeof(error) !== 'undefined' && error !== null ){
							if ( verbose === true ){
								console.log(error);
							}
							return reject('An error occurred in Memcached transaction.');
						}
						return resolve(typeof(value) === 'undefined' ? false : true);
					});
				}break;
				case TinyCacher.STRATEGY_SQLITE3:{
					this.sqliteConnection.get('SELECT date FROM cache_storage WHERE namespace = ? AND key = ? AND ( expire = NULL OR expire >= DATETIME("now") ) LIMIT 1;', [key.namespace, key.key], (error, element) => {
						if ( error !== null ){
							if ( verbose === true ){
								console.log(error);
							}
							return reject('An error occurred during the transaction with SQLite3.');
						}
						return resolve(typeof(element) === 'undefined' ? false : true);
					});
				}break;
				case TinyCacher.STRATEGY_FILE:{
					let path = this.storagePath + '/' + key.namespace + '/' + key.key + '.cache';
					let exists = false;
					try{
						exists = filesystem.existsSync(path) === true ? true : false;
					}catch(ex){
						if ( verbose === true ){
							console.log(ex);
						}
						return reject('Unable to check for the file existence.');
					}
					return resolve(exists);
				}break;
				default:{
					if ( typeof(this.storage[key.namespace][key.key]) === 'object' && this.storage[key.namespace][key.key] !== null && typeof(this.storage[key.namespace][key.key].value) !== 'undefined' ){
						if ( typeof(this.storage[key.namespace][key.key].expire) === 'undefined' || ( !this.storage[key.namespace][key.key].expire instanceof Date && this.storage[key.namespace][key.key].expire !== null ) ){
							if ( this.storage[key.namespace][key.key].expire !== null && this.storage[key.namespace][key.key].expire < currentDate ){
								delete this.storage[key.namespace][key.key];
								return resolve(false);
							}
							return resolve(false);
						}
						return resolve(true);
					}
					return resolve(false);
				}break;
			}
		}.bind(this));
	}
	
	/**
	* Checks if multiple elements exist within the cache, this method is asynchronous with Promise support.
	*
	* @param Array keys A sequential array of strings containing the keys of the elements that will be looked for.
	*
	* @return Object An object that has as key the element key and as value "true" if it exists, otherwise "false".
	*
	* @throws exception If an array were given.
	* @throws exception If an invalid key within the array were given.
	* @throws exception If an error occurs during storage initialisation.
	* @throws exception If an error occurs in Redis transaction, for more information enable verbose mode.
	* @throws exception If an error occurs in Memcached transaction, for more information enable verbose mode.
	* @throws exception If an error occurs in transaction with the SQLite3 database, for more information enable verbose mode.
	* @throws exception If an error occurs while checking for the file existence.
	*/
	hasMulti(keys){
		return new Promise(function(resolve, reject){
			if ( Array.isArray(keys) === false ){
				return reject('Invalid keys.');
			}
			if ( keys.length === 0 ){
				return resolve({});
			}
			for ( let i = 0 ; i < keys.length ; i++ ){
				if ( typeof(keys[i]) !== 'string' || keys[i] === '' ){
					return reject('Invalid key found.');
				}
			}
			let requests = new Array();
			for ( let i = 0 ; i < keys.length ; i++ ){
				requests.push(this.has(keys[i]));
			}
			Promise.all(requests).then((elements) => {
				let data = {};
				for ( let i = 0 ; i < elements.length ; i++ ){
					data[keys[i]] = elements[i];
				}
				return resolve(data);
			}).catch((ex) => {
				return reject(ex);
			});
		}.bind(this));
	}
	
	/**
	* Checks if all the given elements exist within the cache, this method is asynchronous with Promise support.
	*
	* @param Array keys A sequential array of strings containing the keys of the elements that will be looked for.
	*
	* @return Boolean Even if only an element doesn't exist will be returned "false", otherwise "true".
	*
	* @throws exception If an array were given.
	* @throws exception If an invalid key within the array were given.
	* @throws exception If an error occurs during storage initialisation.
	* @throws exception If an error occurs in Redis transaction, for more information enable verbose mode.
	* @throws exception If an error occurs in Memcached transaction, for more information enable verbose mode.
	* @throws exception If an error occurs in transaction with the SQLite3 database, for more information enable verbose mode.
	* @throws exception If an error occurs while checking for the file existence.
	*/
	hasAll(keys){
		return new Promise(function(resolve, reject){
			if ( Array.isArray(keys) === false ){
				return reject('Invalid keys.');
			}
			if ( keys.length === 0 ){
				return resolve(true);
			}
			for ( let i = 0 ; i < keys.length ; i++ ){
				if ( typeof(keys[i]) !== 'string' || keys[i] === '' ){
					return reject('Invalid key found.');
				}
			}
			let requests = new Array();
			for ( let i = 0 ; i < keys.length ; i++ ){
				requests.push(this.has(keys[i]));
			}
			Promise.all(requests).then((elements) => {
				for ( let i = 0 ; i < elements.length ; i++ ){
					if ( elements[i] === false ){
						return resolve(false);
					}
				}
				return resolve(true);
			}).catch((ex) => {
				return reject(ex);
			});
		}.bind(this));
	}
	
	/**
	* Increments the value of a given key by a given value, this method is asynchronous with Promise support.
	*
	* @param String key A string containing the key of the element that shall be incremented.
	* @param Number value A floating point number representing the increment delta (positive or negative), note that Memcached doens't support floating point deltas, the default value is 1.
	*
	* @throws exception If an invalid key were given.
	* @throws exception If an error occurs during storage initialisation.
	* @throws exception If an error occurs in Redis transaction, for more information enable verbose mode.
	* @throws exception If an error occurs in Memcached transaction, for more information enable verbose mode.
	* @throws exception If an error occurs in transaction with the SQLite3 database, for more information enable verbose mode.
	*/
	increment(key, value){
		return new Promise(function(resolve, reject){
			if ( typeof(key) !== 'string' || key === '' ){
				return reject('Key cannot be an empty string.');
			}
			value = value === null || isNaN(value) === true ? 1 : value;
			if ( value === 0 ){
				return resolve();
			}
			key = this.createKey(key);
			let verbose = this.getVerbose();
			try{
				this.init();
			}catch(ex){
				if ( verbose === true ){
					console.log(ex);
				}
				return reject('An error occurred while initialising the storage.');
			}
			switch ( this.getStrategy() ){
				case TinyCacher.STRATEGY_SHARED:{
					if ( typeof(staticStorage[key.namespace]) === 'object' && staticStorage[key.namespace] !== null && typeof(staticStorage[key.namespace][key.key]) === 'object' && staticStorage[key.namespace][key.key] !== null ){
						if ( typeof(staticStorage[key.namespace][key.key].value) === 'number' ){
							staticStorage[key.namespace][key.key].value += value;
						}
					}
					return resolve();
				}break;
				case TinyCacher.STRATEGY_REDIS:{
					this.redisConnection.incrbyfloat(key.merged, value, (error, element) => {
						if ( error !== null ){
							if ( verbose === true ){
								console.log(error);
							}
							return reject('An error occurred in Redis transaction.');
						}
						return resolve();
					});
				}break;
				case TinyCacher.STRATEGY_MEMCACHED:{
					let buffer = value < 0 ? ( Math.floor(value) + 1 ) : Math.floor(value);
					if ( verbose === true && buffer !== value ){
						console.log('tiny-cacher: Note that Memcached doesn\'t support floating point numbers as increment delta, your value will be converted into an integer one (' + value + ' => ' + buffer + ').');
					}
					if ( value < 0 ){
						this.memcachedConnection.decr(key.merged, Math.abs(buffer), (error) => {
							if ( typeof(error) !== 'undefined' && error !== null ){
								if ( verbose === true ){
									console.log(error);
								}
								return reject('An error occurred in Memcached transaction.');
							}
							return resolve();
						});
					}else{
						this.memcachedConnection.incr(key.merged, buffer, (error) => {
							if ( typeof(error) !== 'undefined' && error !== null ){
								if ( verbose === true ){
									console.log(error);
								}
								return reject('An error occurred in Memcached transaction.');
							}
							return resolve();
						});
					}
				}break;
				case TinyCacher.STRATEGY_SQLITE3:{
					this.sqliteConnection.run('UPDATE cache_storage SET value = value + ? WHERE namespace = ? AND key = ? AND numeric = 1;', [value, key.namespace, key.key], (error) => {
						if ( error !== null ){
							if ( verbose === true ){
								console.log(error);
							}
							return reject('An error occurred during the transaction with SQLite3.');
						}
						return resolve();
					});
				}break;
				case TinyCacher.STRATEGY_FILE:{
					if ( verbose === true ){
						console.log('tiny-cacher: Note that increment and decrement are not supported on files because of performance degradation, consider using an in-memory database, such as Redis, or SQLite instead.');
					}
					return resolve();
				}break;
				default:{
					if ( typeof(this.storage[key.namespace]) === 'object' && this.storage[key.namespace] !== null && typeof(this.storage[key.namespace][key.key]) === 'object' && this.storage[key.namespace][key.key] !== null ){
						if ( typeof(this.storage[key.namespace][key.key].value) === 'number' ){
							this.storage[key.namespace][key.key].value += value;
						}
					}
					return resolve();
				}break;
			}
		}.bind(this));
	}
	
	/**
	* Increments the value of multiple elements by a given value, this method is asynchronous with Promise support.
	*
	* @param Array keys A sequential array of strings containing the keys of the elements that will be incremented.
	* @param Number value A floating point number representing the increment delta (positive or negative), note that Memcached doens't support floating point deltas, the default value is 1.
	*
	* @throws exception If an array were given.
	* @throws exception If an invalid key within the array were given.
	* @throws exception If an error occurs during storage initialisation.
	* @throws exception If an error occurs in Redis transaction, for more information enable verbose mode.
	* @throws exception If an error occurs in Memcached transaction, for more information enable verbose mode.
	* @throws exception If an error occurs in transaction with the SQLite3 database, for more information enable verbose mode.
	*/
	incrementMulti(keys, value){
		return new Promise(function(resolve, reject){
			if ( Array.isArray(keys) === false ){
				return reject('Invalid keys.');
			}
			if ( keys.length === 0 ){
				return resolve();
			}
			for ( let i = 0 ; i < keys.length ; i++ ){
				if ( typeof(keys[i]) !== 'string' || keys[i] === '' ){
					return reject('Invalid key found.');
				}
			}
			let requests = new Array();
			for ( let i = 0 ; i < keys.length ; i++ ){
				requests.push(this.increment(keys[i], value));
			}
			Promise.all(requests).then((elements) => {
				return resolve();
			}).catch((ex) => {
				return reject(ex);
			});
		}.bind(this));
	}
	
	/**
	* Decrements the value of a given key by a given value, this method is asynchronous with Promise support.
	*
	* @param String key A string containing the key of the element that shall be decremented.
	* @param Number value A floating point number representing the increment delta (positive or negative), note that Memcached doens't support floating point deltas, the default value is -1.
	*
	* @throws exception If an invalid key were given.
	* @throws exception If an error occurs during storage initialisation.
	* @throws exception If an error occurs in Redis transaction, for more information enable verbose mode.
	* @throws exception If an error occurs in Memcached transaction, for more information enable verbose mode.
	* @throws exception If an error occurs in transaction with the SQLite3 database, for more information enable verbose mode.
	*/
	decrement(key, value){
		return this.increment(key, ( value === null || isNaN(value) === true ? -1 : -value ));
	}
	
	/**
	* Decrements the value of multiple elements by a given value, this method is asynchronous with Promise support.
	*
	* @param Array keys A sequential array of strings containing the keys of the elements that will be decremented.
	* @param Number value A floating point number representing the increment delta (positive or negative), note that Memcached doens't support floating point deltas., the default value is -1.
	*
	* @throws exception If an array were given.
	* @throws exception If an invalid key within the array were given.
	* @throws exception If an error occurs during storage initialisation.
	* @throws exception If an error occurs in Redis transaction, for more information enable verbose mode.
	* @throws exception If an error occurs in Memcached transaction, for more information enable verbose mode.
	* @throws exception If an error occurs in transaction with the SQLite3 database, for more information enable verbose mode.
	*/
	decrementMulti(keys, value){
		return this.incrementMulti(keys, ( value === null || isNaN(value) === true ? -1 : -value ));
	}
	
	/**
	* Removes a given entry from the cache, this method is asynchronous with Promise support.
	*
	* @param String key A string representin the identifier of the value that will be removed.
	*
	* @throws exception If an invalid key were given.
	* @throws exception If an error occurs during storage initialisation.
	* @throws exception If an error occurs in Redis transaction, for more information enable verbose mode.
	* @throws exception If an error occurs in Memcached transaction, for more information enable verbose mode.
	* @throws exception If an error occurs in transaction with the SQLite3 database, for more information enable verbose mode.
	* @throws exception If an error occurs while removing the file where the data is stored in, for more information enable verbose mode.
	*/
	remove(key){
		return new Promise(function(resolve, reject){
			if ( typeof(key) !== 'string' || key === '' ){
				return reject('Key cannot be an empty string.');
			}
			key = this.createKey(key);
			let verbose = this.getVerbose();
			try{
				this.init();
			}catch(ex){
				if ( verbose === true ){
					console.log(ex);
				}
				return reject('An error occurred while initialising the storage.');
			}
			switch ( this.getStrategy() ){
				case TinyCacher.STRATEGY_SHARED:{
					if ( typeof(staticStorage[key.namespace][key.key]) !== 'undefined' ){
						delete staticStorage[key.namespace][key.key];
					}
					return resolve();
				}break;
				case TinyCacher.STRATEGY_REDIS:{
					this.redisConnection.del(key.merged, (error) => {
						if ( error !== null ){
							if ( verbose === true ){
								console.log(error);
							}
							return reject('An error occurred in Redis transaction.');
						}
						return resolve();
					});
				}break;
				case TinyCacher.STRATEGY_MEMCACHED:{
					this.memcachedConnection.del(key.merged, (error) => {
						if ( typeof(error) !== 'undefined' && error !== null ){
							if ( verbose === true ){
								console.log(error);
							}
							return reject('An error occurred in Memcached transaction.');
						}
						return resolve();
					});
				}break;
				case TinyCacher.STRATEGY_SQLITE3:{
					this.sqliteConnection.get('DELETE FROM cache_storage WHERE namespace = ? AND key = ?;', [key.namespace, key.key], (error) => {
						if ( error !== null ){
							if ( verbose === true ){
								console.log(error);
							}
							return reject('An error occurred during the transaction with SQLite3.');
						}
						return resolve();
					});
				}break;
				case TinyCacher.STRATEGY_FILE:{
					try{
						filesystem.unlinkSync(this.storagePath + '/' + key.namespace + '/' + key.key + '.cache');
						return resolve();
					}catch(ex){
						if ( verbose === true ){
							console.log(ex);
						}
						return reject('An error occurred while removing the file.');
					}
				}break;
				default:{
					if ( typeof(this.storage[key.namespace][key.key]) !== 'undefined' ){
						delete this.storage[key.namespace][key.key];
					}
					return resolve();
				}break;
			}
		}.bind(this));
	}
	
	/**
	* Removes multiple elements from the cache, this method is asynchronous with Promise support.
	*
	* @param Array keys A sequential array of strings containing the keys of the elements that will be removed.
	*
	* @throws exception If an array were given.
	* @throws exception If an invalid key within the array were given.
	* @throws exception If an error occurs during storage initialisation.
	* @throws exception If an error occurs in Redis transaction, for more information enable verbose mode.
	* @throws exception If an error occurs in Memcached transaction, for more information enable verbose mode.
	* @throws exception If an error occurs in transaction with the SQLite3 database, for more information enable verbose mode.
	* @throws exception If an error occurs while removing the file where the data is stored in, for more information enable verbose mode.
	*/
	removeMulti(keys){
		return new Promise(function(resolve, reject){
			if ( Array.isArray(keys) === false ){
				return reject('Invalid keys.');
			}
			if ( keys.length === 0 ){
				return resolve({});
			}
			for ( let i = 0 ; i < keys.length ; i++ ){
				if ( typeof(keys[i]) !== 'string' || keys[i] === '' ){
					return reject('Invalid key found.');
				}
			}
			let requests = new Array();
			for ( let i = 0 ; i < keys.length ; i++ ){
				requests.push(this.remove(keys[i]));
			}
			Promise.all(requests).then((elements) => {
				return resolve();
			}).catch((ex) => {
				return reject(ex);
			});
		}.bind(this));
	}
	
	/**
	* Drops all entries from the cache, this method is asynchronous with Promise support.
	*
	* @param Boolean all If set to "true", all entries created by this class will be removed from cache, otherwise, dy default, only elements in the namespace that has been set will be removed.
	*
	* @throws exception If an error occurs during storage initialisation.
	* @throws exception If an error occurs in Redis transaction, for more information enable verbose mode.
	* @throws exception If an error occurs in Memcached transaction, for more information enable verbose mode.
	* @throws exception If an error occurs in transaction with the SQLite3 database, for more information enable verbose mode.
	* @throws exception If an error occurs while removing the directory where the cache is stored in.
	*/
	invalidate(all){
		return new Promise(function(resolve, reject){
			let key = this.createKey(null);
			let verbose = this.getVerbose();
			try{
				this.init();
			}catch(ex){
				if ( verbose === true ){
					console.log(ex);
				}
				return reject('An error occurred while initialising the storage.');
			}
			switch ( this.getStrategy() ){
				case TinyCacher.STRATEGY_SHARED:{
					if ( all === true ){
						staticStorage = {};
						return resolve();
					}
					staticStorage[key.namespace] = {};
					return resolve();
				}break;
				case TinyCacher.STRATEGY_REDIS:{
					//TODO: Check for driver support for multiple delection.
					this.redisConnection.keys(( all === true ? 'tiny-cacher:*' : 'tiny-cacher:' + key.namespace + ':*' ), (error, elements) => {
						if ( error !== null ){
							if ( verbose === true ){
								console.log(error);
							}
							return reject('An error occurred in Redis transaction.');
						}
						let requests = 0;
						elements.forEach((element, index) => {
							requests++;
							this.redisConnection.del(element, (error) => {
								requests--;
								if ( error !== null ){
									if ( verbose === true ){
										console.log(error);
									}
									requests = 0;
									return reject('An error occurred in Redis transaction.');
								}
								if ( requests === 0 ){
									return resolve();
								}
							});
						});
					});
				}break;
				case TinyCacher.STRATEGY_MEMCACHED:{
					//TODO: Add support for cache invalidation when using Memcached as cache strategy.
					if ( verbose === true ){
						console.log('tiny-cacher: Note that currently cache invalidation is not supported when using Memcached as cache strategy.');
					}
					return resolve();
				}break;
				case TinyCacher.STRATEGY_SQLITE3:{
					if ( all === true ){
						this.sqliteConnection.run('DELETE FROM cache_storage;', (error) => {
							if ( error !== null ){
								if ( verbose === true ){
									console.log(error);
								}
								return reject('An error occurred during the transaction with SQLite3.');
							}
							return resolve();
						});
					}else{
						this.sqliteConnection.get('DELETE FROM cache_storage WHERE namespace = ?;', [key.namespace], (error) => {
							if ( error !== null ){
								if ( verbose === true ){
									console.log(error);
								}
								return reject('An error occurred during the transaction with SQLite3.');
							}
							return resolve();
						});
					}
				}break;
				case TinyCacher.STRATEGY_FILE:{
					try{
						let removeDirectory = function(path){
							filesystem.readdirSync(path).forEach((element, index) => {
								let current = path + '/' + element;
								if ( filesystem.lstatSync(current).isDirectory() === true ){
									return removeDirectory(current);
								}
								filesystem.unlinkSync(current);
							});
							filesystem.rmdirSync(path);
						};
						let storage = all === true ? ( this.storagePath ) : ( this.storagePath + '/' + key.namespace );
						if ( filesystem.existsSync(storage) === true ){
							removeDirectory(storage);
						}
						return resolve();
					}catch(ex){
						if ( verbose === true ){
							console.log(ex);
						}
						return reject('Unable to remove the directory.');
					}
				}break;
				default:{
					if ( all === true ){
						this.storage = {};
						return resolve();
					}
					this.storage[key.namespace] = {};
					return resolve();
				}break;
			}
		}.bind(this));
	}
	
	/**
	* Establishes a connection with Redis, this method is asynchronous with Promise support.
	*
	* @param Object options An object containing the options for the client, such as host, port, UNIX sock, and so on, more details on supported options can be found here: https://github.com/NodeRedis/node_redis#rediscreateclient
	* @param Number index An integer number greater or equal than zero representing the database where the cache will be stored into.
	*
	* @throws exception If the driver for Redis has not been installed.
	* @throws exception If an error occurrs during connection with Redis.
	*/
	connectToRedis(options, index){
		this.ready = false;
		return new Promise(function(resolve, reject){
			if ( typeof(options) !== 'object' || options === null ){
				options = {};
			}
			options.db = typeof(index) !== 'number' ? 0 : Math.floor(index);
			if ( index < 0 ){
				index = 0;
			}
			options.db = index;
			if ( typeof(redis) !== 'object' || redis === null ){
				this.ready = true;
				return reject('The Redis driver has not been installed, run "npm install redis" first.');
			}
			let verbose = this.getVerbose();
			try{
				this.closeRedisConnection();
				this.redisConnection = redis.createClient(options);
				this.redisConnection.on('error', function(error){
					if ( verbose === true ){
						console.log(error);
					}
					this.ready = true;
					return reject('Unable to connect to Redis.');
				}.bind(this));
				this.redisConnection.on('ready', () => {
					this.ready = true;
					return resolve();
				});
			}catch(ex){
				if ( verbose === true ){
					console.log(ex);
				}
				this.ready = true;
				return reject('Unable to connect to Redis.');
			}
		}.bind(this));
	}
	
	/**
	* Checks if a connection with Redis has been established or not, if the connection is going to be probed, this method will excebute asyncronously with Promise support.
	*
	* @param Boolean probe If set to "true", the connection will be probed by sending a sample command to the server and then waiting for its response, by default no probe is made.
	*
	* @return Boolean If the connection is up will be returned "true", otherwise "false".
	*/
	redisConnected(probe){
		if ( probe === true ){
			return new Promise(function(resolve, reject){
				if ( typeof(this.redisConnection) !== 'object' || this.redisConnection === null || !( this.redisConnection instanceof redis.RedisClient ) || typeof(this.redisConnection.connected) === 'undefined' || this.redisConnection.connected !== true ){
					return resolve(false);
				}
				let verbose = this.getVerbose();
				this.redisConnection.ping((error, result) => {
					if ( error !== null ){
						if ( verbose === true ){
							console.log(error);
							return resolve(false);
						}
					}
					return resolve(( result.toLowerCase() === 'pong' ? true : false ));
				});
			}.bind(this));
		}
		return typeof(this.redisConnection) === 'object' && this.redisConnection instanceof redis.RedisClient && typeof(this.redisConnection.connected) !== 'undefined' && this.redisConnection.connected === true ? true : false;
	}
	
	/**
	* Establishes a connection with Memcached, this method is asynchronous with Promise support.
	*
	* @param String|Array|Object contactPoints One or more addresses (IP or hostname) where the Memcached server are running to, more information can be found here: https://github.com/3rd-Eden/memcached#server-locations
	* @param Object An object containing some additional configuration parameters for the client, more information here: https://github.com/3rd-Eden/memcached#options
	*
	* @throws exception If the driver for Memcached has not been installed.
	* @throws exception If an error occurrs during connection with Memcached.
	*/
	connectToMemcached(contactPoints, options){
		this.ready = false;
		return new Promise(function(resolve, reject){
			if ( contactPoints === null || contactPoints === null || ( typeof(contactPoints) !== 'string' && typeof(contactPoints) !== 'object' && Array.isArray(contactPoints) === false ) ){
				contactPoints = new Array('localhost:11211');
			}
			if ( typeof(contactPoints) === 'string' ){
				contactPoints = new Array(contactPoints);
			}
			if ( typeof(memcached) === 'undefined' || memcached === null ){
				return reject('The Memcached driver has not been installed, run "npm install memcached" first.');
			}
			if ( typeof(options) !== 'object' || options === null ){
				options = {};
			}
			let verbose = this.getVerbose();
			try{
				this.closeMemcachedConnection();
				this.memcachedConnection = new memcached(contactPoints, options);
				return resolve();
			}catch(ex){
				if ( verbose === true ){
					console.log(ex);
				}
				this.ready = true;
				return reject('Unable to connect to Memcached.');
			}
		}.bind(this));
	}
	
	/**
	* Checks if a connection with Memcached has been established or not, if the connection is going to be probed, this method will excebute asyncronously with Promise support.
	*
	* @param Boolean probe If set to "true", the connection will be probed by sending a sample command to the server and then waiting for its response, by default no probe is made.
	*
	* @return Boolean If the connection is up will be returned "true", otherwise "false".
	*/
	memcachedConnected(probe){
		if ( probe === true ){
			return new Promise(function(resolve, reject){
				if ( typeof(this.memcachedConnection) !== 'object' || this.memcachedConnection === null || !( this.memcachedConnection instanceof memcached ) ){
					return resolve(false);
				}
				let verbose = this.getVerbose();
				this.memcachedConnection.version((error, result) => {
					if ( typeof(error) !== 'undefined' && error !== null ){
						if ( verbose === true ){
							console.log(error);
							return resolve(false);
						}
					}
					return resolve(( typeof(result) === 'object' && result !== null && typeof(result.version) === 'string' ? true : false ));
				});
			}.bind(this));
		}
		return typeof(this.memcachedConnection) === 'object' && this.memcachedConnection instanceof memcached ? true : false;
	}
	
	/**
	* Establishes a connection with a SQLite3 database, this method is asynchronous with Promise support.
	*
	* @param String path A string containing the location of the database file, use the keyword ":memory:" to create an in-memory database.
	* @param Numeric mode An integer number greater than zero representing the connection mode, more information can be found here: https://github.com/mapbox/node-sqlite3/wiki/API#new-sqlite3databasefilename-mode-callback
	*
	* @throws exception If an invalid path were given.
	* @throws exception If the driver for SQLite3 has not been installed.
	* @throws exception If an error occurrs during connection with the SQLite3 database.
	* @throws exception If an error occurrs during database initialisation.
	*/
	connectToSQLite(path, mode){
		this.ready = false;
		return new Promise(function(resolve, reject){
			if ( typeof(path) !== 'string' || path === '' ){
				return reject('Invalid database path.');
			}
			if ( typeof(sqlite3) !== 'object' || sqlite3 === null ){
				return reject('The SQLite3 driver has not been installed, run "npm install sqlite3" first.');
			}
			if ( mode === null || isNaN(mode) === true ){
				mode = sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE;
			}
			let verbose = this.getVerbose();
			this.closeSQLite3Connection();
			this.sqliteConnection = new sqlite3.Database(path, mode, function(error){
				if ( error !== null ){
					if ( verbose === true ){
						console.log(error);
					}
					this.ready = true;
					return reject('An error occurred while trying to connect with SQLite database.');
				}
				this.sqliteConnection.run('CREATE TABLE IF NOT EXISTS cache_storage (namespace TEXT, key TEXT, value TEXT, numeric INTEGER, date DATETIME, expire DATETIME, PRIMARY KEY (namespace, key));', (error) => {
					this.ready = true;
					if ( error !== null ){
						if ( verbose === true ){
							console.log(error);
						}
						return reject('An error occurred during database initialisation.');
					}
					return resolve();
				});
			}.bind(this));
		}.bind(this));
	}
	
	/**
	* Checks if a connection with a SQLite3 database has been established or not, if the connection is going to be probed, this method will excebute asyncronously with Promise support.
	*
	* @param Boolean probe If set to "true", the connection will be probed by sending a sample command to the server and then waiting for its response, by default no probe is made.
	*
	* @return Boolean If the connection is up will be returned "true", otherwise "false".
	*/
	SQLite3Connected(probe){
		if ( probe === true ){
			return new Promise(function(reject, resolve){
				if ( typeof(this.sqliteConnection) !== 'object' || this.sqliteConnection === null || !( this.sqliteConnection instanceof sqlite3.Database ) ){
					return resolve(false);
				}
				let verbose = this.getVerbose();
				this.sqliteConnection.run('PRAGMA table_info([cache_storage]);', (error, elements) => {
					if ( error !== null ){
						if ( verbose === true ){
							console.log(error);
						}
						return resolve(false);
					}
					let fields = new Array('namespace', 'key', 'value', 'numeric', 'date', 'expire');
					let found = 0;
					elements.forEach((element, index) => {
						if ( typeof(element.name) === 'string' && element.name !== '' && fields.indexOf(element.name) !== -1 ){
							found++;
						}
					});
					return resolve(( found === 6 ? true : false ));
				});
			});
		}
		return typeof(this.sqliteConnection) === 'object' && this.sqliteConnection instanceof sqlite3.Database ? true : false;
	}
	
	/**
	* Sets the path to the directory where the cached files will be stored in, this method is chainable.
	*
	* @param String path A string containing the path to the directory.
	*
	* @throws exception If an invalid path were given.
	* @throws exception If an error occurs while creating the directory (if it doesn't exist).
	*/
	setStorageDirectory(path){
		if ( typeof(path) !== 'string' || path === '' ){
			throw 'Invalid path.';
		}
		try{
			this.ready = false;
			if ( filesystem.existsSync(path) === false ){
				filesystem.mkdirSync(path);
			}
			this.storagePath = path;
			this.ready = true;
			return this;
		}catch(ex){
			if ( this.getVerbose() === true ){
				console.log(ex);
			}
			this.ready = true;
			throw 'Cannot create the directory.';
		}
	}
	
	/**
	* Returns if the class is ready to be used or not, for example if is currently connecting to Redis.
	*
	* @return Boolean If the class is ready will be returned "true", otherwise "false".
	*/
	isReady(){
		return typeof(this.ready) !== 'undefined' && this.ready === true ? true : false;
	}
	
	/**
	* Closes the connection with Redis, this method is chainable.
	*/
	closeRedisConnection(){
		if ( this.redisConnected() === true ){
			this.redisConnection.quit();
		}
		this.redisConnection = null;
		return this;
	}
	
	/**
	* Closes the connection with Memcached, this method is chainable.
	*/
	closeMemcachedConnection(){
		if ( this.memcachedConnected() === true ){
			this.memcachedConnection.end();
		}
		this.memcachedConnection = null;
		return this;
	}
	
	/**
	* Closes the connection with the SQLite3 database, this method is chainable.
	*/
	closeSQLite3Connection(){
		if ( this.SQLite3Connected() === true ){
			this.sqliteConnection.close();
		}
		this.sqliteConnection = null;
		return this;
	}
	
	/**
	* Closes all no more used connections, this method is chainable.
	*
	* @param Boolean all If set to "true" it will close all connections, despite current strategy require it, otherwise only not used connections will be closed.
	*/
	closeConnections(all){
		let strategy = this.getStrategy();
		if ( all === true || strategy !== TinyCacher.STRATEGY_REDIS ){
			this.closeRedisConnection();
		}
		if ( all === true || strategy !== TinyCacher.STRATEGY_MEMCACHED ){
			this.closeMemcachedConnection();
		}
		if ( all === true || strategy !== TinyCacher.STRATEGY_SQLITE3 ){
			this.SQLite3Connected();
		}
		return this;
	}
};

/**
* @const Number STRATEGY_INTERNAL Specifies that the cache must be stored in a property within the class instance.
*/
Object.defineProperty(module.exports, 'STRATEGY_INTERNAL', {
	value: 1,
	writable: false,
	enumerable : true,
    configurable : false
});

/**
* @const Number STRATEGY_LOCAL Specifies that the cache must be stored in a property within the class instance.
*/
Object.defineProperty(module.exports, 'STRATEGY_LOCAL', {
	value: 1,
	writable: false,
	enumerable : true,
    configurable : false
});

/**
* @const Number STRATEGY_SHARED Specifies that the cache must be stored in a variable that is visible across all class instances.
*/
Object.defineProperty(module.exports, 'STRATEGY_SHARED', {
	value: 2,
	writable: false,
	enumerable : true,
    configurable : false
});

/**
* @const Number STRATEGY_INTERNAL_SHARED Specifies that the cache must be stored in a variable that is visible across all class instances.
*/
Object.defineProperty(module.exports, 'STRATEGY_INTERNAL_SHARED', {
	value: 2,
	writable: false,
	enumerable : true,
    configurable : false
});

/**
* @const Number STRATEGY_REDIS Specifies that the cache must be stored in a Redis powered database.
*/
Object.defineProperty(module.exports, 'STRATEGY_REDIS', {
	value: 4,
	writable: false,
	enumerable : true,
    configurable : false
});

/**
* @const Number STRATEGY_MEMCACHED Specifies that the cache must be stored in Memcached.
*/
Object.defineProperty(module.exports, 'STRATEGY_MEMCACHED', {
	value: 5,
	writable: false,
	enumerable : true,
    configurable : false
});

/**
* @const Number STRATEGY_SQLITE3 Specifies that the cache must be stored in a SQLite3 database.
*/
Object.defineProperty(module.exports, 'STRATEGY_SQLITE3', {
	value: 6,
	writable: false,
	enumerable : true,
    configurable : false
});

/**
* @const Number STRATEGY_SQLITE Specifies that the cache must be stored in a SQLite3 database.
*/
Object.defineProperty(module.exports, 'STRATEGY_SQLITE', {
	value: 6,
	writable: false,
	enumerable : true,
    configurable : false
});

/**
* @const Number STRATEGY_FILE Specifies that the cache must be stored in files.
*/
Object.defineProperty(module.exports, 'STRATEGY_FILE', {
	value: 7,
	writable: false,
	enumerable : true,
    configurable : false
});

/**
* @const String VERSION A string containing the version of this library.
*/
Object.defineProperty(module.exports, 'VERSION', {
	value: '1.1.0',
	writable: false,
	enumerable : true,
    configurable : false
});
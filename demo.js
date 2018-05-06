'use strict';

const TinyCacher = require('./tiny-cacher');

let namespace = 'demo';
let ttl = 120;
let increment = 4;

function run(){
	return new Promise((resolve, reject) => {
		let start = process.hrtime();
		console.log('Starting test using "' + cache.getStrategyName() + '" as strategy...');
		console.log('Pushing some elements into the cache...');
		//Pushing the element into the cache.
		let operation = null;
		cache.pushMulti({
			'cache-entry': 'Some data that should be cached for next uses 🍭',
			foo: 'bar',
			serialised: [1, 2, 3, 5, 'a', true],
			numeric: 10
		}, true).then(() => {
			console.log('Elements pushed into the cache, checking if one element exists...');
			//Checking if the element has been pushed and if exists within the cache.
			cache.has('cache-entry').then((result) => {
				console.log('Does the element exist? ' + ( result === true ? 'Yes.' : 'No.' ));
				console.log('Retrieving the same element...');
				//Getting the element's value.
				cache.pull('cache-entry', true).then((result) => {
					console.log('Value: ' + result);
					//Incrementing the numeric entry.
					console.log('Incrementing the numeric entry...');
					cache.increment('numeric', increment).then(() => {
						console.log('Numeric value incremented by ' + increment + '.');
						//Getting the incremented value from the cache.
						cache.pull('numeric').then((value) => {
							console.log('Incremented value now is: ' + value);
							console.log('Removing the element...');process.exit();
							//Removing the element.
							cache.remove('cache-entry').then(() => {
								console.log('The element has been removed, dropping all elements from the cache...');
								//Removing all elements from the cache.
								cache.invalidate().then(() => {
									console.log('Cache content cleared.');
									cache.setStrategy('local').closeConnections();
									busy = false;
									console.log('Test completed in ' + ( process.hrtime(start)[1] / 1e9 ) + ' seconds.');
									return resolve();
								}).catch((ex) => {
									return reject(ex);
								});
							}).catch((ex) => {
								return reject(ex);
							});
						}).catch((ex) => {
							return reject(ex);
						});
					}).catch((ex) => {
						return reject(ex);
					});
				}).catch((ex) => {
					return reject(ex);
				});
			}).catch((ex) => {
				return reject(ex);
			});
		}).catch((ex) => {
			return reject(ex);
		});
	});
}

//Starting garbage collector to remove dead elements from global storage (expired entries when using TTL).
TinyCacher.startGlobalGarbageCollector();
let cache = new TinyCacher();
cache.setNamespace(namespace);
cache.setDefaultTTL(ttl);
cache.setVerbose(true);
cache.startGarbageCollector();
//Getting all supported strategies, according to the installed modules.
let strategies = TinyCacher.getSupportedStrategies().join(', ');
console.log('Pick a cache strategy (' + strategies + ') to try out (type "q" to exit):');
let stdin = process.openStdin();
let busy = false;
stdin.addListener('data', (strategy) => {
	strategy = strategy.toString().trim().toLowerCase();
	if ( strategy === 'q' ){
		console.log('Demo completed, bye!');
		process.exit();
	}
	if ( TinyCacher.isSupportedStrategy(strategy) === false ){
		return console.log('This strategy is not supported.');
	}
	if ( busy === false ){
		busy = true;
		cache.setStrategy(strategy);
		switch ( strategy ){
			case 'redis':{
				cache.connectToRedis(null, 0).then(() => {
					run().then(() => {
						console.log('Pick another strategy to try out (' + strategies + ') or type "q" to exit.');
					}).catch((ex) => {
						console.log(ex);
					});
				}).catch((ex) => {
					console.log(ex);
					busy = false;
				});
			}break;
			case 'memcached':{
				cache.connectToMemcached('127.0.0.1:11211').then(() => {cache.memcachedConnected(true).then((result) => {console.log(result);});
					run().then(() => {
						console.log('Pick another strategy to try out (' + strategies + ') or type "q" to exit.');
					}).catch((ex) => {
						console.log(ex);
					});
				}).catch((ex) => {
					console.log(ex);
					busy = false;
				});
			}break;
			case 'sqlite3':{
				cache.connectToSQLite('cache.db').then(() => {
					run().then(() => {
						console.log('Pick another strategy to try out (' + strategies + ') or type "q" to exit.');
					}).catch((ex) => {
						console.log(ex);
					});
				}).catch((ex) => {
					console.log(ex);
					busy = false;
				});
			}break;
			case 'file':{
				cache.setStorageDirectory('cache');
				run().then(() => {
					console.log('Pick another strategy to try out (' + strategies + ') or type "q" to exit.');
				}).catch((ex) => {
					console.log(ex);
				});
			}break;
			default:{
				run().then(() => {
					console.log('Pick another strategy to try out (' + strategies + ') or type "q" to exit.');
				}).catch((ex) => {
					console.log(ex);
				});
			}break;
		}
	}
});
# Tiny Cacher

Tiny Cacher is a simple package that provides a simple API for data caching supporting multiple storage options, such as Redis, Memcached, SQLite and files, supporting basic operations, increments and TTL, allowing to store strings as well as other kind of variables that will be serialised into JSON or other formats, according to the storage strategy in use.

## Installation

According with your needs, you may have to install some additional modules: if you are going to use Redis, you need to install the required module using the command `npm install redis`, in a similar way to use Memcached, you need to install the required module using the command `npm install memcached`, same for SQLite using the command `npm install sqlite3`. Once the requirements are mets, you can install the module running this command:

````bash
npm install tiny-cacher
````

## Usage

First you need to set up a class instance according with the storage option that you are going to use, here you are some examples:

### Basic setup

First you need to create an instance of the class, then you can set the general setting like the namespace for cache entries and the default TTL.

````javascript
let cache = new TinyCacher();
//Set an optional namespace for entries.
cache.setNamespace('your namespace here');
//Set the default TTL (in seconds), by default entries have no expire.
cache.setDefaultTTL(120);
````

#### Using internal storage

You can save your data internally within the class instance or in a shared way:

````javascript
//Store data within the class instance.
cache.setStrategy(TinyCacher.STRATEGY_LOCAL);
//Store data within the script but shared across class instances.
cache.setStrategy(TinyCacher.STRATEGY_SHARED);
````

#### Using Redis

````javascript
//options, DB index
cache.setStrategy(TinyCacher.STRATEGY_REDIS).connectToRedis({
	host: '127.0.0.1'
}, 0).then(() => {
	//Your stuff here.
}).catch((ex) => {
	//Handle errors here.
});
````

You can check the official repository on [GitHub](https://github.com/NodeRedis/node_redis) for more information about connection options for the Redis driver.

#### Using Memcached

````javascript
cache.setStrategy(TinyCacher.STRATEGY_MEMCACHED).connectToMemcached('127.0.0.1:11211').then(() => {
	//Your stuff here.
}).catch((ex) => {
	//Handle errors here.
});
````

For more information about the driver used with Memcached check the official repository on [GitHub](https://github.com/3rd-Eden/memcached).

#### Using SQLite3

````javascript
cache.setStrategy(TinyCacher.STRATEGY_SQLITE).connectToSQLite('path/to/sqlite.db').then(() => {
	//Your stuff here.
}).catch((ex) => {
	//Handle errors here.
});
````

For more information about the SQLite3 driver refer on the official documentation that can be found to the repository on [GitHub](https://github.com/mapbox/node-sqlite3).

#### Using files

````javascript
cache.setStrategy(TinyCacher.STRATEGY_FILE).setStorageDirectory('path/to/storage/directory');
````

### Operations

Once you created the class instance and completed the connection with the storage service you can start adding items to the cache, here you are an example:

````javascript
//Save one element.
//key, value, overwrite, ttl
cache.push('key', 'value', true, 60).then(() => {
	//Your stuff here.
}).catch((ex) => {
	//Handle errors here.
});
//Save multiple elements.
//elements, overwrite, ttl
cache.pushMulti({
	someKey: 'Some value',
	key: 'value'
}, true, 60).then(() => {
	//Your stuff here.
}).catch((ex) => {
	//Handle errors here.
});
````

In a similar way you can retrieve the value of one or multiple keys, here an example:

````javascript
//key, quiet (return null instead of throwing an exception).
cache.pull('key', true).then((element) => {
	//Element will contain the value of the element or null if no such value were found and quiet mode has been enabled.
	//Your stuff here.
}).catch((ex) => {
	//Handle errors here.
});
//You can pull multiple elements by using this method and passing an array of keys.
//array of keys, quiet.
cache.pullMulti(['key', 'some other key'], true).then((elements) => {
	//The elements are returned as object having as key the entry key and as value the corresponding value or null if no such value were found and quiet mode has been enabled.
	//Your stuff here.
}).catch((ex) => {
	//Handle errors here.
});
````

You can check if a key exists as following:

````javascript
cache.has('key').then((result) => {
	//Result is a boolean value.
	//Your stuff here.
}).catch((ex) => {
	//Handle errors here.
});
//You can check for multiple keys as well.
cache.hasMulti(['key', 'some other key']).then((results) => {
	//Results is an object having as key the element key and as value a boolean variable.
	//Your stuff here.
}).catch((ex) => {
	//Handle errors here.
});
//And you can check if all the given keys exist.
cache.hasAll(['key', 'some other key']).then((result) => {
	//Result is a boolean value.
	//Your stuff here.
}).catch((ex) => {
	//Handle errors here.
});
````

Then you can remove a key in this way:

````javascript
cache.remove('key').then(() => {
	//Your stuff here.
}).catch((ex) => {
	//Handle errors here.
});
//You can remove multiple elements with a single call as following:
cache.removeMulti(['key', 'some other key']).then(() => {
	//Your stuff here.
}).catch((ex) => {
	//Handle errors here.
});
````

If you are working with numeric values you can use increments, note that currently this feature is not available when using files as storage option:

````javascript
//Pass the element key and the increment value, it can be a negative value as well, by default 1 is used.
cache.increment('key', 3).then(() => {
	//Your stuff here.
}).catch((ex) => {
	//Handle errors here.
});
//Of course you can apply increment on multiple elements.
cache.incrementMulti(['key', 'some other key'], 3).then(() => {
	//Your stuff here.
}).catch((ex) => {
	//Handle errors here.
});
//And decrement values, note that these methods internally call the methods "increment" or "incrementMulti" using a negative increment value.
cache.decrement('key', 3).then(() => {
	//Your stuff here.
}).catch((ex) => {
	//Handle errors here.
});
````

You can remove all stored elements using this method, alternatively you can remove all the elements stored under a given namespace:

````javascript
//If you pass "true" as parameter it will remove all elements created by this class, no matter the namespace.
cache.invalidate().then(() => {
	//Your stuff here.
}).catch((ex) => {
	//Handle errors here.
});
````

If you switch to another storage strategy, you may want to close no more used connections, in this case you may want to run this method:

````javascript
//If you pass "true" as parameters, it will close all connections, no matter the storage option in use.
cache.closeConnections();
````

## Considerations on TTL

TTL is supported in almost all storage options, anyway currently is not supported when using file as option. TTL is natively supported by Redis and Memcached, while is you are using another storage option you will need to use one of these technique in order to remove dead records, note that expired records will not be considered in data readings so this operation is only required whenever you need to free up some memory, here you are some usage example:

````javascript
//Remove expired elements saved in shared storage.
TinyCacher.runGlobalGarbageCollector();
//Remove expired elements saved in local storage.
cache.runGarbageCollector();
//Remove expired elements saved in a SQLite3 database.
cache.runSQLite3GarbageCollector();
```` 

If you are going to store your data using the "local" or the "shared" option, you could run the garbage collector methods using a Timer, here you are an example:

````javascript
//Start the garbage collector in order to clean expired elements saved in shared storage.
TinyCacher.startGlobalGarbageCollector();
//Stop it using this method.
TinyCacher.stopGlobalGarbageCollector();
//In a similar way you can run the same action on local storage.
cache.startGarbageCollector();
//And then stop it.
cache.stopGarbageCollector();
````

If you like this project and think that is useful don't be scared and feel free to contribute reporting bugs, issues or suggestions or if you feel generous, you can send a donation [here](https://www.enricosola.com/about#donations).

Are you looking for the PHP version? Give a look [here](https://github.com/RyanJ93/php-tiny-cacher).
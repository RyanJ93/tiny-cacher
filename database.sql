-- Create the main table that will contain all cache entries, fields:
-- namespace: A string containing the anmespace for key grouping, if no namespace were given, "*" is used.
-- key: A string containing the identifier of the entry.
-- value: The value that has been pushed into the cache serialized as JSON string.
-- numeric: If set to "1" it means that the value stored within the element is a numeric value and can be incremented and decemented, otherwise is not.
-- date: The date when the entry has been pushed into the cache.
-- expire: The date when the entry must be removed, NULL is the element has no expire.
CREATE TABLE IF NOT EXISTS cache_storage (namespace TEXT, key TEXT, value TEXT, numeric INTEGER, date DATETIME, expire DATETIME, PRIMARY KEY (namespace, key));
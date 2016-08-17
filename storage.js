var MongoClient = require('mongodb').MongoClient;
var ObjectID = require('mongodb').ObjectID;
var fs = require('fs');
var util = require('util');
var $ = require('./chains');

var Instance = function(Structure, values, callback)
{
	var self = this;
	self._id = null;
	self._existent = true;

	for (var methodName in Structure.methods)
	{
		self[methodName] = Structure.methods[methodName];
	}

	for (var propertyName in Structure.properties)
	{
		self[propertyName] = JSON.parse(JSON.stringify(Structure.properties[propertyName]));;
	}

	for (var propertyName in values)
	{
		self[propertyName] = values[propertyName];
	}

	self.exists = function()
	{
		return self._existent;
	}

	self.save = function(callback)
	{
		var values = {};

		for (var propertyName in Structure.properties)
		{
			values[propertyName] = self[propertyName];
		}

		if (self._id)
		{
			return Structure.Storage.database.collection(Structure.name).updateOne({_id: self._id}, {$set: values}, function(error, result)
			{
				if (error)
				{
					if (!callback.apply)
					{
						console.log('callback is not a function');
						console.log(callback);
						return;
					}

					return callback.apply(self, [error]);
				}

				if (callback)
				{
					if (!callback.apply)
					{
						console.log('callback is not a function');
						console.log(callback);
						return;
					}

					return callback.apply(self, [null]);
				}

				return;
			});
		}

		return Structure.Storage.database.collection(Structure.name).insertOne(values, function(error, result)
		{
			if (error)
			{
				return callback && callback.apply(self, [error]);
			}

			self._id = result.insertedId;
			return callback && callback.apply(self, [null]);
		});
	};

	self.set = function()
	{
		if (arguments.length == 0)
		{
			return self;
		}

		if (arguments.length == 1)
		{
			var properties = arguments[0];

			for (var propertyName in properties)
			{
				self[propertyName] = properties[propertyName];
			}

			return self;
		}

		if (arguments.length == 2)
		{
			var propertyName = arguments[0];
			var value = arguments[1];

			if (!self.properties[propertyName])
			{
				return self;
			}

			self[propertyName] = value;
			return self;
		}

		return self;
	};

	self.destroy = function(callback)
	{
		self.emit('destroy');
		self._existent = false;
		
		if (!self._id)
		{
			return callback(null);
		}

		return Structure.Storage.database.collection(Structure.name).deleteOne({_id: self._id}, function(error, result)
		{
			if (error)
			{
				return callback(error);
			}

			return callback(null);
		});
	};

	self.emit = function(name, params)
	{
		if (!Structure.events[name])
		{
			return null;
		}

		Structure.events[name].apply(self, params);
		return self;
	};

	if (self.emit('create', [function(error)
	{
		return callback && callback.apply(self, [error]);
	}]))
	{
		return self;
	}

	callback && callback.apply(self);
	return self;
};

var Collection = function()
{
	var self = this;

	self.add = function(instance)
	{
		self.push(instance);
		return self;
	}

	self.remove = function(instance)
	{
		var index = self.indexOf(instance);

		if (index < 0)
		{
			console.log('Не нашли экземпляр в коллеции :C');
			return self;
		}

		self.splice(index, 1);
		return self;
	}

	self.find = function(properties)
	{
		properties = properties || {};

		var instances = self.filter(function(instance)
		{
			for (var propertyName in properties)
			{
				if (propertyName == '_id')
				{
					if (instance._id.equals(properties._id))
					{
						continue;
					}

					return false;
				}

				if (instance[propertyName] == properties[propertyName])
				{
					continue;
				}

				return false;
			}

			return true;
		});

		Collection.apply(instances);
		return instances;
	};

	self.first = function()
	{
		return self.length > 0 ? self[0] : null;
	};

	self.sort = function(propertyName, order, ignoreCase)
	{
		var instances = self.slice(0).sort(function(a, b)
		{ 
			if (a[propertyName] < b[propertyName])
			{
				return (order == 'desc') ? 1 : -1;
			}

			if (a[propertyName] > b[propertyName])
			{
				return (order == 'desc') ? -1 : 1;
			}

			return 0;
		});

		Collection.apply(instances);
		return instances;
	};

	self.filter = function(filter)
	{
		var instances = Array.prototype.filter.apply(self, [filter]);
		Collection.apply(instances);
		return instances;
	};

	self.order = function(_ids)
	{
		var instances = [];

		_ids.forEach(function(_id)
		{
			var instance = self.find(
			{
				_id: _id,
			})
			.first();

			if (!instance)
			{
				return;
			}

			instances.push(instance);
		});

		Collection.apply(instances);
		return instances;
	};

	self.reverse = function()
	{
		var instances = self.slice(0).reverse();
		Collection.apply(instances);
		return instances;
	};

	self.limit = function(count)
	{
		var instances = self.slice(0, count);
		Collection.apply(instances);
		return instances;
	};

	self.skip = function(count)
	{
		var instances = self.slice(count);
		Collection.apply(instances);
		return instances;
	};

	self.set = function()
	{
		var params = arguments;

		self.forEach(function(instance)
		{
			instance.set.apply(instance, params);
		});

		return self;
	};

	self.save = function(callback)
	{
		return $(self)(function(instance, callback)
		{
			return instance.save(callback);
		})
		.series(function(error)
		{
			if (!callback)
			{
				return;
			}

			return callback(error);
		});
	};

	self.destroy = function(callback)
	{
		return $(self)(function(instance, callback)
		{
			return instance.destroy(callback);
		})
		.series(function(error)
		{
			self.splice(0, self.length);
			return callback(error);
		});
	};
};

var Cursor = function(Structure, cursor)
{
	var self = this;

	self.sort = function(field, order)
	{
		var sort = {};
		sort[field] = (order == 'desc') ? -1 : 1;

		cursor.sort.apply(cursor,
		[
			sort,
		]);

		return self;
	};

	self.limit = function()
	{
		cursor.limit.apply(cursor, arguments);
		return self;
	};

	self.skip = function()
	{
		cursor.skip.apply(cursor, arguments);
		return self;
	};

	self.filter = function()
	{
		cursor.filter.apply(cursor, arguments);
		return self;
	};

	self.toCollection = function(callback)
	{
		return $(function(callback)
		{
			return cursor.toArray(callback);
		})
		(function(documents, callback)
		{
			return $(documents)(function(document, callback)
			{
				return new Instance(Structure, document, function(error)
				{
					return callback(error, this);
				});
			})
			.series(function(error, instances)
			{
				if (error)
				{
					return callback(error);
				}

				Collection.apply(instances);
				return callback(null, instances);
			});
		})
		(callback);
	};

	self.toInstance = function(callback)
	{
		return $(function(callback)
		{
			return cursor.limit(1).toArray(callback);
		})
		(function(documents, callback)
		{
			if (documents.length == 0)
			{
				return callback(null, null);
			}

			return (new Instance(Structure, documents[0], function(error)
			{
				return callback(error || null, this);
			}));
		})
		(callback);
	};

	self.count = function(callback)
	{
		return $(function(callback)
		{
			return cursor.count(true, callback);
		})
		(callback);
	};
};

var Structure = function(Storage, name, options)
{
	var self = this;
	var common = options.common || {};

	for (var something in common)
	{
		self[something] = common[something];
	}

	self.name = name;
	self.properties = options.properties || {};
	self.methods = options.methods || {};
	self.events = options.events || {};
	self.Storage = Storage;

	self.create = function(values, callback)
	{
		return (new Instance(self, values, callback));
	};

	self.find = function(options)
	{
		return (new Cursor(self, Storage.database.collection(self.name).find(options)));
	};

	self.events.initialize && self.events.initialize();
};

module.exports = function(config)
{
	var Storage =
	{
		ObjectID: ObjectID,
	};

	Storage.loadStructures = false;
	Storage.connected = false;
	Storage.database = null;
	Storage.onReady = null;
	Storage.lockQueue = $.queue();

	Storage.lock = function(task, _callback)
	{
		return Storage.lockQueue(function(callback)
		{
			return task(function(error)
			{
				callback(error);
				_callback && _callback(error);
				return null;
			});
		});
	};

	Storage.checkReady = function()
	{
		if (!Storage.connected || !Storage.loadStructures)
		{
			return false;
		}

		Storage.onReady && Storage.onReady();
		return true;
	};

	Storage.ready = function(callback)
	{
		Storage.onReady = callback;
	};

	MongoClient.connect('mongodb://' + config.host + ':' + config.port + '/' + config.name, function(error, database)
	{
		if (error)
		{
			throw error;
		}

		Storage.database = database;
		Storage.connected = true;
		Storage.checkReady();
	});

	Storage.loadStructures = function(directory)
	{
		return $(function(callback)
		{
			return fs.readdir(directory, callback);
		})
		(function(files, callback)
		{
			return $(files)(function(file, callback)
			{
				var Data = require(directory + '/' + file);
				var name = file.split('.')[0];
				Storage[name.charAt(0).toUpperCase() + name.slice(1)] = new Structure(Storage, name, new Data(Storage, global));
				return callback(null);
			})
			.parallel(function(error)
			{
				if (error)
				{
					throw error;
				}

				Storage.loadStructures = true;
				Storage.checkReady();
			});
		})
		(function(error)
		{
			throw error;
		});
	};

	Storage.close = function(callback)
	{
		return Storage.database.close(callback);
	};

	return Storage;
};
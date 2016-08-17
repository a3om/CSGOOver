var request = require('request');
var async = require('async');

module.exports = function(apiKey)
{
	return (
	{
		getAssetClassInfo: function(options, callback)
		{
			options.appId = options.appId || 730;
			options.field = options.field || 'information';
			options.instances = options.instances || [];

			var tasks = [], uniqueInstances = [];
			var result = [];

			tasks.push(function(callback) // составл€ем список уникальных экземпл€ров
			{
				options.instances.forEach(function(instance)
				{
					var exists = uniqueInstances.some(function(uniqueInstance)
					{
						return (uniqueInstance.classId == instance.classId && uniqueInstance.instanceId == instance.instanceId);
					});

					if (exists)
					{
						return;
					}

					uniqueInstances.push(instance);
				});

				return callback(null);
			});

			tasks.push(function(callback) // создаем запрос и получаем информацию от steam
			{
				if (uniqueInstances.length == 0)
				{
					return callback('success');
				}

				var data = {};
				data.appid = options.appId;

				uniqueInstances.forEach(function(uniqueInstance, index)
				{
					data['classid' + index] = uniqueInstance.classId;
					data['instanceid' + index] = uniqueInstance.instanceId;
				});

				data.class_count = uniqueInstances.length;
				data.key = apiKey;

				return request(
				{
					url: 'http://api.steampowered.com/ISteamEconomy/GetAssetClassInfo/v0001',
					method: 'GET',
					qs: data,
				},
				function(error, response, body)
				{
					if (error)
					{
						return callback(error);
					}

					if (response.statusCode !== 200)
					{
						return callback('invalidStatusCode: ' + response.statusCode);
					}

					try
					{
						var data = JSON.parse(body);
					}
					catch (error)
					{
						return callback(error);
					}

					if (data.result === undefined)
					{
						return callback('no result data');
					}

					if (data.result.success !== true)
					{
						return callback('bad response');
					}

					options.instances.forEach(function(instance)
					{
						instance[options.field] = data.result[instance.classId + (instance.instanceId > 0 ? '_' + instance.instanceId : '')];
					});

					return callback(null);
				});
			});

			return async.waterfall(tasks, function(error)
			{
				if (error)
				{
					if (error == 'success')
					{
						return callback(null);
					}

					return callback(error);
				}

				return callback(null);
			});
		},
	});
};
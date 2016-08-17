function chains()
{
	if (Object.prototype.toString.call(arguments[0]) == '[object Function]') // если первый аргумент функция
	{
		return chains.apply(null)(arguments[0]);
	}

	if (Array.isArray(arguments[0])) // если первый аргумент является массивом
	{
		var elements = arguments[0];

		return function(container)
		{
			var chain = chains().wait();

			elements.forEach(function(element, index)
			{
				if (container.length > 2)
				{
					chain(element, index, container);
				}
				else
				{
					chain(element, container);
				}
			});

			return chain;
		};
	}

	var _arguments = Array.prototype.slice.apply(arguments, [0]);
	var containers = [];
	var nextTick = true;

	function addContainer()
	{
		var _arguments = Array.prototype.slice.apply(arguments, [0]);

		if (_arguments.length < 1)
		{
			return addContainer;
		}

		if (_arguments.length < 2)
		{
			_arguments[0] && containers.push(
			{
				arguments: [],
				task: _arguments[0],
				done: false,
			});

			return addContainer;
		}
		
		_arguments[_arguments.length - 1] && containers.push(
		{
			arguments: _arguments.slice(0, -1),
			task: _arguments[_arguments.length - 1],
			done: false,
		});

		return addContainer;
	}

	var waterfall = function()
	{
		function next(index, error, _arguments)
		{
			if (error !== null && error !== undefined)
			{
				return containers[containers.length - 1]
					.task.apply(null, [error].concat(_arguments));
			}

			if (index + 1 == containers.length) // если это последний контейнер
			{
				return containers[index].task.apply(null, [null].concat(containers[index].arguments).concat(_arguments));
			}

			var onResult = function()
			{
				var _arguments = Array.prototype.slice.apply(arguments, [0]);

				if (containers[index].done)
				{
					var error = new Error('task is already done');
					error.task = containers[index].task;
					console.error(error.stack);
					return;
				}

				containers[index].done = true;

				return process.nextTick(function()
				{
					return next.apply(null, [index + 1, _arguments[0], _arguments.slice(1)]);
				});
			};

			try
			{
				var arguments = containers[index].arguments.concat(_arguments).concat(onResult);

				if (containers[index].task.length !== arguments.length)
				{
					return onResult(new Error('invalid ' + index + ' task arguments length'));
				}

				return containers[index].task.apply(null, arguments);
			}
			catch (error)
			{
				return onResult(error);
			}
		}

		return next.apply(null, [0, _arguments.length > 0 ? _arguments[0] : null, _arguments.slice(1)]);
	};

	var series = function()
	{
		var results = [];

		function next(index, error)
		{
			if (error !== null && error !== undefined)
			{
				return containers[containers.length - 1].task.apply(null, [error].concat(containers[index].arguments).concat(results));
			}

			if (index + 1 == containers.length) // если это последний контейнер
			{
				var arguments = [null].concat(containers[index].arguments);
				arguments.push(results);
				return containers[index].task.apply(null, arguments);
			}

			var onResult = function()
			{
				var _arguments = Array.prototype.slice.apply(arguments, [0]);

				if (containers[index].done)
				{
					var error = new Error('task is already done');
					error.task = containers[index].task;
					console.error(error.stack);
					return;
				}

				containers[index].done = true;
				results.push(_arguments.slice(1)[0]);

				return process.nextTick(function()
				{
					return next.apply(null, [index + 1, _arguments[0]]);
				});
			};

			var arguments = containers[index].arguments.concat(onResult);

			if (containers[index].task.length !== arguments.length)
			{
				return onResult(new Error('invalid ' + index + ' task arguments length'));
			}

			try
			{
				return containers[index].task.apply(null, arguments);
			}
			catch (error)
			{
				return onResult(error); 
			}
		}

		return next.apply(null, [0, (_arguments.length > 0) ? _arguments[0] : null, function()
		{
			var _arguments = Array.prototype.slice.apply(arguments, [0]);

			if (containers[0].done)
			{
				var error = new Error('task is already done');
				error.task = containers[0].task;
				console.error(error.stack);
				return;
			}

			containers[0].done = true;
			results.push(_arguments.slice(1)[0]);
			
			return process.nextTick(function()
			{
				return next.apply(null, [1, _arguments[0]]);
			});
		}]);
	};

	var parallel = function()
	{
		var results = [];
		var firstError = null;
		var completedCount = 0;

		return containers.slice(0, -1).forEach(function(container, index)
		{
			var onResult = function(error, result)
			{
				if (containers[index].done)
				{
					var error = new Error('task is already done');
					error.task = containers[0].task;
					console.error(error.stack);
					return;
				}

				containers[index].done = true;
				
				if (error)
				{
					firstError = firstError || error;
				}

				++completedCount;
				results[index] = result;

				if (completedCount != containers.length - 1)
				{
					return;
				}

				return process.nextTick(function()
				{
					return containers[containers.length - 1].task(firstError, results);
				});
			};

			var arguments = container.arguments.concat(onResult);

			if (container.task.length !== arguments.length)
			{
				return onResult(new Error('invalid ' + index + ' task arguments length'));
			}

			return container.task.apply(null, arguments);
		});
	};

	addContainer.wait = function()
	{
		nextTick = false;
		return addContainer;
	};

	addContainer.waterfall = function(container)
	{
		container && addContainer(container);
		nextTick = false;
		waterfall();
	};

	addContainer.series = function(container)
	{
		container && addContainer(container);
		nextTick = false;
		series();
	};

	addContainer.parallel = function(container)
	{
		container && addContainer(container);
		nextTick = false;
		parallel();
	};

	process.nextTick(function()
	{
		if (!nextTick)
		{
			return;
		}

		waterfall();
	});

	return addContainer;
};

chains.forever = function(task)
{
	var timeout = 0;
	var callback = null;

	var doTask = function()
	{
		var onResult = function(error)
		{
			if (error)
			{
				return callback && callback(error);
			}

			return setTimeout(function()
			{
				return doTask();
			},
			timeout);
		};

		try
		{
			return task.apply(null, [onResult]);
		}
		catch (error)
		{
			return onResult(error);
		}
	}

	process.nextTick(doTask);

	return function()
	{
		Array.prototype.slice.apply(arguments, [0]).forEach(function(argument)
		{
			if (Object.prototype.toString.call(argument) == '[object Function]')
			{
				callback = argument;
			}

			if (Object.prototype.toString.call(argument) == '[object Number]')
			{
				timeout = (argument >= 0) ? argument : 0;
			}
		});
	};
};

chains.queue = function(drainCallback)
{
	var containers = [];
	var drain = drainCallback;
	var inProcess = false;

	function addContainer()
	{
		if (arguments.length < 1)
		{
			return addContainer;
		}

		if (arguments.length < 2)
		{
			arguments[0] && containers.push(
			{
				task: arguments[0],
			});

			if (!inProcess)
			{
				inProcess = true;
				process.nextTick(processContainer);
			}

			return addContainer;
		}
		
		arguments[1] && containers.push(
		{
			task: arguments[1],
		});

		if (!inProcess)
		{
			inProcess = true;
			process.nextTick(processContainer);
		}

		return addContainer;
	}

	var processContainer = function()
	{
		if (containers.length == 0)
		{
			return;
		}

		containers[0].task.apply(null, [function()
		{
			containers.splice(0, 1);

			if (containers.length == 0)
			{
				inProcess = false;
				return drain && chains(null)(drain);
			}

			return process.nextTick(processContainer);
		}]);
	}

	return addContainer;
};

module.exports = chains;
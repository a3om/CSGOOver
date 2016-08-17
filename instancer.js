global.Config = require('./config');
global.Storage = require('./storage')(Config.database);
Storage.loadStructures('./structures', global);

// --------------------------------------------------

var async = require('async');
var jsdom = require('jsdom');
var requestJs = require('request');

// --------------------------------------------------

var USDToRUB = 0.0;

var loadInstancePage = function(page, callback)
{
	requestJs(
    {
        uri: 'http://steamcommunity.com/market/search/render/?query=&sort_column=name&start=' + (page * 100) + '&count=100&appid=730',
        
        headers:
        {
        	'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        	'Accept-Language': 'en-US;q=0.6,en;q=0.4',
        	'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/45.0.2454.99 Safari/537.36',
        },
    },
    function(error, httpResponse, body)
    {
    	if (error)
    	{
    		return callback(error);
    	}

    	if (httpResponse.statusCode !== 200)
    	{
    		return callback('Неудачный статус HTTP запроса: ' + httpResponse.statusCode + ' при получении страницы #' + page + ' предметов');
    	}

    	try
        {
            var response = JSON.parse(body);
        }
        catch (error)
        {
            return callback('Невозможно пропарсить JSON в теле HTTP ответа');
        }

        return callback(null, response);
    });
};

var updateInstancesInDatabase = function(instances, callback)
{
	var tasks = [], updatedCount = 0, createdCount = 0;

	instances.forEach(function(instance)
	{
		tasks.push(function(callback) // создаем или обнавляем экземпляр предмета
		{
			var tasks = [];

			tasks.push(function(callback) // ищем экземпляр предмета с таким же названием
			{
				return Storage.Instances.find(
				{
					name: instance.name,
				})
				.toInstance(callback);
			});

			tasks.push(function(databaseInstance, callback) // если не существует экземпляра, то создаем его
			{
				if (databaseInstance)
				{
					return databaseInstance.set({price: instance.cost}).save(function(error)
					{
						updatedCount += 1;
						return callback(error);
					});
				}

				return Storage.Instances.create(
				{
					name: instance.name,
					price: instance.cost,
					image: instance.image,
				})
				.save(function(error)
				{
					createdCount += 1;
					return callback(error, null);
				});
			});

			return async.waterfall(tasks, callback);
		});
	});

	return async.series(tasks, function(error)
	{
		return callback(error, createdCount, updatedCount);
	});
};

var parsePage = function(html, callback)
{
	var tasks = [];

	tasks.push(function(callback) // организуем виртуальный DOM для работы с HTML
	{
		jsdom.env(
        {
            html: '<html><body>' + html + '</body></html>',
            scripts: ['http://code.jquery.com/jquery-2.1.4.min.js'],

            done: function (error, window)
            {
            	if (error)
            	{
            		return callback(error);
            	}

         		return callback(null, window);
            },
        });
	});

	tasks.push(function(window, callback) // парсим страницу
	{
		var $ = window.$;
    	$a = $('a');
    	var instances = [];

    	$a.each(function(index, element)
        {
            $element = $(element);
            var colorRGB = $element.find('.market_listing_item_name').css('color').match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
            var hexDigits = new Array("0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f");

            var hex = function(x)
            {
                return isNaN(x) ? '00' : hexDigits[(x - x % 16) / 16] + hexDigits[x % 16];
            };

            var image = $element.find('.market_listing_item_img')
            	.attr('src')
            	.match(/http:\/\/steamcommunity-a.akamaihd.net\/economy\/image\/(.*?)\/62fx62f/)[1];

            var costUSD = parseFloat($element.find('.market_listing_their_price .market_table_value span').html().substr(1));

            instances.push(
            {
            	name: $element.find('.market_listing_item_name').text(),
            	cost: Math.floor(costUSD * USDToRUB * 100) / 100,
            	image: image,
            	color: hex(colorRGB[1]) + hex(colorRGB[2]) + hex(colorRGB[3]),
            });
        });
		
		return callback(null, instances);
	});
	
	return async.waterfall(tasks, callback);
};

var tasks = [], totalCreatedCount = 0, totalUpdatedCount = 0;

tasks.push(function(callback) // узнаем, сколько рублей стоит 1 доллар
{
	requestJs(
	{
		uri: 'https://query.yahooapis.com/v1/public/yql?q=select+*+from+yahoo.finance.xchange+where+pair+=+%22USDRUB%22&format=json&env=store%3A%2F%2Fdatatables.org%2Falltableswithkeys',
	},
	function(error, httpResponse, body)
    {
    	if (error)
    	{
    		return callback(error);
    	}

    	if (httpResponse.statusCode !== 200)
    	{
    		return callback('Неудачный статус HTTP запроса: ' + httpResponse.statusCode + ' при получении курса валют');
    	}

    	try
        {
            var response = JSON.parse(body);
        }
        catch (error)
        {
            return callback('Невозможно пропарсить JSON в теле HTTP ответа');
        }

        if (!response || !response.query || !response.query.results || !response.query.results.rate || !response.query.results.rate.Rate)
        {
        	return callback('Не найдена валюта в только что пропарсенном JSON ответе');
        }

        USDToRUB = response.query.results.rate.Rate;
        return callback(null);
    });
});

tasks.push(function(callback) // загружаем первую страницу предметов с торговой площадки стима
{
	console.log('Загружаем первую страницу предметов с торговой площадки стима...');
	return loadInstancePage(0, callback);
});

tasks.push(function(response, callback) // парсим полученные данные
{
	console.log('Парсим полученные данные...');

	return parsePage(response.results_html, function(error, instances)
	{
		var totalPages = Math.ceil(response.total_count / 100);
		console.log('Спарсили ' + instances.length + ' предметов');
		console.log('Всего предметов: ' + response.total_count + ', предметов на страницу: 100');
		console.log('Всего страниц получится: ' + totalPages);
		return callback(error, instances, totalPages);
	});
});

tasks.push(function(instances, totalPages, callback) // обновляем экземпляры предметов в базе данных
{
	// console.log('обновляем экземпляры предметов в базе данных для первой страницы');

	return updateInstancesInDatabase(instances, function(error, createdCount, updatedCount)
	{
		if (error)
		{
			return callback(error);
		}

		totalCreatedCount += createdCount;
		totalUpdatedCount += updatedCount;
		console.log('Создано: ' + createdCount + ', обновлено: ' + updatedCount);
		return callback(error, totalPages);
	});
});

tasks.push(function(totalPages, callback) // ждем 1 секунду
{
	setTimeout(function()
	{
		return callback(null, totalPages);
	},
	2000);
});

tasks.push(function(totalPages, callback) // загружаем остальные страницы предметов с торговой площадки в палаллельном режиме
{
	// console.log('загружаем остальные страницы предметов с торговой площадки в последовательном режиме');
	var page = 1;

	async.whilst(function()
	{
		return page < totalPages;
	},
	function(callback)
	{
		var tasks = [];

		if (page > 1)
		{
			tasks.push(function(callback) // ждем 5 секунд
			{
				setTimeout(function()
				{
					return callback();
				},
				10000);
			});
		}

		tasks.push(function(callback)
		{
			var tasks = [];

			tasks.push(function(callback) // загружаем данные страницы
			{
				return async.retry({times: 5, interval: 5000}, function(callback)
				{
					console.log('Загружаем данные страницы #' + page + '...');
					return loadInstancePage(page, callback);
				},
				function(error, response)
				{
					if (error)
					{
						console.log('Загрузить не вышло... ');
						console.log(error);
						return callback('error');
					}

					return callback(null, response);
				});
			});

			tasks.push(function(response, callback) // парсим полученные данные страницы
			{
				// console.log('парсим полученные данные страницы #' + page);
				return parsePage(response.results_html, callback);
			});

			tasks.push(function(instances, callback) // обновляем данные страницы в базе данных
			{
				console.log('Обновляем данные страницы ' + page + ' в базе данных');

				return updateInstancesInDatabase(instances, function(error, createdCount, updatedCount)
				{
					if (error)
					{
						return callback(error);
					}

					totalCreatedCount += createdCount;
					totalUpdatedCount += updatedCount;
					console.log('Создано: ' + createdCount + ', обновлено: ' + updatedCount);
					return callback(null);
				});
			});

			return async.waterfall(tasks, function(error)
			{
				return callback();
			});
		});
		
		tasks.push(function(callback)
		{
			++page;
			return callback();
		});

		return async.series(tasks, callback);
	},
	callback);
});

Storage.ready(function()
{
	// return loadInstancePage(0, function(error, data)
	// {
	// 	if (error)
	// 	{
	// 		return console.log(error);
	// 	}

	// 	return console.log(data.results_html);
	// });

	console.log('Начинаем обновление экземпляров предметов');

	return async.waterfall(tasks, function(error)
	{
		if (error)
		{
			console.error(error);
			return Storage.close();
		}

		console.log('Всего создано: ' + totalCreatedCount + ', всего обновлено: ' + totalUpdatedCount);
		console.log('Всего предметов: ' + (totalCreatedCount + totalUpdatedCount));
		console.log('Работа завершена.');
		return Storage.close();
	});
});
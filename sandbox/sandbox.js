var $ = require('../chains');
var request = require('request');

// ????? TGT...

var authorize = function(login, password, callback)
{
	return $(function(callback) // ???????? ?qiwi.com
	{
		return request(
		{
			uri: 'https://qiwi.ru/',
			method: 'GET',

			headers:
			{
				'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
				'Upgrade-Insecure-Requests': '1',
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/48.0.2564.103 Safari/537.36',
				'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.6,en;q=0.4',
			}
		},
		function(error, response, body)
		{
			if (error)
			{
				return callback(error);
			}

			if (response.statusCode !== 200)
			{
				return callback(new Error('invalid status code: ' + response.statusCode));
			}

			if (!response.headers['set-cookie'])
			{
				return callback(new Error('set-cookie header is not found'));
			}

			var cookies = response.headers['set-cookie'].map(function(string)
			{
				var parts = string.split(';')[0].trim().split('=');
				var object = {};
				object[parts[0]] = parts[1];
				return object;
			});

			console.log('GET https://qiwi.ru/ HTTP/1.1');
			console.log(cookies);
			return callback(null, cookies);
		});
	})
	(function(cookies, callback) // ???????? ?sso.qiwi.com
	{
		return request(
		{
			uri: 'https://sso.qiwi.com/app/proxy',
			method: 'GET',

			headers:
			{
				'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
				'Upgrade-Insecure-Requests': '1',
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/48.0.2564.103 Safari/537.36',
				'Referer': 'https://qiwi.ru/',
				'Accept-Language': 'ru;q=0.8,en-US;q=0.6,en;q=0.4',
			},

			qs:
			{
				v: 1,
			},
		},
		function(error, response, body)
		{
			if (error)
			{
				return callback(error);
			}

			if (response.statusCode !== 200)
			{
				return callback(new Error('invalid status code: ' + response.statusCode));
			}

			if (!response.headers['set-cookie'])
			{
				return callback(new Error('set-cookie header is not found'));
			}

			var ssoCookies = response.headers['set-cookie'].map(function(string)
			{
				var parts = string.split(';')[0].trim().split('=');
				var object = {};
				object[parts[0]] = parts[1];
				return object;
			});

			console.log('GET https://sso.qiwi.com/app/proxy?v=1 HTTP/1.1');
			console.log(ssoCookies);
			return callback(null, cookies, ssoCookies);
		});
	})
	(function(cookies, ssoCookies, callback) // ?????????????sso.qiwi.com
	{
		console.log(ssoCookies.reduce(function(cookie, currentCookie, index, cookies)
		{
			return currentCookie == 'JSESSIONID' ? ['JSESSIONID', cookies[currentCookie]].join('=') : cookie;
		},
		null));
		
		return request(
		{
			uri: 'https://sso.qiwi.com/cas/tgts',
			method: 'POST',
			json: true,

			headers:
			{
				'Accept': 'application/vnd.qiwi.sso-v1+json',
				'Origin': 'https://qiwi.ru',
				'Accept-Language': 'ru;q=0.8,en-US;q=0.6,en;q=0.4',
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/48.0.2564.103 Safari/537.36',
				'Referer': 'https://qiwi.ru/',

				'Cookie': ssoCookies.reduce(function(cookie, currentCookie, index, cookies)
				{
					return currentCookie == 'JSESSIONID' ? ['JSESSIONID', cookies[currentCookie]].join('=') : cookie;
				},
				null),
			},

			body:
			{
				login: login,
				password: password,
			},
		},
		function(error, response, body)
		{
			if (error)
			{
				return callback(error);
			}

			if (response.statusCode !== 201)
			{
				return callback(new Error('invalid status code: ' + response.statusCode));
			}

			if (!response.headers['set-cookie'])
			{
				return callback(new Error('set-cookie header is not found'));
			}

			console.log('Всё гуд!');

			var ssoCookies = response.headers['set-cookie'].map(function(string)
			{
				var parts = string.split(';')[0].trim().split('=');
				var object = {};
				object[parts[0]] = parts[1];
				return object;
			});

			console.log('POST https://sso.qiwi.com/cas/tgts HTTP/1.1');
			console.log(ssoCookies);
			return callback(null, cookies, ssoCookies, body.entity.ticket);
		});
	})
	(function(cookies, ssoCookies, ticket0, callback) // ???????? ????sso.qiwi.com
	{
		return request(
		{
			uri: 'https://sso.qiwi.com/cas/sts',
			method: 'POST',
			json: true,

			headers:
			{
				'Accept': 'application/vnd.qiwi.sso-v1+json',
				'Origin': 'https://sso.qiwi.com',
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/48.0.2564.103 Safari/537.36',
				'Referer': 'https://sso.qiwi.com/app/proxy?v=1',
				'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.6,en;q=0.4',

				'Cookie': ssoCookies.map(function(cookie, index, cookies)
				{
					return [cookie, cookies[cookie]].join('=');
				})
				.join('; '),
			},

			body:
			{
				ticket: ticket0,
				service: 'https://qiwi.ru/j_spring_cas_security_check',
			},
		},
		function(error, response, body)
		{
			if (error)
			{
				return callback(error);
			}

			if (response.statusCode !== 200)
			{
				return callback(new Error('invalid status code: ' + response.statusCode));
			}

			var ssoCookies = response.headers['set-cookie'].map(function(string)
			{
				var parts = string.split(';')[0].trim().split('=');
				var object = {};
				object[parts[0]] = parts[1];
				return object;
			});

			return callback(null, cookies, ssoCookies, ticket0, body.entity.ticket);
		});
	})
	(function(cookies, ssoCookies, ticket0, ticket1, callback) // ????? ??????????
	{
		console.log('POST https://sso.qiwi.com/cas/sts HTTP/1.1');
		console.log(ssoCookies);

		return request(
		{
			uri: 'https://sso.qiwi.com/cas/sts',
			method: 'POST',
			json: true,

			headers:
			{
				'Accept': 'application/vnd.qiwi.sso-v1+json',
				'Origin': 'https://qiwi.ru',
				'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.6,en;q=0.4',
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/48.0.2564.103 Safari/537.36',
				'Referer': 'https://sso.qiwi.com/app/proxy?v=1',

				'Cookie': ssoCookies.map(function(cookie, index, cookies)
				{
					return [cookie, cookies[cookie]].join('=');
				})
				.join('; '),
			},

			body:
			{
				ticket: ticket0,
				service: 'https://qiwi.ru/j_spring_cas_security_check',
			},
		},
		function(error, response, body)
		{
			if (error)
			{
				return callback(error);
			}

			if (response.statusCode !== 200)
			{
				return callback(new Error('invalid status code: ' + response.statusCode));
			}

			var ssoCookies = response.headers['set-cookie'].map(function(string)
			{
				var parts = string.split(';')[0].trim().split('=');
				var object = {};
				object[parts[0]] = parts[1];
				return object;
			});

			return callback(null, cookies, ssoCookies, ticket0, body.entity.ticket);
		});
	})
	(function(cookies, ssoCookies, ticket0, ticket1, callback) // ????? ??????????
	{
		console.log('POST https://sso.qiwi.com/cas/sts HTTP/1.1');
		console.log(ssoCookies);

		return request(
		{
			uri: 'https://qiwi.ru/j_spring_cas_security_check',
			method: 'GET',
			json: true,

			headers:
			{
				'Accept': 'application/json, text/javascript, */*; q=0.01',
				'X-Requested-With': 'XMLHttpRequest',
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/48.0.2564.103 Safari/537.36',
				'Referer': 'https://qiwi.ru/',
				'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.6,en;q=0.4',

				'Cookie': cookies.map(function(cookie, index, cookies)
				{
					return [cookie, cookies[cookie]].join('=');
				})
				.join('; '),
			},

			qs:
			{
				ticket: ticket1,
			},
		},
		function(error, response, body)
		{
			if (error)
			{
				return callback(error);
			}

			if (response.statusCode !== 200)
			{
				return callback(new Error('invalid status code: ' + response.statusCode));
			}

			if (body.code.value != '0')
			{
				return callback(new Error('invalid qiwi code: ' + body.code.value));
			}

			return callback(null, cookies, ssoCookies, ticket0, ticket1);
		});
	})
	(function(cookies, ssoCookies, ticket0, ticket1, callback) // ???????????? ??????? ????
	{
		console.log('POST https://sso.qiwi.com/cas/tgts HTTP/1.1');
		console.log(ssoCookies);

		return request(
		{
			uri: 'https://qiwi.ru/main.action',
			method: 'GET',

			headers:
			{
				'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
				'Upgrade-Insecure-Requests': '1',
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/48.0.2564.103 Safari/537.36',
				'Referer': 'https://qiwi.ru/',
				'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.6,en;q=0.4',

				'Cookie': cookies.map(function(cookie, index, cookies)
				{
					return [cookie, cookies[cookie]].join('=');
				})
				.join('; '),
			},
		},
		function(error, response, body)
		{
			if (error)
			{
				return callback(error);
			}

			if (response.statusCode !== 200)
			{
				return callback(new Error('invalid status code: ' + response.statusCode));
			}

			return callback(null, cookies, ssoCookies, ticket0, ticket1);
		});
	})
	(function(cookies, ssoCookies, ticket0, ticket1, callback) // ????? ??? ?sso.qiwi.com
	{
		return request(
		{
			uri: 'https://sso.qiwi.com/app/proxy',
			method: 'GET',

			headers:
			{
				'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
				'Upgrade-Insecure-Requests': '1',
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/48.0.2564.103 Safari/537.36',
				'Referer': 'https://qiwi.ru/',
				'Accept-Language': 'ru;q=0.8,en-US;q=0.6,en;q=0.4',

				'Cookie': [ssoCookies.reduce(function(cookie, currentCookie, index, cookies)
				{
					return currentCookie == 'JSESSIONID' ? cookies[currentCookie] : cookie;
				},
				null),
				{
					CASTGC: ticket0,
				}]
				.map(function(cookie, index, cookies)
				{
					return [cookie, cookies[cookie]].join('=');
				})
				.join('; '),
			},

			qs:
			{
				v: 1,
			},
		},
		function(error, response, body)
		{
			if (error)
			{
				return callback(error);
			}

			if (response.statusCode !== 200)
			{
				return callback(new Error('invalid status code: ' + response.statusCode));
			}

			if (!response.headers['set-cookie'])
			{
				return callback(new Error('set-cookie header is not found'));
			}

			var ssoCookies = response.headers['set-cookie'].map(function(string)
			{
				var parts = string.split(';')[0].trim().split('=');
				var object = {};
				object[parts[0]] = parts[1];
				return object;
			});

			return callback(null, cookies, ssoCookies);
		});
	})
	(callback);
};

var person = function(cookies, callback)
{
	return request(
	{
		uri: 'https://qiwi.ru/person/state.action',
		method: 'POST',
		json: true,

		headers:
		{
			'Accept': 'application/json, text/javascript, */*; q=0.01',
			'Origin': 'https://qiwi.ru',
			'X-Requested-With': 'XMLHttpRequest',
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/48.0.2564.103 Safari/537.36',
			'Referer': 'https://qiwi.ru/main.action',
			'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.6,en;q=0.4',

			'Cookie': cookies.map(function(cookie, index, cookies)
			{
				return [cookie, cookies[cookie]].join('=');
			})
			.join('; '),
		},
	},
	function(error, response, body)
	{
		if (response.statusCode !== 200)
		{
			return callback(new Error('invalid status code: ' + response.statusCode));
		}

		if (body.code.value != '0')
		{
			console.log(body);
			return callback(new Error('invalid qiwi code: ' + body.code.value));
		}

		return callback(null, body.data);
	});
};

$(function(callback)
{
	return authorize('+79503244917', 'asgke359', callback);
})
(function(cookies, ssoCookies, callback)
{
	console.log(cookies, ssoCookies);
	return person(cookies, callback);
})
(function(data, callback)
{
	console.log(data);
	return callback(null);
})
(function(error)
{
	console.log(error.stack);
});
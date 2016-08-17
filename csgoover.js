global.Config = require('./config');
global.Storage = require('./storage')(Config.database);
global.$ = require('./chains');
Storage.loadStructures('./structures', global);

// --------------------------------------------------

global.fs = require('fs');
var express = require('express');
var expressSession = require('express-session');
var cookieParser = require('cookie-parser');
var Service = express();
var ejsMate = require('ejs-mate');
var bodyParser = require('body-parser');
var steam = require('./steam')(Config.APIKey);
var passport = require('passport');
var SteamStrategy = require('passport-steam').Strategy;
var VKontakteStrategy = require('passport-vkontakte').Strategy;
global.io = require('socket.io')(Config.socket.port);
var crypto = require('crypto');
global.request = require('request');
var qiwi = require('./qiwi')(Config.qiwi);

// --------------------------------------------------

global.CostToTicket = 0.01;
global.MaximumUserInventoryItemsCount = 32;

// --------------------------------------------------

var Zones =
{
	tape:
	{
		currentGame: null,
		lastGame: null,

		processCurrentGame: function(game, callback)
		{
			var self = this;

			if (game.state == Storage.TapeGames.states.justCreated) // 
			{
				if (game.users.length <= 1)
				{
					return callback(null);
				}

				return game.start(function(error)
				{
					if (error)
					{
						return callback(error);
					}

					return self.update('startGame', callback);
				});
			}

			if (game.state == Storage.TapeGames.states.started)
			{
				if (game.updatedAt + Storage.TapeGames.gameTime >= getTime())
				{
					return callback(null);
				}

				return game.startTape(function(error)
				{
					if (error)
					{
						return callback(error);
					}

					return self.update('tapeGame', callback);
				});
			}

			if (game.state == Storage.TapeGames.states.taped)
			{
				if (game.updatedAt + Storage.TapeGames.tapeTime >= getTime())
				{
					return callback(null);
				}

				return $(function(callback)
				{
					return game.complete(callback);
				})
				(function(callback)
				{
					Zones.tape.lastGame = game;
					return callback(null);
				})
				(function(callback)
				{
					Data.tape.gamesCount += 1;
					return Data.save(callback);
				})
				(function(callback) // создаем новую пустую игру
				{
					return Storage.TapeGames.create(
					{
						id: Data.tape.gamesCount,
						updatedAt: getTime(),
						random: Math.random(),
					})
					.save(function(error)
					{
						return callback(error, this);
					});
				})
				(function(tapeGame, callback)
				{
					Zones.tape.currentGame = tapeGame;
					return callback(null);
				})
				(function(callback)
				{
					return self.update('newGame', callback)
				})
				(callback);
			}

			// console.log(game);
			return callback(null);
		},

		update: function(event, callback)
		{
			var self = this;
			var tapeGame = self.currentGame;
			var lastTapeGame = self.lastGame;
			
			io.emit('tape.update',
			{
				game:
				{
					id: tapeGame.id,
					state: tapeGame.state,
					updatedAt: tapeGame.updatedAt,
					sum: tapeGame.sum,

					users: tapeGame.users.map(function(gameUser)
					{
						return (
						{
							name: gameUser.name,
							percent: gameUser.percent,
							sum: gameUser.sum,
							steamId64: gameUser.steamId64,
							avatarMedium: gameUser.avatarMedium,
							avatarLarge: gameUser.avatarLarge,
							itemsCount: gameUser.itemsCount,
							first: gameUser.first,
						});
					}),

					items: tapeGame.items.map(function(gameItem)
					{
						return (
						{
							name: gameItem.name,
							price: gameItem.price,
							image: gameItem.image,
							user: gameItem.user,
							color: gameItem.color,
							quality: gameItem.quality,
							category: gameItem.category,
							categoryColor: gameItem.categoryColor,
							exterior: gameItem.exterior,
						});
					}),

					tape: tapeGame.tape,
					tapeWinnerRandom: tapeGame.tapeWinnerRandom,
					updatedAt: tapeGame.updatedAt,
				},

				lastWinner: lastTapeGame ? (function()
				{
					return (
					{
						winSum: lastTapeGame.winSum,
						
						user: (function()
						{
							var foundGameUser = null;

							lastTapeGame.users.forEach(function(gameUser)
							{
								if (foundGameUser || gameUser.steamId64 != lastTapeGame.winner)
								{
									return;
								}

								foundGameUser = gameUser;
							});

							return (
							{
								name: foundGameUser.name,
								percent: foundGameUser.percent,
								avatarLarge: foundGameUser.avatarLarge,
							});
						})
						(),
					});
				})
				() : null,

				event: event,
				gameTime: Storage.TapeGames.gameTime,
				tapeTime: Storage.TapeGames.tapeTime,
				now: getTime(),
			});

			return callback(null);
		},
	},

	market:
	{
		//
	},
};

global.Data = null;

global.getTime = function()
{
	return Math.floor(Date.now() / 1000);
};

var SuitableBotA = null;

// --------------------------------------------------

var processInboundTransfers = function(callback)
{
	return Storage.lock(function(callback)
	{
		return $(function(callback) // получаем входящие предложения обмена
		{
			return Storage.InboundTransfers.find().toCollection(callback);
		})
		(function(inboundTransfers, callback)
		{
			return $(inboundTransfers)(function(inboundTransfer, callback)
			{
				return processInboundTransfer(inboundTransfer, callback);
			})
			.series(callback);
		})
		(function(error)
		{
			if (error && error != 'success')
			{
				console.error(error.stack);
			}

			return callback(null);
		});
	},
	callback);
};

var processInboundTransfer = function(inboundTransfer, callback)
{
	if (inboundTransfer.state == Storage.InboundTransfers.states.justCreated) // необходимо решение по принятию
	{
		return $(function(callback) // проверяем пользователя ставки на существованеи в нашей базе данных
		{
			return $(function(callback)
			{
				return Storage.Users.find(
				{
					steamId64: inboundTransfer.sender,
				})
				.toInstance(callback);
			})
			(function(user, callback)
			{
				if (user) // если нет пользователя, отказываем в ставке
				{
					return callback(null);
				}

				return inboundTransfer.set(
				{
					accept: false,
					reason: 'userIsNotFound',
					state: Storage.InboundTransfers.states.accept,
				})
				.save(function(error)
				{
					if (error)
					{
						return callback(error);
					}

					return processInboundTransfer(inboundTransfer, function(error)
					{
						return callback(error || 'success');
					});
				});
			})
			(callback);
		})
		(function(callback)
		{
			return inboundTransfer.set(
			{
				state: Storage.InboundTransfers.states.needLinkItemsToInstances,
			})
			.save(function(error)
			{
				if (error)
				{
					return callback(error);
				}

				return processInboundTransfer(inboundTransfer, function(error)
				{
					return callback(error || 'success');
				});
			});
		})
		(function(error)
		{
			if (error && error != 'success')
			{
				return callback(error);
			}

			return callback(null);
		});
	}

	if (inboundTransfer.state == Storage.InboundTransfers.states.needLinkItemsToInstances)
	{
		return $(function(callback) // получаем все предметы ПО из базы данных
		{
			return Storage.Items.find(
			{
				_id:
				{
					$in: inboundTransfer.items,
				},
			})
			.toCollection(callback);
		})
		(function(items, callback) // если какие-то предметы по classId и instanceId найти не удалось, ищем по названию
		{
			return $(function(callback) // получаем информацию для каждого из неизвестных предметов со стима
			{
				return steam.getAssetClassInfo(
				{
					appId: 730,
					instances: items,
				},
				function(error)
				{
					if (error == 'bad response')
					{
						return callback('notFoundInstanceForItem');
					}

					return callback(error);
				});
			})
			(function(callback) // проходимся по неизвестным предметам и пытаемся связать их по названию с экземплярами
			{
				return $(items)(function(item, callback)
				{
					item.set(
					{
						name: item.information.market_name,
						image: item.information.icon_url,
					});

					for (var tag in item.information.tags)
					{
						if (item.information.tags[tag].category_name == 'Type')
						{
							item.type = item.information.tags[tag].name;
						}

						if (item.information.tags[tag].category_name == 'Weapon')
						{
							item.weapon = item.information.tags[tag].name;
						}

						if (item.information.tags[tag].category_name == 'Collection')
						{
							item.collection = item.information.tags[tag].name;
						}

						if (item.information.tags[tag].category_name == 'Category')
						{
							item.categoryColor = item.information.tags[tag].color;
							item.category = item.information.tags[tag].name;
						}

						if (item.information.tags[tag].category_name == 'Quality')
						{
							item.qualityColor = item.information.tags[tag].color;
							item.quality = item.information.tags[tag].name;
							item.qualityIndex = Storage.Items.qualities.indexOf(item.information.tags[tag].name);
						}

						if (item.information.tags[tag].category_name == 'Exterior')
						{
							item.exterior = item.information.tags[tag].name;
						}
					}

					item.information.stickerNames = [];
					item.information.stickerImages = [];

					for (var description in item.information.descriptions) // поиск наклеек
					{
						if (!item.information.descriptions[description].value)
						{
							continue;
						}

						var string = item.information.descriptions[description].value;

						if (string.indexOf('\"sticker_info\"') < 0)
						{
							continue;
						}

						var startStickerNamesindex = string.indexOf('Sticker: ');

						if (startStickerNamesindex < 0)
						{
							continue;
						}

						var stickerNames = string.slice(startStickerNamesindex + 9, -15).split(',').map(function(name)
						{
							return 'Sticker | ' + name.trim();
						});

						item.information.stickerNames = item.information.stickerNames.concat(stickerNames);

						var regexp = /<img width=64 height=48 src=\"(.*?)\">/g;
						var stickerImages = [];

						for (var result = regexp.exec(string); result; result = regexp.exec(string))
						{
							stickerImages.push(result[1]);
						}

						item.information.stickerImages = item.information.stickerImages.concat(stickerImages);
					}

					if (item.information.stickerNames.length == 0)
					{
						return callback(null);
					}

					if (item.information.stickerNames.length !== item.information.stickerImages.length)
					{
						return callback(null);
					}

					item.stickers = item.information.stickerNames.map(function(name, index)
					{
						return (
						{
							name: name,
							image: item.information.stickerImages[index],
						});
					});
					
					return callback(null);
				})
				.series(function(error)
				{
					if (error)
					{
						return callback(error);
					}

					return items.save(callback);
				});
			})
			(callback);
		})
		(function(error)
		{
			if (error)
			{
				if (error == 'notFoundInstanceForItem')
				{
					return inboundTransfer.set(
					{
						accept: false,
						reason: 'notFoundInstanceForItem',
						state: Storage.InboundTransfers.states.accept,
					})
					.save(callback);
				}

				return callback(error);
			}

			return inboundTransfer.set(
			{
				state: Storage.InboundTransfers.states.needCheckWithInUser,
			})
			.save(callback);
		});
	}

	if (inboundTransfer.state == Storage.InboundTransfers.states.needCheckWithInUser)
	{
		return $(function(callback) // получаем все предметы ПО из базы данных
		{
			return Storage.Items.find(
			{
				_id:
				{
					$in: inboundTransfer.items,
				},
			})
			.toCollection(callback);
		})
		(function(items, callback) // получаем пользователя входящего предложения обмена
		{
			return Storage.Users.find(
			{
				steamId64: inboundTransfer.sender,
			})
			.toInstance(function(error, user)
			{
				return callback(error, user, items);
			});
		})
		(function(user, items, callback)
		{
			if (!user.accessToken) // проверка на наличие трейд-токена
			{
				console.log('Отказали во входящем трансфере из-за отсутствия аксесс-токена у пользователя');

				return inboundTransfer.set(
				{
					accept: false,
					reason: 'userDoNotHaveAccessToken',
					state: Storage.InboundTransfers.states.accept,
				})
				.save(function(error)
				{
					if (error)
					{
						return callback(error);
					}

					return processInboundTransfer(inboundTransfer, function(error)
					{
						return callback(error || 'success');
					});
				});
			}

			return callback(null, user, items);
		})
		(function(user, items, callback) // получаем количество предметов пользователя в нашей системе
		{
			return Storage.Items.find(
			{
				user: user.steamId64,

				state:
				{
					$in:
					[
						Storage.Items.states.reserved,
						Storage.Items.states.real,
						Storage.Items.states.transmitting,
					],
				},
			})
			.count(function(error, count)
			{
				return callback(error, user, items, count);
			});
		})
		(function(user, items, userItemsCount, callback) // проверяем на ограничения для одного пользователя
		{
			if (user.admin)
			{
				return callback(null, user, items);
			}

			if (userItemsCount + items.length > MaximumUserInventoryItemsCount)
			{
				console.log('Отказали во входящем трансфере из-за превышения максимального количества предметов в инвентаре пользователя');

				return inboundTransfer.set(
				{
					accept: false,
					reason: 'doNotHaveEnoughFreeSlotsInUserInventoryToStoreItems',
					state: Storage.InboundTransfers.states.accept,
				})
				.save(function(error)
				{
					if (error)
					{
						return callback(error);
					}

					return processInboundTransfer(inboundTransfer, function(error)
					{
						return callback(error || 'success');
					});
				});
			}

			return callback(null, user, items);
		})
		(function(user, items, callback) // резервируем предметы этого предложения обмена
		{
			return items.set(
			{
				state: Storage.Items.states.reserved, // зарезервированный для принятия, но виртуальный
			})
			.save(function(error)
			{
				return callback(error, user);
			});
		})
		(function(user, callback) // вызываем событие "у пользователя обновился инвентарь"
		{
			return user.emit('updateInventory', [callback]);
		})
		(function(callback) // закончили все проверки, необходимо сохранить предложение обмена и принимать его
		{
			return inboundTransfer.set(
			{
				accept: true,
				state: Storage.InboundTransfers.states.accept,
			})
			.save(function(error)
			{
				if (error)
				{
					return callback(error);
				}

				return processInboundTransfer(inboundTransfer, function(error)
				{
					return callback(error || 'success');
				});
			});
		})
		(function(error)
		{
			if (error && error != 'success')
			{
				return callback(error);
			}

			return callback(null);
		});
	}

	if (inboundTransfer.state == Storage.InboundTransfers.states.accept) // сообщаем Контроллеру о результатах принятия
	{
		console.log('[<<<] acceptInboundTransfer',
		{
			_id: inboundTransfer.id,
			accept: inboundTransfer.accept,
		});

		Controller.emit('acceptInboundTransfer',
		{
			_id: inboundTransfer.id,
			accept: inboundTransfer.accept,
		});

		return callback(null);
	}

	if (inboundTransfer.state == Storage.InboundTransfers.states.answerAboutAccept)
	{
		return callback(null);
	}

	if (inboundTransfer.state == Storage.InboundTransfers.states.hasNewState) // решаем, что делать дальше с предложением обмена
	{
		return $(function(callback)
		{
			return Storage.Items.find(
			{
				_id:
				{
					$in: inboundTransfer.items,
				},
			})
			.toCollection(callback);
		})
		(function(items, callback) // обновляем состояния предметов
		{
			return items.set(
			{
				state: (inboundTransfer.steamState == 3) ? Storage.Items.states.real : Storage.Items.states.notExistent,
			})
			.save(callback);
		})
		(function(callback) // получаем пользователя входящего трансфера
		{
			return Storage.Users.find(
			{
				steamId64: inboundTransfer.sender,
			})
			.toInstance(callback);
		})
		(function(user, callback)
		{
			return user.emit('updateInventory', [callback]);
		})
		(function(error)
		{
			if (error && error != 'success')
			{
				return callback(error);
			}

			return inboundTransfer.set(
			{
				state: Storage.InboundTransfers.states.notNeedAnymore,
			})
			.save(callback);
		});
	}

	if (inboundTransfer.state == Storage.InboundTransfers.states.notNeedAnymore)
	{
		return callback(null);
	}

	return callback(new Error('Неизвестное состояние входящего трансфера: ' + inboundTransfer.state));
};

var processOutboundTransfers = function(callback)
{
	return Storage.lock(function(callback)
	{
		return $(function(callback) // получаем входящие предложения обмена
		{
			return Storage.OutboundTransfers.find().toCollection(callback);
		})
		(function(outboundTransfers, callback)
		{
			$(outboundTransfers)(function(outboundTransfer, callback)
			{
				return processOutboundTransfer(outboundTransfer, callback);
			})
			.series(callback);
		})
		(function(error)
		{
			if (error && error != 'success')
			{
				console.error(error.stack);
			}

			return callback(null);
		});
	},
	callback);
};

var processOutboundTransfer = function(outboundTransfer, callback)
{
	if (outboundTransfer.state == Storage.OutboundTransfers.states.justCreated)
	{
		return $(function(callback) // получаем предметы исходящего трансфера
		{
			return Storage.Items.find(
			{
				_id:
				{
					$in: outboundTransfer.items,
				},
			})
			.toCollection(callback);
		})
		(function(items, callback)
		{
			items = items.order(outboundTransfer.items); // восстанавливаем порядок предметов исходя из их _id
			console.log('[запрос] createOutboundTransfer');

			Controller.emit('createOutboundTransfer',
			{
				index: outboundTransfer._id,
				
				items: items.map(function(item)
				{
					return item.id;
				}),
				
				receiver: outboundTransfer.receiver,
				accessToken: outboundTransfer.accessToken,
				cancel: 60,
			});

			return callback(null);
		})
		(callback);
	}

	if (outboundTransfer.state == Storage.OutboundTransfers.states.createdInController) // ожидаем изменения состояния исходящего трансфера
	{
		return callback(null);
	}

	if (outboundTransfer.state == Storage.OutboundTransfers.states.hasId) // ожидаем изменения состояния предложения обмена
	{
		return callback(null);
	}

	if (outboundTransfer.state == Storage.OutboundTransfers.states.hasNewState) // трансфер имеет новое состояние
	{
		return $(function(callback) // получаем предметы выплаты
		{
			return Storage.Items.find(
			{
				_id:
				{
					$in: outboundTransfer.items,
				},
			})
			.toCollection(callback);
		})
		(function(items, callback) // обновляем состояния предметов
		{
			return items.set(
			{
				state: (outboundTransfer.steamState == 3) ? Storage.Items.states.notExistent : Storage.Items.states.real,
			})
			.save(callback);
		})
		(function(callback) // переводим трансфер в новое состояние
		{
			return outboundTransfer.set(
			{
				state: Storage.OutboundTransfers.states.notNeedAnymore,
			})
			.save(callback);
		})
		(function(callback)
		{
			return Storage.Users.find(
			{
				steamId64: outboundTransfer.receiver,
			})
			.toInstance(callback);
		})
		(function(user, callback)
		{
			return user.emit('updateInventory', [function(error)
			{
				return callback(error, user);
			}]);
		})
		(function(user, callback)
		{
			return user.emit('updateOutboundTransfer', [outboundTransfer, callback]);
		})
		(callback);
	}

	if (outboundTransfer.state == Storage.OutboundTransfers.states.notNeedAnymore) // трансфер больше не нужен
	{
		return callback(null);
	}

	return callback(new Error('Неизвестное состояние исходящего трансфера: ' + outboundTransfer.state));
};

// --------------------------------------------------

var getFreeBotA = function(callback)
{
	return request(
	{
		uri: 'http://' + Config.controller.host + ':' + Config.controller.expressPort + '/getBotA',
	},
	function(error, response, body)
	{
		if (error)
		{
			return callback(error);
		}

		if (response.statusCode != 200)
		{
			return callback(new Error('Invalid status code: ' + response.statusCode));
		}

		try
		{
			body = JSON.parse(body);
		}
		catch (error)
		{
			return callback(error);
		}

		if (!body.bot)
		{
			return callback(new Error('Cannot found bot field in response'));
		}

		return callback(null, body.bot);
	});
};

// --------------------------------------------------

Service.engine('ejs', ejsMate);
Service.set('view engine', 'ejs');
Service.set('views', __dirname + '/views');

Service.use(bodyParser.json());

Service.use(bodyParser.urlencoded(
{
	extended: true,
}));

Service.use(cookieParser('I am a cookie secret code :3 t34tv4fwhj'));

Service.use(expressSession(
{
    resave: false,
    saveUninitialized: false,
    secret: 'I am a session secret code :3 r4y3t54y54',
    name: 'session',
}));

Service.use(passport.initialize());
Service.use(passport.session());

// --------------------------------------------------

Service.use(function(request, response, next)
{
	if (!request.signedCookies.steamId64)
	{
		request.User = null;
		return next();
	}

	return Storage.Users.find(
	{
		steamId64: request.signedCookies.steamId64,
	})
	.toInstance(function(error, user)
	{
		if (error)
		{
			console.error(error.stack);
			request.User = null;
			return next();
		}

		if (!user)
		{
			console.log('Не найден пользователь с таким steamId64: ' + request.signedCookies.steamId64);
			request.User = null;
			return next();
		}

		if (user.secretKey !== request.signedCookies.secretKey)
		{
			console.log('Неверный код безопасности для пользователя со steamId64: ' + request.signedCookies.steamId64 + ' (ключ: ' + request.signedCookies.secretKey + ')');
			request.User = null;
			return next();
		}

		request.User = user;
		return next();
	});
});

// --------------------------------------------------

passport.use(new SteamStrategy(
{
	returnURL: 'http://' + Config.host + '/login/return',
	realm: 'http://' + Config.host + '/',
	apiKey: Config.APIKey,
},
function(identifier, profile, done)
{
	return process.nextTick(function()
	{
		profile.identifier = identifier;
		return done(null, profile);
	});
}));

passport.use(new VKontakteStrategy(
{
	clientID:     5252643,
	clientSecret: '3XLGRYoGIipBsAliWq73',
	callbackURL:  'http://' + Config.host + '/vkontakte/return',
},
function(accessToken, refreshToken, profile, done)
{
	return process.nextTick(function()
	{
		return done(null, profile);
	});
}));

Service.get('/vkontakte/login', function(request, response, next)
{
	request.session.afterLoginRedirect = request.query.back;
	return next();
},
passport.authenticate('vkontakte'), function(req, res)
{
    // The request will be redirected to vk.com for authentication, so
    // this function will not be called.
});

Service.get('/vkontakte/return', passport.authenticate('vkontakte',
{
	session: false,
	failureRedirect: '/vkontakte/login',
}),
function(request, response)
{
	if (!request.User)
	{
		return response.redirect('/' + (request.session.afterLoginRedirect ? '#' + request.session.afterLoginRedirect : ''));
	}

	return Storage.lock(function(callback)
	{
		return $(function(callback)
		{
			return request.User.getInstance(callback);
		})
		(function(user, callback)
		{
			return user.set(
			{
				VKontakte: request.user.id,
			})
			.save(callback);
		})
		(function(error)
		{
			request.session.notificate =
			{
				name: 'VKPageWasAttached',
			};

			response.redirect('/' + (request.session.afterLoginRedirect ? '#' + request.session.afterLoginRedirect : ''));
			return callback(null);
		});
	});
});

Service.get('/login', function(request, response, next)
{
	request.session.afterLoginRedirect = request.query.back;
	return next();
},
passport.authenticate('steam',
{
	failureRedirect: '/failure',
}),
function(request, response)
{
	console.log('login redirect');
	return response.redirect('/');
});

Service.get('/login/return', passport.authenticate('steam',
{
	session: false,
	failureRedirect: '/failure',
}),
function(request, response) // создаем или обновляем пользователя Steam
{
	console.log('Создаем или обновляем пользоваетля Steam...');

	return $(function(callback)
	{
		return Storage.Users.find(
		{
			steamId64: request.user._json.steamid,
		})
		.toInstance(callback);
	})
	(function(user, callback)
	{
		if (user)
		{
			return user.set(
			{
				name: request.user._json.personaname,
				avatarMedium: request.user._json.avatarmedium,
				avatarLarge: request.user._json.avatarfull,
			})
			.save(function(error)
			{
				return callback(error, user);
			});
		}

		return $(function(callback)
		{
			return crypto.randomBytes(50, function(error, buffer)
	        {
	        	if (error)
	        	{
	        		return callback(error);
	        	}

	        	return callback(null, buffer.toString('hex'));
	        });
		})
		(function(secretKey, callback)
		{
			return Storage.Users.create(
			{
				steamId64: request.user._json.steamid,
				steamId32: (request.user._json.steamid.length === 17) ? (request.user._json.steamid.substr(3) - 61197960265728) : ('765' + (request.user._json.steamid + 61197960265728)),
				name: request.user._json.personaname,
				avatarMedium: request.user._json.avatarmedium,
				avatarLarge: request.user._json.avatarfull,
				secretKey: secretKey,
			})
			.save(function(error)
			{
				return callback(error, this);
			});
		})
		(callback);
	})
	(function(error, user)
	{
		if (error)
		{
			console.error(error.stack);
		}

		response.cookie('steamId64', user.steamId64,
		{
			maxAge: 2678400 * 1000,
			signed: true,
		});

		response.cookie('secretKey', user.secretKey,
		{
			maxAge: 2678400 * 1000,
			signed: true,
		});

		return response.redirect('/' + (request.session.afterLoginRedirect ? '#' + request.session.afterLoginRedirect : ''));
	});
});

Service.get('/logout', function(request, response)
{
	console.log('logout');
	response.clearCookie('steamId64');
	response.clearCookie('secretKey');
	return response.redirect('/' + (request.query.back ? '#' + request.query.back : ''));
});

// --------------------------------------------------

var chain = $().wait();

// --------------------------------------------------

chain(function(callback) // загружаем глобальные данные
{
	return $(function(callback)
	{
		return fs.readFile('./data.json', callback);
	})
	(function(data, callback)
	{
		try
		{
			Data = JSON.parse(data);
		}
		catch (error)
		{
			console.log('Ошибка чтения глобальных данных');
			return callback(error);
		}

		Data.save = function(callback)
		{
			return fs.writeFile('./data.json', JSON.stringify(Data, null, '\t'), callback);
		};

		return callback(null);
	})
	(callback);
});

chain(function(callback) // инициализация рулетки
{
	return Storage.TapeGames.find(
	{
		state:
		{
			$in:
			[
				Storage.TapeGames.states.justCreated,
				Storage.TapeGames.states.started,
				Storage.TapeGames.states.taped,
			],
		},
	})
	.toInstance(function(tapeGame, callback)
	{
		if (tapeGame)
		{
			Zones.tape.currentGame = tapeGame;
			return callback(null);
		}

		return $(function(callback)
		{
			Data.tape.gamesCount += 1;
			return Data.save(callback);
		})
		(function(callback) // создаем новую пустую игру
		{
			return Storage.TapeGames.create(
			{
				id: Data.tape.gamesCount,
				updatedAt: getTime(),
				random: Math.random(),
			})
			.save(function(error)
			{
				return callback(error, this);
			});
		})
		(function(tapeGame, callback)
		{
			Zones.tape.currentGame = tapeGame;
			return callback(null);
		})
		(callback);
	})
	(function(callback) // ищем завершенную игру, сортируя игры в обратном порядке по _id
	{
		return Storage.TapeGames.find(
		{
			state: Storage.TapeGames.states.completed,
		})
		.sort('_id', 'desc').toInstance(callback);
	})
	(function(tapeGame, callback)
	{
		Zones.tape.lastGame = tapeGame;
		return callback(null);
	})
	(callback);
});

chain(function(callback) // работа с сокетом Контроллера
{
	global.Controller = require('socket.io-client')('http://' + Config.controller.host + ':' + Config.controller.port);

	Controller.on('connect', function()
	{
		console.log('Подключение к контроллеру было установлено');
		return Controller.emit('login', Config.controller.password);
	});

	Controller.on('loggedIn', function(data)
	{
		console.log('Удалось авторизоваться в контроллере');
		SuitableBotA = data.suitableBotA;
		console.log('suitableBotA', SuitableBotA);
		io.emit('suitableBotA', SuitableBotA);
		// Controller.emit('createOutboundTransfer',
		// {
		// 	receiver: '76561198122594865',
			
		// 	items:
		// 	[
		// 		'56926e96e440e82c16cef581',
		// 		'56926ef8e440e82c16cef588',
		// 		'56927b1742cb972e21f90576',
		// 		'56927b1742cb972e21f90577',
		// 		'56927b1742cb972e21f90578',
		// 		'56927b1742cb972e21f90579',
		// 	],

		// 	accessToken: 'NR8A9fx6',
		// 	index: 'someIndexHere18',
		// });
	});

	Controller.on('disconnect', function()
	{
		SuitableBotA = null;
		console.log('Потеряли соединение с контроллером...');
	});

	Controller.on('suitableBotA', function(suitableBotA)
	{
		SuitableBotA = suitableBotA;
		console.log('suitableBotA', SuitableBotA);
		io.emit('suitableBotA', suitableBotA);
	});

	Controller.on('error', function(error)
	{
		console.log(error);
	});

	Controller.on('newInboundTransfer', function(data)
	{
		console.log('newInboundTransfer');
		
		return Storage.lock(function(callback)
		{
			return $(function(callback) // ищем входящее предложение обмена с таким же id в нашей базе данных
			{
				return Storage.InboundTransfers.find({id: data._id}).toInstance(callback);
			})
			(function(inboundTransfer, callback)
			{
				if (!inboundTransfer)
				{
					return callback(null);
				}

				Controller.emit('newInboundTransfer',
				{
					_id: inboundTransfer.id,
					index: inboundTransfer._id,
				});

				return callback('success');
			})
			(function(callback) // создаем входящий трансфер
			{
				return Storage.InboundTransfers.create(
				{
					id: data._id,
					sender: data.sender,
					items: [],
				})
				.save(function(error)
				{
					return callback(error, this);
				});
			})
			(function(inboundTransfer, callback) // создаем каждый предмет для созданного трансфера
			{
				return $(data.items.reverse())(function(item, callback)
				{
					++Data.lastItemIndex;
					
					return Storage.Items.create(
					{
						id: item._id,
						classId: item.classId,
						instanceId: item.instanceId,
						state: 0,
						user: inboundTransfer.sender,
						index: Data.lastItemIndex,
					})
					.save(function(error)
					{
						return callback(error, this);
					});
				})
				.series(function(error, items)
				{
					return callback(error, inboundTransfer, items);
				});
			})
			(function(inboundTransfer, items, callback)
			{
				return Data.save(function(error)
				{
					return callback(error, inboundTransfer, items);
				});
			})
			(function(inboundTransfer, items, callback) // создали предметы, записываем их в созданную ставку
			{
				return inboundTransfer.set(
				{
					items: items.map(function(item)
					{
						return item._id;
					}),
				})
				.save(function(error)
				{
					return callback(error, inboundTransfer);
				});
			})
			(function(inboundTransfer, callback)
			{
				Controller.emit('newInboundTransfer',
				{
					_id: inboundTransfer.id,
					index: inboundTransfer._id,
				});

				return callback(null, inboundTransfer);
			})
			(function(inboundTransfer, callback)
			{
				io.to(inboundTransfer.sender).emit('users.newInboundTransfer');
				return callback(null);
			})
			(function(error)
			{
				if (error && error != 'success')
				{
					console.error(error.stack);
				}

				return callback(null);
			});
		});
	});
	
	Controller.on('acceptInboundTransfer', function(data)
	{
		console.log('[>>>] acceptInboundTransfer', data);
		
		return Storage.lock(function(callback)
		{
			return $(function(callback) // ищем входящее предложение обмена с таким же id в нашей базе данных
			{
				return Storage.InboundTransfers.find(
				{
					id: data._id,
				})
				.toInstance(callback);
			})
			(function(inboundTransfer, callback)
			{
				if (!inboundTransfer)
				{
					return callback(null);
				}

				if (inboundTransfer.state != Storage.InboundTransfers.states.accept)
				{
					return callback(null);
				}

				return inboundTransfer.set(
				{
					state: Storage.InboundTransfers.states.answerAboutAccept,
				})
				.save(callback);
			})
			(function(error)
			{
				if (error && error != 'success')
				{
					console.error(error.stack);
				}

				return callback(null);
			});
		});
	});

	Controller.on('inboundTransferHasNewState', function(data)
	{
		return Storage.lock(function(callback)
		{
			return $(function(callback) // ищем ставку с таким предложением обмена
			{
				return Storage.InboundTransfers.find(
				{
					id: data._id,
				})
				.toInstance(callback);
			})
			(function(inboundTransfer, callback)
			{
				if (!inboundTransfer)
				{
					return callback(null);
				}

				return inboundTransfer.set(
				{
					state: Storage.InboundTransfers.states.hasNewState,
					steamState: data.state,
				})
				.save(function(error)
				{
					return callback(error, inboundTransfer);
				});
			})
			(function(inboundTransfer, callback)
			{
				Controller.emit('inboundTransferHasNewState',
				{
					_id: data._id,
				});

				return callback(null, inboundTransfer);
			})
			(function(inboundTransfer, callback)
			{
				io.to(inboundTransfer.sender).emit('users.inboundTransferHasNewState',
				{
					state: inboundTransfer.steamState,
					reason: inboundTransfer.reason,
				});

				return callback(null);
			})
			(function(error)
			{
				if (error)
				{
					console.error(error.stack);
				}

				return callback(null);
			});
		});
	});

	Controller.on('createOutboundTransfer', function(data)
	{
		console.log('[ответ] createOutboundTransfer');
		
		return Storage.lock(function(callback)
		{
			return $(function(callback) // ищем трансфер с таким же index в нашей базе данных
			{
				return Storage.OutboundTransfers.find({_id: Storage.ObjectID(data.index)}).toInstance(callback);
			})
			(function(outboundTransfer, callback)
			{
				if (!outboundTransfer)
				{
					return callback(null);
				}

				if (outboundTransfer.state != Storage.OutboundTransfers.states.justCreated)
				{
					return callback(null);
				}

				return outboundTransfer.set(
				{
					state: Storage.OutboundTransfers.states.createdInController,
					id: Storage.ObjectID(data._id),
				})
				.save(callback);
			})
			(function(error)
			{
				if (error && error != 'success')
				{
					console.error(error.stack);
				}

				return callback(null);
			});
		});
	});

	Controller.on('outboundTransferHasSteamId', function(data)
	{
		console.log('[входящий запрос] outboundTransferHasSteamId');
		
		return Storage.lock(function(callback)
		{
			return $(function(callback) // ищем трансфер таким же index в нашей базе данных
			{
				return Storage.OutboundTransfers.find({_id: Storage.ObjectID(data.index)}).toInstance(callback);
			})
			(function(outboundTransfer, callback)
			{
				if (!outboundTransfer)
				{
					return callback('success');
				}

				if (outboundTransfer.state != Storage.OutboundTransfers.states.createdInController)
				{
					return callback('success');
				}

				return outboundTransfer.set(
				{
					state: Storage.OutboundTransfers.states.hasId,
					steamId: data.id,
				})
				.save(function(error)
				{
					return callback(error, outboundTransfer);
				});
			})
			(function(outboundTransfer, callback)
			{
				console.log('[ответ] outboundTransferHasSteamId');

				Controller.emit('outboundTransferHasSteamId',
				{
					_id: data._id,
				});

				return callback(null, outboundTransfer);
			})
			(function(outboundTransfer, callback)
			{
				return Storage.Users.find(
				{
					steamId64: outboundTransfer.receiver,
				})
				.toInstance(function(error, user)
				{
					return callback(error, outboundTransfer, user);
				});
			})
			(function(outboundTransfer, user, callback)
			{
				return user.emit('updateOutboundTransfer', [outboundTransfer, callback]);
			})
			(function(error)
			{
				if (error && error != 'success')
				{
					console.error(error.stack);
				}

				return callback(null);
			});
		});
	});

	Controller.on('outboundTransferHasNewState', function(data)
	{
		console.log('[входящий запрос] outboundTransferHasNewState');
		
		return Storage.lock(function(callback)
		{
			$(function(callback) // ищем трансфер таким же index в нашей базе данных
			{
				return Storage.OutboundTransfers.find({_id: Storage.ObjectID(data.index)}).toInstance(callback);
			})
			(function(outboundTransfer, callback)
			{
				if (!outboundTransfer)
				{
					return callback('success');
				}

				if (outboundTransfer.state != Storage.OutboundTransfers.states.createdInController && outboundTransfer.state != Storage.OutboundTransfers.states.hasId)
				{
					return callback('success');
				}

				return outboundTransfer.set(
				{
					state: Storage.OutboundTransfers.states.hasNewState,
					steamState: data.state,
				})
				.save(callback);
			})
			(function(callback)
			{
				console.log('[ответ] outboundTransferHasNewState');

				Controller.emit('outboundTransferHasNewState',
				{
					_id: data._id,
				});

				return callback(null);
			})
			(function(error)
			{
				if (error && error != 'success')
				{
					console.error(error.stack);
				}

				return callback(null);
			});
		});
	});

	return callback(null);
});

chain(function(callback) // работа с глобальным сокетом
{
	io.on('connection', function(socket)
	{
		socket.on('authorize', function(data) // запрос на авторизацию от клиента
		{
			console.log('authorize', socket.request.connection.remoteAddress);

			return Storage.lock(function(callback)
			{
				return $(function(callback)
				{
					return $(function(callback) // ищем пользователя с таким steamId64
					{
						if (!data || !data.steamId64)
						{
							return callback('success');
						}

						return callback(null);
					})
					(function(callback) // ищем пользователя с таким steamId64
					{
						return Storage.Users.find(
						{
							steamId64: data.steamId64,
						})
						.toInstance(callback);
					})
					(function(user, callback)
					{
						if (!user)
						{
							// console.log('authorize', 'Пользователь не был найден');
							return callback('success');
						}

						if (user.secretKey != data.secretKey)
						{
							// console.log('authorize', 'Секретные ключи не равны');
							return callback('success');
						}

						return $(function(callback) // устанавливаем пользователю последний IP адрес и сохраняем его
						{
							// console.log('set lastIp ' + socket.request.connection.remoteAddress);

							return user.set(
							{
								lastIp: socket.request.connection.remoteAddress,
							})
							.save(callback);
						})
						(function(callback) // получаем предметы пользователя для его инвентаря
						{
							return Storage.Items.find(
							{
								user: user.steamId64,

								state:
								{
									$in:
									[
										Storage.Items.states.reserved,
										Storage.Items.states.real,
										Storage.Items.states.transmitting,
									],
								},
							})
							.toCollection(callback);
						})
						(function(items, callback) // получаем экземпляры предметов из нашей базы данных
						{
							return Storage.Instances.find(
							{
								name:
								{
									$in: items.map(function(item)
									{
										return item.name;
									}),
								},
							})
							.toCollection(function(error, instances)
							{
								return callback(error, items, instances);
							});
						})
						(function(items, instances, callback)
						{
							items.forEach(function(item) // находим каждому предмету экземпляр
							{
								var instance = instances.find(
								{
									name: item.name,
								})
								.first();

								if (!instance)
								{
									item.price = 0.0;
									return;
								}

								item.price = instance.price;
							});

							return callback(null, items);
						})
						(function(items, callback) // пытаемся найти единственный исходящий трансфер
						{
							items = items.sort(user.inventoryOrder, 'desc');

							return Storage.OutboundTransfers.find(
							{
								state:
								{
									$in:
									[
										Storage.OutboundTransfers.states.justCreated,
										Storage.OutboundTransfers.states.createdInController,
										Storage.OutboundTransfers.states.hasId,
									],
								},

								receiver: user.steamId64,
							})
							.toInstance(function(error, outboundTransfer)
							{
								return callback(error, items, outboundTransfer);
							});
						})
						(function(items, outboundTransfer, callback)
						{
							return callback(null, user, items, outboundTransfer);
						})
						(callback);
					})
					(function(error, user, items, outboundTransfer)
					{
						if (error)
						{
							if (error == 'success')
							{
								return callback(null, null, [], null);
							}

							return callback(error);
						}

						return callback(null, user, items, outboundTransfer);
					});
				})
				(function(user, items, outboundTransfer, callback)
				{
					if (user)
					{
						socket.join(user.steamId64);
					}

					var tapeGame = Zones.tape.currentGame;
					var lastTapeGame = Zones.tape.lastGame;

					socket.emit('authorize', 
					{
						user: user ?
						{
							steamId32: user.steamId32,
							steamId64: user.steamId64,
							name: user.name,
							avatarMedium: user.avatarMedium,
							avatarLarge: user.avatarLarge,
							accessToken: user.accessToken,
							inventoryOrder: user.inventoryOrder,
							balance: user.balance,
							VKontakte: user.VKontakte,
							admin: user.admin,
						}
						: null,

						items: user ? items.map(function(item)
						{
							return (
							{
								_id: item._id,
								name: item.name,
								image: item.image,
								state: item.state,
								zone: item.zone,
								type: item.type,
								weapon: item.weapon,
								collection: item.collection,
								categoryColor: item.categoryColor,
								category: item.category,
								qualityColor: item.qualityColor,
								quality: item.quality,
								exterior: item.exterior,
								price: item.price,
								stickers: item.stickers,
							});
						})
						: [],

						outboundTransfer: outboundTransfer ?
						{
							steamId: outboundTransfer.steamId,
							state: outboundTransfer.state,
						}
						: null,

						tape:
						{
							game:
							{
								id: tapeGame.id,
								state: tapeGame.state,
								updatedAt: tapeGame.updatedAt,
								sum: tapeGame.sum,

								users: tapeGame.users.map(function(gameUser)
								{
									return (
									{
										name: gameUser.name,
										percent: gameUser.percent,
										sum: gameUser.sum,
										steamId64: gameUser.steamId64,
										avatarMedium: gameUser.avatarMedium,
										avatarLarge: gameUser.avatarLarge,
										itemsCount: gameUser.itemsCount,
										first: gameUser.first,
									});
								}),

								items: tapeGame.items.map(function(gameItem)
								{
									return (
									{
										name: gameItem.name,
										price: gameItem.price,
										image: gameItem.image,
										user: gameItem.user,
										color: gameItem.color,
										quality: gameItem.quality,
										category: gameItem.category,
										categoryColor: gameItem.categoryColor,
										exterior: gameItem.exterior,
									});
								}),

								tape: tapeGame.tape,
								tapeWinnerRandom: tapeGame.tapeWinnerRandom,
								updatedAt: tapeGame.updatedAt,
							},

							lastWinner: lastTapeGame ? (function()
							{
								return (
								{
									winSum: lastTapeGame.winSum,
									
									user: (function()
									{
										var foundGameUser = null;

										lastTapeGame.users.forEach(function(gameUser)
										{
											if (foundGameUser || gameUser.steamId64 != lastTapeGame.winner)
											{
												return;
											}

											foundGameUser = gameUser;
										});

										return (
										{
											name: foundGameUser.name,
											percent: foundGameUser.percent,
											avatarLarge: foundGameUser.avatarLarge,
										});
									})
									(),
								});
							})
							() : null,

							event: null,
							gameTime: Storage.TapeGames.gameTime,
							tapeTime: Storage.TapeGames.tapeTime,
						},

						suitableBotA: SuitableBotA,
						now: getTime(),
					});
					
					return callback(null);
				})
				(function(error)
				{
					if (error && error != 'success')
					{
						console.error(error.stack);
					}

					return callback(null);
				});
			});
		});
	});

	return callback(null);
});

chain(function(callback)
{
	$.forever(function(callback)
	{
		return $(function(callback) // обрабатываем входящие трансферы
		{
			// console.log('forever 0');
			return processInboundTransfers(callback);
		})
		(function(callback) // обрабатываем исходящие трансферы
		{
			// console.log('forever 1');
			return processOutboundTransfers(callback);
		})
		(function(callback) // обрабатываем текущую игру рулетки
		{
			return Zones.tape.processCurrentGame(Zones.tape.currentGame, callback);
		})
		(callback);
	})
	(1000);

	return callback(null);
});

chain(function(callback)
{
	Service.get('/', function(request, response)
	{
		var notificate = request.session.notificate || null;
		request.session.notificate = null;

		response.render('main',
		{
			user: request.User,
			environment: Config.environment,
			notificate: notificate,
		});

		return;
	});

	Service.post('/saveTradeUrl', function(request, response)
	{
	    if (!request.User)
	    {
	        return response.send({success: false, reason: 'Войдите в систему для сохранения ссылки для обмена!'});
	    }

	    return Storage.lock(function(callback)
		{
		    return $(function(callback)
		    {
		    	return request.User.getInstance(callback);
		    })
		    (function(user, callback)
		    {
			    if (!request.body.tradeUrl)
			    {
			        response.send({success: false, reason: 'Ссылка для обмена пуста.'});
			        return callback(null);
			    }

			    var getURLParameter = function(url, name)
			    {
			        return decodeURIComponent((new RegExp(name + '=' + '([^&;]+?)(&|#|;|$)').exec(url) || [, ''])[1].replace(/\+/g, '%20')) || null;
			    }

			    // var match = request.body.tradeUrl.match(/^(?:http|https):\/\/steamcommunity.com\/tradeoffer\/new\/\?partner=(\d+)&token=([0-9a-zA-Z_-]{8})$/);
			    var partner = getURLParameter(request.body.tradeUrl, 'partner');
			    var token = getURLParameter(request.body.tradeUrl, 'token');

			    if (!partner || !/\d+/.test(partner) || !token || !/[0-9a-zA-Z_-]{8}/.test(token))
			    {
			        response.send({success: false, reason: 'Ссылка для обмена заполнена неправильно.'});
			        return callback(null);
			    }

			    if (user.steamId32 != partner)
			    {
			        response.send({success: false, reason: 'Эта ссылка для обмена принадлежит не Вашему аккаунту. Введите Вашу ссылку и повторите попытку.'});
			        return callback(null);
			    }

			    return user.set(
			    {
			    	accessToken: token,
			    })
			    .save(function(error)
			    {
			    	if (error)
			    	{
			    		return callback(error);
			    	}

			        response.send({success: true});
			        return callback(null);
			    });
		    })
			(function(error)
			{
				if (error)
				{
					response.send({success: false, reason: 'Ошибка: ' + error});
				}

				return callback(null);
			});
		});
	});
	
	Service.post('/makeOutboundTransfer', function(request, response)
	{
		if (!request.User)
		{
			return response.send(
			{
				error: 'Not Authorized',
				success: false,
			});
		}

		return Storage.lock(function(callback)
		{
			return $(function(callback)
			{
				return request.User.getInstance(callback);
			})
			(function(user, callback)
			{
				if (!user.accessToken)
				{
					response.send(
					{
						error: 'User do not have accessToken',
						success: false,
					});

					return callback('success');
				}

				if (!request.body.items || request.body.items.length <= 0)
				{
					response.send(
					{
						error: 'Invalid items 0',
						success: false,
					});

					return callback('success');
				}

				try
				{
					request.body.items.forEach(function(item)
					{
						Storage.ObjectID(item);
					});
				}
				catch (error)
				{
					response.send(
					{
						error: 'Invalid items 1',
						success: false,
					});

					return callback('success');
				}

				return $(function(callback)
				{
					return Storage.OutboundTransfers.find(
					{
						state:
						{
							$in:
							[
								Storage.OutboundTransfers.states.justCreated,
								Storage.OutboundTransfers.states.createdInController,
								Storage.OutboundTransfers.states.hasId,
							],
						},

						receiver: user.steamId64,
					})
					.toInstance(callback);
				})
				(function(outboundTransfer, callback)
				{
					if (!outboundTransfer)
					{
						return callback(null);
					}

					response.send(
					{
						error: 'There is an outbound transfer already',
						success: false,
					});

					return callback('success');
				})
				(function(callback)
				{
					return Storage.Items.find(
					{
						_id:
						{
							$in: request.body.items.map(function(item)
							{
								return Storage.ObjectID(item);
							}),
						},

						user: user.steamId64,
					})
					.sort('_id', 'desc').toCollection(callback);
				})
				(function(items, callback)
				{
					if (request.body.items.length != items.length)
					{
						response.send(
						{
							error: 'Can not found all items',
							success: false,
						});

						return callback('success');
					}

					var allItemsIsValid = items.every(function(item)
					{
						return (item.state == Storage.Items.states.real && !item.zone);
					});

					if (!allItemsIsValid)
					{
						response.send(
						{
							error: 'There are invalid items',
							success: false,
						});

						return callback('success');
					}

					return callback(null, items);
				})
				(function(items, callback)
				{
					return items.set(
					{
						state: Storage.Items.states.transmitting,
					})
					.save(function(error)
					{
						return callback(error, items);
					});
				})
				(function(items, callback)
				{
					return Storage.OutboundTransfers.create(
					{
						receiver: user.steamId64,

						items: items.map(function(item)
						{
							return item._id;
						}),

						accessToken: user.accessToken,
					})
					.save(function(error)
					{
						return callback(error, this);
					});
				})
				(function(outboundTransfer, callback)
				{
					return user.emit('updateInventory', [function(error)
					{
						return callback(error, outboundTransfer);
					}]);
				})
				(function(outboundTransfer, callback)
				{
					return user.emit('updateOutboundTransfer', [outboundTransfer, callback]);
				})
				(function(callback)
				{
					response.send(
					{
						success: true,
					});

					return callback(null);
				})
				(callback);
			})
			(function(error)
			{
				if (error && error != 'success')
				{
					response.send(
					{
						error: error,
						success: false,
					});
				}

				return callback(null);
			});
		});
	});
	
	Service.post('/moveItemsToZone', function(request, response)
	{
		if (!request.User)
		{
			return response.send(
			{
				error: 'Not Authorized',
				success: false,
			});
		}

		if (!request.body.items || request.body.items.length <= 0)
		{
			return response.send(
			{
				error: 'Invalid items 0',
				success: false,
			});
		}

		try
		{
			request.body.items.forEach(function(item)
			{
				Storage.ObjectID(item);
			});
		}
		catch (error)
		{
			return response.send(
			{
				error: 'Invalid items 1',
				success: false,
			});
		}

		if (!Zones[request.body.zone])
		{
			return response.send(
			{
				error: 'Invalid zone ' + request.body.zone,
				success: false,
			});
		}

		return Storage.lock(function(callback)
		{
			return $(function(callback)
			{
				return request.User.getInstance(callback);
			})
			(function(user, callback)
			{
				return $(function(callback)
				{
					return Storage.Items.find(
					{
						_id:
						{
							$in: request.body.items.map(function(item)
							{
								return Storage.ObjectID(item);
							}),
						},

						user: user.steamId64,
					})
					.sort('_id', 'desc').toCollection(callback);
				})
				(function(items, callback)
				{
					if (request.body.items.length != items.length)
					{
						response.send(
						{
							error: 'Не удалось найти всех предметов',
							success: false,
						});

						return callback('success');
					}

					var allItemsIsValid = items.every(function(item)
					{
						return (item.state == Storage.Items.states.real && !item.zone);
					});

					if (!allItemsIsValid)
					{
						response.send(
						{
							error: 'Есть предметы, работа с которыми пока невозможна',
							success: false,
						});

						return callback('success');
					}

					return callback(null, items);
				})
				(function(items, callback) // проверяем, если предметов у пользователя в инвентаре больше, чем ...
				{
					if (user.admin)
					{
						return callback(null, items);
					}

					return user.isInventoryFull(function(error, full)
					{
						if (full)
						{
							response.send(
							{
								error: 'В Вашем Инвентаре больше 32-х предметов. Выведите лишние предметы, чтобы продолжить работу с сервисами.',
								success: false,
							});

							return callback('success');
						}

						return callback(error, items);
					});
				})
				(function(items, callback) // работа с предметами и с зоной
				{
					if (request.body.zone == 'tape') // если зона - рулетка
					{
						var game = Zones.tape.currentGame;

						if ((game.hasUser(user) ? game.getUser(user).itemsCount : 0) + items.length > 10)
						{
							response.send(
							{
								error: 'Превышено максимальное количество предметов для Вас в этой игре.',
								success: false,
							});

							return callback('success');
						}

						if (game.state != Storage.TapeGames.states.justCreated && game.state != Storage.TapeGames.states.started)
						{
							response.send(
							{
								error: 'Игра уже завершается. Вы не можете внести предметы.',
								success: false,
							});

							return callback('success');
						}

						return $(function(callback) // находим для каждого из предметов экземпляр в нашей базе данных
						{
							return Storage.Instances.find(
							{
								name:
								{
									$in: items.map(function(item)
									{
										return item.name;
									}),
								},
							})
							.toCollection(callback);
						})
						(function(instances, callback) // находим каждому предмету его экземпляр
						{
							var allItemsHaveInstance = items.every(function(item)
							{
								var instance = instances.find(
								{
									name: item.name,
								})
								.first();

								if (!instance)
								{
									return false;
								}

								item.data.price = instance.price;
								return true;
							});

							if (!allItemsHaveInstance)
							{
								response.send(
								{
									error: 'Не удалось найти цену для одного из Ваших предметов.',
									success: false,
								});

								return callback('success');
							}

							return callback(null);
						})
						(function(callback) // перемещаем предметы в рулетку
						{
							items.forEach(function(item)
							{
								item.zone = 'tape';
							});

							return items.save(callback);
						})
						(function(callback) // если в игре нет пользователя, добавляем его туда
						{
							if (!game.hasUser(user))
							{
								game.addUser(user);
							}

							return callback(null, game.getUser(user));
						})
						(function(gameUser, callback)
						{
							items.forEach(function(item)
							{
								game.addItem(item);
								gameUser.sum += item.data.price;
								gameUser.itemsCount += 1;
							});

							return game.save(callback);
						})
						(function(callback) // пересчитываем проценты всех пользователей игры
						{
							game.users.forEach(function(gameUser) // обновляем проценты всех пользователей исходя из суммы их ставок
							{
								gameUser.percent = gameUser.sum / game.sum;
							});

							game.users.sort(function(gameUser0, gameUser1) // сортируем массив пользователей исходя из их процентов
							{
								return gameUser0.percent < gameUser1.percent;
							});

							return game.save(callback);
						})
						(function(callback)
						{
							return Zones.tape.update('newItems', callback);
						})
						(callback);
					}

					if (request.body.zone == 'market') // если зона - торговая площадка
					{
						return $(function(callback) // создаем торговый предмет
						{
							return $(items)(function(item, callback) // проходимся по каждому предмету и создаем для него торговый предмет
							{
								return $(function(callback)
								{
									return Storage.MarketItems.create(
									{
										id: item._id,
										seller: user.steamId64,
										name: item.name,
										image: item.image,
										type: item.type,
										categoryColor: item.categoryColor,
										category: item.category,
										qualityColor: item.qualityColor,
										quality: item.quality,
										exterior: item.exterior,
										stickers: item.stickers,
										commission: 0.01, // комиссия продажи предмета
									})
									.save(callback);
								})
								(function(callback)
								{
									return item.set(
									{
										zone: 'market',
									})
									.save(callback);
								})
								(callback);
							})
							.series(function(error)
							{
								return callback(error);
							});
						})
						(callback);
					}

					response.send(
					{
						error: 'Невозможно поместить предметы в эту зону.',
						success: false,
					});

					return callback('success');
				})
				(function(callback)
				{
					console.log('user.updateInventory');

					return user.emit('updateInventory', [function(error)
					{
						console.log('after user.updateInventory');
						return callback(error);
					}]);
				})
				(function(callback)
				{
					response.send(
					{
						success: true,
					});

					return callback(null);
				})
				(callback);
			})
			(function(error)
			{
				if (error && error != 'success')
				{
					response.send(
					{
						error: error,
						success: false,
					});
				}

				return callback(null);
			});
		});
	});
	
	Service.post('/tape/history', function(request, response)
	{
		return Storage.lock(function(callback)
		{
			return $(function(callback) // получаем 20 послених игр
			{
				return Storage.TapeGames.find(
				{
					state: Storage.TapeGames.states.completed,
				})
				.sort('id', 'desc').toCollection(callback);
			})
			(function(games, callback)
			{
				games = games.map(function(game)
				{
					return (
					{
						id: game.id,

						winner: (function()
						{
							var gameUser = game.getUserBySteamId64(game.winner);

							return (
							{
								name: gameUser.name,
								avatarLarge: gameUser.avatarLarge,
								percent: gameUser.percent,
							});
						}
						)(),

						winSum: game.winSum,

						users: game.users.map(function(gameUser)
						{
							return (
							{
								name: gameUser.name,
								avatarLarge: gameUser.avatarLarge,
								percent: gameUser.percent,
							});
						}),

						items: game.items.filter(function(item)
						{
							return !item.commission;
						})
						.map(function(item)
						{
							return (
							{
								name: item.name,
								image: item.image,
								price: item.price,
								color: item.color,
								quality: item.quality,
								categoryColor: item.categoryColor,
								category: item.category,
							});
						}),
					});
				});

				response.send(
				{
					games: games,
					success: true,
				});

				return callback(null);
			})
			(function(error)
			{
				if (error && error != 'success')
				{
					response.send(
					{
						error: error,
						success: false,
					});
				}
				
				return callback(null);
			});
		});
	});

	Service.post('/tape/top', function(request, response)
	{
		return Storage.lock(function(callback)
		{
			return $(function(callback) // получаем 50 пользователей, имеющих победы в рулетке и сортируем их по сумме выигрышей
			{
				return Storage.Users.find(
				{
					tapeWinsCount:
					{
						$gt: 0,
					},
				})
				.sort('tapeWinSum', 'desc').toCollection(callback);
			})
			(function(users, callback)
			{
				users = users.map(function(user)
				{
					return (
					{
						name: user.name,
						avatarLarge: user.avatarLarge,
						tapeWinsCount: user.tapeWinsCount,
						tapeWinSum: user.tapeWinSum,
					});
				});

				response.send(
				{
					users: users,
					success: true,
				});

				return callback(null);
			})
			(function(error)
			{
				if (error && error != 'success')
				{
					response.send(
					{
						error: error,
						success: false,
					});
				}
				
				return callback(null);
			});
		});
	});

	Service.post('/tape/commission', function(request, response)
	{
		if (!request.User || !request.User.admin)
		{
			return response.send(
			{
				success: false,
				error: 'Нет доступа к разделу',
			});
		}

		return Storage.lock(function(callback)
		{
			return $(function(callback)
			{
				return Storage.Items.find(
				{
					commission: true,
					zone: 'tape',
				})
				.toCollection(callback);
			})
			(function(items, callback) // получаем экземпляры предметов из нашей базы данных
			{
				return Storage.Instances.find(
				{
					name:
					{
						$in: items.map(function(item)
						{
							return item.name;
						}),
					},
				})
				.toCollection(function(error, instances)
				{
					return callback(error, items, instances);
				});
			})
			(function(items, instances, callback)
			{
				items.forEach(function(item) // находим каждому предмету экземпляр
				{
					var instance = instances.find(
					{
						name: item.name,
					})
					.first();

					if (!instance)
					{
						item.price = 0.0;
						return;
					}

					item.price = instance.price;
				});

				return callback(null, items);
			})
			(function(items, callback)
			{
				response.send(
				{
					success: true,

					items: items.sort('price', 'desc').map(function(item)
					{
						return (
						{
							name: item.name,
							price: item.price,
							image: item.image,
							color: item.color,
							quality: item.quality,
							category: item.category,
							categoryColor: item.categoryColor,
							exterior: item.exterior,
						});
					}),
				});

				return callback(null);
			})
			(function(error)
			{
				if (error)
				{
					response.send(
					{
						success: false,
						error: error,
					});
				}

				return callback(null);
			});
		});
	});

	Service.post('/tape/commission/get', function(request, response)
	{
		if (!request.User || !request.User.admin)
		{
			return response.send(
			{
				success: false,
				error: 'Нет доступа к разделу',
			});
		}

		return Storage.lock(function(callback)
		{
			return $(function(callback)
			{
				return Storage.Items.find(
				{
					commission: true,
					zone: 'tape',
				})
				.toCollection(callback);
			})
			(function(items, callback)
			{
				if (items.length == 0)
				{
					return callback('В комиссии нет ни одного предмета');
				}

				items.forEach(function(item)
				{
					++Data.lastItemIndex;
					item.commission = false;
					item.zone = '';
					item.user = request.User.steamId64;
					item.index = Data.lastItemIndex;
				});

				return items.save(callback);
			})
			(function(callback)
			{
				return Data.save(callback);
			})
			(function(callback)
			{
				return request.User.emit('updateInventory', [callback]);
			})
			(function(error)
			{
				if (error)
				{
					response.send(
					{
						success: false,
						error: error,
					});
				}
				else
				{
					response.send(
					{
						success: true,
					});
				}

				return callback(null);
			});
		});
	});

	Service.post('/setInventoryOrder', function(request, response)
	{
	    if (!request.User)
	    {
	        return response.send({success: false, error: 'Войдите в систему для изменения сортировки инвентаря!'});
	    }

	    if (['index', 'price', 'qualityIndex', 'collection'].indexOf(request.body.order) < 0)
	    {
	    	return response.send(
	    	{
	    		success: false,
	    		error: 'Неверный порядок сортировки!',
	    	});
	    }

	    return Storage.lock(function(callback)
		{
			return $(function(callback)
		    {
		    	 return request.User.getInstance(callback);
		    })
		    (function(user, callback)
		    {
		    	return user.set(
		    	{
		    		inventoryOrder: request.body.order,
		    	})
		    	.save(function(error)
		    	{
		    		return callback(error, user);
		    	});
		    })
		    (function(user, callback)
		    {
		    	return user.emit('updateInventory', [callback]);
		    })
		    (function(callback)
		    {
		    	response.send(
		    	{
		    		success: true,
		    	});

		    	return callback(null);
		    })
		    (function(error)
			{
				if (error)
				{
					response.send(
					{
						success: false,
						error: 'Ошибка: ' + error,
					});
				}

				return callback(null);
			});
		});
	});
	
	Service.get('/market', function(request, response)
	{
		var query =
		{
			state: Storage.MarketInstances.states.onSale,
		};

		var sort =
		{
			price: 'asc',
			name: 'asc',
			count: 'desc',
			salesCount: 'desc',
		};

		if (request.query.search)
		{
			query.name =
			{
				$regex: new RegExp(request.query.search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i'),
			};
		}

		if (request.query.quality)
		{
			query.quality = request.query.quality;
		}

		if (request.query.exterior)
		{
			query.exterior = request.query.exterior;
		}

		if (request.query.category)
		{
			query.category = request.query.category;
		}

		if (request.query.type)
		{
			query.type = request.query.type;
		}

		if (!request.query.sort || !sort[request.query.sort])
		{
			request.query.sort = 'salesCount';
		}

		query.price = {};
		request.query.from = parseFloat(request.query.from) || 0.0;
		request.query.to = parseFloat(request.query.to) || 2000.0;
		query.price.$gte = request.query.from;

		if (request.query.to && request.query.to < 2000.0)
		{
			query.price.$lte = request.query.to;
		}

		request.query.start = parseInt(request.query.start) || 0;
		request.query.count = parseInt(request.query.count) || 64;
		request.query.start = (request.query.start < 0) ? 0 : request.query.start;
		request.query.count = (request.query.count > 64) ? 64 : request.query.count;
		request.query.count = (request.query.count < 1) ? 1 : request.query.count;
		
		return Storage.lock(function(callback)
		{
			return $(function(callback)
			{
				return Storage.MarketInstances.find(query).count(callback);
			})
			(function(totalCount, callback)
			{
				request.query.start = (request.query.start > totalCount) ? 0 : request.query.start;
				
				return Storage.MarketInstances.find(query)
					.sort(request.query.sort, sort[request.query.sort])
					.skip(request.query.start)
					.limit(request.query.count)

					.toCollection(function(error, marketInstances)
					{
						return callback(error, totalCount, marketInstances);
					});
			})
			(function(totalCount, marketInstances, callback)
			{
				response.send(
				{
					success: true,

					instances: marketInstances.map(function(marketInstance)
					{
						return (
						{
							_id: marketInstance._id,
							name: marketInstance.name,
							image: marketInstance.image,
							type: marketInstance.type,
							categoryColor: marketInstance.categoryColor,
							category: marketInstance.category,
							qualityColor: marketInstance.qualityColor,
							quality: marketInstance.quality,
							exterior: marketInstance.exterior,
							price: marketInstance.price,
						});
					}),

					start: request.query.start,
					count: request.query.count,
					totalCount: totalCount,
				});

				return callback(null);
			})
			(function(error)
			{
				if (error)
				{
					response.send(
					{
						success: false,
						error: 'Ошибка: ' + error,
					});
				}

				return callback(null);
			});
		});
	});
	
	Service.post('/market/instance', function(request, response)
	{
		if (!request.body._id)
		{
			return response.send(
			{
				success: false,
				error: 'Не найден параметр _id',
			});
		}

		try
		{
			Storage.ObjectID(request.body._id);
		}
		catch (error)
		{
			return response.send(
			{
				success: false,
				error: 'Неверный параметр _id',
			});
		}

		return Storage.lock(function(callback)
		{
			return $(function(callback)
			{
				return Storage.MarketInstances.find(
				{
					_id: Storage.ObjectID(request.body._id),
				})
				.toInstance(callback);
			})
			(function(marketInstance, callback)
			{
				if (!marketInstance)
				{
					response.send(
					{
						success: false,
						error: 'Не найден предмет с таким _id',
					});

					return callback('success');
				}

				return Storage.MarketItems.find(
				{
					name: marketInstance.name,
					state: Storage.MarketItems.states.onSale,
				})
				.sort('price', 'asc').toCollection(callback);
			})
			(function(marketItems, callback)
			{
				response.send(
				{
					success: true,

					items: marketItems.map(function(marketItem)
					{
						return (
						{
							_id: marketItem._id,
							name: marketItem.name,
							image: marketItem.image,
							type: marketItem.type,
							categoryColor: marketItem.categoryColor,
							category: marketItem.category,
							qualityColor: marketItem.qualityColor,
							quality: marketItem.quality,
							exterior: marketItem.exterior,
							stickers: marketItem.stickers,
							price: marketItem.price,
						});
					}),
				});

				return callback(null);
			})
			(function(error)
			{
				if (error && error != 'success')
				{
					console.log(error);

					response.send(
					{
						success: false,
						error: error,
					});
				}

				return callback(null);
			});
		});
	});

	Service.post('/market/purchases', function(request, response)
	{
		if (!request.User)
	    {
	        return response.send({success: false, error: 'Необходим вход в систему!'});
	    }

	    return Storage.lock(function(callback)
		{
		    return $(function(callback)
		    {
		    	return Storage.MarketItems.find(
		    	{
		    		buyer: request.User.steamId64,
		    		state: Storage.MarketItems.states.sold,
		    	})
		    	.sort('timeSold', 'desc').limit(100).toCollection(callback);
		    })
		    (function(marketItems, callback)
		    {
		    	response.send(
		    	{
		    		success: true,

		    		items: marketItems.map(function(marketItem)
		    		{
		    			return (
		    			{
		    				name: marketItem.name,
							image: marketItem.image,
							type: marketItem.type,
							categoryColor: marketItem.categoryColor,
							category: marketItem.category,
							qualityColor: marketItem.qualityColor,
							quality: marketItem.quality,
							exterior: marketItem.exterior,
							stickers: marketItem.stickers,
							price: marketItem.price,
							commission: marketItem.commission,
							timeSold: marketItem.timeSold,
		    			});
		    		}),
		    	});

		    	return callback(null);
		    })
		    (function(error)
			{
				if (error)
				{
					response.send(
					{
						success: false,
						error: 'Ошибка: ' + error,
					});
				}

				return callback(null);
			});
		});
	});
	
	Service.post('/market/sell', function(request, response)
	{
		if (!request.User)
	    {
	        return response.send({success: false, error: 'Необходим вход в систему!'});
	    }

	    return Storage.lock(function(callback)
		{
		    return $(function(callback)
		    {
		    	return Storage.MarketItems.find(
		    	{
		    		seller: request.User.steamId64,

		    		state:
		    		{
		    			$in:
		    			[
		    				Storage.MarketItems.states.justCreated,
		    				Storage.MarketItems.states.onSale,
		    			],
		    		},
		    	})
		    	.toCollection(callback);
		    })
		    (function(marketItems, callback) // ищем минимальную стоимость каждому маркет-предмету из уже выставленных
		    {
		    	return $(marketItems)(function(marketItem, callback)
		    	{
	    			return $(function(callback)
	    			{
	    				return Storage.MarketItems.find(
	    				{
	    					name: marketItem.name,
	    					state: Storage.MarketItems.states.onSale,
	    				})
	    				.sort('price', 'asc').toInstance(callback);
	    			})
	    			(function(marketItemWithMinialPrice, callback)
	    			{
	    				if (!marketItemWithMinialPrice)
	    				{
	    					marketItem.minimalPrice = 0.0;
	    					return callback(null);
	    				}

	    				marketItem.minimalPrice = marketItemWithMinialPrice.price;
	    				return callback(null);
	    			})
	    			(callback);
		    	})
		    	.series(function(error)
		    	{
		    		return callback(error, marketItems);
		    	});
		    })
		    (function(marketItems, callback) // ищем рекомендованную цену для каждого из предметов
			{
				return $(function(callback)
				{
					return Storage.Instances.find(
					{
						name:
						{
							$in: marketItems.map(function(marketItem)
							{
								return marketItem.name;
							}),
						},
					})
					.toCollection(callback);
				})
				(function(instances, callback)
				{
					marketItems.forEach(function(marketItem)
					{
						var instance = instances.find(
						{
							name: marketItem.name,
						})
						.first();

						marketItem.recommendedPrice = (instance ? instance.price: 0.0);
					});

					return callback(null, marketItems);
				})
				(callback);
			})
			(function(marketItems, callback)
		    {
		    	response.send(
		    	{
		    		success: true,

		    		items: marketItems.map(function(marketItem)
		    		{
		    			return (
		    			{
		    				_id: marketItem._id,
		    				name: marketItem.name,
							image: marketItem.image,
							type: marketItem.type,
							categoryColor: marketItem.categoryColor,
							category: marketItem.category,
							qualityColor: marketItem.qualityColor,
							quality: marketItem.quality,
							exterior: marketItem.exterior,
							stickers: marketItem.stickers,
							price: marketItem.price,
							minimalPrice: marketItem.minimalPrice,
							recommendedPrice: marketItem.recommendedPrice,
							commission: marketItem.commission,
		    			});
		    		}),
		    	});

		    	return callback(null);
		    })
		    (function(error)
			{
				if (error)
				{
					response.send(
					{
						success: false,
						error: 'Ошибка: ' + error,
					});
				}

				return callback(null);
			});
		});
	});

	Service.post('/market/onSale', function(request, response)
	{
		if (!request.User)
	    {
	        return response.send({success: false, error: 'Необходим вход в систему!'});
	    }

	    return Storage.lock(function(callback)
		{
		    return $(function(callback)
		    {
		    	return Storage.MarketItems.find(
		    	{
		    		seller: request.User.steamId64,
		    		state: Storage.MarketItems.states.onSale,
		    	})
		    	.toCollection(callback);
		    })
		    (function(marketItems, callback) // ищем минимальную стоимость каждому маркет-предмету из уже выставленных
		    {
		    	$(marketItems)(function(marketItem, callback)
		    	{
	    			return $(function(callback)
	    			{
	    				return Storage.MarketItems.find(
	    				{
	    					name: marketItem.name,
	    					state: Storage.MarketItems.states.onSale,
	    				})
	    				.sort('price', 'asc').toInstance(callback);
	    			})
	    			(function(marketItemWithMinialPrice, callback)
	    			{
	    				if (!marketItemWithMinialPrice)
	    				{
	    					marketItem.minimalPrice = 0.0;
	    					return callback(null);
	    				}

	    				marketItem.minimalPrice = marketItemWithMinialPrice.price;
	    				return callback(null);
	    			})
	    			(callback);
		    	})
		    	.series(function(error)
		    	{
		    		return callback(error, marketItems);
		    	});
		    })
		    (function(marketItems, callback) // ищем рекомендованную цену для каждого из предметов
			{
				return $(function(callback)
				{
					return Storage.Instances.find(
					{
						name:
						{
							$in: marketItems.map(function(marketItem)
							{
								return marketItem.name;
							}),
						},
					})
					.toCollection(callback);
				})
				(function(instances, callback)
				{
					marketItems.forEach(function(marketItem)
					{
						var instance = instances.find(
						{
							name: marketItem.name,
						})
						.first();

						marketItem.recommendedPrice = (instance ? instance.price: 0.0);
					});

					return callback(null, marketItems);
				})
				(callback);
			})
			(function(marketItems, callback)
		    {
		    	response.send(
		    	{
		    		success: true,

		    		items: marketItems.map(function(marketItem)
		    		{
		    			return (
		    			{
		    				_id: marketItem._id,
		    				name: marketItem.name,
							image: marketItem.image,
							type: marketItem.type,
							categoryColor: marketItem.categoryColor,
							category: marketItem.category,
							qualityColor: marketItem.qualityColor,
							quality: marketItem.quality,
							exterior: marketItem.exterior,
							stickers: marketItem.stickers,
							minimalPrice: marketItem.minimalPrice,
							recommendedPrice: marketItem.recommendedPrice,
							price: marketItem.price,
							commission: marketItem.commission,
		    			});
		    		}),
		    	});

		    	return callback(null);
		    })
		    (function(error)
			{
				if (error)
				{
					response.send(
					{
						success: false,
						error: 'Ошибка: ' + error,
					});
				}

				return callback(null);
			});
		});
	});

	Service.post('/market/sales', function(request, response)
	{
		if (!request.User)
	    {
	        return response.send({success: false, error: 'Необходим вход в систему!'});
	    }

	    return Storage.lock(function(callback)
		{
		    return $(function(callback)
		    {
		    	return Storage.MarketItems.find(
		    	{
		    		seller: request.User.steamId64,
		    		state: Storage.MarketItems.states.sold,
		    	})
		    	.sort('timeSold', 'desc').limit(100).toCollection(callback);
		    })
		    (function(marketItems, callback)
		    {
		    	response.send(
		    	{
		    		success: true,

		    		items: marketItems.map(function(marketItem)
		    		{
		    			return (
		    			{
		    				name: marketItem.name,
							image: marketItem.image,
							type: marketItem.type,
							categoryColor: marketItem.categoryColor,
							category: marketItem.category,
							qualityColor: marketItem.qualityColor,
							quality: marketItem.quality,
							exterior: marketItem.exterior,
							stickers: marketItem.stickers,
							price: marketItem.price,
							commission: marketItem.commission,
							timeSold: marketItem.timeSold,
		    			});
		    		}),
		    	});

		    	return callback(null);
		    })
		    (function(error)
			{
				if (error)
				{
					response.send(
					{
						success: false,
						error: 'Ошибка: ' + error,
					});
				}

				return callback(null);
			});
		});
	});
	
	Service.post('/market/returnBack', function(request, response)
	{
		if (!request.User)
	    {
	        return response.send({success: false, error: 'Необходим вход в систему!'});
	    }

	    if (!request.body._id)
	    {
	    	return response.send({success: false, error: 'Не найден параметр _id!'});
	    }

	    try
	    {
	    	Storage.ObjectID(request.body._id);
	    }
	    catch (error)
	    {
	    	return response.send({success: false, error: 'Неправильный параметр _id!'});
	    }

	    return Storage.lock(function(callback)
		{
			return $(function(callback)
			{
				return request.User.getInstance(callback);
			})
			(function(user, callback)
			{
			    return $(function(callback)
			    {
			    	return Storage.MarketItems.find(
			    	{
			    		_id: Storage.ObjectID(request.body._id),
			    	})
			    	.toInstance(callback);
			    })
			    (function(marketItem, callback)
			    {
			    	if (marketItem.seller != user.steamId64)
			    	{
			    		response.send({success: false, error: 'Вы не являетесь продавцом этого предмета!'});
			    		return callback('success');
			    	}

			    	if (marketItem.state != Storage.MarketItems.states.justCreated && marketItem.state != Storage.MarketItems.states.onSale)
			    	{
			    		response.send({success: false, error: 'Невозможно вернуть предмет в Ваш инвентарь'});
			    		return callback('success');
			    	}

			    	return $(function(callback) // получаем предмет маркет-предмета
			    	{
			    		return Storage.Items.find(
			    		{
			    			_id: marketItem.id,
			    		})
			    		.toInstance(callback);
			    	})
			    	(function(item, callback)
			    	{
			    		return item.set(
			    		{
			    			zone: '',
			    		})
			    		.save(callback);
			    	})
			    	(function(callback)
			    	{
			    		return marketItem.set(
			    		{
			    			state: Storage.MarketItems.states.returnedBack,
			    		})
			    		.save(callback);
			    	})
			    	(function(callback) // работаем с марект-экземпляром предмета
				    {
				    	return $(function(callback) // получаем маркет-экземпляр этого предмета
				    	{
				    		return Storage.MarketInstances.find(
				    		{
				    			name: marketItem.name,
				    		})
				    		.toInstance(callback);
				    	})
				    	(function(marketInstance, callback)
				    	{
				    		if (!marketInstance)
				    		{
				    			return callback(null);
				    		}

				    		return marketInstance.update(callback);
				    	})
				    	(callback);
				    })
				    (function(callback)
			    	{
			    		return user.emit('updateInventory', [callback]);
			    	})
			    	(function(callback)
			    	{
			    		response.send({success: true});
			    		return callback(null);
			    	})
			    	(callback);
			    })
				(callback);
			})
			(function(error)
			{
				if (error && error != 'success')
				{
					response.send(
					{
						success: false,
						error: 'Ошибка: ' + error,
					});
				}

				return callback(null);
			});
		});
	});
	
	Service.post('/market/toSale', function(request, response)
	{
		if (!request.User)
	    {
	        return response.send({success: false, error: 'Необходим вход в систему!'});
	    }

	    if (!request.body._id)
	    {
	    	return response.send({success: false, error: 'Не найден параметр _id!'});
	    }

	    try
	    {
	    	Storage.ObjectID(request.body._id);
	    }
	    catch (error)
	    {
	    	return response.send({success: false, error: 'Неправильный параметр _id!'});
	    }

	    if (!request.body.price)
	    {
	    	return response.send({success: false, error: 'Не найден параметр price!'});
	    }

	    var price = parseFloat(request.body.price);

	    if (isNaN(price))
	    {
	    	return response.send({success: false, error: 'Неверная цена предмета!'});
	    }

	    if (price < 0.01)
	    {
	    	return response.send({success: false, error: 'Цена предмета должна быть не меньше, чем <b>0.01 руб.</b>!'});
	    }

	    return Storage.lock(function(callback)
		{
		    return $(function(callback)
		    {
		    	return Storage.MarketItems.find(
		    	{
		    		_id: Storage.ObjectID(request.body._id),
		    	})
		    	.toInstance(callback);
		    })
		    (function(marketItem, callback)
		    {
		    	if (marketItem.seller != request.User.steamId64)
		    	{
		    		response.send({success: false, error: 'Вы не являетесь продавцом этого предмета!'});
		    		return callback('success');
		    	}

		    	if (marketItem.state != Storage.MarketItems.states.justCreated)
		    	{
		    		response.send({success: false, error: 'Невозможно выставить этот предмет на продажу'});
		    		return callback('success');
		    	}

		    	return marketItem.set(
	    		{
	    			price: price,
	    			state: Storage.MarketItems.states.onSale,
	    		})
	    		.save(function(error)
	    		{
	    			return callback(error, marketItem);
	    		});
		    })
		    (function(marketItem, callback) // работаем с марект-экземпляром предмета
		    {
		    	return $(function(callback) // получаем маркет-экземпляр этого предмета
		    	{
		    		return Storage.MarketInstances.find(
		    		{
		    			name: marketItem.name,
		    		})
		    		.toInstance(callback);
		    	})
		    	(function(marketInstance, callback)
		    	{
		    		if (marketInstance)
		    		{
		    			return callback(null, marketInstance);
		    		}

		    		return Storage.MarketInstances.create(
		    		{
						name: marketItem.name,
						image: marketItem.image,
						type: marketItem.type,
						categoryColor: marketItem.categoryColor,
						category: marketItem.category,
						qualityColor: marketItem.qualityColor,
						quality: marketItem.quality,
						exterior: marketItem.exterior,
						price: 0.0,
		    		})
		    		.save(function(error)
		    		{
		    			return callback(error, this);
		    		});
		    	})
		    	(function(marketInstance, callback)
		    	{
		    		return marketInstance.update(callback);
		    	})
		    	(callback);
		    })
			(function(callback)
		    {
		    	response.send({success: true});
		    	return callback(null);
		    })
		    (function(error)
			{
				if (error && error != 'success')
				{
					response.send(
					{
						success: false,
						error: 'Ошибка: ' + error,
					});
				}

				return callback(null);
			});
		});
	});
	
	Service.post('/market/changePrice', function(request, response)
	{
		if (!request.User)
	    {
	        return response.send({success: false, error: 'Необходим вход в систему!'});
	    }

	    if (!request.body._id)
	    {
	    	return response.send({success: false, error: 'Не найден параметр _id!'});
	    }

	    try
	    {
	    	Storage.ObjectID(request.body._id);
	    }
	    catch (error)
	    {
	    	return response.send({success: false, error: 'Неправильный параметр _id!'});
	    }

	    if (!request.body.price)
	    {
	    	return response.send({success: false, error: 'Не найден параметр price!'});
	    }

	    if (parseFloat(request.body.price) === NaN)
	    {
	    	return response.send({success: false, error: 'Неправильный параметр price!'});
	    }

	    var price = parseFloat(request.body.price);

	    if (price < 0.01)
	    {
	    	return response.send({success: false, error: 'Цена предмета должна быть не меньше, чем <b>0.01 руб.</b>!'});
	    }

	    return Storage.lock(function(callback)
		{
			return $(function(callback)
		    {
		    	return Storage.MarketItems.find(
		    	{
		    		_id: Storage.ObjectID(request.body._id),
		    	})
		    	.toInstance(callback);
		    })
		    (function(marketItem, callback)
		    {
		    	if (marketItem.seller != request.User.steamId64)
		    	{
		    		response.send({success: false, error: 'Вы не являетесь продавцом этого предмета!'});
		    		return callback('success');
		    	}

		    	if (marketItem.state != Storage.MarketItems.states.onSale)
		    	{
		    		response.send({success: false, error: 'Этот предмет не находится на продаже'});
		    		return callback('success');
		    	}

		    	return marketItem.set(
	    		{
	    			price: price,
	    		})
	    		.save(function(error)
	    		{
	    			return callback(error, marketItem);
	    		});
		    })
		    (function(marketItem, callback) // работаем с марект-экземпляром предмета
		    {
		    	return $(function(callback) // получаем маркет-экземпляр этого предмета
		    	{
		    		return Storage.MarketInstances.find(
		    		{
		    			name: marketItem.name,
		    		})
		    		.toInstance(callback);
		    	})
		    	(function(marketInstance, callback)
		    	{
		    		if (marketInstance)
		    		{
		    			return callback(null, marketInstance);
		    		}

		    		return Storage.MarketInstances.create(
		    		{
						name: marketItem.name,
						image: marketItem.image,
						type: marketItem.type,
						categoryColor: marketItem.categoryColor,
						category: marketItem.category,
						qualityColor: marketItem.qualityColor,
						quality: marketItem.quality,
						exterior: marketItem.exterior,
						price: 0.0,
		    		})
		    		.save(function(error)
		    		{
		    			return callback(error, this);
		    		});
		    	})
		    	(function(marketInstance, callback)
		    	{
		    		return marketInstance.update(callback);
		    	})
		    	(callback);
		    })
			(function(callback)
		    {
		    	response.send({success: true});
		    	return callback(null);
		    })
		    (function(error)
			{
				if (error && error != 'success')
				{
					response.send(
					{
						success: false,
						error: 'Ошибка: ' + error,
					});
				}

				return callback(null);
			});
		});
	});
	
	Service.post('/market/buy', function(request, response)
	{
		if (!request.User)
	    {
	        return response.send({success: false, error: 'Необходим вход в систему!'});
	    }

	    if (!request.body._id)
	    {
	    	return response.send({success: false, error: 'Не найден параметр _id!'});
	    }

	    try
	    {
	    	Storage.ObjectID(request.body._id);
	    }
	    catch (error)
	    {
	    	return response.send({success: false, error: 'Неправильный параметр _id!'});
	    }

	    if (!request.body.price)
	    {
	    	return response.send({success: false, error: 'Не найден параметр price!'});
	    }

	    if (parseFloat(request.body.price) === NaN)
	    {
	    	return response.send({success: false, error: 'Неправильный параметр price!'});
	    }

	    var price = parseFloat(request.body.price);
	    
	    return Storage.lock(function(callback)
		{
		    return $(function(callback)
		    {
		    	return Storage.MarketItems.find(
		    	{
		    		_id: Storage.ObjectID(request.body._id),
		    	})
		    	.toInstance(callback);
		    })
		    (function(marketItem, callback)
		    {
		    	if (marketItem.state != Storage.MarketItems.states.onSale)
		    	{
		    		response.send({success: false, error: 'Предмет не находится на продаже'});
		    		return callback('success');
		    	}

		    	return Storage.MarketInstances.find(
		    	{
		    		name: marketItem.name,
		    	})
		    	.toInstance(function(error, marketInstance)
		    	{
		    		return callback(null, marketInstance, marketItem);
		    	});
		    })
		    (function(marketInstance, marketItem, callback)
		    {
		    	if (marketItem.seller == request.User.steamId64)
		    	{
		    		response.send({success: false, error: 'Вы являетесь продавцом этого предмета и не можете его купить'});
		    		return callback('success');
		    	}

		    	if (marketItem.price > request.body.price)
		    	{
		    		response.send(
		    		{
		    			success: false,
		    			error: 'Цена предмета изменилась. Убедитесь, что Вы всё ещё хотите купить предмет!',
		    			price: marketItem.price,
		    		});

		    		return callback('success');
		    	}

		    	return callback(null, marketInstance, marketItem);
		    })
		    (function(marketInstance, marketItem, callback)
		    {
		    	return Storage.Users.find(
		    	{
		    		steamId64: request.User.steamId64,
		    	})
		    	.toInstance(function(error, buyer)
		    	{
		    		return callback(error, buyer, marketInstance, marketItem);
		    	});
		    })
		    (function(buyer, marketInstance, marketItem, callback)
		    {
		    	if (buyer.admin)
		    	{
		    		return callback(null, buyer, marketInstance, marketItem);
		    	}

		    	return buyer.isInventoryFull(function(error, full)
		    	{
		    		if (full)
		    		{
		    			response.send(
			    		{
			    			success: false,
			    			error: 'Вы не сможете купить предмет, пока в Вашем Инвентаре больше 32-х предметов. Выведите лишние предметы на свой Steam-инвентарь, чтобы продолжить работу с торговой площадкой.',
			    		});

			    		return callback('success');
		    		}

		    		return callback(null, buyer, marketInstance, marketItem);
		    	});
		    })
		    (function(buyer, marketInstance, marketItem, callback)
		    {
		    	if (buyer.balance < marketItem.price)
		    	{
		    		response.send(
		    		{
		    			success: false,
		    			error: 'Недостаточно средств на Вашем балансе для покупки данного предмета',
		    		});

		    		return callback('success');
		    	}

		    	return callback(null, buyer, marketInstance, marketItem);
		    })
		    (function(buyer, marketInstance, marketItem, callback)
		    {
		    	return Storage.Users.find(
		    	{
		    		steamId64: marketItem.seller,
		    	})
		    	.toInstance(function(error, seller)
		    	{
		    		return callback(error, buyer, seller, marketInstance, marketItem);
		    	});
		    })
		    (function(buyer, seller, marketInstance, marketItem, callback)
		    {
		    	var commission = marketItem.price * marketItem.commission;
		    	
		    	return $(function(callback) // добавляем деньги продавцу
		    	{
		    		seller.balance = Math.floor((seller.balance + (marketItem.price - commission)) * 100) / 100;
		    		return seller.save(callback);
		    	})
		    	(function(callback) // убавляем деньги покупателю
		    	{
		    		buyer.balance = Math.floor((buyer.balance - marketItem.price) * 100) / 100;
		    		return buyer.save(callback);
		    	})
		    	(function(callback) // добавляем деньги в комиссию
		    	{
		    		Data.market.commission = Math.floor((Data.market.commission + commission) * 100) / 100;
		    		return Data.save(callback);
		    	})
		    	(function(callback) // изменяем состояние маркет-предмету
		    	{
		    		marketItem.buyer = buyer.steamId64;
		    		marketItem.state = Storage.MarketItems.states.sold;
		    		return marketItem.save(callback);
		    	})
		    	(function(callback) // обновляем сам предмет маркет-предмета
		    	{
		    		return $(function(callback)
		    		{
		    			return Storage.Items.find(
		    			{
		    				_id: marketItem.id,
		    			})
		    			.toInstance(callback);
		    		})
		    		(function(item, callback)
		    		{
		    			++Data.lastItemIndex;

		    			return item.set(
		    			{
		    				index: Data.lastItemIndex,
		    				user: buyer.steamId64,
		    				zone: '',
		    				data: {},
		    			})
		    			.save(callback);
		    		})
		    		(function(callback)
		    		{
		    			return Data.save(callback);
		    		})
		    		(callback);
		    	})
		    	(function(callback) // обновляем маркет-экзмепляр предмета
		    	{
		    		return marketInstance.update(callback);
		    	})
		    	(function(callback) // обновляем инвентарь покупателя
		    	{
		    		return buyer.emit('updateInventory', [callback]);
		    	})
		    	(function(callback) // обновляем инвентарь продавца
		    	{
		    		return seller.emit('updateInventory', [callback]);
		    	})
		    	(function(callback)
		    	{
		    		return buyer.emit('updateBalance',
		    		[
		    			'market.buyItem',
		    			-marketItem.price,
		    			callback,
		    		]);
		    	})
		    	(function(callback)
		    	{
		    		return seller.emit('updateBalance',
		    		[
		    			'market.soldItem',
		    			Math.floor(marketItem.price / (1.0 + marketItem.commission) * 100) / 100,
		    			callback,
		    		]);
		    	})
		    	(function(error)
		    	{
		    		return callback(error, marketInstance);
		    	});
		    })
			(function(marketInstance, callback)
		    {
		    	response.send(
		    	{
		    		success: true,
		    		ended: (marketInstance.state == Storage.MarketInstances.states.outOfStock),
		    	});
		    	
		    	return callback(null);
		    })
		    (function(error)
			{
				if (error && error != 'success')
				{
					response.send(
					{
						success: false,
						error: 'Ошибка: ' + error,
					});
				}

				return callback(null);
			});
		});
	});
	
	Service.post('/detachVKPage', function(request, response)
	{
		if (!request.User)
		{
			return response.send(
			{
				success: false,
				error: 'Вы не авторизованы',
			});
		}

		return Storage.lock(function(callback)
		{
			return $(function(callback)
			{
				return request.User.getInstance(callback);
			})
			(function(user, callback)
			{
				return user.set(
				{
					VKontakte: 0,
				})
				.save(callback);
			})
			(function(callback)
			{
				response.send(
				{
					success: true,
				});

				return callback(null);
			})
			(callback);
		});
	});
	
	Service.post('/xsolla', function(request, response)
	{
		if (request.body.notification_type == 'user_validation') // проверка на существование пользователя в нашей базе данных
		{
			return Storage.Users.find(
			{
				steamId64: request.body.user.id,
			})
			.toInstance(function(error, user)
			{
				if (error)
				{
					return response.status(500).send(error);
				}

				if (user)
				{
					return response.status(204).send();
				}

				return response.status(400).send(
				{
					error:
					{
						code: 'INVALID_USER',
					},
				});
			});
		}

		if (request.body.notification_type == 'payment')
		{
			var sha1 = crypto.createHash('sha1');
			sha1.update(JSON.stringify(request.body) + 'fNSYgD8Pnj0WRAfq');
			var authorization = 'Signature ' + sha1.digest('hex');
			
			if (authorization != request.headers.authorization) // если подпись не верна
			{
				return response.status(400).send(
				{
					error:
					{
						code: 'INVALID_SIGNATURE',
					},
				});
			}

			return response.status(200).send();
		}

		// console.log(request.headers);
		// console.log(request.body);

		return response.status(400).send();
	});
	
	Service.post('/webmoney', function(request, response)
	{
		if (request.body.LMI_PREREQUEST) // это предзапрос
		{
			console.log('Предварительный запрос...', request.body);

			return Storage.lock(function(callback)
			{
				return $(function(callback) // ищем в базе данных входящий платеж с таким номером
				{
					return Storage.InboundPayments.find(
					{
						id: parseInt(request.body.LMI_PAYMENT_NO),
					})
					.toInstance(callback);
				})
				(function(error, inboundPayment)
				{
					if (error)
					{
						console.log(error.stack);
						return callback(null), response.status(500).send('Ошибка: ' + error);
					}

					if (!inboundPayment)
					{
						console.log('Платеж не найден');
						return callback(null), response.status(400).send('Платеж не найден');
					}

					if (inboundPayment.amount != parseFloat(request.body.LMI_PAYMENT_AMOUNT))
					{
						console.log('Неверная сумма платежа: ' + inboundPayment.amount + ', ' + request.body.LMI_PAYMENT_AMOUNT)
						return callback(null), response.status(400).send('Неверная сумма платежа');
					}

					return callback(null), response.send('YES');
				});
			});
		}

		console.log('Основной запрос');
		var string = '';
		string += request.body.LMI_PAYEE_PURSE;
		string += request.body.LMI_PAYMENT_AMOUNT;
		string += request.body.LMI_PAYMENT_NO;
		string += request.body.LMI_MODE;
		string += request.body.LMI_SYS_INVS_NO;
		string += request.body.LMI_SYS_TRANS_NO;
		string += request.body.LMI_SYS_TRANS_DATE;
		string += Config.WebMoney.secretKey;
		string += request.body.LMI_PAYER_PURSE;
		string += request.body.LMI_PAYER_WM;

		if (crypto.createHash('sha256').update(string).digest('hex').toUpperCase() !== request.body.LMI_HASH)
		{
			return response.status(400).send('Неверная подпись');
		}

		return Storage.lock(function(callback)
		{
			return $(function(callback)
			{
				return Storage.InboundPayments.find(
				{
					id: parseInt(request.body.LMI_PAYMENT_NO),
				})
				.toInstance(callback);
			})
			(function(inboundPayment, callback) // обновляем состояние платежа
			{
				if (!inboundPayment)
				{
					return callback(new Error('Не удалось найти входящий платеж по ID: ' + request.body.InvId));
				}

				return inboundPayment.set(
				{
					state: Storage.InboundPayments.states.paid,
				})
				.save(function(error)
				{
					return callback(error, inboundPayment);
				});
			})
			(function(inboundPayment, callback)
			{
				return Storage.Users.find(
				{
					steamId64: inboundPayment.user,
				})
				.toInstance(function(error, user)
				{
					return callback(error, inboundPayment, user);
				});
			})
			(function(inboundPayment, user, callback)
			{
				user.balance = Math.floor((user.balance + inboundPayment.amount) * 100) / 100;

				return user.save(function(error)
				{
					return callback(error, inboundPayment, user);
				});
			})
			(function(inboundPayment, user, callback)
			{
				return user.emit('updateBalance',
	    		[
	    			'inboundPayment',
	    			inboundPayment.amount,
	    			callback,
	    		]);
			})
			(function(error)
			{
				if (error)
				{
					console.log(error.stack);
					return callback(null), response.status(500).send('Ошибка: ' + error);
				}

				return callback(null), response.status(200).send();
			});
		});
	});

	Service.get('/webmoney/success', function(request, response)
	{
		return Storage.lock(function(callback)
		{
			return $(function(callback)
			{
				return Storage.InboundPayments.find(
				{
					id: parseInt(request.query.id),
				})
				.toInstance(callback);
			})
			(function(inboundPayment, callback)
			{
				if (inboundPayment)
				{
					request.session.notificate =
					{
						name: 'inboundPaymentIsPaid',
						amount: inboundPayment.amount,
					};
				}

				response.redirect('/' + (request.query.back ? '#' + request.query.back : ''));
				return callback(null);
			})
			(function(error)
			{
				if (error)
				{
					console.log(error);
					response.send('Ошибка: ' + error);
				}

				return callback(null);
			});
		});
	});

	Service.get('/webmoney/fail', function(request, response)
	{
		return Storage.lock(function(callback)
		{
			return $(function(callback)
			{
				return Storage.InboundPayments.find(
				{
					id: parseInt(request.query.id),
				})
				.toInstance(callback);
			})
			(function(inboundPayment, callback)
			{
				if (inboundPayment)
				{
					request.session.notificate =
					{
						name: 'inboundPaymentIsFail',
						amount: inboundPayment.amount,
					};
				}

				response.redirect('/' + (request.query.back ? '#' + request.query.back : ''));
				return callback(null);
			})
			(function(error)
			{
				if (error)
				{
					console.log(error);
					response.send('Ошибка: ' + error);
				}

				return callback(null);
			});
		});
	});

	Service.post('/robokassa', function(request, response)
	{
		console.log('/robokassa', request.body);
		request.body.SignatureValue = request.body.SignatureValue || '';
		request.body.SignatureValue = request.body.SignatureValue.toUpperCase();

		var params = [];
		params.push(request.body.OutSum);
		params.push(request.body.InvId);
		params.push(Config.RoboKassa.password2);
		var hash = crypto.createHash('sha1').update(params.join(':')).digest('hex').toUpperCase();
		console.log(hash, request.body.SignatureValue);

		if (hash !== request.body.SignatureValue)
		{
			console.log('Подпись не верна!');
			return response.status(400).send();
		}

		return Storage.lock(function(callback)
		{
			return $(function(callback)
			{
				return Storage.InboundPayments.find(
				{
					id: parseInt(request.body.InvId),
				})
				.toInstance(callback);
			})
			(function(inboundPayment, callback) // обновляем состояние платежа
			{
				if (!inboundPayment)
				{
					return callback(new Error('Не удалось найти входящий платеж по ID: ' + request.body.InvId));
				}

				return inboundPayment.set(
				{
					state: Storage.InboundPayments.states.paid,
				})
				.save(function(error)
				{
					return callback(error, inboundPayment);
				});
			})
			(function(inboundPayment, callback)
			{
				return Storage.Users.find(
				{
					steamId64: inboundPayment.user,
				})
				.toInstance(function(error, user)
				{
					return callback(error, inboundPayment, user);
				});
			})
			(function(inboundPayment, user, callback)
			{
				user.balance = Math.floor((user.balance + inboundPayment.amount) * 100) / 100;

				return user.save(function(error)
				{
					return callback(error, inboundPayment, user);
				});
			})
			(function(inboundPayment, user, callback)
			{
				return user.emit('updateBalance',
	    		[
	    			'inboundPayment',
	    			inboundPayment.amount,

	    			function(error)
	    			{
	    				return callback(error, inboundPayment);
	    			},
	    		]);
			})
			(function(error, inboundPayment)
			{
				if (error)
				{
					console.log(error.stack);
					return callback(null), response.status(500).send('Ошибка: ' + error);
				}

				return callback(null), response.status(200).send('OK' + inboundPayment.id);
			});
		});
	});

	Service.post('/robokassa/success', function(request, response)
	{
		console.log('/robokassa/success');
		request.body.SignatureValue = request.body.SignatureValue || '';
		request.body.SignatureValue = request.body.SignatureValue.toUpperCase();

		var params = [];
		params.push(request.body.OutSum);
		params.push(request.body.InvId);
		params.push(Config.RoboKassa.password1);
		var hash = crypto.createHash('sha1').update(params.join(':')).digest('hex').toUpperCase();
		console.log(hash, request.body.SignatureValue);
		
		if (hash !== request.body.SignatureValue)
		{
			return response.status(400).send('Неверная подпись');
		}

		return Storage.lock(function(callback)
		{
			return $(function(callback)
			{
				return Storage.InboundPayments.find(
				{
					id: parseInt(request.body.InvId),
				})
				.toInstance(callback);
			})
			(function(inboundPayment, callback)
			{
				if (inboundPayment)
				{
					request.session.notificate =
					{
						name: 'inboundPaymentIsPaid',
						amount: inboundPayment.amount,
					};
				}

				response.redirect('/' + (request.session.back ? '#' + request.session.back : ''));
				return callback(null);
			})
			(function(error)
			{
				if (error)
				{
					console.log(error);
					response.send('Ошибка: ' + error);
				}

				return callback(null);
			});
		});
	});

	Service.post('/robokassa/fail', function(request, response)
	{
		return Storage.lock(function(callback)
		{
			return $(function(callback)
			{
				return Storage.InboundPayments.find(
				{
					id: parseInt(request.body.InvId),
				})
				.toInstance(callback);
			})
			(function(inboundPayment, callback)
			{
				if (inboundPayment)
				{
					request.session.notificate =
					{
						name: 'inboundPaymentIsFail',
						amount: inboundPayment.amount,
					};
				}

				response.redirect('/' + (request.session.back ? '#' + request.session.back : ''));
				return callback(null);
			})
			(function(error)
			{
				if (error)
				{
					console.log(error);
					response.send('Ошибка: ' + error);
				}

				return callback(null);
			});
		});
	});

	Service.get('/makeInboundPayment', function(request, response)
	{
		if (!request.User)
		{
			return response.send('Необходима авторизация в системе');
		}

		if (!request.query.amount)
		{
			return response.send('Не найден обязательный параметр amount');
		}

		if (!request.query.system)
		{
			return response.send('Не найден обязательный параметр system');
		}

		if (['WebMoney', 'RoboKassa'].indexOf(request.query.system) < 0)
		{
			return response.send('Платежная система не найдена');
		}

		request.query.amount = parseFloat(request.query.amount);

		if (request.query.amount === NaN || request.query.amount <= 0.0)
		{
			return response.send('Неправильный параметр amount');
		}

		return Storage.lock(function(callback)
		{
			return $(function(callback)
			{
				++Data.lastInboundPaymentId;

				return Storage.InboundPayments.create(
				{
					id: Data.lastInboundPaymentId,
					user: request.User.steamId64,
					amount: request.query.amount,
					system: request.query.system,
				})
				.save(function(error)
				{
					return callback(error, this);
				});
			})
			(function(inboundPayment, callback)
			{
				return Data.save(function(error)
				{
					return callback(error, inboundPayment);
				});
			})
			(function(inboundPayment, callback)
			{
				if (inboundPayment.system == 'WebMoney')
				{
					response.render('webmoney',
					{
						transaction: inboundPayment.id,
						amount: inboundPayment.amount,
						purse: Config.WebMoney.WMR,
						description: (new Buffer('Пополнение баланса пользователя ' + inboundPayment.user)).toString('base64'),
						successUrl: 'http://' + Config.host + '/webmoney/success?id=' + inboundPayment.id + (request.query.back ? '&back=' + request.query.back : ''),
						failUrl: 'http://' + Config.host + '/webmoney/fail?id=' + inboundPayment.id + (request.query.back ? '&back=' + request.query.back : ''),
					});

					return callback(null);
				}

				if (inboundPayment.system == 'RoboKassa')
				{
					var params = [];
					params.push(Config.RoboKassa.login);
					params.push(inboundPayment.amount);
					params.push(inboundPayment.id);
					params.push(Config.RoboKassa.password1);
					
					request.session.back = request.query.back || '';

					response.render('robokassa',
					{
						login: Config.RoboKassa.login,
						transaction: inboundPayment.id,
						amount: inboundPayment.amount,
						description: 'Пополнение баланса пользователя ' + inboundPayment.user,
						signature: crypto.createHash('sha1').update(params.join(':')).digest('hex'),
					});

					return callback(null);
				}

				return callback(new Error('Не установлен обработчик на платежную систему: ' + inboundPayment.system));
			})
			(function(error)
			{
				if (error)
				{
					response.send('Ошибка: ' + error);
				}

				return callback(null);
			});
		});
	});
	
	// Service.post('/qiwi/notify', qiwi.auth, function(request, response)
	// {
	// 	console.log('qiwi notify');
	// 	console.log(request.body.bill_id);
	// 	console.log(request.body.status);
	// 	return response.set('Content-Type', 'text/xml').send('<?xml version="1.0"?><result><result_code>0</result_code></result>');
	// });

	return callback(null);
});

// --------------------------------------------------

chain(function(callback)
{
	Service.listen(Config.express.port);
	console.log('Слушаем #' + Config.express.port + ' порт...');
	return callback(null);
});

// --------------------------------------------------

// qiwi.bill(
// {
// 	sender: '+79503244917',
// 	amount: 2.0,
// 	comment: 'Пополнение баланса пользователя',
// 	index: 25,
// },
// function(error, data)
// {
// 	console.log(error, data);
// });

// var request = require('request');

// var qiwi =
// {
// 	shopId: 391647,
// 	apiId: 39323844,
// 	apiPassword: 'ViF9SeVqaFn5EoaFkncl',
// };

// request(
// {
// 	uri: 'https://api.qiwi.com/api/v2/prv/' + qiwi.shopId + '/bills/2',
// 	method: 'PUT',
// 	json: true,

// 	headers:
// 	{
// 		'Authorization': 'Basic ' + new Buffer(qiwi.apiId + ':' + qiwi.apiPassword).toString('base64'),
// 	},

// 	form:
// 	{
// 		amount: 2.0,
// 		user: 'tel:+79503244917',
// 		ccy: 'RUB',
// 		comment: 'Пополнение баланса пользователя ...',
// 		lifetime: (new Date(Date.now() - (new Date).getTimezoneOffset() * 60 * 1000 + 45 * 86400 * 1000)).toISOString().slice(0, -1),
// 	},
// },
// function(error, response, body)
// {
// 	if (error)
// 	{
// 		console.log(error);
// 		return;
// 	}

// 	console.log(response.statusCode, body);
// });

Storage.ready(function()
{
	return chain.waterfall(function(error)
	{
		if (error)
		{
			console.error(error.stack);
		}
	});
});

process.on('SIGINT', function()
{
	Storage.lock(function(callback)
	{
		io.close();
		global.Controller && global.Controller.disconnect();
		process.exit();
	});
});
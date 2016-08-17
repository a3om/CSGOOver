module.exports = function(Storage, global)
{
	this.common =
	{
		states:
		{
			justCreated: 0,		// только создана
			started: 1, // началась
			taped: 2, // запустилась рулетка
			completed: 3, // завершена
		},

		gameTime: 60,
		tapeTime: 20,
	};

	this.methods =
	{
		start: function(callback)
		{
			var self = this;
			
			return self.set(
			{
				updatedAt: getTime(),
				state: Storage.TapeGames.states.started,
			})
			.save(callback);
		},

		startTape: function(callback)
		{
			var self = this;
			
			return $(function(callback) // ищем предмет из игры с рандомным билетом и определяем победителя этой игры
			{
				if (self.needWinner) // если имеется принужденный победитель, устанавливаем его
				{
					self.winner = self.needWinner;
				}
				else // если же нет, выбираем победителя рандомно
				{
					var randomTicket = Math.floor(self.ticketsCount * self.random) + 1;
					var item = null;

					self.items.forEach(function(gameItem)
					{
						if (item || randomTicket < gameItem.ticketFrom || randomTicket > gameItem.ticketTo)
						{
							return;
						}

						item = gameItem;
					});

					if (!item)
					{
						return callback('Не удалось найти предмет с рандомным билетом');
					}

					self.winner = item.user;
				}

				return callback(null);
			})
			(function(callback) // генерируем ленту пользователей для рулетки
			{
				for (var position = 0; position < 110; ++position)
				{
					var randomTicket = Math.floor(self.ticketsCount * Math.random()) + 1;
					var item = null;

					self.items.forEach(function(gameItem)
					{
						if (item || randomTicket < gameItem.ticketFrom || randomTicket > gameItem.ticketTo)
						{
							return;
						}

						item = gameItem;
					});

					if (!item)
					{
						return callback('Не удалось найти предмет с рандомным билетом для составления ленты');
					}

					self.tape.push(item.user);
				}

				return callback(null);
			})
			(function(callback) // узнаем, есть ли победитель на позиции в диапазоне с 5 + 50 по 5 + 99
			{
				var exists = false;

				for (var position = 5 + 50; position < 5 + 99; ++position)
				{
					if (self.tape[position] != self.winner)
					{
						continue;
					}

					exists = true;
					break;
				}

				return callback(null, exists);
			})
			(function(exists, callback) // если победителя нет ни на одной из позиции в диапазоне с 5 + 50 по 5 + 99
			{
				if (exists)
				{
					return callback(null);
				}

				var randomPosition = 5 + 50 + Math.floor(50 * Math.random());
				self.tape[randomPosition] = self.winner;
				return callback(null);
			})
			(function(callback) // ищем позицию пользователя победителя в ленте начиная с её конца
			{
				var winnerPosition = -1;

				for (var position = 5 + 99; position >= 5 + 50; --position)
				{
					if (self.tape[position] != self.winner)
					{
						continue;
					}

					winnerPosition = position;
					break;
				}

				if (winnerPosition < 0)
				{
					return callback('Не удалось найти позицию пользователя-победителя в ленте');
				}

				self.tapeWinnerRandom = winnerPosition + Math.random();
				return callback(null);
			})
			(function(callback) // ищем пользователя-победителя среди пользователей игроков игры
			{
				var user = null;

				self.users.forEach(function(gameUser)
				{
					if (user || gameUser.steamId64 != self.winner)
					{
						return;
					}

					user = gameUser;
				});

				if (!user)
				{
					return callback('Не удалось найти пользователя-победителя в этой игре');
				}

				return callback(null, user);
			})
			(function(user, callback) // определяем, какие предметы перейдут в комиссию, а какие перейдут победителю (плюс считаем суммы)
			{
				var items = self.items.slice(0).sort(function(item0, item1)
				{
					return item0.price > item1.price;
				});

				var commissionPercent = (user.percent >= 0.85) ? 0.0 : 0.1;
				var maximumCommissionSum = self.sum * commissionPercent;
				var accumulator = 0.0;

				items.forEach(function(item)
		        {
		        	if (accumulator + item.price > maximumCommissionSum)
		            {
		                return;
		            }

		            accumulator += item.price;
		            self.commissionSum += item.price;
		            item.commission = true;
		        });

				self.winSum = self.sum - self.commissionSum;
				return callback(null);
			})
			(function(callback) // помечаем комиссионные предметы для этой игры
			{
				return Storage.Items.find(
				{
					_id:
					{
						$in: self.items.filter(function(gameItem)
						{
							return gameItem.commission;
						})
						.map(function(gameItem)
						{
							return gameItem._id;
						}),
					}
				})
				.toCollection(function(error, items)
				{
					if (error)
					{
						return callback(error);
					}

					return items.set(
					{
						commission: true,
					})
					.save(callback);
				});
			})
			(function(callback) // сохраняем игру
			{
				return self.set(
				{
					updatedAt: getTime(),
					state: Storage.TapeGames.states.taped,
				})
				.save(callback);
			})
			(callback);
		},

		complete: function(callback)
		{
			var self = this;

			return $(function(callback) // получаем пользователя-победителя в этой игре
			{
				return Storage.Users.find(
				{
					steamId64: self.winner,
				})
				.toInstance(callback);
			})
			(function(user, callback)
			{
				var gameUser = self.getUser(user);
				user.tapeWinsCount += 1;
				user.tapeWinSum += (self.winSum - gameUser.sum);
				return user.save(callback);
			})
			(function(callback) // получаем предметы, которые должны перейти победителю
			{
				return Storage.Items.find(
				{
					_id:
					{
						$in: self.items.filter(function(item)
						{
							return !item.commission;
						})
						.map(function(item)
						{
							return item._id;
						}),
					},
				})
				.toCollection(callback);
			})
			(function(items, callback) // получаем предметы, которые останутся в комиссии
			{
				return Storage.Items.find(
				{
					_id:
					{
						$in: self.items.filter(function(item)
						{
							return item.commission;
						})
						.map(function(item)
						{
							return item._id;
						}),
					},
				})
				.toCollection(function(error, commissionItems)
				{
					return callback(error, items, commissionItems);
				});
			})
			(function(items, commissionItems, callback) // получаем пользователей всех предметов
			{
				var usersSteamId64 = [];

				items.forEach(function(item)
				{
					if (usersSteamId64.indexOf(item.user) > -1)
					{
						return;
					}

					usersSteamId64.push(item.user);
				});

				commissionItems.forEach(function(item)
				{
					if (usersSteamId64.indexOf(item.user) > -1)
					{
						return;
					}

					usersSteamId64.push(item.user);
				});

				return Storage.Users.find(
				{
					steamId64:
					{
						$in: usersSteamId64,
					},
				})
				.toCollection(function(error, users)
				{
					return callback(error, users, items, commissionItems);
				});
			})
			(function(users, items, commissionItems, callback) // переводим предметы победителю
			{
				items.forEach(function(item)
				{
					if (item.user != self.winner)
					{
						++Data.lastItemIndex;
						item.index = Data.lastItemIndex;
						item.user = self.winner;
					}

					item.zone = '';
					item.data = {};
				});

				return items.save(function(error)
				{
					return callback(error, users, commissionItems);
				});
			})
			(function(users, commissionItems, callback)
			{
				return Data.save(function(error)
				{
					return callback(error, users, commissionItems);
				});
			})
			(function(users, commissionItems, callback) // переводим комиссионные предметы в зону комиссии
			{
				commissionItems.forEach(function(commissionItem)
				{
					commissionItem._newId = Storage.ObjectID();
					commissionItem.user = null;
					commissionItem.zone = 'tape';
					commissionItem.commission = true;
				});

				return commissionItems.save(function(error)
				{
					return callback(error, users);
				});
			})
			(function(users, callback) // последовательно обновляем инвентари всех пользователей этой игры
			{
				return $(users)(function(user, callback)
				{
					return user.emit('updateInventory', [callback]);
				})
				.series(tasks, function(error)
				{
					return callback(error);
				});
			})
			(function(callback) // завершаем игру
			{
				return self.set(
				{
					updatedAt: getTime(),
					state: Storage.TapeGames.states.completed,
				})
				.save(callback);
			})
			(callback);
		},

		getUser: function(user)
		{
			var self = this;
			var foundGameUser = null

			self.users.forEach(function(gameUser)
			{
				if (foundGameUser || gameUser.steamId64 != user.steamId64)
				{
					return;
				}

				foundGameUser = gameUser;
			});

			return foundGameUser;
		},

		getUserBySteamId64: function(steamId64)
		{
			var self = this;
			var foundGameUser = null

			self.users.forEach(function(gameUser)
			{
				if (foundGameUser || gameUser.steamId64 != steamId64)
				{
					return;
				}

				foundGameUser = gameUser;
			});

			return foundGameUser;
		},

		hasUser: function(user)
		{
			var self = this;
			return self.getUser(user) !== null;
		},

		addUser: function(user)
		{
			var self = this;

			if (self.hasUser(user))
			{
				return;
			}

			var gameUser =
			{
				steamId64: user.steamId64,
				name: user.name,
				sum: 0.0,
				avatarMedium: user.avatarMedium,
				avatarLarge: user.avatarLarge,
				percent: 0.0,
				itemsCount: 0,
				first: (self.users.length == 0),
			}

			self.users.push(gameUser);
			return gameUser;
		},

		addItem: function(item)
		{
			var self = this;

			self.items.push(
			{
				_id: item._id,
				name: item.name,
				image: item.image,
				price: item.data.price,
				user: item.user,
				color: item.qualityColor,
				quality: item.quality,
				category: item.category,
				categoryColor: item.categoryColor,
				exterior: item.exterior,
				ticketFrom: self.ticketsCount + 1,
				ticketTo: self.ticketsCount + Math.floor(item.data.price / CostToTicket),
			});

			self.sum += item.data.price;
			self.ticketsCount += Math.floor(item.data.price / CostToTicket);
		}
	};
	
	this.properties =
	{
		id: 0,					// наш собственный ID игры
		state: 0,				// состояние игры
		updatedAt: 0,			// время последнего обновления игры
		sum: 0.0,				// сумма всех предметов этой игры
		ticketsCount: 0,		// количество билетов в этой игре
		random: 0.0,			// рандомное число этой игры
		winner: null,			// победитель этой игры
		winSum: 0.0,			// сумма выигрыша в этой игре
		commissionSum: 0.0,		// сумма комиссии в этой игре
		users: [],				// пользователи этой игры
		items: [],				// предметы этой игры
		tape: [],				// рулетка пользователей в этой игре
		tapeWinnerRandom: 0.0,	// позиция победителя в рулетке
	};
};
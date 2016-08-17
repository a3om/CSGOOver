module.exports = function(Storage, global)
{
	this.common =
	{
		//
	};
	
	this.properties =
	{
		steamId64: '',
		steamId32: 0,
		name: '',
		avatarMedium: '',
		avatarLarge: '',
		accessToken: '',
		secretKey: '',
		balance: 0.0,
		lastIp: '0.0.0.0',
		VKontakte: 0,
		admin: 0,

		inventoryOrder: 'index', // сортировать по _id (сортировка всегда в обратном пор€дке)

		tapeWinsCount: 0,	// количество побед в рулетке
		tapeWinSum: 0.0,	// сумма выигрышей в рулетке - сортировочное поле
	};

	this.methods =
	{
		getInstance: function(callback)
		{
			var self = this;
			
			return Storage.Users.find(
			{
				steamId64: self.steamId64,
			})
			.toInstance(callback);
		},

		isInventoryFull: function(callback)
		{
			var self = this;

			return Storage.Items.find(
			{
				user: self.steamId64,

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
				if (error)
				{
					return callback(error);
				}

				return callback(null, count > global.MaximumUserInventoryItemsCount);
			});
		},
	};

	this.events =
	{
		updateInventory: function(callback)
		{
			var self = this;
			
			return $(function(callback)
			{
				return Storage.Items.find(
				{
					user: self.steamId64,

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
			(function(items, callback) // получаем экземпл€ры предметов из нашей базы данных
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
				items.forEach(function(item) // находим каждому предмету экземпл€р
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
				items = items.sort(self.inventoryOrder, 'desc');
				console.log('users.updateInventory', self.steamId64);

				io.to(self.steamId64).emit('users.updateInventory',
				{
					items: items.map(function(item)
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
					}),
				});

				return callback(null);
			})
			(callback);
		},

		updateBalance: function(message, change, callback)
		{
			var self = this;

			io.to(self.steamId64).emit('users.updateBalance',
			{
				message: message,
				change: change,
				balance: self.balance,
			});

			return callback(null);
		},

		updateOutboundTransfer: function(outboundTransfer, callback)
		{
			var self = this;

			io.to(self.steamId64).emit('users.updateOutboundTransfer',
			{
				steamId: outboundTransfer.steamId,
				state: outboundTransfer.state,
				steamState: outboundTransfer.steamState,
			});

			return callback(null);
		},
	};
};
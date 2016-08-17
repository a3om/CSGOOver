var socket = null;
var now = 0;

var title =
{
	update: function(value)
	{
		$('title').text((value ? value + ' - ' : '') + 'CSGOOver.ru');
	},
};

var loader =
{
	count: 0,

	add: function()
	{
		++this.count;

		if (this.count > 1)
		{
			return;
		}

		$('#ajaxLoader').stop().show().css('background', 'rgba(0, 0, 0, 0.5)');
	},

	remove: function(callback)
	{
		--this.count;

		if (this.count > 0)
		{
			return callback && callback(), recalculateSizes();
		}

		$('#ajaxLoader').stop().fadeOut('fast', function()
		{
			$(this).css('background', 'rgba(0, 0, 0, 0.0)');
			return callback && callback(), recalculateSizes();
		});
	},
};

var ajax = function(options, callback)
{
	loader.add();

	$.ajax(options).done(function(data)
	{
		if (!data.success)
		{
			loader.remove();
			return callback(data.error || 'Неизвестная ошибка', data);
		}

		return loader.remove(function()
		{
			return callback(null, data);
		});
	})
	.fail(function()
	{
		loader.remove();
		return callback('Неизвестная ошибка', {});
	})
};

var Items =
{
	states:
	{
		reserved: 1,
		real: 2,
		transmitting: 3,
	},
};

var OutboundTransfers =
{
	states:
	{
		hasId: 2,
		notNeedAnymore: 4,
	},
};

var inventory =
{
	bodyOverflowOffset: 0,
	maximumItemsCount: 32,
	items: [],
	sum: 0.0,
	markedItems: [],
	movingItemsToZone: false,
	allItemsMarked: false,
	outboundTransfer: null,
	scrollOffsetX: 0,
	zone: '',

	getItem: function(id)
	{
		var self = this;
		var foundItem = null;

		self.items.forEach(function(item)
		{
			if (foundItem || item._id != id)
			{
				return;
			}

			foundItem = item;
		});

		return foundItem;
	},

	update: function()
	{
		var self = this;

		self.markedItems.slice(0).forEach(function(itemId, index)
		{
			var item = self.getItem(itemId);

			if (item && item.state == Items.states.real && !item.zone)
			{
				return;
			}

			console.log(itemId + ' сняли выделение ');
			self.markedItems.splice(self.markedItems.indexOf(itemId), 1);
		});

		self.sum = 0.0;

		self.items.forEach(function(item)
		{
			self.sum += item.price;
		});

		self.sum = Math.floor(self.sum * 100) / 100;
		self.render();
	},

	render: function()
	{
		var self = this;
		$self = $('#inventory');
		$items = $self.find('.items');
		$items.html('');

		self.items.forEach(function(item)
		{
			var html = '<div class="';

			if (item.state == Items.states.reserved)
			{
				html += 'reserved';
			}
			else if (item.state == Items.states.real)
			{
				html += 'real';
			}
			else if (item.state == Items.states.transmitting)
			{
				html += 'transmitting';
			}

			if (self.markedItems.indexOf(item._id) > -1)
			{
				html += ' marked';
			}

			if (item.state == Items.states.real && !item.zone)
			{
				html += ' selectable';
			}

			if (item.zone)
			{
				html += (' ' + item.zone + 'Zone');
			}

			html += ' item" data-id="' + item._id + '" data-state="' + item.state + '"';
			html += ' data-zone="' + (item.zone ? item.zone : '') + '"';
			html += ' title="' + item.name + '"';

			if (item.category && item.category != 'Normal')
			{
				html += ' style="border-color: #' + item.categoryColor + ';"';
			}

			html += '>' +
				'<img src="http://steamcommunity-a.akamaihd.net/economy/image/' + item.image + '/80fx60f" alt="">';

			if (item.category && item.category != 'Normal')
			{
				html += '<div class="category" style="background: #' + item.categoryColor + ';" title="' + item.category +'"></div>';
			}
			
			if (item.quality)
			{
				html += '<div class="quality" style="background: #' + item.qualityColor + ';" title="' + item.quality +'"></div>';
			}

			if (item.price == 0.0)
			{
				html += '<div class="no price" title="Цена Steam для этого предмета неизвестна">нет цены</div>';
			}
			else
			{
				html += '<div class="price">' + (Math.floor(item.price * 100) / 100) + ' руб.</div>';
			}

			html += '<div class="stickers">';

			item.stickers.forEach(function(sticker)
			{
				html += '<img src="' + sticker.image + '" alt="" title="' + sticker.name + '">';
			});
			
			html += '</div>';
			html += '</div>';
			$items.append(html);
		});

		if (self.items.length == 0)
		{
			$items.append('<div class="noItems">В инвентаре нет ни одного предмета</div>');
		}

		$items.find('.item').click(function()
		{
			$item = $(this);

			if (!$item.hasClass('selectable'))
			{
				return;
			}

			var itemId = $item.attr('data-id');
			var itemState = $item.attr('data-state');
			var itemZone = $item.attr('data-zone');

			if (self.markedItems.indexOf(itemId) > -1)
			{
				$item.removeClass('marked');
				self.markedItems.splice(self.markedItems.indexOf(itemId), 1);
			}
			else
			{
				if (itemState == Items.states.real && !itemZone)
				{
					$item.addClass('marked');
					self.markedItems.push(itemId);
					inventory.allItemsMarked = true;
				}
			}

			if (self.markedItems.length > 0)
			{
				$('#inventory .status span').text('Выделено ' + self.markedItems.length + ' из ' + self.items.length);

				if (self.outboundTransfer)
				{
					$('#inventory .cancel').addClass('large');
					$('#inventory .confirmOutboundTransfer').hide();
				}
				else
				{
					$('#inventory .cancel').removeClass('large');
					$('#inventory .confirmOutboundTransfer').show();
				}

				$('#inventory .cancel').show();
				$('#inventory .selectAll').show();
				$('#inventory .makeOutboundTransfer').hide();
			}
			else
			{
				$self.find('.status span').text('Инвентарь (' + self.items.length + ' из ' + self.maximumItemsCount + ') (' + self.sum + ' руб.)');
				$('#inventory .cancel').hide();
				$('#inventory .confirmOutboundTransfer').hide();
				$('#inventory .selectAll').hide();

				if (!inventory.outboundTransfer)
				{
					$('#inventory .makeOutboundTransfer').show();
				}
			}
			
			if (self.movingItemsToZone)
			{
				if (self.markedItems.length > 0)
				{
					$('#inventory .status').hide();
					$('#inventory .moveToZone .count').text('(' + self.markedItems.length + ' из ' + self.items.length + ')');
					$('#inventory .moveToZone').show();
					$('#inventory .outboundTransfer').hide();
					inventory.allItemsMarked = false;
				}
				else
				{
					$('#inventory .status').show();
					$('#inventory .moveToZone').hide();
					$('#inventory .outboundTransfer').show();
				}
			}
		});

		var itemsWidth = $('#inventory .items').width();
		var itemWidth = $('#inventory .item').outerWidth(true);

		if (itemWidth * self.items.length < itemsWidth - self.bodyOverflowOffset)
		{
			$('#inventory .items').css('left', '0');
		}
		else
		{
			if (self.scrollOffsetX < -(itemWidth * self.items.length - itemsWidth + self.bodyOverflowOffset))
			{
				self.scrollOffsetX = -(itemWidth * self.items.length - itemsWidth + self.bodyOverflowOffset);
			}

			$('#inventory .items').css('left', self.scrollOffsetX + 'px');
		}
		
		if (self.outboundTransfer)
		{
			if (self.outboundTransfer.state == OutboundTransfers.states.hasId)
			{
				$('#inventory .waitingOutboundTransfer').hide();

				$('#inventory .acceptOutboundTransfer')
					.attr('href', 'https://steamcommunity.com/tradeoffer/' + self.outboundTransfer.steamId)
					.show();
			}
			else
			{
				$('#inventory .waitingOutboundTransfer').show();
				$('#inventory .acceptOutboundTransfer').hide();
			}

			$('#inventory .selectAll').hide();
			$('#inventory .confirmOutboundTransfer').hide();
			$('#inventory .cancel').hide();
			$('#inventory .makeOutboundTransfer').hide();
			$('#inventory .moveToZone').hide();
			$('#inventory .status').show();
		}
		else
		{
			$('#inventory .waitingOutboundTransfer').hide();
			$('#inventory .acceptOutboundTransfer').hide();

			if (self.markedItems.length > 0)
			{
				$('#inventory .makeOutboundTransfer').hide();
				$('#inventory .confirmOutboundTransfer').show();
			}
			else
			{
				$('#inventory .makeOutboundTransfer').show();
				$('#inventory .confirmOutboundTransfer').hide();
			}
		}

		if (self.markedItems.length > 0)
		{
			$('#inventory .status').hide();
			$('#inventory .moveToZone .count').text('(' + self.markedItems.length + ' из ' + self.items.length + ')');
			$('#inventory .moveToZone').show();
			$('#inventory .selectAll').show();
			$('#inventory .cancel').show();
			$('#inventory .outboundTransfer').hide();
		}
		else
		{
			$('#inventory .status span').text('Инвентарь (' + self.items.length + ' из ' + self.maximumItemsCount + ') (' + self.sum + ' руб.)');
			$('#inventory .selectAll').hide();
			$('#inventory .moveToZone').hide();
			$('#inventory .status').show();
			$('#inventory .cancel').hide();
			$('#inventory .outboundTransfer').show();
		}
	},

	scroll: function(direction)
	{
		var self = this;
		var itemsWidth = $('#inventory .items').width();
		var itemWidth = $('#inventory .item').outerWidth(true);

		if (itemWidth * self.items.length < itemsWidth - self.bodyOverflowOffset)
		{
			return;
		}

		self.scrollOffsetX = self.scrollOffsetX + itemWidth * 1 * direction;

		if (self.scrollOffsetX > 0)
		{
			self.scrollOffsetX = 0;
		}
		else if (self.scrollOffsetX < -(itemWidth * self.items.length - itemsWidth + self.bodyOverflowOffset))
		{
			self.scrollOffsetX = -(itemWidth * self.items.length - itemsWidth + self.bodyOverflowOffset);
		}

		$('#inventory .items').css('left', self.scrollOffsetX + 'px');
	}
};

var router =
{
	initialized: false,
	currentRoute: '',

	update: function(hash)
	{
		var self = this;
		hash = (hash === undefined) ? self.currentRoute : hash;
		self.currentRoute = hash;
		self.recover();
		console.log('hash: ' + hash);

		if (!self.routes[hash])
		{
			console.log('Неизвестный маршрут: ' + hash);
			return;
		}

		self.routes[hash]();
		self.jumped();
		self.initialized = true;
	},

	routes:
	{
		// '#': function()
		// {
		// 	console.log('Главная страница');
		// 	$('#indexPage').show();
		// },

		'#tape': function()
		{
			title.update('Рулетка');
			$('#header .tape.menu').show();
			$('#tapePage').show();
			$('#tapePage .content .game').show();
			$('#tapePage .side .menu a.play').addClass('active');
			$('#header .zones a.tape').addClass('active');
			$('#inventory .moveToZone .text').text('Переместить в рулетку');
			inventory.movingItemsToZone = true;
			inventory.zone = 'tape';
		},

		'#tape/top': function()
		{
			title.update('Топ - Рулетка');
			$('#header .tape.menu').show();
			$('#tapePage').show();
			$('#tapePage .side .menu a.top').addClass('active');
			$('#header .zones a.tape').addClass('active');
			$('#tapePage .content .top').show();

			ajax(
			{
				url: '/tape/top',
				method: 'POST',
			},
			function(error, data)
			{
				if (error)
				{
					console.log(error, data);
					return;
				}

				data.users.forEach(function(user, index)
				{
					var $topUser = $('#tapePage .content .top .topUser.template').clone().removeClass('template');
					$topUser.find('.position').text(index + 1);
					$topUser.find('.avatar img').attr('src', user.avatarLarge);
					$topUser.find('.name').text(user.name);
					$topUser.find('.winsCount').text(user.tapeWinsCount);
					$topUser.find('.winSum span').text(Math.floor(user.tapeWinSum * 100) / 100);
					$topUser.appendTo('#tapePage .content .top .topUsers');
				});

				$('#tapePage .content .top .topUsers').show();
				$('#tapePage table').show();
			});
		},

		'#tape/history': function()
		{
			title.update('История - Рулетка');
			$('#header .tape.menu').show();
			$('#tapePage').show();
			$('#tapePage .side .menu a.history').addClass('active');
			$('#header .zones a.tape').addClass('active');
			$('#tapePage .content .history').show();

			ajax(
			{
				url: '/tape/history',
				method: 'POST',
			},
			function(error, data)
			{
				if (error)
				{
					console.log(error, data);
					return;
				}

				data.games.forEach(function(game, index)
				{
					if (index != 0)
					{
						$('#tapePage .content .history .historyGames').append('<div class="distance"></div>');
					}

					var $histroyGame = $('#tapePage .content .history .historyGame.template').clone().removeClass('template');
					$histroyGame.find('.title').text('Игра №' + game.id);
					$histroyGame.find('.winner .avatar img').attr('src', game.winner.avatarLarge);
					$histroyGame.find('.winner .information .name').text(game.winner.name);
					$histroyGame.find('.winner .information .sum span').text(Math.floor(game.winSum * 100) / 100);
					$histroyGame.find('.winner .information .chance span').text(Math.round(game.winner.percent * 100 * 100) / 100);

					game.users.forEach(function(user)
					{
						var $user = $histroyGame.find('.user.template').clone().removeClass('template');
						$user.attr('title', user.name);
						$user.find('img').attr('src', user.avatarLarge);
						$user.find('.chance span').text(Math.round(user.percent * 100 * 100) / 100);
						$user.appendTo($histroyGame.find('.users'));
					});

					game.items.forEach(function(item)
					{
						var $item = $histroyGame.find('.item.template').clone().removeClass('template');
						$item.attr('title', item.name);
						$item.find('img').attr('src', 'http://steamcommunity-a.akamaihd.net/economy/image/' + item.image + '/72fx72f');
						$item.find('.quality').css('background', '#' + item.color).attr('title', item.quality);

						if (item.category && item.category != 'Normal')
						{
							$item.find('.category').css('background', '#' + item.categoryColor).attr('title', item.category);
						}
						else
						{
							$item.find('.category').hide();
						}

						$item.find('.price span').text(Math.floor(item.price * 100) / 100);
						$item.appendTo($histroyGame.find('.items'));
					});

					$histroyGame.appendTo('#tapePage .content .history .historyGames');
				});

				$('#tapePage .content .history .historyGames').show();
			});
		},

		'#tape/rules': function()
		{
			title.update('Правила - Рулетка');
			$('#header .tape.menu').show();
			$('#tapePage').show();
			$('#tapePage .side .menu a.rules').addClass('active');
			$('#header .zones a.tape').addClass('active');
			$('#tapePage .content .rules').show();
		},

		'#tape/commission': function()
		{
			if (!user || !user.admin)
			{
				window.location.hash = '#tape';
				return;
			}

			title.update('Комиссия - Рулетка');
			$('#header .tape.menu').show();
			$('#tapePage').show();
			$('#tapePage .side .menu a.commission').addClass('active');
			$('#header .zones a.tape').addClass('active');
			$('#tapePage .content .commission').show();
			$('#tapePage .content .commission .items').html('').hide();
			$('#tapePage .content .commission .noItems').hide();
			$('#tapePage .content .commission .get').hide();

			ajax(
			{
				url: '/tape/commission',
				method: 'POST',
			},
			function(error, data)
			{
				if (error)
				{
					console.log(error, data);
					return;
				}

				data.items.forEach(function(item, index)
				{
					var $item = $('#tapePage .content .commission .item.template').clone().removeClass('template');
					$item.attr('title', item.name);
					$item.find('img').attr('src', 'http://steamcommunity-a.akamaihd.net/economy/image/' + item.image + '/72fx72f');
					$item.find('.quality').css('background', '#' + item.color).attr('title', item.quality);

					if (item.category && item.category != 'Normal')
					{
						$item.find('.category').css('background', '#' + item.categoryColor).attr('title', item.category);
					}
					else
					{
						$item.find('.category').hide();
					}

					$item.find('.price span').text(Math.floor(item.price * 100) / 100);
					$item.appendTo('#tapePage .content .commission .items');
				});

				if (data.items.length == 0)
				{
					$('#tapePage .content .commission .noItems').show();
				}
				else
				{
					$('#tapePage .content .commission .items').show();
					$('#tapePage .content .commission .get').show();
					$('#tapePage .content .commission .get span').text(data.items.length);
				}
			});
		},

		'': function()
		{
			title.update('Торговая площадка');
			$('#marketPage .buy.container').show();
			$('#header .zones a.market').addClass('active');
			$('#marketPage .menu a.buy').addClass('active');
			$('#header .market.menu').show();
			$('#footer .menu .market').show();
			$('#marketPage').show();
			$('#inventory .moveToZone .text').text('Переместить на торговую площадку');
			inventory.movingItemsToZone = true;
			inventory.zone = 'market';
			Zones.market.update();

			if (user)
			{
				console.log('вошел!');
				$('#marketPage .menu').show();
				$('#marketPage .buy.container .notLoggedIn').hide();
			}
			else
			{
				$('#marketPage .menu').hide();
				$('#marketPage .buy.container .notLoggedIn').show();
			}
		},

		'#market/purchases': function()
		{
			if (!user)
			{
				window.location.hash = '#';
				return;
			}

			title.update('Мои покупки - Торговая площадка');
			$('#marketPage .purchases.container').show();
			$('#header .zones a.market').addClass('active');
			$('#marketPage .menu a.purchases').addClass('active');
			$('#header .market.menu').show();
			$('#footer .menu .market').show();
			$('#marketPage').show();
			$('#inventory .moveToZone .text').text('Переместить на торговую площадку');
			inventory.movingItemsToZone = true;
			inventory.zone = 'market';

			ajax(
			{
				url: '/market/purchases',
				method: 'POST',
			},
			function(error, data)
			{
				if (error)
				{
					console.log(error, data);
					return;
				}

				data.items.forEach(function(item, index)
				{
					var $item = $('#marketPage .purchases.container .item.template').clone().removeClass('template');
					$item.find('.instance img').attr('src', 'http://steamcommunity-a.akamaihd.net/economy/image/' + item.image + '/80fx60f');
					$item.attr('data-_id', item._id);

					item.stickers.forEach(function(sticker)
					{
						$item.find('.instance .stickers').append('<img src="' + sticker.image + '" alt="" title="' + sticker.name + '">');
					});

					if (item.exterior)
					{
						$item.find('.instance .exterior').text(item.exterior).show();
					}
					else
					{
						$item.find('.instance .exterior').hide();
					}

					if (item.category && item.category != 'Normal')
					{
						$item.find('.instance .category').css('background', '#' + item.categoryColor).text(item.category).show();
					}
					else
					{
						$item.find('.instance .category').hide();
					}

					$item.find('.instance .quality').css('background', '#' + item.qualityColor).attr('title', item.quality);
					$item.find('.price').text(item.price);
					$item.find('.date').text((new Date(parseInt(item.timeSold))).toString('dd.MM.yyyy'));
					$item.appendTo('#marketPage .purchases.container .items');
				});

				if (data.items.length > 0)
				{
					$('#marketPage .purchases.container .items').show();
				}
				else
				{
					$('#marketPage .purchases.container .noItems').show();
				}
			});
		},

		'#market/sell': function()
		{
			if (!user)
			{
				window.location.hash = '#';
				return;
			}

			title.update('Продать предметы - Торговая площадка');
			$('#marketPage .sell.container').show();
			$('#header .zones a.market').addClass('active');
			$('#marketPage .menu a.sell').addClass('active');
			$('#header .market.menu').show();
			$('#footer .menu .market').show();
			$('#marketPage').show();
			$('#inventory .moveToZone .text').text('Переместить на торговую площадку');
			inventory.movingItemsToZone = true;
			inventory.zone = 'market';

			ajax(
			{
				url: '/market/sell',
				method: 'POST',
			},
			function(error, data)
			{
				if (error)
				{
					console.log(error, data);
					return;
				}

				data.items.forEach(function(item, index)
				{
					var $item = $('#marketPage .sell.container .item.template').clone().removeClass('template');
					$item.find('img').attr('src', 'http://steamcommunity-a.akamaihd.net/economy/image/' + item.image + '/80fx60f');
					$item.attr('data-_id', item._id);
					$item.attr('title', item.name);

					item.stickers.forEach(function(sticker)
					{
						$item.find('.stickers').append('<img src="' + sticker.image + '" alt="" title="' + sticker.name + '">');
					});

					if (item.exterior)
					{
						$item.find('.exterior').text(item.exterior).show();
					}
					else
					{
						$item.find('.exterior').hide();
					}

					if (item.category && item.category != 'Normal')
					{
						$item.css('border-color', '#' + item.categoryColor);
					}

					$item.find('.quality').css('background', '#' + item.qualityColor).attr('title', item.quality);
					
					if (item.price == 0.0)
					{
						$item.find('.price').text('не продается').addClass('no');
					}
					else
					{
						$item.find('.price').html('<span>' + Math.floor(item.price * 100) / 100 + '</span> руб.').removeClass('no');
					}

					if (item.minimalPrice > 0.0)
					{
						$item.find('.minimal.price span').text(item.minimalPrice);
					}
					else
					{
						$item.find('.minimal.price').addClass('undefined').text('Не известна');
					}

					if (item.recommendedPrice > 0.0)
					{
						$item.find('.recommended.price span').text(item.recommendedPrice);
					}
					else
					{
						$item.find('.recommended.price').addClass('undefined').text('Не известна');
					}

					$item.appendTo('#marketPage .sell.container .items');

					$item.find('.toInventory').click(function()
					{
						ajax(
						{
							url: '/market/returnBack',
							method: 'POST',

							data:
							{
								_id: item._id
							},
						},
						function(error, data)
						{
							if (error)
							{
								noty(
								{
									text: '<div>' + error + '</div>',
									type: 'error',
								});

								return;
							}

							$item.remove();

							if ($('#marketPage .sell.container .items .item').length == 0)
							{
								$('#marketPage .sell.container .items').hide();
								$('#marketPage .sell.container .noItems').show();
							}

							noty(
							{
								text: '<div>Ваш предмет успешно возвращен в инвентарь!</div>',
								type: 'success',
							});
						});

						return false;
					});

					$item.click(function() // открываем модальное окно
					{
						var $modal = $('.marketItem.modal');
						var $itemIntoModal = $modal.find('.content .item');
						$itemIntoModal.attr('title', item.name);
						$itemIntoModal.find('img').attr('src', 'http://steamcommunity-a.akamaihd.net/economy/image/' + item.image + '/80fx60f');
						$itemIntoModal.find('.quality').css('background', '#' + item.qualityColor).attr('title', item.quality);

						if (item.category && item.category != 'Normal')
						{
							$itemIntoModal.css('border-color', '#' + item.categoryColor);
						}

						item.stickers.forEach(function(sticker)
						{
							$itemIntoModal.find('.stickers').append('<img src="' + sticker.image + '" alt="" title="' + sticker.name + '">');
						});

						if (item.exterior)
						{
							$itemIntoModal.find('.exterior').text(item.exterior).show();
						}
						else
						{
							$itemIntoModal.find('.exterior').hide();
						}

						if (item.price == 0.0)
						{
							$itemIntoModal.find('.price').text('не продается').addClass('no');
							$modal.find('.settings .includingCommission.price input').val('0');
							$modal.find('.settings .excludingCommission.price input').val('0');
							$modal.find('.save').text('Выставить предмет на продажу');
						}
						else
						{
							$itemIntoModal.find('.price').html('<span>' + Math.floor(item.price * 100) / 100 + '</span> руб.').removeClass('no');
							$modal.find('.settings .includingCommission.price input').val(Math.floor(item.price * 100) / 100);
							var excludingCommissionPrice = Math.floor(item.price / (1.0 + item.commission) * 100) / 100;
							$modal.find('.settings .excludingCommission.price input').val(excludingCommissionPrice);
							$modal.find('.save').text('Обновить цену предмета');
						}

						if (item.minimalPrice)
						{
							$modal.find('.settings .recommendedPrice span').text(Math.floor(item.minimalPrice * 100) / 100);
							$modal.find('.settings .recommendedPrice').show();
						}
						else
						{
							$modal.find('.settings .recommendedPrice').hide();
						}

						$itemIntoModal.find('.toInventory').unbind('click').click(function()
						{
							ajax(
							{
								url: '/market/returnBack',
								method: 'POST',

								data:
								{
									_id: item._id
								},
							},
							function(error, data)
							{
								if (error)
								{
									noty(
									{
										text: '<div>' + error + '</div>',
										type: 'error',
									});

									return;
								}

								$item.remove();
								$('.marketItem.modal').stop().fadeOut('fast');
								$('body').removeClass('nonScrollable');

								noty(
								{
									text: '<div>Ваш предмет успешно возвращен в инвентарь!</div>',
									type: 'success',
								});
							});

							return false;
						});

						$modal.find('.settings .price input').unbind('keyup').keyup(function()
						{
							var price = parseFloat($(this).val());

							if (isNaN(price))
							{
								return;
							}

							if ($(this).parent().hasClass('includingCommission'))
							{
								var excludingCommissionPrice = Math.floor(price / (1.0 + item.commission) * 100) / 100;
								$modal.find('.excludingCommission.price input').val(excludingCommissionPrice);
							}
							else
							{
								var includingCommissionPrice = Math.floor(price * (1.0 + item.commission) * 100) / 100;
								$modal.find('.includingCommission.price input').val(includingCommissionPrice);
							}
						});

						$modal.find('.settings .recommendedPrice').click(function()
						{
							if ($(this).hasClass('undefined'))
							{
								return;
							}

							var price = parseFloat($(this).find('span').text());
							$modal.find('.settings .includingCommission.price input').val(price);
							var excludingCommissionPrice = Math.floor(price / (1.0 + item.commission) * 100) / 100;
							$modal.find('.settings .excludingCommission.price input').val(excludingCommissionPrice);
						});

						$itemIntoModal.find('.toInventory').unbind('click').click(function()
						{
							ajax(
							{
								url: '/market/returnBack',
								method: 'POST',

								data:
								{
									_id: item._id
								},
							},
							function(error, data)
							{
								if (error)
								{
									noty(
									{
										text: '<div>' + error + '</div>',
										type: 'error',
									});

									return;
								}

								$item.remove();

								if ($('#marketPage .sell.container .items .item').length == 0)
								{
									$('#marketPage .sell.container .items').hide();
									$('#marketPage .sell.container .noItems').show();
								}

								$('.marketItem.modal').stop().fadeOut('fast');
								$('body').removeClass('nonScrollable');

								noty(
								{
									text: '<div>Ваш предмет успешно возвращен в инвентарь!</div>',
									type: 'success',
								});
							});

							return false;
						});

						$modal.find('.settings .save').unbind('click').click(function()
						{
							var price = $modal.find('.settings .includingCommission.price input').val();

							ajax(
							{
								url: (item.price == 0.0) ? '/market/toSale' : '/market/changePrice',
								method: 'POST',

								data:
								{
									_id: item._id,
									price: price,
								},
							},
							function(error, data)
							{
								if (error)
								{
									noty(
									{
										text: '<div>' + error + '</div>',
										type: 'error',
									});

									return;
								}

								noty(
								{
									text: '<div>' + (item.price == 0.0 ? 'Ваш предмет успешно выставлен на продажу!' : 'Цена предмета была успешно обновлена') + '</div>',
									type: 'success',
								});

								item.price = Math.floor(price * 100) / 100;
								$item.find('.price').html('<span>' + Math.floor(price * 100) / 100 + '</span> руб.').removeClass('no');
								$('.marketItem.modal').stop().fadeOut('fast');
								$('body').removeClass('nonScrollable');
							});
						});
						
						$('body').addClass('nonScrollable');
						$modal.show();
					});
				});
				
				if (data.items.length > 0)
				{
					$('#marketPage .sell.container .items').show();
				}
				else
				{
					$('#marketPage .sell.container .noItems').show();
				}
			});
		},

		'#market/onSale': function()
		{
			if (!user)
			{
				window.location.hash = '#';
				return;
			}

			title.update('Предметы на продаже - Торговая площадка');
			$('#marketPage .onSale.container').show();
			$('#header .zones a.market').addClass('active');
			$('#marketPage .menu a.onSale').addClass('active');
			$('#header .market.menu').show();
			$('#footer .menu .market').show();
			$('#marketPage').show();
			$('#inventory .moveToZone .text').text('Переместить на торговую площадку');
			inventory.movingItemsToZone = true;
			inventory.zone = 'market';

			ajax(
			{
				url: '/market/onSale',
				method: 'POST',
			},
			function(error, data)
			{
				if (error)
				{
					console.log(error, data);
					return;
				}

				data.items.forEach(function(item, index)
				{
					var $item = $('#marketPage .onSale.container .item.template').clone().removeClass('template');
					$item.find('.instance img').attr('src', 'http://steamcommunity-a.akamaihd.net/economy/image/' + item.image + '/80fx60f');
					$item.attr('data-_id', item._id);
					$item.find('.instance').attr('title', item.name);

					item.stickers.forEach(function(sticker)
					{
						$item.find('.instance .stickers').append('<img src="' + sticker.image + '" alt="" title="' + sticker.name + '">');
					});

					if (item.exterior)
					{
						$item.find('.instance .exterior').text(item.exterior).show();
					}
					else
					{
						$item.find('.instance .exterior').hide();
					}

					if (item.category && item.category != 'Normal')
					{
						$item.find('.instance .category').css('background', '#' + item.categoryColor).text(item.category).show();
					}
					else
					{
						$item.find('.instance .category').hide();
					}

					$item.find('.instance .quality').css('background', '#' + item.qualityColor).attr('title', item.quality);

					if (item.minimalPrice > 0.0)
					{
						$item.find('.minimal.price span').text(item.minimalPrice);
					}
					else
					{
						$item.find('.minimal.price').addClass('undefined').text('Не известна');
					}

					if (item.recommendedPrice > 0.0)
					{
						$item.find('.recommended.price span').text(item.recommendedPrice);
					}
					else
					{
						$item.find('.recommended.price').addClass('undefined').text('Не известна');
					}

					$item.find('.includingCommission.setPrice input').val(item.price);
					var excludingCommissionPrice = Math.floor(item.price / (1.0 + item.commission) * 100) / 100;
					$item.find('.excludingCommission.setPrice input').val(excludingCommissionPrice);

					$item.appendTo('#marketPage .onSale.container .items');

					$item.find('.control .returnBack.button').click(function()
					{
						ajax(
						{
							url: '/market/returnBack',
							method: 'POST',

							data:
							{
								_id: item._id
							},
						},
						function(error, data)
						{
							if (error)
							{
								noty(
								{
									text: '<div>' + error + '</div>',
									type: 'error',
								});

								return;
							}

							$item.remove();

							noty(
							{
								text: '<div>Ваш предмет успешно возвращен в инвентарь!</div>',
								type: 'success',
							});
						});
					});

					$item.find('.control .changePrice.button').click(function()
					{
						var price = $item.find('.includingCommission.setPrice input').val();

						ajax(
						{
							url: '/market/changePrice',
							method: 'POST',

							data:
							{
								_id: item._id,
								price: price,
							},
						},
						function(error, data)
						{
							if (!data.success)
							{
								noty(
								{
									text: '<div>' + error + '</div>',
									type: 'error',
								});

								return;
							}

							noty(
							{
								text: '<div>Цена Вашего предмета успешно изменена!</div>',
								type: 'success',
							});
						});
					});

					$item.find('.setPrice input').keyup(function()
					{
						var price = parseFloat($(this).val());

						if (isNaN(price))
						{
							return;
						}

						if ($(this).parent().hasClass('includingCommission'))
						{
							var excludingCommissionPrice = Math.floor(price / (1.0 + item.commission) * 100) / 100;
							$item.find('.excludingCommission.setPrice input').val(excludingCommissionPrice);
						}
						else
						{
							var includingCommissionPrice = Math.floor(price * (1.0 + item.commission) * 100) / 100;
							$item.find('.includingCommission.setPrice input').val(includingCommissionPrice);
						}
					});

					$item.find('.price').click(function()
					{
						if ($(this).hasClass('undefined'))
						{
							return;
						}

						var price = parseFloat($(this).find('span').text());
						$item.find('.includingCommission.setPrice input').val(price);
						var excludingCommissionPrice = Math.floor(price / (1.0 + item.commission) * 100) / 100;
						$item.find('.excludingCommission.setPrice input').val(excludingCommissionPrice);
					});
				});
				
				if (data.items.length > 0)
				{
					$('#marketPage .onSale.container table').show();
				}
			});
		},

		'#market/sales': function()
		{
			if (!user)
			{
				window.location.hash = '#';
				return;
			}

			title.update('Мои продажи - Торговая площадка');
			$('#marketPage .sales.container').show();
			$('#header .zones a.market').addClass('active');
			$('#marketPage .menu a.sales').addClass('active');
			$('#header .market.menu').show();
			$('#footer .menu .market').show();
			$('#marketPage').show();
			$('#inventory .moveToZone .text').text('Переместить на торговую площадку');
			inventory.movingItemsToZone = true;
			inventory.zone = 'market';

			ajax(
			{
				url: '/market/sales',
				method: 'POST',
			},
			function(error, data)
			{
				if (error)
				{
					console.log(error, data);
					return;
				}

				data.items.forEach(function(item, index)
				{
					var $item = $('#marketPage .sales.container .item.template').clone().removeClass('template');
					$item.find('img').attr('src', 'http://steamcommunity-a.akamaihd.net/economy/image/' + item.image + '/80fx60f');
					$item.attr('data-_id', item._id);

					item.stickers.forEach(function(sticker)
					{
						$item.find('.stickers').append('<img src="' + sticker.image + '" alt="" title="' + sticker.name + '">');
					});

					if (item.exterior)
					{
						$item.find('.exterior').text(item.exterior).show();
					}
					else
					{
						$item.find('.exterior').hide();
					}

					if (item.category && item.category != 'Normal')
					{
						$item.find('.category').css('background', '#' + item.categoryColor).text(item.category).show();
					}
					else
					{
						$item.find('.category').hide();
					}

					$item.find('.quality').css('background', '#' + item.qualityColor).attr('title', item.quality);
					$item.find('.price').text((Math.floor(item.price / (1.0 + item.commission) * 100) / 100) + ' руб.');
					$item.find('.date').text((new Date(parseInt(item.timeSold))).toString('dd.MM.yyyy'));
					$item.appendTo('#marketPage .sales.container .items');
				});

				if (data.items.length > 0)
				{
					$('#marketPage .sales.container .items').show();
				}
				else
				{
					$('#marketPage .sales.container .noItems').show();
				}
			});
		},

		'#market/information': function()
		{
			title.update('Информация - Торговая площадка');
			$('#marketPage .information.container').show();
			$('#header .zones a.market').addClass('active');
			$('#header .market.menu').show();
			$('#footer .menu .market').show();
			$('#marketPage').show();
		},

		'#balance/in': function()
		{
			title.update('Пополнение баланса');
			$('#balancePage .in.container').show();
			$('#balancePage').show();
		},

		'#balance/out': function()
		{
			title.update('Вывод средств с баланса');
			$('#balancePage .out.container').show();
			$('#balancePage').show();
		},
	},

	recover: function()
	{
		$('#indexPage').hide();
		$('#tapePage').hide();
		$('#marketPage').hide();
		$('#informationPage').hide();
		$('#balancePage').hide();

		$('#tapePage .content .game').hide();
		$('#tapePage .content .top .topUsers').html('').hide();
		$('#tapePage .content .top table').hide();
		$('#tapePage .content .top').hide();
		$('#tapePage .content .history .historyGames').html('').hide();
		$('#tapePage .content .history').hide();
		$('#tapePage .content .rules').hide();
		$('#tapePage .content .commission').hide();
		$('#tapePage .side .menu a').removeClass('active');

		$('#marketPage .buy.container .items').html('').hide();
		$('#marketPage .buy.container .notFoundItems').hide();
		$('#marketPage .buy.container .paginator').hide();
		$('#marketPage .buy.container').hide();
		$('#marketPage .purchases.container .items').html('').hide();
		$('#marketPage .purchases.container .noItems').hide();
		$('#marketPage .purchases.container').hide();
		$('#marketPage .sell.container .items').html('').hide();
		$('#marketPage .sell.container .noItems').hide();
		$('#marketPage .sell.container').hide();
		$('#marketPage .onSale.container table').hide().find('.items').html('');
		$('#marketPage .onSale.container').hide();
		$('#marketPage .sales.container .items').html('').hide();
		$('#marketPage .sales.container .noItems').hide();
		$('#marketPage .sales.container').hide();
		$('#marketPage .information.container').hide();
		$('#marketPage .menu a').removeClass('active');

		$('#balancePage .in.container').hide();
		$('#balancePage .out.container').hide();

		$('#header .zones a').removeClass('active');
		inventory.movingItemsToZone = false;
		inventory.zone = '';

		$('#footer .menu .market').hide();
		$('#header .menu').hide();
	},

	jumped: function()
	{
		if (inventory.markedItems.length > 0 && !inventory.movingItemsToZone)
		{
			$('#inventory .status span').text('Инвентарь (' + inventory.items.length + ' из ' + inventory.maximumItemsCount + ') (' + inventory.sum + ' руб.)');
			$('#inventory .status').show();
			$('#inventory .moveToZone').hide();
			$('#inventory .outboundTransfer').show();
			$('#inventory .item').removeClass('marked');
			inventory.markedItems = [];
		}

		if (inventory.movingItemsToZone)
		{
			$('#inventory .item[data-state=' + Items.states.real + '][data-zone=""]').addClass('selectable');
		}

		recalculateSizes();
	},
};

var TapeGames =
{
	states:
	{
		justCreated: 0,
		started: 1,
		taped: 2,
	},
};

var Zones =
{
	tape:
	{
		game: null,
		lastWinner: null,

		getGameUserByGameItem: function(gameItem)
		{
			var foundGameUser = null;

			this.game.users.forEach(function(gameUser)
			{
				if (foundGameUser || gameUser.steamId64 != gameItem.user)
				{
					return;
				}

				foundGameUser = gameUser;
			});

			return foundGameUser;
		},

		getGameUserBySteamId64: function(steamId64)
		{
			var foundGameUser = null;

			this.game.users.forEach(function(gameUser)
			{
				if (foundGameUser || gameUser.steamId64 != steamId64)
				{
					return;
				}

				foundGameUser = gameUser;
			});

			return foundGameUser;
		},

		update: function()
		{
			var self = this;
			$('#tapePage .content .game .tape').hide('fast');

			if (self.game.state == TapeGames.states.justCreated)
			{
				var minutes = Math.floor(self.gameTime / 60);
				var seconds = self.gameTime - minutes * 60;
				$('#tapePage .content .game .information .timer').text(minutes + ':' + (seconds < 10 ? '0' : '') + seconds);
				$('#tapePage .content .game .information .timerText').text('До конца игры');
			}
			else if (self.game.state == TapeGames.states.started)
			{
				$('#tapePage .content .game .information .timerText').text('До конца игры');
				self.countDown.start(self.gameTime - (window.now - self.game.updatedAt));
			}
			else if (self.game.state == TapeGames.states.taped)
			{
				$('#tapePage .content .game .information .timerText').text('До новой игры');
				self.countDown.start(self.tapeTime - (window.now - self.game.updatedAt));
				$('#tapePage .content .game .tape .slider').html('');

				self.game.tape.forEach(function(steamId64)
			    {
			    	var gameUser = self.getGameUserBySteamId64(steamId64);
			       $('#tapePage .content .game .tape .slider').append('<img src="' + gameUser.avatarLarge + '" alt="" />');
			    });

		        var position = -(self.game.tapeWinnerRandom - 5) * parseInt($('#tapePage .content .game .tape .slider img').css('width'));
		        var timeLeft = window.now - self.game.updatedAt;
		        var currentPosition = position * (timeLeft > 15 ? 1.0 : timeLeft / 15);
				$('#tapePage .content .game .tape .slider').css('left', currentPosition + 'px');

		        $('#tapePage .content .game .tape').show('fast', function()
		        {
		            $('#tapePage .content .game .tape .slider').css('left', position + 'px');
		        });

		        $('#tapePage .content .game .users').hide('fast');
			}
			
			var itemsPercent = (self.game.items.length < 100) ? (self.game.items.length / 100) : 100.0;
			$('#tapePage .content .game .title .number').text('Игра №' + self.game.id);
			$('#tapePage .content .game .title .itemsCount').text(self.game.items.length + ' / ' + 100);

			$('#tapePage .content .game .title .state .progress').css(
			{
				width: itemsPercent * 100 + '%',
			});

			$('#tapePage .content .game .information .sum').text((Math.floor(self.game.sum * 100) / 100) + ' руб.');

			if (user && self.getGameUserBySteamId64(user.steamId64))
			{
				var gameUser = self.getGameUserBySteamId64(user.steamId64);
				$('#tapePage .content .game .information .chance').text((Math.round(gameUser.percent * 100 * 100) / 100) + '%');
				$('#tapePage .content .game .information .itemsCount').text(gameUser.itemsCount + ' / 10');
			}
			else
			{
				$('#tapePage .content .game .information .chance').text('0%');
				$('#tapePage .content .game .information .itemsCount').text('0 / 10');
			}

			$gameUsers = $('#tapePage .content .game .users');
			$gameUsers.html('');

			if (self.game.users.length > 0 && self.game.state == TapeGames.states.started)
			{
				self.game.users.forEach(function(gameUser)
				{
					$gameUsers.append('<div class="user">' +
						'<img src="' + gameUser.avatarLarge + '" alt="">' +
							'<div class="chance">' + Math.round(gameUser.percent * 100 * 100) / 100 + '%</div>' +
						'</div>');
				});

				$gameUsers.show('fast');
			}
			else
			{
				$gameUsers.hide('fast');
			}

			$gameItems = $('#tapePage .content .game .items');
			$gameItems.html('');

			self.game.items.forEach(function(gameItem)
			{
				var gameUser = self.getGameUserByGameItem(gameItem);
				var html = '<div class="item" style="background: #' + gameItem.color + ';">' +
					'<div class="user">' +
						'<img src="' + gameUser.avatarLarge + '" alt="">' +
					'</div>' +
					'<div class="text">' + gameUser.name + ' вложил ' + gameItem.name + ' (' + gameItem.price + ' руб.)</div>' +
					'<div class="image">' +
						'<img src="http://steamcommunity-a.akamaihd.net/economy/image/' + gameItem.image + '/88fx88f" alt="">' +
					'</div>';

				if (gameItem.category && gameItem.category != 'Normal')
				{
					html += '<div class="category" style="background: #' + gameItem.categoryColor + ';" title="' + gameItem.category +'"></div>';
				}

				html += '<div class="quality" style="background: #' + gameItem.color + ';" title="' + gameItem.quality +'"></div>' +
				'</div>';
				
				$gameItems.prepend(html);
			});

			if (self.lastWinner)
			{
				$('#tapePage .side .lastWinner > .name').text(self.lastWinner.user.name);
				$('#tapePage .side .lastWinner .avatar img').attr('src', self.lastWinner.user.avatarLarge);
				$('#tapePage .side .lastWinner .chance').text((Math.round(self.lastWinner.user.percent * 100 * 100) / 100) + '%');
				$('#tapePage .side .lastWinner .winSum').text((Math.floor(self.lastWinner.winSum * 100) / 100) + ' руб.');
				$('#tapePage .side .lastWinner').show();
			}
			else
			{
				$('#tapePage .side .lastWinner').hide();
			}
		},

		countDown:
		{
			timeout: null,
			time: 0,
			count: 0,

			start: function(count)
			{
				var self = this;

				if (self.timeout)
				{
					self.stop();
				}

				self.count = count;
				self.time = Math.floor(Date.now() / 1000);
				self.update();
				return self;
			},

			stop: function()
			{
				var self = this;

				if (self.timeout)
				{
					return clearTimeout(self.timeout);
				}

				self.timeout = null;
				self.time = 0;
				self.count = 0;
				return self;
			},

			update: function()
			{
				var self = this;
				var left = this.count - (Math.floor(Date.now() / 1000) - self.time);

				if (left <= 0)
				{
					$('#tapePage .content .game .information .timer').text('0:00');
					return self.stop();
				}

				var minutes = Math.floor(left / 60);
				var seconds = left - minutes * 60;
				$('#tapePage .content .game .information .timer').text(minutes + ':' + (seconds < 10 ? '0' : '') + seconds);

				self.timeout = setTimeout(function()
				{
					self.update();
				},
				1000);

				return self;
			},
		},
	},

	market:
	{
		currentPage: 1,
		countPerPage: 64,
		pagesCount: 1,

		update: function()
		{
			var self = this;

			ajax(
			{
				url: '/market',
				method: 'GET',
				
				data:
				{
					search: $('#marketPage .side .search input').val(),
					quality: $('#marketPage .side .quality.filter').attr('data-value'),
					exterior: $('#marketPage .side .exterior.filter').attr('data-value'),
					category: $('#marketPage .side .category.filter').attr('data-value'),
					type: $('#marketPage .side .type.filter').attr('data-value'),
					sort: $('#marketPage .content .sorter').attr('data-value'),
					start: (self.currentPage - 1) * self.countPerPage,
					count: self.countPerPage,
					from: $('#marketPage .side .slider').attr('data-from'),
					to: $('#marketPage .side .slider').attr('data-to'),
				},
			},
			function(error, data)
			{
				if (error)
				{
					return;
				}

				$('#marketPage .buy.container .instances').html('').hide();
				$('#marketPage .buy.container .notFoundInstances').hide();

				data.instances.forEach(function(instance, index)
				{
					var $instance = $('#marketPage .content .instance.template').clone().removeClass('template');
					$instance.attr('title', instance.name);
					$instance.find('img').attr('src', 'http://steamcommunity-a.akamaihd.net/economy/image/' + instance.image + '/80fx60f');
					$instance.find('.quality').css('background', '#' + instance.qualityColor).attr('title', instance.quality);

					if (instance.category && instance.category != 'Normal')
					{
						$instance.find('.category').css('background', '#' + instance.categoryColor).attr('title', instance.category);
					}
					else
					{
						$instance.find('.category').hide();
					}

					if (instance.category && instance.category != 'Normal')
					{
						$instance.css('border-color', '#' + instance.categoryColor);
					}

					$instance.find('.price span').text(Math.floor(instance.price * 100) / 100);
					$instance.appendTo('#marketPage .content .instances');

					$instance.click(function()
					{
						ajax(
						{
							url: '/market/instance',
							method: 'POST',

							data:
							{
								_id: instance._id,
							},
						},
						function(error, data)
						{
							if (error)
							{
								noty(
								{
									text: '<div>' + error + '</div>',
									type: 'error',
								});

								return;
							}

							if (data.items.length == 0)
							{
								$item.remove();

								noty(
								{
									text: '<div>К сожалению, предметов такого типа больше нет в продаже</div>',
									type: 'warning',
								});

								return;
							}

							$('.marketInstance.modal .content .items').html('');

							data.items.forEach(function(item)
							{
								var $item = $('.marketInstance.modal .content .item.template').clone().removeClass('template');
								$item.attr('title', item.name);
								$item.find('img').attr('src', 'http://steamcommunity-a.akamaihd.net/economy/image/' + item.image + '/80fx60f');
								$item.find('.quality').css('background', '#' + item.qualityColor).attr('title', item.quality);

								if (item.category && instance.category != 'Normal')
								{
									$item.css('border-color', '#' + item.categoryColor);
								}

								item.stickers.forEach(function(sticker)
								{
									$item.find('.stickers').append('<img src="' + sticker.image + '" alt="" title="' + sticker.name + '">');
								});

								if (item.exterior)
								{
									$item.find('.exterior').text(item.exterior).show();
								}
								else
								{
									$item.find('.exterior').hide();
								}

								$item.find('.price span').text(Math.floor(item.price * 100) / 100);
								$item.appendTo('.marketInstance.modal .content .items');
								$item.find('.buy').attr('title', 'Купить ' + item.name + ' за ' + (Math.floor(item.price * 100) / 100) + ' руб.');

								$item.find('.buy').click(function()
								{
									if (!user)
									{
										noty(
										{
											text: '<div>Чтобы купить предмет, необходимо войти в систему</div>',
											type: 'warning',
										});

										return;
									}

									ajax(
									{
										url: '/market/buy',
										method: 'POST',
										
										data:
										{
											_id: item._id,
											price: item.price,
										},
									},
									function(error, data)
									{
										if (error)
										{
											if (data.price)
											{
												item.price = data.price;
												$item.find('.button span').text(Math.floor(item.price * 100) / 100);
											}

											noty(
											{
												text: '<div>' + error + '</div>',
												type: 'error',
											});

											return;
										}

										$item.remove();

										if (data.ended)
										{
											$('body').removeClass('nonScrollable');
											$('.marketInstance.modal').fadeOut('fast');
										}
									});
								});
							});
							
							$('.marketInstance.modal .content .title span').text(data.items.length);
							$('body').addClass('nonScrollable');
							$('.marketInstance.modal').show();
						});
					});
				});

				if (data.instances.length == 0)
				{
					$('#marketPage .buy.container .notFoundInstances').show();
				}
				else
				{
					$('#marketPage .buy.container .content .instances').show();
				}

				self.countPerPage = data.count;
				self.currentPage = Math.floor(data.start / self.countPerPage) + 1;
				self.pagesCount = Math.ceil(data.totalCount / self.countPerPage);
				$('#marketPage .content .paginator .information .currentPage input').val(self.currentPage);
				$('#marketPage .content .paginator .information .totalPages span').text(self.pagesCount);

				if (self.pagesCount > 1)
				{
					$('#marketPage .content .paginator').fadeIn('fast');
				}
				else
				{
					$('#marketPage .content .paginator').fadeOut('fast');
				}
			});
		},
	},
};

var recalculateSizes = function()
{
	var $body = $('body'), $wrapper = $('.wrapper');
	var bodyWidthWithOverflow = $body.width();
	$body.css('overflow', 'hidden');
    var bodyWidth = $body.width();
    var wrapperWidth = $wrapper.width();
    $wrapper.css('margin-left', (bodyWidth - wrapperWidth) / 2);
    $body.css('overflow', '');
    $('.profileMenu').css('left', (bodyWidth - wrapperWidth) / 2 + $('.wrapper').innerWidth() - $('.profileMenu').width());

    $('#middle .wrapper').css('min-height', '');
    var headerHeight = $('#header').height();
    var inventoryHeight = (user) ? ($('#inventory').height() + 40) : 0;
    $('#middle').css('padding-top', headerHeight + 'px');
    $('#middle').css('padding-bottom', inventoryHeight + 'px');
    $('#middle .sidebar .control').css('bottom', inventoryHeight + 'px');

	var middleWrapperPageHeight = $(window).height();
	middleWrapperPageHeight -= ($('#middle').innerHeight() - $('#middle').height());
	middleWrapperPageHeight -= ($('#middle .wrapper').innerHeight() - $('#middle .wrapper').height());
	// $('#middle .wrapper').css('min-height', middleWrapperHeight + 'px');
	middleWrapperPageHeight -= ($('#middle .wrapper .page').innerHeight() - $('#middle .wrapper .page').height());
	$('#middle .wrapper .page').css('min-height', middleWrapperPageHeight + 'px');

    // $('#middle .page').css('min-heigth', );
    $('#inventory').css('width', bodyWidth);
    inventory.bodyOverflowOffset = (bodyWidth - bodyWidthWithOverflow);
    inventory.update();
};

$(function()
{
	socket = io(environment == 'production' ? 'socket.csgoover.ru:8083' : ':8080');

	socket.on('connect', function()
	{
		if (window.disconnected)
		{
			socket.disconnect();
			window.location.reload();
			return;
		}

		socket.emit('authorize', user ?
		{
			steamId64: user.steamId64,
			secretKey: user.secretKey,
		}
		: null);
	});

	socket.on('users.updateInventory', function(data)
	{
		console.log('users.updateInventory', data);
		inventory.items = data.items;
		inventory.allItemsMarked = false;
		inventory.update();
	});

	socket.on('users.updateBalance', function(data)
	{
		console.log('users.updateBalance', data);
		user.balance = data.balance;

		if (data.message && data.message == 'market.soldItem')
		{
			if (router.currentRoute == '#market/onSale')
			{
				router.update();
			}

			noty(
			{
				text: '<div>Ваш предмет был успешно продан!<br />Вы получили: <b>' + data.change + ' руб.</b></div>',
				type: 'success',
			});
		}

		if (data.message && data.message == 'market.buyItem')
		{
			noty(
			{
				text: '<div>Предмет был успешно куплен!<br>Вы потратили: <b>' + (-data.change) + ' руб.</b></div>',
				type: 'success',
			});
		}

		if (data.message && data.message == 'inboundPayment')
		{
			noty(
			{
				text: '<div>Ваш баланс был пополнен на сумму: <b>' + data.change + ' руб.</b></div>',
				type: 'success',
			});
		}

		$('#header .profile .balance span').text(data.balance);
	});

	socket.on('users.updateOutboundTransfer', function(data)
	{
		if (data.state == OutboundTransfers.states.hasId)
		{
			noty(
			{
				text: '<div>Ваши предметы готовы к принятию!</div>',
				type: 'success',
			});
		}
		else if (data.state == OutboundTransfers.states.notNeedAnymore)
		{
			if (data.steamState == 3)
			{
				noty(
				{
					text: '<div>Вы успешно приняли Ваши предметы!</div>',
					type: 'success',
				});
			}
			else if (data.steamState == 7)
			{
				noty(
				{
					text: '<div>Вы отказали в предложении обмена. Предметы возвращены на свои места.</div>',
					type: 'warning',
				});
			}
			else if (data.steamState == 6)
			{
				noty(
				{
					text: '<div>Предложение обмена было отменено. Предметы возвращены на свои места.</div>',
					type: 'warning',
				});
			}
			else
			{
				noty(
				{
					text: '<div><b>Предложение обмена завершилось с ошибкой.</b><br>Код ошибки: ' + data.steamState + '</div>',
					type: 'error',
				});
			}
		}

		console.log('users.updateOutboundTransfer', data);
		inventory.outboundTransfer = (data.state == OutboundTransfers.states.notNeedAnymore) ? null : data;
		console.log('inventory.markedItems = [];');
		inventory.markedItems = [];
		inventory.allItemsMarked = false;
		inventory.update();
	});

	socket.on('users.newInboundTransfer', function()
	{
		return noty(
		{
			text: '<div>Ваше предложение обмена обрабатывается. Ожидайте...</div>',
			type: 'information',
		});
	});

	socket.on('users.inboundTransferHasNewState', function(data)
	{
		if (data.state == 3) // принять удалось
		{
			return noty(
			{
				text: '<div>Ваше предложение обмена было успешно принято!</div>',
				type: 'success',
			});
		}

		if (data.state == 6) // отменено
		{
			return noty(
			{
				text: '<div>Ваше предложение обмена было отменено.</div>',
				type: 'error',
			});
		}

		if (data.state == 7) // отказано
		{
			var reason = '';

			if (data.reason == 'userIsNotFound')
			{
				reason = 'не найден пользователь в нашей системе';
			}
			else if (data.reason == 'notFoundInstanceForItem')
			{
				reason = 'не удалось найти информацию о об одном из предметов';
			}
			else if (data.reason == 'userDoNotHaveAccessToken')
			{
				reason = 'Вы не укзали Вашу ссылку для обмена';
			}
			else if (data.reason == 'doNotHaveEnoughFreeSlotsInUserInventoryToStoreItems')
			{
				reason = 'в Вашем инвентаре на нашем сайте недостаточно места для принятия такого количества предметов';
			}
			else
			{
				reason = 'не известна';
			}

			return noty(
			{
				text: '<div><b>В предложении обмена было отказано</b><br><b>Причина:</b> ' + reason + '.</div>',
				type: 'error',
				timeout: 16000,
			});
		}

		if (data.state == 8)
		{
			return noty(
			{
				text: '<div><b>Не удалось принять ваше предложение обмена.</b><br>Предметы больше недоступны для принятия.',
				type: 'error',
				timeout: 16000,
			});
		}

		return noty(
		{
			text: '<div><b>Не удалось принять ваше предложение обмена.</b><br>Код ошибки: ' + data.state + '.',
			type: 'error',
			timeout: 16000,
		});
	});

	socket.on('tape.update', function(data)
	{
		console.log('tape.update');
		Zones.tape.game = data.game;
		Zones.tape.gameTime = data.gameTime;
		Zones.tape.tapeTime = data.tapeTime;
		Zones.tape.lastWinner = data.lastWinner;
		Zones.tape.event = data.event;
		window.now = data.now;
		Zones.tape.update();
	});

	socket.on('authorize', function(data)
	{
		console.log('authorize', data);

		if (data.user)
		{
			inventory.items = data.items;
			inventory.outboundTransfer = data.outboundTransfer;
			inventory.update();
			$('#inventory').show().css('bottom', '0px');
			window.user = data.user;
			$('#loginLink').hide();
			$('#profile .name').text(window.user.name);
			$('#profile .balance span').text(Math.floor(window.user.balance * 100) / 100);
			$('#profile .avatar img').attr('src', window.user.avatarMedium);
			$('#inventory .order a[data-order=' + window.user.inventoryOrder + ']').addClass('selected');

			if (data.user.accessToken)
			{
				$('#tradeURL').hide();
				$('#changeTradeURL input').val('https://steamcommunity.com/tradeoffer/new/?partner=' + data.user.steamId32 + '&token=' + data.user.accessToken);
			}

			if (data.user.VKontakte)
			{
				$('#attachVKPageLink').hide();
			}
			else
			{
				$('#dettachVKPageLink').hide();
			}
		}
		else
		{
			window.user = null;
			$('#profile').hide();
			$('#tradeURL').hide();
		}

		if (!data.user || !data.user.admin)
		{
			$('#tapePage .side .menu a.commission').hide();
		}

		Zones.tape.game = data.tape.game;
		Zones.tape.gameTime = data.tape.gameTime;
		Zones.tape.tapeTime = data.tape.tapeTime;
		Zones.tape.lastWinner = data.tape.lastWinner;
		Zones.tape.event = data.tape.event;
		window.now = data.now;
		Zones.tape.update();

		$('#changeTradeURL').hide();
		$('#header').show().css('top', '0');
		$('#middle').show();
		$('#loading').fadeOut();
		router.update(window.location.hash);

		if (notificate)
		{
			if (notificate.name == 'VKPageWasAttached')
			{
				noty(
				{
					text: '<div>Ваша страница ВКонтакте была успешно прикреплена к Вашему аккаунту!</div>',
					type: 'success',
				});
			}

			if (notificate.name == 'inboundPaymentIsPaid')
			{
				noty(
				{
					text: '<div>Ваш баланс был пополнен на сумму: <b>' + notificate.amount + ' руб.</b></div>',
					type: 'success',
				});
			}

			if (notificate.name == 'inboundPaymentIsFail')
			{
				noty(
				{
					text: '<div>Не удалось совершить пополнение на сумму: <b>' + notificate.amount + ' руб.</b></div>',
					type: 'error',
				});
			}
		}

		if (data.suitableBotA)
		{
			$('#inventory .control .makeInboundTransfer.button').attr('href', 'https://steamcommunity.com/tradeoffer/new/?partner=' + data.suitableBotA.steamId32
				+ '&token=' + data.suitableBotA.accessToken);
		}
		else
		{
			$('#inventory .control .makeInboundTransfer.button').attr('href', '');
		}

		recalculateSizes();
	});
	
	socket.on('suitableBotA', function(suitableBotA)
	{
		console.log('suitableBotA', suitableBotA);

		if (suitableBotA)
		{
			$('#inventory .control .makeInboundTransfer.button').attr('href', 'https://steamcommunity.com/tradeoffer/new/?partner=' + suitableBotA.steamId32
			+ '&token=' + suitableBotA.accessToken);
		}
		else
		{
			$('#inventory .control .makeInboundTransfer.button').attr('href', '');
		}
	});
	
	socket.on('disconnect', function()
	{
		window.disconnected = true;
		$('#loading').show();
		$('#loading span').html('Потеряно соединение с сервером...<br>Мы сообщим Вам как только соединение восстановится');
	});

	$('.profile').hover(function()
	{
		$('.profile').addClass('hover opened');
		$('.profileMenu').addClass('opened');
	},
	function()
	{
		$('.profile').removeClass('hover');
		!$('.profile').hasClass('hover') && !$('.profile').hasClass('hover') && $('.profile, .profileMenu').removeClass('opened');
	});

	$('.profileMenu').hover(function()
	{
		$('.profile').addClass('opened');
		$('.profileMenu').addClass('hover opened');
	},
	function()
	{
		$('.profileMenu').removeClass('hover');
		!$('.profile').hasClass('hover') && !$('.profile').hasClass('hover') && $('.profile, .profileMenu').removeClass('opened');
	});

	$('.inventory .makeOutboundTransfer').click(function()
	{
		$(this).hide();
		$('#inventory .selectAll').show();
		$('#inventory .cancel').show();
		$('#inventory .confirmOutboundTransfer').show();
		$('#inventory .status span').text('Выделено ' + inventory.markedItems.length + ' из ' + inventory.items.length);
		inventory.allItemsMarked = false;
		$('#inventory .items .item[data-state=' + Items.states.real + '][data-zone=""]').addClass('selectable');
	});

	$('#inventory .confirmOutboundTransfer').click(function()
	{
		if (inventory.markedItems.length == 0)
		{
			noty(
			{
				text: '<div>Выделите хотя бы один предмет!</div>',
				type: 'warning',
				timeout: 5000,
			});

			return;
		}

		$('#inventory .selectAll').hide();
		$('#inventory .cancel').hide();
		$('#inventory .confirmOutboundTransfer').hide();
		$('#inventory .waitingOutboundTransfer').show();

		ajax(
		{
			url: '/makeOutboundTransfer',
			method: 'POST',
			
			data:
			{
				items: inventory.markedItems,
			},
		},
		function(error, data)
		{
			if (error)
			{
				$('#inventory .selectAll').show();
				$('#inventory .cancel').show();
				$('#inventory .confirmOutboundTransfer').show();
				$('#inventory .waitingOutboundTransfer').hide();
				return;
			}

			noty(
			{
				text: '<div>Ожидайте создания предложения обмена. Это может занять до <b>пяти минут</b>.</div>',
				type: 'information',
			});
		});
	});

	$('#inventory .selectAll').click(function()
	{
		var markedItemsCount = 0;

		$('#inventory .items .item').each(function()
		{
			$item = $(this);
			var itemId = $item.attr('data-id');
			var itemState = $item.attr('data-state');
			var itemZone = $item.attr('data-zone');

			if (inventory.allItemsMarked)
			{
				if (inventory.markedItems.indexOf(itemId) > -1)
				{
					$item.removeClass('marked');
					inventory.markedItems.splice(inventory.markedItems.indexOf(itemId), 1);
				}
			}
			else
			{
				if (inventory.markedItems.indexOf(itemId) < 0 && itemState == Items.states.real && !itemZone)
				{
					$item.addClass('marked');
					inventory.markedItems.push(itemId);
					++markedItemsCount;
				}
			}
		});

		$('#inventory .status span').text('Выделено ' + inventory.markedItems.length + ' из ' + inventory.items.length);
		$('#inventory .moveToZone .count').text('(' + inventory.markedItems.length + ' из ' + inventory.items.length + ')');
		inventory.allItemsMarked = !inventory.allItemsMarked;
	});

	$('#inventory .cancel').click(function()
	{
		$(this).hide();
		$('#inventory .items .item').removeClass('marked');
		$('#inventory .status span').text('Инвентарь (' + inventory.items.length + ' из ' + inventory.maximumItemsCount + ') (' + inventory.sum + ' руб.)');
		$('#inventory .status').show();
		$('#inventory .moveToZone').hide();
		$('#inventory .cancel').hide();
		$('#inventory .confirmOutboundTransfer').hide();
		$('#inventory .selectAll').hide();
		$('#inventory .outboundTransfer').show();
		inventory.markedItems = [];

		if (!inventory.outboundTransfer)
		{
			$('#inventory .makeOutboundTransfer').show();
		}
	});

	$('#inventory .moveToZone').click(function()
	{
		if (inventory.markedItems.length == 0 || !inventory.zone)
		{
			return;
		}

		// $('#inventory .moveToZone').addClass('disabled');
		
		ajax(
		{
			url: '/moveItemsToZone',
			method: 'POST',
			
			data:
			{
				items: inventory.markedItems,
				zone: inventory.zone,
			},
		},
		function(error, data)
		{
			if (error)
			{
				// $('#inventory .moveToZone').removeClass('disabled');

				noty(
				{
					text: '<div><b>Не удалось переместить Ваши предметы.</b><br>Причина: ' + error + '</div>',
					type: 'error',
				});

				return;
			}

			noty(
			{
				text: '<div>Ваши предметы были успешно перемещены!</div>',
				type: 'success',
			});

			if (inventory.zone == 'market')
			{
				if (router.currentRoute == '#market/sell')
				{
					router.update();
				}
				else
				{
					window.location.hash = '#market/sell';
				}
			}
		});
	});

	$('#inventory .items').mousewheel(function(event)
	{
		inventory.scroll(event.deltaY);
		return false;
	});

	$('#tradeURL .save').click(function()
	{
		ajax(
		{
			url: '/saveTradeUrl',
			method: 'POST',
			
			data: 
			{
				tradeUrl: $('#tradeURL input').val(),
			},
		},
		function(error, data)
		{
			if (error)
			{
				$('#tradeURL .text').effect('shake');

				noty(
				{
					text: '<div><strong>Ошибка!</strong><br>' + (data.reason || error) + '</div>',
					type: 'error',
				});

				return;
			}

			$('#tradeURL').slideUp('fast');
			$('#changeTradeURL input').val($('#tradeURL input').val());

			noty(
			{
				text: '<div>Ссылка для обмена была успешно сохранена!</div>',
				type: 'success',
			});
		});
	});

	$('#changeTradeURL .save').click(function()
	{
		ajax(
		{
			url: '/saveTradeUrl',
			method: 'POST',
			
			data: 
			{
				tradeUrl: $('#changeTradeURL input').val(),
			},
		},
		function(error, data)
		{
			if (error)
			{
				$('#changeTradeURL .text').effect('shake');

				noty(
				{
					text: '<div><strong>Ошибка!</strong><br>' + (data.reason || error) + '</div>',
					type: 'error',
				});

				return;
			}

			$('#changeTradeURL').slideUp('fast');

			noty(
			{
				text: '<div>Ссылка для обмена была успешно сохранена!</div>',
				type: 'success',
			});
		});
	});

	$('#profile').hover(function()
	{
		$(this).addClass('hover');
	},
	function()
	{
		$(this).removeClass('hover');
	});

	$('#inventory .orderButton').hover(function()
	{
		$('#inventory .order').show();
	},
	function()
	{
		$('#inventory .order').hide();
	});

	$('#inventory .order a').click(function()
	{
		var order = $(this).attr('data-order');

		ajax(
		{
			url: '/setInventoryOrder',
			method: 'POST',
			
			data: 
			{
				order: order,
			},
		},
		function(error, data)
		{
			if (error)
			{
				noty(
				{
					text: '<div><strong>Ошибка!</strong><br>' + error + '</div>',
					type: 'error',
				});

				return;
			}

			user.inventoryOrder = order;

			noty(
			{
				text: '<div>Изменения в сортировке успешно применены!</div>',
				type: 'success',
			});

			$('#inventory .order a').removeClass('selected');
			$('#inventory .order a[data-order=' + order + ']').addClass('selected');
		});
	});

	$('#inventory .informationButton').hover(function()
	{
		$('#inventory .information').show();
	},
	function()
	{
		$('#inventory .information').hide();
	});

	$('#changeTradeUrlLink').click(function()
	{
		$('#changeTradeURL').slideDown();
	});

	$('#balanceIn').click(function()
	{
		window.location.href = '#balance/in';
	});

	$('#balanceOut').click(function()
	{
		window.location.href = '#balance/out';
	});

	$('#inventory .orderButton').hover(function()
	{
		$(this).addClass('active');
	},
	function()
	{
		$(this).removeClass('active');
	});

	$('#inventory .control .makeInboundTransfer.button').click(function()
	{
		if ($(this).attr('href'))
		{
			return;
		}

		noty(
		{
			text: '<div>Внесение предметов временно недоступено. Попробуйте позднее.</div>',
			type: 'error',
		});

		return false;
	});

	$('#loginLink').click(function()
	{
		window.location.href = '/login?back=' + window.location.hash.slice(1);
		return true;
	});

	$('#attachVKPageLink').click(function()
	{
		loader.add();
		window.location.href = '/vkontakte/login?back=' + window.location.hash.slice(1);
		return true;
	});

	$('#dettachVKPageLink').click(function()
	{
		ajax(
		{
			url: '/detachVKPage',
			method: 'POST',
		},
		function(error, data)
		{
			if (error)
			{
				console.log(error, data);
				return;
			}

			$('#dettachVKPageLink').hide();
			$('#attachVKPageLink').show();
			user.VKontakte = 0;

			noty(
			{
				text: '<div>Ваша страница ВКонтакте была успешно откреплена от Вашего аккаунта!</div>',
				type: 'success',
			});
		});
	});

	$('#logoutLink').click(function()
	{
		window.location.href = '/logout?back=' + window.location.hash.slice(1);
		return true;
	});

	$('#marketPage .side .filter').click(function()
	{
		var self = this;

		if ($(this).hasClass('active'))
		{
			$(this).removeClass('active');
			$(this).find('ul').hide();
			return;
		}

		setTimeout(function()
		{
			$(self).addClass('active');
			$(self).find('ul').show();
		},
		0);
	});

	$(document).click(function()
	{
		$('#marketPage .side .filter').removeClass('active');
		$('#marketPage .side .filter').find('ul').hide();
	});

	$('#marketPage .side .filter ul li').click(function()
	{
		var $ul = $(this).parent();
		$ul.find('li').removeClass('selected');
		$(this).addClass('selected');
		var $filter = $ul.parent();
		$filter.find('.title span').text($(this).text()).css('color', $(this).css('color'));
		$filter.attr('data-value', $(this).attr('data-value'));
		Zones.market.currentPage = 1;
		Zones.market.update();
		$('#marketPage .side .filter').removeClass('active');
		$('#marketPage .side .filter').find('ul').hide();
		return false;
	});

	$('#marketPage .content .control .sorter span').click(function()
	{
		var $sorter = $(this).parent();
		$sorter.find('span').removeClass('selected');
		$(this).addClass('selected');
		$sorter.attr('data-value', $(this).attr('data-value'));
		Zones.market.currentPage = 1;
		Zones.market.update();
	});

	$('#marketPage .content .control .refresh').click(function()
	{
		Zones.market.update();
	});

	$('#marketPage .side .search').submit(function()
	{
		Zones.market.update();
		return false;
	});

	$('#marketPage .buy.container .content .paginator .button').click(function()
	{
		if ($(this).hasClass('left'))
		{
			if (Zones.market.currentPage <= 1)
			{
				return;
			}

			--Zones.market.currentPage;
			Zones.market.update();
		}
		else
		{
			if (Zones.market.currentPage >= Zones.market.pagesCount)
			{
				return;
			}
			
			++Zones.market.currentPage;
			Zones.market.update();
		}
	});

	$('#marketPage .buy.container .content .paginator .information .currentPage').submit(function()
	{
		var page = parseInt($(this).find('input').val());

		if (isNaN(page))
		{
			return false;
		}

		if (page < 1 || page > Zones.market.pagesCount)
		{
			return false;
		}

		Zones.market.currentPage = page;
		Zones.market.update();
		return false;
	});

	$('#marketPage .side .price.slider input').ionRangeSlider(
	{
		type: 'double',
		grid: true,
		min: 0,
		max: 2000,
		from: 0,
		to: 2000,
		postfix: ' руб.',
		max_postfix: '+',

		onFinish: function(data)
		{
			$('#marketPage .side .price.slider').attr('data-from', data.from).attr('data-to', data.to);
			Zones.market.update();
		},
	});

	$('#tapePage .content .commission .get').click(function()
	{
		ajax(
		{
			url: '/tape/commission/get',
			method: 'POST',
		},
		function(error, data)
		{
			if (error)
			{
				noty(
				{
					text: '<div>' + error + '</div>',
					type: 'error',
				});

				return;
			}

			noty(
			{
				text: '<div>Комиссия была успешно получена</div>',
				type: 'success',
			});

			router.update();
		});
	});

	$('.modal').click(function()
	{
		$(this).stop().fadeOut('fast');
		$('body').removeClass('nonScrollable');
	});

	$('.modal .content').click(function()
	{
		return false;
	});

	$(window).on('hashchange', function()
	{
		router.update(window.location.hash);
	});

	// $(document).on('click', 'a[target!=_blank]', function(event)
	// {
	// 	var path = $(event.toElement).attr('href');

	// 	if (!path)
	// 	{
	// 		return;
	// 	}

	// 	console.log(path);
	// });

	$.noty.defaults =
	{
	    layout: 'bottomRight',
	    theme: "customNotyTheme",
	    type: "alert",
	    text: "",
	    dismissQueue: true,
	    template: '<div class="noty_message"><span class="noty_text"></span><div class="noty_close"></div></div>',

	    animation:
		{
			open: 'animated flipInX', //bounceInRight',
			close: 'animated flipOutX', //bounceOutRight',
		},

	    timeout: 8000,
	    force: false,
	    modal: false,
	    maxVisible: 10,
	    killer: false,
	    closeWith: ['click'],

	    callback:
	    {
	        onShow: function() {},
	        afterShow: function() {},
	        onClose: function() {},
	        afterClose: function() {},
	        onCloseClick: function() {}
	    },

	    buttons: false,
	};

	$.noty.layouts.bottomRight.container.style = function()
	{
		$(this).css(
		{
			bottom       : (user ? $('#inventory').height() : 0) + 20,
			right        : 20,
			position     : 'fixed',
			width        : '310px',
			height       : 'auto',
			margin       : 0,
			padding      : 0,
			listStyleType: 'none',
			zIndex       : 10000000,
		});

		if (window.innerWidth < 600)
		{
			$(this).css(
			{
				right: 5,
			});
		}
	};

	$(window).resize(recalculateSizes);
});
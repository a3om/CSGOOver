module.exports = function(Storage, global)
{
	this.common =
	{
		states:
		{
			outOfStock: 0,	// нет в продаже
			onSale: 1,		// есть предметы на продаже
		},
	};
	
	this.properties =
	{
		state: 0,			// состояние
		name: '',			// название
		image: '',			// изображение
		type: '',			// тип
		categoryColor: '',	// цвет категории
		category: '',		// категория
		qualityColor: '',	// цвет качества
		quality: '',		// качество
		exterior: '',		// внешний вид
		price: 0.0,			// минимальная стоимость продажи
		count: 0,			// количество предметов на продаже сейчас
		salesCount: 0,		// число продаж за всё время
	};

	this.methods =
	{
		update: function(callback)
		{
			var self = this;
			
			return $(function(callback)
			{
				return Storage.MarketItems.find(
				{
					state: Storage.MarketItems.states.onSale,
					name: self.name,
				})
				.count(callback);
			})
			(function(count, callback) // получаем количество маркет-предметов на продаже в данный момент времени
			{
				return Storage.MarketItems.find(
				{
					state: Storage.MarketItems.states.sold,
					name: self.name,
				})
				.count(function(error, salesCount)
				{
					return callback(error, count, salesCount);
				});
			})
			(function(count, salesCount, callback) // получаем количество проданных маркет-предметов за всё время
			{
				return Storage.MarketItems.find(
				{
					state: Storage.MarketItems.states.onSale,
					name: self.name,
				})
				.sort('price', 'asc').toInstance(function(error, marketItem)
				{
					return callback(error, count, salesCount, marketItem);
				});
			})
			(function(count, salesCount, marketItem, callback)
			{
				return self.set(
				{
					state: marketItem ? Storage.MarketInstances.states.onSale : Storage.MarketInstances.states.outOfStock,
					price: marketItem ? marketItem.price : 0.0,
					count: count,
					salesCount: salesCount,
				})
				.save(callback);
			})
			(callback);
		},
	};
};
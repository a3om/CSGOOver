module.exports = function(Storage, global)
{
	this.common =
	{
		states:
		{
			justCreated: 0,		// только создан
			onSale: 1,			// выставлен на продажу
			sold: 2,			// продан
			returnedBack: 3,	// возвращен в инвентарь
		},
	};
	
	this.properties =
	{
		id: null,			// _id предмета
		state: 0,			// состояние
		seller: '',			// продавец
		buyer: '',			// покупатель
		name: '',			// название
		image: '',			// изображение
		type: '',			// тип
		categoryColor: '',	// цвет категории
		category: '',		// категория
		qualityColor: '',	// цвет качества
		quality: '',		// качество
		exterior: '',		// внешний вид
		stickers: [],		// стикеры
		stickersCount: 0,	// количество стикеров
		price: 0.0,			// стоимость продажи
		commission: 0.0,	// комиссия продажи
		timeSold: 0,		// время, когда предмет был продан
	};
};
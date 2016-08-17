module.exports = function(Storage)
{
	this.common =
	{
		states:
		{
			waiting: 0,	// ожидание оплаты
			paid: 1,	// оплачен
			fail: 2,	// оплата не удалась
		},
	},

	this.properties =
	{
		id: 0, // уникальный цифровой номер платежа
		user: null, // steamId64 пользователя, совершающего платеж
		amount: 0.0, // сумма платежа
		state: 0, // состояние платежа
		system: '', // название платежной системы
	};
};
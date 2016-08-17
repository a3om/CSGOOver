var async = require('async');

module.exports = function(Storage)
{
	this.common =
	{
		states:
		{
			justCreated: 0, // только создан | посылаем запрос Контроллеру на создание исходящего предложения обмена
			createdInController: 1, // Контроллер ответил, что трансфер был создан | ожидаем изменения его состояния
			hasId: 2, // исходящий трансфер имеет steamId
			hasNewState: 3, // исходящий трансфер имеет новое состояние
			notNeedAnymore: 4, // больше не нужен
		},
	},

	this.properties =
	{
		id: null,
		receiver: '',
		items: [],
		accessToken: '',
		state: 0,
		steamState: 0,
		steamId: '0',
		cancel: false,
	};
};
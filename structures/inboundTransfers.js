module.exports = function(Storage)
{
	this.common =
	{
		states:
		{
			justCreated: 0, // трансфер был только что создан | необходимо принять решение по его принятию
			needLinkItemsToInstances: 1, // необходимо получить информацию о предметах
			needCheckWithInUser: 2, // необходимо проверить на пригодность к принятию относительно инвентаря пользователя
			accept: 3, // решение по принятию входящего трансфера принято | необходимо сообщить об этом Контроллеру
			answerAboutAccept: 4, // ответ от Контроллера получен | ожидаем нового состояния трансфера
			hasNewState: 5, // Контроллер сообщает, что трансфер имеет новое состояние | решаем дальше, что делать с трансфером
			notNeedAnymore: 6, // трансфер обработан и больше не нужен
		},
	},

	this.properties =
	{
		id: null,
		sender: '',
		items: [],
		accept: false,
		reason: '',
		state: 0,
		steamState: 0,
	};
};
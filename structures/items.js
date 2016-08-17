module.exports = function(Storage, global)
{
	this.common =
	{
		states:
		{
			justCreated: 0,		// только создан
			reserved: 1,		// зарезервирован для принятия
			real: 2,			// находится в боте
			transmitting: 3,	// находится у нас, но на передаче
			notExistent: 4,		// передан, не существует
		},

		qualities:
		[
			'Base Grade',
			'Consumer Grade',
			'Industrial Grade',
			'High Grade',
			'Mil-Spec Grade',
			'Remarkable',
			'Restricted',
			'Exotic',
			'Classified',
			'Covert',
			'Contraband',
		],
	};
	
	this.properties =
	{
		id: null,
		index: 0,
		classId: '0',
		instanceId: '0',
		state: 0,
		user: '',
		name: '',
		image: '',
		zone: '',
		commission: false,
		data: {},
		type: '',
		weapon: '',
		collection: '',
		categoryColor: '',
		category: '',
		qualityColor: '',
		quality: '',
		qualityIndex: -1,
		exterior: '',
		stickers: [],
	};
};
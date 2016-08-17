module.exports = function(Storage, global)
{
	this.common =
	{
		states:
		{
			justCreated: 0,		// ������ ������
			reserved: 1,		// �������������� ��� ��������
			real: 2,			// ��������� � ����
			transmitting: 3,	// ��������� � ���, �� �� ��������
			notExistent: 4,		// �������, �� ����������
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
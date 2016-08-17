module.exports = function(Storage, global)
{
	this.common =
	{
		states:
		{
			justCreated: 0,		// ������ ������
			onSale: 1,			// ��������� �� �������
			sold: 2,			// ������
			returnedBack: 3,	// ��������� � ���������
		},
	};
	
	this.properties =
	{
		id: null,			// _id ��������
		state: 0,			// ���������
		seller: '',			// ��������
		buyer: '',			// ����������
		name: '',			// ��������
		image: '',			// �����������
		type: '',			// ���
		categoryColor: '',	// ���� ���������
		category: '',		// ���������
		qualityColor: '',	// ���� ��������
		quality: '',		// ��������
		exterior: '',		// ������� ���
		stickers: [],		// �������
		stickersCount: 0,	// ���������� ��������
		price: 0.0,			// ��������� �������
		commission: 0.0,	// �������� �������
		timeSold: 0,		// �����, ����� ������� ��� ������
	};
};
module.exports = function(Storage, global)
{
	this.common =
	{
		states:
		{
			outOfStock: 0,	// ��� � �������
			onSale: 1,		// ���� �������� �� �������
		},
	};
	
	this.properties =
	{
		state: 0,			// ���������
		name: '',			// ��������
		image: '',			// �����������
		type: '',			// ���
		categoryColor: '',	// ���� ���������
		category: '',		// ���������
		qualityColor: '',	// ���� ��������
		quality: '',		// ��������
		exterior: '',		// ������� ���
		price: 0.0,			// ����������� ��������� �������
		count: 0,			// ���������� ��������� �� ������� ������
		salesCount: 0,		// ����� ������ �� �� �����
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
			(function(count, callback) // �������� ���������� ������-��������� �� ������� � ������ ������ �������
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
			(function(count, salesCount, callback) // �������� ���������� ��������� ������-��������� �� �� �����
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
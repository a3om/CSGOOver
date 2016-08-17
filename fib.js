// var fib = function(n)
// {
// 	var numbers = [0, 1];

// 	for (var i = 2; i < n; ++i)
// 	{
// 		numbers.push(numbers[numbers.length - 2] + numbers[numbers.length - 1]);
// 	}

// 	var summ = 0;

// 	for (var i = 0; i < numbers.length; ++i)
// 	{
// 		summ += numbers[i];
// 	}

// 	return summ;
// };

// console.log(fib(12));

var string = "Много много много  разных слов";
var summ = string.split(' ').filter(function(word) {
    return word.length > 0;
})
.length;

console.log(summ);
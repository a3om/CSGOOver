var WebSocketClient = require('websocket').client;

var webSocketClient = new WebSocketClient();

webSocketClient.reconnect = function(time)
{
	setTimeout(function()
    {
    	webSocketClient.connect('ws://localhost:8080/', 'echo-protocol');
    },
    time);
};

webSocketClient.on('connectFailed', function(error)
{
    console.log('Connect Error: ' + error.toString());
    webSocketClient.reconnect(1000);
});
 
webSocketClient.on('connect', function(connection)
{
    console.log('WebSocket Client Connected');

    connection.on('error', function(error)
    {
        console.log("Connection Error: " + error.toString());
		webSocketClient.reconnect(1000);
    });

    connection.on('close', function()
    {
        console.log('echo-protocol Connection Closed');
        webSocketClient.reconnect(1000);
    });

    connection.on('message', function(message)
    {
    	console.log(message);
    	
        if (message.type === 'utf8')
        {
            console.log("Received: '" + message.utf8Data + "'");
        }
    });
    
    // function sendNumber()
    // {
    //     if (connection.connected)
    //     {
    //         var number = Math.round(Math.random() * 0xFFFFFF);
    //         connection.sendUTF(number.toString());
    //         setTimeout(sendNumber, 1000);
    //     }
    // }

    // sendNumber();
});
 
webSocketClient.connect('ws://localhost:8080/', 'echo-protocol');
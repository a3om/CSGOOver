var WebSocketServer = require('websocket').server;
var http = require('http');
 
var httpServer = http.createServer(function(request, response)
{
    console.log((new Date()) + ' Received request for ' + request.url);
    response.writeHead(404);
    response.end();
});

httpServer.listen(8080, function()
{
    console.log((new Date()) + ' Server is listening on port 80');
});
 
var webSocketServer = new WebSocketServer(
{
    httpServer: httpServer,
    autoAcceptConnections: false
});

webSocketServer.on('request', function(request)
{
    // if (!originIsAllowed(request.origin))
    // {
    //   // Make sure we only accept requests from an allowed origin 
    //   request.reject();
    //   console.log((new Date()) + ' Connection from origin ' + request.origin + ' rejected.');
    //   return;
    // }
    
	var connection = request.accept('echo-protocol', request.origin);
    console.log((new Date()) + ' Connection accepted.');

    connection.on('message', function(message)
    {
        if (message.type === 'utf8')
        {
            console.log('Received Message: ' + message.utf8Data);
            connection.sendUTF(message.utf8Data);
        }
        else if (message.type === 'binary') {
            console.log('Received Binary Message of ' + message.binaryData.length + ' bytes');
            connection.sendBytes(message.binaryData);
        }
    });

    connection.on('close', function(reasonCode, description)
    {
        console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.');
    });
});
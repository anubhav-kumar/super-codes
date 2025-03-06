const net = require('net');

const HOST = '127.0.0.1';
const PORT = 12345;

const client = new net.Socket();

client.connect(PORT, HOST, () => {
    console.log('Connected to server');
    client.write('Hello, server!');
});

client.on('data', (data) => {
    console.log(`Response from server: ${data.toString()}`);
    client.end(); // Close the connection after response
});

client.on('close', () => {
    console.log('Connection closed');
});


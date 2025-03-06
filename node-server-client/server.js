const net = require('net');

const HOST = '127.0.0.1';
const PORT = 8000;

// Create a TCP server
const server = net.createServer((socket) => {
    console.log(`Client connected: ${socket.remoteAddress}:${socket.remotePort}`);

    // Handle incoming data
    socket.on('data', (data) => {
        console.log(`Received: ${data.toString()}`);

        // Echo the data back to the client
        socket.write(data);
    });

    // Handle client disconnection
    socket.on('end', () => {
        console.log('Client disconnected');
    });

    // Handle errors
    socket.on('error', (err) => {
        console.error(`Socket error: ${err.message}`);
    });
});

// Start the server
server.listen(PORT, HOST, () => {
    console.log(`Server listening on ${HOST}:${PORT}`);
});


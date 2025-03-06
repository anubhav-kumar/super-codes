const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

const peers = new Map(); // Stores connected peers

wss.on('connection', (ws) => {
    console.log('New peer connected');

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        
        if (data.type === 'register') {
            peers.set(data.id, ws);
            console.log(`Peer registered: ${data.id}`);
        } else if (data.type === 'signal' && peers.has(data.to)) {
            console.log(`Forwarding signal from ${data.from} to ${data.to}`);
            peers.get(data.to).send(JSON.stringify(data));
        }
    });

    ws.on('close', () => {
        for (const [id, socket] of peers.entries()) {
            if (socket === ws) {
                peers.delete(id);
                console.log(`Peer disconnected: ${id}`);
                break;
            }
        }
    });
});

console.log('Signaling server running on ws://localhost:8080');

const net = require('net');
const https = require('https');

const HOST = '127.0.0.1';
const PORT = 12345;
const TARGET_HOST = 'www.wegopro.com';
const TARGET_PORT = 443;

const server = net.createServer((socket) => {
    console.log(`Client connected: ${socket.remoteAddress}:${socket.remotePort}`);

    let requestData = '';

    socket.on('data', (chunk) => {
        requestData += chunk.toString();
        if (requestData.includes('\r\n\r\n')) {
            const [requestHeaders] = requestData.split('\r\n\r\n');
            const [requestLine, ...headerLines] = requestHeaders.split('\r\n');
            const [method, path] = requestLine.split(' ');

            const options = {
                hostname: TARGET_HOST,
                port: TARGET_PORT,
                path: path || '/',
                method: method,
                headers: {
                    'Upgrade-Insecure-Requests': '1',
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
                }
            };

            console.log(`Options: ${JSON.stringify(options)}`);

            const proxyReq = https.request(options, (proxyRes) => {
                socket.write(`HTTPS/1.1 ${proxyRes.statusCode} ${proxyRes.statusMessage}\r\n`);

                for (const [key, value] of Object.entries(proxyRes.headers)) {
                    socket.write(`${key}: ${value}\r\n`);
                }

                socket.write('\r\n');

                proxyRes.pipe(socket); // Stream response directly to the client
            });

            proxyReq.on('error', (err) => {
                console.error(`Error relaying request: ${err.message}`);
                socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
                socket.end();
            });

            const requestBody = requestData.split('\r\n\r\n')[1];
            if (requestBody) proxyReq.write(requestBody);

            proxyReq.end();
        }
    });

    socket.on('end', () => {
        console.log('Client disconnected');
    });

    socket.on('error', (err) => {
        console.error(`Socket error: ${err.message}`);
    });
});

server.listen(PORT, HOST, () => {
    console.log(`Server listening on http://${HOST}:${PORT}`);
});

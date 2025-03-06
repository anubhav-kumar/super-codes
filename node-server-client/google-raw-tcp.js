const net = require('net');
const url = require('url');

function makeRequest(host, path = '/', port = 443) {
  const request = `GET ${path} HTTPS/1.1\r\nHost: ${host}\r\nConnection: close\r\nUser-Agent: SimpleTCPClient/1.0\r\nAccept: */*\r\n\r\n`;

  const client = net.createConnection({ host, port }, () => {
    console.log(`Connected to ${host}`);
    client.write(request);
  });

  let response = '';

  client.on('data', (data) => {
    response += data.toString();
  });

  client.on('end', () => {
    const [headers, body] = response.split('\r\n\r\n');
    const statusLine = headers.split('\r\n')[0];
    const statusCode = parseInt(statusLine.split(' ')[1], 10);

    if (statusCode === 301 || statusCode === 302) {
      const locationHeader = headers.match(/Location: (.+)/);
      if (locationHeader) {
        const redirectUrl = locationHeader[1].trim();
        const { hostname, path } = url.parse(redirectUrl);
        makeRequest(hostname, path, 443);
        return;
      }
    }
  });

  client.on('error', (err) => {
    console.error('Error:', err);
  });
}

makeRequest('wegopro.com');

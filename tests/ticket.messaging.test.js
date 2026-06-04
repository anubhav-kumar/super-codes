const { Worker } = require('worker_threads');
const path = require('path');

const ticketPath = path.join(__dirname, '../src/ticket.js');
const ticket1 = new Worker(ticketPath, { workerData: { ticketId: 'anubhav' } });
const ticket2 = new Worker(ticketPath, { workerData: { ticketId: 'saumya' } });
const ticket3 = new Worker(ticketPath, { workerData: { ticketId: 'anuja' } });

const ticketPool = [ticket1, ticket2, ticket3];

ticketPool.forEach((ticketProcess) => {
  ticketProcess.on('message', (msg) => {
    switch (msg.type) {
      case 'ticketId': {
        ticketProcess.ticketId = msg.ticketId;
        break;
      }
      default: {
        console.log('Message type is not known');
      }
    }
  });
});

const broadcastMessage = (msg) => {
  ticketPool.forEach((ticketProcess) => {
    ticketProcess.postMessage(msg);
  });
};

for (let i = 1; i <= 95; i++) {
  broadcastMessage({ type: 'strikeNumber', number: i });
}

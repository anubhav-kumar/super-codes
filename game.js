const { Worker } = require('worker_threads');
const { v4: uuidV4 } = require('uuid');

class Game {
  constructor(gameId) {
    this.gameId = gameId;
    this.players = [];
    this.playerTicketMap = {};
    this.ticketPool = [];
    this.patternWinners = {
      fiveCellsStruck: null,
      allCornorsStruck: null,
      row0Struck: null,
      row1Struck: null,
      row2Struck: null,
    };
  }

  addPlayer(playerId) {
    this.userIds.push(playerId);
    this.playerTicketMap[playerId] = [];
  }

  removeUser(userId) {
    this.userIds = this.userIds.filter((x) => x !== userId);
  }

  addTicket(playerId) {
    const ticketId = `${playerId}#${uuidV4()}`;
    this.playerTicketMap[playerId].push(ticketId);
    const ticket1 = new Worker('./ticket.js', { workerData: { ticketId } });
    this.ticketPool.push(ticket1);
    ticket1.on('message', (msg) => {
      console.log('[Game] Received from ticket:', ticketId, ': ', msg);
      if (msg.type === 'housie') {
        const housiePattern = msg.message;
        if (!this.patternWinners[housiePattern]) {
          this.patternWinners[housiePattern] = ticketId;
        }
      }
      if (Object.values(this.patternWinners).every((x) => x)) {
        console.log('Game concluded');
        console.log(`Winner: ${JSON.stringify(this.patternWinners)}`);
        process.exit(1);
      }
    });
  }

  drawNumber(numberDrawn) {
    this.ticketPool.forEach((ticket) => {
      ticket.postMessage({
        type: 'strikeNumber',
        number: numberDrawn,
      });
    });
  }
}

const game = new Game();
['Anubhav', 'Saumya', 'Anuja', 'Vaibhav', 'Vasant', 'Giridhar', 'Muffaddal', 'Amit'].forEach((playerId) => game.addTicket(playerId));
setTimeout(() => {
  for (let i = 0; i < 100; i++) {
    const numberDrawn = Math.floor(Math.random() * 95) + 1;
    setTimeout(() => {
      console.log(`[Game]: Draw the number: ${numberDrawn}`);
      game.drawNumber(numberDrawn);
    }, 1000 * i);
  }
}, 5000);

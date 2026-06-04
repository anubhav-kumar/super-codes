const { Worker } = require('worker_threads');
const path = require('path');
const { v4: uuidV4 } = require('uuid');

class Game {
  constructor(gameId = uuidV4()) {
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

  getId() {
    return this.gameId;
  }

  addPlayer(playerId) {
    this.players.push(playerId);
    this.playerTicketMap[playerId] = [];
  }

  removeUser(userId) {
    this.players = this.players.filter((x) => x !== userId);
  }

  addTicket(playerId) {
    if (!this.playerTicketMap[playerId]) {
      this.addPlayer(playerId);
    }
    const ticketId = `${playerId}#${uuidV4()}`;
    this.playerTicketMap[playerId].push(ticketId);
    const ticket1 = new Worker(path.join(__dirname, 'ticket.js'), { workerData: { ticketId } });
    this.ticketPool.push(ticket1);
    ticket1.on('message', (msg) => {
      if (msg.type === 'housie') {
        const housiePattern = msg.message;
        if (!this.patternWinners[housiePattern]) {
          this.patternWinners[housiePattern] = ticketId;
        }
      }
      if (Object.values(this.patternWinners).every((x) => x)) {
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
    return 1;
  }

  terminate() {
    this.ticketPool.forEach((worker) => worker.terminate());
    this.ticketPool = [];
  }
}

module.exports = Game;

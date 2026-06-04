const { parentPort, workerData } = require('worker_threads');
const Cell = require('./cell');
const { generateHousieTicket } = require('./utility');

class Ticket {
  constructor(ticketId) {
    this.ticketId = ticketId;
    this.state = [[], [], []];
    this.rowWiseStrikesCounter = [0, 0, 0];
    this.numberLocationIndex = {};
  }

  init() {
    const randomHousieNumbers = generateHousieTicket();
    randomHousieNumbers.forEach((row, rowI) => row.forEach((col, colI) => {
      this.state[rowI].push(new Cell(rowI, colI, col));
      this.numberLocationIndex[col] = [rowI, colI];
    }));
  }

  showHousieTicket() {
    console.log(this.state);
  }

  isAllCornorsStruck() {
    const firstRow = this.state[0];
    const lastRow = this.state[2];

    let firstRowFirstElement = null;
    let firstRowLastElement = null;
    let lastRowFirstElement = null;
    let lastRowLastElement = null;

    firstRow.forEach((elemCell) => {
      if (elemCell.value) {
        if (!firstRowFirstElement) {
          firstRowFirstElement = elemCell;
        } else {
          firstRowLastElement = elemCell;
        }
      }
    });

    lastRow.forEach((elemCell) => {
      if (elemCell.value) {
        if (!lastRowFirstElement) {
          lastRowFirstElement = elemCell;
        } else {
          lastRowLastElement = elemCell;
        }
      }
    });

    const cornorCells = [
      firstRowFirstElement,
      firstRowLastElement,
      lastRowFirstElement,
      lastRowLastElement,
    ];

    return cornorCells.every((cell) => cell.isStruck);
  }

  isAnyFiveCellsStruck() {
    const totalStrikes = this.rowWiseStrikesCounter.reduce(
      (acc, currValue) => (acc + currValue),
      0,
    );
    return totalStrikes === 5;
  }

  isRowAllStruck(rowNumber) {
    return this.rowWiseStrikesCounter[rowNumber] === 5;
  }

  strikeNumber(number) {
    const locationOutput = this.numberLocationIndex[number];
    if (locationOutput) {
      const [row, col] = locationOutput;
      this.state[row][col].strike();
      this.rowWiseStrikesCounter[row] += 1;
    }
  }
}

module.exports = Ticket;

const { ticketId } = workerData;
const ticket = new Ticket(ticketId);
ticket.init();
const log = (message) => {
  console.log(`[Ticket-${ticketId}]: ${message}`);
};
log('Initialised');

const housieMessagesSent = [0, 0, 0, 0, 0];

parentPort.on('message', (msg) => {
  switch (msg.type) {
    case 'strikeNumber': {
      const { number } = msg;
      if (!number) {
        log('No number in the message payload from parent');
        return;
      }
      ticket.strikeNumber(number);
      // log(`Number ${number} is struck successfully`);

      if (ticket.isAnyFiveCellsStruck()) {
        if (!housieMessagesSent[0]) {
          log('Reply fiveCellsStruck');
          parentPort.postMessage({
            type: 'housie',
            message: 'fiveCellsStruck',
          });
          housieMessagesSent[0] = 1;
        }
      } else if (ticket.isAllCornorsStruck()) {
        if (!housieMessagesSent[1]) {
          log('Reply allCornorsStruck');
          parentPort.postMessage({
            type: 'housie',
            message: 'allCornorsStruck',
          });
          housieMessagesSent[1] = 1;
        }
      } else if (ticket.isRowAllStruck(0)) {
        if (!housieMessagesSent[2]) {
          log('Reply row0Struck');
          parentPort.postMessage({
            type: 'housie',
            message: 'row0Struck',
          });
          housieMessagesSent[2] = 1;
        }
      } else if (ticket.isRowAllStruck(1)) {
        if (!housieMessagesSent[3]) {
          log('Reply row1Struck');
          parentPort.postMessage({
            type: 'housie',
            message: 'row1Struck',
          });
          housieMessagesSent[3] = 1;
        }
      } else if (ticket.isRowAllStruck(2)) {
        if (!housieMessagesSent[4]) {
          log('Reply row2Struck');
          parentPort.postMessage({
            type: 'housie',
            message: 'row2Struck',
          });
          housieMessagesSent[4] = 1;
        }
      }
      break;
    }
    case 'shutdown':
      console.log('[Worker] Shutting down gracefully...');
      process.exit(0);
      break;
    default:
      log(`Unknown message: ${JSON.stringify(msg)}`);
  }
});

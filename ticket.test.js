/* eslint-env jest */
jest.mock('./utility', () => ({
  generateHousieTicket: jest.fn(),
}));

const { generateHousieTicket } = require('./utility');
const Ticket = require('./ticket');
const Cell = require('./cell');

// Deterministic 3x9 ticket — each row has exactly 5 filled numbers.
// Corners (first/last filled in row 0 and row 2): 1, 72, 2, 85.
const FIXTURE = [
  [1, null, 22, null, 41, null, 61, 72, null],
  [null, 15, 23, 34, null, 52, null, 73, 84],
  [2, null, 24, 35, 42, null, 62, null, 85],
];

function buildTicket(id = 'T1', layout = FIXTURE) {
  generateHousieTicket.mockReturnValue(layout.map((row) => [...row]));
  const ticket = new Ticket(id);
  ticket.init();
  return ticket;
}

describe('Ticket', () => {
  describe('constructor', () => {
    test('stores ticketId and initializes empty state', () => {
      const ticket = new Ticket('abc-123');
      expect(ticket.ticketId).toBe('abc-123');
      expect(ticket.state).toEqual([[], [], []]);
      expect(ticket.rowWiseStrikesCounter).toEqual([0, 0, 0]);
      expect(ticket.numberLocationIndex).toEqual({});
    });
  });

  describe('init', () => {
    test('fills state with Cell instances mirroring the generated layout', () => {
      const ticket = buildTicket();
      ticket.state.forEach((row, rowI) => {
        expect(row).toHaveLength(9);
        row.forEach((cell, colI) => {
          expect(cell).toBeInstanceOf(Cell);
          expect(cell.row).toBe(rowI);
          expect(cell.col).toBe(colI);
          expect(cell.value).toBe(FIXTURE[rowI][colI]);
          expect(cell.isStruck).toBe(false);
        });
      });
    });

    test('indexes every filled number to its [row, col] location', () => {
      const ticket = buildTicket();
      expect(ticket.numberLocationIndex[1]).toEqual([0, 0]);
      expect(ticket.numberLocationIndex[72]).toEqual([0, 7]);
      expect(ticket.numberLocationIndex[52]).toEqual([1, 5]);
      expect(ticket.numberLocationIndex[85]).toEqual([2, 8]);
    });

    test('also indexes null entries under the "null" key (current behavior)', () => {
      const ticket = buildTicket();
      // generateHousieTicket emits nulls; init() does not filter them.
      expect(ticket.numberLocationIndex).toHaveProperty('null');
    });
  });

  describe('strikeNumber', () => {
    test('strikes the cell holding the number and increments that row counter', () => {
      const ticket = buildTicket();
      ticket.strikeNumber(23); // row 1, col 2
      expect(ticket.state[1][2].isStruck).toBe(true);
      expect(ticket.rowWiseStrikesCounter).toEqual([0, 1, 0]);
    });

    test('is a no-op when the number is not on the ticket', () => {
      const ticket = buildTicket();
      ticket.strikeNumber(99);
      expect(ticket.rowWiseStrikesCounter).toEqual([0, 0, 0]);
      ticket.state.flat().forEach((cell) => expect(cell.isStruck).toBe(false));
    });

    test('routes corner numbers to the correct corner cells', () => {
      const ticket = buildTicket();
      ticket.strikeNumber(1);
      ticket.strikeNumber(85);
      expect(ticket.state[0][0].isStruck).toBe(true);
      expect(ticket.state[2][8].isStruck).toBe(true);
      expect(ticket.rowWiseStrikesCounter).toEqual([1, 0, 1]);
    });
  });

  describe('isRowAllStruck', () => {
    test('returns false until the row has 5 strikes', () => {
      const ticket = buildTicket();
      [1, 22, 41, 61].forEach((n) => ticket.strikeNumber(n));
      expect(ticket.isRowAllStruck(0)).toBe(false);
    });

    test('returns true once the row has 5 strikes', () => {
      const ticket = buildTicket();
      [1, 22, 41, 61, 72].forEach((n) => ticket.strikeNumber(n));
      expect(ticket.isRowAllStruck(0)).toBe(true);
    });

    test('is independent across rows', () => {
      const ticket = buildTicket();
      [15, 23, 34, 52, 73].forEach((n) => ticket.strikeNumber(n));
      expect(ticket.isRowAllStruck(1)).toBe(true);
      expect(ticket.isRowAllStruck(0)).toBe(false);
      expect(ticket.isRowAllStruck(2)).toBe(false);
    });
  });

  describe('isAnyFiveCellsStruck', () => {
    test('false when total strikes are fewer than 5', () => {
      const ticket = buildTicket();
      [1, 22, 41, 15].forEach((n) => ticket.strikeNumber(n));
      expect(ticket.isAnyFiveCellsStruck()).toBe(false);
    });

    test('true when exactly 5 cells are struck across any rows', () => {
      const ticket = buildTicket();
      [1, 22, 15, 35, 85].forEach((n) => ticket.strikeNumber(n));
      expect(ticket.isAnyFiveCellsStruck()).toBe(true);
    });
  });

  describe('isAllCornorsStruck', () => {
    test('false before any corner is struck', () => {
      const ticket = buildTicket();
      expect(ticket.isAllCornorsStruck()).toBe(false);
    });

    test('false when only some corners are struck', () => {
      const ticket = buildTicket();
      ticket.strikeNumber(1);
      ticket.strikeNumber(72);
      ticket.strikeNumber(2);
      expect(ticket.isAllCornorsStruck()).toBe(false);
    });

    test('true once all four corner cells are struck', () => {
      const ticket = buildTicket();
      [1, 72, 2, 85].forEach((n) => ticket.strikeNumber(n));
      expect(ticket.isAllCornorsStruck()).toBe(true);
    });
  });

  describe('showHousieTicket', () => {
    test('logs the current state to the console', () => {
      const ticket = buildTicket();
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      ticket.showHousieTicket();
      expect(spy).toHaveBeenCalledWith(ticket.state);
      spy.mockRestore();
    });
  });
});

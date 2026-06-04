/* eslint-env jest */
const Cell = require('./cell');

describe('Cell', () => {
  describe('constructor', () => {
    test('stores row, col, and value', () => {
      const cell = new Cell(1, 4, 42);
      expect(cell.row).toBe(1);
      expect(cell.col).toBe(4);
      expect(cell.value).toBe(42);
    });

    test('initializes isStruck to false', () => {
      const cell = new Cell(0, 0, 7);
      expect(cell.isStruck).toBe(false);
    });

    test('accepts a null value (empty housie cell)', () => {
      const cell = new Cell(2, 3, null);
      expect(cell.value).toBeNull();
    });
  });

  describe('setValue', () => {
    test('updates the cell value', () => {
      const cell = new Cell(0, 0, 1);
      cell.setValue(88);
      expect(cell.value).toBe(88);
    });

    test('can overwrite a previously set value', () => {
      const cell = new Cell(0, 0, 1);
      cell.setValue(2);
      cell.setValue(3);
      expect(cell.value).toBe(3);
    });
  });

  describe('strike', () => {
    test('sets isStruck to true', () => {
      const cell = new Cell(0, 0, 1);
      cell.strike();
      expect(cell.isStruck).toBe(true);
    });

    test('is idempotent', () => {
      const cell = new Cell(0, 0, 1);
      cell.strike();
      cell.strike();
      expect(cell.isStruck).toBe(true);
    });

    test('does not affect other cells', () => {
      const a = new Cell(0, 0, 1);
      const b = new Cell(0, 1, 2);
      a.strike();
      expect(b.isStruck).toBe(false);
    });
  });
});

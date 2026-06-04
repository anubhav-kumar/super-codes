class Cell {
  constructor(row, col, value) {
    this.row = row;
    this.col = col;
    this.value = value;
    this.isStruck = false;
  }

  setValue(value) {
    this.value = value;
  }

  strike() {
    this.isStruck = true;
  }
}

module.exports = Cell;

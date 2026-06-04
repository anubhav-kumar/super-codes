function generateHousieTicket() {
  const ticket = Array.from({ length: 3 }, () => Array(9).fill(null));

  // Pick which rows each column uses, ensure each row gets exactly 5 numbers
  const colCounts = Array(9).fill(1);
  let remaining = 6;
  while (remaining > 0) {
    const col = Math.floor(Math.random() * 9);
    if (colCounts[col] < 3) { colCounts[col]++; remaining--; }
  }

  for (let col = 0; col < 9; col++) {
    const min = col === 0 ? 1 : col * 10;
    const max = col === 8 ? 90 : col * 10 + 9;
    const pool = Array.from({ length: max - min + 1 }, (_, i) => min + i)
      .sort(() => Math.random() - 0.5);

    const rows = [0, 1, 2].sort(() => Math.random() - 0.5).slice(0, colCounts[col]).sort();
    rows.forEach((row, i) => { ticket[row][col] = pool[i]; });
  }

  // Fix rows that don't have exactly 5 numbers
  for (let i = 0; i < 500; i++) {
    const counts = ticket.map((r) => r.filter(Boolean).length);
    if (counts.every((c) => c === 5)) break;
    const over = counts.findIndex((c) => c > 5);
    const under = counts.findIndex((c) => c < 5);
    if (over === -1 || under === -1) break;
    const col = ticket[over].findIndex((v, c) => v && !ticket[under][c]);
    if (col === -1) break;
    ticket[under][col] = ticket[over][col];
    ticket[over][col] = null;
  }

  // Sort numbers within each column ascending
  for (let col = 0; col < 9; col++) {
    const filled = ticket.map((r, row) => [r[col], row]).filter(([v]) => v);
    filled.sort(([a], [b]) => a - b).forEach(([val], i) => {
      ticket[filled[i][1]][col] = val;
    });
  }

  return ticket;
}

module.exports = { generateHousieTicket };

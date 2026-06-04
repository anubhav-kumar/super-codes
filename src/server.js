const express = require('express');
const { v4: uuidV4 } = require('uuid');
const Game = require('./game');

const app = express();

app.use(express.json());

const games = new Map();

const createGameKey = (gameId) => `gameid:${gameId}`;

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// Create a game
app.post('/game', (req, res) => {
  const game = new Game();
  const gameId = game.getId();
  const gameIdKey = createGameKey(gameId);
  games.set(gameIdKey, { gameObj: game, players: [] });
  return res.status(201).json({ id: gameId });
});

// List all games
app.get('/game', (req, res) => {
  const allGames = [...games.values()].map(({ gameObj, players }) => ({
    id: gameObj.getId(),
    players,
    patternWinners: gameObj.patternWinners,
  }));
  return res.status(200).json({ games: allGames });
});

// Read a single game
app.get('/game/:gameId', (req, res) => {
  const { gameId } = req.params;
  const gameIdKey = createGameKey(gameId);
  const entry = games.get(gameIdKey);
  if (!entry) {
    return res.status(404).json({ error: 'Game not found' });
  }
  return res.status(200).json({
    id: entry.gameObj.getId(),
    players: entry.players,
    patternWinners: entry.gameObj.patternWinners,
  });
});

// Add a player (with a ticket) to a game
app.post('/game/:gameId/add-player', (req, res) => {
  const { gameId } = req.params;
  const gameIdKey = createGameKey(gameId);
  const entry = games.get(gameIdKey);
  if (!entry) {
    return res.status(404).json({ error: 'Game not found' });
  }
  const playerId = uuidV4();
  entry.gameObj.addTicket(playerId);
  entry.players.push(playerId);
  return res.status(200).json({ playerId, gameId });
});

// Draw a number for a game
app.post('/game/:gameId/draw-number', (req, res) => {
  const { gameId } = req.params;
  const gameIdKey = createGameKey(gameId);
  const entry = games.get(gameIdKey);
  if (!entry) {
    return res.status(404).json({ error: 'Game not found' });
  }
  const randomNumberDrawn = Math.floor(Math.random() * 95) + 1;
  entry.gameObj.drawNumber(randomNumberDrawn);
  return res.status(200).json({ status: 'success', numberDrawn: randomNumberDrawn });
});

// Delete a game
app.delete('/game/:gameId', (req, res) => {
  const { gameId } = req.params;
  const gameIdKey = createGameKey(gameId);
  const entry = games.get(gameIdKey);
  if (!entry) {
    return res.status(404).json({ error: 'Game not found' });
  }
  entry.gameObj.terminate();
  games.delete(gameIdKey);
  return res.status(200).json({ status: 'deleted', id: gameId });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[Server] Listening on port ${PORT}`);
});

module.exports = app;

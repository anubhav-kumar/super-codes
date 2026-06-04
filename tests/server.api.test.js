/* eslint-env jest */
/**
 * Integration tests for the Games CRUD API.
 *
 * These hit the ACTUAL running service over HTTP — start it first:
 *   npm start
 * Then in another terminal:
 *   npm test -- server.api.test.js
 *
 * Override the target with BASE_URL, e.g. BASE_URL=http://localhost:4000 npm test
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const api = (path, options) => fetch(`${BASE_URL}${path}`, options);

const createGame = async () => {
  const res = await api('/game', { method: 'POST' });
  expect(res.status).toBe(201);
  const body = await res.json();
  return body.id;
};

const addPlayer = async (gameId) => {
  const res = await api(`/game/${gameId}/add-player`, { method: 'POST' });
  expect(res.status).toBe(200);
  const body = await res.json();
  return body.playerId;
};

// Track everything we create so we can tear it down (DELETE terminates the
// per-ticket worker threads, otherwise they leak on the server).
const createdGameIds = [];

describe('Games CRUD API (integration, live service)', () => {
  beforeAll(async () => {
    try {
      await api('/game');
    } catch (err) {
      throw new Error(
        `Could not reach the service at ${BASE_URL}. `
        + "Start it with 'npm start' before running these tests.",
      );
    }
  });

  afterAll(async () => {
    await Promise.all(
      createdGameIds.map((id) => api(`/game/${id}`, { method: 'DELETE' })),
    );
  });

  test('creates multiple games, each returning a unique UUID', async () => {
    const NUM_GAMES = 3;
    const ids = await Promise.all(
      Array.from({ length: NUM_GAMES }, () => createGame()),
    );
    createdGameIds.push(...ids);

    ids.forEach((id) => expect(id).toMatch(UUID_RE));
    expect(new Set(ids).size).toBe(NUM_GAMES); // all unique
  });

  test('adds multiple players to each created game', async () => {
    const PLAYERS_PER_GAME = 4;

    // Spin up a fresh set of games for this test.
    const gameIds = await Promise.all([createGame(), createGame()]);
    createdGameIds.push(...gameIds);

    const gamePlayers = {};
    for (const gameId of gameIds) {
      // Sequential per game so the server-side players array is built predictably.
      const players = [];
      for (let i = 0; i < PLAYERS_PER_GAME; i++) {
        // eslint-disable-next-line no-await-in-loop
        players.push(await addPlayer(gameId));
      }
      gamePlayers[gameId] = players;
    }

    // Each player id is a valid UUID and unique within its game.
    Object.values(gamePlayers).forEach((players) => {
      expect(players).toHaveLength(PLAYERS_PER_GAME);
      players.forEach((p) => expect(p).toMatch(UUID_RE));
      expect(new Set(players).size).toBe(PLAYERS_PER_GAME);
    });

    // GET each game back and confirm the players are persisted.
    for (const gameId of gameIds) {
      // eslint-disable-next-line no-await-in-loop
      const res = await api(`/game/${gameId}`);
      expect(res.status).toBe(200);
      // eslint-disable-next-line no-await-in-loop
      const body = await res.json();
      expect(body.id).toBe(gameId);
      expect(body.players.sort()).toEqual(gamePlayers[gameId].sort());
    }
  });

  test('lists all games and includes the ones we created', async () => {
    const res = await api('/game');
    expect(res.status).toBe(200);
    const { games } = await res.json();

    const listedIds = games.map((g) => g.id);
    createdGameIds.forEach((id) => expect(listedIds).toContain(id));
  });

  test('returns 404 for an unknown game id', async () => {
    const res = await api('/game/does-not-exist');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Game not found');
  });

  test('draws a number for a game', async () => {
    const gameId = await createGame();
    createdGameIds.push(gameId);
    await addPlayer(gameId);

    const res = await api(`/game/${gameId}/draw-number`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('success');
    expect(body.numberDrawn).toBeGreaterThanOrEqual(1);
    expect(body.numberDrawn).toBeLessThanOrEqual(95);
  });

  test('deletes a game so it no longer appears', async () => {
    const gameId = await createGame();

    const del = await api(`/game/${gameId}`, { method: 'DELETE' });
    expect(del.status).toBe(200);
    expect((await del.json()).status).toBe('deleted');

    const res = await api(`/game/${gameId}`);
    expect(res.status).toBe(404);
  });
});

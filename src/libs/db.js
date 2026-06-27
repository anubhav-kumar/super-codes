const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
/**
 * A simple JSONL (JSON Lines) flat-file database.
 *
 * Each record is stored as one JSON object per line.
 * Records are automatically assigned a unique `id` field (incrementing integer).
 *
 * Usage:
 *   const db = new JsonlDatabase("data.jsonl");
 *   await db.load();
 *
 *   const id = await db.insert({ name: "Alice", age: 30 });
 *   const record = db.findById(id);
 *   const results = db.find(r => r.age > 25);
 *   await db.update(id, { age: 31 });
 *   await db.delete(id);
 */
class JsonlDatabase {
  constructor(filePath) {
    this.filePath = path.join(__dirname, '../data', filePath);
    this.store = new Map();
    this.loaded = false;
  }

  load() {
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, '', 'utf8');
    }

    const content = fs.readFileSync(this.filePath, 'utf8');
    content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .forEach((line) => {
        const record = JSON.parse(line);
        this.store.set(record.id, record);
      });

    this.loaded = true;
  }

  async save() {
    this.assertLoaded();
    const lines = [...this.store.values()].map((r) => JSON.stringify(r)).join('\n');
    fs.writeFileSync(this.filePath, lines ? `${lines}\n` : '', 'utf8');
  }

  async insert(data) {
    this.assertLoaded();
    if ('id' in data) throw new Error('insert(): data must not contain `id`');

    const record = { id: uuidv4(), ...data };
    this.store.set(record.id, record);

    fs.appendFileSync(this.filePath, `${JSON.stringify(record)}\n`, 'utf8');

    return record.id;
  }

  async update(id, changes) {
    this.assertLoaded();
    if ('id' in changes) throw new Error('update(): changes must not contain `id`');

    const existing = this.store.get(id);
    if (!existing) throw new Error(`update(): no record with id=${id}`);

    const updated = { ...existing, ...changes };
    this.store.set(id, updated);
    await this.save(); // full rewrite required to patch an arbitrary line
  }

  async replace(id, data) {
    this.assertLoaded();
    if ('id' in data) throw new Error('replace(): data must not contain `id`');
    if (!this.store.has(id)) throw new Error(`replace(): no record with id=${id}`);

    this.store.set(id, { id, ...data });
    await this.save();
  }

  async delete(id) {
    this.assertLoaded();
    const existed = this.store.delete(id);
    if (existed) await this.save();
    return existed;
  }

  async deleteWhere(predicate) {
    this.assertLoaded();
    const matches = [...this.store.entries()].filter(([, record]) => predicate(record));
    matches.forEach(([id]) => this.store.delete(id));
    if (matches.length > 0) await this.save();
    return matches.length;
  }

  async clear() {
    this.assertLoaded();
    this.store.clear();
    await this.save();
  }

  findById(id) {
    this.assertLoaded();
    return this.store.get(id);
  }

  find(predicate) {
    this.assertLoaded();
    return [...this.store.values()].filter(predicate);
  }

  findOne(predicate) {
    this.assertLoaded();
    return [...this.store.values()].find(predicate);
  }

  all() {
    this.assertLoaded();
    return [...this.store.values()];
  }

  get count() {
    return this.store.size;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  assertLoaded() {
    if (!this.loaded) {
      throw new Error('Database not loaded — call `await db.load()` first.');
    }
  }
}

module.exports = JsonlDatabase;

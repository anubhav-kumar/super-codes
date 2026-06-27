const DataStore = require('../libs/db');

class Base {
  constructor(moduleName) {
    this.store = new DataStore(moduleName);
    this.store.load();
  }

  async create(obj) {
    try {
      return this.store.insert(obj);
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  async getById(id) {
    try {
      return this.store.findById(id);
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  async get(filterFunction) {
    try {
      return this.store.find(filterFunction);
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  async deleteById(id) {
    try {
      return this.store.delete(id);
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  async updateById(id, changes) {
    try {
      return this.store.update(id, changes);
    } catch (err) {
      console.error(err);
      return false;
    }
  }
}

module.exports = Base;

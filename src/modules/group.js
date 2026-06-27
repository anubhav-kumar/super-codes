const Base = require('./base');

class Group extends Base {
  constructor() {
    super('group');
  }

  async addContactToGroup(groupId, contactId) {
    try {
      const group = this.store.findById(groupId);
      if (group) {
        const { contacts } = group;
        const newContacts = contacts ? [...contacts, contactId] : [contactId];
        return this.store.update(groupId, { contacts: newContacts });
      }
    } catch (err) {
      console.error(err);
    }
    return false;
  }

  async toggleGroupStatus(groupId) {
    try {
      const group = this.store.findById(groupId);
      if (group) {
        const currentStatus = group.status ? group.status : false;
        const newStatus = !currentStatus;
        return this.store.update(groupId, { status: newStatus });
      }
    } catch (err) {
      console.error(err);
    }
    return false;
  }
}

module.exports = Group;

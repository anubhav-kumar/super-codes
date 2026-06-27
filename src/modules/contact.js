const Base = require('./base');

class Contact extends Base {
  constructor() {
    super('contact');
  }

  async getUserByPhoneNumber(phoneNumber) {
    try {
      return this.get((item) => item.phoneNumber === phoneNumber);
    } catch (err) {
      console.error(err);
    }
    return false;
  }
}

module.exports = Contact;

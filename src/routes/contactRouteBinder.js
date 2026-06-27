const RouteBinder = require('./routebinder');

class ContactRouteBinder extends RouteBinder {
  bindAllRoutes() {
    this.bindCreate();
    this.bindUpdate();
    this.bindDelete();
    this.bindGetById();
    this.bindGetList();
  }
}

module.exports = ContactRouteBinder;

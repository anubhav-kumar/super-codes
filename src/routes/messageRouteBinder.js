const RouteBinder = require('./routebinder');

class MessageRouteBinder extends RouteBinder {
  bindAllRoutes() {
    this.bindCreate();
    this.bindUpdate();
    this.bindDelete();
    this.bindGetById();
  }
}

module.exports = MessageRouteBinder;

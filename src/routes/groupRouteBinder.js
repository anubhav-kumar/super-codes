const RouteBinder = require('./routebinder');

class GroupRouteBinder extends RouteBinder {
  bindAllRoutes() {
    this.bindCreate();
    this.bindUpdate();
    this.bindDelete();
    this.bindGetById();
    this.bindGetList();
    this.bindContactMappingRoute();
    this.bindGroupStatusToggleRoute();
  }

  bindContactMappingRoute() {
    this.app.post(`/${this.prefix}/group/:groupId/contact/:contactId`, async (req, res) => {
      const { groupId, contactId } = req.params;
      const response = await this.module.addContactToGroup(groupId, contactId);
      return res.status(200).json(response);
    });
  }

  bindGroupStatusToggleRoute() {
    this.app.post(`/${this.prefix}/toggle/:groupId`, async (req, res) => {
      const { groupId } = req.params;
      const response = await this.module.toggleGroupStatus(groupId);
      return res.status(200).json(response);
    });
  }
}

module.exports = GroupRouteBinder;

class RouteBinder {
  constructor(app, prefix, module) {
    this.app = app;
    if (!prefix) {
      throw new Error('Prefix is mandatory');
    }
    this.prefix = `api/${prefix}`;
    this.module = module;
  }

  async bindCreate() {
    this.app.post(`/${this.prefix}/`, async (req, res) => {
      const { body } = req;
      const response = await this.module.create(body);
      return res.status(201).json({
        id: response,
      });
    });
  }

  async bindGetById() {
    this.app.get(`/${this.prefix}/:getId`, async (req, res) => {
      const { getId } = req.params;
      const response = await this.module.findById(getId);
      return res.status(201).json(response);
    });
  }

  async bindGetList() {
    this.app.get(`/${this.prefix}/`, async (req, res) => {
      const { size, page } = req.query;
      const filterSize = (size || 10);
      const filterPage = (page || 1);
      const startIndex = (filterPage - 1) * filterSize;
      const endIndex = (filterPage * filterSize) - 1;
      const response = await this.module.get((rec, idx) => startIndex <= idx && idx <= endIndex);
      return res.status(201).json(response);
    });
  }

  async bindUpdate() {
    this.app.post(`/${this.prefix}/:updateId`, async (req, res) => {
      const { updateId } = req.params;
      const { body } = req;
      const response = await this.module.updateById(updateId, body);
      return res.status(201).json(response);
    });
  }

  async bindDelete() {
    this.app.delete(`/${this.prefix}/:deleteId`, async (req, res) => {
      const { deleteId } = req.params;
      const response = await this.module.deleteById(deleteId);
      return res.status(201).json(response);
    });
  }
}

module.exports = RouteBinder;

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const GroupModule = require('./src/modules/group');
const ContactModule = require('./src/modules/contact');
const GroupRouteBinder = require('./src/routes/groupRouteBinder');
const ContactRouteBinder = require('./src/routes/contactRouteBinder');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

const groupRouteBinder = new GroupRouteBinder(app, 'group', new GroupModule());
const contactRouteBinder = new ContactRouteBinder(app, 'contact', new ContactModule());

groupRouteBinder.bindAllRoutes();
contactRouteBinder.bindAllRoutes();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

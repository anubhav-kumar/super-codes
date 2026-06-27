const Group = require('./src/modules/group');
const Contact = require('./src/modules/contact');

function randomChar(chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
  return chars[Math.floor(Math.random() * chars.length)];
}

// Generate a random string of given length
function randomString(length = 8) {
  return Array.from({ length }, () => randomChar()).join('');
}

function randomPhoneNumber() {
  return ['9', ...Array.from({ length: 9 }, () => randomChar('0123456789'))].join('');
}

const contact = new Contact();
const group = new Group();

const createRandomGroups = async () => {
  const groupIds = [];
  for (let i = 0; i < 20; i++) {
    const groupName = randomString(6);
    groupIds.push(group.create({ name: groupName }));
  }
  return Promise.all(groupIds);
};

const createRandomContacts = async () => {
  const contactIds = [];
  for (let i = 0; i < 1000; i++) {
    const contactName = randomString(6);
    const randomPhoneNo = randomPhoneNumber();
    contactIds.push(contact.create({ name: contactName, phone: randomPhoneNo }));
  }
  return Promise.all(contactIds);
};

const main = async () => {
  const groupIds = await createRandomGroups();
  const contactIds = await createRandomContacts();
  await group.addContactToGroup(groupIds[0], contactIds[1]);
  await group.addContactToGroup(groupIds[0], contactIds[2]);
  await group.addContactToGroup(groupIds[2], contactIds[2]);
  await group.addContactToGroup(groupIds[2], contactIds[3]);

  console.log(groupIds);
  const allGroups = await Promise.all(groupIds.map(async (grpId) => group.getById(grpId)));

  console.log(allGroups);
};

main();

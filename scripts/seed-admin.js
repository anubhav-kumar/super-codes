// Creates the first admin: npm run seed -- <email> [name]
// The password is generated here and printed once, so it never has to sit in a file; sign in
// and change it under Password. Table names come from SSM (needs AWS_REGION and STAGE).
// Idempotent: if a user with that email exists, it changes nothing.
import { randomBytes } from 'node:crypto';
import { createUser, getUserByEmail, loadConfigFromSsm } from '@vartalap/core';

function generatePassword() {
  return randomBytes(18).toString('base64url'); // 24 characters, well inside bcrypt's 72 bytes
}

async function main() {
  const [rawEmail, ...nameParts] = process.argv.slice(2);
  const email = rawEmail?.trim();
  const name = nameParts.join(' ').trim() || 'Admin';

  if (!email) {
    console.error('Usage: npm run seed -- <email> [name]');
    process.exit(1);
  }

  await loadConfigFromSsm();

  if (await getUserByEmail(email)) {
    console.log(`Admin ${email.toLowerCase()} already exists; nothing to do`);
    return;
  }

  const password = generatePassword();
  let user;
  try {
    user = await createUser({ email, name, role: 'admin', password });
  } catch (err) {
    // The byEmail GSI is eventually consistent; the guard item is the source of truth.
    if (err.code === 'CONFLICT') {
      console.log(`Admin ${email.toLowerCase()} already exists; nothing to do`);
      return;
    }
    throw err;
  }
  console.log(`Created admin ${user.email} (${user.userId})`);
  console.log(`One-time password (shown only now): ${password}`);
  console.log('Sign in and change it under Password.');
}

main().catch((err) => {
  console.error(`Seeding failed: ${err.code ?? err.name}: ${err.message}`);
  process.exit(1);
});

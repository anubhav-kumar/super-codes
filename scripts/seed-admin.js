// Creates the first admin from SEED_ADMIN_EMAIL (optional SEED_ADMIN_NAME). The password is
// generated here and printed once, so it never has to sit in an env file; sign in and change
// it under Password. Idempotent: if a user with that email exists, it changes nothing.
import { randomBytes } from 'node:crypto';
import { createUser, getUserByEmail } from '@vartalap/core';

function generatePassword() {
  return randomBytes(18).toString('base64url'); // 24 characters, well inside bcrypt's 72 bytes
}

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim();
  const name = process.env.SEED_ADMIN_NAME?.trim() || 'Admin';

  if (!email) {
    console.error('SEED_ADMIN_EMAIL must be set');
    process.exit(1);
  }

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

// Creates the first admin from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (optional SEED_ADMIN_NAME).
// Idempotent: if a user with that email exists, it changes nothing.
import { createUser, getUserByEmail } from '@vartalap/core';

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME?.trim() || 'Admin';

  if (!email || !password) {
    console.error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set');
    process.exit(1);
  }

  if (await getUserByEmail(email)) {
    console.log(`Admin ${email.toLowerCase()} already exists; nothing to do`);
    return;
  }

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
}

main().catch((err) => {
  console.error(`Seeding failed: ${err.code ?? err.name}: ${err.message}`);
  process.exit(1);
});

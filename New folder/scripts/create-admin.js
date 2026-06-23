#!/usr/bin/env node
/**
 * Create (or verify) the default admin user in MySQL.
 *
 * Usage:
 *   node scripts/create-admin.js
 *   ADMIN_SEED_USERNAME=admin ADMIN_SEED_PASSWORD='YourPass123' node scripts/create-admin.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const User = require('../models/User');

async function main() {
  const username = (process.env.ADMIN_SEED_USERNAME || 'admin').trim();
  const password = process.env.ADMIN_SEED_PASSWORD || 'Admin@2026!';

  if (password.length < 6) {
    console.error('Password must be at least 6 characters.');
    process.exit(1);
  }

  const exists = await User.usernameExists(username);
  if (exists) {
    const user = await User.findByUsername(username);
    console.log(JSON.stringify({
      action: 'exists',
      userId: user.id,
      username: user.username,
      isAdminByDefault: user.id === 1 || username.toLowerCase() === 'admin',
      hint: 'Login with your existing password, or set ADMIN_SEED_PASSWORD and delete user first to recreate.',
    }, null, 2));
    process.exit(0);
  }

  const user = await User.create(username, password);
  console.log(JSON.stringify({
    action: 'created',
    userId: user.id,
    username,
    password,
    isAdmin: user.id === 1 || username.toLowerCase() === 'admin',
    loginUrl: 'Use POST /api/auth/login or the web console',
  }, null, 2));
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});

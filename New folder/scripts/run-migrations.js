#!/usr/bin/env node
/**
 * Run SQL migration files against the configured MySQL database.
 * Usage: node scripts/run-migrations.js [file1.sql] [file2.sql] ...
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const DB = {
  host: process.env.DB_HOST || 'mysql.alufeqserver.cloudserverlive.net',
  user: process.env.DB_USER || '6raBramadlhobu9ak0fo',
  password: process.env.DB_PASSWORD || '0rA@7Ube8LFr6s*E~H1N',
  database: process.env.DB_NAME || 'WhatsApp',
  multipleStatements: true,
};

const IGNORABLE = [
  'ER_DUP_FIELDNAME', // duplicate column
  'ER_TABLE_EXISTS_ERROR',
  'Duplicate column name',
  'already exists',
];

function splitStatements(sql) {
  return sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/^--[^\n]*\n/gm, '').trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));
}

async function runFile(conn, filePath) {
  const name = path.basename(filePath);
  console.log(`\n=== ${name} ===`);
  const sql = fs.readFileSync(filePath, 'utf8');
  const statements = splitStatements(sql);

  for (const stmt of statements) {
    const preview = stmt.slice(0, 80).replace(/\s+/g, ' ');
    try {
      await conn.query(stmt);
      console.log(`  OK: ${preview}…`);
    } catch (err) {
      const msg = err.message || String(err);
      if (IGNORABLE.some((k) => msg.includes(k) || err.code === k)) {
        console.log(`  SKIP (already applied): ${preview}…`);
      } else {
        console.error(`  FAIL: ${preview}…`);
        throw err;
      }
    }
  }
}

async function main() {
  const defaultFiles = [
    path.join(__dirname, '..', 'database', 'migration_contact_groups.sql'),
    path.join(__dirname, '..', 'database', 'migration_v10_features.sql'),
  ];
  const files = process.argv.slice(2).length
    ? process.argv.slice(2).map((f) => path.resolve(f))
    : defaultFiles;

  console.log(`Connecting to ${DB.host} / ${DB.database} …`);
  const conn = await mysql.createConnection(DB);

  try {
    for (const file of files) {
      if (!fs.existsSync(file)) {
        throw new Error(`File not found: ${file}`);
      }
      await runFile(conn, file);
    }

    const [tables] = await conn.query(`
      SELECT TABLE_NAME FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (
        'contact_groups','campaigns','message_templates','inbox_messages',
        'api_keys','webhooks','user_quotas','campaign_recipients','opt_out_list'
      )
      ORDER BY TABLE_NAME
    `, [DB.database]);

    console.log('\n=== Verified tables ===');
    for (const row of tables) {
      console.log(`  ✓ ${row.TABLE_NAME}`);
    }
    console.log('\nMigrations completed successfully.');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('\nMigration failed:', err.message);
  process.exit(1);
});

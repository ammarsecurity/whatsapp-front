const pool = require('../config/database');
const fs = require('fs');
const path = require('path');

/**
 * Initialize database tables
 * Run this script to create tables if they don't exist
 */
async function initDatabase() {
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Split by semicolon and execute each statement
    const statements = schema
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--') && !stmt.startsWith('CREATE DATABASE'));

    for (const statement of statements) {
      if (statement) {
        try {
          await pool.execute(statement);
          console.log('✓ Executed:', statement.substring(0, 50) + '...');
        } catch (err) {
          // Ignore "table already exists" errors
          if (!err.message.includes('already exists')) {
            console.error('Error executing statement:', err.message);
          }
        }
      }
    }

    console.log('Database initialized successfully!');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  initDatabase()
    .then(() => {
      console.log('Database setup complete');
      process.exit(0);
    })
    .catch(err => {
      console.error('Database setup failed:', err);
      process.exit(1);
    });
}

module.exports = initDatabase;


const mysql = require('mysql2/promise');
require('dotenv').config();

// Create connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'mysql.alufeqserver.cloudserverlive.net',
  user: process.env.DB_USER || '6raBramadlhobu9ak0fo',
  password: process.env.DB_PASSWORD || '0rA@7Ube8LFr6s*E~H1N',
  database: process.env.DB_NAME || 'WhatsApp',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Test connection
pool.getConnection()
  .then(connection => {
    console.log('MySQL connected successfully');
    connection.release();
  })
  .catch(err => {
    console.error('MySQL connection error:', err.message);
  });

module.exports = pool;


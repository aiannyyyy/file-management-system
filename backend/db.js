const mysql = require("mysql2/promise");
require("dotenv").config();

// Print out env variables for debugging (optional, remove in production)
console.log("🔹 DB_HOST:", process.env.DB_HOST);
console.log("🔹 DB_USER:", process.env.DB_USER);
console.log("🔹 DB_NAME:", process.env.DB_NAME);
console.log("🔹 DB_PORT:", process.env.DB_PORT || 3306);

const mysqlDb = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000, // 10 seconds
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Test connection without stopping the app
(async () => {
  try {
    const connection = await mysqlDb.getConnection();
    console.log("✅ Connected to MySQL database.");
    connection.release();
  } catch (err) {
    console.error("❌ MySQL initial connection failed:");
    console.error("   Error Code:", err.code);
    console.error("   Message:", err.message);
    console.error("⚠️  Server will continue, but database operations may fail.");
  }
})();

// Handle pool errors gracefully
mysqlDb.on('error', (err) => {
  console.error('❌ MySQL pool error:', err.message);
  if (err.code === 'PROTOCOL_CONNECTION_LOST') {
    console.log('🔄 Database connection lost. Pool will reconnect automatically.');
  }
});

module.exports = mysqlDb;
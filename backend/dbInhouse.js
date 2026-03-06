const mysql = require("mysql2/promise");
require("dotenv").config();

// Log connection details for debugging
console.log("🔹 Inhouse DB Host:", process.env.HOST_DB);
console.log("🔹 Inhouse DB User:", process.env.USER_DB);
console.log("🔹 Inhouse DB Name: nscslcom_nscsl_intranet");
console.log("🔹 Inhouse DB Port:", process.env.DB_PORT || 3306);

// Create a connection pool for better performance
const pool = mysql.createPool({
    host: process.env.HOST_DB,
    user: process.env.USER_DB,
    password: process.env.PASS_DB,
    database: "test_nscslcom_nscsl_intranet",
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

// Test the connection
(async () => {
    try {
        const connection = await pool.getConnection();
        console.log("✅ Connected to In House MySQL database.");
        connection.release();
    } catch (err) {
        console.error("❌ MySQL connection failed:", err.message);
        console.error("   Error Code:", err.code);
        console.error("⚠️  Server will continue, but database operations may fail.");
    }
})();

// Handle pool errors gracefully
pool.on('error', (err) => {
    console.error('❌ MySQL pool error:', err.message);
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
        console.log('🔄 Database connection lost. Pool will reconnect automatically.');
    }
});

module.exports = pool;
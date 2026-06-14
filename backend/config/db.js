const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function convertPlaceholders(text) {
  const existing = [...text.matchAll(/\$(\d+)/g)].map((match) => parseInt(match[1], 10));
  let index = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return text.replace(/\?/g, () => `$${index++}`);
}

function isModifyQuery(text) {
  return /^\s*(INSERT|UPDATE|DELETE|REPLACE)/i.test(text.trim());
}

async function query(text, params = []) {
  const pgText = convertPlaceholders(text);
  const result = await pool.query(pgText, params);

  const header = {
    insertId: result.rows[0]?.id ?? null,
    affectedRows: result.rowCount,
    rowCount: result.rowCount
  };

  if (isModifyQuery(text)) {
    const response = [header, result.fields];
    response.rows = result.rows;
    return response;
  }

  const response = [result.rows, result.fields];
  response.rows = result.rows;
  return response;
}

pool.connect((err, client, release) => {
  if (err) {
    console.error("PostgreSQL connection failed:", err.message);
    return;
  }
  console.log("Connected to PostgreSQL (Supabase)");
  release();
});

pool.on("error", (err) => {
  console.error("PostgreSQL pool error:", err.message);
});

module.exports = {
  query,
  connect: (...args) => pool.connect(...args),
  on: (...args) => pool.on(...args)
};

// Database access for the app.
//
// Two implementations live here:
//   - createPool()      -> a real Postgres connection pool (normal runs)
//   - createFakePool()  -> a tiny in-memory stand-in used when NODE_ENV=test
//
// The fake lets the integration and end-to-end tests run on any laptop or CI
// runner with no database installed. It answers the two queries server.js
// makes and returns empty rows for anything else.
const { Pool } = require('pg');

const SEED_WIDGETS = [
  { id: 1, name: 'Widget A', description: 'A basic widget', price: '9.99' },
  { id: 2, name: 'Widget B', description: 'An advanced widget', price: '19.99' },
  { id: 3, name: 'Widget C', description: 'A premium widget', price: '29.99' },
];

// The fake always has one user: admin / password.
const SEED_USERS = [{ id: 1, username: 'admin', password: 'password' }];

function createFakePool() {
  async function query(text, params = []) {
    const sql = String(text).toLowerCase();
    if (sql.startsWith('select * from users')) {
      const [username, password] = params;
      return { rows: SEED_USERS.filter((u) => u.username === username && u.password === password) };
    }
    if (sql.includes('from widgets')) {
      return { rows: SEED_WIDGETS };
    }
    return { rows: [] };
  }
  return {
    query,
    connect: async () => ({ query, release() {} }),
  };
}

function createPool() {
  if (process.env.NODE_ENV === 'test') return createFakePool();
  return new Pool({
    host: process.env.POSTGRES_HOST || 'db',
    port: process.env.POSTGRES_PORT ? parseInt(process.env.POSTGRES_PORT, 10) : 5432,
    user: process.env.POSTGRES_USER || 'example',
    password: process.env.POSTGRES_PASSWORD || 'example',
    database: process.env.POSTGRES_DB || 'exampledb',
  });
}

// Create tables and seed a default user and a few widgets if they do not exist.
async function initDb(pool) {
  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'password';
  let client;
  try {
    client = await pool.connect();
    await client.query(`CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )`);
    await client.query(
      `INSERT INTO users (username, password)
       SELECT $1, $2
       WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = $1)`,
      ['admin', adminPassword]
    );
    await client.query(`CREATE TABLE IF NOT EXISTS widgets (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      price NUMERIC(10,2) NOT NULL DEFAULT 0
    )`);
    for (const w of SEED_WIDGETS) {
      await client.query(
        `INSERT INTO widgets (name, description, price)
         SELECT $1, $2, $3
         WHERE NOT EXISTS (SELECT 1 FROM widgets WHERE name = $1)`,
        [w.name, w.description, w.price]
      );
    }
    console.log('Database initialized');
  } catch (err) {
    console.error('Error initializing database', err);
  } finally {
    if (client) client.release();
  }
}

module.exports = { createPool, createFakePool, initDb };

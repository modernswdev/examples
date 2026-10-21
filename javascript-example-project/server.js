const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const { AUTH_TOKEN, hasValidAuthToken, hasLoginFields } = require('./lib/auth-utils');
const { createPool, initDb } = require('./lib/db');

const app = express();
const PORT = process.env.PORT || 3000;
const pool = createPool();

app.use(express.json());
app.use(cookieParser());

// Middleware for routes that require the login cookie.
function requireAuth(req, res, next) {
  if (!hasValidAuthToken(req.cookies.token)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

app.post('/api/login', async (req, res) => {
  if (!hasLoginFields(req.body)) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  const { username, password } = req.body;
  try {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE username=$1 AND password=$2',
      [username, password]
    );
    if (rows.length > 0) {
      res.cookie('token', AUTH_TOKEN, { httpOnly: true });
      return res.json({ ok: true });
    }
    res.status(401).json({ ok: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ username: 'admin' });
});

app.get('/api/widgets', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, name, description, price FROM widgets ORDER BY id');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching widgets', err);
    res.status(500).json({ error: 'server error' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

// Only start listening when run directly (`node server.js`).
// Tests import `app` and drive it without opening a port.
if (require.main === module) {
  initDb(pool).then(() => {
    app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
  });
}

module.exports = app;

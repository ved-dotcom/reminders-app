// backend/server.js

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(bodyParser.json());

// ✅ Allow CORS for all origins (safe for now, will restrict later)
app.use(cors({ origin: '*' }));

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

// --- Auth middleware
function authMiddleware(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth) return res.status(401).json({ error: 'no auth header' });
  const token = auth.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'bad token' });
  }
}

// --- Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// Register new user
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'missing username or password' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (id, username, password_hash, role, approved) VALUES ($1,$2,$3,$4,$5) RETURNING id, username, role, approved',
      [uuidv4(), username, hash, 'user', false]
    );
    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db error' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'missing username or password' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
    const user = result.rows[0];
    if (!user) return res.status(400).json({ error: 'no such user' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(400).json({ error: 'bad password' });
    if (!user.approved) return res.status(403).json({ error: 'not approved' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET
    );
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db error' });
  }
});

// Create task
app.post('/api/tasks', authMiddleware, async (req, res) => {
  const { title, description, assignee_id } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO tasks (id, title, description, assigned_by, assignee_id, status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [uuidv4(), title, description, req.user.id, assignee_id, 'pending']
    );
    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db error' });
  }
});

// Get tasks for a user
app.get('/api/users/:id/tasks', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM tasks WHERE assignee_id=$1 ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db error' });
  }
});

// --- Debug page (same-origin test for login, bypasses CORS)
app.get('/debug-page', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html>
<html>
<head><meta charset="utf-8"><title>Debug login (same origin)</title>
<style>body{font-family:Arial;margin:24px} input{padding:8px;margin:6px 0;width:260px} button{padding:8px}</style>
</head>
<body>
  <h3>Debug login (served from backend)</h3>
  <div><label>Username</label><br/><input id="u" value="director"></div>
  <div><label>Password</label><br/><input id="p" value="Ved@rasino" type="password"></div>
  <div><button id="btn">Send LOGIN POST</button></div>
  <h4>Result</h4>
  <pre id="out" style="background:#f6f6f6;padding:12px;border:1px solid #ddd"></pre>
<script>
document.getElementById('btn').onclick = async ()=>{
  const out = document.getElementById('out');
  out.textContent = 'sending...';
  try{
    const u = document.getElementById('u').value;
    const p = document.getElementById('p').value;
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p })
    });
    const text = await res.text();
    out.textContent = 'HTTP ' + res.status + '\\n\\n' + text;
  }catch(e){
    out.textContent = 'Network error (fetch threw):\\n' + e.toString();
  }
};
</script>
</body>
</html>`);
});

// Start server
app.listen(PORT, () => {
  console.log('API listening', PORT);
});

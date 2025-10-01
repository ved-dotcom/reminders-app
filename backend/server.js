// backend/server.js
const express = require('express');
const cors = require('cors');
app.use(cors({
  origin: '*'
}));
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(bodyParser.json());
app.use(cors({ origin: true })); // allow all for now; lock later in prod

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/reminders';
const pool = new Pool({ connectionString: DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized:false } : false });
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

async function query(q, params){ return (await pool.query(q, params)); }

function authMiddleware(req, res, next){
  const token = (req.headers.authorization||'').replace('Bearer ','');
  if(!token) return res.status(401).send({ error: 'no token' });
  try{
    const data = jwt.verify(token, JWT_SECRET);
    req.user = data;
    next();
  }catch(e){ return res.status(401).send({ error: 'invalid token' }); }
}

async function isDirector(userId){
  const r = await query(`SELECT 1 FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=$1 AND r.name='director'`, [userId]);
  return r.rowCount > 0;
}

/* --- Basic endpoints --- */

// health
app.get('/api/health', (req,res)=> res.send({ ok:true }));

// register (creates pending user)
app.post('/api/auth/register', async (req,res)=>{
  const { username, password, display_name, employee_id } = req.body;
  if(!username || !password) return res.status(400).send({ error:'username and password required' });
  const pwd = await bcrypt.hash(password, 12);
  try{
    const id = uuidv4();
    await query(`INSERT INTO users (id, username, display_name, password_hash, status, employee_id, force_password_change) VALUES ($1,$2,$3,$4,'pending',$5,true)`, [id, username, display_name || username, pwd, employee_id]);
    return res.status(201).send({ id, username, status:'pending' });
  }catch(e){ return res.status(400).send({ error: e.message }); }
});

// login
app.post('/api/auth/login', async (req,res)=>{
  const { username, password } = req.body;
  const r = await query(`SELECT * FROM users WHERE username=$1`, [username]);
  if(r.rowCount===0) return res.status(400).send({ error:'no user' });
  const user = r.rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if(!ok) return res.status(400).send({ error:'bad creds' });
  if(user.status !== 'active') return res.status(403).send({ error: 'not approved' });
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '12h' });
  res.send({ token, user: { id: user.id, username: user.username, display_name: user.display_name } });
});

/* --- Admin: create user (Director-only) --- */
app.post('/api/admin/users', authMiddleware, async (req,res)=>{
  if(!(await isDirector(req.user.id))) return res.status(403).send({ error:'forbidden' });
  const { username, display_name, temp_password, role, make_active } = req.body;
  const pwdHash = await bcrypt.hash(temp_password || Math.random().toString(36).slice(2,10), 12);
  const id = uuidv4();
  const status = make_active ? 'active' : 'pending';
  await query(`INSERT INTO users (id, username, display_name, password_hash, status, force_password_change) VALUES ($1,$2,$3,$4,$5,$6)`, [id, username, display_name||username, pwdHash, status, !!temp_password]);
  if(role){
    let rr = await query(`SELECT id FROM roles WHERE name=$1`, [role]);
    let roleId;
    if(rr.rowCount===0){
      roleId = uuidv4();
      await query(`INSERT INTO roles (id, name) VALUES ($1,$2)`, [roleId, role]);
    } else roleId = rr.rows[0].id;
    await query(`INSERT INTO user_roles (id, user_id, role_id, granted_by) VALUES ($1,$2,$3,$4)`, [uuidv4(), id, roleId, req.user.id]);
  }
  res.send({ ok:true, id, username, status });
});

/* --- Tasks: create + approve --- */
app.post('/api/tasks', authMiddleware, async (req,res)=>{
  const { title, description, assignee_id, group_id } = req.body;
  const director = await isDirector(req.user.id);
  const status = director ? 'active' : 'pending_approval';
  const id = uuidv4();
  await query(`INSERT INTO tasks (id, title, description, created_by, assignee_id, group_id, status) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, title, description, req.user.id, assignee_id, group_id, status]);
  res.status(201).send({ id, status });
});

app.post('/api/tasks/:id/approve', authMiddleware, async (req,res)=>{
  if(!(await isDirector(req.user.id))) return res.status(403).send({ error:'forbidden' });
  const id = req.params.id;
  await query(`UPDATE tasks SET status='active', approved_by=$1 WHERE id=$2`, [req.user.id, id]);
  res.send({ ok:true });
});

// get tasks for user (self or directors)
app.get('/api/users/:id/tasks', authMiddleware, async (req,res)=>{
  const target = req.params.id;
  if(req.user.id !== target){
    if(!(await isDirector(req.user.id))) return res.status(403).send({ error:'forbidden' });
  }
  const r = await query(`SELECT * FROM tasks WHERE assignee_id=$1 ORDER BY created_at DESC`, [target]);
  res.send(r.rows);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, ()=>console.log('API listening', PORT));

// frontend/app.js
// Very small demo client that talks to the backend API.

const API = 'https://reminders-app-vj5v.onrender.com';

const el = id => document.getElementById(id);

el('btnLogin').onclick = async ()=>{
  el('msg').innerText = '';
  const u = el('loginUser').value.trim(), p = el('loginPass').value;
  if(!u || !p) return el('msg').innerText = 'enter username & password';
  try{
    const res = await fetch(`${API}/api/auth/login`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ username:u, password:p })});
    const d = await res.json();
    if(!res.ok) return el('msg').innerText = d.error || JSON.stringify(d);
    localStorage.setItem('token', d.token);
    initApp(d.user);
  }catch(e){ el('msg').innerText = 'network error'; console.error(e); }
};

el('btnReg').onclick = async ()=>{
  el('msg').innerText = '';
  const u = el('regUser').value.trim(), p = el('regPass').value;
  if(!u || !p) return el('msg').innerText = 'enter username & password';
  try{
    const res = await fetch(`${API}/api/auth/register`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ username:u, password:p })});
    const d = await res.json();
    el('msg').innerText = res.ok ? 'Registered — awaiting director approval' : (d.error || JSON.stringify(d));
  }catch(e){ el('msg').innerText = 'network error'; console.error(e); }
};

function initApp(user){
  el('auth').style.display='none';
  el('appArea').style.display='block';
  el('who').innerText = user.username;
}

el('btnLogout').onclick = ()=> { localStorage.removeItem('token'); location.reload(); };

el('btnCreateTask').onclick = async ()=>{
  const token = localStorage.getItem('token');
  if(!token) return el('msg').innerText = 'login first';
  const title = el('taskTitle').value.trim(), assignee = el('taskAssignee').value.trim(), desc = el('taskDesc').value.trim();
  if(!title || !assignee) return el('msg').innerText = 'enter title and assignee id';
  try{
    const res = await fetch(`${API}/api/tasks`, { method:'POST', headers:{ 'content-type':'application/json', 'authorization':'Bearer '+token }, body: JSON.stringify({ title, description:desc, assignee_id:assignee })});
    const d = await res.json();
    if(!res.ok) return el('msg').innerText = d.error || JSON.stringify(d);
    el('msg').innerText = `Task created (status: ${d.status})`;
  }catch(e){ el('msg').innerText = 'network error'; console.error(e); }
};

el('btnMyTasks').onclick = async ()=>{
  const token = localStorage.getItem('token');
  if(!token) return el('msg').innerText = 'login first';
  try{
    const payload = JSON.parse(atob(token.split('.')[1]));
    const res = await fetch(`${API}/api/users/${payload.id}/tasks`, { headers:{ authorization:'Bearer '+token }});
    const d = await res.json();
    if(!res.ok) return el('msg').innerText = d.error || JSON.stringify(d);
    el('tasksPre').innerText = JSON.stringify(d, null, 2);
  }catch(e){ el('msg').innerText = 'network error'; console.error(e); }
};

// If token in storage, try to show app immediately (no refresh)
(function tryAutoLogin(){
  const token = localStorage.getItem('token');
  if(!token) return;
  try{
    const payload = JSON.parse(atob(token.split('.')[1]));
    initApp({ username: payload.username });
  }catch(e){ /* ignore invalid token */ }
})();

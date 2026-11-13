'use strict';
const API = '/api/portal';
const LS = 'vx_code';
const MSG = {
  INVALID_CODE: 'Invalid team code. Check the code you were given.',
  FULL: 'Sorry, that problem statement just filled up. Please pick another.',
  ALREADY_CHOSEN: 'Your team has already chosen a problem statement.',
  BAD_PS: 'Unknown problem statement.',
  NOT_CONFIGURED: 'Storage is not connected yet (organisers: connect Upstash Redis in Vercel → Storage, then redeploy).',
  NET: 'Network problem. Check your connection and try again.'
};
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let code = null, team = null, st = null, busy = false, timer = null, online = true;
try { code = localStorage.getItem(LS); } catch (e) {}

async function api(body) {
  let r;
  try {
    r = await fetch(body ? API : API + '?t=' + Date.now(), body
      ? {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}
      : {cache: 'no-store'});
  } catch (e) { throw {error: 'NET'}; }
  const j = await r.json().catch(() => ({error: 'NET'}));
  if (!r.ok) throw j;
  return j;
}

function renderLogin(err) {
  $('#who').innerHTML = '';
  $('#app').innerHTML = `
    <form class="card login" id="f">
      <h1>Team login</h1>
      <p class="muted">Enter the 6-character access code sent to your team leader.</p>
      <input id="c" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123" required>
      <div class="err" id="e">${esc(err || '')}</div>
      <button id="b" style="width:100%">Log in</button>
    </form>`;
  $('#c').focus();
  $('#f').onsubmit = async ev => {
    ev.preventDefault();
    const c = $('#c').value.trim().toUpperCase();
    $('#b').disabled = true; $('#e').textContent = '';
    try {
      const j = await api({action: 'login', code: c});
      code = c; try { localStorage.setItem(LS, c); } catch (e) {}
      team = j.team; st = j; renderMain(); startPolling();
    } catch (x) { $('#e').textContent = MSG[x.error] || MSG.NET; $('#b').disabled = false; }
  };
}

function logout() {
  code = team = null; clearTimeout(timer);
  try { localStorage.removeItem(LS); } catch (e) {}
  renderLogin();
}

function renderMain(msg) {
  $('#who').innerHTML = `<b>${esc(team.name)}</b><button class="ghost" id="lo">Log out</button>`;
  $('#lo').onclick = logout;
  const mine = team.ps;
  const chosen = mine && st.problems.find(p => p.id === mine);
  $('#app').innerHTML = `
    ${chosen
      ? `<div class="banner"><b>You're in:</b> ${esc(chosen.title)}<br><span class="muted">Your choice is locked. Live counts below.</span></div>`
      : `<h1>Pick your problem statement</h1><p class="muted">First come, first served. Max ${st.cap} teams per track. Your choice is final.</p>`}
    <div class="err">${esc(msg || '')}</div>
    <span class="live ${online ? '' : 'off'}">${online ? 'Live' : 'Reconnecting…'}</span>
    <div class="grid">
      ${st.problems.map(p => {
        const full = p.taken >= st.cap, isMine = p.id === mine;
        return `<div class="card ps ${full ? 'full' : ''} ${isMine ? 'mine' : ''}">
          <div><h2>${p.id}. ${esc(p.title)}</h2><div class="muted">${esc(p.blurb)}</div></div>
          <div class="row">
            <div class="bar"><i style="width:${Math.min(100, p.taken / st.cap * 100)}%"></i></div>
            <span class="count">${p.taken} / ${st.cap}</span>
            ${isMine ? '<span class="tag">✓ Your track</span>'
              : mine ? (full ? '<span class="muted">Full</span>' : '')
              : `<button data-ps="${p.id}" ${full || busy ? 'disabled' : ''}>${full ? 'Full' : 'Choose'}</button>`}
          </div>
        </div>`;
      }).join('')}
    </div>`;
  document.querySelectorAll('[data-ps]').forEach(b => b.onclick = () => claim(+b.dataset.ps));
}

async function claim(ps) {
  const p = st.problems.find(x => x.id === ps);
  if (!confirm(`Choose "${p.title}"?\n\nThis is final and cannot be changed.`)) return;
  busy = true; renderMain();
  try {
    const j = await api({action: 'claim', code, ps});
    team = j.team; st = j; busy = false; renderMain();
  } catch (x) {
    busy = false;
    if (x.problems) st = x;
    if (x.team) team = x.team;
    renderMain(MSG[x.error] || MSG.NET);
  }
}

// Live counts: every 2 s while choosing, every 8 s after choosing; paused in hidden tabs.
async function poll() {
  if (!team) return;
  if (!document.hidden) {
    try {
      const j = await api();
      const changed = !online || JSON.stringify(j.problems) !== JSON.stringify(st.problems);
      online = true;
      if (changed) { st = Object.assign({}, st, j); if (!busy) renderMain(); }
    } catch (e) {
      if (online) { online = false; if (!busy) renderMain(); }
    }
  }
  timer = setTimeout(poll, team && team.ps ? 8000 : 2000);
}
function startPolling() { clearTimeout(timer); timer = setTimeout(poll, 2000); }
document.addEventListener('visibilitychange', () => { if (!document.hidden && team) { clearTimeout(timer); poll(); } });

(async () => {
  if (!code) return renderLogin();
  try {
    const j = await api({action: 'login', code});
    team = j.team; st = j; renderMain(); startPolling();
  } catch (x) {
    if (x.error === 'INVALID_CODE') { try { localStorage.removeItem(LS); } catch (e) {} }
    renderLogin(x.error === 'INVALID_CODE' ? '' : (MSG[x.error] || MSG.NET));
  }
})();

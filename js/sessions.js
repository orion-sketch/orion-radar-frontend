/**
 * ORION RADAR PRO — sessions.js
 * Horários de sessão em UTC-3 (Brasília)
 * Tóquio | Londres | New York | Overlap
 */

'use strict';

const SESSIONS = [
  { id: 'tokyo',   name: 'TÓQUIO',    start: 0,  end: 9,  bg: 'var(--tokyo)',   fg: 'var(--tokyo-txt)'  },
  { id: 'london',  name: 'LONDRE',    start: 8,  end: 17, bg: 'var(--london)',  fg: 'var(--london-txt)' },
  { id: 'ny',      name: 'NY',        start: 13, end: 22, bg: 'var(--ny)',      fg: 'var(--ny-txt)'     },
  { id: 'overlap', name: '★',         start: 16, end: 17, bg: 'var(--overlap)', fg: 'var(--overlap-txt)'},
];

const TICKS = [0, 3, 6, 9, 12, 15, 18, 21, 24];

function pctLeft(h) { return (h / 24) * 100; }
function pctWidth(s, e) { return ((e - s) / 24) * 100; }

function buildTimeline() {
  const tl = document.getElementById('sessions-timeline');
  if (!tl) return;

  SESSIONS.forEach(s => {
    const el = document.createElement('div');
    el.className = 'sess-block';
    el.style.left    = pctLeft(s.start) + '%';
    el.style.width   = pctWidth(s.start, s.end) + '%';
    el.style.background = s.bg;
    el.style.color      = s.fg;
    el.textContent = s.name;
    el.title = `${s.name}: ${s.start}h – ${s.end}h (BRT)`;
    tl.appendChild(el);
  });

  // Ponteiro de hora atual
  const needle = document.createElement('div');
  needle.className = 'sess-needle';
  needle.id = 'sess-needle';
  tl.appendChild(needle);
}

function buildTicks() {
  const row = document.getElementById('sessions-ticks');
  if (!row) return;
  TICKS.forEach(h => {
    const sp = document.createElement('span');
    sp.textContent = h + 'h';
    row.appendChild(sp);
  });
}

function getLocalBRT() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
}

function isSessionActive(session, brtHour) {
  if (session.start < session.end) {
    return brtHour >= session.start && brtHour < session.end;
  }
  // sessão que atravessa meia-noite (ex: Tóquio começa às 21h)
  return brtHour >= session.start || brtHour < session.end;
}

function updateClock() {
  const now = getLocalBRT();
  const h   = String(now.getHours()).padStart(2, '0');
  const m   = String(now.getMinutes()).padStart(2, '0');
  const s   = String(now.getSeconds()).padStart(2, '0');

  const clockEl = document.getElementById('clock');
  if (clockEl) clockEl.textContent = `${h}:${m}:${s} BRT`;

  // Mover ponteiro
  const needle = document.getElementById('sess-needle');
  if (needle) {
    const totalMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const pct = (totalMinutes / (24 * 60)) * 100;
    needle.style.left = pct.toFixed(3) + '%';
  }

  // Highlight sessão ativa na legenda (opcional)
  const currentHour = now.getHours();
  document.querySelectorAll('.leg-item').forEach(el => {
    el.style.opacity = '0.6';
  });

  SESSIONS.forEach(s => {
    if (isSessionActive(s, currentHour)) {
      const legEl = document.querySelector(`.leg-item.${s.id}`);
      if (legEl) legEl.style.opacity = '1';
    }
  });
}

function initSessions() {
  buildTimeline();
  buildTicks();
  updateClock();
  setInterval(updateClock, 1000);
}

// Theme switcher
function initTheme() {
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      document.body.className = theme;
      document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Repintar chart se existir
      if (window.orionChart && window.orionChart.applyTheme) {
        window.orionChart.applyTheme();
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initSessions();
  initTheme();
});

function showErr(m) {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:99;background:#400;color:#fff;padding:8px;border-radius:8px;font:12px monospace;white-space:pre-wrap';
  d.textContent = 'Error: ' + m;
  document.body.appendChild(d);
}
window.addEventListener('error', e => showErr(e.message + ' (line ' + e.lineno + ')'));
window.addEventListener('unhandledrejection', e => showErr(String(e.reason)));
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
cv.width = 1600; cv.height = 900; ctx.scale(2, 2);
const $ = id => document.getElementById(id);
const LW = 800, LH = 450, WORLD_W = 2600;
const G = 1500, SPEED = 245, JUMP = 560, WARN = 0.7;
const DUR = { grav: 3, inv: 4, col: 5 };
const LABEL = { grav: 'GRAV', inv: 'INVERT', col: 'COLOR' };
const TOAST = { grav: 'GRAVITY GLITCH!', inv: 'CONTROLS SCRAMBLE!', col: 'COLOR GLITCH!' };
const DEATH = ['Gravity said no 🙃', 'Your thumbs betrayed you', 'Physics: 1, You: 0', 'That was a skill issue 💀', 'Bro walked straight into a spike', 'The floor was lava, technically'];
const CHARS = {
  byte:  { name: 'Vine Runner', desc: 'No powers. Learn the jungle glitches.', col: '#6ee7ff' },
  ghost: { name: 'Spirit Runner', desc: 'Phase through 1 thorn hill per life.', col: '#ffffffcc' },
  over:  { name: 'Hill Sprinter', desc: 'Higher jumps, but 1s of sluggish controls after each glitch.', col: '#ffa94d' }
};
const ACH = { flip: 'Flip Master: 5 gravity flips in one life', blind: 'Blind Jump: jump while controls are inverted' };

// ---------- Level ----------
const FLOORS = [[0,400,400,50],[480,400,260,50],[820,330,160,20],[1040,400,240,50],[1340,300,140,20],[1540,400,300,50],[1900,340,140,20],[2100,400,500,50]];
const SPIKES_F = [[1120,384,40,16],[1380,284,40,16],[1960,324,40,16]];
// Level is mirrored: the ceiling is the flipped version of the floor
const SOLIDS = [
  ...FLOORS.map(([x,y,w,h]) => ({x,y,w,h})),
  ...FLOORS.map(([x,y,w,h]) => ({x,y:LH-y-h,w,h}))
];
const SP = [
  ...SPIKES_F.map(([x,y,w,h]) => ({x,y,w,h,up:true})),
  ...SPIKES_F.map(([x,y,w,h]) => ({x,y:LH-y-h,w,h,up:false}))
];
const MP = { x: 1260, y: 372, w: 60, h: 14, dir: 1, dx: 0 };
const GATE = { x: 1640, y: 0, w: 16, h: LH };
const BUG = { x: 1700, y: 370, w: 14, h: 14 };
const EXIT = { x: 2540, y: 0, w: 24, h: LH };
const TILES = [
  {t:'G',x:330,y:360,w:24,h:32},{t:'I',x:700,y:360,w:24,h:32},{t:'C',x:1100,y:360,w:24,h:32},
  {t:'G',x:1545,y:360,w:24,h:32},{t:'I',x:1600,y:360,w:24,h:32}
].map(t => ({...t, on:false}));
const TILE_COL = { G:'#ff4fd8', I:'#c4ff4f', C:'#6ee7ff' };

// ---------- State ----------
let char = 'byte', st = 'menu';
let user = null, ach = new Set();
const akey = () => 'glitch-ach-' + (user || 'guest');
function loadAch() { ach = new Set(); try { ach = new Set(JSON.parse(localStorage.getItem(akey()) || '[]')); } catch (e) {} }
function saveAch() { try { localStorage.setItem(akey(), JSON.stringify([...ach])); } catch (e) {} }
try { user = localStorage.getItem('glitch-user'); } catch (e) {}
loadAch();
let bestRec = [], bestTime = Infinity;
let p, gdir, T, PW, rec, frame, runT, flipsRun, ghostCh, immune, recov, groundSolid, deadT;
let deaths = 0, glitches = 0, bugFound = false, lives = 3, maxX = 0, lastTime = 0, lastStats = '';
let camX = 0, shake = 0, parts = [], jumpQ = false, inL = false, inR = false;
let toastTimer = 0, tt;
let ac = null;

let muted = false, musicOn = false, musicTimer = null, mStep = 0;
try { muted = localStorage.getItem('glitch-mute') === '1'; } catch (e) {}
function getAC() {
  if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
function tone(f1, f2, d, type = 'square', vol = 0.06) {
  if (muted) return;
  try {
    const c = getAC(), t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f1, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(vol * PROFILES[profile].vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + d);
  } catch (e) {}
}
const SFX = {
  jump: () => tone(300, 700, 0.12),
  glitch: () => tone(900, 200, 0.25, 'sawtooth', 0.05),
  activate: () => tone(440, 880, 0.2, 'triangle', 0.1),
  death: () => tone(400, 60, 0.4, 'sawtooth', 0.1),
  bug: () => [0, 4, 7, 12].forEach((n, i) => setTimeout(() => tone(523 * Math.pow(2, n / 12), null, 0.15, 'square', 0.06), i * 70)),
  clear: () => [0, 4, 7, 12, 16].forEach((n, i) => setTimeout(() => tone(392 * Math.pow(2, n / 12), null, 0.25, 'square', 0.06), i * 110)),
  over: () => tone(330, 80, 0.8, 'triangle', 0.12),
  ach: () => tone(660, 1320, 0.3, 'triangle', 0.1),
  click: () => tone(1000, 1000, 0.04, 'square', 0.03)
};
function sfx(n) { if (SFX[n]) SFX[n](); }
function beep(f, d) { tone(f, null, d, 'square', 0.06); }
const NOTE = m => 440 * Math.pow(2, (m - 69) / 12);
const BASS = [45, 45, 48, 45, 43, 43, 47, 43];
const LEAD = [69, 72, 76, 72, 74, 71, 67, 71];
let profile = 'runner';
const PROFILES = {
  runner: { step: 200, bass: [45, 45, 48, 45, 43, 43, 47, 43], lead: [69, 72, 76, 72, 74, 71, 67, 71], bw: 'square', lw: 'triangle', bv: 0.03, lv: 0.025, vol: 1 },
  heist: { step: 420, bass: [38, 38, 41, 38, 36, 36, 39, 36], lead: [62, 0, 65, 0, 62, 0, 60, 0], bw: 'sawtooth', lw: 'square', bv: 0.035, lv: 0.012, vol: 0.85 },
  cafe: { step: 330, bass: [48, 0, 52, 0, 55, 0, 52, 0], lead: [72, 76, 79, 76, 74, 0, 71, 0], bw: 'triangle', lw: 'sine', bv: 0.02, lv: 0.02, vol: 0.55 }
};
function setGameMusic(id) {
  profile = id;
  if (musicTimer) { clearInterval(musicTimer); musicTimer = setInterval(musicStep, PROFILES[id].step); }
}
function note(m, type, vol, d) {
  if (!m) return;
  const c = getAC(), t = c.currentTime, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = NOTE(m);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + d);
}
function musicStep() {
  if (muted || !musicOn) return;
  const P = PROFILES[profile], i = mStep++ % 8;
  note(P.bass[i], P.bw, P.bv, 0.18);
  if (i % 2 === 0) note(P.lead[i], P.lw, P.lv, 0.2);
}
function musicStepOld() {
  if (muted || !musicOn) return;
  const i = mStep++ % 8;
  note(BASS[i], 'square', 0.03, 0.18);
  if (i % 2 === 0) note(LEAD[i], 'triangle', 0.025, 0.2);
}
function setMusic(on) {
  musicOn = on;
  if (on && !musicTimer) musicTimer = setInterval(musicStep, PROFILES[profile].step);
  if (!on && musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}
function renderMute() { const t = muted ? '🔇' : '🔊'; $('mute').textContent = t; $('mute2').textContent = t; }
function renderMuteOld() { $('mute').textContent = muted ? '🔇' : '🔊'; }
const toggleMute = () => {
  muted = !muted;
  try { localStorage.setItem('glitch-mute', muted ? '1' : '0'); } catch (e) {}
  setMusic(!muted);
  renderMute();
};
$('mute').onclick = toggleMute;
$('mute2').onclick = toggleMute;
document.addEventListener('click', e => { if (e.target.closest && e.target.closest('button') && e.target.id !== 'mute') sfx('click'); });
['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, () => { if (!muted && !musicOn) setMusic(true); }));
function beepOld(f, d) {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = f; g.gain.value = 0.05;
    o.connect(g); g.connect(ac.destination);
    o.start(); o.stop(ac.currentTime + d);
  } catch (e) {}
}
function toast(msg, ms = 1400) {
  const el = $('toast'); el.textContent = msg; el.style.opacity = 1;
  clearTimeout(tt); tt = setTimeout(() => el.style.opacity = 0, ms);
}
function achieve(k) {
  if (ach.has(k)) return;
  ach.add(k);
  saveAch();
  sfx('ach');
  toast('🏆 ' + ACH[k].split(':')[0], 2500);
  renderAch();
}
function renderAch() {
  $('ach').innerHTML = Object.keys(ACH).map(k => (ach.has(k) ? '✅ ' : '🔒 ') + ACH[k]).join('<br>');
}
function renderCards() {
  $('cards').innerHTML = '';
  for (const k in CHARS) {
    const b = document.createElement('button');
    b.className = 'card' + (k === char ? ' sel' : '');
    b.innerHTML = `<b>${CHARS[k].name}</b><small>${CHARS[k].desc}</small>`;
    b.onclick = () => { char = k; renderCards(); };
    $('cards').appendChild(b);
  }
}

function resetRun() {
  if (game !== 'runner') { resetGame(); return; }
  p = { x: 40, y: 372, w: 22, h: 28, vx: 0, vy: 0, g: true };
  gdir = 1; T = { grav: 0, inv: 0, col: 0 }; PW = { grav: 0, inv: 0, col: 0 };
  rec = []; frame = 0; runT = 0; flipsRun = 0;
  ghostCh = char === 'ghost' ? 1 : 0;
  immune = 0; recov = 0; groundSolid = null; deadT = 0;
  MP.x = 1260; MP.dir = 1; MP.dx = 0;
  TILES.forEach(t => t.on = false);
  parts = []; camX = 0; st = 'play';
}
function newAttempt() {
  deaths = 0; glitches = 0; bugFound = false; lives = 3; maxX = 0;
  resetRun();
}
let authMode = 'login';
function getAccounts() { try { return JSON.parse(localStorage.getItem('glitch-accounts') || '{}'); } catch (e) { return {}; } }
function putAccounts(a) { try { localStorage.setItem('glitch-accounts', JSON.stringify(a)); } catch (e) {} }
async function hashPw(salt, pw) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pw));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function submitAuth() {
  const n = ($('uname').value || '').trim().slice(0, 12), pw = $('upass').value || '';
  if (!n) { toast('Enter a username', 1200); return; }
  if (pw.length < 4) { toast('Password needs 4+ characters', 1500); return; }
  const acc = getAccounts(), key = n.toLowerCase();
  try {
    if (authMode === 'signup') {
      if (acc[key]) { toast('That username is taken', 1500); return; }
      const salt = Math.random().toString(36).slice(2);
      acc[key] = { name: n, salt, hash: await hashPw(salt, pw) };
      putAccounts(acc);
      toast('Account created!', 1200);
    } else {
      const a = acc[key];
      if (!a) {
        $('authMsg').textContent = `No account found for "${n}". `;
        const b = document.createElement('button');
        b.className = 'ghost'; b.textContent = 'Create one';
        b.onclick = () => { authMode = 'signup'; renderLogin(); };
        $('authMsg').appendChild(b);
        return;
      }
      if (await hashPw(a.salt, pw) !== a.hash) { toast('Wrong password', 1500); return; }
    }
    user = acc[key].name;
    try { localStorage.setItem('glitch-user', user); } catch (e) {}
    loadAch(); renderLogin(); renderAch();
    toast('Welcome, ' + user + '!', 1500);
    showStage('game');
  } catch (e) { toast('Account system unavailable here', 1800); }
}
function renderLogin() {
  if (user) {
    $('login').innerHTML = `<span style="font-weight:800;color:#c4ff4f">Playing as ${user}</span> <button class="ghost" id="logoutBtn">Log out</button>`;
    $('logoutBtn').onclick = () => {
      user = null; try { localStorage.removeItem('glitch-user'); } catch (e) {}
      loadAch(); renderLogin(); renderAch();
    };
    return;
  }
  const box = 'width:220px;padding:9px 14px;border-radius:999px;border:2px solid #fff4;background:#150c28;color:#fff;font:inherit';
  $('login').innerHTML = `
    <div style="display:flex;gap:8px">
      <button class="ghost" id="tabLogin" style="${authMode === 'login' ? 'background:#fff2' : ''}">Log in</button>
      <button class="ghost" id="tabSign" style="${authMode === 'signup' ? 'background:#fff2' : ''}">Sign up</button>
    </div>
    <input id="uname" maxlength="12" placeholder="Username" style="${box}">
    <input id="upass" type="password" maxlength="32" placeholder="Password (4+ characters)" style="${box}">
    <button class="main" id="authGo">${authMode === 'login' ? 'Log in' : 'Create account'}</button>
    <div id="authMsg" style="color:#ff8fd8;font-size:14px;min-height:20px"></div>`;
  $('tabLogin').onclick = () => { authMode = 'login'; renderLogin(); };
  $('tabSign').onclick = () => { authMode = 'signup'; renderLogin(); };
  $('authGo').onclick = submitAuth;
}
function renderLoginOld() {
  $('login').innerHTML = user
    ? `<span style="font-weight:800;color:#c4ff4f">Playing as ${user}</span> <button class="ghost" id="logoutBtn">Log out</button>`
    : `<input id="uname" maxlength="12" placeholder="Enter your name" style="font:inherit;padding:9px 14px;border-radius:999px;border:2px solid #fff4;background:#150c28;color:#fff;width:200px"> <button class="ghost" id="loginBtn">Log in</button>`;
  if (user) $('logoutBtn').onclick = () => {
    user = null; try { localStorage.removeItem('glitch-user'); } catch (e) {}
    loadAch(); renderLogin(); renderAch();
  };
  else $('loginBtn').onclick = () => {
    const n = ($('uname').value || '').trim().slice(0, 12);
    if (!n) { toast('Type a name first', 1200); return; }
    user = n; try { localStorage.setItem('glitch-user', n); } catch (e) {}
    loadAch(); renderLogin(); renderAch();
    toast('Welcome, ' + n + '!', 1500);
  };
}
let curStage = 'landing';
const BACK = { auth: 'landing', game: 'landing', char: 'game', level: 'char', exit: 'landing' };
const STAGE_TEXT = {
  landing: 'Run the jungle hills. Gravity flips, controls scramble, and thorn hills wait for you.',
  auth: 'Sign up or log in. Accounts are saved on this device, so no internet or server is needed.',
  game: 'Choose a game to play.',
  level: 'Pick a level. Harder levels give more points.',
  exit: 'Leaving so soon? Your progress on this device is saved.',
  char: 'Pick your runner. Each one changes how the glitches feel.'
};
function showStage(s) {
  st = 'menu';
  curStage = s;
  $('end').style.display = 'none'; $('over').style.display = 'none';
  $('menu').style.display = 'flex';
  $('menu').classList.toggle('landing', s === 'landing');
  setLogo(s === 'landing' ? 'GLITCH RUNNER' : GNAME[game]);
  $('menu').querySelector('p').textContent = STAGE_TEXT[s];
  $('login').style.display = s === 'auth' ? 'flex' : 'none';
  $('ach').style.display = s === 'auth' ? 'block' : 'none';
  $('cards').style.display = s === 'char' ? 'flex' : 'none';
  $('gamesel').style.display = s === 'game' ? 'flex' : 'none';
  $('levelsel').style.display = s === 'level' ? 'flex' : 'none';
  $('exitsel').style.display = s === 'exit' ? 'flex' : 'none';
  $('exitBtn').style.display = s === 'landing' ? 'inline-block' : 'none';
  if (s === 'level') renderLevels();
  if (s === 'exit') renderExit();
  $('play').style.display = s === 'char' ? 'inline-block' : 'none';
  $('landBtn').style.display = s === 'landing' ? 'inline-block' : 'none';
  $('outBtn').style.display = s === 'landing' && user ? 'inline-block' : 'none';
  $('backBtn').style.display = s === 'landing' ? 'none' : 'inline-block';
  $('landBtn').onclick = () => showStage(user ? 'game' : 'auth');
  $('backBtn').onclick = () => showStage(BACK[curStage]);
  $('outBtn').onclick = () => {
    user = null; try { localStorage.removeItem('glitch-user'); } catch (e) {}
    loadAch(); showStage('landing');
  };
  if (s === 'auth') renderLogin();
  if (s === 'char') renderCards();
  renderAch();
}
function setLogo(word) {
  $('logo').innerHTML = [...word].map((c, i) => c === ' ' ? '<span class="sp"></span>' : `<span style="--i:${i}">${c}</span>`).join('');
}
function buildFx() {
  const word = 'GLITCH RUNNER';
  $('logo').innerHTML = [...word].map((c, i) => c === ' ' ? '<span class="sp"></span>' : `<span style="--i:${i}">${c}</span>`).join('');
  for (let i = 0; i < 22; i++) {
    const d = document.createElement('div');
    d.className = 'leaf';
    d.style.left = (Math.random() * 100) + '%';
    d.style.animationDuration = (6 + Math.random() * 6) + 's';
    d.style.animationDelay = (-Math.random() * 10) + 's';
    d.style.background = Math.random() < 0.5 ? '#7bd389' : '#3fae4a';
    $('leaves').appendChild(d);
  }
  setInterval(() => {
    const l = $('logo');
    l.classList.add('jit');
    setTimeout(() => l.classList.remove('jit'), 320);
  }, 2800);
}
// ---------- Vibe Heist & Spirit Café ----------
let game = 'runner', gScore = 0, inU = false, inD = false;
const HW = [[0,0,800,12],[0,438,800,12],[0,0,12,450],[788,0,12,450],[180,0,12,300],[180,360,12,90],[380,120,12,250],[560,0,12,200],[560,300,12,150],[640,200,140,12]].map(w => ({x:w[0],y:w[1],w:w[2],h:w[3]}));
const HEXIT = { x: 722, y: 372, w: 50, h: 60 };
const HGUARDS0 = [{a:[260,60],b:[260,220]},{a:[470,420],b:[470,250]},{a:[700,80],b:[700,380]}];
const HGEMS0 = [[110,60],[330,380],[700,280]];
let hp = { x: 40, y: 40, w: 18, h: 18 }, guards = [], gems = [], iT = 0;
const DRINKS = [{n:'Latte',c:'#ffb36b'},{n:'Mocha',c:'#b07a4a'},{n:'Tea',c:'#9be3a0'}];
const DBTN = [0,1,2].map(i => ({x:150 + i*170, y:370, w:140, h:50}));
const SLOTS = [110, 290, 470, 650];
let customers = [], selC = null, served = 0, spawnT = 0.5;

let lvl = 1, wasPlaying = false;
const GNAME = { runner: 'Glitch Runner', heist: 'Vibe Heist', cafe: 'Spirit Café' };
const HDEATH = ['Spotted by a guard 👀', 'Alarm triggered 🚨', 'Too loud, too slow', 'The guard saw you, bro'];
function pauseGame() { wasPlaying = st === 'play'; showStage('exit'); }
const LVL_SPD = [1, 1.28, 1.5];
const CAFE_LV = [{target:8,pat:14,spawn:2.8},{target:12,pat:12,spawn:2.2},{target:16,pat:10,spawn:1.8}];
const HEIST_LV = [
  {guards:[{a:[260,60],b:[260,220]},{a:[470,420],b:[470,250]}], spd:45},
  {guards:HGUARDS0, spd:60},
  {guards:[{a:[260,60],b:[260,220]},{a:[470,420],b:[470,250]},{a:[700,80],b:[700,380]},{a:[120,300],b:[120,420]}], spd:80}
];
function livePts() { return game === 'runner' ? Math.floor(maxX / 10) + glitches * 25 + (bugFound ? 200 : 0) : gScore; }
function renderExit() {
  const box = $('exitsel');
  box.innerHTML = `<h1 style="font-size:40px;color:#c4ff4f">Exit?</h1><p>Thanks for playing${user ? ', ' + user : ''}. Your scores and achievements are saved on this device.</p>`;
  const add = (label, cls, fn) => {
    const b = document.createElement('button');
    b.className = cls; b.textContent = label; b.onclick = fn;
    box.appendChild(b);
  };
  if (wasPlaying) add('Resume ▶', 'main', () => { wasPlaying = false; st = 'play'; $('menu').style.display = 'none'; });
  else add('Keep playing ▶', 'main', () => showStage('landing'));
  if (wasPlaying) add('Quit to menu', 'ghost', () => { wasPlaying = false; showStage('landing'); });
  if (user) add('Log out', 'ghost', () => {
    user = null; try { localStorage.removeItem('glitch-user'); } catch (e) {}
    loadAch(); showStage('landing');
  });
  add('Close tab', 'ghost', () => { window.close(); toast('You can close this tab now', 2500); });
}
function renderLevels() {
  const names = { runner: ['Easy', 'Faster', 'Fierce'], heist: ['Easy', 'Tricky', 'Expert'], cafe: ['Easy', 'Busy', 'Rush'] }[game] || ['Easy', 'Faster', 'Fierce'];
  const tips = ['Gentle start', 'Faster and sharper', 'Hardest tier'];
  $('levelsel').innerHTML = '';
  names.forEach((n, i) => {
    const b = document.createElement('button');
    b.className = 'card' + (lvl === i + 1 ? ' sel' : '');
    b.innerHTML = `<b>Level ${i + 1}: ${n}</b><small>${tips[i]}</small>`;
    b.onclick = () => { lvl = i + 1; renderLevels(); };
    $('levelsel').appendChild(b);
  });
  const nb = document.createElement('button');
  nb.className = 'main start-run';
  nb.textContent = 'Start run ▶';
  nb.onclick = startRun;
  $('levelsel').appendChild(nb);
}

function resetGame() {
  gScore = 0; parts = []; rec = []; frame = 0; runT = 0; deadT = 0; camX = 0; st = 'play';
  if (game === 'heist') {
    hp = { x: 40, y: 40, w: 18, h: 18 }; iT = 0;
    gems = HGEMS0.map(g => ({ x: g[0], y: g[1], got: false }));
    guards = HEIST_LV[lvl - 1].guards.map(g => ({ x: g.a[0], y: g.a[1], ax: g.a[0], ay: g.a[1], bx: g.b[0], by: g.b[1], tgt: 1, fx: 0, fy: 1 }));
  } else {
    customers = []; selC = null; served = 0; spawnT = 0.5;
  }
}
function hMove(mx, my) {
  hp.x += mx; hp.y += my;
  for (const w of HW) if (hit(hp, w)) {
    if (mx > 0) hp.x = w.x - hp.w; else if (mx < 0) hp.x = w.x + w.w;
    if (my > 0) hp.y = w.y - hp.h; else if (my < 0) hp.y = w.y + w.h;
  }
}
function seen(g) {
  const dx = hp.x + 9 - g.x, dy = hp.y + 9 - g.y, d = Math.hypot(dx, dy);
  if (d > 150) return false;
  if (d < 1) return true;
  if ((dx * g.fx + dy * g.fy) / d < Math.cos(Math.PI / 6)) return false;
  for (let i = 1; i < 12; i++) {
    const x = g.x + dx * i / 12, y = g.y + dy * i / 12;
    if (HW.some(w => x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h)) return false;
  }
  return true;
}
function caught() {
  iT = 1.2; lives--; shake = 10; sfx('death');
  toast(HDEATH[Math.floor(Math.random() * HDEATH.length)], 1200);
  hp.x = 40; hp.y = 40;
  if (lives <= 0) gameOver();
}
function updHeist(dt) {
  runT += dt; iT = Math.max(0, iT - dt);
  const dx = (inR ? 1 : 0) - (inL ? 1 : 0), dy = (inD ? 1 : 0) - (inU ? 1 : 0);
  const n = Math.hypot(dx, dy) || 1, sp = 150 * dt;
  hMove(dx / n * sp, 0); hMove(0, dy / n * sp);
  for (const g of guards) {
    const tx = g.tgt ? g.bx : g.ax, ty = g.tgt ? g.by : g.ay;
    const vx = tx - g.x, vy = ty - g.y, d = Math.hypot(vx, vy);
    if (d < 3) g.tgt = 1 - g.tgt;
    else { const s = Math.min(d, HEIST_LV[lvl - 1].spd * dt); g.x += vx / d * s; g.y += vy / d * s; g.fx = vx / d; g.fy = vy / d; }
  }
  if (iT <= 0 && guards.some(seen)) caught();
  if (st !== 'play') return;
  for (const gm of gems) if (!gm.got && Math.abs(hp.x + 9 - gm.x) < 14 && Math.abs(hp.y + 9 - gm.y) < 14) {
    gm.got = true; gScore += 100; sfx('bug'); toast('Gem stolen 💎', 900);
  }
  if (gems.every(g => g.got) && hit(hp, HEXIT)) clearLevel();
}
function updCafe(dt) {
  runT += dt; spawnT -= dt;
  if (spawnT <= 0) {
    const free = SLOTS.map((_, i) => i).filter(i => !customers.some(c => c.slot === i));
    if (free.length && customers.length < 4) customers.push({ slot: free[0], drink: Math.floor(Math.random() * 3), pat: CAFE_LV[lvl - 1].pat, max: CAFE_LV[lvl - 1].pat });
    spawnT = CAFE_LV[lvl - 1].spawn;
  }
  for (const c of customers) c.pat -= dt;
  const gone = customers.filter(c => c.pat <= 0);
  if (gone.length) {
    customers = customers.filter(c => c.pat > 0);
    if (gone.includes(selC)) selC = null;
    lives -= gone.length; shake = 8; sfx('death');
    toast('A ghost faded 👻', 1000);
    if (lives <= 0) gameOver();
  }
}
function serveDrink(i) {
  if (!selC) { toast('Tap a customer first', 900); return; }
  if (selC.drink === i) {
    gScore += 50 + Math.round(selC.pat * 5); served++; sfx('ach');
    toast('Served ☕', 800);
    customers = customers.filter(c => c !== selC); selC = null;
    if (served >= CAFE_LV[lvl - 1].target) clearLevel();
  } else {
    lives--; shake = 6; sfx('glitch');
    toast('Wrong drink!', 900);
    if (lives <= 0) gameOver();
  }
}
function cafeTap(e) {
  if (st !== 'play') return;
  const r = cv.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * LW, y = (e.clientY - r.top) / r.height * LH;
  for (const c of customers) {
    const cx = SLOTS[c.slot] + 40;
    if (Math.abs(x - cx) < 50 && Math.abs(y - 110) < 50) { selC = c; sfx('click'); return; }
  }
  DBTN.forEach((b, i) => { if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) serveDrink(i); });
}
function drawHeist(now) {
  ctx.fillStyle = '#1b1030'; ctx.fillRect(0, 0, LW, LH);
  ctx.strokeStyle = 'rgba(110,231,255,.06)'; ctx.lineWidth = 1;
  for (let x = 0; x < LW; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, LH); ctx.stroke(); }
  for (let y = 0; y < LH; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(LW, y); ctx.stroke(); }
  for (const g of guards) {
    const a = Math.atan2(g.fy, g.fx);
    ctx.fillStyle = 'rgba(196,255,79,.15)';
    ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.arc(g.x, g.y, 150, a - Math.PI / 6, a + Math.PI / 6); ctx.closePath(); ctx.fill();
  }
  const open = gems.every(g => g.got);
  ctx.fillStyle = open ? 'rgba(196,255,79,.45)' : 'rgba(255,255,255,.08)';
  ctx.fillRect(HEXIT.x, HEXIT.y, HEXIT.w, HEXIT.h);
  ctx.strokeStyle = open ? '#c4ff4f' : '#ffffff55'; ctx.lineWidth = 2;
  ctx.strokeRect(HEXIT.x, HEXIT.y, HEXIT.w, HEXIT.h);
  for (const w of HW) { ctx.fillStyle = '#ff4fd8'; ctx.shadowColor = '#ff4fd8'; ctx.shadowBlur = 10; ctx.fillRect(w.x, w.y, w.w, w.h); ctx.shadowBlur = 0; }
  for (const gm of gems) {
    if (gm.got) continue;
    ctx.fillStyle = '#6ee7ff'; ctx.shadowColor = '#6ee7ff'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(gm.x, gm.y - 7); ctx.lineTo(gm.x + 6, gm.y); ctx.lineTo(gm.x, gm.y + 7); ctx.lineTo(gm.x - 6, gm.y); ctx.fill();
    ctx.shadowBlur = 0;
  }
  for (const g of guards) {
    ctx.fillStyle = '#c4ff4f'; ctx.fillRect(g.x - 8, g.y - 8, 16, 16);
    ctx.fillStyle = '#07040f'; ctx.fillRect(g.x - 4, g.y - 3, 3, 3); ctx.fillRect(g.x + 1, g.y - 3, 3, 3);
  }
  if (!(iT > 0 && Math.floor(now / 100) % 2)) {
    ctx.fillStyle = CHARS[char].col; ctx.fillRect(hp.x, hp.y, 18, 18);
    ctx.fillStyle = '#07040f'; ctx.fillRect(hp.x + 4, hp.y + 5, 3, 3); ctx.fillRect(hp.x + 11, hp.y + 5, 3, 3);
  }
  ctx.fillStyle = '#fff'; ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'left';
  ctx.fillText(`Gems ${gems.filter(g => g.got).length}/3`, 24, 40);
}
function drawCafe(now) {
  ctx.fillStyle = '#2a1420'; ctx.fillRect(0, 0, LW, LH);
  ctx.fillStyle = 'rgba(255,180,90,.08)';
  for (let x = 0; x < LW; x += 60) ctx.fillRect(x, 0, 30, 300);
  for (const lx of [150, 400, 650]) {
    ctx.fillStyle = 'rgba(255,200,120,.2)'; ctx.beginPath(); ctx.arc(lx, 20, 90, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd08a'; ctx.fillRect(lx - 6, 0, 12, 8);
  }
  for (const c of customers) {
    const cx = SLOTS[c.slot] + 40, cy = 110;
    if (c === selC) { ctx.strokeStyle = '#c4ff4f'; ctx.lineWidth = 3; ctx.strokeRect(cx - 44, cy - 44, 88, 100); }
    ctx.fillStyle = '#e8f7ff';
    ctx.beginPath(); ctx.arc(cx, cy, 28, Math.PI, 0); ctx.lineTo(cx + 28, cy + 28); ctx.lineTo(cx - 28, cy + 28); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1a0f08'; ctx.fillRect(cx - 12, cy - 4, 6, 6); ctx.fillRect(cx + 6, cy - 4, 6, 6);
    ctx.fillStyle = '#fff'; ctx.fillRect(cx - 40, 160, 80, 24);
    ctx.fillStyle = DRINKS[c.drink].c; ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(DRINKS[c.drink].n, cx, 177);
    ctx.fillStyle = '#000a'; ctx.fillRect(cx - 36, 192, 72, 6);
    ctx.fillStyle = c.pat / c.max > 0.3 ? '#c4ff4f' : '#ff4fd8';
    ctx.fillRect(cx - 36, 192, 72 * Math.max(0, c.pat / c.max), 6);
  }
  ctx.fillStyle = '#5a2a3a'; ctx.fillRect(0, 340, LW, 110);
  ctx.fillStyle = '#ff4fd8'; ctx.fillRect(0, 340, LW, 4);
  DBTN.forEach((b, i) => {
    ctx.fillStyle = DRINKS[i].c; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = '#1a0f08'; ctx.font = 'bold 16px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(DRINKS[i].n, b.x + b.w / 2, b.y + 30);
  });
  ctx.fillStyle = '#fff'; ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'left';
  ctx.fillText(`Served ${served}/${CAFE_LV[lvl - 1].target}`, 20, 40);
}
function drawGame(now) {
  if (st === 'menu') return;
  if (game === 'heist') drawHeist(now); else drawCafe(now);
}

function startRun() {
  if (!user) {
    showStage('auth');
    $('authMsg').textContent = 'Log in or sign up to start a run.';
    return;
  }
  toast('← → to run · Space to jump', 2500);
  newAttempt();
  $('menu').style.display = 'none';
  $('over').style.display = 'none';
  $('end').style.display = 'none';
}

function burst(x, y, c) {
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2, s = 80 + Math.random() * 200;
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 100, life: 0.6, c });
  }
}
function updParts(dt) {
  for (const q of parts) { q.vy += 600 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt; }
  parts = parts.filter(q => q.life > 0);
}

// ---------- Glitches ----------
function trigger(k) {
  if (T[k] > 0 || PW[k] > 0) return;
  PW[k] = WARN;
  glitches++;
  toast(TOAST[k], 900);
  sfx('glitch');
}
function activate(k) {
  T[k] = DUR[k];
  sfx('activate');
  if (k === 'grav') {
    gdir = -1; flipsRun++;
    if (flipsRun >= 5) achieve('flip');
  }
  shake = Math.max(shake, 6);
}
function endGlitch(k) {
  T[k] = 0;
  if (k === 'grav') gdir = 1;
  if (char === 'over') recov = 1;
}

// ---------- Collision ----------
function hit(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
function solids() {
  const s = SOLIDS.slice();
  s.push(MP);
  if (!(T.grav > 0 && T.inv > 0)) s.push(GATE);
  return s;
}

// ---------- Death / clear ----------
function die(msg) {
  st = 'dead'; deaths++; lives--; deadT = 0; shake = 12;
  burst(p.x + p.w / 2, p.y + p.h / 2, '#ff4fd8');
  sfx('death');
  toast(msg || DEATH[Math.floor(Math.random() * DEATH.length)], 1400);
}
function calcPoints(cleared) {
  if (game !== 'runner') return gScore + (cleared ? 500 * lvl : 0);
  let pts = Math.floor(maxX / 10) + glitches * 25 + (bugFound ? 200 : 0);
  if (cleared) pts += 500 + Math.max(0, Math.round(600 - runT * 10));
  return pts;
}
function gameOver() {
  st = 'over';
  sfx('over');
  $('overStats').textContent = `Points: ${calcPoints(false)}`;
  $('over').style.display = 'flex';
}
function clearLevel() {
  st = 'clear';
  sfx('clear');
  if (runT < bestTime) { bestTime = runT; bestRec = rec.slice(); }
  const t = runT.toFixed(1), pts = calcPoints(true);
  lastStats = `${GNAME[game]}: ${pts} pts, cleared in ${t}s, ${deaths} deaths, ${glitches} glitches survived${bugFound ? ' · BUG FOUND 🐛' : ''}. Can you beat it?`;
  $('stats').textContent = `Points: ${pts}`;
  $('end').style.display = 'flex';
}

// ---------- Update ----------
function update(dt) {
  updParts(dt);
  if (game !== 'runner') { if (st === 'play') { if (game === 'heist') updHeist(dt); else updCafe(dt); } return; }
  if (st === 'dead') {
    deadT += dt;
    if (deadT > 1.2) { if (lives > 0) resetRun(); else gameOver(); }
    return;
  }
  if (st !== 'play') return;

  runT += dt; frame++;
  immune = Math.max(0, immune - dt);
  if (recov > 0) recov -= dt;

  // Glitch timers
  for (const k of ['grav', 'inv', 'col']) {
    if (PW[k] > 0) { PW[k] -= dt; if (PW[k] <= 0) activate(k); }
    if (T[k] > 0) { T[k] -= dt; if (T[k] <= 0) endGlitch(k); }
  }

  // Moving platform + carry
  MP.dx = MP.dir * 60 * dt;
  MP.x += MP.dx;
  if (MP.x < 1260) { MP.x = 1260; MP.dir = 1; }
  if (MP.x > 1330) { MP.x = 1330; MP.dir = -1; }
  if (groundSolid === MP) p.x += MP.dx;

  // Input (inverted controls swap direction)
  const inv = T.inv > 0;
  let dir = (inR ? 1 : 0) - (inL ? 1 : 0);
  if (inv) dir = -dir;
  const mobileBoost = window.matchMedia('(pointer: coarse)').matches ? 1.12 : 1;
  p.vx = dir * SPEED * LVL_SPD[lvl - 1] * mobileBoost * (recov > 0 ? 0.5 : 1);

  if (jumpQ) {
    jumpQ = false;
    if (p.g) {
      const mult = char === 'over' ? 1.2 : 1;
      const screenBoost = window.innerWidth < 700 ? 1.06 : 1;
      p.vy = -JUMP * mult * screenBoost * gdir;
      p.g = false;
      sfx('jump');
      if (inv) achieve('blind');
    }
  }

  // Physics
  const S = solids();
  p.vy += G * gdir * dt;
  p.x += p.vx * dt;
  for (const s of S) if (hit(p, s)) {
    if (p.vx > 0) p.x = s.x - p.w; else if (p.vx < 0) p.x = s.x + s.w;
  }
  p.y += p.vy * dt;
  p.g = false; groundSolid = null;
  for (const s of S) if (hit(p, s)) {
    if (p.vy > 0) { p.y = s.y - p.h; if (gdir > 0) { p.g = true; groundSolid = s; } }
    else if (p.vy < 0) { p.y = s.y + s.h; if (gdir < 0) { p.g = true; groundSolid = s; } }
    p.vy = 0;
  }

  // Glitch tiles
  for (const t of TILES) {
    const o = hit(p, t);
    if (o && !t.on) { t.on = true; trigger(t.t === 'G' ? 'grav' : t.t === 'I' ? 'inv' : 'col'); }
    else if (!o) t.on = false;
  }

  // Spikes (Pixel Ghost can phase through one per life)
  for (const s of SP) {
    if (!hit(p, s) || immune > 0) continue;
    if (char === 'ghost' && ghostCh > 0) {
      ghostCh--; immune = 0.5;
      toast('Phased through a spike 👻', 1000);
      continue;
    }
    return die();
  }

  // Falls off screen
  if (p.y > 480 || p.y < -80) return die('Lost in the void 🌀');

  if (!bugFound && hit(p, BUG)) { bugFound = true; toast('BUG FOUND 🐛', 2000); sfx('bug'); }
  if (hit(p, EXIT)) return clearLevel();

  rec.push({ x: p.x, y: p.y });
  maxX = Math.max(maxX, p.x);
  camX = Math.max(0, Math.min(WORLD_W - LW, p.x + p.w / 2 - LW / 2));
}

// ---------- Draw ----------
function drawSolid(s, col) {
  const top = s.y < LH / 2, wood = col === '#c4ff4f';
  ctx.fillStyle = '#1a0f08';
  ctx.fillRect(s.x - 2, s.y - 2, s.w + 4, s.h + 4);
  ctx.fillStyle = wood ? '#ff4fd8' : '#2a1458';
  ctx.fillRect(s.x, s.y, s.w, s.h);
  ctx.fillStyle = wood ? '#ff4fd8' : '#c4ff4f';
  ctx.fillRect(s.x, top ? s.y : s.y + s.h - 7, s.w, 7);
  ctx.fillStyle = '#2f8f3a';
  for (let x = s.x + 3; x < s.x + s.w; x += 9) ctx.fillRect(x, top ? s.y - 3 : s.y + s.h - 1, 3, 4);
  ctx.fillStyle = wood ? '#d9a35e' : '#a06e3a';
  for (let x = s.x + 4; x < s.x + s.w; x += 14) ctx.fillRect(x, top ? s.y + 10 : s.y + s.h - 14, 4, 3);
}
function drawSolidOld(s, col) {
  const top = s.y < LH / 2;
  const wood = col === '#c4ff4f';
  const g = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
  g.addColorStop(0, wood ? '#9a6a35' : '#5a3a1f');
  g.addColorStop(1, wood ? '#5e3d1c' : '#2e1d0e');
  ctx.fillStyle = g;
  ctx.fillRect(s.x, s.y, s.w, s.h);
  ctx.fillStyle = wood ? '#c08a4a' : '#2f7a3a';
  ctx.fillRect(s.x, top ? s.y : s.y + s.h - 5, s.w, 5);
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  for (let x = s.x + 6; x < s.x + s.w; x += 17) {
    ctx.fillRect(x, top ? s.y + 7 : s.y + s.h - 12, 2, 4);
  }
}
function hillLayer(off, base, amp, col) {
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, LH);
  for (let x = 0; x <= LW; x += 10) {
    const wx = x + off;
    ctx.lineTo(x, base - Math.sin(wx * 0.011) * amp - Math.sin(wx * 0.027 + 2) * amp * 0.4);
  }
  ctx.lineTo(LW, LH); ctx.fill();
}
function drawBG(now) {
  const g = ctx.createLinearGradient(0, 0, 0, LH);
  g.addColorStop(0, '#07040f'); g.addColorStop(0.55, '#2a0f45'); g.addColorStop(1, '#0d2a25');
  ctx.fillStyle = g; ctx.fillRect(0, 0, LW, LH);
  ctx.fillStyle = 'rgba(255,79,216,.22)';
  for (let i = 0; i < 5; i++) {
    const cx = ((i * 220 - camX * 0.1) % 1000 + 1000) % 1000 - 100, cy = 50 + (i % 3) * 30;
    ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2); ctx.arc(cx + 24, cy - 8, 28, 0, Math.PI * 2); ctx.arc(cx + 52, cy, 22, 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i < 4; i++) {
    const bx = ((i * 230 - camX * 0.15 + now * 0.004 * (i % 2 ? 1 : -1)) % 900 + 900) % 900 - 50;
    ctx.fillStyle = 'rgba(255,250,200,.07)';
    ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx + 60, 0); ctx.lineTo(bx + 180, LH); ctx.lineTo(bx + 80, LH); ctx.fill();
  }
  hillLayer(camX * 0.2, 260, 40, '#2a1058');
  hillLayer(camX * 0.5, 320, 30, '#150a33');
  for (let i = 0; i < 6; i++) {
    const tx = ((i * 170 - camX * 0.35) % 1000 + 1000) % 1000 - 100;
    ctx.fillStyle = 'rgba(20,6,40,.85)';
    ctx.fillRect(tx, 0, 18 + (i % 2) * 12, LH);
  }
  const fog = ctx.createLinearGradient(0, 180, 0, 360);
  fog.addColorStop(0, 'rgba(180,230,200,0)'); fog.addColorStop(1, 'rgba(180,230,200,.25)');
  ctx.fillStyle = fog; ctx.fillRect(0, 180, LW, 180);
  for (let i = 0; i < 26; i++) {
    const x = ((i * 97 - camX * 0.4) % 900 + 900) % 900 - 50;
    ctx.fillStyle = i % 3 ? '#1b0b3a' : '#2c1258';
    ctx.beginPath(); ctx.ellipse(x, 0, 60 + (i % 4) * 8, 28 + (i % 3) * 6, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,220,.6)';
  for (let i = 0; i < 30; i++) {
    const x = ((i * 73 - camX * 0.3) % 900 + 900) % 900;
    const y = (i * 41 + now * 0.02) % LH;
    ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
  }
}
function drawRunner() {
  const col = CHARS[char].col, flip = gdir < 0;
  const a = Math.sin(frame * 0.5) * (p.g ? 1 : 0.3);
  const skin = char === 'ghost' ? '#e8fff0' : '#f2b07b';
  const skinDark = '#c4824f', OUT = '#1a0f08';
  const seg = (x1, y1, x2, y2, w, c) => {
    ctx.lineCap = 'round';
    ctx.strokeStyle = OUT; ctx.lineWidth = w + 2.4;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = c; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  };
  ctx.save();
  ctx.globalAlpha = char === 'ghost' ? 0.7 : 1;
  ctx.translate(p.x + p.w / 2, p.y + p.h / 2 + 1);
  if (flip) ctx.scale(1, -1);
  if (p.vx < 0) ctx.scale(-1, 1);
  ctx.scale(1.35, 1.35);
  seg(-2.5, 4, -3 - a * 3, 10, 3.6, skinDark);
  seg(-3 - a * 3, 10, -3 - a * 5, 17, 3, skinDark);
  seg(-4, -5, -8 - a * 3, 0, 3, skinDark);
  seg(-8 - a * 3, 0, -9 - a * 5, 5, 2.6, skinDark);
  // torso with outline
  ctx.fillStyle = OUT; ctx.beginPath(); ctx.roundRect(-7, -7, 14, 11, 4); ctx.fill();
  ctx.fillStyle = skin; ctx.beginPath(); ctx.roundRect(-5.5, -5.5, 11, 8.5, 3); ctx.fill();
  ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(-5.5, -5.5, 11, 5.5, 2); ctx.fill();
  // leaf skirt
  ctx.fillStyle = '#4caf50';
  ctx.beginPath(); ctx.moveTo(-6, 3); ctx.lineTo(6, 3); ctx.lineTo(5, 8); ctx.lineTo(2, 6); ctx.lineTo(0, 9); ctx.lineTo(-2, 6); ctx.lineTo(-5, 8); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.stroke();
  // big round head
  ctx.fillStyle = OUT; ctx.beginPath(); ctx.arc(0, -13, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0, -13, 4.9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, -14.5, 5, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#3b2412'; ctx.beginPath(); ctx.arc(-3.5, -14, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = OUT; ctx.fillRect(1, -12.5, 1.6, 2); ctx.fillRect(3.5, -12.5, 1.6, 2);
  // front limbs
  seg(2.5, 4, 3 + a * 3, 10, 3.6, skin);
  seg(3 + a * 3, 10, 3 + a * 5, 17, 3, skin);
  seg(4, -5, 8 + a * 3, 0, 3, skin);
  seg(8 + a * 3, 0, 9 + a * 5, 5, 2.6, skin);
  ctx.restore();
}
function drawRunnerOld() {
  const col = CHARS[char].col, flip = gdir < 0;
  const a = Math.sin(frame * 0.5) * (p.g ? 1 : 0.3);
  const skin = char === 'ghost' ? '#d8f5e0' : '#c98a5a';
  const skinDark = char === 'ghost' ? '#b5d9c0' : '#a86f45';
  const limb = (x1, y1, x2, y2, w, c) => {
    ctx.strokeStyle = c; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  };
  ctx.save();
  ctx.globalAlpha = char === 'ghost' ? 0.7 : 1;
  ctx.translate(p.x + p.w / 2, p.y + p.h / 2 + 1);
  if (flip) ctx.scale(1, -1);
  if (p.vx < 0) ctx.scale(-1, 1);
  ctx.scale(1.25, 1.25);
  ctx.lineCap = 'round';
  // back limbs
  limb(-2.5, 4, -3 - a * 3, 10, 3.4, skinDark);
  limb(-3 - a * 3, 10, -3 - a * 5, 17, 2.8, skinDark);
  limb(-4, -5, -8 - a * 3, 0, 2.8, skinDark);
  limb(-8 - a * 3, 0, -9 - a * 5, 5, 2.4, skinDark);
  // torso with shading
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(6, -6); ctx.lineTo(4.5, 3); ctx.lineTo(-4.5, 3); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.beginPath(); ctx.moveTo(2, -6); ctx.lineTo(6, -6); ctx.lineTo(4.5, 3); ctx.lineTo(2, 3); ctx.closePath(); ctx.fill();
  // loincloth with frayed edge
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(-5, 3); ctx.lineTo(5, 3); ctx.lineTo(4, 8); ctx.lineTo(1, 6); ctx.lineTo(-1, 8.5); ctx.lineTo(-4, 6); ctx.closePath(); ctx.fill();
  // head and hair
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(0, -11, 4.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2b1a0e';
  ctx.beginPath(); ctx.arc(0, -11.5, 4.4, Math.PI, 0); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-4, -12); ctx.lineTo(-7, -9); ctx.lineTo(-3, -9); ctx.fill();
  // front limbs
  limb(2.5, 4, 3 + a * 3, 10, 3.4, skin);
  limb(3 + a * 3, 10, 3 + a * 5, 17, 2.8, skin);
  limb(4, -5, 8 + a * 3, 0, 2.8, skin);
  limb(8 + a * 3, 0, 9 + a * 5, 5, 2.4, skin);
  ctx.restore();
}
function drawDecor() {
  FLOORS.forEach(([x, y, w]) => {
    for (let i = 10; i < w; i += 45) {
      const fx = x + i;
      ctx.strokeStyle = '#2f8a4f'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(fx, y); ctx.lineTo(fx, y - 10); ctx.stroke();
      ctx.fillStyle = i % 90 ? '#ff7bb0' : '#ff9ecf';
      ctx.beginPath(); ctx.arc(fx, y - 12, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2f8a4f';
      ctx.beginPath(); ctx.moveTo(fx + 6, y); ctx.lineTo(fx + 14, y - 8); ctx.lineTo(fx + 10, y); ctx.fill();
    }
  });
}
function draw(now) {
  if (game !== 'runner') { drawGame(now); return; }
  ctx.save();
  drawBG(now);
  if (shake > 0) {
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    shake *= 0.88; if (shake < 0.3) shake = 0;
  }
  ctx.translate(-camX, 0);

  for (const s of SOLIDS) drawSolid(s, '#6ee7ff');
  drawDecor();
  drawSolid(MP, '#c4ff4f');

  // Glitch tiles
  for (const t of TILES) {
    const c = TILE_COL[t.t];
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(now / 200 + t.x);
    ctx.shadowColor = c; ctx.shadowBlur = 12;
    ctx.fillStyle = c + '55'; ctx.fillRect(t.x, t.y, t.w, t.h);
    ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.strokeRect(t.x, t.y, t.w, t.h);
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(t.t, t.x + t.w / 2, t.y + t.h / 2 + 5);
  }

  // Exit
  ctx.fillStyle = 'rgba(196,255,79,.2)'; ctx.fillRect(EXIT.x, 0, EXIT.w, LH);
  ctx.strokeStyle = '#c4ff4f'; ctx.lineWidth = 2; ctx.strokeRect(EXIT.x, 0, EXIT.w, LH);

  // Gate
  if (T.grav > 0 && T.inv > 0) {
    ctx.fillStyle = 'rgba(255,79,216,.15)'; ctx.fillRect(GATE.x, GATE.y, GATE.w, GATE.h);
  } else {
    ctx.fillStyle = '#ff4fd8'; ctx.shadowColor = '#ff4fd8'; ctx.shadowBlur = 14;
    ctx.fillRect(GATE.x, GATE.y, GATE.w, GATE.h); ctx.shadowBlur = 0;
  }

  // Bug collectible
  if (!bugFound) { ctx.font = '16px system-ui'; ctx.textAlign = 'left'; ctx.fillText('🐛', BUG.x - 2, BUG.y + 14); }

  // Ghost of best run
  if (bestRec.length && st === 'play') {
    const r = bestRec[Math.min(frame, bestRec.length - 1)];
    ctx.globalAlpha = 0.25; ctx.fillStyle = '#6ee7ff';
    ctx.fillRect(r.x, r.y, p.w, p.h); ctx.globalAlpha = 1;
  }

  // Color glitch: invert what's behind
  if (T.col > 0) {
    ctx.globalCompositeOperation = 'difference';
    ctx.fillStyle = '#fff';
    ctx.fillRect(camX - 20, -20, LW + 40, LH + 40);
    ctx.globalCompositeOperation = 'source-over';
  }

  // Hazards: thorn hills (readable red thorn tips)
  for (const s of SP) {
    ctx.fillStyle = '#2f6b3a';
    ctx.beginPath();
    if (s.up) { ctx.moveTo(s.x, s.y + s.h); ctx.quadraticCurveTo(s.x + s.w / 2, s.y - s.h, s.x + s.w, s.y + s.h); }
    else { ctx.moveTo(s.x, s.y); ctx.quadraticCurveTo(s.x + s.w / 2, s.y + s.h * 2, s.x + s.w, s.y); }
    ctx.fill();
    ctx.fillStyle = '#ff3b6b';
    ctx.beginPath(); ctx.arc(s.x + s.w / 2, s.up ? s.y : s.y + s.h, 3, 0, Math.PI * 2); ctx.fill();
  }

  // Player
  if (st === 'play') drawRunner();

  for (const q of parts) {
    ctx.globalAlpha = Math.max(0, q.life);
    ctx.fillStyle = q.c; ctx.fillRect(q.x, q.y, 4, 4);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Screen-space warning flicker
  if (PW.grav > 0 || PW.inv > 0 || PW.col > 0) {
    ctx.fillStyle = `rgba(255,79,216,${0.12 + 0.12 * Math.sin(now / 40)})`;
    ctx.fillRect(0, 0, LW, LH);
  }
}

// ---------- HUD ----------
function updateHud() {
  $('hPts').textContent = '⭐ ' + livePts() + '  Lv' + lvl;
  $('hTime').textContent = '⏱ ' + (st === 'play' || st === 'dead' ? runT : 0).toFixed(1) + 's';
  $('hDeaths').textContent = '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, 3 - lives));
  $('hGl').textContent = Object.keys(T).filter(k => T[k] > 0).map(k => `${LABEL[k]} ${T[k].toFixed(1)}`).join(' · ');
}

// ---------- Input ----------
const KL = ['ArrowLeft', 'KeyA'], KR = ['ArrowRight', 'KeyD'], KJ = ['ArrowUp', 'KeyW', 'Space'];
function jumpPress() {
  if (st === 'dead' && deadT > 0.3) { resetRun(); return; }
  if (st === 'play') jumpQ = true;
}
addEventListener('keydown', e => {
  const c = e.code;
  if (KL.includes(c)) inL = true;
  if (KR.includes(c)) inR = true;
  if (KJ.includes(c)) { e.preventDefault(); if (!e.repeat) jumpPress(); }
  if (c === 'ArrowUp' || c === 'KeyW') inU = true;
  if (c === 'ArrowDown' || c === 'KeyS') inD = true;
  if (c === 'KeyR' && st === 'play') resetRun();
  if (c === 'Enter' && st === 'menu') startRun();
  if (c === 'Escape' && st === 'play') pauseGame();
});
addEventListener('keyup', e => {
  if (KL.includes(e.code)) inL = false;
  if (KR.includes(e.code)) inR = false;
  if (e.code === 'ArrowUp' || e.code === 'KeyW') inU = false;
  if (e.code === 'ArrowDown' || e.code === 'KeyS') inD = false;
});
$('wrap').addEventListener('pointerdown', e => {
  if (e.target.closest('button')) return;
  if (game === 'cafe') { cafeTap(e); return; }
  if (game !== 'runner') return;
  jumpPress();
});
function holdBtn(id, onDown, onUp) {
  const el = $(id);
  el.addEventListener('pointerdown', e => { e.preventDefault(); onDown(); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => el.addEventListener(ev, onUp));
}
holdBtn('bL', () => inL = true, () => inL = false);
holdBtn('bR', () => inR = true, () => inR = false);
$('bJ').addEventListener('pointerdown', e => { e.preventDefault(); jumpPress(); });

$('play').onclick = () => showStage('level');
$('retry').onclick = startRun;
$('overMenu').onclick = () => showStage('landing');
$('again').onclick = startRun;
$('menuBtn').onclick = () => showStage('landing');
$('share').onclick = async () => {
  try {
    if (navigator.share) { await navigator.share({ text: lastStats }); return; }
    await navigator.clipboard.writeText(lastStats);
    $('share').textContent = 'Copied ✅';
    setTimeout(() => $('share').textContent = 'Share 📤', 1500);
  } catch (e) {}
};

// ---------- Loop ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min(1 / 30, (now - last) / 1000);
  last = now;
  try {
    update(dt);
    draw(now);
    updateHud();
  } catch (e) { showErr(e.message + ' (line ' + (e.lineNumber || '?') + ')'); }
  requestAnimationFrame(loop);
}

renderCards();
renderLogin();
renderAch();
resetRun();
$('gA').onclick = () => { game = 'runner'; setGameMusic('runner'); showStage('char'); };
$('gB').onclick = () => { game = 'heist'; setGameMusic('heist'); showStage('char'); };
$('gC').onclick = () => { game = 'cafe'; setGameMusic('cafe'); showStage('char'); };
const grp = document.createElement('span');
grp.style.cssText = 'display:flex;gap:8px;align-items:center;pointer-events:auto';
$('hud').appendChild(grp);
grp.appendChild($('hDeaths'));
grp.appendChild($('mute'));
const hpts = document.createElement('span');
hpts.id = 'hPts';
$('hud').insertBefore(hpts, $('hGl'));
$('exitBtn').onclick = () => showStage('exit');
$('share').style.display = 'none';
const xb = document.createElement('button');
xb.className = 'ghost'; xb.textContent = '✕ Exit';
xb.style.cssText = 'padding:3px 10px;font-size:13px;pointer-events:auto';
xb.onclick = pauseGame;
grp.insertBefore(xb, $('mute'));
renderMute();
buildFx();
st = 'menu';
showStage('landing');
requestAnimationFrame(loop);

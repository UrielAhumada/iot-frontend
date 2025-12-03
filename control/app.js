// ====== CONFIG ======

// Detecta si estamos en GitHub Pages o en entorno local
const IS_GITHUB = window.location.hostname.includes("github.io");

// Backend base
const API_BASE = IS_GITHUB
  ? "https://macroclimatic-earline-pseudoarchaically.ngrok-free.dev"   // ngrok público
  : "http://localhost:5500";                                           // local dev

// WebSocket base (wss si estamos en HTTPS, ws si en local)
const WS_URL = IS_GITHUB
  ? "wss://macroclimatic-earline-pseudoarchaically.ngrok-free.dev/ws"
  : "ws://localhost:5500/ws";

const BACKEND_HTTP = API_BASE; // alias por si lo necesitas en el futuro

// ====== UTIL ======
const estado      = document.getElementById('estado');
const logEl       = document.getElementById('log');        // puede no existir en la versión actual
const kpiLast     = document.getElementById('kpi-last');
const wsState     = document.getElementById('wsState');
const speedSlider = document.getElementById('speed');      // slider de velocidad

const yearSpan = document.getElementById('year');
if (yearSpan) {
  yearSpan.textContent = new Date().getFullYear();
}

// Devuelve la velocidad actual del slider (0–100)
function getVelocidad() {
  if (!speedSlider) return 0;
  const v = parseInt(speedSlider.value, 10);
  return Number.isNaN(v) ? 0 : v;
}

function wsIndicator(ok){
  if (!wsState) return;
  wsState.innerHTML = ok
    ? `<span class="status-dot status-ok"></span>WS Conectado`
    : `<span class="status-dot status-bad"></span>WS Reconectando…`;
}

function toast(msg, type='primary'){
  const toasts = document.getElementById('toasts');
  if (!toasts) return;
  const el = document.createElement('div');
  el.className = `toast align-items-center text-bg-${type} border-0 fade-in`;
  el.innerHTML = `<div class="d-flex"><div class="toast-body">${msg}</div>
    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
  toasts.appendChild(el);
  new bootstrap.Toast(el, { delay: 2200 }).show();
}

function log(line){
  if (!logEl) return;
  const li = document.createElement('li');
  li.className = 'list-group-item fade-in bg-dark text-light';
  li.textContent = `[${new Date().toLocaleTimeString()}] ${line}`;
  logEl.prepend(li);
}

// ====== WS ======
let ws;
(function connectWS(){
  try {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      wsIndicator(true);
      log('WS conectado');
      // handshake opcional por si el backend lo usa
      try {
        ws.send(JSON.stringify({ type: "hello", from: "control" }));
      } catch {}
    };

    ws.onmessage = (ev) => {
      try{
        const m = JSON.parse(ev.data);

        if (m.type === 'hello') return;

        if (m.type === 'command') {
          if (estado) estado.textContent = 'COMANDO ' + m.data.status_clave + ' enviado';
          if (kpiLast) kpiLast.textContent = `#${m.data.status_clave}`;
          log(`command → status=${m.data.status_clave}`);
        }

        if (m.type === 'device-ack') {
          // Solo mostramos el mensaje de éxito
          toast('ACK del dispositivo','success');
        }

        // Obstáculos se ignoran visualmente en el panel de control
        if (m.type === 'obstacle') {
          log(`obstacle (ignorado en control) → ${m.data.obstaculo_clave}`);
        }

        if (m.type === 'demo') {
          toast(`DEMO insertada x${m.data.n}`, 'secondary');
        }
      }catch(e){
        console.error('Error procesando mensaje WS:', e);
      }
    };

    ws.onclose = () => {
      wsIndicator(false);
      setTimeout(connectWS, 1200);
    };
  } catch (e) {
    console.error('Error creando WS:', e);
    wsIndicator(false);
  }
})();

// ====== REST ======
async function postJSON(url, body){
  const r = await fetch(url, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(body || {})
  });
  if (!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}

// Enviar movimiento con velocidad
async function enviarMovimiento(status_clave, velocidad){
  if (estado) estado.textContent = 'ENVIANDO...';
  const res = await postJSON(`${API_BASE}/api/movimiento`, {
    status_clave,
    velocidad,          // se manda al backend
    dispositivo_id: 1,
    cliente_id: 1
  });
  log(`REST movimiento OK → evento_id=${res.evento_id} vel=${velocidad}`);
  return res;
}

// DEMO
async function lanzarDemo(n){
  if (estado) estado.textContent = `DEMO x${n}...`;
  const r = await fetch(`${API_BASE}/api/demo?n=${n}`, { method:'POST' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  toast(`DEMO x${j.insertados} iniciada`, 'info');
  log(`REST demo OK → insertados=${j.insertados}`);
}

// ====== Eventos UI ======
document.querySelectorAll('[data-op]').forEach(b=>{
  b.addEventListener('click', async ()=>{
    try {
      const op  = parseInt(b.dataset.op, 10);
      const vel = getVelocidad();
      await enviarMovimiento(op, vel);
      // No mostramos toast aquí: la confirmación visual es el ACK del WS
    } catch(e){
      console.error('ERROR movimiento:', e);
      log('ERROR movimiento: '+e.message);
      if (estado) estado.textContent='ERROR al enviar movimiento';
      // IMPORTANTE: ya NO mostramos el toast rojo
      // toast('Error enviando movimiento','danger');
    }
  });
});

// Demos
document.querySelectorAll('[data-demo]').forEach(b=>{
  b.addEventListener('click', async ()=>{
    try {
      await lanzarDemo(parseInt(b.dataset.demo,10));
    } catch(e){
      console.error('ERROR demo:', e);
      toast('Error en DEMO','danger');
      log('ERROR demo: '+e.message);
      if (estado) estado.textContent='ERROR en DEMO';
    }
  });
});
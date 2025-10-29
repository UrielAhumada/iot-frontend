// ====== CONFIG ======
const BACKEND_HTTP = 'http://54.198.237.205:5500';
const WS_URL_HTTP  = 'ws://54.198.237.205:5500/ws';
const WS_URL_HTTPS = 'wss://54.198.237.205/ws'; // sólo servirá si luego configuras HTTPS
const WS_URL = (location.protocol === 'https:') ? WS_URL_HTTPS : WS_URL_HTTP;

// ====== UTIL ======
const estado = document.getElementById('estado');
const logEl  = document.getElementById('log');
const kpiLast= document.getElementById('kpi-last');
const kpiObs = document.getElementById('kpi-obs');
const wsState= document.getElementById('wsState');
document.getElementById('year').textContent = new Date().getFullYear();

function wsIndicator(ok){
  wsState.innerHTML = ok
    ? `<span class="status-dot status-ok"></span>WS Conectado`
    : `<span class="status-dot status-bad"></span>WS Reconectando…`;
}
function toast(msg, type='primary'){
  const el = document.createElement('div');
  el.className = `toast align-items-center text-bg-${type} border-0 fade-in`;
  el.innerHTML = `<div class="d-flex"><div class="toast-body">${msg}</div>
    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
  document.getElementById('toasts').appendChild(el);
  new bootstrap.Toast(el, { delay: 2200 }).show();
}
function log(line){
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
    ws.onopen = () => { wsIndicator(true); log('WS conectado'); };
    ws.onmessage = (ev) => {
      try{
        const m = JSON.parse(ev.data);
        if (m.type === 'hello') return;
        if (m.type === 'command') {
          estado.textContent = 'COMANDO ' + m.data.status_clave + ' enviado';
          kpiLast.textContent = `#${m.data.status_clave}`;
          log(`command → status=${m.data.status_clave}`);
        }
        if (m.type === 'device-ack') {
          toast('ACK del dispositivo (simulado)','success');
        }
        if (m.type === 'obstacle') {
          estado.textContent = 'OBSTÁCULO ' + m.data.obstaculo_clave;
          kpiObs.textContent = `#${m.data.obstaculo_clave}`;
          log(`obstacle → ${m.data.obstaculo_clave}`);
        }
        if (m.type === 'demo') {
          toast(`DEMO insertada x${m.data.n}`, 'secondary');
        }
      }catch{}
    };
    ws.onclose = () => { wsIndicator(false); setTimeout(connectWS, 1200); };
  } catch (e) {
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

async function enviarMovimiento(status_clave){
  estado.textContent = 'ENVIANDO...';
  const res = await postJSON(`${BACKEND_HTTP}/api/movimiento`, {
    status_clave, dispositivo_id:1, cliente_id:1
  });
  log(`REST movimiento OK → evento_id=${res.evento_id}`);
}

async function enviarObstaculo(obstaculo_clave){
  estado.textContent = 'REPORTANDO OBSTÁCULO...';
  const res = await postJSON(`${BACKEND_HTTP}/api/obstaculo`, {
    obstaculo_clave, dispositivo_id:1, cliente_id:1
  });
  log(`REST obstáculo OK → evento_id=${res.evento_id}`);
}

async function lanzarDemo(n){
  estado.textContent = `DEMO x${n}...`;
  const r = await fetch(`${BACKEND_HTTP}/api/demo?n=${n}`, { method:'POST' });
  const j = await r.json();
  toast(`DEMO x${j.insertados} iniciada`, 'info');
  log(`REST demo OK → insertados=${j.insertados}`);
}

// ====== Eventos UI ======
document.querySelectorAll('[data-op]').forEach(b=>{
  b.addEventListener('click', async ()=>{
    try { await enviarMovimiento(parseInt(b.dataset.op,10)); }
    catch(e){ toast('Error enviando movimiento','danger'); log('ERROR movimiento: '+e.message); estado.textContent='ERROR'; }
  });
});
document.querySelectorAll('[data-ob]').forEach(b=>{
  b.addEventListener('click', async ()=>{
    try { await enviarObstaculo(parseInt(b.dataset.ob,10)); }
    catch(e){ toast('Error reportando obstáculo','danger'); log('ERROR obstáculo: '+e.message); estado.textContent='ERROR'; }
  });
});
document.querySelectorAll('[data-demo]').forEach(b=>{
  b.addEventListener('click', async ()=>{
    try { await lanzarDemo(parseInt(b.dataset.demo,10)); }
    catch(e){ toast('Error en DEMO','danger'); log('ERROR demo: '+e.message); estado.textContent='ERROR'; }
  });
});
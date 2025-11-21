// ====== CONFIG (GitHub / Local) ======

const IS_GITHUB = window.location.hostname.includes("github.io");

const API_BASE = IS_GITHUB
  ? "https://macroclimatic-earline-pseudoarchaically.ngrok-free.dev"
  : "http://localhost:5500";

const WS_URL = IS_GITHUB
  ? "wss://macroclimatic-earline-pseudoarchaically.ngrok-free.dev/ws"
  : "ws://localhost:5500/ws";

const BACKEND_HTTP = API_BASE; // alias

// ====== UTIL ======
document.getElementById("year").textContent = new Date().getFullYear();
const wsState = document.getElementById("wsState");

function wsIndicator(ok) {
  if (!wsState) return;
  wsState.innerHTML = ok
    ? `<span class="status-dot status-ok"></span>WS Conectado`
    : `<span class="status-dot status-bad"></span>WS Reconectando…`;
}

function toast(msg, type = "primary") {
  const el = document.createElement("div");
  el.className = `toast align-items-center text-bg-${type} border-0`;
  el.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${msg}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>`;
  document.getElementById("toasts").appendChild(el);
  new bootstrap.Toast(el, { delay: 2200 }).show();
}

async function apiGet(path) {
  const r = await fetch(`${BACKEND_HTTP}${path}`, {
    headers: { "ngrok-skip-browser-warning": "1" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

// ====== Chart (Eventos por minuto) ======
const labels = Array.from({ length: 10 }, (_, i) => `${i - 9}m`);
let points = new Array(10).fill(0);

const chartColors = {
  line: "#38bdf8",
  fill: "rgba(56,189,248,0.25)",
  grid: "#294269",
  tick: "#c7d2fe",
  legend: "#ffffff",
};

const chart = new Chart(document.getElementById("chart"), {
  type: "line",
  data: {
    labels,
    datasets: [
      {
        label: "Eventos",
        data: points,
        tension: 0.35,
        borderWidth: 2,
        borderColor: chartColors.line,
        backgroundColor: chartColors.fill,
        fill: true,
      },
    ],
  },
  options: {
    animation: false,
    plugins: {
      legend: { labels: { color: chartColors.legend } },
    },
    scales: {
      x: {
        ticks: { color: chartColors.tick },
        grid: { color: chartColors.grid },
      },
      y: {
        beginAtZero: true,
        ticks: { color: chartColors.tick, precision: 0 },
        grid: { color: chartColors.grid },
      },
    },
  },
});

// Ventana deslizante de 10 minutos
setInterval(() => {
  points.shift();
  points.push(0);
  chart.update("none");
}, 60000);

let total = 0;
const badgeTotal = document.getElementById("badgeTotal");
function bump() {
  points[points.length - 1]++;
  total++;
  if (badgeTotal) badgeTotal.textContent = `${total} eventos`;
  chart.update("none");
}

// ====== DOM ======
const tbLive = document.getElementById("tb-live");
const tbHist = document.getElementById("tb-hist");
const kMov   = document.getElementById("k-mov");
const kObs   = document.getElementById("k-obs");

function addLiveRow(tipo, detalle) {
  if (!tbLive) return;
  const tr = document.createElement("tr");
  tr.className = "fade-in";
  tr.innerHTML = `
    <td>${new Date().toLocaleTimeString()}</td>
    <td>${tipo}</td>
    <td><pre class="m-0 text-white-50">${detalle}</pre></td>`;
  tbLive.prepend(tr);
  bump();
}

// ====== Historial inicial y última marca ======
let lastMovKey = null;   // guardaremos algo que identifique el último movimiento

(async function loadHist() {
  try {
    const hist = await apiGet("/api/ultimos-mov?limit=10");
    if (!Array.isArray(hist)) return;

    hist.forEach((it, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${new Date(it.fecha_hora).toLocaleString()}</td>
        <td>${it.movimiento}</td>
        <td>${it.dispositivo}</td>`;
      tbHist.appendChild(tr);

      // El último del arreglo será el más reciente
      if (idx === 0) {
        kMov.textContent = it.movimiento;
        lastMovKey = `${it.fecha_hora}-${it.movimiento}-${it.dispositivo}`;
      }
    });
  } catch (e) {
    console.error(e);
    toast("No se pudo cargar historial", "danger");
  }
})();

// ====== POLLING: detectar nuevos movimientos por REST ======

async function pollLatestMovimiento() {
  try {
    const data = await apiGet("/api/ultimos-mov?limit=1");
    if (!Array.isArray(data) || data.length === 0) return;

    const it = data[0];
    const key = `${it.fecha_hora}-${it.movimiento}-${it.dispositivo}`;

    if (key !== lastMovKey) {
      // Hay un nuevo movimiento en BD
      lastMovKey = key;

      // Actualiza KPI
      kMov.textContent = it.movimiento;

      // Añade al stream en tiempo real
      addLiveRow("movimiento", JSON.stringify(it));

      // Opcional: también podrías actualizar la tabla de historial,
      // pero como ya tienes varios, lo dejamos así.
    }
  } catch (e) {
    console.error("Error en pollLatestMovimiento:", e.message);
  }
}

// cada 4 segundos checamos si hay movimiento nuevo
setInterval(pollLatestMovimiento, 4000);

// ====== (Opcional) POLLING PARA ÚLTIMO OBSTÁCULO ======
// Si tu backend tiene un endpoint similar, por ejemplo
// /api/ultimos-obstaculos?limit=1, puedes descomentar y ajustar:

async function pollLatestObstaculo() {
  try {
    const data = await apiGet("/api/ultimos-obstaculos?limit=1");
    if (!Array.isArray(data) || data.length === 0) return;
    const it = data[0];
    kObs.textContent = it.obstaculo_texto || `#${it.obstaculo_clave}`;
    addLiveRow("obstaculo", JSON.stringify(it));
  } catch (e) {
    console.error("Error en pollLatestObstaculo:", e.message);
  }
}
setInterval(pollLatestObstaculo, 5000);

// ====== WebSocket (si tu backend sí envía algo, también lo veremos) ======
let ws;

function safeParseJSON(text) {
  try { return JSON.parse(text); } catch { return null; }
}

(function connectWS() {
  try {
    ws = new WebSocket(WS_URL);
  } catch (e) {
    console.error("Error creando WS:", e);
    wsIndicator(false);
    return;
  }

  ws.onopen = () => {
  wsIndicator(true);

  // handshake obligatorio para registrarse en ws_hub
  try {
    ws.send(JSON.stringify({
      type: "hello",
      from: "monitor"
    }));
  } catch (e) {
    console.warn("Error enviando handshake WS:", e);
  }
};

  ws.onmessage = (ev) => {
    const raw = ev.data;
    const m = safeParseJSON(raw);

    // Si no se puede parsear, lo mostramos crudo
    if (!m) {
      addLiveRow("raw", raw);
      return;
    }

    const tipo = m.type || "msg";
    const detalle = JSON.stringify(m.data ?? m);
    addLiveRow(tipo, detalle);

    if (m.type === "command" && m.data && m.data.status_clave != null) {
      kMov.textContent = `#${m.data.status_clave}`;
    }

    if (m.type === "obstacle" && m.data && m.data.obstaculo_clave != null) {
      kObs.textContent = `#${m.data.obstaculo_clave}`;
    }
  };

  ws.onclose = () => {
    wsIndicator(false);
    setTimeout(connectWS, 1200);
  };
})();
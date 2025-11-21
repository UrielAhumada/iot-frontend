// ====== CONFIG (Automático: GitHub / Local) ======

const IS_GITHUB = window.location.hostname.includes("github.io");

// Base del backend (HTTP REST)
const API_BASE = IS_GITHUB
  ? "https://macroclimatic-earline-pseudoarchaically.ngrok-free.dev"  // ngrok activo
  : "http://localhost:5500";                                          // entorno local

// WebSocket base (wss para HTTPS, ws para local)
const WS_URL = IS_GITHUB
  ? "wss://macroclimatic-earline-pseudoarchaically.ngrok-free.dev/ws"
  : "ws://localhost:5500/ws";

// Alias opcional (mantiene compatibilidad con código existente)
const BACKEND_HTTP = API_BASE;

// ====== UTIL ======
const yearSpan = document.getElementById("year");
if (yearSpan) {
  yearSpan.textContent = new Date().getFullYear();
}

const wsState = document.getElementById("wsState");

function wsIndicator(ok) {
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

// ====== Chart ======
const labels = Array.from({ length: 10 }, (_, i) => `${i - 9}m`);
let points = new Array(10).fill(0);

const chartColors = {
  line: "#38bdf8",
  fill: "rgba(56,189,248,0.25)",
  grid: "#294269",
  tick: "#c7d2fe",
  legend: "#ffffff",
};

const chartCtx = document.getElementById("chart");
const chart = new Chart(chartCtx, {
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

// Cada minuto movemos la ventana de 10 puntos
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
  badgeTotal.textContent = `${total} eventos`;
  chart.update("none");
}

// ====== DOM ======
const tbLive = document.getElementById("tb-live");
const tbHist = document.getElementById("tb-hist");
const kMov = document.getElementById("k-mov");
const kObs = document.getElementById("k-obs");

function addLiveRow(tipo, detalle) {
  const tr = document.createElement("tr");
  tr.className = "fade-in";
  tr.innerHTML = `
    <td>${new Date().toLocaleTimeString()}</td>
    <td>${tipo}</td>
    <td><pre class="m-0 text-white-50">${detalle}</pre></td>`;
  tbLive.prepend(tr);
  bump();
}

// ====== Init: historial ======
(async function loadHistorial() {
  try {
    const hist = await apiGet("/api/ultimos-mov?limit=10");
    hist.forEach((it) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${new Date(it.fecha_hora).toLocaleString()}</td>
        <td>${it.movimiento}</td>
        <td>${it.dispositivo}</td>`;
      tbHist.appendChild(tr);
      kMov.textContent = it.movimiento;
    });
  } catch (e) {
    toast("No se pudo cargar historial", "danger");
  }
})();

// ====== WebSocket tiempo real ======
let ws;
(function connectWS() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => wsIndicator(true);

  ws.onmessage = (ev) => {
    try {
      const m = JSON.parse(ev.data);
      if (m.type === "hello") return;

      if (m.type === "command") {
        addLiveRow("command", JSON.stringify(m.data));
        kMov.textContent = `#${m.data.status_clave}`;
      }

      if (m.type === "obstacle") {
        addLiveRow("obstacle", JSON.stringify(m.data));
        kObs.textContent = `#${m.data.obstaculo_clave}`;
      }

      if (
        m.type === "device-ack" ||
        m.type === "device-ack-obstacle" ||
        m.type === "demo"
      ) {
        addLiveRow(m.type, JSON.stringify(m.data));
      }
    } catch {
      // Ignora mensajes mal formateados
    }
  };

  ws.onclose = () => {
    wsIndicator(false);
    setTimeout(connectWS, 1200);
  };
})();
// ============================================================
// ui.js — Interacción con el DOM
// Lee inputs, imprime en consola, habilita botones.
// Se comunica con motor.js solo a través de Bus y motorIniciar/motorDetener.
// ============================================================

// ─── FORMATO ─────────────────────────────────────────────────

function formatHora(seg) {
  if (seg === null || seg === undefined || seg === Infinity) return "  ───── ";
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = Math.floor(seg % 60);
  return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

function pad(texto, largo, relleno = " ") {
  return String(texto ?? "").padEnd(largo, relleno);
}

function padPuntos(texto, largo) {
  const str = String(texto ?? "");
  if (str.length >= largo - 1) return str.padEnd(largo, " ");
  return str + " " + ".".repeat(largo - str.length - 2) + " ";
}

// ─── CONSOLA ─────────────────────────────────────────────────

function logLinea(texto) {
  const box = document.getElementById("consoleBox");
  if (!box) return;
  const div = document.createElement("div");
  div.textContent = texto;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function limpiarConsola() {
  const box = document.getElementById("consoleBox");
  if (box) box.innerHTML = "";
}

// Anchos de columna — ajustar acá si se necesita más espacio
const COL = { evento: 26, hora: 12, llegada: 16, fin: 16, cola: 8, servidor: 10 };
const ANCHO_TOTAL = Object.values(COL).reduce((a, b) => a + b, 0);

function imprimirEncabezadoTabla() {
  logLinea(
    pad("Evento",        COL.evento)   +
    pad("Hora",          COL.hora)     +
    pad("Prox.Llegada",  COL.llegada)  +
    pad("Fin Servicio",  COL.fin)      +
    pad("Cola",          COL.cola)     +
    pad("Servidor",      COL.servidor)
  );
  logLinea("─".repeat(ANCHO_TOTAL));
}

function imprimirFila({ evento, hora, estado }) {
  logLinea(
    padPuntos(evento,                                      COL.evento)   +
    padPuntos(formatHora(hora),                            COL.hora)     +
    padPuntos(formatHora(estado.proximoEventoLlegada),     COL.llegada)  +
    padPuntos(formatHora(estado.proximoEventoFinServicio), COL.fin)      +
    padPuntos(estado.cola.length,                          COL.cola)     +
    pad(estado.servidor.estado,                            COL.servidor)
  );
}

function imprimirEstadisticas(estado) {
  const s = estado.stats;
  const promEspera = s.clientesAtendidos
    ? (s.tiempoEsperaTotal / s.clientesAtendidos).toFixed(1)
    : 0;

  logLinea("─".repeat(76));
  logLinea("  ESTADÍSTICAS FINALES");
  logLinea("─".repeat(76));
  logLinea(`  Clientes atendidos:   ${s.clientesAtendidos}`);
  logLinea(`  Clientes abandonaron: ${s.clientesAbandonaron}`);
  logLinea(`  Espera promedio:      ${promEspera}s`);
  logLinea("─".repeat(76));
}

// ─── BOTONES ─────────────────────────────────────────────────

function setBotones({ iniciando }) {
  document.getElementById("btnIniciar").disabled  =  iniciando;
  document.getElementById("btnDetener").disabled  = !iniciando;
}

// ─── LEER PARÁMETROS ─────────────────────────────────────────

function leerParametros() {
  const tLL       = parseFloat(document.getElementById("tiempoLlegada").value);
  const tS        = parseFloat(document.getElementById("tiempoServicio").value);
  const tiempoTotal = parseFloat(document.getElementById("tiempoSimulacion").value);

  if (isNaN(tLL) || isNaN(tS) || isNaN(tiempoTotal) || tLL <= 0 || tS <= 0) {
    logLinea("⚠️  Parámetros inválidos. Revisá los campos.");
    return null;
  }

  const modificadoresActivos = {};
  const paramsModificadores  = {};

  document.querySelectorAll(".modificador-check").forEach(cb => {
    const nombre = cb.dataset.mod;
    modificadoresActivos[nombre] = cb.checked;
    if (cb.checked) {
      const input = document.getElementById(`param_${nombre}`);
      paramsModificadores[nombre] = parseFloat(input?.value) || 0;
    }
  });

  const velocidad = parseInt(document.getElementById("velocidad")?.value) ?? 120;

  return { tLL, tS, tiempoTotal, modificadoresActivos, paramsModificadores, velocidad };
}

// ─── INICIAR / DETENER ───────────────────────────────────────
// Estas son las funciones que llama el HTML con onclick.

function iniciarSimulacion() {
  const params = leerParametros();
  if (!params) return;

  limpiarConsola();

  logLinea("═".repeat(76));
  logLinea("  SIMULACIÓN DE SISTEMA DE COLAS");
  logLinea(`  tLL=${params.tLL}s  |  tS=${params.tS}s  |  T=${params.tiempoTotal}s`);
  const activos = Object.entries(params.modificadoresActivos)
    .filter(([, v]) => v).map(([k]) => k);
  if (activos.length) logLinea(`  Modificadores: ${activos.join(", ")}`);
  logLinea("═".repeat(76));
  imprimirEncabezadoTabla();

  setBotones({ iniciando: true });
  motorIniciar(params);
}

function detenerSimulacion() {
  motorDetener();
}

// ─── ESCUCHAR EVENTOS DEL MOTOR ──────────────────────────────
// El motor emite, ui.js reacciona. Motor no sabe nada de esto.

// Se registran después de que motor.js ya cargó (DOMContentLoaded).
document.addEventListener("DOMContentLoaded", () => {

  Bus.on("fila", imprimirFila);

  Bus.on("fin", (estado) => {
    imprimirEstadisticas(estado);
    setBotones({ iniciando: false });
  });

  Bus.on("detenido", () => {
    logLinea("⛔ Simulación detenida manualmente.");
    setBotones({ iniciando: false });
  });

  // Toggle de modificadores: badge + animación de panel
  document.querySelectorAll(".modificador-check").forEach(cb => {
    cb.addEventListener("change", () => {
      const nombre = cb.dataset.mod;
      const input  = document.getElementById(`param_${nombre}`);
      const badge  = document.getElementById(`badge_${nombre}`);
      const row    = document.getElementById(`param-row_${nombre}`);

      input.disabled    = !cb.checked;
      badge.textContent = cb.checked ? "ON" : "OFF";
      badge.classList.toggle("on", cb.checked);
      row.classList.toggle("activo", cb.checked);
    });
  });

});
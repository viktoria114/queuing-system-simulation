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

// ─── OBJETO UI (para uso desde modificadores) ────────────────
const UI = {
  log:       (texto) => logLinea(texto),
  pad,
  padPuntos,
  formatHora,
};

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

// ─── DEFINICIONES DE COLUMNAS ────────────────────────────────

// Estándar (P1, P3, P5)
const COL = { evento: 26, hora: 12, llegada: 16, fin: 16, cola: 8, servidor: 10 };

// Problema 2 — descanso activo
const COL_P2 = { evento: 22, hora: 10, llegada: 12, fin: 12, salida: 12, regreso: 13, cola: 6, ps: 10, serv: 9 };

// Problema 4 — prioridades activo
const COL_P4 = { evento: 22, hora: 10, llegadaA: 14, llegadaB: 14, fin: 14, colaA: 8, colaB: 8, ps: 10 };

// ─── ENCABEZADO DE TABLA ─────────────────────────────────────

function imprimirEncabezadoTabla(modificadoresActivos = {}) {
  if (modificadoresActivos.descanso) {
    const C = COL_P2;
    const ancho = Object.values(C).reduce((a, b) => a + b, 0);
    logLinea(
      pad("Evento",        C.evento)  +
      pad("Hora",          C.hora)    +
      pad("Prox.Llegada",  C.llegada) +
      pad("Fin Servicio",  C.fin)     +
      pad("Sal.Servidor",  C.salida)  +
      pad("Reg.Servidor",  C.regreso) +
      pad("Cola",          C.cola)    +
      pad("P.S.",          C.ps)      +
      pad("Servidor",      C.serv)
    );
    logLinea("─".repeat(ancho));

  } else if (modificadoresActivos.prioridades) {
    const C = COL_P4;
    const ancho = Object.values(C).reduce((a, b) => a + b, 0);
    logLinea(
      pad("Evento",          C.evento)   +
      pad("Hora",            C.hora)     +
      pad("Prox.Llegada A",  C.llegadaA) +
      pad("Prox.Llegada B",  C.llegadaB) +
      pad("Fin Servicio",    C.fin)      +
      pad("Cola A",          C.colaA)    +
      pad("Cola B",          C.colaB)    +
      pad("Servidor",        C.ps)
    );
    logLinea("─".repeat(ancho));

  } else {
    const ancho = Object.values(COL).reduce((a, b) => a + b, 0);
    logLinea(
      pad("Evento",        COL.evento)   +
      pad("Hora",          COL.hora)     +
      pad("Prox.Llegada",  COL.llegada)  +
      pad("Fin Servicio",  COL.fin)      +
      pad("Cola",          COL.cola)     +
      pad("Servidor",      COL.servidor)
    );
    logLinea("─".repeat(ancho));
  }
}

// ─── FILA DE TABLA ───────────────────────────────────────────

function imprimirFila({ evento, hora, estado }) {
  const mods = estado.modificadoresActivos || {};

  if (mods.descanso) {
    const C   = COL_P2;
    // PS muestra LIBRE/OCUPADO (nunca AUSENTE — eso va en columna Servidor)
    const psLabel = (estado.servidor.estado === "AUSENTE") ? "LIBRE" : estado.servidor.estado;
    logLinea(
      padPuntos(evento,                                               C.evento)  +
      padPuntos(formatHora(hora),                                     C.hora)    +
      padPuntos(formatHora(estado.proximoEventoLlegada),              C.llegada) +
      padPuntos(formatHora(estado.proximoEventoFinServicio),          C.fin)     +
      padPuntos(formatHora(estado._eventosExtra?.servidor_salida),    C.salida)  +
      padPuntos(formatHora(estado._eventosExtra?.servidor_llegada),   C.regreso) +
      padPuntos(estado.cola.length,                                   C.cola)    +
      padPuntos(psLabel,                                              C.ps)      +
      pad(estado._servidorAusente ? "AUSENTE" : "PRESENTE",          C.serv)
    );

  } else if (mods.prioridades) {
    const C    = COL_P4;
    const colaA = estado.cola.filter(c => c.tipo === "A").length;
    const colaB = estado.cola.filter(c => c.tipo === "B").length;
    logLinea(
      padPuntos(evento,                                             C.evento)   +
      padPuntos(formatHora(hora),                                   C.hora)     +
      padPuntos(formatHora(estado.proximoEventoLlegada),            C.llegadaA) +
      padPuntos(formatHora(estado._eventosExtra?.llegada_B),        C.llegadaB) +
      padPuntos(formatHora(estado.proximoEventoFinServicio),        C.fin)      +
      padPuntos(colaA,                                              C.colaA)    +
      padPuntos(colaB,                                              C.colaB)    +
      pad(estado.servidor.estado,                                   C.ps)
    );

  } else {
    logLinea(
      padPuntos(evento,                                      COL.evento)   +
      padPuntos(formatHora(hora),                            COL.hora)     +
      padPuntos(formatHora(estado.proximoEventoLlegada),     COL.llegada)  +
      padPuntos(formatHora(estado.proximoEventoFinServicio), COL.fin)      +
      padPuntos(estado.cola.length,                          COL.cola)     +
      pad(estado.servidor.estado,                            COL.servidor)
    );
  }
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
  const tLL         = parseFloat(document.getElementById("tiempoLlegada").value);
  const tS          = parseFloat(document.getElementById("tiempoServicio").value);
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

      // Parámetros extra por modificador
      if (nombre === "descanso") {
        const inputT = document.getElementById("param_descanso_trabajo");
        paramsModificadores["descanso_trabajo"] = parseFloat(inputT?.value) || 30;
      }
    }
  });

  const velocidad = parseInt(document.getElementById("velocidad")?.value) ?? 120;

  return { tLL, tS, tiempoTotal, modificadoresActivos, paramsModificadores, velocidad };
}

// ─── INICIAR / DETENER ───────────────────────────────────────

function iniciarSimulacion() {
  const params = leerParametros();
  if (!params) return;

  limpiarConsola();

  logLinea("═".repeat(76));
  logLinea("  SIMULACIÓN DE SISTEMA DE COLAS");

  if (params.modificadoresActivos.descanso) {
    const dD = params.paramsModificadores.descanso          ?? 60;
    const dT = params.paramsModificadores.descanso_trabajo  ?? 30;
    logLinea(`  tLL=${params.tLL}s  |  tS=${params.tS}s  |  ΔD=${dD}s  |  ΔT=${dT}s  |  T=${params.tiempoTotal}s`);
  } else if (params.modificadoresActivos.prioridades) {
    const tB = params.paramsModificadores.prioridades ?? 45;
    logLinea(`  tLL_A=${params.tLL}s  |  tLL_B=${tB}s  |  tS=${params.tS}s  |  T=${params.tiempoTotal}s`);
  } else {
    logLinea(`  tLL=${params.tLL}s  |  tS=${params.tS}s  |  T=${params.tiempoTotal}s`);
  }

  const activos = Object.entries(params.modificadoresActivos)
    .filter(([, v]) => v).map(([k]) => k);
  if (activos.length) logLinea(`  Modificadores: ${activos.join(", ")}`);
  logLinea("═".repeat(76));

  imprimirEncabezadoTabla(params.modificadoresActivos);

  setBotones({ iniciando: true });
  motorIniciar(params);
}

function detenerSimulacion() {
  motorDetener();
}

// ─── ESCUCHAR EVENTOS DEL MOTOR ──────────────────────────────

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

  // Toggle de modificadores: badge + animación de panel + inputs extra
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

      // Habilitar/deshabilitar inputs extra
      if (nombre === "descanso") {
        const extra = document.getElementById("param_descanso_trabajo");
        if (extra) extra.disabled = !cb.checked;
      }
    });
  });

});

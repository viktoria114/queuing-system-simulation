// ============================================================
// ui.js — Interacción con el DOM
// ============================================================

// ─── FORMATO ─────────────────────────────────────────────────

function formatHora(seg) {
  if (seg === null || seg === undefined || seg === Infinity) return "─────";
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

// ─── COLUMNAS ────────────────────────────────────────────────

let _abandonoActivo    = false;
let _seguridadActiva   = false;
let _descansoActivo    = false;
let _prioridadesActivo = false;

const SEP = " .... ";

function _hayExtras() {
  return _abandonoActivo || _seguridadActiva || _descansoActivo || _prioridadesActivo;
}

function getCOL() {
  const cols = { evento: 26, hora: 12, llegada: 16, fin: 16, cola: 8, servidor: 10 };
  if (_abandonoActivo)    cols.abandono  = 16;
  if (_seguridadActiva)   { cols.zsLlegada = 16; cols.zsEstado = 12; }
  if (_descansoActivo)    { cols.salida = 16; cols.regreso = 16; cols.ps = 12; }
  if (_prioridadesActivo) { cols.llegadaA = 16; cols.llegadaB = 16; cols.colaA = 8; cols.colaB = 8; }
  return cols;
}

function getAncho() {
  const base = Object.values(getCOL()).reduce((a, b) => a + b, 0);
  return base + (_hayExtras() ? SEP.length : 0);
}

function proximoAbandono(estado) {
  const limites = estado.cola
    .filter(c => c.tiempoLimite !== undefined)
    .map(c => c.tiempoLimite);
  return limites.length ? Math.min(...limites) : null;
}

function imprimirEncabezadoTabla() {
  const COL   = getCOL();
  const ancho = getAncho();

  let cabecera =
    pad("| Evento |",        COL.evento)   +
    pad("| Hora |",          COL.hora)     +
    pad("| Prox.Llegada |",  COL.llegada)  +
    pad("| Fin Servicio |",  COL.fin)      +
    pad("| Cola |",          COL.cola)     +
    pad("| Servidor |",      COL.servidor);

  if (_hayExtras()) {
    cabecera += SEP;
    if (_abandonoActivo) cabecera += pad("| Prox.Abandono |", COL.abandono);
    if (_seguridadActiva) {
      cabecera +=
        pad("| Llega al PS |", COL.zsLlegada) +
        pad("| Zona Seg. |",   COL.zsEstado);
    }
    if (_descansoActivo) {
      cabecera +=
        pad("| Sal.Servidor |", COL.salida)  +
        pad("| Reg.Servidor |", COL.regreso) +
        pad("| P.S. |",         COL.ps);
    }
    if (_prioridadesActivo) {
      cabecera +=
        pad("| Prox.Leg.A |", COL.llegadaA) +
        pad("| Prox.Leg.B |", COL.llegadaB) +
        pad("| Cola A |",     COL.colaA)    +
        pad("| Cola B |",     COL.colaB);
    }
  }

  logLinea(cabecera);
  logLinea("─".repeat(ancho));
}

// ─── FILA DE TABLA ───────────────────────────────────────────

function imprimirFila({ evento, hora, estado }) {
  const COL  = getCOL();
  const colaA = estado.cola.filter(c => c.tipo === "A").length;
  const colaB = estado.cola.filter(c => c.tipo === "B").length;

  let linea =
    padPuntos(evento,                                      COL.evento)   +
    padPuntos(formatHora(hora),                            COL.hora)     +
    padPuntos(formatHora(estado.proximoEventoLlegada),     COL.llegada)  +
    padPuntos(formatHora(estado.proximoEventoFinServicio), COL.fin)      +
    padPuntos(estado.cola.length,                          COL.cola)     +
    padPuntos(estado.servidor.estado,                      COL.servidor);

  if (_hayExtras()) {
    linea += SEP;
    if (_abandonoActivo) {
      linea += padPuntos(formatHora(proximoAbandono(estado)), COL.abandono);
    }
    if (_seguridadActiva) {
      linea +=
        padPuntos(formatHora(estado._eventosExtra?.zs), COL.zsLlegada) +
        padPuntos(estado.zonaSeguridad ?? "─────",       COL.zsEstado);
    }
    if (_descansoActivo) {
      linea +=
        padPuntos(formatHora(estado._eventosExtra?.servidor_salida),  COL.salida)  +
        padPuntos(formatHora(estado._eventosExtra?.servidor_llegada), COL.regreso) +
        padPuntos(estado._servidorPresente ? "PRESENTE" : "AUSENTE",  COL.ps);
    }
    if (_prioridadesActivo) {
      linea +=
        padPuntos(formatHora(estado.proximoEventoLlegada),      COL.llegadaA) +
        padPuntos(formatHora(estado._eventosExtra?.llegada_B),  COL.llegadaB) +
        padPuntos(colaA,                                        COL.colaA)    +
        padPuntos(colaB,                                        COL.colaB);
    }
  }

  logLinea(linea);
}

function imprimirEstadisticas(estado) {
  const s = estado.stats;
  const promEspera = s.clientesAtendidos
    ? (s.tiempoEsperaTotal / s.clientesAtendidos).toFixed(1)
    : 0;

  const sep = "─".repeat(Math.max(getAncho(), 76));

  logLinea(sep);
  logLinea("  ESTADÍSTICAS FINALES");
  logLinea(sep);
  logLinea(`  Clientes atendidos:   ${s.clientesAtendidos}`);
  logLinea(`  Clientes abandonaron: ${s.clientesAbandonaron}`);
  logLinea(`  Espera promedio:      ${promEspera}s`);
  logLinea(sep);
}

// ─── BOTONES ─────────────────────────────────────────────────

function setBotones({ iniciando }) {
  document.getElementById("btnIniciar").disabled  =  iniciando;
  document.getElementById("btnDetener").disabled  = !iniciando;
}

// ─── LEER PARÁMETROS DE TIEMPO (fijo o aleatorio) ────────────
// Para cada clave de tiempo, devuelve { modo, valor, min, max }

function leerParamTiempo(key, idFijo) {
  const sw = document.querySelector(`.modo-switch[data-key="${key}"]`);
  const esAleatorio = sw?.checked ?? false;

  if (!esAleatorio) {
    const val = parseFloat(document.getElementById(idFijo)?.value);
    return { modo: "fijo", valor: isNaN(val) ? null : val };
  }

  const minEl = document.querySelector(`.rango-min[data-key="${key}"]`);
  const maxEl = document.querySelector(`.rango-max[data-key="${key}"]`);
  const min = parseFloat(minEl?.value);
  const max = parseFloat(maxEl?.value);
  return { modo: "aleatorio", min: isNaN(min) ? null : min, max: isNaN(max) ? null : max };
}

// ─── VALIDAR RANGOS ──────────────────────────────────────────

function validarRangos(randomParams) {
  const errores = [];
  const nombres = {
    tLL:      "Tiempo de Llegada",
    tS:       "Tiempo de Servicio",
    deltaD:   "Duración Descanso (ΔD)",
    deltaT:   "Duración Trabajo (ΔT)",
    abandono: "Paciencia de Abandono",
    seguridad:"Tiempo Cruce ZS",
  };

  for (const [key, cfg] of Object.entries(randomParams)) {
    if (!cfg || cfg.modo !== "aleatorio") continue;
    if (cfg.min === null || cfg.max === null || isNaN(cfg.min) || isNaN(cfg.max)) {
      errores.push(`⚠️  ${nombres[key] ?? key}: completá los campos mínimo y máximo.`);
    } else if (cfg.min <= 0 || cfg.max <= 0) {
      errores.push(`⚠️  ${nombres[key] ?? key}: los valores deben ser mayores a 0.`);
    } else if (cfg.min >= cfg.max) {
      errores.push(`⚠️  ${nombres[key] ?? key}: el mínimo (${cfg.min}s) debe ser menor al máximo (${cfg.max}s).`);
    }
  }
  return errores;
}

// ─── LEER PARÁMETROS ─────────────────────────────────────────

function leerParametros() {

  // Leer tLL (fijo o aleatorio)
  const cfgLL = leerParamTiempo("tLL", "tiempoLlegada");
  const tLL   = cfgLL.modo === "fijo" ? cfgLL.valor : (cfgLL.min + cfgLL.max) / 2;

  // Leer tS (fijo o aleatorio)
  const cfgS = leerParamTiempo("tS", "tiempoServicio");
  const tS   = cfgS.modo === "fijo" ? cfgS.valor : (cfgS.min + cfgS.max) / 2;

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

      if (nombre === "descanso") {
        const inputT = document.getElementById("param_descanso_trabajo");
        paramsModificadores["descanso_trabajo"] = parseFloat(inputT?.value) || 30;
      }
    }
  });

  // Construir randomParams para cada clave de tiempo
  const randomParams = {};

  randomParams.tLL = cfgLL.modo === "aleatorio" ? cfgLL : null;
  randomParams.tS  = cfgS.modo  === "aleatorio" ? cfgS  : null;

  if (modificadoresActivos.descanso) {
    const cfgD = leerParamTiempo("deltaD", "param_descanso");
    const cfgT = leerParamTiempo("deltaT", "param_descanso_trabajo");
    randomParams.deltaD = cfgD.modo === "aleatorio" ? cfgD : null;
    randomParams.deltaT = cfgT.modo === "aleatorio" ? cfgT : null;
    // Actualizar paramsModificadores con valor representativo para el header
    if (cfgD.modo === "aleatorio") paramsModificadores.descanso = (cfgD.min + cfgD.max) / 2;
    if (cfgT.modo === "aleatorio") paramsModificadores.descanso_trabajo = (cfgT.min + cfgT.max) / 2;
  }

  if (modificadoresActivos.abandono) {
    const cfgA = leerParamTiempo("abandono", "param_abandono");
    randomParams.abandono = cfgA.modo === "aleatorio" ? cfgA : null;
    if (cfgA.modo === "aleatorio") paramsModificadores.abandono = (cfgA.min + cfgA.max) / 2;
  }

  if (modificadoresActivos.seguridad) {
    const cfgSeg = leerParamTiempo("seguridad", "param_seguridad");
    randomParams.seguridad = cfgSeg.modo === "aleatorio" ? cfgSeg : null;
    if (cfgSeg.modo === "aleatorio") paramsModificadores.seguridad = (cfgSeg.min + cfgSeg.max) / 2;
  }

  // Validar rangos
  const errores = validarRangos(randomParams);
  if (errores.length) {
    errores.forEach(e => logLinea(e));
    return null;
  }

  const velocidad = parseInt(document.getElementById("velocidad")?.value) ?? 120;

  return { tLL, tS, tiempoTotal, modificadoresActivos, paramsModificadores, randomParams, velocidad };
}

// ─── INICIAR / DETENER ───────────────────────────────────────

function iniciarSimulacion() {
  const params = leerParametros();
  if (!params) return;

  _abandonoActivo    = params.modificadoresActivos?.abandono    ?? false;
  _seguridadActiva   = params.modificadoresActivos?.seguridad   ?? false;
  _descansoActivo    = params.modificadoresActivos?.descanso    ?? false;
  _prioridadesActivo = params.modificadoresActivos?.prioridades ?? false;

  limpiarConsola();

  const ancho = getAncho();
  logLinea("═".repeat(ancho));
  logLinea("  SIMULACIÓN DE SISTEMA DE COLAS");

  // Construir línea de parámetros con indicación fijo/aleatorio
  function descTiempo(key, idFijo, label) {
    const sw = document.querySelector(`.modo-switch[data-key="${key}"]`);
    if (sw?.checked) {
      const minEl = document.querySelector(`.rango-min[data-key="${key}"]`);
      const maxEl = document.querySelector(`.rango-max[data-key="${key}"]`);
      return `${label}=[${minEl?.value}-${maxEl?.value}]s`;
    }
    return `${label}=${document.getElementById(idFijo)?.value}s`;
  }

  const dLL = descTiempo("tLL", "tiempoLlegada", "tLL");
  const dS  = descTiempo("tS",  "tiempoServicio", "tS");

  if (_descansoActivo) {
    const dD = descTiempo("deltaD", "param_descanso",        "ΔD");
    const dT = descTiempo("deltaT", "param_descanso_trabajo","ΔT");
    logLinea(`  ${dLL}  |  ${dS}  |  ${dD}  |  ${dT}  |  T=${params.tiempoTotal}s`);
  } else if (_prioridadesActivo) {
    const tB = params.paramsModificadores.prioridades ?? 45;
    logLinea(`  ${dLL}  |  tLL_B=${tB}s  |  ${dS}  |  T=${params.tiempoTotal}s`);
  } else {
    logLinea(`  ${dLL}  |  ${dS}  |  T=${params.tiempoTotal}s`);
  }

  const activos = Object.entries(params.modificadoresActivos)
    .filter(([, v]) => v).map(([k]) => k);
  if (activos.length) logLinea(`  Modificadores: ${activos.join(", ")}`);
  logLinea("═".repeat(ancho));
  imprimirEncabezadoTabla();

  setBotones({ iniciando: true });
  motorIniciar(params);
}

function detenerSimulacion() {
  motorDetener();
}

// ─── TOGGLE FIJO/ALEATORIO ───────────────────────────────────

function actualizarModoTiempo(key, checked) {
  const fijoDiv  = document.getElementById(`fijo_${key}`);
  const aleaDiv  = document.getElementById(`alea_${key}`);
  if (!fijoDiv || !aleaDiv) return;

  fijoDiv.style.display = checked ? "none"  : "";
  aleaDiv.style.display = checked ? ""      : "none";
}

// ─── ESCUCHAR EVENTOS DEL MOTOR ──────────────────────────────

document.addEventListener("DOMContentLoaded", () => {

  // Inicializar los listeners del Vector Inicial V(0)
  if (window.vectorInicial) window.vectorInicial.inicializarUI();

  Bus.on("fila", imprimirFila);

  // Imprimir la fila V(0) como primer evento de la tabla
  Bus.on("inicio", (estado) => {
    imprimirFila({ evento: "V(0) — INICIO", hora: 0, estado });
  });

  Bus.on("fin", (estado) => {
    imprimirEstadisticas(estado);
    setBotones({ iniciando: false });
  });

  Bus.on("detenido", () => {
    logLinea("⛔ Simulación detenida manualmente.");
    setBotones({ iniciando: false });
  });

  // Toggle de modificadores: badge + panel + inputs
  document.querySelectorAll(".modificador-check").forEach(cb => {
    cb.addEventListener("change", () => {
      const nombre = cb.dataset.mod;
      const input  = document.getElementById(`param_${nombre}`);
      const badge  = document.getElementById(`badge_${nombre}`);
      const row    = document.getElementById(`param-row_${nombre}`);

      if (input) input.disabled = !cb.checked;
      badge.textContent = cb.checked ? "ON" : "OFF";
      badge.classList.toggle("on", cb.checked);
      row.classList.toggle("activo", cb.checked);

      // Habilitar/deshabilitar switches y campos dentro del modificador
      row.querySelectorAll(".modo-switch, .rango-min, .rango-max, input[type='number']").forEach(el => {
        el.disabled = !cb.checked;
      });

      if (nombre === "descanso") {
        const extra = document.getElementById("param_descanso_trabajo");
        // Si el switch deltaT está en fijo, habilitar el campo fijo; si está en aleatorio, los rango
        // La lógica ya se maneja via el switch, pero si el mod está desactivado todo se deshabilita
        if (extra) extra.disabled = !cb.checked;
      }
    });
  });

  // Toggle fijo/aleatorio para cada switch de tiempo
  document.querySelectorAll(".modo-switch").forEach(sw => {
    sw.addEventListener("change", () => {
      const key = sw.dataset.key;
      actualizarModoTiempo(key, sw.checked);

      // Habilitar/deshabilitar los inputs correspondientes
      const fijoDiv = document.getElementById(`fijo_${key}`);
      const aleaDiv = document.getElementById(`alea_${key}`);

      // Solo habilitar si el modificador padre está activo (o si es tLL/tS que siempre están activos)
      const modPadre = sw.closest(".mod-param");
      const modActivo = modPadre
        ? modPadre.classList.contains("activo")
        : true;

      if (modActivo) {
        fijoDiv?.querySelectorAll("input").forEach(i => i.disabled =  sw.checked);
        aleaDiv?.querySelectorAll("input").forEach(i => i.disabled = !sw.checked);
      }
    });
  });

});

// ============================================================
// ui.js — Interacción con el DOM
// Info bar HTML de dos columnas + tabla de eventos coloreada.
// ============================================================

// ─── FORMATO ─────────────────────────────────────────────────

function formatHora(seg) {
  if (seg === null || seg === undefined || seg === Infinity) return "─";
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = Math.floor(seg % 60);
  return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

// ─── OBJETO UI (para uso desde modificadores) ────────────────
const UI = {
  log:       (texto) => logLinea(texto),
  formatHora,
};

// ─── LOG DE EMERGENCIA (errores / mensajes puntuales) ─────────
// Escribe en #infoLeft si existe, o directo en #infoBar.
function logLinea(texto) {
  const target = document.getElementById("infoLeft") || document.getElementById("infoBar");
  if (!target) return;
  const div = document.createElement("div");
  div.textContent = texto;
  target.appendChild(div);
  target.scrollTop = target.scrollHeight;
}

// ─── LIMPIEZA ─────────────────────────────────────────────────

function limpiarConsola() {
  const infoBar = document.getElementById("infoBar");
  if (infoBar) infoBar.innerHTML = "";
  const tbody = document.getElementById("eventBody");
  if (tbody) tbody.innerHTML = "";
  const thead = document.getElementById("eventHead");
  if (thead) thead.innerHTML = "";
}

// ─── FLAGS DE MODIFICADORES ───────────────────────────────────

let _abandonoActivo    = false;
let _seguridadActiva   = false;
let _descansoActivo    = false;
let _prioridadesActivo = false;

function _hayExtras() {
  return _abandonoActivo || _seguridadActiva || _descansoActivo || _prioridadesActivo;
}

function proximoAbandono(estado) {
  const limites = estado.cola
    .filter(c => c.tiempoLimite !== undefined)
    .map(c => c.tiempoLimite);
  return limites.length ? Math.min(...limites) : null;
}

// ─── INFO BAR: PANEL IZQUIERDO ────────────────────────────────

function renderInfoLeft(params) {
  const bar = document.getElementById("infoBar");
  bar.innerHTML = "";

  // ── Panel izquierdo: parámetros + modificadores ──
  const left = document.createElement("div");
  left.id = "infoLeft";

  const title = document.createElement("div");
  title.className = "info-title";
  title.textContent = "SIMULACIÓN DE SISTEMA DE COLAS";
  left.appendChild(title);

  const sep1 = document.createElement("hr");
  sep1.className = "info-sep";
  left.appendChild(sep1);

  const pares = [];
  if (_prioridadesActivo) {
    pares.push(["tLL_A", `${params.tLL}s`]);
    pares.push(["tLL_B", `${params.paramsModificadores.prioridades ?? 45}s`]);
  } else {
    pares.push(["tLL", `${params.tLL}s`]);
  }
  pares.push(["tS", `${params.tS}s`]);
  if (_descansoActivo) {
    pares.push(["ΔD", `${params.paramsModificadores.descanso ?? 60}s`]);
    pares.push(["ΔT", `${params.paramsModificadores.descanso_trabajo ?? 30}s`]);
  }
  if (_abandonoActivo)  pares.push(["paciencia", `${params.paramsModificadores.abandono ?? 10}s`]);
  if (_seguridadActiva) pares.push(["cruce ZS",  `${params.paramsModificadores.seguridad ?? 5}s`]);
  pares.push(["T", `${params.tiempoTotal}s`]);

  const paramDiv = document.createElement("div");
  paramDiv.className = "info-params";
  paramDiv.innerHTML = pares
    .map(([k, v]) => `${k}&nbsp;<b>${v}</b>`)
    .join('<span class="param-sep">&nbsp; | &nbsp;</span>');
  left.appendChild(paramDiv);

  const modActivos = Object.entries(params.modificadoresActivos)
    .filter(([, v]) => v)
    .map(([k]) => k);

  if (modActivos.length > 0) {
    const label = document.createElement("div");
    label.className = "info-label";
    label.textContent = "Modificadores activos";
    left.appendChild(label);

    const badgesDiv = document.createElement("div");
    badgesDiv.className = "mod-badges";
    modActivos.forEach(nombre => {
      const badge = document.createElement("span");
      badge.className = `mod-badge-pill ${nombre}`;
      badge.textContent = nombre;
      badgesDiv.appendChild(badge);
    });
    left.appendChild(badgesDiv);
  }

  // ── Panel derecho: vacío hasta que lleguen las stats ──
  const right = document.createElement("div");
  right.id = "infoRight";

  bar.append(left, right);
}

// ─── INFO BAR: PANEL DERECHO (estadísticas) ───────────────────

function imprimirEstadisticas(estado) {
  const s = estado.stats;
  const promEspera = s.clientesAtendidos
    ? (s.tiempoEsperaTotal / s.clientesAtendidos).toFixed(1)
    : 0;

  const right = document.getElementById("infoRight");
  if (!right) return;

  const title = document.createElement("div");
  title.className = "info-title";
  title.textContent = "ESTADÍSTICAS FINALES";
  right.appendChild(title);

  const sep = document.createElement("hr");
  sep.className = "info-sep";
  right.appendChild(sep);

  [
    ["Clientes atendidos",   s.clientesAtendidos],
    ["Clientes abandonaron", s.clientesAbandonaron],
    ["Espera promedio",      `${promEspera}s`],
  ].forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "stat-row";
    row.innerHTML = `<span class="stat-label">${label}</span><span class="stat-value">${value}</span>`;
    right.appendChild(row);
  });
}

// ─── HELPERS DE TABLA ─────────────────────────────────────────

function mkTh(label, mod) {
  const th = document.createElement("th");
  th.textContent = label;
  if (mod) th.classList.add(`mod-${mod}`);
  return th;
}

function mkTd(valor, mod) {
  const td = document.createElement("td");
  td.textContent = (valor === null || valor === undefined) ? "─" : String(valor);
  if (mod) td.classList.add(`mod-${mod}`);
  return td;
}

// ─── ENCABEZADO ───────────────────────────────────────────────

function imprimirEncabezadoTabla() {
  const thead = document.getElementById("eventHead");
  if (!thead) return;
  thead.innerHTML = "";

  const tr = document.createElement("tr");

  tr.append(
    mkTh("Evento"),
    mkTh("Hora"),
    mkTh("Próx. Llegada"),
    mkTh("Fin Servicio"),
    mkTh("Cola"),
    mkTh("Servidor"),
  );

  let sepPendiente = _hayExtras();
  const thMod = (label, mod) => {
    const th = mkTh(label, mod);
    if (sepPendiente) { th.classList.add("sep-left"); sepPendiente = false; }
    return th;
  };

  if (_abandonoActivo)    tr.append(thMod("Próx. Abandono", "abandono"));
  if (_seguridadActiva)   tr.append(thMod("Llega al PS", "seguridad"),    mkTh("Zona Seg.", "seguridad"));
  if (_descansoActivo)    tr.append(thMod("Sal. Servidor", "descanso"),   mkTh("Reg. Servidor", "descanso"), mkTh("P.S.", "descanso"));
  if (_prioridadesActivo) tr.append(thMod("Próx. Leg. A", "prioridades"), mkTh("Próx. Leg. B", "prioridades"), mkTh("Cola A", "prioridades"), mkTh("Cola B", "prioridades"));

  thead.appendChild(tr);
}

// ─── FILA DE DATOS ────────────────────────────────────────────

function imprimirFila({ evento, hora, estado }) {
  const tbody = document.getElementById("eventBody");
  if (!tbody) return;

  const tr = document.createElement("tr");

  tr.append(
    mkTd(evento),
    mkTd(formatHora(hora)),
    mkTd(formatHora(estado.proximoEventoLlegada)),
    mkTd(formatHora(estado.proximoEventoFinServicio)),
    mkTd(estado.cola.length),
    mkTd(estado.servidor.estado),
  );

  if (_hayExtras()) {
    let sepPendiente = true;
    const tdMod = (valor, mod) => {
      const td = mkTd(valor, mod);
      if (sepPendiente) { td.classList.add("sep-left"); sepPendiente = false; }
      return td;
    };

    if (_abandonoActivo) tr.append(tdMod(formatHora(proximoAbandono(estado)), "abandono"));
    if (_seguridadActiva) tr.append(
      tdMod(formatHora(estado._eventosExtra?.zs), "seguridad"),
      mkTd(estado.zonaSeguridad ?? "─", "seguridad"),
    );
    if (_descansoActivo) tr.append(
      tdMod(formatHora(estado._eventosExtra?.servidor_salida), "descanso"),
      mkTd(formatHora(estado._eventosExtra?.servidor_llegada), "descanso"),
      mkTd(estado._servidorAusente ? "AUSENTE" : "PRESENTE", "descanso"),
    );
    if (_prioridadesActivo) {
      const colaA = estado.cola.filter(c => c.tipo === "A").length;
      const colaB = estado.cola.filter(c => c.tipo === "B").length;
      tr.append(
        tdMod(formatHora(estado.proximoEventoLlegada), "prioridades"),
        mkTd(formatHora(estado._eventosExtra?.llegada_B), "prioridades"),
        mkTd(colaA, "prioridades"),
        mkTd(colaB, "prioridades"),
      );
    }
  }

  tbody.appendChild(tr);
  const wrapper = document.getElementById("tableWrapper");
  if (wrapper) wrapper.scrollTop = wrapper.scrollHeight;
}

// ─── BOTONES ─────────────────────────────────────────────────

function setBotones({ iniciando }) {
  document.getElementById("btnIniciar").disabled  =  iniciando;
  document.getElementById("btnDetener").disabled  = !iniciando;
}

// ─── LEER PARÁMETROS DE TIEMPO (fijo o aleatorio) ────────────

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
  renderInfoLeft(params);
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

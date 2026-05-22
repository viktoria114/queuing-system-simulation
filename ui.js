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

  // Construir lista de parámetros clave–valor
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

  // Badges de modificadores activos
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

// ─── VECTOR INICIAL ──────────────────────────────────────────

const vectorInicial = {
  hora:                     0,
  proximaLlegada:           null,   // null = tiempoActual + tLL
  cola:                     0,
  servidor:                 "LIBRE",
  // Abandono
  abandono_proxAbandono:    null,
  // Seguridad
  seguridad_llegaPS:        null,
  // Descanso
  descanso_salidaServidor:  null,   // null = tiempoActual + ΔT (calculado por modificador)
  descanso_regresoServidor: null,   // null = ninguno
  descanso_presencia:       "PRESENTE",
  // Prioridades
  prioridades_proxLlegadaA: null,   // null = tiempoActual + tLL_A
  prioridades_proxLlegadaB: null,   // null = tiempoActual + tLL_B
  prioridades_colaA:        0,
  prioridades_colaB:        0,
};

// Consumir desde otro archivo: getVectorInicial()
function getVectorInicial() { return { ...vectorInicial }; }

const COLUMNAS_VECTOR = [
  { key: "hora",                     label: "Hora",           type: "number",                              mod: null        },
  { key: "proximaLlegada",           label: "Próx. Llegada",  type: "number",  ph: "auto",                mod: null        },
  { key: "cola",                     label: "Cola",           type: "number",                              mod: null        },
  { key: "servidor",                 label: "Servidor",       type: "select",  opts: ["LIBRE","OCUPADO"], mod: null        },
  { key: "abandono_proxAbandono",    label: "Próx. Abandono", type: "number",  ph: "─",                   mod: "abandono"  },
  { key: "seguridad_llegaPS",        label: "Llega al PS",    type: "number",  ph: "─",                   mod: "seguridad" },
  { key: "descanso_salidaServidor",  label: "Sal. Servidor",  type: "number",  ph: "auto",                mod: "descanso"  },
  { key: "descanso_regresoServidor", label: "Reg. Servidor",  type: "number",  ph: "─",                   mod: "descanso"  },
  { key: "descanso_presencia",       label: "P.S.",           type: "select",  opts: ["PRESENTE","AUSENTE"], mod: "descanso" },
  { key: "prioridades_proxLlegadaA", label: "Próx. Leg. A",  type: "number",  ph: "auto",                mod: "prioridades" },
  { key: "prioridades_proxLlegadaB", label: "Próx. Leg. B",  type: "number",  ph: "auto",                mod: "prioridades" },
  { key: "prioridades_colaA",        label: "Cola A",         type: "number",                              mod: "prioridades" },
  { key: "prioridades_colaB",        label: "Cola B",         type: "number",                              mod: "prioridades" },
];

function _modActivosEnUI() {
  const activos = {};
  document.querySelectorAll(".modificador-check").forEach(cb => {
    activos[cb.dataset.mod] = cb.checked;
  });
  return activos;
}

function actualizarDisplayVector() {
  const h = document.getElementById("vi_disp_hora");
  const c = document.getElementById("vi_disp_cola");
  const s = document.getElementById("vi_disp_servidor");
  if (h) h.textContent = vectorInicial.hora ?? 0;
  if (c) c.textContent = vectorInicial.cola ?? 0;
  if (s) s.textContent = vectorInicial.servidor ?? "LIBRE";
}

function abrirModalVector() {
  const modal = document.getElementById("modalVector");
  if (!modal) return;
  _renderTablaModal();
  modal.classList.add("activo");
}

function cerrarModalVector() {
  const modal = document.getElementById("modalVector");
  if (modal) modal.classList.remove("activo");
}

function _renderTablaModal() {
  const container = document.getElementById("vectorModalContent");
  if (!container) return;
  container.innerHTML = "";

  const activos  = _modActivosEnUI();
  const columnas = COLUMNAS_VECTOR.filter(col => !col.mod || activos[col.mod]);

  const table  = document.createElement("table");
  table.className = "vi-table";
  const thead  = document.createElement("thead");
  const tbody  = document.createElement("tbody");
  const trHead = document.createElement("tr");
  const trBody = document.createElement("tr");

  let primerMod = true;

  columnas.forEach(col => {
    const sepLeft = col.mod && primerMod;
    if (col.mod) primerMod = false;

    const th = document.createElement("th");
    th.textContent = col.label;
    if (col.mod)  th.classList.add(`mod-${col.mod}`);
    if (sepLeft)  th.classList.add("sep-left");
    trHead.appendChild(th);

    const td = document.createElement("td");
    if (col.mod)  td.classList.add(`mod-${col.mod}`);
    if (sepLeft)  td.classList.add("sep-left");

    if (col.type === "select") {
      const sel = document.createElement("select");
      sel.id = `vi_input_${col.key}`;
      (col.opts || []).forEach(opt => {
        const o = document.createElement("option");
        o.value = opt;
        o.textContent = opt;
        if (String(vectorInicial[col.key]) === opt) o.selected = true;
        sel.appendChild(o);
      });
      td.appendChild(sel);
    } else {
      const inp = document.createElement("input");
      inp.type = "number";
      inp.id   = `vi_input_${col.key}`;
      if (col.ph) inp.placeholder = col.ph;
      const val = vectorInicial[col.key];
      if (val !== null && val !== undefined) inp.value = val;
      td.appendChild(inp);
    }
    trBody.appendChild(td);
  });

  thead.appendChild(trHead);
  tbody.appendChild(trBody);
  table.append(thead, tbody);
  container.appendChild(table);
}

function guardarVectorInicial() {
  const activos  = _modActivosEnUI();
  const columnas = COLUMNAS_VECTOR.filter(col => !col.mod || activos[col.mod]);

  columnas.forEach(col => {
    const el = document.getElementById(`vi_input_${col.key}`);
    if (!el) return;
    if (col.type === "select") {
      vectorInicial[col.key] = el.value;
    } else {
      const raw = el.value.trim();
      vectorInicial[col.key] = raw === "" ? null : parseFloat(raw);
    }
  });

  actualizarDisplayVector();
  cerrarModalVector();
}

function resetVectorInicial() {
  vectorInicial.hora                     = 0;
  vectorInicial.proximaLlegada           = null;
  vectorInicial.cola                     = 0;
  vectorInicial.servidor                 = "LIBRE";
  vectorInicial.abandono_proxAbandono    = null;
  vectorInicial.seguridad_llegaPS        = null;
  vectorInicial.descanso_salidaServidor  = null;
  vectorInicial.descanso_regresoServidor = null;
  vectorInicial.descanso_presencia       = "PRESENTE";
  vectorInicial.prioridades_proxLlegadaA = null;
  vectorInicial.prioridades_proxLlegadaB = null;
  vectorInicial.prioridades_colaA        = 0;
  vectorInicial.prioridades_colaB        = 0;
  actualizarDisplayVector();
  cerrarModalVector();
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
      if (nombre === "descanso") {
        const inputT = document.getElementById("param_descanso_trabajo");
        paramsModificadores["descanso_trabajo"] = parseFloat(inputT?.value) || 30;
      }
    }
  });

  const velocidad = parseInt(document.getElementById("velocidad")?.value) ?? 120;
  return { tLL, tS, tiempoTotal, modificadoresActivos, paramsModificadores, velocidad, vectorInicial: getVectorInicial() };
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

// ─── ESCUCHAR EVENTOS DEL MOTOR ──────────────────────────────

document.addEventListener("DOMContentLoaded", () => {

  // Inicializar display del vector inicial
  actualizarDisplayVector();

  // Cerrar modal al hacer clic en el overlay
  document.getElementById("modalVector")?.addEventListener("click", (e) => {
    if (e.target.id === "modalVector") cerrarModalVector();
  });

  // Cerrar modal con Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") cerrarModalVector();
  });

  Bus.on("fila", imprimirFila);

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

      input.disabled    = !cb.checked;
      badge.textContent = cb.checked ? "ON" : "OFF";
      badge.classList.toggle("on", cb.checked);
      row.classList.toggle("activo", cb.checked);

      if (nombre === "descanso") {
        const extra = document.getElementById("param_descanso_trabajo");
        if (extra) extra.disabled = !cb.checked;
      }
    });
  });

});

// ============================================================
// ui.js — Interacción con el DOM
// Info bar HTML de dos columnas + tabla de eventos coloreada.
// Este archivo NUNCA modifica el estado de la simulación directamente;
// solo lee el estado que emite el motor y lo renderiza.
// ============================================================

// ─── FORMATO ─────────────────────────────────────────────────

// Convierte segundos en formato H:MM:SS para mostrar en la tabla.
// null / undefined / Infinity se renderizan como "─" (sin evento programado).
function formatHora(seg) {
  if (seg === null || seg === undefined || seg === Infinity) return "─";
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = Math.floor(seg % 60);
  return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

// ─── OBJETO UI (para uso desde modificadores) ────────────────
// Expone utilidades a modificadores que necesiten imprimir mensajes
// sin acceder directamente a las funciones internas de ui.js.
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

// Vacía el panel de información y la tabla de eventos.
// Se llama al iniciar una nueva corrida para partir de cero.
function limpiarConsola() {
  const infoBar = document.getElementById("infoBar");
  if (infoBar) infoBar.innerHTML = "";
  const tbody = document.getElementById("eventBody");
  if (tbody) tbody.innerHTML = "";
  const thead = document.getElementById("eventHead");
  if (thead) thead.innerHTML = "";
}

// ─── FLAGS DE MODIFICADORES ───────────────────────────────────
// Guardan qué modificadores están activos en la corrida actual.
// Se leen al iniciar y no cambian durante la simulación.
// Controlan qué columnas extra se muestran en la tabla.
let _abandonoActivo    = false;
let _seguridadActiva   = false;
let _descansoActivo    = false;
let _prioridadesActivo = false;
let _desvioActivo      = false;

// Retorna true si al menos un modificador con columnas extra está activo.
// Se usa para saber si hay que agregar el separador visual en la tabla.
function _hayExtras() {
  return _abandonoActivo || _seguridadActiva || _descansoActivo || _prioridadesActivo || _desvioActivo;
}

// Devuelve el tiempo de abandono más próximo entre los clientes en cola.
// Si ninguno tiene tiempoLimite definido, retorna null.
function proximoAbandono(estado) {
  const limites = estado.cola
    .filter(c => c.tiempoLimite !== undefined)
    .map(c => c.tiempoLimite);
  return limites.length ? Math.min(...limites) : null;
}

// ─── INFO BAR: PANEL IZQUIERDO ────────────────────────────────
// Renderiza el resumen de parámetros y modificadores activos
// en la columna izquierda del infoBar al iniciar la simulación.
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

  // Construir pares clave-valor de parámetros según modificadores activos
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
// Renderiza el resumen de resultados al terminar la simulación.
// Si el modificador desvío estaba activo, agrega la fila de desviados
// y la relación procesados/desviados.
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

  const filas = [
    ["Clientes atendidos",   s.clientesAtendidos],
    ["Clientes abandonaron", s.clientesAbandonaron],
    ["Espera promedio",      `${promEspera}s`],
  ];
  // clientesDesviados solo existe si el modificador desvío estuvo activo
  if (s.clientesDesviados !== undefined) {
    filas.push(["Clientes desviados", s.clientesDesviados]);
    filas.push(["Procesados / Desviados", `${s.clientesAtendidos} / ${s.clientesDesviados}`]);
  }
  filas.forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "stat-row";
    row.innerHTML = `<span class="stat-label">${label}</span><span class="stat-value">${value}</span>`;
    right.appendChild(row);
  });
}

// ─── HELPERS DE TABLA ─────────────────────────────────────────

// Crea un <th> con texto y clase CSS de modificador opcional.
function mkTh(label, mod) {
  const th = document.createElement("th");
  th.textContent = label;
  if (mod) th.classList.add(`mod-${mod}`);
  return th;
}

// Crea un <td> con valor formateado y clase CSS de modificador opcional.
// null / undefined se muestran como "─".
function mkTd(valor, mod) {
  const td = document.createElement("td");
  td.textContent = (valor === null || valor === undefined) ? "─" : String(valor);
  if (mod) td.classList.add(`mod-${mod}`);
  return td;
}

// ─── ENCABEZADO ───────────────────────────────────────────────
// Construye la fila de encabezados de la tabla de eventos.
// Las columnas base siempre aparecen; las columnas de modificadores
// solo se agregan si el modificador está activo.
// La primera columna extra lleva clase "sep-left" para el separador visual.
function imprimirEncabezadoTabla() {
  const thead = document.getElementById("eventHead");
  if (!thead) return;
  thead.innerHTML = "";

  const tr = document.createElement("tr");

  // Columnas base (siempre presentes)
  tr.append(
    mkTh("Evento"),
    mkTh("Hora"),
    mkTh("Próx. Llegada"),
    mkTh("Fin Servicio"),
    mkTh("Cola"),
    mkTh("Servidor"),
  );

  // Columnas extra: la primera recibe "sep-left" para separador visual.
  // sepPendiente se pone en false después del primer uso.
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
  if (_desvioActivo)      tr.append(thMod("Desviados", "desvio"));

  thead.appendChild(tr);
}

// ─── FILA DE DATOS ────────────────────────────────────────────
// Agrega una fila a la tabla por cada evento procesado.
// Recibe { evento, hora, estado } emitido por el motor via Bus.
// Misma lógica de columnas extras que imprimirEncabezadoTabla.
function imprimirFila({ evento, hora, estado }) {
  const tbody = document.getElementById("eventBody");
  if (!tbody) return;

  const tr = document.createElement("tr");

  // Celdas base
  tr.append(
    mkTd(evento),
    mkTd(formatHora(hora)),
    mkTd(formatHora(estado.proximoEventoLlegada)),
    mkTd(formatHora(estado.proximoEventoFinServicio)),
    mkTd(estado.cola.length),
    mkTd(estado.servidor.estado),
  );

  if (_hayExtras()) {
    // La primera celda extra recibe "sep-left" igual que en el encabezado.
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
    // Contador acumulado de desviados (variable auxiliar del Problema 3)
    if (_desvioActivo) tr.append(tdMod(estado.stats.clientesDesviados ?? 0, "desvio"));
  }

  tbody.appendChild(tr);
  // Auto-scroll para seguir el último evento
  const wrapper = document.getElementById("tableWrapper");
  if (wrapper) wrapper.scrollTop = wrapper.scrollHeight;
}

// ─── BOTONES ─────────────────────────────────────────────────

// Habilita/deshabilita los botones Iniciar y Detener según el estado.
function setBotones({ iniciando }) {
  document.getElementById("btnIniciar").disabled  =  iniciando;
  document.getElementById("btnDetener").disabled  = !iniciando;
}

// ─── LEER PARÁMETROS DE TIEMPO (fijo o aleatorio) ────────────
// Lee el valor de un tiempo configurable teniendo en cuenta el switch
// fijo/aleatorio. Retorna:
//   { modo:"fijo", valor }            → tiempo determinístico
//   { modo:"aleatorio", min, max }    → distribución U[min,max]
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
// Verifica que todos los rangos aleatorios sean válidos (min < max > 0).
// Retorna un array de mensajes de error; vacío si todo está bien.
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
// Lee todos los inputs del formulario y devuelve el objeto "params"
// que se pasa a motorIniciar(). Retorna null si hay errores de validación.
function leerParametros() {

  // Leer tLL (fijo o aleatorio)
  const cfgLL = leerParamTiempo("tLL", "tiempoLlegada");
  // Para el header se usa el valor representativo (promedio en modo aleatorio)
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

  // Leer estado y parámetro numérico de cada modificador
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

  // Construir randomParams para cada clave de tiempo configurable.
  // null significa "modo fijo" para esa clave.
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

  // Validar que todos los rangos aleatorios sean coherentes
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

  // Capturar qué modificadores están activos para que las funciones
  // de renderizado sepan qué columnas extra mostrar.
  _abandonoActivo    = params.modificadoresActivos?.abandono    ?? false;
  _seguridadActiva   = params.modificadoresActivos?.seguridad   ?? false;
  _descansoActivo    = params.modificadoresActivos?.descanso    ?? false;
  _prioridadesActivo = params.modificadoresActivos?.prioridades ?? false;
  _desvioActivo      = params.modificadoresActivos?.desvio      ?? false;

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
// Muestra u oculta los campos correspondientes al modo del switch.
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

  // Cada evento "fila" emitido por el motor agrega una fila a la tabla.
  Bus.on("fila", imprimirFila);

  // Al iniciar, imprimir la fila V(0) como primer registro de la tabla.
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

  // Habilitar/deshabilitar inputs del modificador al marcar/desmarcar el checkbox
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
        if (extra) extra.disabled = !cb.checked;
      }
    });
  });

  // Cuando el usuario cambia un switch fijo/aleatorio, mostrar/ocultar campos
  document.querySelectorAll(".modo-switch").forEach(sw => {
    sw.addEventListener("change", () => {
      const key = sw.dataset.key;
      actualizarModoTiempo(key, sw.checked);

      const fijoDiv = document.getElementById(`fijo_${key}`);
      const aleaDiv = document.getElementById(`alea_${key}`);

      // Solo habilitar los inputs si el modificador padre está activo
      // (tLL y tS siempre están activos porque no tienen modificador padre)
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

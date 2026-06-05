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
    .filter(c => c["tiempoLimite_ps0"] !== undefined)
    .map(c => c["tiempoLimite_ps0"]);
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

  // Cerrar el período de ocupación si el PS aún estaba ocupado al terminar
  let tiempoOcupado = s.tiempoOcupado ?? 0;
  if (s._servidorOcupadoDesde !== null && s._servidorOcupadoDesde !== undefined) {
    tiempoOcupado += estado.tiempoActual - s._servidorOcupadoDesde;
  }
  // Para multi-PS: los PS que aún estén ocupados al terminar no fueron cerrados;
  // se suman aquí. La utilización se normaliza por la cantidad de PS.
  if (estado.servidores) {
    for (const ps of estado.servidores) {
      if (ps._ocupadoDesde !== null) {
        tiempoOcupado += estado.tiempoActual - ps._ocupadoDesde;
      }
    }
  } else if (s._servidorOcupadoDesde !== null && s._servidorOcupadoDesde !== undefined) {
    tiempoOcupado += estado.tiempoActual - s._servidorOcupadoDesde;
  }
  const numPS = estado.numServidores ?? 1;
  const utilizacion = estado.tiempoTotal > 0
    ? ((tiempoOcupado / (estado.tiempoTotal * numPS)) * 100).toFixed(1)
    : "0.0";

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
  ];
  if (estado.topologia === "serie-paralelo") {
    filas.push(["↳ Abandonos en fila del tótem",    s.abandonosTotem      ?? 0]);
    filas.push(["↳ Abandonos en sala de espera",    s.abandonosSalaEspera ?? 0]);
    filas.push(["Total abandonos",                  s.clientesAbandonaron]);
  } else {
    filas.push(["Clientes abandonaron", s.clientesAbandonaron]);
  }
  filas.push(["Espera promedio", `${promEspera}s`]);
  filas.push(["Ocupación del PS", `${utilizacion}%`]);
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

// ─── HELPERS DE COLA ─────────────────────────────────────────

// Devuelve la cola que alimenta al PS[i] según la topología.
function _colaDeIdx(est, i) {
  if (est.topologia === "paralelo")       return est.colas?.[i] ?? [];
  if (est.topologia === "serie")          return i === 0 ? est.cola : (est.servidores[i]?._cola ?? []);
  if (est.topologia === "serie-paralelo") return i === 0 ? est.cola : (est._salaEspera ?? []);
  // unafilavarios / unica: cola compartida, solo relevante para PS0
  return i === 0 ? est.cola : [];
}

// Suma de todos los clientes en espera en el sistema (para el gráfico).
function _totalCola(est) {
  if (est.topologia === "serie-paralelo") {
    return (est.cola?.length ?? 0) + (est._salaEspera?.length ?? 0);
  }
  let total = 0;
  const numPS = est.servidores?.length ?? 1;
  for (let i = 0; i < numPS; i++) total += _colaDeIdx(est, i).length;
  return total;
}

// ─── CELDA GRÁFICA ───────────────────────────────────────────
// □/■ = puesto de servicio libre/ocupado  ● = cliente en cola
//
// Layouts según topología:
//   unica / 1PS  : [PS] ●●●
//   serie        : ●●[PS1] → ●[PS2] → [PS3]   (colas inter-PS visibles)
//   paralelo     : [PS1]●●  /  [PS2]●  (una fila por PS, apiladas)
//   unafilavarios: [PS1][PS2][PS3] ●●●  (PS juntos, cola compartida)
function mkTdGraf(estado) {
  const td = document.createElement("td");
  td.className = "graf-td";

  const numPS = estado.servidores?.length ?? 1;
  const topo  = estado.topologia;

  function makeSrvWrap(ps, showLabel) {
    const wrap = document.createElement("span");
    wrap.className = "graf-srv-wrap";
    if (!ps._ausente) {
      const belly = document.createElement("span");
      belly.className = "graf-belly";
      wrap.appendChild(belly);
    }
    const srv = document.createElement("span");
    srv.className = "graf-srv" + (ps.estado === "OCUPADO" ? " busy" : "");
    wrap.appendChild(srv);
    if (showLabel) {
      const lbl = document.createElement("span");
      lbl.className = "graf-ps-label";
      lbl.textContent = `PS${(ps.idx ?? 0) + 1}`;
      wrap.appendChild(lbl);
    }
    return wrap;
  }

  function makeClients(n) {
    const frag = document.createDocumentFragment();
    for (let j = 0; j < n; j++) {
      const dot = document.createElement("span");
      dot.className = "graf-cli";
      frag.appendChild(dot);
    }
    return frag;
  }

  function makeArrow() {
    const a = document.createElement("span");
    a.className = "graf-arrow";
    a.textContent = "→";
    return a;
  }

  // ── 1 PS ─────────────────────────────────────────────────────
  if (numPS === 1 || !topo || topo === "unica") {
    const ps = estado.servidores ? estado.servidores[0] : estado.servidor;
    td.appendChild(makeSrvWrap(ps, false));
    td.appendChild(makeClients(_totalCola(estado)));
    return td;
  }

  // ── Serie ────────────────────────────────────────────────────
  // Layout: ●●[PS1] → ●[PS2] → [PS3]
  if (topo === "serie") {
    const row = document.createElement("div");
    row.className = "graf-serie";
    for (let i = 0; i < numPS; i++) {
      if (i > 0) row.appendChild(makeArrow());
      row.appendChild(makeClients(_colaDeIdx(estado, i).length));
      row.appendChild(makeSrvWrap(estado.servidores[i], true));
    }
    td.appendChild(row);
    return td;
  }

  // ── Paralelo ─────────────────────────────────────────────────
  // Layout: una fila por PS, apiladas verticalmente
  //   [PS1]●●
  //   [PS2]●
  //   [PS3]
  if (topo === "paralelo") {
    const col = document.createElement("div");
    col.className = "graf-paralelo";
    for (let i = 0; i < numPS; i++) {
      const lane = document.createElement("div");
      lane.className = "graf-paralelo-lane";
      lane.appendChild(makeSrvWrap(estado.servidores[i], true));
      lane.appendChild(makeClients(_colaDeIdx(estado, i).length));
      col.appendChild(lane);
    }
    td.appendChild(col);
    return td;
  }

  // ── Serie con Sala de Espera ─────────────────────────────────
  // Layout: ●●[Tótem] → [sala:●●] → [C1]
  //                                  [C2]
  if (topo === "serie-paralelo") {
    const row = document.createElement("div");
    row.className = "graf-serie";

    row.appendChild(makeClients(estado.cola?.length ?? 0));
    row.appendChild(makeSrvWrap(estado.servidores[0], true));
    row.appendChild(makeArrow());

    // Sala de espera: círculos de espera
    row.appendChild(makeClients(estado._salaEspera?.length ?? 0));
    row.appendChild(makeArrow());

    // Consultorios apilados
    const colDiv = document.createElement("div");
    colDiv.style.cssText = "display:inline-flex;flex-direction:column;gap:2px;vertical-align:middle";
    for (let i = 1; i < numPS; i++) {
      colDiv.appendChild(makeSrvWrap(estado.servidores[i], true));
    }
    row.appendChild(colDiv);

    td.appendChild(row);
    return td;
  }

  // ── Una fila, varios PS ───────────────────────────────────────
  // Layout: [PS1][PS2][PS3] ●●●
  const row = document.createElement("div");
  row.className = "graf-unafilavarios";
  const psGroup = document.createElement("span");
  psGroup.className = "graf-ps-group";
  for (let i = 0; i < numPS; i++) {
    psGroup.appendChild(makeSrvWrap(estado.servidores[i], true));
  }
  row.appendChild(psGroup);
  row.appendChild(makeClients(_colaDeIdx(estado, 0).length));
  td.appendChild(row);
  return td;
}

// ─── ENCABEZADO ───────────────────────────────────────────────
// Para 1 PS: columnas idénticas a la versión original.
// Para N PS: reemplaza "Fin Servicio" + "Puesto de Servicio" por columnas por PS.
function imprimirEncabezadoTabla() {
  const thead = document.getElementById("eventHead");
  if (!thead) return;
  thead.innerHTML = "";

  const tr = document.createElement("tr");

  tr.append(mkTh("Evento"), mkTh("Hora"), mkTh("Próx. Llegada"));

  if (_psCount === 1) {
    tr.append(mkTh("Fin Servicio"), mkTh("Cola"), mkTh("Puesto de Servicio"), mkTh("T. Espera"));
  } else if (_queueType === "serie-paralelo") {
    tr.append(mkTh("Tótem"), mkTh("Fin Tótem"), mkTh("Cola Tótem"), mkTh("Sala Espera"));
    for (let i = 1; i < _psCount; i++) {
      tr.append(mkTh(`Consul. ${i}`), mkTh(`Fin C${i}`));
    }
    tr.append(mkTh("T. Espera"));
  } else {
    const perPS = _queueType === "serie" || _queueType === "paralelo";
    for (let i = 0; i < _psCount; i++) {
      tr.append(mkTh(`PS${i + 1}`), mkTh(`Fin PS${i + 1}`));
      if (perPS) tr.append(mkTh(`Cola PS${i + 1}`));
    }
    // unafilavarios: una sola cola compartida al final
    if (!perPS) tr.append(mkTh("Cola"));
    tr.append(mkTh("T. Espera"));
  }

  let sepPendiente = _hayExtras();
  const thMod = (label, mod) => {
    const th = mkTh(label, mod);
    if (sepPendiente) { th.classList.add("sep-left"); sepPendiente = false; }
    return th;
  };

  if (_abandonoActivo)    tr.append(thMod("Próx. Abandono", "abandono"));
  if (_seguridadActiva)   tr.append(thMod("Llega al PS", "seguridad"),    mkTh("Zona Seg.", "seguridad"));
  if (_descansoActivo)    tr.append(thMod("Sal. Servidor", "descanso"),   mkTh("Reg. Servidor", "descanso"), mkTh("Servidor", "descanso"));
  if (_prioridadesActivo) tr.append(thMod("Próx. Leg. A", "prioridades"), mkTh("Próx. Leg. B", "prioridades"), mkTh("Cola A", "prioridades"), mkTh("Cola B", "prioridades"));
  if (_desvioActivo)      tr.append(thMod("Desviados", "desvio"));

  tr.append(mkTh("Gráficamente"));
  thead.appendChild(tr);
}

// ─── FILA DE DATOS ────────────────────────────────────────────
// Agrega una fila a la tabla por cada evento procesado.
// Recibe { evento, hora, estado } emitido por el motor via Bus.
// Misma lógica de columnas extras que imprimirEncabezadoTabla.
function imprimirFila({ evento, hora, estado, meta }) {
  const tbody = document.getElementById("eventBody");
  if (!tbody) return;

  const tr = document.createElement("tr");

  // Celda T. Espera: muestra espera del cliente en FIN SERVICIO, vacío en el resto
  const tdEspera = document.createElement("td");
  if (meta?.tipo === "finServicio" && meta.espera !== null && meta.espera !== undefined) {
    tdEspera.textContent = formatHora(meta.espera);
    tdEspera.title = `${meta.espera.toFixed(1)}s`;
  } else {
    tdEspera.textContent = "─";
  }

  // Celdas base
  tr.append(
    mkTd(evento),
    mkTd(formatHora(hora)),
    mkTd(formatHora(estado.proximoEventoLlegada)),
  );

  const numPS = estado.servidores?.length ?? 1;
  if (numPS === 1) {
    // Backward compat: columnas originales para 1 PS
    tr.append(
      mkTd(formatHora(estado.proximoEventoFinServicio)),
      mkTd(_totalCola(estado)),
      mkTd(estado.servidor.estado),
      tdEspera,
    );
  } else if (estado.topologia === "serie-paralelo") {
    const ps0 = estado.servidores[0];
    tr.append(
      mkTd(ps0.estado),
      mkTd(formatHora(ps0.tiempoFinServicio)),
      mkTd(estado.cola?.length ?? 0),
      mkTd(estado._salaEspera?.length ?? 0),
    );
    for (let i = 1; i < numPS; i++) {
      const ps = estado.servidores[i];
      tr.append(mkTd(ps.estado), mkTd(formatHora(ps.tiempoFinServicio)));
    }
    tr.append(tdEspera);
  } else {
    const perPS = estado.topologia === "serie" || estado.topologia === "paralelo";
    for (const ps of estado.servidores) {
      tr.append(mkTd(ps.estado), mkTd(formatHora(ps.tiempoFinServicio)));
      if (perPS) tr.append(mkTd(_colaDeIdx(estado, ps.idx).length));
    }
    if (!perPS) tr.append(mkTd(_totalCola(estado)));
    tr.append(tdEspera);
  }

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

  tr.appendChild(mkTdGraf(estado));
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

  // tLL: llegada única al sistema, siempre desde PS0
  const cfgLL = leerParamTiempo("tLL", "tiempoLlegada");
  const tLL   = cfgLL.modo === "fijo" ? cfgLL.valor : (cfgLL.min + cfgLL.max) / 2;

  // tS de PS0 — valor representativo para el header y backward compat
  const cfgS0 = leerParamTiempo("tS", "tiempoServicio");
  const tS    = cfgS0.modo === "fijo" ? cfgS0.valor : (cfgS0.min + cfgS0.max) / 2;

  const tiempoTotal = parseFloat(document.getElementById("tiempoSimulacion").value);

  if (isNaN(tLL) || isNaN(tS) || isNaN(tiempoTotal) || tLL <= 0 || tS <= 0) {
    logLinea("⚠️  Parámetros inválidos. Revisá los campos.");
    return null;
  }

  // Validar tLL antes de continuar
  const erroresLL = validarRangos({ tLL: cfgLL.modo === "aleatorio" ? cfgLL : null });
  if (erroresLL.length) { erroresLL.forEach(e => logLinea(e)); return null; }

  // ── Parámetros por PS: tS + modificadores + distribuciones ──
  const psParams = [];
  for (let i = 0; i < _psCount; i++) {
    const s     = i === 0 ? "" : `_${i}`;
    const panel = document.getElementById(`psPanel_${i}`);

    const cfgSi = leerParamTiempo(`tS${s}`, `tiempoServicio${s}`);
    const tSi   = cfgSi.modo === "fijo" ? cfgSi.valor : (cfgSi.min + cfgSi.max) / 2;

    const modsI   = {};
    const paramsI = {};
    const randI   = { tS: cfgSi.modo === "aleatorio" ? cfgSi : null };

    panel?.querySelectorAll(".modificador-check").forEach(cb => {
      const nombre = cb.dataset.mod;
      modsI[nombre] = cb.checked;
      if (!cb.checked) return;

      const paramInput = document.getElementById(`param_${nombre}${s}`);
      paramsI[nombre] = parseFloat(paramInput?.value) || 0;

      if (nombre === "descanso") {
        const inputT = document.getElementById(`param_descanso_trabajo${s}`);
        paramsI["descanso_trabajo"] = parseFloat(inputT?.value) || 30;
        const cfgD = leerParamTiempo(`deltaD${s}`, `param_descanso${s}`);
        const cfgT = leerParamTiempo(`deltaT${s}`, `param_descanso_trabajo${s}`);
        randI.deltaD = cfgD.modo === "aleatorio" ? cfgD : null;
        randI.deltaT = cfgT.modo === "aleatorio" ? cfgT : null;
        if (cfgD.modo === "aleatorio") paramsI.descanso         = (cfgD.min + cfgD.max) / 2;
        if (cfgT.modo === "aleatorio") paramsI.descanso_trabajo = (cfgT.min + cfgT.max) / 2;
      }
      if (nombre === "abandono") {
        const cfgA = leerParamTiempo(`abandono${s}`, `param_abandono${s}`);
        randI.abandono = cfgA.modo === "aleatorio" ? cfgA : null;
        if (cfgA.modo === "aleatorio") paramsI.abandono = (cfgA.min + cfgA.max) / 2;
      }
      if (nombre === "seguridad") {
        const cfgSeg = leerParamTiempo(`seguridad${s}`, `param_seguridad${s}`);
        randI.seguridad = cfgSeg.modo === "aleatorio" ? cfgSeg : null;
        if (cfgSeg.modo === "aleatorio") paramsI.seguridad = (cfgSeg.min + cfgSeg.max) / 2;
      }
    });

    psParams.push({ tS: tSi, randomParams: randI,
                    modificadoresActivos: modsI, paramsModificadores: paramsI });
  }

  // Validar rangos por PS
  for (let i = 0; i < _psCount; i++) {
    const errs = validarRangos(psParams[i].randomParams);
    if (errs.length) { errs.forEach(e => logLinea(`PS${i + 1}: ${e}`)); return null; }
  }

  // Backward compat: globales = PS0
  const modificadoresActivos = psParams[0]?.modificadoresActivos ?? {};
  const paramsModificadores  = psParams[0]?.paramsModificadores  ?? {};
  const randomParams = {
    tLL: cfgLL.modo === "aleatorio" ? cfgLL : null,
    ...(psParams[0]?.randomParams ?? {}),
  };

  const velocidad = parseInt(document.getElementById("velocidad")?.value) ?? 120;
  const topologia = _queueType ?? "unica";

  const capacidadSalaEspera = topologia === "serie-paralelo"
    ? (parseInt(document.getElementById("capacidadSalaEspera")?.value) || 10)
    : Infinity;

  return {
    tLL, tS, tiempoTotal,
    modificadoresActivos, paramsModificadores, randomParams,
    velocidad,
    numServidores: _psCount,
    topologia,
    psParams,
    capacidadSalaEspera,
  };
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
    imprimirFila({ evento: "V(0) — INICIO", hora: estado.tiempoActual, estado });
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

  initMultiPsUI();

});

// ─── MULTI-PS UI ─────────────────────────────────────────────────────────────

let _psCount = 1;
let _queueType = null;  // 'serie' | 'paralelo' | 'unafilavarios'
let _activePs = 0;

function initMultiPsUI() {
  document.querySelectorAll(".srv-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      _psCount = parseInt(btn.dataset.n);
      document.querySelectorAll(".srv-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      _activePs = 0;
      updatePsLayout();
    });
  });

  document.querySelectorAll(".queue-type-card").forEach(card => {
    card.addEventListener("click", () => {
      _queueType = card.dataset.type;
      document.querySelectorAll(".queue-type-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      applyQueueTypeConstraints();
    });
  });
}

function updatePsLayout() {
  const queueTypeSec = document.getElementById("queueTypeSection");
  const tabHeaders   = document.getElementById("psTabHeaders");
  const container    = document.getElementById("psPanelsContainer");

  if (_psCount === 1) {
    queueTypeSec.style.display = "none";
    tabHeaders.style.display   = "none";
    _queueType = null;
    document.querySelectorAll(".queue-type-card").forEach(c => c.classList.remove("selected"));
    // Eliminar paneles extra
    for (let i = 1; i <= 3; i++) {
      document.getElementById(`psPanel_${i}`)?.remove();
    }
    // Asegurar que PS0 esté visible y sin bloqueo de tLL
    const ps0 = document.getElementById("psPanel_0");
    if (ps0) {
      ps0.style.display = "";
      setTllDisabled(ps0.querySelector(".tll-section"), false);
    }
    return;
  }

  // Múltiples servidores
  queueTypeSec.style.display = "";
  tabHeaders.style.display   = "flex";

  // Auto-seleccionar "serie" si no hay tipo elegido
  if (!_queueType) {
    _queueType = "serie";
    document.querySelector(".queue-type-card[data-type='serie']")?.classList.add("selected");
  }

  // Crear paneles faltantes
  for (let i = 1; i < _psCount; i++) {
    if (!document.getElementById(`psPanel_${i}`)) {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = buildPsPanel(i);
      const panel = wrapper.firstElementChild;
      container.appendChild(panel);
      attachPanelListeners(panel, i);
    }
  }
  // Eliminar paneles sobrantes
  for (let i = _psCount; i <= 3; i++) {
    document.getElementById(`psPanel_${i}`)?.remove();
  }

  rebuildTabButtons();
  switchToPanel(_activePs < _psCount ? _activePs : 0);
  applyQueueTypeConstraints();
}

function rebuildTabButtons() {
  const tabHeaders = document.getElementById("psTabHeaders");
  tabHeaders.innerHTML = "";
  for (let i = 0; i < _psCount; i++) {
    const btn = document.createElement("button");
    btn.className   = "ps-tab-btn" + (i === _activePs ? " active" : "");
    btn.textContent = `PS${i + 1}`;
    btn.dataset.ps  = i;
    btn.addEventListener("click", () => {
      _activePs = i;
      tabHeaders.querySelectorAll(".ps-tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      switchToPanel(i);
    });
    tabHeaders.appendChild(btn);
  }
}

function switchToPanel(psIndex) {
  _activePs = psIndex;
  for (let i = 0; i < _psCount; i++) {
    const panel = document.getElementById(`psPanel_${i}`);
    if (panel) panel.style.display = (i === psIndex) ? "" : "none";
  }
}

function applyQueueTypeConstraints() {
  for (let i = 0; i < _psCount; i++) {
    const panel = document.getElementById(`psPanel_${i}`);
    if (!panel) continue;
    const tllSection = panel.querySelector(".tll-section");
    if (!tllSection) continue;
    // tLL se bloquea en PS2+ cuando la cola es serie, una-fila-varios-ps o serie-paralelo
    const shouldDisable = (i > 0) &&
      (_queueType === "serie" || _queueType === "unafilavarios" || _queueType === "serie-paralelo");
    setTllDisabled(tllSection, shouldDisable);
  }

  // Mostrar u ocultar la sección de capacidad de sala de espera
  const salaSection = document.getElementById("salaEsperaSection");
  if (salaSection) salaSection.style.display = _queueType === "serie-paralelo" ? "" : "none";
}

function setTllDisabled(tllSection, disabled) {
  if (!tllSection) return;
  tllSection.classList.toggle("field-disabled", disabled);
  tllSection.querySelectorAll("input").forEach(el => {
    el.disabled = disabled;
  });
}

// Adjunta los listeners de modificadores y modo-switch a un panel generado dinámicamente.
function attachPanelListeners(panel, i) {
  const s = `_${i}`;

  panel.querySelectorAll(".modificador-check").forEach(cb => {
    cb.addEventListener("change", () => {
      const nombre = cb.dataset.mod;
      const badge  = document.getElementById(`badge_${nombre}${s}`);
      const row    = document.getElementById(`param-row_${nombre}${s}`);
      const input  = document.getElementById(`param_${nombre}${s}`);

      if (input) input.disabled = !cb.checked;
      if (badge) {
        badge.textContent = cb.checked ? "ON" : "OFF";
        badge.classList.toggle("on", cb.checked);
      }
      if (row) {
        row.classList.toggle("activo", cb.checked);
        row.querySelectorAll(".modo-switch, .rango-min, .rango-max, input[type='number']").forEach(el => {
          el.disabled = !cb.checked;
        });
      }
      if (nombre === "descanso") {
        const extra = document.getElementById(`param_descanso_trabajo${s}`);
        if (extra) extra.disabled = !cb.checked;
      }
    });
  });

  panel.querySelectorAll(".modo-switch").forEach(sw => {
    sw.addEventListener("change", () => {
      const key     = sw.dataset.key;
      const fijoDiv = document.getElementById(`fijo_${key}`);
      const aleaDiv = document.getElementById(`alea_${key}`);
      if (fijoDiv) fijoDiv.style.display = sw.checked ? "none" : "";
      if (aleaDiv) aleaDiv.style.display = sw.checked ? ""     : "none";

      const modPadre  = sw.closest(".mod-param");
      const modActivo = modPadre ? modPadre.classList.contains("activo") : true;
      if (modActivo) {
        fijoDiv?.querySelectorAll("input").forEach(inp => inp.disabled =  sw.checked);
        aleaDiv?.querySelectorAll("input").forEach(inp => inp.disabled = !sw.checked);
      }
    });
  });
}

// Genera el HTML completo para un panel PS (i >= 1).
function buildPsPanel(i) {
  const s = `_${i}`;
  return `
<div class="ps-panel" id="psPanel${s}" data-ps-index="${i}">

  <div class="vector-display">
    <span class="vector-title">Vector Inicial</span>
    <div class="vector-values">
      <span>Hora:&nbsp;<b id="vi_disp_hora${s}">0</b></span>
      <span class="vi-sep">|</span>
      <span>Cola:&nbsp;<b id="vi_disp_cola${s}">0</b></span>
      <span class="vi-sep">|</span>
      <span>Servidor:&nbsp;<b id="vi_disp_servidor${s}">LIBRE</b></span>
    </div>
    <button onclick="abrirModalVector(${i})">✏ Editar Vector Inicial</button>
  </div>

  <p><strong>Parámetros de Simulación</strong></p>

  <div class="modifiers" id="modifiers${s}">

    <div class="mod-item">
      <label class="mod-header">
        <input type="checkbox" class="modificador-check" data-mod="descanso" />
        <span>Descanso</span>
        <span class="mod-badge" id="badge_descanso${s}">OFF</span>
      </label>
      <div class="mod-param" id="param-row_descanso${s}">
        <span class="param-label">Duración descanso ΔD (s)</span>
        <div class="tiempo-control">
          <div class="switch-row">
            <span class="switch-label">Fijo</span>
            <label class="switch">
              <input type="checkbox" class="modo-switch" data-key="deltaD${s}" disabled />
              <span class="slider-switch"></span>
            </label>
            <span class="switch-label">Aleatorio</span>
          </div>
          <div class="tc-fijo" id="fijo_deltaD${s}">
            <input type="number" disabled id="param_descanso${s}" placeholder="Descanso (s)" value="60" />
          </div>
          <div class="tc-aleatorio" id="alea_deltaD${s}" style="display:none">
            <input type="number" disabled class="rango-min" data-key="deltaD${s}" placeholder="Mín (s)" value="40" />
            <input type="number" disabled class="rango-max" data-key="deltaD${s}" placeholder="Máx (s)" value="80" />
          </div>
        </div>
        <span class="param-label">Duración trabajo ΔT (s)</span>
        <div class="tiempo-control">
          <div class="switch-row">
            <span class="switch-label">Fijo</span>
            <label class="switch">
              <input type="checkbox" class="modo-switch" data-key="deltaT${s}" disabled />
              <span class="slider-switch"></span>
            </label>
            <span class="switch-label">Aleatorio</span>
          </div>
          <div class="tc-fijo" id="fijo_deltaT${s}">
            <input type="number" disabled id="param_descanso_trabajo${s}" placeholder="Trabajo (s)" value="30" />
          </div>
          <div class="tc-aleatorio" id="alea_deltaT${s}" style="display:none">
            <input type="number" disabled class="rango-min" data-key="deltaT${s}" placeholder="Mín (s)" value="20" />
            <input type="number" disabled class="rango-max" data-key="deltaT${s}" placeholder="Máx (s)" value="40" />
          </div>
        </div>
      </div>
    </div>

    <div class="mod-item">
      <label class="mod-header">
        <input type="checkbox" class="modificador-check" data-mod="abandono" />
        <span>Abandono</span>
        <span class="mod-badge" id="badge_abandono${s}">OFF</span>
      </label>
      <div class="mod-param" id="param-row_abandono${s}">
        <span class="param-label">Paciencia del cliente (s)</span>
        <div class="tiempo-control">
          <div class="switch-row">
            <span class="switch-label">Fijo</span>
            <label class="switch">
              <input type="checkbox" class="modo-switch" data-key="abandono${s}" disabled />
              <span class="slider-switch"></span>
            </label>
            <span class="switch-label">Aleatorio</span>
          </div>
          <div class="tc-fijo" id="fijo_abandono${s}">
            <input type="number" disabled id="param_abandono${s}" placeholder="Paciencia (s)" value="10" />
          </div>
          <div class="tc-aleatorio" id="alea_abandono${s}" style="display:none">
            <input type="number" disabled class="rango-min" data-key="abandono${s}" placeholder="Mín (s)" value="5" />
            <input type="number" disabled class="rango-max" data-key="abandono${s}" placeholder="Máx (s)" value="20" />
          </div>
        </div>
      </div>
    </div>

    <div class="mod-item">
      <label class="mod-header">
        <input type="checkbox" class="modificador-check" data-mod="prioridades" />
        <span>Prioridades</span>
        <span class="mod-badge" id="badge_prioridades${s}">OFF</span>
      </label>
      <div class="mod-param" id="param-row_prioridades${s}">
        <span class="param-label">Intervalo llegada tipo B (s)</span>
        <input type="number" disabled id="param_prioridades${s}" placeholder="tLL tipo B (s)" value="45" />
      </div>
    </div>

    <div class="mod-item">
      <label class="mod-header">
        <input type="checkbox" class="modificador-check" data-mod="seguridad" />
        <span>Zona de Seguridad</span>
        <span class="mod-badge" id="badge_seguridad${s}">OFF</span>
      </label>
      <div class="mod-param" id="param-row_seguridad${s}">
        <span class="param-label">Tiempo de cruce ZS (s)</span>
        <div class="tiempo-control">
          <div class="switch-row">
            <span class="switch-label">Fijo</span>
            <label class="switch">
              <input type="checkbox" class="modo-switch" data-key="seguridad${s}" disabled />
              <span class="slider-switch"></span>
            </label>
            <span class="switch-label">Aleatorio</span>
          </div>
          <div class="tc-fijo" id="fijo_seguridad${s}">
            <input type="number" disabled id="param_seguridad${s}" placeholder="Tiempo cruce ZS (s)" value="5" />
          </div>
          <div class="tc-aleatorio" id="alea_seguridad${s}" style="display:none">
            <input type="number" disabled class="rango-min" data-key="seguridad${s}" placeholder="Mín (s)" value="3" />
            <input type="number" disabled class="rango-max" data-key="seguridad${s}" placeholder="Máx (s)" value="10" />
          </div>
        </div>
      </div>
    </div>

    <div class="mod-item">
      <label class="mod-header">
        <input type="checkbox" class="modificador-check" data-mod="desvio" />
        <span>Desvío (sin cola)</span>
        <span class="mod-badge" id="badge_desvio${s}">OFF</span>
      </label>
      <div class="mod-param" id="param-row_desvio${s}">
        <span class="param-label">Clientes que llegan con PS ocupado son desviados inmediatamente</span>
      </div>
    </div>

  </div>

  <br />

  <div class="tll-section">
    <h5>Tiempo de Llegada (s)</h5>
    <div class="tiempo-control">
      <div class="switch-row">
        <span class="switch-label">Fijo</span>
        <label class="switch">
          <input type="checkbox" class="modo-switch" data-key="tLL${s}" />
          <span class="slider-switch"></span>
        </label>
        <span class="switch-label">Aleatorio</span>
      </div>
      <div class="tc-fijo" id="fijo_tLL${s}">
        <input type="number" id="tiempoLlegada${s}" value="35" />
      </div>
      <div class="tc-aleatorio" id="alea_tLL${s}" style="display:none">
        <input type="number" class="rango-min" data-key="tLL${s}" placeholder="Mín (s)" value="20" />
        <input type="number" class="rango-max" data-key="tLL${s}" placeholder="Máx (s)" value="50" />
      </div>
    </div>
  </div>

  <h5>Tiempo de Servicio (s)</h5>
  <div class="tiempo-control">
    <div class="switch-row">
      <span class="switch-label">Fijo</span>
      <label class="switch">
        <input type="checkbox" class="modo-switch" data-key="tS${s}" />
        <span class="slider-switch"></span>
      </label>
      <span class="switch-label">Aleatorio</span>
    </div>
    <div class="tc-fijo" id="fijo_tS${s}">
      <input type="number" id="tiempoServicio${s}" value="40" />
    </div>
    <div class="tc-aleatorio" id="alea_tS${s}" style="display:none">
      <input type="number" class="rango-min" data-key="tS${s}" placeholder="Mín (s)" value="25" />
      <input type="number" class="rango-max" data-key="tS${s}" placeholder="Máx (s)" value="55" />
    </div>
  </div>

</div>`.trim();
}

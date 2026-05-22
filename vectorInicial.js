// ============================================================
// vectorInicial.js — Vector Inicial V(0) de la simulación
// ============================================================
// Tabla dinámica en modal: columnas según modificadores activos
// y condiciones (Ts solo si PS=OCUPADO, Tz solo si Zs=OCUPADO).
// La lógica de aplicar() usa los campos de maty (Qa, PS, Ts…).
// ============================================================

window.vectorInicial = {

  // ── Estado persistente entre aperturas del modal ──────────
  _state: {
    vi_Qa: "0", vi_PS: "LIBRE",  vi_Ts:  "0",
    vi_Te: "0", vi_S:  "trabajando", vi_Ttd: "0",
    vi_Qb: "0", vi_Zs: "LIBRE",  vi_Tz:  "0",
  },

  // ── Definición de columnas ────────────────────────────────
  _COLS: [
    { id: "vi_Qa",  label: "Qa",  sub: "Personas en cola",    type: "number", mod: null,          cond: null,         min: 0 },
    { id: "vi_PS",  label: "PS",  sub: "Estado del servidor", type: "select", mod: null,          cond: null,         opts: ["LIBRE","OCUPADO"] },
    { id: "vi_Ts",  label: "Ts",  sub: "Ya servido (s)",      type: "number", mod: null,          cond: "PS_OCUPADO", min: 0 },
    { id: "vi_Te",  label: "Te",  sub: "Espera en cola (s)",  type: "number", mod: "abandono",    cond: null,         min: 0 },
    { id: "vi_S",   label: "S",   sub: "Estado descanso",     type: "select", mod: "descanso",    cond: null,         opts: ["trabajando","descansando"] },
    { id: "vi_Ttd", label: "Ttd", sub: "Tiempo estado (s)",   type: "number", mod: "descanso",    cond: null,         min: 0 },
    { id: "vi_Qb",  label: "Qb",  sub: "Cola tipo B",         type: "number", mod: "prioridades", cond: null,         min: 0 },
    { id: "vi_Zs",  label: "Zs",  sub: "Zona de Seguridad",   type: "select", mod: "seguridad",   cond: "PS_LIBRE",   opts: ["LIBRE","OCUPADO"] },
    { id: "vi_Tz",  label: "Tz",  sub: "Tiempo en zona (s)",  type: "number", mod: "seguridad",   cond: "ZS_OCUPADO", min: 0 },
  ],

  // ── Leer campos: DOM primero, _state como fallback ────────
  leer() {
    const get = (id, fallback) => {
      const el = document.getElementById(id);
      return el ? el.value : (this._state[id] ?? fallback);
    };
    return {
      Qa:  parseInt(get("vi_Qa",  "0"))    || 0,
      PS:  get("vi_PS", "LIBRE"),
      Ts:  parseFloat(get("vi_Ts", "0"))   || 0,
      S:   get("vi_S",  "trabajando"),
      Ttd: parseFloat(get("vi_Ttd", "0"))  || 0,
      Qb:  parseInt(get("vi_Qb",  "0"))    || 0,
      Te:  parseFloat(get("vi_Te", "0"))   || 0,
      Zs:  get("vi_Zs", "LIBRE"),
      Tz:  parseFloat(get("vi_Tz", "0"))   || 0,
    };
  },

  // ── Guardar valores actuales del DOM → _state ─────────────
  _guardarState() {
    for (const col of this._COLS) {
      const el = document.getElementById(col.id);
      if (el) this._state[col.id] = el.value;
    }
  },

  // ── Construir la tabla dinámica en el modal ───────────────
  _renderTablaModal() {
    this._guardarState();

    const mods = {};
    document.querySelectorAll(".modificador-check").forEach(cb => {
      mods[cb.dataset.mod] = cb.checked;
    });

    const psVal = this._state.vi_PS ?? "LIBRE";
    const zsVal = this._state.vi_Zs ?? "LIBRE";

    const condMap = {
      "PS_OCUPADO": psVal === "OCUPADO",
      "PS_LIBRE":   psVal === "LIBRE",
      "ZS_OCUPADO": psVal === "LIBRE" && zsVal === "OCUPADO",
    };

    const cols = this._COLS.filter(col => {
      if (col.mod && !mods[col.mod]) return false;
      if (col.cond && !condMap[col.cond]) return false;
      return true;
    });

    const container = document.getElementById("vectorModalContent");
    if (!container) return;
    container.innerHTML = "";

    const table  = document.createElement("table");
    table.className = "vi-table";
    const thead  = document.createElement("thead");
    const tbody  = document.createElement("tbody");
    const trHead = document.createElement("tr");
    const trBody = document.createElement("tr");

    let primerMod = true;

    cols.forEach(col => {
      const sepLeft = col.mod && primerMod;
      if (col.mod) primerMod = false;

      const th = document.createElement("th");
      th.innerHTML = `${col.label}<br><small>${col.sub}</small>`;
      if (col.mod)  th.classList.add(`mod-${col.mod}`);
      if (sepLeft)  th.classList.add("sep-left");
      trHead.appendChild(th);

      const td = document.createElement("td");
      if (col.mod)  td.classList.add(`mod-${col.mod}`);
      if (sepLeft)  td.classList.add("sep-left");

      if (col.type === "select") {
        const sel = document.createElement("select");
        sel.id = col.id;
        (col.opts || []).forEach(opt => {
          const o = document.createElement("option");
          o.value = opt;
          o.textContent = opt;
          sel.appendChild(o);
        });
        sel.value = this._state[col.id] ?? col.opts[0];
        // PS y Zs controlan columnas condicionales: re-renderizar al cambiar
        if (col.id === "vi_PS" || col.id === "vi_Zs") {
          sel.addEventListener("change", () => this._renderTablaModal());
        }
        td.appendChild(sel);
      } else {
        const inp = document.createElement("input");
        inp.type  = "number";
        inp.id    = col.id;
        inp.min   = col.min ?? 0;
        inp.value = this._state[col.id] ?? "0";
        td.appendChild(inp);
      }

      trBody.appendChild(td);
    });

    thead.appendChild(trHead);
    tbody.appendChild(trBody);
    table.append(thead, tbody);
    container.appendChild(table);
  },

  // ── Actualizar display compacto del panel ─────────────────
  _actualizarDisplay() {
    const vi = this.leer();
    const c = document.getElementById("vi_disp_cola");
    const s = document.getElementById("vi_disp_servidor");
    if (c) c.textContent = vi.Qa + (vi.Qb || 0);
    if (s) s.textContent = vi.PS;
  },

  // ── Aplicar el V(0) al estado del motor ──────────────────
  // Se llama DESPUÉS de que todos los modificadores corrieron
  // sus hooks onIniciar, para sobrescribir sus valores.
  aplicar(estado, params) {
    const vi   = this.leer();
    const mods = params.modificadoresActivos || {};

    // 1. Cola A
    for (let i = 0; i < vi.Qa; i++) {
      estado.clienteIdCounter++;
      estado.cola.push({
        id:                   estado.clienteIdCounter,
        tiempoLlegada:        0,
        tiempoInicioServicio: null,
        prioridad:            mods.prioridades ? 1 : 0,
        tipo:                 "A",
      });
    }

    // 2. Cola B (solo si prioridades activo)
    if (mods.prioridades && vi.Qb > 0) {
      for (let i = 0; i < vi.Qb; i++) {
        estado.clienteIdCounter++;
        estado.cola.push({
          id:                   estado.clienteIdCounter,
          tiempoLlegada:        0,
          tiempoInicioServicio: null,
          prioridad:            0,
          tipo:                 "B",
        });
      }
    }
    if (estado.cola.length > 1) {
      estado.cola.sort((a, b) => b.prioridad - a.prioridad);
    }

    // 2b. Abandono: asignar tiempoLimite según Te ya esperado
    if (mods.abandono && vi.Te > 0 && estado.cola.length > 0) {
      for (const cliente of estado.cola) {
        const pacienciaBase = estado.paramsModificadores?.abandono ?? 10;
        const paciencia     = sortearTiempo(pacienciaBase, estado.randomParams?.abandono);
        cliente.tiempoLimite = Math.max(0.5, paciencia - vi.Te);
      }
      const minLimite = estado.cola.reduce((m, c) => Math.min(m, c.tiempoLimite ?? Infinity), Infinity);
      estado._eventosExtra.abandono = isFinite(minLimite) ? minLimite : null;
    }

    // 3. Cliente en PS
    if (vi.PS === "OCUPADO") {
      estado.clienteIdCounter++;
      const clientePS = {
        id:                   estado.clienteIdCounter,
        tiempoLlegada:        0,
        tiempoInicioServicio: 0,
        prioridad:            mods.prioridades ? 1 : 0,
        tipo:                 "A",
      };
      const tSTotal  = sortearTiempo(estado.tS, estado.randomParams?.tS);
      const restante = Math.max(0.5, tSTotal - vi.Ts);
      clientePS._tiempoRestante       = restante;
      estado.clienteEnServicio        = clientePS;
      estado.servidor.estado          = "OCUPADO";
      estado.proximoEventoFinServicio = restante;
    }

    // 4. Descanso
    if (mods.descanso) {
      if (vi.S === "descansando") {
        estado._servidorPresente = false;
        estado._servidorAusente  = true;
        const dD = sortearTiempo(
          estado.paramsModificadores?.descanso ?? 60,
          estado.randomParams?.deltaD
        );
        const restDescanso = Math.max(0.5, dD - vi.Ttd);
        estado._eventosExtra.servidor_salida  = null;
        estado._eventosExtra.servidor_llegada = restDescanso;
        if (vi.PS === "OCUPADO" && estado.clienteEnServicio) {
          estado.clienteEnServicio._tiempoRestante = estado.proximoEventoFinServicio;
        }
      } else {
        if (estado._eventosExtra.servidor_salida != null) {
          estado._eventosExtra.servidor_salida = Math.max(
            0.5,
            estado._eventosExtra.servidor_salida - vi.Ttd
          );
        }
      }
    }

    // 5. Zona de Seguridad (solo si PS=LIBRE)
    if (mods.seguridad && vi.PS === "LIBRE" && vi.Zs === "OCUPADO") {
      estado.clienteIdCounter++;
      const clienteZS = {
        id:                   estado.clienteIdCounter,
        tiempoLlegada:        0,
        tiempoInicioServicio: null,
        prioridad:            0,
        tipo:                 "A",
      };
      estado.zonaSeguridad = "OCUPADO";
      estado.clienteEnZona = clienteZS;
      const tzBase     = estado.paramsModificadores?.seguridad ?? 5;
      const tzTotal    = sortearTiempo(tzBase, estado.randomParams?.seguridad);
      const restanteZS = Math.max(0.5, tzTotal - vi.Tz);
      estado._eventosExtra.zs = restanteZS;
    }
  },

  // ── Inicializar UI ────────────────────────────────────────
  inicializarUI() {
    this._actualizarDisplay();

    document.getElementById("modalVector")?.addEventListener("click", (e) => {
      if (e.target.id === "modalVector") cerrarModalVector();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") cerrarModalVector();
    });
  },
};

// ── Funciones globales del modal ─────────────────────────────
function abrirModalVector() {
  const modal = document.getElementById("modalVector");
  if (!modal) return;
  window.vectorInicial._renderTablaModal();
  modal.classList.add("activo");
}

function cerrarModalVector() {
  const modal = document.getElementById("modalVector");
  if (modal) modal.classList.remove("activo");
}

function guardarVectorInicial() {
  window.vectorInicial._guardarState();
  window.vectorInicial._actualizarDisplay();
  cerrarModalVector();
}

function resetVectorInicial() {
  window.vectorInicial._state = {
    vi_Qa: "0", vi_PS: "LIBRE",  vi_Ts:  "0",
    vi_Te: "0", vi_S:  "trabajando", vi_Ttd: "0",
    vi_Qb: "0", vi_Zs: "LIBRE",  vi_Tz:  "0",
  };
  window.vectorInicial._renderTablaModal();
  window.vectorInicial._actualizarDisplay();
}

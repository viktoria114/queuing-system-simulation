// ============================================================
// vectorInicial.js — Vector Inicial V(0) de la simulación
// ============================================================

window.vectorInicial = {

  _currentPsIdx: 0,
  _lastRenderedPsIdx: null,

  // Estado por PS: _states[0] = PS1, _states[1] = PS2, etc.
  _states: [
    {
      vi_hora: "0",
      vi_Qa: "0", vi_PS: "LIBRE",  vi_Ts:  "0",
      vi_Te: "0", vi_S:  "trabajando", vi_Ttd: "0",
      vi_Qb: "0", vi_Zs: "LIBRE",  vi_Tz:  "0",
      vi_proxLlegada: "", vi_proxLlegadaA: "", vi_proxLlegadaB: "",
    }
  ],

  _defaultState(psIdx) {
    if (psIdx === 0) return {
      vi_hora: "0", vi_Qa: "0", vi_PS: "LIBRE", vi_Ts: "0",
      vi_Te: "0", vi_S: "trabajando", vi_Ttd: "0",
      vi_Qb: "0", vi_Zs: "LIBRE", vi_Tz: "0",
      vi_proxLlegada: "", vi_proxLlegadaA: "", vi_proxLlegadaB: "",
    };
    return {
      vi_Qa: "0", vi_PS: "LIBRE", vi_Ts: "0",
      vi_S: "trabajando", vi_Ttd: "0",
      vi_Zs: "LIBRE", vi_Tz: "0",
    };
  },

  _getState(psIdx) {
    if (!this._states[psIdx]) this._states[psIdx] = this._defaultState(psIdx);
    return this._states[psIdx];
  },

  // ── Definición de columnas ────────────────────────────────
  // psOnly0:      true = solo visible para PS0 (columnas globales del sistema)
  // hideForUnaFila: true = ocultar en PS1+ cuando la topología es "unafilavarios"
  _COLS: [
    { id: "vi_hora",         label: "Hora",         sub: "Tiempo inicial (s)",  type: "number", mod: null,          modNot: null,           cond: null,         min: 0,  psOnly0: true },
    { id: "vi_Qa",           label: "Qa",            sub: "Personas en cola",   type: "number", mod: null,          modNot: null,           cond: null,         min: 0,  hideForUnaFila: true },
    { id: "vi_PS",           label: "PS",            sub: "Estado del servidor",type: "select", mod: null,          modNot: null,           cond: null,                  opts: ["LIBRE","OCUPADO"] },
    { id: "vi_Ts",           label: "Ts",            sub: "Ya servido (s)",     type: "number", mod: null,          modNot: null,           cond: "PS_OCUPADO", min: 0 },
    { id: "vi_Te",           label: "Te",            sub: "Espera en cola (s)", type: "number", mod: "abandono",    modNot: null,           cond: null,         min: 0,  psOnly0: true },
    { id: "vi_S",            label: "S",             sub: "Estado descanso",    type: "select", mod: "descanso",    modNot: null,           cond: null,                  opts: ["trabajando","descansando"] },
    { id: "vi_Ttd",          label: "Ttd",           sub: "Tiempo estado (s)",  type: "number", mod: "descanso",    modNot: null,           cond: null,         min: 0 },
    { id: "vi_Qb",           label: "Qb",            sub: "Cola tipo B",        type: "number", mod: "prioridades", modNot: null,           cond: null,         min: 0,  psOnly0: true },
    { id: "vi_Zs",           label: "Zs",            sub: "Zona de Seguridad",  type: "select", mod: "seguridad",   modNot: null,           cond: "PS_LIBRE",            opts: ["LIBRE","OCUPADO"] },
    { id: "vi_Tz",           label: "Tz",            sub: "Tiempo en zona (s)", type: "number", mod: "seguridad",   modNot: null,           cond: "ZS_OCUPADO", min: 0 },
    { id: "vi_proxLlegada",  label: "Próx. Llegada", sub: "Tiempo abs. (s)",    type: "number", mod: null,          modNot: "prioridades",  cond: null,         min: 0,  psOnly0: true },
    { id: "vi_proxLlegadaA", label: "Próx. Leg. A",  sub: "Tiempo abs. (s)",    type: "number", mod: "prioridades", modNot: null,           cond: null,         min: 0,  psOnly0: true },
    { id: "vi_proxLlegadaB", label: "Próx. Leg. B",  sub: "Tiempo abs. (s)",    type: "number", mod: "prioridades", modNot: null,           cond: null,         min: 0,  psOnly0: true },
  ],

  _leerPS(psIdx) {
    const st = this._getState(psIdx);
    const parseNum = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
    return {
      hora:         psIdx === 0 ? (parseFloat(st.vi_hora) || 0) : 0,
      Qa:           parseInt(st.vi_Qa)    || 0,
      PS:           st.vi_PS  ?? "LIBRE",
      Ts:           parseFloat(st.vi_Ts)  || 0,
      S:            st.vi_S   ?? "trabajando",
      Ttd:          parseFloat(st.vi_Ttd) || 0,
      Qb:           psIdx === 0 ? (parseInt(st.vi_Qb) || 0) : 0,
      Te:           parseFloat(st.vi_Te)  || 0,
      Zs:           st.vi_Zs  ?? "LIBRE",
      Tz:           parseFloat(st.vi_Tz)  || 0,
      proxLlegada:  psIdx === 0 ? parseNum(st.vi_proxLlegada  ?? "") : null,
      proxLlegadaA: psIdx === 0 ? parseNum(st.vi_proxLlegadaA ?? "") : null,
      proxLlegadaB: psIdx === 0 ? parseNum(st.vi_proxLlegadaB ?? "") : null,
    };
  },

  // Alias backward-compat para PS0
  leer() { return this._leerPS(0); },

  _guardarState() {
    const st = this._getState(this._currentPsIdx);
    for (const col of this._COLS) {
      const el = document.getElementById(col.id);
      if (el) st[col.id] = el.value;
    }
  },

  _renderTablaModal() {
    // Solo guardar el DOM si estamos re-renderizando el mismo PS (p.ej. al cambiar PS LIBRE↔OCUPADO).
    // Si cambiamos de PS, no guardar: los valores del DOM pertenecen al PS anterior.
    if (this._lastRenderedPsIdx === this._currentPsIdx) {
      this._guardarState();
    }
    this._lastRenderedPsIdx = this._currentPsIdx;

    const psIdx  = this._currentPsIdx;
    const st     = this._getState(psIdx);

    // Leer mods del panel correcto
    const panel  = document.getElementById(`psPanel_${psIdx}`);
    const mods   = {};
    (panel || document).querySelectorAll(".modificador-check").forEach(cb => {
      mods[cb.dataset.mod] = cb.checked;
    });

    const topologia = (typeof _queueType !== "undefined") ? _queueType : null;

    const psVal = st.vi_PS ?? "LIBRE";
    const zsVal = st.vi_Zs ?? "LIBRE";

    const condMap = {
      "PS_OCUPADO": psVal === "OCUPADO",
      "PS_LIBRE":   psVal === "LIBRE",
      "ZS_OCUPADO": psVal === "LIBRE" && zsVal === "OCUPADO",
    };

    const cols = this._COLS.filter(col => {
      if (col.mod    && !mods[col.mod])    return false;
      if (col.modNot &&  mods[col.modNot]) return false;
      if (col.cond   && !condMap[col.cond]) return false;
      if (psIdx > 0  &&  col.psOnly0)      return false;
      if (psIdx > 0  &&  col.hideForUnaFila && topologia === "unafilavarios") return false;
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
          o.value = opt; o.textContent = opt;
          sel.appendChild(o);
        });
        sel.value = st[col.id] ?? col.opts[0];
        if (col.id === "vi_PS" || col.id === "vi_Zs") {
          sel.addEventListener("change", () => this._renderTablaModal());
        }
        td.appendChild(sel);
      } else {
        const inp = document.createElement("input");
        inp.type  = "number";
        inp.id    = col.id;
        inp.min   = col.min ?? 0;
        const esOpcional = col.id.startsWith("vi_proxLlegada");
        inp.placeholder = esOpcional ? "auto" : "";
        inp.value = esOpcional
          ? (st[col.id] ?? "")
          : (st[col.id] ?? "0");
        td.appendChild(inp);
      }

      trBody.appendChild(td);
    });

    thead.appendChild(trHead);
    tbody.appendChild(trBody);
    table.append(thead, tbody);
    container.appendChild(table);
  },

  _actualizarDisplay(psIdx = 0) {
    const suffix = psIdx === 0 ? "" : `_${psIdx}`;
    const vi = this._leerPS(psIdx);
    const h  = document.getElementById(`vi_disp_hora${suffix}`);
    const c  = document.getElementById(`vi_disp_cola${suffix}`);
    const s  = document.getElementById(`vi_disp_servidor${suffix}`);
    if (h) h.textContent = psIdx === 0 ? (vi.hora || 0) : "─";
    if (c) c.textContent = vi.Qa + (vi.Qb || 0);
    if (s) s.textContent = vi.PS;
  },

  aplicar(estado, params) {
    const vi0   = this._leerPS(0);
    const mods0 = params.psParams?.[0]?.modificadoresActivos ?? params.modificadoresActivos ?? {};
    // En topología "paralelo", PS0 usa colas[0], no cola global
    const cola0 = estado.colaPS(0);

    // ── PS0 ──────────────────────────────────────────────────

    // 1. Cola A
    for (let i = 0; i < vi0.Qa; i++) {
      estado.clienteIdCounter++;
      cola0.push({
        id:                   estado.clienteIdCounter,
        tiempoLlegada:        0,
        tiempoInicioServicio: null,
        prioridad:            mods0.prioridades ? 1 : 0,
        tipo:                 "A",
      });
    }

    // 2. Cola B
    if (mods0.prioridades && vi0.Qb > 0) {
      for (let i = 0; i < vi0.Qb; i++) {
        estado.clienteIdCounter++;
        cola0.push({
          id:                   estado.clienteIdCounter,
          tiempoLlegada:        0,
          tiempoInicioServicio: null,
          prioridad:            0,
          tipo:                 "B",
        });
      }
    }
    if (cola0.length > 1) {
      cola0.sort((a, b) => b.prioridad - a.prioridad);
    }

    // 2b. Abandono: asignar tiempoLimite a los clientes en cola
    if (mods0.abandono && cola0.length > 0) {
      for (const cliente of cola0) {
        const pacienciaBase = estado.paramsModificadores?.abandono ?? 10;
        const paciencia     = sortearTiempo(pacienciaBase, estado.randomParams?.abandono);
        cliente["tiempoLimite_ps0"] = Math.max(0.5, paciencia - vi0.Te);
      }
      const minLimite = cola0.reduce((m, c) => Math.min(m, c["tiempoLimite_ps0"] ?? Infinity), Infinity);
      estado._eventosExtra.abandono_ps0 = isFinite(minLimite) ? minLimite : null;
    }

    // 3. Cliente en PS0
    if (vi0.PS === "OCUPADO") {
      estado.clienteIdCounter++;
      const clientePS = {
        id:                   estado.clienteIdCounter,
        tiempoLlegada:        0,
        tiempoInicioServicio: 0,
        prioridad:            mods0.prioridades ? 1 : 0,
        tipo:                 "A",
      };
      const tSTotal  = sortearTiempo(estado.tS, estado.randomParams?.tS);
      const restante = Math.max(0.5, tSTotal - vi0.Ts);
      clientePS._tiempoRestante       = restante;
      estado.clienteEnServicio        = clientePS;
      estado.servidor.estado          = "OCUPADO";
      estado.proximoEventoFinServicio = restante;
      estado.stats._servidorOcupadoDesde = 0;
    }

    // 4. Descanso PS0
    if (mods0.descanso) {
      if (vi0.S === "descansando") {
        estado._servidorPresente = false;
        estado._servidorAusente  = true;
        const dD = sortearTiempo(
          estado.paramsModificadores?.descanso ?? 60,
          estado.randomParams?.deltaD
        );
        const restDescanso = Math.max(0.5, dD - vi0.Ttd);
        estado._eventosExtra.servidor_salida_ps0  = null;
        estado._eventosExtra.servidor_llegada_ps0 = restDescanso;
        if (vi0.PS === "OCUPADO" && estado.clienteEnServicio) {
          estado.clienteEnServicio._tiempoRestante = estado.proximoEventoFinServicio;
        }
      } else {
        if (estado._eventosExtra.servidor_salida_ps0 != null) {
          estado._eventosExtra.servidor_salida_ps0 = Math.max(
            0.5,
            estado._eventosExtra.servidor_salida_ps0 - vi0.Ttd
          );
        }
      }
    }

    // 5. Zona de Seguridad (PS0)
    if (mods0.seguridad && vi0.PS === "LIBRE" && vi0.Zs === "OCUPADO") {
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
      const restanteZS = Math.max(0.5, tzTotal - vi0.Tz);
      estado._eventosExtra.zs = restanteZS;
    }

    // 5b. Auto-start PS0: si libre + cola + no ausente + no ZS ocupada
    const _zsOcupado0 = mods0.seguridad && vi0.Zs === "OCUPADO";
    if (vi0.PS !== "OCUPADO" && cola0.length > 0 && !estado._servidorAusente && !_zsOcupado0) {
      const siguiente = cola0.shift();
      siguiente.tiempoInicioServicio = estado.tiempoActual;
      estado.clienteEnServicio = siguiente;
      estado.servidor.estado = "OCUPADO";
      const duracion = sortearTiempo(estado.tS, estado.randomParams?.tS);
      estado.proximoEventoFinServicio = estado.tiempoActual + duracion;
      estado.stats._servidorOcupadoDesde = estado.tiempoActual;
    }

    // ── PS1+ ─────────────────────────────────────────────────
    const topologia = estado.topologia;
    for (let i = 1; i < estado.numServidores; i++) {
      const viI   = this._leerPS(i);
      const modsI = params.psParams?.[i]?.modificadoresActivos ?? {};
      const ps    = estado.servidores[i];

      // Cola del PS i (no para unafilavarios ni para serie-paralelo PS2+, que comparten _salaEspera)
      const esSalaCompartida = topologia === "unafilavarios" ||
        (topologia === "serie-paralelo" && i > 1);
      if (!esSalaCompartida) {
        const colaI = estado.colaPS(i);
        for (let j = 0; j < viI.Qa; j++) {
          estado.clienteIdCounter++;
          colaI.push({
            id:                   estado.clienteIdCounter,
            tiempoLlegada:        0,
            tiempoInicioServicio: null,
            prioridad:            0,
            tipo:                 "A",
          });
        }
      }

      // Cliente en PS i
      if (viI.PS === "OCUPADO") {
        estado.clienteIdCounter++;
        const clientePS = {
          id:                   estado.clienteIdCounter,
          tiempoLlegada:        0,
          tiempoInicioServicio: 0,
          prioridad:            0,
          tipo:                 "A",
        };
        const tSTotal  = sortearTiempo(ps.tS, ps.randomParams?.tS);
        const restante = Math.max(0.5, tSTotal - viI.Ts);
        clientePS._tiempoRestante = restante;
        ps.clienteEnServicio      = clientePS;
        ps.estado                 = "OCUPADO";
        ps.tiempoFinServicio      = restante;
        ps._ocupadoDesde          = 0;
      }

      // Descanso PS i
      if (modsI.descanso) {
        const salidaKey  = `servidor_salida_ps${i}`;
        const llegadaKey = `servidor_llegada_ps${i}`;
        if (viI.S === "descansando") {
          ps._presente = false;
          ps._ausente  = true;
          const dD = sortearTiempo(
            ps.paramsModificadores?.descanso ?? 60,
            ps.randomParams?.deltaD
          );
          const restDescanso = Math.max(0.5, dD - viI.Ttd);
          estado._eventosExtra[salidaKey]  = null;
          estado._eventosExtra[llegadaKey] = restDescanso;
          if (viI.PS === "OCUPADO" && ps.clienteEnServicio) {
            ps.clienteEnServicio._tiempoRestante = ps.tiempoFinServicio;
          }
        } else {
          if (estado._eventosExtra[salidaKey] != null) {
            estado._eventosExtra[salidaKey] = Math.max(
              0.5,
              estado._eventosExtra[salidaKey] - viI.Ttd
            );
          }
        }
      }

      // Auto-start PS i: si libre + cola + no ausente
      const colaI = estado.colaPS(i);
      if (viI.PS !== "OCUPADO" && colaI.length > 0 && !ps._ausente) {
        const siguiente = colaI.shift();
        siguiente.tiempoInicioServicio = 0;
        ps.clienteEnServicio = siguiente;
        ps.estado = "OCUPADO";
        const duracion = sortearTiempo(ps.tS, ps.randomParams?.tS);
        ps.tiempoFinServicio = duracion;
        ps._ocupadoDesde = 0;
      }
    }

    // 6. Shift de hora (global, basado en PS0)
    if (vi0.hora > 0) {
      estado.tiempoActual = vi0.hora;
      if (estado.proximoEventoLlegada     != null) estado.proximoEventoLlegada     += vi0.hora;
      if (estado.proximoEventoFinServicio != null) estado.proximoEventoFinServicio += vi0.hora;
      for (const key of Object.keys(estado._eventosExtra)) {
        if (estado._eventosExtra[key] != null) estado._eventosExtra[key] += vi0.hora;
      }
      for (const c of cola0) {
        if (c.tiempoLimite != null) c.tiempoLimite += vi0.hora;
      }
      if (estado.stats._servidorOcupadoDesde !== null) {
        estado.stats._servidorOcupadoDesde += vi0.hora;
      }
      // Ajustar tiempos de PS1+
      for (let i = 1; i < estado.numServidores; i++) {
        const ps = estado.servidores[i];
        if (ps.tiempoFinServicio !== null) ps.tiempoFinServicio += vi0.hora;
        if (ps._ocupadoDesde    !== null) ps._ocupadoDesde     += vi0.hora;
        const colaI = estado.colaPS(i);
        for (const c of colaI) {
          if (c.tiempoLimite != null) c.tiempoLimite += vi0.hora;
        }
      }
    }

    // 7. Próximas llegadas (solo PS0, valores absolutos post-shift)
    if (mods0.prioridades) {
      if (vi0.proxLlegadaA !== null) estado.proximoEventoLlegada      = vi0.proxLlegadaA;
      if (vi0.proxLlegadaB !== null) estado._eventosExtra.llegada_B   = vi0.proxLlegadaB;
    } else {
      if (vi0.proxLlegada  !== null) estado.proximoEventoLlegada      = vi0.proxLlegada;
    }
  },

  inicializarUI() {
    this._actualizarDisplay(0);

    document.getElementById("modalVector")?.addEventListener("click", (e) => {
      if (e.target.id === "modalVector") cerrarModalVector();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") cerrarModalVector();
    });
  },
};

// ── Funciones globales del modal ─────────────────────────────

function abrirModalVector(psIdx = 0) {
  const modal = document.getElementById("modalVector");
  if (!modal) return;
  window.vectorInicial._currentPsIdx = psIdx;

  const titleEl = document.querySelector("#modalVector .modal-title");
  if (titleEl) {
    titleEl.textContent = psIdx === 0
      ? "Editar Vector Inicial V(0)"
      : `Editar Vector Inicial V(0) — PS${psIdx + 1}`;
  }

  window.vectorInicial._renderTablaModal();
  modal.classList.add("activo");
}

function cerrarModalVector() {
  const modal = document.getElementById("modalVector");
  if (modal) modal.classList.remove("activo");
}

function guardarVectorInicial() {
  const psIdx = window.vectorInicial._currentPsIdx;
  window.vectorInicial._guardarState();
  window.vectorInicial._actualizarDisplay(psIdx);
  cerrarModalVector();
}

function resetVectorInicial() {
  const psIdx = window.vectorInicial._currentPsIdx;
  window.vectorInicial._states[psIdx] = window.vectorInicial._defaultState(psIdx);
  window.vectorInicial._renderTablaModal();
  window.vectorInicial._actualizarDisplay(psIdx);
}

// ============================================================
// vectorInicial.js — Vector Inicial V(0) de la simulación
// ============================================================
// Gestiona el modal "Editar Vector Inicial V(0)".
// El V(0) define el estado del sistema al instante t=0, permitiendo
// iniciar la simulación con cola, servidor ocupado, o modificadores
// en un estado intermedio (ej. servidor descansando).
//
// La tabla del modal se construye dinámicamente: solo muestra las
// columnas relevantes según los modificadores activos y el estado
// actual de PS y Zs.
// ============================================================

window.vectorInicial = {

  // ── Estado persistente entre aperturas del modal ──────────
  // Guarda los valores ingresados por el usuario para que no se
  // pierdan al cerrar y reabrir el modal, o al cambiar PS/Zs
  // (que re-renderiza la tabla).
  _state: {
    vi_hora: "0",
    vi_Qa: "0", vi_PS: "LIBRE",  vi_Ts:  "0",
    vi_Te: "0", vi_S:  "trabajando", vi_Ttd: "0",
    vi_Qb: "0", vi_Zs: "LIBRE",  vi_Tz:  "0",
  },

  // ── Definición de columnas ────────────────────────────────
  // Array declarativo que describe cada campo del V(0).
  // - mod:  null = siempre visible; "nombre" = solo si ese modificador está ON
  // - cond: condición adicional para mostrar la columna
  //   "PS_OCUPADO" → solo si PS=OCUPADO (tiene sentido Ts: tiempo ya servido)
  //   "PS_LIBRE"   → solo si PS=LIBRE   (Zs solo aplica si el PS está libre)
  //   "ZS_OCUPADO" → solo si Zs=OCUPADO (Tz: tiempo ya en la zona)
  _COLS: [
    { id: "vi_hora", label: "Hora", sub: "Tiempo inicial (s)", type: "number", mod: null, cond: null, min: 0 },
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
  // Intenta leer el valor directamente del elemento DOM (si el modal
  // está abierto). Si el elemento no existe (modal cerrado o columna
  // no visible), usa el valor guardado en _state.
  leer() {
    const get = (id, fallback) => {
      const el = document.getElementById(id);
      return el ? el.value : (this._state[id] ?? fallback);
    };
    return {
      hora: parseFloat(get("vi_hora", "0")) || 0,
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
  // Se llama antes de re-renderizar la tabla para no perder los valores
  // del usuario al cambiar PS o Zs (que disparan un nuevo render).
  _guardarState() {
    for (const col of this._COLS) {
      const el = document.getElementById(col.id);
      if (el) this._state[col.id] = el.value;
    }
  },

  // ── Construir la tabla dinámica en el modal ───────────────
  // Filtra _COLS según modificadores activos y condiciones de estado,
  // luego construye una tabla horizontal (<thead> con etiquetas,
  // <tbody> con inputs) dentro del modal.
  // Se llama cada vez que el modal se abre o cambia PS/Zs.
  _renderTablaModal() {
    this._guardarState(); // preservar valores antes de destruir el DOM actual

    // Leer qué modificadores están activos en la UI
    const mods = {};
    document.querySelectorAll(".modificador-check").forEach(cb => {
      mods[cb.dataset.mod] = cb.checked;
    });

    const psVal = this._state.vi_PS ?? "LIBRE";
    const zsVal = this._state.vi_Zs ?? "LIBRE";

    // Evaluar las condiciones de visibilidad de cada columna
    const condMap = {
      "PS_OCUPADO": psVal === "OCUPADO",
      "PS_LIBRE":   psVal === "LIBRE",
      "ZS_OCUPADO": psVal === "LIBRE" && zsVal === "OCUPADO",
    };

    // Filtrar columnas: solo las que cumplen modificador activo Y condición
    const cols = this._COLS.filter(col => {
      if (col.mod && !mods[col.mod]) return false; // modificador inactivo
      if (col.cond && !condMap[col.cond]) return false; // condición no cumplida
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

    // La primera columna de un modificador lleva "sep-left" como separador visual
    let primerMod = true;

    cols.forEach(col => {
      const sepLeft = col.mod && primerMod;
      if (col.mod) primerMod = false;

      // Celda de encabezado con etiqueta y sub-descripción
      const th = document.createElement("th");
      th.innerHTML = `${col.label}<br><small>${col.sub}</small>`;
      if (col.mod)  th.classList.add(`mod-${col.mod}`);
      if (sepLeft)  th.classList.add("sep-left");
      trHead.appendChild(th);

      // Celda de dato: select u input numérico según el tipo de columna
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
        // para mostrar/ocultar Ts y Tz según corresponda.
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
  // Muestra el resumen del V(0) en el panel izquierdo (fuera del modal)
  // para que el usuario vea el estado configurado sin abrir el modal.
  _actualizarDisplay() {
    const vi = this.leer();
    const h = document.getElementById("vi_disp_hora");
    const c = document.getElementById("vi_disp_cola");
    const s = document.getElementById("vi_disp_servidor");
    if (h) h.textContent = vi.hora || 0;
    if (c) c.textContent = vi.Qa + (vi.Qb || 0);
    if (s) s.textContent = vi.PS;
  },

  // ── Aplicar el V(0) al estado del motor ──────────────────
  // Se llama DESPUÉS de que todos los modificadores corrieron
  // sus hooks onIniciar, para sobrescribir sus valores con lo
  // que el usuario configuró en el modal.
  //
  // Orden de aplicación:
  //   1. Cola A (y cola B si prioridades activo)
  //   2. Tiempos límite de abandono según Te ya esperado
  //   3. Cliente en PS (con tiempo de servicio restante)
  //   4. Estado de descanso (calcular restante según Ttd)
  //   5. Zona de Seguridad (solo si PS=LIBRE)
  aplicar(estado, params) {
    const vi   = this.leer();
    const mods = params.modificadoresActivos || {};

    // 1. Poblar cola A con clientes ficticios que "ya estaban esperando"
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

    // 2b. Abandono: si los clientes ya llevan Te segundos esperando,
    // su tiempo límite se reduce en esa cantidad.
    // El próximo abandono se agenda en el mínimo de todos los límites.
    if (mods.abandono && vi.Te > 0 && estado.cola.length > 0) {
      for (const cliente of estado.cola) {
        const pacienciaBase = estado.paramsModificadores?.abandono ?? 10;
        const paciencia     = sortearTiempo(pacienciaBase, estado.randomParams?.abandono);
        cliente.tiempoLimite = Math.max(0.5, paciencia - vi.Te);
      }
      const minLimite = estado.cola.reduce((m, c) => Math.min(m, c.tiempoLimite ?? Infinity), Infinity);
      estado._eventosExtra.abandono = isFinite(minLimite) ? minLimite : null;
    }

    // 3. Cliente en PS: crear un cliente ficticio que "ya está siendo servido".
    // Su tiempo de servicio restante = tS sorteado - Ts ya consumido.
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
      const restante = Math.max(0.5, tSTotal - vi.Ts); // tiempo que le falta al servicio
      clientePS._tiempoRestante       = restante;
      estado.clienteEnServicio        = clientePS;
      estado.servidor.estado          = "OCUPADO";
      estado.proximoEventoFinServicio = restante;
    }

    // 4. Descanso: ajustar los tiempos de salida/llegada del servidor
    // según cuánto tiempo lleva en el estado actual (Ttd).
    if (mods.descanso) {
      if (vi.S === "descansando") {
        // El servidor está descansando: calcular cuánto le falta del descanso
        estado._servidorPresente = false;
        estado._servidorAusente  = true;
        const dD = sortearTiempo(
          estado.paramsModificadores?.descanso ?? 60,
          estado.randomParams?.deltaD
        );
        const restDescanso = Math.max(0.5, dD - vi.Ttd);
        estado._eventosExtra.servidor_salida  = null;    // ya salió
        estado._eventosExtra.servidor_llegada = restDescanso; // falta este tiempo para que regrese
        if (vi.PS === "OCUPADO" && estado.clienteEnServicio) {
          estado.clienteEnServicio._tiempoRestante = estado.proximoEventoFinServicio;
        }
      } else {
        // El servidor está trabajando: ajustar cuándo va a salir
        if (estado._eventosExtra.servidor_salida != null) {
          estado._eventosExtra.servidor_salida = Math.max(
            0.5,
            estado._eventosExtra.servidor_salida - vi.Ttd
          );
        }
      }
    }

    // 5. Zona de Seguridad: solo aplica si PS=LIBRE y Zs=OCUPADO.
    // Un cliente ya está cruzando la zona; crear el evento zs con el tiempo restante.
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

    // 5b. Auto-start: si el PS quedó LIBRE pero hay clientes en cola,
    // el motor no tiene ningún fin-servicio programado y terminaría
    // de inmediato. Iniciamos el servicio del primero de la cola.
    const _zsOcupado = mods.seguridad && vi.Zs === "OCUPADO";
    if (vi.PS !== "OCUPADO" && estado.cola.length > 0 && !estado._servidorAusente && !_zsOcupado) {
      const siguiente = estado.cola.shift();
      siguiente.tiempoInicioServicio = estado.tiempoActual;
      estado.clienteEnServicio = siguiente;
      estado.servidor.estado = "OCUPADO";
      const duracion = sortearTiempo(estado.tS, estado.randomParams?.tS);
      estado.proximoEventoFinServicio = estado.tiempoActual + duracion;
    }

    // 6. Hora de inicio: desplaza el reloj y todos los tiempos de evento.
    // Todos los tiempos calculados arriba son relativos a t=0; al cambiar
    // la hora de inicio hay que sumarle la diferencia a cada uno.
    if (vi.hora > 0) {
      estado.tiempoActual = vi.hora;
      if (estado.proximoEventoLlegada   != null) estado.proximoEventoLlegada   += vi.hora;
      if (estado.proximoEventoFinServicio != null) estado.proximoEventoFinServicio += vi.hora;
      for (const key of Object.keys(estado._eventosExtra)) {
        if (estado._eventosExtra[key] != null) estado._eventosExtra[key] += vi.hora;
      }
      for (const c of estado.cola) {
        if (c.tiempoLimite != null) c.tiempoLimite += vi.hora;
      }
    }
  },

  // ── Inicializar UI ────────────────────────────────────────
  // Se llama una vez al cargar la página para registrar los listeners
  // del modal (cerrar al clickear fuera, cerrar con Escape).
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

// Abre el modal y renderiza la tabla con el estado actual de los modificadores.
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

// Guarda los valores actuales del modal en _state y actualiza el display compacto.
function guardarVectorInicial() {
  window.vectorInicial._guardarState();
  window.vectorInicial._actualizarDisplay();
  cerrarModalVector();
}

// Restablece todos los campos del V(0) a sus valores por defecto (todo en cero/libre).
function resetVectorInicial() {
  window.vectorInicial._state = {
    vi_hora: "0",
    vi_Qa: "0", vi_PS: "LIBRE",  vi_Ts:  "0",
    vi_Te: "0", vi_S:  "trabajando", vi_Ttd: "0",
    vi_Qb: "0", vi_Zs: "LIBRE",  vi_Tz:  "0",
  };
  window.vectorInicial._renderTablaModal();
  window.vectorInicial._actualizarDisplay();
}

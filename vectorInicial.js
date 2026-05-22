// ============================================================
// vectorInicial.js — Vector Inicial V(0) de la simulación
// ============================================================
// Define el estado del sistema antes de que arranque la simulación.
//
// Parámetros base (siempre visibles):
//   Qa  — Cantidad de personas en cola (Tipo A si prioridades activo)
//   PS  — Estado del puesto de servicio: LIBRE | OCUPADO
//   Ts  — Tiempo de servicio ya prestado al cliente en PS (solo si PS=OCUPADO)
//
// Parámetros condicionales según modificadores activos:
//   S   — Estado del servidor: trabajando | descansando  (si Descanso ON)
//   Ttd — Tiempo que lleva en ese estado                (si Descanso ON)
//   Qb  — Personas en la cola B                         (si Prioridades ON)
//   Zs  — Si hay alguien en la Zona de Seguridad        (si Seguridad ON y PS=LIBRE)
//   Tz  — Tiempo que lleva en la Zona de Seguridad      (si Seguridad ON y Zs=OCUPADO)
// ============================================================

window.vectorInicial = {

  // ── Leer todos los campos del formulario V(0) ─────────────────
  leer() {
    return {
      Qa:  parseInt(document.getElementById("vi_Qa")?.value)    || 0,
      PS:  document.getElementById("vi_PS")?.value              || "LIBRE",
      Ts:  parseFloat(document.getElementById("vi_Ts")?.value)  || 0,
      S:   document.getElementById("vi_S")?.value               || "trabajando",
      Ttd: parseFloat(document.getElementById("vi_Ttd")?.value) || 0,
      Qb:  parseInt(document.getElementById("vi_Qb")?.value)    || 0,
      Te:  parseFloat(document.getElementById("vi_Te")?.value)  || 0,
      Zs:  document.getElementById("vi_Zs")?.value              || "LIBRE",
      Tz:  parseFloat(document.getElementById("vi_Tz")?.value)  || 0,
    };
  },

  // ── Aplicar el V(0) al estado del motor ──────────────────────
  // Se llama DESPUÉS de que todos los modificadores se inicializaron
  // y corrieron sus hooks onIniciar, para poder sobreescribir sus valores.
  aplicar(estado, params) {
    const vi   = this.leer();
    const mods = params.modificadoresActivos || {};

    // ── 1. Poblar cola A ─────────────────────────────────────────
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

    // ── 2. Poblar cola B (solo si prioridades activo) ─────────────
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

    // ── 2b. Asignar tiempoLimite a los clientes en cola (si abandono activo) ──
    // Cada cliente ya esperó Te segundos → su paciencia restante es paciencia - Te.
    if (mods.abandono && vi.Te > 0 && estado.cola.length > 0) {
      for (const cliente of estado.cola) {
        const pacienciaBase = estado.paramsModificadores?.abandono ?? 10;
        const paciencia     = sortearTiempo(pacienciaBase, estado.randomParams?.abandono);
        cliente.tiempoLimite = Math.max(0.5, paciencia - vi.Te);
      }
      // Programar el próximo evento de abandono (el cliente con menos paciencia restante)
      const minLimite = estado.cola.reduce((m, c) => Math.min(m, c.tiempoLimite ?? Infinity), Infinity);
      estado._eventosExtra.abandono = isFinite(minLimite) ? minLimite : null;
    }

    // ── 3. Cliente en el puesto de servicio ───────────────────────
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
      estado.proximoEventoFinServicio = restante; // tiempoActual = 0
    }

    // ── 4. Ajuste por Descanso ────────────────────────────────────
    if (mods.descanso) {
      if (vi.S === "descansando") {
        // Servidor ausente al inicio: reemplazar servidor_salida por servidor_llegada
        estado._servidorPresente = false;
        estado._servidorAusente  = true;

        const dD           = sortearTiempo(
          estado.paramsModificadores?.descanso ?? 60,
          estado.randomParams?.deltaD
        );
        const restDescanso = Math.max(0.5, dD - vi.Ttd);

        estado._eventosExtra.servidor_salida  = null;
        estado._eventosExtra.servidor_llegada = restDescanso;

        // Si hay cliente en PS, guardar tiempo restante de servicio.
        // El motor congela el fin de servicio mientras !_servidorPresente.
        if (vi.PS === "OCUPADO" && estado.clienteEnServicio) {
          estado.clienteEnServicio._tiempoRestante = estado.proximoEventoFinServicio;
        }
      } else {
        // Servidor presente: reducir tiempo restante de trabajo según Ttd ya transcurrido
        if (estado._eventosExtra.servidor_salida != null) {
          estado._eventosExtra.servidor_salida = Math.max(
            0.5,
            estado._eventosExtra.servidor_salida - vi.Ttd
          );
        }
      }
    }

    // ── 5. Ajuste por Zona de Seguridad ──────────────────────────
    // Restricción: si PS está ocupado no puede haber nadie en ZS
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

  // ── Mostrar/ocultar campos según modificadores activos ────────
  actualizarVisibilidad() {
    const mods = {};
    document.querySelectorAll(".modificador-check").forEach(cb => {
      mods[cb.dataset.mod] = cb.checked;
    });

    const psVal = document.getElementById("vi_PS")?.value ?? "LIBRE";
    const zsVal = document.getElementById("vi_Zs")?.value ?? "LIBRE";

    _viMostrar("vi_row_Ts",          psVal === "OCUPADO");
    _viMostrar("vi_row_descanso",    !!mods.descanso);
    _viMostrar("vi_row_abandono",    !!mods.abandono);
    _viMostrar("vi_row_prioridades", !!mods.prioridades);
    _viMostrar("vi_row_seguridad",   !!mods.seguridad && psVal === "LIBRE");
    _viMostrar("vi_row_Tz",          !!mods.seguridad && psVal === "LIBRE" && zsVal === "OCUPADO");

    // Si PS=OCUPADO, no puede haber nadie en ZS: forzar LIBRE y bloquear el select
    const zsSelect = document.getElementById("vi_Zs");
    if (zsSelect) {
      if (psVal === "OCUPADO") {
        zsSelect.value    = "LIBRE";
        zsSelect.disabled = true;
      } else {
        zsSelect.disabled = false;
      }
    }
  },

  // ── Registrar listeners del formulario V(0) ───────────────────
  inicializarUI() {
    document.querySelectorAll(".modificador-check").forEach(cb => {
      cb.addEventListener("change", () => this.actualizarVisibilidad());
    });

    const psEl = document.getElementById("vi_PS");
    const zsEl = document.getElementById("vi_Zs");
    if (psEl) psEl.addEventListener("change", () => this.actualizarVisibilidad());
    if (zsEl) zsEl.addEventListener("change", () => this.actualizarVisibilidad());

    this.actualizarVisibilidad();
  },
};

// Función auxiliar: muestra u oculta un elemento por ID
function _viMostrar(id, visible) {
  const el = document.getElementById(id);
  if (el) el.style.display = visible ? "" : "none";
}

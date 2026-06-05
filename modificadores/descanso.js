// ============================================================
// modificadores/descanso.js — Modificador: Descanso del servidor (per-PS)
// ============================================================
// El servidor de un PS alterna ciclos de trabajo (ΔT) y descanso (ΔD).
// Mientras descansa, ps._presente = false y el motor congela el fin de
// servicio de ese PS hasta que regrese.
//
// Claves de evento: "servidor_salida_ps{i}" / "servidor_llegada_ps{i}"
// Para PS0 se mantienen también los flags globales _servidorPresente /
// _servidorAusente para backward compat con vectorInicial.js y la tabla.
// ============================================================

window.modificador_descanso = {

  iniciar(estado, psIdx = 0) {
    const ps         = estado.servidores[psIdx];
    const salidaKey  = `servidor_salida_ps${psIdx}`;
    const llegadaKey = `servidor_llegada_ps${psIdx}`;

    if (!HookRegistry.hooks[`onEvento_${salidaKey}`])  HookRegistry.hooks[`onEvento_${salidaKey}`]  = [];
    if (!HookRegistry.hooks[`onEvento_${llegadaKey}`]) HookRegistry.hooks[`onEvento_${llegadaKey}`] = [];

    function durDescanso(e) {
      return sortearTiempo(
        ps.paramsModificadores?.descanso ?? e.paramsModificadores?.descanso ?? 60,
        ps.randomParams?.deltaD ?? e.randomParams?.deltaD
      );
    }
    function durTrabajo(e) {
      return sortearTiempo(
        ps.paramsModificadores?.descanso_trabajo ?? e.paramsModificadores?.descanso_trabajo ?? 30,
        ps.randomParams?.deltaT ?? e.randomParams?.deltaT
      );
    }

    // Agendar primera salida al descanso
    ps._presente = true;
    ps._ausente  = false;
    estado._eventosExtra[salidaKey] = estado.tiempoActual + durTrabajo(estado);

    // ── Evento: servidor sale (fin del período de trabajo) ──
    HookRegistry.registrar(`onEvento_${salidaKey}`, `descanso_ps${psIdx}`, (e) => {
      e.tiempoActual                      = e._eventosExtra[salidaKey];
      e._eventosExtra[salidaKey]          = null;
      ps._presente                        = false;
      ps._ausente                         = true;
      e._eventosExtra[llegadaKey]         = e.tiempoActual + durDescanso(e);

      // Si hay cliente en servicio: guardar tiempo restante y congelar
      if (ps.clienteEnServicio !== null) {
        ps.clienteEnServicio._tiempoRestante = ps.tiempoFinServicio - e.tiempoActual;
      }

      Bus.emitir("fila", {
        evento: `SALIDA SERVIDOR PS${psIdx + 1}`,
        hora:   e.tiempoActual,
        estado: e,
      });
    });

    // ── Evento: servidor regresa (fin del período de descanso) ──
    HookRegistry.registrar(`onEvento_${llegadaKey}`, `descanso_ps${psIdx}`, (e) => {
      e.tiempoActual              = e._eventosExtra[llegadaKey];
      e._eventosExtra[llegadaKey] = null;
      ps._presente                = true;
      ps._ausente                 = false;
      e._eventosExtra[salidaKey]  = e.tiempoActual + durTrabajo(e);

      if (ps.clienteEnServicio !== null) {
        // Reanudar servicio del cliente que quedó esperando
        const restante = ps.clienteEnServicio._tiempoRestante ?? ps.tS;
        ps.clienteEnServicio._tiempoRestante      = null;
        ps.clienteEnServicio.tiempoInicioServicio = e.tiempoActual;
        ps.tiempoFinServicio                      = e.tiempoActual + restante;
        ps.estado                                 = "OCUPADO";
      } else {
        const cola = e.colaPS(psIdx);
        if (cola.length > 0) {
          const siguiente = cola.shift();
          siguiente.tiempoInicioServicio = e.tiempoActual;
          ps.clienteEnServicio           = siguiente;
          ps.estado                      = "OCUPADO";
          ps.tiempoFinServicio           = e.tiempoActual + sortearTiempo(ps.tS, ps.randomParams?.tS);
          ps._ocupadoDesde               = e.tiempoActual;
          if (psIdx === 0) e.stats._servidorOcupadoDesde = e.tiempoActual;
        } else {
          ps.estado = "LIBRE";
        }
      }

      Bus.emitir("fila", {
        evento: `LLEGADA SERVIDOR PS${psIdx + 1}`,
        hora:   e.tiempoActual,
        estado: e,
      });
    });
  },
};

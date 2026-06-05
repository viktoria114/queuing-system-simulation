// ============================================================
// modificadores/abandono.js — Modificador: Abandono de cola (per-PS)
// ============================================================
// Si un cliente espera más de SC segundos en la cola de un PS,
// abandona sin ser atendido. Funciona independientemente para cada
// PS que tenga el modificador activo.
//
// Clave de evento en _eventosExtra: "abandono_ps{i}"
// ============================================================

window.modificador_abandono = {

  iniciar(estado, psIdx = 0) {
    const evKey = `abandono_ps${psIdx}`;
    if (!HookRegistry.hooks[`onEvento_${evKey}`]) HookRegistry.hooks[`onEvento_${evKey}`] = [];

    const ps = estado.servidores[psIdx];

    function pacienciaBase() {
      return ps.paramsModificadores?.abandono ?? estado.paramsModificadores?.abandono ?? 10;
    }
    function randomAbandono() {
      return ps.randomParams?.abandono ?? estado.randomParams?.abandono;
    }

    function agendarProximoAbandono(e) {
      const cola = e.colaPS(psIdx);
      const min  = cola
        .filter(c => c[`tiempoLimite_ps${psIdx}`] !== undefined)
        .reduce((m, c) => Math.min(m, c[`tiempoLimite_ps${psIdx}`]), Infinity);
      e._eventosExtra[evKey] = isFinite(min) ? min : null;
    }

    // Hook: cuando un cliente entra a la cola de ESTE PS, asignarle paciencia
    HookRegistry.registrar("onEncolar", `abandono_ps${psIdx}`, ({ estado: e, cliente, psIdx: pIdx }) => {
      if (pIdx !== psIdx) return;
      const paciencia = sortearTiempo(pacienciaBase(), randomAbandono());
      cliente[`tiempoLimite_ps${psIdx}`] = e.tiempoActual + paciencia;
      agendarProximoAbandono(e);
    });

    // Hook: al terminar un servicio en ESTE PS, reagendar con la cola actualizada
    HookRegistry.registrar("onFinServicioPost", `abandono_ps${psIdx}`, ({ estado: e, psIdx: pIdx }) => {
      if (pIdx !== psIdx) return;
      agendarProximoAbandono(e);
    });

    // Evento: procesar todos los abandonos cuyo límite llegó
    HookRegistry.registrar(`onEvento_${evKey}`, `abandono_ps${psIdx}`, (e) => {
      const ahora = e._eventosExtra[evKey];
      e.tiempoActual          = ahora;
      e._eventosExtra[evKey]  = null;

      const cola     = e.colaPS(psIdx);
      const limKey   = `tiempoLimite_ps${psIdx}`;
      const abandonan = cola.filter(c => c[limKey] !== undefined && c[limKey] <= ahora);

      for (const cliente of abandonan) {
        const idx = cola.indexOf(cliente);
        if (idx !== -1) cola.splice(idx, 1);
        e.stats.clientesAbandonaron++;
        Bus.emitir("fila", {
          evento: `ABANDONO #${cliente.id}`,
          hora:   cliente[limKey],
          estado: e,
        });
      }

      agendarProximoAbandono(e);
    });
  },
};

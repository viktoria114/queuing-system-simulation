// ============================================================
// modificadores/abandono.js — Modificador: Abandono de cola
// ============================================================
// Si un cliente espera más de SC segundos en cola, abandona
// el sistema sin ser atendido nunca.
//
// HOOKS:
//   onLlegadaPost     → asigna tiempoLimite y agenda próximo abandono
//   onFinServicioPost → re-agenda tras sacar un cliente de cola al PS
//   onEvento_abandono → procesa el abandono en la hora exacta
//
// El abandono es un evento propio en _eventosExtra.abandono,
// apuntando siempre al mínimo tiempoLimite de los clientes en cola.
// Así el motor lo ordena cronológicamente junto al resto de eventos
// y nunca se pierde aunque la simulación termine antes del próximo
// evento de llegada o fin de servicio.
// ============================================================

window.modificador_abandono = {

  iniciar(estado) {
    if (!HookRegistry.hooks["onEvento_abandono"]) HookRegistry.hooks["onEvento_abandono"] = [];

    function agendarProximoAbandono(e) {
      const min = e.cola
        .filter(c => c.tiempoLimite !== undefined)
        .reduce((m, c) => Math.min(m, c.tiempoLimite), Infinity);
      e._eventosExtra.abandono = isFinite(min) ? min : null;
    }

    // Hook 1: cuando un cliente va a la cola, asignarle tiempoLimite
    // y agendar (o adelantar) el próximo evento de abandono.
    HookRegistry.registrar("onLlegadaPost", "abandono", ({ estado: e, cliente }) => {
      const enCola = e.cola.find(c => c.id === cliente.id);
      if (enCola) {
        const paciencia = e.paramsModificadores?.abandono ?? 10;
        enCola.tiempoLimite = enCola.tiempoLlegada + paciencia;
        agendarProximoAbandono(e);
      }
    });

    // Hook 2: cuando termina un servicio y se saca un cliente de la cola,
    // recalcular el próximo abandono (ese cliente ya no abandonará).
    HookRegistry.registrar("onFinServicioPost", "abandono", ({ estado: e }) => {
      agendarProximoAbandono(e);
    });

    // Evento propio: procesa todos los abandonos pendientes a esta hora
    // y reagenda si quedan más clientes con paciencia agotada.
    HookRegistry.registrar("onEvento_abandono", "abandono", (e) => {
      const ahora = e._eventosExtra.abandono;
      e.tiempoActual = ahora;
      e._eventosExtra.abandono = null;

      const abandonan = e.cola.filter(
        c => c.tiempoLimite !== undefined && c.tiempoLimite <= ahora
      );

      for (const cliente of abandonan) {
        e.cola = e.cola.filter(c => c.id !== cliente.id);
        e.stats.clientesAbandonaron++;
        Bus.emitir("fila", {
          evento: `ABANDONO #${cliente.id}`,
          hora:   cliente.tiempoLimite,
          estado: e,
        });
      }

      // Si quedan clientes en cola con tiempoLimite, agendar el siguiente
      agendarProximoAbandono(e);
    });
  },
};

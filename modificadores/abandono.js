// ============================================================
// modificadores/abandono.js — Modificador: Abandono de cola
// ============================================================
// Problema 1 / Problema 2: si un cliente espera más de SC segundos
// en la cola, abandona el sistema sin ser atendido.
// SC (paciencia) puede ser fijo o aleatorio (uniforme) por cliente.
//
// Parámetros:
//   paramsModificadores.abandono = valor fijo de paciencia (s)
//   randomParams.abandono        = { modo, min, max }
//
// Cada cliente que entra a la cola recibe un tiempoLimite absoluto
// (tiempoLlegada + paciencia sorteada). El próximo abandono se agenda
// en estado._eventosExtra.abandono = min(tiempoLimite de todos en cola).
// ============================================================

window.modificador_abandono = {

  iniciar(estado) {
    if (!HookRegistry.hooks["onEvento_abandono"]) HookRegistry.hooks["onEvento_abandono"] = [];

    // Recalcula y agenda el próximo evento de abandono buscando
    // el tiempoLimite más próximo entre todos los clientes en cola.
    // Si no hay clientes con límite definido, borra el evento.
    function agendarProximoAbandono(e) {
      const min = e.cola
        .filter(c => c.tiempoLimite !== undefined)
        .reduce((m, c) => Math.min(m, c.tiempoLimite), Infinity);
      e._eventosExtra.abandono = isFinite(min) ? min : null;
    }

    // Hook: al terminar de procesar una llegada, si el cliente quedó en cola
    // (no fue al PS ni fue desviado), asignarle un tiempoLimite sorteado.
    HookRegistry.registrar("onLlegadaPost", "abandono", ({ estado: e, cliente }) => {
      const enCola = e.cola.find(c => c.id === cliente.id);
      if (enCola) {
        const pacienciaBase = e.paramsModificadores?.abandono ?? 10;
        // Sortear paciencia: puede ser fija o uniforme U[min,max]
        const paciencia = sortearTiempo(pacienciaBase, e.randomParams?.abandono);
        enCola.tiempoLimite = enCola.tiempoLlegada + paciencia;
        agendarProximoAbandono(e);
      }
    });

    // Hook: cuando termina un servicio y el siguiente cliente pasa al PS,
    // reagendar el próximo abandono con la cola actualizada.
    HookRegistry.registrar("onFinServicioPost", "abandono", ({ estado: e }) => {
      agendarProximoAbandono(e);
    });

    // Evento: se dispara cuando llega el momento del próximo abandono.
    // Puede haber varios clientes que alcanzaron su límite al mismo tiempo;
    // se eliminan todos los que tengan tiempoLimite <= ahora.
    HookRegistry.registrar("onEvento_abandono", "abandono", (e) => {
      const ahora = e._eventosExtra.abandono;
      e.tiempoActual = ahora;
      e._eventosExtra.abandono = null; // limpiar antes de reagendar

      // Identificar todos los clientes que ya superaron su paciencia
      const abandonan = e.cola.filter(
        c => c.tiempoLimite !== undefined && c.tiempoLimite <= ahora
      );

      // Remover cada cliente que abandona y contabilizarlo
      for (const cliente of abandonan) {
        e.cola = e.cola.filter(c => c.id !== cliente.id);
        e.stats.clientesAbandonaron++;
        Bus.emitir("fila", {
          evento: `ABANDONO #${cliente.id}`,
          hora:   cliente.tiempoLimite,
          estado: e,
        });
      }

      // Reagendar con los clientes que siguen en cola
      agendarProximoAbandono(e);
    });
  },
};

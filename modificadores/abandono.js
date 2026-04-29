// ============================================================
// modificadores/abandono.js — Modificador: Abandono de cola
// ============================================================
// Si un cliente espera más de SC segundos en cola, abandona.
// SC puede ser fijo o aleatorio (uniforme) por cliente.
//
// Parámetros:
//   paramsModificadores.abandono = valor fijo de paciencia (s)
//   randomParams.abandono        = { modo, min, max }
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

    HookRegistry.registrar("onLlegadaPost", "abandono", ({ estado: e, cliente }) => {
      const enCola = e.cola.find(c => c.id === cliente.id);
      if (enCola) {
        // Sortear paciencia: fija o aleatoria según configuración
        const pacienciaBase = e.paramsModificadores?.abandono ?? 10;
        const paciencia = sortearTiempo(pacienciaBase, e.randomParams?.abandono);
        enCola.tiempoLimite = enCola.tiempoLlegada + paciencia;
        agendarProximoAbandono(e);
      }
    });

    HookRegistry.registrar("onFinServicioPost", "abandono", ({ estado: e }) => {
      agendarProximoAbandono(e);
    });

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

      agendarProximoAbandono(e);
    });
  },
};

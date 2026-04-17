// ============================================================
// modificadores/abandono.js — Modificador: Abandono de cola
// ============================================================
// Según el Problema 3 del PDF:
// Si un cliente espera más de SC segundos en cola, abandona
// el sistema sin ser atendido nunca.
//
// HOOKS:
//   onLlegadaPost  → asigna tiempoLimite a cada cliente que va a cola
//   onPaso         → en cada tick revisa si algún cliente superó su paciencia
// ============================================================

window.modificador_abandono = {

  iniciar(estado) {

    // Hook 1: cuando un cliente llega y va a la cola,
    // calcularle su hora límite de paciencia
    HookRegistry.registrar("onLlegadaPost", "abandono", ({ estado, cliente }) => {
      const enCola = estado.cola.find(c => c.id === cliente.id);
      if (enCola) {
        const paciencia = estado.paramsModificadores?.abandono ?? 10;
        enCola.tiempoLimite = enCola.tiempoLlegada + paciencia;
      }
    });

    // Hook 2: en cada paso del loop, revisar si algún cliente
    // ya agotó su paciencia y debe abandonar la cola
    HookRegistry.registrar("onPaso", "abandono", (estado) => {
      const ahora = estado.tiempoActual;

      const abandonan = estado.cola.filter(
        c => c.tiempoLimite !== undefined && ahora >= c.tiempoLimite
      );

      for (const cliente of abandonan) {
        estado.cola = estado.cola.filter(c => c.id !== cliente.id);
        estado.stats.clientesAbandonaron++;

        // Emitir con la hora exacta de abandono (tiempoLimite),
        // no tiempoActual que es la hora del último evento procesado.
        Bus.emitir("fila", {
          evento: `ABANDONO #${cliente.id}`,
          hora: cliente.tiempoLimite,
          estado,
        });
      }
    });

  },
};
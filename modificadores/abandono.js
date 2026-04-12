//lo que me tiro claude code con decirle "abandono" no le envie el ejercicio en si.

// ============================================================
// modificadores/abandono.js — Modificador: Abandono de cola
// ============================================================
// Un cliente abandona la cola si espera más de N segundos
// sin ser atendido.
//
// HOOKS que usa:
//   onPaso   → en cada tick revisa si algún cliente superó su paciencia
//   onLlegada (post, vía onLlegadaPost) → asigna tiempo de paciencia al cliente
//
// Parámetro: paramsModificadores.abandono = tiempo máximo de espera (s)
// ============================================================

window.modificador_abandono = {

  iniciar(estado) {
    const paciencia = estado.paramsModificadores?.abandono ?? 10;
    console.log(`[Abandono] Inicializado. Paciencia máxima: ${paciencia}s`);

    // ── Hook 1: al llegar, asignar tiempo límite de paciencia ──
    HookRegistry.registrar("onLlegadaPost", "abandono", ({ estado, cliente }) => {
      // Solo aplica a clientes que fueron a la cola (no al que entra directo)
      const enCola = estado.cola.find(c => c.id === cliente.id);
      if (enCola) {
        const paciencia = estado.paramsModificadores?.abandono ?? 10;
        enCola.tiempoLimite = enCola.tiempoLlegada + paciencia;
      }
    });

    // ── Hook 2: en cada paso, revisar abandonos ──
    HookRegistry.registrar("onPaso", "abandono", (estado) => {
      const ahora = estado.tiempoActual;

      // Buscar clientes que ya superaron su paciencia
      const abandonan = estado.cola.filter(
        c => c.tiempoLimite !== undefined && ahora >= c.tiempoLimite
      );

      for (const cliente of abandonan) {
        // Remover de la cola
        estado.cola = estado.cola.filter(c => c.id !== cliente.id);
        estado.stats.clientesAbandonaron++;

        UI.log(
          UI.pad(`ABANDONO #${cliente.id}`, 22) +
          UI.pad(UI.formatHora(ahora), 10) +
          UI.pad(UI.formatHora(estado.proximoEventoLlegada), 14) +
          UI.pad(UI.formatHora(estado.proximoEventoFinServicio), 14) +
          UI.pad(estado.cola.length, 6) +
          UI.pad(estado.servidor.estado, 10)
        );
      }
    });
  },
};
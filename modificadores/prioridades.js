//Lo que me tiro claude code con decirle "prioridades" no le envie el ejercicio en si.

// ============================================================
// modificadores/prioridades.js — Modificador: Prioridades
// ============================================================
// Cada N clientes (configurable) llega uno con prioridad alta.
// Los clientes de prioridad alta se atienden antes que los normales.
//
// La cola ya está ordenada por prioridad en motor.js (sort desc).
// Este modificador solo asigna el nivel de prioridad al cliente.
//
// HOOKS que usa:
//   onLlegada  → asigna prioridad al cliente según su id
//
// Parámetro: paramsModificadores.prioridades = cada cuántos clientes
//            llega uno de prioridad alta (ej: 3 → cada 3er cliente)
// ============================================================

window.modificador_prioridades = {

  iniciar(estado) {
    const cadaN = estado.paramsModificadores?.prioridades ?? 3;
    console.log(`[Prioridades] Inicializado. Cliente prioritario cada ${cadaN} llegadas.`);

    HookRegistry.registrar("onLlegada", "prioridades", ({ estado, cliente }) => {
      const cadaN = estado.paramsModificadores?.prioridades ?? 3;

      if (cliente.id % cadaN === 0) {
        cliente.prioridad = 1; // Alta prioridad
        // Marcar visualmente
        const eventoLabel = `LLEGADA #${cliente.id} ⭐`;

        // Parchamos el label que imprimirá motor.js reemplazando el texto
        // (motor.js imprime después de ejecutar los hooks de onLlegada)
        cliente._labelOverride = eventoLabel;
      }
    });

    // Nota: motor.js ya hace estado.cola.sort((a,b) => b.prioridad - a.prioridad)
    // así que no hay que hacer nada más para ordenar la cola.
  },
};
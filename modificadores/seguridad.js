//lo que me tiro claude code con decirle "seguridad" no le envie el ejercicio en si.

// ============================================================
// modificadores/seguridad.js — Modificador: Zona de Seguridad
// ============================================================
// La cola tiene un límite máximo de capacidad (zona de seguridad).
// Si la cola está llena, los nuevos clientes no pueden ingresar
// al sistema (son rechazados/bloqueados).
//
// HOOKS que usa:
//   onLlegada  → si la cola está llena, cancela el ingreso (retorna false)
//
// Parámetro: paramsModificadores.seguridad = capacidad máxima de la cola
// ============================================================

window.modificador_seguridad = {

  iniciar(estado) {
    const capacidad = estado.paramsModificadores?.seguridad ?? 5;
    console.log(`[Seguridad] Inicializado. Capacidad máxima de cola: ${capacidad}`);

    HookRegistry.registrar("onLlegada", "seguridad", ({ estado, cliente }) => {
      const capacidad = estado.paramsModificadores?.seguridad ?? 5;

      // Solo bloquear si el servidor está ocupado (el cliente iría a la cola)
      if (estado.servidor.estado !== "LIBRE" && estado.cola.length >= capacidad) {
        estado.stats.clientesAbandonaron++; // contar como rechazado

        UI.log(
          UI.pad(`RECHAZADO #${cliente.id}`, 22) +
          UI.pad(UI.formatHora(estado.tiempoActual), 10) +
          UI.pad(UI.formatHora(estado.proximoEventoLlegada), 14) +
          UI.pad(UI.formatHora(estado.proximoEventoFinServicio), 14) +
          UI.pad(estado.cola.length, 6) +
          UI.pad(estado.servidor.estado, 10)
        );

        // Retornar false cancela el procesamiento normal de llegada en motor.js
        return false;
      }
    });
  },
};
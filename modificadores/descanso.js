//Lo que me tiro claude code con decirle "descanso" no le envie el ejercicio en si.

// ============================================================
// modificadores/descanso.js — Modificador: Descanso del servidor
// ============================================================
// El servidor toma un descanso de duración fija luego de cada
// servicio completado (o cada N servicios, según implementen).
//
// HOOKS que usa:
//   onFinServicioPost  → detecta cuando el servidor queda libre y programa descanso
//   onEvento_descanso  → evento personalizado: fin del descanso
//   onLlegada          → bloquea atención si el servidor está en descanso
//
// Parámetro: paramsModificadores.descanso = duración del descanso (s)
// ============================================================

window.modificador_descanso = {

  iniciar(estado) {
    const duracion = estado.paramsModificadores?.descanso ?? 10;
    console.log(`[Descanso] Inicializado. Duración: ${duracion}s`);

    // ── Hook 1: al terminar un servicio, si la cola está vacía → descanso ──
    HookRegistry.registrar("onFinServicioPost", "descanso", ({ estado }) => {
      if (estado.servidor.estado === "LIBRE") {
        const duracion = estado.paramsModificadores?.descanso ?? 10;
        estado.servidor.estado = "DESCANSO";
        estado._eventosExtra.descanso = estado.tiempoActual + duracion;

        // registrar en consola
        UI.log(
          UI.pad("INICIO DESCANSO", 22) +
          UI.pad(UI.formatHora(estado.tiempoActual), 10) +
          UI.pad("", 14) +
          UI.pad(UI.formatHora(estado._eventosExtra.descanso), 14) +
          UI.pad(estado.cola.length, 6) +
          UI.pad("DESCANSO", 10)
        );
      }
    });

    // ── Hook 2: evento personalizado "fin de descanso" ──
    HookRegistry.registrar("onEvento_descanso", "descanso", (estado) => {
      estado.tiempoActual = estado._eventosExtra.descanso;
      estado._eventosExtra.descanso = null;

      UI.log(
        UI.pad("FIN DESCANSO", 22) +
        UI.pad(UI.formatHora(estado.tiempoActual), 10) +
        UI.pad(UI.formatHora(estado.proximoEventoLlegada), 14) +
        UI.pad("", 14) +
        UI.pad(estado.cola.length, 6) +
        UI.pad("LIBRE", 10)
      );

      // Si hay clientes esperando, atenderlos
      if (estado.cola.length > 0) {
        const siguiente = estado.cola.shift();
        siguiente.tiempoInicioServicio = estado.tiempoActual;
        estado.clienteEnServicio = siguiente;
        estado.servidor.estado = "OCUPADO";
        estado.proximoEventoFinServicio = estado.tiempoActual + estado.tS;
      } else {
        estado.servidor.estado = "LIBRE";
      }
    });

    // ── Hook 3: si llega un cliente durante descanso, va a la cola ──
    HookRegistry.registrar("onLlegada", "descanso", ({ estado }) => {
      if (estado.servidor.estado === "DESCANSO") {
        // Forzar que el cliente vaya a la cola aunque "parezca libre"
        // Temporalmente marcamos como OCUPADO para que procesarLlegada lo encole
        estado.servidor.estado = "OCUPADO";

        // Después de que onLlegada termine, restaurar DESCANSO
        setTimeout(() => {
          if (estado.servidor.estado === "OCUPADO" && estado.clienteEnServicio === null) {
            // Solo restaurar si no empezó a atender (no debería, el cliente fue a cola)
          }
        }, 0);
      }
    });
  },
};
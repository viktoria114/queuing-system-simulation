// ============================================================
// modificadores/prioridades.js — Problema N°4
// ============================================================
// Dos tipos de clientes con flujos de llegada independientes:
//   Tipo A — prioridad alta (prioridad = 1)
//   Tipo B — prioridad normal (prioridad = 0)
//
// Flujo A: usa el canal principal de motor.js
//          (proximoEventoLlegada, intervalo = tLL del input principal)
// Flujo B: usa evento extra "llegada_B"
//          (intervalo = paramsModificadores.prioridades)
//
// La cola ya se ordena por prioridad en motor.js (sort desc),
// por lo que los A siempre se atienden antes que los B.
//
// Parámetros:
//   tLL (input principal)              = ΔtLL tipo A  (default 45 s)
//   paramsModificadores.prioridades    = ΔtLL tipo B  (default 45 s)
// ============================================================

window.modificador_prioridades = {

  iniciar(estado) {
    const tLL_B = estado.paramsModificadores?.prioridades ?? 45;

    // Arrancar el flujo B
    estado._eventosExtra.llegada_B = estado.tiempoActual + tLL_B;

    // ── Hook: marcar cada cliente A con tipo y prioridad alta ────
    HookRegistry.registrar("onLlegada", "prioridades", ({ cliente }) => {
      cliente.tipo           = "A";
      cliente.prioridad      = 1;
      cliente._labelOverride = `LLEGADA A #${cliente.id}`;
    });

    // ── Evento: llegada de un cliente tipo B ─────────────────────
    HookRegistry.registrar("onEvento_llegada_B", "prioridades", (estado) => {
      estado.tiempoActual = estado._eventosExtra.llegada_B;
      estado.clienteIdCounter++;

      const cliente = {
        id:                   estado.clienteIdCounter,
        tiempoLlegada:        estado.tiempoActual,
        tiempoInicioServicio: null,
        prioridad:            0,
        tipo:                 "B",
        _labelOverride:       `LLEGADA B #${estado.clienteIdCounter}`,
      };

      if (estado.servidor.estado === "LIBRE") {
        // PS libre → atender directamente
        estado.servidor.estado           = "OCUPADO";
        cliente.tiempoInicioServicio     = estado.tiempoActual;
        estado.clienteEnServicio         = cliente;
        estado.proximoEventoFinServicio  = estado.tiempoActual + estado.tS;
      } else {
        // PS ocupado → encolar y reordenar por prioridad
        estado.cola.push(cliente);
        estado.cola.sort((a, b) => b.prioridad - a.prioridad);
      }

      // Programar siguiente llegada B
      const tB = estado.paramsModificadores?.prioridades ?? 45;
      estado._eventosExtra.llegada_B = estado.tiempoActual + tB;

      Bus.emitir("fila", { evento: cliente._labelOverride, hora: estado.tiempoActual, estado });
    });
  },
};

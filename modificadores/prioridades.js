// ============================================================
// modificadores/prioridades.js — Modificador: Dos clases de prioridad
// ============================================================
// Problema 4: dos tipos de clientes con flujos de llegada independientes.
//   Tipo A — prioridad alta (prioridad = 1): siempre se atienden antes que B.
//   Tipo B — prioridad normal (prioridad = 0).
//
// Arquitectura de dos flujos:
//   Flujo A: usa el canal principal de motor.js
//            (proximoEventoLlegada, intervalo = tLL del input principal).
//   Flujo B: usa el evento extra "llegada_B"
//            (intervalo = paramsModificadores.prioridades, input secundario).
//
// La cola ya se ordena por prioridad descendente en motor.js (sort desc),
// por lo que los A siempre se atienden antes que los B sin lógica adicional.
//
// Parámetros:
//   tLL (input principal)              = ΔtLL tipo A
//   paramsModificadores.prioridades    = ΔtLL tipo B (default 45 s)
// ============================================================

window.modificador_prioridades = {

  iniciar(estado) {
    const tLL_B = estado.paramsModificadores?.prioridades ?? 45;

    // Arrancar el flujo independiente de clientes tipo B
    estado._eventosExtra.llegada_B = estado.tiempoActual + tLL_B;

    // ── Hook: marcar cada cliente que llega por el flujo principal como Tipo A ──
    // Se ejecuta en onLlegada antes de encolar/servir, para que la cola
    // los ordene con prioridad = 1 (mayor que los B con prioridad = 0).
    HookRegistry.registrar("onLlegada", "prioridades", ({ cliente }) => {
      cliente.tipo           = "A";
      cliente.prioridad      = 1; // mayor prioridad → se atiende antes que B
      cliente._labelOverride = `LLEGADA A #${cliente.id}`;
      // No retorna false: deja que motor.js procese la llegada normalmente.
    });

    // ── Evento: llegada de un cliente tipo B ─────────────────────
    // Replica la lógica de procesarLlegada() de motor.js pero para tipo B.
    // No usa el canal principal porque tLL_B es independiente de tLL_A.
    HookRegistry.registrar("onEvento_llegada_B", "prioridades", (estado) => {
      estado.tiempoActual = estado._eventosExtra.llegada_B;
      estado.clienteIdCounter++;

      const cliente = {
        id:                   estado.clienteIdCounter,
        tiempoLlegada:        estado.tiempoActual,
        tiempoInicioServicio: null,
        prioridad:            0, // prioridad baja: se atiende después de los A
        tipo:                 "B",
        _labelOverride:       `LLEGADA B #${estado.clienteIdCounter}`,
      };

      if (estado.servidor.estado === "LIBRE") {
        // PS libre → atender directamente (igual que en procesarLlegada)
        estado.servidor.estado           = "OCUPADO";
        cliente.tiempoInicioServicio     = estado.tiempoActual;
        estado.clienteEnServicio         = cliente;
        estado.proximoEventoFinServicio  = estado.tiempoActual + estado.tS;
      } else {
        // PS ocupado → encolar y reordenar; los A quedan delante de los B
        estado.cola.push(cliente);
        estado.cola.sort((a, b) => b.prioridad - a.prioridad);
      }

      // Programar la siguiente llegada B
      const tB = estado.paramsModificadores?.prioridades ?? 45;
      estado._eventosExtra.llegada_B = estado.tiempoActual + tB;

      Bus.emitir("fila", { evento: cliente._labelOverride, hora: estado.tiempoActual, estado });
    });
  },
};

// ============================================================
// modificadores/prioridades.js — Modificador: Dos clases de prioridad
// ============================================================
// Problema 4: dos tipos de clientes con flujos de llegada independientes.
//   Tipo A — prioridad alta (prioridad = 1): siempre se atienden antes que B.
//   Tipo B — prioridad normal (prioridad = 0).
//
// Los clientes B ahora pasan por los hooks onLlegada y onLlegadaPost,
// por lo que desvío y zona de seguridad los afectan igual que a los A.
//
// Parámetros:
//   tLL (input principal)              = ΔtLL tipo A
//   paramsModificadores.prioridades    = ΔtLL tipo B (default 45 s)
// ============================================================

window.modificador_prioridades = {

  iniciar(estado, psIdx = 0) {
    // prioridades afecta el stream global de llegadas; solo aplica desde PS0
    if (psIdx !== 0) return;
    const tLL_B = estado.paramsModificadores?.prioridades ?? 45;

    // Arrancar el flujo independiente de clientes tipo B
    estado._eventosExtra.llegada_B = estado.tiempoActual + tLL_B;

    // ── Hook: marcar cada cliente del flujo principal como Tipo A ──
    // Si el cliente ya viene marcado como "B" (viene de onEvento_llegada_B),
    // no lo sobreescribimos — así los hooks de desvío/seguridad funcionan
    // correctamente para ambos tipos.
    HookRegistry.registrar("onLlegada", "prioridades", ({ cliente }) => {
      if (cliente.tipo === "B") return; // ya está tipado, no sobreescribir
      cliente.tipo           = "A";
      cliente.prioridad      = 1;
      cliente._labelOverride = `LLEGADA A #${cliente.id}`;
    });

    // ── Evento: llegada de un cliente tipo B ─────────────────────
    // Ahora ejecuta los hooks onLlegada y onLlegadaPost para que
    // desvío, seguridad y abandono funcionen igual que para los A.
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

      // Ejecutar onLlegada — desvío y seguridad pueden interceptar
      const continuar = HookRegistry.ejecutar("onLlegada", { estado, cliente });

      if (continuar !== false) {
        const ps = estado.servidores[0];
        if (ps.estado === "LIBRE") {
          ps.estado                          = "OCUPADO";
          cliente.tiempoInicioServicio       = estado.tiempoActual;
          ps.clienteEnServicio               = cliente;
          const duracion = sortearTiempo(ps.tS, ps.randomParams?.tS);
          ps.tiempoFinServicio               = estado.tiempoActual + duracion;
          ps._ocupadoDesde                   = estado.tiempoActual;
          estado.stats._servidorOcupadoDesde = estado.tiempoActual;
        } else {
          estado.cola.push(cliente);
          estado.cola.sort((a, b) => b.prioridad - a.prioridad);
          HookRegistry.ejecutar("onEncolar", { estado, cliente, psIdx: 0 });
        }
      }

      // Programar la siguiente llegada B
      const tB = estado.paramsModificadores?.prioridades ?? 45;
      estado._eventosExtra.llegada_B = estado.tiempoActual + tB;

      // onLlegadaPost permite que abandono asigne tiempoLimite a los B en cola
      HookRegistry.ejecutar("onLlegadaPost", { estado, cliente });

      Bus.emitir("fila", {
        evento: cliente._labelOverride,
        hora:   estado.tiempoActual,
        estado,
        meta:   { tipo: "llegada", intervalo: null },
      });
    });
  },
};

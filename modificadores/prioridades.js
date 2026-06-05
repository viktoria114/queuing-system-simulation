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
    HookRegistry.registrar("onLlegada", "prioridades", ({ cliente }) => {
      if (cliente.tipo === "B") return;
      cliente.tipo           = "A";
      cliente.prioridad      = 1;
      cliente._labelOverride = `LLEGADA A #${cliente.id}`;
    });

    // ── Helpers: replicar la lógica de _elegirPS / _elegirColaParalelo de motor.js ──
    function elegirPSLibre(e) {
      if (e.topologia === "serie") {
        return e.servidores[0].estado === "LIBRE" ? e.servidores[0] : null;
      }
      if (e.topologia === "paralelo") {
        let mejorPS = null, mejorLen = Infinity;
        for (const ps of e.servidores) {
          const efectiva = (ps.estado === "LIBRE" ? 0 : 1) + (e.colas?.[ps.idx]?.length ?? 0);
          if (efectiva < mejorLen) { mejorLen = efectiva; mejorPS = ps; }
        }
        return mejorPS?.estado === "LIBRE" ? mejorPS : null;
      }
      return e.servidores.find(ps => ps.estado === "LIBRE") ?? null;
    }

    function elegirColaDestino(e) {
      if (e.topologia !== "paralelo") return 0;
      let minLen = Infinity, minIdx = 0;
      for (const ps of e.servidores) {
        const len = e.colas[ps.idx].length;
        if (len < minLen) { minLen = len; minIdx = ps.idx; }
      }
      return minIdx;
    }

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

      // Ejecutar onLlegada — desvío y seguridad pueden interceptar
      const continuar = HookRegistry.ejecutar("onLlegada", { estado, cliente });

      if (continuar !== false) {
        const psDestino = elegirPSLibre(estado);
        if (psDestino !== null) {
          psDestino.estado                    = "OCUPADO";
          cliente.tiempoInicioServicio        = estado.tiempoActual;
          psDestino.clienteEnServicio         = cliente;
          const duracion = sortearTiempo(psDestino.tS, psDestino.randomParams?.tS);
          psDestino.tiempoFinServicio         = estado.tiempoActual + duracion;
          psDestino._ocupadoDesde             = estado.tiempoActual;
          if (psDestino.idx === 0) estado.stats._servidorOcupadoDesde = estado.tiempoActual;
        } else {
          const psIdx = elegirColaDestino(estado);
          const colaDestino = estado.colaPS(psIdx);
          colaDestino.push(cliente);
          colaDestino.sort((a, b) => b.prioridad - a.prioridad);
          HookRegistry.ejecutar("onEncolar", { estado, cliente, psIdx });
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

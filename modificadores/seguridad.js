// ============================================================
// modificadores/seguridad.js — Zona de Seguridad (per-PS)
// ============================================================
// Los clientes deben cruzar una ZS antes de entrar al PS indicado.
//
// Estado per-PS en el objeto de estado:
//   estado.zonasSeguridad[psIdx]  → "LIBRE" | "OCUPADO"
//   estado.clientesEnZona[psIdx]  → cliente que cruza
//   _eventosExtra["zs_ps{i}"]    → tiempo de fin de cruce
//
// Para PS0 se mantienen los alias globales zonaSeguridad / clienteEnZona
// y _eventosExtra.zs para backward compat con vectorInicial.js y la tabla.
// ============================================================

window.modificador_seguridad = {

  iniciar(estado, psIdx = 0) {
    if (!estado.zonasSeguridad)  estado.zonasSeguridad  = {};
    if (!estado.clientesEnZona2) estado.clientesEnZona2 = {};  // per-PS clients

    const zsKey = `zs_ps${psIdx}`;
    if (!HookRegistry.hooks[`onEvento_${zsKey}`]) HookRegistry.hooks[`onEvento_${zsKey}`] = [];

    estado.zonasSeguridad[psIdx]  = "LIBRE";
    estado.clientesEnZona2[psIdx] = null;

    // Backward compat alias para PS0
    if (psIdx === 0) {
      estado.zonaSeguridad = "LIBRE";
      estado.clienteEnZona = null;
    }

    HookRegistry.registrar("onIniciar", `seguridad_ps${psIdx}`, (e) => {
      e.zonasSeguridad[psIdx]  = "LIBRE";
      e.clientesEnZona2[psIdx] = null;
      if (psIdx === 0) { e.zonaSeguridad = "LIBRE"; e.clienteEnZona = null; }
    });

    const ps = estado.servidores[psIdx];

    function tiempoCruce(e) {
      return sortearTiempo(
        ps.paramsModificadores?.seguridad ?? e.paramsModificadores?.seguridad ?? 5,
        ps.randomParams?.seguridad ?? e.randomParams?.seguridad
      );
    }

    function entrarAZS(e, cliente) {
      e.zonasSeguridad[psIdx]  = "OCUPADO";
      e.clientesEnZona2[psIdx] = cliente;
      if (psIdx === 0) { e.zonaSeguridad = "OCUPADO"; e.clienteEnZona = cliente; }
      e._eventosExtra[zsKey] = e.tiempoActual + tiempoCruce(e);
      // Backward compat
      if (psIdx === 0) e._eventosExtra.zs = e._eventosExtra[zsKey];
    }

    // ── Hook onLlegada: interceptar si PS libre ──────────────
    HookRegistry.registrar("onLlegada", `seguridad_ps${psIdx}`, ({ estado: e, cliente }) => {
      const psObj = e.servidores[psIdx];
      if (e.zonasSeguridad[psIdx] === "LIBRE" && psObj.estado === "LIBRE") {
        entrarAZS(e, cliente);
        return false; // no pasar al PS todavía
      }
      if (e.zonasSeguridad[psIdx] === "OCUPADO" && psObj.estado === "LIBRE") {
        // ZS ocupada: "reservar" el PS para quien cruza
        psObj.estado = "OCUPADO";
      }
    });

    // ── Hook onFinServicioPost: encadenar siguiente cruce ────
    HookRegistry.registrar("onFinServicioPost", `seguridad_ps${psIdx}`, ({ estado: e, psIdx: pIdx }) => {
      if (pIdx !== psIdx) return;
      if (e.servidores[psIdx].clienteEnServicio !== null) {
        // El nuevo cliente en el PS debe cruzar la ZS primero
        const clienteParaZS          = e.servidores[psIdx].clienteEnServicio;
        e.servidores[psIdx].tiempoFinServicio = null;
        e.servidores[psIdx].estado            = "LIBRE";
        e.servidores[psIdx].clienteEnServicio = null;
        entrarAZS(e, clienteParaZS);
      }
    });

    // ── Evento: cliente termina de cruzar la ZS ─────────────
    HookRegistry.registrar(`onEvento_${zsKey}`, `seguridad_ps${psIdx}`, (e) => {
      e.tiempoActual         = e._eventosExtra[zsKey];
      e._eventosExtra[zsKey] = null;
      if (psIdx === 0) e._eventosExtra.zs = null;

      const cliente = e.clientesEnZona2[psIdx];
      e.zonasSeguridad[psIdx]  = "LIBRE";
      e.clientesEnZona2[psIdx] = null;
      if (psIdx === 0) { e.zonaSeguridad = "LIBRE"; e.clienteEnZona = null; }

      const psObj = e.servidores[psIdx];
      cliente.tiempoInicioServicio = e.tiempoActual;
      psObj.clienteEnServicio      = cliente;
      psObj.estado                 = "OCUPADO";
      psObj.tiempoFinServicio      = e.tiempoActual + sortearTiempo(psObj.tS, psObj.randomParams?.tS);
      psObj._ocupadoDesde          = e.tiempoActual;
      if (psIdx === 0) e.stats._servidorOcupadoDesde = e.tiempoActual;

      Bus.emitir("fila", {
        evento: `LLEGA AL PS${psIdx + 1} #${cliente.id}`,
        hora:   e.tiempoActual,
        estado: e,
      });
    });
  },
};

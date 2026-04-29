// ============================================================
// modificadores/seguridad.js — Modificador: Zona de Seguridad
// ============================================================
// El tiempo de cruce de la ZS puede ser fijo o aleatorio.
//
// Parámetros:
//   paramsModificadores.seguridad = valor fijo del cruce (s)
//   randomParams.seguridad        = { modo, min, max }
// ============================================================

window.modificador_seguridad = {

  iniciar(estado) {

    estado.zonaSeguridad = "LIBRE";
    estado.clienteEnZona = null;

    HookRegistry.registrar("onIniciar", "seguridad", (e) => {
      e.zonaSeguridad = "LIBRE";
      e.clienteEnZona = null;
    });

    HookRegistry.registrar("onLlegada", "seguridad", ({ estado: e, cliente }) => {
      if (e.zonaSeguridad === "LIBRE" && e.servidor.estado === "LIBRE") {
        e.zonaSeguridad = "OCUPADO";
        e.clienteEnZona = cliente;
        const tiempoCruceBase = e.paramsModificadores?.seguridad ?? 5;
        const tiempoCruce = sortearTiempo(tiempoCruceBase, e.randomParams?.seguridad);
        e._eventosExtra.zs = e.tiempoActual + tiempoCruce;
        return false; // cancela que el motor asigne al PS
      }

      if (e.zonaSeguridad === "OCUPADO" && e.servidor.estado === "LIBRE") {
        e.servidor.estado = "OCUPADO";
      }
    });

    HookRegistry.registrar("onFinServicioPost", "seguridad", ({ estado: e }) => {
      if (e.clienteEnServicio !== null) {
        const clienteParaZS = e.clienteEnServicio;

        e.proximoEventoFinServicio = null;
        e.servidor.estado          = "LIBRE";
        e.clienteEnServicio        = null;

        e.zonaSeguridad = "OCUPADO";
        e.clienteEnZona = clienteParaZS;

        const tiempoCruceBase = e.paramsModificadores?.seguridad ?? 5;
        const tiempoCruce = sortearTiempo(tiempoCruceBase, e.randomParams?.seguridad);
        e._eventosExtra.zs = e.tiempoActual + tiempoCruce;
      }
    });

    if (!HookRegistry.hooks["onEvento_zs"]) HookRegistry.hooks["onEvento_zs"] = [];
    HookRegistry.registrar("onEvento_zs", "seguridad", (e) => {
      e.tiempoActual     = e._eventosExtra.zs;
      e._eventosExtra.zs = null;

      const cliente = e.clienteEnZona;
      e.zonaSeguridad = "LIBRE";
      e.clienteEnZona = null;

      cliente.tiempoInicioServicio    = e.tiempoActual;
      e.clienteEnServicio             = cliente;
      e.servidor.estado               = "OCUPADO";
      const duracion = sortearTiempo(e.tS, e.randomParams?.tS);
      e.proximoEventoFinServicio      = e.tiempoActual + duracion;

      Bus.emitir("fila", {
        evento: `LLEGA AL PS #${cliente.id}`,
        hora:   e.tiempoActual,
        estado: e,
      });
    });
  },
};

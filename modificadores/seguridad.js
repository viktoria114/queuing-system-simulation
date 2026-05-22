// ============================================================
// modificadores/seguridad.js — Modificador: Zona de Seguridad
// ============================================================
// Problema 5: los clientes deben cruzar una zona de seguridad (ZS)
// antes de entrar al puesto de servicio. El cruce toma un tiempo
// configurable (fijo o aleatorio).
//
// Flujo con ZS activa:
//   Llegada → [ZS libre y PS libre] → cliente entra a ZS
//          → [evento zs] → cliente pasa al PS → fin de servicio
//
//   Si el PS está ocupado al llegar el cliente, va a la cola normalmente
//   (la ZS solo intercepta cuando PS está libre).
//
// Variables de estado que usa:
//   estado.zonaSeguridad   → "LIBRE" | "OCUPADO"
//   estado.clienteEnZona   → cliente que está cruzando la ZS
//   estado._eventosExtra.zs → tiempo absoluto en que termina el cruce actual
//
// Parámetros:
//   paramsModificadores.seguridad = valor fijo del cruce (s)
//   randomParams.seguridad        = { modo, min, max }
// ============================================================

window.modificador_seguridad = {

  iniciar(estado) {
    // Inicializar la zona de seguridad como libre al arrancar
    estado.zonaSeguridad = "LIBRE";
    estado.clienteEnZona = null;

    HookRegistry.registrar("onIniciar", "seguridad", (e) => {
      e.zonaSeguridad = "LIBRE";
      e.clienteEnZona = null;
    });

    // ── Hook onLlegada: interceptar al cliente si PS está libre ──
    // Caso 1: ZS libre y PS libre → cliente entra a ZS (retorna false para
    //         cancelar la lógica estándar de pasar al PS directamente).
    // Caso 2: ZS ocupada y PS libre → marcar PS como ocupado para que el
    //         motor no intente servir a quien llega (la ZS ya tiene a alguien).
    HookRegistry.registrar("onLlegada", "seguridad", ({ estado: e, cliente }) => {
      if (e.zonaSeguridad === "LIBRE" && e.servidor.estado === "LIBRE") {
        // El cliente no va al PS todavía; debe cruzar la ZS primero
        e.zonaSeguridad = "OCUPADO";
        e.clienteEnZona = cliente;
        const tiempoCruceBase = e.paramsModificadores?.seguridad ?? 5;
        const tiempoCruce = sortearTiempo(tiempoCruceBase, e.randomParams?.seguridad);
        e._eventosExtra.zs = e.tiempoActual + tiempoCruce; // agendar fin de cruce
        return false; // cancelar: motor.js no debe enviar este cliente al PS
      }

      if (e.zonaSeguridad === "OCUPADO" && e.servidor.estado === "LIBRE") {
        // ZS ocupada: marcar PS como ocupado para que el cliente que llega
        // vaya a la cola y no al PS (el PS "reservado" para quien está en ZS)
        e.servidor.estado = "OCUPADO";
      }
    });

    // ── Hook onFinServicioPost: cuando el PS queda libre, revisar la ZS ──
    // Si el cliente que terminó el servicio ya puede salir, y hay cliente
    // en cola esperando entrar a ZS, iniciar el cruce del siguiente.
    // Nota: este hook se usa para "encadenar" el próximo cruce de ZS
    // después de que un cliente termina el servicio.
    HookRegistry.registrar("onFinServicioPost", "seguridad", ({ estado: e }) => {
      if (e.clienteEnServicio !== null) {
        // Hay un nuevo cliente en el PS (tomado de la cola); enviarlo
        // a través de la ZS antes de que empiece el servicio real.
        // Nota: este caso ocurre cuando hay clientes en cola esperando
        // tras un servicio finalizado.
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

    // ── Evento zs: el cliente terminó de cruzar la zona de seguridad ──
    // Ahora puede entrar al PS para recibir el servicio.
    if (!HookRegistry.hooks["onEvento_zs"]) HookRegistry.hooks["onEvento_zs"] = [];
    HookRegistry.registrar("onEvento_zs", "seguridad", (e) => {
      e.tiempoActual     = e._eventosExtra.zs;
      e._eventosExtra.zs = null;

      const cliente = e.clienteEnZona;
      e.zonaSeguridad = "LIBRE"; // la zona queda libre para el próximo
      e.clienteEnZona = null;

      // El cliente entra al PS
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

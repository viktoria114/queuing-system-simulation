// ============================================================
// modificadores/seguridad.js — Modificador: Zona de Seguridad
// ============================================================
// Según el Problema 5 del PDF:
// Existe una Zona de Seguridad (ZS) entre la cola y el PS.
// Un cliente de la cola solo puede entrar a la ZS cuando
// termina el servicio del cliente anterior.
// Mientras el cliente en ZS no termina, nadie entra a la ZS.
//
// Variables de estado que agrega:
//   estado.zonaSeguridad: "LIBRE" | "OCUPADO"
//   estado.clienteEnZona: el cliente que está cruzando la ZS
//
// HOOKS:
//   onIniciar        → inicializa zonaSeguridad en el estado
//   onLlegada        → controla si puede entrar directo a ZS o va a cola
//   onFinServicioPost → cuando termina el PS, el primero de cola pasa a ZS
//   onEvento_zs      → evento custom: el cliente en ZS llega al PS
// ============================================================

window.modificador_seguridad = {

  iniciar(estado) {

    // Inicializar las variables nuevas en el estado
    estado.zonaSeguridad = "LIBRE";
    estado.clienteEnZona = null;

    // ── Hook 1: al iniciar, preparar el estado ──
    HookRegistry.registrar("onIniciar", "seguridad", (estado) => {
      estado.zonaSeguridad = "LIBRE";
      estado.clienteEnZona = null;
    });

    // ── Hook 2: controlar llegadas ──
    // Si llega un cliente y ZS + PS están libres y no hay cola → entra a ZS
    // Si no → va a la cola normalmente (el motor lo maneja solo)
    // Pero si el servidor está "LIBRE" según el motor pero la ZS está ocupada,
    // hay que evitar que el motor lo mande directo al PS.
    HookRegistry.registrar("onLlegada", "seguridad", ({ estado, cliente }) => {
      // Si la zona de seguridad está ocupada, el servidor debe parecer "OCUPADO"
      // para que el motor encole al cliente en vez de mandarlo al PS
      if (estado.zonaSeguridad === "OCUPADO" && estado.servidor.estado === "LIBRE") {
        // Temporalmente bloqueamos: forzamos que vaya a cola
        estado.servidor.estado = "OCUPADO";
        // Nota: clienteEnServicio sigue null, así el motor lo encola
      }
    });

    // ── Hook 3: cuando termina el servicio ──
    // El PS queda libre. Si hay alguien en cola, pasa a la ZS (no al PS directo).
    // Si hay alguien en la ZS esperando llegar al PS, ahora puede entrar.
    HookRegistry.registrar("onFinServicioPost", "seguridad", ({ estado }) => {
      // El motor ya sacó al cliente del PS y puso el siguiente de la cola en servicio.
      // Tenemos que deshacer eso: el siguiente debe ir a ZS, no al PS.

      if (estado.clienteEnServicio !== null) {
        // El motor ya asignó un cliente al PS, pero con ZS activa
        // ese cliente debe pasar por ZS primero.
        // Lo movemos a la zona de seguridad.
        const clienteEnPS = estado.clienteEnServicio;

        // Cancelar el fin de servicio que programó el motor
        estado.proximoEventoFinServicio = null;
        estado.servidor.estado = "LIBRE";
        estado.clienteEnServicio = null;

        // Ponerlo en la zona de seguridad
        estado.zonaSeguridad = "OCUPADO";
        estado.clienteEnZona = clienteEnPS;

        // Programar evento: el cliente llega al PS
        // (usamos tS como tiempo de cruce de la zona, ajustable)
        const tiempoCruce = estado.paramsModificadores?.seguridad ?? 5;
        estado._eventosExtra.zs = estado.tiempoActual + tiempoCruce;

        Bus.emitir("fila", {
          evento: `ENTRA ZS #${clienteEnPS.id}`,
          hora: estado.tiempoActual,
          estado,
        });
      }
    });

    // ── Hook 4: evento custom — el cliente en ZS llega al PS ──
    HookRegistry.registrar("onEvento_zs", "seguridad", (estado) => {
      estado.tiempoActual = estado._eventosExtra.zs;
      estado._eventosExtra.zs = null;

      const cliente = estado.clienteEnZona;
      estado.zonaSeguridad = "LIBRE";
      estado.clienteEnZona = null;

      // Ahora sí entra al PS
      cliente.tiempoInicioServicio = estado.tiempoActual;
      estado.clienteEnServicio     = cliente;
      estado.servidor.estado       = "OCUPADO";
      estado.proximoEventoFinServicio = estado.tiempoActual + estado.tS;

      Bus.emitir("fila", {
        evento: `LLEGA AL PS #${cliente.id}`,
        hora: estado.tiempoActual,
        estado,
      });
    });

  },
};
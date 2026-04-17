// ============================================================
// modificadores/seguridad.js — Modificador: Zona de Seguridad
// ============================================================
// Según el Problema 5 del PDF:
// Existe una Zona de Seguridad (ZS) entre la cola y el PS.
// Un cliente solo puede entrar a la ZS en dos casos:
//   A) Llega con cola vacía y ZS + PS libres → va directo a ZS.
//   B) El PS termina servicio → el primer cliente de cola pasa a ZS.
// Mientras haya servicio en curso, nadie puede entrar a la ZS.
//
// Variables de estado que agrega:
//   estado.zonaSeguridad: "LIBRE" | "OCUPADO"
//   estado.clienteEnZona: el cliente que está cruzando la ZS
//
// HOOKS:
//   onIniciar        → inicializa zonaSeguridad en el estado
//   onLlegada        → decide si el cliente va a ZS (caso A) o a cola
//   onFinServicioPost → cuando termina el PS, el primer cliente de cola pasa a ZS
//   onEvento_zs      → evento custom: el cliente en ZS llega al PS
// ============================================================

window.modificador_seguridad = {

  iniciar(estado) {

    estado.zonaSeguridad = "LIBRE";
    estado.clienteEnZona = null;

    // ── Hook 1: al iniciar ──
    HookRegistry.registrar("onIniciar", "seguridad", (estado) => {
      estado.zonaSeguridad = "LIBRE";
      estado.clienteEnZona = null;
    });

    // ── Hook 2: controlar llegadas ──
    // Caso A: ZS libre y PS libre → cliente entra directo a la ZS.
    //         Retornamos false para cancelar la asignación al PS del motor.
    // Caso B: ZS ocupada y PS libre → fingimos PS ocupado para que el motor encole.
    // Caso C: PS ocupado → motor encola solo, no hacemos nada.
    HookRegistry.registrar("onLlegada", "seguridad", ({ estado, cliente }) => {
      if (estado.zonaSeguridad === "LIBRE" && estado.servidor.estado === "LIBRE") {
        // Caso A: entrada directa a ZS (único caso según el enunciado)
        estado.zonaSeguridad = "OCUPADO";
        estado.clienteEnZona = cliente;
        const tiempoCruce = estado.paramsModificadores?.seguridad ?? 5;
        estado._eventosExtra.zs = estado.tiempoActual + tiempoCruce;
        return false; // cancela que el motor asigne al PS
      }

      if (estado.zonaSeguridad === "OCUPADO" && estado.servidor.estado === "LIBRE") {
        // Caso B: ZS ocupada pero PS libre → forzar encolar fingiendo PS ocupado
        estado.servidor.estado = "OCUPADO";
        // clienteEnServicio sigue null — el motor encola al cliente
      }
    });

    // ── Hook 3: cuando termina el servicio ──
    // El motor asignó el siguiente de cola al PS. Lo interceptamos: va a ZS primero.
    // La fila "FIN SERVICIO" se emite después con el estado actualizado
    // (ZS=OCUPADO, PS=LIBRE), lo que ya muestra que el cliente entró a ZS.
    HookRegistry.registrar("onFinServicioPost", "seguridad", ({ estado }) => {
      if (estado.clienteEnServicio !== null) {
        const clienteParaZS = estado.clienteEnServicio;

        // Deshacemos la asignación al PS que hizo el motor
        estado.proximoEventoFinServicio = null;
        estado.servidor.estado          = "LIBRE";
        estado.clienteEnServicio        = null;

        // Enviamos al cliente a la zona de seguridad
        estado.zonaSeguridad = "OCUPADO";
        estado.clienteEnZona = clienteParaZS;

        const tiempoCruce = estado.paramsModificadores?.seguridad ?? 5;
        estado._eventosExtra.zs = estado.tiempoActual + tiempoCruce;
        // No emitimos fila aquí — el motor emite "FIN SERVICIO" justo después
        // con el estado ya actualizado (ZS=OCUPADO, PS=LIBRE, Llega al PS=T).
      }
    });

    // ── Hook 4: el cliente en ZS llega al PS ──
    // FIX: pre-inicializamos el array porque HookRegistry.registrar() ignora
    // nombres que no existen en su objeto inicial (retorna sin registrar).
    if (!HookRegistry.hooks["onEvento_zs"]) HookRegistry.hooks["onEvento_zs"] = [];
    HookRegistry.registrar("onEvento_zs", "seguridad", (estado) => {
      estado.tiempoActual     = estado._eventosExtra.zs;
      estado._eventosExtra.zs = null;

      const cliente = estado.clienteEnZona;
      estado.zonaSeguridad = "LIBRE";
      estado.clienteEnZona = null;

      cliente.tiempoInicioServicio        = estado.tiempoActual;
      estado.clienteEnServicio            = cliente;
      estado.servidor.estado              = "OCUPADO";
      estado.proximoEventoFinServicio     = estado.tiempoActual + estado.tS;

      Bus.emitir("fila", {
        evento: `LLEGA AL PS #${cliente.id}`,
        hora:   estado.tiempoActual,
        estado,
      });
    });

  },
};

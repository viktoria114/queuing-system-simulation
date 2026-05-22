// ============================================================
// modificadores/descanso.js — Modificador: Descanso del servidor
// ============================================================
// Problema 1 / Problema 2: el servidor alterna ciclos de trabajo
// (duración ΔT) y descanso (duración ΔD).
//
// Política durante el descanso:
//   - Si hay un cliente en servicio cuando llega la SALIDA, ese cliente
//     SE QUEDA en el PS (no vuelve a la cola). El fin de servicio queda
//     congelado: motor.js no lo procesa mientras _servidorPresente === false.
//   - Cuando el servidor regresa, retoma el servicio desde el tiempo
//     restante guardado en clienteEnServicio._tiempoRestante.
//
// Variables de estado que usa:
//   estado._servidorPresente  → false mientras descansa
//   estado._servidorAusente   → alias invertido para la UI
//
// Parámetros:
//   paramsModificadores.descanso         = ΔD (duración descanso, default 60 s)
//   paramsModificadores.descanso_trabajo = ΔT (duración trabajo,  default 30 s)
//   randomParams.deltaD  = { modo, min, max }
//   randomParams.deltaT  = { modo, min, max }
// ============================================================

window.modificador_descanso = {

  iniciar(estado) {
    // Sortear la duración del primer período de trabajo y agendarlo
    const durT = sortearTiempo(
      estado.paramsModificadores?.descanso_trabajo ?? 30,
      estado.randomParams?.deltaT
    );

    estado._servidorPresente = true;
    estado._servidorAusente  = false;

    // El primer evento del servidor es la salida al primer descanso
    estado._eventosExtra.servidor_salida = estado.tiempoActual + durT;

    // ── Evento: servidor se va (fin del período de trabajo) ──────
    // Se dispara cuando expira servidor_salida.
    HookRegistry.registrar("onEvento_servidor_salida", "descanso", (e) => {
      e.tiempoActual                  = e._eventosExtra.servidor_salida;
      e._eventosExtra.servidor_salida = null; // limpiar; se repondrá al regresar
      e._servidorPresente             = false;
      e._servidorAusente              = true;

      // Sortear duración del descanso y agendar el regreso
      const dD = sortearTiempo(
        e.paramsModificadores?.descanso ?? 60,
        e.randomParams?.deltaD
      );
      e._eventosExtra.servidor_llegada = e.tiempoActual + dD;

      // Si hay cliente en servicio: guardar tiempo restante.
      // El cliente NO vuelve a la cola; el PS queda "ocupado pero congelado".
      // motor.js ignora el fin de servicio mientras !_servidorPresente.
      if (e.clienteEnServicio !== null) {
        const restante = e.proximoEventoFinServicio - e.tiempoActual;
        e.clienteEnServicio._tiempoRestante = restante;
        // proximoEventoFinServicio se mantiene para referencia, pero
        // el bucle principal lo ignora hasta que _servidorPresente vuelva a ser true.
      }

      // Actualizar estado del servidor para la tabla
      e.servidor.estado = e.clienteEnServicio !== null ? "OCUPADO" : "LIBRE";

      Bus.emitir("fila", { evento: "SALIDA SERVIDOR", hora: e.tiempoActual, estado: e });
    });

    // ── Evento: servidor regresa (fin del período de descanso) ───
    // Se dispara cuando expira servidor_llegada.
    HookRegistry.registrar("onEvento_servidor_llegada", "descanso", (e) => {
      e.tiempoActual                    = e._eventosExtra.servidor_llegada;
      e._eventosExtra.servidor_llegada  = null;
      e._servidorPresente               = true;
      e._servidorAusente                = false;

      // Sortear duración del próximo período de trabajo y agendarlo
      const dT = sortearTiempo(
        e.paramsModificadores?.descanso_trabajo ?? 30,
        e.randomParams?.deltaT
      );
      e._eventosExtra.servidor_salida = e.tiempoActual + dT;

      if (e.clienteEnServicio !== null) {
        // Había un cliente esperando en el PS: reanudar con el tiempo restante
        const restante = e.clienteEnServicio._tiempoRestante ?? e.tS;
        e.clienteEnServicio._tiempoRestante      = null;
        e.clienteEnServicio.tiempoInicioServicio = e.tiempoActual; // reinicio del reloj de espera
        e.proximoEventoFinServicio = e.tiempoActual + restante;
        e.servidor.estado = "OCUPADO";
      } else if (e.cola.length > 0) {
        // No había cliente en PS pero hay cola: atender el siguiente
        const siguiente = e.cola.shift();
        siguiente.tiempoInicioServicio  = e.tiempoActual;
        e.clienteEnServicio             = siguiente;
        e.servidor.estado               = "OCUPADO";
        const duracion = sortearTiempo(e.tS, e.randomParams?.tS);
        e.proximoEventoFinServicio      = e.tiempoActual + duracion;
      } else {
        // Sin clientes en PS ni en cola: servidor libre
        e.servidor.estado = "LIBRE";
      }

      Bus.emitir("fila", { evento: "LLEGADA SERVIDOR", hora: e.tiempoActual, estado: e });
    });
  },
};

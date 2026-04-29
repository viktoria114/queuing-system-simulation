// ============================================================
// modificadores/descanso.js — Problema N°2
// ============================================================
// El servidor alterna ciclos: trabaja ΔT segundos, descansa ΔD segundos.
//
// Política: si hay un servicio en curso cuando llega la SALIDA,
// el cliente SE QUEDA en el PS. El servidor se va (estado._servidorPresente = false)
// y el fin de servicio queda congelado. Cuando el servidor regresa,
// el motor retoma el fin de servicio desde donde quedó (tiempo restante).
//
// Variables de estado que usa:
//   estado._servidorPresente  (bool) — false mientras está en descanso
//   estado._servidorAusente   (bool) — alias invertido para compatibilidad con ui.js
//
// Parámetros:
//   paramsModificadores.descanso         = ΔD (duración descanso, default 60 s)
//   paramsModificadores.descanso_trabajo = ΔT (duración trabajo,  default 30 s)
//   randomParams.deltaD  = { modo, min, max }
//   randomParams.deltaT  = { modo, min, max }
// ============================================================

window.modificador_descanso = {

  iniciar(estado) {
    const durT = sortearTiempo(
      estado.paramsModificadores?.descanso_trabajo ?? 30,
      estado.randomParams?.deltaT
    );

    estado._servidorPresente = true;
    estado._servidorAusente  = false;

    // Programar la primera salida del servidor
    estado._eventosExtra.servidor_salida = estado.tiempoActual + durT;

    // ── Evento: servidor se va (fin de período de trabajo) ───────
    HookRegistry.registrar("onEvento_servidor_salida", "descanso", (e) => {
      e.tiempoActual                  = e._eventosExtra.servidor_salida;
      e._eventosExtra.servidor_salida = null;
      e._servidorPresente             = false;
      e._servidorAusente              = true;

      // Calcular duración del descanso (puede ser aleatoria)
      const dD = sortearTiempo(
        e.paramsModificadores?.descanso ?? 60,
        e.randomParams?.deltaD
      );
      e._eventosExtra.servidor_llegada = e.tiempoActual + dD;

      // Si hay cliente en servicio: guardar tiempo restante, pero
      // el cliente SE QUEDA en el PS (no vuelve a la cola).
      // El fin de servicio queda congelado: motor.js no lo procesa
      // mientras _servidorPresente === false.
      if (e.clienteEnServicio !== null) {
        const restante = e.proximoEventoFinServicio - e.tiempoActual;
        e.clienteEnServicio._tiempoRestante = restante;
        // proximoEventoFinServicio se mantiene para saber cuánto falta,
        // pero el loop principal lo ignora mientras !_servidorPresente.
      }

      e.servidor.estado = "OCUPADO"; // sigue ocupado con el cliente en espera (o LIBRE si no hay)
      if (e.clienteEnServicio === null) {
        e.servidor.estado = "LIBRE";
      }

      Bus.emitir("fila", { evento: "SALIDA SERVIDOR", hora: e.tiempoActual, estado: e });
    });

    // ── Evento: servidor regresa (fin del descanso) ─────────────
    HookRegistry.registrar("onEvento_servidor_llegada", "descanso", (e) => {
      e.tiempoActual                    = e._eventosExtra.servidor_llegada;
      e._eventosExtra.servidor_llegada  = null;
      e._servidorPresente               = true;
      e._servidorAusente                = false;

      // Calcular duración del próximo período de trabajo (puede ser aleatoria)
      const dT = sortearTiempo(
        e.paramsModificadores?.descanso_trabajo ?? 30,
        e.randomParams?.deltaT
      );
      e._eventosExtra.servidor_salida = e.tiempoActual + dT;

      if (e.clienteEnServicio !== null) {
        // Hay un cliente que estaba esperando en el PS:
        // retomar con el tiempo restante que fue guardado.
        const restante = e.clienteEnServicio._tiempoRestante ?? e.tS;
        e.clienteEnServicio._tiempoRestante = null;
        e.clienteEnServicio.tiempoInicioServicio = e.tiempoActual; // reinicio a efectos de espera
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
        e.servidor.estado = "LIBRE";
      }

      Bus.emitir("fila", { evento: "LLEGADA SERVIDOR", hora: e.tiempoActual, estado: e });
    });
  },
};

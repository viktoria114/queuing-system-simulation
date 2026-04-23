// ============================================================
// modificadores/descanso.js — Problema N°2
// ============================================================
// El servidor alterna ciclos: trabaja ΔT segundos, descansa ΔD
// segundos, trabaja ΔT segundos, etc.
//
// Política (Opción A): si hay un servicio en curso cuando llega
// la SALIDA, se INTERRUMPE inmediatamente. El cliente vuelve al
// frente de la cola y el servidor pasa a AUSENTE sin esperar.
//
// Eventos extra:
//   servidor_salida  → fin del período de trabajo → servidor ausente
//   servidor_llegada → fin del descanso           → servidor presente
//
// Estado extra en motor:
//   estado._servidorAusente  (bool) — motor.js lo respeta al
//   asignar el siguiente cliente después de un fin de servicio.
//
// Parámetros:
//   paramsModificadores.descanso         = ΔD (duración descanso, default 60 s)
//   paramsModificadores.descanso_trabajo = ΔT (duración trabajo,  default 30 s)
// ============================================================

window.modificador_descanso = {

  iniciar(estado) {
    const durD = estado.paramsModificadores?.descanso          ?? 60;
    const durT = estado.paramsModificadores?.descanso_trabajo  ?? 30;

    estado._servidorAusente = false;

    // Programar la primera salida del servidor
    estado._eventosExtra.servidor_salida = estado.tiempoActual + durT;

    // ── Evento: servidor se va (fin de período de trabajo) ───────
    HookRegistry.registrar("onEvento_servidor_salida", "descanso", (estado) => {
      estado.tiempoActual                  = estado._eventosExtra.servidor_salida;
      estado._eventosExtra.servidor_salida = null;
      estado._servidorAusente              = true;

      const dD = estado.paramsModificadores?.descanso ?? 60;
      estado._eventosExtra.servidor_llegada = estado.tiempoActual + dD;

      // Opción A: si hay servicio en curso, interrumpirlo.
      // Guardamos el tiempo RESTANTE para retomarlo exactamente donde se cortó.
      if (estado.servidor.estado === "OCUPADO") {
        const interrumpido = estado.clienteEnServicio;
        interrumpido._tiempoRestante      = estado.proximoEventoFinServicio - estado.tiempoActual;
        interrumpido.tiempoInicioServicio  = null;
        estado.cola.unshift(interrumpido);
        estado.clienteEnServicio           = null;
        estado.proximoEventoFinServicio    = null;
      }

      estado.servidor.estado = "AUSENTE";

      Bus.emitir("fila", { evento: "SALIDA SERVIDOR", hora: estado.tiempoActual, estado });
    });

    // ── Evento: servidor regresa (fin del descanso) ─────────────
    HookRegistry.registrar("onEvento_servidor_llegada", "descanso", (estado) => {
      estado.tiempoActual                   = estado._eventosExtra.servidor_llegada;
      estado._eventosExtra.servidor_llegada = null;
      estado._servidorAusente               = false;

      const dT = estado.paramsModificadores?.descanso_trabajo ?? 30;
      estado._eventosExtra.servidor_salida  = estado.tiempoActual + dT;

      // Retomar atención: si el primero de la cola fue interrumpido, usa su
      // tiempo restante; si es un cliente nuevo, usa tS completo.
      if (estado.cola.length > 0) {
        const siguiente                = estado.cola.shift();
        siguiente.tiempoInicioServicio  = estado.tiempoActual;
        estado.clienteEnServicio        = siguiente;
        estado.servidor.estado          = "OCUPADO";
        const duracion                  = siguiente._tiempoRestante ?? estado.tS;
        siguiente._tiempoRestante       = null;
        estado.proximoEventoFinServicio = estado.tiempoActual + duracion;
      } else {
        estado.servidor.estado = "LIBRE";
      }

      Bus.emitir("fila", { evento: "LLEGADA SERVIDOR", hora: estado.tiempoActual, estado });
    });
  },
};

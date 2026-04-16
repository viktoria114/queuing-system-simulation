// ============================================================
// modificadores/descanso.js — Problema N°2
// ============================================================
// El servidor alterna ciclos: trabaja ΔT segundos, descansa ΔD
// segundos, trabaja ΔT segundos, etc.
//
// Durante el descanso los clientes se acumulan en cola. Si hay
// un servicio en curso cuando el servidor se va, ese servicio
// termina normalmente, pero el próximo cliente NO es tomado
// de la cola hasta que el servidor regrese.
//
// Eventos extra:
//   servidor_salida  → fin del período de trabajo → servidor ausente
//   servidor_llegada → fin del descanso           → servidor presente
//
// Estado extra en motor:
//   estado._servidorAusente  (bool)   — motor.js lo respeta al
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
      estado.tiempoActual                    = estado._eventosExtra.servidor_salida;
      estado._eventosExtra.servidor_salida   = null;
      estado._servidorAusente                = true;

      const dD = estado.paramsModificadores?.descanso ?? 60;
      estado._eventosExtra.servidor_llegada  = estado.tiempoActual + dD;

      // Si el PS estaba libre, pasar a AUSENTE para bloquear nuevas atenciones
      if (estado.servidor.estado === "LIBRE") {
        estado.servidor.estado = "AUSENTE";
      }
      // Si estaba OCUPADO, _servidorAusente=true es suficiente:
      // motor.js no tomará el siguiente de la cola al terminar ese servicio.

      Bus.emitir("fila", { evento: "SALIDA SERVIDOR", hora: estado.tiempoActual, estado });
    });

    // ── Evento: servidor regresa (fin del descanso) ─────────────
    HookRegistry.registrar("onEvento_servidor_llegada", "descanso", (estado) => {
      estado.tiempoActual                    = estado._eventosExtra.servidor_llegada;
      estado._eventosExtra.servidor_llegada  = null;
      estado._servidorAusente                = false;

      const dT = estado.paramsModificadores?.descanso_trabajo ?? 30;
      estado._eventosExtra.servidor_salida   = estado.tiempoActual + dT;

      // Si el PS quedó libre (AUSENTE) y hay cola, retomar atención
      if (estado.servidor.estado === "AUSENTE" || estado.servidor.estado === "LIBRE") {
        if (estado.cola.length > 0) {
          const siguiente                        = estado.cola.shift();
          siguiente.tiempoInicioServicio         = estado.tiempoActual;
          estado.clienteEnServicio               = siguiente;
          estado.servidor.estado                 = "OCUPADO";
          estado.proximoEventoFinServicio        = estado.tiempoActual + estado.tS;
        } else {
          estado.servidor.estado = "LIBRE";
        }
      }
      // Si estaba OCUPADO, _servidorAusente=false: al terminar ese servicio
      // motor.js tomará normalmente el siguiente cliente de la cola.

      Bus.emitir("fila", { evento: "LLEGADA SERVIDOR", hora: estado.tiempoActual, estado });
    });
  },
};

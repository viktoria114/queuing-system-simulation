// ============================================================
// motor.js — Lógica pura de simulación de teoría de colas
// No toca el DOM. Se comunica con ui.js mediante Bus.
// ============================================================

// ─── BUS DE EVENTOS ─────────────────────────────────────────
// Canal de comunicación entre motor.js y ui.js.
// motor.js emite, ui.js escucha. Nunca al revés.

const Bus = {
  _listeners: {},

  on(evento, fn) {
    if (!this._listeners[evento]) this._listeners[evento] = [];
    this._listeners[evento].push(fn);
  },

  emitir(evento, datos) {
    (this._listeners[evento] || []).forEach(fn => fn(datos));
  },

  limpiar() {
    this._listeners = {};
  },
};

// ─── ESTADO ─────────────────────────────────────────────────
// Única fuente de verdad. Modificadores leen y escriben aquí.

let estado = {};

function crearEstadoInicial(params) {
  return {
    tiempoActual:   0,
    tiempoTotal:    params.tiempoTotal,
    tLL:            params.tLL,
    tS:             params.tS,

    clienteIdCounter: 0,

    servidor: {
      estado: "LIBRE",          // "LIBRE" | "OCUPADO" | "DESCANSO"
      tiempoFinServicio: null,
    },

    cola:               [],
    clienteEnServicio:  null,

    proximoEventoLlegada:     null,
    proximoEventoFinServicio: null,
    _eventosExtra:            {},  // modificadores pueden inyectar eventos propios
    _servidorAusente:         false,

    stats: {
      clientesAtendidos:   0,
      clientesAbandonaron: 0,
      tiempoEsperaTotal:   0,
    },

    modificadoresActivos: params.modificadoresActivos || {},
    paramsModificadores:  params.paramsModificadores  || {},

    corriendo: false,
  };
}

// ─── HOOKS ──────────────────────────────────────────────────
// Modificadores se registran con HookRegistry.registrar(momento, nombre, fn).
// Si fn() retorna false, el evento se cancela.

const HookRegistry = {
  hooks: {
    onIniciar:         [],
    onLlegada:         [],   // antes de encolar — puede cancelar (return false)
    onLlegadaPost:     [],   // después de encolar
    onFinServicio:     [],   // antes de liberar servidor
    onFinServicioPost: [],   // después de liberar servidor
    onPaso:            [],   // cada tick del loop
    onFin:             [],   // al terminar la simulación
  },

  registrar(momento, nombre, fn) {
    if (!this.hooks[momento]) this.hooks[momento] = [];
    this.hooks[momento].push({ nombre, fn });
  },

  ejecutar(momento, datos) {
    for (const hook of (this.hooks[momento] || [])) {
      if (hook.fn(datos) === false) return false;
    }
    return true;
  },

  limpiar() {
    for (const key of Object.keys(this.hooks)) this.hooks[key] = [];
  },
};

// ─── GENERADORES ────────────────────────────────────────────

function generarProximaLlegada()  { return estado.tiempoActual + estado.tLL; }
function generarTiempoServicio()  { return estado.tiempoActual + estado.tS;  }

// ─── EVENTOS BASE ───────────────────────────────────────────

function procesarLlegada() {
  estado.tiempoActual = estado.proximoEventoLlegada;
  estado.clienteIdCounter++;

  const cliente = {
    id:                   estado.clienteIdCounter,
    tiempoLlegada:        estado.tiempoActual,
    tiempoInicioServicio: null,
    prioridad:            0,
  };

  const continuar = HookRegistry.ejecutar("onLlegada", { estado, cliente });

  if (continuar !== false) {
    if (estado.servidor.estado === "LIBRE") {
      estado.servidor.estado        = "OCUPADO";
      cliente.tiempoInicioServicio  = estado.tiempoActual;
      estado.clienteEnServicio      = cliente;
      estado.proximoEventoFinServicio = generarTiempoServicio();
    } else {
      estado.cola.push(cliente);
      estado.cola.sort((a, b) => b.prioridad - a.prioridad); // para modificador Prioridades
    }
  }

  estado.proximoEventoLlegada = generarProximaLlegada();
  HookRegistry.ejecutar("onLlegadaPost", { estado, cliente });

  Bus.emitir("fila", { evento: cliente._labelOverride || `LLEGADA #${cliente.id}`, hora: estado.tiempoActual, estado });
}

function procesarFinServicio() {
  if (estado._servidorAusente) return;   // no puede completar servicio mientras está ausente
  estado.tiempoActual = estado.proximoEventoFinServicio;
  const clienteAtendido = estado.clienteEnServicio;

  HookRegistry.ejecutar("onFinServicio", { estado, clienteAtendido });

  estado.stats.clientesAtendidos++;
  const espera = (clienteAtendido?.tiempoInicioServicio ?? estado.tiempoActual)
                 - (clienteAtendido?.tiempoLlegada ?? estado.tiempoActual);
  estado.stats.tiempoEsperaTotal += Math.max(0, espera);

  if (estado.cola.length > 0 && !estado._servidorAusente) {
    const siguiente = estado.cola.shift();
    siguiente.tiempoInicioServicio  = estado.tiempoActual;
    estado.clienteEnServicio        = siguiente;
    estado.proximoEventoFinServicio = generarTiempoServicio();
  } else {
    estado.servidor.estado          = estado._servidorAusente ? "AUSENTE" : "LIBRE";
    estado.clienteEnServicio        = null;
    estado.proximoEventoFinServicio = null;
  }

  HookRegistry.ejecutar("onFinServicioPost", { estado, clienteAtendido });

  Bus.emitir("fila", { evento: `FIN SERVICIO #${clienteAtendido?.id ?? "?"}`, hora: estado.tiempoActual, estado });
}

// ─── LOOP PRINCIPAL ─────────────────────────────────────────

let _timer = null;

function paso() {
  if (!estado.corriendo) return;

  HookRegistry.ejecutar("onPaso", estado);

  const llegada     = estado.proximoEventoLlegada     ?? Infinity;
  const finServicio = estado.proximoEventoFinServicio ?? Infinity;

  const tiemposExtra = Object.values(estado._eventosExtra).filter(t => t !== null);
  const proximoExtra = tiemposExtra.length ? Math.min(...tiemposExtra) : Infinity;

  const proximo = Math.min(llegada, finServicio, proximoExtra);

  if (proximo > estado.tiempoTotal) {
    _finalizar();
    return;
  }

  if (proximoExtra <= llegada && proximoExtra <= finServicio) {
    for (const [nombre, tiempo] of Object.entries(estado._eventosExtra)) {
      if (tiempo === proximoExtra) {
        HookRegistry.ejecutar(`onEvento_${nombre}`, estado);
        break;
      }
    }
  } else if (llegada < finServicio) {
    procesarLlegada();
  } else {
    procesarFinServicio();
  }

  _timer = setTimeout(paso, estado._velocidad ?? 120);
}

function _finalizar() {
  estado.corriendo = false;
  HookRegistry.ejecutar("onFin", estado);
  Bus.emitir("fin", estado);
}

// ─── VECTOR INICIAL ──────────────────────────────────────────
// Aplica el vector inicial DESPUÉS de que los modificadores se hayan
// inicializado, sobrescribiendo los defaults que hayan establecido.

function _aplicarVectorInicial(vi) {
  const priActivo = !!estado.modificadoresActivos?.prioridades;

  // 1. Hora de inicio
  if (vi.hora) estado.tiempoActual = vi.hora;

  // 2. Cola inicial
  if (priActivo) {
    const nA = vi.prioridades_colaA ?? 0;
    const nB = vi.prioridades_colaB ?? 0;
    for (let i = 0; i < nA; i++) {
      estado.clienteIdCounter++;
      estado.cola.push({ id: estado.clienteIdCounter, tiempoLlegada: estado.tiempoActual, tiempoInicioServicio: null, prioridad: 1, tipo: "A" });
    }
    for (let i = 0; i < nB; i++) {
      estado.clienteIdCounter++;
      estado.cola.push({ id: estado.clienteIdCounter, tiempoLlegada: estado.tiempoActual, tiempoInicioServicio: null, prioridad: 0, tipo: "B" });
    }
    if (nA + nB > 0) estado.cola.sort((a, b) => b.prioridad - a.prioridad);
  } else {
    const nCola = vi.cola ?? 0;
    for (let i = 0; i < nCola; i++) {
      estado.clienteIdCounter++;
      estado.cola.push({ id: estado.clienteIdCounter, tiempoLlegada: estado.tiempoActual, tiempoInicioServicio: null, prioridad: 0 });
    }
  }

  // 3. Estado del servidor
  if (vi.servidor === "OCUPADO") {
    estado.servidor.estado = "OCUPADO";
    estado.clienteIdCounter++;
    estado.clienteEnServicio = {
      id:                   estado.clienteIdCounter,
      tiempoLlegada:        estado.tiempoActual,
      tiempoInicioServicio: estado.tiempoActual,
      prioridad:            0,
    };
  }

  // 4. Próxima llegada
  if (priActivo && vi.prioridades_proxLlegadaA !== null && vi.prioridades_proxLlegadaA !== undefined) {
    estado.proximoEventoLlegada = vi.prioridades_proxLlegadaA;
  } else if (vi.proximaLlegada !== null && vi.proximaLlegada !== undefined) {
    estado.proximoEventoLlegada = vi.proximaLlegada;
  } else {
    estado.proximoEventoLlegada = estado.tiempoActual + estado.tLL;
  }

  // 5. Fin de servicio (calculado automáticamente si el servidor arranca ocupado)
  if (vi.servidor === "OCUPADO") {
    estado.proximoEventoFinServicio = estado.tiempoActual + estado.tS;
  }

  // 6. Extras de modificadores (sobrescriben lo que iniciar() haya calculado)
  if (vi.abandono_proxAbandono !== null && vi.abandono_proxAbandono !== undefined)
    estado._eventosExtra.abandono = vi.abandono_proxAbandono;

  if (vi.seguridad_llegaPS !== null && vi.seguridad_llegaPS !== undefined) {
    estado._eventosExtra.zs = vi.seguridad_llegaPS;
    estado.zonaSeguridad    = "OCUPADO";
  }

  if (vi.descanso_salidaServidor !== null && vi.descanso_salidaServidor !== undefined)
    estado._eventosExtra.servidor_salida = vi.descanso_salidaServidor;

  if (vi.descanso_regresoServidor !== null && vi.descanso_regresoServidor !== undefined)
    estado._eventosExtra.servidor_llegada = vi.descanso_regresoServidor;

  if (vi.descanso_presencia === "AUSENTE") {
    estado._servidorAusente = true;
    estado.servidor.estado  = "AUSENTE";
  }

  if (priActivo && vi.prioridades_proxLlegadaB !== null && vi.prioridades_proxLlegadaB !== undefined)
    estado._eventosExtra.llegada_B = vi.prioridades_proxLlegadaB;
}

// ─── API PÚBLICA ─────────────────────────────────────────────
// Estas son las únicas funciones que ui.js llama sobre el motor.

function motorIniciar(params) {
  if (_timer) clearTimeout(_timer);
  //Bus.limpiar();
  HookRegistry.limpiar();

  estado = crearEstadoInicial(params);
  estado.corriendo     = true;
  estado._eventosExtra = {};
  estado._velocidad    = params.velocidad ?? 120;

  // Inicializar modificadores activos (registran hooks y ponen defaults en _eventosExtra)
  for (const [nombre, activo] of Object.entries(estado.modificadoresActivos)) {
    if (activo && window[`modificador_${nombre}`]) {
      window[`modificador_${nombre}`].iniciar(estado);
    }
  }

  HookRegistry.ejecutar("onIniciar", estado);

  // Aplicar vector inicial DESPUÉS de los modificadores para sobrescribir sus defaults
  _aplicarVectorInicial(params.vectorInicial ?? {});

  Bus.emitir("inicio", estado);
  paso();
}

function motorDetener() {
  if (_timer) clearTimeout(_timer);
  estado.corriendo = false;
  Bus.emitir("detenido", estado);
}
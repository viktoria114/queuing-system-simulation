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

  if (proximoExtra < llegada && proximoExtra < finServicio) {
    for (const [nombre, tiempo] of Object.entries(estado._eventosExtra)) {
      if (tiempo === proximoExtra) {
        HookRegistry.ejecutar(`onEvento_${nombre}`, estado);
        break;
      }
    }
  } else if (llegada <= finServicio) {
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

// ─── API PÚBLICA ─────────────────────────────────────────────
// Estas son las únicas funciones que ui.js llama sobre el motor.

function motorIniciar(params) {
  if (_timer) clearTimeout(_timer);
  //Bus.limpiar();
  HookRegistry.limpiar();

  estado = crearEstadoInicial(params);
  estado.corriendo   = true;
  estado._eventosExtra = {};
  estado._velocidad  = params.velocidad ?? 120;
  estado.proximoEventoLlegada = estado.tLL;

  // Inicializar modificadores activos
  for (const [nombre, activo] of Object.entries(estado.modificadoresActivos)) {
    if (activo && window[`modificador_${nombre}`]) {
      window[`modificador_${nombre}`].iniciar(estado);
    }
  }

  HookRegistry.ejecutar("onIniciar", estado);
  Bus.emitir("inicio", estado);
  paso();
}

function motorDetener() {
  if (_timer) clearTimeout(_timer);
  estado.corriendo = false;
  Bus.emitir("detenido", estado);
}
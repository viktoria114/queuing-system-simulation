// ============================================================
// motor.js — Lógica pura de simulación de teoría de colas
// No toca el DOM. Se comunica con ui.js mediante Bus.
// ============================================================

// ─── BUS DE EVENTOS ─────────────────────────────────────────
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
let estado = {};

function crearEstadoInicial(params) {
  return {
    tiempoActual:   0,
    tiempoTotal:    params.tiempoTotal,
    tLL:            params.tLL,
    tS:             params.tS,

    // Parámetros de distribución aleatoria para cada tiempo
    randomParams: params.randomParams || {},

    clienteIdCounter: 0,

    servidor: {
      estado: "LIBRE",          // "LIBRE" | "OCUPADO"
      tiempoFinServicio: null,
    },

    cola:               [],
    clienteEnServicio:  null,

    proximoEventoLlegada:     null,
    proximoEventoFinServicio: null,
    _eventosExtra:            {},
    _servidorAusente:         false,
    _servidorPresente:        true,   // false cuando el servidor está en descanso

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
const HookRegistry = {
  hooks: {
    onIniciar:         [],
    onLlegada:         [],
    onLlegadaPost:     [],
    onFinServicio:     [],
    onFinServicioPost: [],
    onPaso:            [],
    onFin:             [],
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

// ─── GENERADOR DE TIEMPOS ALEATORIOS ────────────────────────
// Distribución uniforme entre min y max.
// Si el modo es "fijo" (o no hay config), devuelve el valor base.

function sortearTiempo(base, randomConfig) {
  if (!randomConfig || randomConfig.modo !== "aleatorio") return base;
  const min = randomConfig.min ?? base;
  const max = randomConfig.max ?? base;
  return min + Math.random() * (max - min);
}

// ─── GENERADORES ────────────────────────────────────────────

function generarProximaLlegada() {
  const intervalo = sortearTiempo(estado.tLL, estado.randomParams?.tLL);
  return estado.tiempoActual + intervalo;
}

function generarTiempoServicio() {
  const duracion = sortearTiempo(estado.tS, estado.randomParams?.tS);
  return estado.tiempoActual + duracion;
}

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
      estado.servidor.estado          = "OCUPADO";
      cliente.tiempoInicioServicio    = estado.tiempoActual;
      estado.clienteEnServicio        = cliente;
      estado.proximoEventoFinServicio = generarTiempoServicio();
    } else {
      estado.cola.push(cliente);
      estado.cola.sort((a, b) => b.prioridad - a.prioridad);
    }
  }

  estado.proximoEventoLlegada = generarProximaLlegada();
  HookRegistry.ejecutar("onLlegadaPost", { estado, cliente });

  Bus.emitir("fila", { evento: cliente._labelOverride || `LLEGADA #${cliente.id}`, hora: estado.tiempoActual, estado });
}

function procesarFinServicio() {
  // Si el servidor no está presente, el cliente espera en el PS:
  // el fin de servicio no se procesa hasta que el servidor regrese.
  if (!estado._servidorPresente) return;

  estado.tiempoActual = estado.proximoEventoFinServicio;
  const clienteAtendido = estado.clienteEnServicio;

  HookRegistry.ejecutar("onFinServicio", { estado, clienteAtendido });

  estado.stats.clientesAtendidos++;
  const espera = (clienteAtendido?.tiempoInicioServicio ?? estado.tiempoActual)
                 - (clienteAtendido?.tiempoLlegada ?? estado.tiempoActual);
  estado.stats.tiempoEsperaTotal += Math.max(0, espera);

  if (estado.cola.length > 0) {
    const siguiente = estado.cola.shift();
    siguiente.tiempoInicioServicio  = estado.tiempoActual;
    estado.clienteEnServicio        = siguiente;
    estado.proximoEventoFinServicio = generarTiempoServicio();
  } else {
    estado.servidor.estado          = "LIBRE";
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

  const llegada = estado.proximoEventoLlegada ?? Infinity;

  // Si el servidor no está presente, el fin de servicio queda congelado
  // hasta que descanso.js llame al regreso del servidor.
  const finServicio = (estado.proximoEventoFinServicio !== null && estado._servidorPresente)
                      ? estado.proximoEventoFinServicio
                      : Infinity;

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

function motorIniciar(params) {
  if (_timer) clearTimeout(_timer);
  HookRegistry.limpiar();

  estado = crearEstadoInicial(params);
  estado.corriendo         = true;
  estado._eventosExtra     = {};
  estado._velocidad        = params.velocidad ?? 120;
  estado._servidorPresente = true;
  estado._servidorAusente  = false;

  // Primera llegada también puede ser aleatoria
  const primerIntervalo = sortearTiempo(estado.tLL, estado.randomParams?.tLL);
  estado.proximoEventoLlegada = primerIntervalo;

  for (const [nombre, activo] of Object.entries(estado.modificadoresActivos)) {
    if (activo && window[`modificador_${nombre}`]) {
      window[`modificador_${nombre}`].iniciar(estado);
    }
  }

  HookRegistry.ejecutar("onIniciar", estado);

  // Aplicar V(0) DESPUÉS de los hooks onIniciar para sobreescribir
  // los valores que los modificadores pusieron como estado "vacío".
  if (window.vectorInicial) {
    window.vectorInicial.aplicar(estado, params);
  }

  Bus.emitir("inicio", estado);
  paso();
}

function motorDetener() {
  if (_timer) clearTimeout(_timer);
  estado.corriendo = false;
  Bus.emitir("detenido", estado);
}

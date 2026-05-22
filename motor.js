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

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
  limpiar() { this._listeners = {}; },
};

// ─── ESTADO ─────────────────────────────────────────────────
let estado = {};

function crearEstadoInicial(params) {
  const numServidores = params.numServidores ?? 1;
  const topologia     = params.topologia ?? "unica";

  const servidores = Array.from({ length: numServidores }, (_, i) => {
    const psp = params.psParams?.[i] ?? {};
    return {
      idx:                  i,
      estado:               "LIBRE",
      clienteEnServicio:    null,
      tiempoFinServicio:    null,
      _ocupadoDesde:        null,
      _ausente:             false,
      _presente:            true,
      tS:                   psp.tS          ?? params.tS,
      randomParams:         psp.randomParams ?? params.randomParams ?? {},
      modificadoresActivos: psp.modificadoresActivos ?? {},
      paramsModificadores:  psp.paramsModificadores  ?? {},
    };
  });

  const est = {
    tiempoActual:  0,
    tiempoTotal:   params.tiempoTotal,
    tLL:           params.tLL,
    tS:            params.tS,
    randomParams:  params.randomParams || {},

    clienteIdCounter: 0,

    numServidores,
    topologia,
    servidores,

    servidor: servidores[0],

    cola:  [],
    colas: topologia === "paralelo"
           ? Array.from({ length: numServidores }, () => [])
           : null,

    _salaEspera:          [],
    _capacidadSalaEspera: params.capacidadSalaEspera ?? Infinity,

    proximoEventoLlegada: null,
    _eventosExtra:        {},

    stats: {
      clientesAtendidos:     0,
      clientesAbandonaron:   0,
      abandonosTotem:        0,
      abandonosSalaEspera:   0,
      tiempoEsperaTotal:     0,
      tiempoOcupado:         0,
      _servidorOcupadoDesde: null,
    },

    // backward compat: PS0 mods accesibles desde el estado global
    modificadoresActivos: servidores[0].modificadoresActivos,
    paramsModificadores:  servidores[0].paramsModificadores,

    corriendo: false,
  };

  // ── Getters de backward compat → PS0 ────────────────────────
  Object.defineProperty(est, "clienteEnServicio", {
    get()  { return this.servidores[0].clienteEnServicio; },
    set(v) { this.servidores[0].clienteEnServicio = v; },
    enumerable: true, configurable: true,
  });
  Object.defineProperty(est, "proximoEventoFinServicio", {
    get()  { return this.servidores[0].tiempoFinServicio; },
    set(v) { this.servidores[0].tiempoFinServicio = v; },
    enumerable: true, configurable: true,
  });
  // _servidorPresente / _servidorAusente delegan a PS0._presente / _ausente
  Object.defineProperty(est, "_servidorPresente", {
    get()  { return this.servidores[0]._presente; },
    set(v) { this.servidores[0]._presente = v; },
    enumerable: true, configurable: true,
  });
  Object.defineProperty(est, "_servidorAusente", {
    get()  { return this.servidores[0]._ausente; },
    set(v) { this.servidores[0]._ausente = v; },
    enumerable: true, configurable: true,
  });

  // ── Método helper accesible desde los modificadores ─────────
  // Devuelve la cola que alimenta al PS[psIdx] según la topología.
  est.colaPS = function(psIdx) {
    if (this.topologia === "paralelo") return this.colas?.[psIdx] ?? [];
    if (this.topologia === "serie" && psIdx > 0) {
      if (!this.servidores[psIdx]._cola) this.servidores[psIdx]._cola = [];
      return this.servidores[psIdx]._cola;
    }
    if (this.topologia === "serie-paralelo" && psIdx > 0) {
      return this._salaEspera;
    }
    return this.cola;
  };

  return est;
}

// ─── HOOKS ──────────────────────────────────────────────────
const HookRegistry = {
  hooks: {
    onIniciar:         [],
    onLlegada:         [],
    onLlegadaPost:     [],
    onEncolar:         [], // se dispara cada vez que un cliente entra a cualquier cola
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

function generarTiempoServicio(psIdx = 0) {
  const ps = estado.servidores[psIdx];
  const duracion = sortearTiempo(ps.tS, ps.randomParams?.tS);
  return estado.tiempoActual + duracion;
}

// ─── HELPERS DE PS ──────────────────────────────────────────

function _colaDePS(psIdx) {
  return estado.colaPS(psIdx);
}

function _elegirPS() {
  if (estado.topologia === "serie" || estado.topologia === "serie-paralelo") {
    return estado.servidores[0].estado === "LIBRE" ? estado.servidores[0] : null;
  }
  if (estado.topologia === "paralelo") {
    let mejorPS  = null;
    let mejorLen = Infinity;
    for (const ps of estado.servidores) {
      const efectiva = (ps.estado === "LIBRE" ? 0 : 1) + (estado.colas[ps.idx]?.length ?? 0);
      if (efectiva < mejorLen) { mejorLen = efectiva; mejorPS = ps; }
    }
    return mejorPS?.estado === "LIBRE" ? mejorPS : null;
  }
  return estado.servidores.find(ps => ps.estado === "LIBRE") ?? null;
}

function _elegirColaParalelo() {
  let minLen = Infinity, minIdx = 0;
  for (const ps of estado.servidores) {
    const len = estado.colas[ps.idx].length;
    if (len < minLen) { minLen = len; minIdx = ps.idx; }
  }
  return minIdx;
}

function _iniciarServicio(ps, cliente) {
  ps.estado                    = "OCUPADO";
  cliente.tiempoInicioServicio = estado.tiempoActual;
  ps.clienteEnServicio         = cliente;
  ps.tiempoFinServicio         = generarTiempoServicio(ps.idx);
  ps._ocupadoDesde             = estado.tiempoActual;
  if (ps.idx === 0) estado.stats._servidorOcupadoDesde = estado.tiempoActual;
}

function _acumularOcupacion(ps) {
  if (ps._ocupadoDesde !== null) {
    estado.stats.tiempoOcupado += estado.tiempoActual - ps._ocupadoDesde;
    ps._ocupadoDesde = null;
  }
  if (ps.idx === 0) estado.stats._servidorOcupadoDesde = null;
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

  const _intervaloDesdeLast = estado.tiempoActual - (estado._ultimaHoraLlegada ?? estado.tiempoActual);
  estado._ultimaHoraLlegada = estado.tiempoActual;

  if (continuar !== false) {
    const psDestino = _elegirPS();
    if (psDestino !== null) {
      _iniciarServicio(psDestino, cliente);
    } else {
      const psIdx       = estado.topologia === "paralelo" ? _elegirColaParalelo() : 0;
      const colaDestino = _colaDePS(psIdx);
      colaDestino.push(cliente);
      colaDestino.sort((a, b) => b.prioridad - a.prioridad);
      HookRegistry.ejecutar("onEncolar", { estado, cliente, psIdx });
    }
  }

  estado.proximoEventoLlegada = generarProximaLlegada();
  HookRegistry.ejecutar("onLlegadaPost", { estado, cliente });

  Bus.emitir("fila", {
    evento: cliente._labelOverride || `LLEGADA #${cliente.id}`,
    hora:   estado.tiempoActual,
    estado,
    meta:   { tipo: "llegada", intervalo: _intervaloDesdeLast },
  });
}

function procesarFinServicio(psIdx = 0) {
  const ps = estado.servidores[psIdx];
  if (!ps._presente) return;

  estado.tiempoActual = ps.tiempoFinServicio;
  const clienteAtendido = ps.clienteEnServicio;

  HookRegistry.ejecutar("onFinServicio", { estado, clienteAtendido, psIdx });

  const espera = (clienteAtendido?.tiempoInicioServicio ?? estado.tiempoActual)
               - (clienteAtendido?.tiempoLlegada       ?? estado.tiempoActual);
  estado.stats.tiempoEsperaTotal += Math.max(0, espera);

  // ── Serie-Paralelo: tótem (PS0) termina → sala de espera ────────
  if (estado.topologia === "serie-paralelo" && psIdx === 0) {
    ps.estado = "LIBRE";
    ps.clienteEnServicio = null;
    ps.tiempoFinServicio = null;
    _acumularOcupacion(ps);

    // Si hay consultorio libre, el cliente va directo sin ocupar asiento
    const psLibre = estado.servidores.slice(1).find(s => s.estado === "LIBRE" && s._presente);

    if (psLibre) {
      clienteAtendido.tiempoLlegada        = estado.tiempoActual;
      clienteAtendido.tiempoInicioServicio = null;
      _iniciarServicio(psLibre, clienteAtendido);
    } else if (estado._salaEspera.length >= estado._capacidadSalaEspera) {
      // Sala llena: el cliente abandona
      estado.stats.abandonosSalaEspera++;
      estado.stats.clientesAbandonaron++;
      Bus.emitir("fila", {
        evento: `ABANDONO SALA #${clienteAtendido?.id ?? "?"}`,
        hora:   estado.tiempoActual,
        estado,
        meta:   { tipo: "abandonoSala" },
      });
    } else {
      // Entrar a la sala de espera
      clienteAtendido.tiempoLlegada        = estado.tiempoActual;
      clienteAtendido.tiempoInicioServicio = null;
      estado._salaEspera.push(clienteAtendido);
      HookRegistry.ejecutar("onEncolar", { estado, cliente: clienteAtendido, psIdx: 1 });
    }

    // Atender siguiente en cola del tótem
    const colaTotem = _colaDePS(0);
    if (colaTotem.length > 0) {
      _iniciarServicio(ps, colaTotem.shift());
    }

    HookRegistry.ejecutar("onFinServicioPost", { estado, clienteAtendido, psIdx });
    Bus.emitir("fila", {
      evento: `FIN TÓTEM #${clienteAtendido?.id ?? "?"}`,
      hora:   estado.tiempoActual,
      estado,
      meta:   { tipo: "finServicio", espera: Math.max(0, espera), psIdx },
    });
    return;
  }

  // ── Serie: reenviar cliente a la siguiente etapa ─────────
  if (estado.topologia === "serie" && psIdx < estado.numServidores - 1) {
    ps.estado = "LIBRE";
    ps.clienteEnServicio = null;
    ps.tiempoFinServicio = null;
    _acumularOcupacion(ps);

    clienteAtendido.tiempoLlegada        = estado.tiempoActual;
    clienteAtendido.tiempoInicioServicio = null;

    const nextPS = estado.servidores[psIdx + 1];
    if (nextPS.estado === "LIBRE") {
      _iniciarServicio(nextPS, clienteAtendido);
    } else {
      const cola = _colaDePS(psIdx + 1);
      cola.push(clienteAtendido);
      cola.sort((a, b) => b.prioridad - a.prioridad);
      HookRegistry.ejecutar("onEncolar", { estado, cliente: clienteAtendido, psIdx: psIdx + 1 });
    }

    const colaEntrada = _colaDePS(psIdx);
    if (colaEntrada.length > 0) {
      _iniciarServicio(ps, colaEntrada.shift());
    }

    HookRegistry.ejecutar("onFinServicioPost", { estado, clienteAtendido, psIdx });
    Bus.emitir("fila", {
      evento: `FIN PS${psIdx + 1} #${clienteAtendido?.id ?? "?"}`,
      hora:   estado.tiempoActual,
      estado,
      meta:   { tipo: "finServicio", espera: Math.max(0, espera), psIdx },
    });
    return;
  }

  // ── Fin normal ───────────────────────────────────────────
  estado.stats.clientesAtendidos++;

  const cola = _colaDePS(psIdx);
  if (cola.length > 0) {
    _iniciarServicio(ps, cola.shift());
  } else {
    ps.estado = "LIBRE";
    ps.clienteEnServicio = null;
    ps.tiempoFinServicio = null;
    _acumularOcupacion(ps);
  }

  HookRegistry.ejecutar("onFinServicioPost", { estado, clienteAtendido, psIdx });

  Bus.emitir("fila", {
    evento: `FIN SERVICIO #${clienteAtendido?.id ?? "?"}`,
    hora:   estado.tiempoActual,
    estado,
    meta:   { tipo: "finServicio", espera: Math.max(0, espera) },
  });
}

// ─── LOOP PRINCIPAL ─────────────────────────────────────────
let _timer = null;

function paso() {
  if (!estado.corriendo) return;

  HookRegistry.ejecutar("onPaso", estado);

  const llegada = estado.proximoEventoLlegada ?? Infinity;

  // Hallar el PS con el fin de servicio más próximo.
  // Un PS se "congela" cuando su flag _presente es false (descanso).
  let minFinServicio = Infinity;
  let psFinIdx       = -1;
  for (const ps of estado.servidores) {
    if (ps.tiempoFinServicio === null || !ps._presente) continue;
    if (ps.tiempoFinServicio < minFinServicio) {
      minFinServicio = ps.tiempoFinServicio;
      psFinIdx       = ps.idx;
    }
  }

  const tiemposExtra = Object.values(estado._eventosExtra).filter(t => t !== null);
  const proximoExtra = tiemposExtra.length ? Math.min(...tiemposExtra) : Infinity;

  const proximo = Math.min(llegada, minFinServicio, proximoExtra);

  if (proximo > estado.tiempoTotal) {
    _finalizar();
    return;
  }

  if (proximoExtra <= llegada && proximoExtra <= minFinServicio) {
    for (const [nombre, tiempo] of Object.entries(estado._eventosExtra)) {
      if (tiempo === proximoExtra) {
        HookRegistry.ejecutar(`onEvento_${nombre}`, estado);
        break;
      }
    }
  } else if (llegada < minFinServicio) {
    procesarLlegada();
  } else {
    procesarFinServicio(psFinIdx);
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
  estado.corriendo     = true;
  estado._eventosExtra = {};
  estado._velocidad    = params.velocidad ?? 120;

  const primerIntervalo = sortearTiempo(estado.tLL, estado.randomParams?.tLL);
  estado.proximoEventoLlegada = primerIntervalo;

  // Inicializar modificadores per-PS
  for (const ps of estado.servidores) {
    for (const [nombre, activo] of Object.entries(ps.modificadoresActivos)) {
      if (activo && window[`modificador_${nombre}`]) {
        window[`modificador_${nombre}`].iniciar(estado, ps.idx);
      }
    }
  }

  HookRegistry.ejecutar("onIniciar", estado);

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

// ============================================================
// motor.js — Lógica pura de simulación de teoría de colas
// No toca el DOM. Se comunica con ui.js mediante Bus.
// ============================================================

// ─── BUS DE EVENTOS ─────────────────────────────────────────
// Sistema de publicación/suscripción (pub/sub) que desacopla el motor
// de la interfaz gráfica. El motor emite eventos ("fila", "inicio", "fin")
// y ui.js los escucha sin que ninguno conozca los detalles del otro.
const Bus = {
  _listeners: {},

  // Registra una función que se ejecutará cada vez que ocurra el evento.
  on(evento, fn) {
    if (!this._listeners[evento]) this._listeners[evento] = [];
    this._listeners[evento].push(fn);
  },

  // Dispara el evento y llama a todas las funciones registradas para él.
  emitir(evento, datos) {
    (this._listeners[evento] || []).forEach(fn => fn(datos));
  },

  // Elimina todos los listeners. Se llama al reiniciar la simulación
  // para evitar que queden suscripciones de corridas anteriores.
  limpiar() {
    this._listeners = {};
  },
};

// ─── ESTADO ─────────────────────────────────────────────────
// "estado" es el vector de estado del sistema en el método next-event-time.
// Concentra toda la información necesaria para describir el sistema
// en cualquier instante t y poder avanzar la simulación desde ese punto.
let estado = {};

function crearEstadoInicial(params) {
  return {
    tiempoActual:   0,                  // reloj de simulación (en segundos)
    tiempoTotal:    params.tiempoTotal, // horizonte: la simulación se detiene aquí
    tLL:            params.tLL,         // intervalo base entre llegadas sucesivas
    tS:             params.tS,          // duración base de cada servicio

    // Configuración de distribuciones para cada tiempo configurable.
    // Si un campo es null → ese tiempo opera en modo fijo.
    // Si es { modo:"aleatorio", min, max } → distribución uniforme U[min,max].
    randomParams: params.randomParams || {},

    clienteIdCounter: 0, // auto-incremental, garantiza IDs únicos por corrida

    // Estado del Puesto de Servicio (PS)
    servidor: {
      estado: "LIBRE",         // "LIBRE" | "OCUPADO"
      tiempoFinServicio: null,
    },

    cola:               [],  // lista de clientes esperando, ordenada por prioridad (desc)
    clienteEnServicio:  null, // cliente que está siendo atendido actualmente

    // Tiempos absolutos de los dos eventos base del sistema de colas
    proximoEventoLlegada:     null,
    proximoEventoFinServicio: null,

    // Mapa de tiempos de eventos adicionales registrados por los modificadores.
    // Ej: { abandono: 120, servidor_salida: 300, llegada_B: 90, zs: 75 }
    // El bucle principal toma el mínimo de todos estos junto a los dos eventos base.
    _eventosExtra: {},

    // Flags de presencia del servidor (usados por el modificador de descanso).
    // _servidorPresente = false congela el procesamiento del fin de servicio
    // hasta que el servidor regrese de su descanso.
    _servidorAusente:  false,
    _servidorPresente: true,

    stats: {
      clientesAtendidos:    0,
      clientesAbandonaron:  0,
      tiempoEsperaTotal:    0,
      tiempoOcupado:        0,   // tiempo acumulado con PS ocupado
      _servidorOcupadoDesde: null, // instante en que el PS pasó a OCUPADO
    },

    modificadoresActivos: params.modificadoresActivos || {},
    paramsModificadores:  params.paramsModificadores  || {},

    corriendo: false,
  };
}

// ─── HOOKS ──────────────────────────────────────────────────
// Mecanismo de extensión que permite a los modificadores (plugins)
// interceptar y alterar el comportamiento del motor sin modificar
// este archivo. Cada modificador llama a HookRegistry.registrar()
// desde su función iniciar() para "enchufarse" a un momento del ciclo.
//
// Si un hook en "onLlegada" retorna false, se cancela todo el
// procesamiento estándar del evento (encolar / pasar al PS).
// Esto lo usan: desvio (para no encolar), seguridad (para redirigir a ZS).
const HookRegistry = {
  hooks: {
    onIniciar:         [],  // al arrancar la simulación
    onLlegada:         [],  // antes de encolar/servir al cliente que llegó
    onLlegadaPost:     [],  // después de encolar/servir (o después de cancelar)
    onFinServicio:     [],  // antes de liberar el PS
    onFinServicioPost: [],  // después de liberar el PS y asignar el siguiente
    onPaso:            [],  // al inicio de cada paso del bucle principal
    onFin:             [],  // al terminar la simulación
  },

  // Agrega una función al momento indicado. "nombre" es solo para depuración.
  registrar(momento, nombre, fn) {
    if (!this.hooks[momento]) this.hooks[momento] = [];
    this.hooks[momento].push({ nombre, fn });
  },

  // Ejecuta todos los hooks del momento en orden de registro.
  // Si alguno devuelve false, interrumpe la cadena y retorna false.
  ejecutar(momento, datos) {
    for (const hook of (this.hooks[momento] || [])) {
      if (hook.fn(datos) === false) return false;
    }
    return true;
  },

  // Vacía todos los hooks al reiniciar, para que no queden
  // registros de la corrida anterior.
  limpiar() {
    for (const key of Object.keys(this.hooks)) this.hooks[key] = [];
  },
};

// ─── GENERADOR DE TIEMPOS ALEATORIOS ────────────────────────
// Implementa la distribución uniforme U[min, max] usada en la
// simulación de Monte Carlo.
// Si el modo es "fijo" (o no hay config), devuelve el valor base
// sin sortearlo (tiempo determinístico).

function sortearTiempo(base, randomConfig) {
  if (!randomConfig || randomConfig.modo !== "aleatorio") return base;
  const min = randomConfig.min ?? base;
  const max = randomConfig.max ?? base;
  // Math.random() devuelve un valor en [0,1), por lo que el resultado
  // está en [min, max) — distribución uniforme continua.
  return min + Math.random() * (max - min);
}

// ─── GENERADORES ────────────────────────────────────────────

// Calcula el tiempo ABSOLUTO de la próxima llegada:
// tiempoActual + intervalo sorteado (o fijo).
function generarProximaLlegada() {
  const intervalo = sortearTiempo(estado.tLL, estado.randomParams?.tLL);
  return estado.tiempoActual + intervalo;
}

// Calcula el tiempo ABSOLUTO de fin del servicio actual:
// tiempoActual + duración sorteada (o fija).
function generarTiempoServicio() {
  const duracion = sortearTiempo(estado.tS, estado.randomParams?.tS);
  return estado.tiempoActual + duracion;
}

// ─── EVENTOS BASE ───────────────────────────────────────────

// Evento LLEGADA: procesa la llegada de un nuevo cliente al sistema.
//
// Lógica estándar (FCFS con prioridades):
//   - PS libre  → el cliente entra directo al servicio.
//   - PS ocupado → el cliente se agrega a la cola, que se reordena
//                  por prioridad descendente (mayor prioridad = atendido antes).
//
// Los hooks onLlegada pueden interceptar este flujo:
//   - Retornar false cancela encolar y servir (usado por desvio y seguridad).
//   - Modificar cliente.prioridad o cliente._labelOverride cambia
//     cómo se muestra y ordena el cliente.
function procesarLlegada() {
  estado.tiempoActual = estado.proximoEventoLlegada; // avanzar el reloj al instante de llegada
  estado.clienteIdCounter++;

  const cliente = {
    id:                   estado.clienteIdCounter,
    tiempoLlegada:        estado.tiempoActual,
    tiempoInicioServicio: null,
    prioridad:            0, // los modificadores (ej. prioridades.js) pueden cambiarlo
  };

  // Ejecutar hooks onLlegada; si alguno retorna false, no se encola ni se sirve.
  const continuar = HookRegistry.ejecutar("onLlegada", { estado, cliente });

  const _intervaloDesdeLast = estado.tiempoActual - (estado._ultimaHoraLlegada ?? estado.tiempoActual);
  estado._ultimaHoraLlegada = estado.tiempoActual;

  if (continuar !== false) {
    if (estado.servidor.estado === "LIBRE") {
      // PS libre: atención inmediata
      estado.servidor.estado          = "OCUPADO";
      cliente.tiempoInicioServicio    = estado.tiempoActual;
      estado.clienteEnServicio        = cliente;
      const _tsFin = generarTiempoServicio();
      estado.proximoEventoFinServicio = _tsFin;
      estado.stats._servidorOcupadoDesde = estado.tiempoActual;
    } else {
      // PS ocupado: el cliente espera en la cola
      estado.cola.push(cliente);
      estado.cola.sort((a, b) => b.prioridad - a.prioridad); // reordenar por prioridad
    }
  }

  // La próxima llegada se genera siempre, independientemente de si
  // el cliente fue servido, encolado o desviado.
  estado.proximoEventoLlegada = generarProximaLlegada();
  HookRegistry.ejecutar("onLlegadaPost", { estado, cliente });

  Bus.emitir("fila", {
    evento: cliente._labelOverride || `LLEGADA #${cliente.id}`,
    hora:   estado.tiempoActual,
    estado,
    meta:   { tipo: "llegada", intervalo: _intervaloDesdeLast },
  });
}

// Evento FIN DE SERVICIO: el cliente en el PS termina de ser atendido.
//
// Lógica:
//   - Hay cola → el primer cliente de la cola pasa al PS.
//   - Cola vacía → el PS queda libre (servidor desocupado).
//
// Caso especial (modificador descanso): si _servidorPresente === false,
// el servidor está en descanso y el fin de servicio queda congelado.
// El bucle principal (paso()) ignora este evento hasta que el servidor regrese.
function procesarFinServicio() {
  // Guard: no procesar mientras el servidor está en descanso.
  if (!estado._servidorPresente) return;

  estado.tiempoActual = estado.proximoEventoFinServicio; // avanzar reloj al fin del servicio
  const clienteAtendido = estado.clienteEnServicio;

  HookRegistry.ejecutar("onFinServicio", { estado, clienteAtendido });

  estado.stats.clientesAtendidos++;
  // Tiempo de espera en cola = inicio de servicio - momento de llegada
  const espera = (clienteAtendido?.tiempoInicioServicio ?? estado.tiempoActual)
                 - (clienteAtendido?.tiempoLlegada ?? estado.tiempoActual);
  estado.stats.tiempoEsperaTotal += Math.max(0, espera);

  if (estado.cola.length > 0) {
    // Siguiente cliente de la cola pasa al PS; PS sigue OCUPADO sin pausa
    const siguiente = estado.cola.shift();
    siguiente.tiempoInicioServicio  = estado.tiempoActual;
    estado.clienteEnServicio        = siguiente;
    estado.proximoEventoFinServicio = generarTiempoServicio();
    // _servidorOcupadoDesde no cambia: la ocupación es continua
  } else {
    // No hay nadie esperando: PS libre
    estado.servidor.estado          = "LIBRE";
    estado.clienteEnServicio        = null;
    estado.proximoEventoFinServicio = null;
    // Acumular tiempo que el PS estuvo ocupado en este período
    if (estado.stats._servidorOcupadoDesde !== null) {
      estado.stats.tiempoOcupado += estado.tiempoActual - estado.stats._servidorOcupadoDesde;
      estado.stats._servidorOcupadoDesde = null;
    }
  }

  HookRegistry.ejecutar("onFinServicioPost", { estado, clienteAtendido });

  Bus.emitir("fila", {
    evento: `FIN SERVICIO #${clienteAtendido?.id ?? "?"}`,
    hora:   estado.tiempoActual,
    estado,
    meta:   { tipo: "finServicio", espera: Math.max(0, espera) },
  });
}

// ─── LOOP PRINCIPAL ─────────────────────────────────────────
// Implementa el algoritmo next-event-time (avance por eventos):
//   1. Encontrar el tiempo del próximo evento (mínimo de todos los programados).
//   2. Si supera el horizonte → finalizar.
//   3. Avanzar el reloj a ese instante y procesar el evento.
//   4. Repetir (con setTimeout para permitir la animación en el navegador).
//
// Los "eventos extra" son tiempos registrados en estado._eventosExtra
// por los modificadores (abandono, descanso, seguridad, prioridades, etc.).

let _timer = null;

function paso() {
  if (!estado.corriendo) return;

  HookRegistry.ejecutar("onPaso", estado);

  const llegada = estado.proximoEventoLlegada ?? Infinity;

  // El fin de servicio se "congela" mientras el servidor está en descanso:
  // se trata como Infinity para que el bucle no lo procese.
  const finServicio = (estado.proximoEventoFinServicio !== null && estado._servidorPresente)
                      ? estado.proximoEventoFinServicio
                      : Infinity;

  // Reunir todos los tiempos de eventos extra y quedarse con el mínimo.
  const tiemposExtra = Object.values(estado._eventosExtra).filter(t => t !== null);
  const proximoExtra = tiemposExtra.length ? Math.min(...tiemposExtra) : Infinity;

  // El próximo evento global es el mínimo entre los tres tipos.
  const proximo = Math.min(llegada, finServicio, proximoExtra);

  // Condición de parada: ningún evento pendiente antes del fin de la simulación.
  if (proximo > estado.tiempoTotal) {
    _finalizar();
    return;
  }

  // Despachar el evento más próximo al que le corresponda manejarlo.
  if (proximoExtra <= llegada && proximoExtra <= finServicio) {
    // Evento extra: buscar cuál modificador lo registró y ejecutar su hook.
    for (const [nombre, tiempo] of Object.entries(estado._eventosExtra)) {
      if (tiempo === proximoExtra) {
        HookRegistry.ejecutar(`onEvento_${nombre}`, estado);
        break;
      }
    }
  } else if (llegada < finServicio) {
    // Fin de servicio gana el empate: liberar el PS antes de que llegue el cliente.
    // (Convención estándar en la mayoría de los libros de teoría de colas.)
    procesarLlegada();
  } else {
    procesarFinServicio();
  }

  // setTimeout permite que el navegador renderice entre pasos,
  // generando la animación. La velocidad es configurable desde la UI.
  _timer = setTimeout(paso, estado._velocidad ?? 120);
}

function _finalizar() {
  estado.corriendo = false;
  HookRegistry.ejecutar("onFin", estado);
  Bus.emitir("fin", estado);
}

// ─── API PÚBLICA ─────────────────────────────────────────────

// Inicializa y arranca la simulación con los parámetros dados desde la UI.
// Orden crítico:
//   1. Crear estado limpio.
//   2. Inicializar modificadores activos (registran sus hooks).
//   3. Ejecutar hooks onIniciar (modificadores preparan su estado inicial).
//   4. Aplicar V(0) (sobreescribe los valores que pusieron los modificadores).
//   5. Emitir "inicio" (ui.js imprime la fila V(0)).
//   6. Arrancar el bucle paso().
function motorIniciar(params) {
  if (_timer) clearTimeout(_timer);
  HookRegistry.limpiar(); // limpiar hooks de la corrida anterior

  estado = crearEstadoInicial(params);
  estado.corriendo         = true;
  estado._eventosExtra     = {};
  estado._velocidad        = params.velocidad ?? 120;
  estado._servidorPresente = true;
  estado._servidorAusente  = false;

  // Primera llegada también puede ser aleatoria
  const primerIntervalo = sortearTiempo(estado.tLL, estado.randomParams?.tLL);
  estado.proximoEventoLlegada = primerIntervalo;

  // Inicializar cada modificador activo (llaman a HookRegistry.registrar internamente)
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

// Detiene la simulación en el paso actual (sin esperar al fin del horizonte).
function motorDetener() {
  if (_timer) clearTimeout(_timer);
  estado.corriendo = false;
  Bus.emitir("detenido", estado);
}

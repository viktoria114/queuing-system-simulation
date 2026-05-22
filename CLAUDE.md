# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Descripción del proyecto

Simulador de teoría de colas en el navegador. Modela una cola de servidor único con tiempos de llegada/servicio configurables y modificadores de comportamiento. Sin herramientas de build ni gestor de paquetes — JavaScript/HTML/CSS puro, abrir `index.html` directamente en el navegador.

## Cómo ejecutar

Abrir `index.html` en un navegador. `index2.html` es una interfaz alternativa para escenarios adicionales. Configurar parámetros en el panel izquierdo, hacer clic en **▶ Iniciar**.

No hay pasos de build, ni `npm install`, ni test runner.

## Arquitectura

### Patrón principal: Motor orientado a eventos + sistema de hooks

```
motor.js (Motor)
  ├─ Bus: emisor de eventos pub/sub simple
  ├─ estado: estado global de la simulación
  ├─ HookRegistry: puntos de extensión para modificadores
  └─ paso(): bucle principal de eventos discretos (algoritmo next-event-time)

modificadores/*.js (Plugins de comportamiento)
  └─ Registran hooks, programan eventos custom en estado._eventosExtra

vectorInicial.js (Vector Inicial V(0))
  ├─ _COLS: definición declarativa de campos del vector
  ├─ _state: persistencia de valores entre aperturas del modal
  ├─ _renderTablaModal(): construye tabla horizontal dinámica en el modal
  ├─ leer(): lee valores del DOM con fallback a _state
  └─ aplicar(): aplica el V(0) al estado del motor tras los hooks onIniciar

ui.js (Presentación)
  ├─ Escucha eventos del Bus, renderiza filas de tabla (DOM)
  ├─ leerParametros(): lee todos los inputs del formulario incluyendo randomParams
  ├─ renderInfoLeft(): panel izquierdo con parámetros activos
  └─ Nunca modifica el estado de la simulación directamente
```

**El orden de carga de scripts en HTML es crítico**: `motor.js` → scripts de modificadores → `vectorInicial.js` → `ui.js`.

### Archivos clave

- **[motor.js](motor.js)**: Motor de simulación. `sortearTiempo(base, randomConfig)` genera duraciones fijas o uniformes-aleatorias — se usa también para la primera llegada. `paso()` encuentra el mínimo de todos los tiempos de eventos programados (`proximoEventoLlegada`, `proximoEventoFinServicio`, `estado._eventosExtra.*`), avanza el tiempo y dispara el evento. `_servidorPresente` / `_servidorAusente` controlan si el servidor está disponible durante el ciclo de descanso.
- **[vectorInicial.js](vectorInicial.js)**: Vector Inicial V(0). Define `_COLS` (array declarativo de columnas con `mod`, `cond`, `type`). `_renderTablaModal()` construye una tabla horizontal filtrada según modificadores activos y estado de PS/Zs. Los valores persisten en `_state` entre re-renders. `aplicar()` se llama desde `motor.js` DESPUÉS de `onIniciar` para sobreescribir los defaults que pusieron los modificadores. `leer()` usa DOM primero y `_state` como fallback.
- **[ui.js](ui.js)**: Capa DOM. `leerParametros()` parsea los inputs incluyendo `randomParams` para cada tiempo configurable. `leerParamTiempo(key, idFijo)` detecta si el switch fijo/aleatorio está activo y devuelve el config correspondiente. `validarRangos()` valida que min < max > 0. `mkTh`/`mkTd` construyen celdas de tabla DOM. `imprimirFila()` / `imprimirEncabezadoTabla()` renderizan columnas dinámicas según modificadores activos.
- **[modificadores/descanso.js](modificadores/descanso.js)**: Descansos del servidor — alterna ciclos de trabajo (ΔT) y descanso (ΔD); el cliente en servicio queda congelado en PS durante el descanso. Soporta tiempos fijos o aleatorios (`deltaD`, `deltaT`).
- **[modificadores/abandono.js](modificadores/abandono.js)**: Los clientes abandonan la cola si la espera supera el umbral de paciencia. Soporta paciencia fija o aleatoria.
- **[modificadores/prioridades.js](modificadores/prioridades.js)**: Cola con dos clases de prioridad (Tipo A > Tipo B); flujos de llegada independientes.
- **[modificadores/seguridad.js](modificadores/seguridad.js)**: Los clientes deben cruzar una zona de seguridad antes de entrar al servicio. Soporta tiempo de cruce fijo o aleatorio.

### estado (Estructura del estado global)

```javascript
{
  tiempoActual, tiempoTotal,
  tLL, tS,                          // intervalo de llegada base, duración de servicio
  randomParams: { tLL, tS, deltaD, deltaT, abandono, seguridad },
  servidor: { estado: "LIBRE"|"OCUPADO", tiempoFinServicio },
  cola: [{ id, tiempoLlegada, prioridad, tipo, tiempoLimite, ... }],
  clienteEnServicio: { ... },
  proximoEventoLlegada,
  proximoEventoFinServicio,
  _eventosExtra: { servidor_salida, servidor_llegada, abandono, llegada_B, zs, ... },
  _servidorPresente,    // false durante el descanso del servidor
  _servidorAusente,     // true durante el descanso del servidor
  stats: { clientesAtendidos, clientesAbandonaron, tiempoEsperaTotal },
  modificadoresActivos: { descanso, abandono, prioridades, seguridad },
  corriendo: boolean
}
```

### Tiempos fijos vs. aleatorios

Cada tiempo configurable (tLL, tS, ΔD, ΔT, paciencia de abandono, cruce ZS) puede operar en modo **fijo** o **aleatorio** (distribución uniforme entre min y max). La UI tiene un switch `.modo-switch[data-key]` por cada uno. `leerParamTiempo(key, idFijo)` en `ui.js` devuelve `{ modo, valor }` o `{ modo, min, max }`. El motor usa `sortearTiempo(base, randomConfig)` en cada sorteodetiempo — incluyendo la primera llegada al inicio.

### Vector Inicial V(0)

El modal "Editar Vector Inicial" usa una tabla horizontal (`vi-table`) construida dinámicamente por `_renderTablaModal()` cada vez que se abre. Las columnas visibles dependen de:
- Modificadores activos (checkboxes `.modificador-check`)
- Estado de PS: `Ts` solo aparece si PS=OCUPADO
- Estado de Zs: `Zs` y `Tz` solo aparecen si seguridad activo y PS=LIBRE

Los valores se persisten en `_state` entre re-renders (para que cambiar PS no borre los demás campos). `guardarVectorInicial()` llama a `_guardarState()` y actualiza el display compacto. `aplicar()` es llamado desde `motor.js` después de todos los hooks `onIniciar`.

### Puntos de hook

Los modificadores llaman a `HookRegistry.registrar(momento, nombre, fn)`. Retornar `false` desde `onLlegada` cancela la lógica predeterminada de encolar/servir.

| Hook | Cuándo |
|------|--------|
| `onIniciar` | Inicia la simulación |
| `onLlegada` | Antes de encolar — retornar `false` para interceptar |
| `onLlegadaPost` | Después de procesar la llegada |
| `onFinServicio` | Antes de desencolar el siguiente cliente |
| `onFinServicioPost` | Después de completar el servicio |
| `onPaso` | En cada paso de la simulación |
| `onFin` | Termina la simulación |
| `onEvento_<nombre>` | Dispara evento custom (ej. `servidor_salida`) |

### Agregar un nuevo modificador

1. Crear `modificadores/nuevo.js`, exportar `window.modificador_nuevo = { iniciar(estado) { ... } }`.
2. Registrar hooks con `HookRegistry.registrar(...)`.
3. Programar eventos custom seteando `estado._eventosExtra.mi_evento = tiempo` y manejarlos con `onEvento_mi_evento`.
4. Agregar controles HTML en `index.html`: checkbox del modificador (`data-mod="nuevo"`), panel de parámetros (`id="param-row_nuevo"`). Si hay tiempo configurable, agregar switch `.modo-switch[data-key]` y divs `fijo_<key>` / `alea_<key>`.
5. Actualizar `ui.js`: extraer parámetro en `leerParametros()` con `leerParamTiempo()` si es aleatorio, agregar columnas en `imprimirEncabezadoTabla()` e `imprimirFila()` usando `mkTh`/`mkTd` con clase `mod-nuevo`.
6. Si el modificador tiene estado en V(0), agregar entrada en `vectorInicial._COLS` con `mod: "nuevo"` y manejar en `vectorInicial.aplicar()`.
7. Agregar etiqueta `<script>` en HTML antes de `vectorInicial.js`.

### Visualización

Los tiempos se muestran como `H:MM:SS`; null/Infinity se renderiza como `─`. Las columnas de la tabla son dinámicas — `imprimirEncabezadoTabla()` e `imprimirFila()` consultan los flags `_abandonoActivo`, `_seguridadActiva`, `_descansoActivo`, `_prioridadesActivo` (seteados al iniciar). Las columnas de modificadores llevan clase CSS `mod-<nombre>` para coloreado y `sep-left` en la primera columna extra para separador visual.

El `infoBar` se divide en dos paneles: izquierdo (`#infoLeft`) con parámetros y modificadores activos (renderizado al iniciar), derecho (`#infoRight`) con estadísticas finales (renderizado al terminar).

// Variables de configuración - Generadores
let tLL = 0; // Tiempo de llegada de clientes (en segundos)
let tS = 0;  // Tiempo de servicio (en segundos)

function obtenerParametros() {
  const tLL = parseInt(document.getElementById("tiempoLlegada").value);
  const tS = parseInt(document.getElementById("tiempoServicio").value);

  console.log(`Parámetros obtenidos - Tiempo de llegada: ${tLL}, Tiempo de servicio: ${tS}`);
  return { tLL, tS };
}

// Variables de estado del sistema
let Cliente = {
    id: 0,
    ultimaLlegada: 0
};

let ClientesAtendidos = 0;

let Servidor = {
    estado: "LIBRE", // "LIBRE" o "OCUPADO"
    tiempoFinServicio: null
};

let Servicio = {
    colaClientes: [],
    clienteEnServicio: null
};

// Variables de simulación
let tiempoActual = 0;
let proximoEventoLlegada = tLL;
let proximoEventoFinServicio = null;

// Función para generar próxima llegada
function generarProximaLlegada() {
    return tiempoActual + tLL;
}

// Función para generar tiempo de servicio
function generarTiempoServicio() {
    return tiempoActual + tS;
}


function formatearHora(segundos) {
  if (segundos === null || segundos === undefined) return "-------";

  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = Math.floor(segundos % 60);

  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

// función para alinear texto
function pad(texto, largo) {
  return String(texto).padEnd(largo, ".");
}

// encabezado (llamar UNA vez al inicio)
function imprimirEncabezado() {
  console.log(
    pad("Evento", 21) +
    pad("Hora actual", 12) +
    pad("Prox. llegada", 15) +
    pad("Fin servicio", 15) +
    pad("Cola", 6) +
    pad("Estado", 7)
  );

  console.log("─".repeat(70));
}
// Función para registrar eventos
function registrarEvento(evento, hora) {
     const fila =
     pad(evento, 21) +
      pad(formatearHora(hora), 12) +
    pad(formatearHora(proximoEventoLlegada), 15) +
    pad(formatearHora(proximoEventoFinServicio), 15) +
    pad(Servicio.colaClientes.length, 6) +
    pad(Servidor.estado, 7);

  console.log(fila);
}

// Evento: Llegada de cliente
function procesarLlegadaCliente() {
    tiempoActual = proximoEventoLlegada;
    Cliente.id++;
    Cliente.ultimaLlegada = tiempoActual;
    
    //console.log(`\n➜ LLEGADA DE CLIENTE #${Cliente.id}`);
    
    if (Servidor.estado === "LIBRE") {
        Servidor.estado = "OCUPADO";
        Servicio.clienteEnServicio = Cliente.id;
        proximoEventoFinServicio = generarTiempoServicio();
    } else {
        Servicio.colaClientes.push(Cliente.id);
    }
    
    proximoEventoLlegada = generarProximaLlegada();
    registrarEvento(`LLEGADA CLIENTE #${Cliente.id}`, tiempoActual);
}

// Evento: Fin de servicio
function procesarFinServicio() {
    tiempoActual = proximoEventoFinServicio;
    ClientesAtendidos++;
    //console.log(`\n✓ FIN DE SERVICIO - Cliente #${Servicio.clienteEnServicio}`);
    
    if (Servicio.colaClientes.length > 0) {
        Servicio.clienteEnServicio = Servicio.colaClientes.shift();
        proximoEventoFinServicio = generarTiempoServicio();
    } else {
        Servidor.estado = "LIBRE";
        Servicio.clienteEnServicio = null;
        proximoEventoFinServicio = null;
    }
    
    registrarEvento(`FIN SERVICIO`, tiempoActual);
}

// Función principal de simulación
function iniciarSimulacion(tiempoTotal) {
         const params = obtenerParametros();
         tLL = params.tLL;
tS = params.tS;

    console.log("═══════════════════════════════════════");
    console.log("SIMULACIÓN DE SISTEMA DE COLAS M/M/1");
    console.log("═══════════════════════════════════════");
    console.log(`Tiempo de llegada: ${tLL}s | Tiempo de servicio: ${tS}s\n`);
    imprimirEncabezado();

    function paso() {
         const proximoEvento = Math.min(
        proximoEventoLlegada,
        proximoEventoFinServicio || Infinity
    );

        if (proximoEvento > tiempoTotal) {
            console.log("\n═══════════════════════════════════════");
            console.log("FIN DE SIMULACIÓN");
            console.log("═══════════════════════════════════════");
            console.log(`Clientes atendidos: ${ClientesAtendidos}`);
            console.log("EVENTO FINAL:", tiempoActual);
            console.log("Último cliente atendido en:", tiempoActual);
            return;
        }

        if (proximoEventoLlegada <= (proximoEventoFinServicio || Infinity)) {
            procesarLlegadaCliente();
        } else {
            procesarFinServicio();
        }

        // 👇 clave: esperar antes del próximo paso
        setTimeout(paso, 100); // podés ajustar velocidad
    }

    paso();
}

function toggleInput(checkbox) {
  const input = checkbox.parentElement.querySelector("input[type='text']");
  input.disabled = !checkbox.checked;

  // opcional: limpiar si se desactiva
  if (!checkbox.checked) {
    input.value = "";
  }
}
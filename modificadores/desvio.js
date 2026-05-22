// ============================================================
// modificadores/desvio.js — Modificador: Desvío inmediato (sin cola)
// ============================================================
// Problema 3: si el servidor está ocupado al llegar un cliente,
// ese cliente es desviado inmediatamente hacia otro destino.
// No entra a la cola ni espera: el sistema lo rechaza en el acto.
//
// Variable auxiliar: estado.stats.clientesDesviados
//   Junto con clientesAtendidos permite calcular la relación
//   procesadas/desviadas que pide el enunciado.
//
// Implementación: hook en onLlegada que intercepta la llegada
// cuando PS ≠ LIBRE, incrementa el contador y retorna false para
// cancelar la lógica estándar de encolar en motor.js.
// El label "DESVIO #N" se muestra en la tabla igual que cualquier evento.
// ============================================================

window.modificador_desvio = {

  iniciar(estado) {
    // Inicializar el contador de desviados en 0 para esta corrida
    estado.stats.clientesDesviados = 0;

    // Hook: se ejecuta en cada llegada antes de encolar/servir.
    // Si el PS está ocupado → desviar y cancelar el procesamiento estándar.
    // Si el PS está libre   → no interceptar (retorna undefined = continuar).
    HookRegistry.registrar("onLlegada", "desvio", ({ estado: e, cliente }) => {
      if (e.servidor.estado !== "LIBRE") {
        e.stats.clientesDesviados++;
        // Cambiar el label para que la fila diga "DESVIO" en lugar de "LLEGADA"
        cliente._labelOverride = `DESVIO #${cliente.id}`;
        return false; // cancelar: motor.js no encolará este cliente
      }
      // PS libre: no interceptar → el cliente pasa al PS normalmente
    });
  },
};

// ============================================================
// modificadores/desvio.js — Modificador: Desvío inmediato (per-PS)
// ============================================================
// Si el PS objetivo está ocupado al llegar un cliente, ese cliente
// es desviado inmediatamente sin entrar a ninguna cola.
//
// Para unafilavarios/serie: se usa PS0 (el único punto de entrada).
// Para paralelo: se desvía si TODOS los PS con este modificador
// están ocupados (no hay ninguno libre).
// ============================================================

window.modificador_desvio = {

  iniciar(estado, psIdx = 0) {
    // Inicializar contador solo una vez (el primer PS que active desvio)
    if (estado.stats.clientesDesviados === undefined) {
      estado.stats.clientesDesviados = 0;
    }

    HookRegistry.registrar("onLlegada", `desvio_ps${psIdx}`, ({ estado: e, cliente }) => {
      if (e.servidores[psIdx].estado !== "LIBRE") {
        e.stats.clientesDesviados++;
        cliente._labelOverride = `DESVIO #${cliente.id}`;
        return false;
      }
    });
  },
};

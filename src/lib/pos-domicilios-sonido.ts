export type VolumenSonidoDomicilios = "bajo" | "medio";

function gananciaMaximaVolumen(volumen: VolumenSonidoDomicilios): number {
  return volumen === "bajo" ? 0.03 : 0.06;
}

/** Tono corto al llegar pedido nuevo o reabrir en domicilios. */
export function reproducirTonoDomicilios(tipo: "crear" | "reabrir", volumen: VolumenSonidoDomicilios = "medio"): void {
  if (typeof window === "undefined" || typeof window.AudioContext === "undefined") return;
  try {
    const ctx = new window.AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = tipo === "crear" ? 880 : 740;
    const g = gananciaMaximaVolumen(volumen);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(g, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (tipo === "crear" ? 0.2 : 0.16));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (tipo === "crear" ? 0.22 : 0.18));
    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 260);
  } catch {
    /* sin audio */
  }
}

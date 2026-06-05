export type VolumenSonidoDomicilios = "bajo" | "medio";

function keySonidosDomicilios(puntoVenta: string): string {
  return `pos_mc_domicilios_sonido_v1:${puntoVenta.trim().toLowerCase() || "global"}`;
}

function keyVolumenDomicilios(puntoVenta: string): string {
  return `pos_mc_domicilios_volumen_v1:${puntoVenta.trim().toLowerCase() || "global"}`;
}

export function leerSonidosDomiciliosActivos(puntoVenta: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(keySonidosDomicilios(puntoVenta));
    if (raw == null) return true;
    return raw !== "off";
  } catch {
    return true;
  }
}

export function leerVolumenSonidoDomicilios(puntoVenta: string): VolumenSonidoDomicilios {
  if (typeof window === "undefined") return "medio";
  try {
    const raw = localStorage.getItem(keyVolumenDomicilios(puntoVenta));
    return raw === "bajo" ? "bajo" : "medio";
  } catch {
    return "medio";
  }
}

function gananciaMaximaVolumen(volumen: VolumenSonidoDomicilios): number {
  return volumen === "bajo" ? 0.03 : 0.06;
}

export function reproducirTonoDomiciliosPos(
  tipo: "crear" | "reabrir" | "alerta",
  volumen: VolumenSonidoDomicilios
): void {
  if (typeof window === "undefined" || typeof window.AudioContext === "undefined") return;
  try {
    const ctx = new window.AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tipo === "alerta" ? "triangle" : "sine";
    osc.frequency.value = tipo === "crear" || tipo === "alerta" ? 880 : 740;
    const gananciaObjetivo = gananciaMaximaVolumen(volumen) * (tipo === "alerta" ? 1.35 : 1);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(gananciaObjetivo, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (tipo === "alerta" ? 0.35 : tipo === "crear" ? 0.2 : 0.16));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (tipo === "alerta" ? 0.38 : tipo === "crear" ? 0.22 : 0.18));
    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 420);
  } catch {
    /* sin audio disponible */
  }
}

export function reproducirAlertaNuevoPedidoDomicilio(puntoVenta: string): void {
  if (!leerSonidosDomiciliosActivos(puntoVenta)) return;
  const volumen = leerVolumenSonidoDomicilios(puntoVenta);
  reproducirTonoDomiciliosPos("alerta", volumen);
  window.setTimeout(() => reproducirTonoDomiciliosPos("crear", volumen), 220);
}

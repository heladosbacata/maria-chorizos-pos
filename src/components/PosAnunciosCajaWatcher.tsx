"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { Loader2, Sparkles } from "lucide-react";
import {
  incrementarVentasDesdeLectura,
  resetVentasDesdeLectura,
} from "@/lib/pos-anuncios-storage";
import {
  wmsAnunciosCampanaActiva,
  wmsAnunciosConfirmarLectura,
  type PosAnuncioCampanaCliente,
} from "@/lib/wms-anuncios-client";

type Props = {
  turnoAbierto: boolean;
  getIdToken: () => Promise<string | null>;
  ventaCompletadaTick?: number;
  /** Oculta popup de campaña (p. ej. módulo Domicilios). */
  suprimido?: boolean;
};

const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

const panelVariants: Variants = {
  hidden: { opacity: 0, scale: 0.92, y: 24 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring", stiffness: 380, damping: 28, mass: 0.85 },
  },
  exit: { opacity: 0, scale: 0.96, y: 12, transition: { duration: 0.2 } },
};

const imageVariants: Variants = {
  hidden: { opacity: 0, scale: 0.97 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { delay: 0.12, duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
  },
};

export default function PosAnunciosCajaWatcher({
  turnoAbierto,
  getIdToken,
  ventaCompletadaTick = 0,
  suprimido = false,
}: Props) {
  const [campana, setCampana] = useState<PosAnuncioCampanaCliente | null>(null);
  const [visible, setVisible] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const campanaRef = useRef<PosAnuncioCampanaCliente | null>(null);
  const mostradoAlInicioRef = useRef(false);
  const ultimoTickVentaRef = useRef(0);

  campanaRef.current = campana;

  const cargarCampana = useCallback(async (): Promise<PosAnuncioCampanaCliente | null> => {
    const r = await wmsAnunciosCampanaActiva();
    if (!r.ok) {
      if (process.env.NODE_ENV === "development") {
        console.info("[PosAnuncios]", r.error);
      }
      setCampana(null);
      setVisible(false);
      return null;
    }
    setCampana(r.campana);
    return r.campana;
  }, []);

  useEffect(() => {
    if (suprimido) {
      setVisible(false);
      return;
    }
    if (!turnoAbierto) {
      setVisible(false);
      mostradoAlInicioRef.current = false;
      return;
    }
    let cancelled = false;
    void (async () => {
      const c = await cargarCampana();
      if (cancelled || !c) return;
      mostradoAlInicioRef.current = true;
      setVisible(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [turnoAbierto, cargarCampana, suprimido]);

  useEffect(() => {
    if (suprimido || !turnoAbierto || ventaCompletadaTick <= 0) return;
    if (ventaCompletadaTick === ultimoTickVentaRef.current) return;
    ultimoTickVentaRef.current = ventaCompletadaTick;

    const c = campanaRef.current;
    if (!c) {
      void cargarCampana().then((loaded) => {
        if (!loaded) return;
        const n = incrementarVentasDesdeLectura(loaded.id);
        if (n >= loaded.cadaNVentas) setVisible(true);
      });
      return;
    }
    const n = incrementarVentasDesdeLectura(c.id);
    if (n >= c.cadaNVentas) setVisible(true);
  }, [ventaCompletadaTick, turnoAbierto, cargarCampana, suprimido]);

  const onConfirmar = async () => {
    const c = campanaRef.current;
    if (!c || confirmando) return;
    setConfirmando(true);
    try {
      resetVentasDesdeLectura(c.id);
      setVisible(false);
      const token = await getIdToken();
      if (token) {
        const r = await wmsAnunciosConfirmarLectura(token, c.id);
        if (!r.ok) console.warn("[PosAnuncios] confirmar lectura:", r.error);
      }
    } finally {
      setConfirmando(false);
    }
  };

  return (
    <AnimatePresence mode="wait">
      {!suprimido && visible && campana?.imageUrl ? (
        <motion.div
          key={campana.id}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pos-anuncio-titulo"
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <motion.div
            variants={backdropVariants}
            className="absolute inset-0 bg-gradient-to-br from-slate-950/70 via-slate-900/55 to-amber-950/25 backdrop-blur-md"
            aria-hidden
          />

          <motion.div
            variants={panelVariants}
            className="relative z-[1] w-full max-w-xl sm:max-w-2xl"
          >
            {/* Halo de marca */}
            <div
              className="pointer-events-none absolute -inset-1 rounded-[1.35rem] bg-gradient-to-br from-amber-400/50 via-orange-500/35 to-red-600/40 opacity-80 blur-md motion-safe:animate-pulse"
              aria-hidden
            />

            <div className="relative overflow-hidden rounded-2xl border border-amber-200/40 bg-white shadow-[0_25px_60px_-12px_rgba(0,0,0,0.45),0_0_0_1px_rgba(251,191,36,0.15)]">
              {/* Barra superior marca */}
              <div className="relative overflow-hidden border-b border-amber-100/80 bg-gradient-to-r from-red-700 via-red-600 to-amber-600 px-5 py-3.5">
                <div
                  className="pointer-events-none absolute inset-0 bg-[linear-gradient(105deg,transparent_40%,rgba(255,255,255,0.12)_50%,transparent_60%)] motion-safe:animate-[shimmer_3s_ease-in-out_infinite]"
                  aria-hidden
                />
                <div className="relative flex items-center justify-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-200 motion-safe:animate-pulse" aria-hidden />
                  <p
                    id="pos-anuncio-titulo"
                    className="text-center text-sm font-bold uppercase tracking-[0.2em] text-white drop-shadow-sm sm:text-base"
                  >
                    {campana.titulo || "Anuncio María Chorizos"}
                  </p>
                  <Sparkles className="h-4 w-4 text-amber-200 motion-safe:animate-pulse" aria-hidden />
                </div>
                <p className="relative mt-1 text-center text-[11px] font-medium text-amber-100/90">
                  Novedad para tu punto de venta
                </p>
              </div>

              {/* Marco imagen */}
              <div className="relative bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-5 py-5 sm:px-6 sm:py-6">
                <div className="pointer-events-none absolute inset-4 rounded-xl border border-amber-500/20 shadow-[inset_0_0_40px_rgba(251,191,36,0.06)]" aria-hidden />
                <motion.div
                  variants={imageVariants}
                  className="relative mx-auto flex max-h-[min(60vh,500px)] max-w-md items-center justify-center sm:max-h-[min(65vh,560px)]"
                >
                  <div className="overflow-hidden rounded-xl ring-2 ring-amber-500/30 ring-offset-2 ring-offset-slate-950 shadow-2xl shadow-black/50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={campana.imageUrl}
                      alt={campana.titulo || "Anuncio"}
                      className="max-h-[min(58vh,520px)] w-full object-contain"
                    />
                  </div>
                </motion.div>
              </div>

              {/* Pie y CTA */}
              <div className="border-t border-slate-100 bg-gradient-to-b from-white to-amber-50/40 px-5 py-5 sm:px-6">
                <motion.button
                  type="button"
                  disabled={confirmando}
                  onClick={() => void onConfirmar()}
                  whileHover={{ scale: confirmando ? 1 : 1.02 }}
                  whileTap={{ scale: confirmando ? 1 : 0.98 }}
                  className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-red-600 py-4 text-base font-bold uppercase tracking-wide text-white shadow-lg shadow-orange-500/25 transition disabled:opacity-70"
                >
                  <span
                    className="pointer-events-none absolute inset-0 bg-[linear-gradient(105deg,transparent_35%,rgba(255,255,255,0.2)_50%,transparent_65%)] motion-safe:animate-[shimmer_2.5s_ease-in-out_infinite]"
                    aria-hidden
                  />
                  <span className="relative flex items-center gap-2">
                    {confirmando ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                        Guardando…
                      </>
                    ) : (
                      campana.textoBotonConfirmacion
                    )}
                  </span>
                </motion.button>
                <p className="mt-3 text-center text-xs text-slate-500">
                  Solo se cierra al confirmar lectura · Grupo Bacatá
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

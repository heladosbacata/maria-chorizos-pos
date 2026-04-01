"use client";

type Props = {
  open: boolean;
  onExperienced: () => void;
  onNewUser: () => void;
};

export default function PosGebBienvenidaModal({ open, onExperienced, onNewUser }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pos-geb-bienvenida-titulo"
    >
      <div
        className="animate-posgeb-backdrop-in absolute inset-0 bg-gradient-to-br from-slate-950/88 via-primary-950/80 to-slate-900/90 backdrop-blur-md"
        aria-hidden
      />
      {/* Orbes ambientales */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="animate-posgeb-orb-a absolute -left-20 top-1/4 h-72 w-72 rounded-full bg-brand-yellow/25 blur-3xl" />
        <div className="animate-posgeb-orb-b absolute -right-16 bottom-1/4 h-96 w-80 rounded-full bg-primary-500/20 blur-3xl" />
        <div className="animate-posgeb-orb-c absolute left-1/3 top-0 h-48 w-48 rounded-full bg-amber-300/15 blur-2xl" />
      </div>

      <div className="animate-posgeb-card-3d relative w-full max-w-lg" style={{ perspective: "1200px" }}>
        <div
          className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.12] to-white/[0.04] p-1 shadow-[0_32px_120px_-24px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.2)]"
          style={{ transformStyle: "preserve-3d" }}
        >
          <div className="animate-posgeb-card-inner rounded-[1.35rem] bg-gradient-to-br from-slate-900/95 via-slate-900/98 to-slate-950 px-6 py-8 text-center shadow-inner sm:px-10 sm:py-10">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center">
              <div className="relative flex h-full w-full items-center justify-center">
                <span className="absolute inset-0 animate-posgeb-icon-ring rounded-2xl border-2 border-brand-yellow/40" />
                <span className="absolute inset-0 animate-posgeb-icon-glow rounded-2xl bg-brand-yellow/15 blur-md" />
                <svg
                  className="relative z-[1] h-9 w-9 text-brand-yellow drop-shadow-[0_4px_12px_rgba(255,200,28,0.45)]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.6}
                    d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3zM5 19h14"
                  />
                </svg>
              </div>
            </div>

            <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-brand-yellow/90">
              Programa POS GEB
            </p>
            <h2
              id="pos-geb-bienvenida-titulo"
              className="mt-3 bg-gradient-to-r from-white via-amber-50 to-brand-yellow bg-clip-text text-2xl font-extrabold leading-tight text-transparent sm:text-3xl"
            >
              ¿Es tu primera vez aquí?
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-300 sm:text-base">
              Estás entrando al <span className="font-semibold text-white">Programa de Facturación POS GEB</span>.
              Queremos que tu experiencia sea impecable desde el primer segundo.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center sm:gap-4">
              <button
                type="button"
                onClick={onNewUser}
                className="group relative flex-1 overflow-hidden rounded-2xl border border-brand-yellow/50 bg-gradient-to-br from-brand-yellow via-amber-300 to-yellow-400 px-5 py-4 text-left font-bold text-gray-900 shadow-[0_12px_40px_-8px_rgba(255,200,28,0.55)] transition-transform active:scale-[0.98] sm:min-w-[200px] sm:flex-none"
              >
                <span className="absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-[100%]" />
                <span className="relative block text-[10px] font-bold uppercase tracking-widest text-gray-800/80">
                  Sí, soy nuevo
                </span>
                <span className="relative mt-1 block text-sm font-extrabold leading-snug">
                  ¡Emocionado por conocerlo!
                </span>
              </button>
              <button
                type="button"
                onClick={onExperienced}
                className="flex-1 rounded-2xl border border-white/20 bg-white/5 px-5 py-4 text-left font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/10 active:scale-[0.98] sm:min-w-[200px] sm:flex-none"
              >
                <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  No, ya tengo experiencia
                </span>
                <span className="mt-1 block text-sm text-slate-100">Ir directo al programa</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

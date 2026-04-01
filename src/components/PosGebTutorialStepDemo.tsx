"use client";

type Props = {
  /** Mismo valor que `data-pos-tutorial` del paso actual */
  tutorialTarget: string;
  /** Tour contador: menú reducido */
  esContador: boolean;
};

const ROWS_CAJERO: { id: string; label: string; hint: string }[] = [
  { id: "nav-ventas", label: "Ventas e ingresos", hint: "Catálogo y cobro" },
  { id: "nav-turnos", label: "Turnos", hint: "Historial y cierres" },
  { id: "nav-cargue", label: "Cargue inventario", hint: "Entradas por lote" },
  { id: "nav-inventarios", label: "Inventarios", hint: "Saldos y consulta" },
  { id: "nav-ultimos", label: "Últimos recibos", hint: "Tickets y anulaciones" },
  { id: "nav-metas", label: "Metas y bonificaciones", hint: "Retos del punto" },
  { id: "nav-reportes", label: "Reportes", hint: "Resumen del día" },
  { id: "nav-mas", label: "Más", hint: "Solo titular" },
];

const ROWS_CONTADOR: { id: string; label: string; hint: string }[] = [
  { id: "nav-ultimos", label: "Últimos recibos", hint: "Consulta" },
  { id: "nav-metas", label: "Metas y bonificaciones", hint: "Retos" },
  { id: "nav-reportes", label: "Reportes", hint: "Resumen" },
];

/** Cursor tipo flecha + etiqueta «Tocá aquí» + pulso (más claro que un ícono abstracto). */
function DemoTapPointer({ topPct, leftPct = 82 }: { topPct: number; leftPct?: number }) {
  return (
    <div
      className="pointer-events-none absolute z-10 flex flex-col items-center"
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        transform: "translate(-35%, -15%)",
      }}
      aria-hidden
    >
      <div className="relative flex flex-col items-start animate-posgeb-demo-tap">
        <span className="absolute left-1 top-5 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center">
          <span className="h-full w-full rounded-full bg-brand-yellow/30 ring-2 ring-brand-yellow/80 animate-posgeb-demo-ripple" />
        </span>
        <svg
          width="40"
          height="40"
          viewBox="0 0 32 32"
          className="relative z-[2] drop-shadow-[0_3px_10px_rgba(0,0,0,0.45)]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M4 2.5 L4 24.5 L11.5 17 L15.5 26 L19 24.5 L15 15.5 L26 15.5 L4 2.5 Z"
            fill="white"
            stroke="#0f172a"
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
        </svg>
        <span className="relative z-[2] -mt-1 ml-3 max-w-[5.5rem] rounded-md border border-slate-800 bg-brand-yellow px-1.5 py-0.5 text-center text-[8px] font-extrabold uppercase leading-tight tracking-wide text-slate-900 shadow-md">
          Tocá aquí
        </span>
      </div>
    </div>
  );
}

function MiniSidebarDemo({ tutorialTarget, esContador }: Props) {
  const rows = esContador ? ROWS_CONTADOR : ROWS_CAJERO;
  const overview = tutorialTarget === "sidebar";
  const activeIdx = overview ? -1 : rows.findIndex((r) => r.id === tutorialTarget);
  const cursorRow = activeIdx >= 0 ? activeIdx : 0;
  /** Centro vertical aproximado de cada fila (%) dentro del bloque menú */
  const rowCenterPct = (i: number) => 10 + i * (80 / Math.max(rows.length, 1));

  return (
    <div className="relative mx-auto w-full max-w-[280px] overflow-hidden rounded-xl border border-white/15 bg-gradient-to-b from-slate-800 to-slate-900 shadow-inner">
      <div className="border-b border-white/10 bg-slate-900/80 px-2 py-1.5 text-center">
        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-brand-yellow/90">Ejemplo animado</p>
        <p className="text-[10px] text-slate-400">La flecha amarilla indica dónde pulsar en tu pantalla</p>
      </div>
      <div className="relative px-2 py-2">
        <div
          className={`relative space-y-1 rounded-lg bg-white/[0.06] p-1.5 ${
            overview ? "ring-2 ring-brand-yellow/50 ring-offset-2 ring-offset-slate-900 animate-pulse" : ""
          }`}
        >
          {rows.map((row, i) => {
            const active = !overview && row.id === tutorialTarget;
            return (
              <div
                key={row.id}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                  active
                    ? "bg-brand-yellow/25 ring-1 ring-brand-yellow/60"
                    : "bg-white/[0.04] opacity-80"
                }`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-700/80 text-[10px] text-slate-300">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-semibold text-white">{row.label}</span>
                  <span className="block truncate text-[9px] text-slate-500">{row.hint}</span>
                </span>
              </div>
            );
          })}
        </div>
        <DemoTapPointer topPct={rowCenterPct(overview ? 1 : cursorRow)} />
      </div>
    </div>
  );
}

function MiniTurnoDemo() {
  return (
    <div className="relative mx-auto w-full max-w-[280px] overflow-hidden rounded-xl border border-white/15 bg-slate-900 p-3">
      <p className="mb-2 text-center text-[10px] text-slate-400">Ejemplo: abrir turno</p>
      <div className="relative rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-center">
        <span className="text-xs font-bold text-red-800">Turno cerrado</span>
        <span className="mt-1 block text-[10px] text-red-700">Tocá aquí para abrir</span>
        <DemoTapPointer topPct={55} leftPct={50} />
      </div>
    </div>
  );
}

function MiniPrecuentasDemo() {
  return (
    <div className="relative mx-auto w-full max-w-[280px] overflow-hidden rounded-xl border border-white/15 bg-slate-900 p-3">
      <p className="mb-2 text-center text-[10px] text-slate-400">Ejemplo: pre-cuentas</p>
      <div className="relative flex flex-wrap items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-2">
        <span className="rounded-md bg-brand-yellow/30 px-2 py-1 text-[10px] font-medium text-white">Mesa 1</span>
        <span className="rounded-md border border-dashed border-white/20 px-2 py-1 text-[10px] text-slate-400">Mesa 2</span>
        <button type="button" className="flex h-7 w-7 items-center justify-center rounded-md border border-dashed border-brand-yellow/50 text-brand-yellow">
          +
        </button>
        <DemoTapPointer topPct={50} leftPct={82} />
      </div>
    </div>
  );
}

function MiniCatalogoDemo() {
  return (
    <div className="relative mx-auto w-full max-w-[280px] overflow-hidden rounded-xl border border-white/15 bg-slate-900 p-3">
      <p className="mb-2 text-center text-[10px] text-slate-400">Ejemplo: sumar al carrito</p>
      <div className="relative grid grid-cols-3 gap-1.5">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <div
            key={n}
            className={`aspect-square rounded-md ${n === 2 ? "bg-primary-500/40 ring-2 ring-brand-yellow" : "bg-slate-700/50"}`}
          />
        ))}
        <DemoTapPointer topPct={42} leftPct={50} />
      </div>
    </div>
  );
}

function MiniCuentaDemo() {
  return (
    <div className="relative mx-auto w-full max-w-[280px] overflow-hidden rounded-xl border border-white/15 bg-slate-900 p-3">
      <p className="mb-2 text-center text-[10px] text-slate-400">Ejemplo: cuenta a cobrar</p>
      <div className="relative space-y-2 rounded-lg border border-white/10 bg-white/5 p-2">
        <div className="h-2 w-3/4 rounded bg-slate-600/60" />
        <div className="h-2 w-1/2 rounded bg-slate-600/40" />
        <div className="mt-2 h-8 rounded-lg bg-emerald-800/50" />
        <DemoTapPointer topPct={72} leftPct={50} />
      </div>
    </div>
  );
}

function MiniValorDiaDemo() {
  return (
    <div className="relative mx-auto w-full max-w-[280px] overflow-hidden rounded-xl border border-white/15 bg-slate-900 p-3">
      <p className="mb-2 text-center text-[10px] text-slate-400">Ejemplo: total del turno</p>
      <div className="relative rounded-lg border border-white/10 bg-white/5 p-2">
        <div className="h-2 w-2/3 rounded bg-slate-600/50" />
        <div className="mt-2 h-2 w-full rounded bg-slate-600/35" />
        <div className="relative mt-3 flex items-center justify-center rounded-lg border border-white/10 bg-slate-800/80 py-3">
          <span className="text-lg font-bold tabular-nums text-amber-200/90">$ 128.500</span>
          <DemoTapPointer topPct={50} leftPct={88} />
        </div>
      </div>
    </div>
  );
}

function MiniAyudaDemo() {
  return (
    <div className="relative mx-auto w-full max-w-[280px] overflow-hidden rounded-xl border border-white/15 bg-slate-900 p-3">
      <p className="mb-2 text-center text-[10px] text-slate-400">Ejemplo: ayuda GEB</p>
      <div className="relative flex justify-end border-b border-white/10 pb-2">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-200/60 bg-gradient-to-br from-amber-50 to-amber-200/30">
          <span className="text-lg font-bold text-amber-900">?</span>
          <DemoTapPointer topPct={50} leftPct={55} />
        </div>
      </div>
    </div>
  );
}

export default function PosGebTutorialStepDemo({ tutorialTarget, esContador }: Props) {
  const sidebarTargets = new Set([
    "sidebar",
    "nav-ventas",
    "nav-turnos",
    "nav-cargue",
    "nav-inventarios",
    "nav-ultimos",
    "nav-metas",
    "nav-reportes",
    "nav-mas",
  ]);

  if (esContador && (tutorialTarget === "sidebar" || tutorialTarget.startsWith("nav-"))) {
    return <MiniSidebarDemo tutorialTarget={tutorialTarget} esContador />;
  }

  if (!esContador && sidebarTargets.has(tutorialTarget)) {
    return <MiniSidebarDemo tutorialTarget={tutorialTarget} esContador={false} />;
  }

  switch (tutorialTarget) {
    case "turno":
      return <MiniTurnoDemo />;
    case "precuentas":
      return <MiniPrecuentasDemo />;
    case "catalogo":
      return <MiniCatalogoDemo />;
    case "cuenta-cobrar":
      return <MiniCuentaDemo />;
    case "valor-dia":
      return <MiniValorDiaDemo />;
    case "ayuda-icon":
      return <MiniAyudaDemo />;
    default:
      return null;
  }
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { POS_CONTADOR_ROLE } from "@/lib/auth-roles";
import { auth } from "@/lib/firebase";
import {
  cancelarInvitacionContadorFirestore,
  crearInvitacionContadorFirestore,
  enviarCorreoEnlaceContador,
  listarInvitacionesContadorFirestore,
} from "@/lib/contador-invite-firestore";
import {
  getContadorInvitaciones,
  postInvitarContador,
  type ContadorInvitacionesNormalizado,
  type InvitacionContadorItem,
} from "@/lib/contador-wms";

export interface InvitarContadorPanelProps {
  onVolver: () => void;
}

function IlustracionContador() {
  return (
    <div className="relative mx-auto flex h-44 w-full max-w-[280px] items-center justify-center" aria-hidden>
      <svg viewBox="0 0 320 200" className="h-full w-full text-sky-100" fill="none">
        <ellipse cx="160" cy="178" rx="120" ry="14" fill="currentColor" className="text-slate-200/80" />
        <rect x="88" y="72" width="144" height="96" rx="10" fill="#e0f2fe" stroke="#38bdf8" strokeWidth="2" />
        <rect x="98" y="82" width="124" height="64" rx="4" fill="white" />
        <path
          d="M108 118 L118 108 L132 122 L148 96 L168 118 L188 88 L208 112"
          stroke="#0ea5e9"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="98" y="150" width="52" height="8" rx="2" fill="#bae6fd" />
        <rect x="156" y="150" width="66" height="8" rx="2" fill="#bae6fd" />
        <circle cx="248" cy="56" r="28" fill="#fef3c7" stroke="#f59e0b" strokeWidth="2" />
        <text x="248" y="64" textAnchor="middle" fill="#b45309" fontSize="22" fontWeight="700">
          $
        </text>
        <rect x="32" y="96" width="36" height="52" rx="4" fill="#ddd6fe" stroke="#8b5cf6" strokeWidth="2" />
        <rect x="40" y="108" width="8" height="28" rx="1" fill="#7c3aed" opacity="0.5" />
        <rect x="52" y="116" width="8" height="20" rx="1" fill="#7c3aed" opacity="0.7" />
        <rect x="64" y="100" width="8" height="36" rx="1" fill="#7c3aed" />
        <path d="M260 120 A 36 36 0 1 1 220 140" stroke="#34d399" strokeWidth="10" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function etiquetaEstado(estado: string | undefined): string {
  if (!estado) return "Pendiente";
  const e = estado.toLowerCase();
  if (e.includes("acept") || e === "activa" || e === "active") return "Activa";
  if (e.includes("pend")) return "Pendiente";
  if (e.includes("rechaz") || e.includes("cancel")) return estado;
  return estado;
}

function firestoreInvitacionesAResumen(
  docs: Awaited<ReturnType<typeof listarInvitacionesContadorFirestore>>,
  wmsNote?: string
): ContadorInvitacionesNormalizado {
  const visibles = docs.filter((d) => d.estado !== "cancelada");
  const invitaciones: InvitacionContadorItem[] = visibles.map((d) => ({
    email: d.inviteeEmail,
    estado: d.estado === "aceptada" ? "Activa" : d.estado === "pendiente" ? "Pendiente" : d.estado,
    createdAt: typeof d.createdAt === "string" ? d.createdAt : undefined,
    firestoreId: d.estado === "pendiente" ? d.id : undefined,
  }));
  const usados = visibles.filter((d) => d.estado === "pendiente" || d.estado === "aceptada").length;
  return {
    ok: true,
    cupoMax: 1,
    usados: Math.min(usados, 1),
    invitaciones,
    message: wmsNote,
  };
}

export default function InvitarContadorPanel({ onVolver }: InvitarContadorPanelProps) {
  const { user } = useAuth();
  const [resumen, setResumen] = useState<ContadorInvitacionesNormalizado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [anulandoId, setAnulandoId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null;
      const r = await getContadorInvitaciones(token);
      const fb = user?.uid ? await listarInvitacionesContadorFirestore(user.uid) : [];

      if (r.ok && r.invitaciones.length > 0) {
        setResumen(r);
        return;
      }
      if (fb.length > 0) {
        setResumen(firestoreInvitacionesAResumen(fb, !r.ok ? r.message : undefined));
        setError(null);
        return;
      }
      setResumen(r);
      if (!r.ok && r.message) setError(r.message);
    } catch {
      setError("No se pudo cargar el estado de invitaciones.");
      setResumen({ ok: false, cupoMax: 1, usados: 0, invitaciones: [] });
    } finally {
      setCargando(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const cupoMax = resumen?.cupoMax ?? 1;
  const usados = resumen?.usados ?? 0;
  const cupoLleno = usados >= cupoMax;
  const invitaciones = resumen?.invitaciones ?? [];

  const abrirModal = () => {
    setMensaje(null);
    setEmail("");
    setModalAbierto(true);
  };

  const enviarInvitacion = async () => {
    if (user?.role === POS_CONTADOR_ROLE) {
      setMensaje("Las cuentas de contador no pueden enviar invitaciones.");
      return;
    }
    const correo = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      setMensaje("Introduce un correo electrónico válido.");
      return;
    }
    if (!user?.uid || !user.puntoVenta || !user.email) {
      setMensaje("Debes tener un punto de venta asignado para invitar. Completa tu perfil o elige punto de venta al iniciar sesión.");
      return;
    }
    if (!auth) {
      setMensaje("Sesión no disponible.");
      return;
    }
    setEnviando(true);
    setMensaje(null);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const r = await postInvitarContador(correo, token);
      if (r.ok) {
        setModalAbierto(false);
        setEmail("");
        await cargar();
        setMensaje(r.message || "Invitación enviada. El contador recibirá instrucciones por correo.");
        return;
      }
      const crear = await crearInvitacionContadorFirestore({
        inviterUid: user.uid,
        inviterEmail: user.email,
        puntoVenta: user.puntoVenta,
        inviteeEmail: correo,
      });
      if (!crear.ok) {
        setMensaje(crear.message || r.message || "No se pudo registrar la invitación.");
        return;
      }
      const origin = window.location.origin;
      const continueUrl = `${origin}/invitacion-contador?e=${encodeURIComponent(correo.toLowerCase())}`;
      const mail = await enviarCorreoEnlaceContador(auth, correo, continueUrl);
      if (!mail.ok) {
        setMensaje(
          mail.message ||
            "La invitación quedó registrada pero no se envió el correo. Revisa dominios autorizados en Firebase (Authentication → Configuración → Dominios)."
        );
        await cargar();
        return;
      }
      setModalAbierto(false);
      setEmail("");
      await cargar();
      setMensaje(
        "Invitación enviada por correo. El contador debe abrir el enlace, confirmar el correo y crear su contraseña. Solo verá datos de tu punto de venta."
      );
    } catch {
      setMensaje("Error de red al enviar la invitación.");
    } finally {
      setEnviando(false);
    }
  };

  const anularInvitacionPendiente = async (firestoreId: string, emailInvitado: string) => {
    if (!user?.uid) return;
    const ok = window.confirm(
      `¿Anular la invitación pendiente a ${emailInvitado}? Podrás enviar una nueva invitación a otro correo.`
    );
    if (!ok) return;
    setAnulandoId(firestoreId);
    setMensaje(null);
    setError(null);
    const r = await cancelarInvitacionContadorFirestore({ firestoreId, inviterUid: user.uid });
    setAnulandoId(null);
    if (!r.ok) {
      setError(r.message ?? "No se pudo anular la invitación.");
      return;
    }
    await cargar();
    setMensaje("Invitación anulada. Ya puedes invitar a otro contador.");
  };

  const inputClass =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100";

  return (
    <div className="mx-auto max-w-3xl pb-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-primary-600 md:text-2xl">Invita a tu contador</h2>
          <p className="mt-1 max-w-xl text-sm text-gray-600">
            Aquí puedes invitar a quien desees a tu empresa para que forme parte de tu equipo de trabajo y acceda a los
            números y reportes de POS GEB según los permisos que defina el WMS.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void cargar()}
            disabled={cargando}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {cargando ? "Actualizando…" : "Actualizar"}
          </button>
          <button
            type="button"
            onClick={onVolver}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            Volver
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-medium">{error}</p>
          <p className="mt-2 text-xs text-amber-900/90">
            Si el WMS no tiene aún las rutas de contador, el POS puede usar invitaciones con Firebase (Firestore + correo
            con enlace). Asegura reglas de Firestore para la colección{" "}
            <code className="rounded bg-amber-100 px-1">posContadorInvitaciones</code> y dominios autorizados en Firebase
            Auth para la URL de este POS.
          </p>
        </div>
      )}

      {resumen?.message && !error && (
        <div className="mb-4 rounded-lg border border-sky-100 bg-sky-50 p-2 text-xs text-sky-900">{resumen.message}</div>
      )}

      {mensaje && !modalAbierto && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">{mensaje}</div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
        <article className="flex flex-1 flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-md">
          <div className="mb-4 flex items-start justify-between gap-2">
            <h3 className="text-lg font-bold text-gray-900">Contador</h3>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {cargando ? "…" : `${usados} de ${cupoMax}`}
            </span>
          </div>
          <IlustracionContador />
          <p className="mt-4 flex-1 text-center text-sm leading-relaxed text-gray-600">
            Invita a tu contador para que sea tu aliado en consolidar todos tus procesos contables y visualizar la
            información de POS GEB.
          </p>
          <button
            type="button"
            onClick={abrirModal}
            disabled={cargando || cupoLleno}
            className="mt-6 w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cupoLleno ? "Cupo de contador completo" : "Invitar usuario"}
          </button>
        </article>
      </div>

      {invitaciones.length > 0 && (
        <section className="mt-8">
          <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Invitaciones</h4>
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {invitaciones.map((inv: InvitacionContadorItem, idx: number) => {
              const pendienteFirestore =
                Boolean(inv.firestoreId) &&
                (inv.estado === "Pendiente" || (inv.estado ?? "").toLowerCase().includes("pend"));
              return (
                <li
                  key={`${inv.email}-${inv.firestoreId ?? idx}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                >
                  <span className="font-medium text-gray-900">{inv.email}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-gray-600">{etiquetaEstado(inv.estado)}</span>
                    {pendienteFirestore && inv.firestoreId && (
                      <button
                        type="button"
                        disabled={anulandoId === inv.firestoreId}
                        onClick={() => void anularInvitacionPendiente(inv.firestoreId!, inv.email)}
                        className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50"
                      >
                        {anulandoId === inv.firestoreId ? "Anulando…" : "Anular"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="mt-6 text-xs text-gray-500">
        La invitación crea o vincula un usuario contador en el WMS con acceso a los datos de tu organización en POS GEB.
        Si el correo ya está registrado, el WMS puede unirlo a tu espacio según su lógica de negocio.
      </p>

      {modalAbierto && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-invitar-contador-titulo"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Cerrar"
            onClick={() => !enviando && setModalAbierto(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
            <h3 id="modal-invitar-contador-titulo" className="text-lg font-bold text-gray-900">
              Invitar contador
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Recibirá un correo con el enlace o instrucciones para acceder a POS GEB y ver los números autorizados.
            </p>
            <label className="mt-4 block text-sm font-medium text-gray-700" htmlFor="email-contador">
              Correo electrónico
            </label>
            <input
              id="email-contador"
              type="email"
              className={`${inputClass} mt-1`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contador@empresa.com"
              autoComplete="email"
              disabled={enviando}
            />
            {mensaje && modalAbierto && (
              <p className="mt-2 text-sm text-red-600" role="alert">
                {mensaje}
              </p>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={enviando}
                onClick={() => setModalAbierto(false)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={enviando}
                onClick={() => void enviarInvitacion()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {enviando ? "Enviando…" : "Enviar invitación"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

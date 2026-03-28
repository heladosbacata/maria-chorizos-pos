"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CajeroFichaFormFields from "@/components/CajeroFichaFormFields";
import { POS_CAJERO_FICHA_STORAGE_KEY } from "@/constants/perfil-pos";
import {
  EVENTO_PERFIL_CAJERO_GUARDADO,
  nombreCompletoDesdeFicha,
} from "@/lib/pos-perfil-cajero-display";
import { loadPosPerfilCajeroFromFirestore, persistPosPerfilCajero } from "@/lib/pos-user-firestore";
import type { CajeroFichaDatos } from "@/types/pos-perfil-cajero";
import { emptyCajeroFicha } from "@/types/pos-perfil-cajero";

function loadFichaLocal(): CajeroFichaDatos {
  if (typeof window === "undefined") return emptyCajeroFicha();
  try {
    const raw = localStorage.getItem(POS_CAJERO_FICHA_STORAGE_KEY);
    if (!raw) return emptyCajeroFicha();
    const p = JSON.parse(raw) as Partial<CajeroFichaDatos>;
    return { ...emptyCajeroFicha(), ...p };
  } catch {
    return emptyCajeroFicha();
  }
}

export interface PerfilCajeroFormProps {
  uidSesion: string | null;
  emailSesion: string | null;
  fotoPreview: string | null;
  onFotoChange: (dataUrl: string | null) => void;
  onVolver: () => void;
}

export type { CajeroFichaDatos };

export default function PerfilCajeroForm({
  uidSesion,
  emailSesion,
  fotoPreview,
  onFotoChange,
  onVolver,
}: PerfilCajeroFormProps) {
  const [datos, setDatos] = useState<CajeroFichaDatos>(emptyCajeroFicha);
  const [cargandoPerfil, setCargandoPerfil] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setCargandoPerfil(true);
      const local = loadFichaLocal();
      if (emailSesion && !local.correo) local.correo = emailSesion;
      let merged: CajeroFichaDatos = local;
      if (uidSesion) {
        const remote = await loadPosPerfilCajeroFromFirestore(uidSesion);
        if (!cancelled && remote) {
          merged = { ...emptyCajeroFicha(), ...local, ...remote };
        }
      }
      if (!cancelled) setDatos(merged);
      if (!cancelled) setCargandoPerfil(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [emailSesion, uidSesion]);

  const setCampo = useCallback(<K extends keyof CajeroFichaDatos>(k: K, v: CajeroFichaDatos[K]) => {
    setDatos((prev) => ({ ...prev, [k]: v }));
  }, []);

  const handleFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file?.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      onFotoChange(dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const nombrePerfilLinea = nombreCompletoDesdeFicha(datos);

  const guardar = async () => {
    try {
      localStorage.setItem(POS_CAJERO_FICHA_STORAGE_KEY, JSON.stringify(datos));
    } catch {
      window.alert("No se pudo guardar en el dispositivo (almacenamiento lleno o desactivado).");
      return;
    }
    if (uidSesion) {
      setGuardando(true);
      const r = await persistPosPerfilCajero(uidSesion, datos);
      setGuardando(false);
      if (!r.ok) {
        window.dispatchEvent(new CustomEvent(EVENTO_PERFIL_CAJERO_GUARDADO));
        window.alert(
          `Guardado local OK. No se pudo sincronizar con la nube: ${r.message ?? "error"}. Revisa reglas de Firestore (escritura en users/{tu uid}).`
        );
        return;
      }
      window.dispatchEvent(new CustomEvent(EVENTO_PERFIL_CAJERO_GUARDADO));
      window.alert("Perfil guardado en tu usuario (Firestore) y en este dispositivo.");
      return;
    }
    window.dispatchEvent(new CustomEvent(EVENTO_PERFIL_CAJERO_GUARDADO));
    window.alert("Perfil guardado solo en este dispositivo (sin sesión UID).");
  };

  return (
    <div className="flex max-h-[min(85vh,720px)] flex-col">
      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
        <h3 className="text-lg font-bold text-gray-900">Perfil del cajero</h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={guardando || cargandoPerfil}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
          <button
            type="button"
            onClick={onVolver}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Volver
          </button>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50/90 px-3 py-2.5 text-sm text-sky-950">
        <p>
          <span className="font-semibold text-sky-900">Nombre en perfil:</span>{" "}
          {nombrePerfilLinea ? (
            <span className="font-medium text-sky-950">{nombrePerfilLinea}</span>
          ) : (
            <span className="text-sky-800/90">
              Aún sin indicar — completá nombres y apellidos abajo; mientras tanto se usa tu correo de sesión para
              identificarte en caja.
            </span>
          )}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-sky-900/88">
          <span className="font-semibold text-sky-900">Dónde se guarda:</span> copia en este navegador
          {uidSesion ? (
            <>
              {" "}
              y en la nube en el documento{" "}
              <code className="rounded bg-white/80 px-1 py-0.5 text-[11px] text-sky-950">users/{uidSesion}</code>
            </>
          ) : (
            " (sin UID de sesión no hay copia en Firestore)"
          )}
          . Sesión actual:{" "}
          <span className="font-mono font-medium text-sky-950">{emailSesion?.trim() || "—"}</span>
        </p>
      </div>

      {cargandoPerfil && (
        <p className="mt-2 text-xs text-gray-500">Cargando datos guardados…</p>
      )}

      <div className="mt-4 flex-1 overflow-y-auto pr-1">
        <div className="mb-6 flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-200 bg-gray-50/80 p-4 sm:flex-row sm:justify-start">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFoto} aria-label="Subir foto" />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative flex h-24 w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-gray-300 bg-white shadow-sm hover:border-primary-400"
          >
            {fotoPreview ? (
              <img src={fotoPreview} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs text-gray-500 text-center px-2">Sin foto</span>
            )}
          </button>
          <div className="text-center sm:text-left">
            <p className="text-sm font-medium text-gray-800">Foto del cajero</p>
            <p className="text-xs text-gray-500">Solo en este equipo (no se sube a Firestore).</p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-2 text-sm font-medium text-primary-600 hover:underline"
            >
              Cargar o cambiar foto
            </button>
          </div>
        </div>
        <CajeroFichaFormFields datos={datos} setCampo={setCampo} />
      </div>
    </div>
  );
}

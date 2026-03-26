"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { POS_CAJERO_FICHA_STORAGE_KEY, POS_CAJERO_FOTO_STORAGE_KEY } from "@/constants/perfil-pos";
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

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100";
const selectClass = inputClass;
const labelClass = "mb-1 block text-xs font-medium text-gray-600";

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
      try {
        localStorage.setItem(POS_CAJERO_FOTO_STORAGE_KEY, dataUrl);
      } catch {
        /* quota */
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

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
        window.alert(
          `Guardado local OK. No se pudo sincronizar con la nube: ${r.message ?? "error"}. Revisa reglas de Firestore (escritura en users/{tu uid}).`
        );
        return;
      }
      window.alert("Perfil guardado en tu usuario (Firestore) y en este dispositivo.");
      return;
    }
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

      {cargandoPerfil && (
        <p className="mt-2 text-xs text-gray-500">Cargando datos guardados…</p>
      )}

      <div className="mt-4 flex-1 space-y-6 overflow-y-auto pr-1">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-200 bg-gray-50/80 p-4 sm:flex-row sm:justify-start">
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

        <section>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Datos personales</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Nombres</label>
              <input className={inputClass} value={datos.nombres} onChange={(e) => setCampo("nombres", e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Apellidos</label>
              <input className={inputClass} value={datos.apellidos} onChange={(e) => setCampo("apellidos", e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Tipo de documento</label>
              <select
                className={selectClass}
                value={datos.tipoDocumento}
                onChange={(e) => setCampo("tipoDocumento", e.target.value)}
              >
                <option>Cédula de ciudadanía</option>
                <option>Cédula de extranjería</option>
                <option>Pasaporte</option>
                <option>Tarjeta de identidad</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Número de documento</label>
              <input
                className={inputClass}
                value={datos.numeroDocumento}
                onChange={(e) => setCampo("numeroDocumento", e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Fecha de nacimiento (cumpleaños)</label>
              <input
                type="date"
                className={inputClass}
                value={datos.fechaNacimiento}
                onChange={(e) => setCampo("fechaNacimiento", e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Género (opcional)</label>
              <select className={selectClass} value={datos.genero} onChange={(e) => setCampo("genero", e.target.value)}>
                <option value="">—</option>
                <option value="F">Femenino</option>
                <option value="M">Masculino</option>
                <option value="O">Otro / prefiero no indicar</option>
              </select>
            </div>
          </div>
        </section>

        <section>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Contacto</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass}>Correo electrónico</label>
              <input
                type="email"
                className={inputClass}
                value={datos.correo}
                onChange={(e) => setCampo("correo", e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Celular</label>
              <input className={inputClass} value={datos.celular} onChange={(e) => setCampo("celular", e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Teléfono fijo (opcional)</label>
              <input
                className={inputClass}
                value={datos.telefonoFijo}
                onChange={(e) => setCampo("telefonoFijo", e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Ciudad</label>
              <input className={inputClass} value={datos.ciudad} onChange={(e) => setCampo("ciudad", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Dirección de residencia</label>
              <input className={inputClass} value={datos.direccion} onChange={(e) => setCampo("direccion", e.target.value)} />
            </div>
          </div>
        </section>

        <section>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Contacto de emergencia</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Nombre completo</label>
              <input
                className={inputClass}
                value={datos.contactoEmergenciaNombre}
                onChange={(e) => setCampo("contactoEmergenciaNombre", e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Parentesco</label>
              <input
                className={inputClass}
                value={datos.contactoEmergenciaParentesco}
                onChange={(e) => setCampo("contactoEmergenciaParentesco", e.target.value)}
                placeholder="Ej. Cónyuge, madre…"
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Teléfono de emergencia</label>
              <input
                className={inputClass}
                value={datos.contactoEmergenciaTelefono}
                onChange={(e) => setCampo("contactoEmergenciaTelefono", e.target.value)}
              />
            </div>
          </div>
        </section>

        <section>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Familia</h4>
          <div className="space-y-3">
            <div>
              <span className={labelClass}>¿Tiene hijos?</span>
              <div className="flex gap-4 pt-1">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="hijos"
                    checked={datos.tieneHijos === "si"}
                    onChange={() => setCampo("tieneHijos", "si")}
                    className="text-primary-600"
                  />
                  Sí
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="hijos"
                    checked={datos.tieneHijos === "no"}
                    onChange={() => setCampo("tieneHijos", "no")}
                    className="text-primary-600"
                  />
                  No
                </label>
              </div>
            </div>
            {datos.tieneHijos === "si" && (
              <>
                <div>
                  <label className={labelClass}>Cantidad de hijos</label>
                  <input
                    type="number"
                    min={0}
                    className={inputClass}
                    value={datos.numeroHijos}
                    onChange={(e) => setCampo("numeroHijos", e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>Nombres, edades u observaciones</label>
                  <textarea
                    className={`${inputClass} min-h-[80px] resize-y`}
                    value={datos.observacionesHijos}
                    onChange={(e) => setCampo("observacionesHijos", e.target.value)}
                    placeholder="Opcional: datos que deban constar en RR.HH."
                  />
                </div>
              </>
            )}
          </div>
        </section>

        <section>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Laboral</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Cargo</label>
              <input className={inputClass} value={datos.cargo} onChange={(e) => setCampo("cargo", e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Fecha de ingreso</label>
              <input
                type="date"
                className={inputClass}
                value={datos.fechaIngreso}
                onChange={(e) => setCampo("fechaIngreso", e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Observaciones adicionales</label>
              <textarea
                className={`${inputClass} min-h-[72px] resize-y`}
                value={datos.observaciones}
                onChange={(e) => setCampo("observaciones", e.target.value)}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

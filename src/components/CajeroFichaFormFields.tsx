"use client";

import type { CajeroFichaDatos } from "@/types/pos-perfil-cajero";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100";
const selectClass = inputClass;
const labelClass = "mb-1 block text-xs font-medium text-gray-600";

export interface CajeroFichaFormFieldsProps {
  datos: CajeroFichaDatos;
  setCampo: <K extends keyof CajeroFichaDatos>(k: K, v: CajeroFichaDatos[K]) => void;
}

/** Campos del perfil de cajero (compartido entre PerfilCajeroForm y administración de cajeros por turno). */
export default function CajeroFichaFormFields({ datos, setCampo }: CajeroFichaFormFieldsProps) {
  return (
    <div className="mt-4 flex-1 space-y-6 overflow-y-auto pr-1">
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
                  name="hijos-ctf"
                  checked={datos.tieneHijos === "si"}
                  onChange={() => setCampo("tieneHijos", "si")}
                  className="text-primary-600"
                />
                Sí
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="hijos-ctf"
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
  );
}

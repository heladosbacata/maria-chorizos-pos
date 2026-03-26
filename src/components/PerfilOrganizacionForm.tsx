"use client";

import { useCallback, useState } from "react";

function CollapsibleSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 bg-gray-50 px-4 py-3 text-left text-sm font-semibold text-gray-900 hover:bg-gray-100"
      >
        {title}
        <svg
          className={`h-5 w-5 flex-shrink-0 text-gray-500 transition-transform ${open ? "-rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="space-y-4 border-t border-gray-100 p-4">{children}</div>}
    </div>
  );
}

function FieldRow({ label, children, hint }: { label: React.ReactNode; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 md:grid-cols-[minmax(200px,240px)_1fr] md:items-start md:gap-4">
      <div className="pt-2 text-sm text-gray-700">{label}</div>
      <div>
        {children}
        {hint ? <div className="mt-1 text-xs text-gray-500">{hint}</div> : null}
      </div>
    </div>
  );
}

const TIPOS_IDENTIFICACION = [
  "Cédula de ciudadanía",
  "NIT",
  "Cédula de extranjería",
  "Pasaporte",
  "Tarjeta de identidad",
];

const CIUDADES_CO = [
  "Puerto Asís",
  "Bogotá D.C.",
  "Medellín",
  "Cali",
  "Barranquilla",
  "Cartagena",
  "Bucaramanga",
  "Pereira",
  "Manizales",
];

const REGIMEN_IVA = [
  "003 - No responsable de IVA",
  "002 - Responsable de IVA",
  "004 - Responsable de IVA - Régimen simple",
];

const ACTIVIDAD_ECONOMICA = [
  "6920 - Actividades de contabilidad, teneduría de libros y auditoría",
  "4711 - Comercio al por menor en establecimientos no especializados",
  "5610 - Actividades de restaurantes y servicios móviles de comidas",
];

const RESP_FISCAL_OPTS = ["No aplica - Otros", "Gran contribuyente", "Autorretenedor", "Agente de retención IVA"];
const TRIBUTOS_OPTS = ["Nombre de la figura tributaria", "ICA", "Retención en la fuente"];

export interface PerfilOrganizacionFormProps {
  onVolver: () => void;
  onGuardar?: (payload: Record<string, unknown>) => void;
}

export default function PerfilOrganizacionForm({ onVolver, onGuardar }: PerfilOrganizacionFormProps) {
  const [tipoRazon, setTipoRazon] = useState<"persona" | "empresa">("persona");
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [serial] = useState("01020525549412");
  const [tipoIdentificacion, setTipoIdentificacion] = useState(TIPOS_IDENTIFICACION[0]!);
  const [identificacion, setIdentificacion] = useState("");
  const [digitoVerificacion, setDigitoVerificacion] = useState("");
  const [nombreComercial, setNombreComercial] = useState("");
  const [mostrarNombreComercialComprobantes, setMostrarNombreComercialComprobantes] = useState(false);

  const [ciudad, setCiudad] = useState("Puerto Asís");
  const [codigoPostal, setCodigoPostal] = useState("000000");
  const [direccion, setDireccion] = useState("");
  const [tipoRegimenIva, setTipoRegimenIva] = useState(REGIMEN_IVA[0]!);
  const [correoContacto, setCorreoContacto] = useState("");
  const [contacto, setContacto] = useState("");
  const [paginaWeb, setPaginaWeb] = useState("");
  const [telPais, setTelPais] = useState("57");
  const [telNumero, setTelNumero] = useState("");
  const [telExt, setTelExt] = useState("");
  const [cobradorTipo, setCobradorTipo] = useState("Usuario");
  const [cobradorNombre, setCobradorNombre] = useState("");

  const [openDatosGenerales, setOpenDatosGenerales] = useState(true);
  const [openDatosUbicacion, setOpenDatosUbicacion] = useState(true);
  const [openTributarios, setOpenTributarios] = useState(true);
  const [openMonedaExt, setOpenMonedaExt] = useState(true);
  const [openRepresentante, setOpenRepresentante] = useState(true);

  const [codigoActividad, setCodigoActividad] = useState(ACTIVIDAD_ECONOMICA[0]!);
  const [tarifaIca, setTarifaIca] = useState("");
  const [manejaAIU, setManejaAIU] = useState(false);
  const [dosImpuestosCargos, setDosImpuestosCargos] = useState(false);
  const [agenteRetenedorIva, setAgenteRetenedorIva] = useState(false);
  const [impuestoAdValorem, setImpuestoAdValorem] = useState(false);
  const [respFiscal, setRespFiscal] = useState<string[]>(["No aplica - Otros"]);
  const [tributos, setTributos] = useState<string[]>(["Nombre de la figura tributaria"]);
  const [manejaMonedaExtranjera, setManejaMonedaExtranjera] = useState(false);

  const [repNombres, setRepNombres] = useState("");
  const [repApellidos, setRepApellidos] = useState("");
  const [repTipoId, setRepTipoId] = useState(TIPOS_IDENTIFICACION[0]!);
  const [repIdentificacion, setRepIdentificacion] = useState("");
  const [tieneSocios, setTieneSocios] = useState<"si" | "no">("no");

  const toggleEnLista = useCallback((lista: string[], setLista: (v: string[]) => void, valor: string) => {
    if (lista.includes(valor)) setLista(lista.filter((x) => x !== valor));
    else setLista([...lista, valor]);
  }, []);

  const handleGuardar = useCallback(() => {
    const payload = {
      tipoRazon,
      nombres,
      apellidos,
      serial,
      tipoIdentificacion,
      identificacion,
      digitoVerificacion,
      nombreComercial,
      mostrarNombreComercialComprobantes,
      ciudad,
      codigoPostal,
      direccion,
      tipoRegimenIva,
      correoContacto,
      contacto,
      paginaWeb,
      telefono: { pais: telPais, numero: telNumero, ext: telExt },
      cobradorTipo,
      cobradorNombre,
      codigoActividad,
      tarifaIca,
      manejaAIU,
      dosImpuestosCargos,
      agenteRetenedorIva,
      impuestoAdValorem,
      respFiscal,
      tributos,
      manejaMonedaExtranjera,
      representante: {
        nombres: repNombres,
        apellidos: repApellidos,
        tipoIdentificacion: repTipoId,
        identificacion: repIdentificacion,
        tieneSocios,
      },
    };
    onGuardar?.(payload);
    window.alert("Datos guardados en esta sesión. Conecta con tu backend para persistir.");
  }, [
    tipoRazon,
    nombres,
    apellidos,
    serial,
    tipoIdentificacion,
    identificacion,
    digitoVerificacion,
    nombreComercial,
    mostrarNombreComercialComprobantes,
    ciudad,
    codigoPostal,
    direccion,
    tipoRegimenIva,
    correoContacto,
    contacto,
    paginaWeb,
    telPais,
    telNumero,
    telExt,
    cobradorTipo,
    cobradorNombre,
    codigoActividad,
    tarifaIca,
    manejaAIU,
    dosImpuestosCargos,
    agenteRetenedorIva,
    impuestoAdValorem,
    respFiscal,
    tributos,
    manejaMonedaExtranjera,
    repNombres,
    repApellidos,
    repTipoId,
    repIdentificacion,
    tieneSocios,
    onGuardar,
  ]);

  const selectClass =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100";
  const inputClass =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100";

  return (
    <div className="mx-auto max-w-4xl pb-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4">
        <h2 className="text-xl font-bold text-primary-600 md:text-2xl">Datos de la empresa</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleGuardar}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            Guardar
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

      <div className="space-y-4">
        <CollapsibleSection
          title="Datos generales"
          open={openDatosGenerales}
          onToggle={() => setOpenDatosGenerales((o) => !o)}
        >
          <FieldRow label="Tipo razón social">
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="tipo-razon"
                  checked={tipoRazon === "persona"}
                  onChange={() => setTipoRazon("persona")}
                  className="text-primary-600"
                />
                Es persona
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="tipo-razon"
                  checked={tipoRazon === "empresa"}
                  onChange={() => setTipoRazon("empresa")}
                  className="text-primary-600"
                />
                Empresa
              </label>
            </div>
          </FieldRow>
          <FieldRow label="Nombre">
            <input className={inputClass} value={nombres} onChange={(e) => setNombres(e.target.value)} />
          </FieldRow>
          <FieldRow label="Apellidos">
            <input className={inputClass} value={apellidos} onChange={(e) => setApellidos(e.target.value)} />
          </FieldRow>
          <FieldRow label="Serial">
            <input className={`${inputClass} bg-gray-50 text-gray-600`} readOnly value={serial} />
          </FieldRow>
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 md:col-span-2">
            Recuerda ingresar el número de identificación <strong>sin el dígito de verificación</strong>; este será
            calculado de forma automática.
          </div>
          <FieldRow label="Tipo identificación">
            <select className={selectClass} value={tipoIdentificacion} onChange={(e) => setTipoIdentificacion(e.target.value)}>
              {TIPOS_IDENTIFICACION.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </FieldRow>
          <FieldRow label="Identificación">
            <input className={inputClass} value={identificacion} onChange={(e) => setIdentificacion(e.target.value)} />
          </FieldRow>
          <FieldRow label="Dígito verificación">
            <input
              className={`${inputClass} max-w-[120px]`}
              value={digitoVerificacion}
              onChange={(e) => setDigitoVerificacion(e.target.value)}
            />
          </FieldRow>
          <FieldRow label="Nombre comercial">
            <input className={inputClass} value={nombreComercial} onChange={(e) => setNombreComercial(e.target.value)} />
            <label className="mt-2 flex cursor-pointer items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={mostrarNombreComercialComprobantes}
                onChange={(e) => setMostrarNombreComercialComprobantes(e.target.checked)}
                className="mt-0.5 rounded border-gray-300 text-primary-600"
              />
              Mostrar en representación gráfica de comprobantes electrónicos
            </label>
          </FieldRow>
          <p className="text-xs text-gray-500 md:pl-[calc(240px+1rem)]">
            El logo en documentos y facturas es el <strong>logo principal</strong> de la organización (único para todos los
            puntos de venta). No se configura un archivo distinto aquí.
          </p>
        </CollapsibleSection>

        <CollapsibleSection
          title="Ubicación y contacto"
          open={openDatosUbicacion}
          onToggle={() => setOpenDatosUbicacion((o) => !o)}
        >
          <FieldRow label="Ciudad">
            <select className={selectClass} value={ciudad} onChange={(e) => setCiudad(e.target.value)}>
              {CIUDADES_CO.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </FieldRow>
          <FieldRow
            label="Código postal"
            hint={
              <a href="https://visor.codigopostal.gov.co/" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
                Consultar códigos postales
              </a>
            }
          >
            <input className={inputClass} value={codigoPostal} onChange={(e) => setCodigoPostal(e.target.value)} />
          </FieldRow>
          <FieldRow label="Dirección">
            <input className={inputClass} value={direccion} onChange={(e) => setDireccion(e.target.value)} />
          </FieldRow>
          <FieldRow label="Tipo de régimen IVA">
            <select className={selectClass} value={tipoRegimenIva} onChange={(e) => setTipoRegimenIva(e.target.value)}>
              {REGIMEN_IVA.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </FieldRow>
          <FieldRow label="Correo contacto">
            <input
              type="email"
              className={inputClass}
              value={correoContacto}
              onChange={(e) => setCorreoContacto(e.target.value)}
            />
          </FieldRow>
          <FieldRow label="Contacto">
            <input className={inputClass} value={contacto} onChange={(e) => setContacto(e.target.value)} />
          </FieldRow>
          <FieldRow label="Página WEB">
            <input type="url" className={inputClass} value={paginaWeb} onChange={(e) => setPaginaWeb(e.target.value)} placeholder="https://" />
          </FieldRow>
          <FieldRow label="Teléfono">
            <div className="flex flex-wrap gap-2">
              <input
                className={`${inputClass} w-20`}
                value={telPais}
                onChange={(e) => setTelPais(e.target.value)}
                aria-label="Indicativo país"
              />
              <input
                className={`${inputClass} min-w-[140px] flex-1`}
                value={telNumero}
                onChange={(e) => setTelNumero(e.target.value)}
                placeholder="Número"
              />
              <input
                className={`${inputClass} w-24`}
                value={telExt}
                onChange={(e) => setTelExt(e.target.value)}
                placeholder="Ext"
              />
            </div>
          </FieldRow>
          <FieldRow label="Cobrador por defecto">
            <div className="flex flex-wrap gap-2">
              <select className={`${selectClass} max-w-[140px]`} value={cobradorTipo} onChange={(e) => setCobradorTipo(e.target.value)}>
                <option value="Usuario">Usuario</option>
                <option value="Tercero">Tercero</option>
              </select>
              <input
                className={`${inputClass} min-w-[200px] flex-1`}
                value={cobradorNombre}
                onChange={(e) => setCobradorNombre(e.target.value)}
                placeholder="Nombre del cobrador"
              />
            </div>
          </FieldRow>
        </CollapsibleSection>

        <CollapsibleSection
          title="Datos tributarios"
          open={openTributarios}
          onToggle={() => setOpenTributarios((o) => !o)}
        >
          <FieldRow label="Código actividad económica">
            <select className={selectClass} value={codigoActividad} onChange={(e) => setCodigoActividad(e.target.value)}>
              {ACTIVIDAD_ECONOMICA.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </FieldRow>
          <FieldRow label="Tarifa ICA">
            <input className={inputClass} value={tarifaIca} onChange={(e) => setTarifaIca(e.target.value)} placeholder="%" />
          </FieldRow>
          <FieldRow label="">
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={manejaAIU} onChange={(e) => setManejaAIU(e.target.checked)} className="rounded border-gray-300 text-primary-600" />
                Maneja AIU
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={dosImpuestosCargos}
                  onChange={(e) => setDosImpuestosCargos(e.target.checked)}
                  className="rounded border-gray-300 text-primary-600"
                />
                Utilizo dos impuestos cargos en la factura de venta, doc. de ingreso y factura de compra
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={agenteRetenedorIva}
                  onChange={(e) => setAgenteRetenedorIva(e.target.checked)}
                  className="rounded border-gray-300 text-primary-600"
                />
                Es agente retenedor del impuesto sobre las ventas IVA
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={impuestoAdValorem}
                  onChange={(e) => setImpuestoAdValorem(e.target.checked)}
                  className="rounded border-gray-300 text-primary-600"
                />
                Maneja impuesto Ad-Valorem (para industrias de licores)
              </label>
            </div>
          </FieldRow>
          <FieldRow label="Responsabilidades fiscales">
            <div className="flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-gray-50/50 p-3">
              {RESP_FISCAL_OPTS.map((opt) => (
                <label key={opt} className="inline-flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={respFiscal.includes(opt)}
                    onChange={() => toggleEnLista(respFiscal, setRespFiscal, opt)}
                    className="rounded border-gray-300 text-primary-600"
                  />
                  {opt}
                </label>
              ))}
            </div>
          </FieldRow>
          <FieldRow label="Tributos">
            <div className="flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-gray-50/50 p-3">
              {TRIBUTOS_OPTS.map((opt) => (
                <label key={opt} className="inline-flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={tributos.includes(opt)}
                    onChange={() => toggleEnLista(tributos, setTributos, opt)}
                    className="rounded border-gray-300 text-primary-600"
                  />
                  {opt}
                </label>
              ))}
            </div>
          </FieldRow>
        </CollapsibleSection>

        <CollapsibleSection
          title="Moneda extranjera"
          open={openMonedaExt}
          onToggle={() => setOpenMonedaExt((o) => !o)}
        >
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={manejaMonedaExtranjera}
              onChange={(e) => setManejaMonedaExtranjera(e.target.checked)}
              className="rounded border-gray-300 text-primary-600"
            />
            Maneja moneda extranjera
          </label>
        </CollapsibleSection>

        <CollapsibleSection
          title="Datos del representante legal"
          open={openRepresentante}
          onToggle={() => setOpenRepresentante((o) => !o)}
        >
          <FieldRow label="Nombres">
            <input className={inputClass} value={repNombres} onChange={(e) => setRepNombres(e.target.value)} />
          </FieldRow>
          <FieldRow label="Apellidos">
            <input className={inputClass} value={repApellidos} onChange={(e) => setRepApellidos(e.target.value)} />
          </FieldRow>
          <FieldRow label="Tipo identificación">
            <select className={selectClass} value={repTipoId} onChange={(e) => setRepTipoId(e.target.value)}>
              {TIPOS_IDENTIFICACION.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </FieldRow>
          <FieldRow label="Identificación">
            <input className={inputClass} value={repIdentificacion} onChange={(e) => setRepIdentificacion(e.target.value)} />
          </FieldRow>
          <FieldRow label="¿Tienes socios en la empresa?">
            <div className="flex gap-4">
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="socios"
                  checked={tieneSocios === "si"}
                  onChange={() => setTieneSocios("si")}
                  className="text-primary-600"
                />
                Sí
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="socios"
                  checked={tieneSocios === "no"}
                  onChange={() => setTieneSocios("no")}
                  className="text-primary-600"
                />
                No
              </label>
            </div>
          </FieldRow>
        </CollapsibleSection>
      </div>
    </div>
  );
}

/** Datos del formulario «Datos de la empresa» → Firestore `users/{uid}.posPerfilOrganizacion`. */

export interface PosPerfilOrganizacionRepresentante {
  nombres: string;
  apellidos: string;
  tipoIdentificacion: string;
  identificacion: string;
  tieneSocios: "si" | "no";
}

export interface PosPerfilOrganizacionTelefono {
  pais: string;
  numero: string;
  ext: string;
}

export interface PosPerfilOrganizacionDatos {
  tipoRazon: "persona" | "empresa";
  nombres: string;
  apellidos: string;
  serial: string;
  tipoIdentificacion: string;
  identificacion: string;
  digitoVerificacion: string;
  nombreComercial: string;
  mostrarNombreComercialComprobantes: boolean;
  ciudad: string;
  codigoPostal: string;
  direccion: string;
  tipoRegimenIva: string;
  correoContacto: string;
  contacto: string;
  paginaWeb: string;
  telefono: PosPerfilOrganizacionTelefono;
  cobradorTipo: string;
  cobradorNombre: string;
  codigoActividad: string;
  tarifaIca: string;
  manejaAIU: boolean;
  dosImpuestosCargos: boolean;
  agenteRetenedorIva: boolean;
  impuestoAdValorem: boolean;
  respFiscal: string[];
  tributos: string[];
  manejaMonedaExtranjera: boolean;
  representante: PosPerfilOrganizacionRepresentante;
}

export function emptyPosPerfilOrganizacion(): PosPerfilOrganizacionDatos {
  return {
    tipoRazon: "persona",
    nombres: "",
    apellidos: "",
    serial: "01020525549412",
    tipoIdentificacion: "Cédula de ciudadanía",
    identificacion: "",
    digitoVerificacion: "",
    nombreComercial: "",
    mostrarNombreComercialComprobantes: false,
    ciudad: "Puerto Asís",
    codigoPostal: "000000",
    direccion: "",
    tipoRegimenIva: "003 - No responsable de IVA",
    correoContacto: "",
    contacto: "",
    paginaWeb: "",
    telefono: { pais: "57", numero: "", ext: "" },
    cobradorTipo: "Usuario",
    cobradorNombre: "",
    codigoActividad: "6920 - Actividades de contabilidad, teneduría de libros y auditoría",
    tarifaIca: "",
    manejaAIU: false,
    dosImpuestosCargos: false,
    agenteRetenedorIva: false,
    impuestoAdValorem: false,
    respFiscal: ["No aplica - Otros"],
    tributos: ["Nombre de la figura tributaria"],
    manejaMonedaExtranjera: false,
    representante: {
      nombres: "",
      apellidos: "",
      tipoIdentificacion: "Cédula de ciudadanía",
      identificacion: "",
      tieneSocios: "no",
    },
  };
}

function asStr(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : v != null ? String(v) : fallback;
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/** Fusiona JSON de Firestore con valores por defecto (versiones nuevas del formulario). */
export function mergePosPerfilOrganizacion(raw: unknown): PosPerfilOrganizacionDatos {
  const e = emptyPosPerfilOrganizacion();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return e;
  const r = raw as Record<string, unknown>;
  const rep =
    r.representante && typeof r.representante === "object" && !Array.isArray(r.representante)
      ? (r.representante as Record<string, unknown>)
      : {};
  const tel =
    r.telefono && typeof r.telefono === "object" && !Array.isArray(r.telefono)
      ? (r.telefono as Record<string, unknown>)
      : {};

  const respFiscal = Array.isArray(r.respFiscal) ? r.respFiscal.map((x) => String(x)).filter(Boolean) : e.respFiscal;
  const tributos = Array.isArray(r.tributos) ? r.tributos.map((x) => String(x)).filter(Boolean) : e.tributos;

  return {
    tipoRazon: r.tipoRazon === "empresa" ? "empresa" : "persona",
    nombres: asStr(r.nombres, e.nombres),
    apellidos: asStr(r.apellidos, e.apellidos),
    serial: asStr(r.serial, e.serial),
    tipoIdentificacion: asStr(r.tipoIdentificacion, e.tipoIdentificacion),
    identificacion: asStr(r.identificacion, e.identificacion),
    digitoVerificacion: asStr(r.digitoVerificacion, e.digitoVerificacion),
    nombreComercial: asStr(r.nombreComercial, e.nombreComercial),
    mostrarNombreComercialComprobantes: asBool(r.mostrarNombreComercialComprobantes, e.mostrarNombreComercialComprobantes),
    ciudad: asStr(r.ciudad, e.ciudad),
    codigoPostal: asStr(r.codigoPostal, e.codigoPostal),
    direccion: asStr(r.direccion, e.direccion),
    tipoRegimenIva: asStr(r.tipoRegimenIva, e.tipoRegimenIva),
    correoContacto: asStr(r.correoContacto, e.correoContacto),
    contacto: asStr(r.contacto, e.contacto),
    paginaWeb: asStr(r.paginaWeb, e.paginaWeb),
    telefono: {
      pais: asStr(tel.pais, e.telefono.pais),
      numero: asStr(tel.numero, e.telefono.numero),
      ext: asStr(tel.ext, e.telefono.ext),
    },
    cobradorTipo: asStr(r.cobradorTipo, e.cobradorTipo),
    cobradorNombre: asStr(r.cobradorNombre, e.cobradorNombre),
    codigoActividad: asStr(r.codigoActividad, e.codigoActividad),
    tarifaIca: asStr(r.tarifaIca, e.tarifaIca),
    manejaAIU: asBool(r.manejaAIU, e.manejaAIU),
    dosImpuestosCargos: asBool(r.dosImpuestosCargos, e.dosImpuestosCargos),
    agenteRetenedorIva: asBool(r.agenteRetenedorIva, e.agenteRetenedorIva),
    impuestoAdValorem: asBool(r.impuestoAdValorem, e.impuestoAdValorem),
    respFiscal: respFiscal.length ? respFiscal : e.respFiscal,
    tributos: tributos.length ? tributos : e.tributos,
    manejaMonedaExtranjera: asBool(r.manejaMonedaExtranjera, e.manejaMonedaExtranjera),
    representante: {
      nombres: asStr(rep.nombres, e.representante.nombres),
      apellidos: asStr(rep.apellidos, e.representante.apellidos),
      tipoIdentificacion: asStr(rep.tipoIdentificacion, e.representante.tipoIdentificacion),
      identificacion: asStr(rep.identificacion, e.representante.identificacion),
      tieneSocios: rep.tieneSocios === "si" ? "si" : "no",
    },
  };
}

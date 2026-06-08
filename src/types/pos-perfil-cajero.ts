/** Datos del formulario «Perfil del cajero» (Firestore `users/{uid}.posPerfilCajero` + localStorage). */
export interface CajeroFichaDatos {
  nombres: string;
  apellidos: string;
  tipoDocumento: string;
  numeroDocumento: string;
  fechaNacimiento: string;
  genero: string;
  correo: string;
  celular: string;
  telefonoFijo: string;
  direccion: string;
  ciudad: string;
  contactoEmergenciaNombre: string;
  contactoEmergenciaTelefono: string;
  contactoEmergenciaParentesco: string;
  tieneHijos: "" | "si" | "no";
  numeroHijos: string;
  observacionesHijos: string;
  fechaIngreso: string;
  cargo: string;
  observaciones: string;
}

/** Cargos permitidos al registrar un operador en el POS. */
export const CARGO_OPERADOR_OPCIONES = ["Cajero(a)", "Franquiciado"] as const;

export type CargoOperador = (typeof CARGO_OPERADOR_OPCIONES)[number];

export function cargoOperadorValido(cargo: string): cargo is CargoOperador {
  return (CARGO_OPERADOR_OPCIONES as readonly string[]).includes(cargo);
}

export function emptyCajeroFicha(): CajeroFichaDatos {
  return {
    nombres: "",
    apellidos: "",
    tipoDocumento: "Cédula de ciudadanía",
    numeroDocumento: "",
    fechaNacimiento: "",
    genero: "",
    correo: "",
    celular: "",
    telefonoFijo: "",
    direccion: "",
    ciudad: "",
    contactoEmergenciaNombre: "",
    contactoEmergenciaTelefono: "",
    contactoEmergenciaParentesco: "",
    tieneHijos: "",
    numeroHijos: "",
    observacionesHijos: "",
    fechaIngreso: "",
    cargo: "Cajero(a)",
    observaciones: "",
  };
}

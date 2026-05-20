/** Medios de pago por transferencia configurables por punto de venta (pedidos web/QR). */
export type MedioTransferenciaId = "nequi" | "bancolombia" | "daviplata" | "llave";

export type MediosTransferenciaConfig = Record<MedioTransferenciaId, string>;

export const MEDIOS_TRANSFERENCIA_IDS: MedioTransferenciaId[] = [
  "nequi",
  "bancolombia",
  "daviplata",
  "llave",
];

export const ETIQUETAS_MEDIO_TRANSFERENCIA: Record<MedioTransferenciaId, string> = {
  nequi: "Nequi",
  bancolombia: "Cuenta Bancolombia",
  daviplata: "Daviplata",
  llave: "Llave",
};

export const MEDIOS_TRANSFERENCIA_VACIOS: MediosTransferenciaConfig = {
  nequi: "",
  bancolombia: "",
  daviplata: "",
  llave: "",
};

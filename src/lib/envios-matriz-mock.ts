import { ymdColombia } from "@/lib/fecha-colombia";
import type {
  EnvioMatrizDetalleData,
  EnvioMatrizDetalleResponse,
  EnvioMatrizListadoResponse,
  LineaEnvioMatriz,
} from "@/types/envios-matriz";

const MOCK_PV = "CC Altavista Usme";

const MOCK_LINEAS: LineaEnvioMatriz[] = [
  { sku: "INS-001", descripcion: "Insumo demo A", cantidadDespachada: 24 },
  { sku: "INS-002", descripcion: "Insumo demo B", cantidadDespachada: 12 },
];

const MOCK_ENVIO_ID = "mock-envio-firestore-id-1";

export function mockListadoPendiente(): EnvioMatrizListadoResponse {
  return {
    ok: true,
    pendientes: 1,
    puntoVenta: MOCK_PV,
    data: [
      {
        id: MOCK_ENVIO_ID,
        estado: "PENDIENTE_RECEPCION",
        idDespacho: "DESP-MOCK-001",
        puntoVentaDestino: MOCK_PV,
        fechaDespacho: ymdColombia(),
        lineas: MOCK_LINEAS,
        raw: {},
      },
    ],
  };
}

export function mockListadoHistorial(estado: string): EnvioMatrizListadoResponse {
  if (estado === "pendiente") return mockListadoPendiente();
  return {
    ok: true,
    pendientes: 0,
    puntoVenta: MOCK_PV,
    data: [
      {
        id: "mock-envio-recibido-2",
        estado: "RECIBIDO",
        idDespacho: "DESP-MOCK-000",
        puntoVentaDestino: MOCK_PV,
        fechaDespacho: "2026-03-20",
        lineas: [{ sku: "INS-099", descripcion: "Histórico demo", cantidadDespachada: 5 }],
        raw: {},
      },
    ],
  };
}

export function mockDetalle(id: string): EnvioMatrizDetalleResponse {
  if (id !== MOCK_ENVIO_ID && !id.startsWith("mock-envio")) {
    return { ok: false, message: "Envío no encontrado (mock)." };
  }
  const data: EnvioMatrizDetalleData = {
    id: id === MOCK_ENVIO_ID ? MOCK_ENVIO_ID : id,
    estado: id.includes("recibido") ? "RECIBIDO" : "PENDIENTE_RECEPCION",
    idDespacho: "DESP-MOCK-001",
    puntoVentaDestino: MOCK_PV,
    fechaDespacho: ymdColombia(),
    lineas: MOCK_LINEAS,
    raw: {},
  };
  return { ok: true, data };
}

export async function mockRecepcion(): Promise<{ ok: boolean; message?: string }> {
  await new Promise((r) => setTimeout(r, 400));
  return { ok: true, message: "Recepción registrada (simulación)." };
}

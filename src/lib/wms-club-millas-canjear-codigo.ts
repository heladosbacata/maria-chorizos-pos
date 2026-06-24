const PATH = "/api/pos_club_millas_canjear_codigo";

export type ClubMillasProductoCanjePos = {
  sku: string;
  skuBarcode?: string;
  skuProducto?: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  precioVenta?: number;
  total?: number;
  categoria?: string | null;
  imagenUrl?: string | null;
  tituloPremio?: string;
};

export type ClubMillasCodigoCanje = {
  ok: true;
  codigo: string;
  estado: string;
  pedidoId: string;
  puntoReclamo: string;
  productosPos: ClubMillasProductoCanjePos[];
  lineasFacturacion: ClubMillasProductoCanjePos[];
};

export type ClubMillasCodigoError = {
  ok: false;
  error: string;
  usado?: boolean;
  puntoReclamo?: string;
};

async function parseResponse(res: Response): Promise<ClubMillasCodigoCanje | ClubMillasCodigoError> {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.ok !== true) {
    return {
      ok: false,
      error: String(data.error ?? `Error ${res.status}`),
      usado: data.usado === true,
      puntoReclamo: typeof data.puntoReclamo === "string" ? data.puntoReclamo : undefined,
    };
  }
  const productos = Array.isArray(data.productosPos) ? (data.productosPos as ClubMillasProductoCanjePos[]) : [];
  return {
    ok: true,
    codigo: String(data.codigo ?? ""),
    estado: String(data.estado ?? ""),
    pedidoId: String(data.pedidoId ?? ""),
    puntoReclamo: String(data.puntoReclamo ?? ""),
    productosPos: productos,
    lineasFacturacion: Array.isArray(data.lineasFacturacion)
      ? (data.lineasFacturacion as ClubMillasProductoCanjePos[])
      : productos,
  };
}

export async function consultarCodigoClubMillasPos(
  idToken: string,
  codigo: string
): Promise<ClubMillasCodigoCanje | ClubMillasCodigoError> {
  const t = idToken.trim();
  if (!t) return { ok: false, error: "Sin sesión POS." };
  const code = codigo.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  if (code.length !== 4) return { ok: false, error: "El código debe tener 4 caracteres." };
  try {
    const res = await fetch(`${PATH}?codigo=${encodeURIComponent(code)}`, {
      method: "GET",
      cache: "no-store",
      headers: { Authorization: `Bearer ${t}`, Accept: "application/json" },
    });
    return parseResponse(res);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red." };
  }
}

export async function confirmarCanjeCodigoClubMillasPos(
  idToken: string,
  body: { codigo: string; ventaLocalId?: string | null; numeroFactura?: string | null }
): Promise<ClubMillasCodigoCanje | ClubMillasCodigoError> {
  const t = idToken.trim();
  if (!t) return { ok: false, error: "Sin sesión POS." };
  try {
    const res = await fetch(PATH, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${t}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return parseResponse(res);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red." };
  }
}


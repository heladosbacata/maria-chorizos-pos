# API PyG POS → app franquiciados

Fuente oficial del módulo **PyG del punto de venta** (Espacio franquiciados en `/caja`).

## Endpoint

```
GET https://pos.mariachorizos.com/api/pos/pyg
```

### Query

| Parámetro | Obligatorio | Descripción |
|-----------|-------------|-------------|
| `puntoVenta` | No* | Default = PV del token. Solo otro PV si admin (`POS_PYG_ADMIN_UIDS` o role `admin` / `wms_admin` / `superadmin`). |
| `desde` | No | `YYYY-MM-DD` (default: 1° del mes Colombia). |
| `hasta` | No | `YYYY-MM-DD` (default: hoy Colombia). Máx. ventana ~120 días. |
| `rentaMensual` | No | COP/mes. En el POS vive en `localStorage`; si no se envía → `0`. |
| `personalMensual` | No | COP/mes. Si no se envía → `2_000_000` (mismo default del panel). |
| `comparativo` | No | `0`/`false` para omitir periodo anterior. |

\*Si se envía, debe coincidir con el PV de la sesión (salvo admin).

### Auth

```
Authorization: Bearer <Firebase ID token>
```

Requiere `FIREBASE_SERVICE_ACCOUNT_JSON` en Vercel (igual que `pos_ventas_cloud`).

## Cálculo (idéntico al POS)

`calcularPygSimplificado` en `src/lib/pyg-simplificado.ts`:

- Ventas = suma `total` de tickets vigentes en `posVentasCloud` (`anulada !== true`)
- Insumos = **44%** de ventas
- Renta y personal mensuales **prorrateados** por días del periodo
- Otros fijos mensuales: internet 35k + aseo 200k + publicidad 100k (prorrateados)
- Utilidad = margen bruto − renta − personal − otros fijos

UI de referencia: `PygFranquiciaPanel` + `PygTablaSencilla`.

## Campos de respuesta

Obligatorios útiles para la app: `puntoVenta`, `periodo`, `ventasBrutas`/`ventasNetas`, `costoInsumos`, `gastosOperativos`, `utilidadBruta`/`utilidadNeta`, `margenBruto`/`margenNeto` (%), `ticketPromedio`, `numeroTransacciones`, `detalle[]`, `alertas[]`, `calculo` (nativo POS), `limitaciones[]`.

Siempre `0` hoy (el PyG simplificado no los desglosa): `descuentos`, `domicilios`, `comisiones`, `impuestos`.

## Ejemplo (Punto Demo App)

```http
GET /api/pos/pyg?puntoVenta=Punto%20Demo%20App&desde=2026-09-01&hasta=2026-09-08&rentaMensual=3500000&personalMensual=2000000
Authorization: Bearer …
```

```json
{
  "ok": true,
  "puntoVenta": "Punto Demo App",
  "periodo": { "desde": "2026-09-01", "hasta": "2026-09-08", "diasOperando": 8, "diasDelMesRef": 30 },
  "ventasBrutas": 12500000,
  "descuentos": 0,
  "ventasNetas": 12500000,
  "costoProducto": 5500000,
  "costoInsumos": 5500000,
  "gastosOperativos": 1586667,
  "rentaPeriodo": 933333,
  "personalPeriodo": 533333,
  "otrosGastosFijosPeriodo": 120000,
  "domicilios": 0,
  "comisiones": 0,
  "impuestos": 0,
  "utilidadBruta": 7000000,
  "utilidadNeta": 5413333,
  "margenBruto": 56,
  "margenNeto": 43.3,
  "ticketPromedio": 89000,
  "numeroTransacciones": 140,
  "parametros": {
    "rentaMensual": 3500000,
    "personalMensual": 2000000,
    "porcentajeInsumos": 0.44,
    "fuenteIngresos": "posVentasCloud"
  },
  "detalle": [ { "concepto": "1. Ventas en este periodo", "valor": 12500000 } ],
  "comparativoPeriodoAnterior": { "ventasNetas": 11000000, "deltaVentas": 1500000 },
  "alertas": [ { "codigo": "utilidad_positiva", "nivel": "ok", "mensaje": "…" } ],
  "limitaciones": [ "…" ]
}
```

(Los montos del ejemplo son ilustrativos; en producción salen de `posVentasCloud`.)

## Índices Firestore

Consulta: `posVentasCloud` donde `puntoVenta` + `fechaYmd` rango + `orderBy fechaYmd`.  
Si falta el compuesto, la consola de Firebase sugerirá el link al crear el índice (mismo patrón que reportes de ventas cloud).

## Reglas

La API usa **Admin SDK** (bypass reglas cliente). No hace falta regla nueva para este endpoint.  
Lectura cliente directa de `posVentasCloud` sigue las reglas ya publicadas.

## Archivos

- `pages/api/pos/pyg.ts` — ruta HTTP
- `src/lib/pyg-api-contrato.ts` — armado JSON + ingresos
- `src/lib/pyg-simplificado.ts` — fórmula (sin cambios de negocio)
- `src/components/PygFranquiciaPanel.tsx` / `PygTablaSencilla.tsx` — UI de referencia

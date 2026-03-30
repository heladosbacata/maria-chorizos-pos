# Catálogo de productos desde el WMS

El catálogo de productos para vender en el POS **no es una lista local**: se carga desde el WMS mediante una API.

## Variable de entorno

Debe existir **`NEXT_PUBLIC_WMS_URL`**:

- **Desarrollo**: `http://localhost:3002` (o la URL donde corra el WMS en tu máquina).
- **Producción**: `https://maria-chorizos-wms.vercel.app`

Configurarla en `.env.local` y en Vercel (variables de entorno del proyecto POS). Ver `.env.example` como referencia.

## Endpoint del catálogo

El POS hace **GET** a:

```
[NEXT_PUBLIC_WMS_URL]/api/pos/productos/listar
```

En este repo la llamada puede ir directa al WMS o a través del proxy `/api/catalogo` del propio POS (que a su vez llama al WMS) para evitar problemas de CORS si el WMS no permite aún el origen del POS.

## Respuesta esperada

```json
{
  "ok": true,
  "data": [ ... ],
  "productos": [ ... ]
}
```

`data` y `productos` son el mismo array; el POS usa cualquiera de los dos.

## Campos de cada producto

Cada elemento del array puede tener (nombres aceptados):

| Campo           | Alternativas           | Uso en POS      |
|----------------|------------------------|-----------------|
| Identificador  | `sku`, `skuBarcode`, `skuProductoFinal` | Código del producto |
| `descripcion`  | —                      | Nombre a mostrar |
| `categoria`    | opcional               | Filtro / etiqueta |
| `precioUnitario` | —                    | Precio de venta (COP) |
| `unidad`       | opcional               | Ej. "und", "kg" |
| `urlImagen`    | opcional               | URL de la foto  |

## CORS

El WMS debe permitir peticiones desde el origen del POS. Si ya está configurado en el WMS, no hace falta configurar CORS en el POS.

## Contrato detallado en el WMS

El contrato detallado de la API (ej. códigos de error, autenticación, filtros) está documentado en el repositorio del WMS en:

**`docs/POS-CATALOGO-WMS.md`**

## Dónde se usa en el POS

La pantalla de venta (módulo **Ventas e ingresos** en `/caja`) carga el catálogo al entrar en ese módulo y muestra los productos con **imagen**, **descripción** y **precio**. Hay búsqueda por código, descripción o categoría.

## Descuento de inventario por ensamble (tras cada cobro)

Tras confirmar la venta, el POS llama al WMS:

`POST [NEXT_PUBLIC_WMS_URL]/api/pos/inventario/aplicar-venta-ensamble` (vía proxy **`/api/pos_aplicar_venta_ensamble`** en el servidor Next, que reenvía `Authorization: Bearer <Firebase idToken>`).

Cuerpo JSON que envía el POS (resumen):

- `lineas[]`: cada ítem incluye `skuProducto` (id compuesto con `|chorizo:…|arepa:…` si aplica), `cantidad` (entero ≥ 1), **`sku`** (base catálogo), y cuando hay modal de variantes también **`varianteChorizo`**, **`varianteArepaCombo`** y el array **`variantes`** (`["chorizo:tradicional"]`, etc.) para que el WMS pueda cruzar con la hoja aunque no parsee el string compuesto.
- **`puntoVenta`**: código del punto (**mismo** que `users/{uid}.puntoVenta` del cajero en Firebase); el WMS debe validarlo y escribir **ese** valor en los documentos de Firestore.
- **`idVenta`**: id de ticket local (idempotencia en el WMS, p. ej. `pos_inventario_ensamble_venta_idem`).

### Firestore que escribe el WMS (ensamble)

El POS **lee** el stock en pantalla Inventarios fusionando:

| Colección | Uso |
|-----------|-----|
| **`pos_inventario_ensamble_saldo`** | Saldos actualizados por el WMS al aplicar ensamble (prevalece sobre legacy si el mismo `insumoId` existe en ambas). |
| **`pos_inventario_ensamble_movimientos`** | Movimientos por línea de descuento (`tipo` p. ej. `venta_ensamble`). |
| **`posInventarioSaldos`** | Legacy: cargue y ajustes hechos **desde el POS**; sigue siendo fuente si no hay fila ensamble para ese insumo. |

Código en el repo: `src/lib/inventario-pos-firestore.ts` (`listarSaldosInventarioPorPuntoVenta`, `listarMovimientosInventario`). Query de saldos: `where("puntoVenta", "==", pv)` en cada colección. **Merge en cliente:** por clave de kit (`claveParaConsolidarSaldoKit`): prioriza `insumoSku` y, en hoja Google, el sufijo tras prefijos `sheet-` / `gs-` en `insumoId`, para que el saldo del WMS (`insumoId` = `FRAN-KIT-*`) reemplace al legacy aunque el catálogo muestre `id` tipo `sheet-fran-kit-*`.

El WMS debe resolver la composición (**DB_POS_Composición** / BOM) y escribir en **`pos_inventario_ensamble_*`** con **`insumoId` / `insumoSku` alineados al catálogo kit** (`DB_Franquicia_Insumos_Kit`). Reglas de ejemplo para lectura cliente: `firestore.rules.example`.

Pruebas unitarias del armado de líneas hacia el WMS: `npm run test` (`src/lib/wms-aplicar-venta-ensamble.test.ts`).

Más checklist de inventario y reglas: `docs/CHECKLIST_INVENTARIO.md`.

### Error HTTP 500: transacción Firestore en el WMS

Si el diagnóstico muestra *«Firestore transactions require all reads to be executed before all writes»*, el arreglo es **solo en el WMS** (reordenar `get` antes de `set` en `aplicar-venta-ensamble`). Ver **`docs/WMS-ENSAMBLE-TRANSACCION-FIRESTORE.md`**.

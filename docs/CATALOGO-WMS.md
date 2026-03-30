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

`POST [NEXT_PUBLIC_WMS_URL]/api/pos/inventario/aplicar-venta-ensamble` (vía proxy `/api/pos_aplicar_venta_ensamble`).

Cuerpo JSON que envía el POS (resumen):

- `lineas[]`: cada ítem incluye `skuProducto` (id compuesto con `|chorizo:…|arepa:…` si aplica), `cantidad` (entero ≥ 1), **`sku`** (base catálogo), y cuando hay modal de variantes también **`varianteChorizo`**, **`varianteArepaCombo`** y el array **`variantes`** (`["chorizo:tradicional"]`, etc.) para que el WMS pueda cruzar con la hoja aunque no parsee el string compuesto.
- **`puntoVenta`**: código del punto (mismo que el perfil del cajero); el WMS debe usarlo para descontar en `posInventarioSaldos`.
- `idVenta`: id de ticket local (idempotencia).

El WMS debe resolver la composición (BOM) y actualizar Firestore. Pruebas unitarias del armado de líneas: `npm run test`.

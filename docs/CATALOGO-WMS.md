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

# Facturación electrónica POS (Alegra / DIAN vía WMS)

Instrucciones de arquitectura y contrato para Cursor y el equipo. La emisión **no** va del POS a Alegra directamente: el POS (web/Android) llama al **WMS** (`maria-chorizos-wms`, Next.js), que concentra credenciales e-provider Colombia, `POST /invoices`, resolución DIAN desde Google Sheets (`DB_ResolucionesDian` por NIT emisor del franquiciado) y el mismo motor que Facturación GEB (`buildEProviderInvoicePayload`, reglas FAJ43b/FAZ09, `standardCode` en ítems, etc.).

## Base URL

Usar la URL pública del WMS (p. ej. `NEXT_PUBLIC_WMS_URL` en el POS), **sin** barra final. Ejemplo: `https://<dominio-wms>.vercel.app`.

## CORS

El WMS solo responde a orígenes permitidos en `posBrowserCors` (localhost del POS, `maria-chorizos-pos.vercel.app`, etc.). Otro origen → añadir en el WMS (`POS_BROWSER_CORS_EXTRA_ORIGINS` u homólogo).

## Autenticación (obligatoria)

`Authorization: Bearer <Firebase ID token>` del usuario cajero POS (misma app Firebase que el POS). El WMS verifica con Firebase Admin, exige `users/{uid}` y usuario POS (`esUsuarioPos`). Si no: `401` / `403` / `404` según caso.

---

## 1) Configuración DIAN por cajero (Firestore)

Datos en `users/{uid}` (mismo proyecto Firebase que valida el WMS).

Campos (constantes en WMS `POS_DIAN_FIRESTORE`):

| Campo Firestore | Uso |
|-----------------|-----|
| `posDianEmisorNit` | NIT/cédula emisor del punto (prioritario). |
| `nitEmisor` | Fallback si no hay `posDianEmisorNit` (NIT perfil GEB del cajero). |
| `posDianAlegraCompanyId` | Id empresa en Alegra (`GET /companies`); opcional si una sola empresa con ese NIT. |
| `posDianFacturacionHabilitada` | `true` para permitir emitir; si `false`, el WMS responde `403`. |

**API WMS**

- `GET /api/pos/dian-config` — lee la config actual.
- `PUT /api/pos/dian-config` — body JSON: `{ "emisorNit", "alegraCompanyId", "habilitado" }`. No permitir habilitar sin NIT real (no consumidor final `222222222`).

El POS debe exponer pantalla tipo **«Habilitaciones DIAN»** que persista vía WMS y, opcionalmente, llame al **ping** antes de habilitar.

---

## 2) Comprobación previa (ping)

`GET /api/pos/alegra/ping-pos`

Mismos headers (`Authorization` + `Origin`).

**200 OK** típico: `{ ok: true, empresaAlegra, resolucion, notasDian[] }` — valida empresa Alegra para el NIT y fila de resolución en `DB_ResolucionesDian` para ese emisor.

Errores típicos: `paso: "emisor" | "alegra_company" | "resolucion"` con mensaje en `error`.

Uso: onboarding del franquiciado y **«Probar conexión DIAN»**.

---

## 3) Emisión de factura por cobro

`POST /api/pos/alegra/emitir-cobro`

Headers: `Content-Type: application/json`, `Authorization: Bearer …`, `Origin` del POS.

**Body JSON**

```json
{
  "fecha": "YYYY-MM-DD",
  "lineas": [
    {
      "descripcion": "texto línea",
      "sku": "opcional",
      "cantidad": 1,
      "montoConIva": 11900
    }
  ],
  "clienteNombre": "CONSUMIDOR FINAL o razón social",
  "clienteNit": "222222222 o NIT sin formato estricto",
  "clienteTipoIdentificacion": "opcional, ej. NIT",
  "observaciones": "opcional",
  "formaPago": "opcional, default Contado",
  "ventaLocalId": "opcional id venta local para trazabilidad"
}
```

**Reglas**

- `lineas` no vacío; cada línea: `descripcion`, `cantidad > 0`, `montoConIva > 0`.
- El WMS interpreta `montoConIva` como total línea con IVA y reparte base/IVA con tasa configurable (`ALEGRA_POS_IVA_TASA`, default `0.19`).
- Consecutivo: el WMS reserva el siguiente número en Firestore (`pos_dian_consecutivo` por `uid`), alineado al prefijo/rango de la resolución del NIT emisor en Sheets.

**200 OK**

```json
{
  "ok": true,
  "alegraDocId": "...",
  "alegraCufe": "...",
  "numeroFactura": "PREFIJO-CONSECUTIVO",
  "enviadoAt": "ISO..."
}
```

Errores: `502` / `4xx` con `{ ok: false, error, status?, alegra? }`.

---

## 4) Responsabilidades del POS (UI + flujo)

- Login Firebase del cajero.
- Pantalla config: `GET`/`PUT` dian-config vía WMS (no inventar otra ruta).
- Antes de emitir: si `!habilitado` o sin NIT emisor, no llamar `emitir-cobro`.
- Tras venta: armar `lineas` desde el carrito (`descripcion`, `cantidad`, total con IVA por línea según reglas de producto).
- Cliente: consumidor final → NIT genérico y nombre según reglas DIAN (el WMS puede normalizar `CONSUMIDOR FINAL` para NIT `222…`). Empresa → NIT y razón social; idealmente alineado con `DB_Clientes` en WMS para `registrationNameDian`.
- Manejar CORS y token expirado (renovar sesión y reintentar).
- Persistir localmente `numeroFactura`, `alegraCufe`, `alegraDocId`, `enviadoAt` en la venta/cierre para reimpresión y soporte.

---

## 5) Prerrequisitos en servidor WMS (no son del repo POS)

Variables/env en Vercel del WMS: `ALEGRA_COL_API_URL`, `ALEGRA_COL_TOKEN` y/o `ALEGRA_JWT_TOKEN`, y configuración de resolución (`DB_ResolucionesDian` por NIT emisor; en sandbox `ALEGRA_USE_ALANUBE_SANDBOX_RESOLUTION` o `ALEGRA_RESOLUTION_JSON` solo en pruebas).

Opcional FAJ43b emisor: `ALEGRA_COMPANY_LEGAL_NAME_DIAN`, `ALEGRA_DIAN_COMPANY_NAME_UPPERCASE`.

En Sheets debe existir fila de `DB_ResolucionesDian` para el NIT del franquiciado (prefijo, rango, fechas, `CLAVE_TECNICA_HEX`, `ALEGRA_COMPANY_ID` si aplica, `RAZON_SOCIAL_DIAN`).

---

## 6) Qué no debe hacer el POS

- No llamar a `sandbox-api.alegra.com` directamente con tokens del POS.
- No duplicar lógica de payload DIAN: delegar al WMS.
- No omitir `Authorization`; no usar otra API key fuera del flujo Firebase POS acordado.

**Criterio de hecho:** Desde el POS, con usuario POS habilitado y NIT/resolución correctos en Sheets, **ping OK** y **emitir-cobro** devuelve `ok: true` con `alegraCufe` y `numeroFactura`; errores Alegra se muestran con el `error` devuelto por el WMS.

---

## Implementación en este repo (`maria-chorizos-pos`)

| Rol | Ruta / archivo |
|-----|----------------|
| Cliente browser (token + JSON) | `src/lib/wms-pos-dian-client.ts` — `wmsPosDianConfigGet`, `wmsPosDianConfigPut`, `wmsPosAlegraPingPos`, `wmsPosAlegraEmitirCobro` |
| Proxies Next (mismo host que el POS; reenvían al WMS) | `pages/api/pos_dian_config.ts` → `GET/PUT {WMS}/api/pos/dian-config` |
| | `pages/api/pos_alegra_ping_pos.ts` → `GET {WMS}/api/pos/alegra/ping-pos` |
| | `pages/api/pos_alegra_emitir_cobro.ts` → `POST {WMS}/api/pos/alegra/emitir-cobro` |
| UI Habilitaciones DIAN | `src/components/PosDianFacturacionPanel.tsx` (p. ej. desde `ConfiguracionMasModule`) |
| Cobro con FE | `src/app/caja/page.tsx` — `wmsPosAlegraEmitirCobro` + cola `src/lib/pos-fe-retry-queue.ts` |

El POS **no** pega al WMS con URL absoluta desde el cliente en estos flujos: usa rutas **relativas** `/api/pos_*` del propio despliegue del POS, que el servidor reenvía al `getWmsPublicBaseUrl()`.

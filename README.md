# Maria Chorizos - POS

Aplicación de punto de venta para reportar ventas diarias. Se conecta al WMS existente para enviar los reportes.

## Requisitos

- Node.js 18+
- Cuenta Firebase (mismo proyecto que el WMS)
- URL del WMS desplegado

## Configuración

1. Copia `.env.example` a `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Completa las variables en `.env.local`:
   - **`NEXT_PUBLIC_WMS_URL`**: URL del WMS. Desarrollo: `http://localhost:3002` (o donde corra el WMS). Producción: `https://maria-chorizos-wms.vercel.app`. También configurarla en Vercel para el despliegue del POS.
   - Variables de Firebase (mismas que el WMS)

## Desarrollo

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Estructura

```
src/
├── app/
│   ├── caja/          # Dashboard de caja (reporte de ventas)
│   ├── chat/          # Chat con franquiciado y administración WMS
│   ├── login/         # Login + selector de punto de venta
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx       # Redirección según auth
├── context/
│   └── AuthContext.tsx # Firebase Auth + Firestore (puntoVenta)
├── lib/
│   ├── firebase.ts      # Config Firebase
│   ├── enviar-venta.ts  # POST al WMS
│   ├── catalogo-pos.ts   # GET /api/pos/productos/listar (WMS) — catálogo de venta
│   ├── chat-api.ts      # GET /api/chat/usuarios (WMS) para contactos
│   ├── chat-firestore.ts # Chat DM: getDmChatId, mensajes, userChats
│   └── puntos-venta.ts  # Lista quemada de puntos
└── types/
    └── index.ts
```

## Flujo

1. **Login**: Email/contraseña con Firebase Auth
2. **Punto de venta**: Se obtiene de Firestore `users/{uid}.puntoVenta`. Si no existe, el usuario selecciona de la lista quemada
3. **Dashboard**: Input de valor de venta del día → Enviar Reporte
4. **API**: POST a `[WMS_URL]/api/ventas/bulk-guardar` con `{ fecha, uen, ventas }`
5. **Chat**: En `/chat`, el cajero ve contactos (franquiciado de su punto de venta + admins WMS) vía `GET [WMS_URL]/api/chat/usuarios` con `Authorization: Bearer <ID_TOKEN>`. Los mensajes usan Firestore (`chats/{chatId}/messages`, `userChats/{uid}/chats`) igual que el WMS.
6. **Catálogo de productos para venta**: La pantalla de venta (módulo Ventas e ingresos) carga el catálogo desde el WMS con `GET [NEXT_PUBLIC_WMS_URL]/api/pos/productos/listar`. No hay lista local: la única fuente es esa API. Se muestran productos con imagen, descripción y precio. Ver [docs/CATALOGO-WMS.md](docs/CATALOGO-WMS.md) para variable de entorno, formato de respuesta y campos. El contrato detallado está en el repo del WMS en `docs/POS-CATALOGO-WMS.md`.

## Chat POS – requisitos en el WMS

El backend del WMS debe:

- **GET /api/chat/usuarios**: Si el usuario autenticado es POS (Firestore `users/{uid}.role === "pos"`), leer `users/{uid}.puntoVenta` y devolver solo (a) el franquiciado con ese mismo punto de venta y (b) usuarios administradores del WMS (mismo criterio que para el chat del WMS). Respuesta: `{ ok: true, usuarios: [{ uid, email, displayName, photoURL, puntoVenta?, esFranquiciado?, ... }] }`.
- **CORS**: Permitir el origen del POS (ej. `https://maria-chorizos-pos.vercel.app`) en la API de chat.

## Catálogo POS – requisitos en el WMS

En el WMS debe existir **GET /api/pos/productos/listar** con respuesta `{ ok: true, data: [...] }` o `{ ok: true, productos: [...] }`. Campos por ítem: `sku`/`skuBarcode`/`skuProductoFinal`, `descripcion`, `categoria` (opcional), `precioUnitario`, `unidad` (opcional), `urlImagen` (opcional). El contrato detallado está en el repo del WMS en **`docs/POS-CATALOGO-WMS.md`**. El WMS debe permitir CORS desde el origen del POS; no se configura CORS en el POS.

## Usuarios POS y contrato (WMS → POS)

El contrato del cajero vive en Firestore (por usuario), no por organización.

- **Ruta WMS**: `GET /api/pos/usuarios/registrados`
- **Base URL**: la misma que **`NEXT_PUBLIC_WMS_URL`** (desarrollo típico `http://localhost:3002`; producción el Vercel del WMS, p. ej. `https://maria-chorizos-wms.vercel.app`). Si el dominio de producción del WMS cambia, solo hay que actualizar esa variable en el POS (Vercel / `.env.local`).
- **Auth**: `Authorization: Bearer <ID token Firebase>` del usuario que inicia sesión en el POS (mismo proyecto Firebase que valida el WMS para usuarios POS).
- **Proxy en el POS**: `GET /api/usuarios_pos_listar` reenvía el Bearer al WMS.
- **Respuesta OK (200)**: `{ ok: true, usuarios: [ { ... } ] }` — en la práctica suele ser **un solo** elemento (el usuario autenticado). Campos que el POS normaliza: `email`, `uid`, `puntoVenta`, `fechaInicio`, `fechaVencimiento` (ISO), `contratoNombre`, `contratoFechaInicio`, `contratoFechaVencimiento`, `referenciaContrato`, `numeroContrato` (pueden ser `null` si no están en Firestore), `diasRestantes`.
- **Errores**: `401` sin token o token inválido; `403` si la cuenta no es usuario POS; `404` si no hay documento en `users`.
- **CORS**: el WMS debe permitir el origen del POS (`https://maria-chorizos-pos.vercel.app`, localhost del POS, etc.); si falla, confirmar el origen exacto en el WMS.

Estructura Firestore (compartida con el WMS):

- `chats/{chatId}/messages` con `text`, `senderId`, `createdAt` (serverTimestamp).
- `chatId` = `getDmChatId(uid1, uid2)` = UIDs ordenados unidos por `"_"`.
- `userChats/{uid}/chats/{chatId}` con `type: "dm"`, `participantUid`, `lastMessage`, `updatedAt`.

## Fase 2 (pendiente)

- **Token de validación**: El WMS aceptará solo peticiones con `Authorization: Bearer <ID_TOKEN>`
- **PWA**: `manifest.json` para instalar en tablets/celulares

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
   - `NEXT_PUBLIC_WMS_URL`: URL de tu WMS (ej: `https://tu-wms.vercel.app`)
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
6. **Catálogo de productos para venta**: La pantalla donde se eligen los productos para vender obtiene la lista **solo** desde el WMS con `GET [NEXT_PUBLIC_WMS_URL]/api/pos/productos/listar`. No hay lista fija ni otra API para el catálogo. Los productos creados en "Productos POS" del WMS se muestran en el POS. Opcionalmente se envía `Authorization: Bearer <ID_TOKEN>`.

## Chat POS – requisitos en el WMS

El backend del WMS debe:

- **GET /api/chat/usuarios**: Si el usuario autenticado es POS (Firestore `users/{uid}.role === "pos"`), leer `users/{uid}.puntoVenta` y devolver solo (a) el franquiciado con ese mismo punto de venta y (b) usuarios administradores del WMS (mismo criterio que para el chat del WMS). Respuesta: `{ ok: true, usuarios: [{ uid, email, displayName, photoURL, puntoVenta?, esFranquiciado?, ... }] }`.
- **CORS**: Permitir el origen del POS (ej. `https://maria-chorizos-pos.vercel.app`) en la API de chat.

## Catálogo POS – requisitos en el WMS

Para que el catálogo de productos se cargue en el POS sin error 404 ni CORS:

1. **Implementar en el WMS** la ruta **GET /api/pos/productos/listar** que devuelva los productos del módulo "Productos POS" (fotos y precios). Respuesta esperada: `{ ok: true, data: [{ sku o skuBarcode o skuProductoFinal, descripcion, categoria?, precioUnitario, unidad?, urlImagen? }] }` (o `productos` en lugar de `data`).
2. **CORS**: En el WMS hay que permitir peticiones desde el origen del POS. Añadir en las respuestas de esa API (o en el middleware CORS del WMS) el header `Access-Control-Allow-Origin` con el origen del POS, por ejemplo:
   - En desarrollo: `http://localhost:3000`
   - En producción: `https://maria-chorizos-pos.vercel.app` (o la URL donde esté desplegado el POS)

Sin esto, el navegador bloqueará el fetch (CORS) o devolverá 404 y el POS mostrará un mensaje de error en el catálogo.

Estructura Firestore (compartida con el WMS):

- `chats/{chatId}/messages` con `text`, `senderId`, `createdAt` (serverTimestamp).
- `chatId` = `getDmChatId(uid1, uid2)` = UIDs ordenados unidos por `"_"`.
- `userChats/{uid}/chats/{chatId}` con `type: "dm"`, `participantUid`, `lastMessage`, `updatedAt`.

## Fase 2 (pendiente)

- **Token de validación**: El WMS aceptará solo peticiones con `Authorization: Bearer <ID_TOKEN>`
- **PWA**: `manifest.json` para instalar en tablets/celulares

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
│   ├── login/         # Login + selector de punto de venta
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx       # Redirección según auth
├── context/
│   └── AuthContext.tsx # Firebase Auth + Firestore (puntoVenta)
├── lib/
│   ├── firebase.ts    # Config Firebase
│   ├── enviar-venta.ts # POST al WMS
│   └── puntos-venta.ts # Lista quemada de puntos
└── types/
    └── index.ts
```

## Flujo

1. **Login**: Email/contraseña con Firebase Auth
2. **Punto de venta**: Se obtiene de Firestore `users/{uid}.puntoVenta`. Si no existe, el usuario selecciona de la lista quemada
3. **Dashboard**: Input de valor de venta del día → Enviar Reporte
4. **API**: POST a `[WMS_URL]/api/ventas/bulk-guardar` con `{ fecha, uen, ventas }`

## Fase 2 (pendiente)

- **Token de validación**: El WMS aceptará solo peticiones con `Authorization: Bearer <ID_TOKEN>`
- **PWA**: `manifest.json` para instalar en tablets/celulares

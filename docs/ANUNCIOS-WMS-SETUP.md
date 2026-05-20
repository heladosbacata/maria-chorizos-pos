# Anuncios WMS en el POS (checklist)

El código del overlay ya está en **maria-chorizos-pos** (`PosAnunciosCajaWatcher` en `/caja`). No hace falta pedir otro agente si estos pasos están bien.

## 1. WMS con la API desplegada

El POS llama a `GET /api/pos/anuncios/activo` en el WMS.

- **Producción / Vercel:** si esa ruta devuelve **404**, hay que hacer **commit + push + deploy** del proyecto **maria-chorizos-wms** (la feature de anuncios aún no está en el servidor remoto).
- **Prueba local:** WMS en `npm run dev` → `http://localhost:3002`

Comprobación en el navegador o PowerShell:

```text
http://localhost:3002/api/pos/anuncios/activo
```

Debe responder JSON con `"ok": true`. Si `"activo": false`, mirá `razonInactivo`.

## 2. Variables en `.env.local` del POS

Con WMS en tu PC:

```env
NEXT_PUBLIC_WMS_URL=http://localhost:3002
NEXT_PUBLIC_WMS_USE_LOCAL=1
```

Sin `USE_LOCAL=1`, aunque pongas localhost el POS **sigue usando Vercel** por defecto.

Tras cambiar `.env.local`: **reiniciar** `npm run dev` del POS.

## 3. Campaña en horario (Colombia)

El WMS solo devuelve `activo: true` si la campaña cumple **fecha**, **días de la semana** y **hora inicio–fin** (hora Colombia).

Ejemplo: si el horario es **08:00–20:00** y son las **07:00** en Bogotá, verás `activo: false` y en el WMS «Fuera de horario».

Para probar ya: en Centro de Anuncios pon **Hora inicio 00:00** y **Hora fin 23:59**, fechas que incluyan hoy, y días Lun–Dom marcados.

## 4. En la pantalla de caja del POS

URL habitual en desarrollo: **http://localhost:3040/caja**

- Iniciar sesión como **cajero POS**
- **Abrir turno** (o refrescar con turno ya abierto)
- El anuncio **no** aparece en login ni sin turno abierto

Proxy del POS (debe dar 200, no 404):

```text
http://localhost:3040/api/pos_anuncios_activo
```

## 5. Consola del navegador (F12)

Con el POS en desarrollo, si no hay anuncio verás en consola:

```text
[PosAnuncios] <motivo>
```

También en Red: petición a `/api/pos_anuncios_activo` → debe ser 200 y el proxy debe apuntar al WMS correcto.

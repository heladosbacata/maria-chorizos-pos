# Google Sheets y catálogo de cargue — una sola configuración para todos los POS

Los **cajeros no** comparten la hoja ni activan APIs. El servidor del POS lee la hoja con una **cuenta de servicio** (`client_email` del JSON). Ese acceso es **único por proyecto**: cuando está bien configurado, **todos** los usuarios POS registrados en el WMS lo usan sin pasos extra.

## Lo que debe hacer una sola vez el administrador (TI / dueño del proyecto Google)

### 1. Habilitar Google Sheets API

En el **mismo proyecto de Google Cloud** donde vive la cuenta de servicio del JSON (`project_id` dentro del JSON, p. ej. `maria-chorizos-wms`):

1. Abre [Google Cloud Console → API Sheets](https://console.cloud.google.com/apis/library/sheets.googleapis.com) y selecciona tu proyecto.
2. Pulsa **Habilitar** (Enable).
3. Espera 1–3 minutos.

*(En la pantalla **Cargue de inventario** del POS, si falla la lectura, aparece un enlace directo a esta acción cuando usas `GOOGLE_SHEETS_USE_FIREBASE_SA=1` o `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON`.)*

### 2. Compartir la hoja con el `client_email` de la cuenta de servicio

1. Abre el JSON de la cuenta de servicio que usa el servidor (`FIREBASE_SERVICE_ACCOUNT_JSON` si `GOOGLE_SHEETS_USE_FIREBASE_SA=1`, u otro JSON si usas `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON`).
2. Copia el valor de **`client_email`** (termina en `@....iam.gserviceaccount.com`).
3. En **Google Sheets**, abre la hoja del catálogo de insumos → **Compartir** → pega ese correo.
4. Rol recomendado: **Lector** (solo lectura) o **Editor** si algún proceso debe escribir.
5. No hace falta notificar al correo.

Con eso, **cualquier** sesión POS que llame a `/api/catalogo_insumos_sheet` usará las mismas credenciales.

### 3. Variables en el servidor (Vercel / `.env.local`)

- `GOOGLE_SHEETS_USE_FIREBASE_SA=1` y `FIREBASE_SERVICE_ACCOUNT_JSON={...}` **o**
- `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON={...}` dedicada.

Opcional: `GOOGLE_SHEETS_INSUMOS_SPREADSHEET_ID`, `GOOGLE_SHEETS_INSUMOS_GID`, `GOOGLE_SHEETS_INSUMOS_RANGE` si no usas los valores por defecto del código.

## Qué **no** hace falta hacer por cada cajero

- No invitar a cada usuario POS a la hoja.
- No crear claves JSON por punto de venta.
- El WMS solo gestiona **usuarios y negocio**; los permisos de Google son **por proyecto + una hoja compartida con la SA**.

## Opcional: Drive compartido (Shared Drive)

Si la hoja vive en un **Drive compartido** del negocio y la cuenta de servicio es **miembro del equipo** del Drive, suele simplificar permisos sobre muchas hojas sin compartir archivo por archivo. Sigue siendo configuración de **Google Workspace / administración**, no del cajero.

## Respaldo sin Sheet

Si la hoja falla pero Firestore tiene ítems en `DB_Franquicia_Insumos_Kit` para el PV, el POS puede mostrar el catálogo desde Firestore; el panel de cargue indica el aviso y la caja azul de administrador si la API devolvió `sheetSetup`.

# Checklist inventario POS

**Última verificación automática (entorno local):** 26 mar 2026 — `npm run check:inventario` ✓ OK.

---

## Resumen: qué nos falta

Estos puntos **no** los puede cerrar el script; debes revisarlos en Firebase, Google Cloud o en el navegador. Cuando cierres uno, cambia `[ ]` por `[x]` en las secciones de abajo.

| # | Pendiente |
|---|-----------|
| 1 | **Perfil:** documento `users/{uid}` con `puntoVenta` correcto (o selección de PV al iniciar sesión). |
| 2 | **Reglas Firestore:** en consola deben permitir lectura de `DB_Franquicia_Insumos_Kit` y lectura/escritura de `posInventarioSaldos` y `posInventarioMovimientos` según el PV del usuario. En el repo solo existe la plantilla `firestore.rules.example` (no hay `firestore.rules` desplegable desde este proyecto). |
| 3 | **Datos catálogo:** colección `DB_Franquicia_Insumos_Kit` con ítems visibles para cada PV (global, campo PV, o `posCatalogoGlobal` / `posCatalogoPvCodes`). |
| 4 | **Google Cloud / Sheet:** API de Sheets habilitada para el proyecto de la cuenta de servicio; hoja compartida con el `client_email` de esa SA. |
| 5 | **Sheet (opcional):** si no usas el spreadsheet/gid por defecto del código, define `GOOGLE_SHEETS_INSUMOS_*` en `.env.local`. |
| 6 | **Índices Firestore:** solo si la consola o el cliente piden índice compuesto al listar el catálogo. |
| 7 | **Producción:** variables en Vercel alineadas con `.env.example` / `.env.local` (sin subir secretos a Git). |
| 8 | **Escala:** tras migrar catálogo, valorar `NEXT_PUBLIC_POS_CATALOGO_FIRESTORE_INDEXED_ONLY=1`. |
| 9 | **Pruebas POS:** inventario carga, cargue/movimiento funciona, datos persisten tras recargar. |

---

## Leyenda

- **[x]** Listo (código, plantilla, `.env.local` verificado con `npm run check:inventario`).
- **[ ]** Pendiente — revisa la tabla de arriba.

---

## 1. Proyecto y entorno

- [x] **Firebase cliente**: `NEXT_PUBLIC_FIREBASE_*` definidas en `.env.local`.
- [x] **WMS**: `NEXT_PUBLIC_WMS_URL` definida.
- [x] **APIs servidor**: `FIREBASE_SERVICE_ACCOUNT_JSON` presente en `.env.local`.
- [x] **Google Sheet — reutilizar SA de Firebase**: `GOOGLE_SHEETS_USE_FIREBASE_SA=1`.
- [x] **Catálogo Firestore opcional**: sin `NEXT_PUBLIC_POS_CATALOGO_*` en `.env.local` (valores por defecto en código).
- [ ] **Usuario con `puntoVenta`**: Firestore `users/{uid}` acorde al catálogo (o flujo de selección de PV).
- [x] **Código del PV en UI**: Configuración → Contrato POS GEB → «Código del PV».

---

## 2. Código y APIs (repositorio)

- [x] **Inventarios** (`InventarioPosModule`) y **Cargue** (`CargueInventarioManualPanel`) en Caja.
- [x] **Firestore** `src/lib/inventario-pos-firestore.ts`.
- [x] **API** `pages/api/catalogo_insumos_sheet.ts`.
- [x] **Plantilla de reglas** `firestore.rules.example` (bloques inventario + `users`).
- [x] **Archivo `firestore.rules` en repo**: no existe (normal); las reglas vivas están en Firebase Console o en el repo del WMS — **fusionar** lo de la plantilla si falta inventario.

---

## 3. Firebase (consola)

- [ ] **Reglas publicadas** incluyen inventario (catálogo lectura; saldos/movimientos por PV). Guía: `firestore.rules.example`.
- [ ] **Colección `DB_Franquicia_Insumos_Kit`** poblada y alineada con cada código de PV.
- [x] **Precargar `posInventarioSaldos` / `posInventarioMovimientos`**: no es obligatorio; el POS crea documentos al mover stock **si las reglas lo permiten**.
- [ ] **Índices compuestos** creados si Firestore los solicita.

---

## 4. Google Sheet

- [ ] **Sheets API** habilitada (Google Cloud del proyecto vinculado a la SA).
- [ ] Hoja **compartida** con el email de la cuenta de servicio (`client_email` del JSON).
- [ ] **Overrides** (`GOOGLE_SHEETS_INSUMOS_SPREADSHEET_ID`, `GID`, `RANGE`, `CSV_URL`, etc.) solo si no usas los valores por defecto del código — el script avisa si faltan.

---

## 5. Escala / producción

- [ ] `NEXT_PUBLIC_POS_CATALOGO_FIRESTORE_INDEXED_ONLY=1` cuando el catálogo esté migrado (ver `.env.example`).
- [ ] Variables en **Vercel** (equivalentes a local, sin commitear `.env.local`).

---

## 6. Pruebas en el POS

- [ ] **Inventarios**: lista sin `permission-denied`.
- [ ] **Cargue / movimiento**: saldo e **historial** coherentes.
- [ ] **Recarga**: persistencia en Firestore.

---

## Comandos

```bash
npm run check:inventario
```

## Si algo falla

1. `npm run check:inventario`  
2. Consola del navegador (Firestore)  
3. Red → `/api/catalogo_insumos_sheet`  
4. **Código del PV** idéntico en perfil, Sheet y documentos del catálogo  

### `permission-denied` en `posInventarioSaldos` / `BatchGetDocuments`

- **Registro vía servidor (recomendado):** el POS intenta primero `POST /api/pos_inventario_movimiento` con tu ID token; la escritura la hace **Firebase Admin** y **no depende** de las reglas del SDK web. Requiere `FIREBASE_SERVICE_ACCOUNT_JSON` en **Vercel** (o en local en `.env.local`). Si esa variable falta, se vuelve al cliente y pueden volver a aparecer errores de reglas.
- **Reglas desactualizadas:** si la lectura exige `resource.data.puntoVenta` pero el documento de saldo **aún no existe**, en Firestore `resource` es `null` y la regla falla. Copiá el bloque actualizado de `firestore.rules.example` (incluye `resource == null || …`) y **publicá** las reglas en Firebase Console → Firestore → Reglas.
- **`users/{uid}` sin `puntoVenta`:** la función `posInventarioPuntoVentaUsuario()` no puede validar el PV; completá el perfil en Firestore o en la app.
- **Espacios en `puntoVenta`:** el perfil en Firestore con espacios al inicio/fin puede no coincidir con el valor recortado en el POS; la app intenta autocorregir al iniciar sesión; el API Admin compara con `.trim()`.

### Consola: `ERR_BLOCKED_BY_CLIENT` en URLs de `firestore.googleapis.com`

Suele ser **bloqueador de anuncios / privacidad** (uBlock, Brave agresivo, etc.). Desactivá el bloqueo para el dominio del POS o añadí una excepción para `firestore.googleapis.com`.

### Impresión: QZ y «Permite ventanas emergentes»

- **QZ Tray** debe estar instalado y en ejecución para impresión directa; si no, el POS intenta el navegador.
- Para impresión por **ventana emergente**, permití pop-ups para el sitio del POS en el navegador.

# Ajustes de Cursor para este POS

Las instrucciones que antes solo vivían en chats de Cursor están en **`.cursor/rules/`** para que reaparezcan en cada conversación con el proyecto abierto como raíz.

| Regla | Qué cubre |
|--------|-----------|
| `geb-pos-contexto.mdc` | Stack, puerto 3040, WMS, español |
| `geb-pos-workflow.mdc` | Commits y deploy |
| `geb-pos-chat-flotante.mdc` | Dock `PosChatFloatingDock`, privado + grupal |
| `geb-pos-club-millas.mdc` | Cobro con cédula, tirilla, Mi plan |
| `geb-pos-qr-domicilios.mdc` | QR pedidos `pedidos.mariachorizos.com` |

## Cómo verlas en Cursor

1. Abrí **File → Open Folder** → carpeta `maria-chorizos-pos` (no solo un archivo suelto).
2. **Cursor Settings → Rules** (o panel Rules del chat): deben listarse las reglas del proyecto.
3. Si no aparecen: **Developer: Reload Window** o cerrar y reabrir Cursor.

## Historial de chats

Los chats viejos siguen en el historial de **este workspace** (icono de reloj en el panel de chat). Buscar por “chat flotante”, “club millas” o “QR”.

## Repo WMS

Para trabajo solo del WMS, abrir el repo `maria-chorizos-wms` por separado; tiene sus propias reglas en `.cursor/rules/`.

/**
 * Reparación típica cuando en dev falla:
 * - 404 en /_next/static (layout.css, webpack.js…)
 * - Cannot find module './NNN.js' en webpack-runtime (chunks viejos + HMR)
 *
 * 1) Mata el proceso en el puerto (evita dos Next a la vez).
 * 2) Borra .next y node_modules/.cache.
 * 3) Arranca next dev (una sola terminal).
 *
 * Uso: npm run dev:fresh   ó   npm run dev:repair
 */
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const port = process.env.PORT_DEV ?? "3040";

const DIRS = [".next", "node_modules/.cache"];

spawnSync("npx", ["--yes", "kill-port", port], { stdio: "inherit", shell: true });

await delay(900);

async function wipeDir(relPath) {
  if (!existsSync(relPath)) return;
  let ok = false;
  for (let i = 0; i < 10; i++) {
    try {
      await rm(relPath, { recursive: true, force: true });
      ok = true;
      break;
    } catch {
      await delay(300);
    }
  }
  if (!ok && existsSync(relPath)) {
    console.warn(`[dev-fresh] rm falló para ${relPath}; probando rmdir /s /q…`);
    const r = spawnSync("cmd.exe", ["/c", "rmdir", "/s", "/q", relPath], {
      stdio: "inherit",
      cwd: process.cwd(),
      shell: false,
    });
    if (r.status !== 0 && existsSync(relPath)) {
      console.error(`[dev-fresh] No se pudo borrar ${relPath}. Cerrá Node/Cursor/antivirus y borrá esa carpeta a mano.`);
      process.exit(1);
    }
  }
  if (existsSync(relPath)) {
    console.error(`[dev-fresh] ${relPath} sigue existiendo.`);
    process.exit(1);
  }
  console.log(`[dev-fresh] Eliminado: ${relPath}`);
}

for (const d of DIRS) {
  await wipeDir(d);
}

console.log("[dev-fresh] Arrancando next dev… (dejá esta ventana abierta; recargá el navegador con Ctrl+Shift+R)");

const r = spawnSync("npx", ["next", "dev", "-p", port], {
  stdio: "inherit",
  shell: true,
});
process.exit(r.status ?? 1);

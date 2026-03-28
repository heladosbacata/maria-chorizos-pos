/**
 * Borra .next y arranca `next dev` (evita 404 en _next/static por caché corrupta).
 * Uso: node scripts/dev-fresh.mjs   o   npm run dev:fresh
 */
import { existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

const port = process.env.PORT_DEV ?? "3040";

if (existsSync(".next")) {
  rmSync(".next", { recursive: true, force: true });
  console.log("[dev-fresh] Carpeta .next eliminada.");
}

const r = spawnSync("npx", ["next", "dev", "-p", port], {
  stdio: "inherit",
  shell: true,
});
process.exit(r.status ?? 1);

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";

/**
 * Wrapper estable para `next dev` en Windows (especialmente con rutas tipo OneDrive / sync),
 * donde el watcher nativo a veces deja el servidor escuchando pero sin responder HTTP.
 */
process.env.WATCHPACK_POLLING ??= "true";
process.env.CHOKIDAR_USEPOLLING ??= "true";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

const args = process.argv.slice(2);
const hasPort = args.some((a, i) => a === "-p" || a === "--port" || (i > 0 && args[i - 1] === "-p"));
const finalArgs = ["dev", ...(hasPort ? [] : ["-p", "3040"]), ...args];

const child = spawn(process.execPath, [nextBin, ...finalArgs], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});

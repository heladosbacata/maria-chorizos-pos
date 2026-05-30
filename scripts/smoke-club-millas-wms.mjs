/**
 * Smoke: contrato WMS registrar-ticket (requiere CLUB_MILLAS_POS_SECRET en .env.local).
 * No consume el ticket; solo verifica que el WMS devuelve qrUrl + qrPayload + codigoCorto.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...process.env, ...loadEnvLocal() };
const secret = env.CLUB_MILLAS_POS_SECRET?.trim();
const wmsBase = (env.NEXT_PUBLIC_WMS_URL || env.WMS_CATALOGO_FALLBACK_URL || "https://maria-chorizos-wms.vercel.app").replace(
  /\/$/,
  ""
);

async function main() {
  console.log("=== Smoke Club de Millas (WMS) ===\n");

  const landing = `${wmsBase}/club-de-millas`;
  try {
    const r = await fetch(landing, { method: "GET", redirect: "follow" });
    console.log(`GET ${landing} → HTTP ${r.status} ${r.ok ? "OK" : "FAIL"}`);
  } catch (e) {
    console.log(`GET landing FAIL: ${e instanceof Error ? e.message : e}`);
  }

  if (!secret) {
    console.log("\nCLUB_MILLAS_POS_SECRET no está en .env.local: omitiendo registrar-ticket en vivo.");
    console.log("(Los tests vitest de compatibilidad POS↔WMS cubren el contrato del QR.)");
    process.exit(0);
  }

  const url = `${wmsBase}/api/club-de-millas/pos/registrar-ticket`;
  const body = {
    montoTotalCop: 18000,
    puntoVenta: "SMOKE-POS",
    documento: "9990012345",
    idFacturaPos: `smoke-${Date.now()}`,
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-club-millas-pos-secret": secret,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    console.log(`\nPOST registrar-ticket → HTTP ${res.status}`);
    if (!res.ok) {
      console.log("Respuesta:", JSON.stringify(data).slice(0, 400));
      process.exit(1);
    }
    const qrUrl = typeof data.qrUrl === "string" ? data.qrUrl : "";
    const qrPayload = typeof data.qrPayload === "string" ? data.qrPayload : "";
    const codigoCorto = typeof data.codigoCorto === "string" ? data.codigoCorto : "";
    const ok =
      data.ok === true &&
      /^https?:\/\//i.test(qrUrl) &&
      /BACATA-CLUB-V1-[0-9a-fA-F]{32}/.test(qrPayload) &&
      /^[A-Z0-9]{6}$/.test(codigoCorto);
    console.log(`  ok: ${data.ok}, millas: ${data.millas}, codigoCorto: ${codigoCorto || "(vacío)"}`);
    console.log(`  qrUrl tiene ?c=: ${qrUrl.includes("?c=") || qrUrl.includes("&c=")}`);
    console.log(`  qrPayload prefijo: ${qrPayload.slice(0, 24)}…`);
    if (!ok) {
      console.log("\nFAIL: respuesta incompleta para tirilla.");
      process.exit(1);
    }
    console.log("\nOK: WMS devuelve URL + token + código corto.");
    const socioId = env.SMOKE_CLUB_SOCIO_ID?.trim();
    if (socioId && qrPayload) {
      const acUrl = `${wmsBase}/api/club-de-millas/acumular-millas`;
      const acRes = await fetch(acUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          socioId,
          documento: body.documento,
          qrCode: qrPayload,
        }),
      });
      const acData = await acRes.json().catch(() => ({}));
      console.log(`POST acumular-millas → HTTP ${acRes.status}`);
      if (acRes.ok && acData.ok === true) {
        console.log(`  puntosSumados: ${acData.puntosSumados}, saldoMillas: ${acData.saldoMillas}`);
        console.log("\nOK: flujo registrar + acumular (igual que cobro cliente frecuente en POS).");
      } else if (acRes.status === 409) {
        console.log(`  ya acumulado / duplicado, saldo: ${acData.saldoMillas ?? "?"}`);
        console.log("\nOK: acumular respondió 409 (ticket ya usado); contrato válido.");
      } else {
        console.log("  acumular:", JSON.stringify(acData).slice(0, 300));
        process.exit(1);
      }
    } else {
      console.log(
        "\n(Opcional: SMOKE_CLUB_SOCIO_ID en .env.local para probar acumular-millas tras registrar.)"
      );
      console.log("NOTA: ticket de prueba en Firestore; no acumular en producción sin socio de prueba.");
    }
  } catch (e) {
    console.log(`\nPOST registrar-ticket FAIL: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}

main();

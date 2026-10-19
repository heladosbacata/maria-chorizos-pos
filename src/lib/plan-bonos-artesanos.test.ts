import { describe, expect, it } from "vitest";
import {
  docIdPlanBonosLogro,
  esEmojiFelicitarPlanBonos,
  idQuincenaColombia,
  metasAlcanzadas,
  pctBarraPlanBonos,
  planBonosYaIniciado,
  rangoEtiquetaQuincena,
  siguienteMetaPendiente,
  totalReaccionesPlanBonos,
} from "@/lib/plan-bonos-artesanos";

describe("plan-bonos-artesanos", () => {
  it("calcula porcentaje acotado a 100", () => {
    expect(pctBarraPlanBonos(0)).toBe(0);
    expect(pctBarraPlanBonos(500_000)).toBe(50);
    expect(pctBarraPlanBonos(1_000_000)).toBe(100);
    expect(pctBarraPlanBonos(1_200_000)).toBe(100);
  });

  it("detecta metas alcanzadas en cascada", () => {
    expect(metasAlcanzadas(499_999)).toHaveLength(0);
    expect(metasAlcanzadas(500_000).map((m) => m.id)).toEqual(["bronce_500"]);
    expect(metasAlcanzadas(700_000).map((m) => m.id)).toEqual(["bronce_500", "plata_700"]);
    expect(metasAlcanzadas(800_000).map((m) => m.id)).toEqual([
      "bronce_500",
      "plata_700",
      "ambar_800",
    ]);
    expect(metasAlcanzadas(1_000_000).map((m) => m.id)).toEqual([
      "bronce_500",
      "plata_700",
      "ambar_800",
      "oro_1000",
    ]);
  });

  it("indica la siguiente meta pendiente", () => {
    expect(siguienteMetaPendiente(0)?.id).toBe("bronce_500");
    expect(siguienteMetaPendiente(500_000)?.id).toBe("plata_700");
    expect(siguienteMetaPendiente(700_000)?.id).toBe("ambar_800");
    expect(siguienteMetaPendiente(800_000)?.id).toBe("oro_1000");
    expect(siguienteMetaPendiente(1_000_000)).toBeNull();
  });

  it("arma docId estable", () => {
    expect(docIdPlanBonosLogro("Punto Demo App", "2026-10-18", "bronce_500")).toBe(
      "punto_demo_app_2026-10-18_bronce_500"
    );
  });

  it("parte quincenas 1–15 y 16–fin", () => {
    expect(idQuincenaColombia("2026-10-15")).toBe("2026-10-Q1");
    expect(idQuincenaColombia("2026-10-16")).toBe("2026-10-Q2");
    expect(rangoEtiquetaQuincena("2026-10-18").desde).toBe("2026-10-16");
    expect(rangoEtiquetaQuincena("2026-10-18").hasta).toBe("2026-10-31");
  });

  it("valida emojis de felicitación", () => {
    expect(esEmojiFelicitarPlanBonos("🔥")).toBe(true);
    expect(esEmojiFelicitarPlanBonos("pizza")).toBe(false);
    expect(totalReaccionesPlanBonos({ "👏": ["a", "b"], "🔥": ["c"] })).toBe(3);
  });

  it("billetera solo desde el 23 de octubre 2026", () => {
    expect(planBonosYaIniciado("2026-10-22")).toBe(false);
    expect(planBonosYaIniciado("2026-10-23")).toBe(true);
    expect(planBonosYaIniciado("2026-10-24")).toBe(true);
  });
});

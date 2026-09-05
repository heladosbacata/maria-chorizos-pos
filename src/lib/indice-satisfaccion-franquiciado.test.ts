import { describe, expect, it } from "vitest";
import {
  areasVacias,
  calcularIndice,
  clampEstrellas,
  colorIndice,
  contarAreasCompletas,
  fusionarAreasPreservandoRespuestasWms,
  listarAreasSeguimientoWms,
  normalizarRegistroMes,
  puedeEditarYmIndice,
  requiereSeguimientoWms,
  validarParaGuardar,
  ymAnteriorDe,
  ymDesdeYmd,
  ymsEditablesIndice,
} from "@/lib/indice-satisfaccion-franquiciado";
import { preferirRegistroMasReciente } from "@/lib/indice-satisfaccion-franquiciado-storage";
import { docIdIndiceSatisfaccion, puntoVentaClaveIndice } from "@/lib/pos-indice-satisfaccion-cloud";

describe("indice-satisfaccion-franquiciado", () => {
  it("clampEstrellas acepta 1–5 y rechaza fuera de rango", () => {
    expect(clampEstrellas(3)).toBe(3);
    expect(clampEstrellas(5.4)).toBe(5);
    expect(clampEstrellas(0)).toBe(0);
    expect(clampEstrellas(9)).toBe(0);
    expect(clampEstrellas("2")).toBe(2);
  });

  it("calcularIndice promedia solo áreas calificadas", () => {
    const a = areasVacias();
    a.operaciones.estrellas = 5;
    a.producto.estrellas = 3;
    expect(calcularIndice(a)).toBe(4);
    expect(contarAreasCompletas(a)).toBe(2);
  });

  it("validarParaGuardar exige todas las áreas y observación si ≤3", () => {
    const a = areasVacias();
    expect(validarParaGuardar(a)?.tipo).toBe("incompleto");

    for (const id of Object.keys(a) as (keyof typeof a)[]) {
      a[id].estrellas = 4;
    }
    expect(validarParaGuardar(a)).toBeNull();

    a.finanzas.estrellas = 2;
    a.finanzas.observacion = "";
    const err = validarParaGuardar(a);
    expect(err?.tipo).toBe("observacion");
    if (err?.tipo === "observacion") expect(err.areaId).toBe("finanzas");

    a.finanzas.observacion = "Demoras en liquidación";
    expect(validarParaGuardar(a)).toBeNull();
  });

  it("normalizarRegistroMes y colorIndice", () => {
    const reg = normalizarRegistroMes("2026-03", {
      areas: { operaciones: { estrellas: 5, observacion: "ok" } },
      guardadoAt: "2026-03-10T12:00:00.000Z",
    });
    expect(reg.areas.operaciones.estrellas).toBe(5);
    expect(reg.indice).toBe(5);
    expect(colorIndice(4.2)).toBe("verde");
    expect(colorIndice(3.2)).toBe("ambar");
    expect(colorIndice(2.1)).toBe("rojo");
    expect(ymDesdeYmd("2026-09-04")).toBe("2026-09");
  });

  it("preferirRegistroMasReciente gana por guardadoAt", () => {
    const a = normalizarRegistroMes("2026-03", {
      areas: { operaciones: { estrellas: 3, observacion: "viejo" } },
      guardadoAt: "2026-03-01T10:00:00.000Z",
    });
    const b = normalizarRegistroMes("2026-03", {
      areas: { operaciones: { estrellas: 5, observacion: "nuevo" } },
      guardadoAt: "2026-03-10T10:00:00.000Z",
    });
    expect(preferirRegistroMasReciente(a, b)?.areas.operaciones.estrellas).toBe(5);
    expect(preferirRegistroMasReciente(b, a)?.areas.operaciones.estrellas).toBe(5);
    expect(preferirRegistroMasReciente(null, a)?.guardadoAt).toBe(a.guardadoAt);
  });

  it("docIdIndiceSatisfaccion es estable", () => {
    expect(puntoVentaClaveIndice("Plaza Norte")).toBe("plaza norte");
    expect(docIdIndiceSatisfaccion("Plaza Norte", "2026-09")).toBe("plaza norte__2026-09");
  });

  it("mes anterior editable solo los primeros 15 días", () => {
    expect(ymAnteriorDe("2026-09")).toBe("2026-08");
    expect(ymAnteriorDe("2026-01")).toBe("2025-12");
    expect(puedeEditarYmIndice("2026-09", "2026-09-04")).toBe(true);
    expect(puedeEditarYmIndice("2026-08", "2026-09-04")).toBe(true);
    expect(puedeEditarYmIndice("2026-08", "2026-09-15")).toBe(true);
    expect(puedeEditarYmIndice("2026-08", "2026-09-16")).toBe(false);
    expect(puedeEditarYmIndice("2026-07", "2026-09-04")).toBe(false);
    expect(ymsEditablesIndice("2026-09-10")).toEqual(["2026-08", "2026-09"]);
    expect(ymsEditablesIndice("2026-09-16")).toEqual(["2026-09"]);
  });

  it("requiereSeguimientoWms y preserva respuesta en fusión", () => {
    expect(requiereSeguimientoWms(3)).toBe(true);
    expect(requiereSeguimientoWms(4)).toBe(false);
    const prev = areasVacias();
    prev.producto = {
      estrellas: 2,
      observacion: "Falta surtido",
      respuestaWms: {
        texto: "Ya pedimos reposición",
        respondidoAt: "2026-09-01T12:00:00.000Z",
        respondidoPorNombre: "Admin",
        estado: "respondida",
      },
    };
    const next = areasVacias();
    next.producto = { estrellas: 2, observacion: "Falta surtido", respuestaWms: null };
    const merged = fusionarAreasPreservandoRespuestasWms(next, prev);
    expect(merged.producto.respuestaWms?.estado).toBe("respondida");
    expect(listarAreasSeguimientoWms(merged)).toContain("producto");
  });
});

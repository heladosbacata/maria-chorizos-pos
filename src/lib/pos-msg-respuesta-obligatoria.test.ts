import { describe, expect, it } from "vitest";
import {
  formatCountdown,
  estaEnSnooze,
  ultimoAdminBroadcastSinRespuestaPropia,
  ultimoMensajeAdminSinRespuesta,
} from "./pos-msg-respuesta-obligatoria";

describe("pos-msg-respuesta-obligatoria", () => {
  it("detecta último mensaje admin sin respuesta del POS", () => {
    const msgs = [
      { id: "1", createdAtMs: 100, direction: "admin_to_pos" },
      { id: "2", createdAtMs: 200, direction: "pos_to_admin" },
      { id: "3", createdAtMs: 300, direction: "admin_to_pos" },
    ];
    expect(ultimoMensajeAdminSinRespuesta(msgs, "admin_to_pos")?.id).toBe("3");
  });

  it("null si el cajero ya respondió al final", () => {
    const msgs = [
      { id: "1", createdAtMs: 100, direction: "admin_to_pos" },
      { id: "2", createdAtMs: 200, direction: "pos_to_admin" },
    ];
    expect(ultimoMensajeAdminSinRespuesta(msgs, "admin_to_pos")).toBeNull();
  });

  it("snooze y countdown", () => {
    expect(estaEnSnooze(Date.now() + 10_000)).toBe(true);
    expect(estaEnSnooze(Date.now() - 1000)).toBe(false);
    expect(formatCountdown(65_000)).toBe("1:05");
  });

  it("broadcast exige respuesta propia aunque otro punto haya escrito", () => {
    const msgs = [
      { id: "a", createdAtMs: 100, direction: "admin", senderUid: "adm" },
      { id: "b", createdAtMs: 200, direction: "pos", senderUid: "otro" },
    ];
    expect(ultimoAdminBroadcastSinRespuestaPropia(msgs, "yo")?.id).toBe("a");
    expect(
      ultimoAdminBroadcastSinRespuestaPropia(
        [...msgs, { id: "c", createdAtMs: 300, direction: "pos", senderUid: "yo" }],
        "yo"
      )
    ).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { clampPosicionDockChat } from "@/lib/pos-chat-dock-layout";

describe("pos-chat-dock-layout", () => {
  it("clampPosicionDockChat acota dentro de limites dados", () => {
    const original = globalThis.document;
    Object.defineProperty(globalThis, "document", {
      value: { querySelector: () => null },
      configurable: true,
    });
    Object.defineProperty(globalThis, "window", {
      value: { innerWidth: 1200, innerHeight: 800, matchMedia: () => ({ matches: false }) },
      configurable: true,
    });

    const r = clampPosicionDockChat(5000, 5000, 280, 68);
    expect(r.x).toBeLessThanOrEqual(1200 - 280 - 12);
    expect(r.y).toBeLessThanOrEqual(800 - 68 - 12);

    Object.defineProperty(globalThis, "document", { value: original, configurable: true });
  });
});

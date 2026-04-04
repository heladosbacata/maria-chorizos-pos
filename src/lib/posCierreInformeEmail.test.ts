import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { detectCierreEmailBackend, sendPosCierreInformeEmail } from "./posCierreInformeEmail";

const sendMail = vi.fn().mockResolvedValue(undefined);

vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail,
    }),
  },
}));

describe("detectCierreEmailBackend", () => {
  const backup: Record<string, string | undefined> = {};

  beforeEach(() => {
    backup.ZOHO_SMTP_USER = process.env.ZOHO_SMTP_USER;
    backup.ZOHO_SMTP_PASSWORD = process.env.ZOHO_SMTP_PASSWORD;
    backup.RESEND_API_KEY = process.env.RESEND_API_KEY;
    delete process.env.ZOHO_SMTP_USER;
    delete process.env.ZOHO_SMTP_PASSWORD;
    delete process.env.RESEND_API_KEY;
  });

  afterEach(() => {
    process.env.ZOHO_SMTP_USER = backup.ZOHO_SMTP_USER;
    process.env.ZOHO_SMTP_PASSWORD = backup.ZOHO_SMTP_PASSWORD;
    process.env.RESEND_API_KEY = backup.RESEND_API_KEY;
  });

  it("elige zoho cuando hay usuario y contraseña SMTP", () => {
    process.env.ZOHO_SMTP_USER = "caja@grupobacata.com";
    process.env.ZOHO_SMTP_PASSWORD = "app-password";
    expect(detectCierreEmailBackend()).toBe("zoho");
  });

  it("elige resend solo si no hay zoho completo", () => {
    process.env.RESEND_API_KEY = "re_xxx";
    expect(detectCierreEmailBackend()).toBe("resend");
  });

  it("prioriza zoho si están ambos", () => {
    process.env.ZOHO_SMTP_USER = "a@b.co";
    process.env.ZOHO_SMTP_PASSWORD = "x";
    process.env.RESEND_API_KEY = "re_xxx";
    expect(detectCierreEmailBackend()).toBe("zoho");
  });

  it("devuelve null sin configuración", () => {
    expect(detectCierreEmailBackend()).toBeNull();
  });
});

describe("sendPosCierreInformeEmail (Zoho mockeado)", () => {
  const backup: Record<string, string | undefined> = {};

  beforeEach(() => {
    backup.ZOHO_SMTP_USER = process.env.ZOHO_SMTP_USER;
    backup.ZOHO_SMTP_PASSWORD = process.env.ZOHO_SMTP_PASSWORD;
    backup.ZOHO_SMTP_FROM = process.env.ZOHO_SMTP_FROM;
    backup.RESEND_API_KEY = process.env.RESEND_API_KEY;
    process.env.ZOHO_SMTP_USER = "servicio@grupobacata.com";
    process.env.ZOHO_SMTP_PASSWORD = "fake-app-pass";
    process.env.ZOHO_SMTP_FROM = "Servicio al cliente <servicio@grupobacata.com>";
    delete process.env.RESEND_API_KEY;
    sendMail.mockClear();
  });

  afterEach(() => {
    process.env.ZOHO_SMTP_USER = backup.ZOHO_SMTP_USER;
    process.env.ZOHO_SMTP_PASSWORD = backup.ZOHO_SMTP_PASSWORD;
    process.env.ZOHO_SMTP_FROM = backup.ZOHO_SMTP_FROM;
    process.env.RESEND_API_KEY = backup.RESEND_API_KEY;
  });

  it("envía por SMTP con texto y asunto", async () => {
    const r = await sendPosCierreInformeEmail({
      to: "franquiciado@test.com",
      subject: "Cierre",
      text: "Total del día: 1",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.via).toBe("zoho");
    expect(sendMail).toHaveBeenCalledOnce();
    const arg = sendMail.mock.calls[0]![0] as { to: string; subject: string; text: string };
    expect(arg.to).toBe("franquiciado@test.com");
    expect(arg.subject).toBe("Cierre");
    expect(arg.text).toContain("Total del día");
  });

  it("incluye cc cuando se pasa", async () => {
    await sendPosCierreInformeEmail({
      to: "a@test.com",
      cc: ["b@test.com"],
      subject: "S",
      text: "T",
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ cc: ["b@test.com"] })
    );
  });

  it("adjunta pdf cuando se envía un archivo", async () => {
    await sendPosCierreInformeEmail({
      to: "a@test.com",
      subject: "S",
      text: "T",
      attachments: [
        {
          filename: "cierre.pdf",
          contentBase64: Buffer.from("pdf-demo").toString("base64"),
          contentType: "application/pdf",
        },
      ],
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          expect.objectContaining({
            filename: "cierre.pdf",
            contentType: "application/pdf",
          }),
        ],
      })
    );
  });
});

describe("sendPosCierreInformeEmail Resend (fetch mockeado)", () => {
  const backup: Record<string, string | undefined> = {};

  beforeEach(() => {
    backup.ZOHO_SMTP_USER = process.env.ZOHO_SMTP_USER;
    backup.ZOHO_SMTP_PASSWORD = process.env.ZOHO_SMTP_PASSWORD;
    backup.RESEND_API_KEY = process.env.RESEND_API_KEY;
    delete process.env.ZOHO_SMTP_USER;
    delete process.env.ZOHO_SMTP_PASSWORD;
    process.env.RESEND_API_KEY = "re_test_key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "email_123" }),
      })
    );
  });

  afterEach(() => {
    process.env.ZOHO_SMTP_USER = backup.ZOHO_SMTP_USER;
    process.env.ZOHO_SMTP_PASSWORD = backup.ZOHO_SMTP_PASSWORD;
    process.env.RESEND_API_KEY = backup.RESEND_API_KEY;
    vi.unstubAllGlobals();
  });

  it("llama a la API de Resend cuando no hay Zoho", async () => {
    const r = await sendPosCierreInformeEmail({
      to: "x@test.com",
      subject: "Sub",
      text: "Body",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.via).toBe("resend");
      expect(r.id).toBe("email_123");
    }
    expect(fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("envía adjuntos a Resend en base64", async () => {
    await sendPosCierreInformeEmail({
      to: "x@test.com",
      subject: "Sub",
      text: "Body",
      attachments: [
        {
          filename: "resumen.pdf",
          contentBase64: "UERG",
          contentType: "application/pdf",
        },
      ],
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        body: expect.stringContaining("\"attachments\":[{\"filename\":\"resumen.pdf\",\"content\":\"UERG\",\"content_type\":\"application/pdf\"}]"),
      })
    );
  });
});

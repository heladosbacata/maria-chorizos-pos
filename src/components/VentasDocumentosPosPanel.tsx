"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase";
import {
  listarDocumentosComerciales,
  type DocumentoComercialFirestoreDoc,
} from "@/lib/documentos-comerciales-firestore";
import { fechaHoraColombia, ymdColombia, ymdColombiaMenosDias } from "@/lib/fecha-colombia";
import { listarVentasPosCloud, actualizarFeVentaPosCloud } from "@/lib/pos-ventas-cloud-client";
import {
  listarVentasPuntoVentaEnEsteEquipo,
  mergeVentasReporteNubeLocal,
  actualizarVentaLocalComprobanteEmail,
  actualizarVentaLocalFacturaElectronica,
  type VentaGuardadaLocal,
} from "@/lib/pos-ventas-local-storage";
import TicketPrevisualizacionModal from "@/components/TicketPrevisualizacionModal";
import { emailComprobanteValido } from "@/lib/comprobante-correo-pos";
import { loadImpresionPrefs } from "@/lib/impresion-pos-storage";
import { enviarComprobantePorCorreo } from "@/lib/pos-comprobante-email-client";
import {
  imprimirTicketConQz,
  imprimirTicketEnNavegador,
  reservarVentanaTicketNavegador,
} from "@/lib/pos-geb-print";
import { enriquecerTicketConQrDomicilios } from "@/lib/domicilios-qr-ticket";
import { payloadTicketDesdeVenta } from "@/lib/pos-ticket-desde-venta";
import type { TicketVentaPayload } from "@/types/impresion-pos";
import {
  construirFilasDocumentosPos,
  filaComprobanteCorreoBody,
  filtrarFilasDocumentosPos,
  formatoFechaTabla,
  formatoPesos,
  type FilaDocumentoPosVenta,
  type TabDocumentoPosVenta,
} from "@/lib/ventas-documentos-pos";
import {
  buscarPayloadPendientePorVenta,
  encolarFeEmitirPendiente,
  removerFeEmitirPendientePorVenta,
} from "@/lib/pos-fe-retry-queue";
import { emitirCobroPayloadDesdeVentaLocal } from "@/lib/pos-emitir-payload-desde-venta";
import { descargarPaqueteDebugEmitirFePos, wmsPosAlegraEmitirCobro } from "@/lib/wms-pos-dian-client";

const TABS: { id: TabDocumentoPosVenta; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "factura_electronica", label: "Factura electrónica" },
  { id: "recibo_pos", label: "Recibo POS" },
  { id: "cotizacion", label: "Cotizaciones" },
  { id: "remision", label: "Remisiones" },
];

type Props = {
  puntoVenta: string | null;
  uid: string | null;
  onVolver: () => void;
};

function textoBadgeAlegraTabla(corto: string): string {
  if (corto === "OK") return "Enviada";
  if (corto === "Pend.") return "Pendiente";
  return "N/A";
}

function clasesBadgeAlegra(corto: string): string {
  if (corto === "OK") return "bg-emerald-100 text-emerald-800";
  if (corto === "Pend.") return "bg-amber-100 text-amber-900";
  return "bg-gray-100 text-gray-600";
}

function DetalleFila({ f }: { f: FilaDocumentoPosVenta }) {
  if (f.venta) {
    const v = f.venta;
    return (
      <div className="border-t border-gray-100 bg-gray-50/90 px-4 py-3 text-sm">
        <dl className="grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="font-semibold text-gray-600">ID</dt>
            <dd className="mt-0.5 break-all font-mono text-[11px]">{v.id}</dd>
          </div>
          <div>
            <dt className="font-semibold text-gray-600">Fecha y hora</dt>
            <dd className="mt-0.5">{fechaHoraColombia(new Date(v.isoTimestamp))}</dd>
          </div>
          {v.cajeroNombre ? (
            <div>
              <dt className="font-semibold text-gray-600">Cajero</dt>
              <dd className="mt-0.5">{v.cajeroNombre}</dd>
            </div>
          ) : null}
          {v.facturaElectronicaNumero ? (
            <div>
              <dt className="font-semibold text-gray-600">Nº factura FE</dt>
              <dd className="mt-0.5 font-mono">{v.facturaElectronicaNumero}</dd>
            </div>
          ) : null}
          <div>
            <dt className="font-semibold text-gray-600">Tipo al cobrar</dt>
            <dd className="mt-0.5">
              {v.tipoComprobanteAlCobro === "factura_electronica"
                ? "Factura electrónica"
                : v.tipoComprobanteAlCobro === "documento_interno"
                  ? "Doc. interno (recibo POS)"
                  : "Venta anterior (inferido por CUFE / número)"}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-gray-600">Alegra (emisión FE)</dt>
            <dd className="mt-0.5 text-xs text-gray-800">
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${clasesBadgeAlegra(f.alegraEstadoCorto)}`}
                title={f.alegraEstadoLabel}
              >
                {textoBadgeAlegraTabla(f.alegraEstadoCorto)}
              </span>
              <span className="mt-1 block text-[11px] font-normal normal-case tracking-normal text-gray-600">
                {f.alegraEstadoLabel}
              </span>
            </dd>
          </div>
          {v.facturaElectronicaCufe ? (
            <div className="sm:col-span-2">
              <dt className="font-semibold text-gray-600">CUFE</dt>
              <dd className="mt-0.5 break-all font-mono text-[10px]">{v.facturaElectronicaCufe}</dd>
            </div>
          ) : null}
          {v.comprobanteEmailEnviadoAt ? (
            <div>
              <dt className="font-semibold text-gray-600">Correo enviado</dt>
              <dd className="mt-0.5 text-xs">
                {v.comprobanteEmailDestino?.trim() || "—"} ·{" "}
                {fechaHoraColombia(new Date(v.comprobanteEmailEnviadoAt))}
              </dd>
            </div>
          ) : null}
        </dl>
        <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b bg-gray-100 text-[10px] font-bold uppercase text-gray-600">
                <th className="px-2 py-1.5">Producto</th>
                <th className="px-2 py-1.5 text-right">Cant.</th>
                <th className="px-2 py-1.5 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {v.lineas.map((l) => (
                <tr key={l.lineId}>
                  <td className="px-2 py-1.5">{l.descripcion}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{l.cantidad}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatoPesos(Math.round(l.precioUnitario * l.cantidad * 100) / 100)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {v.pagoResumen?.trim() ? (
          <p className="mt-2 whitespace-pre-wrap text-xs text-gray-700">{v.pagoResumen.trim()}</p>
        ) : null}
      </div>
    );
  }
  if (f.documento) {
    const d = f.documento;
    return (
      <div className="border-t border-gray-100 bg-gray-50/90 px-4 py-3 text-sm">
        <p className="text-xs text-gray-600">
          Cliente: <span className="font-medium text-gray-900">{d.clienteNombre}</span>
          {d.clienteDocumento ? ` · ${d.clienteDocumento}` : ""}
        </p>
        {d.observaciones?.trim() ? (
          <p className="mt-2 text-xs text-gray-700">{d.observaciones.trim()}</p>
        ) : null}
        <p className="mt-2 text-xs text-gray-600">
          <span className="font-semibold text-gray-700">Alegra:</span> {f.alegraEstadoLabel}
        </p>
        <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b bg-gray-100 text-[10px] font-bold uppercase text-gray-600">
                <th className="px-2 py-1.5">Ítem</th>
                <th className="px-2 py-1.5 text-right">Cant.</th>
                <th className="px-2 py-1.5 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {d.lineas.map((l, i) => (
                <tr key={`${l.sku}-${i}`}>
                  <td className="px-2 py-1.5">{l.descripcion || l.sku}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{l.cantidad}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatoPesos(Math.round(l.cantidad * l.precioUnitario * 100) / 100)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  return null;
}

type EmailDocEnviado = { destino: string; enviadoAt: string };

function ModalEnviarCorreo({
  fila,
  puntoVenta,
  uid,
  onCerrar,
  onEnviado,
}: {
  fila: FilaDocumentoPosVenta;
  puntoVenta: string;
  uid: string;
  onCerrar: () => void;
  onEnviado: (destino: string, enviadoAt: string) => void;
}) {
  const [email, setEmail] = useState(fila.emailDestino ?? fila.emailSugerido ?? "");
  const [mensaje, setMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enviar = async () => {
    const to = email.trim();
    if (!emailComprobanteValido(to)) {
      setError("Indicá un correo válido del destinatario.");
      return;
    }
    const body = filaComprobanteCorreoBody(fila, puntoVenta);
    if (!body) {
      setError("No se pudo armar el comprobante.");
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) throw new Error("Sesión expirada. Volvé a iniciar sesión.");
      const r = await enviarComprobantePorCorreo(token, {
        ...body,
        to,
        mensaje: mensaje.trim() || undefined,
      });
      if ("ventaLocalId" in body && body.ventaLocalId) {
        actualizarVentaLocalComprobanteEmail(uid, body.ventaLocalId, {
          destino: r.destino,
          enviadoAt: r.enviadoAt,
        });
      }
      onEnviado(r.destino, r.enviadoAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar el correo.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-correo-titulo"
      onClick={onCerrar}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h4 id="modal-correo-titulo" className="text-lg font-bold text-gray-900">
          Enviar por correo
        </h4>
        <p className="mt-1 text-sm text-gray-600">
          <span className="font-medium text-gray-800">{fila.comprobante}</span> · {fila.tipoLabel}
        </p>
        <label className="mt-4 block">
          <span className="text-xs font-medium text-gray-600">Correo del cliente</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="cliente@ejemplo.com"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            autoFocus
          />
        </label>
        <label className="mt-3 block">
          <span className="text-xs font-medium text-gray-600">Mensaje opcional</span>
          <textarea
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="Gracias por su compra…"
          />
        </label>
        {error ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCerrar}
            disabled={enviando}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void enviar()}
            disabled={enviando}
            className="rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {enviando ? "Enviando…" : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VentasDocumentosPosPanel({ puntoVenta, uid, onVolver }: Props) {
  const pv = (puntoVenta ?? "").trim();
  const u = (uid ?? "").trim();
  const hoy = useMemo(() => ymdColombia(), []);
  const [desdeYmd, setDesdeYmd] = useState(() => ymdColombiaMenosDias(hoy, 29));
  const [hastaYmd, setHastaYmd] = useState(hoy);
  const [tab, setTab] = useState<TabDocumentoPosVenta>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [soloVigentes, setSoloVigentes] = useState(true);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ventasNube, setVentasNube] = useState<VentaGuardadaLocal[] | null>(null);
  const [cotizaciones, setCotizaciones] = useState<DocumentoComercialFirestoreDoc[]>([]);
  const [remisiones, setRemisiones] = useState<DocumentoComercialFirestoreDoc[]>([]);
  const [nubeOk, setNubeOk] = useState<boolean | null>(null);
  const [filaCorreo, setFilaCorreo] = useState<FilaDocumentoPosVenta | null>(null);
  const [emailsDocsEnviados, setEmailsDocsEnviados] = useState<Record<string, EmailDocEnviado>>({});
  const [ticketConsulta, setTicketConsulta] = useState<TicketVentaPayload | null>(null);
  const [reimprimiendoTicket, setReimprimiendoTicket] = useState(false);
  const [jsonDebugBusyId, setJsonDebugBusyId] = useState<string | null>(null);
  const [emitirFeBusyId, setEmitirFeBusyId] = useState<string | null>(null);

  const refrescar = useCallback(() => setTick((t) => t + 1), []);

  const puedeEmitirFeDian = useCallback((f: FilaDocumentoPosVenta) => {
    const v = f.venta;
    if (!v || v.anulada) return false;
    if (v.facturaElectronicaCufe?.trim()) return false;
    return v.tipoComprobanteAlCobro === "factura_electronica" || f.tipo === "factura_electronica";
  }, []);

  const emitirFeDianManual = useCallback(
    async (f: FilaDocumentoPosVenta) => {
      const v = f.venta;
      if (!v || !puedeEmitirFeDian(f)) return;
      setEmitirFeBusyId(f.id);
      try {
        const token = await auth?.currentUser?.getIdToken();
        if (!token) throw new Error("Sesión expirada. Volvé a iniciar sesión.");
        const payload = buscarPayloadPendientePorVenta(u, v.id) ?? emitirCobroPayloadDesdeVentaLocal(v);
        const r = await wmsPosAlegraEmitirCobro(token, payload);
        if (!r.ok) {
          encolarFeEmitirPendiente(u, v.id, payload);
          throw new Error(r.error);
        }
        actualizarVentaLocalFacturaElectronica(u, v.id, {
          numero: r.numeroFactura,
          cufe: r.alegraCufe,
          enviadoAt: r.enviadoAt,
        });
        removerFeEmitirPendientePorVenta(u, v.id);
        void actualizarFeVentaPosCloud(token, {
          ventaLocalId: v.id,
          facturaElectronicaNumero: r.numeroFactura,
          facturaElectronicaCufe: r.alegraCufe,
          facturaElectronicaEnviadoAt: r.enviadoAt,
        }).catch(() => {
          /* nube opcional */
        });
        refrescar();
      } catch (e) {
        window.alert(
          e instanceof Error
            ? `${e.message}\n\nSi falló la red, quedó en cola de reintento al volver conexión.`
            : "No se pudo emitir la factura electrónica."
        );
      } finally {
        setEmitirFeBusyId(null);
      }
    },
    [u, puedeEmitirFeDian, refrescar]
  );

  const puedeDepurarAlegra = useCallback((f: FilaDocumentoPosVenta) => {
    const v = f.venta;
    if (!v) return false;
    return v.tipoComprobanteAlCobro === "factura_electronica" || f.tipo === "factura_electronica";
  }, []);

  const descargarJsonDebugAlegra = useCallback(
    async (f: FilaDocumentoPosVenta) => {
      const v = f.venta;
      if (!v || !puedeDepurarAlegra(f)) return;
      setJsonDebugBusyId(f.id);
      try {
        const token = await auth?.currentUser?.getIdToken();
        if (!token) throw new Error("Sesión expirada. Volvé a iniciar sesión.");
        const payload = buscarPayloadPendientePorVenta(u, v.id) ?? emitirCobroPayloadDesdeVentaLocal(v);
        const slug = (v.facturaElectronicaNumero?.trim() || v.id).replace(/[^\w.-]+/g, "_").slice(0, 48);
        await descargarPaqueteDebugEmitirFePos(token, payload, { slug, ventaLocalId: v.id });
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "No se pudieron generar los archivos de depuración.");
      } finally {
        setJsonDebugBusyId(null);
      }
    },
    [u, puedeDepurarAlegra]
  );

  const abrirTicketVenta = useCallback((v: VentaGuardadaLocal) => {
    void (async () => {
      const base = payloadTicketDesdeVenta(v);
      setTicketConsulta(await enriquecerTicketConQrDomicilios(base));
    })();
  }, []);

  const reimprimirTicketConsulta = useCallback(async () => {
    if (!ticketConsulta) return;
    setReimprimiendoTicket(true);
    try {
      const prefs = loadImpresionPrefs();
      const reservada = prefs.metodo === "directa" ? reservarVentanaTicketNavegador() : null;
      const payload = await enriquecerTicketConQrDomicilios({
        ...ticketConsulta,
        titulo: "TICKET DE VENTA (copia)",
      });
      if (prefs.metodo === "directa") {
        try {
          await imprimirTicketConQz(prefs, payload);
          if (reservada && !reservada.closed) reservada.close();
        } catch {
          imprimirTicketEnNavegador(payload, reservada);
        }
      } else {
        imprimirTicketEnNavegador(payload);
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "No se pudo reimprimir.");
    } finally {
      setReimprimiendoTicket(false);
    }
  }, [ticketConsulta]);

  useEffect(() => {
    if (!u || !pv) {
      setCargando(false);
      setVentasNube([]);
      setCotizaciones([]);
      setRemisiones([]);
      return;
    }
    let cancelled = false;
    setCargando(true);
    setError(null);
    void (async () => {
      try {
        const token = await auth?.currentUser?.getIdToken();
        let nube: VentaGuardadaLocal[] = [];
        if (token) {
          try {
            nube = await listarVentasPosCloud(token);
            if (!cancelled) setNubeOk(true);
          } catch {
            nube = [];
            if (!cancelled) setNubeOk(false);
          }
        }
        const [cotR, remR] = await Promise.all([
          listarDocumentosComerciales(pv, "cotizacion"),
          listarDocumentosComerciales(pv, "remision"),
        ]);
        if (cancelled) return;
        setVentasNube(nube);
        setCotizaciones(cotR.ok ? cotR.items : []);
        setRemisiones(remR.ok ? remR.items : []);
        if (!cotR.ok) setError(cotR.message);
        else if (!remR.ok) setError(remR.message);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error al cargar.");
      } finally {
        if (!cancelled) setCargando(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [u, pv, tick]);

  const ventas = useMemo(() => {
    void tick;
    const local = listarVentasPuntoVentaEnEsteEquipo(pv);
    if (ventasNube === null) return local;
    return mergeVentasReporteNubeLocal(local, ventasNube);
  }, [pv, tick, ventasNube]);

  const todasFilas = useMemo(
    () => construirFilasDocumentosPos({ ventas, cotizaciones, remisiones }),
    [ventas, cotizaciones, remisiones]
  );

  const filasBase = useMemo(
    () =>
      filtrarFilasDocumentosPos(todasFilas, {
        tab,
        desdeYmd,
        hastaYmd,
        busqueda,
        soloVigentes,
      }),
    [todasFilas, tab, desdeYmd, hastaYmd, busqueda, soloVigentes]
  );

  const filas = useMemo(() => {
    return filasBase.map((f) => {
      if (f.fuente !== "documento" || !f.documento) return f;
      const st = emailsDocsEnviados[f.documento.id];
      if (!st) return f;
      return {
        ...f,
        emailEnviado: true,
        emailLabel: "Correo al comprador: ya enviado",
        correoClienteCorto: "Correo ok",
        emailDestino: st.destino,
      };
    });
  }, [filasBase, emailsDocsEnviados]);

  const totalFiltrado = useMemo(
    () => filas.filter((f) => !f.anulada).reduce((s, f) => s + f.total, 0),
    [filas]
  );

  const conteosTab = useMemo(() => {
    const base = filtrarFilasDocumentosPos(todasFilas, {
      tab: "todos",
      desdeYmd,
      hastaYmd,
      busqueda,
      soloVigentes,
    });
    const c: Record<TabDocumentoPosVenta, number> = {
      todos: base.length,
      factura_electronica: 0,
      recibo_pos: 0,
      cotizacion: 0,
      remision: 0,
    };
    for (const f of base) c[f.tipo] += 1;
    return c;
  }, [todasFilas, desdeYmd, hastaYmd, busqueda, soloVigentes]);

  if (!u) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Iniciá sesión para ver los documentos del punto.
      </p>
    );
  }

  if (!pv) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Configurá el punto de venta en tu perfil para listar ventas y documentos.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-10">
      <button
        type="button"
        onClick={onVolver}
        className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100"
      >
        <span aria-hidden>←</span> Configuración
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold text-gray-900">Ventas y documentos del POS</h3>
          <p className="mt-1 text-sm text-gray-600">
            Punto <span className="font-semibold text-gray-800">{pv}</span> · cobros, facturas electrónicas,
            cotizaciones y remisiones
            {nubeOk === true ? " (incluye ventas en nube de todos los cajeros)." : " (ventas de este navegador + documentos en Firestore)."}
          </p>
        </div>
        <button
          type="button"
          onClick={refrescar}
          disabled={cargando}
          className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
        >
          {cargando ? "Actualizando…" : "Actualizar"}
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <label className="block">
          <span className="text-xs font-medium text-gray-600">Desde</span>
          <input
            type="date"
            value={desdeYmd}
            onChange={(e) => setDesdeYmd(e.target.value)}
            className="mt-1 block rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-600">Hasta</span>
          <input
            type="date"
            value={hastaYmd}
            onChange={(e) => setHastaYmd(e.target.value)}
            className="mt-1 block rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="min-w-[12rem] flex-1 block">
          <span className="text-xs font-medium text-gray-600">Buscar</span>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Comprobante, cliente o tipo…"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={soloVigentes}
            onChange={(e) => setSoloVigentes(e.target.checked)}
            className="rounded border-gray-300"
          />
          Ocultar anuladas
        </label>
        <div className="flex flex-wrap gap-1 pb-1">
          <button
            type="button"
            onClick={() => {
              setDesdeYmd(hoy);
              setHastaYmd(hoy);
            }}
            className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => {
              setDesdeYmd(ymdColombiaMenosDias(hoy, 6));
              setHastaYmd(hoy);
            }}
            className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
          >
            7 días
          </button>
          <button
            type="button"
            onClick={() => {
              setDesdeYmd(ymdColombiaMenosDias(hoy, 29));
              setHastaYmd(hoy);
            }}
            className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
          >
            30 días
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-t-lg px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-b-2 border-emerald-600 text-emerald-800"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-xs text-gray-500">({conteosTab[t.id]})</span>
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50/80 px-4 py-3 text-sm">
          <span className="text-gray-700">
            <strong className="text-gray-900">{filas.length}</strong> documento{filas.length === 1 ? "" : "s"}
          </span>
          <span className="font-semibold text-gray-900">
            Total vigente en lista: {formatoPesos(totalFiltrado)}
          </span>
        </div>

        {cargando ? (
          <p className="px-4 py-12 text-center text-sm text-gray-500">Cargando documentos…</p>
        ) : filas.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-gray-500">
            No hay documentos en el rango seleccionado. Probá ampliar las fechas o cambiar el filtro.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-white text-[11px] font-bold uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Comprobante</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Saldo</th>
                  <th className="px-4 py-3">DIAN</th>
                  <th className="px-4 py-3">Alegra</th>
                  <th className="px-4 py-3">Email comprador</th>
                  <th className="px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filas.map((f) => {
                  const abierto = expandidoId === f.id;
                  return (
                    <tr key={f.id} className={f.anulada ? "bg-rose-50/40" : "bg-white hover:bg-gray-50/80"}>
                      <td colSpan={10} className="p-0">
                        <div className="grid grid-cols-[minmax(0,1fr)]">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 md:grid md:grid-cols-[6.5rem_4.25rem_minmax(0,1fr)_minmax(0,1fr)_5.5rem_4.5rem_4.75rem_5rem_5.5rem_9.5rem] md:items-center md:gap-x-2">
                            <span className="text-gray-800 tabular-nums">
                              {formatoFechaTabla(f.fechaYmd, f.fechaMs)}
                            </span>
                            <span className="flex items-center">
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                                  f.tipoComprobanteBadge === "FE"
                                    ? "bg-sky-100 text-sky-900"
                                    : f.tipoComprobanteBadge === "Interno"
                                      ? "bg-stone-200/90 text-stone-800"
                                      : "bg-violet-100 text-violet-900"
                                }`}
                                title={f.tipoLabel}
                              >
                                {f.tipoComprobanteBadge}
                              </span>
                            </span>
                            <span>
                              {f.venta ? (
                                <button
                                  type="button"
                                  onClick={() => abrirTicketVenta(f.venta!)}
                                  className="text-left font-semibold text-emerald-700 underline-offset-2 hover:text-emerald-800 hover:underline"
                                  title="Ver tirilla entregada al cliente"
                                >
                                  {f.comprobante}
                                </button>
                              ) : (
                                <span className="font-semibold text-emerald-800">{f.comprobante}</span>
                              )}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-gray-900">{f.clienteNombre}</span>
                              {f.clienteDocumento ? (
                                <span className="block text-[11px] text-gray-500">{f.clienteDocumento}</span>
                              ) : null}
                            </span>
                            <span
                              className={`text-right font-semibold tabular-nums md:text-right ${
                                f.anulada ? "text-rose-700 line-through" : "text-gray-900"
                              }`}
                            >
                              {formatoPesos(f.total)}
                            </span>
                            <span>
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                  f.saldoLabel === "Pagada"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : f.saldoLabel === "Anulada"
                                      ? "bg-rose-100 text-rose-800"
                                      : "bg-gray-100 text-gray-700"
                                }`}
                              >
                                {f.saldoLabel}
                              </span>
                            </span>
                            <span className="text-xs text-gray-600" title={f.tipoLabel}>
                              {f.dianLabel}
                            </span>
                            <span title={f.alegraEstadoLabel}>
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${clasesBadgeAlegra(f.alegraEstadoCorto)}`}
                              >
                                {textoBadgeAlegraTabla(f.alegraEstadoCorto)}
                              </span>
                            </span>
                            <span>
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                  f.emailEnviado
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-amber-100 text-amber-900"
                                }`}
                                title={f.emailLabel}
                              >
                                {f.correoClienteCorto}
                              </span>
                            </span>
                            <span className="flex flex-col items-end gap-1 text-right">
                              {puedeEmitirFeDian(f) ? (
                                <button
                                  type="button"
                                  disabled={emitirFeBusyId === f.id}
                                  onClick={() => void emitirFeDianManual(f)}
                                  className="text-[11px] font-semibold text-sky-800 hover:underline disabled:opacity-50"
                                  title="Envía esta venta a Alegra/DIAN (consume consecutivo). Si ya existe CUFE, no aparece este botón."
                                >
                                  {emitirFeBusyId === f.id ? "Enviando…" : "Enviar a DIAN"}
                                </button>
                              ) : null}
                              {puedeDepurarAlegra(f) ? (
                                <button
                                  type="button"
                                  disabled={jsonDebugBusyId === f.id}
                                  onClick={() => void descargarJsonDebugAlegra(f)}
                                  className="text-[11px] font-medium text-violet-700 hover:underline disabled:opacity-50"
                                  title="Descarga JSON de payload Alegra, contexto ping y texto (sin emitir otra factura)"
                                >
                                  {jsonDebugBusyId === f.id ? "Generando…" : "JSON Alegra"}
                                </button>
                              ) : null}
                              {f.puedeEnviarCorreo ? (
                                <button
                                  type="button"
                                  onClick={() => setFilaCorreo(f)}
                                  className="text-[11px] font-medium text-emerald-700 hover:underline"
                                >
                                  Enviar por correo
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => setExpandidoId(abierto ? null : f.id)}
                                className="text-[11px] font-medium text-gray-600 hover:underline"
                              >
                                {abierto ? "Cerrar" : "Ver detalle"}
                              </button>
                            </span>
                          </div>
                          {abierto ? <DetalleFila f={f} /> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-500">
        «Alegra» resume si la factura electrónica quedó aceptada en Alegra (emisión con CUFE) o sigue pendiente o sin
        sellar (sin CUFE). «Email comprador» solo indica si mandaste el comprobante por correo al cliente; no tiene que ver
        con la DIAN. El detalle de sellado DIAN está en «DIAN» (Con CUFE / Sin CUFE). «Enviar a DIAN» aparece solo si aún
        no hay CUFE y vuelve a llamar a Alegra (igual que al cobrar). «JSON Alegra» descarga archivos de depuración sin
        emitir otra factura.
      </p>

      <TicketPrevisualizacionModal
        open={ticketConsulta != null}
        ticket={ticketConsulta}
        modoConsulta
        onCerrar={() => setTicketConsulta(null)}
        onImprimir={() => void reimprimirTicketConsulta()}
      />

      {filaCorreo ? (
        <ModalEnviarCorreo
          fila={filaCorreo}
          puntoVenta={pv}
          uid={u}
          onCerrar={() => setFilaCorreo(null)}
          onEnviado={(destino, enviadoAt) => {
            if (filaCorreo.documento) {
              setEmailsDocsEnviados((prev) => ({
                ...prev,
                [filaCorreo.documento!.id]: { destino, enviadoAt },
              }));
            }
            setFilaCorreo(null);
            refrescar();
          }}
        />
      ) : null}
    </div>
  );
}

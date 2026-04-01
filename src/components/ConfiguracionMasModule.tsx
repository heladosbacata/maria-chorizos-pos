"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ConfigImpresionPosGebPanel from "@/components/ConfigImpresionPosGebPanel";
import ContratoPosGebPanel from "@/components/ContratoPosGebPanel";
import DocumentoComercialFranquiciaPanel from "@/components/DocumentoComercialFranquiciaPanel";
import InvitarContadorPanel from "@/components/InvitarContadorPanel";
import PerfilOrganizacionForm from "@/components/PerfilOrganizacionForm";
import PygFranquiciaPanel from "@/components/PygFranquiciaPanel";
import UsuariosPosRegistradosPanel from "@/components/UsuariosPosRegistradosPanel";

/** Id de la herramienta «Perfil de la organización» en CATEGORIAS */
const PERFIL_ORGANIZACION_ITEM_ID = "gen-org-perfil";
/** Id de «Contrato POS GEB» */
const CONTRATO_POS_GEB_ITEM_ID = "gen-org-contrato";
/** Configuración de impresión (QZ Tray / navegador) */
const CONFIG_IMPRESION_POS_GEB_ITEM_ID = "gen-print-posgeb";
/** Id de «Cajeros de turno» — WMS + catálogo de turno (sin cuentas extra) */
const ADMIN_USUARIOS_POS_ITEM_ID = "gen-user-admin";
/** Id de «Invita a tu contador» */
const INVITAR_CONTADOR_ITEM_ID = "gen-user-contador";
/** Ventas → documentos (franquiciado): cotizaciones y remisiones con PDF */
const VEN_DOC_COT_ITEM_ID = "ven-doc-cot";
const VEN_DOC_REM_ITEM_ID = "ven-doc-rem";
/** PyG / estado de resultados simplificado para el franquiciado */
const CONT_PYG_ITEM_ID = "cont-pyg";

const VISTA_DETALLE_ITEM_IDS = new Set<string>([
  PERFIL_ORGANIZACION_ITEM_ID,
  CONTRATO_POS_GEB_ITEM_ID,
  CONFIG_IMPRESION_POS_GEB_ITEM_ID,
  INVITAR_CONTADOR_ITEM_ID,
  ADMIN_USUARIOS_POS_ITEM_ID,
  VEN_DOC_COT_ITEM_ID,
  VEN_DOC_REM_ITEM_ID,
  CONT_PYG_ITEM_ID,
]);

export type ConfigCategoriaId =
  | "general"
  | "habilitaciones-dian"
  | "ventas"
  | "compras-gastos"
  | "clientes-proveedores"
  | "productos-servicios"
  | "contabilidad";

export interface ConfigHerramienta {
  id: string;
  label: string;
}

export interface ConfigSeccion {
  titulo: string;
  items: ConfigHerramienta[];
}

export interface ConfigCategoria {
  id: ConfigCategoriaId;
  label: string;
  secciones: ConfigSeccion[];
}

const CATEGORIAS: ConfigCategoria[] = [
  {
    id: "general",
    label: "General",
    secciones: [
      {
        titulo: "Organización",
        items: [
          { id: "gen-org-perfil", label: "Perfil de la organización" },
          { id: "gen-org-contrato", label: "Contrato POS GEB" },
          { id: CONFIG_IMPRESION_POS_GEB_ITEM_ID, label: "Configuración de impresión" },
        ],
      },
      {
        titulo: "Usuarios",
        items: [
          { id: "gen-user-contador", label: "Invita a tu contador" },
          { id: "gen-user-admin", label: "Cajeros de turno" },
        ],
      },
    ],
  },
  {
    id: "habilitaciones-dian",
    label: "Habilitaciones DIAN",
    secciones: [
      {
        titulo: "Ventas",
        items: [
          { id: "dian-ven-fact", label: "Facturación electrónica" },
          { id: "dian-ven-res", label: "Sincroniza tu resolución" },
        ],
      },
      {
        titulo: "Compras y gastos",
        items: [
          { id: "dian-comp-doc", label: "Documento soporte" },
          { id: "dian-comp-res", label: "Sincroniza tu resolución de documento soporte" },
        ],
      },
      {
        titulo: "Certificado digital",
        items: [{ id: "dian-cert", label: "Seguimiento Certificado digital" }],
      },
    ],
  },
  {
    id: "ventas",
    label: "Ventas",
    secciones: [
      {
        titulo: "Documentos",
        items: [
          { id: VEN_DOC_COT_ITEM_ID, label: "Cotizaciones" },
          { id: VEN_DOC_REM_ITEM_ID, label: "Remisiones" },
        ],
      },
    ],
  },
  {
    id: "compras-gastos",
    label: "Compras y gastos",
    secciones: [
      {
        titulo: "Documentos",
        items: [
          { id: "cg-doc-sop", label: "Documento soporte" },
          { id: "cg-doc-nd", label: "Nota débito / Nota de ajuste documento soporte" },
        ],
      },
      {
        titulo: "Impresión, estilo y envío de documentos",
        items: [
          { id: "cg-imp-sop", label: "Documento soporte" },
          { id: "cg-imp-nd", label: "Nota débito / Nota de ajuste documento soporte" },
        ],
      },
    ],
  },
  {
    id: "clientes-proveedores",
    label: "Clientes y proveedores",
    secciones: [
      {
        titulo: "Generales",
        items: [
          { id: "cp-gen-campos", label: "Campos libres de clientes, proveedores u otros" },
          { id: "cp-gen-mail", label: "Desbloqueo de correos para envío de emails y notificaciones" },
        ],
      },
      {
        titulo: "Importación",
        items: [{ id: "cp-imp", label: "Clientes, proveedores u otros" }],
      },
    ],
  },
  {
    id: "productos-servicios",
    label: "Productos y servicios",
    secciones: [
      {
        titulo: "Generales",
        items: [
          { id: "ps-gen-cat", label: "Categorías de productos y servicios" },
          { id: "ps-gen-precios", label: "Listas de precios de venta" },
        ],
      },
      {
        titulo: "Importación",
        items: [
          { id: "ps-imp-prod", label: "Productos y servicios" },
          { id: "ps-imp-ajuste", label: "Ajuste de inventario" },
          { id: "ps-imp-saldos", label: "Saldos iniciales de inventario" },
          { id: "ps-imp-conteo", label: "Conteo físico" },
        ],
      },
    ],
  },
  {
    id: "contabilidad",
    label: "Contabilidad",
    secciones: [
      {
        titulo: "Estado de resultados",
        items: [{ id: CONT_PYG_ITEM_ID, label: "PyG en vivo — ingresos y gastos" }],
      },
    ],
  },
];

function collectAllIds(categorias: ConfigCategoria[]): string[] {
  const ids: string[] = [];
  for (const cat of categorias) {
    for (const sec of cat.secciones) {
      for (const item of sec.items) {
        ids.push(item.id);
      }
    }
  }
  return ids;
}

const ALL_IDS = collectAllIds(CATEGORIAS);

export interface ConfiguracionMasModuleProps {
  puntoVenta: string | null;
  uid: string | null;
}

function configItemDomId(itemId: string): string {
  return `config-item-${itemId}`;
}

export default function ConfiguracionMasModule({ puntoVenta, uid }: ConfiguracionMasModuleProps) {
  const [categoriaActiva, setCategoriaActiva] = useState<ConfigCategoriaId>("general");
  /** Categorías expandidas en el acordeón del menú lateral */
  const [categoriasExpandidas, setCategoriasExpandidas] = useState<Set<ConfigCategoriaId>>(
    () => new Set<ConfigCategoriaId>(["general"])
  );
  /** Tras cambiar de categoría, desplazar el panel hasta esta herramienta */
  const [pendingScrollItemId, setPendingScrollItemId] = useState<string | null>(null);
  /** Herramienta con vista de detalle (formulario) en el panel principal */
  const [vistaDetalleItemId, setVistaDetalleItemId] = useState<string | null>(null);
  /** Ids completados (desmarcados del fondo rojo = pendiente resuelto) */
  const [completados, setCompletados] = useState<Set<string>>(
    () =>
      new Set<string>([
        PERFIL_ORGANIZACION_ITEM_ID,
        CONTRATO_POS_GEB_ITEM_ID,
        CONFIG_IMPRESION_POS_GEB_ITEM_ID,
        CONT_PYG_ITEM_ID,
      ])
  );

  const categoria = useMemo(
    () => CATEGORIAS.find((c) => c.id === categoriaActiva) ?? CATEGORIAS[0],
    [categoriaActiva]
  );

  const toggleCompletado = useCallback((id: string) => {
    setCompletados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const pendientesCount = useMemo(
    () => ALL_IDS.filter((id) => !completados.has(id)).length,
    [completados]
  );

  const toggleCategoriaExpandida = useCallback((id: ConfigCategoriaId) => {
    setCategoriasExpandidas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const irAHerramienta = useCallback((catId: ConfigCategoriaId, itemId: string) => {
    setCategoriaActiva(catId);
    setCategoriasExpandidas((prev) => new Set(prev).add(catId));
    if (VISTA_DETALLE_ITEM_IDS.has(itemId)) {
      setVistaDetalleItemId(itemId);
      setPendingScrollItemId(null);
    } else {
      setVistaDetalleItemId(catId === "contabilidad" ? CONT_PYG_ITEM_ID : null);
      setPendingScrollItemId(catId === "contabilidad" ? null : itemId);
    }
  }, []);

  const seleccionarSoloCategoria = useCallback((catId: ConfigCategoriaId) => {
    setCategoriaActiva(catId);
    setCategoriasExpandidas((prev) => new Set(prev).add(catId));
    if (catId === "contabilidad") {
      setVistaDetalleItemId(CONT_PYG_ITEM_ID);
    } else {
      setVistaDetalleItemId(null);
    }
  }, []);

  useEffect(() => {
    if (!pendingScrollItemId) return;
    const id = pendingScrollItemId;
    const run = () => {
      const el = document.getElementById(configItemDomId(id));
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        return true;
      }
      return false;
    };
    if (run()) {
      setPendingScrollItemId(null);
      return;
    }
    const t = window.setTimeout(() => {
      run();
      setPendingScrollItemId(null);
    }, 80);
    return () => window.clearTimeout(t);
  }, [categoriaActiva, pendingScrollItemId]);

  return (
    <>
    <div className="flex min-h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm lg:flex-row">
      {/* Sidebar categorías */}
      <aside className="w-full flex-shrink-0 border-b border-gray-200 bg-gray-50/80 lg:w-72 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
          <svg className="h-5 w-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h2 className="text-sm font-semibold text-gray-900">Configuración</h2>
        </div>
        <nav className="max-h-[min(70vh,32rem)] overflow-y-auto p-2 lg:max-h-[calc(100vh-12rem)]" aria-label="Categorías y funciones">
          {CATEGORIAS.map((cat) => {
            const expandida = categoriasExpandidas.has(cat.id);
            const esActiva = categoriaActiva === cat.id;
            return (
              <div key={cat.id} className="mb-1">
                <div
                  className={`flex w-full items-stretch gap-0 overflow-hidden rounded-lg ${
                    esActiva ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => seleccionarSoloCategoria(cat.id)}
                    className={`min-w-0 flex-1 px-3 py-2.5 text-left text-sm font-medium ${
                      esActiva ? "text-blue-700" : "text-gray-700"
                    }`}
                  >
                    {cat.label}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleCategoriaExpandida(cat.id)}
                    className={`flex w-9 flex-shrink-0 items-center justify-center border-l border-black/5 ${
                      esActiva ? "border-blue-200/80" : "border-gray-200/80"
                    }`}
                    aria-expanded={expandida}
                    aria-label={expandida ? `Ocultar funciones de ${cat.label}` : `Mostrar funciones de ${cat.label}`}
                  >
                    <svg
                      className={`h-4 w-4 opacity-70 transition-transform ${expandida ? "rotate-90" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
                {expandida && (
                  <div className="border-l-2 border-blue-200/80 py-1 pl-2 ml-2 mt-0.5 space-y-2">
                    {cat.secciones.map((seccion) => (
                      <div key={`${cat.id}-${seccion.titulo}`}>
                        <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                          {seccion.titulo}
                        </p>
                        <ul className="space-y-0.5">
                          {seccion.items.map((item) => {
                            const hecho = completados.has(item.id);
                            const esCajerosTurno = item.id === ADMIN_USUARIOS_POS_ITEM_ID;
                            return (
                              <li key={item.id}>
                                <button
                                  type="button"
                                  onClick={() => irAHerramienta(cat.id, item.id)}
                                  className="w-full rounded-md px-2 py-1.5 text-left text-xs leading-snug text-gray-600 transition-colors hover:bg-gray-200/80 hover:text-gray-900"
                                >
                                  <span className="mr-1 inline-block w-1.5 rounded-full align-middle" aria-hidden>
                                    <span
                                      className={`block h-1.5 w-1.5 rounded-full ${
                                        hecho || esCajerosTurno ? "bg-emerald-500" : "bg-red-400"
                                      }`}
                                    />
                                  </span>
                                  <span className={esCajerosTurno ? "font-semibold text-emerald-600" : undefined}>
                                    {item.label}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* Panel principal */}
      <div className="min-w-0 flex-1 overflow-y-auto p-6">
        {vistaDetalleItemId === PERFIL_ORGANIZACION_ITEM_ID ? (
          <PerfilOrganizacionForm onVolver={() => setVistaDetalleItemId(null)} />
        ) : vistaDetalleItemId === CONTRATO_POS_GEB_ITEM_ID ? (
          <ContratoPosGebPanel onVolver={() => setVistaDetalleItemId(null)} />
        ) : vistaDetalleItemId === CONFIG_IMPRESION_POS_GEB_ITEM_ID ? (
          <ConfigImpresionPosGebPanel onVolver={() => setVistaDetalleItemId(null)} />
        ) : vistaDetalleItemId === INVITAR_CONTADOR_ITEM_ID ? (
          <InvitarContadorPanel onVolver={() => setVistaDetalleItemId(null)} />
        ) : vistaDetalleItemId === ADMIN_USUARIOS_POS_ITEM_ID ? (
          <UsuariosPosRegistradosPanel onVolver={() => setVistaDetalleItemId(null)} />
        ) : vistaDetalleItemId === VEN_DOC_COT_ITEM_ID ? (
          <DocumentoComercialFranquiciaPanel tipo="cotizacion" onVolver={() => setVistaDetalleItemId(null)} />
        ) : vistaDetalleItemId === VEN_DOC_REM_ITEM_ID ? (
          <DocumentoComercialFranquiciaPanel tipo="remision" onVolver={() => setVistaDetalleItemId(null)} />
        ) : vistaDetalleItemId === CONT_PYG_ITEM_ID ? (
          <PygFranquiciaPanel
            puntoVenta={puntoVenta}
            uid={uid}
            onVolver={() => {
              setVistaDetalleItemId(null);
              setCategoriaActiva("general");
            }}
          />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
              <h3 className="text-xl font-bold text-gray-900">{categoria.label}</h3>
              <p className="text-xs text-gray-500">
                Pendientes: <span className="font-semibold text-red-600">{pendientesCount}</span> · Clic en una herramienta para marcarla como trabajada
              </p>
            </div>

            <div className="space-y-8">
              {categoria.secciones.map((seccion) => (
                <section key={seccion.titulo}>
                  <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                    {seccion.titulo}
                  </h4>
                  <ul className="space-y-2">
                    {seccion.items.map((item) => {
                      const hecho = completados.has(item.id);
                      const esCajerosTurno = item.id === ADMIN_USUARIOS_POS_ITEM_ID;
                      const estadoListo = hecho || esCajerosTurno;
                      return (
                        <li key={item.id} id={configItemDomId(item.id)} className="scroll-mt-4">
                          <button
                            type="button"
                            onClick={() =>
                              VISTA_DETALLE_ITEM_IDS.has(item.id)
                                ? setVistaDetalleItemId(item.id)
                                : toggleCompletado(item.id)
                            }
                            className={`flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                              estadoListo
                                ? esCajerosTurno
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-950 shadow-sm hover:bg-emerald-100/90"
                                  : "border-gray-200 bg-white text-gray-800 hover:bg-gray-50"
                                : "border-red-300 bg-red-100 text-red-950 shadow-sm hover:bg-red-200/90"
                            }`}
                          >
                        <span
                          className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 ${
                            estadoListo
                              ? "border-emerald-500 bg-emerald-500 text-white"
                              : "border-red-700 bg-red-200"
                          }`}
                          aria-hidden
                        >
                          {estadoListo ? (
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : null}
                        </span>
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          <svg
                            className={`h-4 w-4 flex-shrink-0 ${estadoListo ? "text-emerald-600" : "text-red-800"}`}
                            fill="currentColor"
                            viewBox="0 0 24 24"
                            aria-hidden
                          >
                            <path d="M8 5v14l11-7z" />
                          </svg>
                          <span className={esCajerosTurno ? "font-semibold text-emerald-700" : "font-medium"}>
                            {item.label}
                          </span>
                        </span>
                      </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
    </>
  );
}

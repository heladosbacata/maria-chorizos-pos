export type PosGebHelpArticle = {
  id: string;
  title: string;
  summary: string;
  pasos: string[];
  /** Palabras y frases para coincidencia (minúsculas) */
  keywords: string[];
  /** Si existe, el tour puede saltar a este módulo al elegir «Ver en pantalla» */
  moduloSugerido?:
    | "ventas"
    | "ultimosRecibos"
    | "turnos"
    | "cargueInventario"
    | "inventarios"
    | "metasBonificaciones"
    | "reportes"
    | "mas";
  dataTutorialTarget?: string;
};

const ARTICULOS: PosGebHelpArticle[] = [
  {
    id: "abrir-turno",
    title: "Abrir turno de caja",
    summary: "Sin turno abierto no podés registrar ventas en el POS.",
    pasos: [
      "En el menú izquierdo, buscá el bloque rojo «Turno cerrado».",
      "Tocá el bloque: se abre el asistente para elegir quién opera la caja y la base inicial.",
      "Confirmá: el indicador pasará a verde «Turno abierto».",
    ],
    keywords: [
      "turno",
      "abrir turno",
      "cerrar turno",
      "caja",
      "iniciar",
      "comenzar a vender",
      "no puedo vender",
      "turno cerrado",
    ],
    moduloSugerido: "ventas",
    dataTutorialTarget: "turno",
  },
  {
    id: "vender-producto",
    title: "Agregar productos y cobrar",
    summary: "Armá la cuenta en el catálogo y cobrá en el panel derecho.",
    pasos: [
      "Asegurate de tener el turno abierto.",
      "En «Catálogo de productos», tocá un producto para sumarlo a la cuenta (podés elegir variantes si el sistema lo pide).",
      "Revisá «Cuenta a cobrar» a la derecha: total, cliente y tipo de comprobante.",
      "Usá «Cobrar» / registro de pago según el flujo habitual del punto.",
    ],
    keywords: [
      "vender",
      "venta",
      "producto",
      "catálogo",
      "cobrar",
      "cuenta",
      "precuenta",
      "ticket",
      "factura",
    ],
    moduloSugerido: "ventas",
    dataTutorialTarget: "catalogo",
  },
  {
    id: "precuentas",
    title: "Pre-cuentas (varias mesas o pedidos)",
    summary: "Varias cuentas en paralelo con pestañas.",
    pasos: [
      "Arriba del catálogo verás «Pre-cuenta activa» con pestañas.",
      "El botón «+» crea otra pre-cuenta.",
      "Tocá el nombre para activarla; el lápiz renombra; la X anula esa pre-cuenta si hay más de una.",
    ],
    keywords: ["precuenta", "precuentas", "mesa", "tabs", "varias cuentas", "nueva cuenta"],
    moduloSugerido: "ventas",
    dataTutorialTarget: "precuentas",
  },
  {
    id: "ultimos-recibos",
    title: "Últimos recibos y anulaciones",
    summary: "Consultá ventas recientes y gestioná anulaciones permitidas.",
    pasos: [
      "En el menú izquierdo entrá a «Últimos recibos».",
      "Buscá por fecha o referencia según lo que muestre el módulo.",
      "Seguí las acciones indicadas en pantalla para anular o reimprimir si aplica.",
    ],
    keywords: ["recibo", "recibos", "anular", "anulación", "últimos", "ticket anterior", "devolución"],
    moduloSugerido: "ultimosRecibos",
  },
  {
    id: "reportes-cajero",
    title: "Reportes del día",
    summary: "Resumen de ventas y sincronización con el sistema central.",
    pasos: [
      "Menú «Reportes».",
      "Revisá totales, medios de pago y mensajes de error de red si aparecen.",
      "Si algo no cuadra, verificá conexión y reintentá envíos pendientes.",
    ],
    keywords: ["reporte", "reportes", "resumen", "día", "ventas del día", "dashboard", "estadísticas"],
    moduloSugerido: "reportes",
  },
  {
    id: "inventario-cargue",
    title: "Cargue de inventario",
    summary: "Registrar entradas por producto, lote o listas.",
    pasos: [
      "Menú «Cargue inventario».",
      "Completá los datos que pide el formulario (producto, cantidades, lote si aplica).",
      "Guardá: el stock local y la nube se actualizan según reglas del punto.",
    ],
    keywords: ["cargue", "entrada", "inventario", "stock", "recibir mercancía", "lote"],
    moduloSugerido: "cargueInventario",
  },
  {
    id: "inventarios-consulta",
    title: "Inventarios y saldos",
    summary: "Consulta y ajustes de inventario en el POS.",
    pasos: [
      "Menú «Inventarios».",
      "Filtrá o buscá el SKU que necesites.",
      "Usá las acciones disponibles según tu rol (lectura o movimientos administrados).",
    ],
    keywords: ["inventario", "saldos", "existencias", "sku", "consultar stock"],
    moduloSugerido: "inventarios",
  },
  {
    id: "metas-bonificaciones",
    title: "Metas y bonificaciones",
    summary: "Retos y bonos activos para el punto.",
    pasos: [
      "Menú «Metas y bonificaciones».",
      "Revisá metas del periodo y el avance mostrado.",
      "Si hay dudas de reglas, coordiná con casa matriz.",
    ],
    keywords: ["meta", "metas", "bono", "bonificación", "reto", "incentivo"],
    moduloSugerido: "metasBonificaciones",
  },
  {
    id: "mas-config",
    title: "Menú «Más» y configuración",
    summary: "Herramientas avanzadas protegidas por clave.",
    pasos: [
      "Tocá «Más» en el menú lateral.",
      "Ingresá la clave maestra que te proporcionó el administrador.",
      "Ahí encontrás cajeros de turno, impresión, contrato POS y más ajustes.",
    ],
    keywords: ["más", "configuración", "config", "clave", "maestra", "admin", "cajeros de turno", "impresión"],
    moduloSugerido: "mas",
    dataTutorialTarget: "nav-mas",
  },
  {
    id: "contador-invitado",
    title: "Vista contador invitado",
    summary: "Acceso de solo lectura para contadores.",
    pasos: [
      "Tu menú no incluye ventas ni turnos: usá «Últimos recibos» y «Reportes».",
      "El punto de venta está fijado a tu invitación.",
      "Para dudas operativas, contactá al franquiciado.",
    ],
    keywords: ["contador", "invitado", "solo lectura", "no vendo", "permisos"],
    moduloSugerido: "reportes",
  },
  {
    id: "chat-soporte",
    title: "Chat y soporte",
    summary: "Canal rápido desde el menú lateral.",
    pasos: [
      "Al pie del menú izquierdo, botón verde «Chat».",
      "Abrí el chat en otra vista para hablar con el equipo.",
    ],
    keywords: ["chat", "whatsapp", "soporte", "ayuda humana", "contacto"],
  },
  {
    id: "valor-venta-dia",
    title: "Valor de venta del día (reporte manual)",
    summary: "Campo para reportar el total del día cuando aplica ese flujo.",
    pasos: [
      "En «Ventas e ingresos», debajo del catálogo está «Valor de venta del día».",
      "Ingresá el monto y tocá «Enviar reporte».",
      "Es independiente del cobro por ítems: usalo según el procedimiento de tu franquicia.",
    ],
    keywords: ["valor venta", "reporte del día", "enviar reporte", "total día", "manual"],
    moduloSugerido: "ventas",
    dataTutorialTarget: "valor-dia",
  },
  {
    id: "reiniciar-bienvenida-tour",
    title: "Volver a ver la bienvenida o el tour",
    summary: "Cada vez que cerrás sesión se vuelve a preguntar; también podés forzarlo desde Ayuda.",
    pasos: [
      "Lo normal: «Cerrar sesión» y volver a entrar — se muestra otra vez «¿Sos nuevo?» y el tour si elegís que sí.",
      "Sin cerrar sesión: Ayuda GEB (ícono «?») → «Volver a mostrar bienvenida y tour» → se recarga la página.",
    ],
    keywords: [
      "bienvenida",
      "soy nuevo",
      "tour",
      "tutorial",
      "visita guiada",
      "primera vez",
      "reiniciar",
      "volver a preguntar",
    ],
  },
];

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function buscarAyudaPosGeb(consulta: string): PosGebHelpArticle[] {
  const q = normalizar(consulta);
  if (!q) return ARTICULOS.slice(0, 6);

  const scored = ARTICULOS.map((a) => {
    let score = 0;
    const titleN = normalizar(a.title);
    const sumN = normalizar(a.summary);
    if (titleN.includes(q)) score += 12;
    if (sumN.includes(q)) score += 6;
    for (const kw of a.keywords) {
      const kn = normalizar(kw);
      if (!kn) continue;
      if (q.includes(kn) || kn.includes(q)) score += 10;
      if (kn.split(/\s+/).some((w) => w.length > 2 && q.includes(w))) score += 3;
    }
    const words = q.split(/\s+/).filter((w) => w.length > 2);
    for (const w of words) {
      if (titleN.includes(w)) score += 2;
      if (sumN.includes(w)) score += 1;
    }
    return { a, score };
  })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .map((x) => x.a);

  return scored.length ? scored : ARTICULOS.slice(0, 6);
}

export function getArticuloAyudaPorId(id: string): PosGebHelpArticle | undefined {
  return ARTICULOS.find((a) => a.id === id);
}

export function listarArticulosAyuda(): PosGebHelpArticle[] {
  return ARTICULOS;
}

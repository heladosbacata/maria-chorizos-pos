export type PosGebTutorialModulo =
  | "ventas"
  | "ultimosRecibos"
  | "turnos"
  | "cargueInventario"
  | "inventarios"
  | "metasBonificaciones"
  | "reportes"
  | "mas";

export type PosGebTutorialStep = {
  /** Valor de `data-pos-tutorial` en el DOM */
  target: string;
  title: string;
  body: string;
  modulo: PosGebTutorialModulo;
  placement?: "top" | "bottom";
};

export function getPosGebTutorialSteps(esContador: boolean): PosGebTutorialStep[] {
  if (esContador) {
    return [
      {
        target: "sidebar",
        modulo: "reportes",
        title: "Tu espacio de contador",
        body: "Este menú lateral concentra lo que necesitás: recibos, metas y reportes. Todo queda filtrado a tu punto de venta asignado.",
      },
      {
        target: "nav-ultimos",
        modulo: "ultimosRecibos",
        title: "Últimos recibos",
        body: "Acá consultás comprobantes recientes del equipo. Ideal para conciliaciones y seguimiento de ventas registradas.",
      },
      {
        target: "nav-reportes",
        modulo: "reportes",
        title: "Reportes",
        body: "Resumen del día y sincronización. Si algo falla por red, el panel suele indicar cómo reintentar.",
      },
      {
        target: "nav-metas",
        modulo: "metasBonificaciones",
        title: "Metas y bonificaciones",
        body: "Visualizá retos e incentivos activos para el punto. Coordiná dudas con casa matriz si hiciera falta.",
      },
    ];
  }

  return [
    {
      target: "sidebar",
      modulo: "ventas",
      title: "Bienvenido al corazón del POS GEB",
      body: "Este menú lateral es tu mapa: ventas, turnos, inventario, recibos y más. Siempre podés volver acá para cambiar de módulo.",
    },
    {
      target: "turno",
      modulo: "ventas",
      title: "Primero: abrí turno",
      body: "Sin turno abierto no podés vender en caja. Tocá el bloque rojo «Turno cerrado», elegí quién opera y la base inicial. Verás el indicador en verde cuando esté listo.",
    },
    {
      target: "precuentas",
      modulo: "ventas",
      title: "Pre-cuentas inteligentes",
      body: "Gestioná varias cuentas a la vez (mesas o pedidos). Usá el + para otra pre-cuenta y el lápiz para renombrar.",
    },
    {
      target: "catalogo",
      modulo: "ventas",
      title: "Catálogo táctil",
      body: "Tocá un producto para sumarlo a la cuenta. Algunos piden elegir variante (chorizo, arepa, etc.). El buscador acelera cuando hay muchos ítems.",
    },
    {
      target: "cuenta-cobrar",
      modulo: "ventas",
      title: "Cuenta a cobrar",
      body: "Acá ves el total, el cliente, el tipo de comprobante y el flujo de cobro. Es el panel derecho: tu cierre de venta en un vistazo.",
    },
    {
      target: "valor-dia",
      modulo: "ventas",
      title: "Reporte del valor del día",
      body: "Si tu franquicia usa el envío manual del total del día, completalo aquí debajo del catálogo y tocá «Enviar reporte».",
    },
    {
      target: "nav-ultimos",
      modulo: "ultimosRecibos",
      title: "Después de cobrar",
      body: "En «Últimos recibos» revisás ventas recientes, reimpresiones o anulaciones según permisos.",
    },
    {
      target: "ayuda-icon",
      modulo: "ventas",
      title: "Ayuda GEB siempre a mano",
      body: "El ícono de ayuda arriba abre el motor de búsqueda: escribí lo que querés hacer («abrir turno», «anular», «inventario») y seguí la guía paso a paso.",
      placement: "bottom",
    },
  ];
}

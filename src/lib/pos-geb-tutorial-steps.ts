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
        title: "Tu menú lateral (contador)",
        body:
          "Esta columna es tu navegación: no vas a ver ventas ni turnos porque tu cuenta es de consulta para el punto asignado.\n\n" +
          "Todo lo que abras queda filtrado a ese punto de venta. Usá los pasos siguientes para saber qué revisar en cada ícono.",
      },
      {
        target: "nav-ultimos",
        modulo: "ultimosRecibos",
        title: "Últimos recibos",
        body:
          "Acá ves los comprobantes que generó la caja: fechas, totales y referencias según lo que muestre el listado.\n\n" +
          "Sirve para conciliar contra efectivo o banco, verificar que una venta quedó registrada o buscar un ticket para el cliente.\n\n" +
          "Si tu rol lo permite, podrías tener acciones como reimprimir o anular; si no aparecen, es normal en vista contador.",
      },
      {
        target: "nav-metas",
        modulo: "metasBonificaciones",
        title: "Metas y bonificaciones",
        body:
          "Revisá las metas del periodo (ventas, unidades, etc.) y cómo va el avance del franquiciado frente a los retos activos.\n\n" +
          "No modificás reglas acá: solo consultás. Cualquier duda sobre bonos o condiciones la responde casa matriz o el titular.",
      },
      {
        target: "nav-reportes",
        modulo: "reportes",
        title: "Reportes",
        body:
          "Es el resumen del día y la salud de la sincronización con el sistema central: totales, medios de pago y mensajes si algo falló por red.\n\n" +
          "Usalo para cerrar tu revisión numérica antes de informar al franquiciado o al contador externo.",
      },
    ];
  }

  return [
    {
      target: "sidebar",
      modulo: "ventas",
      title: "Barra lateral: todas tus herramientas",
      body:
        "Cada botón de este menú te lleva a un módulo distinto: ventas, turnos, inventario, recibos, metas, reportes y «Más».\n\n" +
        "En el tour siguiente te explicamos qué hacés en cada uno (tareas del día a día). Más abajo volvemos a la pantalla de caja: turno, pre-cuentas, catálogo y cobro.",
    },
    {
      target: "nav-ventas",
      modulo: "ventas",
      title: "Ventas e ingresos",
      body:
        "Es la pantalla donde pasás la mayor parte del tiempo en caja.\n\n" +
        "Ahí cargás productos desde el catálogo, manejás varias pre-cuentas a la vez (mesas o pedidos), ves el total en «Cuenta a cobrar» y registrás el cobro.\n\n" +
        "Debajo del catálogo ves la venta acumulada del turno (total cobrado en esta caja desde que abriste el turno).",
    },
    {
      target: "nav-turnos",
      modulo: "turnos",
      title: "Turnos",
      body:
        "Consultás turnos ya cerrados: fechas, cajero que operó, totales y el detalle que el sistema guardó para ese cierre.\n\n" +
        "No es donde abrís el turno actual: eso sigue siendo el bloque rojo/verde en el menú izquierdo. Este módulo sirve de historial y auditoría.",
    },
    {
      target: "nav-cargue",
      modulo: "cargueInventario",
      title: "Cargue de inventario",
      body:
        "Registrás entradas de mercancía al punto: por producto, cantidad, lote o listas según el formulario que use tu operación.\n\n" +
        "Cada cargue correcto actualiza lo que después ves en «Inventarios» y lo que el POS puede descontar al vender.\n\n" +
        "Hacelo cuando recibís proveedor o traslado, con los datos que te pida el formulario para no duplicar ni omitir lotes.",
    },
    {
      target: "nav-inventarios",
      modulo: "inventarios",
      title: "Inventarios",
      body:
        "Consultás existencias y movimientos del inventario en el POS: SKU, saldos y, si aplica, ajustes o movimientos que tu rol permita.\n\n" +
        "Sirve para verificar stock antes de prometer un producto, auditar diferencias o apoyar un conteo físico sin salir de la caja.",
    },
    {
      target: "nav-ultimos",
      modulo: "ultimosRecibos",
      title: "Últimos recibos",
      body:
        "Listado de ventas recientes con sus tickets: podés buscar por contexto (fecha, referencia) según lo que muestre la pantalla.\n\n" +
        "Desde acá reimprimís o, si tenés permiso, anulás o gestionás lo que la operación permita sobre una venta ya hecha.\n\n" +
        "Es la herramienta típica después de un cobro cuando el cliente volvió por el papel o hubo un error en el ticket.",
    },
    {
      target: "nav-metas",
      modulo: "metasBonificaciones",
      title: "Metas y bonificaciones",
      body:
        "Mirás los retos e incentivos del punto: metas del mes o del periodo, avance en porcentaje o montos, y bonificaciones ligadas a esas reglas.\n\n" +
        "Motiva al equipo mostrando el progreso en pantalla. Las reglas y premios los define la franquicia o casa matriz; acá solo visualizás y seguís el avance.",
    },
    {
      target: "nav-reportes",
      modulo: "reportes",
      title: "Reportes",
      body:
        "Resumen del día para el franquiciado: ventas acumuladas, medios de pago y estado de envío a la nube o al WMS.\n\n" +
        "Si algo no cuadra o hay error de red, suele aparecer un mensaje claro para reintentar o revisar conexión.\n\n" +
        "Usalo al final del turno o cuando el titular pide un pantallazo rápido del desempeño del punto.",
    },
    {
      target: "nav-mas",
      modulo: "ventas",
      title: "Más — solo titular de la franquicia",
      body:
        "Al tocar «Más» el sistema pide una clave maestra. Solo debe ingresar el titular de la franquicia (o una persona que él autorice por escrito), porque ahí hay datos sensibles.\n\n" +
        "Dentro encontrás cosas como: alta y edición de cajeros de turno, preferencias de impresión y ticket, contrato POS GEB, registro de compras y gastos, PYG del punto de venta y herramientas que no debe tocar cualquier cajero.\n\n" +
        "Si no sos titular, no pidas la clave: coordiná con quien administra el punto. El tour no abre este módulo para no interrumpirte con el teclado de clave.",
    },
    {
      target: "ayuda-icon",
      modulo: "ventas",
      title: "Ayuda GEB",
      body:
        "El botón con «?» abre un buscador de ayuda integrado: escribís en lenguaje natural («anular recibo», «abrir turno», «inventario») y te sugiere pasos concretos.\n\n" +
        "Podés volver a abrirlo en cualquier momento del día; no reemplaza al titular ni a soporte, pero acelera las dudas operativas habituales.",
      placement: "bottom",
    },
    {
      target: "turno",
      modulo: "ventas",
      title: "Estado del turno en caja",
      body:
        "El bloque rojo «Turno cerrado» es la puerta de entrada al día: al tocarlo elegís quién opera la caja (franquiciado en apoyo o un cajero del listado) y la base inicial en efectivo.\n\n" +
        "Cuando queda verde «Turno abierto», el sistema ya asocia ventas, recibos y reportes a ese turno.\n\n" +
        "Sin turno abierto el catálogo no te deja vender: primero abrís, vendés, y al cerrar el turno completás el flujo de cierre que te indique el modal.",
    },
    {
      target: "precuentas",
      modulo: "ventas",
      title: "Pre-cuentas",
      body:
        "Las pestañas arriba del catálogo son pre-cuentas independientes: cada una tiene su propia lista de productos y su total hacia «Cuenta a cobrar».\n\n" +
        "El botón + crea otra cuenta; tocás el nombre para activarla; el lápiz renombra (ej. «Mesa 4», «Domicilio López»); la X anula esa pre-cuenta si hay más de una.\n\n" +
        "Así atendés varios clientes a la vez sin mezclar ítems.",
    },
    {
      target: "catalogo",
      modulo: "ventas",
      title: "Catálogo de productos",
      body:
        "Cada tarjeta es un producto del WMS: tocás y se agrega a la pre-cuenta activa. Si el producto lleva variante (chorizo, arepa, combo), el POS abre la selección antes de sumar.\n\n" +
        "El buscador filtra por código, nombre o categoría cuando hay muchos ítems.\n\n" +
        "Los precios y fotos vienen del catálogo central: si algo falta, avisá al titular para que lo corrijan en origen.",
    },
    {
      target: "cuenta-cobrar",
      modulo: "ventas",
      title: "Cuenta a cobrar",
      body:
        "Panel derecho con el detalle de la venta activa: líneas, descuentos si los hay, total, cliente (o consumidor final), tipo de comprobante y vendedor si aplica.\n\n" +
        "El botón de cobrar abre el flujo de medios de pago, vueltos y confirmación; al terminar se genera el ticket y, según configuración, la impresión o el envío.\n\n" +
        "Revisá siempre el total y el tipo de documento antes de confirmar.",
    },
    {
      target: "valor-dia",
      modulo: "ventas",
      title: "Venta acumulada del turno",
      body:
        "Debajo del catálogo ves el total cobrado en esta caja desde que abriste el turno: suma todas las ventas confirmadas (todas las pre-cuentas).\n\n" +
        "Se actualiza automáticamente con cada cobro; no hace falta cargar un monto a mano.\n\n" +
        "Con el turno cerrado el acumulado se reinicia al abrir uno nuevo.",
    },
  ];
}

/** Contenido de https://e-provider-docs.alegra.com/docs/proceso-de-habilitación-en-la-dian */

export const ALEGRA_DIAN_HABILITACION_DOC_URL =
  "https://e-provider-docs.alegra.com/docs/proceso-de-habilitaci%C3%B3n-en-la-dian";

export const DIAN_URL_HABILITACION = "https://catalogo-vpfe-hab.dian.gov.co/User/Login";
export const DIAN_URL_USUARIOS_REGISTRADOS = "https://muisca.dian.gov.co/WebArquitectura/DefLoginMb.faces";
export const DIAN_URL_FACTURANDO = "https://catalogo-vpfe.dian.gov.co/User/Login";
export type GuiaInline =
  | string
  | { text: string; href?: string; strong?: boolean; em?: boolean };

export type GuiaBloque =
  | { type: "p"; parts: GuiaInline[] }
  | { type: "ol"; items: GuiaInline[][] }
  | { type: "ul"; items: GuiaInline[][] }
  | { type: "video"; youtubeId: string; observa?: boolean }
  | { type: "image"; src: string; alt?: string }
  | { type: "callout"; variant: "warn" | "info"; title: string; parts?: GuiaInline[]; items?: GuiaInline[][] };

export type GuiaPasoAlegra = {
  numero: number;
  titulo: string;
  bloques: GuiaBloque[];
};

export const ALEGRA_DIAN_HABILITACION_INTRO: GuiaInline[] = [
  "Este proceso está compuesto por 2 partes: registro en la DIAN como facturador electrónico y configurar modo de operación que consiste en indicarle a la DIAN cuál será tu proveedor tecnológico.",
];

export const ALEGRA_DIAN_HABILITACION_PASOS: GuiaPasoAlegra[] = [
  {
    numero: 1,
    titulo: "Registro",
    bloques: [
      {
        type: "ol",
        items: [
          [
            "Ingresa a la página de la DIAN en la opción ",
            { text: '"', strong: false },
            { text: "Habilitación", href: DIAN_URL_HABILITACION, strong: true },
            { text: '".', strong: false },
          ],
          [
            "Ingresa tus datos de inicio de sesión seleccionando el tipo de usuario, así:",
          ],
        ],
      },
      {
        type: "ul",
        items: [
          [
            "Empresa: si eres persona jurídica, ingresa la cédula del representante legal y el NIT de la compañía.",
          ],
          ["Persona: si eres persona natural, elige el tipo de documento e ingresa el número de identificación."],
        ],
      },
      {
        type: "ol",
        items: [
          [
            "Recibirás en tu correo electrónico (registrado en el RUT) el token de acceso a la plataforma, para ingresar haz clic en “Acceder”.",
          ],
          ['Haz clic en el botón “Registro y habilitación” y luego en la opción “Documentos electrónicos”.'],
          [
            "Ingresa un correo electrónico para la recepción de facturas. Te recomendamos usar el mismo correo de tu cuenta de Alegra.",
          ],
          [
            'Haz clic en el botón “Registrar” y luego en “Aceptar” para confirmar que deseas registrarte como facturador.',
          ],
        ],
      },
      { type: "video", youtubeId: "ejC2r2gtqSM", observa: true },
    ],
  },
  {
    numero: 2,
    titulo: "Configura los modos de operación en la DIAN",
    bloques: [
      {
        type: "ol",
        items: [
          [
            "Ingresa de nuevo a la página de la DIAN en la opción ",
            { text: '"', strong: false },
            { text: "Habilitación", href: DIAN_URL_HABILITACION, strong: true },
            { text: '".', strong: false },
          ],
          ["Ingresa tus datos de inicio de sesión seleccionando el tipo de usuario, así:"],
        ],
      },
      {
        type: "ul",
        items: [
          [
            "Empresa: si eres persona jurídica, ingresa la cédula del representante legal y el NIT de la compañía.",
          ],
          ["Persona: si eres persona natural, elige el tipo de documento e ingresa el número de identificación."],
        ],
      },
      {
        type: "ol",
        items: [
          [
            "Recibirás en tu correo electrónico (registrado en el RUT) el token de acceso a la plataforma, para ingresar haz clic en “Acceder”.",
          ],
          [
            'Selecciona la opción menú y elige "Registro y habilitación" opción “Documentos electrónicos”, haz clic en el botón “Factura electrónica”, observarás una pantalla para “Asociar modo de operación”.',
          ],
          ['Despliega la casilla “Selecciona el modo de operación” y elige la opción “Software de un proveedor tecnológico”.'],
          [
            "Ubica la sección “Datos de empresa y software”. En el campo “Nombre de la empresa proveedora” elige Soluciones Alegra S.A.S. y en el campo “Nombre del software” elige el que se relacione con Alegra.",
          ],
          ['Haz clic en el botón “Asociar”.'],
        ],
      },
      { type: "video", youtubeId: "dODgMJbluqQ", observa: true },
      {
        type: "p",
        parts: [
          "Cuando realices estos pasos podrás ver en la parte inferior el proveedor tecnológico asociado y opciones para consultar el detalle del set de pruebas o eliminarlo cuando sea necesario.",
        ],
      },
      {
        type: "p",
        parts: [
          "Debes copiar el código del set de pruebas que encuentras en el detalle del set para usarlo en el siguiente paso:",
        ],
      },
      {
        type: "image",
        src: "https://files.readme.io/f3de43b-Listado_modo_de_operacion.png",
        alt: "Listado modo de operación",
      },
      {
        type: "image",
        src: "https://files.readme.io/d954861-Set_de_pruebas_FE.png",
        alt: "Set de pruebas factura electrónica",
      },
    ],
  },
  {
    numero: 3,
    titulo: "Envío del Set de pruebas",
    bloques: [
      {
        type: "p",
        parts: [
          "En la ",
          { text: "pantalla principal de Habilitación", href: DIAN_URL_HABILITACION, strong: true },
          " de la DIAN (después del paso 2), abrí el detalle del set de pruebas y copiá el ",
          { text: "identificador del set de pruebas", strong: true },
          " (TestSetId). Suele verse como un código con guiones, por ejemplo ",
          { text: "a70562e0-631e-4ceb-aa65-36887b57dc17", em: true },
          ".",
        ],
      },
      {
        type: "p",
        parts: [
          "Pegalo en el recuadro de abajo y guardalo. ",
          { text: "Grupo Bacatá", strong: true },
          " lo verá en el sistema para enviar el set de pruebas en Alegra y ayudarte con la configuración. No tenés que usar la API ni ningún otro portal: solo copiar y pegar ese código.",
        ],
      },
      {
        type: "p",
        parts: [
          "Cuando la DIAN apruebe el set de pruebas, recibirás un correo de confirmación. Ahí podés continuar con el paso 4.",
        ],
      },
    ],
  },
  {
    numero: 4,
    titulo: "Solicita una resolución electrónica",
    bloques: [
      {
        type: "p",
        parts: [
          "Para facturar electrónicamente debes contar con una resolución de facturación electrónica, es diferente a la que has venido utilizando para facturación por computador o talonario, se realiza en línea a través del portal Muisca de la DIAN, es muy fácil y la diferencia es que esta es una resolución tipo electrónica.",
        ],
      },
      {
        type: "ol",
        items: [
          [
            "Ingresa a la página web de la DIAN en la opción ",
            { text: '"', strong: false },
            { text: "Usuarios Registrados", href: DIAN_URL_USUARIOS_REGISTRADOS, strong: true },
            { text: '".', strong: false },
          ],
          ["Completa el formulario e inicia sesión."],
          [
            'Dirígete al menú ubicado en la parte izquierda. Elige la opción "Numeración de facturación" y nuevamente "Numeración de facturación".',
          ],
          ['Haz clic en "Solicitar numeración de facturación", el sistema confirmará tus datos, haz clic en "Aceptar". y luego en "Ingresar".'],
          [
            'Haz clic en "Autorizar Rangos", elige el tipo de numeración (Facturación electrónica de venta) y escribe un prefijo (para facturación electrónica se recomienda "FE"), haz clic en “Agregar".',
          ],
          ['Genera el borrador para revisar la solicitud y luego haz clic en "Definitivo".'],
          [
            'En la ventana emergente solicita la clave dinámica, haz clic en el botón "Solicítela aquí", luego haz clic en el botón "Ver mi bandeja de comunicaciones" cópiala y pégala, ingresa tu contraseña y luego haz clic en "Firmar" y luego "Aceptar".',
          ],
          ['En la opción "Formalice la solicitud de numeración de facturación" debes hacer clic en el botón "Firmar".'],
          [
            'Haz clic en el botón "Solicítela aquí" para solicitar la clave dinámica, luego haz clic en el botón "Ver mi bandeja de comunicaciones" cópiala y pégala, ingresa tu contraseña, haz clic en "Firmar" y luego "Aceptar".',
          ],
        ],
      },
      {
        type: "p",
        parts: [
          { text: "Nota:", strong: true },
          " debes asegurarte que la resolución que descargues inicie con los números 1876.",
        ],
      },
      {
        type: "callout",
        variant: "warn",
        title: "Importante:",
        parts: [
          "Si ya tienes una resolución electrónica puedes continuar facturando con ella, solo debes eliminar la asociación con tu proveedor anterior y asociarla a Alegra.",
        ],
      },
      { type: "video", youtubeId: "_Uvqt1cR6nw", observa: true },
    ],
  },
  {
    numero: 5,
    titulo: "Asocia tus prefijos de facturación al proveedor tecnológico",
    bloques: [
      {
        type: "p",
        parts: [
          "Cuando recibas el correo en el que se te indica que el proceso del set de pruebas fue exitoso y que ya te encuentras habilitado como facturador electrónico, debes asociar tus prefijos de facturación. Este proceso debes hacerlo aunque ya tengas asociado los prefijos en tu resolución.",
        ],
      },
      {
        type: "p",
        parts: [
          { text: "Nota:", strong: true },
          ' Este paso deberás realizarlo por lo menos 1 hora después de haber solicitado la resolución, ya que es el tiempo promedio que se demora la DIAN para subir tu numeración a la sección "facturando electrónicamente" y puedas asociar los prefijos.',
        ],
      },
      {
        type: "ol",
        items: [
          [
            "Ingresa a la página de la DIAN por la opción ",
            { text: "“", strong: false },
            { text: "Facturando Electrónicamente", href: DIAN_URL_FACTURANDO, strong: true },
            { text: "”.", strong: false },
          ],
          [
            'Selecciona el tipo de usuario e ingresa tus datos de inicio de sesión, revisa tu correo electrónico y haz clic en "Acceder" para ingresar a la plataforma.',
          ],
          ['Haz clic en el botón “Configuración” y selecciona la opción “Rangos de numeración”.'],
          ["En el campo “Proveedor - Software” selecciona Soluciones Alegra S.A.S."],
          ["En “Prefijo” selecciona la resolución que solicitaste previamente y haz clic en el botón “Agregar”."],
          ['Haz clic en el botón “Aceptar” para confirmar la acción.'],
        ],
      },
      { type: "video", youtubeId: "8V4bsq-oAas", observa: true },
      {
        type: "callout",
        variant: "warn",
        title: "Importante:",
        parts: [
          'Si tienes problemas con alguno de los pasos que se hacen en la pagina de la DIAN puedes corregirlo haciendo clic en el botón "Sincronizar contribuyente" en la opción "Habilitación" ubicado en la pagina de la DIAN. Esta acción corregirá errores cómo:',
        ],
        items: [
          ['Si ya estás habilitado y no puedes entrar a la opción "Facturando electrónicamente".'],
          ["Si al momento de asociar rangos de numeración no te aparece la numeración electrónica que creaste en el paso anterior."],
          ["Si al momento de asociar prefijos no te aparece el proveedor tecnológico asociado previamente."],
        ],
      },
    ],
  },
  {
    numero: 6,
    titulo: "Indica la fecha de salida a producción",
    bloques: [
      {
        type: "p",
        parts: [
          "Este paso consiste en indicarle a la DIAN la fecha en que empiezas a hacer facturas electrónicas, con esto se actualizará tu RUT con la responsabilidad 52 denominada “Facturador electrónico”.",
        ],
      },
      {
        type: "ol",
        items: [
          [
            "Ingresa de nuevo a la página de la DIAN en la opción ",
            { text: '"', strong: false },
            { text: "Habilitación", href: DIAN_URL_HABILITACION, strong: true },
            { text: '".', strong: false },
          ],
          [
            'Selecciona el tipo de usuario e ingresa tus datos de inicio de sesión, revisa tu correo electrónico y haz clic en "Acceder" para ingresar a la plataforma.',
          ],
          ["Ingresa la fecha de cuándo quieres salir a producción (empezar a facturar) y haz clic en “Aceptar”."],
          [
            'Verás una notificación que te indica que tu RUT será actualizado con la responsabilidad "52 - Facturador Electrónico" y la fecha registrada, haz clic en “Aceptar”.',
          ],
        ],
      },
      { type: "video", youtubeId: "0DsBw75KbJM", observa: true },
      {
        type: "callout",
        variant: "info",
        title: "Nota:",
        parts: [
          "Si ya realizaste el proceso de asociar tus prefijos a Alegra y al ingresar desde la opción de Habilitación no te aparece el campo para indicar tu fecha de salida a producción, te recomendamos ingresar por el menú Participantes y allí encontrarás esta opción disponible para elegir la fecha en que tu RUT será actualizado.",
        ],
      },
    ],
  },
];

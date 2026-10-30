import type { SiteContent } from "@/content/types";
import { ENV } from "@/env.server";

const content: SiteContent = {
  cases: {
    "capsule-collections": {
      description:
        "Lanza una pequeña cápsula print-on-demand en torno a un tema: ideas investigadas, gráficos revisados para impresión, fichas de Fourthwall con margen y una campaña de Meta en pausa.",
      exampleBrief:
        "Una cápsula de primavera de cuatro piezas con dibujos botánicos de línea desvaída, verdes apagados y blanco hueso, para quienes cultivan plantas en el balcón.",
      faq: [
        {
          answer:
            "De tres a seis piezas es un buen tamaño: suficiente para que parezca una colección, pero lo bastante pequeño para editarlo con cuidado y presentarlo pieza a pieza.",
          question: "¿Cuántas piezas debe tener una cápsula?",
        },
        {
          answer:
            "Sí. Lanza un drop por pieza o por idea con el mismo brief, aprueba los diseños que van juntos y rechaza los que no.",
          question: "¿Pueden las piezas compartir un mismo estilo?",
        },
        {
          answer:
            "Cada producto se tarifica según el coste base de su propio blank, así que una camiseta y una sudadera de la misma cápsula conservan cada una al menos 10 $ de beneficio y un 30 % de margen.",
          question: "¿Cómo se tarifican blanks distintos en una misma cápsula?",
        },
      ],
      lead: "Una cápsula es un conjunto pequeño y editado de piezas en torno a una idea. wovain investiga el tema, prepara los gráficos según tu dirección, publica en Fourthwall las piezas que apruebas y deja la campaña preparada, en pausa.",
      name: "Colecciones cápsula",
      related: ["fourthwall", "fal", "meta"],
      situation:
        "Piensas en colecciones, no en productos sueltos. Una cápsula tiene que encajar: una paleta, un ambiente, unas pocas siluetas. En print-on-demand, la parte del diseño es la divertida; las fichas, los precios y los anuncios de cada pieza son lo que convierte una cápsula pequeña en un trabajo grande.",
      steps: [
        {
          body: "Describe el tema, la paleta y para quién es la cápsula, como harías con un estudio.",
          title: "Briefea la cápsula",
        },
        {
          body: "wovain propone direcciones dentro de tu tema, cada una con sus fuentes y una nota sobre lo saturadas que están las fichas similares.",
          title: "Elige las direcciones",
        },
        {
          body: "Aprueba los gráficos que van juntos. Devuelve los demás con una nota, como «el mismo grosor de línea que el primero».",
          title: "Edita para dar coherencia",
        },
        {
          body: "Las piezas aprobadas se convierten en productos ocultos de Fourthwall sobre blanks reales, cada uno tarificado según su propio coste base. Publícalos juntos.",
          title: "Publica el conjunto",
        },
        {
          body: "Hay una campaña de Meta en pausa lista para cada pieza, con anuncios escritos desde distintos ángulos. Actívalos para el lanzamiento.",
          title: "Prepara el lanzamiento",
        },
      ],
      tips: [
        "Decide la paleta antes que los motivos. Dos o tres colores de tinta en toda la cápsula hacen que se lea como una sola colección.",
        "Combina blanks a propósito: una camiseta, una sudadera más pesada y un tote dan tres precios a partir de una sola idea.",
        "Publica todas las piezas el mismo día, para que la cápsula llegue como un conjunto y no a cuentagotas.",
        "Ponle a las piezas nombres de colección («Estudio de helecho n.º 1, 2, 3») para que cada ficha remita a las demás.",
        "Empieza la campaña con un presupuesto diario pequeño y mira qué pieza genera respuesta antes de gastar más.",
      ],
      title: "Lanza una colección cápsula print-on-demand, editada por ti",
    },
    "graphic-tees": {
      description:
        "Convierte una idea gráfica en camisetas que se venden: diseños revisados a tamaño de pecho, blanks reales de Fourthwall con precio para 10 $ de beneficio y una campaña de Meta en pausa.",
      exampleBrief:
        "Camisetas pesadas con un único motivo de estilo linograbado, costero y algo seco, para quienes nadan en agua fría.",
      faq: [
        {
          answer:
            "Depende del coste base del blank en Fourthwall. Un blank de 12 $ se vende a 24 $, lo que deja 10,33 $ tras las comisiones de tarjeta, el impuesto sobre las ventas y una reserva para reembolsos.",
          question: "¿A cuánto se vende una camiseta típica?",
        },
        {
          answer:
            "Antes de que lo veas, cada borrador se revisa en cuanto a tamaño de impresión, legibilidad a tamaño de pecho y número de colores.",
          question: "¿Se imprimirá bien el gráfico?",
        },
        {
          answer:
            "Todavía no. wovain prepara los gráficos a partir de tu brief y tú los vas ajustando con notas hasta que quedan bien.",
          question: "¿Puedo subir mi propia ilustración?",
        },
      ],
      lead: "Una buena camiseta gráfica es una idea fuerte, bien impresa y con el precio adecuado. wovain prepara el gráfico según tu dirección, lo revisa para impresión y publica la camiseta en tu tienda de Fourthwall con un margen que se sostiene.",
      name: "Camisetas gráficas",
      related: ["fourthwall", "fal", "meta"],
      situation:
        "Tienes un lenguaje gráfico: una línea, un estilo tipográfico, una manera de dibujar. Las camisetas son la forma más directa de ponerlo delante de la gente, y el print-on-demand evita el stock. Lo que no quieres es una semana de maquetas, guías de tallas, cuentas de precios y ajustes de anuncios por cada camiseta nueva.",
      steps: [
        {
          body: "Describe el motivo, el estilo y quién la lleva. Di qué evitar, por ejemplo «sin eslóganes».",
          title: "Briefea el gráfico",
        },
        {
          body: "wovain prepara gráficos para cada idea y los revisa en cuanto a tamaño de impresión, legibilidad a tamaño de pecho y colores.",
          title: "Mira borradores revisados",
        },
        {
          body: "Aprueba los que firmarías. Rechaza con una nota, como «letra más pesada», para otra ronda.",
          title: "Edita y aprueba",
        },
        {
          body: "La camiseta se crea oculta sobre un blank real de Fourthwall, con precio según su coste base. Publícala cuando la página te convenza.",
          title: "Publica la camiseta",
        },
        {
          body: "Anuncios desde varios ángulos esperan en una campaña de Meta en pausa hasta que la actives.",
          title: "Prepara los anuncios",
        },
      ],
      tips: [
        "Diseña para tamaño de pecho. Un gráfico que se lee a 10 pulgadas de ancho se leerá en la calle; el detalle fino a menudo no.",
        "Menos colores de tinta imprimen más limpio y mantienen el estilo coherente entre colores de prenda.",
        "Los blanks pesados cuestan más, pero transmiten mejor el estilo de un sello. El suelo de margen del 30 % mantiene el precio honesto.",
        "Mira la página real del producto en tu teléfono antes de decírselo a nadie.",
        "Que el ángulo del anuncio case con el gráfico: una camiseta seca y minimalista pide un texto seco y minimalista.",
      ],
      title:
        "Camisetas gráficas print-on-demand, preparadas según tu dirección",
    },
    "independent-labels": {
      description:
        "Print-on-demand para sellos independientes: investigación, gráficos preparados según tu dirección, fichas de Fourthwall con margen y anuncios de Meta en pausa. Tú apruebas cada paso.",
      exampleBrief:
        "Un drop tranquilo de otoño para mi sello: gráficos workwear desgastados, óxido y azul marino, para quienes arreglan su propia ropa.",
      faq: [
        {
          answer:
            "Tú. Escribes la dirección, apruebas cada pieza y puedes rechazar cualquier borrador con una nota. Nada se publica sin tu sí.",
          question: "¿Quién decide lo que lanza mi sello?",
        },
        {
          answer:
            "No. wovain trabaja con blanks print-on-demand en Fourthwall. No gestiona producción de corte y confección.",
          question: "¿wovain se encarga del corte y confección?",
        },
        {
          answer:
            "En tu propia tienda de Fourthwall, con el nombre de tu sello. Fourthwall imprime, envía y gestiona el pago.",
          question: "¿Dónde se venden los productos?",
        },
        {
          answer:
            "No. Cada campaña se crea en pausa, con el presupuesto diario que elijas. El gasto solo empieza cuando la apruebas, y wovain solo la inicia cuando sus reglas de gasto están activas.",
          question: "¿Se publicarán anuncios sin mí?",
        },
      ],
      lead: "Llevas un sello pequeño y cada lanzamiento es una semana de gestión. wovain se encarga de la investigación, las fichas, los precios y la preparación de anuncios de un drop print-on-demand, y te deja a ti las decisiones de gusto.",
      name: "Sellos independientes",
      related: ["fourthwall", "fal", "meta", "chatgpt"],
      situation:
        "Tu sello son de una a cinco personas. La misma persona dirige el arte, hace el merchandising, contesta correos y lleva los anuncios. El print-on-demand te permite lanzar sin stock, pero cada drop sigue significando investigación, archivos, fichas, cuentas de precios y una campaña. Quieres un ritmo de lanzamientos constante sin perder el estilo del sello.",
      steps: [
        {
          body: "Escribe la dirección como se lo explicarías a un estudio: ambiente, referencias, para quién es.",
          title: "Fija la dirección",
        },
        {
          body: "wovain mira qué le interesa a tu público esta semana y sugiere ideas, cada una con sus fuentes.",
          title: "Revisa las ideas",
        },
        {
          body: "Se preparan gráficos para cada idea y se revisan para impresión. Aprueba o devuelve con una nota.",
          title: "Edita los borradores",
        },
        {
          body: "Los diseños aprobados se convierten en productos ocultos en tu tienda de Fourthwall, con precio para al menos 10 $ de beneficio y un 30 % de margen.",
          title: "Publica en Fourthwall",
        },
        {
          body: "Varios anuncios, escritos desde distintos ángulos, esperan en una campaña de Meta en pausa hasta que la actives.",
          title: "Prepara la campaña",
        },
      ],
      tips: [
        "Mantén un brief por drop. Una dirección concreta da una primera ronda coherente.",
        "Di qué no hace nunca el sello («sin eslóganes», «sin neón») para que los borradores partan ya dentro de tus reglas.",
        "Lanza con ritmo, por ejemplo un drop pequeño al mes. Una cadencia constante es más fácil de promocionar que un gran lanzamiento.",
        "Lee las fuentes detrás de una idea antes de elegirla. Un tema ligado a las noticias de una semana puede envejecer rápido.",
        "Activa el piloto automático solo cuando confíes en los primeros drops que hayas llevado tú mismo.",
      ],
      title: "Print-on-demand para sellos independientes, sin la gestión",
    },
    "streetwear-drops": {
      description:
        "Lleva drops limitados de streetwear en print-on-demand: ideas ajustadas a esta semana, gráficos según tu dirección, fichas de Fourthwall con margen justo y anuncios de Meta en pausa.",
      exampleBrief:
        "Un drop de una semana de camisetas y sudaderas oversize, gráficos de fotocopia con grano, para quienes patinan de noche.",
      faq: [
        {
          answer:
            "Las piezas print-on-demand se fabrican tras cada pedido, así que un drop no tiene stock que agotar. Lo haces limitado en el tiempo: lo publicas y lo ocultas en Fourthwall cuando se cierra la ventana.",
          question: "¿Puede un drop print-on-demand ser limitado?",
        },
        {
          answer:
            "Las sudaderas siguen la misma regla que las camisetas: al menos 10 $ de beneficio y un 30 % de margen sobre el coste base del blank. Un blank de 35 $ se vende a 50 $ y deja 12 $.",
          question: "¿Cómo se tarifican las sudaderas?",
        },
        {
          answer:
            "wovain revisa los borradores para detectar nombres y marcas que no debes usar, pero tú sigues siendo responsable de lo que publicas. Mantén otras marcas fuera de la impresión.",
          question: "¿Puedo hacer referencia a otras marcas?",
        },
      ],
      lead: "El streetwear vive del momento. wovain mira qué se mueve esta semana dentro de tu tema, prepara gráficos según tu dirección y deja listas las fichas y los anuncios para que el drop esté a punto cuando tú lo estés.",
      name: "Drops de streetwear",
      related: ["fourthwall", "fal", "meta"],
      situation:
        "Tu sello lanza en ventanas cortas. Cada drop necesita una razón para existir ahora, unos pocos gráficos fuertes y todo en línea a la vez. En print-on-demand te libras del riesgo de stock, pero la preparación de cada lanzamiento sigue siendo el cuello de botella.",
      steps: [
        {
          body: "Nombra el tema, el estilo gráfico y el público. Añade la ventana, por ejemplo «una semana».",
          title: "Briefea el drop",
        },
        {
          body: "Las ideas llegan con el contexto de esta semana y una nota sobre lo saturadas que ya están las fichas similares.",
          title: "Elige un ángulo de actualidad",
        },
        {
          body: "Aprueba los gráficos que dan en el clavo. Rechaza el resto con una nota para otra ronda.",
          title: "Edita los gráficos",
        },
        {
          body: "Los productos se crean ocultos sobre blanks reales y con precio según el margen. Publícalos todos a la hora del drop.",
          title: "Publica para el drop",
        },
        {
          body: "La campaña espera, en pausa, con anuncios desde varios ángulos. Actívala cuando se abra el drop.",
          title: "Abre el drop",
        },
      ],
      tips: [
        "Anuncia la ventana antes del drop y respétala. Oculta los productos en Fourthwall cuando se cierre.",
        "Los blanks oversize y pesados encajan con el estilo y admiten un precio más alto. El suelo de margen lo fija por ti.",
        "Usa un único lenguaje gráfico en camisetas y sudaderas para que el drop se lea como un solo lanzamiento.",
        "Mantén otras marcas, logotipos y personajes fuera de la impresión.",
        "Mantén los anuncios solo mientras el drop esté abierto y luego desactívalos.",
      ],
      title:
        "Drops de streetwear en print-on-demand, con su momento y preparados",
    },
  },
  guides: {
    "launch-a-capsule-drop": {
      description:
        "Una guía práctica para lanzar un drop cápsula print-on-demand: investigación, diseño y revisiones de impresión, edición, publicación en Fourthwall, variantes de anuncios y campaña en pausa.",
      faq: [
        {
          answer:
            "De tres a seis piezas. Suficiente para que parezca una colección, pero lo bastante pequeño para editarlo con cuidado y promocionarlo pieza a pieza.",
          question: "¿Cuántas piezas debe tener una primera cápsula?",
        },
        {
          answer:
            "Empieza poco, unos dólares al día, y sube el presupuesto solo en el anuncio que da resultados. Tu beneficio por venta marca el límite.",
          question: "¿Cuánto debo gastar en anuncios de Meta para un drop?",
        },
        {
          answer:
            "Sí: investigación, gráficos preparados con revisiones de impresión, fichas de Fourthwall y una campaña de Meta en pausa. Tú apruebas cada paso y tú activas la campaña.",
          question: "¿wovain hace todo esto?",
        },
        {
          answer:
            "Sí. Publica los productos y compártelos tú mismo. La campaña en pausa puede esperar hasta que quieras más alcance.",
          question: "¿Puedo lanzar sin anuncios?",
        },
      ],
      lead: "Un drop cápsula tiene seis partes: investigación, diseño, revisiones, edición, publicación y anuncios. Aquí tienes cómo llevar cada una, qué comprobar antes de que el dinero se mueva y una lista de verificación para guardar.",
      published: "2026-10-26",
      readingMinutes: 5,
      sections: [
        {
          heading: "Investigación: gusto, momento y saturación",
          paragraphs: [
            "Las buenas ideas de drop están donde se cruzan tres cosas. A tu público le gusta el tema. Algo sobre él está en el ambiente esta semana. Y no hay demasiadas tiendas que ya lo vendan.",
            "Primero, el gusto. Pregunta qué más aman quienes te compran: las películas, la música, los lugares y los estilos que comparten. Un sello para quienes cultivan plantas quizá encuentre una veta más rica en las mañanas lentas y los viejos catálogos de semillas que en una hoja más sobre una camiseta.",
            "Después, el momento. Mira las noticias de la última semana dentro de ese tema. Una estación, un aniversario o un evento da al drop una razón para existir ahora y algo que decir en el anuncio.",
            "Por último, revisa las fichas existentes. Busca la idea en los grandes marketplaces de print-on-demand. Si hay cientos de copias casi idénticas, tu versión tiene que ser mucho mejor, o debes elegir otro ángulo.",
            "Anota por qué cada idea entró en la lista. Reutilizarás esas razones en el texto del anuncio, y te ayudan a descartar ideas que solo parecían buenas por un día.",
          ],
        },
        {
          heading: "Diseña y revisa antes de que nadie lo vea",
          list: [
            "Tamaño de impresión: el archivo debe ser lo bastante grande para el área de impresión. wovain rechaza todo lo que mida menos de 2880 px de ancho.",
            "Colores: la tinta debe leerse sobre el color de la prenda. Un arte oscuro sobre una camiseta oscura desaparece.",
            "Legibilidad: la tipografía y el trazo deben aguantar a tamaño de pecho.",
            "Originalidad: ninguna otra marca, artista, título de película ni personaje salvo que tengas los derechos.",
          ],
          paragraphs: [
            "Convierte cada idea en un brief corto: qué se imprime, el estilo, los colores de la prenda y qué evitar. Luego haz varios candidatos en lugar de uno.",
            "Comprueba cada diseño con estas reglas sencillas antes de enamorarte de él. Un diseño que falla una de ellas es más barato de arreglar ahora que cuando un cliente abre el paquete.",
            "En wovain, cada borrador llega con una revisión de impresión marcada como listo o por retocar, con lo que hay que arreglar. La regla del tamaño de impresión es fija, así que un archivo demasiado pequeño nunca pasa.",
          ],
        },
        {
          heading: "Edita como una colección",
          paragraphs: [
            "La edición es donde más cuenta tu ojo. Aprueba las piezas a las que pondrías tu nombre. Rechaza el resto con una línea de motivo, como «letra demasiado fina» o «quita las hojas», para que la siguiente ronda sea mejor.",
            "Edita para el conjunto, no solo para la pieza suelta. La misma paleta, el mismo grosor de línea, un solo ambiente. Una cápsula ajustada de cuatro se lee más fuerte que una docena dispersa.",
          ],
        },
        {
          heading: "Publica en Fourthwall a un precio que compense",
          paragraphs: [
            "Crea cada producto sobre el blank elegido y fija un precio que supere tu suelo tras las comisiones. Una regla sencilla es al menos 10 $ de beneficio por venta y un 30 % de margen, el que dé más: una camiseta de 12 $ se vende a 24 $, un blank de 25 $ a 38 $.",
            "Mantén los productos ocultos hasta que las páginas estén bien: fotos, título, tallas y precio. Luego publica el conjunto a la vez y abre cada página real una vez, como lo haría un comprador.",
            "Publica antes de anunciar. Una publicación que sale mientras los productos siguen ocultos manda a la gente a un enlace muerto, y esa primera oleada de atención es difícil de recuperar.",
          ],
        },
        {
          heading: "Escribe anuncios desde distintos ángulos",
          paragraphs: [
            "Un solo anuncio te dice muy poco. Dos o tres, cada uno desde un ángulo distinto, te dicen a qué responde tu público.",
            "Elige ángulos realmente distintos: el oficio (cómo se hace y se imprime la pieza), la identidad («para quienes arreglan su propia ropa») y el momento (la razón para comprar esta semana). Mantén el mismo producto para que el ángulo sea lo único que cambia.",
            "Mantén el texto corto y veraz. Di qué es la pieza, para quién es y por qué ahora. Evita afirmaciones que no puedas respaldar, como «el más vendido» en un producto lanzado hoy.",
          ],
        },
        {
          heading:
            "Por qué la campaña empieza en pausa y cómo elegir un presupuesto",
          paragraphs: [
            "Una campaña que sale en línea en cuanto se construye puede gastar antes de que nadie haya leído los anuncios. Construirla en pausa te da un momento tranquilo para revisarlo todo, y no se gasta nada hasta que decidas.",
            "Para el presupuesto diario, empieza poco. Unos dólares al día bastan para ver qué anuncio consigue clics sin arriesgar mucho. El gasto en anuncios sale de tu beneficio por venta, así que un margen de 10 $ deja poco espacio para clics caros. wovain acepta un presupuesto diario de 1 $ a 500 $, y puedes cambiarlo en Meta en cualquier momento.",
            "Da a cada prueba unos días antes de juzgarla. Una tarde tranquila dice poco; un patrón de varios días dice más.",
          ],
        },
        {
          heading: "Tu lista de verificación previa al lanzamiento",
          list: [
            "Cada pieza está publicada y su página carga en tu teléfono.",
            "El precio, las tallas y los colores de cada página son los que aprobaste.",
            "Cada anuncio enlaza al producto correcto.",
            "Los titulares no prometen nada que las piezas no cumplan.",
            "Los países coinciden con donde quieres vender.",
            "El presupuesto diario es uno que te parece bien gastar cada día.",
            "Tienes planeada una publicación o un boletín para el lanzamiento.",
            "Sabes cuándo vas a mirar los resultados, por ejemplo a los tres días.",
          ],
          paragraphs: [
            "Repásala antes de activar la campaña. Lleva diez minutos y evita la mayoría de los errores.",
          ],
        },
      ],
      title:
        "Cómo lanzar un drop cápsula print-on-demand, de la idea a una campaña en pausa",
    },
    "price-print-on-demand": {
      description:
        "Una guía clara para poner precio a piezas print-on-demand: coste base, comisiones de tarjeta, impuestos y reembolsos, un suelo de 10 $ de beneficio y de 30 % de margen, con ejemplos.",
      faq: [
        {
          answer:
            "Lo suficiente para que el trabajo merezca la pena tras todas las comisiones. Un suelo de 10 $ por venta, más al menos un 30 % de margen en blanks más caros, es una regla de partida razonable.",
          question: "¿Cuál es un buen beneficio por venta print-on-demand?",
        },
        {
          answer:
            "Puedes trasladar el envío al comprador, pero también se cobra comisión de tarjeta sobre él. Cuenta esa comisión al comprobar tu beneficio.",
          question: "¿Debo incluir el envío en mi precio?",
        },
        {
          answer:
            "Duplicar sirve para blanks baratos, pero encarece de más los caros e ignora las comisiones. Un suelo de beneficio más un suelo de margen cubren ambos extremos.",
          question: "¿Por qué no simplemente duplicar el coste base?",
        },
        {
          answer:
            "Sí. Los productos se crean ocultos en tu tienda de Fourthwall y puedes editar el precio allí antes o después de publicar.",
          question: "¿Puedo cambiar el precio que fija wovain?",
        },
      ],
      lead: "La mayoría de los precios en print-on-demand fallan igual: coste base más un número redondo, y las comisiones se llevan el resto. Aquí tienes una regla sencilla que mantiene al menos 10 $ por venta, con las cuentas a la vista.",
      published: "2026-10-26",
      readingMinutes: 5,
      sections: [
        {
          heading: "Parte del coste base",
          paragraphs: [
            "Todo producto print-on-demand empieza con un coste base: lo que cobra la plataforma por imprimir y fabricar un artículo sobre un blank concreto. Una camiseta básica puede costar 12 $, una pesada 15 $, una sudadera de 25 $ a 35 $. Cambia según el blank, el área de impresión y a veces el color.",
            "El coste base es el único número que no puedes negociar en cada venta, así que es donde debe empezar el precio. Búscalo para el blank y la impresión exactos que piensas vender, no para la versión más barata de ese producto.",
            "El error es quedarse ahí y añadir un número redondo. «Coste base más 10 $» suena a 10 $ de beneficio, pero no lo es. Varios costes pequeños salen de cada venta antes de que el dinero te llegue.",
          ],
        },
        {
          heading: "Cuenta lo que sale de cada venta",
          list: [
            "Comisión de tarjeta: 2,9 % del precio + envío + impuesto, más 0,30 $",
            "Envío: trasladado al comprador (5 $ en los ejemplos de abajo)",
            "Impuesto sobre las ventas: trasladado (7 % en los ejemplos de abajo)",
            "Reserva para reembolsos: 2 % del precio",
          ],
          paragraphs: [
            "Tres costes son fáciles de olvidar porque no aparecen en la página del producto.",
            "Comisiones de tarjeta. Los procesadores de pago suelen cobrar un porcentaje más una cantidad fija por pedido. Una tarifa habitual es 2,9 % más 0,30 $. El porcentaje se aplica a todo el pedido que paga el comprador, incluidos el envío y el impuesto sobre las ventas, no solo a tu precio.",
            "Impuesto sobre las ventas. Lo cobras y lo trasladas, así que no es ingreso. Pero hace más grande el pedido y, por tanto, la comisión de tarjeta.",
            "Reembolsos. Algunos pedidos vuelven: talla equivocada, paquete perdido, un cambio de opinión. Apartar una pequeña parte de cada precio, como un 2 %, hace que un reembolso no borre el beneficio de varias ventas más.",
          ],
        },
        {
          heading: "Fija dos suelos: 10 $ de beneficio y un 30 % de margen",
          paragraphs: [
            "Un buen precio supera dos pruebas a la vez.",
            "El suelo de beneficio: tras el coste base, las comisiones de tarjeta y la reserva para reembolsos, cada venta deja al menos 10 $. Es suficiente para que merezca la pena una venta y un correo de cliente. Puedes elegir otro número, pero elige uno y mantenlo.",
            "El suelo de margen: la diferencia entre precio y coste base es al menos el 30 % del precio, que se escribe (precio − coste base) ÷ precio ≥ 30 %. Una cantidad fija de 10 $ es mucho en una camiseta de 12 $, pero poco en una sudadera de 35 $. El suelo de margen asegura que las piezas más caras conserven una parte justa.",
            "Toma el suelo que dé el precio más alto y redondea hacia arriba al dólar entero. Los precios en dólares enteros se leen más limpios en una página de producto.",
          ],
        },
        {
          heading: "Ejemplos resueltos",
          list: [
            "Coste base 8 $ → precio 20 $, beneficio 10,53 $",
            "Coste base 12 $ → precio 24 $, beneficio 10,33 $",
            "Coste base 15 $ → precio 27 $, beneficio 10,18 $",
            "Coste base 20 $ → precio 33 $, beneficio 10,87 $",
            "Coste base 25 $ → precio 38 $, beneficio 10,62 $",
            "Coste base 35 $ → precio 50 $, beneficio 12,00 $",
          ],
          paragraphs: [
            "Aquí está la regla aplicada a seis costes base, con 5 $ de envío, 7 % de impuesto, comisiones de tarjeta de 2,9 % más 0,30 $ y una reserva del 2 % para reembolsos. El beneficio es lo que queda tras el coste base, la comisión de tarjeta y la reserva.",
            "Veamos la camiseta de 12 $ paso a paso. Una primera estimación de 22 $ (base más 10 $) parece correcta. A 22 $, el pedido es 22 $ + 5 $ de envío + 1,54 $ de impuesto = 28,54 $. La comisión de tarjeta es de unos 1,13 $ y la reserva de 0,44 $, así que el beneficio es 8,43 $. No basta. A 23 $ es 9,38 $. A 24 $ el pedido es 30,68 $, la comisión de tarjeta 1,19 $, la reserva 0,48 $, y el beneficio es 10,33 $. Así que el precio es 24 $.",
            "Ahora el blank de 35 $. Base más 10 $ serían 45 $, pero a 45 $ el margen es solo del 22 % y el beneficio tras comisiones es 7,26 $. El suelo de margen del 30 % fija el precio en 50 $, que deja 12,00 $. En los blanks caros, el suelo que importa es el de margen.",
          ],
        },
        {
          heading: "Cuándo poner un precio más alto",
          paragraphs: [
            "Los suelos son un mínimo, no un objetivo. Muchas piezas de un sello pueden y deben venderse por encima.",
            "Pon un precio más alto cuando el drop es limitado, cuando el diseño dio mucho trabajo o hay que pagar a un colaborador, o cuando tus compradores ya pagan más por tu sello en otro sitio. Hazlo también si piensas poner anuncios: el gasto en anuncios sale de esos 10 $, así que una pieza que necesita alcance de pago necesita más margen.",
            "Pon un precio cercano al suelo cuando el objetivo sea el alcance y no el ingreso: un primer drop, o una pieza barata que la gente pueda comprar por impulso. Aun así, no bajes del suelo. Una venta que deja 3 $ no compensa la carga de atención al cliente.",
            "Elijas lo que elijas, comprueba los números reales de tu tienda. Los tipos de impuesto, el envío y las comisiones varían según el país y la plataforma, así que aplica la regla con tus propios datos.",
          ],
        },
        {
          heading: "Cómo lo aplica wovain por ti",
          paragraphs: [
            "wovain usa exactamente esta regla. Cuando un diseño se convierte en producto, wovain lee el coste base real del blank de Fourthwall y fija el precio en dólares enteros más bajo que supera a la vez 10 $ de beneficio y un 30 % de margen tras las comisiones de tarjeta, el impuesto sobre las ventas y una reserva del 2 % para reembolsos. El precio, el beneficio y el margen se muestran junto al producto, así que ves la cuenta y no solo el resultado.",
            "La regla es fija, así que el piloto automático no puede saltársela. Los productos se crean ocultos, por lo que puedes cambiar el precio en Fourthwall antes de publicar si quieres situarte por encima del suelo.",
          ],
        },
      ],
      title:
        "Cómo poner precio a piezas print-on-demand para que cada venta deje beneficio",
    },
  },
  integrations: {
    chatgpt: {
      category: "App en ChatGPT",
      connection: "yours",
      data: "ChatGPT envía tus peticiones a wovain. wovain usa la misma cuenta, los mismos drops y las mismas conexiones que el sitio web, así que puedes empezar un drop en el chat y terminarlo en la web.",
      description:
        "Añade wovain a ChatGPT y lleva un drop print-on-demand con palabras sencillas: ideas, gráficos preparados, fichas de Fourthwall y una campaña de Meta en pausa, con tu aprobación.",
      docsPath: "/docs/chatgpt",
      faq: [
        {
          answer:
            "Sí. Los mismos pasos, aprobaciones y reglas funcionan en ambos sitios, y los drops iniciados en ChatGPT aparecen en Ejecuciones en el sitio web.",
          question: "¿Es lo mismo que el sitio web?",
        },
        {
          answer:
            "Sí. Pide un drop con el piloto automático activado. Llega hasta un producto publicado y una campaña en pausa, con los mismos límites de precio y presupuesto que en la web.",
          question: "¿Puedo usar el piloto automático desde ChatGPT?",
        },
        {
          answer:
            "Sí. ChatGPT te da un enlace de conexión para cada cuenta que aún falte, y tú autorizas tu propia tienda y tu propia cuenta publicitaria.",
          question: "¿Sigo teniendo que conectar Fourthwall y Meta?",
        },
      ],
      lead: "Si ya planificas en ChatGPT, también puedes llevar tu drop allí. Añade wovain como app, describe el drop y di que sí en cada paso.",
      name: "ChatGPT",
      related: [
        "independent-labels",
        "capsule-collections",
        "graphic-tees",
        "streetwear-drops",
      ],
      setup: `En ChatGPT, activa el modo desarrollador, añade un conector personalizado con ${ENV.MCP_URL}, inicia sesión en wovain y permite el acceso.`,
      steps: [
        {
          body: `En los ajustes de ChatGPT, activa el modo desarrollador y añade un conector personalizado con la URL ${ENV.MCP_URL}.`,
          title: "Añade wovain a ChatGPT",
        },
        {
          body: "ChatGPT abre la página de inicio de sesión de wovain. Tras iniciar sesión, permites que ChatGPT use tu cuenta de wovain.",
          title: "Inicia sesión y permite el acceso",
        },
        {
          body: "Si una cuenta aún no está conectada, ChatGPT te da un enlace para conectarla.",
          title: "Conecta tus cuentas",
        },
        {
          body: "Describe el drop con tus propias palabras, como «un drop de primavera de dibujos botánicos de línea desvaída para mi sello».",
          title: "Pide un drop",
        },
        {
          body: "ChatGPT te pregunta antes de aprobar un diseño, publicar productos o montar la campaña. La campaña se sigue creando en pausa.",
          title: "Aprueba cada paso",
        },
      ],
      title:
        "wovain en ChatGPT: planifica y lanza un drop print-on-demand desde un chat",
    },
    fal: {
      category: "Ilustración",
      connection: "yours",
      data: "wovain envía a fal la dirección de arte de cada idea y recibe el gráfico. Las imágenes se generan en tu cuenta de fal y se guardan con tu drop.",
      description:
        "Conecta tu cuenta de fal a wovain. Dibuja los gráficos de cada idea según tu dirección, a resolución de impresión, y cada borrador se revisa para impresión antes de que lo veas.",
      docsPath: "/docs/connecting-accounts#fal",
      faq: [
        {
          answer:
            "fal factura la generación de imágenes a tu propia cuenta de fal, a los precios de fal. El plan de wovain es aparte; consulta la página de precios.",
          question: "¿Quién paga las imágenes?",
        },
        {
          answer: "Sí. Tus briefs y los diseños que apruebas son tuyos.",
          question: "¿Los gráficos son míos?",
        },
        {
          answer:
            "Rechaza el borrador con una nota, como «línea más pesada», y wovain dibuja otra ronda para la misma idea.",
          question: "¿Qué hago si un borrador no está bien?",
        },
      ],
      lead: "fal es donde se dibujan los gráficos. wovain convierte cada idea en una dirección de arte, fal la dibuja en tu cuenta y wovain revisa el resultado para impresión antes de que lo edites.",
      name: "fal",
      related: ["graphic-tees", "capsule-collections", "streetwear-drops"],
      setup: "Abre Conexiones en wovain y conecta tu cuenta de fal.",
      steps: [
        {
          body: "Cada idea se convierte en una dirección de arte breve: qué se imprime, el estilo, los colores y qué evitar.",
          title: "Escribe la dirección de arte",
        },
        {
          body: "fal dibuja el gráfico en tu cuenta como arte de impresión cuadrado y transparente.",
          title: "Dibuja el gráfico",
        },
        {
          body: "El borrador se revisa en cuanto a tamaño de impresión, legibilidad a tamaño de pecho y colores, y se marca como listo o por retocar.",
          title: "Revísalo para impresión",
        },
        {
          body: "Apruebas el borrador o lo devuelves con una nota para otra ronda.",
          title: "Edita con wovain",
        },
      ],
      title:
        "fal y wovain: gráficos dibujados según tu dirección y revisados para impresión",
    },
    fourthwall: {
      category: "Tienda print-on-demand",
      connection: "yours",
      data: "wovain lee los blanks del catálogo y sus costes base, y envía tu ilustración aprobada, el título, la descripción y el precio para crear productos en tu tienda. La conexión se guarda cifrada y puedes desconectarla en Conexiones en cualquier momento.",
      description:
        "Conecta tu tienda de Fourthwall a wovain. Los diseños aprobados se convierten en productos sobre blanks reales, con precio para dejar 10 $ de beneficio por venta, y siguen ocultos hasta que publiques.",
      docsPath: "/docs/connecting-accounts#fourthwall",
      faq: [
        {
          answer:
            "Sí. wovain crea los productos en la tienda que conectes, así que son tuyos desde el principio. Sigues gestionando la tienda en Fourthwall como siempre.",
          question: "¿Necesito mi propia tienda de Fourthwall?",
        },
        {
          answer:
            "No. Los productos se crean ocultos y salen en línea cuando los publicas. La única excepción es el piloto automático, que activas tú mismo para un drop.",
          question: "¿Saldrán productos en línea sin mí?",
        },
        {
          answer:
            "A partir del coste base del blank: al menos 10 $ de beneficio por venta y al menos un 30 % de margen, el que dé más, redondeado al dólar entero hacia arriba. Después puedes cambiar el precio en Fourthwall.",
          question: "¿Cómo fija wovain el precio?",
        },
        {
          answer:
            "No. Los pedidos, los pagos y los mensajes de clientes se quedan en tu tienda de Fourthwall. wovain solo crea y publica productos.",
          question: "¿wovain gestiona mis pedidos?",
        },
      ],
      lead: "Fourthwall es donde tus piezas se publican y se venden. wovain lee su catálogo para obtener blanks reales y sus costes base, y luego convierte los diseños que apruebas en productos de tu propia tienda.",
      name: "Fourthwall",
      related: [
        "independent-labels",
        "capsule-collections",
        "graphic-tees",
        "streetwear-drops",
      ],
      setup:
        "Inicia sesión en wovain, abre Conexiones y autoriza tu propia tienda de Fourthwall.",
      steps: [
        {
          body: "wovain consulta los blanks reales de Fourthwall y sus costes base, así que cada precio, beneficio y margen que ves es un número real.",
          title: "Lee el catálogo",
        },
        {
          body: "El precio parte del coste base del blank y supera al menos 10 $ de beneficio y un 30 % de margen tras las comisiones de tarjeta, el impuesto sobre las ventas y una reserva para reembolsos. Un blank de 12 $ se vende a 24 $.",
          title: "Pon precio a cada pieza",
        },
        {
          body: "Tu ilustración aprobada se sube y el producto se crea con su título, descripción y precio. Sigue oculto, así que todavía no aparece nada en tu tienda.",
          title: "Crea el producto, oculto",
        },
        {
          body: "Revisas el producto y lo publicas. Solo entonces sale en línea en tu tienda. Con el piloto automático, wovain publica por ti cuando pasan todas las revisiones.",
          title: "Publica cuando tú lo digas",
        },
      ],
      title:
        "Fourthwall y wovain: del diseño aprobado a un producto en tu tienda",
    },
    meta: {
      category: "Anuncios",
      connection: "yours",
      data: "wovain envía el texto de los anuncios, el enlace del producto y los países y el presupuesto que elegiste a tu cuenta publicitaria para crear la campaña. Nunca activa el gasto. La conexión se guarda cifrada y puedes desconectarla en Conexiones en cualquier momento.",
      description:
        "wovain escribe varios anuncios de Meta para cada pieza y construye la campaña, el conjunto de anuncios y los anuncios en tu cuenta publicitaria, todo en pausa hasta que lo actives.",
      docsPath: "/docs/connecting-accounts#meta",
      faq: [
        {
          answer:
            "No. Cada campaña, conjunto de anuncios y anuncio se crea en pausa, y no se gasta nada hasta que apruebes la campaña. Entonces wovain la inicia, pero solo cuando sus reglas de gasto y las reglas automatizadas de Meta están activas.",
          question: "¿Puede wovain gastar mi presupuesto publicitario?",
        },
        {
          answer:
            "Cualquier cantidad de 1 $ a 500 $ al día. Empezar poco es una buena forma de ver a qué anuncio responde la gente antes de gastar más.",
          question: "¿Qué presupuesto diario puedo fijar?",
        },
        {
          answer:
            "Hasta tres por producto, cada uno desde un ángulo distinto, con un anuncio por variante dentro de una campaña.",
          question: "¿Cuántos anuncios escribe wovain?",
        },
        {
          answer:
            "Sí. Son objetos normales de tu cuenta publicitaria, así que puedes cambiar el texto, la audiencia o el presupuesto en el Administrador de anuncios de Meta antes de activarlos.",
          question: "¿Puedo editar los anuncios antes de que se publiquen?",
        },
      ],
      lead: "Meta es donde se publican tus anuncios. wovain escribe los anuncios y construye toda la campaña en tu cuenta publicitaria, y se detiene ahí: la campaña se crea en pausa, así que tú decides cuándo empieza a moverse el dinero.",
      name: "Meta",
      related: [
        "independent-labels",
        "capsule-collections",
        "graphic-tees",
        "streetwear-drops",
      ],
      setup:
        "Abre Conexiones en wovain y autoriza tu propia cuenta publicitaria de Meta y tu Página.",
      steps: [
        {
          body: "wovain escribe hasta tres anuncios por producto, cada uno desde un ángulo distinto, con su propio titular y mensaje.",
          title: "Escribe los anuncios",
        },
        {
          body: "Eliges dónde deben mostrarse los anuncios y un presupuesto diario entre 1 $ y 500 $. Puedes cambiar ambos más tarde en Meta.",
          title: "Elige países y un presupuesto",
        },
        {
          body: "wovain crea una campaña por producto, un conjunto de anuncios y un anuncio por variante en tu cuenta publicitaria. Cada objeto se crea en pausa.",
          title: "Construye la campaña, en pausa",
        },
        {
          body: "Revisa los anuncios, la audiencia y el presupuesto, en wovain o en el Administrador de anuncios de Meta, y aprueba la campaña cuando estés listo para gastar. wovain la inicia cuando sus reglas de gasto están activas.",
          title: "Revisa y aprueba",
        },
      ],
      title:
        "Anuncios de Meta para los drops de tu sello, construidos por ti y creados en pausa",
    },
  },
};

export default content;

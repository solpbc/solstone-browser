browser.about.block = extensión de solstone { $version } · { $os } { $os_version } · { $arch }
    { $journal }

browser.about.daysago = { $count ->
    [one] hace { $count } día
    [many] hace { $count } días
   *[other] hace { $count } días
}

browser.about.extensionversion = extensión de solstone { $value1 }

browser.about.hoursago = { $count ->
    [one] hace { $count } hora
    [many] hace { $count } horas
   *[other] hace { $count } horas
}

browser.about.journalunknown = diario desconocido

browser.about.justnow = justo ahora

browser.about.lastseen = { $space }· visto por última vez { $value1 }

browser.about.lines = { $own }
    { $journal }

browser.about.minutesago = { $count ->
    [one] hace { $count } minuto
    [many] hace { $count } minutos
   *[other] hace { $count } minutos
}

browser.brand.name = solstone

browser.chrome.addthissite = agregar este sitio

browser.chrome.dismiss = ocultar

browser.chrome.inyourbrowser = en tu navegador

browser.chrome.itgoesto = va a

browser.copy.accessdeniedhelp = { $surface ->
   *[safari-desktop] para incluir uno, ponlo en Permitir en la configuración de sitios web de Safari para solstone.
    [safari-mobile] para incluir uno, ponlo en Permitir en Ajustes, en Apps, Safari, Extensiones, solstone.
}

browser.copy.accessgrantedjoin = { $granted }

browser.copy.accessgrantednote = { $surface ->
   *[safari-desktop] un sitio en Denegar en la configuración de sitios web de Safari sigue desactivado.
    [safari-mobile] en Ajustes, en Apps, Safari, Extensiones, solstone, un sitio en Denegar sigue desactivado.
}

browser.copy.addblockedbelow = Safari no preguntará por { $arg1 } mientras permite { $under }. para agregar { $arg3 }, ponlo en Permitir en la configuración de sitios web de Safari.

browser.copy.adddenied = permiso rechazado. no se agregó nada.

browser.copy.added = { $scope ->
   *[exact] se agregó { $host }.
    [whole] se agregaron todos los sitios y páginas de { $host }.
}

browser.copy.addedjoined = { $scope ->
   *[exact] se agregó { $host }.
    [whole] se agregaron todos los sitios y páginas de { $host }.
}

browser.copy.addhelp = agregar bank.com comparte cada sitio y página de bank.com, como www.bank.com y login.bank.com. para compartir solo una parte, agrega esa dirección, como mail.google.com.

browser.copy.addhelpjoined = { $browser ->
    [firefox] un sitio que permites en la propia configuración de Firefox también está activado.
    [edge] un sitio que permites en la propia configuración de Edge también está activado.
    [chrome] un sitio que permites en la propia configuración de Chrome también está activado.
    [safari] un sitio que permites en la propia configuración de Safari también está activado.
   *[other] un sitio que permites en la propia configuración de tu navegador también está activado.
}

browser.copy.addhelpsuffix = { $browser ->
    [firefox] un sitio que permites en la propia configuración de Firefox también se agrega aquí.
    [edge] un sitio que permites en la propia configuración de Edge también se agrega aquí.
    [chrome] un sitio que permites en la propia configuración de Chrome también se agrega aquí.
    [safari] un sitio que permites en la propia configuración de Safari también se agrega aquí.
   *[other] un sitio que permites en la propia configuración de tu navegador también se agrega aquí.
}

browser.copy.addnotnow = no se puede agregar un sitio ahora. el estado de arriba dice por qué.

browser.copy.allowin = { $browser ->
    [firefox] permitir en Firefox
    [edge] permitir en Edge
    [chrome] permitir en Chrome
    [safari] permitir en Safari
   *[other] permitir en tu navegador
}

browser.copy.allowsallofbutthe = { $value1 } permite todo lo de { $value2 }, pero la extensión de solstone recibe solo la parte de eso que agregaste. compartir todo eso puede incluir mensajes en sitios de correo y de chat, y palabras que escribiste pero no enviaste, y todo va a tu diario.

browser.copy.allowseverywebsitesoevery = { $value1 } permite cada sitio web, así que cada sitio está activado, salvo lo que dejas fuera.

browser.copy.allowsmoreofsomesites = { $value1 } permite más de algunos sitios que agregaste, como { $value2 }, pero la extensión de solstone recibe solo las partes de ellos que agregaste. compartirlos todos puede incluir mensajes en sitios de correo y de chat, y palabras que escribiste pero no enviaste, y todo va a tu diario.

browser.copy.allowsmorethanyoursites = { $value1 } permite más que tus sitios. { $value2 }

browser.copy.allowsthesolstoneextensionon = { $value1 } permite la extensión de solstone en cada sitio web, pero solo se reciben los sitios que agregaste. compartir cada sitio incluye mensajes en sitios de correo y de chat, y palabras que escribiste pero no enviaste, y todo va a tu diario.

browser.copy.allowsthesolstoneextensionon2 = { $value1 } permite la extensión de solstone en sitios que no agregaste, como { $value2 }, pero solo se reciben los sitios que agregaste. compartirlos puede incluir mensajes en sitios de correo y de chat, y palabras que escribiste pero no enviaste, y todo va a tu diario.

browser.copy.allsitesandpagesare = todos los sitios y páginas de { $value1 } ya no están dejados fuera.

browser.copy.alreadyallowseverywebsiteso = { $value1 } ya permite cada sitio web, así que aceptar comparte cada sitio. para elegir sitios uno por uno en su lugar, cambia eso en { $value2 } primero.

browser.copy.appleftoutaway = la app de solstone también lo deja fuera.

browser.copy.appleftoutsiteson = queda fuera de tu diario, incluida esta ventana del navegador en tu pantalla y la actividad.

browser.copy.appleftoutunreadable = la extensión de solstone lo deja fuera. la app de solstone no puede leer las direcciones de página de { $value1 } ahora, así que { $value1 } queda fuera de lo que la app recibe de tu pantalla hasta que pueda leerlas.

browser.copy.apponlyleftout = fuera en la app de solstone

browser.copy.browsermenu = la barra de herramientas o el menú de extensiones de tu navegador

browser.copy.browsername = { $brand ->
    [firefox] Firefox
    [edge] Edge
    [chrome] Chrome
    [safari] Safari
   *[other] tu navegador
}

browser.copy.checkagain = revisar de nuevo

browser.copy.checking = { $browser ->
    [firefox] revisando Firefox…
    [edge] revisando Edge…
    [chrome] revisando Chrome…
    [safari] revisando Safari…
   *[other] revisando tu navegador…
}

browser.copy.couldntcheck = { $browser ->
    [firefox] no se pudo revisar qué permite Firefox. vuelve a intentarlo.
    [edge] no se pudo revisar qué permite Edge. vuelve a intentarlo.
    [chrome] no se pudo revisar qué permite Chrome. vuelve a intentarlo.
    [safari] no se pudo revisar qué permite Safari. vuelve a intentarlo.
   *[other] no se pudo revisar qué permite tu navegador. vuelve a intentarlo.
}

browser.copy.couldntstart = no se pudo iniciar en tus sitios

browser.copy.deniednote = { $surface ->
   *[safari-desktop] para incluirlo, ponlo en Permitir en la configuración de sitios web de Safari.
    [safari-mobile] para incluirlo, ponlo en Permitir en Ajustes, en Apps, Safari, Extensiones, solstone.
}

browser.copy.deniedtitle = { $browser ->
    [firefox] Firefox no permite que esta extensión reciba estos sitios:
    [edge] Edge no permite que esta extensión reciba estos sitios:
    [chrome] Chrome no permite que esta extensión reciba estos sitios:
    [safari] Safari está denegando estos sitios, así que no se reciben:
   *[other] tu navegador no permite que esta extensión reciba estos sitios:
}

browser.copy.denyingsite = { $browser ->
    [firefox] Firefox está denegando este sitio
    [edge] Edge está denegando este sitio
    [chrome] Chrome está denegando este sitio
    [safari] Safari está denegando este sitio
   *[other] tu navegador está denegando este sitio
}

browser.copy.desktopactivityon = la extensión de solstone no está recibiendo este sitio. la actividad de este navegador igual va a tu diario.

browser.copy.desktopscreenon = la extensión de solstone no está recibiendo este sitio. tu pantalla igual va a tu diario.

browser.copy.disclosure = { $place ->
   *[computer] adónde va: nada sale de este navegador salvo hacia la app de solstone en esta computadora. de ahí va a tu diario por el enlace que la app de solstone ya usa.
    [iphone] adónde va: nada sale de este navegador salvo hacia la app de solstone en este iphone. de ahí va a tu diario por el enlace que la app de solstone ya usa. la extensión de solstone sigue recibiendo los sitios que permites mientras la app de solstone está cerrada. lo que recibe espera en este iphone y va a tu diario la próxima vez que abras la app de solstone.
    [ipad] adónde va: nada sale de este navegador salvo hacia la app de solstone en este ipad. de ahí va a tu diario por el enlace que la app de solstone ya usa. la extensión de solstone sigue recibiendo los sitios que permites mientras la app de solstone está cerrada. lo que recibe espera en este ipad y va a tu diario la próxima vez que abras la app de solstone.
}

browser.copy.disclosurepause = { $surface ->
   *[desktop] pausa en cualquier momento en la extensión de solstone. pausar la app de solstone detiene esta extensión también, salvo que desactives eso en configuración. pausar no frena lo que ya se recibió. si quitas un sitio, no llega nada nuevo de él; lo que ya está en tu diario permanece ahí.
    [mobile] pausa en cualquier momento en la extensión de solstone. pausar no frena lo que ya se recibió. si quitas un sitio, no llega nada nuevo de él; lo que ya está en tu diario permanece ahí.
}

browser.copy.disclosureprivate = { $surface ->
   *[desktop] la extensión de solstone no recibe nada de las ventanas privadas, incluso donde tu navegador le permite funcionar. eso cubre solo esta extensión.
    [mobile] la extensión de solstone no recibe nada de la navegación privada, incluso donde Safari le permite funcionar. eso cubre solo esta extensión.
}

browser.copy.disclosurerest = los sitios que permites en tu navegador son los sitios que recibe la extensión de solstone, y eso puede ser cada sitio. en esos sitios, recibe el texto de la página y el diseño aproximado siempre que una pestaña esté abierta, y todo va a tu diario:
    - el texto que puedes ver, el texto que verías al desplazarte, texto en pestañas en segundo plano, algunas etiquetas que las páginas dan para lectores de pantalla y descripciones emergentes, y texto que la página tiene pero no te muestra
    - la dirección de cada página, sin nada después de un ? o #, su título, cuándo estuviste en ella, y los sitios a los que apuntan sus enlaces
    - si la pestaña estaba al frente, si su ventana tenía el foco, si se reproducía audio o video, el idioma de la página, cuál navegador es, y cuánto tiempo lleva abierta la pestaña
    - en un sitio de correo o de chat, tus mensajes
    - algunas palabras que escribiste pero no enviaste, y cualquier cosa que un sitio muestra, incluso algo que considerarías secreto, como un código en un correo{ $blank }nunca píxeles. nunca HTML en bruto. los sitios que dejas fuera no se reciben, pero otros sitios que se muestran dentro de esas páginas sí se reciben.{ $blank }sin analítica. sin telemetría. sin llamar a casa. nadie contó.

browser.copy.everysiteleftout = cada sitio · { $value1 } fuera

browser.copy.extensionleftout = la extensión de solstone lo deja fuera.

browser.copy.failadd = no se pudo agregar el sitio. vuelve a intentarlo.

browser.copy.failedbody = { $browser ->
    [firefox] algo salió mal al activar cada sitio en Firefox.
    [edge] algo salió mal al activar cada sitio en Edge.
    [chrome] algo salió mal al activar cada sitio en Chrome.
    [safari] algo salió mal al activar cada sitio en Safari.
   *[other] algo salió mal al activar cada sitio en tu navegador.
}

browser.copy.failgeneric = algo salió mal. vuelve a intentarlo.

browser.copy.failleftout = este sitio está fuera. primero, ya no lo dejes fuera.

browser.copy.failpage = no se pudo guardar una página de este sitio

browser.copy.failpageretry = no se pudo guardar una página de este sitio. la extensión vuelve a intentarlo cuando la página cambie.

browser.copy.failrestartsite = no se pudo iniciar en este sitio. quítalo y agrégalo de nuevo.

browser.copy.failsave = no se pudo guardar eso. vuelve a intentarlo.

browser.copy.failsetupfirst = termina de configurar primero.

browser.copy.failsite = algo salió mal en este sitio

browser.copy.failsitefull = no hay espacio para más de este sitio ahora

browser.copy.fielderror = escribe una dirección de sitio web, como mail.google.com.

browser.copy.hostalready = { $host } ya está en tu lista.

browser.copy.hostremoved = se quitó { $host }. no llega nada nuevo de él; lo que ya está en tu diario permanece ahí.

browser.copy.isleftoutstopleaving = { $value1 } está fuera. primero, ya no lo dejes fuera.

browser.copy.isnolongerleftout = { $value1 } ya no está dejado fuera.

browser.copy.isntallowingeverywebsite = { $value1 } no está permitiendo cada sitio web

browser.copy.leaveouthelp = dejar fuera bank.com deja fuera todos los sitios y páginas de bank.com, como www.bank.com y login.bank.com, incluso dentro de otra página. otros sitios que se muestran dentro de sus páginas se siguen compartiendo, salvo que también los dejes fuera.

browser.copy.leaveoutneedsaccess = para dejar sitios fuera, permite Accesibilidad en la configuración de la app de solstone.

browser.copy.leaveoutnote = { $scope ->
   *[exact] dejarlo fuera cubre { $host }. otros sitios que se muestran dentro de sus páginas se siguen compartiendo.
    [whole] dejarlo fuera cubre todos los sitios y páginas de { $host }. otros sitios que se muestran dentro de ellos se siguen compartiendo.
}

browser.copy.leftoutannouncement = { $scope ->
   *[exact] se dejó fuera { $host }. otros sitios que se muestran dentro de sus páginas se siguen compartiendo.
    [whole] se dejaron fuera todos los sitios y páginas de { $host }. otros sitios que se muestran dentro de ellos se siguen compartiendo.
}

browser.copy.leftoutsummary = { $count ->
    [one] { $count } sitio dejado fuera
    [many] { $count } sitios dejados fuera
   *[other] { $count } sitios dejados fuera
}

browser.copy.linuxcantreach = { $place ->
   *[computer] inicia la app de solstone en esta computadora. si ya está en ejecución, { $doctor } dice qué está mal.
    [iphone] inicia la app de solstone en este iphone. si ya está en ejecución, { $doctor } dice qué está mal.
    [ipad] inicia la app de solstone en este ipad. si ya está en ejecución, { $doctor } dice qué está mal.
}

browser.copy.linuxintakeoff = vuelve a activarlas con { $cmd }.

browser.copy.linuxstep1intake = actívalas con { $cmd }.

browser.copy.linuxupdate = { $place ->
   *[computer] esta extensión necesita una versión más reciente de la app de solstone en esta computadora. ejecuta { $cmd } para obtener esa versión.
    [iphone] esta extensión necesita una versión más reciente de la app de solstone en este iphone. ejecuta { $cmd } para obtener esa versión.
    [ipad] esta extensión necesita una versión más reciente de la app de solstone en este ipad. ejecuta { $cmd } para obtener esa versión.
}

browser.copy.nowallowseverywebsiteevery = { $value1 } ahora permite cada sitio web. cada sitio está activado, salvo lo que dejas fuera.

browser.copy.onlythesitesalreadyallows = solo están activados los sitios que { $value1 } ya permite.

browser.copy.permissiondeclinedonlythesites = permiso rechazado. solo están activados los sitios que { $value1 } ya permite. para agregar un sitio, ábrelo, abre solstone desde { $value2 } y elige agregar este sitio.

browser.copy.permissionschanged = { $browser ->
    [firefox] Los permisos de Firefox cambiaron al guardar. vuelve a intentarlo.
    [edge] Los permisos de Edge cambiaron al guardar. vuelve a intentarlo.
    [chrome] Los permisos de Chrome cambiaron al guardar. vuelve a intentarlo.
    [safari] Los permisos de Safari cambiaron al guardar. vuelve a intentarlo.
   *[other] los permisos de tu navegador cambiaron al guardar. vuelve a intentarlo.
}

browser.copy.privatenote = { $surface ->
   *[desktop] esta extensión no recibe nada de la navegación privada.
    [mobile] esta extensión no recibe nada de la navegación privada.
}

browser.copy.privatestate = { $surface ->
   *[desktop] ventana privada
    [mobile] navegación privada
}

browser.copy.restricted = { $browser ->
    [firefox] Firefox no permite que las extensiones funcionen en esta página
    [edge] Edge no permite que las extensiones funcionen en esta página
    [chrome] Chrome no permite que las extensiones funcionen en esta página
    [safari] Safari no permite que las extensiones funcionen en esta página
   *[other] tu navegador no permite que las extensiones funcionen en esta página
}

browser.copy.returnnote = esta página revisa de nuevo cuando vuelvas a ella.

browser.copy.sharegoesin = { $arg1 } lo que compartes ahí ahora va a tu diario.

browser.copy.sharegoesinnow = { $arg1 } lo que compartes ahí ahora va a tu diario.

browser.copy.sharingallcount = { $count ->
    [one] { $count } sitio dejado fuera
    [many] { $count } sitios dejados fuera
   *[other] { $count } sitios dejados fuera
}

browser.copy.sharingevery = cada sitio

browser.copy.sharingexcluded = cada sitio · { $count } fuera

browser.copy.sheettitle = { $scope ->
   *[exact] ¿agregar { $host }?
    [whole] ¿agregar todos los sitios y páginas de { $host }?
}

browser.copy.sownsettingsdont = la propia configuración de { $value1 } no muestra los sitios que dejas fuera. están en la lista propia de solstone.

browser.copy.step1cantreach = { $place ->
   *[computer] la extensión de solstone funciona con la app de solstone en esta computadora, y no se recibe nada sin ella. si la app de solstone todavía no está en esta computadora, consíguela en { $site }. esta página avanza sola cuando la app de solstone responda.
    [iphone] la extensión de solstone funciona con la app de solstone en este iphone, y no se recibe nada sin ella. si la app de solstone todavía no está en este iphone, consíguela en { $site }. esta página avanza sola cuando la app de solstone responda.
    [ipad] la extensión de solstone funciona con la app de solstone en este ipad, y no se recibe nada sin ella. si la app de solstone todavía no está en este ipad, consíguela en { $site }. esta página avanza sola cuando la app de solstone responda.
}

browser.copy.step1intakeoff = actívalas en fuentes, en la configuración de la app de solstone. esta página avanza sola.

browser.copy.step1notpaired = { $place ->
   *[computer] vincula la app de solstone en esta computadora con tu diario. esta página avanza sola cuando esté vinculada.
    [iphone] vincula la app de solstone en este iphone con tu diario y confirma la marca de tu diario. esta página avanza sola cuando lo hayas hecho.
    [ipad] vincula la app de solstone en este ipad con tu diario y confirma la marca de tu diario. esta página avanza sola cuando lo hayas hecho.
}

browser.copy.step1openapp = { $place ->
   *[computer] la extensión de solstone funciona con la app de solstone en esta computadora, y no se recibe nada sin ella. abre la app de solstone para seguir. esta página avanza sola cuando responda.
    [iphone] la extensión de solstone funciona con la app de solstone en este iphone, y no se recibe nada sin ella. la app de solstone no responde ahora. esta extensión vuelve a intentarlo sola, y esta página avanza sola cuando responda.
    [ipad] la extensión de solstone funciona con la app de solstone en este ipad, y no se recibe nada sin ella. la app de solstone no responde ahora. esta extensión vuelve a intentarlo sola, y esta página avanza sola cuando responda.
}

browser.copy.step2pending = vas a aceptar esto cuando el paso de arriba esté listo.

browser.copy.step3body = { $browser ->
    [firefox] Firefox te pedirá que lo permitas.
    [edge] Edge te pedirá que lo permitas.
    [chrome] Chrome te pedirá que lo permitas.
    [safari] Safari te pedirá que lo permitas.
   *[other] tu navegador te pedirá que lo permitas.
}

browser.copy.stepextensionsleft = en Extensiones, a la izquierda, elige solstone.

browser.copy.stepforother = pon "Para otros sitios web" en Permitir.

browser.copy.stepotherwebsites = pon "Para otros sitios web" en Permitir.

browser.copy.stepsafariwebsites = en Safari, elige Safari › Ajustes y luego Sitios web.

browser.copy.stepsettingsapps = en Ajustes, abre Apps, luego Safari, luego Extensiones y luego solstone.

browser.copy.stillallowseverywebsite = { $value1 } todavía permite cada sitio web.

browser.copy.stillisntallowingevery = { $value1 } todavía no está permitiendo cada sitio web.

browser.copy.thesolstoneextensionleavesit = la extensión de solstone lo deja fuera. la app de solstone no revisa las ventanas de { $value1 } en tu pantalla.

browser.copy.truncation = parte de lo que compartiste en este sitio era demasiado larga para guardar

browser.copy.tryagain = reintentar

browser.copy.unknownnote = { $surface ->
   *[safari-desktop] si está en Denegar en la configuración de sitios web de Safari, no se recibe.
    [safari-mobile] si está en Denegar en Ajustes, en Apps, Safari, Extensiones, solstone, no se recibe.
}

browser.copy.unknownstate = esta extensión no puede conectar con esta página

browser.copy.warm1 = te damos la bienvenida a solstone.

browser.copy.warm2 = la app de solstone recibe lo que compartes con ella, y todo va a tu diario.

browser.copy.warm3 = tu diario es siempre privado, solo tuyo.

browser.extension.addingsitecoversevery = agregar un sitio cubre cada sitio y página bajo él.

browser.extension.clearedextensionsstorage = borraste el almacenamiento de esta extensión, así que está en pausa, y los sitios que dejaste fuera ya no están fuera. cuando reanudes, cada sitio que Safari permite va a tu diario.

browser.extension.clearedextensionsstorage2 = borraste el almacenamiento de esta extensión, así que está en pausa. cuando reanudes, cada sitio que Safari permite va a tu diario, salvo lo que dejaste fuera en la app de solstone.

browser.extension.enterwebsiteaddresslike = escribe una dirección de sitio web, como bank.com.

browser.extension.everysiteoffexcept = cada sitio está desactivado, salvo los sitios que agregaste uno por uno.

browser.extension.everysiteoffincluding = cada sitio está desactivado, incluidos los sitios que agregaste uno por uno. agrega un sitio para compartirlo de nuevo.

browser.extension.everywebsiteincludingones = cada sitio web, incluidos los que visites después, una vez que tu navegador lo permita. puedes dejar sitios fuera.

browser.extension.extensionsbuttonsafaris = el botón de extensiones en la barra de direcciones de Safari

browser.extension.extensiontakesnothingfrom = esta extensión no recibe nada de las ventanas privadas.

browser.extension.extensiontakesonlysites = esta extensión recibe solo los sitios que agregaste, y todo va a tu diario.

browser.extension.onlysitesallowopen = solo los sitios que permites. abre un sitio, abre solstone desde la barra de herramientas o el menú de extensiones de tu navegador, y elige agregar este sitio.

browser.extension.onlysitessafarialready = solo están activados los sitios que Safari ya permite. para compartir cada sitio:

browser.extension.safarispagemenu = Menú de página de Safari

browser.extension.safaristillisnt = Safari todavía no está permitiendo cada sitio web. pon "Todos los sitios web" (u "Otros sitios web") en Permitir.

browser.extension.safaristillisnt2 = Safari todavía no está permitiendo cada sitio web. pon "Para otros sitios web" en Permitir.

browser.extension.setallwebsitesother = pon "Todos los sitios web" (u "Otros sitios web") en Permitir.

browser.extension.shareall = compartir todo

browser.extension.sharethemtoo = compartirlos también

browser.extension.sharingeverysiteincludes = compartir cada sitio incluye mensajes en sitios de correo y de chat, y palabras que escribiste pero no enviaste, y todo va a tu diario.

browser.extension.sitesetdenythere = un sitio en Denegar ahí sigue desactivado.

browser.extension.solstoneextensionleavesout = la extensión de solstone lo deja fuera. la app de solstone no puede dejar sitios web fuera hasta que tenga Accesibilidad.

browser.extension.stopsharingeverysite = dejar de compartir cada sitio

browser.extension.stopsharingeverysite2 = para dejar de compartir cada sitio, pon "Todos los sitios web" (u "Otros sitios web") en Preguntar en Ajustes, en Apps, Safari, Extensiones, solstone.

browser.extension.stopsharingeverysite3 = para dejar de compartir cada sitio, pon "Para otros sitios web" en Preguntar en la configuración de sitios web de Safari.

browser.failure.raw = algo salió mal: { $raw }

browser.labels.onnow = activado ahora

browser.labels.opensettings = abrir configuración

browser.labels.updatenow = actualizar ahora

browser.manifest.description = en los sitios que permites, la extensión de solstone recibe el texto de la página, las direcciones y el diseño aproximado, y todo va a tu diario.

browser.manifest.safaridescription = en los sitios que permites, recibe el texto de la página, las direcciones y el diseño aproximado, y todo va a tu diario.

browser.options.addasite = agregar un sitio

browser.options.addsitesoneat = agregar sitios uno por uno

browser.options.agreeaddsitesone = aceptar y agregar sitios uno por uno

browser.options.agreegoon = aceptar y seguir

browser.options.agreeshareeverysite = aceptar y compartir cada sitio

browser.options.choosefirst = elegir tu primer sitio

browser.options.documenttitle = configuración de solstone

browser.options.keepmysites = conservar mis sitios

browser.options.leaveout = dejar fuera

browser.options.leaveoutasite = dejar fuera un sitio

browser.options.leaveoutplaceholder = bank.com

browser.options.lookingforapp = { $place ->
   *[computer] buscando la app de solstone en esta computadora…
    [iphone] buscando la app de solstone en este iphone…
    [ipad] buscando la app de solstone en este ipad…
}

browser.options.mobileplaceholder = eff.org

browser.options.pause = pausar

browser.options.pauseheading = pausar con la app de solstone

browser.options.pausehelp = activado: cuando la app de solstone en esta computadora se pausa, esta extensión también. desactivado: cuando pausas la app de solstone, esta extensión sigue recibiendo tus sitios compartidos, y todo va a tu diario.

browser.options.pauselabel = pausar esta extensión cuando la app de solstone se pausa

browser.options.placeholder = mail.google.com

browser.options.readagain = volver a leerlo

browser.options.remove = quitar

browser.options.shareeverysite = compartir cada sitio

browser.options.siterowaria = { $action ->
   *[remove] quitar { $host }
    [include] incluir { $host } de nuevo
}

browser.options.stopleavingout = ya no dejar fuera

browser.options.takesin = lo que recibe la extensión de solstone

browser.options.version = v{ $version }

browser.options.whatyoushare = lo que compartes

browser.options.whichsitesdowant = ¿qué sitios quieres en tu diario?

browser.options.yoursites = tus sitios

browser.page.markerstate = { $phase ->
   *[on] activado
    [paused] en pausa
}

browser.popup.about = acerca de

browser.popup.added = agregado

browser.popup.addedidle = agregado. abre o recarga una pestaña

browser.popup.attentionheading = sitios que necesitan atención

browser.popup.cantadd = esta página no se puede agregar

browser.popup.copybutton = { $phase ->
   *[copy] copiar
    [copied] copiado
}

browser.popup.copyfailed = no se pudo copiar. selecciona el texto y cópialo.

browser.popup.included = incluido

browser.popup.leaveoutthis = dejar fuera este sitio

browser.popup.leftout = dejado fuera

browser.popup.manage = administrar ›

browser.popup.notadded = sin agregar

browser.popup.nottakenin = no se recibe ahora

browser.popup.pauseall = { $phase ->
   *[running] pausar todo
    [paused] reanudar
}

browser.popup.reloadtab = recarga esta pestaña para empezar

browser.popup.removehost = quitar { $arg1 }

browser.popup.removethis = quitar este sitio

browser.popup.settings = configuración ›

browser.popup.sharing = compartiendo

browser.popup.sitecountallon = { $count ->
    [one] { $count } sitio, activado
    [many] { $count } sitios, todos activados
   *[other] { $count } sitios, todos activados
}

browser.popup.sitecountallpaused = { $count ->
    [one] { $count } sitio, en pausa
    [many] { $count } sitios, todos en pausa
   *[other] { $count } sitios, todos en pausa
}

browser.popup.sitecountmixed = { $count ->
    [one] { $count } sitio, { $on } activado
    [many] { $count } sitios, { $on } activado
   *[other] { $count } sitios, { $on } activado
}

browser.popup.sitecountonly = { $count ->
    [one] { $count } sitio
    [many] { $count } sitios
   *[other] { $count } sitios
}

browser.popup.stopleavinghostout = ya no dejar fuera { $value1 }

browser.popup.stopleavingsiteout = ya no dejar fuera este sitio

browser.popup.thispage = esta página

browser.popup.whattakes = lo que recibe

browser.status.apppausedheadline = { $surface ->
   *[desktop] la app de solstone está en pausa
    [mobile] Safari está en pausa en la app de solstone
}

browser.status.apppausednote = { $place ->
   *[computer] la app de solstone está en pausa en esta computadora
    [iphone] la app de solstone está en pausa en este iphone
    [ipad] la app de solstone está en pausa en este ipad
}

browser.status.apppausedreason = { $surface ->
   *[desktop] pausar no frena lo que ya se recibió. reanuda desde la app de solstone.
    [mobile] pausar no frena lo que ya se recibió. reanuda Safari en la app de solstone.
}

browser.status.cantreach = no se puede conectar con la app de solstone

browser.status.cantreachanswering = { $place ->
   *[computer] la app de solstone en esta computadora no responde. ábrela para seguir.
    [iphone] la app de solstone en este iphone no responde ahora. esta extensión vuelve a intentarlo sola.
    [ipad] la app de solstone en este ipad no responde ahora. esta extensión vuelve a intentarlo sola.
}

browser.status.cantreachgetapp = { $place ->
   *[computer] la extensión de solstone funciona con la app de solstone en esta computadora. si la app de solstone todavía no está en esta computadora, consíguela en { $site }.
    [iphone] la extensión de solstone funciona con la app de solstone en este iphone. si la app de solstone todavía no está en este iphone, consíguela en { $site }.
    [ipad] la extensión de solstone funciona con la app de solstone en este ipad. si la app de solstone todavía no está en este ipad, consíguela en { $site }.
}

browser.status.cantreachreopen = { $place ->
   *[computer] abre la app de solstone en esta computadora. si ya está abierta, mira en fuentes, en su configuración.
    [iphone] la app de solstone en este iphone no responde ahora. esta extensión vuelve a intentarlo sola.
    [ipad] la app de solstone en este ipad no responde ahora. esta extensión vuelve a intentarlo sola.
}

browser.status.changingsites = cambiando tus sitios

browser.status.connecting = conectando con la app de solstone

browser.status.finishsetup = terminar de configurar

browser.status.foundsolstoneapp = se encontró la app de solstone

browser.status.foundsolstoneapps = se encontró la app de solstone. está en pausa ahora.

browser.status.getapp = obtener la app de solstone

browser.status.icontitle = { $headline }

browser.status.idlereason = { $mode ->
   *[selected] ninguno de tus sitios está abierto ahora.
    [all] ninguno de los sitios web que compartes está abierto ahora.
}

browser.status.intakeheld = { $place ->
   *[computer] la app de solstone en esta computadora no está recibiendo páginas nuevas ahora.
    [iphone] la app de solstone en este iphone no está recibiendo páginas nuevas ahora.
    [ipad] la app de solstone en este ipad no está recibiendo páginas nuevas ahora.
}

browser.status.keptfornow = { $place ->
   *[computer] se guarda en esta computadora por ahora
    [iphone] se guarda en este iphone por ahora
    [ipad] se guarda en este ipad por ahora
}

browser.status.keptfornowreason = { $place ->
   *[computer] lo que compartes desde este navegador se guarda en esta computadora por ahora. la app de solstone tiene los detalles.
    [iphone] lo que compartes desde este navegador se guarda en este iphone por ahora. la app de solstone tiene los detalles.
    [ipad] lo que compartes desde este navegador se guarda en este ipad por ahora. la app de solstone tiene los detalles.
}

browser.status.keptwaiting = { $place ->
   *[computer] se guarda en esta computadora, en espera de ir a tu diario
    [iphone] se guarda en este iphone, en espera de ir a tu diario
    [ipad] se guarda en este ipad, en espera de ir a tu diario
}

browser.status.lastpages = las últimas páginas llegaron a tu diario

browser.status.lostbrowsers = parte de lo que compartiste desde tus navegadores no se pudo guardar, así que no va a tu diario. la app de solstone tiene los detalles.

browser.status.lostthis = parte de lo que compartiste desde este navegador no se pudo guardar, así que no va a tu diario.

browser.status.noroom = no hay espacio para más ahora

browser.status.nosites = todavía no hay sitios

browser.status.nothingfrombrowser = no se recibe nada nuevo desde este navegador

browser.status.nothingnew = no se recibe nada nuevo

browser.status.nothingrightnow = no se recibe nada nuevo ahora

browser.status.nothingwaiting = nada en espera de ir a tu diario

browser.status.notpaired = { $place ->
   *[computer] vincula la app de solstone en esta computadora con tu diario y luego vuelve.
    [iphone] vincula la app de solstone en este iphone con tu diario y confirma la marca de tu diario, y luego vuelve.
    [ipad] vincula la app de solstone en este ipad con tu diario y confirma la marca de tu diario, y luego vuelve.
}

browser.status.notpairedheadline = la app de solstone todavía no está vinculada

browser.status.notreaching = no está llegando a tu diario

browser.status.nowordyet = todavía no se sabe si está llegando a tu diario

browser.status.openandadd = abre un sitio que quieras compartir y elige agregar este sitio.

browser.status.pagesoff = las páginas del navegador están desactivadas en la app de solstone

browser.status.pausedhere = en pausa en este navegador

browser.status.pausedoesnthold = pausar no frena lo que ya se recibió.

browser.status.pressure = lo que compartiste desde este navegador está en espera de que la app de solstone lo acepte. las páginas nuevas se reciben de nuevo cuando hay espacio.

browser.status.reaching = llegando a tu diario

browser.status.readthenchoose = lee lo que recibe la extensión de solstone y luego elige tu primer sitio.

browser.status.sitesneedattention = { $count ->
    [one] { $count } sitio necesita atención
    [many] { $count } sitios necesitan atención
   *[other] { $count } sitios necesitan atención
}

browser.status.somecouldnt = algunas páginas no se pudieron guardar

browser.status.stopleavinghostout = ya no dejar fuera { $value1 }

browser.status.storefull = { $place ->
   *[computer] el espacio en esta computadora para lo que compartes desde tus navegadores está lleno. las páginas nuevas se reciben de nuevo cuando hay espacio. la app de solstone tiene los detalles.
    [iphone] el espacio en este iphone para las páginas de Safari está lleno. abre la app de solstone para hacer espacio.
    [ipad] el espacio en este ipad para las páginas de Safari está lleno. abre la app de solstone para hacer espacio.
}

browser.status.turnpageson = vuelve a activar las páginas del navegador en fuentes, en la configuración de la app de solstone.

browser.status.unavailable = estado no disponible

browser.status.unavailablereason = la extensión de solstone no puede mostrar su estado ahora.

browser.status.untilanswers = no se recibe nada hasta que responda

browser.status.untilpaired = no se recibe nada hasta que esté vinculada

browser.status.untilroom = no se recibe nada nuevo hasta que haya espacio

browser.status.untilsaved = no se recibe nada nuevo hasta que esto se guarde

browser.status.untilupdated = no se recibe nada nuevo hasta que se actualice

browser.status.untilyouadd = no se recibe nada hasta que agregues un sitio

browser.status.untilyoudo = no se recibe nada hasta que lo hagas

browser.status.updateapp = { $place ->
   *[computer] esta extensión necesita una versión más reciente de la app de solstone en esta computadora. mira en actualizaciones, en la configuración de la app de solstone.
    [iphone] actualiza la app de solstone en este iphone.
    [ipad] actualiza la app de solstone en este ipad.
}

browser.status.updateappheadline = actualizar la app de solstone

browser.status.updatechecking = { $place ->
   *[computer] la app de solstone en esta computadora necesita una versión más reciente de esta extensión. { $browser } está buscando esa versión ahora.
    [iphone] la app de solstone en este iphone necesita una versión más reciente de esta extensión. { $browser } está buscando esa versión ahora.
    [ipad] la app de solstone en este ipad necesita una versión más reciente de esta extensión. { $browser } está buscando esa versión ahora.
}

browser.status.updateextension = actualizar la extensión de solstone

browser.status.updatefirefoxmanual = { $place ->
   *[computer] la app de solstone en esta computadora necesita una versión más reciente de esta extensión. en Firefox, abre Complementos y temas y luego elige Buscar actualizaciones en el menú del engranaje.
    [iphone] la app de solstone en este iphone necesita una versión más reciente de esta extensión. en Firefox, abre Complementos y temas y luego elige Buscar actualizaciones en el menú del engranaje.
    [ipad] la app de solstone en este ipad necesita una versión más reciente de esta extensión. en Firefox, abre Complementos y temas y luego elige Buscar actualizaciones en el menú del engranaje.
}

browser.status.updatepending = { $place ->
   *[computer] la app de solstone en esta computadora necesita una versión más reciente de esta extensión. { $browser } todavía no encuentra esa versión; vuelve a buscar sin que tengas que hacerlo.
    [iphone] la app de solstone en este iphone necesita una versión más reciente de esta extensión. { $browser } todavía no encuentra esa versión; vuelve a buscar sin que tengas que hacerlo.
    [ipad] la app de solstone en este ipad necesita una versión más reciente de esta extensión. { $browser } todavía no encuentra esa versión; vuelve a buscar sin que tengas que hacerlo.
}

browser.status.updateready = la actualización está lista.

browser.status.updatesafarimanual = { $place ->
   *[computer] la app de solstone en esta computadora necesita una versión más reciente de esta extensión. en Safari viene con la app de solstone, así que actualiza la app de solstone.
    [iphone] la app de solstone en este iphone necesita una versión más reciente de esta extensión. en Safari viene con la app de solstone, así que actualiza la app de solstone.
    [ipad] la app de solstone en este ipad necesita una versión más reciente de esta extensión. en Safari viene con la app de solstone, así que actualiza la app de solstone.
}

browser.status.waitedweek = { $place ->
   *[computer] algunas páginas de tus navegadores llevan más de una semana en espera de ir a tu diario. siguen guardadas en esta computadora. la app de solstone tiene los detalles.
    [iphone] algunas páginas de Safari llevan más de una semana en espera de ir a tu diario. siguen guardadas en este iphone. abre la app de solstone y van a tu diario.
    [ipad] algunas páginas de Safari llevan más de una semana en espera de ir a tu diario. siguen guardadas en este ipad. abre la app de solstone y van a tu diario.
}

browser.status.waitedweekheadline = algunas páginas llevan más de una semana en espera

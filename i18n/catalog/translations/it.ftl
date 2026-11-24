browser.about.block = estensione di solstone { $version } · { $os } { $os_version } · { $arch }
    { $journal }

browser.about.daysago = { $count ->
    [one] { $count } giorno fa
    [many] { $count } di giorni fa
   *[other] { $count } giorni fa
}

browser.about.extensionversion = estensione di solstone { $value1 }

browser.about.hoursago = { $count ->
    [one] { $count } ora fa
    [many] { $count } di ore fa
   *[other] { $count } ore fa
}

browser.about.journalunknown = diario sconosciuto

browser.about.justnow = proprio ora

browser.about.lastseen = { $space }· visto l'ultima volta { $value1 }

browser.about.lines = { $own }
    { $journal }

browser.about.minutesago = { $count ->
    [one] { $count } minuto fa
    [many] { $count } di minuti fa
   *[other] { $count } minuti fa
}

browser.brand.name = solstone

browser.chrome.addthissite = aggiungi questo sito

browser.chrome.dismiss = ignora

browser.chrome.inyourbrowser = nel tuo browser

browser.chrome.itgoesto = va in

browser.copy.accessdeniedhelp = { $surface ->
   *[safari-desktop] per includerne uno, impostalo su Consenti nelle impostazioni dei siti web di Safari per solstone.
    [safari-mobile] per includerne uno, impostalo su Consenti in Impostazioni, sotto App, Safari, Estensioni, solstone.
}

browser.copy.accessgrantedjoin = { $granted }

browser.copy.accessgrantednote = { $surface ->
   *[safari-desktop] un sito impostato su Nega nelle impostazioni dei siti web di Safari resta disattivo.
    [safari-mobile] in Impostazioni, sotto App, Safari, Estensioni, solstone, un sito impostato su Nega resta disattivo.
}

browser.copy.addblockedbelow = Safari non chiede di { $arg1 } mentre consente { $under }. per aggiungere { $arg3 }, impostalo su Consenti nelle impostazioni dei siti web di Safari.

browser.copy.adddenied = permesso rifiutato. non è stato aggiunto niente.

browser.copy.added = { $scope ->
   *[exact] { $host } aggiunto.
    [whole] aggiunti tutti i siti e le pagine di { $host }.
}

browser.copy.addedjoined = { $scope ->
   *[exact] { $host } aggiunto.
    [whole] aggiunti tutti i siti e le pagine di { $host }.
}

browser.copy.addhelp = aggiungere bank.com condivide ogni sito e pagina di bank.com, come www.bank.com e login.bank.com. per condividerne solo una parte, aggiungi quell'indirizzo, come mail.google.com.

browser.copy.addhelpjoined = { $browser ->
    [firefox] anche un sito che consenti nelle impostazioni di Firefox è attivo.
    [edge] anche un sito che consenti nelle impostazioni di Edge è attivo.
    [chrome] anche un sito che consenti nelle impostazioni di Chrome è attivo.
    [safari] anche un sito che consenti nelle impostazioni di Safari è attivo.
   *[other] anche un sito che consenti nelle impostazioni del tuo browser è attivo.
}

browser.copy.addhelpsuffix = { $browser ->
    [firefox] anche un sito che consenti nelle impostazioni di Firefox viene aggiunto qui.
    [edge] anche un sito che consenti nelle impostazioni di Edge viene aggiunto qui.
    [chrome] anche un sito che consenti nelle impostazioni di Chrome viene aggiunto qui.
    [safari] anche un sito che consenti nelle impostazioni di Safari viene aggiunto qui.
   *[other] anche un sito che consenti nelle impostazioni del tuo browser viene aggiunto qui.
}

browser.copy.addnotnow = non è possibile aggiungere un sito ora. lo stato sopra dice perché.

browser.copy.allowin = { $browser ->
    [firefox] consenti in Firefox
    [edge] consenti in Edge
    [chrome] consenti in Chrome
    [safari] consenti in Safari
   *[other] consenti nel tuo browser
}

browser.copy.allowsallofbutthe = { $value1 } consente tutto { $value2 }, ma l'estensione di solstone prende solo la parte che hai aggiunto. condividere tutto può includere i messaggi sui siti di posta e di chat, e parole che hai scritto ma non hai inviato, e tutto va nel tuo diario.

browser.copy.allowseverywebsitesoevery = { $value1 } consente ogni sito, quindi ogni sito è attivo, tranne ciò che lasci fuori.

browser.copy.allowsmoreofsomesites = { $value1 } consente di più di alcuni siti che hai aggiunto, come { $value2 }, ma l'estensione di solstone prende solo le parti che hai aggiunto. condividerli tutti può includere i messaggi sui siti di posta e di chat, e parole che hai scritto ma non hai inviato, e tutto va nel tuo diario.

browser.copy.allowsmorethanyoursites = { $value1 } consente più dei tuoi siti. { $value2 }

browser.copy.allowsthesolstoneextensionon = { $value1 } consente l'estensione di solstone su ogni sito, ma vengono presi solo i siti che hai aggiunto. condividere ogni sito include i messaggi sui siti di posta e di chat, e parole che hai scritto ma non hai inviato, e tutto va nel tuo diario.

browser.copy.allowsthesolstoneextensionon2 = { $value1 } consente l'estensione di solstone su siti che non hai aggiunto, come { $value2 }, ma vengono presi solo i siti che hai aggiunto. condividerli può includere i messaggi sui siti di posta e di chat, e parole che hai scritto ma non hai inviato, e tutto va nel tuo diario.

browser.copy.allsitesandpagesare = tutti i siti e le pagine di { $value1 } non sono più lasciati fuori.

browser.copy.alreadyallowseverywebsiteso = { $value1 } consente già ogni sito, quindi accettare condivide ogni sito. per scegliere invece i siti uno alla volta, cambia prima quello in { $value2 }.

browser.copy.appleftoutaway = anche l'app di solstone lo lascia fuori.

browser.copy.appleftoutsiteson = tenuto fuori dal tuo diario, comprese questa finestra del browser sullo schermo e l'attività.

browser.copy.appleftoutunreadable = l'estensione di solstone lo lascia fuori. l'app di solstone non può leggere gli indirizzi delle pagine di { $value1 } ora, quindi { $value1 } resta fuori da ciò che l'app prende dal tuo schermo finché non può leggerli.

browser.copy.apponlyleftout = lasciato fuori nell'app di solstone

browser.copy.browsermenu = la barra degli strumenti o il menu delle estensioni del tuo browser

browser.copy.browsername = { $brand ->
        [firefox] Firefox
        [edge] Edge
        [chrome] Chrome
        [safari] Safari
       *[other] il tuo browser
    }

browser.copy.checkagain = controlla di nuovo

browser.copy.checking = { $browser ->
    [firefox] controllo Firefox…
    [edge] controllo Edge…
    [chrome] controllo Chrome…
    [safari] controllo Safari…
   *[other] controllo del tuo browser…
}

browser.copy.couldntcheck = { $browser ->
    [firefox] non è stato possibile controllare ciò che Firefox consente. riprova.
    [edge] non è stato possibile controllare ciò che Edge consente. riprova.
    [chrome] non è stato possibile controllare ciò che Chrome consente. riprova.
    [safari] non è stato possibile controllare ciò che Safari consente. riprova.
   *[other] non è stato possibile controllare ciò che il tuo browser consente. riprova.
}

browser.copy.couldntstart = non è stato possibile avviare sui tuoi siti

browser.copy.deniednote = { $surface ->
   *[safari-desktop] per includerlo, impostalo su Consenti nelle impostazioni dei siti web di Safari.
    [safari-mobile] per includerlo, impostalo su Consenti in Impostazioni, sotto App, Safari, Estensioni, solstone.
}

browser.copy.deniedtitle = { $browser ->
    [firefox] Firefox non lascia che questa estensione prenda questi siti:
    [edge] Edge non lascia che questa estensione prenda questi siti:
    [chrome] Chrome non lascia che questa estensione prenda questi siti:
    [safari] Safari sta negando questi siti, quindi non vengono presi:
   *[other] il tuo browser non lascia che questa estensione prenda questi siti:
}

browser.copy.denyingsite = { $browser ->
    [firefox] Firefox sta negando questo sito
    [edge] Edge sta negando questo sito
    [chrome] Chrome sta negando questo sito
    [safari] Safari sta negando questo sito
   *[other] il tuo browser sta negando questo sito
}

browser.copy.desktopactivityon = l'estensione di solstone non prende questo sito. l'attività di questo browser va comunque nel tuo diario.

browser.copy.desktopscreenon = l'estensione di solstone non prende questo sito. il tuo schermo va comunque nel tuo diario.

browser.copy.disclosure = { $place ->
   *[computer] dove va: da questo browser non esce niente, se non verso l'app di solstone su questo computer. da lì va nel tuo diario attraverso il link che l'app di solstone già usa.
    [iphone] dove va: da questo browser non esce niente, se non verso l'app di solstone su questo iphone. da lì va nel tuo diario attraverso il link che l'app di solstone già usa. l'estensione di solstone continua a prendere i siti che consenti mentre l'app di solstone è chiusa. ciò che prende aspetta su questo iphone e va nel tuo diario la prossima volta che apri l'app di solstone.
    [ipad] dove va: da questo browser non esce niente, se non verso l'app di solstone su questo ipad. da lì va nel tuo diario attraverso il link che l'app di solstone già usa. l'estensione di solstone continua a prendere i siti che consenti mentre l'app di solstone è chiusa. ciò che prende aspetta su questo ipad e va nel tuo diario la prossima volta che apri l'app di solstone.
}

browser.copy.disclosurepause = { $surface ->
   *[desktop] metti in pausa in qualsiasi momento nell'estensione di solstone. mettere in pausa l'app di solstone ferma anche questa estensione, a meno che non lo disattivi nelle impostazioni. la pausa non trattiene ciò che è già stato preso. se rimuovi un sito, da lì non arriva niente di nuovo; ciò che è già nel tuo diario resta lì.
    [mobile] metti in pausa in qualsiasi momento nell'estensione di solstone. la pausa non trattiene ciò che è già stato preso. se rimuovi un sito, da lì non arriva niente di nuovo; ciò che è già nel tuo diario resta lì.
}

browser.copy.disclosureprivate = { $surface ->
   *[desktop] l'estensione di solstone non prende niente dalle finestre private, anche dove il tuo browser le consente di funzionare lì. riguarda solo questa estensione.
    [mobile] l'estensione di solstone non prende niente dalla navigazione privata, anche dove Safari le consente di funzionare lì. riguarda solo questa estensione.
}

browser.copy.disclosurerest = i siti che consenti nel browser sono i siti che l'estensione di solstone prende, e possono essere tutti. su quei siti prende il testo della pagina e la disposizione approssimativa ogni volta che una scheda è aperta, e tutto va nel tuo diario:
    - il testo che vedi, il testo che vedresti scorrendo, il testo nelle schede in secondo piano, alcune etichette che le pagine danno ai lettori di schermo e ai tooltip, e il testo che la pagina ha ma non ti mostra
    - l'indirizzo di ogni pagina, senza niente dopo ? o #, il suo titolo, quando eri lì e i siti a cui puntano i suoi link
    - se la scheda era davanti, se la sua finestra aveva il focus, se audio o video era in riproduzione, la lingua della pagina, quale browser è e da quanto la scheda è aperta
    - su un sito di posta o di chat, i tuoi messaggi
    - alcune parole che hai scritto ma non hai inviato, e tutto ciò che un sito mostra, anche qualcosa che considereresti segreto, come un codice in un'email{ $blank }mai pixel. mai HTML grezzo. i siti che lasci fuori non vengono presi, ma gli altri siti mostrati dentro quelle pagine vengono comunque presi.{ $blank }niente analytics. niente telemetria. nessuna chiamata a casa. nessuno ha contato.

browser.copy.everysiteleftout = ogni sito · { $value1 } lasciati fuori

browser.copy.extensionleftout = l'estensione di solstone lo lascia fuori.

browser.copy.failadd = non è stato possibile aggiungere il sito. riprova.

browser.copy.failedbody = { $browser ->
    [firefox] qualcosa è andato storto attivando ogni sito in Firefox.
    [edge] qualcosa è andato storto attivando ogni sito in Edge.
    [chrome] qualcosa è andato storto attivando ogni sito in Chrome.
    [safari] qualcosa è andato storto attivando ogni sito in Safari.
   *[other] qualcosa è andato storto attivando ogni sito nel tuo browser.
}

browser.copy.failgeneric = qualcosa è andato storto. riprova.

browser.copy.failleftout = questo sito è lasciato fuori. smetti prima di lasciarlo fuori.

browser.copy.failpage = non è stato possibile tenere una pagina di questo sito

browser.copy.failpageretry = non è stato possibile tenere una pagina di questo sito. l'estensione riprova quando la pagina cambia.

browser.copy.failrestartsite = non è stato possibile avviare su questo sito. rimuovilo e aggiungilo di nuovo.

browser.copy.failsave = non è stato possibile salvare. riprova.

browser.copy.failsetupfirst = finisci prima la configurazione.

browser.copy.failsite = qualcosa è andato storto su questo sito

browser.copy.failsitefull = ora non c'è spazio per altro da questo sito

browser.copy.fielderror = inserisci un indirizzo di sito, come mail.google.com.

browser.copy.hostalready = { $host } è già nella tua lista.

browser.copy.hostremoved = { $host } rimosso. da lì non arriva niente di nuovo; ciò che è già nel tuo diario resta lì.

browser.copy.isleftoutstopleaving = { $value1 } è lasciato fuori. smetti prima di lasciarlo fuori.

browser.copy.isnolongerleftout = { $value1 } non è più lasciato fuori.

browser.copy.isntallowingeverywebsite = { $value1 } non consente ogni sito

browser.copy.leaveouthelp = lasciare fuori bank.com lascia fuori tutti i siti e le pagine di bank.com, come www.bank.com e login.bank.com, anche dentro un'altra pagina. gli altri siti mostrati dentro le sue pagine vengono comunque condivisi, a meno che non lasci fuori anche quelli.

browser.copy.leaveoutneedsaccess = per lasciare fuori dei siti, consenti Accessibilità nelle impostazioni dell'app di solstone.

browser.copy.leaveoutnote = { $scope ->
   *[exact] lasciarlo fuori copre { $host }. gli altri siti mostrati dentro le sue pagine vengono comunque condivisi.
    [whole] lasciarlo fuori copre tutti i siti e le pagine di { $host }. gli altri siti mostrati dentro di essi vengono comunque condivisi.
}

browser.copy.leftoutannouncement = { $scope ->
   *[exact] { $host } lasciato fuori. gli altri siti mostrati dentro le sue pagine vengono comunque condivisi.
    [whole] tutti i siti e le pagine di { $host } lasciati fuori. gli altri siti mostrati dentro di essi vengono comunque condivisi.
}

browser.copy.leftoutsummary = { $count ->
    [one] { $count } sito lasciato fuori
    [many] { $count } di siti lasciati fuori
   *[other] { $count } siti lasciati fuori
}

browser.copy.linuxcantreach = { $place ->
   *[computer] avvia l'app di solstone su questo computer. se è già in esecuzione, { $doctor } dice che cosa non va.
    [iphone] avvia l'app di solstone su questo iphone. se è già in esecuzione, { $doctor } dice che cosa non va.
    [ipad] avvia l'app di solstone su questo ipad. se è già in esecuzione, { $doctor } dice che cosa non va.
}

browser.copy.linuxintakeoff = riattivali con { $cmd }.

browser.copy.linuxstep1intake = attivali con { $cmd }.

browser.copy.linuxupdate = { $place ->
   *[computer] questa estensione ha bisogno di una versione più recente dell'app di solstone su questo computer. esegui { $cmd } per averla.
    [iphone] questa estensione ha bisogno di una versione più recente dell'app di solstone su questo iphone. esegui { $cmd } per averla.
    [ipad] questa estensione ha bisogno di una versione più recente dell'app di solstone su questo ipad. esegui { $cmd } per averla.
}

browser.copy.nowallowseverywebsiteevery = { $value1 } ora consente ogni sito. ogni sito è attivo, tranne ciò che lasci fuori.

browser.copy.onlythesitesalreadyallows = sono attivi solo i siti che { $value1 } già consente.

browser.copy.permissiondeclinedonlythesites = permesso rifiutato. sono attivi solo i siti che { $value1 } già consente. per aggiungere un sito, aprilo, apri solstone da { $value2 } e scegli aggiungi questo sito.

browser.copy.permissionschanged = { $browser ->
    [firefox] i permessi di Firefox sono cambiati durante il salvataggio. riprova.
    [edge] i permessi di Edge sono cambiati durante il salvataggio. riprova.
    [chrome] i permessi di Chrome sono cambiati durante il salvataggio. riprova.
    [safari] i permessi di Safari sono cambiati durante il salvataggio. riprova.
   *[other] i permessi del tuo browser sono cambiati durante il salvataggio. riprova.
}

browser.copy.privatenote = { $surface ->
   *[desktop] questa estensione non prende niente dalla navigazione privata.
    [mobile] questa estensione non prende niente dalla navigazione privata.
}

browser.copy.privatestate = { $surface ->
   *[desktop] finestra privata
    [mobile] navigazione privata
}

browser.copy.restricted = { $browser ->
    [firefox] Firefox non lascia funzionare le estensioni su questa pagina
    [edge] Edge non lascia funzionare le estensioni su questa pagina
    [chrome] Chrome non lascia funzionare le estensioni su questa pagina
    [safari] Safari non lascia funzionare le estensioni su questa pagina
   *[other] il tuo browser non lascia funzionare le estensioni su questa pagina
}

browser.copy.returnnote = questa pagina controlla di nuovo quando ci torni.

browser.copy.sharegoesin = { $arg1 } ciò che condividi lì ora va nel tuo diario.

browser.copy.sharegoesinnow = { $arg1 } ciò che condividi lì ora va nel tuo diario.

browser.copy.sharingallcount = { $count ->
    [one] { $count } sito lasciato fuori
    [many] { $count } di siti lasciati fuori
   *[other] { $count } siti lasciati fuori
}

browser.copy.sharingevery = ogni sito

browser.copy.sharingexcluded = ogni sito · { $count } lasciati fuori

browser.copy.sheettitle = { $scope ->
   *[exact] aggiungi { $host }?
    [whole] aggiungi tutti i siti e le pagine di { $host }?
}

browser.copy.sownsettingsdont = le impostazioni di { $value1 } non mostrano i siti che lasci fuori. stanno nella lista di solstone.

browser.copy.step1cantreach = { $place ->
   *[computer] l'estensione di solstone funziona con l'app di solstone su questo computer, e senza di essa non viene preso niente. se l'app di solstone non è ancora su questo computer, scaricala su { $site }. questa pagina va avanti da sola quando l'app di solstone risponde.
    [iphone] l'estensione di solstone funziona con l'app di solstone su questo iphone, e senza di essa non viene preso niente. se l'app di solstone non è ancora su questo iphone, scaricala su { $site }. questa pagina va avanti da sola quando l'app di solstone risponde.
    [ipad] l'estensione di solstone funziona con l'app di solstone su questo ipad, e senza di essa non viene preso niente. se l'app di solstone non è ancora su questo ipad, scaricala su { $site }. questa pagina va avanti da sola quando l'app di solstone risponde.
}

browser.copy.step1intakeoff = attivali in fonti, nelle impostazioni dell'app di solstone. questa pagina va avanti da sola.

browser.copy.step1notpaired = { $place ->
   *[computer] accoppia l'app di solstone su questo computer con il tuo diario. questa pagina va avanti da sola quando è accoppiata.
    [iphone] accoppia l'app di solstone su questo iphone con il tuo diario e conferma la marca del tuo diario. questa pagina va avanti da sola quando l'hai fatto.
    [ipad] accoppia l'app di solstone su questo ipad con il tuo diario e conferma la marca del tuo diario. questa pagina va avanti da sola quando l'hai fatto.
}

browser.copy.step1openapp = { $place ->
   *[computer] l'estensione di solstone funziona con l'app di solstone su questo computer, e senza di essa non viene preso niente. apri l'app di solstone per continuare. questa pagina va avanti da sola quando risponde.
    [iphone] l'estensione di solstone funziona con l'app di solstone su questo iphone, e senza di essa non viene preso niente. l'app di solstone non risponde ora. questa estensione riprova da sola, e questa pagina va avanti da sola quando risponde.
    [ipad] l'estensione di solstone funziona con l'app di solstone su questo ipad, e senza di essa non viene preso niente. l'app di solstone non risponde ora. questa estensione riprova da sola, e questa pagina va avanti da sola quando risponde.
}

browser.copy.step2pending = accetterai questo quando il passo sopra è fatto.

browser.copy.step3body = { $browser ->
    [firefox] Firefox ti chiederà di consentirlo.
    [edge] Edge ti chiederà di consentirlo.
    [chrome] Chrome ti chiederà di consentirlo.
    [safari] Safari ti chiederà di consentirlo.
   *[other] il tuo browser ti chiederà di consentirlo.
}

browser.copy.stepextensionsleft = in Estensioni, a sinistra, scegli solstone.

browser.copy.stepforother = imposta Per altri siti web su Consenti.

browser.copy.stepotherwebsites = imposta Per altri siti web su Consenti.

browser.copy.stepsafariwebsites = in Safari scegli Safari › Impostazioni, poi Siti web.

browser.copy.stepsettingsapps = in Impostazioni apri App, poi Safari, poi Estensioni, poi solstone.

browser.copy.stillallowseverywebsite = { $value1 } consente ancora ogni sito.

browser.copy.stillisntallowingevery = { $value1 } non consente ancora ogni sito.

browser.copy.thesolstoneextensionleavesit = l'estensione di solstone lo lascia fuori. l'app di solstone non controlla le finestre di { $value1 } sul tuo schermo.

browser.copy.truncation = una parte di ciò che hai condiviso su questo sito era troppo lunga da tenere

browser.copy.tryagain = riprova

browser.copy.unknownnote = { $surface ->
   *[safari-desktop] se è impostato su Nega nelle impostazioni dei siti web di Safari, non viene preso.
    [safari-mobile] se è impostato su Nega in Impostazioni, sotto App, Safari, Estensioni, solstone, non viene preso.
}

browser.copy.unknownstate = questa estensione non raggiunge questa pagina

browser.copy.warm1 = ti diamo il benvenuto in solstone.

browser.copy.warm2 = l'app di solstone prende ciò che condividi con lei, e tutto va nel tuo diario.

browser.copy.warm3 = il tuo diario è sempre privato, solo tuo.

browser.extension.addingsitecoversevery = aggiungere un sito copre ogni sito e pagina sotto di esso.

browser.extension.clearedextensionsstorage = hai cancellato i dati di questa estensione, quindi è in pausa, e i siti che avevi lasciato fuori non lo sono più. quando riprendi, ogni sito che Safari consente va nel tuo diario.

browser.extension.clearedextensionsstorage2 = hai cancellato i dati di questa estensione, quindi è in pausa. quando riprendi, ogni sito che Safari consente va nel tuo diario, tranne ciò che hai lasciato fuori nell'app di solstone.

browser.extension.enterwebsiteaddresslike = inserisci un indirizzo di sito, come bank.com.

browser.extension.everysiteoffexcept = ogni sito è disattivo, tranne i siti che hai aggiunto uno alla volta.

browser.extension.everysiteoffincluding = ogni sito è disattivo, compresi i siti che hai aggiunto uno alla volta. aggiungi un sito per condividerlo di nuovo.

browser.extension.everywebsiteincludingones = ogni sito, compresi quelli che visiti dopo, quando il browser lo consente. puoi lasciare fuori dei siti.

browser.extension.extensionsbuttonsafaris = il pulsante delle estensioni nella barra degli indirizzi di Safari

browser.extension.extensiontakesnothingfrom = questa estensione non prende niente dalle finestre private.

browser.extension.extensiontakesonlysites = questa estensione prende solo i siti che hai aggiunto, e tutto va nel tuo diario.

browser.extension.onlysitesallowopen = solo i siti che consenti. apri un sito, apri solstone dalla barra degli strumenti o dal menu delle estensioni del browser e scegli aggiungi questo sito.

browser.extension.onlysitessafarialready = sono attivi solo i siti che Safari già consente. per condividere ogni sito:

browser.extension.safarispagemenu = il menu della pagina di Safari

browser.extension.safaristillisnt = Safari non consente ancora ogni sito. imposta Tutti i siti web (o Altri siti web) su Consenti.

browser.extension.safaristillisnt2 = Safari non consente ancora ogni sito. imposta Per altri siti web su Consenti.

browser.extension.setallwebsitesother = imposta Tutti i siti web (o Altri siti web) su Consenti.

browser.extension.shareall = condividi tutto

browser.extension.sharethemtoo = condividi anche questi

browser.extension.sharingeverysiteincludes = condividere ogni sito include i messaggi sui siti di posta e di chat, e parole che hai scritto ma non hai inviato, e tutto va nel tuo diario.

browser.extension.sitesetdenythere = un sito impostato su Nega lì resta disattivo.

browser.extension.solstoneextensionleavesout = l'estensione di solstone lo lascia fuori. l'app di solstone non può lasciare fuori i siti finché non ha Accessibilità.

browser.extension.stopsharingeverysite = smetti di condividere ogni sito

browser.extension.stopsharingeverysite2 = per smettere di condividere ogni sito, imposta Tutti i siti web (o Altri siti web) su Chiedi in Impostazioni, sotto App, Safari, Estensioni, solstone.

browser.extension.stopsharingeverysite3 = per smettere di condividere ogni sito, imposta Per altri siti web su Chiedi nelle impostazioni dei siti web di Safari.

browser.failure.raw = qualcosa è andato storto: { $raw }

browser.labels.onnow = attivo ora

browser.labels.opensettings = apri impostazioni

browser.labels.updatenow = aggiorna ora

browser.manifest.description = sui siti che consenti, l'estensione di solstone prende il testo della pagina, gli indirizzi e la disposizione approssimativa, e tutto va nel tuo diario.

browser.manifest.safaridescription = sui siti che consenti, prende il testo della pagina, gli indirizzi e la disposizione approssimativa, e tutto va nel tuo diario.

browser.options.addasite = aggiungi un sito

browser.options.addsitesoneat = aggiungi i siti uno alla volta

browser.options.agreeaddsitesone = accetta e aggiungi i siti uno alla volta

browser.options.agreegoon = accetta e continua

browser.options.agreeshareeverysite = accetta e condividi ogni sito

browser.options.choosefirst = scegli il primo sito

browser.options.documenttitle = impostazioni di solstone

browser.options.keepmysites = tieni i miei siti

browser.options.leaveout = lascia fuori

browser.options.leaveoutasite = lascia fuori un sito

browser.options.leaveoutplaceholder = bank.com

browser.options.lookingforapp = { $place ->
   *[computer] cerca l'app di solstone su questo computer…
    [iphone] cerca l'app di solstone su questo iphone…
    [ipad] cerca l'app di solstone su questo ipad…
}

browser.options.mobileplaceholder = eff.org

browser.options.pause = pausa

browser.options.pauseheading = pausa con l'app di solstone

browser.options.pausehelp = attivo: quando l'app di solstone su questo computer va in pausa, va in pausa anche questa estensione. disattivo: quando metti in pausa l'app di solstone, questa estensione continua a prendere i siti che condividi, e tutto va nel tuo diario.

browser.options.pauselabel = metti in pausa questa estensione quando l'app di solstone va in pausa

browser.options.placeholder = mail.google.com

browser.options.readagain = leggilo di nuovo

browser.options.remove = rimuovi

browser.options.shareeverysite = condividi ogni sito

browser.options.siterowaria = { $action ->
   *[remove] rimuovi { $host }
    [include] includi di nuovo { $host }
}

browser.options.stopleavingout = smetti di lasciare fuori

browser.options.takesin = ciò che l'estensione di solstone prende

browser.options.version = v{ $version }

browser.options.whatyoushare = ciò che condividi

browser.options.whichsitesdowant = quali siti vuoi nel tuo diario?

browser.options.yoursites = i tuoi siti

browser.page.markerstate = { $phase ->
   *[on] attivo
    [paused] in pausa
}

browser.popup.about = informazioni

browser.popup.added = aggiunto

browser.popup.addedidle = aggiunto. apri o ricarica una scheda

browser.popup.attentionheading = siti che richiedono attenzione

browser.popup.cantadd = questa pagina non si può aggiungere

browser.popup.copybutton = { $phase ->
   *[copy] copia
    [copied] copiato
}

browser.popup.copyfailed = non è stato possibile copiare. seleziona il testo e copialo.

browser.popup.included = incluso

browser.popup.leaveoutthis = lascia fuori questo sito

browser.popup.leftout = lasciato fuori

browser.popup.manage = gestisci ›

browser.popup.notadded = non aggiunto

browser.popup.nottakenin = non viene preso ora

browser.popup.pauseall = { $phase ->
   *[running] pausa tutto
    [paused] riprendi
}

browser.popup.reloadtab = ricarica questa scheda per iniziare

browser.popup.removehost = rimuovi { $arg1 }

browser.popup.removethis = rimuovi questo sito

browser.popup.settings = impostazioni ›

browser.popup.sharing = condivisione

browser.popup.sitecountallon = { $count ->
    [one] { $count } sito, tutti attivi
    [many] { $count } di siti, tutti attivi
   *[other] { $count } siti, tutti attivi
}

browser.popup.sitecountallpaused = { $count ->
    [one] { $count } sito, tutti in pausa
    [many] { $count } di siti, tutti in pausa
   *[other] { $count } siti, tutti in pausa
}

browser.popup.sitecountmixed = { $count ->
    [one] { $count } sito, { $on } attivi
    [many] { $count } di siti, { $on } attivi
   *[other] { $count } siti, { $on } attivi
}

browser.popup.sitecountonly = { $count ->
    [one] { $count } sito
    [many] { $count } di siti
   *[other] { $count } siti
}

browser.popup.stopleavinghostout = smetti di lasciare fuori { $value1 }

browser.popup.stopleavingsiteout = smetti di lasciare fuori questo sito

browser.popup.thispage = questa pagina

browser.popup.whattakes = ciò che prende

browser.status.apppausedheadline = { $surface ->
   *[desktop] l'app di solstone è in pausa
    [mobile] Safari è in pausa nell'app di solstone
}

browser.status.apppausednote = { $place ->
   *[computer] l'app di solstone è in pausa su questo computer
    [iphone] l'app di solstone è in pausa su questo iphone
    [ipad] l'app di solstone è in pausa su questo ipad
}

browser.status.apppausedreason = { $surface ->
   *[desktop] la pausa non trattiene ciò che è già stato preso. riprendi dall'app di solstone.
    [mobile] la pausa non trattiene ciò che è già stato preso. riprendi Safari nell'app di solstone.
}

browser.status.cantreach = non è possibile connettersi all'app di solstone

browser.status.cantreachanswering = { $place ->
   *[computer] l'app di solstone su questo computer non risponde. aprila per continuare.
    [iphone] l'app di solstone su questo iphone non risponde ora. questa estensione riprova da sola.
    [ipad] l'app di solstone su questo ipad non risponde ora. questa estensione riprova da sola.
}

browser.status.cantreachgetapp = { $place ->
   *[computer] l'estensione di solstone funziona con l'app di solstone su questo computer. se l'app di solstone non è ancora su questo computer, scaricala su { $site }.
    [iphone] l'estensione di solstone funziona con l'app di solstone su questo iphone. se l'app di solstone non è ancora su questo iphone, scaricala su { $site }.
    [ipad] l'estensione di solstone funziona con l'app di solstone su questo ipad. se l'app di solstone non è ancora su questo ipad, scaricala su { $site }.
}

browser.status.cantreachreopen = { $place ->
   *[computer] apri l'app di solstone su questo computer. se è già aperta, guarda in fonti, nelle sue impostazioni.
    [iphone] l'app di solstone su questo iphone non risponde ora. questa estensione riprova da sola.
    [ipad] l'app di solstone su questo ipad non risponde ora. questa estensione riprova da sola.
}

browser.status.changingsites = cambio dei tuoi siti

browser.status.connecting = connessione all'app di solstone

browser.status.finishsetup = finisci la configurazione

browser.status.foundsolstoneapp = app di solstone trovata

browser.status.foundsolstoneapps = app di solstone trovata. è in pausa ora.

browser.status.getapp = scarica l'app di solstone

browser.status.icontitle = { $headline }

browser.status.idlereason = { $mode ->
   *[selected] nessuno dei tuoi siti è aperto ora.
    [all] nessuno dei siti che condividi è aperto ora.
}

browser.status.intakeheld = { $place ->
   *[computer] l'app di solstone su questo computer non prende pagine nuove ora.
    [iphone] l'app di solstone su questo iphone non prende pagine nuove ora.
    [ipad] l'app di solstone su questo ipad non prende pagine nuove ora.
}

browser.status.keptfornow = { $place ->
   *[computer] resta per ora su questo computer
    [iphone] resta per ora su questo iphone
    [ipad] resta per ora su questo ipad
}

browser.status.keptfornowreason = { $place ->
   *[computer] ciò che condividi da questo browser resta per ora su questo computer. l'app di solstone ha i dettagli.
    [iphone] ciò che condividi da questo browser resta per ora su questo iphone. l'app di solstone ha i dettagli.
    [ipad] ciò che condividi da questo browser resta per ora su questo ipad. l'app di solstone ha i dettagli.
}

browser.status.keptwaiting = { $place ->
   *[computer] su questo computer, in attesa di andare nel tuo diario
    [iphone] su questo iphone, in attesa di andare nel tuo diario
    [ipad] su questo ipad, in attesa di andare nel tuo diario
}

browser.status.lastpages = le ultime pagine sono arrivate nel tuo diario

browser.status.lostbrowsers = una parte di ciò che hai condiviso dai tuoi browser non è stata tenuta, quindi non va nel tuo diario. l'app di solstone ha i dettagli.

browser.status.lostthis = una parte di ciò che hai condiviso da questo browser non è stata tenuta, quindi non va nel tuo diario.

browser.status.noroom = non c'è altro spazio ora

browser.status.nosites = ancora nessun sito

browser.status.nothingfrombrowser = da questo browser non entra niente di nuovo

browser.status.nothingnew = non entra niente di nuovo

browser.status.nothingrightnow = ora non entra niente di nuovo

browser.status.nothingwaiting = niente in attesa di andare nel tuo diario

browser.status.notpaired = { $place ->
   *[computer] accoppia l'app di solstone su questo computer con il tuo diario, poi torna.
    [iphone] accoppia l'app di solstone su questo iphone con il tuo diario e conferma la marca del tuo diario, poi torna.
    [ipad] accoppia l'app di solstone su questo ipad con il tuo diario e conferma la marca del tuo diario, poi torna.
}

browser.status.notpairedheadline = l'app di solstone non è ancora accoppiata

browser.status.notreaching = non si connette al tuo diario

browser.status.nowordyet = ancora niente su se si connette al tuo diario

browser.status.openandadd = apri un sito che vuoi condividere e scegli aggiungi questo sito.

browser.status.pagesoff = le pagine del browser sono disattivate nell'app di solstone

browser.status.pausedhere = in pausa in questo browser

browser.status.pausedoesnthold = la pausa non trattiene ciò che è già stato preso.

browser.status.pressure = ciò che hai condiviso da questo browser aspetta che l'app di solstone lo accetti. le pagine nuove vengono prese di nuovo quando c'è spazio.

browser.status.reaching = si connette al tuo diario

browser.status.readthenchoose = leggi ciò che l'estensione di solstone prende, poi scegli il primo sito.

browser.status.sitesneedattention = { $count ->
    [one] { $count } sito richiede attenzione
    [many] { $count } di siti richiedono attenzione
   *[other] { $count } siti richiedono attenzione
}

browser.status.somecouldnt = non è stato possibile tenere alcune pagine

browser.status.stopleavinghostout = smetti di lasciare fuori { $value1 }

browser.status.storefull = { $place ->
   *[computer] lo spazio su questo computer per ciò che condividi dai browser è pieno. le pagine nuove vengono prese di nuovo quando c'è spazio. l'app di solstone ha i dettagli.
    [iphone] lo spazio su questo iphone per le pagine di Safari è pieno. apri l'app di solstone per fare spazio.
    [ipad] lo spazio su questo ipad per le pagine di Safari è pieno. apri l'app di solstone per fare spazio.
}

browser.status.turnpageson = riattiva le pagine del browser in fonti, nelle impostazioni dell'app di solstone.

browser.status.unavailable = stato non disponibile

browser.status.unavailablereason = l'estensione di solstone non può mostrare lo stato ora.

browser.status.untilanswers = non entra niente finché non risponde

browser.status.untilpaired = non entra niente finché non è accoppiata

browser.status.untilroom = non entra niente di nuovo finché non c'è spazio

browser.status.untilsaved = non entra niente di nuovo finché questo non è salvato

browser.status.untilupdated = non entra niente di nuovo finché non è aggiornata

browser.status.untilyouadd = non entra niente finché non aggiungi un sito

browser.status.untilyoudo = non entra niente finché non lo fai

browser.status.updateapp = { $place ->
   *[computer] questa estensione ha bisogno di una versione più recente dell'app di solstone su questo computer. guarda in aggiornamenti, nelle impostazioni dell'app di solstone.
    [iphone] aggiorna l'app di solstone su questo iphone.
    [ipad] aggiorna l'app di solstone su questo ipad.
}

browser.status.updateappheadline = aggiorna l'app di solstone

browser.status.updatechecking = { $place ->
   *[computer] l'app di solstone su questo computer ha bisogno di una versione più recente di questa estensione. { $browser } la sta cercando ora.
    [iphone] l'app di solstone su questo iphone ha bisogno di una versione più recente di questa estensione. { $browser } la sta cercando ora.
    [ipad] l'app di solstone su questo ipad ha bisogno di una versione più recente di questa estensione. { $browser } la sta cercando ora.
}

browser.status.updateextension = aggiorna l'estensione di solstone

browser.status.updatefirefoxmanual = { $place ->
   *[computer] l'app di solstone su questo computer ha bisogno di una versione più recente di questa estensione. in Firefox apri Estensioni e temi, poi scegli Controlla aggiornamenti dal menu dell'ingranaggio.
    [iphone] l'app di solstone su questo iphone ha bisogno di una versione più recente di questa estensione. in Firefox apri Estensioni e temi, poi scegli Controlla aggiornamenti dal menu dell'ingranaggio.
    [ipad] l'app di solstone su questo ipad ha bisogno di una versione più recente di questa estensione. in Firefox apri Estensioni e temi, poi scegli Controlla aggiornamenti dal menu dell'ingranaggio.
}

browser.status.updatepending = { $place ->
   *[computer] l'app di solstone su questo computer ha bisogno di una versione più recente di questa estensione. { $browser } non l'ha ancora trovata; controlla di nuovo da solo.
    [iphone] l'app di solstone su questo iphone ha bisogno di una versione più recente di questa estensione. { $browser } non l'ha ancora trovata; controlla di nuovo da solo.
    [ipad] l'app di solstone su questo ipad ha bisogno di una versione più recente di questa estensione. { $browser } non l'ha ancora trovata; controlla di nuovo da solo.
}

browser.status.updateready = l'aggiornamento è pronto.

browser.status.updatesafarimanual = { $place ->
   *[computer] l'app di solstone su questo computer ha bisogno di una versione più recente di questa estensione. in Safari arriva con l'app di solstone, quindi aggiorna l'app di solstone.
    [iphone] l'app di solstone su questo iphone ha bisogno di una versione più recente di questa estensione. in Safari arriva con l'app di solstone, quindi aggiorna l'app di solstone.
    [ipad] l'app di solstone su questo ipad ha bisogno di una versione più recente di questa estensione. in Safari arriva con l'app di solstone, quindi aggiorna l'app di solstone.
}

browser.status.waitedweek = { $place ->
   *[computer] alcune pagine dei tuoi browser aspettano da più di una settimana di andare nel tuo diario. restano su questo computer. l'app di solstone ha i dettagli.
    [iphone] alcune pagine di Safari aspettano da più di una settimana di andare nel tuo diario. restano su questo iphone. apri l'app di solstone e vanno nel tuo diario.
    [ipad] alcune pagine di Safari aspettano da più di una settimana di andare nel tuo diario. restano su questo ipad. apri l'app di solstone e vanno nel tuo diario.
}

browser.status.waitedweekheadline = alcune pagine aspettano da più di una settimana

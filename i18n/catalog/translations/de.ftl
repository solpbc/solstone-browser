browser.about.block = solstone-Erweiterung { $version } · { $os } { $os_version } · { $arch }
    { $journal }

browser.about.daysago = { $count ->
    [one] vor { $count } Tag
   *[other] vor { $count } Tagen
}

browser.about.extensionversion = solstone-Erweiterung { $value1 }

browser.about.hoursago = { $count ->
    [one] vor { $count } Stunde
   *[other] vor { $count } Stunden
}

browser.about.journalunknown = Journal unbekannt

browser.about.justnow = gerade eben

browser.about.lastseen = { $space }· zuletzt gesehen { $value1 }

browser.about.lines = { $own }
    { $journal }

browser.about.minutesago = { $count ->
    [one] vor { $count } Minute
   *[other] vor { $count } Minuten
}

browser.brand.name = solstone

browser.chrome.addthissite = diese Website hinzufügen

browser.chrome.dismiss = verwerfen

browser.chrome.inyourbrowser = in deinem Browser

browser.chrome.itgoesto = es geht zu

browser.copy.accessdeniedhelp = { $surface ->
   *[safari-desktop] um eine einzubeziehen, stelle sie in den Website-Einstellungen von Safari für solstone auf Erlauben.
    [safari-mobile] um eine einzubeziehen, stelle sie in den Einstellungen unter Apps, Safari, Erweiterungen, solstone auf Erlauben.
}

browser.copy.accessgrantedjoin = { $granted }

browser.copy.accessgrantednote = { $surface ->
   *[safari-desktop] eine Website, die in den Website-Einstellungen von Safari auf Ablehnen steht, bleibt aus.
    [safari-mobile] in den Einstellungen unter Apps, Safari, Erweiterungen, solstone bleibt eine Website, die auf Ablehnen steht, aus.
}

browser.copy.addblockedbelow = Safari fragt nicht nach { $arg1 }, solange Safari { $under } erlaubt. um { $arg3 } hinzuzufügen, in den Website-Einstellungen von Safari auf Erlauben stellen.

browser.copy.adddenied = Berechtigung abgelehnt. nichts hinzugefügt.

browser.copy.added = { $scope ->
   *[exact] { $host } hinzugefügt.
    [whole] alle Websites und Seiten von { $host } hinzugefügt.
}

browser.copy.addedjoined = { $scope ->
   *[exact] { $host } hinzugefügt.
    [whole] alle Websites und Seiten von { $host } hinzugefügt.
}

browser.copy.addhelp = bank.com hinzuzufügen teilt jede Website und Seite von bank.com, wie www.bank.com und login.bank.com. um nur einen Teil zu teilen, füge diese Adresse hinzu, wie mail.google.com.

browser.copy.addhelpjoined = { $browser ->
    [firefox] eine Website, die du in den eigenen Einstellungen von Firefox erlaubst, ist auch an.
    [edge] eine Website, die du in den eigenen Einstellungen von Edge erlaubst, ist auch an.
    [chrome] eine Website, die du in den eigenen Einstellungen von Chrome erlaubst, ist auch an.
    [safari] eine Website, die du in den eigenen Einstellungen von Safari erlaubst, ist auch an.
   *[other] eine Website, die du in den eigenen Einstellungen deines Browsers erlaubst, ist auch an.
}

browser.copy.addhelpsuffix = { $browser ->
    [firefox] eine Website, die du in den eigenen Einstellungen von Firefox erlaubst, wird auch hier hinzugefügt.
    [edge] eine Website, die du in den eigenen Einstellungen von Edge erlaubst, wird auch hier hinzugefügt.
    [chrome] eine Website, die du in den eigenen Einstellungen von Chrome erlaubst, wird auch hier hinzugefügt.
    [safari] eine Website, die du in den eigenen Einstellungen von Safari erlaubst, wird auch hier hinzugefügt.
   *[other] eine Website, die du in den eigenen Einstellungen deines Browsers erlaubst, wird auch hier hinzugefügt.
}

browser.copy.addnotnow = eine Website lässt sich gerade nicht hinzufügen. der Status oben sagt, warum.

browser.copy.allowin = { $browser ->
    [firefox] in Firefox erlauben
    [edge] in Edge erlauben
    [chrome] in Chrome erlauben
    [safari] in Safari erlauben
   *[other] in deinem Browser erlauben
}

browser.copy.allowsallofbutthe = { $value1 } erlaubt alles von { $value2 }, aber die solstone-Erweiterung nimmt nur den Teil davon entgegen, den du hinzugefügt hast. alles davon zu teilen kann Nachrichten auf Mail- und Chat-Websites und Wörter, die du getippt, aber nicht gesendet hast, einschließen, und alles davon geht in dein Journal.

browser.copy.allowseverywebsitesoevery = { $value1 } erlaubt jede Website, also ist jede Website an, außer dem, was du auslässt.

browser.copy.allowsmoreofsomesites = { $value1 } erlaubt mehr von manchen Websites, die du hinzugefügt hast, wie { $value2 }, aber die solstone-Erweiterung nimmt nur die Teile davon entgegen, die du hinzugefügt hast. sie alle zu teilen kann Nachrichten auf Mail- und Chat-Websites und Wörter, die du getippt, aber nicht gesendet hast, einschließen, und alles davon geht in dein Journal.

browser.copy.allowsmorethanyoursites = { $value1 } erlaubt mehr als deine Websites. { $value2 }

browser.copy.allowsthesolstoneextensionon = { $value1 } erlaubt die solstone-Erweiterung auf jeder Website, aber nur die Websites, die du hinzugefügt hast, werden entgegengenommen. jede Website zu teilen schließt Nachrichten auf Mail- und Chat-Websites und Wörter, die du getippt, aber nicht gesendet hast, ein, und alles davon geht in dein Journal.

browser.copy.allowsthesolstoneextensionon2 = { $value1 } erlaubt die solstone-Erweiterung auf Websites, die du nicht hinzugefügt hast, wie { $value2 }, aber nur die Websites, die du hinzugefügt hast, werden entgegengenommen. sie zu teilen kann Nachrichten auf Mail- und Chat-Websites und Wörter, die du getippt, aber nicht gesendet hast, einschließen, und alles davon geht in dein Journal.

browser.copy.allsitesandpagesare = alle Websites und Seiten von { $value1 } sind nicht mehr ausgelassen.

browser.copy.alreadyallowseverywebsiteso = { $value1 } erlaubt bereits jede Website, also teilt das Zustimmen jede Website. um stattdessen Websites einzeln zu wählen, ändere das zuerst in { $value2 }.

browser.copy.appleftoutaway = die solstone-App lässt es auch aus.

browser.copy.appleftoutsiteson = aus deinem Journal herausgehalten, einschließlich dieses Browserfensters auf deinem Bildschirm und der Bildschirmaktivität.

browser.copy.appleftoutunreadable = die solstone-Erweiterung lässt es aus. die solstone-App kann die Seitenadressen von { $value1 } gerade nicht lesen, also bleibt { $value1 } außerhalb dessen, was die App von deinem Bildschirm entgegennimmt, bis sie die Adressen lesen kann.

browser.copy.apponlyleftout = ausgelassen in der solstone-App

browser.copy.browsermenu = Symbolleiste oder Erweiterungsmenü deines Browsers

browser.copy.browsername = { $brand ->
        [firefox] Firefox
        [edge] Edge
        [chrome] Chrome
        [safari] Safari
       *[other] dein Browser
    }

browser.copy.checkagain = erneut prüfen

browser.copy.checking = { $browser ->
    [firefox] wird Firefox geprüft…
    [edge] wird Edge geprüft…
    [chrome] wird Chrome geprüft…
    [safari] wird Safari geprüft…
   *[other] wird dein Browser geprüft…
}

browser.copy.couldntcheck = { $browser ->
    [firefox] prüfen, was Firefox erlaubt, ist nicht gelungen. versuch es noch einmal.
    [edge] prüfen, was Edge erlaubt, ist nicht gelungen. versuch es noch einmal.
    [chrome] prüfen, was Chrome erlaubt, ist nicht gelungen. versuch es noch einmal.
    [safari] prüfen, was Safari erlaubt, ist nicht gelungen. versuch es noch einmal.
   *[other] prüfen, was dein Browser erlaubt, ist nicht gelungen. versuch es noch einmal.
}

browser.copy.couldntstart = auf deinen Websites starten ist nicht gelungen

browser.copy.deniednote = { $surface ->
   *[safari-desktop] um sie einzubeziehen, stelle sie in den Website-Einstellungen von Safari auf Erlauben.
    [safari-mobile] um sie einzubeziehen, stelle sie in den Einstellungen unter Apps, Safari, Erweiterungen, solstone auf Erlauben.
}

browser.copy.deniedtitle = { $browser ->
    [firefox] Firefox lässt diese Erweiterung diese Websites nicht entgegennehmen:
    [edge] Edge lässt diese Erweiterung diese Websites nicht entgegennehmen:
    [chrome] Chrome lässt diese Erweiterung diese Websites nicht entgegennehmen:
    [safari] Safari lehnt diese Websites ab, also werden sie nicht entgegengenommen:
   *[other] dein Browser lässt diese Erweiterung diese Websites nicht entgegennehmen:
}

browser.copy.denyingsite = { $browser ->
    [firefox] Firefox lehnt diese Website ab
    [edge] Edge lehnt diese Website ab
    [chrome] Chrome lehnt diese Website ab
    [safari] Safari lehnt diese Website ab
   *[other] dein Browser lehnt diese Website ab
}

browser.copy.desktopactivityon = die solstone-Erweiterung nimmt diese Website nicht entgegen. die Bildschirmaktivität dieses Browsers geht weiterhin in dein Journal.

browser.copy.desktopscreenon = die solstone-Erweiterung nimmt diese Website nicht entgegen. dein Bildschirm geht weiterhin in dein Journal.

browser.copy.disclosure = { $place ->
   *[computer] wohin es geht: nichts verlässt diesen Browser, außer zur solstone-App auf diesem Computer. von dort geht es in dein Journal über den Link, den die solstone-App bereits nutzt.
    [iphone] wohin es geht: nichts verlässt diesen Browser, außer zur solstone-App auf diesem iPhone. von dort geht es in dein Journal über den Link, den die solstone-App bereits nutzt. die solstone-Erweiterung nimmt die Websites, die du erlaubst, weiter entgegen, während die solstone-App geschlossen ist. was sie entgegennimmt, wartet auf diesem iPhone und geht in dein Journal, wenn du die solstone-App das nächste Mal öffnest.
    [ipad] wohin es geht: nichts verlässt diesen Browser, außer zur solstone-App auf diesem iPad. von dort geht es in dein Journal über den Link, den die solstone-App bereits nutzt. die solstone-Erweiterung nimmt die Websites, die du erlaubst, weiter entgegen, während die solstone-App geschlossen ist. was sie entgegennimmt, wartet auf diesem iPad und geht in dein Journal, wenn du die solstone-App das nächste Mal öffnest.
}

browser.copy.disclosurepause = { $surface ->
   *[desktop] pausiere jederzeit in der solstone-Erweiterung. die solstone-App zu pausieren stoppt auch diese Erweiterung, es sei denn, du schaltest das in den Einstellungen aus. das Pausieren hält nicht zurück, was bereits entgegengenommen wurde. wenn du eine Website entfernst, kommt nichts Neues von ihr; was bereits in deinem Journal ist, bleibt dort.
    [mobile] pausiere jederzeit in der solstone-Erweiterung. das Pausieren hält nicht zurück, was bereits entgegengenommen wurde. wenn du eine Website entfernst, kommt nichts Neues von ihr; was bereits in deinem Journal ist, bleibt dort.
}

browser.copy.disclosureprivate = { $surface ->
   *[desktop] die solstone-Erweiterung nimmt nichts aus privaten Fenstern entgegen, auch nicht dort, wo dein Browser sie laufen lässt. das betrifft nur diese Erweiterung.
    [mobile] die solstone-Erweiterung nimmt nichts aus dem privaten Surfen entgegen, auch nicht dort, wo Safari sie laufen lässt. das betrifft nur diese Erweiterung.
}

browser.copy.disclosurerest = die Websites, die du in deinem Browser erlaubst, sind die Websites, die die solstone-Erweiterung entgegennimmt, und das kann jede Website sein. auf diesen Websites nimmt sie den Text der Seite und das grobe Layout entgegen, wann immer ein Tab offen ist, und alles davon geht in dein Journal:
    - den Text, den du sehen kannst, den Text, den du durch Scrollen sehen würdest, Text in Tabs im Hintergrund, manche Beschriftungen, die Seiten für Bildschirmleser und Tooltips bereitstellen, und Text, den die Seite hat, dir aber nicht zeigt
    - die Adresse jeder Seite, ohne irgendetwas nach einem ? oder #, ihren Titel, wann du auf ihr warst, und die Websites, auf die ihre Links zeigen
    - ob der Tab im Vordergrund war, ob sein Fenster den Fokus hatte, ob Audio oder Video lief, die Sprache der Seite, welcher Browser es ist, und wie lange der Tab schon offen ist
    - auf einer Mail- oder Chat-Website deine Nachrichten
    - manche Wörter, die du getippt, aber nicht gesendet hast, und alles, was eine Website zeigt, auch etwas, das du für geheim halten würdest, wie ein Code in einer E-Mail{ $blank }nie Pixel. nie rohes HTML. Websites, die du auslässt, werden nicht entgegengenommen, aber andere Websites, die innerhalb dieser Seiten angezeigt werden, schon.{ $blank }keine Analytik. keine Telemetrie. kein Phone-Home. niemand gezählt.

browser.copy.everysiteleftout = jede Website · { $value1 } ausgelassen

browser.copy.extensionleftout = die solstone-Erweiterung lässt es aus.

browser.copy.failadd = die Website hinzuzufügen ist nicht gelungen. versuch es noch einmal.

browser.copy.failedbody = { $browser ->
    [firefox] da ist beim Einschalten jeder Website in Firefox etwas schiefgelaufen.
    [edge] da ist beim Einschalten jeder Website in Edge etwas schiefgelaufen.
    [chrome] da ist beim Einschalten jeder Website in Chrome etwas schiefgelaufen.
    [safari] da ist beim Einschalten jeder Website in Safari etwas schiefgelaufen.
   *[other] da ist beim Einschalten jeder Website in deinem Browser etwas schiefgelaufen.
}

browser.copy.failgeneric = da ist etwas schiefgelaufen. versuch es noch einmal.

browser.copy.failleftout = diese Website ist ausgelassen. lass sie zuerst nicht mehr aus.

browser.copy.failpage = eine Seite von dieser Website zu behalten ist nicht gelungen

browser.copy.failpageretry = eine Seite von dieser Website zu behalten ist nicht gelungen. die Erweiterung versucht es erneut, wenn sich die Seite ändert.

browser.copy.failrestartsite = auf dieser Website starten ist nicht gelungen. entferne sie und füge sie wieder hinzu.

browser.copy.failsave = das zu speichern ist nicht gelungen. versuch es noch einmal.

browser.copy.failsetupfirst = schließ die Ersteinrichtung zuerst ab.

browser.copy.failsite = da ist auf dieser Website etwas schiefgelaufen

browser.copy.failsitefull = gerade kein Platz für mehr von dieser Website

browser.copy.fielderror = gib eine Website-Adresse ein, wie mail.google.com.

browser.copy.hostalready = { $host } ist bereits auf deiner Liste.

browser.copy.hostremoved = { $host } entfernt. nichts Neues kommt davon; was bereits in deinem Journal ist, bleibt dort.

browser.copy.isleftoutstopleaving = { $value1 } ist ausgelassen. zuerst nicht mehr auslassen.

browser.copy.isnolongerleftout = { $value1 } ist nicht mehr ausgelassen.

browser.copy.isntallowingeverywebsite = { $value1 } erlaubt nicht jede Website

browser.copy.leaveouthelp = bank.com auszulassen lässt alle Websites und Seiten von bank.com aus, wie www.bank.com und login.bank.com, auch innerhalb einer anderen Seite. andere Websites, die in den Seiten davon angezeigt werden, werden weiterhin geteilt, es sei denn, du lässt sie auch aus.

browser.copy.leaveoutneedsaccess = um Websites auszulassen, erlaube Bedienungshilfen in den Einstellungen der solstone-App.

browser.copy.leaveoutnote = { $scope ->
   *[exact] es auszulassen umfasst { $host }. andere Websites, die in den Seiten davon angezeigt werden, werden weiterhin geteilt.
    [whole] es auszulassen umfasst alle Websites und Seiten von { $host }. andere Websites, die darin angezeigt werden, werden weiterhin geteilt.
}

browser.copy.leftoutannouncement = { $scope ->
   *[exact] { $host } ausgelassen. andere Websites, die in den Seiten davon angezeigt werden, werden weiterhin geteilt.
    [whole] alle Websites und Seiten von { $host } ausgelassen. andere Websites, die darin angezeigt werden, werden weiterhin geteilt.
}

browser.copy.leftoutsummary = { $count ->
    [one] { $count } Website ausgelassen
   *[other] { $count } Websites ausgelassen
}

browser.copy.linuxcantreach = { $place ->
   *[computer] starte die solstone-App auf diesem Computer. wenn sie bereits läuft, sagt { $doctor }, was nicht stimmt.
    [iphone] starte die solstone-App auf diesem iPhone. wenn sie bereits läuft, sagt { $doctor }, was nicht stimmt.
    [ipad] starte die solstone-App auf diesem iPad. wenn sie bereits läuft, sagt { $doctor }, was nicht stimmt.
}

browser.copy.linuxintakeoff = schalte sie mit { $cmd } wieder ein.

browser.copy.linuxstep1intake = schalte sie mit { $cmd } ein.

browser.copy.linuxupdate = { $place ->
   *[computer] diese Erweiterung braucht eine neuere Version der solstone-App auf diesem Computer. führe { $cmd } aus, um sie zu holen.
    [iphone] diese Erweiterung braucht eine neuere Version der solstone-App auf diesem iPhone. führe { $cmd } aus, um sie zu holen.
    [ipad] diese Erweiterung braucht eine neuere Version der solstone-App auf diesem iPad. führe { $cmd } aus, um sie zu holen.
}

browser.copy.nowallowseverywebsiteevery = { $value1 } erlaubt jetzt jede Website. jede Website ist an, außer dem, was du auslässt.

browser.copy.onlythesitesalreadyallows = nur die Websites, die { $value1 } bereits erlaubt, sind an.

browser.copy.permissiondeclinedonlythesites = Berechtigung abgelehnt. nur die Websites, die { $value1 } bereits erlaubt, sind an. um eine Website hinzuzufügen, öffne sie, öffne solstone über { $value2 } und wähle diese Website hinzufügen.

browser.copy.permissionschanged = { $browser ->
    [firefox] Die Berechtigungen von Firefox haben sich beim Speichern geändert. versuch es noch einmal.
    [edge] Die Berechtigungen von Edge haben sich beim Speichern geändert. versuch es noch einmal.
    [chrome] Die Berechtigungen von Chrome haben sich beim Speichern geändert. versuch es noch einmal.
    [safari] Die Berechtigungen von Safari haben sich beim Speichern geändert. versuch es noch einmal.
   *[other] die Berechtigungen deines Browsers haben sich beim Speichern geändert. versuch es noch einmal.
}

browser.copy.privatenote = { $surface ->
   *[desktop] diese Erweiterung nimmt nichts aus dem privaten Surfen entgegen.
    [mobile] diese Erweiterung nimmt nichts aus dem privaten Surfen entgegen.
}

browser.copy.privatestate = { $surface ->
   *[desktop] privates Fenster
    [mobile] privates Surfen
}

browser.copy.restricted = { $browser ->
    [firefox] Firefox lässt Erweiterungen auf dieser Seite nicht funktionieren
    [edge] Edge lässt Erweiterungen auf dieser Seite nicht funktionieren
    [chrome] Chrome lässt Erweiterungen auf dieser Seite nicht funktionieren
    [safari] Safari lässt Erweiterungen auf dieser Seite nicht funktionieren
   *[other] dein Browser lässt Erweiterungen auf dieser Seite nicht funktionieren
}

browser.copy.returnnote = diese Seite prüft erneut, wenn du zu ihr zurückkommst.

browser.copy.sharegoesin = { $arg1 } was du dort teilst, geht jetzt in dein Journal.

browser.copy.sharegoesinnow = { $arg1 } was du dort teilst, geht jetzt in dein Journal.

browser.copy.sharingallcount = { $count ->
    [one] { $count } Website ausgelassen
   *[other] { $count } Websites ausgelassen
}

browser.copy.sharingevery = jede Website

browser.copy.sharingexcluded = jede Website · { $count } ausgelassen

browser.copy.sheettitle = { $scope ->
   *[exact] { $host } hinzufügen?
    [whole] alle Websites und Seiten von { $host } hinzufügen?
}

browser.copy.sownsettingsdont = die eigenen Einstellungen von { $value1 } zeigen die Websites nicht, die du auslässt. sie stehen auf der eigenen Liste von solstone.

browser.copy.step1cantreach = { $place ->
   *[computer] die solstone-Erweiterung funktioniert mit der solstone-App auf diesem Computer, und ohne sie wird nichts entgegengenommen. wenn die solstone-App noch nicht auf diesem Computer ist, hol sie dir unter { $site }. diese Seite geht von selbst weiter, sobald die solstone-App antwortet.
    [iphone] die solstone-Erweiterung funktioniert mit der solstone-App auf diesem iPhone, und ohne sie wird nichts entgegengenommen. wenn die solstone-App noch nicht auf diesem iPhone ist, hol sie dir unter { $site }. diese Seite geht von selbst weiter, sobald die solstone-App antwortet.
    [ipad] die solstone-Erweiterung funktioniert mit der solstone-App auf diesem iPad, und ohne sie wird nichts entgegengenommen. wenn die solstone-App noch nicht auf diesem iPad ist, hol sie dir unter { $site }. diese Seite geht von selbst weiter, sobald die solstone-App antwortet.
}

browser.copy.step1intakeoff = schalte sie unter Quellen in den Einstellungen der solstone-App ein. diese Seite geht von selbst weiter.

browser.copy.step1notpaired = { $place ->
   *[computer] kopple die solstone-App auf diesem Computer mit deinem Journal. diese Seite geht von selbst weiter, sobald sie gekoppelt ist.
    [iphone] kopple die solstone-App auf diesem iPhone mit deinem Journal und bestätige die mark deines Journals. diese Seite geht von selbst weiter, sobald du das getan hast.
    [ipad] kopple die solstone-App auf diesem iPad mit deinem Journal und bestätige die mark deines Journals. diese Seite geht von selbst weiter, sobald du das getan hast.
}

browser.copy.step1openapp = { $place ->
   *[computer] die solstone-Erweiterung funktioniert mit der solstone-App auf diesem Computer, und ohne sie wird nichts entgegengenommen. öffne die solstone-App, um weiterzumachen. diese Seite geht von selbst weiter, sobald sie antwortet.
    [iphone] die solstone-Erweiterung funktioniert mit der solstone-App auf diesem iPhone, und ohne sie wird nichts entgegengenommen. die solstone-App antwortet gerade nicht. diese Erweiterung versucht es von allein erneut, und diese Seite geht von selbst weiter, sobald sie antwortet.
    [ipad] die solstone-Erweiterung funktioniert mit der solstone-App auf diesem iPad, und ohne sie wird nichts entgegengenommen. die solstone-App antwortet gerade nicht. diese Erweiterung versucht es von allein erneut, und diese Seite geht von selbst weiter, sobald sie antwortet.
}

browser.copy.step2pending = du stimmst dem zu, sobald der Schritt oben erledigt ist.

browser.copy.step3body = { $browser ->
    [firefox] Firefox wird dich fragen, es zu erlauben.
    [edge] Edge wird dich fragen, es zu erlauben.
    [chrome] Chrome wird dich fragen, es zu erlauben.
    [safari] Safari wird dich fragen, es zu erlauben.
   *[other] dein Browser wird dich fragen, es zu erlauben.
}

browser.copy.stepextensionsleft = unter Erweiterungen links solstone wählen.

browser.copy.stepforother = Beim Besuch anderer Websites auf Erlauben stellen.

browser.copy.stepotherwebsites = Beim Besuch anderer Websites auf Erlauben stellen.

browser.copy.stepsafariwebsites = in Safari: Safari › Einstellungen, dann Websites.

browser.copy.stepsettingsapps = in den Einstellungen Apps, dann Safari, dann Erweiterungen, dann solstone öffnen.

browser.copy.stillallowseverywebsite = { $value1 } erlaubt weiterhin jede Website.

browser.copy.stillisntallowingevery = { $value1 } erlaubt weiterhin nicht jede Website.

browser.copy.thesolstoneextensionleavesit = die solstone-Erweiterung lässt es aus. die solstone-App prüft Fenster von { $value1 } auf deinem Bildschirm nicht.

browser.copy.truncation = ein Teil dessen, was du auf dieser Website geteilt hast, war zu lang zum Behalten

browser.copy.tryagain = erneut versuchen

browser.copy.unknownnote = { $surface ->
   *[safari-desktop] wenn sie in den Website-Einstellungen von Safari auf Ablehnen steht, wird sie nicht entgegengenommen.
    [safari-mobile] wenn sie in den Einstellungen unter Apps, Safari, Erweiterungen, solstone auf Ablehnen steht, wird sie nicht entgegengenommen.
}

browser.copy.unknownstate = diese Erweiterung kann diese Seite nicht erreichen

browser.copy.warm1 = willkommen bei solstone.

browser.copy.warm2 = die solstone-App nimmt entgegen, was du mit ihr teilst, und alles davon geht in dein Journal.

browser.copy.warm3 = dein Journal ist immer privat, nur deins.

browser.extension.addingsitecoversevery = eine Website hinzuzufügen umfasst jede Website und Seite darunter.

browser.extension.clearedextensionsstorage = du hast den Speicher dieser Erweiterung geleert, also ist sie pausiert, und Websites, die du ausgelassen hast, sind nicht mehr ausgelassen. wenn du fortsetzt, geht jede Website, die Safari erlaubt, in dein Journal.

browser.extension.clearedextensionsstorage2 = du hast den Speicher dieser Erweiterung geleert, also ist sie pausiert. wenn du fortsetzt, geht jede Website, die Safari erlaubt, in dein Journal, außer dem, was du in der solstone-App ausgelassen hast.

browser.extension.enterwebsiteaddresslike = gib eine Website-Adresse ein, wie bank.com.

browser.extension.everysiteoffexcept = jede Website ist aus, außer Websites, die du einzeln hinzugefügt hast.

browser.extension.everysiteoffincluding = jede Website ist aus, einschließlich Websites, die du einzeln hinzugefügt hast. füge eine Website hinzu, um sie wieder zu teilen.

browser.extension.everywebsiteincludingones = jede Website, einschließlich solcher, die du später besuchst, sobald dein Browser es erlaubt. du kannst Websites auslassen.

browser.extension.extensionsbuttonsafaris = die Schaltfläche Erweiterungen in der Adressleiste von Safari

browser.extension.extensiontakesnothingfrom = diese Erweiterung nimmt nichts aus privaten Fenstern entgegen.

browser.extension.extensiontakesonlysites = diese Erweiterung nimmt nur die Websites entgegen, die du hinzugefügt hast, und alles davon geht in dein Journal.

browser.extension.onlysitesallowopen = nur die Websites, die du erlaubst. öffne eine Website, öffne solstone über die Symbolleiste oder das Erweiterungsmenü deines Browsers und wähle diese Website hinzufügen.

browser.extension.onlysitessafarialready = nur die Websites, die Safari bereits erlaubt, sind an. um jede Website zu teilen:

browser.extension.safarispagemenu = Seitenmenü von Safari

browser.extension.safaristillisnt = Safari erlaubt noch nicht jede Website. Stelle Alle Websites (oder Andere Websites) auf Erlauben.

browser.extension.safaristillisnt2 = Safari erlaubt noch nicht jede Website. Stelle Beim Besuch anderer Websites auf Erlauben.

browser.extension.setallwebsitesother = Alle Websites (oder Andere Websites) auf Erlauben stellen.

browser.extension.shareall = alles davon teilen

browser.extension.sharethemtoo = sie auch teilen

browser.extension.sharingeverysiteincludes = das Teilen jeder Website umfasst Nachrichten auf Mail- und Chat-Websites und Wörter, die du getippt, aber nicht gesendet hast, und alles davon geht in dein Journal.

browser.extension.sitesetdenythere = eine Website, die dort auf Ablehnen steht, bleibt aus.

browser.extension.solstoneextensionleavesout = die solstone-Erweiterung lässt es aus. die solstone-App kann Websites nicht auslassen, bis sie Bedienungshilfen hat.

browser.extension.stopsharingeverysite = nicht mehr jede Website teilen

browser.extension.stopsharingeverysite2 = um nicht mehr jede Website zu teilen, stelle Alle Websites (oder Andere Websites) in den Einstellungen unter Apps, Safari, Erweiterungen, solstone auf Fragen.

browser.extension.stopsharingeverysite3 = um nicht mehr jede Website zu teilen, stelle Beim Besuch anderer Websites in den Website-Einstellungen von Safari auf Fragen.

browser.failure.raw = da ist etwas schiefgelaufen: { $raw }

browser.labels.onnow = jetzt an

browser.labels.opensettings = Einstellungen öffnen

browser.labels.updatenow = jetzt aktualisieren

browser.manifest.description = auf Websites, die du erlaubst, nimmt die solstone-Erweiterung Seitentext, Adressen und grobes Layout entgegen, und alles davon geht in dein Journal.

browser.manifest.safaridescription = auf Websites, die du erlaubst, nimmt sie Seitentext, Adressen und grobes Layout entgegen, und alles davon geht in dein Journal.

browser.options.addasite = eine Website hinzufügen

browser.options.addsitesoneat = Websites einzeln hinzufügen

browser.options.agreeaddsitesone = zustimmen und Websites einzeln hinzufügen

browser.options.agreegoon = zustimmen und fortfahren

browser.options.agreeshareeverysite = zustimmen und jede Website teilen

browser.options.choosefirst = deine erste Website wählen

browser.options.documenttitle = solstone-Einstellungen

browser.options.keepmysites = meine Websites behalten

browser.options.leaveout = auslassen

browser.options.leaveoutasite = eine Website auslassen

browser.options.leaveoutplaceholder = bank.com

browser.options.lookingforapp = { $place ->
   *[computer] sucht die solstone-App auf diesem Computer…
    [iphone] sucht die solstone-App auf diesem iPhone…
    [ipad] sucht die solstone-App auf diesem iPad…
}

browser.options.mobileplaceholder = eff.org

browser.options.pause = pausieren

browser.options.pauseheading = mit der solstone-App pausieren

browser.options.pausehelp = an: wenn die solstone-App auf diesem Computer pausiert, pausiert auch diese Erweiterung. aus: wenn du die solstone-App pausierst, nimmt diese Erweiterung deine geteilten Websites weiter entgegen, und alles davon geht in dein Journal.

browser.options.pauselabel = diese Erweiterung pausieren, wenn die solstone-App pausiert

browser.options.placeholder = mail.google.com

browser.options.readagain = es erneut lesen

browser.options.remove = entfernen

browser.options.shareeverysite = jede Website teilen

browser.options.siterowaria = { $action ->
   *[remove] { $host } entfernen
    [include] { $host } wieder einbeziehen
}

browser.options.stopleavingout = nicht mehr auslassen

browser.options.takesin = was die solstone-Erweiterung entgegennimmt

browser.options.version = v{ $version }

browser.options.whatyoushare = was du teilst

browser.options.whichsitesdowant = welche Websites willst du in deinem Journal?

browser.options.yoursites = deine Websites

browser.page.markerstate = { $phase ->
   *[on] an
    [paused] pausiert
}

browser.popup.about = über

browser.popup.added = hinzugefügt

browser.popup.addedidle = hinzugefügt. öffne einen Tab oder lade einen Tab neu

browser.popup.attentionheading = Websites, die Aufmerksamkeit brauchen

browser.popup.cantadd = diese Seite kann nicht hinzugefügt werden

browser.popup.copybutton = { $phase ->
   *[copy] kopieren
    [copied] kopiert
}

browser.popup.copyfailed = kopieren ist nicht gelungen. markiere den Text und kopiere ihn.

browser.popup.included = einbezogen

browser.popup.leaveoutthis = diese Website auslassen

browser.popup.leftout = ausgelassen

browser.popup.manage = verwalten ›

browser.popup.notadded = nicht hinzugefügt

browser.popup.nottakenin = wird gerade nicht entgegengenommen

browser.popup.pauseall = { $phase ->
   *[running] alles pausieren
    [paused] fortsetzen
}

browser.popup.reloadtab = lade diesen Tab neu, um zu beginnen

browser.popup.removehost = { $arg1 } entfernen

browser.popup.removethis = diese Website entfernen

browser.popup.settings = Einstellungen ›

browser.popup.sharing = Teilen

browser.popup.sitecountallon = { $count ->
    [one] { $count } Website, alle an
   *[other] { $count } Websites, alle an
}

browser.popup.sitecountallpaused = { $count ->
    [one] { $count } Website, alle pausiert
   *[other] { $count } Websites, alle pausiert
}

browser.popup.sitecountmixed = { $count ->
    [one] { $count } Website, { $on } an
   *[other] { $count } Websites, { $on } an
}

browser.popup.sitecountonly = { $count ->
    [one] { $count } Website
   *[other] { $count } Websites
}

browser.popup.stopleavinghostout = { $value1 } nicht mehr auslassen

browser.popup.stopleavingsiteout = diese Website nicht mehr auslassen

browser.popup.thispage = diese Seite

browser.popup.whattakes = was sie entgegennimmt

browser.status.apppausedheadline = { $surface ->
   *[desktop] die solstone-App ist pausiert
    [mobile] Safari ist in der solstone-App pausiert
}

browser.status.apppausednote = { $place ->
   *[computer] die solstone-App ist auf diesem Computer pausiert
    [iphone] die solstone-App ist auf diesem iPhone pausiert
    [ipad] die solstone-App ist auf diesem iPad pausiert
}

browser.status.apppausedreason = { $surface ->
   *[desktop] das Pausieren hält nicht zurück, was schon entgegengenommen wurde. setze in der solstone-App fort.
    [mobile] das Pausieren hält nicht zurück, was schon entgegengenommen wurde. setze Safari in der solstone-App fort.
}

browser.status.cantreach = die solstone-App ist nicht erreichbar

browser.status.cantreachanswering = { $place ->
   *[computer] die solstone-App auf diesem Computer antwortet nicht. öffne sie, um fortzufahren.
    [iphone] die solstone-App auf diesem iPhone antwortet gerade nicht. diese Erweiterung versucht es von selbst erneut.
    [ipad] die solstone-App auf diesem iPad antwortet gerade nicht. diese Erweiterung versucht es von selbst erneut.
}

browser.status.cantreachgetapp = { $place ->
   *[computer] die solstone-Erweiterung funktioniert mit der solstone-App auf diesem Computer. wenn die solstone-App noch nicht auf diesem Computer ist, hol sie unter { $site }.
    [iphone] die solstone-Erweiterung funktioniert mit der solstone-App auf diesem iPhone. wenn die solstone-App noch nicht auf diesem iPhone ist, hol sie unter { $site }.
    [ipad] die solstone-Erweiterung funktioniert mit der solstone-App auf diesem iPad. wenn die solstone-App noch nicht auf diesem iPad ist, hol sie unter { $site }.
}

browser.status.cantreachreopen = { $place ->
   *[computer] öffne die solstone-App auf diesem Computer. wenn sie schon offen ist, schau unter Quellen in ihren Einstellungen.
    [iphone] die solstone-App auf diesem iPhone antwortet gerade nicht. diese Erweiterung versucht es von selbst erneut.
    [ipad] die solstone-App auf diesem iPad antwortet gerade nicht. diese Erweiterung versucht es von selbst erneut.
}

browser.status.changingsites = ändert deine Websites

browser.status.connecting = verbindet mit der solstone-App

browser.status.finishsetup = einrichten abschließen

browser.status.foundsolstoneapp = die solstone-App gefunden

browser.status.foundsolstoneapps = die solstone-App gefunden. gerade ist sie pausiert.

browser.status.getapp = die solstone-App holen

browser.status.icontitle = { $headline }

browser.status.idlereason = { $mode ->
   *[selected] keine deiner Websites ist gerade offen.
    [all] keine der Websites, die du teilst, ist gerade offen.
}

browser.status.intakeheld = { $place ->
   *[computer] die solstone-App auf diesem Computer nimmt gerade keine neuen Seiten entgegen.
    [iphone] die solstone-App auf diesem iPhone nimmt gerade keine neuen Seiten entgegen.
    [ipad] die solstone-App auf diesem iPad nimmt gerade keine neuen Seiten entgegen.
}

browser.status.keptfornow = { $place ->
   *[computer] vorerst auf diesem Computer behalten
    [iphone] vorerst auf diesem iPhone behalten
    [ipad] vorerst auf diesem iPad behalten
}

browser.status.keptfornowreason = { $place ->
   *[computer] was du aus diesem Browser teilst, wird vorerst auf diesem Computer behalten. die solstone-App hat die Einzelheiten.
    [iphone] was du aus diesem Browser teilst, wird vorerst auf diesem iPhone behalten. die solstone-App hat die Einzelheiten.
    [ipad] was du aus diesem Browser teilst, wird vorerst auf diesem iPad behalten. die solstone-App hat die Einzelheiten.
}

browser.status.keptwaiting = { $place ->
   *[computer] auf diesem Computer behalten, wartet darauf, in dein Journal zu gehen
    [iphone] auf diesem iPhone behalten, wartet darauf, in dein Journal zu gehen
    [ipad] auf diesem iPad behalten, wartet darauf, in dein Journal zu gehen
}

browser.status.lastpages = die letzten Seiten sind in deinem Journal angekommen

browser.status.lostbrowsers = ein Teil dessen, was du aus deinen Browsern geteilt hast, konnte nicht behalten werden, also geht er nicht in dein Journal. die solstone-App hat die Einzelheiten.

browser.status.lostthis = ein Teil dessen, was du aus diesem Browser geteilt hast, konnte nicht behalten werden, also geht er nicht in dein Journal.

browser.status.noroom = gerade kein Platz für mehr

browser.status.nosites = noch keine Websites

browser.status.nothingfrombrowser = nichts Neues wird aus diesem Browser entgegengenommen

browser.status.nothingnew = nichts Neues wird entgegengenommen

browser.status.nothingrightnow = gerade wird nichts Neues entgegengenommen

browser.status.nothingwaiting = nichts wartet darauf, in dein Journal zu gehen

browser.status.notpaired = { $place ->
   *[computer] kopple die solstone-App auf diesem Computer mit deinem Journal, dann komm zurück.
    [iphone] kopple die solstone-App auf diesem iPhone mit deinem Journal und bestätige die mark deines Journals, dann komm zurück.
    [ipad] kopple die solstone-App auf diesem iPad mit deinem Journal und bestätige die mark deines Journals, dann komm zurück.
}

browser.status.notpairedheadline = die solstone-App ist noch nicht gekoppelt

browser.status.notreaching = erreicht dein Journal nicht

browser.status.nowordyet = noch keine Auskunft, ob es dein Journal erreicht

browser.status.openandadd = öffne eine Website, die du teilen willst, und wähle diese Website hinzufügen.

browser.status.pagesoff = Browserseiten sind in der solstone-App aus

browser.status.pausedhere = in diesem Browser pausiert

browser.status.pausedoesnthold = das Pausieren hält nicht zurück, was schon entgegengenommen wurde.

browser.status.pressure = was du aus diesem Browser geteilt hast, wartet darauf, dass die solstone-App es annimmt. neue Seiten werden wieder entgegengenommen, sobald Platz ist.

browser.status.reaching = erreicht dein Journal

browser.status.readthenchoose = lies, was die solstone-Erweiterung entgegennimmt, dann wähle deine erste Website.

browser.status.sitesneedattention = { $count ->
    [one] { $count } Website braucht Aufmerksamkeit
   *[other] { $count } Websites brauchen Aufmerksamkeit
}

browser.status.somecouldnt = einige Seiten konnten nicht behalten werden

browser.status.stopleavinghostout = { $value1 } nicht mehr auslassen

browser.status.storefull = { $place ->
   *[computer] der Platz auf diesem Computer für das, was du aus deinen Browsern teilst, ist voll. neue Seiten werden wieder entgegengenommen, sobald Platz ist. die solstone-App hat die Einzelheiten.
    [iphone] der Platz auf diesem iPhone für Safari-Seiten ist voll. öffne die solstone-App, um Platz zu schaffen.
    [ipad] der Platz auf diesem iPad für Safari-Seiten ist voll. öffne die solstone-App, um Platz zu schaffen.
}

browser.status.turnpageson = schalte Browserseiten unter Quellen in den Einstellungen der solstone-App wieder ein.

browser.status.unavailable = Status nicht verfügbar

browser.status.unavailablereason = die solstone-Erweiterung kann ihren Status gerade nicht anzeigen.

browser.status.untilanswers = nichts wird entgegengenommen, bis sie antwortet

browser.status.untilpaired = nichts wird entgegengenommen, bis es so ist

browser.status.untilroom = nichts Neues wird entgegengenommen, bis Platz ist

browser.status.untilsaved = nichts Neues wird entgegengenommen, bis das gespeichert ist

browser.status.untilupdated = nichts Neues wird entgegengenommen, bis sie aktualisiert ist

browser.status.untilyouadd = nichts wird entgegengenommen, bis du eine Website hinzufügst

browser.status.untilyoudo = nichts wird entgegengenommen, bis du es tust

browser.status.updateapp = { $place ->
   *[computer] diese Erweiterung braucht eine neuere Version der solstone-App auf diesem Computer. schau unter Aktualisierungen in den Einstellungen der solstone-App.
    [iphone] aktualisiere die solstone-App auf diesem iPhone.
    [ipad] aktualisiere die solstone-App auf diesem iPad.
}

browser.status.updateappheadline = die solstone-App aktualisieren

browser.status.updatechecking = { $place ->
   *[computer] die solstone-App auf diesem Computer braucht eine neuere Version dieser Erweiterung. { $browser } sucht jetzt danach.
    [iphone] die solstone-App auf diesem iPhone braucht eine neuere Version dieser Erweiterung. { $browser } sucht jetzt danach.
    [ipad] die solstone-App auf diesem iPad braucht eine neuere Version dieser Erweiterung. { $browser } sucht jetzt danach.
}

browser.status.updateextension = die solstone-Erweiterung aktualisieren

browser.status.updatefirefoxmanual = { $place ->
   *[computer] die solstone-App auf diesem Computer braucht eine neuere Version dieser Erweiterung. in Firefox, Add-ons und Themes öffnen, dann aus dem Zahnradmenü Nach Updates suchen wählen.
    [iphone] die solstone-App auf diesem iPhone braucht eine neuere Version dieser Erweiterung. in Firefox, Add-ons und Themes öffnen, dann aus dem Zahnradmenü Nach Updates suchen wählen.
    [ipad] die solstone-App auf diesem iPad braucht eine neuere Version dieser Erweiterung. in Firefox, Add-ons und Themes öffnen, dann aus dem Zahnradmenü Nach Updates suchen wählen.
}

browser.status.updatepending = { $place ->
   *[computer] die solstone-App auf diesem Computer braucht eine neuere Version dieser Erweiterung. { $browser } hat sie noch nicht gefunden und prüft von selbst erneut.
    [iphone] die solstone-App auf diesem iPhone braucht eine neuere Version dieser Erweiterung. { $browser } hat sie noch nicht gefunden und prüft von selbst erneut.
    [ipad] die solstone-App auf diesem iPad braucht eine neuere Version dieser Erweiterung. { $browser } hat sie noch nicht gefunden und prüft von selbst erneut.
}

browser.status.updateready = die Aktualisierung ist bereit.

browser.status.updatesafarimanual = { $place ->
   *[computer] die solstone-App auf diesem Computer braucht eine neuere Version dieser Erweiterung. in Safari kommt sie mit der solstone-App, also aktualisiere die solstone-App.
    [iphone] die solstone-App auf diesem iPhone braucht eine neuere Version dieser Erweiterung. in Safari kommt sie mit der solstone-App, also aktualisiere die solstone-App.
    [ipad] die solstone-App auf diesem iPad braucht eine neuere Version dieser Erweiterung. in Safari kommt sie mit der solstone-App, also aktualisiere die solstone-App.
}

browser.status.waitedweek = { $place ->
   *[computer] einige Seiten aus deinen Browsern warten seit mehr als einer Woche darauf, in dein Journal zu gehen. sie sind auf diesem Computer noch behalten. die solstone-App hat die Einzelheiten.
    [iphone] einige Seiten aus Safari warten seit mehr als einer Woche darauf, in dein Journal zu gehen. sie sind auf diesem iPhone noch behalten. öffne die solstone-App, und sie gehen in dein Journal.
    [ipad] einige Seiten aus Safari warten seit mehr als einer Woche darauf, in dein Journal zu gehen. sie sind auf diesem iPad noch behalten. öffne die solstone-App, und sie gehen in dein Journal.
}

browser.status.waitedweekheadline = einige Seiten warten seit mehr als einer Woche

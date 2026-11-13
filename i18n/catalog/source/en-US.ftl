browser.about.block = solstone extension { $version } · { $os } { $os_version } · { $arch }
    { $journal }

browser.about.daysago = { $count ->
    [one] { $count } day ago
   *[other] { $count } days ago
}

browser.about.hoursago = { $count ->
    [one] { $count } hour ago
   *[other] { $count } hours ago
}

browser.about.journalunknown = journal unknown

browser.about.justnow = just now

browser.about.minutesago = { $count ->
    [one] { $count } minute ago
   *[other] { $count } minutes ago
}

browser.brand.name = solstone

browser.chrome.addthissite = add this site

browser.chrome.dismiss = dismiss

browser.chrome.inyourbrowser = in your browser

browser.chrome.itgoesto = it goes to

browser.copy.accessdeniedhelp = { $surface ->
   *[safari-desktop] to include one, set it to Allow in Safari's website settings for solstone.
    [safari-mobile] to include one, set it to Allow in Settings, under Apps, Safari, Extensions, solstone.
}

browser.copy.accessgrantedjoin = { $granted }

browser.copy.accessgrantednote = { $surface ->
   *[safari-desktop] a site set to Deny in Safari's website settings stays off.
    [safari-mobile] in Settings, under Apps, Safari, Extensions, solstone, a site set to Deny stays off.
}

browser.copy.addblockedbelow = Safari won't ask about { $arg1 } while it allows { $under }. to add { $arg3 }, set it to Allow in Safari's website settings.

browser.copy.adddenied = permission declined. nothing added.

browser.copy.added = { $scope ->
   *[exact] { $host } added.
    [whole] all { $host } sites and pages added.
}

browser.copy.addedjoined = { $scope ->
   *[exact] { $host } added.
    [whole] all { $host } sites and pages added.
}

browser.copy.addhelp = adding bank.com shares every bank.com site and page, like www.bank.com and login.bank.com. to share only part, add that address, like mail.google.com.

browser.copy.addhelpjoined = { $browser ->
    [firefox] a site you allow in Firefox's own settings is on too.
    [edge] a site you allow in Edge's own settings is on too.
    [chrome] a site you allow in Chrome's own settings is on too.
    [safari] a site you allow in Safari's own settings is on too.
   *[other] a site you allow in your browser's own settings is on too.
}

browser.copy.addhelpsuffix = { $browser ->
    [firefox] a site you allow in Firefox's own settings is added here too.
    [edge] a site you allow in Edge's own settings is added here too.
    [chrome] a site you allow in Chrome's own settings is added here too.
    [safari] a site you allow in Safari's own settings is added here too.
   *[other] a site you allow in your browser's own settings is added here too.
}

browser.copy.addnotnow = can't add a site right now. the status above says why.

browser.copy.allowin = { $browser ->
    [firefox] allow in Firefox
    [edge] allow in Edge
    [chrome] allow in Chrome
    [safari] allow in Safari
   *[other] allow in your browser
}

browser.copy.appleftoutaway = the solstone app leaves it out too.

browser.copy.appleftoutsiteson = kept out of your journal, including this browser window on your screen and activity.

browser.copy.apponlyleftout = left out in the solstone app

browser.copy.checkagain = check again

browser.copy.checking = { $browser ->
    [firefox] checking Firefox…
    [edge] checking Edge…
    [chrome] checking Chrome…
    [safari] checking Safari…
   *[other] checking your browser…
}

browser.copy.couldntcheck = { $browser ->
    [firefox] couldn't check what Firefox allows. try again.
    [edge] couldn't check what Edge allows. try again.
    [chrome] couldn't check what Chrome allows. try again.
    [safari] couldn't check what Safari allows. try again.
   *[other] couldn't check what your browser allows. try again.
}

browser.copy.couldntstart = couldn't start on your sites

browser.copy.deniednote = { $surface ->
   *[safari-desktop] to include it, set it to Allow in Safari's website settings.
    [safari-mobile] to include it, set it to Allow in Settings, under Apps, Safari, Extensions, solstone.
}

browser.copy.deniedtitle = { $browser ->
    [firefox] Firefox doesn't let this extension take in these sites:
    [edge] Edge doesn't let this extension take in these sites:
    [chrome] Chrome doesn't let this extension take in these sites:
    [safari] Safari is denying these sites, so they aren't taken in:
   *[other] your browser doesn't let this extension take in these sites:
}

browser.copy.denyingsite = { $browser ->
    [firefox] Firefox is denying this site
    [edge] Edge is denying this site
    [chrome] Chrome is denying this site
    [safari] Safari is denying this site
   *[other] your browser is denying this site
}

browser.copy.desktopactivityon = the solstone extension isn't taking in this site. this browser's activity still goes into your journal.

browser.copy.desktopscreenon = the solstone extension isn't taking in this site. your screen still goes into your journal.

browser.copy.disclosure = { $place ->
   *[computer] where it goes: nothing leaves this browser except to the solstone app on this computer. from there it goes into your journal over the link the solstone app already uses.
    [iphone] where it goes: nothing leaves this browser except to the solstone app on this iphone. from there it goes into your journal over the link the solstone app already uses. the solstone extension keeps taking in the sites you allow while the solstone app is closed. what it takes in waits on this iphone and goes into your journal the next time you open the solstone app.
    [ipad] where it goes: nothing leaves this browser except to the solstone app on this ipad. from there it goes into your journal over the link the solstone app already uses. the solstone extension keeps taking in the sites you allow while the solstone app is closed. what it takes in waits on this ipad and goes into your journal the next time you open the solstone app.
}

browser.copy.disclosurepause = { $surface ->
   *[desktop] pause any time in the solstone extension. pausing the solstone app stops this extension too, unless you turn that off in settings. pausing doesn't hold back what's already taken in. if you remove a site, nothing new comes from it; what's already in your journal stays there.
    [mobile] pause any time in the solstone extension. pausing doesn't hold back what's already taken in. if you remove a site, nothing new comes from it; what's already in your journal stays there.
}

browser.copy.disclosureprivate = { $surface ->
   *[desktop] the solstone extension takes in nothing from private windows, even where your browser lets it run there. that covers this extension only.
    [mobile] the solstone extension takes in nothing from private browsing, even where Safari lets it run there. that covers this extension only.
}

browser.copy.disclosurerest = the sites you allow in your browser are the sites the solstone extension takes in, and that can be every site. on those sites, it takes in the page's text and rough layout whenever a tab is open, and all of it goes into your journal:
    - the text you can see, the text you'd see by scrolling, text in background tabs, some labels pages provide for screen readers and tooltips, and text the page has but doesn't show you
    - each page's address, without anything after a ? or #, its title, when you were on it, and the sites its links point to
    - whether the tab was in front, whether its window had focus, whether audio or video was playing, the page's language, which browser it is, and how long the tab has been open
    - on a mail or chat site, your messages
    - some words you've typed but haven't sent, and anything a site shows, even something you'd consider secret, like a code in an email{ $blank }never pixels. never raw HTML. sites you leave out aren't taken in, but other sites shown inside those pages still are.{ $blank }no analytics. no telemetry. no phone home. nobody counted.

browser.copy.extensionleftout = the solstone extension leaves it out.

browser.copy.failadd = couldn't add the site. try again.

browser.copy.failedbody = { $browser ->
    [firefox] something went wrong turning on every site in Firefox.
    [edge] something went wrong turning on every site in Edge.
    [chrome] something went wrong turning on every site in Chrome.
    [safari] something went wrong turning on every site in Safari.
   *[other] something went wrong turning on every site in your browser.
}

browser.copy.failgeneric = something went wrong. try again.

browser.copy.failleftout = this site is left out. stop leaving it out first.

browser.copy.failpage = a page from this site couldn't be kept

browser.copy.failpageretry = a page from this site couldn't be kept. the extension tries again when the page changes.

browser.copy.failrestartsite = couldn't start on this site. remove it and add it again.

browser.copy.failsave = couldn't save that. try again.

browser.copy.failsetupfirst = finish setting up first.

browser.copy.failsite = something went wrong on this site

browser.copy.failsitefull = no room for more from this site right now

browser.copy.fielderror = enter a website address, like mail.google.com.

browser.copy.hostalready = { $host } is already on your list.

browser.copy.hostremoved = { $host } removed. nothing new comes from it; what's already in your journal stays there.

browser.copy.leaveouthelp = leaving out bank.com leaves out all bank.com sites and pages, like www.bank.com and login.bank.com, even inside another page. other sites shown inside its pages are still shared, unless you leave them out too.

browser.copy.leaveoutnote = { $scope ->
   *[exact] leaving it out covers { $host }. other sites shown inside its pages are still shared.
    [whole] leaving it out covers all { $host } sites and pages. other sites shown inside them are still shared.
}

browser.copy.leftoutannouncement = { $scope ->
   *[exact] { $host } left out. other sites shown inside its pages are still shared.
    [whole] all { $host } sites and pages left out. other sites shown inside them are still shared.
}

browser.copy.leftoutsummary = { $count ->
    [one] { $count } site left out
   *[other] { $count } sites left out
}

browser.copy.linuxcantreach = { $place ->
   *[computer] start the solstone app on this computer. if it's already running, { $doctor } says what's wrong.
    [iphone] start the solstone app on this iphone. if it's already running, { $doctor } says what's wrong.
    [ipad] start the solstone app on this ipad. if it's already running, { $doctor } says what's wrong.
}

browser.copy.linuxintakeoff = turn them back on with { $cmd }.

browser.copy.linuxstep1intake = turn them on with { $cmd }.

browser.copy.linuxupdate = { $place ->
   *[computer] this extension needs a newer version of the solstone app on this computer. run { $cmd } to get it.
    [iphone] this extension needs a newer version of the solstone app on this iphone. run { $cmd } to get it.
    [ipad] this extension needs a newer version of the solstone app on this ipad. run { $cmd } to get it.
}

browser.copy.permissionschanged = { $browser ->
    [firefox] Firefox's permissions changed while saving. try again.
    [edge] Edge's permissions changed while saving. try again.
    [chrome] Chrome's permissions changed while saving. try again.
    [safari] Safari's permissions changed while saving. try again.
   *[other] your browser's permissions changed while saving. try again.
}

browser.copy.privatenote = { $surface ->
   *[desktop] this extension takes in nothing from private browsing.
    [mobile] this extension takes in nothing from private browsing.
}

browser.copy.privatestate = { $surface ->
   *[desktop] private window
    [mobile] private browsing
}

browser.copy.restricted = { $browser ->
    [firefox] Firefox doesn't let extensions work on this page
    [edge] Edge doesn't let extensions work on this page
    [chrome] Chrome doesn't let extensions work on this page
    [safari] Safari doesn't let extensions work on this page
   *[other] your browser doesn't let extensions work on this page
}

browser.copy.returnnote = this page checks again when you come back to it.

browser.copy.sharegoesin = { $arg1 } what you share there now goes into your journal.

browser.copy.sharegoesinnow = { $arg1 } what you share there now goes into your journal.

browser.copy.sharingallcount = { $count ->
    [one] { $count } site left out
   *[other] { $count } sites left out
}

browser.copy.sheettitle = { $scope ->
   *[exact] add { $host }?
    [whole] add all { $host } sites and pages?
}

browser.copy.step1cantreach = { $place ->
   *[computer] the solstone extension works with the solstone app on this computer, and nothing is taken in without it. if the solstone app isn't on this computer yet, get it at { $site }. this page moves on by itself once the solstone app answers.
    [iphone] the solstone extension works with the solstone app on this iphone, and nothing is taken in without it. if the solstone app isn't on this iphone yet, get it at { $site }. this page moves on by itself once the solstone app answers.
    [ipad] the solstone extension works with the solstone app on this ipad, and nothing is taken in without it. if the solstone app isn't on this ipad yet, get it at { $site }. this page moves on by itself once the solstone app answers.
}

browser.copy.step1intakeoff = turn them on under sources in the solstone app's settings. this page moves on by itself.

browser.copy.step1notpaired = { $place ->
   *[computer] pair the solstone app on this computer with your journal. this page moves on by itself once it is.
    [iphone] pair the solstone app on this iphone with your journal and confirm your journal's mark. this page moves on by itself once you have.
    [ipad] pair the solstone app on this ipad with your journal and confirm your journal's mark. this page moves on by itself once you have.
}

browser.copy.step1openapp = { $place ->
   *[computer] the solstone extension works with the solstone app on this computer, and nothing is taken in without it. open the solstone app to go on. this page moves on by itself once it answers.
    [iphone] the solstone extension works with the solstone app on this iphone, and nothing is taken in without it. the solstone app isn't answering right now. this extension tries again on its own, and this page moves on by itself once it answers.
    [ipad] the solstone extension works with the solstone app on this ipad, and nothing is taken in without it. the solstone app isn't answering right now. this extension tries again on its own, and this page moves on by itself once it answers.
}

browser.copy.step2pending = you'll agree to this once the step above is done.

browser.copy.step3body = { $browser ->
    [firefox] Firefox will ask you to allow it.
    [edge] Edge will ask you to allow it.
    [chrome] Chrome will ask you to allow it.
    [safari] Safari will ask you to allow it.
   *[other] your browser will ask you to allow it.
}

browser.copy.stepextensionsleft = under Extensions on the left, choose solstone.

browser.copy.stepforother = set For other websites to Allow.

browser.copy.stepotherwebsites = set For other websites to Allow.

browser.copy.stepsafariwebsites = in Safari, choose Safari › Settings, then Websites.

browser.copy.stepsettingsapps = in Settings, open Apps, then Safari, then Extensions, then solstone.

browser.copy.truncation = part of what you shared on this site was too long to keep

browser.copy.tryagain = try again

browser.copy.unknownnote = { $surface ->
   *[safari-desktop] if it's set to Deny in Safari's website settings, it isn't taken in.
    [safari-mobile] if it's set to Deny in Settings, under Apps, Safari, Extensions, solstone, it isn't taken in.
}

browser.copy.unknownstate = this extension can't reach this page

browser.copy.warm1 = welcome to solstone.

browser.copy.warm2 = the solstone app takes in what you share with it, and all of it goes into your journal.

browser.copy.warm3 = your journal is always private, only yours.

browser.extension.addingsitecoversevery = adding a site covers every site and page under it.

browser.extension.clearedextensionsstorage = you cleared this extension's storage, so it's paused, and sites you left out aren't left out any more. when you resume, every site Safari allows goes into your journal.

browser.extension.clearedextensionsstorage2 = you cleared this extension's storage, so it's paused. when you resume, every site Safari allows goes into your journal, except what you've left out in the solstone app.

browser.extension.enterwebsiteaddresslike = enter a website address, like bank.com.

browser.extension.everysiteoffexcept = every site is off, except sites you added one at a time.

browser.extension.everysiteoffincluding = every site is off, including sites you added one at a time. add a site to share it again.

browser.extension.everywebsiteincludingones = every website, including ones you visit later, once your browser allows it. you can leave sites out.

browser.extension.extensionsbuttonsafaris = the extensions button in Safari's address bar

browser.extension.extensiontakesnothingfrom = this extension takes in nothing from private windows.

browser.extension.extensiontakesonlysites = this extension takes in only the sites you added, and all of it goes into your journal.

browser.extension.onlysitesallowopen = only the sites you allow. open a site, open solstone from your browser's toolbar or extensions menu, and choose add this site.

browser.extension.onlysitessafarialready = only the sites Safari already allows are on. to share every site:

browser.extension.safarispagemenu = Safari's page menu

browser.extension.safaristillisnt = Safari still isn't allowing every website. set All Websites (or Other Websites) to Allow.

browser.extension.safaristillisnt2 = Safari still isn't allowing every website. set For other websites to Allow.

browser.extension.setallwebsitesother = set All Websites (or Other Websites) to Allow.

browser.extension.shareall = share all of it

browser.extension.sharethemtoo = share them too

browser.extension.sharingeverysiteincludes = sharing every site includes messages on mail and chat sites, and words you've typed but haven't sent, and all of it goes into your journal.

browser.extension.sitesetdenythere = a site set to Deny there stays off.

browser.extension.solstoneextensionleavesout = the solstone extension leaves it out. the solstone app can't leave websites out until it has Accessibility.

browser.extension.stopsharingeverysite = stop sharing every site

browser.extension.stopsharingeverysite2 = to stop sharing every site, set All Websites (or Other Websites) to Ask in Settings, under Apps, Safari, Extensions, solstone.

browser.extension.stopsharingeverysite3 = to stop sharing every site, set For other websites to Ask in Safari's website settings.

browser.failure.raw = something went wrong: { $raw }

browser.manifest.description = on sites you allow, the solstone extension takes in page text, addresses and rough layout, and all of it goes into your journal.

browser.options.addasite = add a site

browser.options.addsitesoneat = add sites one at a time

browser.options.agreeaddsitesone = agree and add sites one at a time

browser.options.agreegoon = agree and go on

browser.options.agreeshareeverysite = agree and share every site

browser.options.choosefirst = choose your first site

browser.options.documenttitle = solstone settings

browser.options.keepmysites = keep my sites

browser.options.leaveout = leave out

browser.options.leaveoutasite = leave out a site

browser.options.lookingforapp = { $place ->
   *[computer] looking for the solstone app on this computer…
    [iphone] looking for the solstone app on this iphone…
    [ipad] looking for the solstone app on this ipad…
}

browser.options.pause = pause

browser.options.pauseheading = pause with the solstone app

browser.options.pausehelp = on: when the solstone app on this computer pauses, so does this extension. off: when you pause the solstone app, this extension keeps taking in your shared sites, and all of it goes into your journal.

browser.options.pauselabel = pause this extension when the solstone app pauses

browser.options.placeholder = mail.google.com

browser.options.readagain = read it again

browser.options.remove = remove

browser.options.shareeverysite = share every site

browser.options.siterowaria = { $action ->
   *[remove] remove { $host }
    [include] include { $host } again
}

browser.options.stopleavingout = stop leaving out

browser.options.takesin = what the solstone extension takes in

browser.options.version = v{ $version }

browser.options.whatyoushare = what you share

browser.options.whichsitesdowant = which sites do you want in your journal?

browser.options.yoursites = your sites

browser.page.markerstate = { $phase ->
   *[on] on
    [paused] paused
}

browser.popup.about = about

browser.popup.added = added

browser.popup.addedidle = added. open or reload a tab

browser.popup.attentionheading = sites that need attention

browser.popup.cantadd = this page can't be added

browser.popup.copybutton = { $phase ->
   *[copy] copy
    [copied] copied
}

browser.popup.copyfailed = couldn't copy. select the text and copy it.

browser.popup.included = included

browser.popup.leaveoutthis = leave this site out

browser.popup.leftout = left out

browser.popup.manage = manage ›

browser.popup.notadded = not added

browser.popup.nottakenin = not taken in right now

browser.popup.pauseall = { $phase ->
   *[running] pause all
    [paused] resume
}

browser.popup.reloadtab = reload this tab to begin

browser.popup.removehost = remove { $arg1 }

browser.popup.removethis = remove this site

browser.popup.settings = settings ›

browser.popup.sharing = sharing

browser.popup.sitecountallon = { $count ->
    [one] { $count } site, all on
   *[other] { $count } sites, all on
}

browser.popup.sitecountallpaused = { $count ->
    [one] { $count } site, all paused
   *[other] { $count } sites, all paused
}

browser.popup.sitecountmixed = { $count ->
    [one] { $count } site, { $on } on
   *[other] { $count } sites, { $on } on
}

browser.popup.sitecountonly = { $count ->
    [one] { $count } site
   *[other] { $count } sites
}

browser.popup.stopleavingsiteout = stop leaving this site out

browser.popup.thispage = this page

browser.popup.whattakes = what it takes in

browser.status.apppausedheadline = { $surface ->
   *[desktop] the solstone app is paused
    [mobile] Safari is paused in the solstone app
}

browser.status.apppausednote = { $place ->
   *[computer] the solstone app is paused on this computer
    [iphone] the solstone app is paused on this iphone
    [ipad] the solstone app is paused on this ipad
}

browser.status.apppausedreason = { $surface ->
   *[desktop] pausing doesn't hold back what's already taken in. resume from the solstone app.
    [mobile] pausing doesn't hold back what's already taken in. resume Safari in the solstone app.
}

browser.status.cantreach = can't reach the solstone app

browser.status.cantreachanswering = { $place ->
   *[computer] the solstone app on this computer isn't answering. open it to go on.
    [iphone] the solstone app on this iphone isn't answering right now. this extension tries again on its own.
    [ipad] the solstone app on this ipad isn't answering right now. this extension tries again on its own.
}

browser.status.cantreachgetapp = { $place ->
   *[computer] the solstone extension works with the solstone app on this computer. if the solstone app isn't on this computer yet, get it at { $site }.
    [iphone] the solstone extension works with the solstone app on this iphone. if the solstone app isn't on this iphone yet, get it at { $site }.
    [ipad] the solstone extension works with the solstone app on this ipad. if the solstone app isn't on this ipad yet, get it at { $site }.
}

browser.status.cantreachreopen = { $place ->
   *[computer] open the solstone app on this computer. if it's already open, look under sources in its settings.
    [iphone] the solstone app on this iphone isn't answering right now. this extension tries again on its own.
    [ipad] the solstone app on this ipad isn't answering right now. this extension tries again on its own.
}

browser.status.changingsites = changing your sites

browser.status.connecting = connecting to the solstone app

browser.status.finishsetup = finish setting up

browser.status.foundsolstoneapp = found the solstone app

browser.status.foundsolstoneapps = found the solstone app. it's paused right now.

browser.status.getapp = get the solstone app

browser.status.icontitle = { $headline }

browser.status.idlereason = { $mode ->
   *[selected] none of your sites are open right now.
    [all] none of the websites you share are open right now.
}

browser.status.intakeheld = { $place ->
   *[computer] the solstone app on this computer isn't taking in new pages right now.
    [iphone] the solstone app on this iphone isn't taking in new pages right now.
    [ipad] the solstone app on this ipad isn't taking in new pages right now.
}

browser.status.keptfornow = { $place ->
   *[computer] kept on this computer for now
    [iphone] kept on this iphone for now
    [ipad] kept on this ipad for now
}

browser.status.keptfornowreason = { $place ->
   *[computer] what you share from this browser is kept on this computer for now. the solstone app has the details.
    [iphone] what you share from this browser is kept on this iphone for now. the solstone app has the details.
    [ipad] what you share from this browser is kept on this ipad for now. the solstone app has the details.
}

browser.status.keptwaiting = { $place ->
   *[computer] kept on this computer, waiting to go into your journal
    [iphone] kept on this iphone, waiting to go into your journal
    [ipad] kept on this ipad, waiting to go into your journal
}

browser.status.lastpages = the last pages reached your journal

browser.status.lostbrowsers = part of what you shared from your browsers couldn't be kept, so it won't go into your journal. the solstone app has the details.

browser.status.lostthis = part of what you shared from this browser couldn't be kept, so it won't go into your journal.

browser.status.noroom = no room for more right now

browser.status.nosites = no sites yet

browser.status.nothingfrombrowser = nothing new is taken in from this browser

browser.status.nothingnew = nothing new is taken in

browser.status.nothingrightnow = nothing new is taken in right now

browser.status.nothingwaiting = nothing waiting to go into your journal

browser.status.notpaired = { $place ->
   *[computer] pair the solstone app on this computer with your journal, then come back.
    [iphone] pair the solstone app on this iphone with your journal and confirm your journal's mark, then come back.
    [ipad] pair the solstone app on this ipad with your journal and confirm your journal's mark, then come back.
}

browser.status.notpairedheadline = the solstone app isn't paired yet

browser.status.notreaching = not reaching your journal

browser.status.nowordyet = no word yet on whether it's reaching your journal

browser.status.openandadd = open a site you want to share and choose add this site.

browser.status.pagesoff = browser pages are off in the solstone app

browser.status.pausedhere = paused in this browser

browser.status.pausedoesnthold = pausing doesn't hold back what's already taken in.

browser.status.pressure = what you shared from this browser is waiting for the solstone app to accept it. new pages are taken in again once there's room.

browser.status.reaching = reaching your journal

browser.status.readthenchoose = read what the solstone extension takes in, then choose your first site.

browser.status.sitesneedattention = { $count ->
    [one] { $count } site needs attention
   *[other] { $count } sites need attention
}

browser.status.somecouldnt = some pages couldn't be kept

browser.status.storefull = { $place ->
   *[computer] the room on this computer for what you share from your browsers is full. new pages are taken in again once there's room. the solstone app has the details.
    [iphone] the room on this iphone for Safari pages is full. open the solstone app to make room.
    [ipad] the room on this ipad for Safari pages is full. open the solstone app to make room.
}

browser.status.turnpageson = turn browser pages back on under sources in the solstone app's settings.

browser.status.unavailable = status unavailable

browser.status.unavailablereason = the solstone extension can't show its status right now.

browser.status.untilanswers = nothing is taken in until it answers

browser.status.untilpaired = nothing is taken in until it is

browser.status.untilroom = nothing new is taken in until there's room

browser.status.untilsaved = nothing new is taken in until this is saved

browser.status.untilupdated = nothing new is taken in until it's updated

browser.status.untilyouadd = nothing is taken in until you add a site

browser.status.untilyoudo = nothing is taken in until you do

browser.status.updateapp = { $place ->
   *[computer] this extension needs a newer version of the solstone app on this computer. look under updates in the solstone app's settings.
    [iphone] update the solstone app on this iphone.
    [ipad] update the solstone app on this ipad.
}

browser.status.updateappheadline = update the solstone app

browser.status.updatechecking = { $place ->
   *[computer] the solstone app on this computer needs a newer version of this extension. { $browser } is checking for it now.
    [iphone] the solstone app on this iphone needs a newer version of this extension. { $browser } is checking for it now.
    [ipad] the solstone app on this ipad needs a newer version of this extension. { $browser } is checking for it now.
}

browser.status.updateextension = update the solstone extension

browser.status.updatefirefoxmanual = { $place ->
   *[computer] the solstone app on this computer needs a newer version of this extension. in Firefox, open Add-ons and themes, then choose Check for Updates from the gear menu.
    [iphone] the solstone app on this iphone needs a newer version of this extension. in Firefox, open Add-ons and themes, then choose Check for Updates from the gear menu.
    [ipad] the solstone app on this ipad needs a newer version of this extension. in Firefox, open Add-ons and themes, then choose Check for Updates from the gear menu.
}

browser.status.updatepending = { $place ->
   *[computer] the solstone app on this computer needs a newer version of this extension. { $browser } hasn't found it yet; it checks again on its own.
    [iphone] the solstone app on this iphone needs a newer version of this extension. { $browser } hasn't found it yet; it checks again on its own.
    [ipad] the solstone app on this ipad needs a newer version of this extension. { $browser } hasn't found it yet; it checks again on its own.
}

browser.status.updateready = the update is ready.

browser.status.updatesafarimanual = { $place ->
   *[computer] the solstone app on this computer needs a newer version of this extension. in Safari it comes with the solstone app, so update the solstone app.
    [iphone] the solstone app on this iphone needs a newer version of this extension. in Safari it comes with the solstone app, so update the solstone app.
    [ipad] the solstone app on this ipad needs a newer version of this extension. in Safari it comes with the solstone app, so update the solstone app.
}

browser.status.waitedweek = { $place ->
   *[computer] some pages from your browsers have waited more than a week to go into your journal. they're still kept on this computer. the solstone app has the details.
    [iphone] some pages from Safari have waited more than a week to go into your journal. they're still kept on this iphone. open the solstone app and they go into your journal.
    [ipad] some pages from Safari have waited more than a week to go into your journal. they're still kept on this ipad. open the solstone app and they go into your journal.
}

browser.status.waitedweekheadline = some pages have waited more than a week

browser.copy.browsername = { $brand ->
        [firefox] Firefox
        [edge] Edge
        [chrome] Chrome
        [safari] Safari
       *[other] your browser
    }

browser.copy.allowsthesolstoneextensionon = { $value1 } allows the solstone extension on every website, but only the sites you added are taken in. sharing every site includes messages on mail and chat sites, and words you've typed but haven't sent, and all of it goes into your journal.

browser.copy.allowsallofbutthe = { $value1 } allows all of { $value2 }, but the solstone extension takes in only the part of it you added. sharing all of it can include messages on mail and chat sites, and words you've typed but haven't sent, and all of it goes into your journal.

browser.copy.allowsmoreofsomesites = { $value1 } allows more of some sites you added, like { $value2 }, but the solstone extension takes in only the parts of them you added. sharing all of them can include messages on mail and chat sites, and words you've typed but haven't sent, and all of it goes into your journal.

browser.copy.allowsthesolstoneextensionon2 = { $value1 } allows the solstone extension on sites you didn't add, like { $value2 }, but only the sites you added are taken in. sharing them can include messages on mail and chat sites, and words you've typed but haven't sent, and all of it goes into your journal.

browser.copy.allowsmorethanyoursites = { $value1 } allows more than your sites. { $value2 }

browser.copy.stillallowseverywebsite = { $value1 } still allows every website.

browser.copy.allowseverywebsitesoevery = { $value1 } allows every website, so every site is on, except what you leave out.

browser.copy.sownsettingsdont = { $value1 }'s own settings don't show the sites you leave out. they're on solstone's own list.

browser.copy.isleftoutstopleaving = { $value1 } is left out. stop leaving it out first.

browser.copy.thesolstoneextensionleavesit = the solstone extension leaves it out. the solstone app doesn't check { $value1 } windows on your screen.

browser.copy.appleftoutunreadable = the solstone extension leaves it out. the solstone app can't read { $value1 }'s page addresses right now, so { $value1 } stays out of what the app takes in from your screen until it can read them.

browser.copy.leaveoutneedsaccess = to leave sites out, allow Accessibility in the solstone app's settings.

browser.copy.allsitesandpagesare = all { $value1 } sites and pages are no longer left out.

browser.copy.isnolongerleftout = { $value1 } is no longer left out.

browser.copy.isntallowingeverywebsite = { $value1 } isn't allowing every website

browser.copy.onlythesitesalreadyallows = only the sites { $value1 } already allows are on.

browser.copy.nowallowseverywebsiteevery = { $value1 } now allows every website. every site is on, except what you leave out.

browser.copy.stillisntallowingevery = { $value1 } still isn't allowing every website.

browser.copy.permissiondeclinedonlythesites = permission declined. only the sites { $value1 } already allows are on. to add a site, open it, open solstone from { $value2 }, and choose add this site.

browser.copy.everysiteleftout = every site · { $value1 } left out

browser.copy.alreadyallowseverywebsiteso = { $value1 } already allows every website, so agreeing shares every site. to choose sites one at a time instead, change that in { $value2 } first.

browser.copy.sharingevery = every site

browser.copy.sharingexcluded = every site · { $count } left out

browser.about.extensionversion = solstone extension { $value1 }

browser.about.lastseen = { $space }· last seen { $value1 }

browser.about.lines = { $own }
    { $journal }

browser.popup.stopleavinghostout = stop leaving { $value1 } out

browser.status.stopleavinghostout = stop leaving { $value1 } out

browser.labels.opensettings = open settings

browser.labels.updatenow = update now

browser.labels.onnow = on now

browser.manifest.safaridescription = on sites you allow, it takes in page text, addresses and rough layout, and all of it goes into your journal.

browser.copy.browsermenu = your browser's toolbar or extensions menu

browser.options.leaveoutplaceholder = bank.com

browser.options.mobileplaceholder = eff.org

browser.about.block = solstone ఎక్స్‌టెన్షన్ { $version } · { $os } { $os_version } · { $arch }
    { $journal }

browser.about.daysago = { $count ->
    [one] { $count } రోజు క్రితం
   *[other] { $count } రోజుల క్రితం
}

browser.about.extensionversion = solstone ఎక్స్‌టెన్షన్ { $value1 }

browser.about.hoursago = { $count ->
    [one] { $count } గంట క్రితం
   *[other] { $count } గంటల క్రితం
}

browser.about.journalunknown = జర్నల్ తెలియదు

browser.about.justnow = ఇప్పుడే

browser.about.lastseen = { $space }· చివరిసారి కనిపించింది { $value1 }

browser.about.lines = { $own }
    { $journal }

browser.about.minutesago = { $count ->
    [one] { $count } నిమిషం క్రితం
   *[other] { $count } నిమిషాల క్రితం
}

browser.brand.name = solstone

browser.chrome.addthissite = ఈ సైట్‌ను చేర్చండి

browser.chrome.dismiss = వదిలివేయండి

browser.chrome.inyourbrowser = మీ బ్రౌజర్‌లో

browser.chrome.itgoesto = ఇది వెళ్తుంది

browser.copy.accessdeniedhelp = { $surface ->
   *[safari-desktop] ఒకదాన్ని చేర్చడానికి, solstone కోసం Safari వెబ్‌సైట్ సెట్టింగ్‌లలో దాన్ని అనుమతించండి‌కు సెట్ చేయండి.
    [safari-mobile] ఒకదాన్ని చేర్చడానికి, సెట్టింగ్‌లలో యాప్‌లు, Safari, ఎక్స్‌టెన్షన్‌లు, solstone కింద దాన్ని అనుమతించండి‌కు సెట్ చేయండి.
}

browser.copy.accessgrantedjoin = { $granted }

browser.copy.accessgrantednote = { $surface ->
   *[safari-desktop] Safari వెబ్‌సైట్ సెట్టింగ్‌లలో నిరాకరించండి‌కు సెట్ చేసిన సైట్ ఆఫ్‌లోనే ఉంటుంది.
    [safari-mobile] సెట్టింగ్‌లలో యాప్‌లు, Safari, ఎక్స్‌టెన్షన్‌లు, solstone కింద నిరాకరించండి‌కు సెట్ చేసిన సైట్ ఆఫ్‌లోనే ఉంటుంది.
}

browser.copy.addblockedbelow = Safari { $under } అనుమతిస్తున్నంతసేపు { $arg1 } గురించి అడగదు. { $arg3 } చేర్చాలంటే, Safari వెబ్‌సైట్ సెట్టింగ్‌లలో దాన్ని అనుమతించండి‌కు సెట్ చేయండి.

browser.copy.adddenied = అనుమతి నిరాకరించబడింది. ఏదీ చేర్చబడలేదు.

browser.copy.added = { $scope ->
   *[exact] { $host } చేర్చబడింది.
    [whole] { $host } సైట్‌లు మరియు పేజీలన్నీ చేర్చబడ్డాయి.
}

browser.copy.addedjoined = { $scope ->
   *[exact] { $host } చేర్చబడింది.
    [whole] { $host } సైట్‌లు మరియు పేజీలన్నీ చేర్చబడ్డాయి.
}

browser.copy.addhelp = bank.com చేర్చితే, www.bank.com మరియు login.bank.com లాంటి bank.com సైట్‌లు మరియు పేజీలన్నీ పంచుకోబడతాయి. కొంత భాగం మాత్రమే పంచుకోవాలంటే, mail.google.com లాంటి ఆ చిరునామాను చేర్చండి.

browser.copy.addhelpjoined = { $browser ->
    [firefox] Firefox సొంత సెట్టింగ్‌లలో మీరు అనుమతించిన సైట్ ఇక్కడ కూడా ఆన్ అయి ఉంటుంది.
    [edge] Edge సొంత సెట్టింగ్‌లలో మీరు అనుమతించిన సైట్ ఇక్కడ కూడా ఆన్ అయి ఉంటుంది.
    [chrome] Chrome సొంత సెట్టింగ్‌లలో మీరు అనుమతించిన సైట్ ఇక్కడ కూడా ఆన్ అయి ఉంటుంది.
    [safari] Safari సొంత సెట్టింగ్‌లలో మీరు అనుమతించిన సైట్ ఇక్కడ కూడా ఆన్ అయి ఉంటుంది.
   *[other] మీ బ్రౌజర్ సొంత సెట్టింగ్‌లలో మీరు అనుమతించిన సైట్ ఇక్కడ కూడా ఆన్ అయి ఉంటుంది.
}

browser.copy.addhelpsuffix = { $browser ->
    [firefox] Firefox సొంత సెట్టింగ్‌లలో మీరు అనుమతించిన సైట్ ఇక్కడ కూడా చేర్చబడుతుంది.
    [edge] Edge సొంత సెట్టింగ్‌లలో మీరు అనుమతించిన సైట్ ఇక్కడ కూడా చేర్చబడుతుంది.
    [chrome] Chrome సొంత సెట్టింగ్‌లలో మీరు అనుమతించిన సైట్ ఇక్కడ కూడా చేర్చబడుతుంది.
    [safari] Safari సొంత సెట్టింగ్‌లలో మీరు అనుమతించిన సైట్ ఇక్కడ కూడా చేర్చబడుతుంది.
   *[other] మీ బ్రౌజర్ సొంత సెట్టింగ్‌లలో మీరు అనుమతించిన సైట్ ఇక్కడ కూడా చేర్చబడుతుంది.
}

browser.copy.addnotnow = ఇప్పుడు సైట్‌ను చేర్చడం సాధ్యం కాలేదు. ఎందుకో పై స్థితి చెబుతుంది.

browser.copy.allowin = { $browser ->
    [firefox] Firefox‌లో అనుమతించండి
    [edge] Edge‌లో అనుమతించండి
    [chrome] Chrome‌లో అనుమతించండి
    [safari] Safari‌లో అనుమతించండి
   *[other] మీ బ్రౌజర్‌లో అనుమతించండి
}

browser.copy.allowsallofbutthe = { $value1 } { $value2 } అంతా అనుమతిస్తుంది, కానీ solstone ఎక్స్‌టెన్షన్ మీరు చేర్చిన భాగాన్ని మాత్రమే స్వీకరిస్తుంది. అంతా పంచుకోవడంలో ఈమెయిల్ మరియు చాట్ సైట్‌లలోని సందేశాలు, మీరు టైప్ చేసి ఇంకా పంపని పదాలు ఉండవచ్చు, అంతా మీ జర్నల్‌లోకి వెళ్తుంది.

browser.copy.allowseverywebsitesoevery = { $value1 } ప్రతి వెబ్‌సైట్‌ను అనుమతిస్తుంది, కాబట్టి మీరు మినహాయించినవి తప్ప ప్రతి సైట్ ఆన్ అయి ఉంటుంది.

browser.copy.allowsmoreofsomesites = { $value1 } మీరు చేర్చిన కొన్ని సైట్‌లలో, { $value2 } లాగా, ఎక్కువ భాగాన్ని అనుమతిస్తుంది, కానీ solstone ఎక్స్‌టెన్షన్ మీరు చేర్చిన భాగాలను మాత్రమే స్వీకరిస్తుంది. వాటన్నిటినీ పంచుకోవడంలో ఈమెయిల్ మరియు చాట్ సైట్‌లలోని సందేశాలు, మీరు టైప్ చేసి ఇంకా పంపని పదాలు ఉండవచ్చు, అంతా మీ జర్నల్‌లోకి వెళ్తుంది.

browser.copy.allowsmorethanyoursites = { $value1 } మీ సైట్‌ల కంటే ఎక్కువ అనుమతిస్తుంది. { $value2 }

browser.copy.allowsthesolstoneextensionon = { $value1 } ప్రతి వెబ్‌సైట్‌లో solstone ఎక్స్‌టెన్షన్‌ను అనుమతిస్తుంది, కానీ మీరు చేర్చిన సైట్‌లు మాత్రమే స్వీకరించబడతాయి. ప్రతి సైట్‌ను పంచుకోవడంలో ఈమెయిల్ మరియు చాట్ సైట్‌లలోని సందేశాలు, మీరు టైప్ చేసి ఇంకా పంపని పదాలు ఉంటాయి, అంతా మీ జర్నల్‌లోకి వెళ్తుంది.

browser.copy.allowsthesolstoneextensionon2 = { $value1 } మీరు చేర్చని సైట్‌లలో, { $value2 } లాగా, solstone ఎక్స్‌టెన్షన్‌ను అనుమతిస్తుంది, కానీ మీరు చేర్చిన సైట్‌లు మాత్రమే స్వీకరించబడతాయి. వాటిని పంచుకోవడంలో ఈమెయిల్ మరియు చాట్ సైట్‌లలోని సందేశాలు, మీరు టైప్ చేసి ఇంకా పంపని పదాలు ఉండవచ్చు, అంతా మీ జర్నల్‌లోకి వెళ్తుంది.

browser.copy.allsitesandpagesare = { $value1 } సైట్‌లు మరియు పేజీలన్నీ ఇక మినహాయించబడి లేవు.

browser.copy.alreadyallowseverywebsiteso = { $value1 } ఇప్పటికే ప్రతి వెబ్‌సైట్‌ను అనుమతిస్తుంది, కాబట్టి అంగీకరిస్తే ప్రతి సైట్ పంచుకోబడుతుంది. బదులుగా ఒక్కొక్క సైట్‌ను ఎంచుకోవాలంటే, ముందు దాన్ని ఇక్కడ మార్చండి: { $value2 }.

browser.copy.appleftoutaway = solstone యాప్ కూడా దీన్ని మినహాయిస్తుంది.

browser.copy.appleftoutsiteson = మీ జర్నల్ నుండి మినహాయించబడింది, మీ స్క్రీన్‌లోని ఈ బ్రౌజర్ విండో మరియు స్క్రీన్ కార్యకలాపం కూడా.

browser.copy.appleftoutunreadable = solstone ఎక్స్‌టెన్షన్ దీన్ని మినహాయిస్తుంది. solstone యాప్ ఇప్పుడు { $value1 } పేజీ చిరునామాలను చదవలేదు, కాబట్టి solstone యాప్ వాటిని చదవగలిగే వరకు { $value1 } మీ స్క్రీన్ నుండి అది స్వీకరించేదానిలో ఉండదు.

browser.copy.apponlyleftout = solstone యాప్‌లో మినహాయించబడింది

browser.copy.browsermenu = మీ బ్రౌజర్ టూల్‌బార్ లేదా ఎక్స్‌టెన్షన్‌ల మెనూ

browser.copy.browsername = { $brand ->
    [firefox] Firefox
    [edge] Edge
    [chrome] Chrome
    [safari] Safari
   *[other] మీ బ్రౌజర్
}

browser.copy.checkagain = మళ్ళీ సరిచూడండి

browser.copy.checking = { $browser ->
    [firefox] Firefox‌ను సరిచూస్తోంది…
    [edge] Edge‌ను సరిచూస్తోంది…
    [chrome] Chrome‌ను సరిచూస్తోంది…
    [safari] Safari‌ను సరిచూస్తోంది…
   *[other] మీ బ్రౌజర్‌ను సరిచూస్తోంది…
}

browser.copy.couldntcheck = { $browser ->
    [firefox] Firefox ఏమి అనుమతిస్తుందో సరిచూడలేకపోయింది. మళ్ళీ ప్రయత్నించండి.
    [edge] Edge ఏమి అనుమతిస్తుందో సరిచూడలేకపోయింది. మళ్ళీ ప్రయత్నించండి.
    [chrome] Chrome ఏమి అనుమతిస్తుందో సరిచూడలేకపోయింది. మళ్ళీ ప్రయత్నించండి.
    [safari] Safari ఏమి అనుమతిస్తుందో సరిచూడలేకపోయింది. మళ్ళీ ప్రయత్నించండి.
   *[other] మీ బ్రౌజర్ ఏమి అనుమతిస్తుందో సరిచూడలేకపోయింది. మళ్ళీ ప్రయత్నించండి.
}

browser.copy.couldntstart = మీ సైట్‌లపై స్టార్ట్ చేయలేకపోయింది

browser.copy.deniednote = { $surface ->
   *[safari-desktop] దీన్ని చేర్చడానికి, Safari వెబ్‌సైట్ సెట్టింగ్‌లలో దాన్ని అనుమతించండి‌కు సెట్ చేయండి.
    [safari-mobile] దీన్ని చేర్చడానికి, సెట్టింగ్‌లలో యాప్‌లు, Safari, ఎక్స్‌టెన్షన్‌లు, solstone కింద దాన్ని అనుమతించండి‌కు సెట్ చేయండి.
}

browser.copy.deniedtitle = { $browser ->
    [firefox] Firefox ఈ సైట్‌లను ఈ ఎక్స్‌టెన్షన్ స్వీకరించనివ్వదు:
    [edge] Edge ఈ సైట్‌లను ఈ ఎక్స్‌టెన్షన్ స్వీకరించనివ్వదు:
    [chrome] Chrome ఈ సైట్‌లను ఈ ఎక్స్‌టెన్షన్ స్వీకరించనివ్వదు:
    [safari] Safari ఈ సైట్‌లను నిరాకరిస్తోంది, కాబట్టి అవి స్వీకరించబడవు:
   *[other] మీ బ్రౌజర్ ఈ సైట్‌లను ఈ ఎక్స్‌టెన్షన్ స్వీకరించనివ్వదు:
}

browser.copy.denyingsite = { $browser ->
    [firefox] Firefox ఈ సైట్‌ను నిరాకరిస్తోంది
    [edge] Edge ఈ సైట్‌ను నిరాకరిస్తోంది
    [chrome] Chrome ఈ సైట్‌ను నిరాకరిస్తోంది
    [safari] Safari ఈ సైట్‌ను నిరాకరిస్తోంది
   *[other] మీ బ్రౌజర్ ఈ సైట్‌ను నిరాకరిస్తోంది
}

browser.copy.desktopactivityon = solstone ఎక్స్‌టెన్షన్ ఈ సైట్‌ను స్వీకరించడం లేదు. ఈ బ్రౌజర్ కార్యకలాపం ఇంకా మీ జర్నల్‌లోకి వెళ్తుంది.

browser.copy.desktopscreenon = solstone ఎక్స్‌టెన్షన్ ఈ సైట్‌ను స్వీకరించడం లేదు. మీ స్క్రీన్ ఇంకా మీ జర్నల్‌లోకి వెళ్తుంది.

browser.copy.disclosure = { $place ->
   *[computer] ఇది ఎక్కడికి వెళ్తుంది: ఈ బ్రౌజర్ నుండి ఏదీ బయటకు వెళ్లదు, ఈ కంప్యూటర్‌లోని solstone యాప్‌కు తప్ప. అక్కడి నుండి అది solstone యాప్ ఇప్పటికే వాడే లింక్ ద్వారా మీ జర్నల్‌లోకి వెళ్తుంది.
    [iphone] ఇది ఎక్కడికి వెళ్తుంది: ఈ బ్రౌజర్ నుండి ఏదీ బయటకు వెళ్లదు, ఈ iphone‌లోని solstone యాప్‌కు తప్ప. అక్కడి నుండి అది solstone యాప్ ఇప్పటికే వాడే లింక్ ద్వారా మీ జర్నల్‌లోకి వెళ్తుంది. solstone యాప్ మూసి ఉన్నప్పుడు కూడా solstone ఎక్స్‌టెన్షన్ మీరు అనుమతించిన సైట్‌లను స్వీకరిస్తూనే ఉంటుంది. అది స్వీకరించింది ఈ iphone‌లో వేచి ఉంటుంది, మీరు solstone యాప్‌ను తర్వాత తెరిచినప్పుడు మీ జర్నల్‌లోకి వెళ్తుంది.
    [ipad] ఇది ఎక్కడికి వెళ్తుంది: ఈ బ్రౌజర్ నుండి ఏదీ బయటకు వెళ్లదు, ఈ ipad‌లోని solstone యాప్‌కు తప్ప. అక్కడి నుండి అది solstone యాప్ ఇప్పటికే వాడే లింక్ ద్వారా మీ జర్నల్‌లోకి వెళ్తుంది. solstone యాప్ మూసి ఉన్నప్పుడు కూడా solstone ఎక్స్‌టెన్షన్ మీరు అనుమతించిన సైట్‌లను స్వీకరిస్తూనే ఉంటుంది. అది స్వీకరించింది ఈ ipad‌లో వేచి ఉంటుంది, మీరు solstone యాప్‌ను తర్వాత తెరిచినప్పుడు మీ జర్నల్‌లోకి వెళ్తుంది.
}

browser.copy.disclosurepause = { $surface ->
   *[desktop] solstone ఎక్స్‌టెన్షన్‌లో ఎప్పుడైనా పాజ్ చేయండి. solstone యాప్‌ను పాజ్ చేస్తే ఈ ఎక్స్‌టెన్షన్ కూడా ఆగుతుంది, సెట్టింగ్‌లలో దాన్ని ఆఫ్ చేస్తే తప్ప. పాజ్ చేయడం ఇప్పటికే స్వీకరించినదాన్ని నిలిచి ఉంచదు. ఒక సైట్‌ను తీసివేస్తే, దాని నుండి కొత్తది ఏదీ రాదు. మీ జర్నల్‌లో ఇప్పటికే ఉన్నది అక్కడే ఉంటుంది.
    [mobile] solstone ఎక్స్‌టెన్షన్‌లో ఎప్పుడైనా పాజ్ చేయండి. పాజ్ చేయడం ఇప్పటికే స్వీకరించినదాన్ని నిలిచి ఉంచదు. ఒక సైట్‌ను తీసివేస్తే, దాని నుండి కొత్తది ఏదీ రాదు. మీ జర్నల్‌లో ఇప్పటికే ఉన్నది అక్కడే ఉంటుంది.
}

browser.copy.disclosureprivate = { $surface ->
   *[desktop] solstone ఎక్స్‌టెన్షన్ అంతరంగిక విండోల నుండి ఏదీ స్వీకరించదు, మీ బ్రౌజర్ అక్కడ దాన్ని నడవనిస్తున్నా. ఇది ఈ ఎక్స్‌టెన్షన్‌కు మాత్రమే వర్తిస్తుంది.
    [mobile] solstone ఎక్స్‌టెన్షన్ అంతరంగిక బ్రౌజింగ్ నుండి ఏదీ స్వీకరించదు, Safari అక్కడ దాన్ని నడవనిస్తున్నా. ఇది ఈ ఎక్స్‌టెన్షన్‌కు మాత్రమే వర్తిస్తుంది.
}

browser.copy.disclosurerest = మీ బ్రౌజర్‌లో మీరు అనుమతించిన సైట్‌లే solstone ఎక్స్‌టెన్షన్ స్వీకరించే సైట్‌లు, అది ప్రతి సైట్ అయి ఉండవచ్చు. ఆ సైట్‌లలో, ఒక ట్యాబ్ తెరిచి ఉన్నప్పుడల్లా, అది పేజీలోని వచనాన్ని మరియు సుమారు లేఅవుట్‌ను స్వీకరిస్తుంది, అంతా మీ జర్నల్‌లోకి వెళ్తుంది:
    - మీరు చూడగలిగే వచనం, స్క్రోల్ చేస్తే కనిపించే వచనం, నేపథ్య ట్యాబ్‌లలోని వచనం, స్క్రీన్ రీడర్‌లకు మరియు టూల్‌టిప్‌లకు పేజీలు ఇచ్చే కొన్ని లేబుల్‌లు, మరియు పేజీలో ఉన్నా మీకు చూపని వచనం
    - ప్రతి పేజీ చిరునామా, ? లేదా # తర్వాత ఉన్నది లేకుండా, దాని శీర్షిక, మీరు అందులో ఉన్న సమయం, మరియు దాని లింక్‌లు చూపే సైట్‌లు
    - ట్యాబ్ ముందు ఉందా, దాని విండోకు ఫోకస్ ఉందా, ఆడియో లేదా వీడియో ప్లే అవుతోందా, పేజీ భాష, ఏ బ్రౌజర్ అనేది, మరియు ట్యాబ్ ఎంతసేపు తెరిచి ఉందనేది
    - ఈమెయిల్ లేదా చాట్ సైట్‌లో, మీ సందేశాలు
    - మీరు టైప్ చేసి ఇంకా పంపని కొన్ని పదాలు, మరియు ఒక సైట్ చూపేది ఏదైనా, మీరు రహస్యంగా భావించేది కూడా, ఒక ఈమెయిల్‌లోని కోడ్‌లాగా{ $blank }పిక్సెల్‌లు ఎప్పుడూ కాదు. ముడి HTML ఎప్పుడూ కాదు. మీరు మినహాయించిన సైట్‌లు స్వీకరించబడవు, కానీ ఆ పేజీల లోపల చూపే ఇతర సైట్‌లు స్వీకరించబడతాయి.{ $blank }అనలిటిక్స్ లేదు. టెలిమెట్రీ లేదు. ఫోన్ హోమ్ లేదు. ఎవరినీ లెక్కించలేదు.

browser.copy.everysiteleftout = ప్రతి సైట్ · { $value1 } మినహాయించబడింది

browser.copy.extensionleftout = solstone ఎక్స్‌టెన్షన్ దీన్ని మినహాయిస్తుంది.

browser.copy.failadd = సైట్‌ను చేర్చలేకపోయింది. మళ్ళీ ప్రయత్నించండి.

browser.copy.failedbody = { $browser ->
    [firefox] Firefox‌లో ప్రతి సైట్‌ను ఆన్ చేయడంలో ఏదో తప్పు జరిగింది.
    [edge] Edge‌లో ప్రతి సైట్‌ను ఆన్ చేయడంలో ఏదో తప్పు జరిగింది.
    [chrome] Chrome‌లో ప్రతి సైట్‌ను ఆన్ చేయడంలో ఏదో తప్పు జరిగింది.
    [safari] Safari‌లో ప్రతి సైట్‌ను ఆన్ చేయడంలో ఏదో తప్పు జరిగింది.
   *[other] మీ బ్రౌజర్‌లో ప్రతి సైట్‌ను ఆన్ చేయడంలో ఏదో తప్పు జరిగింది.
}

browser.copy.failgeneric = ఏదో తప్పు జరిగింది. మళ్ళీ ప్రయత్నించండి.

browser.copy.failleftout = ఈ సైట్ మినహాయించబడింది. ముందు మినహాయించడం ఆపండి.

browser.copy.failpage = ఈ సైట్ నుండి ఒక పేజీని ఉంచుకోలేకపోయింది

browser.copy.failpageretry = ఈ సైట్ నుండి ఒక పేజీని ఉంచుకోలేకపోయింది. పేజీ మారినప్పుడు ఎక్స్‌టెన్షన్ మళ్ళీ ప్రయత్నిస్తుంది.

browser.copy.failrestartsite = ఈ సైట్‌పై స్టార్ట్ చేయలేకపోయింది. దాన్ని తీసివేసి మళ్ళీ చేర్చండి.

browser.copy.failsave = దాన్ని సేవ్ చేయలేకపోయింది. మళ్ళీ ప్రయత్నించండి.

browser.copy.failsetupfirst = ముందు సెటప్ పూర్తి చేయండి.

browser.copy.failsite = ఈ సైట్‌లో ఏదో తప్పు జరిగింది

browser.copy.failsitefull = ఇప్పుడు ఈ సైట్ నుండి మరింతదానికి చోటు లేదు

browser.copy.fielderror = ఒక వెబ్‌సైట్ చిరునామా ఇవ్వండి, mail.google.com లాగా.

browser.copy.hostalready = { $host } ఇప్పటికే మీ జాబితాలో ఉంది.

browser.copy.hostremoved = { $host } తీసివేయబడింది. దాని నుండి కొత్తది ఏదీ రాదు. మీ జర్నల్‌లో ఇప్పటికే ఉన్నది అక్కడే ఉంటుంది.

browser.copy.isleftoutstopleaving = { $value1 } మినహాయించబడింది. ముందు మినహాయించడం ఆపండి.

browser.copy.isnolongerleftout = { $value1 } ఇక మినహాయించబడి లేదు.

browser.copy.isntallowingeverywebsite = { $value1 } ప్రతి వెబ్‌సైట్‌ను అనుమతించడం లేదు

browser.copy.leaveouthelp = bank.com మినహాయిస్తే, మరో పేజీ లోపల ఉన్నా, www.bank.com మరియు login.bank.com లాంటి bank.com సైట్‌లు మరియు పేజీలన్నీ మినహాయించబడతాయి. దాని పేజీల లోపల చూపే ఇతర సైట్‌లు ఇంకా పంచుకోబడతాయి, వాటిని కూడా మినహాయించకపోతే.

browser.copy.leaveoutneedsaccess = సైట్‌లను మినహాయించడానికి, solstone యాప్ సెట్టింగ్‌లలో యాక్సెసిబిలిటీని అనుమతించండి.

browser.copy.leaveoutnote = { $scope ->
   *[exact] దీన్ని మినహాయించడం దీనికి వర్తిస్తుంది: { $host }. దాని పేజీల లోపల చూపే ఇతర సైట్‌లు ఇంకా పంచుకోబడతాయి.
    [whole] దీన్ని మినహాయించడం { $host } సైట్‌లు మరియు పేజీలన్నిటికీ వర్తిస్తుంది. వాటి లోపల చూపే ఇతర సైట్‌లు ఇంకా పంచుకోబడతాయి.
}

browser.copy.leftoutannouncement = { $scope ->
   *[exact] { $host } మినహాయించబడింది. దాని పేజీల లోపల చూపే ఇతర సైట్‌లు ఇంకా పంచుకోబడతాయి.
    [whole] { $host } సైట్‌లు మరియు పేజీలన్నీ మినహాయించబడ్డాయి. వాటి లోపల చూపే ఇతర సైట్‌లు ఇంకా పంచుకోబడతాయి.
}

browser.copy.leftoutsummary = { $count ->
    [one] { $count } సైట్ మినహాయించబడింది
   *[other] { $count } సైట్‌లు మినహాయించబడ్డాయి
}

browser.copy.linuxcantreach = { $place ->
   *[computer] ఈ కంప్యూటర్‌లో solstone యాప్‌ను స్టార్ట్ చేయండి. అది ఇప్పటికే నడుస్తుంటే, ఏమి తప్పో { $doctor } చెబుతుంది.
    [iphone] ఈ iphone‌లో solstone యాప్‌ను స్టార్ట్ చేయండి. అది ఇప్పటికే నడుస్తుంటే, ఏమి తప్పో { $doctor } చెబుతుంది.
    [ipad] ఈ ipad‌లో solstone యాప్‌ను స్టార్ట్ చేయండి. అది ఇప్పటికే నడుస్తుంటే, ఏమి తప్పో { $doctor } చెబుతుంది.
}

browser.copy.linuxintakeoff = వాటిని మళ్ళీ ఆన్ చేయండి: { $cmd }

browser.copy.linuxstep1intake = వాటిని ఆన్ చేయండి: { $cmd }

browser.copy.linuxupdate = { $place ->
   *[computer] ఈ ఎక్స్‌టెన్షన్‌కు ఈ కంప్యూటర్‌లో solstone యాప్ కొత్త వెర్షన్ కావాలి. దాన్ని పొందడానికి { $cmd } నడపండి.
    [iphone] ఈ ఎక్స్‌టెన్షన్‌కు ఈ iphone‌లో solstone యాప్ కొత్త వెర్షన్ కావాలి. దాన్ని పొందడానికి { $cmd } నడపండి.
    [ipad] ఈ ఎక్స్‌టెన్షన్‌కు ఈ ipad‌లో solstone యాప్ కొత్త వెర్షన్ కావాలి. దాన్ని పొందడానికి { $cmd } నడపండి.
}

browser.copy.nowallowseverywebsiteevery = { $value1 } ఇప్పుడు ప్రతి వెబ్‌సైట్‌ను అనుమతిస్తుంది. మీరు మినహాయించినవి తప్ప ప్రతి సైట్ ఆన్ అయి ఉంటుంది.

browser.copy.onlythesitesalreadyallows = { $value1 } ఇప్పటికే అనుమతించే సైట్‌లు మాత్రమే ఆన్ అయి ఉన్నాయి.

browser.copy.permissiondeclinedonlythesites = అనుమతి నిరాకరించబడింది. { $value1 } ఇప్పటికే అనుమతించే సైట్‌లు మాత్రమే ఆన్ అయి ఉన్నాయి. ఒక సైట్‌ను చేర్చాలంటే, దాన్ని తెరిచి, { $value2 } నుండి solstone తెరిచి, ఈ సైట్‌ను చేర్చండి ఎంచుకోండి.

browser.copy.permissionschanged = { $browser ->
    [firefox] సేవ్ చేస్తుండగా Firefox అనుమతులు మారాయి. మళ్ళీ ప్రయత్నించండి.
    [edge] సేవ్ చేస్తుండగా Edge అనుమతులు మారాయి. మళ్ళీ ప్రయత్నించండి.
    [chrome] సేవ్ చేస్తుండగా Chrome అనుమతులు మారాయి. మళ్ళీ ప్రయత్నించండి.
    [safari] సేవ్ చేస్తుండగా Safari అనుమతులు మారాయి. మళ్ళీ ప్రయత్నించండి.
   *[other] సేవ్ చేస్తుండగా మీ బ్రౌజర్ అనుమతులు మారాయి. మళ్ళీ ప్రయత్నించండి.
}

browser.copy.privatenote = { $surface ->
   *[desktop] ఈ ఎక్స్‌టెన్షన్ అంతరంగిక బ్రౌజింగ్ నుండి ఏదీ స్వీకరించదు.
    [mobile] ఈ ఎక్స్‌టెన్షన్ అంతరంగిక బ్రౌజింగ్ నుండి ఏదీ స్వీకరించదు.
}

browser.copy.privatestate = { $surface ->
   *[desktop] అంతరంగిక విండో
    [mobile] అంతరంగిక బ్రౌజింగ్
}

browser.copy.restricted = { $browser ->
    [firefox] ఈ పేజీలో Firefox ఎక్స్‌టెన్షన్‌లను పని చేయనివ్వదు
    [edge] ఈ పేజీలో Edge ఎక్స్‌టెన్షన్‌లను పని చేయనివ్వదు
    [chrome] ఈ పేజీలో Chrome ఎక్స్‌టెన్షన్‌లను పని చేయనివ్వదు
    [safari] ఈ పేజీలో Safari ఎక్స్‌టెన్షన్‌లను పని చేయనివ్వదు
   *[other] ఈ పేజీలో మీ బ్రౌజర్ ఎక్స్‌టెన్షన్‌లను పని చేయనివ్వదు
}

browser.copy.returnnote = మీరు దీనికి తిరిగి వచ్చినప్పుడు ఈ పేజీ మళ్ళీ సరిచూస్తుంది.

browser.copy.sharegoesin = { $arg1 } మీరు అక్కడ ఇప్పుడు పంచుకున్నది మీ జర్నల్‌లోకి వెళ్తుంది.

browser.copy.sharegoesinnow = { $arg1 } మీరు అక్కడ ఇప్పుడు పంచుకున్నది మీ జర్నల్‌లోకి వెళ్తుంది.

browser.copy.sharingallcount = { $count ->
    [one] { $count } సైట్ మినహాయించబడింది
   *[other] { $count } సైట్‌లు మినహాయించబడ్డాయి
}

browser.copy.sharingevery = ప్రతి సైట్

browser.copy.sharingexcluded = ప్రతి సైట్ · { $count } మినహాయించబడింది

browser.copy.sheettitle = { $scope ->
   *[exact] { $host } చేర్చాలా?
    [whole] { $host } సైట్‌లు మరియు పేజీలన్నీ చేర్చాలా?
}

browser.copy.sownsettingsdont = { $value1 } సొంత సెట్టింగ్‌లు మీరు మినహాయించే సైట్‌లను చూపవు. అవి solstone సొంత జాబితాలో ఉన్నాయి.

browser.copy.step1cantreach = { $place ->
   *[computer] solstone ఎక్స్‌టెన్షన్ ఈ కంప్యూటర్‌లోని solstone యాప్‌తో పని చేస్తుంది, అది లేకుండా ఏదీ స్వీకరించబడదు. solstone యాప్ ఈ కంప్యూటర్‌లో ఇంకా లేకపోతే, దీని వద్ద పొందండి: { $site }. solstone యాప్ స్పందించగానే ఈ పేజీ దానంతట అదే ముందుకు వెళ్తుంది.
    [iphone] solstone ఎక్స్‌టెన్షన్ ఈ iphone‌లోని solstone యాప్‌తో పని చేస్తుంది, అది లేకుండా ఏదీ స్వీకరించబడదు. solstone యాప్ ఈ iphone‌లో ఇంకా లేకపోతే, దీని వద్ద పొందండి: { $site }. solstone యాప్ స్పందించగానే ఈ పేజీ దానంతట అదే ముందుకు వెళ్తుంది.
    [ipad] solstone ఎక్స్‌టెన్షన్ ఈ ipad‌లోని solstone యాప్‌తో పని చేస్తుంది, అది లేకుండా ఏదీ స్వీకరించబడదు. solstone యాప్ ఈ ipad‌లో ఇంకా లేకపోతే, దీని వద్ద పొందండి: { $site }. solstone యాప్ స్పందించగానే ఈ పేజీ దానంతట అదే ముందుకు వెళ్తుంది.
}

browser.copy.step1intakeoff = solstone యాప్ సెట్టింగ్‌లలో మూలాల కింద వాటిని ఆన్ చేయండి. ఈ పేజీ దానంతట అదే ముందుకు వెళ్తుంది.

browser.copy.step1notpaired = { $place ->
   *[computer] ఈ కంప్యూటర్‌లోని solstone యాప్‌ను మీ జర్నల్‌తో పెయిరింగ్ చేయండి. అది పెయిర్ అయిన తర్వాత ఈ పేజీ దానంతట అదే ముందుకు వెళ్తుంది.
    [iphone] ఈ iphone‌లోని solstone యాప్‌ను మీ జర్నల్‌తో పెయిరింగ్ చేయండి, మీ జర్నల్ మార్క్‌ను ధృవీకరించండి. మీరు చేసాక ఈ పేజీ దానంతట అదే ముందుకు వెళ్తుంది.
    [ipad] ఈ ipad‌లోని solstone యాప్‌ను మీ జర్నల్‌తో పెయిరింగ్ చేయండి, మీ జర్నల్ మార్క్‌ను ధృవీకరించండి. మీరు చేసాక ఈ పేజీ దానంతట అదే ముందుకు వెళ్తుంది.
}

browser.copy.step1openapp = { $place ->
   *[computer] solstone ఎక్స్‌టెన్షన్ ఈ కంప్యూటర్‌లోని solstone యాప్‌తో పని చేస్తుంది, అది లేకుండా ఏదీ స్వీకరించబడదు. ముందుకు వెళ్లడానికి solstone యాప్‌ను తెరవండి. అది స్పందించగానే ఈ పేజీ దానంతట అదే ముందుకు వెళ్తుంది.
    [iphone] solstone ఎక్స్‌టెన్షన్ ఈ iphone‌లోని solstone యాప్‌తో పని చేస్తుంది, అది లేకుండా ఏదీ స్వీకరించబడదు. solstone యాప్ ఇప్పుడు స్పందించడం లేదు. ఈ ఎక్స్‌టెన్షన్ దానంతట అదే మళ్ళీ ప్రయత్నిస్తుంది, అది స్పందించగానే ఈ పేజీ దానంతట అదే ముందుకు వెళ్తుంది.
    [ipad] solstone ఎక్స్‌టెన్షన్ ఈ ipad‌లోని solstone యాప్‌తో పని చేస్తుంది, అది లేకుండా ఏదీ స్వీకరించబడదు. solstone యాప్ ఇప్పుడు స్పందించడం లేదు. ఈ ఎక్స్‌టెన్షన్ దానంతట అదే మళ్ళీ ప్రయత్నిస్తుంది, అది స్పందించగానే ఈ పేజీ దానంతట అదే ముందుకు వెళ్తుంది.
}

browser.copy.step2pending = పై అడుగు పూర్తయిన తర్వాత మీరు దీన్ని అంగీకరిస్తారు.

browser.copy.step3body = { $browser ->
    [firefox] Firefox దీన్ని అనుమతించమని మిమ్మల్ని అడుగుతుంది.
    [edge] Edge దీన్ని అనుమతించమని మిమ్మల్ని అడుగుతుంది.
    [chrome] Chrome దీన్ని అనుమతించమని మిమ్మల్ని అడుగుతుంది.
    [safari] Safari దీన్ని అనుమతించమని మిమ్మల్ని అడుగుతుంది.
   *[other] మీ బ్రౌజర్ దీన్ని అనుమతించమని మిమ్మల్ని అడుగుతుంది.
}

browser.copy.stepextensionsleft = ఎడమవైపు ఎక్స్‌టెన్షన్‌లు కింద, solstone ఎంచుకోండి.

browser.copy.stepforother = ఇతర వెబ్‌సైట్‌ల కోసం అనే దాన్ని అనుమతించండి‌కు సెట్ చేయండి.

browser.copy.stepotherwebsites = ఇతర వెబ్‌సైట్‌ల కోసం అనే దాన్ని అనుమతించండి‌కు సెట్ చేయండి.

browser.copy.stepsafariwebsites = Safariలో, Safari › సెట్టింగ్‌లు ఎంచుకోండి, తర్వాత వెబ్‌సైట్‌లు.

browser.copy.stepsettingsapps = సెట్టింగ్‌లలో, యాప్‌లు తెరవండి, తర్వాత Safari, తర్వాత ఎక్స్‌టెన్షన్‌లు, తర్వాత solstone.

browser.copy.stillallowseverywebsite = { $value1 } ఇంకా ప్రతి వెబ్‌సైట్‌ను అనుమతిస్తోంది.

browser.copy.stillisntallowingevery = { $value1 } ఇంకా ప్రతి వెబ్‌సైట్‌ను అనుమతించడం లేదు.

browser.copy.thesolstoneextensionleavesit = solstone ఎక్స్‌టెన్షన్ దీన్ని మినహాయిస్తుంది. solstone యాప్ మీ స్క్రీన్‌పై { $value1 } విండోలను సరిచూడదు.

browser.copy.truncation = ఈ సైట్‌లో మీరు పంచుకున్నదాంట్లో కొంత భాగం ఉంచుకోవడానికి చాలా పొడవుగా ఉంది

browser.copy.tryagain = మళ్ళీ ప్రయత్నించండి

browser.copy.unknownnote = { $surface ->
   *[safari-desktop] Safari వెబ్‌సైట్ సెట్టింగ్‌లలో అది నిరాకరించండి‌కు సెట్ అయి ఉంటే, అది స్వీకరించబడదు.
    [safari-mobile] సెట్టింగ్‌లలో యాప్‌లు, Safari, ఎక్స్‌టెన్షన్‌లు, solstone కింద అది నిరాకరించండి‌కు సెట్ అయి ఉంటే, అది స్వీకరించబడదు.
}

browser.copy.unknownstate = ఈ ఎక్స్‌టెన్షన్ ఈ పేజీ వద్దకు చేరలేదు

browser.copy.warm1 = solstone‌కు స్వాగతం.

browser.copy.warm2 = solstone యాప్ మీరు పంచుకున్నదాన్ని స్వీకరిస్తుంది, మరియు అంతా మీ జర్నల్‌లోకి వెళుతుంది.

browser.copy.warm3 = మీ జర్నల్ ఎప్పుడూ ప్రైవేట్, మీదే.

browser.extension.addingsitecoversevery = ఒక సైట్‌ను చేర్చడం దాని కింద ఉన్న ప్రతి సైట్‌కు మరియు పేజీకి వర్తిస్తుంది.

browser.extension.clearedextensionsstorage = మీరు ఈ ఎక్స్‌టెన్షన్ నిల్వను తుడిచివేశారు, కాబట్టి అది పాజ్ అయి ఉంది, మీరు మినహాయించిన సైట్‌లు ఇక మినహాయించబడి లేవు. మీరు కొనసాగించినప్పుడు, Safari అనుమతించే ప్రతి సైట్ మీ జర్నల్‌లోకి వెళ్తుంది.

browser.extension.clearedextensionsstorage2 = మీరు ఈ ఎక్స్‌టెన్షన్ నిల్వను తుడిచివేశారు, కాబట్టి అది పాజ్ అయి ఉంది. మీరు కొనసాగించినప్పుడు, solstone యాప్‌లో మీరు మినహాయించినది తప్ప, Safari అనుమతించే ప్రతి సైట్ మీ జర్నల్‌లోకి వెళ్తుంది.

browser.extension.enterwebsiteaddresslike = వెబ్‌సైట్ చిరునామా ఎంటర్ చేయండి, bank.com లాగా.

browser.extension.everysiteoffexcept = మీరు ఒక్కొక్కటిగా చేర్చిన సైట్‌లు తప్ప, ప్రతి సైట్ ఆఫ్‌లో ఉంది.

browser.extension.everysiteoffincluding = మీరు ఒక్కొక్కటిగా చేర్చిన సైట్‌లతో సహా, ప్రతి సైట్ ఆఫ్‌లో ఉంది. మళ్ళీ పంచుకోవడానికి ఒక సైట్‌ను చేర్చండి.

browser.extension.everywebsiteincludingones = మీ బ్రౌజర్ అనుమతించాక, మీరు తర్వాత వెళ్లేవాటితో సహా, ప్రతి వెబ్‌సైట్. సైట్‌లను మినహాయించవచ్చు.

browser.extension.extensionsbuttonsafaris = Safari చిరునామా బార్‌లోని ఎక్స్‌టెన్షన్‌ల బటన్

browser.extension.extensiontakesnothingfrom = ఈ ఎక్స్‌టెన్షన్ అంతరంగిక విండోల నుండి ఏదీ స్వీకరించదు.

browser.extension.extensiontakesonlysites = ఈ ఎక్స్‌టెన్షన్ మీరు చేర్చిన సైట్‌లను మాత్రమే స్వీకరిస్తుంది, అంతా మీ జర్నల్‌లోకి వెళ్తుంది.

browser.extension.onlysitesallowopen = మీరు అనుమతించే సైట్‌లు మాత్రమే. ఒక సైట్‌ను తెరవండి, మీ బ్రౌజర్ టూల్‌బార్ లేదా ఎక్స్‌టెన్షన్‌ల మెనూ నుండి solstone తెరవండి, ఈ సైట్‌ను చేర్చండి ఎంచుకోండి.

browser.extension.onlysitessafarialready = Safari ఇప్పటికే అనుమతించే సైట్‌లు మాత్రమే ఆన్ అయి ఉన్నాయి. ప్రతి సైట్‌ను పంచుకోవడానికి:

browser.extension.safarispagemenu = Safari పేజీ మెనూ

browser.extension.safaristillisnt = Safari ఇంకా ప్రతి వెబ్‌సైట్‌ను అనుమతించడం లేదు. అన్ని వెబ్‌సైట్‌లు (లేదా ఇతర వెబ్‌సైట్‌లు) అనే దాన్ని అనుమతించండి‌కు సెట్ చేయండి.

browser.extension.safaristillisnt2 = Safari ఇంకా ప్రతి వెబ్‌సైట్‌ను అనుమతించడం లేదు. ఇతర వెబ్‌సైట్‌ల కోసం అనే దాన్ని అనుమతించండి‌కు సెట్ చేయండి.

browser.extension.setallwebsitesother = అన్ని వెబ్‌సైట్‌లు (లేదా ఇతర వెబ్‌సైట్‌లు) అనే దాన్ని అనుమతించండి‌కు సెట్ చేయండి.

browser.extension.shareall = అంతా పంచుకోండి

browser.extension.sharethemtoo = వాటిని కూడా పంచుకోండి

browser.extension.sharingeverysiteincludes = ప్రతి సైట్‌ను పంచుకోవడంలో ఈమెయిల్ మరియు చాట్ సైట్‌లలోని సందేశాలు, మీరు టైప్ చేసి ఇంకా పంపని పదాలు ఉంటాయి, అంతా మీ జర్నల్‌లోకి వెళ్తుంది.

browser.extension.sitesetdenythere = అక్కడ నిరాకరించండి‌కు సెట్ చేసిన సైట్ ఆఫ్‌లోనే ఉంటుంది.

browser.extension.solstoneextensionleavesout = solstone ఎక్స్‌టెన్షన్ దీన్ని మినహాయిస్తుంది. యాక్సెసిబిలిటీ వచ్చే వరకు solstone యాప్ వెబ్‌సైట్‌లను మినహాయించలేదు.

browser.extension.stopsharingeverysite = ప్రతి సైట్‌ను పంచుకోవడం ఆపండి

browser.extension.stopsharingeverysite2 = ప్రతి సైట్‌ను పంచుకోవడం ఆపడానికి, సెట్టింగ్‌లలో యాప్‌లు, Safari, ఎక్స్‌టెన్షన్‌లు, solstone కింద అన్ని వెబ్‌సైట్‌లు (లేదా ఇతర వెబ్‌సైట్‌లు) అనే దాన్ని అడగండి‌కు సెట్ చేయండి.

browser.extension.stopsharingeverysite3 = ప్రతి సైట్‌ను పంచుకోవడం ఆపడానికి, Safari వెబ్‌సైట్ సెట్టింగ్‌లలో ఇతర వెబ్‌సైట్‌ల కోసం అనే దాన్ని అడగండి‌కు సెట్ చేయండి.

browser.failure.raw = ఏదో తప్పు జరిగింది: { $raw }

browser.labels.onnow = ఇప్పుడు ఆన్

browser.labels.opensettings = సెట్టింగ్‌లు తెరవండి

browser.labels.updatenow = ఇప్పుడే అప్‌డేట్ చేయండి

browser.manifest.description = మీరు అనుమతించిన సైట్‌లలో, solstone ఎక్స్‌టెన్షన్ పేజీ వచనం, చిరునామాలు మరియు సుమారు లేఅవుట్‌ను స్వీకరిస్తుంది, అంతా మీ జర్నల్‌లోకి వెళ్తుంది.

browser.manifest.safaridescription = మీరు అనుమతించిన సైట్‌లలో, అది పేజీ వచనం, చిరునామాలు మరియు సుమారు లేఅవుట్‌ను స్వీకరిస్తుంది, అంతా మీ జర్నల్‌లోకి వెళ్తుంది.

browser.options.addasite = ఒక సైట్‌ను చేర్చండి

browser.options.addsitesoneat = సైట్‌లను ఒక్కొక్కటిగా చేర్చండి

browser.options.agreeaddsitesone = అంగీకరించి సైట్‌లను ఒక్కొక్కటిగా చేర్చండి

browser.options.agreegoon = అంగీకరించి ముందుకు వెళ్లండి

browser.options.agreeshareeverysite = అంగీకరించి ప్రతి సైట్‌ను పంచుకోండి

browser.options.choosefirst = మీ మొదటి సైట్‌ను ఎంచుకోండి

browser.options.documenttitle = solstone సెట్టింగ్‌లు

browser.options.keepmysites = నా సైట్‌లను ఉంచుకోండి

browser.options.leaveout = మినహాయించండి

browser.options.leaveoutasite = ఒక సైట్‌ను మినహాయించండి

browser.options.leaveoutplaceholder = bank.com

browser.options.lookingforapp = { $place ->
   *[computer] ఈ కంప్యూటర్‌లో solstone యాప్ కోసం వెతుకుతోంది…
    [iphone] ఈ iphone‌లో solstone యాప్ కోసం వెతుకుతోంది…
    [ipad] ఈ ipad‌లో solstone యాప్ కోసం వెతుకుతోంది…
}

browser.options.mobileplaceholder = eff.org

browser.options.pause = పాజ్ చేయండి

browser.options.pauseheading = solstone యాప్‌తో పాజ్ చేయండి

browser.options.pausehelp = ఆన్: ఈ కంప్యూటర్‌లోని solstone యాప్ పాజ్ అయినప్పుడు, ఈ ఎక్స్‌టెన్షన్ కూడా పాజ్ అవుతుంది. ఆఫ్: మీరు solstone యాప్‌ను పాజ్ చేసినప్పుడు, ఈ ఎక్స్‌టెన్షన్ మీరు పంచుకునే సైట్‌లను స్వీకరిస్తూనే ఉంటుంది, అంతా మీ జర్నల్‌లోకి వెళ్తుంది.

browser.options.pauselabel = solstone యాప్ పాజ్ అయినప్పుడు ఈ ఎక్స్‌టెన్షన్‌ను పాజ్ చేయండి

browser.options.placeholder = mail.google.com

browser.options.readagain = దీన్ని మళ్ళీ చదవండి

browser.options.remove = తీసివేయండి

browser.options.shareeverysite = ప్రతి సైట్‌ను పంచుకోండి

browser.options.siterowaria = { $action ->
   *[remove] { $host } తీసివేయండి
    [include] { $host } మళ్ళీ చేర్చండి
}

browser.options.stopleavingout = మినహాయించడం ఆపండి

browser.options.takesin = solstone ఎక్స్‌టెన్షన్ స్వీకరించేది

browser.options.version = v{ $version }

browser.options.whatyoushare = మీరు పంచుకునేది

browser.options.whichsitesdowant = మీ జర్నల్‌లో ఏ సైట్‌లు కావాలి?

browser.options.yoursites = మీ సైట్‌లు

browser.page.markerstate = { $phase ->
   *[on] ఆన్
    [paused] పాజ్ అయి ఉంది
}

browser.popup.about = గురించి

browser.popup.added = చేర్చబడింది

browser.popup.addedidle = చేర్చబడింది. ఒక ట్యాబ్‌ను తెరవండి లేదా మళ్ళీ లోడ్ చేయండి.

browser.popup.attentionheading = శ్రద్ధ కావాల్సిన సైట్‌లు

browser.popup.cantadd = ఈ పేజీని చేర్చడం సాధ్యం కాదు.

browser.popup.copybutton = { $phase ->
   *[copy] కాపీ చేయండి
    [copied] కాపీ అయింది
}

browser.popup.copyfailed = కాపీ చేయలేకపోయింది. వచనాన్ని ఎంచుకుని కాపీ చేయండి.

browser.popup.included = చేర్చబడింది

browser.popup.leaveoutthis = ఈ సైట్‌ను మినహాయించండి

browser.popup.leftout = మినహాయించబడింది

browser.popup.manage = నిర్వహించండి ›

browser.popup.notadded = చేర్చబడలేదు

browser.popup.nottakenin = ఇప్పుడు స్వీకరించబడడం లేదు

browser.popup.pauseall = { $phase ->
   *[running] అన్నీ పాజ్ చేయండి
    [paused] కొనసాగించండి
}

browser.popup.reloadtab = మొదలుపెట్టడానికి ఈ ట్యాబ్‌ను మళ్ళీ లోడ్ చేయండి

browser.popup.removehost = { $arg1 } తీసివేయండి

browser.popup.removethis = ఈ సైట్‌ను తీసివేయండి

browser.popup.settings = సెట్టింగ్‌లు ›

browser.popup.sharing = పంచుకోవడం

browser.popup.sitecountallon = { $count ->
    [one] { $count } సైట్, అన్నీ ఆన్
   *[other] { $count } సైట్‌లు, అన్నీ ఆన్
}

browser.popup.sitecountallpaused = { $count ->
    [one] { $count } సైట్, అన్నీ పాజ్
   *[other] { $count } సైట్‌లు, అన్నీ పాజ్
}

browser.popup.sitecountmixed = { $count ->
    [one] { $count } సైట్, { $on } ఆన్
   *[other] { $count } సైట్‌లు, { $on } ఆన్
}

browser.popup.sitecountonly = { $count ->
    [one] { $count } సైట్
   *[other] { $count } సైట్‌లు
}

browser.popup.stopleavinghostout = { $value1 } మినహాయించడం ఆపండి

browser.popup.stopleavingsiteout = ఈ సైట్‌ను మినహాయించడం ఆపండి

browser.popup.thispage = ఈ పేజీ

browser.popup.whattakes = ఇది స్వీకరించేది

browser.status.apppausedheadline = { $surface ->
   *[desktop] solstone యాప్ పాజ్ అయి ఉంది
    [mobile] solstone యాప్‌లో Safari పాజ్ అయి ఉంది
}

browser.status.apppausednote = { $place ->
   *[computer] ఈ కంప్యూటర్‌లో solstone యాప్ పాజ్ అయి ఉంది
    [iphone] ఈ iphone‌లో solstone యాప్ పాజ్ అయి ఉంది
    [ipad] ఈ ipad‌లో solstone యాప్ పాజ్ అయి ఉంది
}

browser.status.apppausedreason = { $surface ->
   *[desktop] పాజ్ చేయడం ఇప్పటికే స్వీకరించినదాన్ని నిలిచి ఉంచదు. solstone యాప్ నుండి కొనసాగించండి.
    [mobile] పాజ్ చేయడం ఇప్పటికే స్వీకరించినదాన్ని నిలిచి ఉంచదు. solstone యాప్‌లో Safari‌ను కొనసాగించండి.
}

browser.status.cantreach = solstone యాప్‌తో కనెక్ట్ కాలేదు

browser.status.cantreachanswering = { $place ->
   *[computer] ఈ కంప్యూటర్‌లోని solstone యాప్ స్పందించడం లేదు. ముందుకు వెళ్లడానికి దాన్ని తెరవండి.
    [iphone] ఈ iphone‌లోని solstone యాప్ ఇప్పుడు స్పందించడం లేదు. ఈ ఎక్స్‌టెన్షన్ దానంతట అదే మళ్ళీ ప్రయత్నిస్తుంది.
    [ipad] ఈ ipad‌లోని solstone యాప్ ఇప్పుడు స్పందించడం లేదు. ఈ ఎక్స్‌టెన్షన్ దానంతట అదే మళ్ళీ ప్రయత్నిస్తుంది.
}

browser.status.cantreachgetapp = { $place ->
   *[computer] solstone ఎక్స్‌టెన్షన్ ఈ కంప్యూటర్‌లోని solstone యాప్‌తో పని చేస్తుంది. solstone యాప్ ఈ కంప్యూటర్‌లో ఇంకా లేకపోతే, దీని వద్ద పొందండి: { $site }.
    [iphone] solstone ఎక్స్‌టెన్షన్ ఈ iphone‌లోని solstone యాప్‌తో పని చేస్తుంది. solstone యాప్ ఈ iphone‌లో ఇంకా లేకపోతే, దీని వద్ద పొందండి: { $site }.
    [ipad] solstone ఎక్స్‌టెన్షన్ ఈ ipad‌లోని solstone యాప్‌తో పని చేస్తుంది. solstone యాప్ ఈ ipad‌లో ఇంకా లేకపోతే, దీని వద్ద పొందండి: { $site }.
}

browser.status.cantreachreopen = { $place ->
   *[computer] ఈ కంప్యూటర్‌లోని solstone యాప్‌ను తెరవండి. అది ఇప్పటికే తెరిచి ఉంటే, దాని సెట్టింగ్‌లలో మూలాల కింద చూడండి.
    [iphone] ఈ iphone‌లోని solstone యాప్ ఇప్పుడు స్పందించడం లేదు. ఈ ఎక్స్‌టెన్షన్ దానంతట అదే మళ్ళీ ప్రయత్నిస్తుంది.
    [ipad] ఈ ipad‌లోని solstone యాప్ ఇప్పుడు స్పందించడం లేదు. ఈ ఎక్స్‌టెన్షన్ దానంతట అదే మళ్ళీ ప్రయత్నిస్తుంది.
}

browser.status.changingsites = మీ సైట్‌లు మారుతున్నాయి

browser.status.connecting = solstone యాప్‌తో కనెక్ట్ అవుతోంది

browser.status.finishsetup = సెటప్ పూర్తి చేయండి

browser.status.foundsolstoneapp = solstone యాప్ కనబడింది

browser.status.foundsolstoneapps = solstone యాప్ కనబడింది. అది ఇప్పుడు పాజ్ అయి ఉంది.

browser.status.getapp = solstone యాప్ పొందండి

browser.status.icontitle = { $headline }

browser.status.idlereason = { $mode ->
   *[selected] ఇప్పుడు మీ సైట్‌లు ఏవీ తెరిచి లేవు.
    [all] మీరు పంచుకునే వెబ్‌సైట్‌లు ఏవీ ఇప్పుడు తెరిచి లేవు.
}

browser.status.intakeheld = { $place ->
   *[computer] ఈ కంప్యూటర్‌లోని solstone యాప్ ఇప్పుడు కొత్త పేజీలను స్వీకరించడం లేదు.
    [iphone] ఈ iphone‌లోని solstone యాప్ ఇప్పుడు కొత్త పేజీలను స్వీకరించడం లేదు.
    [ipad] ఈ ipad‌లోని solstone యాప్ ఇప్పుడు కొత్త పేజీలను స్వీకరించడం లేదు.
}

browser.status.keptfornow = { $place ->
   *[computer] ఇప్పటికి ఈ కంప్యూటర్‌లో నిలిచి ఉంది
    [iphone] ఇప్పటికి ఈ iphone‌లో నిలిచి ఉంది
    [ipad] ఇప్పటికి ఈ ipad‌లో నిలిచి ఉంది
}

browser.status.keptfornowreason = { $place ->
   *[computer] ఈ బ్రౌజర్ నుండి మీరు పంచుకున్నది ఇప్పటికి ఈ కంప్యూటర్‌లో నిలిచి ఉంది. వివరాలు solstone యాప్‌లో ఉన్నాయి.
    [iphone] ఈ బ్రౌజర్ నుండి మీరు పంచుకున్నది ఇప్పటికి ఈ iphone‌లో నిలిచి ఉంది. వివరాలు solstone యాప్‌లో ఉన్నాయి.
    [ipad] ఈ బ్రౌజర్ నుండి మీరు పంచుకున్నది ఇప్పటికి ఈ ipad‌లో నిలిచి ఉంది. వివరాలు solstone యాప్‌లో ఉన్నాయి.
}

browser.status.keptwaiting = { $place ->
   *[computer] ఈ కంప్యూటర్‌లో నిలిచి ఉంది, మీ జర్నల్‌లోకి వెళ్లడానికి వేచి ఉంది.
    [iphone] ఈ iphone‌లో నిలిచి ఉంది, మీ జర్నల్‌లోకి వెళ్లడానికి వేచి ఉంది.
    [ipad] ఈ ipad‌లో నిలిచి ఉంది, మీ జర్నల్‌లోకి వెళ్లడానికి వేచి ఉంది.
}

browser.status.lastpages = చివరి పేజీలు మీ జర్నల్‌కు చేరాయి

browser.status.lostbrowsers = మీ బ్రౌజర్‌ల నుండి మీరు పంచుకున్నదాంట్లో కొంత భాగం ఉంచుకోలేకపోయింది, కాబట్టి అది మీ జర్నల్‌లోకి వెళ్లదు. వివరాలు solstone యాప్‌లో ఉన్నాయి.

browser.status.lostthis = ఈ బ్రౌజర్ నుండి మీరు పంచుకున్నదాంట్లో కొంత భాగం ఉంచుకోలేకపోయింది, కాబట్టి అది మీ జర్నల్‌లోకి వెళ్లదు.

browser.status.noroom = ఇప్పుడు మరింతదానికి చోటు లేదు

browser.status.nosites = సైట్‌లు ఇంకా ఏవీ లేవు

browser.status.nothingfrombrowser = ఈ బ్రౌజర్ నుండి కొత్తది ఏదీ స్వీకరించబడడం లేదు

browser.status.nothingnew = కొత్తది ఏదీ స్వీకరించబడడం లేదు

browser.status.nothingrightnow = ఇప్పుడు కొత్తది ఏదీ స్వీకరించబడడం లేదు

browser.status.nothingwaiting = మీ జర్నల్‌లోకి వెళ్లడానికి ఏదీ వేచి లేదు

browser.status.notpaired = { $place ->
   *[computer] ఈ కంప్యూటర్‌లోని solstone యాప్‌ను మీ జర్నల్‌తో పెయిరింగ్ చేయండి, తర్వాత తిరిగి రండి.
    [iphone] ఈ iphone‌లోని solstone యాప్‌ను మీ జర్నల్‌తో పెయిరింగ్ చేయండి, మీ జర్నల్ మార్క్‌ను ధృవీకరించండి, తర్వాత తిరిగి రండి.
    [ipad] ఈ ipad‌లోని solstone యాప్‌ను మీ జర్నల్‌తో పెయిరింగ్ చేయండి, మీ జర్నల్ మార్క్‌ను ధృవీకరించండి, తర్వాత తిరిగి రండి.
}

browser.status.notpairedheadline = solstone యాప్ ఇంకా పెయిర్ కాలేదు.

browser.status.notreaching = మీ జర్నల్‌తో కనెక్ట్ కావడం లేదు

browser.status.nowordyet = మీ జర్నల్‌తో కనెక్ట్ అవుతోందో లేదో ఇంకా తెలియదు

browser.status.openandadd = మీరు పంచుకోవాలనుకునే సైట్‌ను తెరిచి, ఈ సైట్‌ను చేర్చండి ఎంచుకోండి.

browser.status.pagesoff = solstone యాప్‌లో బ్రౌజర్ పేజీలు ఆఫ్‌లో ఉన్నాయి

browser.status.pausedhere = ఈ బ్రౌజర్‌లో పాజ్ అయి ఉంది

browser.status.pausedoesnthold = పాజ్ చేయడం ఇప్పటికే స్వీకరించినదాన్ని నిలిచి ఉంచదు.

browser.status.pressure = ఈ బ్రౌజర్ నుండి మీరు పంచుకున్నది solstone యాప్ అంగీకరించే వరకు వేచి ఉంది. చోటు వచ్చాక కొత్త పేజీలు మళ్ళీ స్వీకరించబడతాయి.

browser.status.reaching = మీ జర్నల్‌తో కనెక్ట్ అవుతోంది

browser.status.readthenchoose = solstone ఎక్స్‌టెన్షన్ స్వీకరించేది చదవండి, తర్వాత మీ మొదటి సైట్‌ను ఎంచుకోండి.

browser.status.sitesneedattention = { $count ->
    [one] { $count } సైట్‌కు శ్రద్ధ కావాలి
   *[other] { $count } సైట్‌లకు శ్రద్ధ కావాలి
}

browser.status.somecouldnt = కొన్ని పేజీలను ఉంచుకోలేకపోయింది

browser.status.stopleavinghostout = { $value1 } మినహాయించడం ఆపండి

browser.status.storefull = { $place ->
   *[computer] మీ బ్రౌజర్‌ల నుండి మీరు పంచుకున్నదానికి ఈ కంప్యూటర్‌లోని చోటు నిండింది. చోటు వచ్చాక కొత్త పేజీలు మళ్ళీ స్వీకరించబడతాయి. వివరాలు solstone యాప్‌లో ఉన్నాయి.
    [iphone] Safari పేజీలకు ఈ iphone‌లోని చోటు నిండింది. చోటు చేయడానికి solstone యాప్‌ను తెరవండి.
    [ipad] Safari పేజీలకు ఈ ipad‌లోని చోటు నిండింది. చోటు చేయడానికి solstone యాప్‌ను తెరవండి.
}

browser.status.turnpageson = solstone యాప్ సెట్టింగ్‌లలో మూలాల కింద బ్రౌజర్ పేజీలను మళ్ళీ ఆన్ చేయండి.

browser.status.unavailable = స్థితి అందుబాటులో లేదు

browser.status.unavailablereason = solstone ఎక్స్‌టెన్షన్ ఇప్పుడు తన స్థితిని చూపలేదు.

browser.status.untilanswers = అది స్పందించే వరకు ఏదీ స్వీకరించబడదు

browser.status.untilpaired = అది పెయిర్ అయ్యే వరకు ఏదీ స్వీకరించబడదు

browser.status.untilroom = చోటు వచ్చే వరకు కొత్తది ఏదీ స్వీకరించబడదు

browser.status.untilsaved = ఇది సేవ్ అయ్యే వరకు కొత్తది ఏదీ స్వీకరించబడదు

browser.status.untilupdated = అది అప్‌డేట్ అయ్యే వరకు కొత్తది ఏదీ స్వీకరించబడదు

browser.status.untilyouadd = మీరు ఒక సైట్‌ను చేర్చే వరకు ఏదీ స్వీకరించబడదు

browser.status.untilyoudo = మీరు చేసే వరకు ఏదీ స్వీకరించబడదు

browser.status.updateapp = { $place ->
   *[computer] ఈ ఎక్స్‌టెన్షన్‌కు ఈ కంప్యూటర్‌లోని solstone యాప్ కొత్త వెర్షన్ కావాలి. solstone యాప్ సెట్టింగ్‌లలో అప్‌డేట్‌ల కింద చూడండి.
    [iphone] ఈ iphone‌లోని solstone యాప్‌ను అప్‌డేట్ చేయండి.
    [ipad] ఈ ipad‌లోని solstone యాప్‌ను అప్‌డేట్ చేయండి.
}

browser.status.updateappheadline = solstone యాప్‌ను అప్‌డేట్ చేయండి

browser.status.updatechecking = { $place ->
   *[computer] ఈ కంప్యూటర్‌లోని solstone యాప్‌కు ఈ ఎక్స్‌టెన్షన్ కొత్త వెర్షన్ కావాలి. { $browser } ఇప్పుడు దాని కోసం సరిచూస్తోంది.
    [iphone] ఈ iphone‌లోని solstone యాప్‌కు ఈ ఎక్స్‌టెన్షన్ కొత్త వెర్షన్ కావాలి. { $browser } ఇప్పుడు దాని కోసం సరిచూస్తోంది.
    [ipad] ఈ ipad‌లోని solstone యాప్‌కు ఈ ఎక్స్‌టెన్షన్ కొత్త వెర్షన్ కావాలి. { $browser } ఇప్పుడు దాని కోసం సరిచూస్తోంది.
}

browser.status.updateextension = solstone ఎక్స్‌టెన్షన్‌ను అప్‌డేట్ చేయండి

browser.status.updatefirefoxmanual = { $place ->
   *[computer] ఈ కంప్యూటర్‌లోని solstone యాప్‌కు ఈ ఎక్స్‌టెన్షన్ కొత్త వెర్షన్ కావాలి. Firefoxలో యాడ్-ఆన్‌లు మరియు థీమ్‌లు తెరవండి, తర్వాత గేర్ మెనూ నుండి అప్‌డేట్‌లు సరిచూడండి ఎంచుకోండి.
    [iphone] ఈ iphone‌లోని solstone యాప్‌కు ఈ ఎక్స్‌టెన్షన్ కొత్త వెర్షన్ కావాలి. Firefoxలో యాడ్-ఆన్‌లు మరియు థీమ్‌లు తెరవండి, తర్వాత గేర్ మెనూ నుండి అప్‌డేట్‌లు సరిచూడండి ఎంచుకోండి.
    [ipad] ఈ ipad‌లోని solstone యాప్‌కు ఈ ఎక్స్‌టెన్షన్ కొత్త వెర్షన్ కావాలి. Firefoxలో యాడ్-ఆన్‌లు మరియు థీమ్‌లు తెరవండి, తర్వాత గేర్ మెనూ నుండి అప్‌డేట్‌లు సరిచూడండి ఎంచుకోండి.
}

browser.status.updatepending = { $place ->
   *[computer] ఈ కంప్యూటర్‌లోని solstone యాప్‌కు ఈ ఎక్స్‌టెన్షన్ కొత్త వెర్షన్ కావాలి. { $browser } ఇంకా దాన్ని కనుగొనలేదు. అది దానంతట అదే మళ్ళీ సరిచూస్తుంది.
    [iphone] ఈ iphone‌లోని solstone యాప్‌కు ఈ ఎక్స్‌టెన్షన్ కొత్త వెర్షన్ కావాలి. { $browser } ఇంకా దాన్ని కనుగొనలేదు. అది దానంతట అదే మళ్ళీ సరిచూస్తుంది.
    [ipad] ఈ ipad‌లోని solstone యాప్‌కు ఈ ఎక్స్‌టెన్షన్ కొత్త వెర్షన్ కావాలి. { $browser } ఇంకా దాన్ని కనుగొనలేదు. అది దానంతట అదే మళ్ళీ సరిచూస్తుంది.
}

browser.status.updateready = అప్‌డేట్ సిద్ధంగా ఉంది.

browser.status.updatesafarimanual = { $place ->
   *[computer] ఈ కంప్యూటర్‌లోని solstone యాప్‌కు ఈ ఎక్స్‌టెన్షన్ కొత్త వెర్షన్ కావాలి. Safariలో అది solstone యాప్‌తో వస్తుంది, కాబట్టి solstone యాప్‌ను అప్‌డేట్ చేయండి.
    [iphone] ఈ iphone‌లోని solstone యాప్‌కు ఈ ఎక్స్‌టెన్షన్ కొత్త వెర్షన్ కావాలి. Safariలో అది solstone యాప్‌తో వస్తుంది, కాబట్టి solstone యాప్‌ను అప్‌డేట్ చేయండి.
    [ipad] ఈ ipad‌లోని solstone యాప్‌కు ఈ ఎక్స్‌టెన్షన్ కొత్త వెర్షన్ కావాలి. Safariలో అది solstone యాప్‌తో వస్తుంది, కాబట్టి solstone యాప్‌ను అప్‌డేట్ చేయండి.
}

browser.status.waitedweek = { $place ->
   *[computer] మీ బ్రౌజర్‌ల నుండి కొన్ని పేజీలు మీ జర్నల్‌లోకి వెళ్లడానికి ఒక వారం కంటే ఎక్కువ వేచి ఉన్నాయి. అవి ఇంకా ఈ కంప్యూటర్‌లో నిలిచి ఉన్నాయి. వివరాలు solstone యాప్‌లో ఉన్నాయి.
    [iphone] Safari నుండి కొన్ని పేజీలు మీ జర్నల్‌లోకి వెళ్లడానికి ఒక వారం కంటే ఎక్కువ వేచి ఉన్నాయి. అవి ఇంకా ఈ iphone‌లో నిలిచి ఉన్నాయి. solstone యాప్‌ను తెరిస్తే అవి మీ జర్నల్‌లోకి వెళ్తాయి.
    [ipad] Safari నుండి కొన్ని పేజీలు మీ జర్నల్‌లోకి వెళ్లడానికి ఒక వారం కంటే ఎక్కువ వేచి ఉన్నాయి. అవి ఇంకా ఈ ipad‌లో నిలిచి ఉన్నాయి. solstone యాప్‌ను తెరిస్తే అవి మీ జర్నల్‌లోకి వెళ్తాయి.
}

browser.status.waitedweekheadline = కొన్ని పేజీలు ఒక వారం కంటే ఎక్కువ వేచి ఉన్నాయి

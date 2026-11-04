// Formas de referencia, escritas a mano y SEPARADAS del código de la app: la prueba compara lo que conjuga cada motor con esto.
// Formato: GOLD[idioma][tiempo][verbo] = { persona: forma }   (persona = índice en la lista de pronombres del idioma).
// Una forma con alternativas aceptadas se escribe con «|»: 'komm|komme'. Cuando un tiempo solo usa algunas personas, solo se listan esas.
const P6 = (...f) => Object.fromEntries(f.map((x, i) => [i, x]));       // las seis personas
const IMP = (a, b, c) => ({ 1: a, 3: b, 4: c });                         // imperativo francés: tu, nous, vous
const GOLD = { fr: {}, it: {}, pt: {}, en: {}, de: {}, pl: {}, ca: {}, el: {} };

// ---------------------------------------------------------------- FRANCÉS
GOLD.fr.imperatif = {
  parler: IMP('parle', 'parlons', 'parlez'), écouter: IMP('écoute', 'écoutons', 'écoutez'), regarder: IMP('regarde', 'regardons', 'regardez'),
  manger: IMP('mange', 'mangeons', 'mangez'), commencer: IMP('commence', 'commençons', 'commencez'),
  finir: IMP('finis', 'finissons', 'finissez'), choisir: IMP('choisis', 'choisissons', 'choisissez'),
  vendre: IMP('vends', 'vendons', 'vendez'), attendre: IMP('attends', 'attendons', 'attendez'), répondre: IMP('réponds', 'répondons', 'répondez'),
  être: IMP('sois', 'soyons', 'soyez'), avoir: IMP('aie', 'ayons', 'ayez'), aller: IMP('va', 'allons', 'allez'), faire: IMP('fais', 'faisons', 'faites'),
  savoir: IMP('sache', 'sachons', 'sachez'), venir: IMP('viens', 'venons', 'venez'), partir: IMP('pars', 'partons', 'partez'),
  prendre: IMP('prends', 'prenons', 'prenez'), voir: IMP('vois', 'voyons', 'voyez'), dire: IMP('dis', 'disons', 'dites')
};
GOLD.fr.subjonctif = {
  parler: P6('parle', 'parles', 'parle', 'parlions', 'parliez', 'parlent'), écouter: P6('écoute', 'écoutes', 'écoute', 'écoutions', 'écoutiez', 'écoutent'),
  regarder: P6('regarde', 'regardes', 'regarde', 'regardions', 'regardiez', 'regardent'), manger: P6('mange', 'manges', 'mange', 'mangions', 'mangiez', 'mangent'),
  commencer: P6('commence', 'commences', 'commence', 'commencions', 'commenciez', 'commencent'),
  finir: P6('finisse', 'finisses', 'finisse', 'finissions', 'finissiez', 'finissent'), choisir: P6('choisisse', 'choisisses', 'choisisse', 'choisissions', 'choisissiez', 'choisissent'),
  vendre: P6('vende', 'vendes', 'vende', 'vendions', 'vendiez', 'vendent'), attendre: P6('attende', 'attendes', 'attende', 'attendions', 'attendiez', 'attendent'),
  répondre: P6('réponde', 'répondes', 'réponde', 'répondions', 'répondiez', 'répondent'),
  être: P6('sois', 'sois', 'soit', 'soyons', 'soyez', 'soient'), avoir: P6('aie', 'aies', 'ait', 'ayons', 'ayez', 'aient'),
  aller: P6('aille', 'ailles', 'aille', 'allions', 'alliez', 'aillent'), faire: P6('fasse', 'fasses', 'fasse', 'fassions', 'fassiez', 'fassent'),
  pouvoir: P6('puisse', 'puisses', 'puisse', 'puissions', 'puissiez', 'puissent'), vouloir: P6('veuille', 'veuilles', 'veuille', 'voulions', 'vouliez', 'veuillent'),
  savoir: P6('sache', 'saches', 'sache', 'sachions', 'sachiez', 'sachent'), devoir: P6('doive', 'doives', 'doive', 'devions', 'deviez', 'doivent'),
  venir: P6('vienne', 'viennes', 'vienne', 'venions', 'veniez', 'viennent'), partir: P6('parte', 'partes', 'parte', 'partions', 'partiez', 'partent'),
  prendre: P6('prenne', 'prennes', 'prenne', 'prenions', 'preniez', 'prennent'), voir: P6('voie', 'voies', 'voie', 'voyions', 'voyiez', 'voient'),
  dire: P6('dise', 'dises', 'dise', 'disions', 'disiez', 'disent')
};

// ---------------------------------------------------------------- PORTUGUÉS (5 personas: eu, tu, ele/ela/você, nós, eles/elas/vocês)
const P5 = (...f) => Object.fromEntries(f.map((x, i) => [i, x]));
const IPT = (a, b, c, d) => ({ 1: a, 2: b, 3: c, 4: d });              // imperativo: tu, você, nós, vocês
GOLD.pt.imperativo = {
  falar: IPT('fala', 'fale', 'falemos', 'falem'), trabalhar: IPT('trabalha', 'trabalhe', 'trabalhemos', 'trabalhem'), comprar: IPT('compra', 'compre', 'compremos', 'comprem'),
  esperar: IPT('espera', 'espere', 'esperemos', 'esperem'), pagar: IPT('paga', 'pague', 'paguemos', 'paguem'),
  comer: IPT('come', 'coma', 'comamos', 'comam'), beber: IPT('bebe', 'beba', 'bebamos', 'bebam'), vender: IPT('vende', 'venda', 'vendamos', 'vendam'),
  partir: IPT('parte', 'parta', 'partamos', 'partam'), decidir: IPT('decide', 'decida', 'decidamos', 'decidam'),
  ser: IPT('sê', 'seja', 'sejamos', 'sejam'), estar: IPT('está', 'esteja', 'estejamos', 'estejam'), ter: IPT('tem', 'tenha', 'tenhamos', 'tenham'),
  ir: IPT('vai', 'vá', 'vamos', 'vão'), fazer: IPT('faz', 'faça', 'façamos', 'façam'), dizer: IPT('diz', 'diga', 'digamos', 'digam'),
  ver: IPT('vê', 'veja', 'vejamos', 'vejam'), vir: IPT('vem', 'venha', 'venhamos', 'venham'), dar: IPT('dá', 'dê', 'demos', 'deem'), 'pôr': IPT('põe', 'ponha', 'ponhamos', 'ponham')
};
GOLD.pt.conjuntivo = {
  falar: P5('fale', 'fales', 'fale', 'falemos', 'falem'), trabalhar: P5('trabalhe', 'trabalhes', 'trabalhe', 'trabalhemos', 'trabalhem'), estudar: P5('estude', 'estudes', 'estude', 'estudemos', 'estudem'),
  comprar: P5('compre', 'compres', 'compre', 'compremos', 'comprem'), esperar: P5('espere', 'esperes', 'espere', 'esperemos', 'esperem'), pagar: P5('pague', 'pagues', 'pague', 'paguemos', 'paguem'),
  comer: P5('coma', 'comas', 'coma', 'comamos', 'comam'), vender: P5('venda', 'vendas', 'venda', 'vendamos', 'vendam'), partir: P5('parta', 'partas', 'parta', 'partamos', 'partam'),
  decidir: P5('decida', 'decidas', 'decida', 'decidamos', 'decidam'),
  ser: P5('seja', 'sejas', 'seja', 'sejamos', 'sejam'), estar: P5('esteja', 'estejas', 'esteja', 'estejamos', 'estejam'), ter: P5('tenha', 'tenhas', 'tenha', 'tenhamos', 'tenham'),
  ir: P5('vá', 'vás', 'vá', 'vamos', 'vão'), fazer: P5('faça', 'faças', 'faça', 'façamos', 'façam'), dizer: P5('diga', 'digas', 'diga', 'digamos', 'digam'),
  ver: P5('veja', 'vejas', 'veja', 'vejamos', 'vejam'), vir: P5('venha', 'venhas', 'venha', 'venhamos', 'venham'), poder: P5('possa', 'possas', 'possa', 'possamos', 'possam'),
  querer: P5('queira', 'queiras', 'queira', 'queiramos', 'queiram'), saber: P5('saiba', 'saibas', 'saiba', 'saibamos', 'saibam'), dar: P5('dê', 'dês', 'dê', 'demos', 'deem'), 'pôr': P5('ponha', 'ponhas', 'ponha', 'ponhamos', 'ponham')
};

// ---------------------------------------------------------------- ITALIANO (imperativo: tu, Lei, noi, voi, Loro)
const IIT = (a, b, c, d, e) => ({ 1: a, 2: b, 3: c, 4: d, 5: e });
GOLD.it.imperativo = {
  parlare: IIT('parla', 'parli', 'parliamo', 'parlate', 'parlino'), ascoltare: IIT('ascolta', 'ascolti', 'ascoltiamo', 'ascoltate', 'ascoltino'),
  mangiare: IIT('mangia', 'mangi', 'mangiamo', 'mangiate', 'mangino'), cercare: IIT('cerca', 'cerchi', 'cerchiamo', 'cercate', 'cerchino'),
  pagare: IIT('paga', 'paghi', 'paghiamo', 'pagate', 'paghino'), credere: IIT('credi', 'creda', 'crediamo', 'credete', 'credano'),
  ripetere: IIT('ripeti', 'ripeta', 'ripetiamo', 'ripetete', 'ripetano'), dormire: IIT('dormi', 'dorma', 'dormiamo', 'dormite', 'dormano'),
  sentire: IIT('senti', 'senta', 'sentiamo', 'sentite', 'sentano'), finire: IIT('finisci', 'finisca', 'finiamo', 'finite', 'finiscano'),
  essere: IIT('sii', 'sia', 'siamo', 'siate', 'siano'), avere: IIT('abbi', 'abbia', 'abbiamo', 'abbiate', 'abbiano'),
  andare: IIT("va'|vai", 'vada', 'andiamo', 'andate', 'vadano'), fare: IIT("fa'|fai", 'faccia', 'facciamo', 'fate', 'facciano'),
  stare: IIT("sta'|stai", 'stia', 'stiamo', 'state', 'stiano'), sapere: IIT('sappi', 'sappia', 'sappiamo', 'sappiate', 'sappiano'),
  venire: IIT('vieni', 'venga', 'veniamo', 'venite', 'vengano'), prendere: IIT('prendi', 'prenda', 'prendiamo', 'prendete', 'prendano'),
  vedere: IIT('vedi', 'veda', 'vediamo', 'vedete', 'vedano'), dire: IIT("di'", 'dica', 'diciamo', 'dite', 'dicano')
};

// ---------------------------------------------------------------- INGLÉS (imperativo: you, we)
const IEN = (v) => ({ 1: v, 3: "let's " + v + "|let us " + v });
GOLD.en.imperative = Object.fromEntries(['work','listen','wait','open','close','call','help','finish','study','try','be','have','do','go','make','take','come','see','get','give','think','say'].map(v => [v, IEN(v)]));

// ---------------------------------------------------------------- ALEMÁN (imperativo: du, wir, ihr, Sie)
const IDE = (du, wir, ihr, sie) => ({ 1: du, 3: wir, 4: ihr, 5: sie });
const deReg = (inf, du, ihr) => [inf, IDE(du, inf + ' wir', ihr, inf + ' Sie')];
GOLD.de.imperativ = Object.fromEntries([
  deReg('machen', 'mach|mache', 'macht'), deReg('lernen', 'lern|lerne', 'lernt'), deReg('kaufen', 'kauf|kaufe', 'kauft'), deReg('kochen', 'koch|koche', 'kocht'),
  deReg('hören', 'hör|höre', 'hört'), deReg('suchen', 'such|suche', 'sucht'), deReg('arbeiten', 'arbeite', 'arbeitet'), deReg('warten', 'warte', 'wartet'),
  deReg('besuchen', 'besuch|besuche', 'besucht'), deReg('bezahlen', 'bezahl|bezahle', 'bezahlt'),
  ['sein', IDE('sei', 'seien wir', 'seid', 'seien Sie')], ['haben', IDE('hab|habe', 'haben wir', 'habt', 'haben Sie')], ['werden', IDE('werde', 'werden wir', 'werdet', 'werden Sie')],
  ['gehen', IDE('geh|gehe', 'gehen wir', 'geht', 'gehen Sie')], ['kommen', IDE('komm|komme', 'kommen wir', 'kommt', 'kommen Sie')], ['fahren', IDE('fahr|fahre', 'fahren wir', 'fahrt', 'fahren Sie')],
  ['sehen', IDE('sieh|siehe', 'sehen wir', 'seht', 'sehen Sie')], ['geben', IDE('gib', 'geben wir', 'gebt', 'geben Sie')], ['nehmen', IDE('nimm', 'nehmen wir', 'nehmt', 'nehmen Sie')],
  ['sprechen', IDE('sprich', 'sprechen wir', 'sprecht', 'sprechen Sie')]
]);

// ---------------------------------------------------------------- POLACO (imperativo: ty, niech on/ona, my, wy, niech oni)
const IPL = (ty, n3, n6) => ({ 1: ty, 2: 'niech ' + n3, 3: ty + 'my', 4: ty + 'cie', 5: 'niech ' + n6 });
GOLD.pl.rozkazujacy = {
  'pracować': IPL('pracuj', 'pracuje', 'pracują'), 'czytać': IPL('czytaj', 'czyta', 'czytają'), 'robić': IPL('rób', 'robi', 'robią'), 'mieszkać': IPL('mieszkaj', 'mieszka', 'mieszkają'),
  'mówić': IPL('mów', 'mówi', 'mówią'), 'kupować': IPL('kupuj', 'kupuje', 'kupują'), 'grać': IPL('graj', 'gra', 'grają'), 'uczyć': IPL('ucz', 'uczy', 'uczą'),
  'dzwonić': IPL('dzwoń', 'dzwoni', 'dzwonią'), 'słuchać': IPL('słuchaj', 'słucha', 'słuchają'),
  'być': IPL('bądź', 'będzie', 'będą'), 'mieć': IPL('miej', 'ma', 'mają'), 'iść': IPL('idź', 'idzie', 'idą'), 'jeść': IPL('jedz', 'je', 'jedzą'),
  'przyjść': IPL('przyjdź', 'przyjdzie', 'przyjdą'), 'zjeść': IPL('zjedz', 'zje', 'zjedzą'), 'wziąć': IPL('weź', 'weźmie', 'wezmą'),
  'powiedzieć': IPL('powiedz', 'powie', 'powiedzą'), 'pomóc': IPL('pomóż', 'pomoże', 'pomogą')
};

// ---------------------------------------------------------------- CATALÁN (imperativo: tu, vostè, nosaltres, vosaltres, vostès)
const ICA = (a, b, c, d, e) => ({ 1: a, 2: b, 3: c, 4: d, 5: e });
GOLD.ca.imperatiu = {
  parlar: ICA('parla', 'parli', 'parlem', 'parleu', 'parlin'), escoltar: ICA('escolta', 'escolti', 'escoltem', 'escolteu', 'escoltin'), comprar: ICA('compra', 'compri', 'comprem', 'compreu', 'comprin'),
  esperar: ICA('espera', 'esperi', 'esperem', 'espereu', 'esperin'), pagar: ICA('paga', 'pagui', 'paguem', 'pagueu', 'paguin'), buscar: ICA('busca', 'busqui', 'busquem', 'busqueu', 'busquin'),
  perdre: ICA('perd', 'perdi', 'perdem', 'perdeu', 'perdin'), rebre: ICA('rep', 'rebi', 'rebem', 'rebeu', 'rebin'), dormir: ICA('dorm', 'dormi', 'dormim', 'dormiu', 'dormin'),
  servir: ICA('serveix', 'serveixi', 'servim', 'serviu', 'serveixin'),
  ser: ICA('sigues', 'sigui', 'siguem', 'sigueu', 'siguin'), estar: ICA('estigues', 'estigui', 'estiguem', 'estigueu', 'estiguin'), tenir: ICA('tingues', 'tingui', 'tinguem', 'tingueu', 'tinguin'),
  anar: ICA('ves', 'vagi', 'anem', 'aneu', 'vagin'), fer: ICA('fes', 'faci', 'fem', 'feu', 'facin'), dir: ICA('digues', 'digui', 'diguem', 'digueu', 'diguin'),
  veure: ICA('veges', 'vegi', 'vegem', 'vegeu', 'vegin'), venir: ICA('vine', 'vingui', 'vinguem', 'vingueu', 'vinguin'), viure: ICA('viu', 'visqui', 'visquem', 'visqueu', 'visquin'),
  dur: ICA('du', 'dugui', 'duguem', 'dugueu', 'duguin'), beure: ICA('beu', 'begui', 'beguem', 'begueu', 'beguin'), prendre: ICA('pren', 'prengui', 'prenguem', 'prengueu', 'prenguin'),
  escriure: ICA('escriu', 'escrigui', 'escriguem', 'escrigueu', 'escriguin'), obrir: ICA('obre', 'obri', 'obrim', 'obriu', 'obrin')
};

// ---------------------------------------------------------------- GRIEGO (imperativo: εσύ = 1, εσείς = 4)
const IEL = (sg, pl) => ({ 1: sg, 4: pl });
GOLD.el.prostaktiki = {
  'γράφω': IEL('γράψε', 'γράψτε'), 'διαβάζω': IEL('διάβασε', 'διαβάστε'), 'αγοράζω': IEL('αγόρασε', 'αγοράστε'), 'ανοίγω': IEL('άνοιξε', 'ανοίξτε'),
  'κλείνω': IEL('κλείσε', 'κλείστε'), 'δουλεύω': IEL('δούλεψε', 'δουλέψτε'), 'μιλάω': IEL('μίλησε', 'μιλήστε'), 'ρωτάω': IEL('ρώτησε', 'ρωτήστε'),
  'βοηθάω': IEL('βοήθησε', 'βοηθήστε'), 'τηλεφωνώ': IEL('τηλεφώνησε', 'τηλεφωνήστε'),
  'κάνω': IEL('κάνε', 'κάντε'), 'λέω': IEL('πες', 'πείτε'), 'βλέπω': IEL('δες', 'δείτε'), 'τρώω': IEL('φάε', 'φάτε'), 'πίνω': IEL('πιες', 'πιείτε'),
  'παίρνω': IEL('πάρε', 'πάρτε'), 'δίνω': IEL('δώσε', 'δώστε'), 'έρχομαι': IEL('έλα', 'ελάτε'), 'πηγαίνω': IEL('πήγαινε', 'πηγαίνετε'),
  'φέρνω': IEL('φέρε', 'φέρτε'), 'βρίσκω': IEL('βρες', 'βρείτε')
};

// ---------------------------------------------------------------- TIEMPOS YA EXISTENTES: formas que se revisaron a mano, una a una (instantánea verificada)
// Los tiempos de dos huecos (condicionales) se indican con «@1» para el segundo hueco.
GOLD.fr["present"] = {"être":{"0":"suis","1":"es","2":"est","3":"sommes","4":"êtes","5":"sont"},"avoir":{"0":"ai","1":"as","2":"a","3":"avons","4":"avez","5":"ont"},"aller":{"0":"vais","1":"vas","2":"va","3":"allons","4":"allez","5":"vont"},"manger":{"0":"mange","1":"manges","2":"mange","3":"mangeons","4":"mangez","5":"mangent"}};
GOLD.fr["pc"] = {"être":{"0":"ai été","1":"as été","2":"a été","3":"avons été","4":"avez été","5":"ont été"},"avoir":{"0":"ai eu","1":"as eu","2":"a eu","3":"avons eu","4":"avez eu","5":"ont eu"},"aller":{"0":"suis allé(e)","1":"es allé(e)","2":"est allé(e)","3":"sommes allé(e)s","4":"êtes allé(e)(s)","5":"sont allé(e)s"},"manger":{"0":"ai mangé","1":"as mangé","2":"a mangé","3":"avons mangé","4":"avez mangé","5":"ont mangé"}};
GOLD.fr["imparfait"] = {"être":{"0":"étais","1":"étais","2":"était","3":"étions","4":"étiez","5":"étaient"},"avoir":{"0":"avais","1":"avais","2":"avait","3":"avions","4":"aviez","5":"avaient"},"aller":{"0":"allais","1":"allais","2":"allait","3":"allions","4":"alliez","5":"allaient"},"manger":{"0":"mangeais","1":"mangeais","2":"mangeait","3":"mangions","4":"mangiez","5":"mangeaient"}};
GOLD.fr["futur"] = {"être":{"0":"serai","1":"seras","2":"sera","3":"serons","4":"serez","5":"seront"},"avoir":{"0":"aurai","1":"auras","2":"aura","3":"aurons","4":"aurez","5":"auront"},"aller":{"0":"irai","1":"iras","2":"ira","3":"irons","4":"irez","5":"iront"},"manger":{"0":"mangerai","1":"mangeras","2":"mangera","3":"mangerons","4":"mangerez","5":"mangeront"}};
GOLD.fr["cond"] = {"aller":{"0":"irais","1":"irais","2":"irait","3":"irions","4":"iriez","5":"iraient"}};
GOLD.fr["cond2"] = {"aller":{"0":"allais","1":"allais","2":"allait","3":"allions","4":"alliez","5":"allaient"}};
GOLD.fr["cond2@1"] = {"aller":{"0":"irais","1":"irais","2":"irait","3":"irions","4":"iriez","5":"iraient"}};
GOLD.fr["cond3"] = {"aller":{"0":"étais allé(e)","1":"étais allé(e)","2":"était allé(e)","3":"étions allé(e)s","4":"étiez allé(e)(s)","5":"étaient allé(e)s"}};
GOLD.fr["cond3@1"] = {"aller":{"0":"serais allé(e)","1":"serais allé(e)","2":"serait allé(e)","3":"serions allé(e)s","4":"seriez allé(e)(s)","5":"seraient allé(e)s"}};
GOLD.it["presente"] = {"essere":{"0":"sono","1":"sei","2":"è","3":"siamo","4":"siete","5":"sono"},"avere":{"0":"ho","1":"hai","2":"ha","3":"abbiamo","4":"avete","5":"hanno"},"andare":{"0":"vado","1":"vai","2":"va","3":"andiamo","4":"andate","5":"vanno"},"finire":{"0":"finisco","1":"finisci","2":"finisce","3":"finiamo","4":"finite","5":"finiscono"}};
GOLD.it["prossimo"] = {"essere":{"0":"sono stato|sono stata","1":"sei stato|sei stata","2":"è stato|è stata","3":"siamo stati|siamo state","4":"siete stati|siete state","5":"sono stati|sono state"},"avere":{"0":"ho avuto","1":"hai avuto","2":"ha avuto","3":"abbiamo avuto","4":"avete avuto","5":"hanno avuto"},"andare":{"0":"sono andato|sono andata","1":"sei andato|sei andata","2":"è andato|è andata","3":"siamo andati|siamo andate","4":"siete andati|siete andate","5":"sono andati|sono andate"},"finire":{"0":"ho finito","1":"hai finito","2":"ha finito","3":"abbiamo finito","4":"avete finito","5":"hanno finito"}};
GOLD.it["imperfetto"] = {"essere":{"0":"ero","1":"eri","2":"era","3":"eravamo","4":"eravate","5":"erano"},"avere":{"0":"avevo","1":"avevi","2":"aveva","3":"avevamo","4":"avevate","5":"avevano"},"andare":{"0":"andavo","1":"andavi","2":"andava","3":"andavamo","4":"andavate","5":"andavano"},"finire":{"0":"finivo","1":"finivi","2":"finiva","3":"finivamo","4":"finivate","5":"finivano"}};
GOLD.it["futuro"] = {"essere":{"0":"sarò","1":"sarai","2":"sarà","3":"saremo","4":"sarete","5":"saranno"},"avere":{"0":"avrò","1":"avrai","2":"avrà","3":"avremo","4":"avrete","5":"avranno"},"andare":{"0":"andrò","1":"andrai","2":"andrà","3":"andremo","4":"andrete","5":"andranno"},"finire":{"0":"finirò","1":"finirai","2":"finirà","3":"finiremo","4":"finirete","5":"finiranno"}};
GOLD.it["condiz"] = {"andare":{"0":"andrei","1":"andresti","2":"andrebbe","3":"andremmo","4":"andreste","5":"andrebbero"}};
GOLD.it["condiz2"] = {"andare":{"0":"andassi","1":"andassi","2":"andasse","3":"andassimo","4":"andaste","5":"andassero"}};
GOLD.it["condiz2@1"] = {"andare":{"0":"andrei","1":"andresti","2":"andrebbe","3":"andremmo","4":"andreste","5":"andrebbero"}};
GOLD.it["condiz3"] = {"andare":{"0":"fossi andato|fossi andata","1":"fossi andato|fossi andata","2":"fosse andato|fosse andata","3":"fossimo andati|fossimo andate","4":"foste andati|foste andate","5":"fossero andati|fossero andate"}};
GOLD.it["condiz3@1"] = {"andare":{"0":"sarei andato|sarei andata","1":"saresti andato|saresti andata","2":"sarebbe andato|sarebbe andata","3":"saremmo andati|saremmo andate","4":"sareste andati|sareste andate","5":"sarebbero andati|sarebbero andate"}};
GOLD.pt["presente"] = {"ser":{"0":"sou","1":"és","2":"é","3":"somos","4":"são"},"ter":{"0":"tenho","1":"tens","2":"tem","3":"temos","4":"têm"},"ir":{"0":"vou","1":"vais","2":"vai","3":"vamos","4":"vão"},"fazer":{"0":"faço","1":"fazes","2":"faz","3":"fazemos","4":"fazem"}};
GOLD.pt["perfeito"] = {"ser":{"0":"fui","1":"foste","2":"foi","3":"fomos","4":"foram"},"ter":{"0":"tive","1":"tiveste","2":"teve","3":"tivemos","4":"tiveram"},"ir":{"0":"fui","1":"foste","2":"foi","3":"fomos","4":"foram"},"fazer":{"0":"fiz","1":"fizeste","2":"fez","3":"fizemos","4":"fizeram"}};
GOLD.pt["imperfeito"] = {"ser":{"0":"era","1":"eras","2":"era","3":"éramos","4":"eram"},"ter":{"0":"tinha","1":"tinhas","2":"tinha","3":"tínhamos","4":"tinham"},"ir":{"0":"ia","1":"ias","2":"ia","3":"íamos","4":"iam"},"fazer":{"0":"fazia","1":"fazias","2":"fazia","3":"fazíamos","4":"faziam"}};
GOLD.pt["futuro"] = {"ser":{"0":"vou ser","1":"vais ser","2":"vai ser","3":"vamos ser","4":"vão ser"},"ter":{"0":"vou ter","1":"vais ter","2":"vai ter","3":"vamos ter","4":"vão ter"},"ir":{"0":"vou ir","1":"vais ir","2":"vai ir","3":"vamos ir","4":"vão ir"},"fazer":{"0":"vou fazer","1":"vais fazer","2":"vai fazer","3":"vamos fazer","4":"vão fazer"}};
GOLD.pt["condicional"] = {"ser":{"0":"seria","1":"serias","2":"seria","3":"seríamos","4":"seriam"}};
GOLD.pt["cond2"] = {"ser":{"0":"fosse","1":"fosses","2":"fosse","3":"fôssemos","4":"fossem"}};
GOLD.pt["cond2@1"] = {"ser":{"0":"seria","1":"serias","2":"seria","3":"seríamos","4":"seriam"}};
GOLD.pt["cond3"] = {"ser":{"0":"tivesse sido","1":"tivesses sido","2":"tivesse sido","3":"tivéssemos sido","4":"tivessem sido"}};
GOLD.pt["cond3@1"] = {"ser":{"0":"teria sido","1":"terias sido","2":"teria sido","3":"teríamos sido","4":"teriam sido"}};
GOLD.en["present"] = {"be":{"0":"am","1":"are","2":"is","3":"are","4":"are"},"have":{"0":"have","1":"have","2":"has","3":"have","4":"have"},"go":{"0":"go","1":"go","2":"goes","3":"go","4":"go"},"stop":{"0":"stop","1":"stop","2":"stops","3":"stop","4":"stop"}};
GOLD.en["past"] = {"be":{"0":"was","1":"were","2":"was","3":"were","4":"were"},"have":{"0":"had","1":"had","2":"had","3":"had","4":"had"},"go":{"0":"went","1":"went","2":"went","3":"went","4":"went"},"stop":{"0":"stopped","1":"stopped","2":"stopped","3":"stopped","4":"stopped"}};
GOLD.en["perfect"] = {"be":{"0":"have been|'ve been","1":"have been|'ve been","2":"has been|'s been","3":"have been|'ve been","4":"have been|'ve been"},"have":{"0":"have had|'ve had","1":"have had|'ve had","2":"has had|'s had","3":"have had|'ve had","4":"have had|'ve had"},"go":{"0":"have gone|'ve gone","1":"have gone|'ve gone","2":"has gone|'s gone","3":"have gone|'ve gone","4":"have gone|'ve gone"},"stop":{"0":"have stopped|'ve stopped","1":"have stopped|'ve stopped","2":"has stopped|'s stopped","3":"have stopped|'ve stopped","4":"have stopped|'ve stopped"}};
GOLD.en["future"] = {"be":{"0":"will be|'ll be","1":"will be|'ll be","2":"will be|'ll be","3":"will be|'ll be","4":"will be|'ll be"},"have":{"0":"will have|'ll have","1":"will have|'ll have","2":"will have|'ll have","3":"will have|'ll have","4":"will have|'ll have"},"go":{"0":"will go|'ll go","1":"will go|'ll go","2":"will go|'ll go","3":"will go|'ll go","4":"will go|'ll go"},"stop":{"0":"will stop|'ll stop","1":"will stop|'ll stop","2":"will stop|'ll stop","3":"will stop|'ll stop","4":"will stop|'ll stop"}};
GOLD.en["cond"] = {"go":{"0":"would go|'d go","1":"would go|'d go","2":"would go|'d go","3":"would go|'d go","4":"would go|'d go"}};
GOLD.en["cond2"] = {"go":{"0":"went","1":"went","2":"went","3":"went","4":"went"}};
GOLD.en["cond2@1"] = {"go":{"0":"would go|'d go","1":"would go|'d go","2":"would go|'d go","3":"would go|'d go","4":"would go|'d go"}};
GOLD.en["cond3"] = {"go":{"0":"had gone|'d gone","1":"had gone|'d gone","2":"had gone|'d gone","3":"had gone|'d gone","4":"had gone|'d gone"}};
GOLD.en["cond3@1"] = {"go":{"0":"would have gone|'d have gone|would've gone","1":"would have gone|'d have gone|would've gone","2":"would have gone|'d have gone|would've gone","3":"would have gone|'d have gone|would've gone","4":"would have gone|'d have gone|would've gone"}};
GOLD.de["praesens"] = {"sein":{"0":"bin","1":"bist","2":"ist","3":"sind","4":"seid","5":"sind"},"haben":{"0":"habe","1":"hast","2":"hat","3":"haben","4":"habt","5":"haben"},"fahren":{"0":"fahre","1":"fährst","2":"fährt","3":"fahren","4":"fahrt","5":"fahren"},"gehen":{"0":"gehe","1":"gehst","2":"geht","3":"gehen","4":"geht","5":"gehen"}};
GOLD.de["perfekt"] = {"sein":{"0":"bin gewesen","1":"bist gewesen","2":"ist gewesen","3":"sind gewesen","4":"seid gewesen","5":"sind gewesen"},"haben":{"0":"habe gehabt","1":"hast gehabt","2":"hat gehabt","3":"haben gehabt","4":"habt gehabt","5":"haben gehabt"},"fahren":{"0":"bin gefahren","1":"bist gefahren","2":"ist gefahren","3":"sind gefahren","4":"seid gefahren","5":"sind gefahren"},"gehen":{"0":"bin gegangen","1":"bist gegangen","2":"ist gegangen","3":"sind gegangen","4":"seid gegangen","5":"sind gegangen"}};
GOLD.de["praeteritum"] = {"sein":{"0":"war","1":"warst","2":"war","3":"waren","4":"wart","5":"waren"},"haben":{"0":"hatte","1":"hattest","2":"hatte","3":"hatten","4":"hattet","5":"hatten"},"fahren":{"0":"fuhr","1":"fuhrst","2":"fuhr","3":"fuhren","4":"fuhrt","5":"fuhren"},"gehen":{"0":"ging","1":"gingst","2":"ging","3":"gingen","4":"gingt","5":"gingen"}};
GOLD.de["futur"] = {"sein":{"0":"werde sein","1":"wirst sein","2":"wird sein","3":"werden sein","4":"werdet sein","5":"werden sein"},"haben":{"0":"werde haben","1":"wirst haben","2":"wird haben","3":"werden haben","4":"werdet haben","5":"werden haben"},"fahren":{"0":"werde fahren","1":"wirst fahren","2":"wird fahren","3":"werden fahren","4":"werdet fahren","5":"werden fahren"},"gehen":{"0":"werde gehen","1":"wirst gehen","2":"wird gehen","3":"werden gehen","4":"werdet gehen","5":"werden gehen"}};
GOLD.de["konjunktiv"] = {"sein":{"0":"wäre|würde sein","1":"wärst|würdest sein","2":"wäre|würde sein","3":"wären|würden sein","4":"wärt|würdet sein","5":"wären|würden sein"},"fahren":{"0":"führe|würde fahren","1":"führest|würdest fahren","2":"führe|würde fahren","3":"führen|würden fahren","4":"führet|würdet fahren","5":"führen|würden fahren"}};
GOLD.de["cond2"] = {"sein":{"0":"wäre|sein würde","1":"wärst|sein würdest","2":"wäre|sein würde","3":"wären|sein würden","4":"wärt|sein würdet","5":"wären|sein würden"},"fahren":{"0":"führe|fahren würde","1":"führest|fahren würdest","2":"führe|fahren würde","3":"führen|fahren würden","4":"führet|fahren würdet","5":"führen|fahren würden"}};
GOLD.de["cond2@1"] = {"sein":{"0":"wäre|würde sein","1":"wärst|würdest sein","2":"wäre|würde sein","3":"wären|würden sein","4":"wärt|würdet sein","5":"wären|würden sein"},"fahren":{"0":"führe|würde fahren","1":"führest|würdest fahren","2":"führe|würde fahren","3":"führen|würden fahren","4":"führet|würdet fahren","5":"führen|würden fahren"}};
GOLD.de["cond3"] = {"sein":{"0":"gewesen wäre","1":"gewesen wärst|gewesen wärest","2":"gewesen wäre","3":"gewesen wären","4":"gewesen wärt|gewesen wäret","5":"gewesen wären"},"fahren":{"0":"gefahren wäre","1":"gefahren wärst|gefahren wärest","2":"gefahren wäre","3":"gefahren wären","4":"gefahren wärt|gefahren wäret","5":"gefahren wären"}};
GOLD.de["cond3@1"] = {"sein":{"0":"wäre gewesen","1":"wärst gewesen|wärest gewesen","2":"wäre gewesen","3":"wären gewesen","4":"wärt gewesen|wäret gewesen","5":"wären gewesen"},"fahren":{"0":"wäre gefahren","1":"wärst gefahren|wärest gefahren","2":"wäre gefahren","3":"wären gefahren","4":"wärt gefahren|wäret gefahren","5":"wären gefahren"}};
GOLD.pl["presente"] = {"być":{"0":"jestem","1":"jesteś","2":"jest","3":"jesteśmy","4":"jesteście","5":"są"},"mieć":{"0":"mam","1":"masz","2":"ma","3":"mamy","4":"macie","5":"mają"},"iść":{"0":"idę","1":"idziesz","2":"idzie","3":"idziemy","4":"idziecie","5":"idą"}};
GOLD.pl["pasado_impf"] = {"być":{"0":"byłem|byłam","1":"byłeś|byłaś","2":"był|była|było","3":"byliśmy|byłyśmy","4":"byliście|byłyście","5":"byli|były"},"mieć":{"0":"miałem|miałam","1":"miałeś|miałaś","2":"miał|miała|miało","3":"mieliśmy|miałyśmy","4":"mieliście|miałyście","5":"mieli|miały"},"iść":{"0":"szedłem|szłam","1":"szedłeś|szłaś","2":"szedł|szła|szło","3":"szliśmy|szłyśmy","4":"szliście|szłyście","5":"szli|szły"}};
GOLD.pl["pasado_perf"] = {"być":{"0":"byłem|byłam","1":"byłeś|byłaś","2":"był|była|było","3":"byliśmy|byłyśmy","4":"byliście|byłyście","5":"byli|były"},"mieć":{"0":"miałem|miałam","1":"miałeś|miałaś","2":"miał|miała|miało","3":"mieliśmy|miałyśmy","4":"mieliście|miałyście","5":"mieli|miały"},"iść":{"0":"szedłem|szłam","1":"szedłeś|szłaś","2":"szedł|szła|szło","3":"szliśmy|szłyśmy","4":"szliście|szłyście","5":"szli|szły"},"pójść":{"0":"poszedłem|poszłam","1":"poszedłeś|poszłaś","2":"poszedł|poszła|poszło","3":"poszliśmy|poszłyśmy","4":"poszliście|poszłyście","5":"poszli|poszły"}};
GOLD.pl["futuro_impf"] = {"być":{"0":"będę","1":"będziesz","2":"będzie","3":"będziemy","4":"będziecie","5":"będą"},"mieć":{"0":"będę mieć|będę miał|będę miała","1":"będziesz mieć|będziesz miał|będziesz miała","2":"będzie mieć|będzie miał|będzie miała|będzie miało","3":"będziemy mieć|będziemy mieli|będziemy miały","4":"będziecie mieć|będziecie mieli|będziecie miały","5":"będą mieć|będą mieli|będą miały"},"iść":{"0":"będę iść|będę szedł|będę szła","1":"będziesz iść|będziesz szedł|będziesz szła","2":"będzie iść|będzie szedł|będzie szła|będzie szło","3":"będziemy iść|będziemy szli|będziemy szły","4":"będziecie iść|będziecie szli|będziecie szły","5":"będą iść|będą szli|będą szły"}};
GOLD.pl["condicional_impf"] = {"iść":{"0":"szedłbym|szłabym","1":"szedłbyś|szłabyś","2":"szedłby|szłaby|szłoby","3":"szlibyśmy|szłybyśmy","4":"szlibyście|szłybyście","5":"szliby|szłyby"}};
GOLD.pl["cond2"] = {"iść":{"0":"gdybym szedł|gdybym szła","1":"gdybyś szedł|gdybyś szła","2":"gdyby szedł|gdyby szła|gdyby szło","3":"gdybyśmy szli|gdybyśmy szły","4":"gdybyście szli|gdybyście szły","5":"gdyby szli|gdyby szły"}};
GOLD.pl["cond2@1"] = {"iść":{"0":"szedłbym|szłabym","1":"szedłbyś|szłabyś","2":"szedłby|szłaby|szłoby","3":"szlibyśmy|szłybyśmy","4":"szlibyście|szłybyście","5":"szliby|szłyby"}};
GOLD.pl["futuro_perf"] = {"pójść":{"0":"pójdę","1":"pójdziesz","2":"pójdzie","3":"pójdziemy","4":"pójdziecie","5":"pójdą"}};
GOLD.pl["condicional_perf"] = {"pójść":{"0":"poszedłbym|poszłabym","1":"poszedłbyś|poszłabyś","2":"poszedłby|poszłaby|poszłoby","3":"poszlibyśmy|poszłybyśmy","4":"poszlibyście|poszłybyście","5":"poszliby|poszłyby"}};
GOLD.ca["present"] = {"ser":{"0":"sóc","1":"ets","2":"és","3":"som","4":"sou","5":"són"},"anar":{"0":"vaig","1":"vas","2":"va","3":"anem","4":"aneu","5":"van"},"tenir":{"0":"tinc","1":"tens","2":"té","3":"tenim","4":"teniu","5":"tenen"}};
GOLD.ca["perifrastic"] = {"ser":{"0":"vaig ser","1":"vas ser","2":"va ser","3":"vam ser|vàrem ser","4":"vau ser|vàreu ser","5":"van ser"},"anar":{"0":"vaig anar","1":"vas anar","2":"va anar","3":"vam anar|vàrem anar","4":"vau anar|vàreu anar","5":"van anar"},"tenir":{"0":"vaig tenir","1":"vas tenir","2":"va tenir","3":"vam tenir|vàrem tenir","4":"vau tenir|vàreu tenir","5":"van tenir"}};
GOLD.ca["imperfet"] = {"ser":{"0":"era","1":"eres","2":"era","3":"érem","4":"éreu","5":"eren"},"anar":{"0":"anava","1":"anaves","2":"anava","3":"anàvem","4":"anàveu","5":"anaven"},"tenir":{"0":"tenia","1":"tenies","2":"tenia","3":"teníem","4":"teníeu","5":"tenien"}};
GOLD.ca["futur"] = {"ser":{"0":"seré","1":"seràs","2":"serà","3":"serem","4":"sereu","5":"seran"},"anar":{"0":"aniré","1":"aniràs","2":"anirà","3":"anirem","4":"anireu","5":"aniran"},"tenir":{"0":"tindré","1":"tindràs","2":"tindrà","3":"tindrem","4":"tindreu","5":"tindran"}};
GOLD.ca["cond"] = {"anar":{"0":"aniria","1":"aniries","2":"aniria","3":"aniríem","4":"aniríeu","5":"anirien"}};
GOLD.ca["cond2"] = {"anar":{"0":"anés","1":"anessis","2":"anés","3":"anéssim","4":"anéssiu","5":"anessin"}};
GOLD.ca["cond2@1"] = {"anar":{"0":"aniria","1":"aniries","2":"aniria","3":"aniríem","4":"aniríeu","5":"anirien"}};
GOLD.ca["cond3"] = {"anar":{"0":"hagués anat","1":"haguessis anat","2":"hagués anat","3":"haguéssim anat","4":"haguéssiu anat","5":"haguessin anat"}};
GOLD.ca["cond3@1"] = {"anar":{"0":"hauria anat","1":"hauries anat","2":"hauria anat","3":"hauríem anat","4":"hauríeu anat","5":"haurien anat"}};
GOLD.el["enestotas"] = {"είμαι":{"0":"είμαι","1":"είσαι","2":"είναι","3":"είμαστε","4":"είστε|είσαστε","5":"είναι"},"έχω":{"0":"έχω","1":"έχεις","2":"έχει","3":"έχουμε","4":"έχετε","5":"έχουν|έχουνε"},"πηγαίνω":{"0":"πηγαίνω|πάω","1":"πηγαίνεις|πας","2":"πηγαίνει|πάει","3":"πηγαίνουμε|πάμε","4":"πηγαίνετε|πάτε","5":"πηγαίνουν|πηγαίνουνε|πάνε"},"τρώω":{"0":"τρώω","1":"τρως","2":"τρώει","3":"τρώμε","4":"τρώτε","5":"τρώνε"}};
GOLD.el["aoristos"] = {"είμαι":{"0":"ήμουν|ήμουνα","1":"ήσουν|ήσουνα","2":"ήταν|ήτανε","3":"ήμασταν|ήμαστε","4":"ήσασταν|ήσαστε","5":"ήταν|ήτανε|ήσαν"},"έχω":{"0":"είχα","1":"είχες","2":"είχε","3":"είχαμε","4":"είχατε","5":"είχαν|είχανε"},"πηγαίνω":{"0":"πήγα","1":"πήγες","2":"πήγε","3":"πήγαμε","4":"πήγατε","5":"πήγαν|πήγανε"},"τρώω":{"0":"έφαγα","1":"έφαγες","2":"έφαγε","3":"φάγαμε","4":"φάγατε","5":"έφαγαν|έφαγανε"},"λέω":{"0":"είπα","1":"είπες","2":"είπε","3":"είπαμε","4":"είπατε","5":"είπαν|είπανε"},"βλέπω":{"0":"είδα","1":"είδες","2":"είδε","3":"είδαμε","4":"είδατε","5":"είδαν|είδανε"}};
GOLD.el["paratatikos"] = {"είμαι":{"0":"ήμουν|ήμουνα","1":"ήσουν|ήσουνα","2":"ήταν|ήτανε","3":"ήμασταν|ήμαστε","4":"ήσασταν|ήσαστε","5":"ήταν|ήτανε|ήσαν"},"έχω":{"0":"είχα","1":"είχες","2":"είχε","3":"είχαμε","4":"είχατε","5":"είχαν|είχανε"}};
GOLD.el["mellontas"] = {"είμαι":{"0":"θα είμαι","1":"θα είσαι","2":"θα είναι","3":"θα είμαστε","4":"θα είστε|θα είσαστε","5":"θα είναι"},"έχω":{"0":"θα έχω","1":"θα έχεις","2":"θα έχει","3":"θα έχουμε","4":"θα έχετε","5":"θα έχουν|θα έχουνε"},"πηγαίνω":{"0":"θα πάω","1":"θα πας","2":"θα πάει","3":"θα πάμε","4":"θα πάτε","5":"θα πάνε"},"τρώω":{"0":"θα φάω|θα φάγω","1":"θα φας|θα φάγεις","2":"θα φάει|θα φάγει","3":"θα φάμε|θα φάγουμε","4":"θα φάτε|θα φάγετε","5":"θα φάνε|θα φάγουν|θα φάγουνε"},"λέω":{"0":"θα πω","1":"θα πεις","2":"θα πει","3":"θα πούμε","4":"θα πείτε","5":"θα πουν|θα πούνε"},"βλέπω":{"0":"θα δω","1":"θα δεις","2":"θα δει","3":"θα δούμε","4":"θα δείτε","5":"θα δουν|θα δούνε"}};

module.exports = { GOLD, P6 };

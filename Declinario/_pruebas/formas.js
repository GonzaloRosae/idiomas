// Formas de referencia de Declinario, escritas aparte del código de la app y por columnas (la app las guarda por filas).
// Cada entrada: [idioma, tema, tabla (su título o su posición), columna, [formas, una por fila en el orden de la tabla]].
// «a|b» son alternativas aceptadas. Si esta tabla y la app discrepan, una de las dos tiene una errata: la forma correcta es la que dice la gramática.
const G = [];
const add = (l, t, it, col, forms) => G.push([l, t, it, col, forms]);

// ---- ALEMÁN (filas: nominativo, acusativo, dativo, genitivo)
add("de", "artdef", 0, "m", ["der", "den", "dem", "des"]); add("de", "artdef", 0, "f", ["die", "die", "der", "der"]);
add("de", "artdef", 0, "n", ["das", "das", "dem", "des"]); add("de", "artdef", 0, "pl", ["die", "die", "den", "der"]);
add("de", "artindef", "ein", "m", ["ein", "einen", "einem", "eines"]); add("de", "artindef", "ein", "f", ["eine", "eine", "einer", "einer"]);
add("de", "artindef", "ein", "n", ["ein", "ein", "einem", "eines"]); add("de", "artindef", "ein", "pl", ["—", "—", "—", "—"]);
add("de", "artindef", "kein", "pl", ["keine", "keine", "keinen", "keiner"]); add("de", "artindef", "kein", "m", ["kein", "keinen", "keinem", "keines"]);
add("de", "artindef", "mein", "pl", ["meine", "meine", "meinen", "meiner"]); add("de", "artindef", "mein", "f", ["meine", "meine", "meiner", "meiner"]);
add("de", "dieser", "dieser", "m", ["dieser", "diesen", "diesem", "dieses"]); add("de", "dieser", "dieser", "f", ["diese", "diese", "dieser", "dieser"]);
add("de", "dieser", "dieser", "n", ["dieses", "dieses", "diesem", "dieses"]); add("de", "dieser", "dieser", "pl", ["diese", "diese", "diesen", "dieser"]);
add("de", "dieser", "welcher", "m", ["welcher", "welchen", "welchem", "welches"]); add("de", "dieser", "jeder", "f", ["jede", "jede", "jeder", "jeder"]);
add("de", "pers", 0, "ich", ["ich", "mich", "mir", "meiner"]); add("de", "pers", 0, "du", ["du", "dich", "dir", "deiner"]);
add("de", "pers", 0, "wir", ["wir", "uns", "uns", "unser"]); add("de", "pers", 0, "ihr", ["ihr", "euch", "euch", "euer"]);
add("de", "pers", 1, "er", ["er", "ihn", "ihm", "seiner"]); add("de", "pers", 1, "sie_f", ["sie", "sie", "ihr", "ihrer"]);
add("de", "pers", 1, "es", ["es", "es", "ihm", "seiner"]); add("de", "pers", 1, "sie_p", ["sie", "sie", "ihnen", "ihrer"]); add("de", "pers", 1, "Sie", ["Sie", "Sie", "Ihnen", "Ihrer"]);
add("de", "rel", 0, "m", ["der", "den", "dem", "dessen"]); add("de", "rel", 0, "f", ["die", "die", "der", "deren"]);
add("de", "rel", 0, "n", ["das", "das", "dem", "dessen"]); add("de", "rel", 0, "pl", ["die", "die", "denen", "deren"]);
add("de", "rel", 1, "wer", ["wer", "wen", "wem", "wessen"]); add("de", "rel", 1, "was", ["was", "was", "—", "wessen"]);
add("de", "adjw", 0, "m", ["der gute Mann", "den guten Mann", "dem guten Mann", "des guten Mann(e)s"]); add("de", "adjw", 0, "f", ["die gute Frau", "die gute Frau", "der guten Frau", "der guten Frau"]);
add("de", "adjw", 0, "n", ["das gute Kind", "das gute Kind", "dem guten Kind", "des guten Kind(e)s"]); add("de", "adjw", 0, "pl", ["die guten Freunde", "die guten Freunde", "den guten Freunden", "der guten Freunde"]);
add("de", "adjw", 1, "m", ["der neue Tisch", "den neuen Tisch", "dem neuen Tisch", "des neuen Tisch(e)s"]); add("de", "adjw", 1, "pl", ["die neuen Bücher", "die neuen Bücher", "den neuen Büchern", "der neuen Bücher"]);
add("de", "adjm", 0, "m", ["ein guter Mann", "einen guten Mann", "einem guten Mann", "eines guten Mann(e)s"]); add("de", "adjm", 0, "f", ["eine gute Frau", "eine gute Frau", "einer guten Frau", "einer guten Frau"]);
add("de", "adjm", 0, "n", ["ein gutes Kind", "ein gutes Kind", "einem guten Kind", "eines guten Kind(e)s"]); add("de", "adjm", 0, "pl", ["meine guten Freunde", "meine guten Freunde", "meinen guten Freunden", "meiner guten Freunde"]);
add("de", "adjm", 1, "n", ["ein neues Haus", "ein neues Haus", "einem neuen Haus", "eines neuen Hauses"]);
add("de", "adjs", 0, "m", ["guter Wein", "guten Wein", "gutem Wein", "guten Wein(e)s"]); add("de", "adjs", 0, "f", ["gute Milch", "gute Milch", "guter Milch", "guter Milch"]);
add("de", "adjs", 0, "n", ["gutes Bier", "gutes Bier", "gutem Bier", "guten Bier(e)s"]); add("de", "adjs", 0, "pl", ["gute Freunde", "gute Freunde", "guten Freunden", "guter Freunde"]);
add("de", "adjs", 1, "pl", ["frische Äpfel", "frische Äpfel", "frischen Äpfeln", "frischer Äpfel"]);
const NOUN_DE = { "der Tisch": ["der Tisch", "den Tisch", "dem Tisch(e)", "des Tisch(e)s", "die Tische", "die Tische", "den Tischen", "der Tische"],
  "der Mann": ["der Mann", "den Mann", "dem Mann", "des Mann(e)s", "die Männer", "die Männer", "den Männern", "der Männer"],
  "der Junge (débil)": ["der Junge", "den Jungen", "dem Jungen", "des Jungen", "die Jungen", "die Jungen", "den Jungen", "der Jungen"],
  "der Name (mixto)": ["der Name", "den Namen", "dem Namen", "des Namens", "die Namen", "die Namen", "den Namen", "der Namen"],
  "die Frau": ["die Frau", "die Frau", "der Frau", "der Frau", "die Frauen", "die Frauen", "den Frauen", "der Frauen"],
  "die Stadt": ["die Stadt", "die Stadt", "der Stadt", "der Stadt", "die Städte", "die Städte", "den Städten", "der Städte"],
  "das Kind": ["das Kind", "das Kind", "dem Kind(e)", "des Kind(e)s", "die Kinder", "die Kinder", "den Kindern", "der Kinder"],
  "das Haus": ["das Haus", "das Haus", "dem Haus(e)", "des Hauses", "die Häuser", "die Häuser", "den Häusern", "der Häuser"],
  "das Herz (mixto)": ["das Herz", "das Herz", "dem Herzen", "des Herzens", "die Herzen", "die Herzen", "den Herzen", "der Herzen"] };
Object.keys(NOUN_DE).forEach(k => { add("de", "nom", k, "sg", NOUN_DE[k].slice(0, 4)); add("de", "nom", k, "pl", NOUN_DE[k].slice(4)); });

// ---- POLACO (filas: mianownik, dopełniacz, celownik, biernik, narzędnik, miejscownik, [wołacz])
const pl = (t, it, col, f) => add("pl", t, it, col, f.split(" "));
pl("pers", 0, "ja", "ja mnie mnie|mi mnie mną mnie"); pl("pers", 0, "ty", "ty ciebie|cię tobie|ci ciebie|cię tobą tobie");
pl("pers", 1, "on", "on jego|go jemu|mu jego|go nim nim"); pl("pers", 1, "ona", "ona jej jej ją nią niej"); pl("pers", 1, "ono", "ono jego|go jemu|mu je nim nim");
pl("pers", 2, "my", "my nas nam nas nami nas"); pl("pers", 2, "wy", "wy was wam was wami was");
pl("pers", 3, "oni", "oni ich im ich nimi nich"); pl("pers", 3, "one", "one ich im je nimi nich");
pl("ten", 0, "m", "ten tego temu ten tym tym"); pl("ten", 0, "f", "ta tej tej tę tą tej"); pl("ten", 0, "n", "to tego temu to tym tym");
pl("ten", 0, "pv", "ci tych tym tych tymi tych"); pl("ten", 0, "pn", "te tych tym te tymi tych");
pl("ten", 1, "m", "mój mojego mojemu mój moim moim"); pl("ten", 1, "f", "moja mojej mojej moją moją mojej"); pl("ten", 1, "n", "moje mojego mojemu moje moim moim");
pl("ten", 1, "pv", "moi moich moim moich moimi moich"); pl("ten", 1, "pn", "moje moich moim moje moimi moich");
const PLN = { "kot (masc. animado)": "kot kota kotu kota kotem kocie kocie | koty kotów kotom koty kotami kotach koty",
  "pies (masc. animado)": "pies psa psu psa psem psie psie | psy psów psom psy psami psach psy",
  "student (masc. persona)": "student studenta studentowi studenta studentem studencie studencie | studenci studentów studentom studentów studentami studentach studenci",
  "stół (masc. inanimado)": "stół stołu stołowi|stołu stół stołem stole stole | stoły stołów stołom stoły stołami stołach stoły",
  "dom (masc. inanimado)": "dom domu domowi|domu dom domem domu domu | domy domów domom domy domami domach domy",
  "kobieta (femenino en -a)": "kobieta kobiety kobiecie kobietę kobietą kobiecie kobieto | kobiety kobiet kobietom kobiety kobietami kobietach kobiety",
  "ulica (femenino en -a)": "ulica ulicy ulicy ulicę ulicą ulicy ulico | ulice ulic ulicom ulice ulicami ulicach ulice",
  "noc (femenino en consonante)": "noc nocy nocy noc nocą nocy nocy | noce nocy nocom noce nocami nocach noce",
  "okno (neutro en -o)": "okno okna oknu okno oknem oknie okno | okna okien oknom okna oknami oknach okna",
  "dziecko (neutro en -o)": "dziecko dziecka dziecku dziecko dzieckiem dziecku dziecko | dzieci dzieci dzieciom dzieci dziećmi dzieciach dzieci",
  "imię (neutro en -ę)": "imię imienia imieniu imię imieniem imieniu imię | imiona imion imionom imiona imionami imionach imiona" };
Object.keys(PLN).forEach(k => { const [sg, pl_] = PLN[k].split(" | "); pl("nom", k, "sg", sg); pl("nom", k, "pl", pl_); });
pl("adj", 0, "m", "nowy nowego nowemu nowy nowym nowym"); pl("adj", 0, "f", "nowa nowej nowej nową nową nowej"); pl("adj", 0, "n", "nowe nowego nowemu nowe nowym nowym");
pl("adj", 0, "pv", "nowi nowych nowym nowych nowymi nowych"); pl("adj", 0, "pn", "nowe nowych nowym nowe nowymi nowych");
pl("adj", 1, "pv", "dobrzy dobrych dobrym dobrych dobrymi dobrych"); pl("adj", 2, "pv", "tani tanich tanim tanich tanimi tanich"); pl("adj", 2, "f", "tania taniej taniej tanią tanią taniej");
pl("kto", 0, "kto", "kto kogo komu kogo kim kim"); pl("kto", 0, "co", "co czego czemu co czym czym"); pl("kto", 1, "siebie", "siebie sobie siebie|się sobą sobie");

// ---- GRIEGO (filas: nominativo, genitivo, acusativo, [vocativo])
const el = (t, it, col, f) => add("el", t, it, col, f.split(" "));
el("art", 0, "m", "ο του τον"); el("art", 0, "f", "η της την"); el("art", 0, "n", "το του το"); el("art", 0, "pm", "οι των τους"); el("art", 0, "pf", "οι των τις"); el("art", 0, "pn", "τα των τα");
el("art", 1, "m", "ένας ενός έναν|ένα"); el("art", 1, "f", "μία|μια μιας μία|μια"); el("art", 1, "n", "ένα ενός ένα");
const ELN = { "ο φίλος": "ο_φίλος του_φίλου τον_φίλο φίλε | οι_φίλοι των_φίλων τους_φίλους φίλοι", "ο πατέρας": "ο_πατέρας του_πατέρα τον_πατέρα πατέρα | οι_πατέρες των_πατέρων τους_πατέρες πατέρες",
  "ο μαθητής": "ο_μαθητής του_μαθητή τον_μαθητή μαθητή | οι_μαθητές των_μαθητών τους_μαθητές μαθητές", "η γυναίκα": "η_γυναίκα της_γυναίκας τη_γυναίκα|την_γυναίκα γυναίκα | οι_γυναίκες των_γυναικών τις_γυναίκες γυναίκες",
  "η μητέρα": "η_μητέρα της_μητέρας τη_μητέρα|την_μητέρα μητέρα | οι_μητέρες των_μητέρων τις_μητέρες μητέρες", "η πόλη": "η_πόλη της_πόλης την_πόλη πόλη | οι_πόλεις των_πόλεων τις_πόλεις πόλεις",
  "το βιβλίο": "το_βιβλίο του_βιβλίου το_βιβλίο βιβλίο | τα_βιβλία των_βιβλίων τα_βιβλία βιβλία", "το παιδί": "το_παιδί του_παιδιού το_παιδί παιδί | τα_παιδιά των_παιδιών τα_παιδιά παιδιά",
  "το όνομα": "το_όνομα του_ονόματος το_όνομα όνομα | τα_ονόματα των_ονομάτων τα_ονόματα ονόματα" };
const sp = s => s.split(" ").map(x => x.replace(/_/g, " "));
Object.keys(ELN).forEach(k => { const [sg, pl_] = ELN[k].split(" | "); add("el", "nom", k, "sg", sp(sg)); add("el", "nom", k, "pl", sp(pl_)); });
el("adj", 0, "m", "καλός καλού καλό καλέ"); el("adj", 0, "f", "καλή καλής καλή καλή"); el("adj", 0, "n", "καλό καλού καλό καλό");
el("adj", 0, "pm", "καλοί καλών καλούς καλοί"); el("adj", 0, "pf", "καλές καλών καλές καλές"); el("adj", 0, "pn", "καλά καλών καλά καλά");
el("adj", 2, "f", "ωραία ωραίας ωραία ωραία"); el("adj", 2, "m", "ωραίος ωραίου ωραίο ωραίε");
el("pers", 0, "ego", "εγώ μου εμένα με"); el("pers", 0, "esi", "εσύ σου εσένα σε"); el("pers", 1, "emis", "εμείς μας εμάς μας"); el("pers", 1, "esis", "εσείς σας εσάς σας");
el("pers", 2, "aftos", "αυτός του αυτόν τον"); el("pers", 2, "afti", "αυτή της αυτήν|αυτή την"); el("pers", 2, "afto", "αυτό του αυτό το");
el("pers", 3, "afti", "αυτοί τους αυτούς τους"); el("pers", 3, "aftes", "αυτές τους αυτές τις"); el("pers", 3, "afta", "αυτά τους αυτά τα");

// ---- FRANCÉS (filas: sujeto, directo, indirecto, tónico, reflexivo)
const fr = (t, it, col, f) => add("fr", t, it, col, f.split(" "));
fr("pers", 0, "je", "je|j' me|m' me|m' moi me|m'"); fr("pers", 0, "tu", "tu te|t' te|t' toi te|t'"); fr("pers", 0, "nous", "nous nous nous nous nous"); fr("pers", 0, "vous", "vous vous vous vous vous");
fr("pers", 1, "il", "il le|l' lui lui se|s'"); fr("pers", 1, "elle", "elle la|l' lui elle se|s'"); fr("pers", 1, "ils", "ils les leur eux se|s'"); fr("pers", 1, "elles", "elles les leur elles se|s'");
add("fr", "poss", 0, "ms", ["mon", "ton", "son", "notre", "votre", "leur"]); add("fr", "poss", 0, "fs", ["ma", "ta", "sa", "notre", "votre", "leur"]); add("fr", "poss", 0, "pl", ["mes", "tes", "ses", "nos", "vos", "leurs"]);
add("fr", "poss", 1, "fs", ["la mienne", "la tienne", "la sienne", "la nôtre", "la vôtre", "la leur"]); add("fr", "poss", 1, "mp", ["les miens", "les tiens", "les siens", "les nôtres", "les vôtres", "les leurs"]);
add("fr", "dem", 1, "ms", ["celui", "celui-ci", "celui-là"]); add("fr", "dem", 1, "fp", ["celles", "celles-ci", "celles-là"]);
add("fr", "art", 1, "le", ["au", "du"]); add("fr", "art", 1, "les", ["aux", "des"]); add("fr", "art", 1, "la", ["à la", "de la"]);
add("fr", "rel", 1, "fs", ["laquelle", "à laquelle", "de laquelle"]); add("fr", "rel", 1, "mp", ["lesquels", "auxquels", "desquels"]);

// ---- ITALIANO (filas: sujeto, directo, indirecto, tónico, reflexivo)
const it_ = (t, it, col, f) => add("it", t, it, col, f.split(" "));
it_("pers", 0, "io", "io mi|m' mi|m' me mi|m'"); it_("pers", 0, "tu", "tu ti|t' ti|t' te ti|t'"); it_("pers", 0, "noi", "noi ci ci noi ci"); it_("pers", 0, "voi", "voi vi vi voi vi");
it_("pers", 1, "lui", "lui|egli lo|l' gli lui si"); it_("pers", 1, "lei", "lei|ella la|l' le lei si"); it_("pers", 1, "lm", "loro|essi li gli loro si"); it_("pers", 1, "lf", "loro|esse le gli loro si");
add("it", "comb", 0, "lo", ["me lo", "te lo", "glielo", "ce lo", "ve lo"]); add("it", "comb", 0, "ne", ["me ne", "te ne", "gliene", "ce ne", "ve ne"]); add("it", "comb", 0, "la", ["me la", "te la", "gliela", "ce la", "ve la"]);
add("it", "poss", 0, "mp", ["miei", "tuoi", "suoi", "nostri", "vostri", "loro"]); add("it", "poss", 0, "fp", ["mie", "tue", "sue", "nostre", "vostre", "loro"]); add("it", "poss", 0, "fs", ["mia", "tua", "sua", "nostra", "vostra", "loro"]);
add("it", "art", 2, "il", ["del", "al", "dal", "nel", "sul"]); add("it", "art", 2, "gli", ["degli", "agli", "dagli", "negli", "sugli"]); add("it", "art", 2, "le", ["delle", "alle", "dalle", "nelle", "sulle"]);
add("it", "art", 2, "lo", ["dello", "allo", "dallo", "nello", "sullo"]); add("it", "art", 2, "lp", ["dell'", "all'", "dall'", "nell'", "sull'"]);

// ---- PORTUGUÉS (filas: sujeto, directo, indirecto, tónico, com, reflexivo)
const pt = (t, it, col, f) => add("pt", t, it, col, f.split(" ").map(x => x.replace(/_/g, " ")));
pt("pers", 0, "eu", "eu me me mim comigo me"); pt("pers", 0, "tu", "tu te te ti contigo te"); pt("pers", 0, "nos", "nós nos nos nós connosco|conosco nos");
pt("pers", 1, "ele", "ele o lhe ele com_ele se"); pt("pers", 1, "ela", "ela a lhe ela com_ela se"); pt("pers", 1, "voce", "você o|a lhe você com_você se");
pt("pers", 2, "eles", "eles os lhes eles com_eles se"); pt("pers", 2, "elas", "elas as lhes elas com_elas se"); pt("pers", 2, "voces", "vocês os|as lhes vocês com_vocês se");
add("pt", "poss", 0, "fs", ["minha", "tua", "sua", "nossa", "vossa"]); add("pt", "poss", 0, "mp", ["meus", "teus", "seus", "nossos", "vossos"]);
add("pt", "art", 1, "o", ["do", "no", "ao", "pelo"]); add("pt", "art", 1, "a", ["da", "na", "à", "pela"]); add("pt", "art", 1, "os", ["dos", "nos", "aos", "pelos"]); add("pt", "art", 1, "as", ["das", "nas", "às", "pelas"]);

// ---- CATALÁN (filas: sujeto, directo, indirecto, fuerte)
const ca = (t, it, col, f) => add("ca", t, it, col, f.split(" "));
ca("pers", 0, "jo", "jo em|m' em|m' mi"); ca("pers", 0, "tu", "tu et|t' et|t' tu"); ca("pers", 0, "nosaltres", "nosaltres ens ens nosaltres"); ca("pers", 0, "vosaltres", "vosaltres us us vosaltres");
ca("pers", 1, "ell", "ell el|l' li ell"); ca("pers", 1, "ella", "ella la|l' li ella"); ca("pers", 1, "ells", "ells els els ells"); ca("pers", 1, "elles", "elles les els elles");
add("ca", "poss", 0, "fs", ["meva", "teva", "seva", "nostra", "vostra"]); add("ca", "poss", 0, "fp", ["meves", "teves", "seves", "nostres", "vostres"]);
add("ca", "art", 1, "el", ["al", "del", "pel"]); add("ca", "art", 1, "els", ["als", "dels", "pels"]); add("ca", "art", 1, "les", ["a les", "de les", "per les"]); add("ca", "art", 1, "lp", ["a l'", "de l'", "per l'"]);

// ---- INGLÉS (filas: sujeto, objeto, adjetivo posesivo, pronombre posesivo, reflexivo)
const en = (t, it, col, f) => add("en", t, it, col, f.split(" "));
en("pers", 0, "i", "I me my mine myself"); en("pers", 0, "you", "you you your yours yourself"); en("pers", 0, "he", "he him his his himself"); en("pers", 0, "she", "she her her hers herself"); en("pers", 0, "it", "it it its — itself");
en("pers", 1, "we", "we us our ours ourselves"); en("pers", 1, "you", "you you your yours yourselves"); en("pers", 1, "they", "they them their theirs themselves");
en("who", 0, "p", "who whom|who whose"); add("en", "dem", 0, "sg", ["this", "that"]); add("en", "dem", 0, "pl", ["these", "those"]);

module.exports = { GOLD: G };

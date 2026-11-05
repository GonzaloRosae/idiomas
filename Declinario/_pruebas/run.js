// Pruebas automáticas de Declinario. Uso: node run.js [texto]   (con «texto» solo se ejecutan las pruebas cuyo nombre lo contenga)
// Abren la app en un Chromium real, bloquean internet y comparan las tablas con una lista de formas de referencia (formas.js), escrita aparte.
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const { GOLD } = require("./formas.js");
const { FRASES } = require("./frases.js");

const ROOT = process.env.DL_ROOT ? path.resolve(process.env.DL_ROOT) : path.join(__dirname, ".."); // DL_ROOT: probar otra copia de la carpeta Declinario
const TYPES = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
let server, BASE = "", browser, PORT = 0;
const start = () => new Promise((res) => {
  server = http.createServer((req, rs) => {
    const p = decodeURIComponent(req.url.split("?")[0].split("#")[0]);
    const f = path.normalize(path.join(ROOT, p === "/" ? "index.html" : p));
    if (!f.startsWith(ROOT) || f.includes("_pruebas") || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); rs.end("no"); return; }
    rs.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-store" }); fs.createReadStream(f).pipe(rs);
  }).listen(PORT, "127.0.0.1", () => { PORT = server.address().port; BASE = "http://127.0.0.1:" + PORT + "/"; res(); });
});

const T = []; let passes = 0, fails = 0, ctxs = [];
function test(name, fn) { T.push({ name, fn }); }
function ok(c, m) { if (c) { passes++; console.log("   OK    " + m); } else { fails++; console.log("   FALLA " + m); } }
function eq(a, b, m) { const same = JSON.stringify(a) === JSON.stringify(b); ok(same, m + (same ? "" : "   [obtenido " + JSON.stringify(a) + " · esperado " + JSON.stringify(b) + "]")); }
const noErrors = (p) => ok(p.errs.length === 0, "sin errores de JavaScript" + (p.errs.length ? ": " + p.errs : ""));
async function open(lang, o = {}) {
  const ctx = await browser.newContext({ viewport: o.viewport || { width: 1000, height: 1000 } }); ctxs.push(ctx);
  await ctx.route((u) => !u.href.startsWith(BASE), (r) => r.abort());
  const page = await ctx.newPage(); page.errs = []; page.on("pageerror", (e) => page.errs.push(String(e)));
  await page.goto(BASE + "index.html" + (lang ? "#" + lang : "")); await page.waitForFunction(() => window.__booted === true);
  return page;
}
// Abrir una de las tres webs directamente desde el disco (file://): así aparece el desplegable de webs, que por http se oculta
// porque las rutas relativas entre carpetas no valdrían. Internet sigue bloqueado.
const REPO = path.resolve(ROOT, "..");
async function openFile(rel, o = {}) {
  const ctx = await browser.newContext({ viewport: o.viewport || { width: 1000, height: 900 } }); ctxs.push(ctx);
  await ctx.route((u) => /^https?:/.test(u.href), (r) => r.abort());
  const page = await ctx.newPage(); page.errs = []; page.on("pageerror", (e) => page.errs.push(String(e)));
  await page.goto("file://" + path.join(REPO, rel)); await page.waitForSelector(".appchip");
  return page;
}
const txt = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();
const topic = (p, id, mode) => p.evaluate(([i, m]) => { state.topic[state.lang] = i; state.mode = m || "table"; setTab("practice"); renderSubtabs(); newExercise(); }, [id, mode]);
const same = (a, b) => JSON.stringify([...new Set(a)].sort()) === JSON.stringify([...new Set(b)].sort());

// =====================================================================================================================
// DATOS
// =====================================================================================================================
test("Compatibilidad · el código no usa nada que exija un Safari posterior a 15.4", async () => {
  // Lo que Safari no entiende no «falla bien»: una expresión regular con lookbehind en un Safari anterior a 16.4 deja la página entera en blanco
  const src = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const prohibido = [
    ["lookbehind en expresiones regulares (Safari 16.4)", /\(\?<[=!]/], ["toSorted / toReversed / toSpliced (Safari 16)", /\.(toSorted|toReversed|toSpliced)\(/],
    ["Object.groupBy / Map.groupBy (Safari 17.4)", /\b(Object|Map)\.groupBy\(/], ["Promise.withResolvers (Safari 17.4)", /Promise\.withResolvers/], ["Array.fromAsync (Safari 16.4)", /Array\.fromAsync/],
    ["AbortSignal.timeout (Safari 16)", /AbortSignal\.timeout/], ["@container (Safari 16)", /@container\b/], ["color-mix() (Safari 16.2)", /color-mix\(/], ["@property (Safari 16.4)", /@property\b/], ["subgrid (Safari 16)", /\bsubgrid\b/]];
  const hallados = prohibido.filter(([, re]) => re.test(src)).map(([n]) => n);
  eq(hallados, [], "ni sintaxis ni funciones posteriores a Safari 15.4");
});

test("Datos · las tablas son coherentes y no falta ningún idioma", async () => {
  const p = await open();
  eq(await p.evaluate(() => validateData()), [], "sin ningún problema de estructura (filas, columnas, celdas, frases y sustantivos)");
  eq(await p.evaluate(() => Object.fromEntries(LANG_ORDER.map((c) => [c, LANGS[c].topics.length]))), { fr: 5, it: 5, pt: 4, ca: 4, pl: 5, en: 3, de: 9, el: 4 }, "temas por idioma");
  const n = await p.evaluate(() => LANG_ORDER.reduce((s, c) => s + allCells(c).length, 0));
  ok(n > 1400, n + " formas en total");
  eq(await p.evaluate(() => LANG_ORDER.every((c) => LANGS[c].topics.every((t) => t.use.length > 30 && t.tips.length > 0))), true, "todos los temas tienen explicación y consejos");
  noErrors(p);
});

test("Datos · coinciden con las formas de referencia", async () => {
  const p = await open();
  const r = await p.evaluate((gold) => {
    const out = { ok: 0, bad: [] };
    for (const [code, tid, itRef, col, forms] of gold) {
      const t = LANGS[code].topics.find((x) => x.id === tid); if (!t) { out.bad.push(code + "/" + tid + ": no existe el tema"); continue; }
      const it = typeof itRef === "number" ? t.items[itRef] : t.items.find((x) => x.title === itRef);
      if (!it) { out.bad.push(code + "/" + tid + "/" + itRef + ": no existe la tabla"); continue; }
      if (!it.cols.some((c) => c.k === col)) { out.bad.push(code + "/" + tid + "/" + it.title + ": no existe la columna " + col); continue; }
      if (forms.length !== it.rows.length) { out.bad.push(code + "/" + tid + "/" + it.title + "/" + col + ": la referencia tiene " + forms.length + " filas y la tabla " + it.rows.length); continue; }
      it.rows.forEach((row, i) => {
        const got = it.cells[row.k][col];
        if (JSON.stringify([...new Set(variants(got))].sort()) === JSON.stringify([...new Set(variants(forms[i]))].sort())) out.ok++;
        else out.bad.push(code + "/" + tid + "/" + it.title + " " + row.k + "/" + col + ": la app dice «" + got + "», la referencia «" + forms[i] + "»");
      });
    }
    return out;
  }, GOLD);
  ok(r.ok > 1100 && r.bad.length === 0, r.ok + " formas coinciden" + (r.bad.length ? " · " + r.bad.length + " discrepancias" : ""));
  r.bad.slice(0, 10).forEach((x) => console.log("      ✗ " + x));
  noErrors(p);
});

test("Datos · cada forma se acepta a sí misma, con sus alternativas, y sin acentos donde no son obligatorios", async () => {
  const p = await open();
  const r = await p.evaluate(() => {
    const out = { n: 0, bad: [], sinAcento: 0 };
    for (const code of LANG_ORDER) {
      state.lang = code;
      for (const cell of allCells(code)) {
        for (const v of variants(cell)) {
          out.n++;
          if (!matches(v, cell)) out.bad.push(code + ": «" + v + "» no se acepta a sí misma");
          if (!matches(v.toUpperCase() + " ", cell)) out.bad.push(code + ": «" + v + "» en mayúsculas");
          const lax = stripAcc(normBase(v));
          if (lax !== normBase(v) && !ambKeys(code).has(lax)) { out.sinAcento++; if (!matches(lax, cell)) out.bad.push(code + ": «" + lax + "» sin acentos debería valer para «" + v + "»"); else if (accentFix(lax, cell) !== v && !variants(cell).some((x) => normBase(x) === normBase(accentFix(lax, cell) || ""))) out.bad.push(code + ": sin aviso de acento para «" + lax + "»"); }
        }
      }
    }
    state.lang = null;
    return out;
  });
  ok(r.n > 1500 && r.bad.length === 0, r.n + " formas probadas (" + r.sinAcento + " sin acentos)" + (r.bad.length ? " · fallos: " + r.bad.slice(0, 5).join(" | ") : ""));
  noErrors(p);
});

test("Acentos · obligatorios donde distinguen formas, opcionales en el resto", async () => {
  const p = await open();
  const casos = [["pl", "ta", "ta", true], ["pl", "tą", "ta", false], ["pl", "ta", "tą", false], ["pl", "tą", "tą", true], ["pl", "te", "tę", false], ["pl", "tę", "tę", true],
    ["pl", "stolu", "stołu", true], ["pl", "stołu", "stołu", true], ["pl", "kobiete", "kobietę", true], ["pl", "dziecmi", "dziećmi", true],
    ["el", "ο φιλος", "ο φίλος", true], ["el", "του φιλου", "του φίλου", true], ["el", "τους φιλους", "τους φίλους", true],
    ["de", "den Mann", "den Mann", true], ["de", "die manner", "die Männer", true], ["de", "des Manns", "des Mann(e)s", true], ["de", "des Mannes", "des Mann(e)s", true], ["de", "des Mann", "des Mann(e)s", false],
    ["de", "dem Tisch", "dem Tisch(e)", true], ["de", "dem Tische", "dem Tisch(e)", true], ["de", "Strasse", "Straße", true],
    ["fr", "m'", "me|m'", true], ["fr", "m’", "me|m'", true], ["fr", "l'", "le|l'", true], ["fr", "à l'", "à l'", true], ["fr", "a l'", "à l'", true],
    ["it", "dell'", "dell'", true], ["pt", "conosco", "connosco|conosco", true], ["pt", "a", "à", false], ["pt", "à", "à", true], ["pt", "nos", "nós", false], ["ca", "a l'", "a l'", true], ["en", "Mine", "mine", true], ["en", "its", "its", true]];
  const r = await p.evaluate((cs) => cs.map(([code, typed, ans, want]) => { state.lang = code; return [code + " «" + typed + "» para «" + ans + "»", matches(typed, ans) === want]; }), casos);
  r.forEach(([m, good]) => ok(good, m + (good ? "" : " → resultado contrario al esperado")));
  eq(await p.evaluate(() => Object.fromEntries(LANG_ORDER.map((c) => [c, ambKeys(c).size > 0]))), { fr: false, it: false, pt: true, ca: false, pl: true, en: false, de: false, el: true }, "idiomas con formas que solo se distinguen por el acento (en griego, solo μία / μια, que son alternativas)");
  noErrors(p);
});

test("Frases · todas tienen su hueco y piden una respuesta que se acepta, con cada uno de sus sustantivos", async () => {
  const p = await open();
  const r = await p.evaluate(() => {
    const out = { n: 0, bad: [], v1: 0, nv: 0, frases: 0 };
    for (const code of LANG_ORDER) {
      state.lang = code;
      for (const t of LANGS[code].topics) for (const ch of gapChoices(t, code)) for (const fr of ch.frames) for (const noun of (ch.nouns.length ? ch.nouns : [null])) {
        out.n++;
        const tx = frameText(fr);
        if (tx.split("{}").length !== 2) out.bad.push(code + ": «" + tx + "» sin hueco único");
        if (/\{n\}/.test(tx) !== !!noun && /\{n\}/.test(tx)) out.bad.push(code + ": «" + tx + "» pide sustantivo y no hay");
        const cur = { topic: t, item: ch.item, row: ch.row, col: ch.col, cell: ch.cell, frame: fr, noun };
        const done = frameText2(cur);
        if (/[\[\]]|\{[na]\}/.test(done) || done.split("{}").length !== 2 || / {2}/.test(done)) out.bad.push(code + "/" + t.id + ": la frase queda mal armada «" + done + "»");
        const ans = frameAnswer(ch.cell, fr, noun);
        if (!matches(fillOf(ans), ans)) out.bad.push(code + ": «" + ans + "» no se acepta");
        if (typeof fr === "object" && fr.v === 1 && variants(ch.cell).length > 1) { out.v1++; if (ans !== variants(ch.cell)[1]) out.bad.push(code + ": la frase con elisión debería pedir «" + variants(ch.cell)[1] + "» y pide «" + ans + "»"); }
        if (typeof fr === "object" && fr.v === 0 && ans !== variants(ch.cell)[0]) out.bad.push(code + ": la frase sin elisión pide «" + ans + "»");
        if (noun && typeof noun.v === "number") { out.nv++; if (ans !== variants(ch.cell)[Math.min(noun.v, variants(ch.cell).length - 1)]) out.bad.push(code + "/" + t.id + ": el sustantivo «" + noun.t + "» pide otra variante"); }
      }
    }
    state.lang = null;
    return out;
  });
  ok(r.n > 2500 && r.bad.length === 0, r.n + " combinaciones de frase, sustantivo y respuesta · " + r.v1 + " con elisión en la frase · " + r.nv + " con elisión fijada por el sustantivo" + (r.bad.length ? " · fallos: " + r.bad.slice(0, 4).join(" | ") : ""));
  noErrors(p);
});

test("Frases · las oraciones completas coinciden con la lista de referencia (escrita aparte)", async () => {
  const p = await open();
  const r = await p.evaluate((lista) => {
    const out = { ok: 0, bad: [] };
    for (const [code, tid, ii, rk, ck, fi, noun, want] of lista) {
      state.lang = code;
      const t = LANGS[code].topics.find((x) => x.id === tid), it = t && t.items[ii];
      const ch = it && gapChoices(t, code).find((c) => c.item === it && c.row.k === rk && c.col.k === ck);
      if (!ch) { out.bad.push(code + "/" + tid + "/" + ii + " " + rk + "/" + ck + ": no hay hueco"); continue; }
      const fr = ch.frames[fi], nn = noun === null ? null : ch.nouns.find((n) => n.t === noun);
      if (!fr || (noun !== null && !nn)) { out.bad.push(code + "/" + tid + " " + rk + "/" + ck + ": no existe " + (fr ? "el sustantivo «" + noun + "»" : "la frase " + fi)); continue; }
      const cur = { topic: t, item: it, row: ch.row, col: ch.col, cell: ch.cell, frame: fr, noun: nn };
      const got = fillSentence(cur, fillOf(frameAnswer(ch.cell, fr, nn)));
      if (got === want) out.ok++; else out.bad.push(code + "/" + tid + " " + rk + "/" + ck + ": la web arma «" + got + "» y la referencia dice «" + want + "»");
    }
    state.lang = null;
    return out;
  }, FRASES);
  ok(r.ok === FRASES.length && r.bad.length === 0, r.ok + " de " + FRASES.length + " oraciones de referencia coinciden" + (r.bad.length ? " · " + r.bad.length + " discrepancias" : ""));
  r.bad.slice(0, 10).forEach((x) => console.log("      ✗ " + x));
  noErrors(p);
});

test("Frases · sustantivos básicos: al menos dos por casilla y el mismo número de masculinos, femeninos y neutros", async () => {
  const p = await open();
  const r = await p.evaluate(() => {
    const out = { listas: 0, bad: [], grupos: 0 };
    const PARES = [["m", "f", "n"], ["ms", "fs"], ["mp", "fp"], ["pm", "pf", "pn"], ["pv", "pn"], ["cm", "cf"], ["vm", "vf"], ["p", "c"]];
    const cuenta = (v) => Array.isArray(v) ? v.length : (v && typeof v === "object" && v.t === undefined ? Object.fromEntries(Object.keys(v).map((k) => [k, cuenta(v[k])])) : 1);
    for (const code of LANG_ORDER) for (const t of LANGS[code].topics) {
      const fuentes = [t.nouns, ...t.items.map((it) => it.nouns)].filter(Boolean);
      for (const src of fuentes) {
        // cada lista (o cada lista de un mapa por caso) tiene 2 o más sustantivos
        const mira = (v, ruta) => {
          if (Array.isArray(v)) { out.listas++; if (v.length < 2) out.bad.push(code + "/" + t.id + " " + ruta + ": solo " + v.length + " sustantivo"); }
          else if (v && typeof v === "object" && v.t === undefined) Object.keys(v).forEach((k) => mira(v[k], ruta + "." + k));
        };
        Object.keys(src).forEach((k) => mira(src[k], k));
        for (const par of PARES) {
          const ks = par.filter((k) => src[k] !== undefined);
          if (ks.length < 2 || ks.length !== par.length) continue;
          out.grupos++;
          const ls = ks.map((k) => JSON.stringify(cuenta(src[k])));
          if (new Set(ls).size !== 1) out.bad.push(code + "/" + t.id + ": " + ks.join("/") + " no están equilibrados (" + ls.join(" · ") + ")");
        }
      }
    }
    return out;
  });
  ok(r.listas > 100 && r.grupos > 20 && r.bad.length === 0, r.listas + " listas de sustantivos · " + r.grupos + " grupos de género/número equilibrados" + (r.bad.length ? " · fallos: " + r.bad.slice(0, 4).join(" | ") : ""));
  noErrors(p);
});

test("Frases · las alternancias [singular|plural], el artículo {a} y la validación de los datos", async () => {
  const p = await open();
  const r = await p.evaluate(() => {
    const mk = (frame, noun, row, col, pl) => ({ frame, noun, row: { k: row }, col: { k: col }, item: { pl }, topic: {} });
    const a = frameText2(mk("Das [ist|sind] {n}, {} dort [steht|stehen].", { t: "der Mann" }, "nom", "m", ["pl"]));
    const b = frameText2(mk("Das [ist|sind] {n}, {} dort [steht|stehen].", { t: "die Kinder" }, "nom", "pl", ["pl"]));
    const c = frameText2(mk("Βλέπω {a} {} {n}.", { t: "φίλο", a: "" }, "acc", "m", []));
    const d = frameText2(mk("Βλέπω {a} {} {n}.", { t: "φίλο", a: "τον" }, "acc", "m", []));
    const e = frameText2(mk("{n} [est|sont] à moi : [c'est|ce sont] {}.", { t: "Ces sacs" }, "p1", "mp", ["mp"]));
    const f = frameText2(mk("C'[est|sont] {} {n}.", { t: "ami" }, "pl", "ms", ["pl"]));   // la fila «pl» también cuenta como plural
    // la validación detecta los fallos de datos
    const t0 = LANGS.de.topics.length, malos = [];
    const base = LANGS.de.topics.find((x) => x.id === "artdef");
    const prueba = (nombre, mod) => {
      const copia = Object.assign({}, base, { id: "zz" + malos.length }, mod(base));
      LANGS.de.topics.push(copia);
      const v = validateData().filter((x) => x.indexOf("de/zz") === 0 || x.indexOf("de: la frase") === 0);
      LANGS.de.topics.pop();
      malos.push([nombre, v.length]);
    };
    prueba("falta sustantivo", (b) => ({ nouns: { m: ["Mann"] } }));
    prueba("clave de plural inexistente", (b) => ({ pl: ["zzz"] }));
    prueba("frase sin hueco", () => ({ items: [Object.assign({}, base.items[0], { frames: { nom: ["Hola {n}"] } })] }));
    prueba("llave desconocida", () => ({ items: [Object.assign({}, base.items[0], { frames: { nom: ["Hola {x} {}"] } })] }));
    prueba("alternancia mal formada", () => ({ items: [Object.assign({}, base.items[0], { frames: { nom: ["Hola [a] {} {n}"] } })] }));
    prueba("frase para una fila inexistente", () => ({ items: [Object.assign({}, base.items[0], { frames: { zzz: ["Hola {} {n}"] } })] }));
    prueba("falta artículo {a}", () => ({ items: [Object.assign({}, base.items[0], { frames: { nom: ["Hola {a} {} {n}"] } })] }));
    prueba("clave de fila y columna repetida", () => ({ items: [Object.assign({}, base.items[0], { rows: [{ k: "m", label: "x" }], cols: [{ k: "m", label: "y" }], cells: { m: { m: "der" } }, nouns: { m: ["Mann", "Hund"] }, frames: { m: ["Hola {} {n}"] } })] }));
    return { a, b, c, d, e, f, malos, t0: t0 === LANGS.de.topics.length };
  });
  eq([r.a, r.b], ["Das ist der Mann, {} dort steht.", "Das sind die Kinder, {} dort stehen."], "[ist|sind] y [steht|stehen] siguen el plural de la columna");
  eq([r.c, r.d], ["Βλέπω {} φίλο.", "Βλέπω τον {} φίλο."], "{a} pone el artículo del sustantivo y, si no hay, no deja espacios de más");
  eq(r.e, "Ces sacs sont à moi : ce sont {}.", "la clave del plural puede estar en la fila o en la columna");
  eq(r.f, "C'sont {} ami.", "…y también cuando la clave de plural es la de una fila (it/dem «pl»)");
  eq(r.malos.map(([n, k]) => [n, k > 0]), r.malos.map(([n]) => [n, true]), "la validación de datos detecta: " + r.malos.map(([n]) => n).join(", "));
  ok(r.t0, "y la prueba no deja temas de más");
  noErrors(p);
});

test("Frases · sin etiqueta que delate la respuesta: «noRow» y las pistas de cada tabla", async () => {
  const p = await open("it"); await topic(p, "art", "gap");
  const cur = await p.evaluate(() => { const t = curTopic(); const ch = gapChoices(t).find((c) => c.item === t.items[0] && c.row.k === "sm"); state.current = gapQuestion(t, ch); renderPractice(); return { ans: fillOf(frameAnswer(state.current.cell, state.current.frame, state.current.noun)) }; });
  eq(await txt(p.locator("#panelPractice .eyebrow")), "RELLENA EL HUECO", "en el artículo italiano el título no enseña la fila (llevaría el ejemplo «lo studente»)".toUpperCase());
  eq(await p.locator(".hintchip").count(), 0, "ni hay etiqueta de columna");
  ok(/Prendo ___? ?(zaino|studio)\./.test((await txt(p.locator(".sentence"))).replace(/\s+/g, " ")) || /Prendo\s+(zaino|studio)/.test(await txt(p.locator(".sentence"))), "la frase lleva el sustantivo que decide el artículo: «" + await txt(p.locator(".sentence")) + "»");
  await p.fill("#panelPractice input.ans", cur.ans); await p.keyboard.press("Enter"); ok(await p.locator(".banner.good").count() === 1, "«" + cur.ans + "» es la respuesta");
  // las pistas con la etiqueta de la columna se sustituyen cuando la etiqueta sería la respuesta
  const q = await open("pl"); await topic(q, "kto", "gap");
  await q.evaluate(() => { const t = curTopic(); const ch = gapChoices(t).find((c) => c.item === t.items[0] && c.row.k === "nom" && c.col.k === "kto"); state.current = gapQuestion(t, ch); renderPractice(); });
  eq(await txt(q.locator(".hintchip")), "Personas", "kto/co: la pista dice «Personas» y no «kto (personas)»");
  const d = await open("de"); await topic(d, "rel", "gap");
  await d.evaluate(() => { const t = curTopic(); const ch = gapChoices(t).find((c) => c.item === t.items[2] && c.row.k === "akk" && c.col.k === "du"); state.current = gapQuestion(t, ch); renderPractice(); });
  eq(await d.locator(".hintchip").count(), 0, "en el reflexivo alemán el sujeto ya está en la frase: no hay etiqueta");
  noErrors(p); noErrors(q); noErrors(d);
});

test("Reconoce la función · las opciones del italiano no llevan el ejemplo que delata la respuesta", async () => {
  const p = await open("it"); await topic(p, "art", "recog");
  const r = await p.evaluate(() => { const t = curTopic(); const cell = recogCells(t).find((c) => c.item === t.items[0] && c.row.k === "vm"); state.current = Object.assign(recogOf(t, cell), { retry: false }); renderPractice(); return null; });
  const opts = await p.locator("#panelPractice .optbtn").allInnerTexts();
  ok(opts.length === 8 && opts.every((o) => !/[()]/.test(o)) && opts.includes("masc. sg. + vocal"), "ocho opciones, sin paréntesis: " + opts.slice(0, 3).join(" | ") + "…");
  await p.click('#panelPractice .optbtn[data-row="vm"]');
  ok(/quell|l'/.test(await txt(p.locator("#recogfb"))) || /Correcto/.test(await txt(p.locator("#recogfb"))), "tras contestar, el comentario sí enseña el nombre completo: «" + await txt(p.locator("#recogfb")) + "»");
  // en las demás webs los nombres de fila no se tocan (llevan el poseedor entre paréntesis)
  const q = await open("fr"); await topic(q, "poss", "recog");
  ok((await q.locator("#panelPractice .optbtn").allInnerTexts()).some((o) => /\(/.test(o)), "francés: «je (yo)» y compañía se conservan");
  noErrors(p); noErrors(q);
});

// =====================================================================================================================
// NAVEGACIÓN
// =====================================================================================================================
test("Inicio · ocho idiomas, cada uno con sus temas, y la dirección #xx abre uno directamente", async () => {
  const p = await open();
  eq(await p.locator(".choice").evaluateAll((b) => b.map((x) => x.dataset.lang)), ["fr", "it", "pt", "ca", "pl", "en", "de", "el"], "los ocho idiomas, en orden");
  ok(/^★ 0 de 9 temas$/.test(await txt(p.locator('.choice[data-lang="de"] .cstar'))), "alemán: «★ 0 de 9 temas» (ninguno dorado todavía)");
  await p.click('.choice[data-lang="pl"]');
  eq(await p.evaluate(() => [state.lang, location.hash, document.getElementById("eyebrow").textContent, document.title]), ["pl", "#pl", "Declinación · Polaco", "Declinario · Polaco"], "se abre el idioma, con la dirección y el título");
  eq(await p.locator("#subtabs .chip").allInnerTexts(), ["Pronombres personales", "ten y mój (determinantes)", "Sustantivos", "Adjetivos", "kto, co y siebie"], "los temas de polaco");
  const q = await open("el"); eq(await q.evaluate(() => state.lang), "el", "abrir con #el entra en griego");
  await q.click("#brandBtn"); ok(await q.locator("#welcome").isVisible() && await q.locator("#langWrap").isHidden(), "el nombre de la web vuelve al inicio");
  noErrors(p); noErrors(q);
});

test("Idioma · la lista despliega los 8 y se cambia ahí mismo; la ayuda se abre y se cierra", async () => {
  const p = await open("fr");
  await p.click("#langChip"); eq(await p.locator(".langopt").count(), 8, "ocho idiomas en la lista");
  await p.click('.langopt[data-lang="de"]');
  eq(await p.evaluate(() => [state.lang, location.hash, document.getElementById("welcome").hidden]), ["de", "#de", true], "se cambia sin pasar por el inicio");
  await p.click("#langChip"); await p.keyboard.press("Escape"); ok(await p.locator("#langMenu").isHidden(), "Escape cierra la lista");
  await p.click("#infoBtn"); const h = await txt(p.locator("#infoOverlay"));
  ok(/Cómo funciona Declinario/.test(h) && /Alemán, polaco y griego/.test(h) && /Test final y temas dorados/.test(h) && /80 %/.test(h) && /Todavía no hay nada guardado en este navegador/.test(h) && /compruébala en una gramática/.test(h), "la ayuda explica qué hay en cada idioma, el test final y el dorado, que todavía no hay nada guardado y avisa de las erratas");
  await p.keyboard.press("Escape"); ok(await p.locator("#infoOverlay").count() === 0, "Escape cierra la ayuda");
  eq(await p.evaluate(() => { const b = document.getElementById("infoBtn"); return [b.previousElementSibling.id, b.nextElementSibling]; }), ["themeBtn", null], "el botón de ayuda va tras el del tema, como en las otras webs");
  await p.click("#themeBtn"); ok(await p.evaluate(() => document.documentElement.getAttribute("data-theme") === "dark" && localStorage.getItem("idiomas:theme") === "dark"), "el tema oscuro se comparte con las otras webs");
  noErrors(p);
});

// =====================================================================================================================
// TEORÍA Y PRÁCTICA
// =====================================================================================================================
test("Teoría · cada tema dibuja sus tablas con las filas y columnas de los datos", async () => {
  const p = await open();
  const r = await p.evaluate(() => {
    const out = { temas: 0, tablas: 0, bad: [] };
    for (const code of LANG_ORDER) {
      chooseLang(code);
      for (const t of LANGS[code].topics) {
        state.topic[code] = t.id; setTab("theory"); renderSubtabs(); out.temas++;
        const tables = document.querySelectorAll("#panelTheory table.dtable");
        if (tables.length !== t.items.length) out.bad.push(code + "/" + t.id + ": " + tables.length + " tablas en vez de " + t.items.length);
        t.items.forEach((it, k) => {
          const tb = tables[k]; out.tablas++;
          const rows = tb.querySelectorAll("tr"), cols = rows[0].querySelectorAll("th").length - 1;
          if (rows.length - 1 !== it.rows.length || cols !== it.cols.length) out.bad.push(code + "/" + t.id + "/" + it.title + ": " + (rows.length - 1) + "×" + cols + " en vez de " + it.rows.length + "×" + it.cols.length);
          const dash = [...tb.querySelectorAll("td")].filter((x) => x.innerText === "—").length, dashData = it.rows.reduce((n, r) => n + it.cols.filter((c) => it.cells[r.k][c.k] === "—").length, 0);
          if (dash !== dashData) out.bad.push(code + "/" + t.id + "/" + it.title + ": casillas «—» " + dash + " en vez de " + dashData);
        });
        if (document.querySelectorAll("#panelTheory .tip li").length !== t.tips.length) out.bad.push(code + "/" + t.id + ": consejos");
      }
    }
    return out;
  });
  ok(r.temas === 39 && r.tablas > 50 && r.bad.length === 0, r.temas + " temas y " + r.tablas + " tablas" + (r.bad.length ? " · " + r.bad.slice(0, 4).join(" | ") : ""));
  const q = await open("de"); await q.evaluate(() => { state.topic.de = "nom"; renderTheory(); });
  const body = (pg) => pg.evaluate(() => document.getElementById("panelTheory").textContent.replace(/\s+/g, " "));
  ok(/dem Tisch\(e\)/.test(await body(q)) && /des Mann\(e\)s/.test(await body(q)), "las letras opcionales se ven entre paréntesis");
  const w = await open("pl"); await w.evaluate(() => { state.topic.pl = "pers"; renderTheory(); });
  ok(/jego \/ go/.test(await body(w)) && /ciebie \/ cię/.test(await body(w)), "las alternativas se separan con «/»: «jego / go»");
  noErrors(p); noErrors(q); noErrors(w);
});

test("Tabla completa · se rellena entera, se corrige casilla a casilla y se puede ver la solución", async () => {
  const p = await open("de"); await topic(p, "artdef");
  const fill = (vals) => p.evaluate((vs) => { document.querySelectorAll("#panelPractice input.ans").forEach((i, k) => { i.value = vs ? vs[k] : i.dataset.answer.split("|")[0]; }); }, vals);
  eq(await p.locator("#panelPractice input.ans").count(), 16, "el artículo tiene 16 casillas (4 casos × 4 columnas)");
  await fill(); await p.click("#panelPractice .btn.primary");
  ok(await p.locator(".banner.good").count() === 1 && /Tabla completa/.test(await txt(p.locator("#banner"))), "todo bien → «¡Tabla completa!»");
  await fill(); await p.evaluate(() => { const i = document.querySelectorAll("#panelPractice input.ans"); i[0].value = "die"; i[5].value = ""; });
  await p.click("#panelPractice .btn.primary");
  eq(await p.locator("input.ans.bad").count(), 2, "dos casillas mal (una equivocada y otra vacía)");
  ok(/→ der/.test(await txt(p.locator(".dg.cell").first())), "debajo de la mala sale la forma correcta");
  ok(await p.locator("#explainbox").isVisible() && /Nominativo/.test(await txt(p.locator("#explainbox"))), "y una explicación");
  await p.click("#panelPractice .btn:not(.primary):not(.sky)");
  ok(await p.locator("input.ans.ok").count() === 16 && await p.locator(".banner.good").count() === 1, "«Ver solución» rellena todas");
  // con letras opcionales («dem Tisch(e)») la solución también se escribe bien
  await topic(p, "nom"); await p.evaluate(() => { const tp = curTopic(); state.current = { kind: "table", topic: tp, item: tp.items[0] }; renderPractice(); }); await p.click("#panelPractice .btn:not(.primary):not(.sky)"); await p.click("#panelPractice .btn.primary");
  ok(await p.locator("input.ans.bad").count() === 0 && await p.locator(".banner.good").count() === 1, "la solución de una tabla con letras opcionales (dem Tisch(e)) se acepta");
  // Intro pasa a la casilla siguiente y en la última comprueba
  await topic(p, "pers"); await p.locator("#panelPractice input.ans").first().focus(); await p.keyboard.press("Enter");
  ok(await p.evaluate(() => document.activeElement === document.querySelectorAll("#panelPractice input.ans")[1]), "Intro salta a la casilla siguiente");
  await p.evaluate(() => { document.querySelectorAll("#panelPractice input.ans")[document.querySelectorAll("#panelPractice input.ans").length - 1].focus(); }); await p.keyboard.press("Enter");
  ok(await p.locator(".banner.show").count() === 1, "y en la última comprueba");
  // «—» no es una casilla
  await topic(p, "artindef"); await p.evaluate(() => { const tp = curTopic(); state.current = { kind: "table", topic: tp, item: tp.items[0] }; renderPractice(); });
  eq(await p.locator("#panelPractice input.ans").count(), 12, "las casillas «—» no son casillas (ein: 12 de 16)");
  noErrors(p);
});

test("Tabla completa · los acentos se avisan donde no son obligatorios y se exigen donde sí", async () => {
  const p = await open("pl"); await topic(p, "ten");
  await p.evaluate(() => { const tp = curTopic(); state.current = { kind: "table", topic: tp, item: tp.items[0] }; renderPractice(); });   // «ten · ta · to» (no «mój», que no tiene «tą»)
  await p.evaluate(() => { document.querySelectorAll("#panelPractice input.ans").forEach((i) => { i.value = i.dataset.answer; }); const ins = document.querySelectorAll("#panelPractice input.ans"); ins.forEach((i) => { if (i.dataset.answer === "tą") i.value = "ta"; }); });
  await p.click("#panelPractice .btn.primary");
  eq(await p.locator("input.ans.bad").count(), 1, "«ta» no vale por «tą» (son formas distintas): solo esa casilla falla");
  const g = await open("el"); await topic(g, "nom");
  await g.evaluate(() => { const tp = curTopic(); state.current = { kind: "table", topic: tp, item: tp.items[0] }; renderPractice(); });
  await g.evaluate(() => { document.querySelectorAll("#panelPractice input.ans").forEach((i) => { i.value = i.dataset.answer.split("|")[0].normalize("NFD").replace(/[̀-ͯ]/g, ""); }); });
  await g.click("#panelPractice .btn.primary");
  ok(await g.locator(".banner.good").count() === 1 && await g.locator(".fix.soft").count() > 0, "en griego, sin acentos vale y avisa de cómo se escribe");
  noErrors(p); noErrors(g);
});

test("Hueco · una frase con su hueco, la pista y la solución en el aviso", async () => {
  const p = await open("de"); await topic(p, "nom", "gap");
  await p.evaluate(() => { const t = curTopic(); const ch = gapChoices(t).find((c) => c.row.k === "akk" && c.item.title === "der Mann" && c.col.k === "sg"); state.current = Object.assign({ kind: "gap", topic: t, frame: "Ich sehe {}." }, ch); renderPractice(); });
  eq(await txt(p.locator(".sentence")), "Ich sehe .", "la frase");
  eq(await txt(p.locator(".hintchip")), "der Mann · Singular", "con la pista del sustantivo");
  await p.fill("#panelPractice input.ans", "dem Mann"); await p.click("#panelPractice .btn.primary");
  ok(/Casi\./.test(await txt(p.locator("#banner"))) && /den Mann/.test(await txt(p.locator("#banner"))) && /Acusativo/.test(await txt(p.locator("#banner"))), "mal: dice el caso y la forma correcta: «" + await txt(p.locator("#banner")) + "»");
  await p.fill("#panelPractice input.ans", "DEN mann"); await p.keyboard.press("Enter");
  ok(await p.locator(".banner.good").count() === 1, "bien (las mayúsculas no cuentan)");
  await p.evaluate(() => { const t = curTopic(); const ch = gapChoices(t).find((c) => c.row.k === "gen" && c.item.title === "der Mann" && c.col.k === "sg"); state.current = Object.assign({ kind: "gap", topic: t, frame: "Das ist das Haus {}." }, ch); renderPractice(); });
  await p.fill("#panelPractice input.ans", "des Manns"); await p.keyboard.press("Enter");
  ok(await p.locator(".banner.good").count() === 1, "«des Manns» y «des Mannes» valen para el genitivo (la e es opcional)");
  // un determinante lleva el sustantivo en la frase
  await topic(p, "artdef", "gap");
  await p.evaluate(() => { const t = curTopic(); const ch = gapChoices(t).find((c) => c.row.k === "dat" && c.col.k === "pl"); state.current = Object.assign({ kind: "gap", topic: t, frame: "Ich spreche mit {} {n}.", noun: ch.nouns[0] }, ch); renderPractice(); });
  eq(await txt(p.locator(".sentence")), "Ich spreche mit Kindern.", "con el sustantivo ya en su caso (dativo plural: Kindern)");
  await p.fill("#panelPractice input.ans", "den"); await p.keyboard.press("Enter"); ok(await p.locator(".banner.good").count() === 1, "«den» es lo que falta");
  noErrors(p);
});

test("Hueco · los pronombres piden la forma átona con o sin elisión según la frase", async () => {
  const p = await open("fr");
  const probar = async (frame, hintFor_, typed) => {
    await p.evaluate(([f, col]) => { const t = LANGS.fr.topics.find((x) => x.id === "pers"); state.topic.fr = "pers"; const ch = gapChoices(t).find((c) => c.row.k === "cod" && c.col.k === col && c.item.title === "3.ª persona" || (c.row.k === "cod" && c.col.k === col)); setTab("practice"); state.mode = "gap"; state.current = Object.assign({ kind: "gap", topic: t, frame: f }, ch); renderPractice(); }, [frame, hintFor_]);
    await p.fill("#panelPractice input.ans", typed); await p.keyboard.press("Enter");
    return (await p.locator(".banner.good").count()) === 1;
  };
  ok(await probar({ t: "Pierre {} voit.", v: 0 }, "il", "le"), "Pierre le voit");
  ok(!(await probar({ t: "Pierre {} voit.", v: 0 }, "il", "l'")), "«Pierre l' voit» no vale (ante consonante no hay elisión)");
  ok(await probar({ t: "Pierre {} aime.", v: 1 }, "il", "l'"), "Pierre l'aime");
  ok(!(await probar({ t: "Pierre {} aime.", v: 1 }, "il", "le")), "«Pierre le aime» no vale (ante vocal se elide)");
  ok(await probar({ t: "Pierre {} aime.", v: 1 }, "nous", "nous"), "con nous no hay elisión: Pierre nous aime");
  noErrors(p);
});

test("Reconoce la función · acepta cualquiera de los casos posibles de una forma", async () => {
  const p = await open("de"); await topic(p, "artdef", "recog");
  const mk = (col, row) => p.evaluate(([c, r]) => { const t = curTopic(), it = t.items[0], cc = it.cols.find((x) => x.k === c), rr = it.rows.find((x) => x.k === r); const shown = display(it.cells[r][c]); const valid = it.rows.filter((x) => variants(it.cells[x.k][c]).some((v) => norm(v) === norm(shown))).map((x) => x.k); state.current = { kind: "recog", topic: t, item: it, col: cc, row: rr, shown, valid, answered: false }; renderPractice(); return valid; }, [col, row]);
  eq(await mk("pl", "akk"), ["nom", "akk"], "«die» (plural) puede ser nominativo o acusativo");
  await p.click('.optbtn[data-row="nom"]'); ok(await p.locator("#recogfb.good").count() === 1 && await p.locator(".optbtn.ok").count() === 2, "elegir cualquiera de los dos es correcto, y se marcan los dos");
  eq(await mk("m", "dat"), ["dat"], "«dem» (masculino) solo puede ser dativo");
  await p.click('.optbtn[data-row="akk"]'); ok(await p.locator("#recogfb.bad").count() === 1 && /Dativo/.test(await txt(p.locator("#recogfb"))), "un caso equivocado se marca y se dice cuál era");
  await p.click('.optbtn[data-row="dat"]', { force: true }).catch(() => { }); ok(await p.locator(".optbtn:not(:disabled)").count() === 0, "tras responder no se puede cambiar");
  // las funciones válidas que calcula la app para cada forma, comparadas con las que se ven en la tabla
  const r = await p.evaluate(() => {
    const out = { n: 0, bad: [] }; state.mode = "recog";
    for (let k = 0; k < 32; k++) {
      newExercise(); const c = state.current; out.n++;
      const real = c.item.rows.filter((r) => c.item.cells[r.k][c.col.k] === c.item.cells[c.row.k][c.col.k]).map((r) => r.k);
      if (JSON.stringify(real) !== JSON.stringify(c.valid)) out.bad.push(c.shown + " (" + c.col.k + "): la app dice " + c.valid + " y la tabla " + real);
    }
    return out;
  });
  ok(r.n === 32 && r.bad.length === 0, "las funciones válidas de las formas que salen de verdad coinciden con la tabla (" + r.n + " comprobadas)" + (r.bad.length ? ": " + r.bad.slice(0, 3).join(" | ") : ""));
  noErrors(p);
});

test("Barrido · todos los temas de los 8 idiomas en los tres modos", async () => {
  const p = await open();
  const r = await p.evaluate(() => {
    const out = { combos: 0, fallos: [], sinHueco: [] };
    for (const code of LANG_ORDER) {
      chooseLang(code);
      for (const t of LANGS[code].topics) {
        state.topic[code] = t.id; renderSubtabs();
        for (const m of ["table", "gap", "recog"]) {
          out.combos++;
          try {
            state.mode = m; setTab("practice");
            for (let k = 0; k < 6; k++) {
              newExercise();
              const cur = state.current, ins = document.querySelectorAll("#panelPractice input.ans"), opts = document.querySelectorAll("#panelPractice .optbtn");
              if(m === "gap" && !hasFrames(t)){ if(cur.kind !== "table") throw new Error("sin frases debería volver a la tabla"); out.sinHueco.push(code + "/" + t.id); continue; }
              if(cur.kind === "recog" ? opts.length !== cur.item.rows.length || !cur.valid.length : !ins.length) throw new Error("sin casillas ni opciones");
              if(cur.kind === "gap"){ if(ins.length !== 1) throw new Error("el hueco debe ser uno"); if(!matches(fillOf(ins[0].dataset.answer), ins[0].dataset.answer)) throw new Error("no acepta su respuesta"); }
              if(cur.kind === "table") ins.forEach((i) => { if(!matches(fillOf(i.dataset.answer), i.dataset.answer)) throw new Error("no acepta " + i.dataset.answer); });
            }
          } catch(e){ out.fallos.push(code + "/" + t.id + "/" + m + ": " + e.message); }
        }
      }
    }
    return out;
  });
  ok(r.combos === 39 * 3 && r.fallos.length === 0, r.combos + " combinaciones · " + r.fallos.length + " fallos" + (r.fallos.length ? ": " + r.fallos.slice(0, 4).join(" | ") : ""));
  ok(r.sinHueco.length === 0, "los 39 temas tienen frases de hueco: ninguno se queda con el botón desactivado");
  await p.evaluate(() => { chooseLang("fr"); state.topic.fr = "poss"; setTab("practice"); });
  ok(!(await p.locator('.mode[data-mode="gap"]').isDisabled()), "y el botón «Rellena el hueco» está activo en los posesivos franceses");
  eq(await p.evaluate(() => LANG_ORDER.every((c) => LANGS[c].topics.every((t) => t.kind !== "none" && gapChoices(t, c).length > 0))), true, "ningún tema es de tipo «none»");
  noErrors(p);
});

test("Móvil · nada desborda en 390 px (las tablas anchas se desplazan dentro de su caja)", async () => {
  for (const [code, tid] of [["it", "art"], ["pl", "ten"], ["el", "adj"], ["de", "adjw"]]) {
    const p = await open(code, { viewport: { width: 390, height: 844 } });
    await p.evaluate((t) => { state.topic[state.lang] = t; setTab("theory"); renderSubtabs(); }, tid);
    eq(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, code + "/" + tid + ": la teoría no desborda la página");
    await topic(p, tid);
    eq(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, code + "/" + tid + ": ni la tabla de práctica");
    ok(await p.evaluate(() => { const w = document.querySelector(".dgwrap"); return w.scrollWidth >= w.clientWidth; }), "con su propia barra de desplazamiento si hace falta");
  }
});

// =====================================================================================================================
// =====================================================================================================================
// CAMBIO DE WEB: desplegable con el logo de cada app
// =====================================================================================================================
test("Cambio de web · desplegable con el logo de cada app (solo al abrir los archivos del disco)", async () => {
  const h = await open("fr"); ok(await h.locator("#appWrap").isHidden(), "por http no aparece: las rutas relativas entre carpetas no valdrían");
  const p = await openFile("Declinario/index.html#fr");
  ok(await p.locator("#appChip").isVisible() && await p.locator("#appMenu").isHidden(), "desde el disco hay botón y la lista está cerrada");
  eq(await p.locator("#appChip svg.applogo").count(), 1, "el botón lleva el logo de esta web");
  await p.click("#appChip");
  ok(await p.locator("#appMenu").isVisible() && (await p.locator("#appChip").getAttribute("aria-expanded")) === "true", "al pulsarlo se despliega");
  eq(await p.locator(".appopt .appnm").allInnerTexts(), ["Vocabulando", "Conjugario", "Declinario"], "tres opciones, en este orden");
  eq(await p.locator(".appopt > svg.applogo").count(), 3, "cada opción empieza por su logo");
  eq(await p.evaluate(() => new Set([...document.querySelectorAll(".appopt > svg.applogo path")].map((x) => x.getAttribute("d"))).size), 3, "y los tres logos son distintos");
  eq(await p.evaluate(() => [...document.querySelectorAll(".appopt")].map((o) => o.tagName + ":" + (o.getAttribute("aria-current") || o.getAttribute("href")))),
    ["A:../Vocabulando/Vocabulando.html#fr", "A:../Conjugario/index.html#fr", "SPAN:page"], "los otros dos son enlaces con el idioma abierto; esta web va marcada y no es un enlace");
  const geo = await p.evaluate(() => { const m = document.getElementById("appMenu").getBoundingClientRect(), c = document.getElementById("appChip").getBoundingClientRect(); return { debajo: m.top >= c.bottom - 1, dentro: m.left >= 0 && m.right <= innerWidth }; });
  eq(geo, { debajo: true, dentro: true }, "la lista queda pegada al botón y dentro de la pantalla");
  await p.click("#appChip"); ok(await p.locator("#appMenu").isHidden(), "pulsar el botón otra vez la cierra");
  await p.click("#appChip"); await p.keyboard.press("Escape");
  ok(await p.locator("#appMenu").isHidden() && await p.evaluate(() => document.activeElement.id) === "appChip", "Escape la cierra y devuelve el foco al botón");
  await p.click("#appChip"); await p.mouse.click(5, 5); ok(await p.locator("#appMenu").isHidden(), "pulsar fuera la cierra");
  await p.click("#appChip"); eq(await p.evaluate(() => document.activeElement.dataset.app), "vocabulando", "al abrir, el foco está en la primera web distinta de esta");
  await p.keyboard.press("ArrowDown"); await p.keyboard.press("ArrowDown"); eq(await p.evaluate(() => document.activeElement.dataset.app), "declinario", "con el teclado, las flechas recorren la lista y dan la vuelta");
  await p.keyboard.press("End"); eq(await p.evaluate(() => document.activeElement.dataset.app), "declinario", "Fin va a la última");
  await p.keyboard.press("Home"); eq(await p.evaluate(() => document.activeElement.dataset.app), "vocabulando", "Inicio va a la primera");
  await p.keyboard.press("Escape");
  // el idioma que abres viaja en el enlace
  await p.evaluate(() => chooseLang("de")); await p.click("#appChip");
  eq(await p.evaluate(() => [...document.querySelectorAll(".appopt[href]")].map((a) => a.getAttribute("href").split("#")[1])), ["de", "de"], "al cambiar de idioma, los enlaces llevan el idioma nuevo");
  // pantalla de inicio: sin idioma, sin «#»
  await p.keyboard.press("Escape"); await p.click("#brandBtn"); await p.click("#appChip");
  eq(await p.evaluate(() => [...document.querySelectorAll(".appopt[href]")].map((a) => a.getAttribute("href").includes("#"))), [false, false], "sin idioma elegido, los enlaces no llevan «#»");
  await p.keyboard.press("Escape");
  // convive con el desplegable de idiomas: abrir uno cierra el otro
  await p.evaluate(() => chooseLang("fr")); await p.click("#appChip"); await p.click("#langChip");
  ok(await p.locator("#appMenu").isHidden() && await p.locator("#langMenu").isVisible(), "abrir la lista de idiomas cierra la de webs");
  await p.click("#appChip"); ok(await p.locator("#langMenu").isHidden() && await p.locator("#appMenu").isVisible(), "y al revés");
  // el tema viaja con el enlace
  await p.keyboard.press("Escape"); await p.click("#themeBtn"); await p.evaluate(() => localStorage.removeItem("idiomas:theme"));
  await p.click("#appChip"); await p.evaluate(() => document.querySelector(".appopt[href]").addEventListener("click", (e) => e.preventDefault()));
  await p.click(".appopt[href]"); ok(await p.evaluate(() => localStorage.getItem("idiomas:theme") === "dark" && document.documentElement.getAttribute("data-theme") === "dark"), "al pulsar un enlace, la otra web se abre con el tema oscuro de esta");
  // la ayuda lo explica solo cuando el botón existe
  await p.click("#infoBtn"); ok(/Vocabulando \([^)]*\) o a Conjugario/.test(await txt(p.locator("#infoOverlay"))), "la ayuda explica el botón del logo");
  await p.keyboard.press("Escape");
  noErrors(p); noErrors(h);
});

test("Cambio de web · en el móvil la cabecera no desborda y la lista cabe", async () => {
  for (const vp of [{ width: 390, height: 780 }, { width: 320, height: 700 }]) {
    for (const hash of ["", "#el"]) {
      const p = await openFile("Declinario/index.html" + hash, { viewport: vp });
      await p.click("#appChip");
      eq(await p.evaluate(() => { const m = document.getElementById("appMenu").getBoundingClientRect(); return [m.left >= 0, m.right <= innerWidth, document.documentElement.scrollWidth <= innerWidth + 1]; }), [true, true, true],
        "a " + vp.width + " px " + (hash ? "dentro de un idioma" : "en la pantalla de inicio") + ": la lista cabe y la página no se ensancha");
      noErrors(p);
    }
  }
});


// =====================================================================================================================
// PROGRESO: test final, temas dorados y formas falladas
// =====================================================================================================================
const KEYP = "declinario:progreso", KEYF = "declinario:fallos";
const stored = async (p, k = KEYP) => JSON.parse(await p.evaluate((kk) => localStorage.getItem(kk), k));
// responde a un test final entero con la interfaz: los primeros «wrong» huecos se contestan mal, el resto bien
async function takeTest(p, wrong = 0, started = false) {
  if (!started) await p.click("#testStart");
  const n = await p.evaluate(() => state.testSession.questions.length);
  for (let i = 0; i < n; i++) {
    const q = await p.evaluate(() => { const s = state.testSession, x = s.questions[s.qi]; return x.kind === "gap" ? { kind: "gap", ans: fillOf(frameAnswer(x.cell, x.frame)) } : { kind: "recog", valid: x.valid, rows: x.item.rows.map((r) => r.k) }; });
    if (q.kind === "gap") { await p.fill("#panelPractice input.ans", i < wrong ? "zzzz" : q.ans); await p.click("#testCheck"); }
    else await p.click('#panelPractice .optbtn[data-row="' + (i < wrong ? q.rows.find((r) => !q.valid.includes(r)) || q.valid[0] : q.valid[0]) + '"]');
    await p.click("#testNext");
  }
  return p.evaluate(() => ({ score: state.testSession.score, n: state.testSession.questions.length, pct: state.testSession.pct, finished: state.testSession.finished }));
}
// un ejercicio acertado de cada modo (con la interfaz) para desbloquear el test final
async function unlockTest(p) {
  for (const m of ["table", "gap"]) {
    await p.click('.mode[data-mode="' + m + '"]');
    await p.evaluate(() => document.querySelectorAll("#panelPractice input.ans").forEach((i) => { i.value = fillOf(i.dataset.answer); }));
    await p.click("#panelPractice .controls .btn.primary");
  }
  await p.click('.mode[data-mode="recog"]');
  await p.click('#panelPractice .optbtn[data-row="' + (await p.evaluate(() => state.current.valid[0])) + '"]');
}

test("Progreso · el test final se desbloquea con un ejercicio acertado de cada modo, y «Ver solución» no cuenta", async () => {
  const p = await open("de"); await topic(p, "artdef", "table");
  eq(await p.locator("#testStart").count(), 0, "al principio no hay test final");
  eq(await p.locator(".mode.answered").count(), 0, "ni ningún modo con ✓");
  await p.evaluate(() => document.querySelectorAll("#panelPractice input.ans").forEach((i) => { i.value = "zzz"; }));
  await p.click("#panelPractice .controls .btn.primary");
  eq(await p.locator(".mode.answered").count(), 0, "un ejercicio fallado no cuenta");
  await p.click("#panelPractice .controls .btn:not(.primary):not(.sky)");
  eq(await p.locator(".mode.answered").count(), 0, "«Ver solución» tampoco");
  await p.click('.mode[data-mode="gap"]');
  await p.click("#panelPractice .controls .btn:not(.primary):not(.sky)");
  eq(await p.locator(".mode.answered").count(), 0, "ni en el hueco");
  await p.click('.mode[data-mode="table"]');
  await p.evaluate(() => document.querySelectorAll("#panelPractice input.ans").forEach((i) => { i.value = fillOf(i.dataset.answer); }));
  await p.click("#panelPractice .controls .btn.primary");
  eq(await p.locator('.mode.answered').evaluateAll((l) => l.map((b) => b.dataset.mode)), ["table"], "acertar una tabla marca la tabla completa");
  eq(await p.locator("#testStart").count(), 0, "con un solo modo todavía no se desbloquea");
  await p.click('.mode[data-mode="gap"]');
  await p.evaluate(() => document.querySelectorAll("#panelPractice input.ans").forEach((i) => { i.value = fillOf(i.dataset.answer); }));
  await p.click("#panelPractice .controls .btn.primary");
  eq(await p.locator("#testStart").count(), 0, "con dos de tres, tampoco");
  await p.click('.mode[data-mode="recog"]');
  const bad = await p.evaluate(() => state.current.item.rows.map((r) => r.k).find((k) => !state.current.valid.includes(k)));
  if (bad) await p.click('#panelPractice .optbtn[data-row="' + bad + '"]');
  eq(await p.locator("#testStart").count(), 0, "una respuesta equivocada al reconocer tampoco cuenta");
  await p.click("#panelPractice .controls .btn.sky");
  await p.click('#panelPractice .optbtn[data-row="' + (await p.evaluate(() => state.current.valid[0])) + '"]');
  ok(await p.locator("#testStart").isVisible() && /Test final desbloqueado/.test(await txt(p.locator("#testcta"))), "al acertar los tres modos aparece «Test final desbloqueado»");
  eq(await p.locator(".mode.answered").count(), 3, "los tres modos llevan su ✓");
  eq(await stored(p), null, "y nada de esto se guarda en el navegador");
  await topic(p, "adjw", "table"); eq(await p.locator("#testStart").count(), 0, "otro tema empieza sin desbloquear");
  noErrors(p);
});

test("Progreso · el test final tiene 10 preguntas (7 huecos y 3 de reconocer), sin casillas repetidas, en todos los temas", async () => {
  const p = await open();
  const r = await p.evaluate(() => {
    const out = { temas: 0, min: 99, bad: [] };
    for (const code of LANG_ORDER) {
      chooseLang(code);
      for (const t of LANGS[code].topics) {
        state.topic[code] = t.id; startTest(t); const s = state.testSession; out.temas++;
        const gaps = s.questions.filter((q) => q.kind === "gap"), rec = s.questions.filter((q) => q.kind === "recog");
        out.min = Math.min(out.min, s.questions.length);
        const want = Math.min(10, Math.min(7, gapChoices(t).length) + Math.min(10 - Math.min(7, gapChoices(t).length), recogCells(t).length));
        if (s.questions.length !== want) out.bad.push(code + "/" + t.id + ": " + s.questions.length + " preguntas en vez de " + want);
        if (gaps.length !== Math.min(7, gapChoices(t).length)) out.bad.push(code + "/" + t.id + ": " + gaps.length + " huecos");
        if (new Set(gaps.map((q) => q.item.title + q.row.k + q.col.k)).size !== gaps.length) out.bad.push(code + "/" + t.id + ": casillas de hueco repetidas");
        if (new Set(rec.map((q) => q.item.title + q.row.k + q.col.k)).size !== rec.length) out.bad.push(code + "/" + t.id + ": casillas de reconocer repetidas");
        if (!gaps.every((q) => matches(fillOf(frameAnswer(q.cell, q.frame)), frameAnswer(q.cell, q.frame)))) out.bad.push(code + "/" + t.id + ": un hueco no acepta su propia respuesta");
        if (!rec.every((q) => q.valid.length >= 1 && q.valid.includes(q.row.k))) out.bad.push(code + "/" + t.id + ": una pregunta de reconocer sin respuesta válida");
        if (s.blocks.reduce((a, b) => a + b.n, 0) !== s.questions.length || !s.questions.every((q) => s.blocks[q.block])) out.bad.push(code + "/" + t.id + ": bloques mal formados");
      }
    }
    state.testSession = null;
    return out;
  });
  ok(r.temas === 39 && r.bad.length === 0, r.temas + " temas · el test más corto tiene " + r.min + " preguntas" + (r.bad.length ? " · " + r.bad.slice(0, 4).join(" | ") : ""));
  noErrors(p);
});

test("Progreso · la práctica suelta no guarda el dorado y un test suspendido tampoco", async () => {
  const p = await open("de"); await topic(p, "artdef", "table"); await unlockTest(p);
  eq(await stored(p), null, "tras practicar no hay progreso guardado");
  const r = await takeTest(p, 4);
  ok(r.finished && r.score === 6 && r.pct === 60, "6 de 10 es un 60 %: " + JSON.stringify(r));
  eq(await stored(p), null, "un test suspendido no guarda nada");
  const res = await txt(p.locator("#panelPractice"));
  ok(/60%/.test(res) && /Repasa estas formas/.test(res) && /nota necesaria: 80 %/.test(res) && await p.locator(".goldnote.soft").count() === 1, "el resultado enseña la nota, los fallos uno a uno y avisa de la nota que hace falta");
  eq(await p.locator(".chip.gold").count(), 0, "y ningún tema se vuelve dorado");
  eq(await p.locator("#subtabs .chip.gold").count(), 0, "ni en la barra de temas");
  await p.click("#testClose"); ok(await p.locator("#testStart").isVisible() && /Tu mejor resultado: 60%/.test(await txt(p.locator("#testcta"))), "al volver a prácticas se ve la mejor nota y se puede repetir");
  noErrors(p);
});

test("Progreso · superar el test deja el tema en dorado, guardado, y sobrevive a recargar", async () => {
  const p = await open("de"); await topic(p, "artdef", "table"); await unlockTest(p);
  const r = await takeTest(p, 0);
  ok(r.pct === 100 && r.score === 10, "10 de 10: " + JSON.stringify(r));
  const res = await txt(p.locator("#panelPractice"));
  ok(/100%/.test(res) && /queda en dorado/.test(res) && /Se ha guardado en este navegador/.test(res) && await p.locator(".goldnote:not(.soft)").count() === 1, "el resultado lo dice y enseña la estrella");
  const s = await stored(p), day = await p.evaluate(() => progToday());
  eq(s, { v: 1, d: { de: { artdef: { best: 100, date: day } } } }, "se guarda el tema con su mejor nota y la fecha");
  await p.click("#testClose");
  ok(await p.locator("#subtabs .chip.gold").count() === 1 && /Artículo determinado/.test(await txt(p.locator("#subtabs .chip.gold"))), "el botón del tema se vuelve dorado");
  ok(/^Dominado: test final superado \(mejor nota 100/.test(await p.locator("#subtabs .chip.gold").getAttribute("title")), "con su nota al pasar el ratón");
  await p.click("#brandBtn"); ok(/^★ 1 de 9 temas$/.test(await txt(p.locator('.choice[data-lang="de"] .cstar'))) && /^★ 0 de 5 temas$/.test(await txt(p.locator('.choice[data-lang="pl"] .cstar'))), "la pantalla de inicio cuenta los dorados de cada idioma");
  await p.reload(); await p.waitForFunction(() => window.__booted === true);
  ok(/^★ 1 de 9 temas$/.test(await txt(p.locator('.choice[data-lang="de"] .cstar'))), "tras recargar, el contador sigue");
  await p.click('.choice[data-lang="de"]'); await p.click("#tabPractice");
  eq(await p.locator("#subtabs .chip.gold").count(), 1, "y el tema sigue dorado");
  await topic(p, "artdef", "table");
  ok(await p.locator("#testStart").isVisible() && await p.locator(".mode.answered").count() === 3, "un tema dorado tiene su test final disponible sin repetir los tres modos");
  await topic(p, "adjw", "table"); eq(await p.locator("#subtabs .chip.gold").count(), 1, "los demás temas no se contagian");
  // un test posterior peor no quita el dorado ni baja la nota
  await topic(p, "artdef", "table");
  const r2 = await takeTest(p, 5); ok(r2.pct === 50, "5 de 10 en un segundo intento: " + JSON.stringify(r2));
  ok(/sigue en dorado por tu test anterior/.test(await txt(p.locator("#panelPractice"))), "avisa de que sigue en dorado");
  eq((await stored(p)).d.de.artdef.best, 100, "la mejor nota guardada no baja");
  noErrors(p);
});

test("Progreso · el 80 % es el límite: 8 de 10 deja el tema en dorado y 7 de 10 no", async () => {
  const p = await open("pl"); await topic(p, "pers", "table"); await unlockTest(p);
  const a = await takeTest(p, 3); eq([a.score, a.pct], [7, 70], "con 3 fallos, 7 de 10");
  eq(await stored(p), null, "70 % no basta");
  await p.click("#testAgain");
  const n = await p.evaluate(() => [state.testSession.questions.length, state.testSession.qi, state.testSession.finished]); eq(n, [10, 0, false], "«Repetir test» empieza otro de 10 preguntas desde la primera");
  const b = await takeTest(p, 2, true); eq([b.score, b.pct], [8, 80], "con 2 fallos, 8 de 10");
  eq((await stored(p)).d.pl.pers.best, 80, "80 % sí basta, y se guarda con esa nota");
  noErrors(p);
});

test("Progreso · un guardado ilegible o ajeno se ignora y, si el navegador no deja guardar, el dorado dura la sesión", async () => {
  const day = "2026-01-02";
  const malos = ["no es json", "{", JSON.stringify({ v: 2, d: { de: { artdef: { best: 90, date: day } } } }), JSON.stringify({ v: 1, d: { xx: { artdef: { best: 90, date: day } } } }),
    JSON.stringify({ v: 1, d: { de: { "mal id!": { best: 90, date: day }, artdef: { best: "alto" } } } }), JSON.stringify({ v: 1, d: "x" }), "null", "[]"];
  for (const raw of malos) {
    const ctx = await browser.newContext(); ctxs.push(ctx);
    await ctx.route((u) => !u.href.startsWith(BASE), (r) => r.abort());
    await ctx.addInitScript(([k, v]) => { try { if (!localStorage.getItem("__s")) { localStorage.setItem("__s", "1"); localStorage.setItem(k, v); } } catch (e) { } }, [KEYP, raw]);
    const q = await ctx.newPage(); q.errs = []; q.on("pageerror", (e) => q.errs.push(String(e)));
    await q.goto(BASE + "index.html#de"); await q.waitForFunction(() => window.__booted === true);
    eq(await q.locator("#subtabs .chip.gold").count(), 0, "ignorado sin romper nada: «" + raw.slice(0, 34) + "»");
    noErrors(q);
  }
  // un valor fuera de rango se acota; una nota y una fecha válidas se respetan
  const ctx2 = await browser.newContext(); ctxs.push(ctx2);
  await ctx2.route((u) => !u.href.startsWith(BASE), (r) => r.abort());
  await ctx2.addInitScript(([k, v]) => { try { if (!localStorage.getItem("__s")) { localStorage.setItem("__s", "1"); localStorage.setItem(k, v); } } catch (e) { } }, [KEYP, JSON.stringify({ v: 1, d: { de: { artdef: { best: 250, date: day }, nom: { best: 91.6, date: "ayer" } }, fr: { pers: { best: 85, date: day } } } })]);
  const q2 = await ctx2.newPage(); await q2.goto(BASE + "index.html#de"); await q2.waitForFunction(() => window.__booted === true);
  eq(await q2.evaluate(() => [progEntry("de", "artdef"), progEntry("de", "nom"), progEntry("fr", "pers")]), [{ best: 100, date: day }, { best: 92, date: "" }, { best: 85, date: day }], "las notas se acotan a 0-100 y una fecha rara se descarta");
  eq(await q2.locator("#subtabs .chip.gold").count(), 2, "y los temas válidos salen dorados");
  // navegador sin almacenamiento: el dorado dura la sesión y se avisa
  const ctx = await browser.newContext(); ctxs.push(ctx);
  await ctx.route((u) => !u.href.startsWith(BASE), (r) => r.abort());
  await ctx.addInitScript(() => { Storage.prototype.setItem = function () { throw new Error("cuota"); }; Storage.prototype.getItem = function () { throw new Error("bloqueado"); }; });
  const p = await ctx.newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(String(e)));
  await p.goto(BASE + "index.html#de"); await p.waitForFunction(() => window.__booted === true);
  await p.click("#tabPractice"); await topic(p, "artdef", "table"); await unlockTest(p);
  await takeTest(p, 0);
  ok(/No se ha podido guardar/.test(await txt(p.locator("#panelPractice"))) && await p.locator(".goldnote:not(.soft)").count() === 1, "el resultado avisa de que no se ha podido guardar");
  await p.click("#testClose"); eq(await p.locator("#subtabs .chip.gold").count(), 1, "pero el tema sigue dorado mientras no recargues");
  await p.click("#infoBtn"); ok(/no deja guardar datos/.test(await txt(p.locator("#infoProg"))) && await p.locator("#progDel").count() === 1, "y la ayuda explica el motivo");
  noErrors(p);
});

test("Progreso · otra pestaña abierta se entera al momento y el borrado se hace desde la ayuda, con confirmación", async () => {
  const ctx = await browser.newContext(); ctxs.push(ctx);
  await ctx.route((u) => !u.href.startsWith(BASE), (r) => r.abort());
  const a = await ctx.newPage(), b = await ctx.newPage(); a.errs = []; b.errs = [];
  for (const q of [a, b]) { q.on("pageerror", (e) => q.errs.push(String(e))); await q.goto(BASE + "index.html#de"); await q.waitForFunction(() => window.__booted === true); }
  await a.click("#tabPractice"); await topic(a, "artdef", "table"); await unlockTest(a); await takeTest(a, 0);
  await b.waitForFunction(() => document.querySelectorAll("#subtabs .chip.gold").length === 1, null, { timeout: 4000 });
  ok(true, "la otra pestaña muestra el dorado sin recargar");
  await b.click("#infoBtn");
  ok(/Guardado en este navegador: 1 de 9 temas/.test(await txt(b.locator("#infoProg"))) || /1 de 39 temas/.test(await txt(b.locator("#infoProg"))), "la ayuda cuenta los temas dorados: «" + (await txt(b.locator("#infoProg"))) + "»");
  await b.click("#progDel"); ok(await b.locator("#progDelYes").isVisible() && await b.locator("#subtabs .chip.gold").count() === 1, "borrar pide confirmación y todavía no borra");
  await b.click("#progDelNo"); ok(await b.locator("#progDel").isVisible() && (await stored(b)) !== null, "«Cancelar» lo deja todo como estaba");
  await b.click("#infoClose");
  await topic(b, "adjw", "gap"); await b.fill("#panelPractice input.ans", "zzzz"); await b.click("#panelPractice .controls .btn.primary");
  ok((await stored(b, KEYF)) !== null, "se anota una forma fallada, para comprobar que el borrado también se la lleva");
  await b.click("#infoBtn"); ok(/1 casilla fallada/.test(await txt(b.locator("#infoProg"))), "la ayuda cuenta las casillas falladas: «" + (await txt(b.locator("#infoProg"))) + "»");
  await b.click("#progDel"); await b.click("#progDelYes");
  eq([await stored(b), await stored(b, KEYF), await b.evaluate(() => fallosCount())], [null, null, 0], "«Sí, borrar» quita el progreso guardado y las formas falladas, en el navegador y en la sesión");
  eq(await b.locator("#subtabs .chip.gold").count(), 0, "y el dorado desaparece al momento");
  ok(/Todavía no hay nada guardado/.test(await txt(b.locator("#infoProg"))), "la ayuda lo refleja");
  await a.waitForFunction(() => document.querySelectorAll("#subtabs .chip.gold").length === 0, null, { timeout: 4000 });
  ok(true, "la primera pestaña también se entera del borrado");
  noErrors(a); noErrors(b);
});

test("Fallos · lo que fallas se anota una sola vez, vuelve a salir pasados unos ejercicios, se recuerda de un día para otro y se olvida al acertarlo", async () => {
  const p = await open("de"); await topic(p, "artdef", "gap");
  const cell = await p.evaluate(() => ({ ii: state.current.ii, r: state.current.row.k, c: state.current.col.k, ans: fillOf(frameAnswer(state.current.cell, state.current.frame)) }));
  await p.fill("#panelPractice input.ans", "zzzz"); await p.click("#panelPractice .controls .btn.primary");
  const day = await p.evaluate(() => progToday());
  eq(await stored(p, KEYF), { v: 1, d: { de: { artdef: [[cell.ii, cell.r, cell.c, 1, day]] } } }, "un hueco fallado se guarda con su tabla, su caso y su columna");
  await p.click("#panelPractice .controls .btn.primary"); eq((await stored(p, KEYF)).d.de.artdef[0][3], 1, "comprobar otra vez lo mismo no suma otro fallo");
  await p.fill("#panelPractice input.ans", "yyyy"); await p.click("#panelPractice .controls .btn.primary");
  eq((await stored(p, KEYF)).d.de.artdef[0][3], 2, "escribir otra cosa mal sí lo cuenta (paso 2)");
  eq(await stored(p), null, "los fallos no tocan el progreso dorado");
  // dentro de la sesión: tras fallarla dos veces vuelve a los 5 ejercicios, y no antes
  const seen = [];
  for (let k = 0; k < 5; k++) { await p.click("#panelPractice .controls .btn.sky"); seen.push(await p.evaluate(() => state.current.retry ? state.current.row.k + "/" + state.current.col.k : null)); }
  eq(seen, [null, null, null, null, cell.r + "/" + cell.c], "la casilla fallada vuelve exactamente a los 5 ejercicios, marcada como repetición");
  ok(await p.locator(".pill", { hasText: "incluye un fallo anterior" }).count() === 1 && /1 forma fallada pendiente/.test(await txt(p.locator("#retrynote"))), "con su etiqueta y el aviso de pendiente");
  await p.click("#panelPractice .controls .btn.sky");
  eq(await p.evaluate(() => state.current.retry), false, "si no la contestas, no vuelve a salir al instante (se aplaza otros tantos ejercicios)");
  await p.click("#panelPractice .controls .btn.sky");
  await p.evaluate((c) => { const t = curTopic(); const all = gapChoices(t); const ch = all.find((a) => t.items.indexOf(a.item) === c.ii && a.row.k === c.r && a.col.k === c.c); state.current = Object.assign(gapQuestion(t, ch), { retry: true }); renderPractice(); }, cell);
  await p.fill("#panelPractice input.ans", cell.ans); await p.click("#panelPractice .controls .btn.primary");
  eq(await stored(p, KEYF), null, "al acertarla se olvida (y deja de ocupar sitio en el navegador)");
  // de un día para otro: se falla, se recarga y el primer hueco es esa casilla
  await p.click("#panelPractice .controls .btn.sky");
  const c2 = await p.evaluate(() => ({ ii: state.current.ii, r: state.current.row.k, c: state.current.col.k, ans: fillOf(frameAnswer(state.current.cell, state.current.frame)) }));
  await p.fill("#panelPractice input.ans", "qqqq"); await p.click("#panelPractice .controls .btn.primary");
  await p.reload(); await p.waitForFunction(() => window.__booted === true);   // la dirección lleva #de: entra directamente en alemán
  await p.evaluate(() => { state.mode = "gap"; }); await p.click("#tabPractice");
  ok(/1 forma fallada pendiente/.test(await txt(p.locator("#retrynote"))), "tras recargar, el tema avisa de que hay 1 forma pendiente");
  eq(await p.evaluate(() => ({ retry: state.current.retry, ii: state.current.ii, r: state.current.row.k, c: state.current.col.k })), { retry: true, ii: c2.ii, r: c2.r, c: c2.c }, "y el primer ejercicio de hueco es justo esa casilla");
  await p.fill("#panelPractice input.ans", c2.ans); await p.click("#panelPractice .controls .btn.primary");
  eq(await stored(p, KEYF), null, "al acertarla tras recargar, también se olvida");
  // en modo tabla, la tabla que contiene el fallo sale primero
  await p.click("#panelPractice .controls .btn.sky"); await p.fill("#panelPractice input.ans", "qqqq"); await p.click("#panelPractice .controls .btn.primary");
  await p.reload(); await p.waitForFunction(() => window.__booted === true); await p.click("#tabPractice");
  eq(await p.evaluate(() => [state.current.kind, state.current.retry, state.current.topic.id]), ["table", true, "artdef"], "en tabla, sale primero la tabla con el fallo pendiente");
  noErrors(p);
});

test("Fallos · en tablas y en reconocer también se anotan, y los guardados raros o caducados se descartan", async () => {
  const p = await open("pl"); await topic(p, "pers", "table");
  const ii = await p.evaluate(() => state.current.ii);
  await p.evaluate(() => { const ins = [...document.querySelectorAll("#panelPractice input.ans")]; ins.forEach((i) => { i.value = fillOf(i.dataset.answer); }); ins[0].value = "zzzz"; ins[1].value = "yyyy"; });
  const cells = await p.evaluate(() => [...document.querySelectorAll("#panelPractice input.ans")].slice(0, 2).map((i) => [i.dataset.row, i.dataset.col]));
  await p.click("#panelPractice .controls .btn.primary");
  const f = (await stored(p, KEYF)).d.pl.pers;
  eq(f.map((x) => [x[0], x[1], x[2]]).sort(), cells.map(([r, c]) => [ii, r, c]).sort(), "una tabla con dos casillas mal anota solo esas dos");
  await topic(p, "pers", "recog");
  const cur = await p.evaluate(() => ({ ii: state.current.ii, r: state.current.row.k, c: state.current.col.k, bad: state.current.item.rows.map((r) => r.k).find((k) => !state.current.valid.includes(k)) }));
  if (cur.bad) {
    await p.click('#panelPractice .optbtn[data-row="' + cur.bad + '"]');
    ok((await stored(p, KEYF)).d.pl.pers.some((x) => x[0] === cur.ii && x[1] === cur.r && x[2] === cur.c), "un fallo al reconocer también se anota");
  }
  // lo caducado y lo raro se descarta al cargar
  const viejo = await p.evaluate(() => { const d = new Date(Date.now() - 50 * 86400000), q = (n) => String(n).padStart(2, "0"); return d.getFullYear() + "-" + q(d.getMonth() + 1) + "-" + q(d.getDate()); });
  const hoy = await p.evaluate(() => progToday());
  const ctx = await browser.newContext(); ctxs.push(ctx);
  await ctx.route((u) => !u.href.startsWith(BASE), (r) => r.abort());
  await ctx.addInitScript(([k, v]) => { try { if (!localStorage.getItem("__s")) { localStorage.setItem("__s", "1"); localStorage.setItem(k, v); } } catch (e) { } },
    [KEYF, JSON.stringify({ v: 1, d: { pl: { pers: [[0, "nom", "ja", 1, viejo], [0, "nom", "nada", 1, hoy], [99, "nom", "ja", 1, hoy], [0, "mal clave!", "ja", 1, hoy], [0, "nom", "ja", 9, hoy], "x", [0, "nom", "ja"]] }, xx: { pers: [[0, "nom", "ja", 1, hoy]] } } })]);
  const q = await ctx.newPage(); q.errs = []; q.on("pageerror", (e) => q.errs.push(String(e)));
  await q.goto(BASE + "index.html#pl"); await q.waitForFunction(() => window.__booted === true);
  const kept = await q.evaluate(() => state.byLang.pl.retry.pers || []);
  eq(kept.map((x) => [x.ii, x.r, x.c, x.step]), [[0, "nom", "ja", 4]], "solo se queda lo válido (el paso se acota a 4; caducado, inexistente o mal formado, fuera)");
  noErrors(q);
  // los fallos de un test final no se anotan (solo los de la práctica)
  const r = await open("de"); await topic(r, "artdef", "table"); await unlockTest(r);
  await r.evaluate(() => { localStorage.removeItem("declinario:fallos"); });
  await takeTest(r, 4);
  eq(await stored(r, KEYF), null, "fallar el test final no escribe fallos recordados");
  noErrors(p); noErrors(r);
});


(async () => {
  const filter = process.argv[2];
  await start(); browser = await chromium.launch(); const t0 = Date.now();
  for (const t of T) {
    if (filter && !t.name.toLowerCase().includes(filter.toLowerCase())) continue;
    console.log("\n" + t.name);
    try { await t.fn(); } catch (e) { fails++; console.log("   FALLA la prueba se interrumpió: " + (e && e.message ? e.message.split("\n")[0] : e)); }
    for (const c of ctxs) await c.close().catch(() => { }); ctxs = [];
  }
  await browser.close(); server.close();
  console.log("\n" + (fails ? fails + " FALLOS · " : "TODO OK · ") + passes + " comprobaciones correctas · " + Math.round((Date.now() - t0) / 1000) + " s");
  process.exit(fails ? 1 : 0);
})();

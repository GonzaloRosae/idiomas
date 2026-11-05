// Pruebas automáticas de Conjugario. Uso: node run.js [texto]   (con «texto» solo se ejecutan las pruebas cuyo nombre lo contenga)
// Abren la app en un Chromium real, bloquean internet y comparan lo que conjuga cada idioma con la tabla de formas de referencia (formas.js).
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const { GOLD } = require("./formas.js");

const ROOT = process.env.CJ_ROOT ? path.resolve(process.env.CJ_ROOT) : path.join(__dirname, "..");   // CJ_ROOT: probar otra copia de la carpeta Conjugario
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
// voz simulada: voices = ["pt-PT", {lang, name, localService}…]; lo «pronunciado» queda en window.__spoken
const SPEECH = (voices) => {
  const spoken = []; window.__spoken = spoken;
  const list = voices.map((v) => typeof v === "string" ? { lang: v, name: "voz " + v, localService: true } : v);
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { getVoices: () => list, speak: (u) => spoken.push({ text: u.text, lang: u.lang, voz: u.voice && u.voice.name }), cancel() { } } });
};
async function open(lang, o = {}) {
  const ctx = await browser.newContext({ viewport: o.viewport || { width: 1000, height: 1000 } }); ctxs.push(ctx);
  await ctx.route((u) => !u.href.startsWith(BASE), (r) => r.abort());
  const page = await ctx.newPage(); page.errs = []; page.on("pageerror", (e) => page.errs.push(String(e)));
  if (o.speech) await page.addInitScript(SPEECH, o.speech);
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
const practice = async (p, tense, mode) => p.evaluate(([t, m]) => { setTab("practice"); S().currentTense = t; state.mode = m; newExercise(); }, [tense, mode]);

// =====================================================================================================================
// FORMAS: cada idioma contra la tabla de referencia
// =====================================================================================================================
for (const code of ["fr", "it", "pt", "en", "de", "pl", "ca", "el"]) {
  test("Formas · " + code + ": los motores coinciden con la tabla de referencia", async () => {
    const p = await open();
    const r = await p.evaluate(({ G, code }) => {
      const out = { ok: 0, bad: [], missing: [] }; state.lang = code; const Lg = LANGS[code];
      for (const key of Object.keys(G)) {
        const [tid, sk] = key.split("@"); const t = Lg.tenses.find((x) => x.id === tid);
        if (!t) { out.missing.push(key + " (no existe el tiempo)"); continue; }
        for (const verb of Object.keys(G[key])) {
          let v; try { v = verbByName(verb); } catch (e) { v = null; } if (!v) { out.missing.push(key + "/" + verb); continue; }
          for (const [pi, want] of Object.entries(G[key][verb])) {
            let got; try { got = Lg.conj(v, t.slots[+(sk || 0)].key, +pi); } catch (e) { got = "ERROR " + e.message; }
            const a = new Set(variants(got).map((x) => x.trim())), w = new Set(variants(want).map((x) => x.trim()));
            if (a.size === w.size && [...a].every((x) => w.has(x))) out.ok++; else out.bad.push(`${key} ${verb} [${Lg.pron[+pi]}]: la app da «${got}», la referencia «${want}»`);
          }
        }
      }
      return out;
    }, { G: GOLD[code], code });
    ok(r.ok > 0 && r.bad.length === 0 && r.missing.length === 0, r.ok + " formas coinciden" + (r.bad.length ? " · " + r.bad.length + " discrepancias" : "") + (r.missing.length ? " · faltan " + r.missing.length : ""));
    r.bad.slice(0, 8).forEach((x) => console.log("      ✗ " + x)); r.missing.slice(0, 5).forEach((x) => console.log("      ? " + x));
    noErrors(p);
  });
}

// =====================================================================================================================
// ACENTOS: se exigen solo donde distinguen dos formas reales
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

test("Acentos · obligatorios donde distinguen formas, opcionales en el resto", async () => {
  const p = await open();
  const casos = [
    ["de", "fahrt", "fährt", false], ["de", "fährt", "fährt", true], ["de", "fahrt", "fahrt", true], ["de", "musst", "müsst", false], ["de", "warst", "wärst", false],
    ["pt", "falamos", "falámos", false], ["pt", "falámos", "falámos", true], ["pt", "falamos", "falamos", true], ["pt", "tem", "têm", false], ["pt", "têm", "têm", true],
    ["pl", "pracuje", "pracuję", false], ["pl", "pracuję", "pracuję", true], ["pl", "pracuje", "pracuje", true], ["ca", "cantes", "cantés", false], ["ca", "cantés", "cantés", true],
    ["fr", "mange", "mangé", true], ["fr", "ai mange", "ai mangé", true], ["it", "parlero", "parlerò", true], ["el", "γραφω", "γράφω", true], ["en", "went", "went", true]
  ];
  const r = await p.evaluate((cs) => cs.map(([code, typed, ans, want]) => { state.lang = code; return [code + " «" + typed + "» para «" + ans + "»", matches(typed, ans) === want]; }), casos);
  r.forEach(([m, good]) => ok(good, m + (good ? "" : " → resultado contrario al esperado")));
  const amb = await p.evaluate(() => Object.fromEntries(Object.keys(LANGS).map((c) => [c, ambKeys(c).size > 0])));
  eq(amb, { fr: false, it: false, pt: true, en: false, de: true, pl: true, ca: true, el: false }, "idiomas con formas que solo se distinguen por el acento");
  noErrors(p);
});

test("Acentos · aviso al aceptar sin ellos y corrección donde importan (en pantalla)", async () => {
  const p = await open("fr");
  await p.evaluate(() => { chooseLang("fr"); setTab("practice"); S().currentTense = "present"; state.mode = "gap"; state.current = { kind: "gap", a: verbByName("répondre"), b: verbByName("répondre"), i: 0, marker: "En ce moment,", tenseId: "present" }; renderPractice(); });
  await p.fill("#panelPractice input.ans", "reponds"); await p.locator("#panelPractice button", { hasText: /Comprobar/ }).click();
  ok(await p.locator("#panelPractice input.ans.ok").count() === 1, "francés: «reponds» (sin acento) se acepta");
  eq(await txt(p.locator("#panelPractice .fix.soft")), "con acento: réponds", "y se avisa con la forma correcta");
  ok((await txt(p.locator(".banner"))).includes("Ojo con los acentos"), "el aviso general también sale");
  await p.evaluate(() => { chooseLang("de"); setTab("practice"); S().currentTense = "praesens"; state.mode = "gap"; const t = T("praesens"); state.current = { kind: "gap", a: verbByName("fahren"), b: verbByName("fahren"), i: 2, marker: t.markers[0], tenseId: "praesens" }; renderPractice(); });
  await p.fill("#panelPractice input.ans", "fahrt"); await p.locator("#panelPractice button", { hasText: /Comprobar/ }).click();
  ok(await p.locator("#panelPractice input.ans.bad").count() === 1, "alemán: «fahrt» para «er fährt» se rechaza");
  eq(await txt(p.locator("#panelPractice .fix")), "→ fährt", "y se muestra la forma correcta");
  noErrors(p);
});

// =====================================================================================================================
// IRREGULARES Y REPETICIÓN ADAPTATIVA
// =====================================================================================================================
test("Irregulares · se mezclan por defecto, sin pasar de un tercio", async () => {
  const p = await open("de");
  const r = await p.evaluate(() => { let irr = 0, tot = 0, sizes = new Set(); for (let k = 0; k < 200; k++) { const names = poolFor("praesens"); sizes.add(names.length); names.forEach((n) => { tot++; if (!LANGS.de.hasReg(n)) irr++; }); } return { d: state.includeIrregulars, dd: state.dictIrregulars, pct: Math.round(100 * irr / tot), sizes: [...sizes] }; });
  eq([r.d, r.dd], [true, true], "activados por defecto en tabla/hueco y en dictado");
  ok(r.pct >= 25 && r.pct <= 40, "irregulares: " + r.pct + " % de los verbos de una tabla (esperado un tercio)");
  eq(r.sizes, [15], "10 regulares + 5 irregulares en cada vuelta");
  await p.evaluate(() => { state.includeIrregulars = false; });
  eq(await p.evaluate(() => poolFor("praesens").length), 10, "apagando el interruptor vuelven solo los regulares");
  noErrors(p);
});

test("Repetición adaptativa · lo fallado vuelve a los 3 ejercicios, se explica y se olvida al acertar", async () => {
  const p = await open("fr"); await practice(p, "present", "gap");
  const b = (re) => p.locator("#panelPractice button", { hasText: re });
  const c0 = await p.evaluate(() => ({ v: state.current.a.inf, i: state.current.i, turn: S().turn }));
  await p.fill("#panelPractice input.ans", "zzz"); await b(/Comprobar/).click();
  eq(await p.evaluate(() => S().retry.present.map((x) => [x.inf, x.i, x.step, x.due - S().turn])), [[c0.v, c0.i, 1, 3]], "al fallar queda pendiente, a 3 ejercicios");
  const seq = [];
  for (let k = 0; k < 3; k++) { await b(/Siguiente/).click(); seq.push(await p.evaluate(() => ({ v: state.current.a.inf, i: state.current.i, retry: !!state.current.retry, pill: /fallo anterior/.test(document.querySelector("#panelPractice .pills").innerText) }))); }
  eq([seq[0].retry, seq[1].retry, seq[2].retry], [false, false, true], "no vuelve antes: reaparece justo en el tercero");
  eq([seq[2].v, seq[2].i, seq[2].pill], [c0.v, c0.i, true], "es el mismo verbo y persona, con la pastilla «incluye un fallo anterior»");
  const a = await p.evaluate(() => document.querySelector("#panelPractice input.ans").dataset.answer);
  await p.fill("#panelPractice input.ans", a.split("|")[0]); await b(/Comprobar/).click();
  eq(await p.evaluate(() => S().retry.present), [], "al acertarlo se olvida");
  await b(/Siguiente/).click(); await p.fill("#panelPractice input.ans", "qqq"); for (let k = 0; k < 4; k++) await b(/Comprobar/).click();
  eq(await p.evaluate(() => S().retry.present.map((x) => x.step)), [1], "pulsar «Comprobar» varias veces con la misma respuesta no lo agrava");
  await p.click("#btnReset"); eq(await p.evaluate(() => [S().retry.present.length, state.current.retry === true]), [1, true], "«Reiniciar sesión» no borra lo fallado: se conserva y sale primero");
  noErrors(p);
});

// =====================================================================================================================
// PROGRESO GUARDADO: solo un test final superado deja el tiempo en dorado (y queda guardado)
// =====================================================================================================================
const KEY = "conjugario:progreso";
const fillTable = (p) => p.evaluate(() => { document.querySelectorAll("#panelPractice input.ans").forEach((i) => { i.value = cleanFill(i.dataset.answer); }); });
async function answerTest(p, good) {   // contesta las 8 preguntas del test cerrado por la pantalla: todas bien o todas mal
  for (let k = 0; k < 8; k++) {
    const idx = await p.evaluate((g) => { const s = state.testSession, q = s.questions[s.qi]; return q.options.findIndex((o) => isOptionCorrect(q, o) === g); }, good);
    await p.locator("#panelPractice .optbtn").nth(idx).click();
    await p.locator("#panelPractice button", { hasText: /Siguiente pregunta|Ver resultado/ }).click();
  }
}
const unlockTest = (p) => p.evaluate(() => { const st = S().stats[S().currentTense]; Object.keys(st.modesDone).forEach((k) => { st.modesDone[k] = true; }); renderPractice(); });
const stored = (p) => p.evaluate((k) => localStorage.getItem(k), KEY);

test("Progreso · la práctica suelta no guarda nada y un test suspendido tampoco", async () => {
  const p = await open("it"); await practice(p, "imperativo", "table");
  await fillTable(p); await p.locator("#panelPractice button", { hasText: /Comprobar/ }).click(); await p.waitForSelector(".banner.show");
  ok(await p.locator(".chip.mastered").count() === 1, "la tabla sin fallos marca ✓ («tabla perfecta») en la sesión");
  ok(await p.locator(".chip.gold").count() === 0, "pero eso no es «dominado»: no hay botón dorado");
  eq(await stored(p), null, "y no se escribe nada en localStorage");
  await unlockTest(p); await p.locator("#testcta button").click(); await answerTest(p, false);
  ok(await p.locator(".testscore").innerText() === "0%", "test con todo mal: 0 %");
  ok(await p.locator(".goldnote.soft").count() === 1 && /nota necesaria: 80 %/.test(await txt(p.locator(".goldnote.soft"))), "la pantalla explica qué nota hace falta para el dorado");
  ok(await p.locator(".chip.gold").count() === 0, "suspender no da dorado");
  eq(await stored(p), null, "ni guarda nada");
  noErrors(p);
});

test("Progreso · superar el test deja el tiempo en dorado, guardado, y sobrevive a recargar y a «Reiniciar sesión»", async () => {
  const p = await open("it"); await practice(p, "imperativo", "table"); await unlockTest(p);
  await p.locator("#testcta button").click(); await answerTest(p, true);
  ok(await p.locator(".testscore").innerText() === "100%", "test con todo bien: 100 %");
  ok(await p.locator(".goldnote:not(.soft)").count() === 1 && /queda en dorado/.test(await txt(p.locator(".goldnote"))), "la pantalla de resultados lo anuncia");
  ok(await p.locator(".chip.gold").count() === 1 && await p.locator(".chip.gold").evaluate((c) => c.getAttribute("aria-selected")) === "true", "el botón del tiempo se vuelve dorado nada más acabar");
  ok(/mejor nota 100/.test(await p.locator(".chip.gold").getAttribute("title")), "y recuerda la nota en su ayuda emergente");
  const raw = JSON.parse(await stored(p));
  eq([raw.v, Object.keys(raw.d), Object.keys(raw.d.it), raw.d.it.imperativo.best, /^\d{4}-\d{2}-\d{2}$/.test(raw.d.it.imperativo.date)], [1, ["it"], ["imperativo"], 100, true], "se guarda solo ese tiempo de ese idioma, con la nota y la fecha");
  await p.reload(); await p.waitForFunction(() => window.__booted === true);
  ok(await p.locator(".chip.gold").count() === 1, "al recargar sigue dorado");
  ok(await p.locator(".chip.mastered").count() === 0, "mientras que lo demás de la sesión (✓) empieza de cero");
  await practice(p, "imperativo", "table");
  ok(await p.locator("#testcta button").count() === 1, "y su test final está disponible sin repetir los cuatro modos");
  await p.click("#btnReset");
  ok(await p.locator(".chip.gold").count() === 1, "«Reiniciar sesión» no quita el dorado");
  await practice(p, "imperativo", "table"); await p.locator("#testcta button").click(); await answerTest(p, false);
  ok(/sigue en dorado/.test(await txt(p.locator(".goldnote"))) && await p.locator(".chip.gold").count() === 1, "un mal intento posterior no lo quita");
  eq(JSON.parse(await stored(p)).d.it.imperativo.best, 100, "y se conserva la mejor nota");
  await p.evaluate(() => chooseLang("fr"));
  ok(await p.locator(".chip.gold").count() === 0, "en otro idioma ese tiempo no está dorado");
  noErrors(p);
});

test("Progreso · el examen por fases se supera con 95; con menos, no", async () => {
  const p = await open("de"); await practice(p, "praesens", "table");
  const run = (frac) => p.evaluate((frac) => { const t = T("praesens"); exStart(t); const s = state.examSession; s.exam.fases.forEach((f, gi) => f.items.forEach((_, i) => { s.pts[gi + "." + i] = exValor({ ...s, fi: gi }) * frac; })); exFinish(s, t); return { total: exTotal(s), gold: S().stats[t.id].gold, prog: s.prog }; }, frac);
  const low = await run(0.9);
  ok(low.total < 95 && low.gold === false && low.prog.gold === false, "con " + low.total + " de 100 («No superado») no hay dorado");
  eq(await stored(p), null, "ni se guarda nada");
  ok(/nota necesaria: 95 de 100/.test(await txt(p.locator(".goldnote.soft"))), "la pantalla dice que hace falta 95 de 100");
  const high = await run(1);
  ok(high.total === 100 && high.gold === true, "con " + high.total + " de 100 («Superado») sí");
  eq(JSON.parse(await stored(p)).d.de.praesens.best, 100, "y se guarda");
  ok(await p.locator(".chip.gold").count() === 1 && /queda en dorado/.test(await txt(p.locator(".goldnote"))), "el botón se vuelve dorado y la pantalla de resultados lo dice");
  noErrors(p);
});

test("Progreso · un guardado ilegible o ajeno se ignora y, si el navegador no deja guardar, el dorado dura la sesión", async () => {
  for (const basura of ["{roto", "null", '{"v":2,"d":{}}', '{"v":1,"d":{"zz":{"a":{"best":90}},"it":{"imperativo":{"best":"x"},"__proto__":{"best":99},"no valido!":{"best":70}}}}']) {
    const ctx = await browser.newContext(); ctxs.push(ctx); await ctx.route((u) => !u.href.startsWith(BASE), (r) => r.abort());
    await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch (e) { } }, [KEY, basura]);
    const p = await ctx.newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(String(e)));
    await p.goto(BASE + "index.html#it"); await p.waitForFunction(() => window.__booted === true);
    ok(await p.locator(".chip.gold").count() === 0 && ({}).best === undefined, "guardado «" + basura.slice(0, 24) + "…» → arranca sin dorados y sin contaminar nada");
    noErrors(p);
  }
  const ctx = await browser.newContext(); ctxs.push(ctx); await ctx.route((u) => !u.href.startsWith(BASE), (r) => r.abort());
  await ctx.addInitScript(() => { Storage.prototype.setItem = function () { throw new Error("cuota"); }; });
  const p = await ctx.newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(String(e)));
  await p.goto(BASE + "index.html#it"); await p.waitForFunction(() => window.__booted === true);
  await practice(p, "imperativo", "table"); await unlockTest(p); await p.locator("#testcta button").click(); await answerTest(p, true);
  ok(await p.locator(".chip.gold").count() === 1 && /No se ha podido guardar/.test(await txt(p.locator(".goldnote"))), "sin poder guardar: sigue en dorado y la pantalla avisa de que no se ha guardado");
  await p.click("#infoBtn"); ok(/no deja guardar datos/.test(await txt(p.locator("#infoProg"))) && await p.locator("#infoProg .sdot.ok").count() === 0, "la ayuda también avisa");
  await p.keyboard.press("Escape"); await p.click("#btnReset");
  ok(await p.locator(".chip.gold").count() === 1, "y «Reiniciar sesión» tampoco lo quita");
  noErrors(p);
});

test("Progreso · otra pestaña abierta se entera al momento y el borrado se hace desde la ayuda, con confirmación", async () => {
  const a = await open("it"); const b = await a.context().newPage(); b.errs = []; b.on("pageerror", (e) => b.errs.push(String(e)));
  await b.goto(BASE + "index.html#it"); await b.waitForFunction(() => window.__booted === true);
  await practice(a, "imperativo", "table"); await unlockTest(a); await a.locator("#testcta button").click(); await answerTest(a, true);
  await b.waitForFunction(() => document.querySelectorAll(".chip.gold").length === 1, null, { timeout: 4000 });
  ok(true, "la otra pestaña muestra el dorado sin recargar");
  await b.click("#infoBtn");
  ok(/1 de 68 tiempos en dorado y 0 formas falladas/.test(await txt(b.locator("#infoProg"))), "la ayuda cuenta los tiempos dorados: «" + await txt(b.locator("#infoProg .info-status")) + "»");
  await b.click("#progDel"); ok(await b.locator("#progDelYes").isVisible() && await b.locator(".chip.gold").count() === 1, "borrar pide confirmación y todavía no borra");
  await b.click("#progDelNo"); ok(await b.locator("#progDel").isVisible() && (await stored(b)) !== null, "«Cancelar» lo deja todo como estaba");
  await b.click("#progDel"); await b.click("#progDelYes");
  ok(await b.locator(".chip.gold").count() === 0 && (await stored(b)) === null, "«Sí, borrar» quita los dorados y lo guardado");
  ok(/Todavía no hay nada guardado/.test(await txt(b.locator("#infoProg"))) && await b.locator("#progDel").count() === 0, "la ayuda lo refleja y el botón de borrar desaparece");
  await a.waitForFunction(() => document.querySelectorAll(".chip.gold").length === 0, null, { timeout: 4000 });
  ok(true, "y la primera pestaña también se entera");
  noErrors(a); noErrors(b);
});

// =====================================================================================================================
// AYUDA («Cómo funciona») E IDIOMA DESPLEGABLE
// =====================================================================================================================
test("Ayuda · botón «Cómo funciona» junto al del tema, con el mismo contenido que Vocabulando", async () => {
  const p = await open();
  eq(await p.evaluate(() => { const b = document.getElementById("infoBtn"); return [b.previousElementSibling.id, b.nextElementSibling]; }), ["themeBtn", null], "es el último botón de la cabecera, tras el del tema");
  await p.click("#infoBtn"); ok(await p.locator("#infoOverlay").isVisible(), "se abre también desde la pantalla de inicio");
  const cuerpo = await txt(p.locator("#infoOverlay"));
  for (const h of ["Cómo funciona Conjugario", "Teoría", "Prácticas", "Acentos y repetición de fallos", "Test final y tiempos dorados", "Dónde se guarda tu progreso", "En Mac, iPad o móvil", "Qué sale de tu navegador", "Créditos"])
    ok(cuerpo.includes(h), "tiene la sección «" + h + "»");
  ok(/95 de 100/.test(cuerpo) && /80 %/.test(cuerpo), "dice con qué nota se consigue el dorado");
  ok(/Todavía no hay nada guardado/.test(cuerpo), "y el estado de lo guardado");
  await p.keyboard.press("Escape"); ok(await p.locator("#infoOverlay").count() === 0 && await p.evaluate(() => document.activeElement.id) === "infoBtn", "Escape la cierra y el foco vuelve al botón");
  await p.click("#infoBtn"); await p.click("#infoClose"); ok(await p.locator("#infoOverlay").count() === 0, "la × la cierra");
  await p.click("#infoBtn"); await p.mouse.click(5, 5); ok(await p.locator("#infoOverlay").count() === 0, "pulsar fuera la cierra");
  await p.click("#infoBtn"); for (let k = 0; k < 6; k++) await p.keyboard.press("Tab");
  ok(await p.evaluate(() => !!document.activeElement.closest("#infoOverlay")), "con Tab el foco se queda dentro de la ventana");
  await p.keyboard.press("Escape");
  await p.evaluate(() => chooseLang("fr")); await p.click("#infoBtn"); ok(await p.locator("#infoOverlay").isVisible(), "y dentro de un idioma");
  noErrors(p);
});

test("Ayuda · cabe en el móvil y no desborda", async () => {
  const p = await open("pt", { viewport: { width: 390, height: 780 } });
  await p.click("#infoBtn");
  const r = await p.evaluate(() => { const m = document.querySelector(".modal-lg").getBoundingClientRect(); return { dentro: m.left >= 0 && m.right <= innerWidth && m.top >= 0 && m.bottom <= innerHeight, scroll: document.documentElement.scrollWidth > innerWidth + 1, interno: document.querySelector(".modal-lg").scrollWidth > document.querySelector(".modal-lg").clientWidth + 1 }; });
  eq(r, { dentro: true, scroll: false, interno: false }, "la ventana queda dentro de la pantalla, sin desplazamiento horizontal");
  noErrors(p);
});

test("Idioma · el chip despliega los 8 idiomas sobre el propio botón y se elige ahí mismo", async () => {
  const p = await open("fr");
  ok(await p.locator("#langChip").isVisible() && await p.locator("#langMenu").isHidden(), "dentro de un idioma hay chip y la lista está cerrada");
  await p.click("#langChip");
  ok(await p.locator("#langMenu").isVisible() && await p.locator(".langopt").count() === 8, "al pulsarlo se despliegan los 8 idiomas");
  eq(await p.evaluate(() => [...document.querySelectorAll(".langopt")].map((b) => b.dataset.lang)), ["fr", "it", "pt", "ca", "pl", "en", "de", "el"], "en el orden de la pantalla de inicio");
  eq(await p.evaluate(() => [document.querySelector('.langopt[aria-selected="true"]').dataset.lang, document.activeElement.dataset.lang, document.getElementById("langChip").getAttribute("aria-expanded")]), ["fr", "fr", "true"], "el actual va marcado y con el foco");
  const geo = await p.evaluate(() => { const m = document.getElementById("langMenu").getBoundingClientRect(), c = document.getElementById("langChip").getBoundingClientRect(); return { debajo: m.top >= c.bottom - 1 && m.top - c.bottom < 20, dentro: m.left >= 0 && m.right <= innerWidth }; });
  eq(geo, { debajo: true, dentro: true }, "queda pegada al botón y dentro de la pantalla");
  await p.click('.langopt[data-lang="de"]');
  eq(await p.evaluate(() => [state.lang, location.hash, document.getElementById("welcome").hidden, document.getElementById("app").hidden, document.getElementById("langMenu").hidden, document.getElementById("eyebrow").textContent, state.tab]), ["de", "#de", true, false, true, "Conjugación · Alemán", "theory"], "se cambia de idioma directamente, sin volver a la pantalla de inicio");
  ok(await p.locator("#langChip").innerText().then((t) => /DE/.test(t)), "el chip muestra el nuevo idioma");
  await p.click("#langChip"); await p.click('.langopt[data-lang="de"]');
  eq(await p.evaluate(() => [state.lang, document.getElementById("langMenu").hidden]), ["de", true], "elegir el idioma actual solo cierra la lista");
  await p.click("#langChip"); await p.keyboard.press("Escape");
  ok(await p.locator("#langMenu").isHidden() && await p.evaluate(() => document.activeElement.id) === "langChip", "Escape la cierra y devuelve el foco al botón");
  await p.click("#langChip"); await p.mouse.click(5, 5); ok(await p.locator("#langMenu").isHidden(), "pulsar fuera la cierra");
  await p.click("#langChip"); await p.keyboard.press("ArrowDown"); await p.keyboard.press("Enter");
  eq(await p.evaluate(() => state.lang), "el", "con el teclado: flecha abajo e Intro eligen el siguiente (tras alemán, griego)");
  await p.click("#brandBtn"); ok(await p.locator("#welcome").isVisible() && await p.locator("#langWrap").isHidden(), "«Conjugario» sigue llevando a la pantalla de inicio, sin chip");
  noErrors(p);
});

test("Idioma · la lista cabe en una pantalla de móvil", async () => {
  const p = await open("el", { viewport: { width: 390, height: 780 } });
  await p.click("#langChip");
  eq(await p.evaluate(() => { const m = document.getElementById("langMenu").getBoundingClientRect(); return [m.left >= 0, m.right <= innerWidth, document.documentElement.scrollWidth > innerWidth + 1]; }), [true, true, false], "la lista queda dentro de la pantalla");
  await p.click('.langopt[data-lang="pl"]'); eq(await p.evaluate(() => state.lang), "pl", "y se puede elegir con el dedo");
  noErrors(p);
});

// =====================================================================================================================
// FORMAS FALLADAS (se recuerdan de un día para otro), MEZCLAR TIEMPOS Y DORADOS POR IDIOMA
// =====================================================================================================================
const FKEY = "conjugario:fallos";
const fstored = (p) => p.evaluate((k) => localStorage.getItem(k), FKEY);
const failOne = async (p, tense) => {   // falla a propósito una forma del modo «hueco» y dice cuál
  await p.evaluate((t) => { state.mode = "gap"; S().currentTense = t; setTab("practice"); newExercise(); }, tense);
  const c = await p.evaluate(() => ({ v: state.current.a.inf, i: state.current.i }));
  await p.fill("#panelPractice input.ans", "zzz"); await p.locator("#panelPractice button", { hasText: /Comprobar/ }).click();
  return c;
};

test("Formas falladas · se guardan, vuelven al abrir otro día y se olvidan al acertarlas", async () => {
  const p = await open("fr"); const c = await failOne(p, "present");
  const raw = JSON.parse(await fstored(p));
  eq([raw.v, Object.keys(raw.d), Object.keys(raw.d.fr), raw.d.fr.present.length, raw.d.fr.present[0].slice(0, 3)], [1, ["fr"], ["present"], 1, [c.v, c.i, 1]], "lo fallado queda guardado: verbo, persona, paso y fecha");
  eq(await stored(p), null, "y eso no da ningún dorado");
  await p.reload(); await p.waitForFunction(() => window.__booted === true);
  eq(await p.evaluate(() => S().retry.present.map((x) => [x.inf, x.i, x.step, x.due])), [[c.v, c.i, 1, 0]], "al recargar (otro día, otra sesión) sigue pendiente y sale en cuanto toca");
  await p.evaluate(() => { state.mode = "gap"; S().currentTense = "present"; setTab("practice"); });
  ok(await p.evaluate((v) => state.current.retry === true && state.current.a.inf === v, c.v), "el primer ejercicio es esa forma fallada");
  ok(/1 forma fallada pendiente/.test(await txt(p.locator("#retrynote"))), "y se avisa: «" + await txt(p.locator("#retrynote")) + "»");
  const a = await p.evaluate(() => document.querySelector("#panelPractice input.ans").dataset.answer);
  await p.fill("#panelPractice input.ans", a.split("|")[0]); await p.locator("#panelPractice button", { hasText: /Comprobar/ }).click();
  eq(await fstored(p), null, "al acertarla se olvida, y con nada pendiente no queda ni la clave");
  await p.reload(); await p.waitForFunction(() => window.__booted === true);
  eq(await p.evaluate(() => S().retry), {}, "y al recargar ya no hay nada");
  noErrors(p);
});

test("Formas falladas · fallar de nuevo la agrava, el botón de borrar la quita y lo ajeno o caducado se ignora", async () => {
  const p = await open("fr"); await failOne(p, "present");
  await p.evaluate(() => { const r = S().retry.present[0]; r.due = 0; });   // para que salga ya
  await p.evaluate(() => { state.mode = "gap"; S().currentTense = "present"; setTab("practice"); newExercise(); });
  ok(await p.evaluate(() => state.current.retry === true), "sale la forma pendiente");
  await p.fill("#panelPractice input.ans", "zzz"); await p.locator("#panelPractice button", { hasText: /Comprobar/ }).click();
  eq(JSON.parse(await fstored(p)).d.fr.present.map((x) => x[2]), [2], "fallarla otra vez sube el paso (vuelve más tarde)");
  await p.click("#infoBtn"); ok(/1 forma fallada/.test(await txt(p.locator("#infoProg"))), "la ayuda la cuenta");
  await p.click("#progDel"); await p.click("#progDelYes");
  eq([await fstored(p), await p.evaluate(() => S().retry)], [null, {}], "«Borrar progreso guardado» quita también las formas falladas");
  await p.keyboard.press("Escape");
  const v = await p.evaluate(() => LANGS.fr.tenses.find((t) => t.id === "present").pool[0]);
  const hoy = await p.evaluate(() => progToday());
  const viejo = new Date(Date.now() - 80 * 86400000).toISOString().slice(0, 10);
  await p.evaluate(([k, o]) => localStorage.setItem(k, JSON.stringify(o)), [FKEY, { v: 1, d: { fr: { present: [[v, 0, 9, "no es fecha"], ["toString", 0, 1, hoy], [v, 99, 1, hoy], [v, 1, 2, viejo], [v, 2, 2, hoy]], inexistente: [[v, 0, 1, hoy]] }, zz: { present: [[v, 0, 1, hoy]] } } }]);
  await p.reload(); await p.waitForFunction(() => window.__booted === true);
  eq(await p.evaluate(() => Object.fromEntries(Object.entries(S().retry).map(([k, l]) => [k, l.map((x) => [x.i, x.step])]))), { present: [[0, 4], [2, 2]] }, "solo entran las válidas (paso máximo 4, fecha corregida); caducadas, de otro idioma o con datos raros, no");
  for (const basura of ["{roto", "null", '{"v":2,"d":{}}']) { await p.evaluate(([k, b]) => localStorage.setItem(k, b), [FKEY, basura]); await p.reload(); await p.waitForFunction(() => window.__booted === true); eq(await p.evaluate(() => S().retry), {}, "guardado ilegible «" + basura + "»: se ignora"); }
  noErrors(p);
});

test("Formas falladas · si el navegador no deja guardar, sigue funcionando en la sesión", async () => {
  const ctx = await browser.newContext(); ctxs.push(ctx); await ctx.route((u) => !u.href.startsWith(BASE), (r) => r.abort());
  await ctx.addInitScript(() => { Storage.prototype.setItem = function () { throw new Error("cuota"); }; });
  const p = await ctx.newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(String(e)));
  await p.goto(BASE + "index.html#fr"); await p.waitForFunction(() => window.__booted === true);
  await failOne(p, "present");
  eq(await p.evaluate(() => S().retry.present.length), 1, "la forma fallada se recuerda dentro de la sesión");
  await p.click("#infoBtn"); ok(/no deja guardar datos/.test(await txt(p.locator("#infoProg"))), "y la ayuda avisa de que no se guarda");
  noErrors(p);
});

test("Mezclar tiempos · cada ejercicio sale en un tiempo distinto y elegir uno a mano lo apaga", async () => {
  const p = await open("fr"); await practice(p, "present", "table");
  const mixClick = () => p.locator("label.switch", { hasText: "Mezclar tiempos" }).click();
  ok(await p.locator("#mixSw").count() === 1 && !(await p.locator("#mixSw").isChecked()), "el interruptor existe y viene apagado");
  const sel = () => p.evaluate(() => [S().currentTense, document.querySelectorAll('.chip[aria-selected="true"]').length, document.querySelector('.chip[aria-selected="true"]').innerText.replace(/\s+/g, " ").trim()]);
  await mixClick();
  const visto = new Set(), hist = [], marcados = [];
  for (let k = 0; k < 14; k++) { const [t, n] = await sel(); hist.push(t); visto.add(t); marcados.push(n); await p.locator("#panelPractice button", { hasText: /Siguiente verbo/ }).click(); }
  ok(marcados.every((n) => n === 1), "siempre hay un solo botón de tiempo marcado: el que se está usando");
  ok(visto.size >= 4, "en 14 ejercicios han salido " + visto.size + " tiempos distintos");
  ok(hist.every((t, k) => k === 0 || t !== hist[k - 1]), "ninguno se repite dos veces seguidas");
  const ok_ = await p.evaluate(() => [S().currentTense, T(S().currentTense) && isUnlocked(T(S().currentTense))]); ok(ok_[1], "siempre uno de los disponibles");
  await p.locator("#panelPractice button", { hasText: /Siguiente verbo/ }).click();
  await p.evaluate(() => { document.querySelectorAll(".chip")[2].click(); });
  ok(!(await p.evaluate(() => state.mix)) && !(await p.locator("#mixSw").isChecked()), "elegir un tiempo a mano apaga la mezcla");
  const t0 = await p.evaluate(() => S().currentTense); await p.locator("#panelPractice button", { hasText: /Siguiente verbo/ }).click();
  eq(await p.evaluate(() => S().currentTense), t0, "y el tiempo ya no cambia");
  await mixClick(); await p.click('#panelPractice button[data-mode="dictation"]'); await p.click('#panelPractice button[data-mode="drill"]');
  ok(await p.evaluate(() => state.mix), "se mantiene al cambiar de modo");
  await p.evaluate(() => chooseLang("it")); ok(!(await p.evaluate(() => state.mix)), "al cambiar de idioma se apaga");
  noErrors(p);
});

test("Inicio · cada idioma dice cuántos tiempos dorados lleva", async () => {
  const p = await open();
  const ids = await p.evaluate(() => LANGS.fr.tenses.filter(isUnlocked).slice(0, 2).map((t) => t.id)), tot = await p.evaluate(() => LANGS.fr.tenses.filter(isUnlocked).length);
  const card = (c) => txt(p.locator('.choice[data-lang="' + c + '"] .cstar'));
  ok(/^★ 0 de \d+$/.test(await card("fr")) && await p.locator(".cstar.on").count() === 0, "al principio, ★ 0 de " + tot + " y sin resaltar");
  await p.evaluate(([k, i]) => localStorage.setItem(k, JSON.stringify({ v: 1, d: { fr: { [i[0]]: { best: 99, date: "2026-11-03" }, [i[1]]: { best: 96, date: "2026-11-03" } } } })), [KEY, ids]);
  await p.reload(); await p.waitForFunction(() => window.__booted === true);
  eq(await card("fr"), "★ 2 de " + tot, "con dos guardados: «★ 2 de " + tot + "»");
  eq(await p.locator(".cstar.on").count(), 1, "solo se resalta el idioma que tiene dorados");
  await p.evaluate(() => chooseLang("it")); await practice(p, "imperativo", "table"); await unlockTest(p); await p.locator("#testcta button").click(); await answerTest(p, true);
  await p.click("#brandBtn");
  ok(/^★ 1 de \d+$/.test(await card("it")) && /^★ 2 de/.test(await card("fr")), "al volver al inicio tras conseguir otro, se actualiza");
  await p.click("#infoBtn"); await p.click("#progDel"); await p.click("#progDelYes");
  ok(/^★ 0 de/.test(await card("fr")), "y al borrar el progreso vuelve a cero");
  const help = await txt(p.locator("#infoOverlay"));
  ok(/Mezclar tiempos/.test(help) && /formas que has fallado/.test(help), "la ayuda explica la mezcla y las formas falladas");
  noErrors(p);
});

// =====================================================================================================================
// IMPERATIVO Y SUBJUNTIVO
// =====================================================================================================================
const NUEVOS = [["fr", "imperatif", ["tu", "nous", "vous"]], ["fr", "subjonctif", [/^que j(e|’)$/, "que tu", "qu’il/elle/on", "que nous", "que vous", "qu’ils/elles"]],
  ["it", "imperativo", ["tu", "lui/lei", "noi", "voi", "loro"]], ["pt", "imperativo", ["tu", "ele/ela/você", "nós", "eles/elas/vocês"]],
  ["pt", "conjuntivo", ["eu", "tu", "ele/ela/você", "nós", "eles/elas/vocês"]], ["en", "imperative", ["you", "we"]], ["de", "imperativ", ["du", "wir", "ihr", "sie/Sie"]],
  ["pl", "rozkazujacy", ["ty", "on/ona/ono", "my", "wy", "oni/one"]], ["ca", "imperatiu", ["tu", "ell/ella", "nosaltres", "vosaltres", "ells/elles"]], ["el", "prostaktiki", ["εσύ", "εσείς"]]];
for (const [code, tid, labels] of NUEVOS) {
  test("Tiempo nuevo · " + code + "/" + tid + ": teoría, cuatro modos y test final", async () => {
    const p = await open(code);
    const th = await p.evaluate((t) => { setTab("theory"); S().currentTense = t; renderSubtabs(); renderTheory(); return { sample: document.querySelectorAll("#panelTheory .sample").length, tips: document.querySelectorAll("#panelTheory .tip li").length, irr: document.querySelectorAll("#panelTheory .irrcard").length, locked: document.querySelectorAll(".subtabs .chip.locked").length }; }, tid);
    ok(th.sample === 4 && th.tips === 4 && th.irr > 0 && th.locked === 0, "teoría: " + th.sample + " ejemplos, " + th.tips + " consejos, " + th.irr + " irregulares y ninguna pestaña bloqueada");
    await practice(p, tid, "table");
    const rows = await p.evaluate(() => [...document.querySelectorAll("#panelPractice .conj .row .pron")].map((x) => x.innerText));
    ok(rows.length === labels.length && rows.every((r, k) => typeof labels[k] === "string" ? r === labels[k] : labels[k].test(r)), "la tabla solo tiene las personas de ese tiempo: " + rows.join(" · "));
    for (const mode of ["table", "gap", "drill", "dictation"]) {
      await p.click('#panelPractice button[data-mode="' + mode + '"]'); await p.waitForSelector("#panelPractice .card.main");
      await p.evaluate(() => { document.querySelectorAll("#panelPractice input.ans").forEach((i) => { i.value = cleanFill(i.dataset.answer); }); });
      await p.locator("#panelPractice button", { hasText: /Comprobar/ }).click(); await p.waitForSelector(".banner.show");
      ok(await p.locator(".banner.good").count() === 1, mode + ": la respuesta correcta se acepta");
    }
    const imperative = await p.evaluate(() => T(S().currentTense).imperative);
    if (imperative) {
      await p.click('#panelPractice button[data-mode="gap"]'); await p.waitForSelector("#panelPractice .sentence");
      const f = await p.evaluate(() => { const s = document.querySelector("#panelPractice .sentence").innerText.replace(/\s+/g, " ").trim(), m = state.current.marker.trim(); return { s, startsWithMarker: s.startsWith(m), pron: L().pron.some((x) => new RegExp("^" + m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s+" + x.split("/")[0] + "\\b", "i").test(s)) }; });
      ok(f.startsWithMarker && !f.pron, "la frase con hueco no lleva sujeto: «" + f.s + "»");
    }
    const test_ = await p.evaluate(() => { const st = S().stats[S().currentTense]; return Object.values(st.modesDone).every(Boolean); });
    ok(test_, "los cuatro modos acertados desbloquean el test final");
    await p.locator("#testcta button").click(); await p.waitForSelector("#panelPractice .optbtn");
    for (let k = 0; k < TEST_QN_DEFAULT; k++) { await p.locator("#panelPractice .optbtn").first().click(); const nx = p.locator("#panelPractice button", { hasText: /Siguiente|Ver resultado|Terminar|Finalizar/ }).first(); if (await nx.count()) await nx.click(); }
    ok(await p.evaluate(() => S().stats[S().currentTense].testDone), "el test final de 8 preguntas se puede completar");
    noErrors(p);
  });
}
const TEST_QN_DEFAULT = 8;

test("Barrido · todos los tiempos de los 8 idiomas en teoría, cuatro modos y test", async () => {
  const p = await open();
  const r = await p.evaluate(() => {
    const out = { combos: 0, tiempos: 0, fallos: [] };
    for (const code of Object.keys(LANGS)) {
      chooseLang(code); setTab("practice");
      for (const t of LANGS[code].tenses) {
        out.tiempos++; S().currentTense = t.id;
        const tryit = (what, fn) => { out.combos++; try { fn(); } catch (e) { out.fallos.push(code + "/" + t.id + " " + what + ": " + e.message); } };
        tryit("teoría", () => { setTab("theory"); renderTheory(); }); setTab("practice");
        for (const m of ["table", "gap", "drill", "dictation"]) tryit(m, () => {
          state.mode = m;
          for (let k = 0; k < 4; k++) { newExercise(); if (!state.current) throw new Error("sin ejercicio");
            const ins = [...document.querySelectorAll("#panelPractice input.ans")]; if (!ins.length) throw new Error("sin casillas");
            ins.forEach((i) => { if (!matches(cleanFill(i.dataset.answer), i.dataset.answer)) throw new Error("no acepta su propia respuesta: " + i.dataset.answer); }); }
        });
        tryit("test", () => { if (examFor(t)) { exStart(t); exExit(); } else { startTest(t); state.testSession = null; } });
      }
    }
    return out;
  });
  ok(r.tiempos === 68 && r.fallos.length === 0, r.tiempos + " tiempos · " + r.combos + " comprobaciones · " + r.fallos.length + " fallos");
  r.fallos.slice(0, 8).forEach((x) => console.log("      ✗ " + x));
  noErrors(p);
});

test("Exámenes de siempre · siguen funcionando con el código nuevo", async () => {
  const p = await open("fr"); await practice(p, "present", "table");
  const r = await p.evaluate(() => { const t = T("present"); const e = examFor(t); exStart(t); return { hay: !!e, sesion: !!state.examSession, contenido: document.querySelector("#panelPractice").innerText.length }; });
  ok(r.hay && r.sesion && r.contenido > 50, "el examen por fases de «Présent» arranca y se dibuja");
  noErrors(p);
});

test("Móvil · los tiempos nuevos no desbordan en 390 px", async () => {
  for (const [code, tid] of [["pl", "rozkazujacy"], ["ca", "imperatiu"], ["fr", "subjonctif"], ["de", "imperativ"]]) {
    const p = await open(code, { viewport: { width: 390, height: 844 } }); await practice(p, tid, "table");
    eq(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, code + "/" + tid + ": sin desplazamiento horizontal en la práctica");
    await p.evaluate((t) => { setTab("theory"); S().currentTense = t; renderTheory(); }, tid);
    eq(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, code + "/" + tid + ": y en la teoría");
  }
});

// =====================================================================================================================
// =====================================================================================================================
// CAMBIO DE WEB: desplegable con el logo de cada app
// =====================================================================================================================
test("Cambio de web · desplegable con el logo de cada app (solo al abrir los archivos del disco)", async () => {
  const h = await open("fr"); ok(await h.locator("#appWrap").isHidden(), "por http no aparece: las rutas relativas entre carpetas no valdrían");
  const p = await openFile("Conjugario/index.html#fr");
  ok(await p.locator("#appChip").isVisible() && await p.locator("#appMenu").isHidden(), "desde el disco hay botón y la lista está cerrada");
  eq(await p.locator("#appChip svg.applogo").count(), 1, "el botón lleva el logo de esta web");
  await p.click("#appChip");
  ok(await p.locator("#appMenu").isVisible() && (await p.locator("#appChip").getAttribute("aria-expanded")) === "true", "al pulsarlo se despliega");
  eq(await p.locator(".appopt .appnm").allInnerTexts(), ["Vocabulando", "Conjugario", "Declinario"], "tres opciones, en este orden");
  eq(await p.locator(".appopt > svg.applogo").count(), 3, "cada opción empieza por su logo");
  eq(await p.evaluate(() => new Set([...document.querySelectorAll(".appopt > svg.applogo path")].map((x) => x.getAttribute("d"))).size), 3, "y los tres logos son distintos");
  eq(await p.evaluate(() => [...document.querySelectorAll(".appopt")].map((o) => o.tagName + ":" + (o.getAttribute("aria-current") || o.getAttribute("href")))),
    ["A:../Vocabulando/Vocabulando.html#fr", "SPAN:page", "A:../Declinario/index.html#fr"], "los otros dos son enlaces con el idioma abierto; esta web va marcada y no es un enlace");
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
  await p.click("#infoBtn"); ok(/Vocabulando \([^)]*\) o a Declinario/.test(await txt(p.locator("#infoOverlay"))), "la ayuda explica el botón del logo");
  await p.keyboard.press("Escape");
  noErrors(p); noErrors(h);
});

test("Cambio de web · en el móvil la cabecera no desborda y la lista cabe", async () => {
  for (const vp of [{ width: 390, height: 780 }, { width: 320, height: 700 }]) {
    for (const hash of ["", "#el"]) {
      const p = await openFile("Conjugario/index.html" + hash, { viewport: vp });
      await p.click("#appChip");
      eq(await p.evaluate(() => { const m = document.getElementById("appMenu").getBoundingClientRect(); return [m.left >= 0, m.right <= innerWidth, document.documentElement.scrollWidth <= innerWidth + 1]; }), [true, true, true],
        "a " + vp.width + " px " + (hash ? "dentro de un idioma" : "en la pantalla de inicio") + ": la lista cabe y la página no se ensancha");
      noErrors(p);
    }
  }
});


// =====================================================================================================================
// VOZ: solo con acento europeo
// =====================================================================================================================
const habla = async (p, code, texto = "falar") => { await p.evaluate(([c, x]) => speak(x, c), [code, texto]); return p.evaluate(() => window.__spoken.map((s) => ({ voz: s.voz, lang: s.lang }))); };
test("Voz · solo acento europeo: portugués de Portugal, inglés británico, francés de Francia…; sin voz europea no se habla y se avisa", async () => {
  // [idioma, voces, la que debe sonar (o null: no se habla y sale el aviso)]
  const casos = [
    ["pt", ["pt-BR"], null], ["pt", ["pt-BR", "pt-PT"], "voz pt-PT"], ["pt", ["pt-PT", "pt-BR"], "voz pt-PT"], ["pt", ["pt_PT"], "voz pt_PT"], ["pt", ["pt"], null],
    ["pt", ["pt-PT-x-lusitano"], "voz pt-PT-x-lusitano"], ["pt", ["pt-BR-x-paulista"], null],
    ["fr", ["fr-CA"], null], ["fr", ["fr-CA", "fr-FR"], "voz fr-FR"], ["fr", ["fr-CA", "fr-BE", "fr-FR"], "voz fr-FR"], ["fr", ["fr-CA", "fr-BE"], "voz fr-BE"],
    ["en", ["en-US"], null], ["en", ["en-US", "en-GB"], "voz en-GB"], ["en", ["en-AU", "en-IE"], "voz en-IE"],
    ["de", ["de-AT"], "voz de-AT"], ["de", ["de-AT", "de-DE"], "voz de-DE"], ["it", ["it-IT"], "voz it-IT"], ["ca", ["ca-ES"], "voz ca-ES"], ["pl", ["pl-PL"], "voz pl-PL"], ["el", ["el-GR"], "voz el-GR"]];
  for (const [code, voces, quiero] of casos) {
    const p = await open(code, { speech: voces }); const s = await habla(p, code);
    const aviso = await p.locator("#voiceToast.show").count();
    ok((quiero === null ? s.length === 0 && aviso === 1 : s.length === 1 && s[0].voz === quiero && s[0].lang === quiero.slice(4) && aviso === 0), code + " con " + JSON.stringify(voces) + ": " + (s.length ? s[0].voz : "no habla") + (aviso ? " + aviso" : ""));
    noErrors(p);
  }
});

test("Voz · una voz de red de Brasil ya no gana a una de Portugal del sistema, y el inglés es británico por defecto", async () => {
  const brRemota = { lang: "pt-BR", name: "Google português do Brasil", localService: false }, ptLocal = { lang: "pt-PT", name: "Microsoft Helia - Portuguese (Portugal)", localService: true };
  let p = await open("pt", { speech: [brRemota, ptLocal] });
  eq((await habla(p, "pt")).map((s) => s.voz), ["Microsoft Helia - Portuguese (Portugal)"], "con una pt-BR de red y una pt-PT del sistema, suena la de Portugal (antes ganaba la de red, brasileña)");
  eq((await habla(p, "pt")).map((s) => s.lang), ["pt-PT", "pt-PT"], "y la utterance lleva el idioma de la voz elegida");
  const enRemota = { lang: "en-GB", name: "Google UK English Female", localService: false }, enUs = { lang: "en-US", name: "Google US English", localService: false };
  p = await open("en", { speech: [enUs, enRemota] });
  eq((await habla(p, "en", "water")).map((s) => s.voz), ["Google UK English Female"], "inglés: la británica, aunque la americana esté primero en la lista");
  // dentro de las voces europeas de la misma etiqueta, la de red del navegador («Google …») va antes que la del sistema
  const frSis = { lang: "fr-FR", name: "Microsoft Hortense - French (France)", localService: true }, frRed = { lang: "fr-FR", name: "Google français", localService: false };
  p = await open("fr", { speech: [frSis, frRed] });
  eq((await habla(p, "fr", "maison")).map((s) => s.voz), ["Google français"], "francés: entre dos voces de Francia, la de red del navegador");
  p = await open("en", { speech: [] });
  eq(await habla(p, "en", "water"), [{ lang: "en-GB" }], "sin lista de voces, el inglés se pide como en-GB (no en-US)");
  p = await open("pt", { speech: [] });
  eq(await habla(p, "pt"), [{ lang: "pt-PT" }], "si el navegador no da lista de voces no se puede comprobar: se habla con el idioma pt-PT y sin aviso");
  eq(await p.locator("#voiceToast.show").count(), 0, "(sin aviso)");
  noErrors(p);
});

test("Voz · el aviso dice qué voces hay y permite «usar la que haya» (se recuerda con la misma clave que Vocabulando)", async () => {
  const p = await open("pt", { speech: ["pt-BR", "fr-FR"] });
  eq(await habla(p, "pt"), [], "con solo pt-BR no se habla");
  const t = await txt(p.locator("#voiceToast"));
  ok(/no tiene una voz con acento europeo en Portugués/.test(t) && /solo hay: pt-BR/.test(t) && /Configuración › Hora e idioma › Voz/.test(t) && /Mac: Ajustes del Sistema › Accesibilidad › Contenido leído/.test(t) && !/fr-FR/.test(t), "avisa de lo que falta y de lo que hay: «" + t + "»");
  await p.click("#voiceToast .voiceany");
  eq([await p.evaluate(() => localStorage.getItem("idiomas:anyVoice")), (await p.evaluate(() => window.__spoken)).map((s) => s.voz)], ["1", ["voz pt-BR"]], "«Usar la que haya» lo guarda y reproduce el audio con la voz disponible");
  eq(await p.locator("#voiceToast.show").count(), 0, "y el aviso se cierra");
  eq((await habla(p, "pt")).length, 2, "y a partir de ahí se habla siempre");
  // con voces de otros idiomas pero ninguna del idioma: aviso sin botón
  const q = await open("el", { speech: ["fr-FR"] });
  eq(await habla(q, "el", "σπίτι"), [], "sin voces del idioma, no se habla");
  eq([await q.locator("#voiceToast .voiceany").count(), /no tiene una voz con acento europeo en Griego/.test(await txt(q.locator("#voiceToast")))], [0, true], "el aviso no ofrece «usar la que haya» si no hay ninguna");
  // la clave ya puesta (p. ej. desde Vocabulando) vale
  const r = await open("pt", { speech: ["pt-BR"] }); await r.evaluate(() => localStorage.setItem("idiomas:anyVoice", "1"));
  eq((await habla(r, "pt")).map((s) => s.voz), ["voz pt-BR"], "con la clave puesta antes, también suena la de Brasil");
  noErrors(p); noErrors(q); noErrors(r);
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

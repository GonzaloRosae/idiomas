// Pruebas automáticas de Vocabulando. Uso: node run.js [texto]   (con «texto» solo se ejecutan las pruebas cuyo nombre lo contenga)
// Abren la app en un Chromium real con mazos sintéticos en el almacenamiento temporal del navegador: no tocan tus archivos
// (el servidor propio ni siquiera sirve .json) y bloquean internet (Wikcionario, Tatoeba, fuentes).
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const G = require("./gen.js");

const ROOT = process.env.VOC_ROOT ? path.resolve(process.env.VOC_ROOT) : path.join(__dirname, ".."); // VOC_ROOT: probar otra copia de la carpeta Vocabulando
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
let server, PORT = 0, BASE = "", browser;

function startServer() {
  return new Promise((res) => {
    server = http.createServer((req, rs) => {
      const p = decodeURIComponent(req.url.split("?")[0].split("#")[0]);
      const f = path.normalize(path.join(ROOT, p === "/" ? "Vocabulando.html" : p));
      if (!f.startsWith(ROOT) || f.includes("_pruebas") || path.extname(f) === ".json" || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); rs.end("no"); return; }
      rs.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-store" });
      fs.createReadStream(f).pipe(rs);
    }).listen(PORT, "127.0.0.1", () => { PORT = server.address().port; BASE = "http://127.0.0.1:" + PORT + "/"; res(); });
  });
}
function stopServer() { return new Promise((res) => { server.closeAllConnections && server.closeAllConnections(); server.close(() => res()); }); }

// ---- ayudantes que se inyectan en la página ----
// reloj simulado: la hora avanza sola desde el instante que se fije (componentes locales de la zona del navegador)
const CLOCK = (init) => {
  const R = Date; let off = 0;
  class F extends R { constructor(...a) { if (a.length === 0) super(R.now() + off); else super(...a); } static now() { return R.now() + off; } }
  window.Date = F;
  window.__at = (y, mo, d, h, mi, s) => { off = new R(y, mo - 1, d, h, mi, s || 0).getTime() - R.now(); };
  if (init) window.__at(...init);
};
// voz simulada: voices = ["de-DE", ...]; lo «pronunciado» queda en window.__spoken
const SPEECH = (voices) => {
  const spoken = []; window.__spoken = spoken;
  const list = voices.map((l) => typeof l === "string" ? { lang: l, name: "voz " + l, localService: true } : l); // texto = voz del sistema «voz xx-YY»; o un objeto {lang, name, localService}
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { getVoices: () => list, speak: (u) => spoken.push({ text: u.text, lang: u.lang, voz: u.voice && u.voice.name }), cancel() { }, addEventListener() { }, removeEventListener() { } } });
};

// ---- infraestructura de pruebas ----
const T = []; let passes = 0, fails = 0, ctxs = [];
function test(name, fn) { T.push({ name, fn }); }
function ok(c, m) { if (c) { passes++; console.log("   OK    " + m); } else { fails++; console.log("   FALLA " + m); } }
function eq(a, b, m) { const same = JSON.stringify(a) === JSON.stringify(b); ok(same, m + (same ? "" : "   [obtenido " + JSON.stringify(a) + " · esperado " + JSON.stringify(b) + "]")); }
const noErrors = (p) => ok(p.errs.length === 0, "sin errores de JavaScript" + (p.errs.length ? ": " + p.errs : ""));

// o: { lang, seed: {de: bucket}, prefs: {clave: valor}, now: [a,m,d,h,mi,s], tz, speech: [voces], picker: true, noPicker: true, viewport, html, url: false }
async function open(o = {}) {
  const ctx = await browser.newContext({ timezoneId: o.tz || "Europe/Madrid", viewport: o.viewport || { width: 1100, height: 900 } });
  ctxs.push(ctx);
  await ctx.route((u) => !u.href.startsWith(BASE), (r) => r.abort());
  const page = await ctx.newPage(); page.errs = [];
  page.on("pageerror", (e) => page.errs.push(String(e)));
  if (o.now) await page.addInitScript(CLOCK, o.now);
  if (o.speech) await page.addInitScript(SPEECH, o.speech);
  if (o.picker) await page.addInitScript(() => { window.showDirectoryPicker = async () => navigator.storage.getDirectory(); });
  if (o.noPicker) await page.addInitScript(() => { try { Object.defineProperty(window, "showDirectoryPicker", { value: undefined, configurable: true }); } catch (e) { window.showDirectoryPicker = undefined; } });
  await page.addInitScript(([seed, prefs]) => {
    try {
      if (localStorage.getItem("__seeded")) return;
      localStorage.setItem("__seeded", "1");
      for (const c in seed) localStorage.setItem("vocabulando:data:" + c, JSON.stringify(seed[c]));
      for (const k in prefs) localStorage.setItem(k, prefs[k]);
    } catch (e) { }
  }, [o.seed || {}, o.prefs || {}]);
  if (o.url !== false) { await page.goto(BASE + (o.html || "Vocabulando.html") + "#" + (o.lang || "de")); await page.waitForSelector("#view"); await page.waitForFunction(() => !document.querySelector("#view .empty") || !/Cargando/.test(document.querySelector("#view").innerText)); }
  return page;
}
// Abrir una de las tres webs directamente desde el disco (file://): así aparece el desplegable de webs, que por http se oculta
// porque las rutas relativas entre carpetas no valdrían. Internet sigue bloqueado.
const REPO = path.resolve(ROOT, "..");
async function openFile(rel, o = {}) {
  const ctx = await browser.newContext({ viewport: o.viewport || { width: 1100, height: 900 } }); ctxs.push(ctx);
  await ctx.route((u) => /^https?:/.test(u.href), (r) => r.abort());
  const page = await ctx.newPage(); page.errs = []; page.on("pageerror", (e) => page.errs.push(String(e)));
  await page.goto("file://" + path.join(REPO, rel)); await page.waitForSelector(".appchip:visible");
  return page;
}
const at = (page, str) => { const [d, t] = str.split(" "); const [y, mo, da] = d.split("-").map(Number), [h, mi, s] = t.split(":").map(Number); return page.evaluate((a) => window.__at(...a), [y, mo, da, h, mi, s || 0]); };
const stored = async (page, code = "de") => JSON.parse(await page.evaluate((c) => localStorage.getItem("vocabulando:data:" + c), code));
const txt = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();
async function study(page) { await page.click('.tab[data-tab="estudiar"]'); return { card: (await page.locator("#show").count()) > 0, done: (await page.locator(".done").count()) > 0, stats: await txt(page.locator(".stats")) }; }
async function rateOnce(page, name) { await page.click("#show"); await page.click('[data-rate="' + name + '"]'); await page.waitForFunction(() => !document.querySelector("[data-rate]")); }
const newDeck = (code, n, withReview) => ({ [code]: G.deck(code, n, withReview) });

// carpeta de datos simulada con el sistema de archivos privado del navegador (OPFS)
async function connectFolder(page, files) {
  await page.evaluate(async (fs) => {
    const root = await navigator.storage.getDirectory();
    for await (const k of root.keys()) await root.removeEntry(k);
    for (const n in fs) { const h = await root.getFileHandle(n, { create: true }); const w = await h.createWritable(); await w.write(fs[n]); await w.close(); }
  }, files);
  await page.locator('[data-act="pick-folder"]:visible').first().click();
}
const folderFile = (page, name) => page.evaluate(async (n) => (await (await (await navigator.storage.getDirectory()).getFileHandle(n)).getFile()).text(), name);
const writeFolder = (page, name, text) => page.evaluate(async ([n, t]) => { const h = await (await navigator.storage.getDirectory()).getFileHandle(n); const w = await h.createWritable(); await w.write(t); await w.close(); }, [name, text]);
const countIs = (page, n) => page.waitForFunction((n) => { const e = document.querySelector(".deck-count"); return e && e.textContent === n + " palabra" + (n === 1 ? "" : "s"); }, n, { timeout: 15000 });

// =====================================================================================================================
// CREAR: lista por tramos, guardar, editar, borrar
// =====================================================================================================================
const mazo = async (p) => { await p.click('.tab[data-tab="mazo"]'); await p.waitForSelector("#deckBody"); };
test("Mazo · lista por tramos con 2000 palabras", async () => {
  const p = await open({ seed: newDeck("de", 2000, false) });
  await p.waitForSelector(".deck-list");
  eq(await p.locator("li.row").count(), 5, "Crear solo enseña las 5 últimas añadidas (no dibuja 2000 filas)");
  await mazo(p);
  eq(await p.locator("li.row").count(), 100, "Mazo dibuja 100 filas de 2000");
  ok((await p.locator("li.row").first().innerText()).includes("palabra 1999"), "la primera fila es la más reciente");
  eq(await p.locator("#deckMoreInfo").innerText(), "Se muestran 100 de 2000", "texto del pie");
  await p.fill("#deckQ", "Wort1999"); await p.waitForFunction(() => document.getElementById("deckCount").textContent === "1 de 2000 palabras");
  await p.fill("#deckQ", ""); await p.waitForFunction(() => document.getElementById("deckCount").textContent === "2000 palabras");
  await p.click("#deckMore");
  eq(await p.locator("li.row").count(), 200, "«Mostrar 100 más» → 200 filas");
  await p.evaluate(() => { document.querySelectorAll("li.row")[5].__m = 1; });
  await p.locator("li.row").first().locator("[data-frase]").click();
  eq(await p.locator(".row-frase").count(), 1, "abrir una frase");
  ok(await p.evaluate(() => document.querySelectorAll("li.row")[5].__m === 1), "las demás filas no se redibujan");
  await p.click("#deckAll");
  eq(await p.locator("li.row").count(), 2000, "«Mostrar todas» → 2000 filas");
  eq(await p.locator("#deckMoreBar").count(), 0, "desaparece el pie");
  noErrors(p);
});

test("Crear · guardar, editar y borrar", async () => {
  const p = await open({ seed: newDeck("de", 30, false) });
  await p.waitForSelector(".deck-list");
  await p.fill("#esWord", "la prueba"); await p.fill("#deWord", "die Probe");
  await p.fill("#esSent", "Es una prueba."); await p.fill("#deSent", "Das ist eine Probe.");
  await p.click("#save"); await countIs(p, 31);
  const d = await stored(p);
  eq(d.deck.length, 31, "se guarda en el almacenamiento (31)");
  eq(d.deck[30].esSent, "Es una prueba", "la frase se guarda sin el punto final");
  await p.locator("li.row").first().locator("[data-edit]").click();
  await p.fill("#esWord", "la prueba EDITADA"); await p.click("#save");
  await p.waitForFunction(() => document.body.innerText.includes("la prueba EDITADA"));
  ok(true, "editar guarda el cambio");
  await p.locator("li.row").first().locator("[data-del]").click(); await p.click("#confirmYes"); await countIs(p, 30);
  eq((await stored(p)).deck.length, 30, "borrar deja 30");
  noErrors(p);
});

test("Mazo · cambiar de idioma reinicia el tope de la lista", async () => {
  const p = await open({ seed: { ...newDeck("de", 150, false), ...newDeck("fr", 20, false) } });
  await p.waitForSelector(".deck-list");
  await mazo(p); await p.click("#deckAll"); eq(await p.locator("li.row").count(), 150, "«todas» en alemán");
  await p.evaluate(() => { location.hash = "#fr"; }); await countIs(p, 20);
  await p.evaluate(() => { location.hash = "#de"; }); await countIs(p, 150);
  await mazo(p);
  eq(await p.locator("li.row").count(), 100, "al volver, el tope es otra vez 100");
  noErrors(p);
});

// ---- Mazo: buscar, filtrar, ordenar y editar desde la lista ----
const T0 = Date.parse("2026-01-01T10:00:00Z");
const bucket = (lang, entries, review = {}) => ({ app: "vocabulando", version: 2, lang, savedAt: new Date().toISOString(), review, stats: { reviewsTotal: 0, byDay: {} }, log: [],
  deck: entries.map((e, i) => ({ id: "x" + i, createdAt: T0 + i * 60000, esSent: "", deSent: "", ...e })) });
const cnt = (p) => txt(p.locator("#deckCount"));
const waitCount = (p, t) => p.waitForFunction((t) => document.getElementById("deckCount").textContent === t, t, { timeout: 8000 });
const find = async (p, q, t) => { await p.fill("#deckQ", q); await p.waitForTimeout(260); await waitCount(p, t); };   // el buscador espera una pausa corta antes de filtrar
const des = (p) => p.locator("li.row .row-de").allInnerTexts();

test("Mazo · el buscador no distingue mayúsculas ni acentos, junta varias palabras y busca en las frases", async () => {
  const p = await open({ seed: { de: bucket("de", [
    { esWord: "el coche", deWord: "das Auto", esSent: "Mi coche es rojo", deSent: "Mein Auto ist rot" },
    { esWord: "la calle", deWord: "die Straße" },
    { esWord: "el abrigo", deWord: "der Mantel", esSent: "Hace frío, ponte el abrigo", deSent: "Es ist kalt, zieh den Mantel an" },
    { esWord: "sobre", deWord: "über" },
    { esWord: "la escuela", deWord: "die Schule", esSent: "Voy a la escuela sobre ruedas", deSent: "Ich fahre mit dem Rad zur Schule" }]) } });
  await mazo(p);
  eq(await cnt(p), "5 palabras", "sin buscar: las 5");
  await find(p, "UBER", "1 de 5 palabras"); eq(await des(p), ["über"], "«UBER» encuentra «über»");
  await find(p, "strasse", "1 de 5 palabras"); eq(await des(p), ["die Straße"], "«strasse» encuentra «Straße»");
  await find(p, "frio", "1 de 5 palabras"); eq(await des(p), ["der Mantel"], "también dentro de las frases, sin acento");
  await find(p, "auto rot", "1 de 5 palabras"); eq(await des(p), ["das Auto"], "varias palabras: salen las entradas que las llevan todas (aunque estén en sitios distintos)");
  await find(p, "schule mantel", "0 de 5 palabras"); ok(true, "si cada palabra está en una entrada distinta, no sale ninguna (hacen falta todas)");
  await find(p, "sobre", "2 de 5 palabras"); eq(await des(p), ["die Schule", "über"], "sale lo más reciente primero: «sobre» está en una palabra y en una frase");
  await p.uncheck("#qSent"); await waitCount(p, "1 de 5 palabras"); eq(await des(p), ["über"], "sin «Buscar también en las frases» solo cuentan las palabras");
  await find(p, "zzz", "0 de 5 palabras");
  ok(/Ninguna entrada coincide/.test(await txt(p.locator("#deckBody"))), "si no hay nada, lo dice");
  await p.click("#deckBody .js-freset"); await waitCount(p, "5 palabras");
  eq([await p.inputValue("#deckQ"), await p.locator("li.row").count()], ["", 5], "«Quitar filtros» vacía el buscador y vuelve a mostrar todo");
  await p.fill("#deckQ", "  über  "); await waitCount(p, "1 de 5 palabras"); ok(true, "los espacios sobrantes no molestan");
  noErrors(p);
});

test("Mazo · filtros por estado, por frase y por género", async () => {
  const d = G.deck("de", 12, true);   // 12 palabras en repaso, con frase; i = 0,1,2,9,10,11 vencen el 5 de marzo
  const extra = [{ esWord: "el coche", deWord: "Auto" }, { esWord: "la casa", deWord: "das Haus", esSent: "Mi casa", deSent: "Mein Haus" }, { esWord: "el pez", deWord: "Fisch" }];
  extra.forEach((e, i) => { d.deck.push({ id: "n" + i, createdAt: T0 + (100 + i) * 60000, esSent: "", deSent: "", ...e }); });
  d.review["n2:word"] = { ...G.card(5, 1), state: 1, due: "2026-03-20T12:00:00.000Z" };   // «Fisch»: en aprendizaje, aún no toca
  const p = await open({ now: [2026, 3, 5, 12, 0, 0], seed: { de: d } }); await mazo(p);
  eq(await cnt(p), "15 palabras", "15 entradas");
  const sel = async (id, v, t) => { await p.selectOption("#" + id, v); await waitCount(p, t); };
  await sel("fState", "new", "2 de 15 palabras"); eq(await des(p), ["das Haus", "Auto"], "Nuevas: las que aún no se han estudiado");
  await sel("fState", "learning", "1 de 15 palabras"); eq(await des(p), ["Fisch"], "En aprendizaje");
  await sel("fState", "review", "12 de 15 palabras"); ok(true, "En repaso: las 12 con intervalo de días");
  await sel("fState", "due", "6 de 15 palabras"); ok(true, "Toca repasar: las 6 que vencen ya");
  await sel("fState", "all", "15 palabras");
  await sel("fSent", "without", "2 de 15 palabras"); eq(await des(p), ["Fisch", "Auto"], "Sin frase");
  await sel("fSent", "with", "13 de 15 palabras"); ok(true, "Con frase");
  await sel("fSent", "all", "15 palabras");
  eq(await p.locator("#fGender option").allInnerTexts(), ["Todos", "masculino", "femenino", "neutro", "ambiguo", "Sin género"], "el filtro de género ofrece los del idioma");
  await sel("fGender", "m", "4 de 15 palabras"); ok(true, "masculino: los «der» (4 de las 12)");
  await sel("fGender", "none", "2 de 15 palabras"); eq(await des(p), ["Fisch", "Auto"], "Sin género: lo que no tiene artículo ni género");
  await sel("fGender", "all", "15 palabras");
  await sel("fState", "review", "12 de 15 palabras"); await sel("fSent", "with", "12 de 15 palabras"); await sel("fGender", "f", "4 de 15 palabras");
  ok(await p.locator("#fReset").isVisible(), "con filtros puestos aparece «Quitar filtros»");
  await p.click("#fReset"); await waitCount(p, "15 palabras");
  eq(await p.evaluate(() => ["fState", "fSent", "fGender"].map((i) => document.getElementById(i).value)), ["all", "all", "all"], "y los deja todos en «Todas»");
  const en = await open({ lang: "en", seed: { en: G.deck("en", 5, false) } }); await mazo(en);
  eq(await en.locator("#fGender").count(), 0, "en inglés no hay filtro de género");
  noErrors(p); noErrors(en);
});

test("Mazo · orden: recientes, antiguas, alfabético sin contar el artículo, próximo repaso y más fallos", async () => {
  const E = [{ esWord: "el barco", deWord: "das Boot" }, { esWord: "la manzana", deWord: "der Apfel" }, { esWord: "el tiempo", deWord: "die Zeit" }, { esWord: "el tren", deWord: "ein Zug" }, { esWord: "el nuevo", deWord: "Zebra" }];
  const rv = {
    "x0:word": { ...G.card(7, 3), lapses: 0 }, "x1:word": { ...G.card(3, 3), lapses: 4 }, "x2:word": { ...G.card(5, 3), lapses: 2 }, "x3:word": { ...G.card(9, 3), lapses: 1 }
  };   // x4 («Zebra») es nueva
  const p = await open({ now: [2026, 3, 1, 12, 0, 0], seed: { de: bucket("de", E, rv) } }); await mazo(p);
  const ord = async (v) => { await p.selectOption("#fSort", v); await p.waitForTimeout(80); return des(p); };
  eq(await des(p), ["Zebra", "ein Zug", "die Zeit", "der Apfel", "das Boot"], "por defecto, lo más reciente primero");
  eq(await ord("old"), ["das Boot", "der Apfel", "die Zeit", "ein Zug", "Zebra"], "más antiguas");
  eq(await ord("az"), ["der Apfel", "das Boot", "Zebra", "die Zeit", "ein Zug"], "A-Z en alemán sin contar «der/die/das/ein»");
  eq(await ord("azEs"), ["el barco", "la manzana", "el nuevo", "el tiempo", "el tren"].map((x) => ({ "el barco": "das Boot", "la manzana": "der Apfel", "el nuevo": "Zebra", "el tiempo": "die Zeit", "el tren": "ein Zug" })[x]), "A-Z en español sin contar «el/la»");
  eq(await ord("due"), ["der Apfel", "die Zeit", "das Boot", "ein Zug", "Zebra"], "próximo repaso: lo que antes vence primero y lo nuevo al final");
  eq(await ord("lapses"), ["der Apfel", "die Zeit", "ein Zug", "Zebra", "das Boot"], "más fallos primero (a igual número, lo más reciente)");
  await p.selectOption("#fSort", "az"); await find(p, "ze", "2 de 5 palabras"); eq(await des(p), ["Zebra", "die Zeit"], "el orden elegido se mantiene al buscar");
  noErrors(p);
});

test("Mazo · editar o borrar desde la lista no te saca de ella", async () => {
  const p = await open({ seed: newDeck("de", 120, false) }); await mazo(p);
  await find(p, "Wort", "120 de 120 palabras");
  await find(p, "Wort1", "31 de 120 palabras");
  await p.evaluate(() => window.scrollTo(0, 900)); await p.waitForTimeout(50);
  const row = p.locator("li.row").nth(12); await row.scrollIntoViewIfNeeded();
  const y0 = await p.evaluate(() => window.scrollY), name = await row.locator(".row-de").innerText();
  await row.locator("[data-edit]").click();
  ok(await p.locator('.tab[data-tab="crear"]').evaluate((b) => b.classList.contains("is-active")), "el lápiz lleva a Crear");
  eq(await p.inputValue("#deWord"), name, "con la entrada cargada");
  await p.fill("#deWord", "das Geändert"); await p.click("#save");
  await p.waitForFunction(() => document.querySelector('.tab[data-tab="mazo"]').classList.contains("is-active"));
  eq(await p.inputValue("#deckQ"), "Wort1", "al guardar vuelves a Mazo con la búsqueda que tenías");
  ok(Math.abs((await p.evaluate(() => window.scrollY)) - y0) < 6, "y en el mismo punto de la lista");
  ok((await des(p)).includes("das Geändert"), "con el cambio hecho");
  await p.locator("li.row").first().locator("[data-edit]").click(); await p.click("#cancelEdit");
  ok(await p.locator('.tab[data-tab="mazo"]').evaluate((b) => b.classList.contains("is-active")), "cancelar también vuelve a Mazo");
  await p.locator("li.row").first().locator("[data-del]").click(); await p.click("#confirmYes");
  await waitCount(p, "30 de 119 palabras");
  eq(await p.inputValue("#deckQ"), "Wort1", "borrar desde Mazo mantiene la búsqueda y cuenta bien");
  // el lápiz de las últimas añadidas (en Crear) sigue siendo de Crear
  await p.click('.tab[data-tab="crear"]'); await p.locator("li.row").first().locator("[data-edit]").click(); await p.click("#cancelEdit");
  ok(await p.locator('.tab[data-tab="crear"]').evaluate((b) => b.classList.contains("is-active")), "editar desde Crear no te manda a Mazo");
  noErrors(p);
});

test("Crear · bajo el formulario quedan las 5 últimas añadidas y un enlace al mazo", async () => {
  const p = await open({ seed: newDeck("de", 30, false) });
  eq(await p.locator("li.row").count(), 5, "5 filas");
  ok((await p.locator("li.row").first().innerText()).includes("palabra 29"), "la más reciente arriba");
  eq(await txt(p.locator(".deck-count")), "30 palabras", "y el total del mazo");
  await p.fill("#esWord", "la nueva"); await p.fill("#deWord", "die Neue"); await p.click("#save"); await countIs(p, 31);
  ok((await p.locator("li.row").first().innerText()).includes("die Neue"), "lo que acabas de guardar aparece arriba del todo");
  eq(await p.locator("li.row").count(), 5, "siguen siendo 5");
  await p.click("#goMazo");
  ok(await p.locator('.tab[data-tab="mazo"]').evaluate((b) => b.classList.contains("is-active")) && (await cnt(p)) === "31 palabras", "«Ver todo el mazo» abre Mazo");
  await p.evaluate(() => { location.hash = "#fr"; }); await p.waitForTimeout(100);
  await p.evaluate(() => { location.hash = "#de"; }); await p.waitForTimeout(100);
  await p.click('.tab[data-tab="mazo"]'); await p.fill("#deckQ", "Neue"); await p.waitForTimeout(260); await waitCount(p, "1 de 31 palabras");
  await p.evaluate(() => { location.hash = "#fr"; }); await p.waitForTimeout(100); await p.evaluate(() => { location.hash = "#de"; }); await p.waitForTimeout(100);
  await p.click('.tab[data-tab="mazo"]'); eq(await p.inputValue("#deckQ"), "", "al cambiar de idioma la búsqueda se vacía");
  const v = await open({ lang: "fr", seed: {} }); await v.click('.tab[data-tab="mazo"]');
  ok(/Todavía no hay palabras/.test(await txt(v.locator("#deckBody"))), "con el mazo vacío, Mazo lo explica");
  noErrors(p); noErrors(v);
});

test("Mazo · cuatro pestañas caben en el móvil y la ayuda lo explica", async () => {
  const p = await open({ viewport: { width: 390, height: 800 }, seed: newDeck("de", 40, true) }); await mazo(p);
  eq(await p.evaluate(() => [...document.querySelectorAll(".tab")].map((b) => b.textContent)), ["Crear", "Estudiar", "Mazo", "Actividad"], "las cuatro pestañas, en ese orden");
  eq(await p.evaluate(() => [document.documentElement.scrollWidth > innerWidth + 1, [...document.querySelectorAll(".tab")].every((b) => b.getBoundingClientRect().right <= innerWidth && b.getBoundingClientRect().left >= 0)]), [false, true], "sin desplazamiento horizontal y todas dentro de la pantalla");
  await p.click(".js-info:visible"); const h = await txt(p.locator("#infoOverlay"));
  ok(/Mazo/.test(h) && /no distingue mayúsculas ni acentos/.test(h) && /cambias de idioma sin pasar por la pantalla de inicio/.test(h), "la ayuda describe Mazo y el chip del idioma");
  noErrors(p);
});

// ---- racha general, resumen del selector, escribir la respuesta y pausar ----
const goPicker = async (p) => { await p.evaluate(() => { location.hash = ""; }); await p.waitForSelector("#pickStreak .ps-main"); };
const streakTxt = (p) => txt(p.locator("#pickStreak"));
const withDays = (code, n, days) => { const d = G.deck(code, n, false); d.stats.byDay = days; return d; };

test("Racha · cuenta los días en que llegas a la meta sumando todos los idiomas, y perdona un día suelto por semana", async () => {
  const p = await open({ now: [2026, 11, 10, 12, 0, 0], seed: {
    de: withDays("de", 3, { "2026-11-09": 6, "2026-11-08": 12, "2026-11-06": 10, "2026-11-05": 10, "2026-11-04": 3 }),
    fr: withDays("fr", 3, { "2026-11-09": 5, "2026-11-07": 4, "2026-11-04": 8 }) } });
  await goPicker(p);
  const s1 = await streakTxt(p);
  ok(/5 días de racha/.test(s1) && /Hoy 0 \/ 10/.test(s1) && /Mejor 5/.test(s1), "5 días de racha (el 7 no llegó, pero se perdona) y hoy aún puede cumplirse: «" + s1 + "»");
  await p.click('.lang-card[href="#de"]'); await p.waitForSelector(".deck-list"); await p.click('.tab[data-tab="actividad"]');
  const g = await txt(p.locator(".st-grid").first());
  ok(/RACHA 5 días seguidos/i.test(g) && /MEJOR RACHA 5 días/i.test(g) && /HOY 0 \/ 10 10 para la meta/i.test(g), "Actividad lo cuenta igual: " + g);
  ok((await p.evaluate(() => { const r = document.querySelector(".goal-row").getBoundingClientRect(); return document.querySelector(".goal-row + .act-sub").getBoundingClientRect().top - r.bottom; })) >= 12, "el texto explicativo no va pegado a la meta diaria");
  await p.selectOption("#goalSel", "20");
  eq(await p.evaluate(() => localStorage.getItem("vocabulando:goal")), "20", "la meta se guarda");
  ok(/RACHA 0 días seguidos/i.test(await txt(p.locator(".st-grid").first())), "con meta 20 no llegó ningún día");
  await p.selectOption("#goalSel", "5"); ok(/RACHA 5 días/i.test(await txt(p.locator(".st-grid").first())), "con meta 5 vuelve a salir (el día 7, con 4, sigue siendo el perdonado)");
  await p.selectOption("#goalSel", "1"); ok(/RACHA 6 días seguidos/i.test(await txt(p.locator(".st-grid").first())), "con meta 1 no hace falta perdonar nada: 6 días seguidos (del 4 al 9)");
  noErrors(p);
});

test("Racha · dos días fallados en una semana la rompen, y hoy cumplido la alarga", async () => {
  const p = await open({ now: [2026, 11, 10, 12, 0, 0], seed: { de: withDays("de", 3, { "2026-11-08": 12, "2026-11-06": 10, "2026-11-05": 10, "2026-11-04": 11 }) } });
  await goPicker(p);
  ok(/0 días de racha/.test(await streakTxt(p)) && /Mejor 4/.test(await streakTxt(p)), "faltan el 9 y el 7 (el 7 se perdona, el 9 no): racha 0 y mejor 4: «" + await streakTxt(p) + "»");
  const q = await open({ now: [2026, 11, 10, 12, 0, 0], seed: { de: withDays("de", 3, { "2026-11-10": 10, "2026-11-09": 10, "2026-11-08": 10 }) } });
  await goPicker(q);
  ok(/3 días de racha/.test(await streakTxt(q)) && /Hoy 10 \/ 10 ✓/.test(await streakTxt(q)), "con hoy cumplido cuenta hoy y se marca ✓: «" + await streakTxt(q) + "»");
  const r = await open({ now: [2026, 11, 11, 3, 0, 0], seed: { de: withDays("de", 3, { "2026-11-09": 10, "2026-11-10": 10 }) } });
  await goPicker(r);
  ok(/2 días de racha/.test(await streakTxt(r)) && /Hoy 10 \/ 10 ✓/.test(await streakTxt(r)), "a las 3 de la madrugada todavía es el día de estudio anterior (hasta las 4:00)");
  noErrors(p); noErrors(q); noErrors(r);
});

test("Racha · avisa al llegar a la meta del día", async () => {
  const p = await open({ prefs: { "vocabulando:goal": "2" }, seed: newDeck("de", 6, false) }); await study(p);
  await rateOnce(p, "Good"); ok(!/Meta de hoy/.test(await p.locator("#toast").innerText()), "con 1 de 2 todavía no");
  await rateOnce(p, "Good"); await p.waitForFunction(() => /Meta de hoy cumplida · 1 día de racha/.test(document.getElementById("toast").textContent));
  ok(true, "con el segundo repaso: «" + await txt(p.locator("#toast")) + "»");
  noErrors(p);
});

test("Selector · cada idioma dice cuántas tarjetas tocan (sin contar las pausadas)", async () => {
  const de = G.deck("de", 12, true); de.deck[0].paused = true;
  const p = await open({ now: [2026, 3, 5, 12, 0, 0], seed: { de, fr: G.deck("fr", 3, false) } });
  await goPicker(p);
  const card = (c) => txt(p.locator('.lang-card[href="#' + c + '"] .lc-stat'));
  eq(await card("de"), "10 por repasar · 12 palabras", "alemán: 6 palabras vencen con palabra y frase (12 tarjetas), menos las 2 de la pausada");
  eq(await card("fr"), "Al día · 3 palabras", "francés: nada que repasar");
  eq(await card("pl"), "Aún sin palabras", "polaco: vacío");
  ok(await p.locator('.lang-card[href="#de"] .lc-stat.has-due').count() === 1 && await p.locator('.lang-card[href="#fr"] .lc-stat.has-due').count() === 0, "solo se resalta el que tiene trabajo");
  await p.click('.lang-card[href="#de"]'); await p.waitForSelector(".deck-list"); await goPicker(p);
  eq(await card("de"), "10 por repasar · 12 palabras", "al volver desde un idioma sigue igual");
  noErrors(p);
});

const lib = (extra = {}) => bucket("de", [
  { esWord: "la manzana", deWord: "der Apfel" }, { esWord: "el gato", deWord: "die Katze (pl. Katzen) / der Kater" },
  { esWord: "la calle", deWord: "die Straße" }, { esWord: "la ciudad", deWord: "die Stadt" }, { esWord: "el niño", deWord: "das Kind", esSent: "El niño duerme", deSent: "Das Kind schläft" }], extra);
const front = (p) => txt(p.locator(".k-front"));
const typeInto = async (p, v) => { await p.fill("#typedIn", v); await p.click("#typedCheck"); await p.waitForSelector(".typed-res"); };

test("Escribir la respuesta · corrige con tolerancia, sugiere la nota y no confunde las teclas", async () => {
  const p = await open({ prefs: { "vocabulando:type": "1" }, seed: { de: lib() } }); await study(p);
  ok(await p.locator("#typedIn").isVisible() && await p.locator("#show").count() === 0, "con el modo activado hay un campo en vez de «Mostrar respuesta»");
  ok(await p.evaluate(() => document.activeElement && document.activeElement.id === "typedIn"), "y está enfocado");
  await p.fill("#typedIn", "jklñ0123p"); await p.click("#typedCheck", { trial: true });
  eq(await p.locator("[data-rate]").count(), 0, "las letras J K L Ñ y los números no valoran mientras escribes");
  await p.fill("#typedIn", "");
  await p.click("#typedCheck"); ok(/Escribe tu respuesta/.test(await txt(p.locator("#toast"))), "sin escribir nada no corrige: avisa");
  const cases = { "la manzana": ["Apfel", "near", "Hard", /falta el artículo/], "el gato": ["der Kater", "ok", "Good", /Correcto/], "la calle": ["die strasse", "near", "Hard", /mayúsculas y acentos/], "la ciudad": ["das Haus", "bad", "Again", /No coincide/] };
  const ratings = {};
  for (let k = 0; k < 4; k++) {
    const f = await front(p), c = cases[f];
    await p.fill("#typedIn", c[0]); await p.keyboard.press("Enter"); await p.waitForSelector(".typed-res");
    const res = await txt(p.locator(".typed-res"));
    ok(await p.locator(".typed-res." + c[1]).count() === 1 && c[3].test(res), f + " ← «" + c[0] + "»: " + res);
    eq(await p.locator(".r.suggested").getAttribute("data-rate"), c[2], "se sugiere «" + c[2] + "»");
    ratings[f] = c[2]; await p.click(".r.suggested"); await p.waitForFunction(() => !document.querySelector("[data-rate]"));
  }
  const d = await stored(p); eq(d.log.map((r) => r[2]), [2, 3, 2, 1], "lo valorado queda guardado con esas notas (Difícil, Bien, Difícil, Otra vez)");
  ok(await p.locator("#typedIn").count() === 1 && await p.locator("#typedIn").inputValue() === "", "la siguiente tarjeta trae el campo vacío");
  await p.fill("#typedIn", "abc"); await p.evaluate(() => window.dispatchEvent(new HashChangeEvent("hashchange")));
  eq(await p.inputValue("#typedIn"), "abc", "si la página se vuelve a dibujar mientras escribes (cambio de ventana…), lo escrito no se pierde");
  await p.click("#typedSkip"); ok(await p.locator(".typed-res").count() === 0 && await p.locator(".r.suggested").count() === 0, "«No lo sé» la muestra sin corregir ni sugerir nota");
  await p.click('[data-rate="Again"]'); await p.waitForFunction(() => !document.querySelector("[data-rate]"));
  await p.click('.seg-btn[data-mode="sentence"]'); ok(await p.locator("#show").count() === 1 && await p.locator("#typedIn").count() === 0, "en Frases no se escribe: sigue «Mostrar respuesta»");
  await p.click('.tab[data-tab="actividad"]'); await p.click("#typeSw");
  await study(p); ok(await p.locator("#show").count() === 1, "apagado el modo, vuelve «Mostrar respuesta»");
  noErrors(p);
});

test("Pausar · la entrada deja de salir al estudiar, se ve en Mazo y se reanuda desde allí", async () => {
  const p = await open({ seed: { de: lib() } }); await study(p);
  eq(await txt(p.locator(".stats")), "0 por repasar 5 nuevas hoy", "5 nuevas");
  const f0 = await front(p);
  await p.click(".k-pause");
  await p.waitForFunction(() => /pausada/.test(document.getElementById("toast").textContent)); ok(true, "avisa dónde encontrarla");
  ok((await front(p)) !== f0, "pasa a otra tarjeta");
  ok(/4 nuevas hoy/.test(await txt(p.locator(".stats"))) && /1 pausada/.test(await txt(p.locator(".stats"))), "quedan 4 y se anota «1 pausada»");
  ok((await stored(p)).deck.filter((e) => e.paused).length === 1, "se guarda en el mazo");
  await mazo(p); await p.selectOption("#fState", "paused"); await waitCount(p, "1 de 5 palabras");
  ok(await p.locator("li.row.is-paused .chip", { hasText: "pausada" }).count() === 1, "en Mazo sale marcada como pausada");
  await p.click("li.row [data-pause]"); await waitCount(p, "0 de 5 palabras");
  eq((await stored(p)).deck.filter((e) => e.paused).length, 0, "reanudarla la quita del archivo");
  await study(p); ok(/5 nuevas hoy/.test(await txt(p.locator(".stats"))) && !/pausada/.test(await txt(p.locator(".stats"))), "vuelve a la cola");
  noErrors(p);
});

test("Pausar · lo pausado no cuenta en la previsión y las entradas que fallas mucho se marcan como difíciles", async () => {
  const g = G.deck("de", 6, true);   // 6 palabras con palabra y frase en repaso
  g.review["id000001:word"] = { ...G.card(3, 8), lapses: 6, due: "2026-03-03T12:00:00.000Z" };
  g.deck[2].paused = true;
  const p = await open({ now: [2026, 3, 9, 12, 0, 0], seed: { de: g } }); await mazo(p);
  await p.selectOption("#fState", "hard"); await waitCount(p, "1 de 6 palabras");
  eq(await p.locator("li.row .chip-hard").count(), 1, "una entrada «difícil» (más de " + 4 + " fallos)");
  await p.selectOption("#fState", "due"); await waitCount(p, "5 de 6 palabras"); ok(true, "«Toca repasar» no incluye la pausada");
  await p.selectOption("#fState", "all");
  await p.click('.tab[data-tab="actividad"]');
  eq(await p.locator(".fc-n").first().innerText(), "10", "la previsión de hoy son 10 tarjetas (5 palabras × 2), sin las de la pausada");
  await study(p);
  let seen = false;
  for (let k = 0; k < 12 && !seen; k++) {
    if (await p.locator("#show").count() === 0) break;
    await p.click("#show"); if (await p.locator(".leech-note").count()) { seen = true; break; }
    await p.click('[data-rate="Good"]'); await p.waitForFunction(() => !document.querySelector("[data-rate]"));
  }
  ok(seen, "al mostrar la difícil sugiere cambiarla o pausarla");
  const id = await p.evaluate(() => document.querySelector(".leech-note [data-edit]").getAttribute("data-edit"));
  await p.click(".leech-note [data-pause]");
  ok((await stored(p)).deck.find((e) => e.id === id).paused === true, "«Pausarla» la aparta");
  noErrors(p);
});

// ---- hueco, dictado, otros idiomas y «Hoy» ----
const frases = (extra = {}) => bucket("de", [
  { esWord: "la manzana", deWord: "der Apfel", esSent: "Me como una manzana", deSent: "Ich esse einen Apfel gern" },
  { esWord: "el gato", deWord: "die Katze (pl. Katzen) / der Kater", esSent: "Los gatos duermen mucho", deSent: "Die Katzen schlafen viel" },
  { esWord: "la calle", deWord: "die Straße", esSent: "La calle es larga", deSent: "Die Straße ist lang" },
  { esWord: "la ciudad", deWord: "die Stadt" },
  { esWord: "la casa", deWord: "das Haus", esSent: "Mi casa es grande", deSent: "Das ist ein Wort" }], extra);   // la última frase no lleva la palabra: no sirve para hueco
const hint = (p) => txt(p.locator(".karte .k-trans").first());

test("Hueco · se tapa la palabra de la ficha en tu frase y se escribe con la forma que lleva", async () => {
  const p = await open({ prefs: { "vocabulando:cloze": "1" }, seed: { de: frases() } }); await study(p);
  eq(await p.locator(".seg-btn").allInnerTexts(), ["Palabras", "Frases", "Hueco"], "con el modo activado aparece la pestaña «Hueco»");
  await p.click('.seg-btn[data-mode="cloze"]');
  ok(/0 por repasar 3 nuevas hoy/.test(await txt(p.locator(".stats"))), "solo 3 frases valen (la que no lleva la palabra se descarta): " + await txt(p.locator(".stats")));
  const casos = { "Me como una manzana": ["Apfel", "ok", "Good", "Ich esse einen", "gern", /Correcto/], "Los gatos duermen mucho": ["Katze", "near", "Hard", "Die", "schlafen viel", /forma que pide la frase \(Katzen\)/], "La calle es larga": ["strasse", "near", "Hard", "Die", "ist lang", /mayúsculas y acentos \(Straße\)/] };
  const rating = {};
  for (let k = 0; k < 3; k++) {
    const es = await hint(p), c = casos[es];
    const fr = await p.locator(".k-cloze").evaluate((e) => ({ t: e.innerText.replace(/\s+/g, " ").trim(), blank: !!e.querySelector(".cloze-blank") }));
    ok(fr.blank && !/Apfel|Katzen|Straße/.test(fr.t) && fr.t.startsWith(c[3]) && fr.t.endsWith(c[4]), "«" + es + "» → «" + fr.t + "» (hueco en lugar de la palabra)");
    await typeInto(p, c[0]);
    ok(await p.locator(".typed-res." + c[1]).count() === 1 && c[5].test(await txt(p.locator(".typed-res"))), c[0] + " → " + c[1] + ": " + await txt(p.locator(".typed-res")));
    eq(await p.locator(".r.suggested").getAttribute("data-rate"), c[2], "se sugiere «" + c[2] + "»");
    ok(/Katzen|Apfel|Straße/.test(await txt(p.locator(".k-back-sent"))), "al corregir se ve la frase entera");
    await p.click(".r.suggested"); await p.waitForFunction(() => !document.querySelector("[data-rate]"));
  }
  const d = await stored(p); eq(Object.keys(d.review).sort(), ["x0:cloze", "x1:cloze", "x2:cloze"], "cada frase tiene su propia tarjeta de hueco");
  ok(await p.locator(".done").count() === 1, "y al terminar queda «todo al día»");
  await p.click('.seg-btn[data-mode="word"]'); ok(/5 nuevas/.test(await txt(p.locator(".stats"))), "las Palabras no se ven afectadas (5)");
  await p.click('.tab[data-tab="mazo"]'); await p.click('[data-del="x0"]'); await p.click("#confirmYes"); await waitCount(p, "4 palabras");
  ok(Object.keys((await stored(p)).review).every((k) => !k.startsWith("x0:")), "al borrar la palabra desaparece también su tarjeta de hueco");
  await p.click('.tab[data-tab="actividad"]'); await p.click("#clozeSw"); await study(p);
  eq(await p.locator(".seg-btn").allInnerTexts(), ["Palabras", "Frases"], "apagado el modo, desaparece la pestaña");
  noErrors(p);
});

test("Hueco · usa el tope de frases nuevas y no sale si no hay ninguna frase válida", async () => {
  const p = await open({ prefs: { "vocabulando:cloze": "1", "vocabulando:newSents": "1" }, seed: { de: frases() } }); await study(p);
  await p.click('.seg-btn[data-mode="cloze"]');
  ok(/1 nueva hoy/.test(await txt(p.locator(".stats"))) && /2 en espera/.test(await txt(p.locator(".stats"))), "con el tope de frases en 1 ofrece 1 y deja 2 en espera: " + await txt(p.locator(".stats")));
  const q = await open({ prefs: { "vocabulando:cloze": "1" }, seed: { de: bucket("de", [{ esWord: "la casa", deWord: "das Haus", esSent: "Mi casa", deSent: "Das ist ein Wort" }]) } }); await study(q);
  await q.click('.seg-btn[data-mode="cloze"]'); ok(/Ninguna frase sirve para un hueco/.test(await txt(q.locator(".study"))), "sin frases válidas lo explica");
  noErrors(p); noErrors(q);
});

test("Dictado · suena la frase, se escribe entera y se marca palabra por palabra", async () => {
  const p = await open({ speech: ["de-DE"], prefs: { "vocabulando:dict": "1" }, seed: { de: frases() } }); await study(p);
  eq(await p.locator(".seg-btn").allInnerTexts(), ["Palabras", "Frases", "Dictado"], "con voz y el modo activado aparece «Dictado»");
  await p.click('.seg-btn[data-mode="dict"]'); await p.waitForSelector("#typedIn");
  const spoken = () => p.evaluate(() => window.__spoken.map((x) => x.text));
  const oida = async () => (await spoken()).pop();
  ok((await spoken()).length >= 1, "la frase suena sola al aparecer la tarjeta");
  const antes = (await spoken()).length; await p.click(".k-dict [data-say]"); eq((await spoken()).length, antes + 1, "«Escuchar» la repite");
  await p.click("[data-say-slow]"); eq((await spoken()).length, antes + 2, "«Más despacio» también");
  await p.keyboard.press("p"); eq((await spoken()).length, antes + 3, "y la tecla P");
  const fr = await txt(p.locator(".karte")); ok(!/Apfel|Katzen|Straße|Wort/.test(fr), "antes de corregir no se ve la frase: «" + fr + "»");
  const mut = { 0: (t) => t.replace(/[.,!?]/g, "").replace(/^./, (c) => c.toLowerCase()), 1: (t) => t.replace(/Katzen|Apfel|Straße|Wort/, (w) => w.toLowerCase()), 2: (t) => t.replace(/(lang|viel|gern|Wort)$/, "kurz"), 3: () => "una frase que no tiene nada que ver" };
  const exp = [["ok", "Good"], ["near", "Hard"], ["near", "Hard"], ["bad", "Again"]];
  for (let k = 0; k < 4; k++) {
    const sent = await oida(); await p.fill("#typedIn", mut[k](sent)); await p.keyboard.press("Enter"); await p.waitForSelector(".typed-res");
    ok(await p.locator(".typed-res." + exp[k][0]).count() === 1, "«" + mut[k](sent) + "» → " + exp[k][0] + " (" + await txt(p.locator(".typed-res")) + ")");
    eq(await p.locator(".r.suggested").getAttribute("data-rate"), exp[k][1], "se sugiere «" + exp[k][1] + "»");
    if (k === 1) ok(await p.locator(".dd-acc").count() >= 1, "lo que solo falla en mayúscula o acento se subraya aparte");
    if (k === 2) ok(await p.locator(".dd-bad").count() === 1, "la palabra que falla se marca");
    await p.click(".r.suggested"); await p.waitForFunction(() => !document.querySelector("[data-rate]"));
  }
  eq(Object.keys((await stored(p)).review).sort(), ["x0:dict", "x1:dict", "x2:dict", "x4:dict"], "cada frase tiene su tarjeta de dictado");
  noErrors(p);
  const q = await open({ prefs: { "vocabulando:dict": "1" }, seed: { de: frases() } }); await q.click('.tab[data-tab="actividad"]');
  eq([await q.locator("#dictSw").count(), await q.locator('.tab[data-tab="estudiar"]').count()], [0, 1], "sin voz en el navegador no se ofrece el dictado");
  await study(q); eq(await q.locator(".seg-btn").allInnerTexts(), ["Palabras", "Frases"], "ni aparece la pestaña aunque estuviera activado");
  noErrors(q);
});

const otros = () => ({
  de: frases(),
  fr: bucket("fr", [{ esWord: "la manzana", deWord: "la pomme" }, { esWord: "la calle", deWord: "la rue" }]),
  it: bucket("it", [{ esWord: "manzana", deWord: "la mela" }]),
  pt: bucket("pt", [{ esWord: "La Manzana", deWord: "a maçã" }]) });

test("En tus otros idiomas · la misma palabra en los demás idiomas, al mostrar la respuesta y en Mazo", async () => {
  const p = await open({ seed: otros() }); await study(p);
  const q = async () => (await front(p));
  for (let k = 0; k < 5 && (await q()) !== "la manzana"; k++) { await p.click("#show"); await p.click('[data-rate="Good"]'); await p.waitForFunction(() => !document.querySelector("[data-rate]")); }
  eq(await q(), "la manzana", "llega «la manzana»");
  eq(await p.locator(".k-xl").count(), 0, "antes de mostrar la respuesta no se ve (no se revela)");
  await p.click("#show");
  const xl = await txt(p.locator(".k-xl"));
  ok(/la pomme/.test(xl) && /la mela/.test(xl) && /a maçã/.test(xl) && !/Apfel/.test(xl), "salen francés, italiano y portugués (mayúsculas, artículos y orden no estorban), no el propio idioma: «" + xl + "»");
  eq(await p.locator(".k-xl .flag").count(), 3, "cada uno con su bandera");
  await mazo(p);
  const filas = await p.locator("li.row").evaluateAll((r) => r.map((x) => [x.querySelector(".row-de").innerText, !!x.querySelector("[data-xl]")]));
  eq(Object.fromEntries(filas), { "das Haus": false, "die Stadt": false, "die Straße": true, "die Katze (pl. Katzen) / der Kater": false, "der Apfel": true }, "el botón «idiomas» solo sale donde hay coincidencias");
  await p.locator("li.row", { hasText: "der Apfel" }).locator("[data-xl]").click();
  eq(await txt(p.locator(".row-xl")), "la pomme la mela a maçã", "se despliegan en la fila");
  await p.locator("li.row", { hasText: "der Apfel" }).locator("[data-xl]").click(); eq(await p.locator(".row-xl").count(), 0, "y se pliegan");
  noErrors(p);
});

test("Mazo · lo que no siempre aparece va a la izquierda de los botones fijos de cada fila", async () => {
  const p = await open({ seed: otros() }); await mazo(p);
  const orden = await p.locator("li.row").evaluateAll((rs) => rs.map((x) => [...x.querySelectorAll(".row-meta > *")].map((e) => e.dataset.xl !== undefined ? "idiomas" : e.dataset.frase !== undefined ? "frase" : e.dataset.say !== undefined ? "escuchar" : e.dataset.ipa !== undefined ? "ipa" : e.dataset.pause !== undefined ? "pausar" : e.dataset.edit !== undefined ? "editar" : e.dataset.del !== undefined ? "eliminar" : "chip")));
  const fijos = ["escuchar", "ipa", "pausar", "editar", "eliminar"];
  ok(orden.length >= 4 && orden.every((o) => JSON.stringify(o.filter((k) => fijos.includes(k))) === JSON.stringify(fijos)), "los cinco botones fijos (con IPA) van siempre en el mismo orden: " + JSON.stringify(orden[0]));
  ok(orden.every((o) => { const iFijo = o.findIndex((k) => fijos.includes(k)); return o.every((k, i) => fijos.includes(k) || i < iFijo); }), "y todo lo condicional (chips, «idiomas», «frase») queda a su izquierda, sin cambiar de sitio los fijos");
  ok(orden.some((o) => o.includes("idiomas")) && orden.some((o) => o.includes("frase")), "(la prueba ve filas con «idiomas» y con «frase»)");
  noErrors(p);
});

test("Hoy · en Actividad: qué toca en cada idioma, con enlace, y el resumen de Conjugario", async () => {
  const cj = { v: 1, d: { fr: { present: { best: 99, date: "2026-03-01" }, passe: { best: 96, date: "2026-03-01" } }, de: { praesens: { best: 97, date: "2026-03-01" } } } };
  const fl = { v: 1, d: { fr: { present: [["manger", 0, 1, "2026-03-04"], ["aller", 2, 2, "2026-03-04"]] }, de: { praesens: [["gehen", 1, 1, "2026-03-04"]] } } };
  const p = await open({ now: [2026, 3, 5, 12, 0, 0], prefs: { "conjugario:progreso": JSON.stringify(cj), "conjugario:fallos": JSON.stringify(fl) }, seed: { de: G.deck("de", 12, true), fr: G.deck("fr", 3, false) } });
  await p.click('.tab[data-tab="actividad"]');
  eq(await p.locator("#view section.panel").first().locator(".panel-title").innerText(), "Hoy", "«Hoy» es la primera sección de Actividad");
  const top = await txt(p.locator("#view section.panel").first());
  ok(/12 por repasar y 6 nuevas entre todos los idiomas/.test(top) && /racha de 0 días/.test(top), "resumen de arriba: " + top.slice(0, 150));
  eq(await p.locator(".hoy-row").evaluateAll((r) => r.map((x) => x.innerText.replace(/\s+/g, " ").trim())), ["Alemán 12 por repasar Estudiar →", "Francés 6 nuevas Estudiar →"], "alemán (lo que más toca) antes que francés; los idiomas vacíos no salen");
  const conj = await txt(p.locator(".hoy-conj"));
  ok(/★ 3 tiempos dorados \(Francés 2, Alemán 1\)/.test(conj) && /3 formas falladas por repasar/.test(conj), "Conjugario: «" + conj + "»");
  await p.click('.hoy-row[data-lang="fr"]');
  await p.waitForFunction(() => document.querySelector('.tab[data-tab="estudiar"]').classList.contains("is-active") && /Francés/.test(document.getElementById("brandSub").textContent));
  ok(true, "pulsar un idioma lo abre directamente en Estudiar");
  await p.click('.tab[data-tab="actividad"]'); await p.click('.hoy-row[data-lang="fr"]');
  ok(await p.locator('.tab[data-tab="estudiar"]').evaluate((b) => b.classList.contains("is-active")), "y el idioma abierto también lleva a Estudiar");
  const q = await open({ prefs: { "conjugario:progreso": "{roto", "conjugario:fallos": '{"v":1,"d":{"zz":{"a":[["x"]]},"fr":"no"}}' }, seed: newDeck("de", 3, false) }); await q.click('.tab[data-tab="actividad"]');
  eq(await q.locator(".hoy-conj").count(), 0, "con datos de Conjugario ilegibles o ajenos, no se inventa nada");
  noErrors(p); noErrors(q);
});

test("Guardado · formato del archivo y reversión si falla", async () => {
  const p = await open({ seed: { ...newDeck("de", 40, true), ...newDeck("fr", 5, false) } });
  await p.waitForSelector(".deck-list");
  await p.fill("#esWord", "x"); await p.fill("#deWord", "y"); await p.click("#save"); await countIs(p, 41);
  const t = await p.evaluate(() => localStorage.getItem("vocabulando:data:de"));
  ok(t.startsWith('{\n"app":"vocabulando",\n"version":2,\n"lang":"de",'), "cabecera estable");
  const d = JSON.parse(t);
  ok(t.split("\n").includes(JSON.stringify(d.deck[0]) + ","), "una palabra por línea y sin sangrado");
  ok(t.split("\n").some((l) => l.startsWith('"' + Object.keys(d.review)[0] + '":')), "una tarjeta por línea");
  const fr0 = await p.evaluate(() => localStorage.getItem("vocabulando:data:fr"));
  await p.evaluate(() => { const o = Storage.prototype.setItem; window.__o = o; Storage.prototype.setItem = function (k, v) { if (/^vocabulando:data:/.test(k)) throw new Error("cuota"); return o.call(this, k, v); }; });
  await p.fill("#esWord", "no se guarda"); await p.fill("#deWord", "wird nicht gespeichert"); await p.click("#save");
  await p.waitForFunction(() => /No se pudo guardar/.test(document.getElementById("toast").textContent));
  eq(await txt(p.locator(".deck-count")), "41 palabras", "si falla el guardado se deshace el cambio");
  await p.evaluate(() => { Storage.prototype.setItem = window.__o; });
  eq(await p.evaluate(() => localStorage.getItem("vocabulando:data:fr")), fr0, "el otro idioma no se toca");
  await p.click("#save"); await countIs(p, 42);
  ok(true, "con el almacenamiento recuperado, guardar vuelve a funcionar");
  noErrors(p);
});

// =====================================================================================================================
// CARPETA DE DATOS
// =====================================================================================================================
test("Carpeta · lee el archivo con sangría, lo reescribe en formato nuevo y detecta cambios externos", async () => {
  const orig = G.deck("de", 2000, true), indented = JSON.stringify(orig, null, 1);
  const p = await open({ picker: true });
  await connectFolder(p, { "aleman.json": indented });
  await countIs(p, 2000); ok(true, "lee el archivo antiguo (con sangría): 2000 palabras");
  await p.fill("#esWord", "el archivo"); await p.fill("#deWord", "die Datei"); await p.click("#save"); await countIs(p, 2001);
  const t1 = await folderFile(p, "aleman.json"), d1 = JSON.parse(t1);
  ok(t1.startsWith('{\n"app":"vocabulando"') && d1.deck.length === 2001, "se reescribe en formato nuevo y sigue siendo JSON válido");
  ok(t1.length < indented.length * 0.85, "pesa menos: " + (indented.length / 1e6).toFixed(2) + " MB → " + (t1.length / 1e6).toFixed(2) + " MB");
  eq(d1.deck.slice(0, 2000), orig.deck, "las 2000 palabras de antes quedan idénticas");
  eq(d1.review, orig.review, "las tarjetas quedan idénticas");
  const ext = JSON.parse(t1); ext.deck.push({ id: "externo1", esWord: "externa", deWord: "extern", esSent: "", deSent: "", createdAt: Date.now() });
  await new Promise((r) => setTimeout(r, 30)); await writeFolder(p, "aleman.json", JSON.stringify(ext, null, 1));
  await p.evaluate(() => window.dispatchEvent(new Event("focus"))); await countIs(p, 2002);
  ok(true, "un cambio hecho a mano en el archivo se recoge (2002)");
  noErrors(p);
});

// =====================================================================================================================
// REPASOS: doble pulsación, nuevas por día, deshacer, fallo de guardado
// =====================================================================================================================
async function freshReviewDeck(n) { const g = G.deck("de", n, false); g.review = {}; g.stats = { reviewsTotal: 0, byDay: {} }; return g; }

test("Repaso · una doble pulsación no puntúa dos veces la misma tarjeta (con carpeta)", async () => {
  for (const how of ["teclado «l» «l»", "doble clic en «Bien»"]) {
    const p = await open({ picker: true });
    await connectFolder(p, { "aleman.json": JSON.stringify(await freshReviewDeck(300)) }); await countIs(p, 300);
    await p.click('.tab[data-tab="estudiar"]'); await p.click("#show");
    if (how.startsWith("teclado")) { await p.keyboard.press("l"); await p.keyboard.press("l"); } else await p.locator('[data-rate="Good"]').dblclick();
    await p.waitForTimeout(500);
    const f = JSON.parse(await folderFile(p, "aleman.json")), keys = Object.keys(f.review);
    eq([f.stats.reviewsTotal, keys.length, f.review[keys[0]].reps, f.review[keys[0]].state], [1, 1, 1, 1], how + ": 1 repaso, 1 tarjeta, 1 rep, en aprendizaje");
    noErrors(p);
  }
});

test("Repaso · si no se puede guardar, la tarjeta no avanza", async () => {
  const p = await open({ seed: { de: await freshReviewDeck(10) } });
  await p.waitForSelector(".deck-list"); await p.click('.tab[data-tab="estudiar"]'); await p.click("#show");
  const front = await txt(p.locator(".k-front"));
  await p.evaluate(() => { const o = Storage.prototype.setItem; window.__o = o; Storage.prototype.setItem = function (k, v) { if (/^vocabulando:data:/.test(k)) throw new Error("cuota"); return o.call(this, k, v); }; });
  await p.click('[data-rate="Good"]');
  await p.waitForFunction(() => /No se pudo guardar el repaso/.test(document.getElementById("toast").textContent));
  eq(await txt(p.locator(".k-front")), front, "sigue la misma tarjeta");
  eq(await p.locator("[data-rate]").count(), 4, "los botones de valorar siguen ahí");
  eq((await stored(p)).stats.reviewsTotal, 0, "no se contó ningún repaso");
  await p.evaluate(() => { Storage.prototype.setItem = window.__o; });
  await p.click('[data-rate="Good"]'); await p.waitForFunction(() => !document.querySelector("[data-rate]"));
  eq((await stored(p)).stats.reviewsTotal, 1, "al reintentar se guarda");
  noErrors(p);
});

test("Nuevas · tope diario, «estudiar más» y reinicio al día siguiente", async () => {
  const p = await open({ now: [2026, 11, 3, 10, 0, 0], seed: { de: await freshReviewDeck(50) } });
  await p.waitForSelector(".deck-list");
  let s = await study(p);
  eq(s.stats, "0 por repasar 20 nuevas hoy 30 en espera", "contadores separados con el tope por defecto (20)");
  for (let i = 0; i < 20; i++) await rateOnce(p, "Good");
  s = await study(p);
  ok(s.done, "al llegar al tope sale «todo al día»");
  ok((await txt(p.locator(".done"))).includes("tope diario"), "el aviso explica el tope diario");
  eq(s.stats, "0 por repasar 0 nuevas hoy 30 en espera ↶ Deshacer", "contadores tras el tope");
  eq((await stored(p)).stats.newByDay, { "2026-11-03:word": 20 }, "se anotan las nuevas del día");
  await p.click("#moreNew");
  eq(await txt(p.locator(".stats")), "0 por repasar 10 nuevas hoy 20 en espera ↶ Deshacer", "«Estudiar 10 nuevas más» suma 10");
  eq(await p.locator("#show").count(), 1, "y vuelve a ofrecer tarjetas");
  // el repaso por adelantado no se salta el tope
  for (let i = 0; i < 10; i++) await rateOnce(p, "Good");
  await study(p); ok((await p.locator("#ahead").count()) === 1, "hay «Repasar de todos modos» (hay tarjetas ya vistas)");
  await p.click("#ahead");
  const n = parseInt((await txt(p.locator(".k-front"))).match(/\d+/)[0], 10);
  ok(n < 30, "«repasar de todos modos» ofrece una tarjeta ya vista (palabra " + n + "), no una nueva");
  // al día siguiente se renueva el tope
  await at(p, "2026-11-04 04:00:00"); s = await study(p);
  ok(/ 20 nuevas hoy /.test(" " + s.stats + " "), "a las 4:00 del día siguiente vuelven a ofrecerse 20 nuevas (" + s.stats + ")");
  noErrors(p);
});

test("Nuevas · límites separados de palabras y de frases, a la vista en Estudiar", async () => {
  const p = await open({ seed: { de: await freshReviewDeck(50) } });
  await p.waitForSelector(".deck-list");
  eq((await study(p)).stats, "0 por repasar 20 nuevas hoy 30 en espera", "palabras: por defecto 20 al día");
  eq([await p.inputValue("#newWords"), await p.inputValue("#newSents")], ["20", "10"], "los dos selectores están en Estudiar (20 palabras, 10 frases)");
  await p.click('.seg-btn[data-mode="sentence"]');
  eq(await txt(p.locator(".stats")), "0 por repasar 10 nuevas hoy 40 en espera", "frases: por defecto 10 al día");
  await p.selectOption("#newSents", "5");
  eq(await txt(p.locator("#toast")), "Hasta 5 frases nuevas al día", "aviso al cambiar el de frases");
  eq(await txt(p.locator(".stats")), "0 por repasar 5 nuevas hoy 45 en espera", "el contador de frases se actualiza al momento");
  await p.click('.seg-btn[data-mode="word"]');
  eq(await txt(p.locator(".stats")), "0 por repasar 20 nuevas hoy 30 en espera", "el límite de palabras no ha cambiado");
  await p.selectOption("#newWords", "0");
  eq(await txt(p.locator("#toast")), "Sin límite de palabras nuevas", "aviso al quitar el de palabras");
  eq(await txt(p.locator(".stats")), "0 por repasar 50 nuevas", "sin límite: se ofrecen las 50 y no hay «en espera»");
  await p.reload(); await p.waitForSelector("#view"); await study(p);
  eq([await p.inputValue("#newWords"), await p.inputValue("#newSents")], ["0", "5"], "los dos se recuerdan al recargar");
  await p.click('.tab[data-tab="actividad"]');
  eq(await p.locator("#newPerDay").count(), 0, "en Actividad ya no hay un selector duplicado");
  noErrors(p);
});

test("Nuevas · el tope de frases se aplica a las frases y no a las palabras", async () => {
  const p = await open({ prefs: { "vocabulando:newSents": "2" }, seed: { de: await freshReviewDeck(30) } });
  await p.waitForSelector(".deck-list"); await study(p); await p.click('.seg-btn[data-mode="sentence"]');
  await rateOnce(p, "Good"); await rateOnce(p, "Good");
  const s = await study(p);
  ok(s.done && (await txt(p.locator(".done"))).includes("Hoy ya has visto 2 frases nuevas (tope diario)"), "con 2 frases al día, al ver 2 sale «todo al día» y lo explica");
  const d = await stored(p); eq(Object.keys(d.stats.newByDay).map((k) => k.split(":")[1]), ["sentence"], "se cuentan como frases nuevas");
  await p.click('.seg-btn[data-mode="word"]');
  eq(await txt(p.locator(".stats")), "0 por repasar 20 nuevas hoy 10 en espera ↶ Deshacer", "las palabras siguen con su propio tope (20)");
  noErrors(p);
});

test("Nuevas · el ajuste único de la versión anterior se conserva en los dos límites", async () => {
  const p = await open({ prefs: { "vocabulando:newPerDay": "15" }, seed: { de: await freshReviewDeck(40) } });
  await p.waitForSelector(".deck-list"); await study(p);
  eq([await p.inputValue("#newWords"), await p.inputValue("#newSents")], ["15", "15"], "palabras y frases parten de los 15 que había elegido");
  const q = await open({ prefs: { "vocabulando:newWords": "25" }, seed: { de: await freshReviewDeck(40) } });
  await q.waitForSelector(".deck-list"); await study(q);
  eq(await q.inputValue("#newWords"), "25", "un valor que no está en la lista (25) también se muestra");
  noErrors(p); noErrors(q);
});

test("Nuevas · el contador de nuevas es estable (sin límite)", async () => {
  const p = await open({ prefs: { "vocabulando:newWords": "0" }, seed: { de: await freshReviewDeck(300) } });
  await p.waitForSelector(".deck-list"); const seen = new Set();
  for (let i = 0; i < 8; i++) { seen.add((await study(p)).stats); await p.click('.tab[data-tab="crear"]'); }
  eq([...seen], ["0 por repasar 300 nuevas"], "8 aperturas de «Estudiar» dan siempre el mismo contador");
  noErrors(p);
});

test("Deshacer · restaura la tarjeta, las estadísticas y el registro", async () => {
  const p = await open({ seed: { de: await freshReviewDeck(30) } });
  await p.waitForSelector(".deck-list"); await study(p);
  eq(await p.locator("#undoBtn").count(), 0, "sin repasos no hay botón «Deshacer»");
  await rateOnce(p, "Good"); const s1 = await stored(p);
  await rateOnce(p, "Hard"); await rateOnce(p, "Easy");
  eq((await stored(p)).stats.reviewsTotal, 3, "tres repasos hechos");
  const lastFront = await (async () => { await p.click("#undoBtn"); await p.waitForSelector("[data-rate]"); return txt(p.locator(".k-front")); })();
  ok((await p.locator(".k-back").count()) === 1, "deshacer muestra la tarjeta con su respuesta para volver a valorarla (" + lastFront + ")");
  eq((await stored(p)).stats.reviewsTotal, 2, "el total baja a 2");
  eq((await stored(p)).log.length, 2, "el registro quita la última fila");
  await p.keyboard.press("z"); await p.waitForSelector("[data-rate]");
  const s2 = await stored(p);
  eq([s2.review, s2.stats, s2.log], [s1.review, s1.stats, s1.log], "dos deshacer dejan los datos exactamente como tras el primer repaso");
  await p.keyboard.press("z"); await p.waitForSelector("[data-rate]");
  const s0 = await stored(p);
  eq([s0.review, s0.stats.reviewsTotal, s0.stats.byDay, s0.stats.newByDay, s0.log], [{}, 0, {}, {}, []], "tres deshacer vuelven al principio");
  await p.click('[data-rate="Good"]'); await p.waitForFunction(() => !document.querySelector("[data-rate]"));   // tras deshacer la tarjeta ya sale con la respuesta
  await p.keyboard.press("z"); await p.waitForSelector("[data-rate]");
  ok(true, "se puede volver a valorar y deshacer");
  await p.click('[data-rate="Again"]'); await p.waitForFunction(() => !document.querySelector("[data-rate]"));
  eq((await stored(p)).stats.reviewsTotal, 1, "tras deshacer se puede puntuar de nuevo");
  noErrors(p);
});

test("Deshacer · la pila es de cada idioma y se niega si la tarjeta cambió (carpeta)", async () => {
  const p = await open({ picker: true });
  await connectFolder(p, { "aleman.json": JSON.stringify(await freshReviewDeck(20)) }); await countIs(p, 20);
  await study(p); await rateOnce(p, "Good");
  eq(await p.locator("#undoBtn").count(), 1, "hay «Deshacer»");
  await p.evaluate(() => { location.hash = "#fr"; }); await p.waitForTimeout(300);
  await p.evaluate(() => { location.hash = "#de"; }); await countIs(p, 20);
  await study(p); eq(await p.locator("#undoBtn").count(), 0, "al cambiar de idioma y volver, la pila está vacía");
  await rateOnce(p, "Good");
  const f = JSON.parse(await folderFile(p, "aleman.json")), key = Object.keys(f.review).pop();
  f.review[key].last_review = new Date(Date.now() + 86400000).toISOString();            // otro dispositivo repasó esa tarjeta después
  await new Promise((r) => setTimeout(r, 30)); await writeFolder(p, "aleman.json", JSON.stringify(f, null, 1));
  await p.evaluate(() => window.dispatchEvent(new Event("focus"))); await p.waitForTimeout(400);
  await p.keyboard.press("z");
  await p.waitForFunction(() => /No se puede deshacer/.test(document.getElementById("toast").textContent));
  ok(true, "si la tarjeta cambió desde entonces, se niega: «" + await txt(p.locator("#toast")) + "»");
  eq(JSON.parse(await folderFile(p, "aleman.json")).review[key].last_review, f.review[key].last_review, "y no se toca la tarjeta");
  noErrors(p);
});

// =====================================================================================================================
// DÍA DE ESTUDIO: empieza a las 4:00
// =====================================================================================================================
for (const tz of ["Europe/Madrid", "America/Los_Angeles", "Asia/Tokyo"]) {
  test("Día de estudio · vence desde las 4:00 y FSRS cuenta días de estudio (" + tz + ")", async () => {
    const mk = (now) => open({ tz, now, seed: { de: G.deck("de", 1, false) } });
    const clean = async (p) => { await p.evaluate(() => { const d = JSON.parse(localStorage.getItem("vocabulando:data:de")); d.review = {}; localStorage.setItem("vocabulando:data:de", JSON.stringify(d)); }); await p.reload(); await p.waitForSelector("#view"); };
    const card = async (p, k) => { const d = await stored(p); return d.review[d.deck[0].id + ":" + (k || "word")]; };
    { // A) una tarjeta con plazo de días toca desde las 4:00 de su día, no a la hora exacta del repaso
      const p = await mk([2026, 11, 3, 22, 0, 0]); await p.waitForSelector(".deck-list"); await clean(p); await at(p, "2026-11-03 22:00:00");
      await study(p); await rateOnce(p, "Easy"); const c = await card(p);
      eq([c.scheduled_days, c.state], [8, 2], "A: «Fácil» a las 22:00 → repaso a 8 días");
      for (const [t, esperado] of [["2026-11-10 23:00:00", false], ["2026-11-11 03:59:59", false], ["2026-11-11 04:00:00", true], ["2026-11-11 09:00:00", true]]) {
        await at(p, t); eq((await study(p)).card, esperado, "A: " + t.slice(5, 16) + (esperado ? " toca" : " no toca"));
      }
      noErrors(p);
    }
    { // B) en aprendizaje (minutos): a la hora exacta, cruzando la medianoche sin esperar a las 4:00
      const p = await mk([2026, 11, 3, 23, 50, 0]); await p.waitForSelector(".deck-list"); await clean(p); await at(p, "2026-11-03 23:50:00");
      await study(p); await rateOnce(p, "Good"); const c = await card(p);
      eq([new Date(c.due) - new Date(c.last_review), c.state], [600000, 1], "B: «Bien» en tarjeta nueva → a los 10 min exactos");
      await at(p, "2026-11-03 23:59:00"); eq((await study(p)).card, false, "B: 23:59 aún no toca");
      await at(p, "2026-11-04 00:00:30"); eq((await study(p)).card, true, "B: 00:00:30 ya toca");
    }
    { // C) los días transcurridos que usa FSRS son días de estudio (no fechas UTC)
      const p = await mk([2026, 11, 3, 22, 0, 0]); await p.waitForSelector(".deck-list"); await clean(p); await at(p, "2026-11-03 22:00:00");
      await study(p); await rateOnce(p, "Good"); await at(p, "2026-11-03 22:10:30"); await study(p); await rateOnce(p, "Good");
      let c = await card(p); eq([c.state, c.scheduled_days], [2, 2], "C: dos «Bien» → repaso a 2 días");
      await at(p, "2026-11-06 03:30:00"); ok((await study(p)).card, "C: 06/11 03:30 (día de estudio 05/11) toca");
      await p.click("#show"); const labels = await p.locator(".rate .r em").allInnerTexts();
      await p.click('[data-rate="Good"]'); await p.waitForFunction(() => !document.querySelector("[data-rate]")); c = await card(p);
      eq(c.elapsed_days, 2, "C: días transcurridos para FSRS = 2 (del 03/11 al 05/11 de estudio)");
      eq(labels[2], c.scheduled_days + " d", "C: la etiqueta de «Bien» es el plazo programado");
      await at(p, "2026-11-06 09:00:00"); ok((await study(p)).done, "C: a las 09:00 aún no toca");
      await p.click("#ahead"); await rateOnce(p, "Good"); c = await card(p);
      eq(c.elapsed_days, 1, "C: repaso de las 03:30 y de las 09:00 del mismo día natural = 1 día de estudio");
      noErrors(p);
    }
    { // D) los contadores de «hoy» usan el mismo día
      const p = await mk([2026, 11, 3, 22, 0, 0]); await p.waitForSelector(".deck-list"); await clean(p);
      await p.evaluate(() => { const d = JSON.parse(localStorage.getItem("vocabulando:data:de")); d.deck[0].createdAt = new Date(2026, 10, 3, 22, 30).getTime(); localStorage.setItem("vocabulando:data:de", JSON.stringify(d)); });
      await p.reload(); await p.waitForSelector("#view"); await at(p, "2026-11-03 22:00:00"); await study(p); await rateOnce(p, "Good");
      const hoy = async () => { await p.click('.tab[data-tab="actividad"]'); const n = (i) => p.locator(".act-card").nth(i).locator(".act-n b").first().innerText().then(Number); return [await n(0), await n(1)]; };
      eq(await hoy(), [1, 1], "D: 03/11 22:00 → hoy: 1 añadida, 1 repasada");
      await at(p, "2026-11-04 01:00:00"); eq(await hoy(), [1, 1], "D: 04/11 01:00 (aún día de estudio 03/11)");
      await at(p, "2026-11-04 04:00:00"); eq(await hoy(), [0, 0], "D: 04/11 04:00 (día nuevo) → 0 y 0");
    }
  });
}
test("Día de estudio · cambio de hora de primavera (Madrid)", async () => {
  const p = await open({ now: [2026, 3, 25, 22, 0, 0], seed: { de: G.deck("de", 1, false) } });
  await p.waitForSelector(".deck-list");
  await p.evaluate(() => { const d = JSON.parse(localStorage.getItem("vocabulando:data:de")); d.review = {}; localStorage.setItem("vocabulando:data:de", JSON.stringify(d)); }); await p.reload(); await p.waitForSelector("#view");
  await at(p, "2026-03-25 22:00:00"); await study(p); await rateOnce(p, "Easy");
  for (const [t, esperado] of [["2026-04-02 03:59:00", false], ["2026-04-02 04:00:00", true]]) { await at(p, t); eq((await study(p)).card, esperado, t.slice(5, 16) + (esperado ? " toca" : " no toca")); }
  noErrors(p);
});

// =====================================================================================================================
// TARJETA INVERSA
// =====================================================================================================================
test("Inversa · del idioma al español, con su propio contador y sin dejar restos al borrar", async () => {
  const p = await open({ prefs: { "vocabulando:rev": "1" }, seed: { de: await freshReviewDeck(30) } });
  await p.waitForSelector(".deck-list"); await study(p);
  eq(await p.locator(".seg-btn").allInnerTexts(), ["Palabras", "Frases", "Inversa"], "aparece la pestaña «Inversa»");
  await p.click('.seg-btn[data-mode="rev"]');
  eq(await txt(p.locator(".k-front")), "der Wort0", "el anverso es la palabra del idioma");
  ok(/de\s*→\s*es/i.test(await txt(p.locator(".k-tag"))), "la etiqueta dice idioma → es (" + await txt(p.locator(".k-tag")) + ")");
  await p.click("#show"); eq(await txt(p.locator(".k-back")), "la palabra 0", "el reverso es la palabra en español");
  await p.click('[data-rate="Good"]'); await p.waitForFunction(() => !document.querySelector("[data-rate]"));
  const d = await stored(p); eq(Object.keys(d.review), ["id000000:rev"], "se guarda como tarjeta «inversa» de esa palabra");
  eq(Object.keys(d.stats.newByDay).map((k) => k.split(":")[1]), ["rev"], "el contador de nuevas es el del modo inversa");
  await p.click('.seg-btn[data-mode="word"]'); eq(await txt(p.locator(".stats")), "0 por repasar 20 nuevas hoy 10 en espera ↶ Deshacer", "el modo Palabras no se ve afectado");
  await p.click('.tab[data-tab="mazo"]'); await p.click('[data-del="id000000"]'); await p.click("#confirmYes"); await p.waitForFunction(() => document.getElementById("deckCount").textContent === "29 palabras");
  eq(Object.keys((await stored(p)).review).filter((k) => k.startsWith("id000000")), [], "al borrar la palabra desaparece también su tarjeta inversa");
  await p.click('.tab[data-tab="actividad"]'); await p.click("#revSw"); await study(p);
  eq(await p.locator(".seg-btn").allInnerTexts(), ["Palabras", "Frases"], "al apagarla desaparece la pestaña");
  noErrors(p);
});

// =====================================================================================================================
// PRONUNCIACIÓN
// =====================================================================================================================
test("Pronunciación · solo voces con acento europeo: portugués de Portugal, inglés británico, francés de Francia…", async () => {
  // [idioma, voces del dispositivo, la que debe sonar (o null: sin voz europea, sin botones)]
  const casos = [
    ["pt", ["pt-BR"], null], ["pt", ["pt-BR", "pt-PT"], "voz pt-PT"], ["pt", ["pt-PT", "pt-BR"], "voz pt-PT"], ["pt", ["pt_PT"], "voz pt_PT"], ["pt", ["pt"], null],
    ["pt", ["pt-PT-x-lusitano"], "voz pt-PT-x-lusitano"], ["pt", ["pt-BR-x-paulista"], null],
    ["fr", ["fr-CA"], null], ["fr", ["fr-CA", "fr-FR"], "voz fr-FR"], ["fr", ["fr-CA", "fr-BE", "fr-FR"], "voz fr-FR"], ["fr", ["fr-CA", "fr-BE"], "voz fr-BE"], ["fr", ["fr"], "voz fr"],
    ["en", ["en-US"], null], ["en", ["en-US", "en-GB"], "voz en-GB"], ["en", ["en-AU", "en-IE"], "voz en-IE"], ["en", ["en-US", "en-AU", "en-IN"], null],
    ["de", ["de-AT"], "voz de-AT"], ["de", ["de-AT", "de-DE"], "voz de-DE"], ["it", ["it-IT"], "voz it-IT"], ["ca", ["ca-ES"], "voz ca-ES"], ["pl", ["pl-PL"], "voz pl-PL"], ["el", ["el-GR"], "voz el-GR"]];
  for (const [code, voces, quiero] of casos) {
    const p = await open({ lang: code, speech: voces, seed: { [code]: bucket(code, [{ esWord: "la casa", deWord: "x" + code }]) } }); await mazo(p);
    const on = await p.evaluate(() => document.body.classList.contains("tts-on"));
    let suena = null;
    if (on) { await p.locator("li.row .say").first().click(); const s = await p.evaluate(() => window.__spoken); suena = s.length ? s[s.length - 1].voz : null; }
    ok(on === (quiero !== null) && suena === quiero, code + " con " + JSON.stringify(voces) + ": " + (suena || (on ? "(no habló)" : "sin botones")) + (quiero ? "" : " (esperado: sin botones)"));
    noErrors(p);
  }
});

test("Pronunciación · entre dos voces europeas con el mismo acento, la instalada en el sistema (no la de red)", async () => {
  const red = { lang: "fr-FR", name: "Google français", localService: false }, sis = { lang: "fr-FR", name: "Microsoft Hortense", localService: true };
  for (const voces of [[red, sis], [sis, red]]) {
    const p = await open({ lang: "fr", speech: voces, seed: { fr: bucket("fr", [{ esWord: "la casa", deWord: "la maison" }]) } }); await mazo(p);
    await p.locator("li.row .say").first().click();
    eq((await p.evaluate(() => window.__spoken)).map((s) => s.voz), ["Microsoft Hortense"], "con la de red " + (voces[0] === red ? "primero" : "después") + " en la lista, suena la del sistema");
    noErrors(p);
  }
});

test("Pronunciación · sin voz europea se puede permitir cualquier otra; Actividad dice qué voz usa cada idioma y qué falta", async () => {
  const voces = ["fr-FR", "pt-BR", "en-US", "de-DE"];
  const p = await open({ lang: "pt", speech: voces, seed: { pt: bucket("pt", [{ esWord: "la casa", deWord: "a casa", esSent: "La casa es grande", deSent: "A casa é grande" }]) }, prefs: { "vocabulando:dict": "1" } });
  await mazo(p); eq(await p.evaluate(() => document.body.classList.contains("tts-on")), false, "con solo una voz de Brasil, el portugués no ofrece audio");
  await study(p); eq(await p.locator(".seg-btn").allInnerTexts(), ["Palabras", "Frases"], "ni el dictado, aunque esté activado");
  await p.click('.tab[data-tab="actividad"]');
  const fila = (n) => ipaTxt(p.locator(".voice-list li", { hasText: n }));
  const portugues = await fila("Portugués");
  ok(/✗/.test(portugues) && /sin voz europea/.test(portugues) && /solo hay: pt-BR/.test(portugues), "Actividad: portugués «" + portugues + "»");
  ok(/✓/.test(await fila("Francés")) && /voz fr-FR/.test(await fila("Francés")), "francés: «" + await fila("Francés") + "»");
  ok(/solo hay: en-US/.test(await fila("Inglés")), "inglés: «" + await fila("Inglés") + "»");
  ok(/sin voz europea/.test(await fila("Italiano")) && !/solo hay/.test(await fila("Italiano")), "italiano: sin ninguna voz");
  ok(/no hay botones de pronunciación/.test(await txt(p.locator(".panel", { hasText: "Estudio" }).first())) && /Agregar voces/.test(await txt(p.locator(".panel", { hasText: "Voces" }).first())), "explica por qué no hay botones y cómo instalar una voz");
  eq(await p.locator("#anyVoiceSw").getAttribute("aria-checked"), "false", "el interruptor «usar la que haya» viene apagado");
  await p.click("#anyVoiceSw");
  ok(/⚠/.test(await fila("Portugués")) && /no es europea/.test(await fila("Portugués")), "al permitirlo, el portugués usa la de Brasil y lo dice: «" + await fila("Portugués") + "»");
  eq(await p.evaluate(() => [localStorage.getItem("idiomas:anyVoice"), document.body.classList.contains("tts-on")]), ["1", true], "se guarda (con el mismo nombre que podrá leer Conjugario) y vuelven los botones");
  await mazo(p); await p.locator("li.row .say").first().click();
  eq((await p.evaluate(() => window.__spoken)).map((s) => s.voz), ["voz pt-BR"], "y suena la voz que haya");
  await p.reload(); await p.waitForSelector("#view"); await p.waitForFunction(() => document.body.classList.contains("tts-on"));
  ok(true, "tras recargar sigue permitido");
  noErrors(p);
});

test("Pronunciación · botones, atajo P, audio automático y limpieza del texto", async () => {
  const p = await open({ speech: ["de-DE", "en-US"], seed: { de: await freshReviewDeck(12) } });
  await p.waitForSelector(".deck-list");
  ok(await p.evaluate(() => document.body.classList.contains("tts-on")), "hay voz para el alemán: se muestran los botones");
  ok(await p.locator("li.row").first().locator(".say").isVisible(), "cada fila del mazo tiene su botón de escuchar");
  await p.locator("li.row").first().locator(".say").click();
  let sp = await p.evaluate(() => window.__spoken); eq([sp[0].text, sp[0].lang, sp[0].voz], ["das Wort11", "de-DE", "voz de-DE"], "pronuncia la palabra del idioma de la fila");
  await study(p);
  eq(await p.locator(".karte .say").count(), 0, "antes de mostrar la respuesta no hay audio (no revelarla)");
  await p.keyboard.press("p"); eq((await p.evaluate(() => window.__spoken)).length, 1, "y el atajo P tampoco habla antes de mostrarla");
  await p.click("#show"); ok(await p.locator(".karte .say").isVisible(), "tras mostrarla aparece el botón");
  await p.click(".karte .say"); sp = await p.evaluate(() => window.__spoken); eq(sp[1].text, "der Wort0", "pronuncia la respuesta");
  await p.keyboard.press("p"); eq((await p.evaluate(() => window.__spoken)).length, 3, "el atajo P también");
  await p.click('.tab[data-tab="actividad"]'); await p.click("#autoSpeakSw");
  await study(p); await p.click("#show"); sp = await p.evaluate(() => window.__spoken);
  eq([sp.length, sp[3].text], [4, "der Wort0"], "con «Pronunciar al mostrar la respuesta» habla al mostrarla");
  // texto con alternativas y paréntesis
  await p.evaluate(() => { const d = JSON.parse(localStorage.getItem("vocabulando:data:de")); d.deck[0].deWord = "die Katze (pl. Katzen) / der Kater"; localStorage.setItem("vocabulando:data:de", JSON.stringify(d)); });
  await p.reload(); await p.waitForSelector("#view"); await mazo(p); await p.locator("li.row").last().locator(".say").click();
  eq((await p.evaluate(() => window.__spoken)).pop().text, "die Katze, der Kater", "quita los paréntesis y separa las alternativas");
  noErrors(p);
});

test("Pronunciación · sin voz para el idioma no se ofrece nada", async () => {
  const p = await open({ speech: ["de-DE"], lang: "pl", seed: { pl: G.deck("pl", 5, false) } });
  await p.waitForSelector(".deck-list");
  ok(!(await p.evaluate(() => document.body.classList.contains("tts-on"))), "no hay voz para el polaco: sin botones");
  eq(await p.locator("li.row").first().locator(".say").isVisible(), false, "las filas no muestran el botón");
  await p.click('.tab[data-tab="actividad"]');
  eq(await p.locator("#autoSpeakSw").count(), 0, "no hay interruptor de audio automático");
  ok((await txt(p.locator("#view"))).includes("no tiene una voz"), "se explica por qué");
  noErrors(p);
});

test("Pronunciación · con la voz inversa también se oye antes de mostrar la respuesta", async () => {
  const p = await open({ speech: ["de-DE"], prefs: { "vocabulando:rev": "1" }, seed: { de: await freshReviewDeck(5) } });
  await p.waitForSelector(".deck-list"); await study(p); await p.click('.seg-btn[data-mode="rev"]');
  ok(await p.locator(".karte .say").isVisible(), "en «Inversa» el botón está desde el principio (oyes la palabra y tienes que traducirla)");
  await p.keyboard.press("p"); eq((await p.evaluate(() => window.__spoken))[0].text, "der Wort0", "y P la pronuncia");
  noErrors(p);
});

// =====================================================================================================================
// IMPORTAR
// =====================================================================================================================
async function importFile(p, name, obj) {
  await p.click('.tab[data-tab="actividad"]');
  const [ch] = await Promise.all([p.waitForEvent("filechooser"), p.click("#impBtn")]);
  await ch.setFiles({ name, mimeType: "application/json", buffer: Buffer.from(typeof obj === "string" ? obj : JSON.stringify(obj)) });
}
test("Importar JSON · fusiona: gana el repaso más reciente y se suman estadísticas y registro", async () => {
  const mkDeck = () => ["A", "B", "C"].map((x, i) => ({ id: "w" + x, esWord: "es " + x, deWord: "de " + x, esSent: "", deSent: "", createdAt: 1000 + i }));
  const local = { app: "vocabulando", version: 2, lang: "de", deck: mkDeck(), review: { "wA:word": G.card(4, 4, "2026-02-27T12:00:00.000Z"), "wB:word": G.card(4, 7, "2026-03-02T12:00:00.000Z") }, stats: { reviewsTotal: 11, byDay: { "2026-02-27": 4 } }, log: [[1772193600, "wA:word", 3, 2]] };
  const incoming = { app: "vocabulando", version: 2, lang: "de", deck: [...mkDeck(), { id: "wD", esWord: "es D", deWord: "de D", esSent: "", deSent: "", createdAt: 5000 }],
    review: { "wA:word": G.card(5, 6, "2026-03-01T12:00:00.000Z"), "wB:word": G.card(2, 2, "2026-02-20T12:00:00.000Z"), "wD:word": G.card(5, 1, "2026-03-01T13:00:00.000Z") },
    stats: { reviewsTotal: 50, byDay: { "2026-03-01": 5, "2026-02-27": 2 } }, log: [[1772193600, "wA:word", 3, 2], [1772366400, "wA:word", 3, 2]] };
  const p = await open({ seed: { de: local } }); await p.waitForSelector(".deck-list");
  await importFile(p, "copia.json", incoming); await p.waitForFunction(() => /añadida/.test(document.getElementById("toast").textContent));
  eq(await txt(p.locator("#toast")), "1 añadida · 1 repaso actualizado", "mensaje: 1 palabra nueva y 1 repaso actualizado");
  const d = await stored(p);
  eq(d.deck.map((e) => e.id), ["wA", "wB", "wC", "wD"], "la palabra nueva se añade y las que había no se duplican");
  eq([d.review["wA:word"].reps, d.review["wB:word"].reps, d.review["wD:word"].reps], [6, 7, 1], "en cada tarjeta se queda el repaso más reciente (A importada, B local) y se añade la nueva");
  eq([d.stats.reviewsTotal, d.stats.byDay], [50, { "2026-02-27": 4, "2026-03-01": 5 }], "estadísticas: el máximo de cada una");
  eq(d.log.length, 2, "el registro se une sin duplicar");
  await importFile(p, "copia.json", incoming); await p.waitForFunction(() => /No hay nada nuevo/.test(document.getElementById("toast").textContent));
  ok(true, "importar otra vez lo mismo no cambia nada: «" + await txt(p.locator("#toast")) + "»");
  noErrors(p);
});

test("Importar JSON · una palabra con otro id pero la misma pareja se considera repetida", async () => {
  const p = await open({ seed: { de: await freshReviewDeck(3) } }); await p.waitForSelector(".deck-list");
  await importFile(p, "otra.json", { app: "vocabulando", version: 2, lang: "de", deck: [{ id: "otro-id", esWord: "la palabra 0", deWord: "der Wort0", createdAt: 1 }, { id: "nuevo", esWord: "la nueva", deWord: "die Neue", createdAt: 2 }], review: {} });
  await p.waitForFunction(() => /añadida/.test(document.getElementById("toast").textContent));
  eq(await txt(p.locator("#toast")), "1 añadida · 1 ya estaba", "se añade solo la nueva");
  eq((await stored(p)).deck.length, 4, "4 palabras");
  noErrors(p);
});

test("Importar lista · texto pegado con varios separadores, cabecera, comillas y repetidas", async () => {
  const p = await open({ seed: { de: await freshReviewDeck(3) } }); await p.waitForSelector(".deck-list");
  await p.click('.tab[data-tab="actividad"]'); await p.click("#impListBtn");
  await p.fill("#listText", [
    "palabra_es;palabra_de;frase_es;frase_de;genero;genero_es",
    "el gato ; die Katze ; El gato duerme. ; Die Katze schläft.",
    '"la casa; grande" ; das Haus',
    "la puerta ; die Tür",
    "la puerta ; die Tür",
    "la palabra 0 ; der Wort0",
    "solo español ;",
    "el perro ; der Hund ; Una frase sin pareja",
  ].join("\n"));
  await p.click("#listCheck");
  eq(await txt(p.locator(".list-prev p")), "4 palabras nuevas · 2 repetidas (se omiten) · 1 línea sin las dos palabras (se omiten)", "vista previa con los recuentos");
  await p.click("#listAdd"); await p.waitForFunction(() => /palabras añadidas/.test(document.getElementById("toast").textContent));
  const d = (await stored(p)).deck.slice(3);
  eq(d.map((e) => [e.esWord, e.deWord]), [["el gato", "die Katze"], ["la casa; grande", "das Haus"], ["la puerta", "die Tür"], ["el perro", "der Hund"]], "se añaden en orden y respetando las comillas");
  eq([d[0].esSent, d[0].deSent, d[3].esSent, d[3].deSent], ["El gato duerme", "Die Katze schläft", "", ""], "la frase solo entra si traen las dos versiones (y sin el punto final)");
  ok(d.every((e, i) => i === 0 || e.createdAt > d[i - 1].createdAt) && new Set((await stored(p)).deck.map((e) => e.id)).size === 7, "orden de creación creciente e ids distintos");
  // tabulador y barra
  await p.click("#impListBtn"); await p.fill("#listText", "uno\tein\ndos\tzwei"); await p.click("#listCheck");
  ok((await txt(p.locator(".list-prev p"))).startsWith("2 palabras nuevas"), "separado por tabuladores");
  await p.fill("#listText", "tres | drei\ncuatro | vier\n"); await p.click("#listCheck");
  ok((await txt(p.locator(".list-prev p"))).startsWith("2 palabras nuevas"), "separado por barras");
  await p.fill("#listText", "el gato ; die Katze"); await p.click("#listCheck");
  ok((await txt(p.locator(".list-prev p"))).startsWith("0 palabras nuevas"), "lo ya añadido sale como repetido");
  noErrors(p);
});

test("Importar lista · desde un archivo CSV exportado por la propia app", async () => {
  const p = await open({ seed: { de: await freshReviewDeck(4) } }); await p.waitForSelector(".deck-list");
  await p.click('.tab[data-tab="actividad"]');
  const [dl] = await Promise.all([p.waitForEvent("download"), p.click("#expCsv")]);
  const csv = fs.readFileSync(await dl.path(), "utf8");
  ok(csv.includes("palabra_es;palabra_de"), "el CSV exportado tiene su cabecera");
  await p.evaluate(async () => { const d = JSON.parse(localStorage.getItem("vocabulando:data:de")); d.deck = d.deck.slice(0, 1); localStorage.setItem("vocabulando:data:de", JSON.stringify(d)); });
  await p.reload(); await p.waitForSelector("#view"); await p.click('.tab[data-tab="actividad"]'); await p.click("#impListBtn");
  const [ch] = await Promise.all([p.waitForEvent("filechooser"), p.click("#listFile")]);
  await ch.setFiles({ name: "mazo.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await p.waitForSelector(".list-prev p");
  eq(await txt(p.locator(".list-prev p")), "3 palabras nuevas · 1 repetida (se omiten)", "reconoce la cabecera, el separador y la palabra que ya estaba");
  await p.click("#listAdd"); await p.waitForFunction(() => /añadidas/.test(document.getElementById("toast").textContent));
  eq((await stored(p)).deck.length, 4, "el mazo vuelve a tener las 4 palabras");
  noErrors(p);
});

test("Exportar JSON · lleva el registro y se puede importar en un mazo vacío", async () => {
  const p = await open({ seed: { de: await freshReviewDeck(5) } }); await p.waitForSelector(".deck-list");
  await study(p); await rateOnce(p, "Good"); await rateOnce(p, "Easy");
  await p.click('.tab[data-tab="actividad"]');
  const [dl] = await Promise.all([p.waitForEvent("download"), p.click("#expJson")]);
  const exp = JSON.parse(fs.readFileSync(await dl.path(), "utf8"));
  eq([exp.deck.length, Object.keys(exp.review).length, exp.log.length, exp.stats.reviewsTotal], [5, 2, 2, 2], "la copia incluye palabras, tarjetas, registro y estadísticas");
  const q = await open({ seed: { de: { app: "vocabulando", version: 2, lang: "de", deck: [], review: {}, stats: { reviewsTotal: 0, byDay: {} } } } });
  await importFile(q, "copia.json", exp); await q.waitForFunction(() => /añadida/.test(document.getElementById("toast").textContent));
  const d = await stored(q); eq([d.deck.length, Object.keys(d.review).length, d.log.length, d.stats.reviewsTotal], [5, 2, 2, 2], "importada en un mazo vacío queda igual");
  noErrors(p); noErrors(q);
});

// =====================================================================================================================
// DATOS Y ESTADÍSTICAS
// =====================================================================================================================
const patchLS = async (p, fn) => { await p.evaluate((src) => { const d = JSON.parse(localStorage.getItem("vocabulando:data:de")); (new Function("d", src))(d); localStorage.setItem("vocabulando:data:de", JSON.stringify(d)); }, fn); await p.reload(); await p.waitForSelector("#view"); };

test("Datos · el total de repasos nunca baja de lo que consta en las tarjetas", async () => {
  const g = G.deck("de", 3, false); g.review = { "id000000:word": G.card(3, 5), "id000001:word": G.card(3, 4), "id000002:word": G.card(3, 3) }; g.stats = { reviewsTotal: 0, byDay: {} };
  const p = await open({ seed: { de: g } }); await p.waitForSelector(".deck-list"); await p.click('.tab[data-tab="actividad"]');
  eq(await p.locator(".act-card").nth(1).locator(".act-n b").nth(1).innerText(), "12", "datos con 12 repasos en las tarjetas y total 0 muestran 12");
  noErrors(p);
});

test("Datos · el registro anota cada repaso", async () => {
  const p = await open({ seed: { de: await freshReviewDeck(5) } }); await p.waitForSelector(".deck-list");
  await study(p); await rateOnce(p, "Good"); await rateOnce(p, "Easy");
  const d = await stored(p);
  eq(d.log.map((r) => [r[1], r[2], r[3]]), [["id000000:word", 3, 0], ["id000001:word", 4, 0]], "tarjeta, nota (1-4) y estado anterior (0 = nueva)");
  ok(Math.abs(d.log[0][0] - Date.now() / 1000) < 60, "con la hora en segundos");
  noErrors(p);
});

test("Actividad · retención, último repaso y previsión de los próximos 7 días", async () => {
  const now = Date.UTC(2026, 10, 3, 9, 0, 0) / 1000, D = 86400;
  const g = G.deck("de", 5, false);
  g.review = { "id000000:word": { ...G.card(1, 4), due: "2026-11-03T08:00:00.000Z" }, "id000001:word": { ...G.card(1, 4), due: "2026-10-20T08:00:00.000Z" },
    "id000002:word": { ...G.card(1, 4), due: "2026-11-04T10:00:00.000Z" }, "id000003:word": { ...G.card(1, 4), due: "2026-11-06T10:00:00.000Z" } };
  g.stats = { reviewsTotal: 30, byDay: { "2026-11-03": 2, "2026-11-02": 1, "2026-11-01": 4, "2026-10-30": 1 } };
  g.log = [];
  for (let i = 0; i < 25; i++) g.log.push([now - (i + 1) * 3600 * 5, "id000000:word", i < 20 ? 3 : 1, 2]);        // 25 repasos maduros en 30 días: 20 bien
  for (let i = 0; i < 10; i++) g.log.push([now - (40 + i) * D, "id000000:word", 1, 2]);                              // más antiguos: no cuentan
  for (let i = 0; i < 5; i++) g.log.push([now - (i + 1) * 3600, "id000001:word", 1, 1]);                              // en aprendizaje: no cuentan
  const p = await open({ now: [2026, 11, 3, 10, 0, 0], seed: { de: g } }); await p.waitForSelector(".deck-list"); await p.click('.tab[data-tab="actividad"]');
  const grid = await txt(p.locator(".st-grid").nth(1));
  ok(/ÚLTIMO REPASO hoy/i.test(grid), "último repaso: hoy (" + grid + ")");
  ok(/RETENCIÓN 80 % de 25 repasos en 30 días/i.test(grid), "retención 80 % sobre los 25 repasos maduros de los últimos 30 días");
  eq(await p.locator(".fc-n").allInnerTexts(), ["2", "1", "0", "1", "0", "0", "0"], "previsión: 2 hoy (uno atrasado), 1 mañana y 1 dentro de 3 días");
  eq((await txt(p.locator(".fc-d").first())) + "/" + (await txt(p.locator(".fc-d").nth(1))), "hoy/mañ.", "con sus etiquetas");
  await patchLS(p, "d.stats.byDay = { '2026-11-02': 1, '2026-11-01': 1 }; d.log = d.log.slice(0, 3);"); await p.click('.tab[data-tab="actividad"]');
  const g2 = await txt(p.locator(".st-grid").nth(1));
  ok(/ÚLTIMO REPASO ayer/i.test(g2) && /RETENCIÓN — faltan repasos/i.test(g2), "si hoy aún no has repasado pero ayer sí, dice «ayer»; con pocos repasos no se inventa la retención");
  await patchLS(p, "d.stats.byDay = { '2026-10-30': 1 };"); await p.click('.tab[data-tab="actividad"]');
  ok(/ÚLTIMO REPASO hace 4 d/i.test(await txt(p.locator(".st-grid").nth(1))), "con un hueco, cuenta los días: «hace 4 d»");
  noErrors(p);
});

// =====================================================================================================================
// WEB: instalable y sin conexión · AYUDA
// =====================================================================================================================
test("Web · manifiesto, service worker y funcionamiento sin conexión", async () => {
  const p = await open({ seed: newDeck("de", 20, false) }); await p.waitForSelector(".deck-list");
  const href = await p.evaluate(() => { const l = document.querySelector('link[rel="manifest"]'); return l && l.href; });
  ok(!!href, "la página enlaza su manifiesto (servida como web)");
  const m = await p.evaluate(async (h) => (await fetch(h)).json(), href);
  eq([m.name, m.display, m.start_url], ["Vocabulando", "standalone", "./Vocabulando.html"], "manifiesto: nombre, modo app y página de inicio");
  for (const ic of m.icons) eq(await p.evaluate(async (u) => (await fetch(new URL(u, location.href))).status, ic.src), 200, "existe el icono " + ic.src);
  ok(await p.evaluate(() => navigator.serviceWorker.ready.then((r) => !!r.active)), "el service worker queda activo");
  await p.waitForTimeout(600);
  const urls = await p.evaluate(async () => { const out = []; for (const k of await caches.keys()) { const c = await caches.open(k); for (const r of await c.keys()) out.push(new URL(r.url).pathname); } return out; });
  ok(urls.some((u) => u.endsWith("/Vocabulando.html")) && !urls.some((u) => u.endsWith(".json")), "la copia guardada incluye la app y ningún archivo de datos");
  await stopServer();
  try {
    await p.reload(); await p.waitForSelector("#view");
    eq(await p.title(), "Vocabulando · Alemán", "con el servidor apagado, la app se abre desde la copia");
    await p.waitForSelector(".deck-list"); eq(await txt(p.locator(".deck-count")), "20 palabras", "y sus datos siguen ahí");
  } finally { await startServer(); }
  noErrors(p);
});

test("Ayuda · explica las novedades y el aviso de iPad", async () => {
  const p = await open({ noPicker: true, seed: newDeck("de", 3, false) }); await p.waitForSelector(".deck-list");
  ok((await txt(p.locator(".databar:visible").first())).includes("Añadir a pantalla de inicio"), "sin carpeta (iPad/Safari) el aviso recomienda añadir la web a la pantalla de inicio");
  await p.locator(".js-info:visible").first().click(); await p.waitForSelector(".info-body");
  const t = await txt(p.locator(".info-body"));
  for (const k of ["Palabras y frases nuevas por día", "Z para deshacer", "Pronunciación", "las 4:00", "En el iPad o el móvil", "importar listas"]) ok(t.includes(k), "la ayuda menciona «" + k + "»");
  noErrors(p);
});


// =====================================================================================================================
// CAMBIAR DE IDIOMA: desplegable sobre el propio botón
// =====================================================================================================================
test("Idioma · el botón despliega los 8 idiomas y se elige ahí mismo, sin pasar por la pantalla inicial", async () => {
  const p = await open({ lang: "pl", seed: { ...newDeck("pl", 30, false), ...newDeck("de", 12, false) } });
  await p.waitForSelector(".deck-list");
  eq(await p.locator("#langMenu").isHidden(), true, "cerrado al principio");
  await p.click("#langBtn");
  ok(await p.locator("#langMenu").isVisible() && (await p.locator("#langBtn").getAttribute("aria-expanded")) === "true", "al pulsar el botón se despliega el menú");
  eq(await p.locator(".lang-opt").count(), 8, "con los 8 idiomas");
  eq(await p.locator('.lang-opt[aria-selected="true"]').getAttribute("data-lang"), "pl", "el actual va marcado");
  ok(await p.evaluate(() => { const r = document.getElementById("langMenu").getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }), "el menú cabe en la pantalla");
  await p.click('.lang-opt[data-lang="de"]'); await countIs(p, 12);
  ok(await p.evaluate(() => document.getElementById("picker").hidden), "se cambia directamente: la pantalla inicial no aparece");
  eq([await p.evaluate(() => location.hash), await txt(p.locator("#langBtn")), await p.locator("#langMenu").isHidden()], ["#de", "DE", true], "el idioma cambia, el botón lo muestra y el menú se cierra");
  noErrors(p);
});

test("Idioma · se cierra con Escape y al pulsar fuera, y se maneja con el teclado", async () => {
  const p = await open({ lang: "de", seed: newDeck("de", 12, false) }); await p.waitForSelector(".deck-list");
  await p.click("#langBtn"); await p.keyboard.press("Escape");
  eq(await p.locator("#langMenu").isHidden(), true, "Escape lo cierra");
  await p.click("#langBtn"); await p.mouse.click(5, 5);
  eq(await p.locator("#langMenu").isHidden(), true, "pulsar fuera lo cierra");
  await p.click("#langBtn");
  eq(await p.evaluate(() => document.activeElement.dataset.lang), "de", "al abrir, el foco está en el idioma actual");
  await p.keyboard.press("ArrowDown"); eq(await p.evaluate(() => document.activeElement.dataset.lang), "el", "flecha abajo pasa al siguiente");
  await p.keyboard.press("Enter"); await p.waitForFunction(() => location.hash === "#el");
  ok(true, "Intro lo elige: se abre el griego");
  await p.click(".brand-mark"); await p.waitForFunction(() => !document.getElementById("picker").hidden);
  ok(true, "la marca «Vocabulando.» sigue llevando a la pantalla inicial");
  noErrors(p);
});

// =====================================================================================================================
// =====================================================================================================================
// CAMBIO DE WEB: desplegable con el logo de cada app
// =====================================================================================================================
test("Cambio de web · desplegable con el logo de cada app, en la pantalla de idiomas y dentro de un idioma", async () => {
  const h = await open({ lang: "de", seed: newDeck("de", 5, false) });
  eq(await h.locator(".appwrap:visible").count(), 0, "por http no aparece: las rutas relativas entre carpetas no valdrían");
  const p = await openFile("Vocabulando/Vocabulando.html");
  await p.waitForSelector("#picker:not([hidden])");
  const chip = () => p.locator(".appchip:visible"), menu = () => p.locator(".appmenu:visible");
  eq([await chip().count(), await menu().count()], [1, 0], "en la pantalla de idiomas hay un botón y la lista está cerrada");
  eq(await chip().locator("svg.applogo").count(), 1, "el botón lleva el logo de esta web");
  await chip().click();
  ok(await menu().isVisible() && (await chip().getAttribute("aria-expanded")) === "true", "al pulsarlo se despliega");
  eq(await menu().locator(".appnm").allInnerTexts(), ["Vocabulando", "Conjugario", "Declinario"], "tres opciones, en este orden");
  eq(await menu().locator(".appopt > svg.applogo").count(), 3, "cada opción empieza por su logo");
  eq(await menu().evaluate((m) => new Set([...m.querySelectorAll(".appopt > svg.applogo path")].map((x) => x.getAttribute("d"))).size), 3, "y los tres logos son distintos");
  eq(await menu().evaluate((m) => [...m.querySelectorAll(".appopt")].map((o) => o.tagName + ":" + (o.getAttribute("aria-current") || o.getAttribute("href")))),
    ["SPAN:page", "A:../Conjugario/index.html", "A:../Declinario/index.html"], "los otros dos son enlaces (sin idioma, porque no hay ninguno abierto); esta web va marcada y no es un enlace");
  eq(await p.evaluate(() => { const m = document.querySelector(".pick-btns .appmenu").getBoundingClientRect(); return [m.left >= 0, m.right <= innerWidth]; }), [true, true], "la lista cabe en la pantalla");
  await p.keyboard.press("Escape"); ok(await menu().count() === 0 && await p.evaluate(() => document.activeElement.classList.contains("appchip")), "Escape la cierra y devuelve el foco al botón");
  await chip().click(); await p.mouse.click(5, 5); eq(await menu().count(), 0, "pulsar fuera la cierra");
  await chip().click(); eq(await p.evaluate(() => document.activeElement.dataset.app), "conjugario", "al abrir, el foco está en la primera web distinta de esta");
  await p.keyboard.press("ArrowUp"); await p.keyboard.press("ArrowUp"); eq(await p.evaluate(() => document.activeElement.dataset.app), "declinario", "con el teclado, las flechas dan la vuelta");
  await p.keyboard.press("Escape");
  // dentro de un idioma: otro botón (el de la cabecera) y el idioma viaja en el enlace
  await p.evaluate(() => { location.hash = "#it"; });
  await p.waitForSelector("#app:not([hidden])");
  eq([await chip().count(), await p.locator(".pick-btns .appchip").isVisible()], [1, false], "dentro de un idioma solo se ve el de la cabecera");
  await chip().click();
  eq(await menu().evaluate((m) => [...m.querySelectorAll(".appopt[href]")].map((a) => a.getAttribute("href"))), ["../Conjugario/index.html#it", "../Declinario/index.html#it"], "los enlaces llevan el idioma abierto");
  // convive con el desplegable de idiomas
  await p.click("#langBtn");
  ok(await menu().count() === 0 && await p.locator("#langMenu").isVisible(), "abrir la lista de idiomas cierra la de webs");
  await chip().click(); ok(await p.locator("#langMenu").isHidden() && await menu().isVisible(), "y al revés");
  // el tema viaja con el enlace
  await p.keyboard.press("Escape"); await p.locator(".js-theme:visible").click();
  const th = await p.evaluate(() => document.body.classList.contains("theme-dark") ? "dark" : "light"); await p.evaluate(() => localStorage.removeItem("idiomas:theme"));
  await chip().click(); await p.evaluate(() => document.querySelector(".appmenu:not([hidden]) .appopt[href]").addEventListener("click", (e) => e.preventDefault()));
  await p.click(".appmenu:not([hidden]) .appopt[href]");
  eq(await p.evaluate(() => localStorage.getItem("idiomas:theme")), th, "al pulsar un enlace, la otra web se abre con el tema que tienes aquí (" + th + ")");
  // la ayuda lo explica solo cuando el botón existe
  await p.locator(".js-info:visible").first().click(); await p.waitForSelector(".info-body");
  ok(/Conjugario \([^)]*\) o a Declinario/.test(await txt(p.locator("#infoOverlay"))), "la ayuda explica el botón del logo");
  noErrors(p); noErrors(h);
});

test("Cambio de web · en el móvil la pantalla de idiomas y la cabecera no desbordan", async () => {
  for (const vp of [{ width: 390, height: 780 }, { width: 360, height: 700 }, { width: 320, height: 700 }]) {
    for (const hash of ["", "#el"]) {
      const p = await openFile("Vocabulando/Vocabulando.html" + hash, { viewport: vp });
      await p.waitForTimeout(250);
      await p.locator(".appchip:visible").click();
      eq(await p.evaluate(() => { const m = document.querySelector(".appmenu:not([hidden])").getBoundingClientRect(); return [m.left >= 0, m.right <= innerWidth, document.documentElement.scrollWidth <= innerWidth + 1]; }), [true, true, true],
        "a " + vp.width + " px " + (hash ? "dentro de un idioma" : "en la pantalla de idiomas") + ": la lista cabe y la página no se ensancha");
      noErrors(p);
    }
  }
});



// =====================================================================================================================
// IMPORTAR UNA ENTRADA A OTRO IDIOMA: el «+» de Mazo y de la tarjeta de Estudiar
// =====================================================================================================================
// servicios simulados: wik = { «título»: contenido de la página del Wikcionario }, mm = { «frase»: traducción }; cuenta las consultas de cada uno
async function mockNet(page, o = {}) {
  page.net = { wik: 0, mm: 0 };
  await page.route(/es\.wiktionary\.org\/w\/api\.php/, (r) => { page.net.wik++; r.fulfill({ contentType: "application/json", body: JSON.stringify({ query: { pages: Object.entries(o.wik || {}).map(([title, content]) => ({ title, revisions: [{ slots: { main: { content } } }] })) } }) }); });
  await page.route(/api\.mymemory\.translated\.net/, (r) => { page.net.mm++; const q = new URL(r.request().url()).searchParams.get("q"), tr = (o.mm || {})[q]; r.fulfill({ contentType: "application/json", body: JSON.stringify({ matches: tr ? [{ segment: q, translation: tr, match: 1 }] : [] }) }); });
}
const wikEstacion = "== {{lengua|es}} ==\n=== {{sustantivo femenino|es}} ===\n{{trad-arriba|lugar de llegada de los trenes}}\n* {{t+|fr|t1=gare}}\n* {{t+|fr|t1=station}}\n* {{t+|it|t1=stazione}}\n* {{t+|pt|t1=estação}}\n* {{t+|pt|t1=paragem}}\n{{trad-abajo}}\n";
const impSeed = () => {   // «la estación» y «la calle» son las más antiguas: en Mazo salen al final de la lista, que así se puede desplazar
  const de = [{ esWord: "la estación", deWord: "der Bahnhof", esSent: "La estación está cerca", deSent: "Der Bahnhof ist nah", esGender: "f" }, { esWord: "la calle", deWord: "die Straße" }];
  for (let i = 0; i < 30; i++) de.push({ esWord: "palabra " + i, deWord: "Wort" + i });
  return { de: bucket("de", de), fr: bucket("fr", [{ esWord: "la calle", deWord: "la rue" }]), it: bucket("it", [{ esWord: "manzana", deWord: "la mela" }]) };
};
const imp = (p, id) => p.locator('li.row[data-id="' + id + '"] [data-imp]');
const opciones = (p) => p.locator("#impMenu .imp-opt").evaluateAll((l) => l.map((b) => b.dataset.impto));

test("Importar · el «+» sale en Mazo y en Estudiar, a la izquierda de los botones fijos, y solo si queda algún idioma sin la palabra", async () => {
  const p = await open({ seed: impSeed() }); await mazo(p);
  eq(await p.locator("li.row [data-imp]").count(), await p.locator("li.row").count(), "todas las filas llevan el «+» (ninguna palabra está ya en los 7 idiomas)");
  const orden = await p.locator("li.row").evaluateAll((rs) => rs.slice(0, 3).map((x) => [...x.querySelectorAll(".row-meta > *")].map((e) => e.dataset.imp !== undefined ? "importar" : e.dataset.say !== undefined ? "escuchar" : e.dataset.pause !== undefined ? "pausar" : e.dataset.edit !== undefined ? "editar" : e.dataset.del !== undefined ? "eliminar" : "otro")));
  ok(orden.every((o) => o.includes("importar") && o.indexOf("importar") < o.indexOf("escuchar") && o.indexOf("importar") < o.indexOf("pausar") && o.indexOf("pausar") < o.indexOf("editar") && o.indexOf("editar") < o.indexOf("eliminar")), "va antes de escuchar, pausar, editar y eliminar: " + JSON.stringify(orden[0]));
  eq([await p.locator('li.row [data-imp]').first().getAttribute("aria-label"), await p.locator('li.row [data-imp]').first().getAttribute("aria-haspopup")], ["Añadir a otro idioma", "menu"], "con su nombre accesible");
  // una palabra que ya está en los otros 7 idiomas no lleva «+»
  const todos = {}; for (const c of ["de", "fr", "it", "pt", "ca", "pl", "en", "el"]) todos[c] = bucket(c, [{ esWord: "el libro", deWord: "x" + c }, { esWord: "la mesa", deWord: "y" + c }].slice(0, c === "el" ? 1 : 2));
  const q = await open({ seed: todos }); await mazo(q);
  eq(await q.locator("li.row").evaluateAll((rs) => rs.map((x) => [x.querySelector(".row-es").innerText, !!x.querySelector("[data-imp]")])), [["la mesa", true], ["el libro", false]], "«el libro» está en los 7 idiomas: sin «+»; «la mesa» falta en griego: con «+»");
  await study(q); const lado = await q.locator(".k-tools > *").evaluateAll((l) => l.map((e) => e.className.split(" ")[0]));
  ok(lado.includes("k-pause") && (lado.includes("k-imp") ? lado.indexOf("k-imp") < lado.indexOf("k-pause") : true), "en la tarjeta de Estudiar, el «+» (si sale) va antes de pausar: " + JSON.stringify(lado));
  const r = await open({ seed: impSeed() }); await study(r);
  const k = await r.locator(".k-tools > *").evaluateAll((l) => l.map((e) => e.className.split(" ")[0]));
  ok(k.includes("k-imp") && k.indexOf("k-imp") < k.indexOf("k-pause"), "con palabra sin repetir en los demás idiomas sale: " + JSON.stringify(k));
  noErrors(p); noErrors(q); noErrors(r);
});

test("Importar · el menú ofrece solo los idiomas donde no está, se cierra con Escape o al pulsar fuera y se maneja con el teclado", async () => {
  const p = await open({ seed: impSeed() }); await mazo(p);
  await imp(p, "x1").click();   // «la calle»: ya está en francés (y es el idioma actual: alemán)
  ok(await p.locator("#impMenu").isVisible() && (await imp(p, "x1").getAttribute("aria-expanded")) === "true", "al pulsar el «+» se despliega el menú");
  eq(await opciones(p), ["it", "pt", "ca", "pl", "en", "el"], "sin alemán (el actual) ni francés (ya la tiene)");
  ok(/Añadir «la calle» a…/.test(await txt(p.locator(".imp-title"))) && await p.locator("#impMenu .flag").count() === 6, "titula con la palabra y cada idioma lleva su bandera");
  eq(await p.evaluate(() => document.activeElement.dataset.impto), "it", "el foco está en la primera opción");
  await p.keyboard.press("ArrowDown"); await p.keyboard.press("End"); eq(await p.evaluate(() => document.activeElement.dataset.impto), "el", "las flechas y Fin recorren la lista");
  await p.keyboard.press("Home"); eq(await p.evaluate(() => document.activeElement.dataset.impto), "it", "Inicio vuelve a la primera");
  await p.keyboard.press("Escape"); ok(await p.locator("#impMenu").count() === 0 && await p.evaluate(() => document.activeElement.hasAttribute("data-imp")), "Escape lo cierra y devuelve el foco al «+»");
  await imp(p, "x1").click(); await p.mouse.click(5, 5); eq(await p.locator("#impMenu").count(), 0, "pulsar fuera lo cierra");
  await imp(p, "x1").click(); await imp(p, "x1").click(); eq(await p.locator("#impMenu").count(), 0, "pulsar otra vez el «+» lo cierra");
  await imp(p, "x0").click(); eq((await opciones(p)).length, 7, "«la estación» no está en ningún otro idioma: salen los 7");
  await imp(p, "x1").click(); ok(await p.locator("#impMenu").count() === 1 && /la calle/.test(await txt(p.locator(".imp-title"))), "abrir el de otra fila cambia de menú (no quedan dos)");
  await p.waitForTimeout(320); await p.evaluate(() => window.scrollBy(0, 40)); await p.waitForTimeout(80); eq(await p.locator("#impMenu").count(), 0, "al desplazar la página se cierra (va fijo en la pantalla)");
  noErrors(p);
});

test("Importar · desde Mazo: Crear del otro idioma sale rellena y sin guardar, con las propuestas, y al guardar se vuelve a la misma lista", async () => {
  const p = await open({ seed: impSeed() });
  await mockNet(p, { wik: { "estación": wikEstacion }, mm: { "La estación está cerca": "A estação está perto" } });
  await mazo(p); await p.fill("#deckQ", "a"); await p.waitForTimeout(300);
  const n0 = await p.locator("li.row").count(); await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await imp(p, "x0").click(); await p.waitForTimeout(300); const y0 = await p.evaluate(() => Math.round(window.scrollY));
  ok(y0 > 200, "la lista se ha desplazado hasta la entrada (" + y0 + " px): así se puede comprobar que se vuelve al mismo punto");
  await p.click('#impMenu .imp-opt[data-impto="pt"]');
  await p.waitForFunction(() => location.hash === "#pt" && document.getElementById("esWord"));
  eq(await txt(p.locator(".panel-title").first()), "Importar entrada", "se abre Crear en portugués, como «Importar entrada»");
  ok(/Importando desde Alemán/.test(await txt(p.locator("#impBar"))) && /la estación/.test(await txt(p.locator("#impBar"))) && /der Bahnhof/.test(await txt(p.locator("#impBar"))), "con un aviso de dónde viene: «" + await txt(p.locator("#impBar")) + "»");
  eq([await p.inputValue("#esWord"), await p.inputValue("#esSent")], ["la estación", "La estación está cerca"], "la palabra y la frase en español, ya puestas");
  await p.waitForFunction(() => document.getElementById("deWord").value !== "", null, { timeout: 8000 });
  eq(await p.inputValue("#deWord"), "estação", "la palabra en portugués es la primera traducción del Wikcionario");
  await p.waitForFunction(() => document.getElementById("deSent").value !== "", null, { timeout: 8000 });
  eq(await p.inputValue("#deSent"), "A estação está perto", "y la frase, la traducción automática de MyMemory");
  ok(await p.locator(".sugg-chip.on").count() === 1 && await p.locator(".sugg-chip").count() === 2, "las demás traducciones siguen a mano para cambiarla (estação marcada, paragem)");
  ok(/emenin|f/i.test(await p.locator("#gtrigEs").getAttribute("title")), "el género en español viaja también: «" + await p.locator("#gtrigEs").getAttribute("title") + "»");
  eq(await stored(p, "pt"), null, "todavía no se ha guardado nada en portugués");
  ok(/Guardar y volver a Alemán/.test(await txt(p.locator("#save"))) && /Cancelar y volver a Alemán/.test(await txt(p.locator("#impCancel"))), "los botones dicen adónde se vuelve");
  await p.click(".sugg-chip:not(.on)"); eq(await p.inputValue("#deWord"), "paragem", "se puede cambiar por otra propuesta");
  await p.fill("#deWord", "a estação"); await p.click("#save");
  await p.waitForFunction(() => location.hash === "#de" && document.getElementById("deckBody"));
  const pt = (await stored(p, "pt")).deck; eq(pt.length, 1, "se guarda en portugués");
  const e = pt[0]; eq([e.esWord, e.deWord, e.esSent, e.deSent, e.esGender], ["la estación", "a estação", "La estación está cerca", "A estação está perto", "f"], "con todos sus campos (y el género en español)");
  ok(/Guardada en Portugués/.test(await txt(p.locator("#toast"))) && /de vuelta en Alemán/.test(await txt(p.locator("#toast"))), "avisa: «" + await txt(p.locator("#toast")) + "»");
  eq([await p.locator(".tab.is-active").innerText(), await p.inputValue("#deckQ"), await p.locator("li.row").count()], ["Mazo", "a", n0], "de vuelta en Mazo, con el mismo buscador y la misma lista");
  ok(Math.abs((await p.evaluate(() => Math.round(window.scrollY))) - y0) < 4, "y en el mismo punto de la página (" + y0 + " px, ahora " + (await p.evaluate(() => Math.round(window.scrollY))) + ")");
  await imp(p, "x0").click(); eq(await opciones(p), ["fr", "it", "ca", "pl", "en", "el"], "y ya no ofrece portugués para esa palabra");
  noErrors(p);
});

test("Importar · cancelar vuelve sin guardar nada; si no hay conexión el formulario sale igual (con el aviso de siempre) y no se puede guardar sin la palabra", async () => {
  const p = await open({ seed: impSeed() }); await mazo(p);
  await imp(p, "x0").click(); await p.click('#impMenu .imp-opt[data-impto="pt"]');
  await p.waitForFunction(() => location.hash === "#pt" && document.getElementById("esWord"));
  eq([await p.inputValue("#esWord"), await p.inputValue("#esSent"), await p.inputValue("#deWord"), await p.inputValue("#deSent")], ["la estación", "La estación está cerca", "", ""], "sin conexión: la parte en español sí, la del idioma nuevo vacía");
  await p.waitForSelector(".sugg-err", { timeout: 15000 }); ok(/no se pudo conectar/.test(await txt(p.locator(".sugg-err"))), "y el aviso de siempre de las consultas: «" + await txt(p.locator(".sugg-err")) + "»");
  await p.click("#save"); ok(/Rellena la palabra en los dos idiomas/.test(await txt(p.locator("#toast"))) && (await p.evaluate(() => location.hash)) === "#pt", "guardar sin la palabra del idioma avisa y no vuelve");
  await p.click("#impCancel"); await p.waitForFunction(() => location.hash === "#de" && document.getElementById("deckBody"));
  eq([await p.locator(".tab.is-active").innerText(), (await stored(p, "pt")) === null || (await stored(p, "pt")).deck.length === 0], ["Mazo", true], "al cancelar se vuelve a Mazo y el portugués sigue vacío");
  ok(/Importación cancelada/.test(await txt(p.locator("#toast"))), "con su aviso");
  // salir por otro camino (cambiar de idioma) también descarta el borrador
  await imp(p, "x0").click(); await p.click('#impMenu .imp-opt[data-impto="ca"]'); await p.waitForFunction(() => location.hash === "#ca" && document.getElementById("esWord"));
  await p.evaluate(() => { location.hash = "#it"; }); await p.waitForFunction(() => location.hash === "#it" && document.getElementById("esWord"));
  eq([await p.inputValue("#esWord"), await p.locator("#impBar").count(), await txt(p.locator(".panel-title").first())], ["", 0, "Nueva entrada"], "irse a otro idioma descarta el borrador: formulario vacío y sin aviso");
  await p.evaluate(() => { location.hash = "#ca"; }); await p.waitForFunction(() => location.hash === "#ca" && document.getElementById("esWord"));
  eq([await p.inputValue("#esWord"), await p.locator("#impBar").count()], ["", 0], "y al volver al idioma de la importación abandonada, el borrador no reaparece");
  noErrors(p);
});

test("Importar · desde Estudiar se vuelve a la misma tarjeta, y con las consultas automáticas apagadas no se pide nada a internet", async () => {
  const corto = { de: bucket("de", [{ esWord: "el tren", deWord: "der Zug" }, { esWord: "la estación", deWord: "der Bahnhof", esSent: "La estación está cerca", deSent: "Der Bahnhof ist nah" }]), it: bucket("it", [{ esWord: "manzana", deWord: "la mela" }]) };
  const p = await open({ seed: corto, prefs: { "vocabulando:autoSuggest": "0" } });
  await mockNet(p, { wik: { "estación": wikEstacion }, mm: { "La estación está cerca": "La gare est proche" } });
  await study(p);
  const f = async () => (await front(p));
  for (let k = 0; k < 4 && (await f()) !== "la estación"; k++) { await p.click("#show"); await p.click('[data-rate="Good"]'); await p.waitForFunction(() => !document.querySelector("[data-rate]")); }
  eq(await f(), "la estación", "llega «la estación»");
  await p.click(".k-imp"); await p.click('#impMenu .imp-opt[data-impto="it"]');
  await p.waitForFunction(() => location.hash === "#it" && document.getElementById("esWord"));
  eq([await p.inputValue("#esWord"), await p.inputValue("#deWord"), await p.inputValue("#deSent")], ["la estación", "", ""], "con las consultas automáticas apagadas, la parte del idioma nuevo queda vacía");
  await p.waitForTimeout(400); eq([p.net.wik, p.net.mm], [0, 0], "y no se ha pedido nada al Wikcionario ni a MyMemory");
  await p.fill("#deWord", "la stazione"); await p.fill("#deSent", "La stazione è vicina"); await p.click("#save");
  await p.waitForFunction(() => location.hash === "#de" && document.querySelector(".k-front"));
  eq([await p.locator(".tab.is-active").innerText(), await f(), await p.locator("#show").count()], ["Estudiar", "la estación", 1], "de vuelta en Estudiar, con la tarjeta sin mostrar la respuesta");
  eq((await stored(p, "it")).deck.map((e) => e.deWord), ["la mela", "la stazione"], "y la entrada está guardada en italiano");
  // cancelar desde la tarjeta
  await p.click(".k-imp"); await p.click('#impMenu .imp-opt[data-impto="pt"]'); await p.waitForFunction(() => location.hash === "#pt" && document.getElementById("impCancel"));
  await p.click("#impCancel"); await p.waitForFunction(() => location.hash === "#de" && document.querySelector(".k-front"));
  eq([await f(), (await stored(p, "pt")) === null || (await stored(p, "pt")).deck.length === 0], ["la estación", true], "cancelar también devuelve a la tarjeta y no guarda nada");
  await p.click('.seg-btn[data-mode="sentence"]'); await p.waitForSelector(".k-front");
  await p.click(".k-imp"); await p.click('#impMenu .imp-opt[data-impto="pt"]'); await p.waitForFunction(() => location.hash === "#pt" && document.getElementById("impCancel"));
  await p.click("#impCancel"); await p.waitForFunction(() => location.hash === "#de" && document.querySelector(".k-front"));
  eq(await txt(p.locator(".seg-btn.is-active")), "Frases", "y se vuelve al mismo modo de estudio (Frases)");
  noErrors(p);
});



// =====================================================================================================================
// IPA: transcripción fonética de la palabra, consultada en el Wiktionary en el momento
// OJO: estas pruebas usan páginas del Wiktionary SIMULADAS, escritas a mano a partir de cómo es su marcado (los encabezados de idioma, la sección
// «Pronunciation» y los <span class="IPA"> con la etiqueta de acento). No son respuestas reales del servicio: no se pudo llegar a él al escribirlas.
// =====================================================================================================================
const wikOld = false;
const wikRoot = (...inners) => '<div class="mw-content-ltr mw-parser-output" lang="en" dir="ltr">' + inners.join("") + "</div>";
const wikInner = (lang, body, old = false) => (old ? '<h2><span class="mw-headline" id="' + lang + '">' + lang + "</span></h2>" : '<div class="mw-heading mw-heading2"><h2 id="' + lang + '">' + lang + "</h2></div>") + body;
const wikHead = (lang, body, old = false) => wikRoot(wikInner(lang, body, old));
const wikLine = (label, ...ipas) => "<li>" + (label ? '<span class="usage-label-accent"><span class="ib-brac qualifier-brac">(</span><span class="ib-content qualifier-content"><a href="/wiki/x" title="x">' + label + '</a></span><span class="ib-brac qualifier-brac">)</span></span> ' : "") +
  '<a href="/wiki/Wiktionary:International_Phonetic_Alphabet" title="Wiktionary:International Phonetic Alphabet">IPA</a><sup>(<a href="/wiki/Appendix:Pronunciation">key</a>)</sup>: ' + ipas.map((i) => '<span class="IPA nowrap">' + i + "</span>").join(", ") + "</li>";
const wikPron = (old, ...lines) => (old ? '<h3><span class="mw-headline" id="Pronunciation">Pronunciation</span></h3>' : '<div class="mw-heading mw-heading3"><h3 id="Pronunciation">Pronunciation</h3></div>') +
  "<ul>" + lines.join("") + "<li>Rhymes: <a href=\"/wiki/Rhymes:French/aʁ\"><span class=\"IPA\">-aʁ</span></a></li></ul>";
const wikEty = '<div class="mw-heading mw-heading3"><h3 id="Etymology">Etymology</h3></div><p>De <i>garer</i> <span class="IPA">/ɡa.ʁe/</span>.</p>';
// pages: { título: html | null (no existe) }; cuenta las peticiones que llegan
async function mockWik(page, pages, o = {}) {
  page.ipaReq = [];
  await page.route(/en\.wiktionary\.org\/w\/api\.php/, (r) => {
    const u = new URL(r.request().url()), title = u.searchParams.get("page");
    if (u.searchParams.get("action") !== "parse") return r.fulfill({ contentType: "application/json", body: "{}" });
    page.ipaReq.push(title);
    if (o.fail) return r.abort();
    const html = pages[title];
    r.fulfill({ contentType: "application/json", body: JSON.stringify(html == null ? { error: { code: "missingtitle", info: "The page you specified doesn't exist." } } : { parse: { title, pageid: 1, text: html } }) });
  });
}
const ipaBox = (p, id) => p.locator('li.row[data-id="' + id + '"] .ipa-box');
const ipaTxt = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();
const wikFr = (old) => wikRoot(wikInner("French", wikEty + wikPron(old, wikLine("France", "/ɡaʁ/"), wikLine("Quebec", "/ɡɑːʁ/", "[ɡɑ̝ːʁ]")), old), wikInner("Italian", wikPron(old, wikLine("", "/ˈɡa.re/")), old));

test("IPA · en Mazo: el botón va tras el altavoz y antes de pausar; se consulta al abrirlo (una sola vez), con acento de Francia y avisando de lo omitido", async () => {
  const p = await open({ lang: "fr", seed: { fr: bucket("fr", [{ esWord: "la estación", deWord: "la gare" }]) } });
  await mockWik(p, { gare: wikFr(false) }); await mazo(p);
  const orden = await p.locator("li.row .row-meta > *").evaluateAll((l) => l.map((e) => e.dataset.say !== undefined ? "escuchar" : e.dataset.ipa !== undefined ? "ipa" : e.dataset.pause !== undefined ? "pausar" : e.dataset.edit !== undefined ? "editar" : e.dataset.del !== undefined ? "eliminar" : "otro"));
  ok(orden.indexOf("ipa") === orden.indexOf("escuchar") + 1 && orden.indexOf("ipa") === orden.indexOf("pausar") - 1, "va justo después de escuchar y antes de pausar: " + JSON.stringify(orden));
  eq([await p.locator("[data-ipa]").getAttribute("aria-expanded"), await p.locator("[data-ipa]").innerText()], ["false", "IPA"], "cerrado al principio, con su texto «IPA»");
  eq(p.ipaReq.length, 0, "no se pide nada hasta pulsarlo");
  await p.click("[data-ipa]");
  await p.waitForSelector(".ipa-box .ipa-sym");
  const t = await ipaTxt(p.locator(".ipa-box"));
  ok(/gare/.test(t) && /France/.test(t) && /\/ɡaʁ\//.test(t), "sale «gare», la etiqueta de Francia y su transcripción fonémica: «" + t + "»");
  ok(!/ɡɑːʁ/.test(t) && /se omiten: Quebec/.test(t), "no sale la de Quebec y avisa de que se omite");
  ok(!/ˈɡa\.re/.test(t) && !/-aʁ/.test(t) && !/ɡa\.ʁe/.test(t), "ni la de otro idioma de la misma página, ni las rimas, ni lo que haya fuera de «Pronunciation»");
  eq(await p.locator(".ipa-src").getAttribute("href"), "https://en.wiktionary.org/wiki/gare#French", "con el enlace a la entrada del Wiktionary, en la sección del idioma");
  eq([p.ipaReq, await p.locator("[data-ipa]").getAttribute("aria-expanded")], [["gare"], "true"], "una sola petición, con la palabra sin artículo");
  await p.click("[data-ipa]"); eq(await p.locator(".ipa-box").count(), 0, "al pulsar otra vez se cierra");
  await p.click("[data-ipa]"); await p.waitForSelector(".ipa-box .ipa-sym"); eq(p.ipaReq.length, 1, "y al reabrirlo no vuelve a pedir nada (se recuerda mientras la página está abierta)");
  eq(await stored(p, "fr").then((b) => Object.keys(b.deck[0]).sort()), ["createdAt", "deSent", "deWord", "esSent", "esWord", "id"], "y no se guarda nada en la entrada");
  await p.evaluate(() => { location.hash = "#it"; }); await p.waitForFunction(() => location.hash === "#it" && document.getElementById("esWord"));
  await p.evaluate(() => { location.hash = "#fr"; }); await p.waitForFunction(() => location.hash === "#fr" && document.getElementById("esWord")); await mazo(p);
  eq(await p.locator(".ipa-box").count(), 0, "al cambiar de idioma y volver, lo abierto se cierra (pero lo consultado sigue recordado)");
  noErrors(p);
});

test("IPA · acento europeo en cada idioma: portugués de Portugal, inglés británico, alemán estándar; y las dos generaciones de marcado del Wiktionary", async () => {
  const pt = wikHead("Portuguese", wikPron(false, wikLine("Brazil", "/ˈka.ʁu/"), wikLine("Portugal", "/ˈka.ʁu/", "[ˈka.ʁu]")));
  const en = wikHead("English", wikPron(true, wikLine("UK", "/ˈwɔːtə/"), wikLine("US", "/ˈwɔtɚ/", "/ˈwɑtɚ/")), true);
  const de = wikHead("German", wikPron(false, wikLine("Germany", "/ˈkaːtɐ/"), wikLine("Austria", "/ˈkaːtɐ/"), wikLine("Switzerland", "/ˈkaːtər/")));
  const envuelto = '<div class="mw-content-ltr mw-parser-output"><div class="extra">' + wikHead("English", wikPron(false, wikLine("UK", "/ɡeɪt/"), wikLine("US", "/ɡeɪt/"))).replace(/^<div[^>]*>|<\/div>$/g, "") + "</div></div>";
  const orden = wikHead("Portuguese", wikPron(false, wikLine("", "/ˈka.zɐ/"), wikLine("Portugal", "/ˈkaː.zɐ/")));
  const sinMarcado = wikHead("French", wikPron(false, '<li>(Quebec) IPA: <span class="IPA">/vid/</span></li>', '<li>(Paris) IPA: <span class="IPA">/vid/</span></li>'));
  const casos = [
    ["pt", "casa", { casa: orden }, ["Portugal", "/ˈkaː.zɐ/", "/ˈka.zɐ/"], []],
    ["fr", "vide", { vide: sinMarcado }, ["Paris", "/vid/", "se omiten: Quebec"], []],
    ["en", "gate", { gate: envuelto }, ["UK", "/ɡeɪt/"], ["se omiten: US"]],   // con un <div> de más alrededor del contenido
    ["pt", "o carro", { carro: pt }, ["Portugal", "/ˈka.ʁu/", "[ˈka.ʁu]"], ["se omiten: Brazil"]],
    ["en", "water", { water: en }, ["UK", "/ˈwɔːtə/"], ["se omiten: US"]],
    ["de", "der Kater", { Kater: de }, ["Germany", "/ˈkaːtɐ/"], ["se omiten: Austria, Switzerland"]]];
  for (const [code, word, pages, dentro, notas] of casos) {
    const p = await open({ lang: code, seed: { [code]: bucket(code, [{ esWord: "x", deWord: word }]) } });
    await mockWik(p, pages); await mazo(p); await p.click("[data-ipa]"); await p.waitForSelector(".ipa-box .ipa-sym");
    const t = await ipaTxt(p.locator(".ipa-box"));
    ok(dentro.every((x) => t.includes(x)) && notas.every((x) => t.includes(x)), code + " «" + word + "»: «" + t + "»");
    if (word === "casa") ok(t.indexOf("Portugal") < t.indexOf("/ˈka.zɐ/"), "el acento preferido (Portugal) sale antes que el que no lleva etiqueta");
    ok(!/ˈwɔtɚ|ˈwɑtɚ|ˈkaːtər/.test(t) && !/US \//.test(t), code + ": no sale la variante no europea ni la regional");
    noErrors(p);
  }
});

test("IPA · si el Wiktionary solo trae una variante no europea, se muestra avisando; y los casos sin transcripción dicen por qué", async () => {
  const pt = wikHead("Portuguese", wikPron(false, wikLine("Brazil", "/a.ba.kaˈʃi/"), wikLine("Brazil · Rio de Janeiro", "/a.ba.kaˈʃi/")));
  const soloEn = wikHead("English", wikPron(false, wikLine("", "/ɡɑːr/")));
  const sinIpa = wikHead("French", wikEty + "<ul><li>Audio: algo</li></ul>");
  const p = await open({ lang: "pt", seed: { pt: bucket("pt", [{ esWord: "a", deWord: "abacaxi" }, { esWord: "b", deWord: "gare" }, { esWord: "c", deWord: "nada" }]) } });
  await mockWik(p, { abacaxi: pt, gare: soloEn, nada: null }); await mazo(p);
  const fila = (w) => p.locator("li.row", { hasText: w });
  await fila("abacaxi").locator("[data-ipa]").click(); await p.waitForSelector(".ipa-sym");
  const t = await ipaTxt(fila("abacaxi").locator(".ipa-box"));
  ok(/sin acento europeo/.test(t) && /Brazil/.test(t) && /a\.ba\.kaˈʃi/.test(t), "solo Brasil: se muestra con el aviso «sin acento europeo»: «" + t + "»");
  await fila("gare").locator("[data-ipa]").click(); await p.waitForSelector("li.row >> text=no la tiene en portugués");
  ok(/el Wiktionary no la tiene en portugués/.test(await ipaTxt(fila("gare").locator(".ipa-box"))), "página sin sección del idioma: lo dice");
  await fila("nada").locator("[data-ipa]").click(); await p.waitForSelector("li.row >> text=no tiene esta palabra");
  ok(/el Wiktionary no tiene esta palabra/.test(await ipaTxt(fila("nada").locator(".ipa-box"))) && p.ipaReq.filter((x) => x === "nada").length >= 1, "página que no existe: lo dice (tras probar la otra grafía)");
  // una sección del idioma sin transcripción
  const q = await open({ lang: "fr", seed: { fr: bucket("fr", [{ esWord: "x", deWord: "vide" }]) } });
  await mockWik(q, { vide: sinIpa }); await mazo(q); await q.click("[data-ipa]"); await q.waitForSelector("li.row >> text=no trae su transcripción");
  ok(true, "una sección del idioma sin transcripción: «el Wiktionary no trae su transcripción»");
  noErrors(p); noErrors(q);
});

test("IPA · varias formas en la palabra, y la segunda grafía (mayúscula en alemán); lo que falla se puede reintentar", async () => {
  const kat = wikHead("German", wikPron(false, wikLine("", "/ˈkat͡sə/")));
  const kater = wikHead("German", wikPron(false, wikLine("Germany", "/ˈkaːtɐ/")));
  const p = await open({ lang: "de", seed: { de: bucket("de", [{ esWord: "el gato", deWord: "die Katze (pl. Katzen) / der Kater" }, { esWord: "la casa", deWord: "das haus" }]) } });
  await mockWik(p, { Katze: kat, Kater: kater, Haus: wikHead("German", wikPron(false, wikLine("", "/haʊ̯s/"))) }); await mazo(p);
  await p.locator("li.row", { hasText: "Kater" }).locator("[data-ipa]").click(); await p.waitForSelector(".ipa-form >> nth=1");
  const t = await ipaTxt(p.locator(".ipa-box"));
  ok(/Katze/.test(t) && /ˈkat͡sə/.test(t) && /Kater/.test(t) && /ˈkaːtɐ/.test(t), "salen las dos formas, cada una con su transcripción: «" + t + "»");
  eq(await p.locator(".ipa-form").count(), 2, "en dos líneas");
  await p.locator("li.row", { hasText: "haus" }).locator("[data-ipa]").click(); await p.waitForSelector("li.row >> text=haʊ̯s");
  ok(p.ipaReq.includes("haus") && p.ipaReq.includes("Haus"), "«das haus»: prueba «haus» y, como no existe, «Haus» (en alemán los sustantivos van con mayúscula): " + JSON.stringify(p.ipaReq));
  // sin conexión: aviso y «Reintentar»
  const q = await open({ lang: "fr", seed: { fr: bucket("fr", [{ esWord: "x", deWord: "la gare" }]) } });
  await mockWik(q, { gare: wikFr(false) }, { fail: true }); await mazo(q); await q.click("[data-ipa]");
  await q.waitForSelector(".ipa-err"); ok(/No se pudo consultar: no se pudo conectar con el Wiktionary/.test(await ipaTxt(q.locator(".ipa-box"))), "sin conexión: «" + await ipaTxt(q.locator(".ipa-box")) + "»");
  await q.unroute(/en\.wiktionary\.org\/w\/api\.php/); await mockWik(q, { gare: wikFr(false) });
  await q.click("[data-ipa-retry]"); await q.waitForSelector(".ipa-sym");
  ok(/\/ɡaʁ\//.test(await ipaTxt(q.locator(".ipa-box"))), "«Reintentar» vuelve a consultar y ahora sale");
  noErrors(p); noErrors(q);
});

test("IPA · en Estudiar el botón aparece cuando ya ves la palabra del idioma (tras mostrar la respuesta, o desde el principio en «Inversa»)", async () => {
  const seed = { fr: bucket("fr", [{ esWord: "la estación", deWord: "la gare" }]) };
  const p = await open({ lang: "fr", seed, prefs: { "vocabulando:rev": "1" } });
  await mockWik(p, { gare: wikFr(true) }); await study(p);
  eq(await p.locator('[data-ipa="card"]').count(), 0, "en Palabras, antes de mostrar la respuesta no se ve (revelaría la palabra)");
  await p.click("#show");
  const orden = await p.locator(".k-tools > *").evaluateAll((l) => l.map((e) => e.dataset.ipa !== undefined ? "ipa" : e.className.split(" ")[0]));
  ok(orden.includes("ipa") && orden.indexOf("ipa") < orden.indexOf("k-pause"), "con la respuesta a la vista sale, antes del botón de pausar: " + JSON.stringify(orden));
  await p.click('[data-ipa="card"]'); await p.waitForSelector(".karte .ipa-sym");
  ok(/France/.test(await ipaTxt(p.locator(".karte .ipa-box"))) && /\/ɡaʁ\//.test(await ipaTxt(p.locator(".karte .ipa-box"))), "se abre dentro de la tarjeta, con el marcado antiguo del Wiktionary también: «" + await ipaTxt(p.locator(".karte .ipa-box")) + "»");
  ok(await p.locator(".karte #show").count() === 0 && await p.locator("[data-rate]").count() === 4, "y la tarjeta sigue con sus botones de valorar");
  await p.click('.seg-btn[data-mode="rev"]'); await p.waitForSelector(".k-front");
  eq(await p.locator('[data-ipa="card"]').count(), 1, "en «Inversa» (el anverso es la palabra del idioma) sale desde el principio");
  await p.waitForSelector(".karte .ipa-sym"); eq(p.ipaReq, ["gare"], "la transcripción ya abierta para esa palabra sigue ahí al cambiar de modo, sin volver a pedirla");
  noErrors(p);
});


(async () => {
  const filter = process.argv[2];
  await startServer(); browser = await chromium.launch(); const t0 = Date.now();
  for (const t of T) {
    if (filter && !t.name.toLowerCase().includes(filter.toLowerCase())) continue;
    console.log("\n" + t.name);
    try { await t.fn(); } catch (e) { fails++; console.log("   FALLA la prueba se interrumpió: " + (e && e.message ? e.message.split("\n")[0] : e)); }
    for (const c of ctxs) await c.close().catch(() => { }); ctxs = [];
  }
  await browser.close(); await stopServer();
  console.log("\n" + (fails ? fails + " FALLOS · " : "TODO OK · ") + passes + " comprobaciones correctas · " + Math.round((Date.now() - t0) / 1000) + " s");
  process.exit(fails ? 1 : 0);
})();

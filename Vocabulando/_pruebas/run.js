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
  const list = voices.map((l) => ({ lang: l, name: "voz " + l, localService: true }));
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

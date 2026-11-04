// Pruebas automáticas de Declinario. Uso: node run.js [texto]   (con «texto» solo se ejecutan las pruebas cuyo nombre lo contenga)
// Abren la app en un Chromium real, bloquean internet y comparan las tablas con una lista de formas de referencia (formas.js), escrita aparte.
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const { GOLD } = require("./formas.js");

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
const txt = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();
const topic = (p, id, mode) => p.evaluate(([i, m]) => { state.topic[state.lang] = i; state.mode = m || "table"; setTab("practice"); renderSubtabs(); newExercise(); }, [id, mode]);
const same = (a, b) => JSON.stringify([...new Set(a)].sort()) === JSON.stringify([...new Set(b)].sort());

// =====================================================================================================================
// DATOS
// =====================================================================================================================
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

test("Frases · todas tienen su hueco y piden una respuesta que se acepta", async () => {
  const p = await open();
  const r = await p.evaluate(() => {
    const out = { n: 0, bad: [], v1: 0 };
    for (const code of LANG_ORDER) {
      state.lang = code;
      for (const t of LANGS[code].topics) for (const ch of gapChoices(t, code)) for (const fr of ch.frames) {
        out.n++;
        const tx = frameText(fr);
        if (tx.split("{}").length !== 2) out.bad.push(code + ": «" + tx + "» sin hueco único");
        const ans = frameAnswer(ch.cell, fr);
        if (!matches(fillOf(ans), ans)) out.bad.push(code + ": «" + ans + "» no se acepta");
        if (typeof fr === "object" && fr.v === 1 && variants(ch.cell).length > 1) { out.v1++; if (ans !== variants(ch.cell)[1]) out.bad.push(code + ": la frase con elisión debería pedir «" + variants(ch.cell)[1] + "» y pide «" + ans + "»"); }
        if (typeof fr === "object" && fr.v === 0 && ans !== variants(ch.cell)[0]) out.bad.push(code + ": la frase sin elisión pide «" + ans + "»");
      }
    }
    state.lang = null;
    return out;
  });
  ok(r.n > 900 && r.bad.length === 0, r.n + " combinaciones de frase · " + r.v1 + " con elisión" + (r.bad.length ? " · fallos: " + r.bad.slice(0, 4).join(" | ") : ""));
  noErrors(p);
});

// =====================================================================================================================
// NAVEGACIÓN
// =====================================================================================================================
test("Inicio · ocho idiomas, cada uno con sus temas, y la dirección #xx abre uno directamente", async () => {
  const p = await open();
  eq(await p.locator(".choice").evaluateAll((b) => b.map((x) => x.dataset.lang)), ["fr", "it", "pt", "ca", "pl", "en", "de", "el"], "los ocho idiomas, en orden");
  ok(/^9 temas$/.test(await txt(p.locator('.choice[data-lang="de"] .cstar'))), "alemán: 9 temas");
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
  ok(/Cómo funciona Declinario/.test(h) && /Alemán, polaco y griego/.test(h) && /no guarda nada/.test(h) && /compruébala en una gramática/.test(h), "la ayuda explica qué hay en cada idioma, que no guarda nada y avisa de las erratas");
  await p.keyboard.press("Escape"); ok(await p.locator("#infoOverlay").count() === 0, "Escape cierra la ayuda");
  eq(await p.evaluate(() => { const b = document.getElementById("infoBtn"); return [b.previousElementSibling.id, b.nextElementSibling]; }), ["themeBtn", null], "el botón de ayuda va tras el del tema, como en las otras webs");
  ok(await p.locator("#sibBtn").isHidden(), "el enlace a Conjugario solo aparece abriendo los archivos del disco");
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
  await p.evaluate(() => { const t = curTopic(); const ch = gapChoices(t).find((c) => c.row.k === "dat" && c.col.k === "pl"); state.current = Object.assign({ kind: "gap", topic: t, frame: "Ich spreche mit {} {n}." }, ch); renderPractice(); });
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
  ok(r.sinHueco.length > 10, "los temas sin frases (" + [...new Set(r.sinHueco)].length + ") caen a la tabla y el botón de hueco se desactiva");
  await p.evaluate(() => { chooseLang("fr"); state.topic.fr = "poss"; setTab("practice"); });
  ok(await p.locator('.mode[data-mode="gap"]').isDisabled(), "en un tema sin frases el botón «Rellena el hueco» está desactivado");
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

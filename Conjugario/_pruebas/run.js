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
async function open(lang, o = {}) {
  const ctx = await browser.newContext({ viewport: o.viewport || { width: 1000, height: 1000 } }); ctxs.push(ctx);
  await ctx.route((u) => !u.href.startsWith(BASE), (r) => r.abort());
  const page = await ctx.newPage(); page.errs = []; page.on("pageerror", (e) => page.errs.push(String(e)));
  await page.goto(BASE + "index.html" + (lang ? "#" + lang : "")); await page.waitForFunction(() => window.__booted === true);
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
  await p.click("#btnReset"); eq(await p.evaluate(() => S().retry), { present: [] }, "«Reiniciar sesión» lo borra");
  noErrors(p);
});

test("Progreso · no se guarda nada en el navegador (decisión de diseño)", async () => {
  const p = await open("de"); await practice(p, "praesens", "table");
  await p.evaluate(() => { document.querySelectorAll("#panelPractice input.ans").forEach((i) => { i.value = cleanFill(i.dataset.answer); }); });
  await p.locator("#panelPractice button", { hasText: /Comprobar/ }).click(); await p.waitForSelector(".banner.show");
  ok(await p.locator(".chip.mastered").count() === 1, "se marca «dominado» en la sesión");
  eq(await p.evaluate(() => Object.keys(localStorage)), [], "pero no se escribe nada en localStorage");
  await p.reload(); await p.waitForFunction(() => window.__booted === true);
  ok(await p.locator(".chip.mastered").count() === 0, "al recargar todo empieza de cero, como antes");
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

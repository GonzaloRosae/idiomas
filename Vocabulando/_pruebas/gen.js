// Mazos sintéticos para las pruebas (nunca se usan los datos reales).
const base = Date.parse("2026-01-01T10:00:00Z");
const ART = ["der", "die", "das"];

// n palabras con frase y, si withReview, 2 tarjetas de repaso por palabra (palabra y frase)
function deck(lang, n, withReview) {
  const d = [], review = {};
  for (let i = 0; i < n; i++) {
    const id = "id" + i.toString(36).padStart(6, "0");
    d.push({ id, esWord: "la palabra " + i, deWord: ART[i % 3] + " Wort" + i,
      esSent: "Esta es la frase número " + i + " con la palabra " + i + ".",
      deSent: "Das ist der Satz Nummer " + i + " mit Wort" + i + ".", createdAt: base + i * 60000 });
    if (withReview) for (const m of ["word", "sentence"]) review[id + ":" + m] = card(3 + (i % 9), 3);
  }
  return { app: "vocabulando", version: 2, lang, savedAt: new Date().toISOString(), deck: d, review, stats: { reviewsTotal: withReview ? n * 2 : 0, byDay: {} }, log: [] };
}

// tarjeta ya en repaso (estado 2) con el vencimiento dado en días desde 2026-03-01
function card(dueDay, reps, lastReview) {
  return { due: "2026-03-0" + Math.min(9, dueDay) + "T12:00:00.000Z", stability: 2.4479456, difficulty: 7.38007427, elapsed_days: 1,
    scheduled_days: 2, reps: reps || 4, lapses: 1, learning_steps: 0, state: 2, last_review: lastReview || "2026-02-27T12:00:00.000Z" };
}

module.exports = { deck, card };

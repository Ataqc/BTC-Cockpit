/* ÉTUDE — POURQUOI LE COCKPIT NE DIT-IL (PRESQUE) JAMAIS D'AGIR ?
   ===============================================================

   À lancer depuis la racine du dépôt :  node etudes/paliers.js
   Aucune dépendance, aucune règle recopiée : la vraie page est chargée avec
   tests/sandbox.js et ce sont ses moteurs qui tournent.

   Question posée par l'utilisateur le 11 novembre 2026 : « depuis le début les
   conseils sont soit légère survente, soit surachat non actionnable, alors que
   ces détections étaient des opportunités ».

   Trois mesures, dans cet ordre :
   A. Où tombe réellement le score ? Répartition dans les six paliers du §8, en
      SWING (score complet 4 H + 1 J, exactement celui du cockpit) et en POSITION.
   B. Ces paliers « Rien » étaient-ils des occasions ? Rendement moyen des
      15 jours suivants (SWING) et 90 jours (POSITION), palier par palier,
      comparé à tous les jours de la même période.
   C. Et depuis que l'utilisateur s'en sert ? Même lecture sur les semaines
      récentes, jour par jour.

   Rien n'est modifié ici : c'est un constat, pas une proposition de réglage. */

"use strict";
const path = require("path");
const RACINE = path.join(__dirname, "..");
const sandbox = require(path.join(RACINE, "tests", "sandbox.js"));
const C = sandbox.load("index.html");
const { binance1d, coinmetrics, iso, JOUR } = require("./donnees.js");

const moy = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const pct = (x, d = 1) => (x === null ? "N/D" : (x >= 0 ? "+" : "") + x.toFixed(d) + " %");

/* bougies 4 heures, tout l'historique */
const { cache, json } = require("./donnees.js");
const binance4h = () => cache("binance-4h", async () => {
  let out = [], t = Date.UTC(2017, 0, 1);
  for(;;){
    const k = await json("https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT" +
                         "&interval=4h&limit=1000&startTime=" + t);
    if(!k.length) break;
    out = out.concat(k);
    if(k.length < 1000) break;
    t = k[k.length - 1][0] + 1;
    await new Promise(s => setTimeout(s, 200));
  }
  return out;
});

function repartition(titre, scores, close, horizonPas, pasParJour, horizonJours, dates){
  const n = scores.length;
  const futur = i => {
    const j = i + horizonPas;
    return (j < close.length && scores[i] !== null && scores[i] !== undefined)
      ? (close[j] / close[i] - 1) * 100 : null;
  };
  const tous = [];
  const par = C.TIERS.map(() => []);
  const nb = C.TIERS.map(() => 0);
  let notes = 0;
  for(let i = 0; i < n; i++){
    const s = scores[i];
    if(s === null || s === undefined) continue;
    notes++;
    const t = C.tierFor(s);
    nb[t]++;
    const f = futur(i);
    if(f !== null){ par[t].push(f); tous.push(f); }
  }
  console.log("\n=== " + titre + " — " + notes + " points notés ===");
  console.log("palier                                       part du temps   rendement à " +
              horizonJours + " j   lecture");
  C.TIERS.forEach((T, i) => {
    const m = moy(par[i]);
    const base = moy(tous);
    let lecture = "";
    if(m !== null && base !== null){
      if(T.dir === "buy")  lecture = m > base ? "occasion confirmée" : "pas une occasion";
      else if(T.dir === "sell") lecture = m < base ? "excès confirmé" : "vendait trop tôt";
      else lecture = m > base ? "a mieux fait que la moyenne" : "a fait moins que la moyenne";
    }
    console.log(T.lbl.padEnd(44) + (100 * nb[i] / notes).toFixed(1).padStart(8) + " %" +
                pct(m).padStart(16) + "   " + lecture);
  });
  console.log("TOUS LES POINTS (référence)".padEnd(44) + "   100,0 %" + pct(moy(tous)).padStart(16));
  const actionnables = nb.reduce((a, b, i) => a + (C.TIERS[i].dir !== "hold" ? b : 0), 0);
  console.log("\n→ un palier actionnable dans la table : " +
              (100 * actionnables / notes).toFixed(1) + " % du temps (" + actionnables + " points sur " + notes + ")");
  return { nb, notes, par, tous };
}

(async () => {
  const [k4, kd, cmRows] = await Promise.all([binance4h(), binance1d(), coinmetrics()]);
  const S = C.cmSeries(cmRows);

  /* ---------- A et B : SWING, le score complet du cockpit ---------- */
  const R4 = C.simulate4h(k4, kd, Infinity, 70, 0.1, 7);
  const c4 = k4.map(k => parseFloat(k[4]));
  repartition("SWING — score 4 H + 1 J, " + iso(R4.from) + " au " + iso(R4.to),
              R4.scores, c4, 15 * 6, 6, 15);

  /* ce que la chaîne de décision en fait vraiment, une fois les ventes retirées */
  let agit = 0, notes4 = 0;
  R4.scores.forEach((s, i) => {
    if(s === null || s === undefined) return;
    notes4++;
    if(C.TIERS[C.tierRules(s, "swing", "RANGE", false, null, false).i].dir !== "hold") agit++;
  });
  console.log("→ après le retrait des ventes SWING, il reste " +
              (100 * agit / notes4).toFixed(1) + " % de bougies actionnables (achats seulement)");

  /* ---------- A et B : POSITION ---------- */
  const RP = C.simulatePosition(S, Infinity, 70, 0.1, 30, 0);
  const pxP = [];
  for(let i = 0; i < S.t.length; i++) if(S.px[i] > 0) pxP.push(S.px[i]);
  repartition("POSITION — score 1 J + 1 S + MVRV, " + iso(RP.from) + " au " + iso(RP.to),
              RP.scores, pxP, 90, 1, 90);

  /* ---------- C : les semaines récentes ---------- */
  console.log("\n=== C. DEPUIS LE 20 SEPTEMBRE 2026, JOUR PAR JOUR (clôtures journalières) ===");
  console.log("date         score swing   palier                                  prix        +15 j");
  const t0 = Date.UTC(2026, 8, 20);
  const dernier = {};                       /* dernière bougie 4 h close de chaque journée */
  k4.forEach((k, i) => { dernier[Math.floor(k[6] / JOUR) * JOUR] = i; });
  const jours = Object.keys(dernier).map(Number).filter(j => j >= t0).sort((a, b) => a - b);
  let nAct = 0;
  for(const j of jours){
    const i = dernier[j], s = R4.scores[i];
    if(s === null || s === undefined) continue;
    const t = C.tierFor(s);
    if(C.TIERS[t].dir !== "hold") nAct++;
    const f = (i + 15 * 6 < c4.length) ? (c4[i + 15 * 6] / c4[i] - 1) * 100 : null;
    console.log(iso(j) + "   " + s.toFixed(2).padStart(6) + "      " + C.TIERS[t].lbl.padEnd(40) +
                Math.round(c4[i]).toString().padStart(7) + " $" + (f === null ? "      —" : pct(f).padStart(9)));
  }
  console.log("\n→ " + nAct + " jour(s) actionnable(s) sur " + jours.length + " depuis le 20 septembre.");
})();

/* ÉTUDE — À QUELLE FRÉQUENCE LE GATE BLOQUE-T-IL, ET BLOQUE-T-IL LES BONS JOURS ?
   ==============================================================================

   À lancer depuis la racine du dépôt :  node etudes/blocage.js
   Aucune dépendance. Aucune règle recopiée : la vraie page est chargée avec
   tests/sandbox.js, et c'est SIG qui dit ce que chaque signal plaide.

   POURQUOI CETTE MESURE. Le gate exige 3 signaux sur 7 dans le sens de l'action.
   Un signal sans donnée ne confirme rien : il compte donc contre l'action. Or
   les liquidations sont N/D en permanence (aucune source gratuite n'existe), et
   le 7e signal peut être à égalité depuis que deux de ses composantes sont
   automatiques. Personne n'avait jamais chiffré ce que cela donne en pratique.

   CE QU'ON PEUT ENCADRER. Cinq signaux sur sept sont reconstituables :
   momentum/volume, funding, Fear & Greed, flux, premium. Restent inconnus le
   croisement prix/OI et le long/short, qui peuvent ajouter au plus 2 signaux
   alignés. D'où un encadrement EXACT, sans rien inventer :
     - 3 alignés ou plus parmi les 5  →  le gate passe, à coup sûr ;
     - 0 aligné parmi les 5           →  le gate bloque, à coup sûr (0+2 < 3) ;
     - 1 ou 2 alignés                 →  indéterminé, cela dépend des deux manquants.

   La seconde question est la plus importante : le gate bloque-t-il les jours
   qu'il fallait bloquer ? On compare donc le rendement des jours « gate passe »
   et des jours « gate bloque », pour une même action candidate. */

"use strict";
const path = require("path");
const RACINE = path.join(__dirname, "..");
const sandbox = require(path.join(RACINE, "tests", "sandbox.js"));
const C = sandbox.load("index.html");
const { binance1d, funding, fng, coinbase1d, coinmetrics, cache, json, iso, jourDe, JOUR } = require("./donnees.js");
const SIGNAUX = require("./signaux.js");

const binance4h = () => cache("binance-4h", async () => {
  let out = [], t = Date.UTC(2017, 0, 1);
  for(;;){
    const k = await json("https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT" +
                         "&interval=4h&limit=1000&startTime=" + t);
    if(!k.length) break;
    out = out.concat(k);
    if(k.length < 1000) break;
    t = k[k.length - 1][0] + 1;
  }
  return out;
});

const moy = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const pct = x => x === null ? "N/D" : (x >= 0 ? "+" : "") + x.toFixed(1) + " %";

function analyse(nom, horizon, points, SG, horizonJours){
  /* points : [{ jour, score, futur }] — un par clôture journalière */
  /* Séparer les deux sens : un bon jour pour un achat est un jour qui monte, un bon
     jour pour une vente est un jour qui baisse. Les mélanger ne voudrait rien dire. */
  const classes = { buy: { passe: [], bloque: [], indetermine: [] },
                    sell: { passe: [], bloque: [], indetermine: [] } };
  const tousFuturs = [];
  const parSens = { buy: {passe:0, bloque:0, indetermine:0}, sell: {passe:0, bloque:0, indetermine:0} };
  let candidats = 0, total = 0;
  const detail = [];

  for(const p of points){
    if(p.score === null || p.score === undefined) continue;
    total++;
    if(p.futur !== null) tousFuturs.push(p.futur);
    const dir = C.TIERS[C.tierFor(p.score)].dir;
    if(dir === "hold") continue;
    candidats++;
    const d = SIGNAUX.directions(C, SG, p.jour, horizon);
    const dispo = Object.keys(d).filter(k => d[k] !== null).length;
    const alignes = Object.keys(d).filter(k => d[k] === dir).length;
    const cls = alignes >= 3 ? "passe" : (alignes === 0 ? "bloque" : "indetermine");
    parSens[dir][cls]++;
    if(p.futur !== null) classes[dir][cls].push(p.futur);
    detail.push({ jour: p.jour, dir: dir, alignes: alignes, dispo: dispo, cls: cls, futur: p.futur });
  }

  console.log("\n=== " + nom + " ===");
  console.log("jours notés : " + total + " · dont un palier d'action candidat : " + candidats +
              " (" + (100 * candidats / total).toFixed(1) + " %)");
  console.log("\n                      achats      ventes      total");
  ["passe", "bloque", "indetermine"].forEach(cls => {
    const lbl = { passe: "gate passe (>=3/5)", bloque: "gate bloque (0/5)",
                  indetermine: "indéterminé (1-2/5)" }[cls];
    const a = parSens.buy[cls], v = parSens.sell[cls];
    console.log(lbl.padEnd(22) + String(a).padStart(6) + String(v).padStart(12) +
                (String(a + v) + " (" + (100 * (a + v) / candidats).toFixed(1) + " %)").padStart(16));
  });

  console.log("\nrendement moyen à " + horizonJours + " jours, par sens et par classe");
  console.log("référence, tous les jours notés : " + pct(moy(tousFuturs)));
  ["buy", "sell"].forEach(dir => {
    console.log("  " + (dir === "buy" ? "après un ACHAT candidat — un bon signal fait MIEUX que la référence"
                                      : "après une VENTE candidate — un bon signal fait MOINS que la référence"));
    ["passe", "indetermine", "bloque"].forEach(cls => {
      const lbl = { passe: "le gate laisse passer", bloque: "le gate bloque à coup sûr",
                    indetermine: "indéterminé" }[cls];
      console.log("      " + lbl.padEnd(28) + pct(moy(classes[dir][cls])).padStart(8) +
                  "  (" + classes[dir][cls].length + " jours)");
    });
  });
  return detail;
}

(async () => {
  const [kl, fund, peur, cb, cmRows, k4] = await Promise.all(
    [binance1d(), funding(), fng(), coinbase1d(), coinmetrics(), binance4h()]);
  const S = C.cmSeries(cmRows);
  const SG = SIGNAUX.construire(C, { kl, fund, peur, cb, S });

  /* ---------- SWING : le score 4 H + 1 J, lu à la dernière clôture de chaque jour ---------- */
  const R4 = C.simulate4h(k4, kl, Infinity, 70, 0.1, 7);
  const c4 = k4.map(k => parseFloat(k[4]));
  const dernier = {};
  k4.forEach((k, i) => { dernier[jourDe(k[6])] = i; });
  const joursSw = Object.keys(dernier).map(Number).sort((a, b) => a - b);
  const ptsSw = joursSw.map(j => {
    const i = dernier[j];
    return { jour: j, score: R4.scores[i],
             futur: (i + 15 * 6 < c4.length) ? (c4[i + 15 * 6] / c4[i] - 1) * 100 : null };
  }).filter(p => p.jour >= Date.UTC(2019, 8, 10));     /* tous les signaux existent */
  const detSw = analyse("SWING — gate à 3 sur 7, encadré par 5 signaux reconstitués",
                        "swing", ptsSw, SG, 15);

  /* ---------- POSITION ---------- */
  const RP = C.simulatePosition(S, Infinity, 70, 0.1, 30, 0);
  const tP = [], pxP = [];
  for(let i = 0; i < S.t.length; i++) if(S.px[i] > 0){ tP.push(S.t[i]); pxP.push(S.px[i]); }
  const ptsPo = tP.map((t, i) => ({
    jour: jourDe(t), score: RP.scores[i],
    futur: (i + 90 < pxP.length) ? (pxP[i + 90] / pxP[i] - 1) * 100 : null
  })).filter(p => p.jour >= Date.UTC(2019, 8, 10));
  analyse("POSITION — gate à 3 sur 7, même encadrement", "position", ptsPo, SG, 90);

  /* ---------- les sept dernières semaines, jour par jour ---------- */
  console.log("\n=== DEPUIS LE 20 SEPTEMBRE 2026 ===");
  const recents = detSw.filter(d => d.jour >= Date.UTC(2026, 8, 20));
  const compte = { passe: 0, bloque: 0, indetermine: 0 };
  recents.forEach(d => { compte[d.cls]++; });
  console.log(recents.length + " jours avec un palier candidat · gate passe à coup sûr : " +
              compte.passe + " · bloque à coup sûr : " + compte.bloque +
              " · indéterminé : " + compte.indetermine);
  recents.forEach(d => {
    console.log("  " + iso(d.jour) + "  " + (d.dir === "buy" ? "achat " : "vente ") +
                d.alignes + "/5 alignés · " + d.dispo + "/5 disponibles · " +
                { passe: "passe", bloque: "BLOQUÉ", indetermine: "indéterminé" }[d.cls] +
                (d.futur === null ? "" : "   15 j : " + pct(d.futur)));
  });
})();

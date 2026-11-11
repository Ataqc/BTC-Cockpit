/* ÉTUDE — UN GATE QUI NE REPOSE QUE SUR DES SIGNAUX MESURABLES
   ============================================================

   À lancer depuis la racine du dépôt :  node etudes/gate-simplifie.js
   Aucune dépendance. Aucune règle recopiée : la page est chargée avec
   tests/sandbox.js, c'est SIG qui dit ce que chaque signal plaide, et le crochet
   `gate` des moteurs applique l'étape 4 de la chaîne.

   POURQUOI. Le gate actuel exige 3 signaux sur 7. Quatre de ces sept n'ont aucun
   historique gratuit : on ne peut donc NI le rejouer, NI le valider. Mesuré le
   11 novembre 2026 : six fois sur dix son verdict dépend justement de ces
   signaux-là, et sur la part qu'on sait reconstituer il filtre à l'envers — les
   achats qu'il bloque ont mieux marché que ceux qu'il laisse passer. En face, le
   côté achat de la table, lui, paie. Un gate qui bloque ce qui paie, sans qu'on
   puisse le vérifier, est la pièce la plus fragile de la chaîne.

   CE QU'ON PEUT COMPARER, ET CE QU'ON NE PEUT PAS. Le gate actuel n'est pas
   rejouable : il n'entre dans aucune comparaison ci-dessous. On compare donc
   « aucun gate » — ce que mesurent tous les backtests du briefing depuis
   septembre — à des gates construits uniquement sur des signaux reconstituables.

   PROTOCOLE FIXÉ AVANT TOUT CALCUL :
   - cinq variantes, pas une de plus :
       B1 : momentum + funding + flux + premium (SANS Fear & Greed), seuil 2
       B2 : les mêmes quatre, seuil 3
       B3 : les cinq mesurables (avec Fear & Greed), seuil 2
       B4 : les cinq mesurables, seuil 3
       B5 : momentum + flux + premium (ni funding ni F&G), seuil 2 — le seul jeu
            testable avant septembre 2019, donc sur une fenêtre plus longue ;
     le seuil 2 est l'équivalent proportionnel du « 3 sur 7 » actuel (43 %) ;
   - SWING journalier sur la fenêtre où les signaux existent, coupée en deux
     moitiés ; POSITION sur les deux cycles entièrement couverts ;
   - carences 7, 30 et 60 jours ; frais 0,1 % ; départ 70 % BTC ; impôt 0 % ;
   - DEUX lectures, et la seconde compte autant que la première :
       1. la performance contre « aucun gate » ;
       2. le SENS du filtrage — parmi les achats candidats, le rendement à 15
          jours de ceux que la variante laisse passer contre ceux qu'elle bloque.
          Un bon gate laisse passer les meilleurs. C'est plus robuste qu'une
          performance de portefeuille sur deux cycles.
   - TROIS ISSUES POSSIBLES, annoncées d'avance :
       (a) une variante bat « aucun gate » partout, à toutes les carences, sans
           pire perte plus profonde, ET filtre dans le bon sens → on la propose ;
       (b) aucune ne bat « aucun gate » → alors le gate n'apporte rien de
           mesurable, et la question devient : garder un gate invérifiable ?
           Décision de l'utilisateur, pas de la session ;
       (c) résultats mixtes → aucune règle ne change. */

"use strict";
const path = require("path");
const RACINE = path.join(__dirname, "..");
const sandbox = require(path.join(RACINE, "tests", "sandbox.js"));
const C = sandbox.load("index.html");
const { binance1d, coinmetrics, funding, fng, coinbase1d, cache, json, iso, jourDe, JOUR } = require("./donnees.js");
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

const VARIANTES = [
  ["B1 sans F&G, seuil 2",        ["momentum", "funding", "flux", "prem"], 2, Date.UTC(2019, 8, 10)],
  ["B2 sans F&G, seuil 3",        ["momentum", "funding", "flux", "prem"], 3, Date.UTC(2019, 8, 10)],
  ["B3 les cinq, seuil 2",        ["momentum", "funding", "fng", "flux", "prem"], 2, Date.UTC(2019, 8, 10)],
  ["B4 les cinq, seuil 3",        ["momentum", "funding", "fng", "flux", "prem"], 3, Date.UTC(2019, 8, 10)],
  ["B5 momentum+flux+premium, 2", ["momentum", "flux", "prem"], 2, Date.UTC(2017, 7, 17)]
];

function fabrique(SG, cles, seuil, horizon){
  return function(when, dir){
    const d = SIGNAUX.directions(C, SG, when, horizon);
    let n = 0;
    for(const c of cles) if(d[c] === dir) n++;
    return n >= seuil;
  };
}

const pct = x => x === null ? "N/D" : (x >= 0 ? "+" : "") + x.toFixed(x > 100 ? 0 : 1) + " %";
const perf = r => (r.eq[r.eq.length - 1] / r.eq[0] - 1) * 100;
const moy = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

(async () => {
  const [kl, k4, cmRows, fund, peur, cb] = await Promise.all(
    [binance1d(), binance4h(), coinmetrics(), funding(), fng(), coinbase1d()]);
  const S = C.cmSeries(cmRows);
  const SG = SIGNAUX.construire(C, { kl, fund, peur, cb, S });

  /* ================= 1. SENS DU FILTRAGE ================= */
  console.log("================ 1. CHAQUE VARIANTE FILTRE-T-ELLE DANS LE BON SENS ? ================");
  console.log("Parmi les ACHATS candidats du moteur SWING, rendement moyen à 15 jours.");
  console.log("Un bon gate laisse passer les meilleurs : « passe » doit être AU-DESSUS de « bloque ».\n");
  const R4 = C.simulate4h(k4, kl, Infinity, 70, 0.1, 7);
  const c4 = k4.map(k => parseFloat(k[4]));
  const dernier = {};
  k4.forEach((k, i) => { dernier[jourDe(k[6])] = i; });
  const joursSw = Object.keys(dernier).map(Number).sort((a, b) => a - b);

  console.log("variante                        achats   passe    bloque   écart");
  for(const [nom, cles, seuil, depuis] of VARIANTES){
    const g = fabrique(SG, cles, seuil, "swing");
    const passe = [], bloque = [];
    for(const j of joursSw){
      if(j < depuis) continue;
      const i = dernier[j], s = R4.scores[i];
      if(s === null || s === undefined) continue;
      if(C.TIERS[C.tierFor(s)].dir !== "buy") continue;
      if(i + 15 * 6 >= c4.length) continue;
      const f = (c4[i + 15 * 6] / c4[i] - 1) * 100;
      (g(j, "buy") ? passe : bloque).push(f);
    }
    const mp = moy(passe), mb = moy(bloque);
    console.log(nom.padEnd(32) + String(passe.length + bloque.length).padStart(6) +
      pct(mp).padStart(9) + pct(mb).padStart(10) +
      ((mp !== null && mb !== null) ? ((mp - mb >= 0 ? "+" : "") + (mp - mb).toFixed(1) + " pts").padStart(10) : "") +
      ((mp !== null && mb !== null && mp > mb) ? "  bon sens" : "  MAUVAIS SENS"));
  }

  /* ================= 2. PERFORMANCE ================= */
  console.log("\n================ 2. SWING JOURNALIER, CONTRE « AUCUN GATE » ================");
  for(const [nom, cles, seuil, depuis] of VARIANTES){
    const sous = kl.filter(k => k[0] >= depuis - 400 * JOUR);
    const total = Math.round((Date.now() - depuis) / JOUR);
    console.log("\n--- " + nom + " — depuis le " + iso(depuis) + " ---");
    console.log("fenêtre        carence   aucun gate   avec gate      écart   achats   pire perte");
    for(const [lbl, jours] of [["tout", total], ["seconde moitié", Math.round(total / 2)]]){
      for(const cool of [7, 30, 60]){
        const R = C.simulate(sous, jours, 70, 0.1, cool, 0, fabrique(SG, cles, seuil, "swing"));
        const A = R.runs.regime, B = R.runs.gate;
        console.log(lbl.padEnd(15) + String(cool).padStart(4) + " j " +
          pct(perf(A)).padStart(12) + pct(perf(B)).padStart(12) +
          ((perf(B) - perf(A) >= 0 ? "+" : "") + (perf(B) - perf(A)).toFixed(0) + " pts").padStart(11) +
          ("   " + A.trades.length + " / " + B.trades.length).padStart(10) +
          ("   -" + C.maxDD(A.eq).toFixed(0) + " % / -" + C.maxDD(B.eq).toFixed(0) + " %").padStart(16));
      }
    }
  }

  console.log("\n================ 3. POSITION, CYCLES ENTIÈREMENT COUVERTS ================");
  const CYCLES = [["2020-2024", Date.UTC(2020, 4, 11), Date.UTC(2024, 3, 20)],
                  ["2024-2026", Date.UTC(2024, 3, 20), Date.now()]];
  for(const [nom, cles, seuil, depuis] of VARIANTES){
    console.log("\n--- " + nom + " ---");
    console.log("cycle        carence   aucun gate   avec gate      écart   ventes   pire perte");
    for(const [cycle, a, b] of CYCLES){
      if(a < depuis){ console.log(cycle.padEnd(12) + " non couvert par ce jeu de signaux"); continue; }
      const garde = S.t.filter(t => t <= b).length;
      const Sc = { t: S.t.slice(0, garde), px: S.px.slice(0, garde), mc: S.mc.slice(0, garde),
                   mv: S.mv.slice(0, garde), sply: (S.sply || []).slice(0, garde) };
      const jours = Math.round((b - a) / JOUR);
      for(const cool of [7, 30, 60]){
        const R = C.simulatePosition(Sc, jours, 70, 0.1, cool, 0, fabrique(SG, cles, seuil, "position"));
        const A = R.runs.actuel, B = R.runs.gate;
        const v = r => r.trades.filter(t => t.type === "vente").length;
        console.log(cycle.padEnd(12) + String(cool).padStart(4) + " j " +
          pct(perf(A)).padStart(12) + pct(perf(B)).padStart(12) +
          ((perf(B) - perf(A) >= 0 ? "+" : "") + (perf(B) - perf(A)).toFixed(0) + " pts").padStart(11) +
          ("   " + v(A) + " / " + v(B)).padStart(10) +
          ("   -" + C.maxDD(A.eq).toFixed(0) + " % / -" + C.maxDD(B.eq).toFixed(0) + " %").padStart(16));
      }
    }
  }
})();

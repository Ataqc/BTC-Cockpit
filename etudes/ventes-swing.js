/* ÉTUDE — LE RETRAIT DES VENTES SWING DOIT-IL ÊTRE CONDITIONNEL ?
   ===============================================================

   À lancer depuis la racine du dépôt :  node etudes/ventes-swing.js
   Aucune dépendance, aucune règle recopiée : la page est chargée avec
   tests/sandbox.js et c'est son moteur qui tourne. Le prédicat de vente
   conditionnelle est un crochet d'étude de tierRules ; sans lui, le cockpit
   applique la règle du 8 septembre 2026 — aucune vente SWING, jamais.

   POURQUOI. L'interdiction totale gagne largement sur huit ans (§14). Mais du
   21 septembre au 11 novembre 2026, le cockpit a noté un palier de vente à
   84-86 k puis s'est tu : le bitcoin a perdu 14 % depuis ce sommet. La question
   n'est donc pas « faut-il revendre partout » mais « y a-t-il un contexte où la
   vente SWING méritait d'être gardée ».

   PROTOCOLE FIXÉ AVANT TOUT CALCUL :
   - cinq variantes, pas une de plus, définies par ce que la chaîne connaît déjà
     au moment de décider (le régime journalier et la tendance de fond) ;
   - deux périodes, celles du 8 septembre 2026 : jusqu'au 07/09/2021, puis après ;
   - deux moteurs : SWING journalier et SWING 4 heures ;
   - carences 7, 30 et 60 jours ; frais 0,1 % ; départ 70 % BTC ; impôt 0 % ;
   - ADOPTION seulement si une variante bat la règle actuelle sur LES DEUX
     périodes, aux TROIS carences, sur LES DEUX moteurs, sans pire perte plus
     profonde. Sinon rien ne change, et on le dit.
   - Un contrôle à 30 % d'impôt est fait à la fin : une variante qui vend doit
     aussi survivre à son coût fiscal. */

"use strict";
const path = require("path");
const RACINE = path.join(__dirname, "..");
const sandbox = require(path.join(RACINE, "tests", "sandbox.js"));
const C = sandbox.load("index.html");
const { binance1d, cache, json, iso, jourDe, JOUR } = require("./donnees.js");

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

/* Les variantes. Le prédicat reçoit (régime journalier, divergence baissière,
   tendance de fond baissière) et dit si la vente SWING est autorisée. */
const VARIANTES = [
  ["A. règle actuelle — aucune vente",            null],
  ["B. vendre hors TENDANCE",                     (reg) => reg !== "TENDANCE"],
  ["C. vendre si EMA 50 < EMA 200",               (reg, bear, down) => !!down],
  ["D. vendre seulement en RANGE",                (reg) => reg === "RANGE"],
  ["E. vendre dès que le palier le dit",          () => true]
];
const COUPURE = Date.UTC(2021, 8, 7);
const COOLS = [7, 30, 60];

function perf(r){ return (r.eq[r.eq.length - 1] / r.eq[0] - 1) * 100; }
function ventes(r){ return r.trades.filter(t => t.type === "vente").length; }
const pct = x => (x >= 0 ? "+" : "") + x.toFixed(0) + " %";

function passe(moteur, kl, k4, cool, pred, tax){
  if(moteur === "1j"){
    const p1 = C.simulate(kl.filter(k => k[0] <= COUPURE), Infinity, 70, 0.1, cool, tax, null, pred);
    const jours = Math.round((Date.now() - COUPURE) / JOUR);
    const p2 = C.simulate(kl, jours, 70, 0.1, cool, tax, null, pred);
    return [p1, p2];
  }
  const p1 = C.simulate4h(k4.filter(k => k[0] <= COUPURE),
                          kl.filter(k => k[0] <= COUPURE), Infinity, 70, 0.1, cool, tax, pred);
  const jours = Math.round((Date.now() - COUPURE) / JOUR);
  const p2 = C.simulate4h(k4, kl, jours, 70, 0.1, cool, tax, pred);
  return [p1, p2];
}

(async () => {
  const [kl, k4] = await Promise.all([binance1d(), binance4h()]);
  console.log("Bougies journalières : " + kl.length + " · 4 heures : " + k4.length);
  console.log("Coupure des périodes : " + iso(COUPURE));

  const ref = {};           /* performance de la règle actuelle, pour comparer */
  for(const moteur of ["1j", "4h"]){
    console.log("\n================ MOTEUR SWING " + (moteur === "1j" ? "JOURNALIER" : "4 HEURES") +
                " ================");
    console.log("variante                              carence   période 1    période 2    ventes 1/2   pire perte 1/2");
    for(const [nom, pred] of VARIANTES){
      for(const cool of COOLS){
        const [R1, R2] = passe(moteur, kl, k4, cool, pred, 0);
        const r1 = R1.runs.regime, r2 = R2.runs.regime;
        const cle = moteur + "-" + cool;
        if(pred === null) ref[cle] = { p1: perf(r1), p2: perf(r2), dd1: C.maxDD(r1.eq), dd2: C.maxDD(r2.eq) };
        const marque = pred === null ? "" :
          ((perf(r1) > ref[cle].p1 && perf(r2) > ref[cle].p2 &&
            C.maxDD(r1.eq) <= ref[cle].dd1 && C.maxDD(r2.eq) <= ref[cle].dd2) ? "  <-- mieux partout" : "");
        console.log(nom.padEnd(38) + String(cool).padStart(5) + " j " +
          pct(perf(r1)).padStart(11) + pct(perf(r2)).padStart(13) +
          ("   " + ventes(r1) + " / " + ventes(r2)).padStart(14) +
          ("   -" + C.maxDD(r1.eq).toFixed(0) + " % / -" + C.maxDD(r2.eq).toFixed(0) + " %").padStart(17) + marque);
      }
    }
  }

  /* ---- contrôle fiscal sur la variante la plus permissive ---- */
  console.log("\n================ CONTRÔLE À 30 % D'IMPÔT (moteur journalier, carence 30) ================");
  for(const [nom, pred] of VARIANTES){
    const [R1, R2] = passe("1j", kl, k4, 30, pred, 30);
    console.log(nom.padEnd(38) + pct(perf(R1.runs.regime)).padStart(11) +
                pct(perf(R2.runs.regime)).padStart(13) +
                ("   impôt " + (R1.runs.regime.impot * 100).toFixed(0) + " / " +
                 (R2.runs.regime.impot * 100).toFixed(0) + " pts").padStart(22));
  }

  /* ---- et le sommet du 21 septembre 2026 ? ---- */
  console.log("\n================ LES VENTES CANDIDATES DU 21-24 SEPTEMBRE 2026 ================");
  const R4 = C.simulate4h(k4, kl, Infinity, 70, 0.1, 7);
  const cD = kl.map(k => parseFloat(k[4]));
  const e50 = C.emaSeries(cD, 50), e200 = C.emaSeries(cD, 200);
  const dernier = {};
  k4.forEach((k, i) => { dernier[jourDe(k[6])] = i; });
  for(let d = Date.UTC(2026, 8, 20); d <= Date.UTC(2026, 8, 25); d += JOUR){
    const i = dernier[d];
    if(i === undefined || R4.scores[i] === null || R4.scores[i] === undefined) continue;
    const sc = R4.scores[i];
    if(C.TIERS[C.tierFor(sc)].dir !== "sell") continue;
    let j = 0;
    while(j + 1 < kl.length && kl[j + 1][0] <= d) j++;
    const reg = C.regimeOf(cD.slice(0, j + 1)).label, down = e50[j] < e200[j];
    const qui = VARIANTES.filter(([n, p]) => p && p(reg, false, down)).map(([n]) => n[0]);
    console.log("  " + iso(d) + "  score " + sc.toFixed(2) + " · régime " + reg.padEnd(11) +
                " · EMA50<EMA200 : " + (down ? "oui" : "non ") +
                " → auraient vendu : " + (qui.length ? qui.join(", ") : "aucune"));
  }
})();

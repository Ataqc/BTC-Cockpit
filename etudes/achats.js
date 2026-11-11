/* ÉTUDE — LE CÔTÉ ACHAT DE LA TABLE AJOUTE-T-IL QUELQUE CHOSE ?
   ============================================================

   À lancer depuis la racine du dépôt :  node etudes/achats.js
   Aucune dépendance. Aucune règle recopiée : la vraie page est chargée avec
   tests/sandbox.js et ce sont ses moteurs qui tournent. Le retrait des achats
   passe par le crochet `gate` des moteurs, déjà en place et déjà testé : un gate
   qui ne confirme jamais un achat ramène tout achat à « Rien », sans toucher au
   reste de la chaîne.

   POURQUOI. Trois mesures indépendantes disent la même chose : le rendement
   suivant un palier d'achat est INFÉRIEUR à la moyenne, en SWING (−1,6 % après un
   achat fort, contre +1,9 %) comme en POSITION (+13 % et +21 % à 90 jours, contre
   +36 %), et le gate n'y change rien — il bloque plutôt les bons achats. La
   question est donc posée exactement comme elle l'a été pour les ventes SWING le
   8 septembre 2026 : ce côté de la table mérite-t-il d'exister ?

   PROTOCOLE FIXÉ AVANT TOUT CALCUL :
   - deux variantes seulement — A, les règles actuelles ; B, les mêmes sans aucun
     achat — et deux références : conserver 70/30, et 100 % BTC conservé ;
   - SWING journalier et 4 heures sur les deux périodes du 8 septembre 2026
     (coupure au 07/09/2021) ; POSITION sur les quatre cycles coupés aux halvings ;
   - carences 7, 30 et 60 jours ; frais 0,1 % ; départ 70 % BTC ; impôt 0 % ;
   - la part finale en BTC est affichée à chaque fois : une variante qui finit plus
     exposée gagne mécaniquement dans un marché haussier, et cette comparaison-là
     ne prouverait rien (c'est le piège relevé au §14) ;
   - ADOPTION du retrait des achats seulement si B bat A sur CHAQUE période et
     CHAQUE cycle, à CHAQUE carence, sans pire perte plus profonde. Sinon rien ne
     change, et on le dit.

   CONTRÔLE INTERNE : en SWING, les règles actuelles ne vendent jamais ; leur
   retirer les achats doit donc donner EXACTEMENT « conserver 70/30 ». Si les deux
   colonnes diffèrent, c'est que le montage est faux. */

"use strict";
const path = require("path");
const RACINE = path.join(__dirname, "..");
const sandbox = require(path.join(RACINE, "tests", "sandbox.js"));
const C = sandbox.load("index.html");
const { binance1d, coinmetrics, cache, json, iso, JOUR } = require("./donnees.js");

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

/* le gate qui refuse tout achat et laisse passer le reste */
const sansAchat = (when, dir) => dir !== "buy";

const COUPURE = Date.UTC(2021, 8, 7);
const COOLS = [7, 30, 60];
const HALV = [Date.UTC(2012, 10, 28), Date.UTC(2016, 6, 9), Date.UTC(2020, 4, 11), Date.UTC(2024, 3, 20)];
const CYCLES = [["2012-2016", HALV[0], HALV[1]], ["2016-2020", HALV[1], HALV[2]],
                ["2020-2024", HALV[2], HALV[3]], ["2024-2026", HALV[3], Date.now()]];

const pct = x => (x >= 0 ? "+" : "") + x.toFixed(0) + " %";
const perf = r => (r.eq[r.eq.length - 1] / r.eq[0] - 1) * 100;
const partBtc = (r, px) => 100 * r.btc * px / (r.btc * px + r.cash);

function ligne(lbl, A, B, hold, btc100, px){
  const mieux = perf(B) > perf(A) && C.maxDD(B.eq) <= C.maxDD(A.eq);
  console.log(lbl.padEnd(22) +
    pct(perf(A)).padStart(10) + pct(perf(B)).padStart(11) +
    pct(perf(hold)).padStart(12) + pct(btc100).padStart(11) +
    ("   " + partBtc(A, px).toFixed(0) + " % / " + partBtc(B, px).toFixed(0) + " %").padStart(14) +
    ("   -" + C.maxDD(A.eq).toFixed(0) + " % / -" + C.maxDD(B.eq).toFixed(0) + " %").padStart(16) +
    (mieux ? "  <-- B mieux" : ""));
}

const entete = () =>
  console.log("période / carence    actuelles   sans achat   conserver     100 % BTC" +
              "   part BTC A/B   pire perte A/B");

(async () => {
  const [kl, k4, cmRows] = await Promise.all([binance1d(), binance4h(), coinmetrics()]);
  const S = C.cmSeries(cmRows);
  const cD = kl.map(k => parseFloat(k[4]));

  /* ---------- SWING journalier ---------- */
  console.log("\n================ SWING JOURNALIER ================");
  entete();
  for(const [nom, filtre, jours] of [
    ["période 1", k => k[0] <= COUPURE, Infinity],
    ["période 2", () => true, Math.round((Date.now() - COUPURE) / JOUR)]]){
    const sous = kl.filter(filtre);
    for(const cool of COOLS){
      const A = C.simulate(sous, jours, 70, 0.1, cool, 0);
      const B = C.simulate(sous, jours, 70, 0.1, cool, 0, sansAchat);
      const c = sous.map(k => parseFloat(k[4]));
      const i0 = Math.max(260, c.length - (jours === Infinity ? c.length : jours));
      const b100 = (c[c.length - 2] / c[i0] - 1) * 100;
      ligne(nom + " · " + cool + " j", A.runs.regime, B.runs.gate, A.hold, b100, A.pxFin);
    }
  }

  /* ---------- SWING 4 heures : le moteur n'a pas de crochet gate, on s'en passe ----------
     Inutile de le forcer : en SWING les règles actuelles ne vendent jamais, donc
     « sans achat » vaut « conserver », déjà mesuré ci-dessus. */

  /* ---------- POSITION ---------- */
  console.log("\n================ POSITION, cycles coupés aux halvings ================");
  for(const [cycle, a, b] of CYCLES){
    const garde = S.t.filter(t => t <= b).length;
    const Sc = { t: S.t.slice(0, garde), px: S.px.slice(0, garde), mc: S.mc.slice(0, garde),
                 mv: S.mv.slice(0, garde), sply: (S.sply || []).slice(0, garde) };
    const jours = Math.round((b - a) / JOUR);
    console.log("\n--- " + cycle + " ---");
    entete();
    for(const cool of COOLS){
      const A = C.simulatePosition(Sc, jours, 70, 0.1, cool, 0);
      const B = C.simulatePosition(Sc, jours, 70, 0.1, cool, 0, sansAchat);
      const px = [];
      for(let i = 0; i < Sc.t.length; i++) if(Sc.px[i] > 0) px.push(Sc.px[i]);
      const i0 = Math.max(0, px.length - jours);
      const b100 = (px[px.length - 2] / px[i0] - 1) * 100;
      ligne(cycle + " · " + cool + " j", A.runs.actuel, B.runs.gate, A.hold, b100, A.pxFin);
    }
  }

  /* ---------- combien d'achats, et que valaient-ils ? ---------- */
  console.log("\n================ COMBIEN D'ACHATS LE COCKPIT A-T-IL DÉCLENCHÉS ? ================");
  const A1 = C.simulate(kl, Infinity, 70, 0.1, 30, 0);
  console.log("SWING journalier, tout l'historique, carence 30 j : " +
              A1.runs.regime.trades.length + " ordres, tous des achats, " +
              "part finale en BTC " + partBtc(A1.runs.regime, A1.pxFin).toFixed(0) + " %");
  const AP = C.simulatePosition(S, Infinity, 70, 0.1, 30, 0);
  const ach = AP.runs.actuel.trades.filter(t => t.type === "achat").length;
  console.log("POSITION, tout l'historique, carence 30 j : " + ach + " achats et " +
              (AP.runs.actuel.trades.length - ach) + " ventes, part finale en BTC " +
              partBtc(AP.runs.actuel, AP.pxFin).toFixed(0) + " %");
})();

/* ÉTUDE — LA CHAÎNE COMPLÈTE, GATE COMPRIS, REJOUÉE POUR LA PREMIÈRE FOIS
   ======================================================================

   À lancer depuis la racine du dépôt :  node etudes/chaine-complete.js

   Depuis le 11 novembre 2026, le gate ne compte plus que quatre signaux, tous
   reconstituables : momentum/volume, funding, flux des plateformes, premium
   Coinbase. Les moteurs savent rejouer les étapes 4 et 5 par `gateApply`, la
   fonction du cockpit elle-même. Le backtest mesure donc enfin la chaîne que
   l'utilisateur applique vraiment, et non plus une version amputée.

   LIMITE DE DATE, à ne jamais masquer : le funding Binance commence le
   10/09/2019 et le premium le 17/08/2017. **Avant septembre 2019, le gate reste
   non rejouable** — un signal manquant ne confirme rien et bloquerait tout
   artificiellement. Toutes les mesures ci-dessous commencent donc au 10/09/2019,
   et les chiffres du §14 antérieurs à cette date décrivent, eux, une chaîne SANS
   l'étape 4. C'est désormais une limite de données, avec une date précise, et non
   plus une impossibilité de principe.

   PROTOCOLE : aucune variante à choisir, aucun seuil à régler — on compare la
   chaîne sans gate (ce que mesuraient tous les backtests jusqu'ici) à la chaîne
   complète, sur les mêmes périodes, aux mêmes carences, frais 0,1 %, départ
   70 % BTC, impôt 0 %. C'est un constat, pas une sélection. */

"use strict";
const path = require("path");
const RACINE = path.join(__dirname, "..");
const sandbox = require(path.join(RACINE, "tests", "sandbox.js"));
const C = sandbox.load("index.html");
const { binance1d, coinmetrics, funding, fng, coinbase1d, cache, json, iso, jourDe, JOUR } = require("./donnees.js");
const SIGNAUX = require("./signaux.js");

const DEPUIS = Date.UTC(2019, 8, 10);     /* premier jour où les quatre signaux existent */

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

/* Le crochet renvoie le DÉCOMPTE des quatre signaux qui confirment : la chaîne
   entière est alors rejouée par gateApply, filtre de risque compris. */
function crochet(SG, horizon){
  const cles = ["momentum", "funding", "flux", "prem"];
  return function(when, dir){
    const d = SIGNAUX.directions(C, SG, when, horizon);
    let a = 0, c = 0;
    for(const k of cles){
      if(d[k] === null) continue;
      if(d[k] === dir) a++; else c++;
    }
    return { a: a, c: c };
  };
}

const pct = x => (x >= 0 ? "+" : "") + x.toFixed(x > 100 || x < -100 ? 0 : 1) + " %";
const perf = r => (r.eq[r.eq.length - 1] / r.eq[0] - 1) * 100;

function ligne(lbl, A, B){
  console.log(lbl.padEnd(24) +
    pct(perf(A)).padStart(12) + pct(perf(B)).padStart(12) +
    ((perf(B) - perf(A) >= 0 ? "+" : "") + (perf(B) - perf(A)).toFixed(0) + " pts").padStart(11) +
    ("   " + A.trades.length + " / " + B.trades.length).padStart(12) +
    ("   -" + C.maxDD(A.eq).toFixed(0) + " % / -" + C.maxDD(B.eq).toFixed(0) + " %").padStart(17));
}
const entete = () =>
  console.log("période / carence        sans gate    chaîne compl.     écart   ordres s/a   pire perte s/a");

(async () => {
  const [kl, k4, cmRows, fund, peur, cb] = await Promise.all(
    [binance1d(), binance4h(), coinmetrics(), funding(), fng(), coinbase1d()]);
  const S = C.cmSeries(cmRows);
  const SG = SIGNAUX.construire(C, { kl, fund, peur, cb, S });
  const total = Math.round((Date.now() - DEPUIS) / JOUR);
  console.log("Chaîne complète rejouable depuis le " + iso(DEPUIS) + " — " + total + " jours.\n");

  console.log("================ SWING JOURNALIER ================");
  entete();
  for(const [lbl, jours] of [["tout", total], ["seconde moitié", Math.round(total / 2)]]){
    for(const cool of [7, 30, 60]){
      const R = C.simulate(kl, jours, 70, 0.1, cool, 0, crochet(SG, "swing"));
      ligne(lbl + " · " + cool + " j", R.runs.regime, R.runs.gate);
    }
  }

  console.log("\n================ SWING 4 HEURES — le score exact du cockpit ================");
  entete();
  for(const [lbl, jours] of [["tout", total], ["seconde moitié", Math.round(total / 2)]]){
    for(const cool of [7, 30, 60]){
      const R = C.simulate4h(k4, kl, jours, 70, 0.1, cool, 0, null, crochet(SG, "swing"));
      ligne(lbl + " · " + cool + " j", R.runs.regime, R.runs.gate);
    }
  }

  console.log("\n================ POSITION — cycles entièrement couverts ================");
  entete();
  for(const [cycle, a, b] of [["2020-2024", Date.UTC(2020, 4, 11), Date.UTC(2024, 3, 20)],
                              ["2024-2026", Date.UTC(2024, 3, 20), Date.now()]]){
    const garde = S.t.filter(t => t <= b).length;
    const Sc = { t: S.t.slice(0, garde), px: S.px.slice(0, garde), mc: S.mc.slice(0, garde),
                 mv: S.mv.slice(0, garde), sply: (S.sply || []).slice(0, garde) };
    const jours = Math.round((b - a) / JOUR);
    for(const cool of [7, 30, 60]){
      const R = C.simulatePosition(Sc, jours, 70, 0.1, cool, 0, crochet(SG, "position"));
      ligne(cycle + " · " + cool + " j", R.runs.actuel, R.runs.gate);
    }
  }

  /* combien d'actions le gate laisse-t-il réellement passer ? */
  console.log("\n================ PART DES ACTIONS RÉELLEMENT EXÉCUTÉES ================");
  for(const [nom, horizon, fab] of [
    ["SWING journalier", "swing", () => C.simulate(kl, total, 70, 0.1, 30, 0, crochet(SG, "swing"))],
    ["POSITION 2020-2024", "position", () => {
      const b = Date.UTC(2024, 3, 20), garde = S.t.filter(t => t <= b).length;
      return C.simulatePosition({ t: S.t.slice(0, garde), px: S.px.slice(0, garde),
        mc: S.mc.slice(0, garde), mv: S.mv.slice(0, garde), sply: (S.sply || []).slice(0, garde) },
        Math.round((b - Date.UTC(2020, 4, 11)) / JOUR), 70, 0.1, 30, 0, crochet(SG, "position"));
    }]]){
    const R = fab();
    const A = R.runs.regime || R.runs.actuel, B = R.runs.gate;
    console.log(nom.padEnd(22) + A.trades.length + " ordres sans gate → " + B.trades.length +
                " avec la chaîne complète (" + (100 * B.trades.length / A.trades.length).toFixed(0) + " %)");
  }
})();

/* ÉTUDE — LE GATE DE CONFIRMATION A-T-IL DE LA VALEUR ?
   =====================================================

   À lancer depuis la racine du dépôt :  node etudes/gate.js
   Aucune dépendance. Les données sont téléchargées puis gardées dans
   etudes/.cache (ignoré par git) : le second lancement est instantané.

   CE QUE CE SCRIPT NE FAIT PAS : il ne recopie AUCUNE règle. Il charge la vraie
   page index.html avec tests/sandbox.js et appelle ses fonctions — SIG pour les
   signaux, premGap pour le premium, cmFlux pour les flux, simulate et
   simulatePosition pour les backtests. Si une règle change dans la page, cette
   étude change avec elle.

   POURQUOI UN GATE « RÉDUIT ». Le cockpit exige 3 signaux sur 7 dans le sens de
   l'action. Quatre des sept n'ont aucun historique gratuit (momentum/volume et
   croisement prix/OI demandent l'open interest, le long/short n'est publié que sur
   30 jours, les liquidations n'existent nulle part). Exiger 3 signaux sur les 3 ou 4
   mesurables serait une règle beaucoup plus dure que celle du cockpit, exiger 3 sur 7
   avec 4 N/D bloquerait presque tout. On mesure donc des gates RÉDUITS, dits
   explicitement comme tels : « au moins k des signaux mesurables ».

   PROTOCOLE FIXÉ AVANT TOUT CALCUL :
   - périodes : cycles coupés aux halvings, comme au §14, et seulement ceux que les
     données couvrent entièrement (les flux remontent à 2011, le Fear & Greed à 2018,
     le funding à septembre 2019, le premium à août 2017) ;
   - carences 7, 30 et 60 jours, frais 0,1 %, départ 70 % BTC, impôt 0 % ;
   - un gate n'est adopté que s'il fait mieux que les règles actuelles sur CHAQUE
     cycle complet et à CHAQUE carence, sans pire perte plus profonde ;
   - décalage d'un jour sur les flux Coin Metrics, qui publie une journée quelques
     heures après sa fin : au moment de décider, la dernière journée publiée est
     celle de la veille. */

"use strict";
const fs = require("fs");
const path = require("path");
const RACINE = path.join(__dirname, "..");
const sandbox = require(path.join(RACINE, "tests", "sandbox.js"));
const C = sandbox.load("index.html");

const DATA = require("./donnees.js");
const { JOUR, jourDe, iso, binance1d, funding, fng, coinbase1d, coinmetrics } = DATA;

const SIGNAUX = require("./signaux.js");

/* ---------------- partie A : chaque signal, séparément ---------------- */
function valeurPredictive(SG){
  const jours = Object.keys(SG.binance).map(Number).sort((a, b) => a - b);
  const idx = {};
  jours.forEach((j, i) => { idx[j] = i; });
  const fwd = j => {
    const i = idx[j];
    return (i === undefined || i + 15 >= jours.length) ? null :
      (SG.binance[jours[i + 15]] / SG.binance[j] - 1) * 100;
  };
  const moy = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

  const tests = [
    ["Funding « alléger »",            "funding", "sell", v => C.SIG.funding(v)],
    ["Funding « accumuler »",          "funding", "buy",  v => C.SIG.funding(v)],
    ["Fear & Greed « alléger »",       "fngJour", "sell", v => C.SIG.fng(v)],
    ["Fear & Greed « accumuler »",     "fngJour", "buy",  v => C.SIG.fng(v)],
    ["Flux plateformes « alléger »",   "flux",    "sell", v => C.SIG.flux(v)],
    ["Flux plateformes « accumuler »", "flux",    "buy",  v => C.SIG.flux(v)],
    ["Premium Coinbase « alléger »",   "prem",    "sell", v => C.SIG.prem(v)],
    ["Premium Coinbase « accumuler »", "prem",    "buy",  v => C.SIG.prem(v)]
  ];

  console.log("\n================ A. CHAQUE SIGNAL, SÉPARÉMENT ================");
  console.log("Rendement moyen des 15 jours suivants, comparé à tous les jours de la même moitié.");
  console.log("(sens juste = alléger suivi de moins que la moyenne, accumuler suivi de plus)\n");
  console.log("signal                           1re moitié                       2e moitié");

  for(const [nom, cle, sens, regle] of tests){
    const dispo = jours.filter(j => SG[cle][j] !== undefined && fwd(j) !== null);
    if(dispo.length < 200){ console.log(nom.padEnd(32) + " historique trop court"); continue; }
    const coupe = dispo[Math.floor(dispo.length / 2)];
    const ligne = [];
    for(const moitie of [0, 1]){
      const ens = dispo.filter(j => (moitie === 0 ? j < coupe : j >= coupe));
      const tous = moy(ens.map(fwd));
      const touche = ens.filter(j => regle(SG[cle][j]) === sens);
      const m = moy(touche.map(fwd));
      if(m === null || !touche.length){ ligne.push("jamais déclenché".padEnd(32)); continue; }
      const bon = sens === "sell" ? m < tous : m > tous;
      ligne.push((m.toFixed(1) + " % contre " + tous.toFixed(1) + " % " +
                  (bon ? "— bon sens" : "— MAUVAIS SENS") + " (" + touche.length + " j)").padEnd(32));
    }
    console.log(nom.padEnd(32) + " " + ligne.join(" "));
  }
}

/* ---------------- partie B : le gate dans les moteurs ---------------- */
const HALV = [Date.UTC(2012, 10, 28), Date.UTC(2016, 6, 9), Date.UTC(2020, 4, 11), Date.UTC(2024, 3, 20)];
const CYCLES = [["2012-2016", HALV[0], HALV[1]], ["2016-2020", HALV[1], HALV[2]],
                ["2020-2024", HALV[2], HALV[3]], ["2024-2026", HALV[3], Date.now()]];

/* Un gate réduit : au moins k signaux parmi ceux qu'on sait mesurer vont dans le
   sens de l'action. Une valeur absente ne confirme rien, exactement comme un N/D
   dans le cockpit. */
function gateReduit(SG, cles, k, horizon){
  const regles = { funding: C.SIG.funding, flux: C.SIG.flux, prem: C.SIG.prem,
                   fng: v => C.SIG.fng(v) };
  return function(when, dir){
    let accord = 0;
    for(const cle of cles){
      const src = cle === "fng" ? (horizon === "position" ? SG.fngMoy : SG.fngJour) : SG[cle];
      const v = src[jourDe(when)];
      if(v === undefined) continue;
      if(regles[cle](v) === dir) accord++;
    }
    return accord >= k;
  };
}

function couverture(SG, cles, horizon, a, b){
  /* premier et dernier jour où TOUS les signaux demandés existent */
  let d = null, f = null;
  for(let j = a; j <= b; j += JOUR){
    const ok = cles.every(cle => {
      const src = cle === "fng" ? (horizon === "position" ? SG.fngMoy : SG.fngJour) : SG[cle];
      return src[jourDe(j)] !== undefined;
    });
    if(ok){ if(d === null) d = j; f = j; }
  }
  return { d: d, f: f };
}

function position(SG, S){
  console.log("\n================ B. LE GATE DANS LE MOTEUR POSITION ================");
  const VARIANTES = [
    ["flux seuls (1 signal sur 1)",           ["flux"], 1],
    ["flux + Fear & Greed (2 sur 2)",         ["flux", "fng"], 2],
    ["flux + F&G + funding (2 sur 3)",        ["flux", "fng", "funding"], 2],
    ["flux + funding + premium, SANS F&G (2 sur 3)", ["flux", "funding", "prem"], 2],
    ["les quatre mesurables (2 sur 4)",       ["flux", "fng", "funding", "prem"], 2],
    ["les quatre mesurables (3 sur 4)",       ["flux", "fng", "funding", "prem"], 3]
  ];
  for(const [nom, cles, k] of VARIANTES){
    console.log("\n--- gate : " + nom + " ---");
    console.log("cycle        carence   actuel      + gate      écart    ventes act/gate   pire perte act/gate");
    for(const [cycle, a, b] of CYCLES){
      const cov = couverture(SG, cles, "position", a, b);
      if(cov.d === null || cov.d > a + 30 * JOUR){
        console.log(cycle.padEnd(12) + " données insuffisantes" +
          (cov.d === null ? "" : " (signaux complets seulement à partir du " + iso(cov.d) + ")"));
        continue;
      }
      const garde = S.t.filter(t => t <= b).length;
      const Sc = { t: S.t.slice(0, garde), px: S.px.slice(0, garde), mc: S.mc.slice(0, garde),
                   mv: S.mv.slice(0, garde), sply: (S.sply || []).slice(0, garde) };
      const jours = Math.round((b - a) / JOUR);
      for(const cool of [7, 30, 60]){
        const R = C.simulatePosition(Sc, jours, 70, 0.1, cool, 0, gateReduit(SG, cles, k, "position"));
        const p = r => (r.eq[r.eq.length - 1] / r.eq[0] - 1) * 100;
        const vt = r => r.trades.filter(t => t.type === "vente").length;
        const dd = r => C.maxDD(r.eq);
        const pa = p(R.runs.actuel), pg = p(R.runs.gate);
        console.log(cycle.padEnd(12) + String(cool).padStart(5) + " j " +
          (pa.toFixed(0) + " %").padStart(10) + (pg.toFixed(0) + " %").padStart(12) +
          ((pg - pa >= 0 ? "+" : "") + (pg - pa).toFixed(0) + " pts").padStart(11) +
          ("   " + vt(R.runs.actuel) + " / " + vt(R.runs.gate)).padStart(16) +
          ("   -" + dd(R.runs.actuel).toFixed(0) + " % / -" + dd(R.runs.gate).toFixed(0) + " %").padStart(18));
      }
    }
  }
}

function swing(SG, kl){
  console.log("\n================ C. LE GATE DANS LE MOTEUR SWING JOURNALIER ================");
  console.log("En SWING les règles actuelles ne vendent jamais : le gate ne peut que bloquer des ACHATS.");
  const VARIANTES = [
    ["flux seuls (1 sur 1)",             ["flux"], 1],
    ["flux + F&G + funding (2 sur 3)",   ["flux", "fng", "funding"], 2],
    ["flux + funding + premium, SANS F&G (2 sur 3)", ["flux", "funding", "prem"], 2],
    ["les quatre mesurables (2 sur 4)",  ["flux", "fng", "funding", "prem"], 2]
  ];
  const t0 = jourDe(kl[0][0]);
  for(const [nom, cles, k] of VARIANTES){
    const cov = couverture(SG, cles, "swing", t0, Date.now());
    console.log("\n--- gate : " + nom + " — signaux complets du " + iso(cov.d) + " au " + iso(cov.f) + " ---");
    console.log("période          carence   actuel      + gate      écart     achats act/gate");
    const klc = kl.filter(k2 => jourDe(k2[0]) >= cov.d - 400 * JOUR);
    const jours = Math.round((cov.f - cov.d) / JOUR);
    const moitie = Math.round(jours / 2);
    for(const [lbl, d] of [["tout l'intervalle", jours], ["seconde moitié", moitie]]){
      for(const cool of [7, 30]){
        const R = C.simulate(klc, d, 70, 0.1, cool, 0, gateReduit(SG, cles, k, "swing"));
        const p = r => (r.eq[r.eq.length - 1] / r.eq[0] - 1) * 100;
        const ac = r => r.trades.filter(t => t.type === "achat").length;
        const pa = p(R.runs.regime), pg = p(R.runs.gate);
        console.log(lbl.padEnd(16) + String(cool).padStart(5) + " j " +
          (pa.toFixed(0) + " %").padStart(10) + (pg.toFixed(0) + " %").padStart(12) +
          ((pg - pa >= 0 ? "+" : "") + (pg - pa).toFixed(0) + " pts").padStart(11) +
          ("   " + ac(R.runs.regime) + " / " + ac(R.runs.gate)).padStart(16));
      }
    }
  }
}

(async () => {
  const [kl, fund, peur, cb, cmRows] = await Promise.all(
    [binance1d(), funding(), fng(), coinbase1d(), coinmetrics()]);
  const S = C.cmSeries(cmRows);
  console.log("Bougies Binance : " + kl.length + " jours, du " + iso(kl[0][0]) + " au " + iso(kl[kl.length-1][0]));
  console.log("Funding : " + fund.length + " points · Fear & Greed : " + peur.length + " jours");
  console.log("Coin Metrics : " + S.t.length + " jours · Coinbase : " + Object.keys(cb).length + " jours");
  const SG = SIGNAUX.construire(C, { kl, fund, peur, cb, S });
  const nb = c => Object.keys(SG[c]).length;
  console.log("Signaux reconstitués — funding " + nb("funding") + " j · F&G " + nb("fngJour") +
              " j · flux " + nb("flux") + " j · premium " + nb("prem") + " j");
  valeurPredictive(SG);
  position(SG, S);
  swing(SG, kl);
})();

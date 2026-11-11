/* Reconstitution des signaux du gate sur l'historique, jour par jour.
   Partagé par etudes/gate.js et etudes/blocage.js.

   AUCUNE RÈGLE N'EST ÉCRITE ICI : les valeurs sont reconstituées à partir des
   données brutes, et c'est toujours SIG — la fonction de la page — qui dit ce
   qu'un signal plaide. Ce fichier ne fait que de la mise en forme.

   Cinq des sept signaux sont calculables sur l'historique :
   momentum/volume (déduit des bougies), funding, Fear & Greed, flux des
   plateformes, premium Coinbase. Les deux autres — croisement prix/OI et
   long/short — n'ont pas d'historique gratuit ; les liquidations n'ont aucune
   source et sont N/D en permanence, y compris dans le cockpit. */
"use strict";
const { JOUR, jourDe } = require("./donnees.js");

function construire(C, { kl, fund, peur, cb, S }){
  /* funding : dernier taux publié dans la journée, en % par 8 h — l'unité du cockpit */
  const funding = {};
  fund.forEach(([t, v]) => { funding[jourDe(t)] = Number(v) * 100; });

  /* Fear & Greed : valeur du jour (horizon SWING) et moyenne 30 jours (POSITION) */
  const fngJour = {};
  peur.forEach(([t, v]) => { fngJour[jourDe(t)] = v; });
  const jours = Object.keys(fngJour).map(Number).sort((a, b) => a - b);
  const fngMoy = {};
  jours.forEach((j, i) => {
    const f = jours.slice(Math.max(0, i - 30), i + 1).map(x => fngJour[x]);
    fngMoy[j] = f.reduce((a, b) => a + b, 0) / f.length;
  });

  /* clôtures Binance, et premium contre Coinbase par la fonction de la page */
  const binance = {};
  kl.forEach(k => { binance[jourDe(k[0])] = parseFloat(k[4]); });
  const prem = {};
  Object.keys(binance).map(Number).forEach(j => {
    const v = C.premGap(cb[j] === undefined ? null : Number(cb[j]), binance[j]);
    if(v !== null) prem[j] = v;
  });

  /* flux : solde net sur 30 jours calculé par cmFlux sur une fenêtre glissante,
     DÉCALÉ D'UN JOUR — Coin Metrics publie une journée après coup */
  const flux = {};
  for(let i = 40; i < S.t.length; i++){
    const f = C.cmFlux({ t: S.t.slice(i - 39, i + 1), flIn: S.flIn.slice(i - 39, i + 1),
                         flOut: S.flOut.slice(i - 39, i + 1) }, 30);
    if(f) flux[jourDe(S.t[i]) + JOUR] = f.net;
  }

  /* momentum : prix au-dessus de l'EMA 20 journalière, et histogramme MACD qui
     s'écarte ou se resserre — exactement les deux booléens que lit le cockpit */
  const t = Object.keys(binance).map(Number).sort((a, b) => a - b);
  const c = t.map(j => binance[j]);
  const e20 = C.emaSeries(c, 20);
  const mac = C.macdSeries(c);
  const momentum = {};
  for(let i = 1; i < t.length; i++){
    if(e20[i] === undefined || !mac || mac.hist[i] === undefined || mac.hist[i-1] === undefined) continue;
    momentum[t[i]] = { auDessus: c[i] > e20[i],
                       expansion: Math.abs(mac.hist[i]) > Math.abs(mac.hist[i-1]) };
  }

  return { funding, fngJour, fngMoy, prem, flux, binance, momentum };
}

/* Ce que chaque signal plaide un jour donné, par les règles de la page.
   horizon sert au seul Fear & Greed : valeur du jour en SWING, moyenne 30 jours
   en POSITION — comme dans gateSignals. */
function directions(C, SG, jour, horizon){
  const j = jourDe(jour);
  const m = SG.momentum[j];
  return {
    momentum: m ? C.SIG.momentum(m.auDessus, m.expansion) : null,
    funding:  SG.funding[j] === undefined ? null : C.SIG.funding(SG.funding[j]),
    fng:      (horizon === "position" ? SG.fngMoy[j] : SG.fngJour[j]) === undefined
                ? null : C.SIG.fng(horizon === "position" ? SG.fngMoy[j] : SG.fngJour[j]),
    flux:     SG.flux[j] === undefined ? null : C.SIG.flux(SG.flux[j]),
    prem:     SG.prem[j] === undefined ? null : C.SIG.prem(SG.prem[j])
  };
}

module.exports = { construire, directions };

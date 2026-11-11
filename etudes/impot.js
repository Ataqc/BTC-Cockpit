/* ÉTUDE — L'IMPÔT CHANGE-T-IL LA CONCLUSION « GARDER LES VENTES POSITION » ?
   ========================================================================

   À lancer depuis la racine du dépôt :  node etudes/impot.js
   Aucune dépendance. Données gardées dans etudes/.cache (ignoré par git).

   Aucune règle n'est recopiée : la page est chargée avec tests/sandbox.js et
   c'est son propre moteur POSITION qui tourne, avec son nouveau paramètre d'impôt.

   PROTOCOLE FIXÉ AVANT TOUT CALCUL :
   - cycles coupés aux halvings, comme au §14 ;
   - frais 0,1 %, départ 70 % BTC, carences 7 / 30 / 60 jours ;
   - trois taux : 0 % (rien n'est encaissé : le « cash » reste en crypto),
     12,8 % (impôt seul) et 30 % (prélèvement forfaitaire unique) ;
   - DEUX lectures, et il faut les deux :
     « portefeuille » = ce qu'on détient, plus-value latente non imposée — c'est
     la situation de celui qui ne sortira jamais vers l'euro ;
     « net » = tout est liquidé à la fin, l'impôt encore dû est déduit — la seule
     comparaison honnête pour celui qui encaissera un jour, car celui qui n'a
     jamais vendu doit toujours son impôt.
   - critère annoncé d'avance : si « règles actuelles » cesse de battre « sans
     aucune vente » dès qu'on sort vers l'euro, la règle de vente POSITION est
     à revoir. */

"use strict";
const path = require("path");
const RACINE = path.join(__dirname, "..");
const sandbox = require(path.join(RACINE, "tests", "sandbox.js"));
const C = sandbox.load("index.html");
const { coinmetrics, iso, JOUR } = require("./donnees.js");

const HALV = [Date.UTC(2012, 10, 28), Date.UTC(2016, 6, 9), Date.UTC(2020, 4, 11), Date.UTC(2024, 3, 20)];
const CYCLES = [["2012-2016", HALV[0], HALV[1]], ["2016-2020", HALV[1], HALV[2]],
                ["2020-2024", HALV[2], HALV[3]], ["2024-2026", HALV[3], Date.now()]];
const TAUX = [0, 12.8, 30];
const COOLS = [7, 30, 60];
const pct = x => ((x >= 0 ? "+" : "") + (x * 100).toFixed(0) + " %");

(async () => {
  const S = C.cmSeries(await coinmetrics());
  console.log("Coin Metrics : " + S.t.length + " jours, du " + iso(S.t[0]) +
              " au " + iso(S.t[S.t.length - 1]));

  for(const [nom, a, b] of CYCLES){
    const garde = S.t.filter(t => t <= b).length;
    const Sc = { t: S.t.slice(0, garde), px: S.px.slice(0, garde), mc: S.mc.slice(0, garde),
                 mv: S.mv.slice(0, garde), sply: (S.sply || []).slice(0, garde) };
    const jours = Math.round((b - a) / JOUR);
    console.log("\n=== " + nom + " — " + jours + " jours testés, jusqu'au " + iso(b) + " ===");
    console.log("                       PORTEFEUILLE (latent non imposé)        NET (tout liquidé à la fin)");
    console.log("carence   taux     actuel  sans vente  conserver      actuel  sans vente  conserver   impôt payé");
    for(const cool of COOLS){
      for(const tax of TAUX){
        const R = C.simulatePosition(Sc, jours, 70, 0.1, cool, tax);
        const base = R.hold.eq[0], px = R.pxFin;
        const brut = r => r.eq[r.eq.length - 1] / base - 1;
        const net = r => C.btNet(r, px, tax) / base - 1;
        console.log(
          String(cool).padStart(4) + " j " + String(tax).padStart(6) + " % " +
          pct(brut(R.runs.actuel)).padStart(10) + pct(brut(R.runs.sansVente)).padStart(12) +
          pct(brut(R.hold)).padStart(11) + "  " +
          pct(net(R.runs.actuel)).padStart(12) + pct(net(R.runs.sansVente)).padStart(12) +
          pct(net(R.hold)).padStart(11) + "   " +
          (R.runs.actuel.impot * 100).toFixed(0) + " pts");
      }
    }
  }
  console.log("\nLecture : « impôt payé » est en points de portefeuille de départ (base 100).");
})();

/* Tests du robot d'alerte — aucun réseau, aucune dépendance.
   Toutes les bougies sont SYNTHÉTIQUES : on vérifie la mécanique du robot (quelle
   période il compare, ce qu'il s'interdit de signaler, ce qu'il envoie), jamais
   la valeur d'un signal sur le vrai marché. */
var sandbox = require("./sandbox.js");
var robot = require("../alertes/robot.js");

var pass = 0, fail = [];
function ok(cond, label){ if(cond) pass++; else fail.push(label); }

var JOUR = 86400000, H4 = 4*3600000;
var n0 = new Date();
var AUJ = Date.UTC(n0.getUTCFullYear(), n0.getUTCMonth(), n0.getUTCDate());

function serie(n, ms, dernierOuv, graine, derive){
  var o = [], px = 30000, s = graine;
  for(var i=n-1;i>=0;i--){
    s = (s * 1103515245 + 12345) % 2147483648;
    var t = dernierOuv - i*ms, ouv = px;
    px = px * (1 + ((s/2147483648) - 0.5) * 0.03 + derive);
    o.push([t, String(ouv), String(Math.max(ouv,px)*1.005), String(Math.min(ouv,px)*0.995),
            String(px), "1000", t + ms - 1, "0"]);
  }
  return o;
}
function jeu(){
  var kd = serie(500, JOUR, AUJ - JOUR, 22, 0.002);
  var enCours = kd[kd.length-1].slice(); enCours[0] = AUJ; enCours[6] = AUJ + JOUR - 1;   /* bougie du jour, non clôturée */
  var fng = { data: [] };
  for(var i=0;i<31;i++) fng.data.push({ value: String(50 + i%9), value_classification: "Neutral",
                                        timestamp: String(Math.floor((AUJ - i*JOUR)/1000)) });
  return {
    tick: { lastPrice: kd[kd.length-1][4], priceChangePercent: "0.8", highPrice: kd[kd.length-1][2],
            lowPrice: kd[kd.length-1][3], volume: "1000", quoteVolume: "1" },
    k4: serie(500, H4, AUJ - H4, 11, 0.0004),
    kd: kd.concat([enCours]),
    kw: serie(300, 7*JOUR, AUJ - 7*JOUR - ((new Date(AUJ).getUTCDay()+6)%7)*JOUR, 33, 0.012),
    fng: fng
  };
}

var C = sandbox.load("index.html");
var brut = jeu();
var a = robot.analyser(C, brut, Date.now());

/* ---------- ce que le robot compare ---------- */
ok(a.T === AUJ - JOUR, "la comparaison démarre à l'ouverture de la dernière bougie journalière clôturée");
ok(C.D.kd.length === 500, "la bougie journalière en cours est écartée, comme dans le cockpit");
ok(a.avant.ts === a.T && a.avant.px === parseFloat(brut.kd[498][4]),
   "l'état « veille » est celui de la clôture précédente, à son prix de clôture");
ok(a.apres.px === parseFloat(brut.tick.lastPrice), "l'état « maintenant » est au prix actuel");
var bas = parseFloat(brut.tick.lastPrice), haut = bas;
brut.k4.forEach(function(k){
  if(k[0] < a.T) return;
  bas = Math.min(bas, parseFloat(k[3])); haut = Math.max(haut, parseFloat(k[2]));
});
ok(a.lo === bas && a.hi === haut,
   "plus bas et plus haut pris uniquement sur les bougies 4 H ouvertes depuis la dernière clôture, plus le prix actuel");

/* ---------- ce que le robot s'interdit ---------- */
ok(a.avant.po.tier === null && a.apres.po.tier === null,
   "aucun palier POSITION : il dépend du MVRV, que le robot ne voit pas");
ok(a.evenements.every(function(e){ return !/POSITION/.test(e.txt); }), "donc aucune alerte POSITION");
[a.avant, a.apres].forEach(function(s, i){
  ok(s.sw.tier === null || C.TIERS[s.sw.tier].dir !== "sell",
     "palier swing " + (i ? "du jour" : "de la veille") + " : jamais une vente");
});
ok(a.avant.inv === null && a.apres.inv === null && a.apres.stale === null,
   "ni invalidation ni relevé manuel : ces données n'existent que dans ton navigateur");

/* ---------- une vraie secousse doit produire une alerte ---------- */
var choc = jeu();
var i = choc.kd.length - 2;                      /* dernière bougie journalière clôturée */
var pVeille = parseFloat(choc.kd[i-1][4]);
choc.kd[i] = choc.kd[i].slice();
choc.kd[i][4] = String(pVeille * 0.5); choc.kd[i][3] = String(pVeille * 0.49);
choc.k4 = choc.k4.map(function(k){
  if(k[0] < AUJ - JOUR) return k;
  var c = k.slice(); c[1] = String(pVeille*0.52); c[2] = String(pVeille*0.53);
  c[3] = String(pVeille*0.49); c[4] = String(pVeille*0.5); return c;
});
choc.tick.lastPrice = String(pVeille * 0.5);
var b = robot.analyser(sandbox.load("index.html"), choc, Date.now());
ok(b.evenements.length >= 1 && b.evenements.some(function(e){ return e.fort; }),
   "prix divisé par deux en une journée : au moins une alerte « à regarder »");
ok(b.evenements.some(function(e){ return /EMA 200/.test(e.txt); }) ||
   b.evenements.some(function(e){ return /Support/.test(e.txt); }),
   "la chute est rapportée comme une cassure de niveau ou un passage sous l'EMA 200");

var m = robot.message(C, b);
ok(m.titre.indexOf("<") < 0 && m.corps.indexOf("<") < 0, "la notification ne contient aucune balise HTML");
ok(/changement/.test(m.titre) && /\$/.test(m.titre), "le titre donne le prix et le nombre de changements");
ok(m.priorite === 4, "une alerte « à regarder » part en priorité haute");
ok(/Ouvre le cockpit/.test(m.corps), "la notification renvoie vers le cockpit pour le tableau complet");

/* ---------- échec franc plutôt que calcul bancal ---------- */
var court = jeu(); court.kd = court.kd.slice(-100);
var erreur = null;
try{ robot.analyser(sandbox.load("index.html"), court, Date.now()); }catch(e){ erreur = e.message; }
ok(erreur !== null && /insuffisant/.test(erreur),
   "historique trop court : le robot échoue franchement au lieu de calculer sur trop peu de bougies");

console.log("");
console.log("Tests du robot : " + pass + " réussis, " + fail.length + " échoués");
if(fail.length){
  console.log("");
  fail.forEach(function(f){ console.log("  ÉCHEC : " + f); });
  process.exit(1);
}

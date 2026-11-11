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

/* ---------- le gate, vu par le robot ----------
   Trois des quatre signaux qui confirment sont lisibles depuis un serveur GitHub ;
   le funding ne l'est pas. Le robot doit donc ENCADRER, jamais trancher à la place
   du cockpit. Données SYNTHÉTIQUES : on teste la mécanique, pas un vrai marché. */
function fluxRows(entre, sort){
  var r = [];
  for(var i=0;i<40;i++)
    r.push({ time: new Date(AUJ - (39-i)*JOUR).toISOString(), CapMrktCurUSD:"1", CapMVRVCur:"1",
             FlowInExNtv:String(entre), FlowOutExNtv:String(sort) });
  return r;
}
function bougiesCb(prixCb){
  var o = [];
  for(var i=0;i<60;i++) o.push([Math.floor((AUJ - i*JOUR)/1000), 1, 1, 1, prixCb, 1]);
  return o;
}
var CG = sandbox.load("index.html");
var dG = { kd: C.closedOnly(brut.kd) };
var clotureG = parseFloat(dG.kd[dG.kd.length-1][4]);

/* sorties > entrées = « accumuler » ; Coinbase 1 % au-dessus de Binance = « accumuler » */
var G1 = robot.etatGate(CG, dG, { rows: fluxRows(10, 100) }, bougiesCb(clotureG * 1.01));
ok(G1.dirs.funding === null, "le funding reste N/D : fapi.binance.com est bloqué depuis les serveurs GitHub");
ok(G1.dirs.flux === "buy" && G1.dirs.prem === "buy",
   "flux et premium sont lus et traduits par les règles de la page");
var r1 = G1.pour("buy");
ok(r1.alignes >= 2 && r1.inconnus === 1 && r1.verdict === "franchi",
   "deux signaux alignés sur les trois lisibles : le gate est franchi à coup sûr, le funding ne peut rien y changer");
ok(robot.phraseGate(CG, G1, "buy").indexOf("FRANCHI") >= 0 &&
   /funding n'est pas lisible/.test(robot.phraseGate(CG, G1, "buy")),
   "la phrase dit « franchi » et avoue que le funding manque");

/* entrées > sorties et Coinbase sous Binance : les deux plaident pour alléger */
var G2 = robot.etatGate(CG, dG, { rows: fluxRows(100, 10) }, bougiesCb(clotureG * 0.99));
var r2 = G2.pour("buy");
ok(r2.alignes <= 1 && (r2.alignes + r2.inconnus < CG.GATE_MIN ? r2.verdict === "bloque" : r2.verdict === "indetermine"),
   "signaux contraires : le robot annonce « bloqué » seulement si le funding ne peut plus rattraper");
ok(G2.pour("sell").alignes >= CG.GATE_MIN && G2.pour("sell").verdict === "franchi",
   "les mêmes signaux franchissent le gate dans l'autre sens");

/* Coin Metrics et Coinbase injoignables : deux inconnues de plus, jamais un mensonge */
var G3 = robot.etatGate(CG, dG, { err:"HTTP 503" }, null);
var r3 = G3.pour("buy");
ok(G3.dirs.flux === null && G3.dirs.prem === null && r3.inconnus >= 3,
   "sources manquantes : les signaux sont N/D, pas inventés");
ok(r3.verdict !== "franchi", "le robot ne peut jamais annoncer « franchi » sans assez de signaux lus");

/* la phrase ne sort que si un palier swing actionnable est signalé */
var evSwing = [{ fort:true, txt:"SWING : Rien → <b>Achat 10-15 % du cash disponible</b>" }];
var aSwing = { evenements:evSwing, T:AUJ-JOUR, lo:1, hi:2, mvrv:{}, gate:G1,
               apres:{ px:1, sw:{ tier:4 } } };
var mSwing = robot.message(CG, aSwing);
ok(/Gate de confirmation : FRANCHI/.test(mSwing.corps) && mSwing.corps.indexOf("<") < 0,
   "une alerte de palier swing porte le verdict du gate, sans balise HTML");
var aHold = { evenements:[{ fort:false, txt:"EMA 200 franchie" }], T:AUJ-JOUR, lo:1, hi:2,
              mvrv:{}, gate:G1, apres:{ px:1, sw:{ tier:3 } } };
ok(robot.message(CG, aHold).corps.indexOf("Gate de confirmation") < 0,
   "sans palier swing signalé, le robot ne parle pas du gate");

/* ---------- échec franc plutôt que calcul bancal ---------- */
var court = jeu(); court.kd = court.kd.slice(-100);
var erreur = null;
try{ robot.analyser(sandbox.load("index.html"), court, Date.now()); }catch(e){ erreur = e.message; }
ok(erreur !== null && /insuffisant/.test(erreur),
   "historique trop court : le robot échoue franchement au lieu de calculer sur trop peu de bougies");

/* ---------- MVRV : changement de bande confirmé ----------
   Le Z-score lui-même est testé dans engine.test.js ; ici on impose la série de
   Z-scores pour vérifier ce que le robot en fait. Valeurs SYNTHÉTIQUES. */
var avantHier = AUJ - 2*JOUR, nJ = 60, lignes = [], zCible = [];
for(var i=0;i<nJ;i++){
  lignes.push({ time: new Date(avantHier - (nJ-1-i)*JOUR).toISOString(), CapMrktCurUSD:"1", CapMVRVCur:"1" });
  zCible.push(i < nJ-7 ? 3.5 : 4.5);
}
var CZ = sandbox.load("index.html");
CZ.mvrvZSeries = function(){ return zCible; };
var mv1 = robot.etatMvrv(CZ, { rows:lignes }, Date.now());
ok(mv1.evenement && mv1.evenement.fort && /neutre haut » → <b>« surachat/.test(mv1.evenement.txt) && /7 jours/.test(mv1.evenement.txt),
   "passage en surachat tenu 7 jours, lu sur la journée d'avant-hier : alerte « à regarder »");
ok(/surachat/.test(mv1.resume) && /Z 4,50/.test(mv1.resume), "le résumé MVRV donne le Z-score et sa bande");
zCible[nJ-1] = 3.5;
ok(!robot.etatMvrv(CZ, { rows:lignes }, Date.now()).evenement,
   "nouvelle bande qui ne tient pas 7 jours : aucune alerte");
zCible[nJ-1] = 4.5;
var mvRetard = robot.etatMvrv(CZ, { rows:lignes.slice(0, -1) }, Date.now());
ok(mvRetard.evenement && !mvRetard.evenement.fort && /pas encore publiée/.test(mvRetard.evenement.txt),
   "journée d'avant-hier pas encore publiée : « MVRV non vérifié », pas un silence trompeur");
var panneCM = jeu(); panneCM.cm = { err:"HTTP 503" };
var aPanne = robot.analyser(sandbox.load("index.html"), panneCM, Date.now());
ok(aPanne.evenements.some(function(e){ return !e.fort && /MVRV non vérifié/.test(e.txt) && /injoignable/.test(e.txt); }),
   "Coin Metrics injoignable : le robot le dit, et le reste de l'analyse continue");
ok(!!mv1.evenement &&
   robot.message(CZ, { evenements:[mv1.evenement], T:AUJ-JOUR, lo:1, hi:2, apres:{px:1}, mvrv:mv1 }).corps.indexOf("<") < 0,
   "l'alerte MVRV part sans balise HTML");
ok(!!mv1.evenement && !/POSITION|[Vv]ente/.test(mv1.evenement.txt),
   "une alerte MVRV rapporte une bande, jamais un palier POSITION ni une vente");

/* ---------- filtres : ce qui mérite une notification ---------- */
var C2 = sandbox.load("index.html");
function releveRobot(o){
  var b = { sw:{tier:3, score:4.5}, po:{tier:null, score:null}, reg:{d1:"RANGE", w1:"RANGE"},
            div:{d1:{bear:null,bull:null}, w1:{bear:null,bull:null}}, e200:50000, px:60000,
            sup:58000, res:64000, inv:null, stale:null, ts:AUJ, v:1 };
  for(var k in o) b[k] = o[k];
  return b;
}
ok(robot.MARGE_NIVEAU === 0.02 && robot.TENUE_REGIME === 7 && robot.TENUE_REGIME_W === 2 &&
   robot.FENETRE_HEBDO === 7,
   "réglages de la politique de notification : 2 % au-delà du niveau, régime tenu 7 clôtures (2 en hebdo), semaine de 7 jours");
var refR = releveRobot({}), memePrix = releveRobot({ px:59000 });
ok(robot.evenementsJour(C2, refR, memePrix, 59000, []).length === 0,
   "mèche passée sous le support mais clôture au-dessus : rien n'est signalé");
ok(robot.evenementsJour(C2, refR, memePrix, 57800, []).length === 0,
   "clôture 0,3 % sous le support : trop peu pour parler de cassure, rien n'est signalé");
ok(robot.evenementsJour(C2, refR, memePrix, 56800, []).some(function(e){ return /Support de 58/.test(e.txt); }),
   "clôture à plus de 2 % sous le support : la cassure est signalée");
ok(robot.evenementsJour(C2, refR, releveRobot({ sw:{tier:2, score:6.1} }), 60000, []).length === 0,
   "palier SWING qui passe d'un « Rien » à un autre : rien n'est signalé");
ok(robot.evenementsJour(C2, refR, releveRobot({ sw:{tier:4, score:3.1} }), 60000, [])
     .some(function(e){ return /^SWING/.test(e.txt); }),
   "palier SWING qui devient actionnable : signalé");
ok(robot.evenementsJour(C2, refR, releveRobot({ reg:{d1:"TENDANCE", w1:"RANGE"} }), 60000, []).length === 0,
   "changement de régime brut : écarté, seul le régime tenu compte");

function serieRegime(plat, tendance){
  var o = [], px = 30000, t0 = Date.UTC(2024,0,1);
  for(var i=0;i<plat+tendance;i++){
    px = i < plat ? 30000 + (i % 2 ? 200 : -200) : px * 1.02;
    var t = t0 + i*JOUR;
    o.push([t, String(px), String(px*1.01), String(px*0.99), String(px), "1", t + JOUR - 1]);
  }
  return o;
}
var confirmes = [];
for(var n=1;n<=45;n++){
  var c = robot.regimeConfirme(C2, serieRegime(200, n), 7, 40);
  if(c) confirmes.push(c.avant + " → " + c.apres);
}
ok(confirmes.length === 2 && confirmes[0] === "RANGE → TRANSITION" && confirmes[1] === "TRANSITION → TENDANCE",
   "bascule progressive du régime : chaque étape signalée une seule fois, une fois tenue sept clôtures");
ok(robot.regimeConfirme(C2, serieRegime(200, 3), 7, 40) === null,
   "régime qui vient de basculer : rien tant qu'il n'a pas tenu");

/* ---------- ce qui part, et quand ---------- */
function analyse(o){
  var b = { evenements:[], semaine:[], mvrv:{}, apres:{px:70000}, T:AUJ - JOUR, TS:AUJ - 7*JOUR,
            lo:69000, hi:71000, loS:68000, hiS:72000, cloture:70000 };
  for(var k in o) b[k] = o[k];
  return b;
}
ok(robot.aEnvoyer(C2, analyse({ evenements:[{fort:false, txt:"Régime 1 J : RANGE → TENDANCE"}] }), false, false) === null,
   "journée sans « à regarder » : aucune notification, ça attendra le point du lundi");
var mJour = robot.aEnvoyer(C2, analyse({ evenements:[{fort:true, txt:"Support de 58 000 $ enfoncé"}] }), false, false);
ok(!!mJour && mJour.priorite === 4 && /1 changement/.test(mJour.titre) && /À regarder/.test(mJour.corps),
   "un seul « à regarder » suffit à notifier le jour même");
var mLundi = robot.aEnvoyer(C2, analyse({ evenements:[], mvrv:{resume:"Z 1,00, bande « neutre bas »"},
  semaine:[{fort:false, txt:"Régime 1 J : RANGE → TENDANCE"}] }), true, false);
ok(!!mLundi && /point de la semaine/.test(mLundi.titre) && /Régime/.test(mLundi.corps) && /MVRV/.test(mLundi.corps),
   "le lundi : tout ce qui a changé sur sept clôtures, « à noter » compris");
var mVide = robot.aEnvoyer(C2, analyse({}), true, false);
ok(!!mVide && /Rien de notable cette semaine/.test(mVide.corps) && /le robot est arrêté/.test(mVide.corps),
   "un lundi sans rien : le message part quand même, pour que le silence garde un sens");
var mEssai = robot.aEnvoyer(C2, analyse({ evenements:[{fort:false, txt:"Régime 1 J : RANGE → TENDANCE"}] }), false, true);
ok(!!mEssai && /essai/.test(mEssai.titre) && /point du lundi/.test(mEssai.corps),
   "essai manuel : le robot dit ce qu'il a vu et ce qui attendra lundi");
ok(!!mVide && !!mLundi && mVide.corps.indexOf("<") < 0 && mLundi.corps.indexOf("<") < 0,
   "aucun message ne contient de balise HTML");

var aSem = robot.analyser(sandbox.load("index.html"), jeu(), Date.now());
ok(Array.isArray(aSem.semaine) && aSem.TS === AUJ - 7*JOUR,
   "le point de la semaine compare l'état du jour à celui d'il y a sept clôtures");

console.log("");
console.log("Tests du robot : " + pass + " réussis, " + fail.length + " échoués");
if(fail.length){
  console.log("");
  fail.forEach(function(f){ console.log("  ÉCHEC : " + f); });
  process.exit(1);
}

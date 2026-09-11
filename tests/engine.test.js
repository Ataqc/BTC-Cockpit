/* Tests du moteur de calcul — aucune dépendance, aucun réseau, aucune donnée de marché.
   Deux familles :
     1. identités mathématiques : ce que l'indicateur DOIT valoir sur une série dont
        on connaît la réponse à l'avance (constante, croissante, en dents de scie) ;
     2. le moteur du backtest, qui vit désormais dans la même page que le cockpit
        et appelle ses formules : une seule copie, aucune dérive possible. On y
        vérifie qu'il ne vend jamais sous les règles actuelles et qu'il ne lit pas l'avenir.
   ATTENTION : toutes les séries utilisées ici sont SYNTHÉTIQUES. Aucun résultat de
   ce fichier ne dit quoi que ce soit du vrai Bitcoin. */
var sandbox = require("./sandbox.js");
var C = sandbox.load("index.html");     /* cockpit  */

var pass = 0, fail = [], group = "";
function g(name){ group = name; }
function ok(cond, label){
  if(cond){ pass++; }
  else { fail.push(group + " › " + label); }
}
function near(a, b, eps){ return Math.abs(a-b) <= (eps===undefined ? 1e-9 : eps); }
function sameSeries(a, b, label){
  if(a === null || b === null) return ok(a === b, label + " (l'un des deux est null)");
  ok(a.length === b.length, label + " — longueurs identiques");
  var bad = -1;
  for(var i=0;i<a.length;i++){
    var x = a[i], y = b[i];
    if(x === undefined && y === undefined) continue;
    if(x === undefined || y === undefined || !near(x, y, 1e-9)){ bad = i; break; }
  }
  ok(bad < 0, label + (bad<0 ? "" : " — écart à l'indice "+bad+" : "+a[bad]+" vs "+b[bad]));
}

/* Série pseudo-aléatoire déterministe : même suite à chaque exécution, donc un
   échec est toujours reproductible. Ce n'est PAS un cours de bitcoin. */
function serie(n, seed){
  var s = seed || 12345, out = [], px = 30000;
  for(var i=0;i<n;i++){
    s = (s * 1103515245 + 12345) % 2147483648;
    px = px * (1 + ((s/2147483648) - 0.48) * 0.03);
    out.push(px);
  }
  return out;
}
function constante(n, v){ var o=[]; for(var i=0;i<n;i++) o.push(v); return o; }
function croissante(n){ var o=[]; for(var i=0;i<n;i++) o.push(100+i); return o; }
function decroissante(n){ var o=[]; for(var i=0;i<n;i++) o.push(1000-i); return o; }
function dents(n, amp){ var o=[]; for(var i=0;i<n;i++) o.push(100 + (i%2 ? amp : 0)); return o; }

/* ================= 1. IDENTITÉS MATHÉMATIQUES ================= */

g("EMA");
var e = C.emaSeries(constante(60, 500), 20);
ok(e.length === 60 && near(e[59], 500) && near(e[19], 500),
   "sur une série constante, la moyenne mobile vaut la constante");
ok(C.emaSeries([1,2,3], 20).length === 0,
   "série plus courte que la période : aucune valeur, pas d'extrapolation");
ok(e[18] === undefined, "aucune valeur avant que la période soit remplie");

g("RSI");
ok(near(C.rsiSeries(croissante(60), 14)[59], 100),
   "série strictement croissante : RSI = 100");
ok(near(C.rsiSeries(decroissante(60), 14)[59], 0),
   "série strictement décroissante : RSI = 0");
ok(near(C.rsiSeries(constante(60, 500), 14)[59], 50),
   "série strictement plate : RSI = 50 (neutre), et surtout pas 100");
var r = C.rsiSeries(serie(300), 14);
var borne = true;
for(var i=0;i<r.length;i++) if(r[i]!==undefined && (r[i]<0 || r[i]>100)) borne = false;
ok(borne, "le RSI reste toujours entre 0 et 100");
ok(C.rsiSeries([1,2,3], 14).length === 0, "moins de 15 bougies : aucun RSI");

g("MACD");
var mc = C.macdSeries(constante(120, 500));
ok(mc !== null && near(mc.hist[119], 0, 1e-6),
   "sur une série constante, l'histogramme MACD est nul");
var mk = C.macdCalc(croissante(120));
ok(mk !== null && mk.macd > 0 && near(mk.hist, 0, 1e-6),
   "hausse parfaitement linéaire : ligne MACD positive, histogramme nul (aucune accélération)");
var acc = []; var v = 100;
for(var i=0;i<120;i++){ v *= 1 + 0.002*i; acc.push(v); }
var ma = C.macdCalc(acc);
ok(ma !== null && ma.hist > 0 && ma.hist > ma.prevHist,
   "hausse qui accélère : histogramme positif et en expansion");

g("Percentile");
ok(C.pctRank([1,2,3], 2) === null,
   "moins de 30 valeurs : pas de percentile, N/D (aucune estimation)");
var arr = []; for(var i=0;i<100;i++) arr.push(i);
ok(near(C.pctRank(arr, 50), 0.5), "valeur médiane d'une série uniforme : rang 0,50");
ok(C.pctRank(arr, -1) === 0 && C.pctRank(arr, 999) === 1, "rang borné entre 0 et 1");
ok(C.pctRank([1,null,undefined,NaN].concat(arr), 50) !== null,
   "les trous de la série sont ignorés, pas comptés comme des zéros");

g("Régime (ratio d'efficience)");
ok(near(C.effRatio(croissante(100), 20), 1),
   "hausse en ligne droite : efficience = 1");
ok(near(C.effRatio(dents(100, 5), 20), 0, 1e-9),
   "aller-retour parfait revenant au point de départ : efficience = 0");
ok(C.effRatio(constante(100, 500), 20) === 0,
   "prix immobile : efficience = 0, jamais une division par zéro");
ok(C.effRatio([1,2,3], 20) === null, "pas assez de bougies : N/D");
ok(C.regimeOf(croissante(100)).label === "TENDANCE", "ligne droite = TENDANCE");
ok(C.regimeOf(dents(100, 5)).label === "RANGE", "dents de scie = RANGE");
/* le cas qui avait justifié la double fenêtre : range dont la dernière jambe monte */
var rangePuisJambe = dents(120, 400).slice(0, 100)
  .concat(croissante(30).map(function(v){ return 100 + (v-100)*20; }));
ok(C.regimeOf(rangePuisJambe).label !== "RANGE",
   "jambe montante en fin de range : n'est plus classé RANGE");

g("Pivots et divergences");
var zz = [1,2,3,2,1,2,3,4,3,2,1,2,3];
var hauts = C.pivotIdx(zz, 2, true);
ok(hauts.indexOf(7) >= 0, "le sommet réel est détecté");
ok(hauts.indexOf(0) < 0 && hauts.indexOf(zz.length-1) < 0,
   "aucun pivot dans les bougies non confirmées des deux bords");
var hi = [10,11,12,11,10,11,12,13,12,11,10,11,12,13,14,13,12];
var rsiD = []; for(var i=0;i<hi.length;i++) rsiD[i] = 70;
rsiD[7] = 80; rsiD[14] = 60;   /* prix plus haut, RSI plus bas = divergence baissière */
var dv = C.divergences(hi, hi, rsiD, 2, 5);
ok(dv.bear !== null, "divergence baissière construite : détectée");
ok(dv.bear === null || dv.bear.bars >= 5, "l'écart minimal entre sommets est respecté");
ok(C.divergences(hi, hi, rsiD, 2, 50).bear === null,
   "sommets trop rapprochés pour l'écart demandé : aucune divergence inventée");

g("Supports et résistances");
var kl = [];
for(var i=0;i<200;i++){
  var base = 30000 + Math.sin(i/7) * 2000;
  kl.push([i*86400000, base, base*1.01, base*0.99, base, 100, i*86400000+86399999]);
}
var lv = C.levels(kl, 30000);
var hautsReels = kl.map(function(k){ return parseFloat(k[2]); });
var basReels = kl.map(function(k){ return parseFloat(k[3]); });
ok(lv.res.every(function(v){ return hautsReels.indexOf(v) >= 0; }),
   "toute résistance renvoyée est un haut réellement touché");
ok(lv.sup.every(function(v){ return basReels.indexOf(v) >= 0; }),
   "tout support renvoyé est un bas réellement touché");
ok(lv.res.every(function(v){ return v > 30000; }) && lv.sup.every(function(v){ return v < 30000; }),
   "résistances au-dessus du prix, supports en dessous");

g("Bougies clôturées");
var maintenant = Date.now();
var mix = [[0,0,0,0,0,0,maintenant-1000], [0,0,0,0,0,0,maintenant+3600000]];
ok(C.closedOnly(mix).length === 1,
   "la bougie en cours est écartée, seules les clôturées sont gardées");

/* ================= 2. MOTEUR DE SCORE ================= */

g("MVRV vers sous-score");
ok(C.mvrvScore(null) === null && C.mvrvScore(NaN) === null, "pas de MVRV : N/D");
ok(C.mvrvScore(-5) === 0 && C.mvrvScore(20) === 10, "bornes 0 et 10");
ok(near(C.mvrvScore(2), 4) && near(C.mvrvScore(7), 8.5), "points d'ancrage des bandes");
var mono = true;
for(var z=-2; z<10; z+=0.25) if(C.mvrvScore(z) > C.mvrvScore(z+0.25)) mono = false;
ok(mono, "conversion monotone : un MVRV plus haut ne donne jamais un score plus bas");

g("Agrégation de deux unités de temps");
var a1 = C.agg([{v:4, tf:"4H"}, {v:6, tf:"1D"}]);
ok(near(a1.v, 5) && a1.note === null, "écart faible : moyenne simple, sans commentaire");
var a2 = C.agg([{v:2, tf:"4H"}, {v:9, tf:"1D"}]);
ok(near(a2.v, 9) && a2.note !== null,
   "écart supérieur à 3 points : la lecture la plus lente est retenue ET signalée");
ok(C.agg([{v:null,tf:"4H"},{v:null,tf:"1D"}]).v === null, "deux valeurs absentes : N/D");
ok(near(C.agg([{v:null,tf:"4H"},{v:7,tf:"1D"}]).v, 7),
   "une seule valeur disponible : elle est prise telle quelle");

g("Pondération et renormalisation");
var w1 = C.weighted([{lbl:"a",w:50,v:10},{lbl:"b",w:30,v:0},{lbl:"c",w:20,v:5}]);
ok(near(w1.score, 6) && w1.renorm === false && w1.dropped.length === 0,
   "toutes composantes présentes : moyenne pondérée simple");
var w2 = C.weighted([{lbl:"RSI",w:35,v:6},{lbl:"Structure",w:25,v:4},{lbl:"MVRV",w:40,v:null}]);
ok(near(w2.score, (6*35+4*25)/60) && w2.W === 60 && w2.dropped[0] === "MVRV",
   "MVRV absent : poids renormalisés sur 60 %, et la composante exclue est nommée");
ok(C.weighted([{lbl:"a",w:100,v:null}]).score === null,
   "plus aucune composante : score N/D, jamais une valeur par défaut");

g("Table score vers action");
ok(C.tierFor(9) === 0 && C.tierFor(8.5) === 0, "seuil 8,5 inclus dans la vente forte");
ok(C.tierFor(8.49) === 1 && C.tierFor(7.0) === 1, "palier vente modérée");
ok(C.tierFor(6) === 2 && C.tierFor(4) === 3, "zone neutre : deux paliers « Rien »");
ok(C.tierFor(3.4) === 4 && C.tierFor(1.9) === 5, "paliers d'achat");
ok(C.TIERS[C.holdIdx(7)].dir === "hold" && C.TIERS[C.holdIdx(2)].dir === "hold",
   "le repli « Rien » ne peut jamais renvoyer une action");
ok(C.softer(0) === 1, "adoucir une vente forte donne une vente modérée");
ok(C.softer(5) === 4 && C.softer(2) === 2, "adoucir un achat le réduit ; « Rien » reste « Rien »");

g("Chaîne de décision — retrait des ventes en SWING");
var RANGE = {label:"RANGE", cls:"t-grn", er:0.1, er60:0.1};
var TEND  = {label:"TENDANCE", cls:"t-org", er:0.5, er60:0.5};
function texte(d){ return d.steps.join(" | "); }
[9.2, 8.6, 7.5].forEach(function(sc){
  var d = C.decide(sc, "swing", RANGE, {}, {});
  ok(C.TIERS[d.final].dir !== "sell",
     "score swing " + sc + " : aucune vente possible, quel que soit le régime");
  ok(d.capped === true && /côté vente de la table a été retiré/.test(texte(d)),
     "score swing " + sc + " : le blocage est signalé et motivé dans la chaîne");
});
ok(C.TIERS[C.decide(9.2, "swing", TEND, {bear:{bars:9}}, {}).final].dir !== "sell",
   "même avec une divergence baissière confirmée, le swing ne vend pas");
ok(C.TIERS[C.decide(9.2, "swing", RANGE, {}, {mvrvSub:9.5}).final].dir !== "sell",
   "même avec un MVRV en zone de sommet, le swing ne vend pas : c'est l'affaire de POSITION");
ok(!/côté vente de la table a été retiré/.test(texte(C.decide(9.2, "position", RANGE, {}, {}))),
   "l'horizon POSITION n'est pas concerné par ce retrait — il n'a jamais été testé");
ok(!/côté vente de la table a été retiré/.test(texte(C.decide(1.5, "swing", RANGE, {}, {}))),
   "un signal d'achat en swing n'est pas touché par la règle");
ok(C.decide(null, "swing", RANGE, {}, {}).final === null,
   "score non calculable : action N/D, pas un repli silencieux");

/* ================= 3. SAISIE ET PÉREMPTION ================= */

g("Lecture des nombres à la française");
ok(near(C.parseNum("2,4"), 2.4), "virgule décimale");
ok(near(C.parseNum("+1 450"), 1450), "espace comme séparateur de milliers");
ok(near(C.parseNum("-0,03 %"), -0.03), "signe et unité");
ok(C.parseNum("") === null && C.parseNum(null) === null && C.parseNum("abc") === null,
   "champ vide ou illisible : N/D, jamais 0");

g("Date de relevé");
ok(C.parseFrDate("08/09/2026") !== null && C.parseFrDate("8/9/2026") !== null,
   "format JJ/MM/AAAA accepté, avec ou sans zéro");
ok(C.parseFrDate("31/02/2026") === null, "31 février refusé, au lieu de déborder sur mars");
ok(C.parseFrDate("2026-09-08") === null && C.parseFrDate("") === null,
   "tout autre format : illisible, donc N/D");

g("Péremption des métriques manuelles");
var t0 = Date.UTC(2026, 8, 20);
ok(near(C.manualAgeDays("20/09/2026", t0), 0), "relevé du jour : âge nul");
ok(near(C.manualAgeDays("09/09/2026", t0), 11), "relevé de 11 jours : âge exact");
ok(C.manualAgeDays("25/09/2026", t0) === null, "date dans le futur : refusée");
ok(C.manualAgeDays("", t0) === null && C.manualAgeDays("xxx", t0) === null,
   "date absente ou illisible : traitée comme inconnue");
ok(C.MANUAL_MAX_AGE === 10, "la limite de péremption est bien de 10 jours");
/* comportement complet, via les vrais champs de la page */
C.__set("mDate", ""); C.__set("mMvrv", "2,4");
ok(C.manualStale() === true, "MVRV saisi sans date : traité comme périmé");
C.__set("mDate", C.todayFr());
ok(C.manualStale() === false, "date du jour : données valides");
ok(C.mv("mMvrv").indexOf("2,4") === 0, "valeur fraîche : transmise telle quelle au bloc");
var vieux = new Date(Date.now() - 30*86400000);
function deux(n){ return (n<10 ? "0" : "") + n; }
C.__set("mDate", deux(vieux.getDate())+"/"+deux(vieux.getMonth()+1)+"/"+vieux.getFullYear());
ok(C.manualStale() === true, "relevé de 30 jours : périmé");
ok(C.mv("mMvrv").indexOf("N/D") === 0,
   "valeur périmée : transmise comme N/D au bloc d'analyse, pas comme un fait");
C.__set("mDate", ""); C.__set("mMvrv", "");

/* ================= 4. BACKTEST — UNE SEULE COPIE, UN MOTEUR SANS TRICHE ================= */

g("Une seule copie des formules");
var fs = require("fs"), path = require("path");
var source = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
["rsiSeries","emaSeries","macdSeries","pctRank","effRatio","pivotIdx","tierFor","holdIdx"].forEach(function(f){
  var n = source.split("function " + f + "(").length - 1;
  ok(n === 1, "« " + f + " » n'existe qu'une fois dans la page (trouvé " + n + " fois)");
});
ok(typeof C.regimeAt === "undefined" && typeof C.getJSON === "undefined",
   "les anciennes copies propres au backtest (regimeAt, getJSON) ont disparu");
var redirection = fs.readFileSync(path.join(__dirname, "..", "backtest.html"), "utf8");
ok(/url=index\.html#backtest/.test(redirection) && redirection.indexOf("function") < 0,
   "backtest.html ne calcule plus rien : il renvoie vers l'onglet Backtest du cockpit");
ok(near((C.TIERS[0].lo + C.TIERS[0].hi)/200, 0.25) && near((C.TIERS[1].lo + C.TIERS[1].hi)/200, 0.125) &&
   near((C.TIERS[4].lo + C.TIERS[4].hi)/200, 0.125) && near((C.TIERS[5].lo + C.TIERS[5].hi)/200, 0.30),
   "la taille simulée est le milieu de la fourchette affichée par le cockpit, pas un chiffre à part");

g("Backtest — simulation");
/* Bougies journalières SYNTHÉTIQUES au format Binance. Ce n'est pas un cours réel :
   ces tests vérifient la mécanique du backtest, pas la valeur de la grille. */
function bougies(n, derive){
  var o = [], px = 20000, s = 4242;
  for(var i=0;i<n;i++){
    s = (s * 1103515245 + 12345) % 2147483648;
    var ouv = px;
    px = px * (1 + ((s/2147483648) - 0.5) * 0.04 + derive);
    var t = Date.UTC(2020,0,1) + i*86400000;
    o.push([t, String(ouv), String(Math.max(ouv,px)*1.01), String(Math.min(ouv,px)*0.99),
            String(px), "100", t + 86399999]);
  }
  return o;
}
var KL = bougies(700, 0.004);          /* dérive haussière : le RSI monte souvent haut */
var R  = C.simulate(KL, 365, 70, 0.1, 7);
var actuel = R.runs.regime.trades, origine = R.runs.plain.trades;
var DEBUT = 335;                        /* max(260, 700 - 365) */

ok(R.dates[0] === KL[DEBUT][0], "la simulation démarre bien après la période de chauffe des indicateurs");
ok(near(R.hold.eq[0], 1, 1e-9) && near(R.runs.regime.eq[0], 1, 1e-9) && near(R.runs.plain.eq[0], 1, 1e-9),
   "les trois portefeuilles partent de la même base");
ok(origine.some(function(t){ return t.type === "vente"; }),
   "sur une hausse marquée, la grille d'origine vend — le test suivant a donc de quoi mordre");
ok(actuel.length > 0 && actuel.every(function(t){ return t.type !== "vente"; }),
   "règles actuelles : des achats possibles, aucune vente, jamais");

var ouvertures = {};
KL.forEach(function(k){ ouvertures[k[0]] = parseFloat(k[1]); });
ok(actuel.concat(origine).every(function(t){ return near(t.px, ouvertures[t.t], 1e-6); }),
   "chaque ordre est exécuté à l'ouverture du lendemain, jamais à la clôture qui a servi à décider");

function espaces(tr, j){
  for(var i=1;i<tr.length;i++) if((tr[i].t - tr[i-1].t)/86400000 < j) return false;
  return true;
}
ok(espaces(actuel, 7) && espaces(origine, 7), "délai de carence respecté : jamais deux ordres à moins de 7 jours");
ok(C.simulate(KL, 365, 70, 0.1, 0).runs.plain.trades.length > origine.length,
   "sans délai de carence, la grille d'origine multiplie les ordres");

var p0 = parseFloat(KL[DEBUT][4]), pFin = parseFloat(KL[KL.length-2][4]);
ok(near(R.hold.eq[R.hold.eq.length-1], 0.7/p0*pFin + 0.3, 1e-9),
   "« ne rien faire » vaut exactement 70 % de BTC figé plus 30 % de cash");

/* Le test qui compte le plus : couper la fin de l'historique ne doit rien changer
   au passé. Si un seul jour bouge, le backtest lit l'avenir et ses résultats sont faux. */
var Rc = C.simulate(KL.slice(0, 600), 600 - DEBUT, 70, 0.1, 7);
function memePasse(a, b){
  if(a.length < 100) return false;
  for(var i=0;i<a.length;i++) if(!near(a[i], b[i], 1e-12)) return false;
  return true;
}
ok(Rc.dates[0] === R.dates[0] && memePasse(Rc.runs.regime.eq, R.runs.regime.eq) &&
   memePasse(Rc.runs.plain.eq, R.runs.plain.eq) && memePasse(Rc.hold.eq, R.hold.eq),
   "aucune triche avec le futur : retirer les 100 derniers jours ne modifie pas un seul jour antérieur");

ok(near(C.maxDD([100,120,60,90,130]), 50), "pire perte : une chute de 120 à 60 compte pour 50 %");
ok(C.mean([]) === null && near(C.mean([1,2,3]), 2), "moyenne d'une liste vide : N/D, jamais 0");

/* ================= 5. DEPUIS TA DERNIÈRE VISITE ================= */

g("Bilan depuis la dernière visite");
function releve(o){
  var b = { v:1, ts:Date.UTC(2026,8,1), px:60000,
            sw:{tier:3, score:4.5}, po:{tier:2, score:6},
            reg:{d1:"RANGE", w1:"TRANSITION"},
            div:{d1:{bear:null, bull:null}, w1:{bear:null, bull:null}},
            e200:55000, sup:58000, res:64000, inv:null, stale:false };
  for(var k in o) b[k] = o[k];
  return b;
}
var P0 = releve({});
ok(C.visitEvents(P0, releve({ts:P0.ts + 86400000}), 59000, 61000).length === 0,
   "rien n'a changé et aucun niveau n'a été touché : aucun événement, le silence est la réponse normale");

var eP = C.visitEvents(P0, releve({po:{tier:1, score:7.4}}), 59000, 61000);
ok(eP.length === 1 && eP[0].fort && /POSITION/.test(eP[0].txt) && /Vente 10-15/.test(eP[0].txt),
   "palier POSITION passé à une vente : signalé « à regarder », avec l'action");
var eS = C.visitEvents(P0, releve({sw:{tier:2, score:6.1}}), 59000, 61000);
ok(eS.length === 1 && !eS[0].fort && /SWING/.test(eS[0].txt),
   "palier SWING changé d'un « Rien » à un autre : signalé, mais seulement « à noter »");

ok(C.visitEvents(P0, releve({reg:{d1:"TENDANCE", w1:"TRANSITION"}}), 59000, 61000)
     .some(function(e){ return /Régime 1 J : RANGE → <b>TENDANCE/.test(e.txt); }),
   "changement de régime journalier signalé, avec l'avant et l'après");
ok(C.visitEvents(P0, releve({reg:{d1:"N/D", w1:"TRANSITION"}}), 59000, 61000).length === 0,
   "un régime devenu N/D n'est pas présenté comme un changement");

var tDiv = Date.UTC(2026,7,20);
var avecDiv = releve({div:{d1:{bear:tDiv, bull:null}, w1:{bear:null, bull:null}}});
ok(C.visitEvents(P0, avecDiv, 59000, 61000)
     .some(function(e){ return e.fort && /divergence baissière confirmée en 1 J/.test(e.txt); }),
   "nouvelle divergence baissière confirmée : signalée");
ok(C.visitEvents(avecDiv, releve({div:avecDiv.div}), 59000, 61000).length === 0,
   "une divergence déjà présente à la visite précédente n'est pas signalée une seconde fois");
ok(C.visitEvents(releve({div:{d1:null, w1:null}}), avecDiv, 59000, 61000).length === 0,
   "divergences inconnues à la visite précédente : rien n'est présenté comme « nouveau »");

ok(C.visitEvents(P0, releve({px:54000}), 59000, 61000)
     .some(function(e){ return /en dessous<\/b> de l'EMA 200/.test(e.txt); }),
   "passage du prix sous l'EMA 200 journalière : signalé");
ok(C.visitEvents(P0, releve({}), 57500, 61000)
     .some(function(e){ return e.fort && /Support de 58/.test(e.txt); }),
   "plus bas réel sous le support d'alors : support enfoncé, signalé");
ok(C.visitEvents(P0, releve({}), 59000, 64500)
     .some(function(e){ return /Résistance de 64/.test(e.txt); }),
   "plus haut réel au-dessus de la résistance d'alors : signalé");
ok(C.visitEvents(releve({sup:null, res:null}), releve({}), 10, 999999).length === 0,
   "aucun niveau connu à la visite précédente : aucune cassure inventée");

var inv = {ts:Date.UTC(2026,7,25), sw:true, po:false, lvlS:62000, lvlP:50000};
ok(C.visitEvents(releve({inv:{ts:inv.ts, sw:false, po:false, lvlS:62000, lvlP:50000}}), releve({inv:inv}), 59000, 61000)
     .some(function(e){ return e.fort && /Invalidation SWING/.test(e.txt) && /touchée/.test(e.txt); }),
   "invalidation swing touchée depuis la visite : signalée « à regarder »");
ok(C.visitEvents(releve({inv:inv}), releve({inv:inv}), 59000, 61000).length === 0,
   "invalidation déjà touchée et déjà signalée : pas de répétition à chaque visite");

ok(C.visitEvents(P0, releve({stale:true}), 59000, 61000)
     .some(function(e){ return /métriques manuelles/.test(e.txt); }),
   "relevé manuel devenu périmé depuis la visite : signalé");
ok(C.visitEvents(releve({stale:null}), releve({stale:true}), 59000, 61000).length === 0,
   "relevé manuel jamais saisi : pas d'alerte de péremption");

ok(C.dureeTxt(2*86400000 + 3*3600000) === "il y a 2 j 3 h" && C.dureeTxt(5*3600000) === "il y a 5 h" &&
   C.dureeTxt(90000) === "il y a 2 min",
   "ancienneté de la visite écrite en clair");

/* ================= RÉSULTAT ================= */
console.log("");
console.log("Tests du moteur : " + pass + " réussis, " + fail.length + " échoués");
if(fail.length){
  console.log("");
  fail.forEach(function(f){ console.log("  ÉCHEC : " + f); });
  process.exit(1);
}
console.log("Rappel : toutes les séries de ce fichier sont synthétiques. Ces tests valident");
console.log("les formules, pas la pertinence des seuils sur le vrai marché.");

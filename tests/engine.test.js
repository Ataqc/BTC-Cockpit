/* Tests du moteur de calcul — aucune dépendance, aucun réseau, aucune donnée de marché.
   Deux familles :
     1. identités mathématiques : ce que l'indicateur DOIT valoir sur une série dont
        on connaît la réponse à l'avance (constante, croissante, en dents de scie) ;
     2. contrôle croisé cockpit / backtest : les deux pages contiennent chacune leur
        copie des formules. Si elles divergent, le backtest ne valide plus le cockpit
        mais un cousin. Ces tests échouent au premier écart.
   ATTENTION : toutes les séries utilisées ici sont SYNTHÉTIQUES. Aucun résultat de
   ce fichier ne dit quoi que ce soit du vrai Bitcoin. */
var sandbox = require("./sandbox.js");
var C = sandbox.load("index.html");     /* cockpit  */
var B = sandbox.load("backtest.html");  /* backtest */

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

/* ================= 4. CONTRÔLE CROISÉ COCKPIT / BACKTEST ================= */

g("Cockpit contre backtest — mêmes formules");
var S = serie(400, 777);
[9, 12, 20, 26, 50, 200].forEach(function(p){
  sameSeries(C.emaSeries(S, p), B.emaSeries(S, p), "EMA " + p);
});
sameSeries(C.rsiSeries(S, 14), B.rsiSeries(S, 14), "RSI 14");
sameSeries(C.macdSeries(S).hist, B.macdSeries(S).hist, "histogramme MACD");
ok(near(C.pctRank(S, S[200]), B.pctRank(S, S[200])), "percentile identique");
[20, 60].forEach(function(n){
  ok(near(C.effRatio(S, n), B.effRatio(S, n)), "ratio d'efficience sur " + n + " bougies");
});
[2, 3, 5].forEach(function(k){
  ok(JSON.stringify(C.pivotIdx(S, k, true)) === JSON.stringify(B.pivotIdx(S, k, true)),
     "sommets confirmés à " + k + " bougies");
  ok(JSON.stringify(C.pivotIdx(S, k, false)) === JSON.stringify(B.pivotIdx(S, k, false)),
     "creux confirmés à " + k + " bougies");
});
var memeRegime = true, memePalier = true;
for(var i=100;i<S.length;i++){
  var sl = S.slice(0, i);
  if(C.regimeOf(sl).label !== B.regimeAt(sl)) memeRegime = false;
}
ok(memeRegime, "régime détecté identique sur toute la série");
for(var s=0; s<=10; s+=0.1) if(C.tierFor(s) !== B.tierFor(s)) memePalier = false;
ok(memePalier, "table score vers action identique sur toute l'échelle 0-10");
ok(C.TIERS.length === B.TIERS.length, "même nombre de paliers");
ok(C.TIERS.every(function(t, i){ return t.min === B.TIERS[i].min; }),
   "seuils des paliers identiques au chiffre près");
ok(C.holdIdx(7) === B.holdIdx(7) && C.holdIdx(2) === B.holdIdx(2), "repli « Rien » identique");

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

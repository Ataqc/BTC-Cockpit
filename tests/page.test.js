/* Test de bout en bout de la page réelle, dans un vrai DOM (jsdom).
   Le réseau est simulé : Binance et Alternative.me sont remplacés par des réponses
   SYNTHÉTIQUES au bon format. Rien ici ne provient du vrai marché — le but est de
   vérifier que la page se charge, calcule, s'affiche et applique ses règles, pas
   de dire quoi que ce soit du bitcoin.

   C'est le test qui protège du pire cas : une page blanche ou un tableau vide
   qu'Anthony ne pourrait pas diagnostiquer. */
var fs = require("fs");
var path = require("path");
var jsdom;
try { jsdom = require("jsdom"); }
catch(e){
  console.log("jsdom absent — test de rendu ignoré (npm install le fournit).");
  process.exit(0);
}

var pass = 0, fail = [];
function ok(cond, label){ if(cond) pass++; else fail.push(label); }

/* ---------- fausses réponses, au format exact des API ---------- */
var JOUR = 86400000;
function klines(n, ms, depart){
  var out = [], px = depart || 30000, fin = Date.now() - ms;   /* toutes clôturées */
  for(var i=n-1;i>=0;i--){
    var t = fin - i*ms;
    px = px * (1 + Math.sin(i/9)*0.012 + 0.0006);
    out.push([t-ms, String(px*0.999), String(px*1.012), String(px*0.988), String(px),
              "1200", t, "0", 0, "0", "0", "0"]);
  }
  return out;
}
function reponse(url){
  if(/ticker\/24hr/.test(url))
    return { lastPrice:"30000.00", priceChangePercent:"1.50", highPrice:"30500.00",
             lowPrice:"29500.00", volume:"12000", quoteVolume:"360000000" };
  if(/interval=4h/.test(url))  return klines(400, 4*3600000);
  if(/interval=1d/.test(url))  return klines(400, JOUR);
  if(/interval=1w/.test(url))  return klines(200, 7*JOUR);
  if(/premiumIndex/.test(url)) return { lastFundingRate:"0.0001", markPrice:"30010" };
  if(/openInterestHist/.test(url)){
    var h = []; for(var i=0;i<8;i++) h.push({ sumOpenInterest:String(80000+i*300), timestamp:Date.now()-i*JOUR });
    return h;
  }
  if(/openInterest/.test(url))  return { openInterest:"82000" };
  if(/globalLongShortAccountRatio/.test(url)){
    var l = []; for(var i=0;i<30;i++) l.push({ longShortRatio:"1.05", timestamp:Date.now()-i*JOUR });
    return l;
  }
  if(/fundingRate/.test(url)){
    var f = []; for(var i=0;i<21;i++) f.push({ fundingRate:"0.00008", fundingTime:Date.now()-i*28800000 });
    return f;
  }
  if(/fng/.test(url)){
    var d = [];
    for(var i=0;i<31;i++) d.push({ value:String(50+(i%7)), value_classification:"Neutral",
                                   timestamp:String(Math.floor((Date.now()-i*JOUR)/1000)) });
    return { data:d };
  }
  throw new Error("URL non simulée dans le test : " + url);
}

/* ---------- chargement de la page ---------- */
var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
var erreurs = [];
var dom = new jsdom.JSDOM(html, {
  runScripts: "dangerously",
  url: "https://example.org/",
  beforeParse: function(win){
    win.fetch = function(url){
      try {
        var body = reponse(String(url));
        return Promise.resolve({ ok:true, status:200, json:function(){ return Promise.resolve(body); } });
      } catch(e){ return Promise.reject(e); }
    };
    win.scrollTo = function(){};
    win.addEventListener("error", function(ev){ erreurs.push(String(ev.message || ev.error)); });
    var vraiErr = win.console.error;
    win.console.error = function(){ erreurs.push(Array.prototype.join.call(arguments," ")); vraiErr.apply(win.console, arguments); };
  }
});

var win = dom.window, doc = win.document;
function txt(id){ var el = doc.getElementById(id); return el ? (el.textContent || "") : ""; }
function htm(id){ var el = doc.getElementById(id); return el ? (el.innerHTML || "") : ""; }

/* Le chargement enchaîne plusieurs promesses. On attend que le verdict existe
   plutôt qu'un délai fixe : un délai fixe rend le test capricieux sur une machine
   lente, et un test capricieux finit par être ignoré. */
function attendre(){
  var limite = Date.now() + 20000;
  return new Promise(function(resolve, reject){
    (function boucle(){
      if(win.D && win.D.verdict && win.D.verdict.ok) return resolve();
      if(Date.now() > limite)
        return reject(new Error("la page n'a pas produit de verdict en 20 s" +
                                (erreurs.length ? " — erreur : " + erreurs[0] : "")));
      setTimeout(boucle, 50);
    })();
  });
}

attendre().then(function(){

  /* ---------- la page vit ---------- */
  ok(erreurs.length === 0, "aucune erreur JavaScript au chargement" +
     (erreurs.length ? " (" + erreurs[0] + ")" : ""));
  ok(txt("px").indexOf("30") >= 0, "le prix est affiché");
  ok(/OK/.test(htm("sources")), "au moins une source est signalée OK");

  /* ---------- les blocs sont remplis, pas vides ---------- */
  [["verdict","les deux cartes de verdict"], ["signals","le tableau des 7 signaux"],
   ["regimes","les régimes par unité de temps"], ["tRsi","le tableau RSI"],
   ["tMacd","le tableau MACD"], ["tStruct","la structure"], ["tLevels","les niveaux"],
   ["tVol","le volume"], ["tDeriv","les dérivés"], ["tSent","le sentiment"],
   ["candles","l'état des bougies"]].forEach(function(p){
    ok(htm(p[0]).length > 40, p[1] + " : rendu non vide");
  });
  ok((htm("verdict").match(/vcard/g) || []).length === 2,
     "exactement deux cartes : SWING et POSITION, jamais mélangées");
  ok((htm("signals").match(/<tr>/g) || []).length >= 7, "les 7 signaux sont tous listés");

  /* ---------- les scores sont des nombres dans l'échelle ---------- */
  var V = win.D.verdict;
  ok(V && V.ok, "le verdict est calculé");
  ok(V.swing.score >= 0 && V.swing.score <= 10, "score swing dans l'échelle 0-10");
  ok(V.position.score >= 0 && V.position.score <= 10, "score position dans l'échelle 0-10");
  ok(["TENDANCE","RANGE","TRANSITION","N/D"].indexOf(V.regime.d1.label) >= 0,
     "le régime journalier a une valeur connue");
  ok(win.TIERS[V.decSwing.final].dir !== "sell",
     "invariant : l'horizon SWING ne peut jamais aboutir à une vente");

  /* ---------- indicateurs sur bougies clôturées uniquement ---------- */
  var maintenant = Date.now();
  ok(win.D.kd.every(function(k){ return k[6] < maintenant; }),
     "aucune bougie en cours dans les données journalières utilisées");

  /* ---------- le bloc pour l'IA est généré ---------- */
  var bloc = doc.getElementById("block").value;
  ["=== BLOC DE DONNÉES BTC", "--- §0", "--- SUPPORTS ET RÉSISTANCES",
   "--- RÉGIME DE MARCHÉ", "--- CONTRÔLE DE FIABILITÉ", "=== FIN DU BLOC"].forEach(function(s){
    ok(bloc.indexOf(s) >= 0, "le bloc contient la section « " + s.replace(/-|=/g,"").trim() + " »");
  });
  ok(bloc.indexOf("undefined") < 0 && bloc.indexOf("NaN") < 0,
     "le bloc ne contient ni « undefined » ni « NaN »");

  /* ---------- MVRV absent : score position renormalisé ---------- */
  ok(V.position.dropped.indexOf("MVRV Z-score") >= 0 && V.position.W === 60,
     "sans MVRV, le score position est calculé sur 60 % du barème et le dit");
  ok(htm("verdict").indexOf("60 % du barème") >= 0,
     "la renormalisation est écrite en clair dans l'interface");

  /* ---------- MVRV frais : il compte ---------- */
  function saisir(id, v){
    var el = doc.getElementById(id);
    el.value = v;
    el.dispatchEvent(new win.Event("input", { bubbles:true }));
  }
  saisir("mMvrv", "6,0");
  ok(doc.getElementById("mDate").value !== "",
     "la date de relevé se remplit toute seule à la première saisie");
  var V2 = win.D.verdict;
  ok(V2.position.dropped.length === 0 && V2.mvrvSub !== null,
     "MVRV frais : la composante est bien prise en compte");
  ok(V2.position.score !== V.position.score, "le score position change quand le MVRV entre");
  ok(htm("mAgeBox").indexOf("Encore valable") >= 0, "la fraîcheur du relevé est affichée");

  /* ---------- MVRV périmé : il est écarté ---------- */
  var vieux = new Date(Date.now() - 25*JOUR);
  function deux(n){ return (n<10?"0":"") + n; }
  saisir("mDate", deux(vieux.getDate())+"/"+deux(vieux.getMonth()+1)+"/"+vieux.getFullYear());
  var V3 = win.D.verdict;
  ok(V3.position.dropped.indexOf("MVRV Z-score") >= 0 && V3.position.W === 60,
     "MVRV vieux de 25 jours : exclu du score position");
  ok(V3.mvrvSub === null,
     "MVRV périmé : l'exception de valorisation extrême ne peut plus autoriser une vente");
  ok(Math.abs(V3.position.score - V.position.score) < 1e-9,
     "score identique à celui obtenu sans MVRV du tout : le périmé vaut bien N/D");
  ok(htm("verdict").indexOf("PÉRIMÉ") >= 0, "l'interface affiche PÉRIMÉ au lieu de la valeur");
  ok(htm("mAgeBox").indexOf("périmé") >= 0, "le bandeau d'alerte s'affiche dans la carte de saisie");
  var bloc3 = doc.getElementById("block").value;
  ok(/MVRV Z-score : N\/D/.test(bloc3),
     "le bloc transmet N/D à l'IA, pas la valeur périmée");
  ok(bloc3.indexOf("PÉRIMÉ") >= 0, "le bloc dit explicitement que le relevé est périmé");

  /* ---------- historique : sauvegarde et relecture ---------- */
  saisir("hInvS", "28000");
  doc.getElementById("hSave").dispatchEvent(new win.Event("click", { bubbles:true }));
  ok(htm("hTable").length > 40, "l'analyse enregistrée apparaît dans l'historique");
  ok(erreurs.length === 0, "toujours aucune erreur JavaScript après interaction" +
     (erreurs.length ? " (" + erreurs[0] + ")" : ""));

  /* ---------- depuis ta dernière visite ---------- */
  ok(/Première visite/.test(htm("visit")), "première ouverture : le bilan le dit, sans rien inventer");
  var memo = JSON.parse(win.localStorage.getItem("btc_visit"));
  ok(memo && memo.v === 1 && memo.px > 0 && memo.po && memo.reg && memo.reg.d1,
     "l'état de cette visite est mémorisé sur l'appareil");
  win.renderVisit();
  ok(/Première visite/.test(htm("visit")),
     "actualiser pendant la même visite ne remplace pas la référence");

  /* visite suivante simulée : la précédente date de deux jours, avec un autre régime
     journalier et un autre palier position */
  var ancien = JSON.parse(JSON.stringify(memo));
  ancien.ts = Date.now() - 2*86400000;
  ancien.reg.d1 = (ancien.reg.d1 === "RANGE") ? "TENDANCE" : "RANGE";
  ancien.po.tier = (ancien.po.tier === 5) ? 4 : 5;
  win.localStorage.setItem("btc_visit", JSON.stringify(ancien));
  win.sessionStorage.removeItem("btc_visit_ref");
  win.renderVisit();
  ok(/Dernière visite/.test(htm("visit")) && /il y a 2 j/.test(htm("visit")),
     "nouvelle visite : la date et l'ancienneté de la précédente sont affichées");
  ok(/Régime 1 J/.test(htm("visit")) && /POSITION/.test(htm("visit")),
     "les changements de régime et de palier depuis la visite sont listés");
  win.renderVisit();
  ok(/Régime 1 J/.test(htm("visit")),
     "une actualisation ne fait pas disparaître un changement pas encore lu");

  var verdictSauve = win.D.verdict;
  var referenceAvant = win.localStorage.getItem("btc_visit");
  win.D.verdict = {ok:false};
  win.sessionStorage.removeItem("btc_visit_ref");
  win.renderVisit();
  ok(/indisponible/.test(htm("visit")) && win.localStorage.getItem("btc_visit") === referenceAvant,
     "données non chargées : bilan indisponible, et la référence n'est pas écrasée par un état vide");
  win.D.verdict = verdictSauve;
  var vraiStorageOK = win.storageOK;
  win.storageOK = function(){ return false; };
  win.renderVisit();
  ok(/mémoire locale est bloquée/.test(htm("visit")),
     "mémoire du navigateur bloquée : le bilan le dit, au lieu de prétendre avoir enregistré la visite");
  win.storageOK = vraiStorageOK;

  /* ---------- onglets : cockpit et backtest dans une seule page ---------- */
  function attendreQue(cond, msg){
    var limite = Date.now() + 20000;
    return new Promise(function(resolve, reject){
      (function boucle(){
        if(cond()) return resolve();
        if(Date.now() > limite) return reject(new Error(msg + (erreurs.length ? " — erreur : " + erreurs[0] : "")));
        setTimeout(boucle, 50);
      })();
    });
  }
  function aller(h){
    win.location.hash = h;
    win.dispatchEvent(new win.HashChangeEvent("hashchange"));
  }
  ok(!doc.getElementById("vCockpit").hidden && doc.getElementById("vBacktest").hidden,
     "à l'ouverture, seul le cockpit est affiché");
  ok(/\bon\b/.test(doc.getElementById("tabCockpit").className) &&
     !/\bon\b/.test(doc.getElementById("tabBacktest").className),
     "l'onglet Cockpit est marqué actif, et lui seul");
  ok(!!doc.querySelector("header #tabBacktest"), "le bouton Backtest est bien dans la bannière");
  doc.getElementById("tabBacktest").dispatchEvent(new win.MouseEvent("click", { bubbles:true, cancelable:true }));
  ok(win.location.hash === "#backtest",
     "le clic sur l'onglet met l'adresse à jour (#backtest) : favori et bouton retour restent justes");
  ok(doc.getElementById("vCockpit").hidden && !doc.getElementById("vBacktest").hidden,
     "onglet Backtest : le backtest remplace le cockpit sans changer de page");
  ok(/\bon\b/.test(doc.getElementById("tabBacktest").className) && doc.title.indexOf("Backtest") >= 0,
     "l'onglet Backtest devient actif et le titre de l'onglet du navigateur suit");
  ok(win.D.verdict && win.D.verdict.ok, "les données du cockpit restent en mémoire pendant ce temps");
  ok(htm("btOut") === "", "le backtest ne télécharge rien tant qu'on ne l'a pas lancé");
  doc.getElementById("btYears").value = "2";
  doc.getElementById("btRun").dispatchEvent(new win.Event("click", { bubbles:true }));
  return attendreQue(function(){ return /Résultat/.test(htm("btOut")); },
                     "le backtest n'a produit aucun résultat en 20 s");
}).then(function(){
  function aller(h){
    win.location.hash = h;
    win.dispatchEvent(new win.HashChangeEvent("hashchange"));
  }
  var out = doc.getElementById("btOut");
  ok(out.querySelectorAll(".hero").length === 3,
     "le backtest affiche ses trois résultats : règles actuelles, grille d'origine, ne rien faire");
  ok(!!doc.getElementById("btChart"), "la courbe d'évolution du portefeuille est dessinée");
  var etiquettes = [].map.call(out.querySelectorAll(".tag"), function(t){ return t.textContent; });
  ok(etiquettes.indexOf("vente") < 0, "aucune vente dans les transactions des règles actuelles");
  ok(htm("btOut").indexOf("NaN") < 0 && htm("btOut").indexOf("undefined") < 0,
     "ni « NaN » ni « undefined » dans les résultats du backtest");
  ok(doc.getElementById("btRun").textContent.indexOf("Relancer") >= 0, "le bouton propose de relancer");
  aller("#cockpit");
  ok(!doc.getElementById("vCockpit").hidden && doc.getElementById("vBacktest").hidden &&
     htm("verdict").indexOf("vcard") >= 0,
     "retour au cockpit : le verdict est toujours là, rien n'a été rechargé");
  aller("#backtest");
  ok(/Résultat/.test(htm("btOut")), "retour au backtest : le dernier résultat est conservé");
  ok(erreurs.length === 0, "toujours aucune erreur JavaScript après navigation et backtest" +
     (erreurs.length ? " (" + erreurs[0] + ")" : ""));

  /* ---------- résultat ---------- */
  console.log("");
  console.log("Tests de la page : " + pass + " réussis, " + fail.length + " échoués");
  if(fail.length){
    console.log("");
    fail.forEach(function(f){ console.log("  ÉCHEC : " + f); });
    process.exit(1);
  }
  console.log("Réseau simulé, données synthétiques : ce test valide le fonctionnement de la");
  console.log("page, pas l'exactitude des chiffres de marché.");
  process.exit(0);
}).catch(function(e){
  console.log("ÉCHEC BRUTAL du test de page : " + (e && e.stack || e));
  process.exit(1);
});

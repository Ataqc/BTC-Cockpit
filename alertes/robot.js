/* Robot d'alerte quotidien — volet B des alertes.

   Il tourne sur un serveur GitHub (GitHub Actions), une fois par jour peu après la
   clôture journalière de 00:00 UTC. Il ne recopie AUCUNE formule : il charge la
   vraie page index.html (via tests/sandbox.js) et fait tourner ses fonctions,
   exactement comme le cockpit dans ton navigateur.

   Il compare l'état du marché à la dernière clôture journalière avec l'état à la
   clôture précédente, avec la même fonction que le bilan « depuis ta dernière
   visite », et n'envoie une notification que si quelque chose a changé.
   Il lit aussi le MVRV Z-score public de Coin Metrics, et signale un changement de
   bande MVRV confirmé (nouvelle bande tenue 7 jours).

   Ce qu'il NE PEUT PAS voir, et ne signale donc jamais :
   - funding, open interest, long/short : Binance bloque ses API dérivés depuis les
     États-Unis, où sont les serveurs GitHub (HTTP 451, vérifié le 11/09/2026).
     Le gate de confirmation n'est pas lisible : un palier swing signalé est une
     action CANDIDATE, pas la décision complète du cockpit ;
   - ta position, tes relevés manuels, tes invalidations : ils n'existent que dans
     ton navigateur. D'où : aucune alerte de palier POSITION, donc jamais d'alerte
     de vente. Un changement de bande MVRV est un fait de marché, pas un palier.

   Silence = rien de notable, à condition que le robot tourne. Pour que ce silence
   veuille dire quelque chose : un message discret chaque lundi, une notification
   si le calcul échoue, et « MVRV non vérifié » quand Coin Metrics ne répond pas. */
"use strict";
var path = require("path");
var sandbox = require(path.join(__dirname, "..", "tests", "sandbox.js"));

var MIROIR  = "https://data-api.binance.vision";   /* seul accès Binance ouvert depuis les États-Unis */
var FNG     = "https://api.alternative.me/fng/?limit=31";
var NTFY    = "https://ntfy.sh/";
var COCKPIT = "https://ataqc.github.io/BTC-Cockpit/";
var JOUR    = 86400000;

function lire(url){
  return fetch(url, { signal: AbortSignal.timeout(30000) }).then(function(r){
    if(!r.ok) throw new Error("HTTP " + r.status + " sur " + url.split("?")[0]);
    return r.json();
  });
}

/* Historique MVRV complet. Un échec ici n'arrête pas le robot : il le dira. */
function lireCM(C){
  var rows = [];
  function page(url, n){
    return lire(url).then(function(j){
      rows = rows.concat(j.data || []);
      return (j.next_page_url && n < 20) ? page(j.next_page_url, n + 1) : rows;
    });
  }
  return page(C.CM_API + "?assets=btc&frequency=1d&metrics=CapMVRVCur,CapMrktCurUSD" +
              "&start_time=2010-01-01&paging_from=start&page_size=10000", 1)
    .then(function(r){ return { rows:r }; }, function(e){ return { err:e.message }; });
}

function telecharger(C){
  var k = MIROIR + "/api/v3/klines?symbol=BTCUSDT&interval=";
  return Promise.all([
    lire(MIROIR + "/api/v3/ticker/24hr?symbol=BTCUSDT"),
    lire(k + "4h&limit=500"),
    lire(k + "1d&limit=500"),
    lire(k + "1w&limit=300"),
    lire(FNG),
    lireCM(C)
  ]).then(function(r){ return { tick:r[0], k4:r[1], kd:r[2], kw:r[3], fng:r[4], cm:r[5] }; });
}

/* Fait tourner la page entière sur un jeu de données, comme le navigateur, et
   renvoie son relevé — le même que celui du bilan de visite. */
function etat(C, d, ts){
  C.D = { tick:d.tick, k4:d.k4, kd:d.kd, kw:d.kw, fng:d.fng };
  C.render();
  var V = C.D.verdict;
  if(!V || !V.ok) return null;
  var s = C.visitSnapshot();
  s.ts = ts;
  /* Palier swing : action candidate après le retrait des ventes swing, mais AVANT
     le gate de confirmation, que le robot ne peut pas lire. */
  var cand = V.decSwing.candidate;
  s.sw.tier = (cand === null || cand === undefined) ? null
            : (C.TIERS[cand].dir === "sell" ? C.holdIdx(V.swing.score) : cand);
  s.po.tier = null;   /* jamais d'alerte POSITION : elle dépend de ta position et du gate */
  s.inv = null;       /* tes invalidations vivent dans ton navigateur */
  s.stale = null;     /* tes relevés manuels aussi */
  return s;
}

/* État de la veille : on retire la dernière bougie journalière clôturée et tout ce
   qui a été clôturé depuis son ouverture. Le prix de la veille est sa clôture. */
function veille(d){
  var T = d.kd[d.kd.length-1][0];
  var kd = d.kd.slice(0, -1);
  var der = kd[kd.length-1], avt = kd[kd.length-2];
  return {
    T: T,
    donnees: {
      tick: { lastPrice: der[4], highPrice: der[2], lowPrice: der[3], volume: der[5],
              quoteVolume: der[7] || "0",
              priceChangePercent: String((parseFloat(der[4]) / parseFloat(avt[4]) - 1) * 100) },
      k4: d.k4.filter(function(k){ return k[6] < T; }),
      kd: kd,
      kw: d.kw.filter(function(k){ return k[6] < T; }),
      fng: (d.fng && d.fng.data) ? { data: d.fng.data.slice(1) } : d.fng
    }
  };
}

/* MVRV : changement de bande confirmé, lu sur la journée d'AVANT-HIER. Coin Metrics
   publie chaque journée quelques heures après sa fin : à 00:20 UTC, la dernière
   journée sûre est celle d'avant-hier. Une journée fixe par date de passage : chaque
   changement est signalé une fois, jamais deux. cm absent = rien n'a été demandé. */
function etatMvrv(C, cm, maintenant){
  if(!cm) return {};
  var d = new Date(maintenant), jour = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 2*JOUR;
  var date = new Date(jour).toLocaleDateString("fr-FR", {timeZone:"UTC"});
  if(cm.err) return { evenement:{ fort:false, txt:"MVRV non vérifié aujourd'hui : Coin Metrics injoignable (" + cm.err + ")" } };
  var S = C.cmSeries(cm.rows), z = C.mvrvZSeries(S.mc, S.mv);
  var ch = C.mvrvBandChange(S.t, z, jour);
  if(ch && ch.manque)
    return { evenement:{ fort:false, txt:"MVRV non vérifié aujourd'hui : la journée du " + date + " n'est pas encore publiée par Coin Metrics" } };
  var i = S.t.indexOf(jour), b = C.mvrvBand(z[i]);
  var resume = b === null ? null : "Z " + C.num(z[i], 2) + ", bande « " + C.MVRV_BANDS[b].lbl + " » (" + date + ")";
  if(!ch) return { resume:resume };
  return { resume:resume, evenement:{ fort:ch.fort,
    txt:"Bande MVRV : « " + C.MVRV_BANDS[ch.avant].lbl + " » → <b>« " + C.MVRV_BANDS[ch.apres].lbl + " »</b>, tenue depuis " +
        C.MVRV_TENUE + " jours (Z " + C.num(ch.z, 2) + " le " + date + ", Coin Metrics)" } };
}

function analyser(C, brut, maintenant){
  var d = { tick: brut.tick, fng: brut.fng,
            k4: C.closedOnly(brut.k4), kd: C.closedOnly(brut.kd), kw: C.closedOnly(brut.kw) };
  if(d.kd.length < 212) throw new Error("historique journalier insuffisant (" + d.kd.length + " bougies)");
  var v = veille(d);
  var avant = etat(C, v.donnees, v.T);
  var apres = etat(C, d, maintenant);
  if(!avant || !apres) throw new Error("verdict non calculable sur ces données");
  var r = C.visitRange(v.T);          /* le cockpit contient maintenant l'état du jour */
  var ev = C.visitEvents(avant, apres, r.lo, r.hi);
  var mv = etatMvrv(C, brut.cm, maintenant);
  if(mv.evenement) ev.push(mv.evenement);
  ev.sort(function(a, b){ return (b.fort ? 1 : 0) - (a.fort ? 1 : 0); });
  return { T: v.T, avant: avant, apres: apres, lo: r.lo, hi: r.hi, evenements: ev, mvrv: mv };
}

function sansHtml(t){ return String(t).replace(/<[^>]+>/g, ""); }

function message(C, a){
  var n = a.evenements.length;
  var fort = a.evenements.some(function(e){ return e.fort; });
  var lignes = a.evenements.map(function(e){
    return (e.fort ? "À regarder · " : "À noter · ") + sansHtml(e.txt);
  });
  lignes.push("");
  lignes.push("Depuis le " + new Date(a.T).toLocaleDateString("fr-FR", {timeZone:"UTC"}) +
              " 00:00 UTC : plus bas " + C.num(a.lo, 0) + " $, plus haut " + C.num(a.hi, 0) + " $.");
  if(a.mvrv && a.mvrv.resume) lignes.push("MVRV : " + a.mvrv.resume + ".");
  if(a.evenements.some(function(e){ return /^SWING/.test(e.txt); }))
    lignes.push("Palier swing = action candidate : le gate de confirmation n'est pas lisible depuis GitHub.");
  lignes.push("Ouvre le cockpit pour le tableau complet, avec tes invalidations.");
  return { titre: "BTC " + C.num(a.apres.px, 0) + " $ — " + n + (n > 1 ? " changements" : " changement"),
           corps: lignes.join("\n"), priorite: fort ? 4 : 3 };
}

function envoyer(topic, m){
  return fetch(NTFY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic: topic, title: m.titre, message: m.corps, priority: m.priorite,
                           click: COCKPIT, tags: ["chart_with_upwards_trend"] }),
    signal: AbortSignal.timeout(20000)
  }).then(function(r){ if(!r.ok) throw new Error("ntfy a répondu HTTP " + r.status); });
}

function principal(){
  var topic = process.env.NTFY_TOPIC || "";
  var essai = process.env.ESSAI === "true";
  var lundi = new Date().getUTCDay() === 1;
  var C = sandbox.load("index.html");
  return telecharger(C).then(function(brut){
    var a = analyser(C, brut, Date.now());
    var mvLigne = a.mvrv && a.mvrv.resume ? "\nMVRV : " + a.mvrv.resume + "." : "";
    console.log("Prix " + C.num(a.apres.px, 0) + " $ · régime 1 J " + a.apres.reg.d1 +
                " · 1 S " + a.apres.reg.w1 + " · score swing " + C.num(a.apres.sw.score, 2) +
                (a.mvrv && a.mvrv.resume ? " · MVRV " + a.mvrv.resume : "") +
                " · " + a.evenements.length + " changement(s)");
    var m = null;
    if(a.evenements.length) m = message(C, a);
    else if(essai) m = { titre: "BTC — essai du robot", priorite: 2,
      corps: "Le robot fonctionne. Rien de notable depuis la dernière clôture." + mvLigne + "\nNotification d'essai, demandée à la main." };
    else if(lundi) m = { titre: "BTC — robot en service", priorite: 2,
      corps: "Le robot tourne toujours. Rien de notable aujourd'hui." + mvLigne + "\nSi ce message manque un lundi, le robot est arrêté : son silence ne veut alors plus rien dire." };
    if(!m){ console.log("Rien de notable : aucune notification envoyée."); return; }
    console.log("--- notification ---\n" + m.titre + "\n" + m.corps);
    if(!topic){ console.log("ESSAI À BLANC : secret NTFY_TOPIC absent, rien n'a été envoyé."); return; }
    return envoyer(topic, m).then(function(){ console.log("Notification envoyée."); });
  }).catch(function(e){
    console.log("ÉCHEC : " + e.message);
    process.exitCode = 1;
    if(topic) return envoyer(topic, { titre: "BTC — robot en panne", priorite: 3,
      corps: "Le calcul d'aujourd'hui a échoué : " + e.message + "\nAucune alerte n'a pu être vérifiée. Ouvre le cockpit." })
      .catch(function(){});
  });
}

if(require.main === module) principal();
module.exports = { analyser: analyser, message: message, veille: veille, etat: etat, etatMvrv: etatMvrv, sansHtml: sansHtml };

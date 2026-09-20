/* Robot d'alerte quotidien — volet B des alertes.

   Il tourne sur un serveur GitHub (GitHub Actions), une fois par jour peu après la
   clôture journalière de 00:00 UTC. Il ne recopie AUCUNE formule : il charge la
   vraie page index.html (via tests/sandbox.js) et fait tourner ses fonctions,
   exactement comme le cockpit dans ton navigateur.

   CE QU'IL ENVOIE, depuis le 20 septembre 2026 :
   - en semaine, une notification UNIQUEMENT s'il y a au moins un événement
     « à regarder » ;
   - chaque lundi, un point de la semaine : tout ce qui a changé depuis sept
     clôtures, même les « à noter ». C'est aussi lui qui prouve que le robot tourne.
   Mesuré sur trois ans de bougies réelles rejouées : la politique d'avant alertait
   63 % des jours (18,5 par mois, jusqu'à 24 jours d'affilée), ce qui vidait de son
   sens le silence du robot. Avec les filtres ci-dessous : environ 4 notifications
   par mois, plus le point du lundi.

   FILTRES (ils ne touchent ni au cockpit, ni aux règles de décision) :
   - un support ou une résistance n'est « cassé » que si la CLÔTURE journalière est
     au-delà de MARGE_NIVEAU ; une mèche ne suffit plus ;
   - un changement de palier SWING n'est signalé que s'il devient actionnable :
     passer d'un « Rien » à un autre n'intéresse personne ;
   - un changement de régime n'est signalé qu'une fois TENU (suiteConfirmee, la
     fonction que la page utilise déjà pour les bandes MVRV).

   Ce qu'il NE PEUT PAS voir, et ne signale donc jamais :
   - funding, open interest, long/short : Binance bloque ses API dérivés depuis les
     États-Unis, où sont les serveurs GitHub (HTTP 451, vérifié le 11/09/2026).
     Le gate de confirmation n'est pas lisible : un palier swing signalé est une
     action CANDIDATE, pas la décision complète du cockpit ;
   - ta position, tes relevés manuels, tes invalidations : ils n'existent que dans
     ton navigateur. D'où : aucune alerte de palier POSITION, donc jamais d'alerte
     de vente. Un changement de bande MVRV est un fait de marché, pas un palier. */
"use strict";
var path = require("path");
var sandbox = require(path.join(__dirname, "..", "tests", "sandbox.js"));

var MIROIR  = "https://data-api.binance.vision";   /* seul accès Binance ouvert depuis les États-Unis */
var FNG     = "https://api.alternative.me/fng/?limit=31";
var NTFY    = "https://ntfy.sh/";
var COCKPIT = "https://ataqc.github.io/BTC-Cockpit/";
var JOUR    = 86400000;

var MARGE_NIVEAU  = 0.02;   /* clôture au-delà du niveau : 2 % */
var TENUE_REGIME  = 7;      /* clôtures journalières avant d'annoncer un régime 1 J */
var TENUE_REGIME_W = 2;     /* clôtures hebdomadaires pour le régime 1 S */
var FENETRE_HEBDO = 7;      /* jours couverts par le point du lundi */

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
  s.po.tier = null;   /* jamais d'alerte POSITION : elle dépend du gate et de ta position */
  s.inv = null;       /* tes invalidations vivent dans ton navigateur */
  s.stale = null;     /* tes relevés manuels aussi */
  return s;
}

/* État à n clôtures journalières en arrière : on retire les n dernières bougies
   journalières et tout ce qui a été clôturé depuis l'ouverture de la première
   retirée. Le prix d'alors est sa clôture. n = 1 : la veille. */
function reculer(d, n){
  var kd = d.kd.slice(0, -n);
  if(kd.length < 2) throw new Error("historique journalier insuffisant");
  var T = d.kd[d.kd.length - n][0];
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
      fng: (d.fng && d.fng.data) ? { data: d.fng.data.slice(n) } : d.fng
    }
  };
}

/* Régimes des dernières clôtures, calculés avec la fonction du cockpit, puis
   changement CONFIRMÉ (suiteConfirmee) : un régime qui n'a pas tenu n'est pas
   atteint, donc une oscillation ne réveille personne. */
function regimeConfirme(C, klines, tenue, combien){
  var cl = klines.map(function(k){ return parseFloat(k[4]); });
  var labels = [], debut = Math.max(61, cl.length - combien);
  for(var i = debut; i <= cl.length; i++) labels.push(C.regimeOf(cl.slice(0, i)).label);
  return C.suiteConfirmee(labels, tenue);
}

/* Les événements d'une journée, filtrés. Les niveaux sont comparés à la CLÔTURE
   élargie de MARGE_NIVEAU : une mèche ne casse plus rien. */
function evenementsJour(C, avant, apres, cloture, regimes){
  var ev = C.visitEvents(avant, apres, cloture * (1 + MARGE_NIVEAU), cloture * (1 - MARGE_NIVEAU))
    .filter(function(e){
      if(/^Régime/.test(e.txt)) return false;               /* remplacé par le régime confirmé */
      if(/^SWING/.test(e.txt))
        return apres.sw.tier !== null && apres.sw.tier !== undefined && C.TIERS[apres.sw.tier].dir !== "hold";
      return true;
    });
  regimes.forEach(function(r){ ev.push(r); });
  return ev;
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

function trier(ev){ return ev.sort(function(a, b){ return (b.fort ? 1 : 0) - (a.fort ? 1 : 0); }); }

function analyser(C, brut, maintenant){
  var d = { tick: brut.tick, fng: brut.fng,
            k4: C.closedOnly(brut.k4), kd: C.closedOnly(brut.kd), kw: C.closedOnly(brut.kw) };
  if(d.kd.length < 212 + FENETRE_HEBDO) throw new Error("historique journalier insuffisant (" + d.kd.length + " bougies)");
  var v = reculer(d, 1), s = reculer(d, FENETRE_HEBDO);
  var avant = etat(C, v.donnees, v.T);
  var avantSemaine = etat(C, s.donnees, s.T);
  var apres = etat(C, d, maintenant);
  if(!avant || !avantSemaine || !apres) throw new Error("verdict non calculable sur ces données");

  var cloture = parseFloat(d.kd[d.kd.length-1][4]);
  var regimes = [];
  [["1 J", d.kd, TENUE_REGIME], ["1 S", d.kw, TENUE_REGIME_W]].forEach(function(u){
    var ch = regimeConfirme(C, u[1], u[2], 40);
    if(ch) regimes.push({ fort:false, txt:"Régime " + u[0] + " : " + ch.avant + " → <b>" + ch.apres +
      "</b>, tenu " + u[2] + (u[0] === "1 J" ? " clôtures" : " semaines") });
  });

  var mv = etatMvrv(C, brut.cm, maintenant);
  var ev = evenementsJour(C, avant, apres, cloture, regimes);
  if(mv.evenement) ev.push(mv.evenement);

  /* le point du lundi compare l'état d'aujourd'hui à celui d'il y a sept clôtures :
     aucune mémoire d'un passage à l'autre, tout est recalculé */
  var evS = C.visitEvents(avantSemaine, apres, cloture * (1 + MARGE_NIVEAU), cloture * (1 - MARGE_NIVEAU));
  if(mv.evenement) evS.push(mv.evenement);

  var r = C.visitRange(v.T);          /* le cockpit contient maintenant l'état du jour */
  var rS = C.visitRange(s.T);
  return { T: v.T, TS: s.T, avant: avant, apres: apres, lo: r.lo, hi: r.hi, loS: rS.lo, hiS: rS.hi,
           evenements: trier(ev), semaine: trier(evS), mvrv: mv, cloture: cloture };
}

function sansHtml(t){ return String(t).replace(/<[^>]+>/g, ""); }

function lignes(C, ev, mvrv){
  var out = ev.map(function(e){ return (e.fort ? "À regarder · " : "À noter · ") + sansHtml(e.txt); });
  if(mvrv && mvrv.resume) out.push("MVRV : " + mvrv.resume + ".");
  if(ev.some(function(e){ return /^SWING/.test(e.txt); }))
    out.push("Palier swing = action candidate : le gate de confirmation n'est pas lisible depuis GitHub.");
  return out;
}

function message(C, a){
  var n = a.evenements.length;
  var corps = lignes(C, a.evenements, a.mvrv);
  corps.splice(n, 0, "", "Depuis le " + new Date(a.T).toLocaleDateString("fr-FR", {timeZone:"UTC"}) +
    " 00:00 UTC : plus bas " + C.num(a.lo, 0) + " $, plus haut " + C.num(a.hi, 0) + " $.");
  corps.push("Ouvre le cockpit pour le tableau complet, avec tes invalidations.");
  return { titre: "BTC " + C.num(a.apres.px, 0) + " $ — " + n + (n > 1 ? " changements" : " changement"),
           corps: corps.join("\n"), priorite: a.evenements.some(function(e){ return e.fort; }) ? 4 : 3 };
}

/* Point du lundi : tout ce qui a changé depuis sept clôtures, « à noter » compris.
   C'est aussi la preuve que le robot tourne : s'il manque un lundi, il est arrêté. */
function messageSemaine(C, a){
  var corps = a.semaine.length ? lignes(C, a.semaine, a.mvrv)
            : ["Rien de notable cette semaine."].concat(a.mvrv && a.mvrv.resume ? ["MVRV : " + a.mvrv.resume + "."] : []);
  corps.push("");
  corps.push("Depuis le " + new Date(a.TS).toLocaleDateString("fr-FR", {timeZone:"UTC"}) +
             " : plus bas " + C.num(a.loS, 0) + " $, plus haut " + C.num(a.hiS, 0) + " $.");
  corps.push("Si ce message manque un lundi, le robot est arrêté : son silence ne veut alors plus rien dire.");
  return { titre: "BTC " + C.num(a.apres.px, 0) + " $ — point de la semaine" +
                  (a.semaine.length ? " (" + a.semaine.length + ")" : ""),
           corps: corps.join("\n"),
           priorite: a.semaine.some(function(e){ return e.fort; }) ? 4 : 2 };
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

/* Ce que le robot enverrait aujourd'hui : le point du lundi, sinon une alerte
   seulement s'il y a au moins un « à regarder », sinon rien. */
function aEnvoyer(C, a, lundi, essai){
  if(lundi) return messageSemaine(C, a);
  if(a.evenements.some(function(e){ return e.fort; })) return message(C, a);
  if(essai) return { titre: "BTC — essai du robot", priorite: 2,
    corps: "Le robot fonctionne. Rien à regarder aujourd'hui." +
           (a.mvrv && a.mvrv.resume ? "\nMVRV : " + a.mvrv.resume + "." : "") +
           (a.evenements.length ? "\n" + a.evenements.length + " changement(s) « à noter » : ils partiront dans le point du lundi." : "") +
           "\nNotification d'essai, demandée à la main." };
  return null;
}

function principal(){
  var topic = process.env.NTFY_TOPIC || "";
  var essai = process.env.ESSAI === "true";
  var lundi = new Date().getUTCDay() === 1;
  var C = sandbox.load("index.html");
  return telecharger(C).then(function(brut){
    var a = analyser(C, brut, Date.now());
    console.log("Prix " + C.num(a.apres.px, 0) + " $ · régime 1 J " + a.apres.reg.d1 +
                " · 1 S " + a.apres.reg.w1 + " · score swing " + C.num(a.apres.sw.score, 2) +
                (a.mvrv && a.mvrv.resume ? " · MVRV " + a.mvrv.resume : "") +
                " · " + a.evenements.length + " changement(s) du jour, " + a.semaine.length + " sur la semaine");
    var m = aEnvoyer(C, a, lundi, essai);
    if(!m){ console.log("Rien à regarder aujourd'hui : aucune notification envoyée."); return; }
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
module.exports = { analyser: analyser, message: message, messageSemaine: messageSemaine, aEnvoyer: aEnvoyer,
                   reculer: reculer, etat: etat, etatMvrv: etatMvrv, regimeConfirme: regimeConfirme,
                   evenementsJour: evenementsJour, sansHtml: sansHtml,
                   MARGE_NIVEAU: MARGE_NIVEAU, TENUE_REGIME: TENUE_REGIME,
                   TENUE_REGIME_W: TENUE_REGIME_W, FENETRE_HEBDO: FENETRE_HEBDO };

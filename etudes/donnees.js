/* Téléchargements partagés par les études de etudes/.
   Aucune règle, aucun calcul de décision ici : seulement du réseau et un cache.
   Les fichiers sont gardés dans etudes/.cache, ignoré par git : un second
   lancement ne retélécharge rien. Supprime ce dossier pour repartir à neuf. */
"use strict";
const fs = require("fs");
const path = require("path");

const CACHE = path.join(__dirname, ".cache");
const JOUR = 86400000;

async function json(url){
  const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if(!r.ok) throw new Error("HTTP " + r.status + " sur " + url.split("?")[0]);
  return r.json();
}
const dodo = ms => new Promise(s => setTimeout(s, ms));

async function cache(nom, charge){
  const f = path.join(CACHE, nom + ".json");
  if(fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
  if(!fs.existsSync(CACHE)) fs.mkdirSync(CACHE, { recursive: true });
  process.stdout.write("téléchargement de " + nom + "… ");
  const d = await charge();
  fs.writeFileSync(f, JSON.stringify(d));
  console.log("fait");
  return d;
}

/* Bougies journalières Binance — miroir ouvert depuis partout. */
const binance1d = () => cache("binance-1d", async () => {
  let out = [], t = Date.UTC(2017, 0, 1);
  for(;;){
    const k = await json("https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT" +
                         "&interval=1d&limit=1000&startTime=" + t);
    if(!k.length) break;
    out = out.concat(k);
    if(k.length < 1000) break;
    t = k[k.length - 1][0] + JOUR;
    await dodo(200);
  }
  return out;
});

/* Funding toutes les 8 heures. fapi.binance.com est bloqué depuis les serveurs
   GitHub (HTTP 451) mais répond depuis une machine en Europe : ces études
   tournent en local, jamais dans la tâche planifiée. */
const funding = () => cache("funding", async () => {
  let out = [], t = Date.UTC(2019, 0, 1);
  for(;;){
    const f = await json("https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT" +
                         "&limit=1000&startTime=" + t);
    if(!f.length) break;
    out = out.concat(f.map(x => [x.fundingTime, x.fundingRate]));
    if(f.length < 1000) break;
    t = f[f.length - 1].fundingTime + 1;
    await dodo(200);
  }
  return out;
});

const fng = () => cache("fng", async () =>
  (await json("https://api.alternative.me/fng/?limit=0&format=json")).data
    .map(x => [Number(x.timestamp) * 1000, Number(x.value)]));

/* Clôtures quotidiennes Coinbase BTC-USD, 300 jours par appel. */
const coinbase1d = () => cache("coinbase-1d", async () => {
  const out = {};
  let debut = new Date(Date.UTC(2015, 0, 1));
  const fin = new Date();
  while(debut < fin){
    const bout = new Date(Math.min(fin.getTime(), debut.getTime() + 299 * JOUR));
    const j = await json("https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400" +
                         "&start=" + debut.toISOString() + "&end=" + bout.toISOString());
    j.forEach(c => { out[c[0] * 1000] = c[4]; });
    debut = new Date(bout.getTime() + JOUR);
    await dodo(350);
  }
  return out;
});

/* Historique quotidien Coin Metrics : prix de référence, capitalisation, ratio
   MVRV et flux des plateformes. Gratuit, sans clé, licence CC BY-NC 4.0. */
const coinmetrics = () => cache("coinmetrics", async () => {
  let out = [], url = "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc" +
    "&metrics=PriceUSD,CapMrktCurUSD,CapMVRVCur,FlowInExNtv,FlowOutExNtv" +
    "&frequency=1d&start_time=2010-01-01&paging_from=start&page_size=10000";
  for(let p = 0; url && p < 20; p++){
    const j = await json(url);
    out = out.concat(j.data || []);
    url = j.next_page_url;
  }
  return out;
});

module.exports = { JOUR, cache, json, binance1d, funding, fng, coinbase1d, coinmetrics,
  jourDe: t => Math.floor(t / JOUR) * JOUR,
  iso: t => new Date(t).toISOString().slice(0, 10) };

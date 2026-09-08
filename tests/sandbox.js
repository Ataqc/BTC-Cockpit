/* Charge le <script> d'une page du cockpit dans un bac à sable Node, avec un DOM
   minimal simulé. Aucune dépendance : ce fichier doit tourner sur un Node nu.
   Objectif : pouvoir appeler les vraies fonctions des vraies pages, sans copier
   une seule ligne de calcul dans les tests — un test qui recopie la formule
   qu'il vérifie ne vérifie rien. */
var fs = require("fs");
var path = require("path");
var vm = require("vm");

function fakeEl(id){
  return {
    id: id, value: "", textContent: "", innerHTML: "",
    style: {}, dataset: {},
    classList: { add:function(){}, remove:function(){}, toggle:function(){}, contains:function(){ return false; } },
    addEventListener: function(){}, removeEventListener: function(){},
    setAttribute: function(){}, removeAttribute: function(){}, getAttribute: function(){ return null; },
    appendChild: function(){}, select: function(){}, focus: function(){},
    querySelector: function(){ return null; },
    querySelectorAll: function(){ return []; }
  };
}

/* Renvoie le contexte global du script, d'où l'on peut lire toutes ses fonctions. */
function load(file){
  var html = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  var m = html.match(/<script>([\s\S]*?)<\/script>/);
  if(!m) throw new Error("aucun <script> inline trouvé dans " + file);

  var els = {};
  var store = {};
  var ctx = {
    console: console,
    Date: Date, Math: Math, JSON: JSON, Number: Number, String: String,
    Array: Array, Object: Object, RegExp: RegExp, Promise: Promise, Error: Error,
    isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat,
    AbortController: AbortController,
    setTimeout: function(){ return 0; }, clearTimeout: function(){},
    setInterval: function(){ return 0; }, clearInterval: function(){},
    /* le réseau ne répond jamais : on teste les calculs, pas Binance */
    fetch: function(){ return new Promise(function(){}); },
    navigator: { clipboard: null },
    location: { href: "", protocol: "https:" },
    localStorage: {
      getItem: function(k){ return Object.prototype.hasOwnProperty.call(store,k) ? store[k] : null; },
      setItem: function(k,v){ store[k] = String(v); },
      removeItem: function(k){ delete store[k]; },
      clear: function(){ store = {}; }
    },
    document: {
      getElementById: function(id){ return els[id] || (els[id] = fakeEl(id)); },
      querySelector: function(){ return null; },
      querySelectorAll: function(){ return []; },
      addEventListener: function(){}, execCommand: function(){ return false; },
      createElement: function(t){ return fakeEl(t); },
      body: fakeEl("body")
    }
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(m[1], ctx, { filename: file });
  ctx.__els = els;
  ctx.__set = function(id, v){ ctx.document.getElementById(id).value = v; };
  return ctx;
}

module.exports = { load: load };

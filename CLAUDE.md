# BTC Cockpit — briefing projet

Ce fichier est lu automatiquement au début de chaque session. Il contient tout ce
qu'il faut savoir pour travailler sur ce projet sans rien redemander.

---

## 1. Avec qui tu travailles

- **L'utilisateur ne code pas** et ne veut pas apprendre. Il comprend parfaitement la logique, les process et la qualité — mais
  pas la syntaxe.
- **Réponds en français.**
- **Jamais de terminal pour lui.** Tout livrable doit s'utiliser au double-clic ou
  depuis une adresse web. Si une étape exige une commande, c'est toi qui la fais.
- Il préfère le **langage technique direct**, sans remplissage, et des livrables
  **utilisables sans retouche**.
- Explique les concepts, pas le code. « Le RSI est calculé sur les bougies
  clôturées uniquement » lui parle ; `rsiSeries(closes, 14)` non.

---

## 2. Ce qu'est ce projet

Un système d'aide à la décision pour gérer une position **Bitcoin au comptant**.

Il est fait de deux moitiés qui ne doivent jamais être confondues :

| Moitié | Rôle | Où |
|---|---|---|
| **Le cockpit** (`index.html`) | Récupère les données et calcule **tout ce qui est calculable** | ce dépôt |
| **Le prompt d'analyse** (`prompt-analyse-v3.md`) | Fait **lire** ce résultat à une IA, qui interprète, conteste et formule | ce dépôt |

Le **backtest** n'est pas une troisième moitié : c'est un **onglet** du cockpit,
dans la même page (`index.html#backtest`), qui rejoue les mêmes formules sur
l'historique. `backtest.html` ne fait plus que rediriger les anciens favoris.

**Le principe fondateur, à ne jamais casser :**
> Le code pour ce qui doit être constant et reproductible.
> L'IA pour ce qui demande du jugement.

Un LLM n'a pas de source de vérité numérique et n'est pas reproductible : le même
prompt deux fois peut donner deux RSI différents. Tout ce qui est calculable a donc
été sorti du prompt et mis dans le code. Ce qui reste à l'IA — contester le régime,
apporter les catalyseurs macro, arbitrer entre horizons, formuler l'invalidation —
est précisément ce qu'une formule ne sait pas faire.

**Si tu ajoutes une fonctionnalité, demande-toi d'abord de quel côté de cette
ligne elle tombe.**

---

## 3. Cadre de trading — non négociable

- **Spot uniquement.** Aucun levier, jamais de futures ni de perpétuels.
- Les dérivés (open interest, funding, long/short) servent **uniquement à lire le
  risque** de retournement ou de squeeze. Jamais à générer un signal seuls.
- **Deux horizons, jamais mélangés :**
  - SWING : 3 à 15 jours, lecture 4H et 1D
  - POSITION : 1 à 6 mois, lecture 1D et 1W
- **Biais par défaut : ne rien faire.** L'outil ne doit pas chercher une action
  chaque jour.
- L'utilisateur détient déjà du BTC. La question par défaut est la **gestion d'une
  position existante**, pas une entrée initiale.
- **L'outil propose, l'utilisateur décide.** Ne jamais rédiger de conseil
  d'investissement personnalisé, ni dans l'interface ni dans une réponse.

---

## 4. Contraintes techniques dures

- **Un fichier = une page autonome.** Tout est inline : CSS, JavaScript, aucune
  dépendance, **aucun CDN**. La page doit fonctionner telle quelle dans dix ans.
- **Aucune clé d'API, aucun abonnement payant.** Uniquement des sources gratuites
  et sans authentification.
- **JavaScript vanilla, compatible ES5.** Pas de framework, pas de build, pas de
  `npm install`. L'utilisateur ne peut rien compiler.
- **Le dépôt est PUBLIC.** Aucune donnée personnelle ne doit entrer dans un
  fichier. Tout ce qu'il saisit (position, PRU, cash, MVRV, historique) vit
  en `localStorage`, sur son appareil, et n'est jamais écrit dans le code.
- Toute lecture/écriture `localStorage` est enveloppée dans un `try/catch` : elle
  peut échouer (navigation privée, réglages).
- **Hébergement :** GitHub Pages, https://ataqc.github.io/BTC-Cockpit/
  Attention à la casse du chemin (`BTC-Cockpit`). Le backtest est à la même
  adresse, onglet `#backtest` — une seule URL à retenir.
- **Affichage : rien ne dépasse jamais le bord d'une carte**, à aucune largeur.
  Une étiquette longue se replie sur elle-même, une valeur composée se replie entre
  ses segments « · », une grille ne réclame jamais plus que la largeur de l'écran,
  et un contenu imprévu défile *dans* sa carte au lieu d'en sortir. La page est
  aussi consultée sur iPhone.
- `localStorage` est **par appareil** : ce qu'il saisit sur l'ordinateur
  n'apparaît pas sur son iPhone. C'est connu et accepté.

---

## 5. Sources de données

Toutes gratuites, sans clé, appelées directement depuis le navigateur.

| Donnée | Source | Fraîcheur |
|---|---|---|
| Prix, bougies 4H / 1D / 1W | `api.binance.com` | temps réel |
| Funding, open interest, long/short | `fapi.binance.com` | temps réel |
| Fear & Greed | `api.alternative.me` | quotidienne |
| MVRV Z-score, prix réalisé, flux ETF, réserves exchanges, Coinbase premium | **saisie manuelle** | hebdomadaire |
| Liquidations 24 h | **aucune** — reste N/D | — |

Les cinq métriques manuelles n'ont **aucune API gratuite**. Des liens vers les
dashboards publics (bitbo, lookintobitcoin, Farside, CryptoQuant) sont dans la
page. C'est un choix assumé après avoir chiffré les alternatives payantes :
Glassnode Studio à 49 $/mois n'inclut même pas l'accès API, et les offres avec
API sont hors de proportion pour une position individuelle.

**Miroirs Binance** : `api1.binance.com` et `data-api.binance.vision` sont
utilisés en repli automatique si le principal échoue.

---

## 6. Ce que le cockpit calcule

- **RSI(14)** en 4H / 1D / 1W, avec la pente sur 5 bougies
- **MACD(12,26,9)** en 4H / 1D
- **EMA 20 / 50 / 200** journalières
- **Volume** rapporté à sa moyenne 20 périodes
- **Régime de marché** (voir §8)
- **Divergences RSI/prix** sur les 2 derniers sommets ou creux confirmés
- **Supports et résistances** : sommets et creux réellement touchés sur 200 jours,
  regroupés à moins de 0,8 %
- **Scores** swing et position (voir §7)
- **Chaîne de décision** complète (voir §9)
- **Historique des analyses** avec vérification de l'invalidation sur bougies réelles
- **Bilan « depuis ta dernière visite »**, en tête du cockpit (voir ci-dessous)

**Bilan « depuis ta dernière visite »** — volet A des alertes. Il compare ce que
le cockpit affiche à ce qu'il affichait lors de la visite précédente **sur cet
appareil**, et ne signale que ce qui a changé : palier POSITION ou SWING, régime
1 J ou 1 S, nouvelle divergence confirmée, franchissement de l'EMA 200, cassure du
support ou de la résistance les plus proches d'alors, invalidation touchée,
relevé manuel devenu périmé. Si rien ne bouge, il le dit en une ligne : c'est la
réponse normale. Il **rapporte**, il ne décide rien.
- « À regarder » : palier qui devient une action, nouvelle divergence, niveau
  cassé, invalidation touchée. « À noter » : le reste.
- Référence en `localStorage` (`btc_visit`). Pendant une même visite, la référence
  est figée en `sessionStorage` : actualiser ne fait pas disparaître un changement
  pas encore lu.
- Données non chargées : rien n'est enregistré. Un état vide ne doit jamais
  devenir la référence de la visite suivante.
- Mémoire du navigateur bloquée (navigation privée, réglages) : le bilan le dit
  franchement, au lieu d'afficher « première visite enregistrée » à chaque fois.
- Une valeur N/D d'un côté ou de l'autre ne produit **jamais** d'événement. Une
  divergence n'est « nouvelle » que si on connaissait l'état précédent.
- Plus bas / plus haut depuis la visite : uniquement les bougies 4 H **ouvertes
  après** la visite, plus le prix actuel. Mieux vaut rater quelques heures que
  sonner à tort.

**Règle absolue : tous les indicateurs sont calculés uniquement sur bougies
CLÔTURÉES.** Binance renvoie la bougie en cours en dernier ; elle est filtrée par
comparaison de son `closeTime` à l'heure actuelle. L'état de clôture est recalculé
depuis l'heure UTC réelle (journalière à 00:00 UTC, hebdomadaire le lundi 00:00
UTC), jamais déduit d'une source.

---

## 7. Les scores

Échelle unique : **0 = forte survente · 5 = neutre · 10 = fort surachat.**

**SCORE TECHNIQUE SWING**
| Composante | Poids |
|---|---|
| RSI 4H + 1D | 50 % |
| MACD 4H + 1D | 30 % |
| Structure vs EMA 20/50 | 20 % |

**SCORE TECHNIQUE POSITION**
| Composante | Poids |
|---|---|
| RSI 1D + 1W | 35 % |
| Structure vs EMA 50/200 | 25 % |
| MVRV Z-score | 40 % |

Conversions :
- **RSI** → `RSI / 10`, borné 0-10. Simple et cohérent avec les paliers d'action.
- **MACD** → rang percentile de l'histogramme sur les 200 bougies précédentes.
  Auto-calibrant : aucune constante arbitraire, valable à tous les niveaux de prix.
- **Structure** → rang percentile de l'écart prix/EMA sur 200 bougies. Une tendance
  régulière n'est pas « étendue » par rapport à elle-même — c'est voulu.
- **MVRV** → interpolation linéaire par morceaux sur les bandes du §8.

**Agrégation de deux unités de temps** : moyenne simple, **sauf** si l'écart
dépasse 3 points — dans ce cas pas de moyenne silencieuse : on signale la
divergence et on retient la lecture **la plus lente** (1D prime sur 4H, 1W sur 1D).

**Péremption** : les métriques manuelles portent une date de relevé. Au-delà de
`MANUAL_MAX_AGE` (10 jours), ou sans date exploitable, elles sont traitées
**exactement comme si elles étaient vides**. Une donnée de trois semaines n'est
pas une donnée : c'est une valeur par défaut qui agit en silence. La date se
remplit automatiquement à la première saisie et reste modifiable.

**Composante N/D** (absente **ou périmée**) : exclue, poids restants renormalisés, et **c'est dit**
explicitement dans l'interface et dans le bloc généré. Cas fréquent : le MVRV vide
fait tomber le score position sur 60 % du barème seulement.

---

## 8. Seuils de référence

**Ces valeurs sont des conventions de place, pas des vérités.** Ne les change pas
sans le dire explicitement à l'utilisateur.

**Elles ont été confrontées aux données réelles le 8 septembre 2026 — voir §14.**
La table score → action n'en est pas sortie indemne : son côté **vente** détruit de
la valeur sur les deux périodes testées. **Décision prise le 8 septembre 2026 : les
paliers de vente ne s'appliquent plus à l'horizon SWING** (voir §9, étape 2). Les
seuils eux-mêmes sont **inchangés** : le balayage montre qu'un décalage de ±1 point
fait varier le résultat 5 ans de +40 % à +63 %, donc tout « optimum » lu dans ces
chiffres serait du bruit ajusté. Toute session qui travaille sur ces seuils doit
lire le §14 avant de proposer quoi que ce soit.

| Indicateur | Bandes |
|---|---|
| RSI(14) | < 30 survente · 30-40 zone basse · 40-60 neutre · 60-70 zone haute · > 70 surachat · > 80 ou < 20 extrême |
| Funding (8 h) | neutre ±0,01 % · notable au-delà de ±0,02 % · extrême au-delà de ±0,05 % |
| Variation OI 24 h | notable > 5 % · forte > 10 % |
| OI / market cap | faible < 1,5 % · modéré 1,5-3 % · élevé > 3 % |
| Long/Short ratio | neutre 0,9-1,1 · notable < 0,7 ou > 1,4 · extrême < 0,5 ou > 2 |
| MVRV Z-score | < 0 sous-évalué · 0-2 neutre bas · 2-4 neutre haut · 4-7 surachat · > 7 sommet historique |
| Fear & Greed | < 25 peur extrême · 25-45 peur · 45-55 neutre · 55-75 avidité · > 75 avidité extrême |

**Régime de marché** — ratio d'efficience de Kaufman (trajet net ÷ chemin
parcouru), sur **deux fenêtres** :
- TENDANCE si 20 bougies **et** 60 bougies ≥ 0,35
- RANGE si les deux ≤ 0,20
- TRANSITION sinon

La double fenêtre n'est pas décorative : sur 20 bougies seules, la jambe montante
d'un range se lit comme une tendance. Le test l'a montré, la correction a été
apportée.

**Table score → action**
| Score | Action candidate |
|---|---|
| ≥ 8,5 | Vente 20-30 % des BTC détenus |
| 7,0 – 8,4 | Vente 10-15 % des BTC détenus |
| 5,5 – 6,9 | Rien |
| 3,5 – 5,4 | Rien |
| 2,0 – 3,4 | Achat 10-15 % du cash disponible |
| < 2,0 | Achat 25-35 % du cash disponible |

---

## 9. La chaîne de décision

Dans cet ordre, sans exception :

1. **Score technique** → palier candidat dans la table
2. **Retrait des ventes en SWING** — issu du backtest du 8 septembre 2026 (§14) :
   - Sur l'horizon SWING, un palier de vente est **toujours** ramené à « Rien ».
     Aucune exception : ni divergence baissière, ni MVRV extrême. Un score haut en
     swing veut dire « ne pas renforcer », jamais « vendre ».
   - Motif : sur 8 ans de bougies journalières réelles, coupées en deux périodes
     dont une jamais utilisée pour le constat, un score de vente a été suivi de
     rendements **supérieurs** à la moyenne du marché. Le score swing mesure du
     momentum, pas un essoufflement.
   - **L'horizon POSITION n'est pas concerné** : il n'a jamais été testé (pas
     d'historique MVRV gratuit) et repose sur un ancrage de valorisation, pas sur
     du momentum. La prise de profit relève donc entièrement de POSITION.
   - Si un backtest 4H ou un backtest POSITION change cette lecture, c'est ici
     qu'il faut revenir. Le test `tests/engine.test.js` échoue si la règle est
     retirée.
3. **Règle de régime** — sur l'horizon POSITION, et sur le côté achat en swing :
   - En TENDANCE, un score de vente POSITION **ne vend pas**. Il signifie « ne pas
     renforcer ». Seule une **divergence baissière confirmée sur 2 sommets**
     (≥ 5 bougies d'écart) autorise la prise de profit. *En swing la question ne se
     pose plus : l'étape 2 a déjà tout ramené à « Rien ».*
   - **Exception** : sur l'horizon POSITION, si le sous-score MVRV ≥ 8,5 (zone de
     sommet historique), la vente reste autorisée. Un extrême de valorisation est
     un signal structurel, pas un RSI tendu. *Cette exception est une décision de
     conception discutable — elle n'a pas encore été explicitement validée.* Un
     MVRV **périmé** (§7) ne peut plus la déclencher.
   - En TENDANCE baissière, un signal d'achat est réduit d'un cran : ne pas
     poursuivre une baisse en accélération. *Seule branche de la règle de régime
     encore active en swing.*
   - **Attention à la calibration** : le seuil de 0,35 exigé sur les deux fenêtres
     n'est atteint que 4,4 % des jours (§14). Cette règle ne s'applique donc
     presque jamais. Desserrer le seuil a donné un résultat **mixte** entre les
     deux périodes testées : ne pas le faire sans nouvelle validation.
4. **Gate de confirmation** — au moins **3 des 7 signaux** doivent aller dans le
   sens de l'action, sinon elle est plafonnée à « Rien ».
5. **Filtre de risque** — si les signaux contraires sont plus nombreux que les
   alignés, l'action est réduite d'un cran (jamais amplifiée).

**Les 7 signaux du gate** : momentum/volume, croisement prix/OI, funding,
long/short ratio, liquidations (toujours N/D), Fear & Greed, flux ETF/on-chain.

**Aucun de ces 7 n'entre dans le score technique.** C'est délibéré : compter la
même information deux fois — une fois dans la note, une fois dans sa confirmation —
créerait une fausse impression de convergence. Si tu ajoutes un signal, vérifie
qu'il n'est pas déjà dans le score.

Note : le signal Fear & Greed utilise la **valeur du jour** pour le swing et la
**moyenne 30 jours** pour la position. Les deux horizons peuvent donc légitimement
avoir un décompte différent — ce n'est pas un bug.

---

## 10. Le backtest (onglet `#backtest` de `index.html`)

Rejoue le score et la table d'action sur l'historique réel, et compare trois
variantes : **les règles actuelles du cockpit** (sans vente swing, achat réduit en
tendance baissière), **la grille d'origine** qui vendait sur score élevé, et **ne
rien faire**.

**Une seule copie des formules.** Jusqu'au 11 septembre 2026, `backtest.html`
contenait sa propre copie des indicateurs, et un test vérifiait que les deux copies
restaient d'accord — elles avaient déjà divergé une fois. Le backtest vit
désormais dans la même page et appelle directement les fonctions du cockpit : la
dérive est devenue impossible, et un test échoue si une seconde définition
réapparaît. L'historique n'est téléchargé que quand on lance le calcul.

**Protections contre la triche au futur — à préserver absolument :**
- Décision à la **clôture** du jour, exécution à l'**ouverture du lendemain**
- Divergences uniquement sur sommets **confirmés** (3 bougies de chaque côté) — le
  backtest n'en utilise plus depuis le retrait des ventes swing ; toute
  réintroduction doit respecter cette règle
- **Test anti-triche** : tronquer la fin de l'historique ne doit modifier aucun jour antérieur
- Percentiles calculés sur les **200 bougies précédentes** seulement
- Indicateurs causals calculés une fois sur toute la série puis lus à l'instant t
  (mathématiquement équivalent à un recalcul glissant, mais O(n) au lieu de O(n²))

**Ce qu'il ne teste pas, et pourquoi :**
- Le gate des 7 signaux — pas d'historique gratuit pour funding / OI / liquidations
- L'horizon POSITION — dépend à 40 % du MVRV, sans historique gratuit
- Il juge donc **l'horizon SWING sur bougies journalières**. C'est écrit en haut
  de la page, ne pas le masquer.

**Découverte du backtest, déjà intégrée :** la grille n'avait aucun **délai de
carence**. Tant que le score restait dans sa zone, elle redéclenchait la même
action chaque jour et vidait la position par tranches. Un paramètre réglable a été
ajouté (défaut 7 jours). Sur données de test, passer de 0 à 7 jours divisait les
transactions par trois.

---

## 11. Limites connues — à ne jamais masquer

- **Le régime est un calcul, pas une vérité.** Aucune formule ne distingue
  parfaitement une tendance d'une jambe de range. C'est précisément pourquoi le
  prompt demande à l'IA de le contester.
- **Un score affiché à deux décimales n'est pas plus juste qu'une intuition** — il
  est seulement **constant**. Le code fige les conventions, il ne les valide pas.
  Seul le backtest les valide.
- **Risque de sur-optimisation** : en ajustant les seuils jusqu'à ce que le passé
  soit parfait, on obtient un système magnifique sur l'historique et inutile
  ensuite. En cas de recalibrage, imposer une période de validation distincte de
  celle utilisée pour régler.
- Les liquidations restent N/D. Ne pas inventer de substitut.

---

## 12. Règles de travail

- **Teste avant de livrer — la suite est dans le dépôt, lance-la : `npm test`.**
  - `tests/sandbox.js` charge le `<script>` d'une page réelle dans Node avec un DOM
    minimal simulé. Les tests appellent donc les **vraies** fonctions des vraies
    pages : ne recopie jamais une formule dans un test, un test qui recopie ce
    qu'il vérifie ne vérifie rien.
  - `tests/engine.test.js` (116 vérifications, zéro dépendance) : identités
    mathématiques (moyenne mobile sur série constante = la constante, RSI sur série
    croissante = 100, décroissante = 0, plate = 50), chaîne de décision, péremption,
    **unicité des formules** (chaque indicateur défini une seule fois dans la page)
    et **mécanique du backtest** : exécution à l'ouverture du lendemain, délai de
    carence, aucune vente sous les règles actuelles, et **aucune lecture de
    l'avenir** — tronquer l'historique ne doit changer aucun jour passé. Plus le
    **bilan de visite** : aucun événement sans changement constaté des deux côtés,
    aucune répétition d'un événement déjà signalé.
  - `tests/page.test.js` (68 vérifications, `jsdom`) : charge `index.html` entière
    avec un faux réseau et vérifie le rendu, les scores, le bloc généré, la
    péremption, la bascule des onglets (par clic et par adresse), un backtest
    complet, le bilan de visite (référence conservée pendant la visite, jamais
    écrasée si les données manquent) et l'absence d'erreur JavaScript.
  - `tests/robot.test.js` (17 vérifications, zéro dépendance) : période comparée
    par le robot d'alerte, bougie en cours écartée, aucun palier POSITION ni
    aucune vente, alerte réelle sur une chute synthétique, notification sans
    balise HTML, échec franc si l'historique est trop court.
  - **Ce que les tests ne voient pas : la mise en page.** jsdom ne calcule aucune
    largeur. Toute modification d'affichage se vérifie dans un vrai navigateur à
    **390, 768, 1024 et 1280 px** : aucun tableau ne doit dépasser de sa carte, et
    la page ne doit jamais défiler horizontalement.
  - GitHub Actions relance tout à chaque push : pastille verte ou rouge en haut du
    `README`. C'est le seul signal de santé lisible sans terminal —
    **ne le laisse jamais rouge**.
  - Quand tu ajoutes une règle, ajoute le test qui échoue si on la retire. Vérifie
    que le test mord vraiment : casse la règle exprès, la suite doit rougir.
- **Ne fabrique jamais un chiffre de marché.** Si tu testes avec des données
  synthétiques, dis-le explicitement — un résultat obtenu sur une série inventée
  ne dit rien du vrai Bitcoin.
- **N'ajoute jamais de dépendance externe dans la page.** `index.html` doit
  rester autonome, ouvrable au double-clic dans dix ans.
  `jsdom` est une dépendance de *test* uniquement : elle ne doit jamais être
  nécessaire au fonctionnement d'une page.
- **Interface en français**, avec une explication courte sous chaque bloc pour un
  lecteur non technique.
- Quand une donnée manque, elle vaut **N/D**. Jamais d'estimation, jamais de
  valeur par défaut silencieuse.
- Si une modification change une règle de décision, **dis-le à l'utilisateur et explique
  ce que ça change**, plutôt que de l'appliquer discrètement.

---

## 13. État d'avancement

**Fait :**
- Cockpit complet : données, indicateurs, régime, divergences, niveaux, scores,
  chaîne de décision, historique des analyses
- Prompt d'analyse V3, aligné sur le cockpit
- Backtest fonctionnel avec délai de carence
- Hébergement GitHub Pages, vérifié en fonctionnement sur données réelles
- Péremption des métriques manuelles (§7), tests automatisés dans le dépôt (§12)
- **Backtest réel exécuté** le 8 septembre 2026 — voir §14
- **Backtest fusionné dans le cockpit** le 11 septembre 2026 : une seule adresse,
  deux onglets, une seule copie des formules (§10). Débordements de tableaux
  corrigés à toutes les largeurs d'écran (§4)
- **Robot d'alerte quotidien** le 11 septembre 2026 — volet B des alertes (§15)
- **Bilan « depuis ta dernière visite »** le 11 septembre 2026 — volet A des
  alertes (§6)

---

## 14. Résultats du backtest réel (8 septembre 2026)

Exécuté sur les **vraies** bougies journalières Binance BTCUSDT, 2999 jours
(23/06/2018 → 07/09/2026), en deux périodes : **2021-2026** (où le constat a été
fait) et **2018-2021** (période de validation, non utilisée pour le découvrir).
Frais 0,1 %, carence 7 jours, départ 70 % BTC. Horizon SWING journalier seulement.

**Constat central — la moitié VENTE de la table du §8 détruit de la valeur, sur
les deux périodes :**

| Variante | 2018-2021 | 2021-2026 |
|---|---|---|
| Grille complète | +228,6 % | +41,4 % |
| Grille sans le côté vente (achats seuls) | +893,2 % | +79,8 % |
| Ne rien faire (70/30 conservé) | +767,5 % | +51,2 % |
| Ne rien faire (100 % BTC conservé) | +1096,5 % | +73,2 % |

**Pourquoi** : la prémisse contrarienne du score est inversée sur le BTC
journalier. Rendement moyen des 15 jours **suivants**, par tranche de RSI :

| Période | RSI < 30 | 40-60 | 60-70 | 70-80 | RSI > 80 |
|---|---|---|---|---|---|
| 2018-2021 | +5,1 % | +3,9 % | +9,2 % | +10,9 % | +6,7 % |
| 2021-2026 | +1,7 % | +0,6 % | +0,6 % | +5,2 % | +6,0 % |

Un RSI élevé est suivi de rendements **au-dessus** de la moyenne, pas en dessous.
Le score mesure du momentum ; la table l'utilise comme un signal de retournement.
*(Fenêtres de 15 jours qui se chevauchent : on lit un sens, pas une
significativité statistique.)*

**Trois autres résultats :**
- **Le côté achat n'ajoute rien de fiable une fois l'exposition corrigée.**
  « Achats seuls » finit à 100 % de BTC : comparé à 100 % BTC conservé, il perd
  en 2018-2021 (+893 contre +1096) et gagne peu en 2021-2026 (+79,8 contre +73,2).
- **La règle de régime est la bonne idée, calibrée trop serré.** Elle exige 0,35
  d'efficience sur les deux fenêtres : cela ne se produit que **4,4 % des jours**
  (le 90e centile de la fenêtre 60 n'est qu'à 0,32). Elle ne peut donc pas jouer
  son rôle. À 0,20 sur les deux fenêtres, le résultat 2021-2026 passe de +48,7 %
  à +64,7 % — mais recule en 2018-2021 : **résultat mixte, donc non concluant**.
- **Le délai de carence est confirmé** : à 0 jour, 5 ans donnent +6,8 % contre
  +48,7 % à 7 jours, pour 618 transactions au lieu de 136.

**Ce que ça ne dit pas :** rien sur l'horizon POSITION (non testé), rien sur le
gate des 7 signaux (pas d'historique gratuit) — le gate pourrait filtrer une part
des mauvaises ventes. Et les deux périodes sont globalement haussières : aucune
ne teste un marché durablement baissier.

**Décision prise le 8 septembre 2026 :** les paliers de vente sont retirés de
l'horizon **SWING** (§9, étape 2). POSITION reste intact — il n'a pas été testé.
Les seuils du §8 ne sont **pas** retouchés : le balayage montre que le résultat
5 ans varie de +40 % à +63 % pour un décalage de ±1 point, donc tout optimum lu ici
serait du bruit ajusté.

**Vérification après application**, mêmes données, mêmes paramètres :

| Variante | 2018-2021 | 2021-2026 |
|---|---|---|
| Règles actuelles (sans vente swing) | +893,2 % | +79,8 % |
| Grille d'origine | +228,6 % | +41,4 % |
| Ne rien faire (70/30) | +767,5 % | +51,2 % |

Zéro vente déclenchée sur les deux périodes, comme attendu. La variante « avec
règle de régime » du `backtest.html` a été redéfinie pour rejouer les règles
actuelles : sans ça, le backtest aurait continué à mesurer une grille que le
cockpit n'applique plus.

**Prochaines étapes possibles, par ordre de valeur :**
1. **Alertes**, en deux volets choisis le 11 septembre 2026 :
   - **A — fait** : bilan « depuis ta dernière visite » en tête du cockpit (§6).
     Toutes les données, MVRV et invalidations compris, mais il faut ouvrir la page.
   - **B — construit le 11 septembre 2026** (§15) : robot quotidien sur GitHub
     Actions, notification iPhone via ntfy. Essai préalable concluant : les
     bougies passent par `data-api.binance.vision`, les dérivés restent bloqués.
     Il ne peut jamais annoncer une vente POSITION.
2. **Backtest 4H** pour tester le score swing complet (aujourd'hui rejoué en
   journalier seulement). Coût : environ 11 requêtes de pagination par période.
   C'est aussi le seul moyen de savoir si le retrait des ventes (§9, étape 2) vaut
   aussi en 4H ou seulement en journalier.
3. **Backtest de l'horizon POSITION** si une source d'historique MVRV gratuite est
   trouvée. Tant qu'elle manque, POSITION reste la seule moitié non validée du
   système — et c'est désormais la seule qui peut déclencher une vente.

---

## 15. Robot d'alerte (volet B)

`alertes/robot.js`, lancé par `.github/workflows/alerte-quotidienne.yml` chaque
jour à 00:20 UTC, juste après la clôture journalière (GitHub peut retarder une
tâche planifiée de quelques minutes à une heure).

**Principe** : il charge la vraie page via `tests/sandbox.js` et fait tourner ses
fonctions — **aucune formule recopiée**. Il compare l'état à la dernière clôture
journalière avec l'état à la clôture précédente, avec `visitEvents`, la même
fonction que le bilan de visite. Aucune mémoire entre deux passages, aucun commit.

**Essai du 11 septembre 2026, depuis un serveur GitHub (États-Unis)** :

| Source | Réponse |
|---|---|
| `api.binance.com`, `api1.binance.com` | 451 — bloqué |
| `data-api.binance.vision` (bougies 1D et 4H, prix 24 h) | 200 |
| `fapi.binance.com` (funding, open interest) | 451 — bloqué |
| `api.alternative.me` | 200 |
| `ntfy.sh` | en service |

**Ce qu'il signale** : palier swing *candidat* (après le retrait des ventes swing,
mais avant le gate de confirmation, illisible sans les dérivés), régime 1 J ou
1 S, nouvelle divergence confirmée, franchissement de l'EMA 200, cassure du
support ou de la résistance. Le message précise qu'un palier swing est candidat.

**Ce qu'il ne signale jamais** : palier POSITION (il dépend du MVRV), vente,
invalidation, relevé manuel. Ces données n'existent que dans le navigateur de
l'utilisateur ; le robot n'en voit aucune et ne doit jamais en recevoir.

**Pour que son silence veuille dire « rien de notable »** :
- un message discret chaque lundi : « toujours en service » ;
- si le calcul échoue, une notification le dit et l'exécution est marquée en
  échec sur GitHub ;
- il réactive sa propre tâche planifiée à chaque passage, contre la suspension
  automatique après 60 jours sans activité.

**Notification** : ntfy (gratuit, sans compte). Le nom du canal est stocké dans le
secret du dépôt `NTFY_TOPIC` — **jamais dans un fichier** : dans un dépôt public,
n'importe qui pourrait lire ou brouiller les alertes. Sans ce secret, le robot
fait un passage à blanc : il calcule, affiche ce qu'il enverrait, n'envoie rien.
Déclenchement manuel possible depuis l'onglet Actions du dépôt, avec l'option
« essai » pour recevoir une notification même si rien n'a changé.

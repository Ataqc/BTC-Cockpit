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
| MVRV Z-score, ratio MVRV, prix réalisé — et l'historique quotidien depuis 2010 pour le backtest POSITION | `community-api.coinmetrics.io` (gratuit, sans clé, licence CC BY-NC 4.0 : citer la source, c'est fait en bas de page) | quotidienne (journée de la veille) |
| Flux ETF, réserves exchanges, Coinbase premium | **saisie manuelle** | hebdomadaire |
| Liquidations 24 h | **aucune** — reste N/D | — |

**MVRV automatique depuis le 15 septembre 2026.** Coin Metrics ne publie pas le
Z-score : la page le recalcule. Z = (capitalisation de marché − capitalisation
réalisée) ÷ écart-type de la capitalisation, avec capitalisation réalisée =
capitalisation ÷ ratio MVRV. **L'écart-type ne porte que sur les jours connus à
chaque date** (population, depuis juillet 2010) : c'est la méthode de
lookintobitcoin, déduite de ses propres chiffres. Vérification du 15 septembre 2026
contre la série de lookintobitcoin, un point tous les trois jours : depuis 2014,
écart moyen **0,006**, même bande MVRV **99,8 %** du temps, sous-score jamais
décalé de plus de 0,06 point. Calculé sur tout l'historique d'un coup, le Z-score ne
dépasserait jamais 2,3 : ce serait faux, et ce serait lire l'avenir dans un
backtest. Bitbo est protégé par une vérification anti-robot : ne pas la contourner.

Les trois métriques encore manuelles n'ont **aucune API gratuite**. Des liens vers
les dashboards publics (Farside, CryptoQuant ; bitbo et lookintobitcoin pour le MVRV
de secours) sont dans la page. C'est un choix assumé après avoir chiffré les alternatives payantes :
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
- **MVRV Z-score et prix réalisé automatiques** (Coin Metrics, §5) : un seul
  téléchargement par jour et par appareil (`btc_cm` en `localStorage`) ; les
  champs manuels du MVRV et du prix réalisé ne servent plus qu'en secours
- **Sauvegarde des saisies** : export dans un fichier et import (voir ci-dessous)

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

**Sauvegarde des saisies** — export des champs (position, PRU, cash, relevés
manuels et leur date) et de l'historique des analyses dans un fichier
`btc-cockpit-sauvegarde-AAAA-MM-JJ.json`, créé sur l'appareil. Import en deux
temps : le contenu est annoncé, rien n'est remplacé avant confirmation ;
l'historique est fusionné sans doublon. Un fichier étranger, illisible ou de version
inconnue est refusé en bloc ; dans un fichier valable, les balises sont retirées,
une date illisible est écartée, chaque champ d'analyse est vérifié. Tout texte saisi
ou importé passe par `esc` avant d'être affiché. La référence du bilan de visite et
le MVRV automatique ne sont pas exportés. Le fichier contient la position : le
`.gitignore` l'écarte du dépôt public, et la page le dit.

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

**MVRV du score position** : Coin Metrics s'il est frais (donnée de moins de
`CM_MAX_AGE` = 4 jours), sinon la saisie de secours si elle est fraîche, sinon N/D.
La source retenue est toujours écrite dans le verdict et dans le bloc.

**Composante N/D** (absente **ou périmée**) : exclue, poids restants renormalisés, et **c'est dit**
explicitement dans l'interface et dans le bloc généré. Depuis le MVRV automatique, le
score position ne tombe sur 60 % du barème que si Coin Metrics est injoignable et
que la saisie de secours est vide ou périmée.

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

Les étapes 2 et 3 vivent dans **une seule fonction pure**, `tierRules`, appelée par
le cockpit (`decide`) et par les trois backtests. Le 15 septembre 2026, elle a
remplacé une copie propre au backtest swing, qui lisait la tendance baissière
autrement que le cockpit (prix sous l'EMA 50 au lieu d'EMA 50 sous EMA 200) — sans
effet sur les résultats réels (§14), mais le backtest ne mesurait pas exactement la
règle du cockpit.

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

Trois horizons au choix, chacun comparé à des variantes et au fait de ne rien faire :

| Horizon testé | Données | Décision → exécution | Variantes |
|---|---|---|---|
| **SWING journalier** | Binance 1 J | clôture du jour → ouverture du lendemain | règles actuelles · grille d'origine |
| **SWING 4 heures** (score complet, comme le cockpit) | Binance 4 H + 1 J, depuis août 2017 | chaque clôture 4 H → ouverture de la bougie 4 H suivante | règles actuelles · grille d'origine |
| **POSITION** | Coin Metrics : prix de référence, capitalisation, MVRV, depuis 2010 | clôture du jour → prix de référence du lendemain (cette série n'a pas de cours d'ouverture) | règles actuelles · sans l'exception MVRV · sans aucune vente · grille brute |

**Une seule copie des formules.** Jusqu'au 11 septembre 2026, `backtest.html`
contenait sa propre copie des indicateurs — elles avaient déjà divergé une fois. Le
backtest vit désormais dans la même page et appelle directement les fonctions du
cockpit : `rsiSeries`, `macdSeries`, `emaSeries`, `pctRank`, `agg`, `weighted`,
`mvrvScore`, `mvrvZSeries`, `regimeOf`, `divergences`, `tierRules`, `W_SWING`,
`W_POS`, `TIERS`. Un test échoue si une seconde définition réapparaît, et **un test
d'équivalence** fait noter les mêmes données au cockpit et aux backtests 4 H et
POSITION : les scores doivent être identiques. L'historique n'est téléchargé que
quand on lance le calcul.

**Protections contre la triche au futur — à préserver absolument :**
- Décision à la **clôture**, exécution au **cours suivant**
- En 4 H, la bougie journalière lue est **la dernière close** à la clôture 4 H
- Bougies hebdomadaires du backtest POSITION reconstituées lundi-dimanche UTC : une
  semaine n'existe qu'**une fois son dimanche passé**
- MVRV Z-score **causal** : chaque jour ne connaît que l'histoire jusqu'à ce jour
- Divergences uniquement sur sommets **confirmés** (3 bougies de chaque côté) —
  lues sur l'hebdomadaire en POSITION
- **Test anti-triche** sur les trois moteurs : tronquer la fin de l'historique ne
  doit modifier aucun jour antérieur
- Percentiles calculés sur les **200 bougies précédentes** seulement
- Indicateurs causals calculés une fois sur toute la série puis lus à l'instant t
  (mathématiquement équivalent à un recalcul glissant, mais O(n) au lieu de O(n²))
- Délai de carence compté en **temps réel** : 7 jours valent 7 jours en 1 J comme en 4 H

**Ce qu'il ne teste pas, et pourquoi :**
- Le gate des 7 signaux — pas d'historique gratuit pour funding / OI / liquidations
- En POSITION : les mèches hebdomadaires (divergences lues sur les clôtures) et le
  cours d'ouverture (exécution au prix de référence du lendemain)
- Les années 2010-2012 reposent sur un marché minuscule : lire POSITION cycle par
  cycle. C'est écrit dans la page, ne pas le masquer.

**Découverte du backtest, déjà intégrée :** la grille n'avait aucun **délai de
carence**. Tant que le score restait dans sa zone, elle redéclenchait la même
action chaque jour et vidait la position par tranches. Un paramètre réglable a été
ajouté (défaut 7 jours ; options 0, 14, 30 et 60). Sur données de test, passer de 0
à 7 jours divisait les transactions par trois.

**Tableau « valeur prédictive »** : rendement moyen après chaque signal, comparé à la
moyenne de **tous les jours** de la période — et plus seulement à zéro, qui flattait
n'importe quel signal d'achat dans un marché haussier. Lecture à 15 jours en swing,
90 jours en POSITION.

**Réparé le 15 septembre 2026** : les réglages et les résultats du backtest étaient
hors de l'onglet et s'affichaient aussi sous le cockpit. Un test vérifie désormais
qu'ils sont dans l'onglet Backtest et nulle part ailleurs.

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
- **Le MVRV automatique dépend d'un tiers gratuit.** Si Coin Metrics ferme son API
  communautaire ou change sa méthode, la saisie de secours reprend et la page le dit.
  Le recalcul du Z-score n'a été validé que contre lookintobitcoin.
- **Les sommets de MVRV rétrécissent d'un cycle à l'autre** (Z ≈ 10 en 2013, 9 en
  2017, 7 en 2021, 3,4 fin 2024, 3,1 début 2025 chez lookintobitcoin). Les bandes du
  §8 et l'exception MVRV (sous-score ≥ 8,5, soit Z ≥ 7) risquent de ne plus jamais se
  déclencher. C'est une question de calibration ouverte, **pas un réglage à faire
  sur quatre cycles** : voir §14.

---

## 12. Règles de travail

- **Teste avant de livrer — la suite est dans le dépôt, lance-la : `npm test`.**
  - `tests/sandbox.js` charge le `<script>` d'une page réelle dans Node avec un DOM
    minimal simulé. Les tests appellent donc les **vraies** fonctions des vraies
    pages : ne recopie jamais une formule dans un test, un test qui recopie ce
    qu'il vérifie ne vérifie rien.
  - `tests/engine.test.js` (174 vérifications, zéro dépendance) : identités
    mathématiques (moyenne mobile sur série constante = la constante, RSI sur série
    croissante = 100, décroissante = 0, plate = 50), chaîne de décision, péremption,
    **unicité des formules** (chaque indicateur défini une seule fois dans la page)
    et **mécanique du backtest** : exécution à l'ouverture du lendemain, délai de
    carence, aucune vente sous les règles actuelles, et **aucune lecture de
    l'avenir** — tronquer l'historique ne doit changer aucun jour passé. Plus le
    **bilan de visite** : aucun événement sans changement constaté des deux côtés,
    aucune répétition d'un événement déjà signalé. Depuis le 15 septembre 2026 :
    `tierRules`, MVRV Z-score (exemple calculé à la main, aucune lecture de
    l'avenir), bougies hebdomadaires reconstituées, **backtests 4 H et POSITION**
    (exécution au cours suivant, carence, aucune vente sous les règles actuelles,
    troncature sans effet sur le passé, **scores identiques à ceux du cockpit**) et
    sauvegarde des saisies (refus des fichiers étrangers, nettoyage, fusion).
  - `tests/page.test.js` (88 vérifications, `jsdom`) : charge `index.html` entière
    avec un faux réseau et vérifie le rendu, les scores, le bloc généré, la
    péremption, la bascule des onglets (par clic et par adresse), un backtest
    complet, le bilan de visite (référence conservée pendant la visite, jamais
    écrasée si les données manquent) et l'absence d'erreur JavaScript. Depuis le
    15 septembre 2026 : Coin Metrics injoignable (secours annoncé), Coin Metrics
    disponible dans une seconde page simulée (MVRV sur 100 % du barème, bloc, cache
    du jour), backtests POSITION et 4 H complets, export puis import confirmé,
    réglages du backtest dans leur onglet.
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
    que le test mord vraiment : casse la règle exprès, la suite doit rougir. Fait le
    15 septembre 2026, sur une copie isolée, pour huit cassures : bougie journalière
    du jour lue en 4 H, vente swing réautorisée, exécution POSITION au prix de
    décision, seuil de l'exception MVRV abaissé, import sans nettoyage, hebdomadaire
    lu une semaine en avance, Z-score faussé, pondération recopiée en dur. Chacune
    fait rougir la suite.
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
- **Changement d'ordinateur préparé** le 14 septembre 2026 — procédure en §16
- **Reprise sur le nouvel ordinateur faite** le 15 septembre 2026 : checklist du
  §16 déroulée, 201 vérifications au vert. Les tâches GitHub (tests et robot)
  passent en même temps sur Node 24 : GitHub signalait Node 20 en fin de vie à
  chaque exécution
- **15 septembre 2026, suite** : MVRV Z-score et prix réalisé automatiques (Coin
  Metrics, §5) ; backtest POSITION et backtest SWING 4 heures (§10, résultats §14) ;
  étapes 2 et 3 de la chaîne partagées par le cockpit et les backtests (`tierRules`,
  §9) ; sauvegarde et restauration des saisies (§6) ; onglet Backtest réparé

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

### Backtest SWING 4 heures (15 septembre 2026)

Score swing **complet**, exactement comme le cockpit (4 H + 1 J), sur les vraies
bougies Binance. Périodes : du 20/06/2018 au 07/09/2021, puis cinq ans jusqu'au
07/09/2026. Frais 0,1 %, carence 7 jours, départ 70 % BTC, décision à chaque
clôture 4 H.

| Variante | 2018-2021 | 2021-2026 |
|---|---|---|
| Règles actuelles (sans vente swing) | +623,7 % · pire perte −63 % | +77,7 % · −74 % |
| Grille d'origine | +149,6 % · −48 % | +47,8 % · −56 % |
| Ne rien faire (70/30) | +414,2 % · −52 % | +49,6 % · −59 % |
| Ne rien faire (100 % BTC) | +593,1 % | +71,8 % |

Rendement moyen des 15 jours suivants :

| Période | Après un score de vente | Après un score d'achat | Toutes les bougies |
|---|---|---|---|
| 2018-2021 | +7,41 % | +1,80 % | +3,92 % |
| 2021-2026 | +2,83 % | +0,45 % | +1,03 % |

**Lecture :** le retrait des ventes swing (§9, étape 2) **vaut aussi en 4 heures**.
Un score de vente y a précédé des rendements deux à trois fois supérieurs à la
moyenne, sur les deux périodes, et la grille d'origine perd face au simple fait de
conserver. Le côté achat n'a **pas de valeur de timing** : un score d'achat a précédé
des rendements inférieurs à la moyenne. L'avance des règles actuelles sur le 70/30
vient surtout de l'exposition — elles finissent quasiment à 100 % BTC —, comme en
journalier : face à 100 % BTC conservé, l'écart n'est plus que de +31 et +6 points.
Carence 30 jours : même conclusion (+595,7 % et +89,1 % pour les règles actuelles,
+238,3 % et +41,3 % pour la grille d'origine).

**Contrôle de cohérence** : le backtest journalier rejoué avec l'ancien moteur et
avec le nouveau (qui appelle `tierRules`) donne des résultats **identiques** sur les
deux périodes. L'écart de définition de la tendance baissière (§9) n'avait donc
aucun effet réel.

### Backtest POSITION (15 septembre 2026)

Premier test de l'horizon POSITION, rendu possible par l'historique Coin Metrics.
Score POSITION complet (RSI 1 J + 1 S, structure EMA 50/200, MVRV Z-score causal),
règle de régime sur l'hebdomadaire, **sans le gate**. Frais 0,1 %, départ 70 % BTC.
Périodes coupées **aux halvings** — des dates connues d'avance, pas choisies après
coup. Aucun seuil n'a été modifié.

Performance, carence 30 jours (pire perte entre parenthèses) :

| Cycle | Règles actuelles | Sans exception MVRV | Sans aucune vente | Grille brute | Conserver 70/30 | 100 % BTC |
|---|---|---|---|---|---|---|
| 2012-2016 | +3474 % (−76 %) | +3366 % | +3616 % (−84 %) | +2828 % | +3563 % (−84 %) | +5090 % |
| 2016-2020 | +1270 % (−70 %) | +1270 % | +1109 % (−83 %) | +989 % | +958 % (−83 %) | +1369 % |
| 2020-2024 | +568 % (−65 %) | +503 % | +491 % (−76 %) | +549 % | +447 % (−73 %) | +639 % |
| 2024-2026 (en cours) | +14,7 % (−48 %) | +14,7 % | +13,9 % (−50 %) | +17,7 % | +12,8 % (−43 %) | +18,3 % |

Écart des règles actuelles, en points, selon la carence (7 / 30 / 60 jours) :

| Cycle | vs sans aucune vente | vs sans exception MVRV | vs grille brute |
|---|---|---|---|
| 2012-2016 | +216 / −142 / −831 | +514 / +108 / −590 | +2184 / +646 / +305 |
| 2016-2020 | +20 / +161 / +324 | 0 / 0 / 0 (jamais déclenchée) | +783 / +280 / +305 |
| 2020-2024 | +9 / +77 / +120 | +49 / +65 / +79 | +53 / +19 / +40 |
| 2024-2026 | +1 / +1 / +1 | 0 / 0 / 0 | −2 / −3 / 0 |

Rendement moyen des 90 jours suivants :

| Cycle | Vente, score brut | Vente retenue par les règles | Achat | Tous les jours |
|---|---|---|---|---|
| 2012-2016 | +129,4 % | −21,3 % | +10,2 % | +76,2 % |
| 2016-2020 | +54,7 % | +10,6 % | +8,7 % | +33,5 % |
| 2020-2024 | +60,9 % | +127,1 % | +9,9 % | +22,7 % |
| 2024-2026 | −1,0 % | +3,6 % | +6,3 % | +3,3 % |

Par bande de MVRV Z-score (Coin Metrics, causal), rendement moyen à 90 / 180 jours :

| Bande | 2011-2018 | 2018-2026 |
|---|---|---|
| < 0 | +25 % / +49 % | +36 % / +92 % |
| 0 à 2 | +60 % / +166 % | +13 % / +35 % |
| 2 à 4 | +136 % / +224 % | +7 % / +2 % |
| 4 à 7 | +63 % / +123 % | −1 % / −8 % |
| > 7 | −38 % / −39 % (40 jours) | −31 % / −17 % (2 jours) |
| tous les jours | +63 % / +145 % | +13 % / +32 % |

**Lecture — POSITION ne se comporte pas comme SWING :**
- **Le score brut n'est pas un signal de vente** : sur les trois cycles complets, un
  score ≥ 7 a précédé des rendements supérieurs à la moyenne. Seul, il vendrait trop
  tôt, comme en swing.
- **La règle de régime fait le travail** : les règles actuelles battent la grille
  brute sur les trois cycles complets, à toutes les carences (de +19 à +2184 points).
  En swing, cette règle ne jouait presque jamais ; sur l'hebdomadaire, elle filtre.
- **Les ventes retenues ont eu de la valeur deux cycles sur trois** (2013,
  2017-2018) et se sont trompées en 2020-2024 (ventes avant la suite de la hausse).
- **Garder les ventes POSITION** bat « sans aucune vente » dans 10 cas sur 12, avec
  une pire perte nettement moins profonde sur les trois cycles complets. Les deux
  exceptions sont 2012-2016 à 30 et 60 jours, et elles sont lourdes.
- **L'exception MVRV** n'a joué qu'en 2012-2016 et 2020-2024 ; elle a aidé 5 fois sur
  6. Mais les sommets de MVRV rétrécissent (§11) : elle pourrait ne plus jamais se
  déclencher.
- **La valorisation a une valeur prédictive**, contrairement au momentum : les bandes
  4 à 7 et au-delà de 7 ont été suivies de rendements inférieurs à la moyenne dans
  les deux moitiés de l'historique ; la bande 2 à 4 seulement depuis 2018.
- Face à **100 % BTC conservé**, les variantes font presque toujours moins bien sur
  les cycles complets (seule exception : 2016-2020 à 60 jours, +1389 % contre
  +1369 %). L'outil **réduit surtout les pertes**, il ajoute peu de performance.

**Décision du 15 septembre 2026 : aucune règle POSITION n'est modifiée.** Rien dans
ces chiffres ne justifie de retirer les ventes POSITION, comme on l'a fait en swing,
ni de retoucher un seuil : quatre cycles, dont un en cours, c'est trop peu pour
calibrer sans ajuster le passé. Ce qui reste ouvert : la dérive des sommets de MVRV.

**Ce que ça ne dit pas :** rien sur le gate des 7 signaux ; divergences hebdomadaires
lues sur les clôtures, pas sur les mèches ; fenêtres de rendement qui se chevauchent
(un sens, pas une significativité) ; 2010-2012 trop peu liquide pour conclure.

Pour rejouer ces chiffres : onglet Backtest, horizon POSITION, en tronquant
l'historique aux dates des halvings (28/11/2012, 09/07/2016, 11/05/2020, 20/04/2024).

**Prochaines étapes possibles, par ordre de valeur :**
1. **Alertes**, en deux volets choisis le 11 septembre 2026 :
   - **A — fait** : bilan « depuis ta dernière visite » en tête du cockpit (§6).
   - **B — construit le 11 septembre 2026** (§15) : robot quotidien sur GitHub
     Actions, notification iPhone via ntfy. Canal pas encore configuré.
2. ~~Backtest 4H~~ — **fait le 15 septembre 2026**, ci-dessus.
3. ~~Backtest POSITION~~ — **fait le 15 septembre 2026**, ci-dessus.
4. **Calibration du MVRV face au rétrécissement des sommets** : bandes relatives (rang
   percentile du Z-score sur plusieurs années, par exemple) plutôt qu'absolues. À
   tester avec une période de validation distincte, jamais en ajustant sur les
   quatre cycles connus.
5. **Robot d'alerte et MVRV** : le robot pourrait lire Coin Metrics et signaler un
   changement de bande MVRV, qui ne dépend d'aucune donnée personnelle.

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

**État au 11 septembre 2026 : canal non configuré, à la demande de l'utilisateur.**
Le secret `NTFY_TOPIC` n'existe pas : le robot tourne chaque nuit en passage à
blanc et n'envoie rien. Passage à blanc vérifié le jour même depuis GitHub, sur
données réelles. Pour l'activer, quand l'utilisateur le demandera : générer un nom
de canal aléatoire, l'enregistrer comme secret du dépôt (c'est une modification
de configuration : demander son accord), le lui donner pour qu'il s'abonne dans
l'application ntfy, puis déclencher le robot avec l'option « essai ».

---

## 16. Reprise sur un nouvel ordinateur

**La source de vérité est le dépôt GitHub** `https://github.com/Ataqc/BTC-Cockpit`.
Tout ce qui compte y est : la page, les tests, le robot, ce briefing. Le site en
ligne (GitHub Pages) et le robot d'alerte (GitHub Actions) tournent chez GitHub :
**un changement d'ordinateur ne les touche pas.**

État vérifié le 14 septembre 2026 sur l'ancien ordinateur, avant le départ :
aucun commit en attente, aucune modification non enregistrée, mémoire de session
Claude vide (tout le contexte est ici), aucun secret de dépôt configuré.

**Reprise effectuée le 15 septembre 2026** (Windows 11). Le dossier avait été
copié tel quel, historique git et identité compris. Il manquait Git, Node.js et
GitHub CLI ; l'utilisateur les a installés, puis s'est connecté lui-même.
Leçons de ce passage :
- Juste après une installation, les nouveaux outils ne sont pas vus tant que
  l'application Claude n'a pas été relancée. GitHub CLI s'installe dans
  `C:\Program Files\GitHub CLI\gh.exe` : l'appeler par ce chemin si `gh` n'est
  pas trouvé.
- Python n'est pas nécessaire : Windows ne propose qu'un raccourci vers le
  Microsoft Store. L'aperçu local tourne avec Node (voir tableau).
- `gh auth login --web` ne peut pas s'utiliser en interactif ici : le lancer en
  arrière-plan, lire le code à usage unique qu'il affiche et le donner à
  l'utilisateur, qui le saisit sur https://github.com/login/device. Si GitHub
  répond « code inconnu », arrêter la tentative et en relancer une pour obtenir
  un code neuf.

### Ce qui ne suit PAS, et ce qu'il faut en faire

| Élément | Où il vivait | Sur le nouvel ordinateur |
|---|---|---|
| Code, tests, briefing | dépôt GitHub | récupéré par le clonage |
| `node_modules/` (jsdom) | disque local, ignoré par git | `npm ci` le réinstalle |
| `.claude/launch.json` (serveur d'aperçu local) | disque local, ignoré par git | à recréer si besoin : un petit serveur de fichiers Node en ligne de commande (`node -e`) sur le port 8765, sans aucun paquet à installer |
| Identité git du dépôt | configuration locale | à reposer (voir ci-dessous) |
| Connexion GitHub (`gh`, envoi des commits) | trousseau de l'ancien ordinateur | **l'utilisateur** se reconnecte lui-même dans son navigateur |
| **Saisies de la page** : position, PRU, cash, relevés manuels, historique des analyses, référence du bilan de visite | `localStorage` du navigateur de l'ancien ordinateur | **ne suivent pas.** La synchronisation des navigateurs ne copie pas ces données. À ressaisir, sauf si une fonction d'export/import a été ajoutée entre-temps |

### Checklist de la première session sur le nouvel ordinateur

À dérouler dans l'ordre, sans rien redemander à l'utilisateur sauf la connexion GitHub :

1. **Outils** : vérifier `git --version`, `node --version` (≥ 24, la CI tourne en
   24 depuis le 15 septembre 2026), `gh --version`. S'il en manque, dire à l'utilisateur lequel installer
   depuis le site officiel (Git for Windows, Node.js LTS, GitHub CLI) — ne jamais
   télécharger d'installeur à sa place.
2. **Clonage**, si le dossier n'existe pas encore :
   `git clone https://github.com/Ataqc/BTC-Cockpit.git`, puis travailler dans ce
   dossier. Si la session a été ouverte sur le dossier parent, dire à
   l'utilisateur d'ouvrir une nouvelle session sur `BTC-Cockpit` pour que ce
   briefing se charge automatiquement.
3. **Identité git, locale au dépôt** — l'adresse *noreply*, **jamais l'adresse
   e-mail réelle**, le dépôt est public :
   `git config user.name "Ataqc"` et
   `git config user.email "Ataqc@users.noreply.github.com"`.
4. **Dépendances de test** : `npm ci`, puis `npm test`. Attendu : moteur 174,
   robot 17, page 88 — **279 vérifications, 0 échec**. Un échec ici veut dire que
   l'environnement diffère : le diagnostiquer avant toute modification.
5. **Connexion GitHub** : `gh auth status`. Si l'utilisateur n'est pas connecté,
   lui demander de faire lui-même `gh auth login` (navigateur, compte `Ataqc`) —
   ne jamais saisir d'identifiant ni de mot de passe à sa place. Au premier envoi
   de commit, Git peut aussi ouvrir une fenêtre de connexion : c'est à lui de la
   remplir.
6. **Contrôle de santé à distance** : `gh run list --limit 5` — la dernière
   exécution « Tests » et les passages nocturnes « Alerte quotidienne BTC »
   doivent être en succès. Vérifier aussi que le site répond :
   `https://ataqc.github.io/BTC-Cockpit/`.
7. **Rappeler à l'utilisateur** que ses saisies de la page ne l'ont pas suivi
   (tableau ci-dessus), et que le bilan « depuis ta dernière visite » affichera
   « première visite » sur ce nouveau navigateur : c'est normal.

### Ancien ordinateur

Rien à supprimer, rien à désactiver : il ne fait tourner aucune tâche. Le dossier
local peut rester ou être effacé, GitHub a tout. **Seule précaution** : ne pas y
faire de nouveaux commits sans d'abord récupérer ceux du nouvel ordinateur
(`git pull`), sinon les deux copies divergeront.

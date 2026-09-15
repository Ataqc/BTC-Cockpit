# BTC Cockpit

[![Tests](https://github.com/Ataqc/BTC-Cockpit/actions/workflows/tests.yml/badge.svg)](https://github.com/Ataqc/BTC-Cockpit/actions/workflows/tests.yml)

Aide à la décision pour la gestion d'une position **Bitcoin au comptant**.
Une seule page autonome à deux onglets, sans installation, sans compte, sans clé d'API.

| Onglet | À quoi il sert | Lien |
|---|---|---|
| **Cockpit** | Récupère les données du marché et calcule tout ce qui est calculable : indicateurs, régime, divergences, niveaux, scores, chaîne de décision | [ouvrir](https://ataqc.github.io/BTC-Cockpit/) |
| **Backtest** | Rejoue le score et les règles sur l'historique réel — SWING en journalier ou en 4 heures, POSITION avec le MVRV — pour vérifier si elles tiennent | [ouvrir](https://ataqc.github.io/BTC-Cockpit/#backtest) |
| **Prompt d'analyse** | Ce qu'on donne à lire à l'IA une fois le bloc de données copié — un document, pas un onglet | [prompt-analyse-v3.md](prompt-analyse-v3.md) |

## Le principe

> Le code pour ce qui doit être constant et reproductible.
> L'IA pour ce qui demande du jugement.

Tout ce qui est calculable a été sorti du prompt et mis dans le code : une IA n'a
pas de source de vérité numérique et n'est pas reproductible. Ce qui lui reste —
contester le régime détecté, apporter les catalyseurs macro, arbitrer entre
horizons, formuler l'invalidation — est précisément ce qu'une formule ne sait pas
faire.

## Ce que la pastille verte en haut veut dire

À chaque modification envoyée sur GitHub, 294 vérifications automatiques
s'exécutent :

- **le moteur de calcul** — chaque indicateur est confronté à une série dont on
  connaît la réponse d'avance (une moyenne mobile sur un prix immobile doit valoir
  ce prix, un RSI sur une hausse continue doit valoir 100) ;
- **le backtest** — il utilise les formules du cockpit lui-même, dont il n'existe
  qu'une seule copie. On vérifie qu'il n'exécute jamais un ordre au cours qui a
  servi à décider, qu'il respecte le délai de carence, qu'il ne vend jamais sous
  les règles actuelles, et surtout qu'il ne lit pas l'avenir : couper la fin de
  l'historique ne doit pas changer un seul jour du passé. En 4 heures et en
  POSITION, on vérifie en plus qu'il note chaque jour exactement comme le cockpit ;
- **le MVRV automatique** — recalculé à partir de Coin Metrics, vérifié sur un
  exemple calculé à la main, sans jamais lire l'avenir ;
- **la sauvegarde de tes saisies** — un fichier étranger est refusé, et rien n'est
  remplacé sans ta confirmation ;
- **le robot d'alerte** — sur des bougies synthétiques : il compare la bonne
  période, ne signale jamais de palier POSITION ni de vente, et alerte vraiment
  quand le prix s'effondre ; une bande MVRV n'est signalée qu'une fois tenue 7 jours ;
- **la page entière** — elle est chargée dans un navigateur simulé, avec un faux
  réseau, et on vérifie que tout s'affiche, que les scores restent dans l'échelle
  0-10, que les onglets basculent sans rien recharger, que le backtest tourne
  jusqu'au bout, que le bilan « depuis ta dernière visite » ne signale que des
  changements réels, et qu'aucune erreur ne survient.

**Vert = les calculs font ce qu'ils annoncent. Rouge = ne pas se fier à la page.**

Ces tests n'utilisent que des séries **synthétiques** : ils valident les formules,
jamais la pertinence des seuils sur le vrai marché. Seul le backtest fait ça.

## Ce que le backtest a montré (8 septembre 2026)

Rejoué sur 2999 jours réels de bougies Binance, coupés en deux périodes dont une
jamais utilisée pour établir le constat :

- **Le côté vente de la table d'action détruisait de la valeur.** Sur les deux
  périodes, un score de vente était suivi de rendements *supérieurs* à la moyenne
  du marché. Le score technique mesure du momentum ; la table s'en servait comme
  d'un signal de retournement. **Les paliers de vente ont été retirés de l'horizon
  SWING.** L'horizon POSITION est intact : il n'a pas pu être testé, faute
  d'historique MVRV gratuit.
- **La règle de régime ne s'applique que 4,4 % des jours** : le seuil de 0,35
  d'efficience exigé sur deux fenêtres est au-delà du 90ᵉ centile observé. Bonne
  idée, calibration à revoir — mais la desserrer donne un résultat mixte selon la
  période, donc rien n'a été changé.
- **Aucun seuil du §8 n'a été retouché.** Un décalage de ±1 point fait varier le
  résultat sur 5 ans de +40 % à +63 % : tout « optimum » lu là-dedans serait du
  bruit ajusté au passé.

Ces chiffres portent sur deux périodes globalement haussières. Aucune ne teste un
marché durablement baissier.

## Ce que les backtests 4 heures et POSITION ont montré (15 septembre 2026)

- **En 4 heures, le constat swing tient.** Avec le score complet du cockpit, un score
  de vente a encore précédé des rendements supérieurs à la moyenne, sur les deux
  périodes. Le retrait des ventes swing est confirmé ; le côté achat n'a pas de
  valeur de timing, son avance vient de l'exposition au bitcoin.
- **POSITION se comporte autrement.** Testé sur quatre cycles depuis 2012 grâce à
  l'historique MVRV de Coin Metrics : la règle de régime filtre réellement les
  mauvaises ventes, les ventes retenues ont eu de la valeur deux cycles sur trois,
  et les garder réduit nettement la pire perte. **Aucune règle POSITION n'a été
  modifiée.**
- **La valorisation prédit, le momentum non.** Un MVRV élevé a été suivi de
  rendements inférieurs à la moyenne ; un RSI élevé, de rendements supérieurs.
- **Bandes MVRV relatives : testées et écartées.** Les sommets de MVRV rétrécissent
  d'un cycle à l'autre, mais mesurer le MVRV par rapport aux quatre dernières années
  vend beaucoup trop tôt pendant les hausses : moins bien que les bandes actuelles en
  2014-2016, 2016-2020 et 2020-2024. Des seuils qui se déclenchent rarement valent
  mieux qu'une règle qui vend trop tôt.

## Alertes

- **Dans la page** : le bloc « Depuis ta dernière visite », en tête du cockpit, ne
  signale que ce qui a changé depuis ton dernier passage sur l'appareil. Il voit
  tout, y compris tes relevés manuels et tes invalidations.
- **Sur le téléphone** : un robot tourne chaque jour sur GitHub, peu après la
  clôture de 00:00 UTC, et n'envoie une notification (via ntfy) que si quelque
  chose a changé : palier swing candidat, régime, divergence, EMA 200, support ou
  résistance, et changement de bande MVRV tenu 7 jours. Les serveurs GitHub sont aux États-Unis, où Binance bloque ses
  dérivés : le robot ne lit ni funding ni open interest, et ne voit aucune donnée
  personnelle. **Il n'annonce jamais de vente.** Chaque lundi, un message discret
  confirme qu'il tourne ; s'il échoue, il le dit.

## Ce que le projet ne fait pas

- Aucun levier, aucun future, aucun perpétuel : **spot uniquement**.
- Aucun conseil en investissement. L'outil propose, la décision reste humaine.
- Aucune donnée personnelle dans le dépôt : position, PRU, cash et relevés
  manuels restent dans le navigateur de l'appareil (`localStorage`). Le fichier de
  sauvegarde que tu exportes les contient : garde-le pour toi.
- Aucune clé, aucun abonnement : Binance, Alternative.me et Coin Metrics (MVRV et
  prix réalisé, licence CC BY-NC 4.0) sont gratuits. Flux ETF, réserves et premium
  Coinbase restent à saisir à la main.
- Aucune valeur inventée : quand une donnée manque **ou qu'elle est périmée**,
  elle vaut N/D et son poids est redistribué, en le disant.

## Pour développer (pas nécessaire pour utiliser)

```bash
git clone https://github.com/Ataqc/BTC-Cockpit.git
cd BTC-Cockpit
npm ci
npm test
```

Nouvel ordinateur : la procédure complète, et ce qui ne suit pas (les saisies de
la page restent dans le navigateur de l'ancien appareil), est dans
[CLAUDE.md, §16](CLAUDE.md).

La page elle-même n'a **aucune dépendance** : elle s'ouvre au double-clic et
doit encore fonctionner dans dix ans. `jsdom` ne sert qu'aux tests.

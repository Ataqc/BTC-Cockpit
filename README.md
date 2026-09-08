# BTC Cockpit

[![Tests](https://github.com/Ataqc/BTC-Cockpit/actions/workflows/tests.yml/badge.svg)](https://github.com/Ataqc/BTC-Cockpit/actions/workflows/tests.yml)

Aide à la décision pour la gestion d'une position **Bitcoin au comptant**.
Deux pages autonomes, sans installation, sans compte, sans clé d'API.

| Page | À quoi elle sert | Lien |
|---|---|---|
| **Cockpit** | Récupère les données du marché et calcule tout ce qui est calculable : indicateurs, régime, divergences, niveaux, scores, chaîne de décision | [ouvrir](https://ataqc.github.io/BTC-Cockpit/) |
| **Backtest** | Rejoue le score et les règles sur l'historique réel pour vérifier si elles tiennent | [ouvrir](https://ataqc.github.io/BTC-Cockpit/backtest.html) |
| **Prompt d'analyse** | Ce qu'on donne à lire à l'IA une fois le bloc de données copié | [prompt-analyse-v3.md](prompt-analyse-v3.md) |

## Le principe

> Le code pour ce qui doit être constant et reproductible.
> L'IA pour ce qui demande du jugement.

Tout ce qui est calculable a été sorti du prompt et mis dans le code : une IA n'a
pas de source de vérité numérique et n'est pas reproductible. Ce qui lui reste —
contester le régime détecté, apporter les catalyseurs macro, arbitrer entre
horizons, formuler l'invalidation — est précisément ce qu'une formule ne sait pas
faire.

## Ce que la pastille verte en haut veut dire

À chaque modification envoyée sur GitHub, 139 vérifications automatiques
s'exécutent :

- **le moteur de calcul** — chaque indicateur est confronté à une série dont on
  connaît la réponse d'avance (une moyenne mobile sur un prix immobile doit valoir
  ce prix, un RSI sur une hausse continue doit valoir 100) ;
- **le contrôle croisé** — le cockpit et le backtest contiennent chacun leur copie
  des formules ; les tests échouent au premier écart entre les deux, sinon le
  backtest finirait par valider autre chose que le cockpit ;
- **la page entière** — elle est chargée dans un navigateur simulé, avec un faux
  réseau, et on vérifie que tout s'affiche, que les scores restent dans l'échelle
  0-10 et qu'aucune erreur ne survient.

**Vert = les calculs font ce qu'ils annoncent. Rouge = ne pas se fier à la page.**

Ces tests n'utilisent que des séries **synthétiques** : ils valident les formules,
jamais la pertinence des seuils sur le vrai marché. Seul le backtest fait ça.

## Ce que le projet ne fait pas

- Aucun levier, aucun future, aucun perpétuel : **spot uniquement**.
- Aucun conseil en investissement. L'outil propose, la décision reste humaine.
- Aucune donnée personnelle dans le dépôt : position, PRU, cash et relevés
  manuels restent dans le navigateur de l'appareil (`localStorage`).
- Aucune valeur inventée : quand une donnée manque **ou qu'elle est périmée**,
  elle vaut N/D et son poids est redistribué, en le disant.

## Pour développer (pas nécessaire pour utiliser)

```bash
npm install
npm test
```

Les pages elles-mêmes n'ont **aucune dépendance** : elles s'ouvrent au double-clic
et doivent encore fonctionner dans dix ans. `jsdom` ne sert qu'aux tests.

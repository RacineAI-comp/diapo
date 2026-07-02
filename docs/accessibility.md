# Déclaration d'accessibilité, Diapo (RGAA 4.1)

> Modèle de déclaration de conformité au **RGAA 4.1** (Référentiel général d'amélioration de
> l'accessibilité). À compléter par chaque éditeur : renseignez les champs entre `<…>` (éditeur,
> URL, contact, date, agents testés) et faites réaliser un **audit de conformité par un auditeur
> certifié** avant d'afficher un taux officiel. Le reste reflète l'auto-évaluation de l'outil.

`<ÉDITEUR>` s'engage à rendre son service **Diapo** accessible conformément à l'article 47 de la
loi n° 2005-102 du 11 février 2005.

## État de conformité

**Diapo** est **partiellement conforme** avec le RGAA 4.1. La mention « partiellement conforme »
s'applique en l'absence d'audit de conformité par un tiers certifié : l'auto-évaluation interne ne
permet pas d'afficher un taux officiel.

## Résultats des tests (auto-évaluation)

Auto-évaluation menée en interne contre les 106 critères RGAA 4.1, complétée par le vérificateur
intégré (contraste WCAG AA, textes alternatifs, diapositives sans titre, via le menu « Vérifier
l'accessibilité ») et par des tests clavier et lecteur d'écran manuels. Non opposable tant que
l'audit tiers n'est pas réalisé.

### Points conformes vérifiés

- **Langue** : `lang="fr"` défini sur le document (RGAA 8.3 / 8.4).
- **Navigation clavier** : éditeur, mode présentation et tableau de bord opérables au clavier
  (raccourcis documentés via « Raccourcis clavier »).
- **Composants** : boutons icône pourvus d'`aria-label` ; état de connexion annoncé via
  `role="status"` / `aria-live="polite"`.
- **Mouvement** : respect de `prefers-reduced-motion` (transitions d'interface et animations de
  diapositives neutralisées), RGAA 13.8.
- **Contenu** : vérificateur intégré signalant les images sans alternative et les contrastes
  inférieurs à 4,5:1 avant publication d'un deck.

### Non-conformités et points à confirmer par l'audit

- Ordre de lecture et de focus dans le canevas d'édition libre (objets positionnés).
- Restitution par lecteur d'écran de l'édition collaborative en temps réel.
- Lien d'évitement (« Aller au contenu ») et hiérarchie des titres sur toutes les vues.
- Le **contenu produit par l'utilisateur** (les diapositives) relève de la responsabilité de son
  auteur ; l'outil fournit une aide à la conformité mais ne garantit pas l'accessibilité du contenu.

## Établissement de cette déclaration

Déclaration établie le `<DATE>`. Méthode : auto-évaluation RGAA 4.1 et outils intégrés.
Technologies : HTML, CSS, JavaScript / React. Agents testés : `<navigateurs et lecteurs d'écran>`.

## Retour d'information et contact

Signalez tout défaut d'accessibilité à `<contact@editeur>`. Réponse sous `<délai>`.

## Voies de recours

À défaut de réponse, vous pouvez saisir le Défenseur des droits (formulaire en ligne, courrier
postal gratuit, ou délégué territorial).

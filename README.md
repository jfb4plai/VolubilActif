# Volubil-IA

Une application qui transforme ta voix en texte, dans n'importe quelle
application ouverte sur ton ordinateur : ton navigateur, ton traitement de
texte, ta messagerie. Tu appuies sur un raccourci, tu parles, tu appuies à
nouveau, et le texte s'insère directement là où se trouve ton curseur.

Tout se passe sur ta machine. Aucune clé API à payer, aucun abonnement,
aucune donnée vocale envoyée sur internet (à une exception près, honnêtement
documentée plus bas : le tout premier téléchargement du modèle de
transcription). Pas de capture d'écran, pas d'analyse de ce que tu fais dans
les autres applications : le seul chemin, c'est micro vers texte.

Une précision importante sur le raccourci : il fonctionne en mode **bascule**
(une pression démarre, une autre arrête), pas en mode maintien-appui.
Electron ne permet pas de détecter un relâchement de touche sans module
natif supplémentaire, donc on assume ce choix plutôt que d'ajouter de la
complexité.

```
   [Ctrl+Space]  ->  parle  ->  [Ctrl+Space]  ->  texte inséré
```

## Les deux modes

Volubil-IA propose deux façons de nettoyer ce que tu dis avant de l'insérer.
Tu choisis au premier lancement, et tu peux changer d'avis à tout moment dans
les réglages.

| | Mode simple | Mode amélioré |
|---|---|---|
| Ce qu'il fait | Supprime les "euh", les répétitions, corrige les espaces et la majuscule de départ | Ajoute un second passage par un petit modèle de langage local (Ollama) : ponctuation automatique, ponctuation dictée à voix haute, gestion des "en fait non..." |
| Machine conseillée | N'importe quel PC ou Mac récent | 8 Go de RAM ou plus, avec Ollama installé |
| Dépendance externe | Aucune | Ollama, qui tourne lui-même en local |
| Que se passe-t-il si ça ne marche pas | - | Retour automatique et silencieux au mode simple, sans planter |

Le mode amélioré reste optionnel : si Ollama n'est pas installé, pas lancé,
ou que le modèle demandé n'est pas présent, Volubil-IA continue de fonctionner
avec le nettoyage simple, sans message d'erreur bloquant.

## Installation Windows

1. Va sur la page **[Téléchargements](https://github.com/annece29-netizen/Volubil-IA/releases/latest)**
   et récupère le fichier `Volubil-IA-Windows-....exe` (section "Assets").
2. Ton navigateur va probablement bloquer le fichier avec un message du type
   "n'est pas fréquemment téléchargé" : c'est sa prudence normale face à une
   application toute neuve. Pour le débloquer, ouvre le panneau des
   téléchargements (Ctrl+J), passe la souris sur le fichier, clique sur les
   trois points "..." puis "Conserver". Une fenêtre "Vérifiez que vous
   faites confiance..." s'ouvre alors : ne clique pas sur Supprimer, clique
   sur la petite flèche du bouton "Supprimer" (ou sur "Afficher plus" selon
   les versions) puis sur "Conserver quand même".
3. Double-clique sur le fichier. Windows affiche un écran bleu "Windows a
   protégé votre ordinateur" : même prudence, application non signée
   commercialement. Clique sur "Informations complémentaires" puis "Exécuter
   quand même".
4. L'application s'installe et s'ouvre toute seule.

## Installation Mac (Apple Silicon)

1. Télécharge le fichier `Volubil-IA-Mac-....dmg` (section "Assets").
2. Ouvre-le et glisse Volubil-IA dans le dossier **Applications**.
3. Au premier lancement, macOS peut bloquer l'ouverture (application non
   signée). Deux façons de contourner :
   - Ouvre **Réglages Système > Confidentialité et sécurité**, descends en
     bas de la page et clique sur **"Ouvrir quand même"**.
   - Ou plus simple : clic droit sur l'application, puis **Ouvrir**.
4. Si rien de tout ça ne fonctionne, en tout dernier recours, ouvre le
   Terminal et lance :
   ```
   xattr -cr /Applications/Volubil-IA.app
   ```

Deux autorisations te seront demandées à l'usage :

- **Microphone** : demandée automatiquement au premier enregistrement.
- **Accessibilité** : nécessaire pour que Volubil-IA puisse coller le texte à
  ta place dans l'application active. Si elle manque, l'app t'ouvre
  directement le bon panneau de réglages (Confidentialité et sécurité >
  Accessibilité) : il suffit de cocher Volubil-IA dans la liste.

## Premier lancement

Un petit parcours de bienvenue s'affiche :

1. Choix du mode (simple ou amélioré, avec vérification d'Ollama en direct
   si tu choisis l'amélioré).
2. Choix de la taille du modèle de transcription : **base** (142 Mo,
   recommandé, rapide) ou **small** (466 Mo, plus précis). Le téléchargement
   se fait une seule fois, avec une barre de progression.
3. Rappel du raccourci clavier et petit mode d'emploi.

Ensuite, la fenêtre principale s'ouvre et tu es prête à dicter.

## Mode amélioré : installer Ollama

Si tu veux la ponctuation automatique et la gestion des corrections à voix
haute ("14h, en fait non, 15h"), il faut :

1. Installer Ollama : [ollama.com/download](https://ollama.com/download)
2. Ouvrir un terminal et lancer :
   ```
   ollama pull qwen2.5:3b
   ```
3. Basculer sur le mode amélioré dans les réglages de Volubil-IA (ou dès le
   premier lancement).

Ce que ça apporte concrètement :

- Ponctuation naturelle ajoutée automatiquement.
- Ponctuation dictée à voix haute : dire "virgule", "point", "à la ligne",
  "nouveau paragraphe", "ouvrez les guillemets"...
- Gestion des retours en arrière : "on se retrouve à 14h, en fait non, 15h"
  devient "On se retrouve à 15h."
- Un nettoyage plus fin des hésitations et faux départs.

Si Ollama est éteint, absent, ou que le modèle n'est pas installé, Volubil-IA
revient automatiquement au mode simple, sans rien casser : tu verras juste
une petite mention "mode simple utilisé" dans la fenêtre d'état.

## Le dictionnaire personnel

Whisper (le moteur de transcription) déforme parfois les noms propres ou les
mots inhabituels : un prénom comme "Awa Diallo" peut devenir "ava dialo", le
nom d'une entreprise ou un mot technique peut lui aussi être mal reconnu à
chaque fois. Le dictionnaire personnel corrige ça.

- Va dans l'onglet **Dictionnaire** de la fenêtre principale.
- Ajoute la forme correcte (ex : "Awa Diallo") et les variantes que tu as vu
  apparaître (ex : "awa dialo, ava diallo, awa djalo"), séparées par des
  virgules.
- À partir de là, chaque dictée est corrigée automatiquement, même si la
  variante prononcée n'est pas exactement l'une de celles que tu as tapées
  (une tolérance à l'erreur est intégrée).

**La correction rapide** : après chaque dictée, la petite fenêtre d'état (le
HUD) reste affichée 10 secondes avec un bouton crayon "Corriger". Tu peux
aussi corriger n'importe quelle dictée plus tard depuis l'historique de la
fenêtre principale (même bouton crayon). Dans les deux cas, tu retapes le
texte correct, et l'application te propose d'ajouter au dictionnaire les
mots qui ont changé, en un clic.

À savoir honnêtement : Volubil-IA ne surveille jamais ce que tu tapes dans
les autres applications. C'est un choix de confidentialité assumé. La
correction se fait uniquement depuis le HUD ou l'historique, pas en direct
pendant que tu écris ailleurs.

Le fichier vit dans le dossier de données de l'application
(`dictionary.json`), accessible depuis les réglages via "Ouvrir le dossier
des données". Tu peux aussi l'éditer à la main si tu es à l'aise avec ça.

## Limites connues (honnêtement)

- Le raccourci fonctionne en bascule, pas en maintien-appui.
- Certains champs protégés (mots de passe) refusent parfois le collage
  automatique, par sécurité du système.
- Dans les terminaux, le raccourci de collage est souvent Ctrl+Shift+V et
  non Ctrl+V : le texte reste alors dans le presse-papier, à coller
  manuellement.
- Le presse-papier texte est restauré après l'insertion, mais pas les images
  qui auraient pu s'y trouver avant.
- La latence dépend de ta machine et de la taille du modèle choisi : le
  modèle "small" est plus précis mais plus lent que "base".
- Le raccourci par défaut (Ctrl+Space sur Windows, Alt+Space sur Mac) peut
  entrer en conflit avec une autre application déjà installée. Change-le
  dans les réglages si besoin, ou choisis Ctrl+Shift+Space si Volubil-IA te
  prévient d'un conflit au démarrage.

## Pour les bricoleurs

Il faut [Node.js](https://nodejs.org) version 18 ou plus, et le binaire
`whisper-cli` de [whisper.cpp](https://github.com/ggml-org/whisper.cpp)
(les installateurs officiels l'incluent déjà, compilé automatiquement par
GitHub Actions à chaque version).

```
git clone https://github.com/annece29-netizen/Volubil-IA.git
cd Volubil-IA
npm install
```

Pour le développement local, place le binaire `whisper-cli` (ou
`whisper-cli.exe` sur Windows) dans `vendor/win/` ou `vendor/mac/` selon ta
plateforme, ou pointe directement dessus avec la variable d'environnement
`WHISPER_CLI_PATH`.

```
npm start        # lancement en developpement
npm run dist      # fabrique l'installateur pour ta plateforme
npm run icons     # regenere icon.png et build/icon.png
npm run check     # verifie la syntaxe de tous les fichiers .js
```

Les installateurs officiels (.exe et .dmg) sont fabriqués automatiquement
par GitHub Actions à chaque étiquette de version poussée (`git tag v1.0.0`
puis `git push --tags`), avec whisper.cpp compilé à la volée pour chaque
plateforme. Voir `.github/workflows/build.yml`.

## Sous le capot

- **Electron** : seule techno simple et fiable pour une app identique sur
  Windows et Mac, avec accès au micro, au presse-papier et à un raccourci
  clavier global.
- **whisper.cpp** : moteur de transcription vocale open source, rapide et
  entièrement local, pas besoin de compte ni de clé API.
- **Ollama (optionnel)** : sert un petit modèle de langage en local pour le
  mode amélioré. Rien n'est envoyé sur internet, tout reste sur ta machine.
- **Icônes générées par script maison** (`tools/make-icon.js`) : aucune
  dépendance graphique, aucun fichier binaire opaque dans le dépôt.
- **Philosophie vie privée** : pas de capture d'écran, pas de télémétrie, le
  fichier audio temporaire est supprimé juste après la transcription.

Licence MIT : utilise, modifie, partage librement.

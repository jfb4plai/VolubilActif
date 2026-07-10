# VolubilActif

Une application qui transforme ta voix en texte, dans n'importe quelle
application ouverte sur ton ordinateur : ton navigateur, ton traitement de
texte, ta messagerie. Tu appuies sur un raccourci, tu parles, tu appuies à
nouveau, et le texte s'insère directement là où se trouve ton curseur.

VolubilActif est l'adaptation PLAI (Pôle Territorial de la Ville de Liège,
accompagnement vers une école inclusive) de
[Volubil-IA](https://github.com/annece29-netizen/Volubil-IA), créé par
Anne-Cécile Le Dain et publié sous licence MIT. Merci à elle : l'essentiel de
ce qui fonctionne ici vient de son travail.

## Pourquoi cette adaptation

Pour certains élèves, écrire au stylo ou au clavier est un obstacle qui n'a
rien à voir avec leurs idées : dysgraphie, dyslexie, fatigue motrice. La
dictée vocale est un outil de compensation reconnu comme aménagement
raisonnable en Fédération Wallonie-Bruxelles. VolubilActif ajoute à
Volubil-IA ce qu'il faut pour un usage scolaire :

- **Un modèle de transcription plus précis** (Turbo, environ 574 Mo) : voix
  jeunes, accents et bruit de fond pardonnent moins que la voix d'un adulte
  qui dicte au calme. Plus le modèle est grand, plus la reconnaissance est
  fiable.
- **Un mode privé** : sur un ordinateur partagé (classe, local informatique),
  aucune dictée n'est conservée sur la machine. Rien à effacer, rien à
  oublier.
- **Un mode examen** : la voix est transcrite telle quelle, sans passage par
  un modèle d'IA qui pourrait reformuler. Pendant une évaluation, l'outil
  compense le geste d'écriture, pas la rédaction.
- **La ponctuation dictée sans IA** : dire "virgule", "point", "point
  d'interrogation", "à la ligne", "nouveau paragraphe", "ouvrez les
  guillemets" insère le signe correspondant, par simples règles de
  conversion. Elle fonctionne donc partout, y compris en mode examen, sans
  Ollama. Des garde-fous préservent les usages normaux du mot ("point de
  vue", "il marque un point", "3 virgule 5" devient 3,5). Désactivable dans
  les réglages.
- **Le partage du dictionnaire** : l'enseignant prépare le vocabulaire
  technique de son cours (termes de métier, noms d'outils, sigles) et
  distribue le fichier à ses élèves en un clic.
- **Un accueil par code** : sur une machine partagée, un code personnel
  remplace le prénom.

Et surtout, l'argument qui rend l'outil utilisable à l'école : **tout se
passe sur la machine**. La voix d'un élève est une donnée sensible ; ici
elle n'est jamais envoyée sur internet, il n'y a aucun compte à créer,
aucun abonnement, aucune télémétrie. La seule exception, honnêtement
documentée : le tout premier téléchargement du modèle de transcription.

Par défaut, le raccourci fonctionne en mode **bascule** (une pression
démarre, une autre arrête). Un mode **maintien-appui** existe en option dans
les réglages : l'enregistrement dure tant que la touche reste enfoncée, ce
que certains trouvent plus intuitif. Ce mode a un coût technique honnête,
détaillé plus bas dans "Maintien-appui : ce que ça implique".

```
   [Ctrl+Space]  ->  parle  ->  [Ctrl+Space]  ->  texte inséré
```

## Maintien-appui : ce que ça implique

Le mode maintien-appui (Réglages → "Maintenir la touche enfoncée pour
enregistrer") a besoin de détecter le relâchement de la touche, même quand
une autre application (Word, le navigateur) a le focus. Electron ne permet
pas ça nativement : `globalShortcut` ne voit que l'appui, jamais le
relâchement. VolubilActif utilise donc une petite bibliothèque
([uiohook-napi](https://github.com/SnosMe/uiohook-napi)) qui installe une
écoute clavier au niveau du système d'exploitation.

À savoir, honnêtement :

- Cette écoute est techniquement capable de voir toutes les frappes clavier
  de la machine, même si VolubilActif ne réagit qu'à la combinaison choisie
  dans les réglages et n'enregistre ni ne transmet rien d'autre.
- Certains antivirus signalent ce type de bibliothèque au premier lancement,
  car elle ressemble structurellement à un enregistreur de frappe.
- Contrairement au mode bascule, un conflit avec une autre application
  utilisant le même raccourci ne peut pas toujours être détecté à l'avance.

C'est le seul compromis du genre dans l'application : c'est aussi la seule
dépendance runtime du projet (le reste tourne sur les API de base
d'Electron et de Node, sans rien installer d'autre). Le mode bascule, par
défaut, n'utilise pas cette bibliothèque.

## Ce que l'outil ne fait pas (à dire clairement aux élèves)

- Il ne corrige pas l'orthographe de l'élève : il l'évite. Un élève
  dysorthographique qui dicte produit un texte propre, mais n'a pas
  progressé en orthographe. C'est un outil de compensation, pas de
  remédiation : il s'utilise après diagnostic, en accord avec l'équipe.
- Il ne convient pas pendant l'apprentissage du geste d'écriture (début du
  primaire) : il contournerait ce qui est justement en train de s'apprendre.
- Dicter à voix haute expose son texte : prévoir un endroit calme, un
  local à part ou un micro-casque. En pleine classe, c'est rarement
  confortable.

## Les deux modes de nettoyage

| | Mode simple | Mode amélioré |
|---|---|---|
| Ce qu'il fait | Supprime les "euh", les répétitions, corrige les espaces et la majuscule de départ | Ajoute un second passage par un petit modèle de langage local (Ollama) : ponctuation automatique, ponctuation dictée à voix haute, gestion des "en fait non..." |
| Machine conseillée | N'importe quel PC ou Mac récent | 8 Go de RAM ou plus, avec Ollama installé |
| Dépendance externe | Aucune | Ollama, qui tourne lui-même en local |
| En classe | Recommandé (les machines d'école permettent rarement d'installer Ollama) | Plutôt pour la machine personnelle |

Si Ollama est absent ou éteint, VolubilActif revient automatiquement au mode
simple, sans rien casser. Et en **mode examen**, le mode amélioré est ignoré
d'office : transcription brute, nettoyage de base uniquement.

## Mise à jour automatique

À partir de la version 1.4.0, VolubilActif vérifie au démarrage si une
nouvelle version existe sur GitHub, la télécharge en tâche de fond, et te
propose de redémarrer pour l'appliquer (jamais automatique sans ton accord).
Plus besoin de retélécharger l'installateur à chaque nouvelle version.

À savoir honnêtement :

- Sur Windows, ça fonctionne sans accroc.
- Sur Mac, Gatekeeper (le contrôle de sécurité d'Apple) est plus strict avec
  une application non signée : une mise à jour appliquée automatiquement
  peut nécessiter de refaire le geste "clic droit > Ouvrir" une fois la
  nouvelle version en place, comme au premier lancement.
- Cette fonctionnalité a été ajoutée en 1.4.0 : cette version-là ne se
  propose pas de mise à jour vers elle-même, c'est la première qui sait
  vérifier. À partir de la suivante, la mise à jour automatique fonctionne
  normalement.
- La page "À propos" affiche l'état de la vérification en temps réel
  (vérification en cours, mise à jour trouvée, téléchargement, à jour,
  ou échec) : si rien ne se passe après un moment, ouvre cette page pour
  voir ce qu'il se passe réellement plutôt que de deviner.
- La vérification a lieu au démarrage, puis automatiquement toutes les
  4 heures tant que l'app reste ouverte (elle continue de tourner en tâche
  de fond quand tu fermes la fenêtre, sans besoin de la relancer sans
  arrêt). Pour forcer une vérification immédiate, quitte complètement
  (menu de la barre système > Quitter) puis relance.

## Installation Windows

1. Va sur la page **[Téléchargements](https://github.com/jfb4plai/VolubilActif/releases/latest)**
   et récupère le fichier `VolubilActif-Windows-....exe` (section "Assets").
2. Ton navigateur va probablement bloquer le fichier avec un message du type
   "n'est pas fréquemment téléchargé" : c'est sa prudence normale face à une
   application non signée commercialement. Ouvre le panneau des
   téléchargements (Ctrl+J), passe la souris sur le fichier, clique sur les
   trois points "..." puis "Conserver", puis "Conserver quand même".
3. Double-clique sur le fichier. Windows affiche un écran bleu "Windows a
   protégé votre ordinateur" : clique sur "Informations complémentaires"
   puis "Exécuter quand même".
4. L'application s'installe et s'ouvre toute seule.

À savoir pour les écoles : sur un parc informatique géré (droits
administrateur verrouillés), cette installation peut être impossible sans
l'accord du technicien. C'est une limite connue, documentée plus bas.

## Installation Mac (Apple Silicon)

1. Télécharge le fichier `VolubilActif-Mac-....dmg` (section "Assets").
2. Ouvre-le et glisse VolubilActif dans le dossier **Applications**.
3. Au premier lancement, macOS peut bloquer l'ouverture (application non
   signée). Deux façons de contourner :
   - Ouvre **Réglages Système > Confidentialité et sécurité**, descends en
     bas de la page et clique sur **"Ouvrir quand même"**.
   - Ou plus simple : clic droit sur l'application, puis **Ouvrir**.
4. En tout dernier recours, dans le Terminal :
   ```
   xattr -cr /Applications/VolubilActif.app
   ```

Deux autorisations te seront demandées à l'usage :

- **Microphone** : demandée automatiquement au premier enregistrement.
- **Accessibilité** : nécessaire pour coller le texte à ta place dans
  l'application active. Si elle manque, l'app t'ouvre directement le bon
  panneau de réglages.

## Premier lancement

Un petit parcours de bienvenue s'affiche :

1. Choix du mode de nettoyage (simple ou amélioré).
2. Choix du modèle de transcription : **base** (142 Mo, pour tester),
   **small** (466 Mo) ou **turbo** (574 Mo, le plus précis en français,
   conseillé pour un élève). Le téléchargement se fait une seule fois.
3. Rappel du raccourci clavier et petit mode d'emploi.

## Changer de langue ou de modèle sans ouvrir la fenêtre

Le menu de l'icône VolubilActif dans la barre système (clic droit) propose,
en plus du mode simple/amélioré, un accès rapide à la **langue** et au
**modèle de transcription** en cours, sans passer par les réglages
complets. Utile pour basculer d'une dictée en français vers une réunion en
anglais, par exemple. Un modèle pas encore téléchargé apparaît grisé
(« non téléchargé ») : le télécharger d'abord dans les réglages complets.

## Réglages utiles en classe

- **Conservation des dictées** : "Mode privé" pour un ordinateur partagé.
  Rien n'est écrit sur le disque et l'historique existant est effacé.
- **Mode examen** : cochable dans les réglages et directement depuis
  l'icône de la barre système (menu clic droit). La mention "mode examen"
  s'affiche à chaque dictée.
- **Prénom ou code personnel** : sur machine partagée, un code (EL07)
  plutôt qu'un prénom.

## Le dictionnaire personnel et son partage

Whisper déforme parfois les noms propres ou les mots techniques. Le
dictionnaire personnel corrige ça : tu ajoutes la forme correcte et les
variantes mal reconnues, et chaque dictée est corrigée automatiquement
(avec une tolérance aux petites différences).

Nouveau dans VolubilActif : l'onglet Dictionnaire propose **Exporter** et
**Importer** (fichier JSON). Usage typique : l'enseignant de pâtisserie
prépare une fois les termes de son cours mal reconnus par Whisper, exporte
le fichier, et chaque élève l'importe. L'import fusionne avec le
dictionnaire existant, rien n'est écrasé.

**La correction rapide** : après chaque dictée, la petite fenêtre d'état
reste affichée 10 secondes avec un bouton crayon "Corriger". L'élève relit,
corrige, et l'app propose d'ajouter les mots corrigés au dictionnaire. Ce
geste de relecture est aussi un geste d'apprentissage : c'est l'élève qui
garde la main sur son texte, jamais la machine.

## Mode amélioré : installer Ollama

Sur une machine personnelle avec 8 Go de RAM ou plus :

1. Installer Ollama : [ollama.com/download](https://ollama.com/download)
2. Dans un terminal : `ollama pull qwen2.5:3b`
3. Basculer sur le mode amélioré dans les réglages.

Apports : ponctuation naturelle ajoutée automatiquement (sans avoir à la
dicter), gestion des retours en arrière ("14h, en fait non, 15h" devient
"15h"), nettoyage plus fin des faux départs. La ponctuation dictée, elle,
fonctionne dans tous les modes : elle ne dépend pas d'Ollama.

## Limites connues (honnêtement)

- Le raccourci fonctionne en bascule par défaut ; le mode maintien-appui
  (optionnel) a un coût en confidentialité, voir "Maintien-appui : ce que
  ça implique" plus haut.
- Les modèles de reconnaissance vocale sont entraînés surtout sur des voix
  d'adultes : la précision baisse avec les voix jeunes et le bruit de
  classe. Le modèle turbo aide, il ne fait pas de miracle. Tester avec
  l'élève avant d'en faire un outil du quotidien.
- L'application n'est pas signée commercialement : l'installation sur un
  parc scolaire géré demande l'accord du technicien.
- Certains champs protégés (mots de passe) refusent le collage automatique.
- Dans les terminaux, coller se fait souvent avec Ctrl+Shift+V.
- Le presse-papier texte est restauré après l'insertion, pas les images.
- Le raccourci par défaut peut entrer en conflit avec une autre application
  (change-le dans les réglages si besoin).

## Pour les bricoleurs

Il faut [Node.js](https://nodejs.org) version 18 ou plus, et le binaire
`whisper-cli` de [whisper.cpp](https://github.com/ggml-org/whisper.cpp)
(les installateurs officiels l'incluent déjà, compilé par GitHub Actions).

```
git clone https://github.com/jfb4plai/VolubilActif.git
cd VolubilActif
npm install
```

Pour le développement local, place le binaire `whisper-cli` (ou
`whisper-cli.exe` sur Windows) dans `vendor/win/` ou `vendor/mac/`, ou
pointe dessus avec la variable d'environnement `WHISPER_CLI_PATH`.

```
npm start         # lancement en developpement
npm run dist      # fabrique l'installateur pour ta plateforme
npm run icons     # regenere icon.png et build/icon.png
npm run check     # verifie la syntaxe de tous les fichiers .js
```

Les installateurs officiels (.exe et .dmg) sont fabriqués automatiquement
par GitHub Actions à chaque étiquette de version poussée (`git tag v1.1.0`
puis `git push --tags`).

## Sous le capot

- **Electron** : une seule app pour Windows et Mac, avec accès au micro, au
  presse-papier et à un raccourci clavier global.
- **whisper.cpp** : moteur de transcription open source, rapide et
  entièrement local. Modèles base, small et large-v3-turbo (quantisé q5_0).
- **Ollama (optionnel)** : petit modèle de langage local pour le mode
  amélioré. Désactivé d'office en mode examen.
- **Philosophie vie privée** : pas de capture d'écran, pas de télémétrie,
  le fichier audio temporaire est supprimé juste après la transcription,
  et le mode privé n'écrit aucune dictée sur le disque.

## Crédits et licence

Projet d'origine : [Volubil-IA](https://github.com/annece29-netizen/Volubil-IA)
d'Anne-Cécile Le Dain, licence MIT. Adaptation : Jean-François Beguin,
PLAI (Pôle Territorial de la Ville de Liège), dans le cadre de
l'accompagnement vers une école inclusive en Fédération Wallonie-Bruxelles.

Licence MIT : utilise, modifie, partage librement.

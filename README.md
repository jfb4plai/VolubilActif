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

Une précision importante sur le raccourci : il fonctionne en mode **bascule**
(une pression démarre, une autre arrête), pas en mode maintien-appui.

```
   [Ctrl+Space]  ->  parle  ->  [Ctrl+Space]  ->  texte inséré
```

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

- Le raccourci fonctionne en bascule, pas en maintien-appui.
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

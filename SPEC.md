# SPEC — Volubil-IA

> **Écarts VolubilActif (fork PLAI)** : ce document est la spec du projet
> d'origine, conservée telle quelle. Le fork ajoute : modèle `turbo`
> (large-v3-turbo q5_0), réglage `historyRetention` (normal/prive, mode privé
> sans écriture disque), réglage `examMode` (nettoyage simple forcé, jamais de
> LLM), export/import du dictionnaire (fusion), `userName` vide par défaut
> (prénom ou code personnel), rebranding VolubilActif aux couleurs PLAI,
> réglage `dictatedPunctuation` (v1.2.0 : ponctuation dictée convertie par
> règles dans cleanup-simple.js, active dans les deux modes et en mode
> examen ; garde-fous "point de vue", "un point", nombres "3 virgule 5").
> v1.4.0 : mise à jour automatique via electron-updater (main/updater.js),
> deuxième et dernière dépendance runtime prévue. Config `build.publish`
> (provider github) dans package.json, cible `zip` ajoutée pour macOS en
> plus du `dmg` (Squirrel.Mac a besoin d'un zip, pas d'un dmg, pour
> appliquer les mises à jour). Vérifié localement avant publication :
> `electron-builder --publish never` génère bien `dist/latest.yml` avec le
> bon nom de fichier et le sha512, et l'app packagée (`--dir`) démarre sans
> erreur avec le nouveau module charge. CI : `dist/latest*.yml` et
> `dist/*.zip` ajoutés aux fichiers publiés sur la release GitHub.
> v1.3.0 : mode maintien-appui (`holdToTalk`, main/hold-to-talk.js) via
> uiohook-napi, seule dépendance runtime du projet (rompt volontairement la
> règle "ZÉRO dépendance" de la spec upstream) : hook clavier global
> nécessaire pour détecter le relâchement de touche, ce que globalShortcut
> d'Electron ne permet pas. Décision documentée dans le README.
> v1.3.4 : `"npmRebuild": false` dans la config electron-builder de
> package.json. Cause racine des échecs CI v1.3.0 à v1.3.3 : electron-builder
> tentait par défaut de recompiler uiohook-napi via node-gyp pour l'ABI
> d'Electron, alors que c'est un module N-API (ABI stable) qui embarque déjà
> des binaires précompilés pour toutes les plateformes ciblées
> (`node_modules/uiohook-napi/prebuilds/`). Aucune recompilation n'est
> nécessaire ; les correctifs Python/MSVC des versions intermédiaires ont été
> retirés du workflow, devenus inutiles.
> v1.5.0 : changement rapide de langue et de modèle depuis le menu du tray
> (sous-menus radio, même principe que mode simple/amélioré). Un modèle non
> téléchargé apparaît désactivé (`whisper.modeleDejaTelecharge`). Correctif
> associé dans app.js : `onHistoriqueMisAJour` resynchronise les champs
> modèle/langue de Réglages s'ils étaient déjà affichés, pour éviter qu'un
> Enregistrer ultérieur écrase silencieusement un changement fait via le
> tray. Vérifié : détection de modèle testée contre le vrai dossier
> userData, lancement réel de l'app sans erreur.
> v1.5.1 : statut de mise à jour visible sur la page A propos (canal IPC
> `update:state` poussé depuis main/updater.js + `update:get-status` pour
> l'etat au chargement). Corrige le defaut de la v1.4.0 : verification et
> erreurs totalement silencieuses, aucun moyen de savoir si le mecanisme
> fonctionnait. Rappel important : fermer la fenetre ne quitte pas l'app
> (reste dans le tray), donc pas de nouvelle verification sans un vrai
> redemarrage (Quitter puis relancer).
> v1.5.2 : correction des liens externes (GitHub, Ollama) qui remplacaient
> la fenetre de l'app par le site web, sans retour possible. Cause : un
> lien sans target="_blank" navigue la BrowserWindow elle-meme (evenement
> will-navigate), et meme avec target="_blank" Electron 15+ bloque
> silencieusement l'ouverture sans setWindowOpenHandler explicite.
> empecherNavigationExterne() dans main.js intercepte les deux cas et
> ouvre dans le navigateur systeme (shell.openExternal), appliquee a
> fenetrePrincipale et fenetreOnboarding.

Application de dictée vocale 100 % locale, inspirée de Wispr Flow, pour Windows et macOS (Apple Silicon).
Electron, aucune clé API, aucun coût récurrent, aucune donnée qui sort de la machine.

Ce document est la source de vérité pour l'implémentation. En cas de doute, choisir l'option la plus simple et la noter dans la section "Écarts" du rapport final.

## Règles d'écriture NON NÉGOCIABLES

- Tout le texte visible (UI, README, commentaires, messages) est en **français**.
- **INTERDIT d'utiliser le tiret cadratin « — » ou demi-cadratin « – » dans quelque fichier que ce soit** (code, HTML, README, commentaires). Utiliser deux points, virgule, parenthèses ou point à la place.
- Ton du README : simple, chaleureux, vulgarisé, même style que le README d'Avion Messager (référence fournie). Pas de jargon non expliqué.
- Éviter les mots "crucial", "fascinant" et les emojis génériques dans le README.
- Commentaires de code : sobres, en français, seulement quand le code ne peut pas se l'expliquer lui-même.

## Vue d'ensemble

Pipeline : raccourci clavier global (bascule) → enregistrement micro → WAV 16 kHz mono → whisper.cpp local (binaire `whisper-cli` embarqué) → nettoyage (simple par règles, OU amélioré par petit LLM local via Ollama) → application du dictionnaire personnel → insertion du texte au curseur de l'application active (presse-papier + collage simulé) → historique et statistiques.

Deux modes dans UN SEUL build (choix au premier lancement, modifiable dans les réglages) :
1. **Mode simple** : whisper.cpp seul + filtrage des hésitations par règles. Fonctionne sur une machine modeste.
2. **Mode amélioré** : ajoute un second passage par un petit modèle local via Ollama (défaut `qwen2.5:3b`) : ponctuation automatique, ponctuation dictée ("virgule", "point", "à la ligne"...), gestion des retours en arrière ("14h... en fait non, 15h" → "15h"), nettoyage fin. Repli automatique sur le mode simple si Ollama est absent, sans le modèle, ou en erreur/timeout.

## Contraintes techniques

- **Electron ^33**, **electron-builder ^25** en devDependencies. **ZÉRO dépendance runtime** (npm `dependencies` vide) : tout en Node core + API Electron.
- Sécurité Electron : `contextIsolation: true`, `nodeIntegration: false`, préload avec `contextBridge`, aucun contenu distant chargé.
- Single instance lock (`app.requestSingleInstanceLock`).
- La fenêtre principale se ferme → l'app reste dans la barre système (tray). Quitter via le menu du tray.
- Pas de capture d'écran, pas d'analyse du contexte de l'app active. Micro → texte → insertion, rien d'autre.
- Réseau autorisé UNIQUEMENT pour : (a) télécharger le modèle Whisper au premier lancement (Hugging Face), (b) parler à Ollama sur `http://127.0.0.1:11434` (local). Rien d'autre, jamais.

## Arborescence du dépôt

```
volubil-ia/
├── package.json
├── .gitignore                  (node_modules/, dist/, vendor/, whisper.cpp/, *.log)
├── LICENSE                     (MIT, Anne-Cecile Le Dain)
├── README.md
├── SPEC.md                     (ce fichier, à conserver)
├── .github/workflows/build.yml
├── tools/make-icon.js          (génère icon.png 32px et build/icon.png 512px, zéro dépendance)
├── icon.png                    (généré, commité : icône tray)
├── build/icon.png              (généré, commité : icône installateurs)
├── preload.js
├── main/
│   ├── main.js                 (point d'entrée : app, fenêtres, tray, raccourci, machine à états)
│   ├── settings.js             (lecture/écriture settings.json dans userData)
│   ├── recorder-bridge.js      (IPC avec la fenêtre cachée d'enregistrement, WAV 16 kHz)
│   ├── whisper.js              (localisation du binaire, téléchargement du modèle, transcription)
│   ├── cleanup-simple.js       (filtrage hésitations par règles)
│   ├── ollama.js               (détection, nettoyage LLM, prompt, timeout, repli)
│   ├── dictionary.js           (dictionnaire personnel : chargement, application, fuzzy)
│   ├── inserter.js             (presse-papier + collage simulé Windows/macOS, restauration)
│   └── history.js              (historique + statistiques dans userData/history.json)
└── renderer/
    ├── index.html / app.js / styles.css      (fenêtre principale)
    ├── hud.html / hud.js / hud.css           (mini fenêtre d'état pendant la dictée)
    ├── recorder.html / recorder.js           (fenêtre cachée : getUserMedia + AudioWorklet)
    ├── worklet.js                            (AudioWorkletProcessor : capture PCM)
    ├── onboarding.html / onboarding.js       (premier lancement)
    └── correction.html / correction.js       (correction rapide après insertion)
```

## Machine à états (main.js)

`idle → recording → processing → idle`

- Raccourci pressé en `idle` : démarrer l'enregistrement, afficher le HUD.
- Raccourci pressé en `recording` : arrêter, passer en `processing` (transcription → nettoyage → dictionnaire → insertion), puis retour `idle`.
- Raccourci pressé en `processing` : ignoré (petit feedback visuel dans le HUD).
- Garde-fou : enregistrement coupé automatiquement à 5 minutes.
- Enregistrement < 0,5 s ou transcription vide/uniquement du bruit ("[BLANK_AUDIO]", "...", etc.) : ne rien insérer, HUD affiche "Rien entendu".

## Raccourci clavier global

- `globalShortcut` d'Electron. **Mode bascule** (une pression démarre, une pression arrête) : c'est le comportement documenté. Le maintien-relâchement n'est pas supporté par Electron sans module natif, on l'assume et on le documente dans le README.
- Défauts : Windows `Ctrl+Space`, macOS `Alt+Space` (Cmd+Space est pris par Spotlight).
- Si l'enregistrement du raccourci échoue (déjà pris par le système) : essayer `Ctrl+Shift+Space`, notifier l'utilisateur, refléter dans les réglages.
- Réglages : champ de capture du raccourci (écoute keydown, construit l'accélérateur Electron, teste l'enregistrement réel, revient en arrière si échec).

## Enregistrement audio (fenêtre cachée)

- Fenêtre `recorder` créée au démarrage, jamais affichée (`show: false`), jamais focus.
- `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })` + `AudioWorklet` (worklet.js) qui poste les Float32Array au renderer, qui les accumule.
- Sur macOS : appeler `systemPreferences.askForMediaAccess('microphone')` avant la première utilisation.
- Stop : concaténation, envoi au main via IPC (ArrayBuffer), rééchantillonnage en 16 000 Hz mono (interpolation linéaire), conversion Int16, écriture d'un WAV temporaire dans `app.getPath('temp')`.
- **Le WAV temporaire est supprimé juste après la transcription** (confidentialité).
- Niveau micro (RMS) envoyé au HUD pendant l'enregistrement pour un petit vumètre.
- IMPORTANT : ni le HUD ni l'enregistrement ne doivent voler le focus de l'application active, sinon l'insertion ratera sa cible. HUD : `focusable: false`, `showInactive()`, `skipTaskbar: true`, `alwaysOnTop: true`.

## Transcription (whisper.js)

- Binaire : `whisper-cli` (`whisper-cli.exe` sur Windows), cherché dans cet ordre :
  1. variable d'environnement `WHISPER_CLI_PATH` (pour le dev),
  2. `process.resourcesPath + '/bin/whisper-cli(.exe)'` (version installée, via extraResources),
  3. `vendor/win/` ou `vendor/mac/` relatif à la racine du projet (dev local).
  Si introuvable : message clair dans l'UI expliquant quoi faire (README section bricoleurs).
- Modèles : `ggml-base.bin` (~142 Mo, recommandé) ou `ggml-small.bin` (~466 Mo, plus précis), stockés dans `userData/models/`.
- Téléchargement au premier lancement depuis `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-<taille>.bin` avec le module `https` de Node, suivi manuel des redirections (max 5), progression envoyée à l'UI (onboarding et réglages), reprise simple : si fichier incomplet (taille incohérente ou fichier `.part`), re-télécharger.
- Invocation : `spawn(bin, ['-m', modelPath, '-f', wavPath, '-l', settings.language, '-nt', '-t', String(threads)])` avec `threads = max(2, cpus - 2)`. Récupérer stdout (texte), trim. `settings.language` : `fr` par défaut, option `auto`.
- Timeout de sécurité : 120 s, puis kill + message d'erreur propre.

## Nettoyage simple (cleanup-simple.js)

Appliqué dans les DEUX modes (avant Ollama en mode amélioré) :
- Supprimer les hésitations isolées : `euh`, `heu`, `euhh`, `hum`, `hmm`, `mmh`, `bah euh` (insensible à la casse, avec la ponctuation qui les entoure : "Euh, bonjour" → "Bonjour").
- Réduire les doublons immédiats de mots (`le le` → `le`) SAUF pour `nous` et `vous` (répétitions légitimes : "nous nous levons").
- Espaces : pas d'espace avant `.`/`,`, un espace après. Conserver l'espace fine avant `?!;:` à la française (espace simple acceptée).
- Majuscule sur la première lettre du texte final.
- Supprimer les artefacts Whisper : `[BLANK_AUDIO]`, `[Music]`, `(...)`, sous-titres parasites.

## Nettoyage amélioré (ollama.js)

- Détection : `GET http://127.0.0.1:11434/api/tags` (timeout 2 s). Vérifier que `settings.ollamaModel` (défaut `qwen2.5:3b`) est dans la liste (préfixe suffisant : `qwen2.5:3b` matche `qwen2.5:3b-instruct...`).
- Nettoyage : `POST /api/generate` avec `{ model, prompt, stream: false, options: { temperature: 0 } }`, timeout 20 s via AbortController.
- **Tout échec (Ollama absent, modèle absent, timeout, réponse vide ou aberrante) → repli silencieux sur le résultat du nettoyage simple**, avec une petite mention dans le HUD ("mode simple utilisé").
- Réponse aberrante : vide, ou plus de 3 fois la longueur du texte d'entrée, ou contenant des marqueurs de chat ("En tant que", "Voici le texte", etc. : si la réponse ne ressemble pas au texte, prendre le texte simple).
- Le prompt (en français) doit imposer :
  - Ne renvoyer QUE le texte corrigé, sans guillemets ni préambule ni explication.
  - Ajouter une ponctuation naturelle (phrases, majuscules).
  - Appliquer la ponctuation dictée : "virgule" → `,` ; "point" → `.` ; "point d'interrogation" → `?` ; "point d'exclamation" → `!` ; "deux points" → `:` ; "point-virgule" → `;` ; "à la ligne" / "nouvelle ligne" → saut de ligne ; "nouveau paragraphe" → double saut de ligne ; "ouvrez les guillemets" / "fermez les guillemets" → `«` / `»`.
  - Gérer les retours en arrière : "on se retrouve à 14h en fait non 15h" → "On se retrouve à 15h." (marqueurs : "en fait non", "non plutôt", "je veux dire", "pardon", "correction", "non attends"). Ne garder QUE la version finale.
  - Supprimer hésitations et faux départs restants.
  - NE PAS reformuler, NE PAS résumer, NE PAS répondre au contenu, NE PAS ajouter d'information.
  - Respecter exactement l'orthographe des termes du glossaire (injecter la liste des formes correctes du dictionnaire personnel dans le prompt).
  - Inclure 3 exemples few-shot dans le prompt, dont l'exemple 14h/15h et un exemple de ponctuation dictée.

## Dictionnaire personnel (dictionary.js)

- Fichier `userData/dictionary.json`, lisible et éditable à la main :
```json
{ "entries": [ { "correct": "Awa Diallo", "variants": ["awa dialo", "ava diallo", "awa djalo"] } ] }
```
- Application après le nettoyage (dans les deux modes), AVANT l'insertion :
  - Normalisation : minuscules, accents retirés (NFD), espaces/traits d'union/apostrophes retirés.
  - Table : forme normalisée (de chaque variante ET de la forme correcte) → forme correcte.
  - Parcours du texte en n-grammes de mots (3, puis 2, puis 1, les plus longs d'abord), en préservant la ponctuation collée au dernier mot.
  - Correspondance exacte sur la forme normalisée, PLUS correspondance floue (distance de Levenshtein ≤ 1 pour les clés normalisées de longueur ≥ 5, ≤ 2 pour longueur ≥ 10). Implémenter Levenshtein en 20 lignes, pas de dépendance.
  - Préserver la casse de début de phrase (si le mot remplacé démarrait la phrase avec une majuscule et que la forme correcte commence par une minuscule, garder la forme correcte telle quelle : c'est son orthographe officielle qui prime).
- Gestion dans l'UI (page Dictionnaire) : liste, ajout (forme correcte + variantes séparées par des virgules), édition, suppression. Rechargé à chaud si modifié à la main (fs.watch avec debounce, ou relecture à chaque dictée : relecture à chaque dictée suffit, le fichier est minuscule).

## Correction rapide (correction.html)

- Après chaque insertion, le HUD reste 10 s avec un bouton crayon "Corriger".
- Clic : petite fenêtre avec le texte inséré dans un textarea. L'utilisatrice corrige à la main, clique "Enregistrer".
- L'app fait un diff mot à mot entre l'ancien et le nouveau texte, et pour chaque paire (mot remplacé → mot corrigé), propose en un clic "Ajouter au dictionnaire" (cases à cocher pré-cochées, bouton Valider).
- Le texte corrigé est recopié dans le presse-papier (message : "Texte corrigé copié, collez-le si besoin").
- Même flux accessible depuis l'historique de la fenêtre principale (bouton crayon sur chaque entrée).
- On documente honnêtement dans le README : l'app ne surveille PAS ce que l'utilisatrice tape dans les autres applications (choix de confidentialité), la correction se fait depuis le HUD ou l'historique.

## Insertion du texte (inserter.js)

1. Sauvegarder le presse-papier texte actuel (`clipboard.readText()`).
2. `clipboard.writeText(texteFinal)`.
3. Simuler le collage SANS voler le focus :
   - Windows : `cscript //nologo <tmp>.vbs` contenant `WScript.CreateObject("WScript.Shell").SendKeys "^v"` (démarrage rapide). Si cscript échoue : repli PowerShell `-NoProfile -Command "$w = New-Object -ComObject wscript.shell; $w.SendKeys('^v')"`.
   - macOS : `osascript -e 'tell application "System Events" to keystroke "v" using command down'`. Si erreur d'autorisation (code non nul, stderr contenant "1002" ou "not allowed") : notification expliquant d'ajouter Volubil-IA dans Réglages Système > Confidentialité et sécurité > Accessibilité, et ouvrir ce panneau via `open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"`.
4. Après 1 s, restaurer l'ancien presse-papier (texte uniquement, limitation documentée).
5. Si l'insertion échoue : laisser le texte dans le presse-papier et notifier "Texte prêt dans le presse-papier, faites Ctrl+V" (Cmd+V sur Mac).

## Fenêtre principale (index.html)

Style inspiré de Wispr Flow : fond crème (#faf7f2), encre foncée (#1f1d1a), accent chaud (#c96f4a), titres avec serif (Georgia), interface aérée. Thème unique clair. Barre latérale : Accueil, Dictionnaire, Réglages, À propos.

- **Accueil** : "Bon retour, {prénom}" (réglage `userName`, défaut "Anne-Cécile"), 3 cartes de stats (mots au total, mots/minute en moyenne, jours d'affilée), historique groupé par jour (heure + texte, boutons copier et corriger, bouton "Tout effacer" avec confirmation).
- **Dictionnaire** : cf. plus haut.
- **Réglages** : prénom, raccourci (capture), taille du modèle (base/small, avec re-téléchargement et progression), langue (fr/auto), mode (simple/amélioré avec vérification Ollama en direct : pastille verte "Ollama détecté, modèle prêt" / orange "Ollama présent mais modèle absent : commande à copier `ollama pull qwen2.5:3b`" / rouge "Ollama non détecté" + lien https://ollama.com/download + bouton "Re-tester"), nom du modèle Ollama, bouton "Ouvrir le dossier des données".
- **À propos** : version, philosophie (tout est local, rien ne sort de la machine), lien GitHub.

## HUD (hud.html)

Petite fenêtre frameless, transparente, toujours au premier plan, bas de l'écran centré, non focusable. États : 
- enregistrement : point rouge pulsant + chrono + vumètre,
- transcription : spinner "Transcription...",
- nettoyage : "Nettoyage..." (mode amélioré),
- succès : "✓ 24 mots insérés" + bouton crayon, disparaît après 10 s,
- erreurs : message court.

## Onboarding (premier lancement, onboarding.html)

1. Bienvenue + promesse de confidentialité.
2. Choix du mode : deux cartes (Simple : léger, n'importe quelle machine / Amélioré : nécessite Ollama et 8 Go de RAM ou plus, ponctuation et corrections intelligentes). Si Amélioré : vérification Ollama en direct, guidage (lien, commande `ollama pull`), bouton "Continuer en simple pour l'instant" (le mode se change dans les réglages à tout moment).
3. Choix du modèle Whisper : base (recommandé, rapide) / small (plus précis, plus lourd) + téléchargement avec barre de progression.
4. Rappel du raccourci clavier et mini mode d'emploi (appuyer, parler, réappuyer).
5. Terminé : la fenêtre principale s'ouvre, `settings.onboardingDone = true`.

## Réglages (settings.js)

`userData/settings.json` :
```json
{
  "onboardingDone": false,
  "userName": "Anne-Cécile",
  "hotkey": "<défaut plateforme>",
  "modelSize": "base",
  "language": "fr",
  "mode": "simple",
  "ollamaModel": "qwen2.5:3b",
  "ollamaUrl": "http://127.0.0.1:11434"
}
```
Lecture avec valeurs par défaut si champ manquant (merge), écriture atomique (fichier temporaire puis rename).

## Historique et statistiques (history.js)

`userData/history.json` : `{ "entries": [ { "ts", "text", "rawText", "durationMs", "mode", "words" } ] }`, plafonné à 500 entrées (les plus anciennes éjectées). Stats calculées : total de mots, mots/minute moyens (mots / durée de parole), jours consécutifs avec au moins une dictée (streak, calculé sur les dates locales).

## Tray

Icône (icon.png), infobulle "Volubil-IA", menu : Ouvrir Volubil-IA, état du raccourci (désactivé, informatif), Mode simple / Mode amélioré (radio, bascule directe), Quitter. Clic simple sur l'icône : ouvrir la fenêtre principale.

## Icônes (tools/make-icon.js)

Même technique que le script d'Avion Messager fourni en référence (PNG encodé à la main, zéro dépendance) : disque bleu nuit (#2c3e6b) avec un micro blanc stylisé (capsule arrondie approximée par rectangle + demi-cercles en pixels, pied vertical, base horizontale). Générer icon.png (32) et build/icon.png (512). Les PNG générés sont commités.

## package.json (build electron-builder)

S'inspirer du package.json d'Avion Messager fourni en référence. Points spécifiques :
- `"name": "volubil-ia"`, `"productName": "Volubil-IA"`, `"version": "1.0.0"`, author "Anne-Cecile Le Dain", licence MIT, repository https://github.com/annece29-netizen/Volubil-IA.git
- scripts : `start`, `dist`, `icons` (node tools/make-icon.js), `check` (node --check sur tous les .js du projet, via un petit script tools/check.js qui parcourt main/, renderer/, preload.js, tools/).
- build :
  - `appId: "fr.annececile.volubil-ia"`
  - files : main/, renderer/, preload.js, icon.png
  - win : target nsis, `extraResources: [{ "from": "vendor/win", "to": "bin" }]` ; nsis : oneClick true, artifactName `Volubil-IA-Windows-${version}.${ext}`
  - mac : target dmg, arch **arm64** uniquement, category productivity, artifactName `Volubil-IA-Mac-${version}.${ext}`, `extraResources: [{ "from": "vendor/mac", "to": "bin" }]`, `extendInfo: { "NSMicrophoneUsageDescription": "Volubil-IA utilise le micro pour la dictée vocale, entièrement en local." }`

## GitHub Actions (.github/workflows/build.yml)

S'inspirer du workflow d'Avion Messager fourni en référence (déclencheur tags v*, permissions contents: write, softprops/action-gh-release@v2). Différences :
- Matrice windows-latest / macos-latest. macos-latest est en Apple Silicon : parfait pour le .dmg arm64.
- Étape supplémentaire AVANT `npm ci` : compiler whisper.cpp et placer le binaire dans vendor/ :
  ```
  git clone --depth 1 --branch v1.7.4 https://github.com/ggml-org/whisper.cpp
  cmake -S whisper.cpp -B whisper.cpp/build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF
    (+ Windows : -DCMAKE_MSVC_RUNTIME_LIBRARY="MultiThreaded")
    (+ macOS : -DGGML_METAL_EMBED_LIBRARY=ON)
  cmake --build whisper.cpp/build --config Release -j
  ```
  Puis copier `whisper.cpp/build/bin/Release/whisper-cli.exe` (Windows, chemin alternatif sans Release/ à gérer) ou `whisper.cpp/build/bin/whisper-cli` (macOS) vers `vendor/win/` ou `vendor/mac/`.
  Utiliser `actions/cache` sur le dossier de build whisper.cpp, clé = os + tag whisper, pour accélérer les re-runs.
- Étape `npm run check` avant le build (filet de sécurité syntaxe).
- Release : nom `Volubil-IA ${{ github.ref_name }}`, corps en français sur le modèle d'Avion Messager (quel fichier télécharger selon la machine + lien README), fichiers `dist/*.exe` et `dist/*.dmg`.

## README.md (en français, ton Avion Messager)

Sections attendues :
1. Présentation : ce que fait l'app, la promesse (dictée dans n'importe quelle application, tout en local, aucun abonnement, aucune donnée envoyée). Mentionner honnêtement le fonctionnement en bascule du raccourci.
2. Les deux modes, avec un tableau comparatif (ce que fait chacun, config machine conseillée : simple = n'importe quel PC/Mac récent, amélioré = 8 Go de RAM ou plus et Ollama installé). Comment choisir à l'installation et comment changer d'avis ensuite (réglages).
3. Installation Windows : téléchargement de la release + contournement SmartScreen, reprendre le pas à pas éprouvé du README d'Avion Messager (navigateur "Conserver", puis "Informations complémentaires" / "Exécuter quand même").
4. Installation Mac (Apple Silicon) : dmg, glisser dans Applications, contournement Gatekeeper (Réglages Système > Confidentialité et sécurité > "Ouvrir quand même", ou clic droit > Ouvrir), et si besoin la commande `xattr -cr /Applications/Volubil-IA.app` en dernier recours. Autorisations à accorder : micro (demandé au premier enregistrement) et Accessibilité (pour l'insertion du texte, guidage intégré).
5. Premier lancement : choix du mode, téléchargement du modèle (142 Mo ou 466 Mo, une seule fois), rappel du raccourci.
6. Mode amélioré : installer Ollama (https://ollama.com/download), puis `ollama pull qwen2.5:3b`, et ce que ça apporte (ponctuation dictée, "en fait non", nettoyage fin). Ce qui se passe si Ollama est éteint (repli automatique en simple).
7. Le dictionnaire personnel : à quoi ça sert (noms de personnes, d'entreprises, mots techniques...), comment ajouter des mots, la correction rapide après dictée, où vit le fichier JSON.
8. Limites connues honnêtes : bascule (pas de maintien-appui), champs protégés (mots de passe) parfois réfractaires au collage, terminaux qui collent avec Ctrl+Shift+V, presse-papier texte restauré mais pas les images, latence selon la machine et la taille du modèle, le raccourci par défaut peut entrer en conflit avec certaines apps (changer dans les réglages).
9. Pour les bricoleurs : clone, npm install, où placer whisper-cli (vendor/ ou WHISPER_CLI_PATH), npm start, npm run dist, et le fait que les installateurs officiels sont fabriqués par GitHub Actions à chaque tag.
10. Sous le capot : Electron, whisper.cpp (et pourquoi), Ollama optionnel, icônes générées par script, philosophie vie privée (pas de capture d'écran, pas de télémétrie, WAV supprimé après transcription).

## Vérifications OBLIGATOIRES avant de rendre la main

1. `node tools/make-icon.js` : génère les deux PNG sans erreur.
2. `npm install` : s'exécute sans erreur (crée package-lock.json, indispensable pour `npm ci` en CI).
3. `npm run check` : node --check passe sur TOUS les fichiers .js (main/, renderer/, tools/, preload.js).
4. Vérifier à la main la cohérence des canaux IPC entre main, preload et les renderers (chaque canal invoqué existe côté main, chaque événement envoyé est écouté).
5. Vérifier que le YAML du workflow est syntaxiquement valide (indentation propre; si un validateur simple est disponible, l'utiliser, sinon relecture attentive).
6. NE PAS faire de git init, NE PAS pousser : c'est géré ensuite.
7. Rapport final : liste des fichiers créés, écarts par rapport à la spec (section "Écarts"), points d'attention pour les tests réels.

// Point d'entree de VolubilActif : fenetres, tray, raccourci global et machine
// a etats du pipeline de dictee (idle -> recording -> processing -> idle).
const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  ipcMain,
  clipboard,
  shell,
  systemPreferences,
  nativeImage,
  dialog,
} = require('electron');
const path = require('path');
const fs = require('fs');

const { Settings } = require('./settings');
const { History } = require('./history');
const { Dictionary } = require('./dictionary');
const whisper = require('./whisper');
const { nettoyerSimple, appliquerPonctuationDictee, retirerHallucinations } = require('./cleanup-simple');
const holdToTalk = require('./hold-to-talk');
const { initialiserMiseAJour } = require('./updater');
const { nettoyerAmeliore, detecterOllama } = require('./ollama');
const { insererTexte } = require('./inserter');
const recorderBridge = require('./recorder-bridge');

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let settings;
let history;
let dictionary;

let fenetrePrincipale = null;
let fenetreHud = null;
let fenetreRecorder = null;
let fenetreOnboarding = null;
let fenetreCorrection = null;
let tray = null;

let etat = 'idle'; // idle | recording | processing
let debutEnregistrement = 0;
let entreeCorrectionCourante = null;
let minuteurCoupureAuto = null;

const DUREE_MAX_ENREGISTREMENT_MS = 5 * 60 * 1000;
const DUREE_MIN_ENREGISTREMENT_MS = 500;

function cheminIcone() {
  return path.join(__dirname, '..', 'icon.png');
}

// ---------------------------------------------------------------------------
// Fenetres
// ---------------------------------------------------------------------------

function creerFenetrePrincipale() {
  if (fenetrePrincipale) {
    fenetrePrincipale.show();
    fenetrePrincipale.focus();
    return;
  }

  fenetrePrincipale = new BrowserWindow({
    width: 980,
    height: 700,
    minWidth: 760,
    minHeight: 560,
    title: 'VolubilActif',
    icon: cheminIcone(),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  fenetrePrincipale.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  fenetrePrincipale.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      fenetrePrincipale.hide();
    }
  });

  fenetrePrincipale.on('closed', () => {
    fenetrePrincipale = null;
  });
}

function creerFenetreOnboarding() {
  fenetreOnboarding = new BrowserWindow({
    width: 720,
    height: 620,
    title: 'Bienvenue dans VolubilActif',
    icon: cheminIcone(),
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  fenetreOnboarding.loadFile(path.join(__dirname, '..', 'renderer', 'onboarding.html'));

  fenetreOnboarding.on('closed', () => {
    fenetreOnboarding = null;
  });
}

function creerFenetreHud() {
  fenetreHud = new BrowserWindow({
    width: 340,
    height: 90,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    icon: cheminIcone(),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  fenetreHud.setAlwaysOnTop(true, 'screen-saver');
  fenetreHud.loadFile(path.join(__dirname, '..', 'renderer', 'hud.html'));

  positionnerHud();

  fenetreHud.on('closed', () => {
    fenetreHud = null;
  });
}

function positionnerHud() {
  if (!fenetreHud) return;
  const { screen } = require('electron');
  const zoneTravail = screen.getPrimaryDisplay().workArea;
  const [largeur, hauteur] = fenetreHud.getSize();
  const x = Math.round(zoneTravail.x + (zoneTravail.width - largeur) / 2);
  const y = Math.round(zoneTravail.y + zoneTravail.height - hauteur - 24);
  fenetreHud.setPosition(x, y);
}

let minuteurMasquageHud = null;

function annulerMasquageHud() {
  if (minuteurMasquageHud) {
    clearTimeout(minuteurMasquageHud);
    minuteurMasquageHud = null;
  }
}

function afficherHud(etatHud, donnees) {
  if (!fenetreHud) return;
  // Chaque nouvel etat annule le masquage programme : un enregistrement
  // fraichement demarre ne doit pas etre masque par un minuteur precedent.
  annulerMasquageHud();
  positionnerHud();
  fenetreHud.showInactive();
  fenetreHud.webContents.send('hud:state', { etat: etatHud, ...donnees });
}

function masquerHud() {
  annulerMasquageHud();
  if (fenetreHud) fenetreHud.hide();
}

// Programme le masquage du HUD apres un delai : 10 s apres un succes (le
// temps de cliquer le bouton crayon), 8 s apres une erreur ou un silence.
function masquerHudApres(delaiMs) {
  annulerMasquageHud();
  minuteurMasquageHud = setTimeout(() => {
    minuteurMasquageHud = null;
    if (fenetreHud) fenetreHud.hide();
  }, delaiMs);
}

function creerFenetreRecorder() {
  fenetreRecorder = new BrowserWindow({
    width: 200,
    height: 100,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  fenetreRecorder.loadFile(path.join(__dirname, '..', 'renderer', 'recorder.html'));

  fenetreRecorder.on('closed', () => {
    fenetreRecorder = null;
  });
}

function creerFenetreCorrection(entree) {
  entreeCorrectionCourante = entree;

  if (fenetreCorrection) {
    fenetreCorrection.focus();
    fenetreCorrection.webContents.send('correction:refresh', entree);
    return;
  }

  fenetreCorrection = new BrowserWindow({
    width: 560,
    height: 480,
    title: 'Corriger la dictée',
    icon: cheminIcone(),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  fenetreCorrection.loadFile(path.join(__dirname, '..', 'renderer', 'correction.html'));

  fenetreCorrection.on('closed', () => {
    fenetreCorrection = null;
    entreeCorrectionCourante = null;
  });
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------

function construireMenuTray() {
  const modeAmeliore = settings.get('mode') === 'ameliore';

  return Menu.buildFromTemplate([
    { label: 'Ouvrir VolubilActif', click: () => creerFenetrePrincipale() },
    { type: 'separator' },
    { label: `Raccourci : ${settings.get('hotkey')}`, enabled: false },
    { type: 'separator' },
    {
      label: 'Mode simple',
      type: 'radio',
      checked: !modeAmeliore,
      click: () => changerMode('simple'),
    },
    {
      label: 'Mode amélioré',
      type: 'radio',
      checked: modeAmeliore,
      click: () => changerMode('ameliore'),
    },
    { type: 'separator' },
    {
      label: 'Mode examen (transcription brute, sans IA)',
      type: 'checkbox',
      checked: Boolean(settings.get('examMode')),
      click: (item) => changerModeExamen(item.checked),
    },
    { type: 'separator' },
    {
      label: 'Quitter',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
}

function rafraichirMenuTray() {
  if (tray) tray.setContextMenu(construireMenuTray());
}

function changerMode(mode) {
  settings.set({ mode });
  rafraichirMenuTray();
  if (fenetrePrincipale) fenetrePrincipale.webContents.send('history:updated');
}

function changerModeExamen(actif) {
  settings.set({ examMode: Boolean(actif) });
  rafraichirMenuTray();
  if (fenetrePrincipale) fenetrePrincipale.webContents.send('history:updated');
}

// Barre de menus : celle par defaut d'Electron est en anglais (File, Edit...).
// Sur Windows et Linux, l'app n'en a pas besoin : on la retire. Sur macOS,
// les raccourcis Cmd+C/V passent par le menu : on fournit un menu en francais.
function construireMenuApplication() {
  if (process.platform !== 'darwin') return null;
  return Menu.buildFromTemplate([
    {
      label: 'VolubilActif',
      submenu: [
        { role: 'about', label: 'À propos de VolubilActif' },
        { type: 'separator' },
        { role: 'hide', label: 'Masquer VolubilActif' },
        { role: 'unhide', label: 'Tout afficher' },
        { type: 'separator' },
        { role: 'quit', label: 'Quitter VolubilActif' },
      ],
    },
    {
      label: 'Édition',
      submenu: [
        { role: 'undo', label: 'Annuler' },
        { role: 'redo', label: 'Rétablir' },
        { type: 'separator' },
        { role: 'cut', label: 'Couper' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' },
        { role: 'selectAll', label: 'Tout sélectionner' },
      ],
    },
    {
      label: 'Fenêtre',
      submenu: [
        { role: 'minimize', label: 'Réduire' },
        { role: 'close', label: 'Fermer' },
      ],
    },
  ]);
}

function creerTray() {
  tray = new Tray(cheminIcone());
  tray.setToolTip('VolubilActif');
  tray.setContextMenu(construireMenuTray());
  tray.on('click', () => creerFenetrePrincipale());
}

// ---------------------------------------------------------------------------
// Raccourci clavier global
// ---------------------------------------------------------------------------

function modeRaccourciCourant() {
  return settings.get('holdToTalk') ? 'maintien' : 'bascule';
}

// Enregistre l'accelerateur selon le mode courant. Mode bascule : globalShortcut
// d'Electron (une pression demarre, une autre arrete). Mode maintien : hook
// clavier global (hold-to-talk.js), qui detecte aussi le relachement.
function enregistrerRaccourci(accelerateur) {
  globalShortcut.unregisterAll();
  holdToTalk.arreterEcoute();

  if (modeRaccourciCourant() === 'maintien') {
    return holdToTalk.demarrerEcoute(accelerateur, {
      onDemarrer: () => {
        if (etat === 'idle') {
          demarrerEnregistrement();
        } else if (etat === 'processing') {
          afficherHud('occupe', {});
          setTimeout(() => {
            if (etat === 'processing') afficherHud('transcription', {});
          }, 600);
        }
      },
      onArreter: () => {
        if (etat === 'recording') arreterEnregistrement();
      },
    });
  }

  return globalShortcut.register(accelerateur, () => surAppuiRaccourci());
}

function initialiserRaccourci() {
  const raccourciSouhaite = settings.get('hotkey');
  let succes = enregistrerRaccourci(raccourciSouhaite);

  if (!succes) {
    const repli = 'Ctrl+Shift+Space';
    succes = enregistrerRaccourci(repli);
    if (succes) {
      settings.set({ hotkey: repli });
      if (fenetrePrincipale) {
        fenetrePrincipale.webContents.send('history:updated');
      }
    }
  }

  rafraichirMenuTray();
  return succes;
}

function surAppuiRaccourci() {
  if (etat === 'idle') {
    demarrerEnregistrement();
  } else if (etat === 'recording') {
    arreterEnregistrement();
  } else {
    // processing : ignore, petit feedback visuel.
    afficherHud('occupe', {});
    setTimeout(() => {
      if (etat === 'processing') afficherHud('transcription', {});
    }, 600);
  }
}

// ---------------------------------------------------------------------------
// Machine a etats du pipeline
// ---------------------------------------------------------------------------

async function demarrerEnregistrement() {
  etat = 'recording';

  // Sur macOS, verifier l'acces au micro avant de lancer la capture : la
  // boite de dialogue systeme s'affiche au premier usage.
  if (process.platform === 'darwin') {
    const statutMicro = systemPreferences.getMediaAccessStatus('microphone');
    if (statutMicro !== 'granted') {
      const accorde = await systemPreferences.askForMediaAccess('microphone');
      if (!accorde) {
        etat = 'idle';
        afficherHud('erreur', {
          message: 'Accès au micro refusé. Autorise VolubilActif dans Réglages Système > Confidentialité et sécurité > Microphone.',
        });
        masquerHudApres(8000);
        return;
      }
    }
  }

  debutEnregistrement = Date.now();
  afficherHud('enregistrement', { depart: debutEnregistrement });

  if (fenetreRecorder) {
    fenetreRecorder.webContents.send('recorder:start');
  }

  minuteurCoupureAuto = setTimeout(() => {
    if (etat === 'recording') arreterEnregistrement();
  }, DUREE_MAX_ENREGISTREMENT_MS);
}

function arreterEnregistrement() {
  if (minuteurCoupureAuto) {
    clearTimeout(minuteurCoupureAuto);
    minuteurCoupureAuto = null;
  }
  etat = 'processing';
  afficherHud('transcription', {});

  if (fenetreRecorder) {
    fenetreRecorder.webContents.send('recorder:stop');
  }
}

async function traiterAudio(arrayBuffer, sampleRate) {
  const dureeMs = Date.now() - debutEnregistrement;

  if (dureeMs < DUREE_MIN_ENREGISTREMENT_MS) {
    afficherHud('rien-entendu', {});
    masquerHudApres(8000);
    etat = 'idle';
    return;
  }

  let cheminWav = null;
  try {
    cheminWav = recorderBridge.creerWavTemporaire(arrayBuffer, sampleRate);

    const texteBrut = await whisper.transcrire(cheminWav, {
      userDataPath: app.getPath('userData'),
      modelSize: settings.get('modelSize'),
      language: settings.get('language'),
    });

    if (estTexteVideOuBruit(texteBrut)) {
      afficherHud('rien-entendu', {});
      masquerHudApres(8000);
      return;
    }

    // Ponctuation dictee convertie par regles, avant les deux branches :
    // elle fonctionne donc aussi en mode examen et dans le repli du mode
    // ameliore, sans dependre d'un modele de langage.
    const texteTraite = settings.get('dictatedPunctuation') !== false
      ? appliquerPonctuationDictee(texteBrut)
      : texteBrut;

    // En mode examen, on force le nettoyage simple : la voix est transcrite
    // telle quelle, jamais reformulee par un modele de langage (equite).
    const modeExamen = Boolean(settings.get('examMode'));
    const modeCourant = modeExamen ? 'simple' : settings.get('mode');
    let texteNettoye;
    let modeUtilise;

    if (modeCourant === 'ameliore') {
      afficherHud('nettoyage', {});
      const resultat = await nettoyerAmeliore(
        texteTraite,
        settings.getAll(),
        dictionary.listeFormesCorrectes()
      );
      texteNettoye = resultat.texte;
      modeUtilise = resultat.modeUtilise;
    } else {
      texteNettoye = nettoyerSimple(texteTraite);
      modeUtilise = 'simple';
    }

    const texteFinal = dictionary.appliquer(texteNettoye);

    const resultatInsertion = await insererTexte(texteFinal);

    history.ajouter({
      text: texteFinal,
      rawText: texteBrut,
      durationMs: dureeMs,
      mode: modeUtilise,
    });
    if (fenetrePrincipale) fenetrePrincipale.webContents.send('history:updated');

    const nbMots = texteFinal.trim().length ? texteFinal.trim().split(/\s+/).length : 0;

    if (resultatInsertion.succes) {
      let mention = '';
      if (modeExamen) {
        mention = ' (mode examen)';
      } else if (modeUtilise === 'simple' && modeCourant === 'ameliore') {
        mention = ' (mode simple utilisé)';
      }
      afficherHud('succes', { texte: texteFinal, nbMots, mention });
      masquerHudApres(10000);
    } else if (resultatInsertion.autorisationManquante) {
      afficherHud('erreur', {
        message: 'Autorisation Accessibilité manquante. Réglages ouverts, voir le README.',
      });
      masquerHudApres(8000);
    } else {
      afficherHud('erreur', {
        message: 'Texte prêt dans le presse-papier, collez-le manuellement.',
      });
      masquerHudApres(8000);
    }
  } catch (err) {
    afficherHud('erreur', { message: err.message || 'Erreur pendant la transcription.' });
    masquerHudApres(8000);
  } finally {
    if (cheminWav) recorderBridge.supprimerFichier(cheminWav);
    etat = 'idle';
  }
}

function estTexteVideOuBruit(texte) {
  if (!texte) return true;
  // Les hallucinations de Whisper sur le silence ("Sous-titrage Société
  // Radio-Canada"...) comptent comme du silence : rien ne doit etre insere.
  const nettoye = retirerHallucinations(texte)
    .replace(/\[BLANK_AUDIO\]/gi, '')
    .replace(/\.\.\./g, '')
    .replace(/[.,!?\s]+/g, ' ')
    .trim();
  return nettoye.length === 0;
}

// ---------------------------------------------------------------------------
// Gestionnaires IPC
// ---------------------------------------------------------------------------

function enregistrerGestionnairesIpc() {
  ipcMain.handle('settings:get', () => settings.getAll());

  ipcMain.handle('settings:save', (_event, partiel) => {
    const ancienRaccourci = settings.get('hotkey');
    const ancienMaintien = Boolean(settings.get('holdToTalk'));
    const misAJour = settings.set(partiel);

    const raccourciChange = partiel.hotkey && partiel.hotkey !== ancienRaccourci;
    const modeChange = partiel.holdToTalk !== undefined && Boolean(partiel.holdToTalk) !== ancienMaintien;

    if (raccourciChange || modeChange) {
      // Le renderer doit d'abord tester via settings:test-hotkey ; ici on
      // applique simplement le changement deja valide (raccourci et/ou mode).
      enregistrerRaccourci(misAJour.hotkey);
    }

    if (partiel.historyRetention !== undefined) {
      history.definirRetention(misAJour.historyRetention);
      if (fenetrePrincipale) fenetrePrincipale.webContents.send('history:updated');
    }

    rafraichirMenuTray();
    return misAJour;
  });

  ipcMain.handle('settings:test-hotkey', (_event, accelerateur) => {
    if (modeRaccourciCourant() === 'maintien') {
      // En mode maintien, uiohook ne "reserve" pas exclusivement la
      // combinaison aupres du systeme (contrairement a globalShortcut) : le
      // test verifie seulement que ce module reconnait les touches choisies,
      // pas l'absence de conflit avec une autre application.
      const succes = enregistrerRaccourci(accelerateur);
      if (!succes) enregistrerRaccourci(settings.get('hotkey'));
      return { succes };
    }
    globalShortcut.unregisterAll();
    const succes = globalShortcut.register(accelerateur, () => surAppuiRaccourci());
    if (!succes) {
      // Retablir l'ancien raccourci si le test echoue.
      enregistrerRaccourci(settings.get('hotkey'));
    }
    return { succes };
  });

  ipcMain.handle('settings:open-data-folder', () => {
    shell.openPath(app.getPath('userData'));
  });

  ipcMain.handle('ollama:test', async () => {
    return detecterOllama(settings.getAll());
  });

  ipcMain.handle('whisper:download-model', async (event, taille) => {
    try {
      await whisper.telechargerModele(app.getPath('userData'), taille, (progression) => {
        event.sender.send('whisper:download-progress', progression);
      });
      return { succes: true };
    } catch (err) {
      return { succes: false, erreur: err.message };
    }
  });

  ipcMain.handle('history:get', () => history.getAll());
  ipcMain.handle('history:stats', () => history.statistiques());
  ipcMain.handle('history:clear', () => {
    history.effacer();
    return true;
  });
  ipcMain.handle('clipboard:write', (_event, texte) => {
    clipboard.writeText(texte);
    return true;
  });

  ipcMain.handle('dictionary:get', () => dictionary.getAll());
  ipcMain.handle('dictionary:add', (_event, entree) => dictionary.ajouter(entree));
  ipcMain.handle('dictionary:update', (_event, index, entree) => dictionary.modifier(index, entree));
  ipcMain.handle('dictionary:remove', (_event, index) => dictionary.supprimer(index));

  // Partage du dictionnaire : un enseignant prepare le vocabulaire de son
  // cours, exporte le fichier, les eleves l'importent (fusion sans ecrasement).
  ipcMain.handle('dictionary:export', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Exporter le dictionnaire',
      defaultPath: 'dictionnaire-volubilactif.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { succes: false, annule: true };
    try {
      fs.writeFileSync(
        filePath,
        JSON.stringify({ entries: dictionary.getAll() }, null, 2),
        'utf8'
      );
      return { succes: true, chemin: filePath };
    } catch (err) {
      return { succes: false, erreur: err.message };
    }
  });

  ipcMain.handle('dictionary:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Importer un dictionnaire',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths || !filePaths[0]) return { succes: false, annule: true };
    try {
      const contenu = fs.readFileSync(filePaths[0], 'utf8');
      const json = JSON.parse(contenu);
      if (!Array.isArray(json.entries)) {
        return { succes: false, erreur: 'Fichier invalide : liste "entries" absente.' };
      }
      const bilan = dictionary.fusionner(json.entries);
      return { succes: true, ...bilan };
    } catch (err) {
      return { succes: false, erreur: err.message };
    }
  });

  ipcMain.handle('correction:open', (_event, entree) => {
    creerFenetreCorrection(entree);
    return true;
  });
  ipcMain.handle('correction:get-entry', () => entreeCorrectionCourante);
  ipcMain.handle('correction:submit', (_event, { ts, nouveauTexte, ajoutsDictionnaire }) => {
    if (ts) history.mettreAJourTexte(ts, nouveauTexte);

    for (const ajout of ajoutsDictionnaire || []) {
      dictionary.ajouter({ correct: ajout.correct, variants: [ajout.variant] });
    }

    clipboard.writeText(nouveauTexte);
    if (fenetrePrincipale) fenetrePrincipale.webContents.send('history:updated');
    if (fenetreCorrection) fenetreCorrection.close();
    return { succes: true };
  });

  ipcMain.handle('onboarding:done', () => {
    settings.set({ onboardingDone: true });
    if (fenetreOnboarding) fenetreOnboarding.close();
    creerFenetrePrincipale();
    return true;
  });

  ipcMain.handle('hud:open-correction', () => {
    const derniere = history.getAll()[0];
    if (derniere) creerFenetreCorrection(derniere);
    masquerHud();
    return true;
  });

  ipcMain.handle('recorder:audio-data', async (_event, arrayBuffer, sampleRate) => {
    await traiterAudio(arrayBuffer, sampleRate);
    return true;
  });

  ipcMain.on('recorder:mic-level', (_event, rms) => {
    if (fenetreHud) fenetreHud.webContents.send('hud:mic-level', rms);
  });

  ipcMain.handle('recorder:error', (_event, message) => {
    afficherHud('erreur', { message });
    masquerHudApres(8000);
    etat = 'idle';
    return true;
  });
}

// ---------------------------------------------------------------------------
// Cycle de vie de l'application
// ---------------------------------------------------------------------------

app.on('second-instance', () => {
  creerFenetrePrincipale();
});

app.whenReady().then(async () => {
  settings = new Settings(app.getPath('userData'));
  history = new History(app.getPath('userData'), settings.get('historyRetention'));
  dictionary = new Dictionary(app.getPath('userData'));

  Menu.setApplicationMenu(construireMenuApplication());
  enregistrerGestionnairesIpc();
  creerTray();
  creerFenetreRecorder();
  creerFenetreHud();
  initialiserRaccourci();

  // Verification hors mode developpement uniquement : en local (npm start),
  // l'app n'est pas empaquetee et electron-updater n'a rien a verifier.
  if (app.isPackaged) initialiserMiseAJour();

  if (settings.get('onboardingDone')) {
    creerFenetrePrincipale();
  } else {
    creerFenetreOnboarding();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) creerFenetrePrincipale();
  });
});

app.on('window-all-closed', () => {
  // L'app reste dans le tray : on ne quitte jamais ici (macOS et Windows).
});

app.on('before-quit', () => {
  app.isQuitting = true;
  globalShortcut.unregisterAll();
  holdToTalk.arreterEcoute();
});

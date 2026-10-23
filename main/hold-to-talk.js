// Detection globale d'appui/relachement pour le mode "maintien" (push-to-talk).
// Le globalShortcut d'Electron ne voit que l'appui, jamais le relachement :
// pour un vrai maintien-appui fonctionnant meme quand une autre application
// (Word, navigateur...) a le focus, il faut un hook clavier systeme. C'est
// le seul role de uiohook-napi ici : ce module ne reagit qu'au raccourci
// configure, mais la bibliotheque elle-meme observe toutes les frappes au
// niveau systeme (limite documentee honnetement dans le README).
const { uIOhook } = require('uiohook-napi');

// Codes numeriques verifies dans les definitions TypeScript de uiohook-napi
// (Scan Code Set 1). Couvre le vocabulaire de touches que la fenetre de
// capture du raccourci (renderer/app.js) peut produire.
const CODES_TOUCHE_PRINCIPALE = {
  Space: 57, Enter: 28, Tab: 15, Escape: 1, Backspace: 14,
  ArrowUp: 57416, ArrowDown: 57424, ArrowLeft: 57419, ArrowRight: 57421,
  Home: 3655, End: 3663, PageUp: 3657, PageDown: 3665, Insert: 3666, Delete: 3667,
  F1: 59, F2: 60, F3: 61, F4: 62, F5: 63, F6: 64, F7: 65, F8: 66, F9: 67, F10: 68, F11: 87, F12: 88,
  '0': 11, '1': 2, '2': 3, '3': 4, '4': 5, '5': 6, '6': 7, '7': 8, '8': 9, '9': 10,
  A: 30, B: 48, C: 46, D: 32, E: 18, F: 33, G: 34, H: 35, I: 23, J: 36, K: 37, L: 38,
  M: 50, N: 49, O: 24, P: 25, Q: 16, R: 19, S: 31, T: 20, U: 22, V: 47, W: 17, X: 45, Y: 21, Z: 44,
};

// Chaque modificateur a une variante gauche et droite : relacher l'une ou
// l'autre doit etre traite pareil (l'utilisateur ne sait pas laquelle il a
// pressee).
const CODES_MODIFICATEURS = {
  Ctrl: [29, 3613],
  Alt: [56, 3640],
  Shift: [42, 54],
  Cmd: [3675, 3676],
};

// Decompose un accelerateur du format "Ctrl+Alt+Q" en code numerique de la
// touche principale + codes des modificateurs requis. Retourne null si une
// des touches n'est pas reconnue.
//
// carteClavier (optionnelle) : { 'Q': 'KeyA', ... } = pour chaque lettre ou
// chiffre, la touche physique qui le produit sur la disposition en cours
// (fournie par le renderer, voir recorder.js). Le crochet systeme voit des
// codes physiques (positions QWERTY) : sans cette carte, "Q" serait cherche
// sur la touche marquee A d'un clavier AZERTY.
function codeTouchePrincipale(nom, carteClavier) {
  const codePhysique = carteClavier && carteClavier[nom];
  if (codePhysique) {
    // Le code physique ("KeyA", "Digit1") designe une position QWERTY :
    // on retrouve son code numerique par le nom de la lettre/chiffre.
    const nomPosition = codePhysique.replace(/^(Key|Digit)/, '');
    if (CODES_TOUCHE_PRINCIPALE[nomPosition] !== undefined) {
      return CODES_TOUCHE_PRINCIPALE[nomPosition];
    }
  }
  return CODES_TOUCHE_PRINCIPALE[nom];
}

function analyserAccelerateur(accelerateur, carteClavier) {
  const parties = (accelerateur || '').split('+').map((p) => p.trim()).filter(Boolean);
  if (parties.length === 0) return null;

  const nomToucheP = parties[parties.length - 1];
  const nomsModificateurs = parties.slice(0, -1);

  const codeTouche = codeTouchePrincipale(nomToucheP, carteClavier);
  if (codeTouche === undefined) return null;

  const codesModificateurs = [];
  for (const nom of nomsModificateurs) {
    const codes = CODES_MODIFICATEURS[nom];
    if (!codes) return null;
    codesModificateurs.push(...codes);
  }

  return { codeTouche, nomsModificateurs, codesModificateurs };
}

function modificateursCorrespondent(e, nomsModificateurs) {
  const veut = (nom) => nomsModificateurs.includes(nom);
  return (
    Boolean(e.ctrlKey) === veut('Ctrl') &&
    Boolean(e.altKey) === veut('Alt') &&
    Boolean(e.shiftKey) === veut('Shift') &&
    Boolean(e.metaKey) === veut('Cmd')
  );
}

let ecouteActive = false;
let gestionnaireKeydown = null;
let gestionnaireKeyup = null;

// Demarre l'ecoute globale pour un accelerateur donne : onDemarrer() quand
// la combinaison complete est pressee, onArreter() des que l'une des
// touches impliquees (principale ou modificateur) est relachee. Retourne
// false si l'accelerateur n'est pas reconnu par ce module.
function demarrerEcoute(accelerateur, { onDemarrer, onArreter }, carteClavier) {
  const structure = analyserAccelerateur(accelerateur, carteClavier);
  if (!structure) return false;

  arreterEcoute();

  const codesRelachementSurveilles = new Set([
    structure.codeTouche,
    ...structure.codesModificateurs,
  ]);

  let enCours = false;

  gestionnaireKeydown = (e) => {
    if (enCours) return;
    if (e.keycode !== structure.codeTouche) return;
    if (!modificateursCorrespondent(e, structure.nomsModificateurs)) return;
    enCours = true;
    onDemarrer();
  };

  gestionnaireKeyup = (e) => {
    if (!enCours) return;
    if (!codesRelachementSurveilles.has(e.keycode)) return;
    enCours = false;
    onArreter();
  };

  uIOhook.on('keydown', gestionnaireKeydown);
  uIOhook.on('keyup', gestionnaireKeyup);
  try {
    uIOhook.start();
  } catch (err) {
    // Windows peut refuser d'installer le crochet (ex. "Failed to register low
    // level windows hook") : on rend la main avec false plutot que de laisser
    // une exception non rattrapee ouvrir une boite d'erreur dans l'app.
    uIOhook.removeListener('keydown', gestionnaireKeydown);
    uIOhook.removeListener('keyup', gestionnaireKeyup);
    gestionnaireKeydown = null;
    gestionnaireKeyup = null;
    return false;
  }
  ecouteActive = true;
  return true;
}

// Vrai si changer de carte de clavier change la touche physique ecoutee pour
// cet accelerateur. Sans lettre (Ctrl+Maj+Espace...), la carte n'a aucun effet :
// inutile alors de recreer l'ecoute (arret puis redemarrage du crochet).
function carteChangeLaTouche(accelerateur, ancienneCarte, nouvelleCarte) {
  const avant = analyserAccelerateur(accelerateur, ancienneCarte);
  const apres = analyserAccelerateur(accelerateur, nouvelleCarte);
  return !avant || !apres || avant.codeTouche !== apres.codeTouche;
}

function arreterEcoute() {
  if (!ecouteActive) return;
  if (gestionnaireKeydown) uIOhook.removeListener('keydown', gestionnaireKeydown);
  if (gestionnaireKeyup) uIOhook.removeListener('keyup', gestionnaireKeyup);
  try {
    uIOhook.stop();
  } catch (err) {
    // Deja arrete cote natif : rien a faire.
  }
  gestionnaireKeydown = null;
  gestionnaireKeyup = null;
  ecouteActive = false;
}

module.exports = { demarrerEcoute, arreterEcoute, analyserAccelerateur, carteChangeLaTouche };

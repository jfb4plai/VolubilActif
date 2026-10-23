// Lancement de VolubilActif a l'ouverture de Windows (case des Reglages).
// Mecanisme : un raccourci dans le dossier Demarrage de l'utilisateur, comme
// "Capture d'ecran PLAI" et comme celui cree par l'installateur (meme nom, meme
// argument --reduit). Constate sur un PC de test : Windows a lance ce raccourci
// au demarrage mais pas l'entree de registre Run. L'etat vient de Windows : un
// raccourci desactive dans le Gestionnaire des taches apparait decoche.
// Une mise a jour automatique n'y touche pas.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const NOM = 'VolubilActif';
const CLE_RUN = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const CLE_APPROUVEE_RUN = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run';
const CLE_APPROUVEE_DOSSIER = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolder';

// Seulement dans l'application installee (en developpement, le raccourci
// pointerait vers electron.exe) et seulement sous Windows (sur Mac,
// l'argument --reduit n'est pas transmis).
function disponible(app, autoriser = app.isPackaged && process.platform === 'win32') {
  return Boolean(autoriser);
}

function dossierDemarrage(app) {
  return path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
}

function reg(args) {
  return new Promise((resolve) => {
    execFile('reg', args, { windowsHide: true }, (err, stdout) => resolve({ ok: !err, sortie: stdout || '' }));
  });
}

async function lireValeur(cle, nom) {
  const { ok, sortie } = await reg(['query', cle, '/v', nom]);
  if (!ok) return null;
  const ligne = sortie.split(/\r?\n/).find((l) => l.trim().startsWith(nom));
  return ligne ? ligne.trim().slice(nom.length).trim() : null;
}

function creerRaccourci(app, fichier, exe) {
  const { shell } = require('electron');
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  return shell.writeShortcutLink(fichier, 'create', {
    target: exe,
    args: '--reduit',
    cwd: path.dirname(exe),
    icon: exe,
    iconIndex: 0,
    description: NOM,
  });
}

// Migration depuis la 1.8.0, qui ecrivait une entree Run : si elle existe, elle
// devient un raccourci (le choix de l'utilisateur est conserve) puis est supprimee.
async function migrerAncienneEntree(app, nom, exe, fichier) {
  const ancienne = await lireValeur(CLE_RUN, nom);
  if (!ancienne) return;
  if (!fs.existsSync(fichier)) creerRaccourci(app, fichier, exe);
  await reg(['delete', CLE_RUN, '/v', nom, '/f']);
  await reg(['delete', CLE_APPROUVEE_RUN, '/v', nom, '/f']);
}

// Vrai si le raccourci existe et n'a pas ete desactive par Windows (premier
// octet de StartupApproved impair).
async function lire(app, autoriser, nom = NOM, exe = process.execPath, dossier = dossierDemarrage(app)) {
  if (!disponible(app, autoriser)) return null;
  const fichier = path.join(dossier, nom + '.lnk');
  await migrerAncienneEntree(app, nom, exe, fichier);
  if (!fs.existsSync(fichier)) return false;
  const approuve = await lireValeur(CLE_APPROUVEE_DOSSIER, nom + '.lnk');
  if (approuve) {
    const m = approuve.match(/REG_BINARY\s+([0-9A-Fa-f]{2})/);
    if (m && parseInt(m[1], 16) % 2 === 1) return false;
  }
  return true;
}

async function ecrire(app, actif, autoriser, nom = NOM, exe = process.execPath, dossier = dossierDemarrage(app)) {
  if (!disponible(app, autoriser)) return null;
  const fichier = path.join(dossier, nom + '.lnk');
  if (actif) {
    creerRaccourci(app, fichier, exe);
    // Si Windows avait desactive le raccourci, cocher la case le reactive.
    await reg(['delete', CLE_APPROUVEE_DOSSIER, '/v', nom + '.lnk', '/f']);
  } else {
    try { fs.unlinkSync(fichier); } catch (e) { /* deja absent */ }
    await reg(['delete', CLE_APPROUVEE_DOSSIER, '/v', nom + '.lnk', '/f']);
    // Ancienne entree de la 1.8.0, si elle existe encore.
    await reg(['delete', CLE_RUN, '/v', nom, '/f']);
    await reg(['delete', CLE_APPROUVEE_RUN, '/v', nom, '/f']);
  }
  return lire(app, autoriser, nom, exe, dossier);
}

module.exports = { lire, ecrire };

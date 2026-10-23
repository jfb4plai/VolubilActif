// Lancement de VolubilActif a l'ouverture de Windows (case des Reglages).
// Meme entree que celle ecrite par l'installateur : cle Run, valeur "VolubilActif",
// argument --reduit. Les deux se lisent et se modifient l'un l'autre, et une mise
// a jour automatique ne les touche pas. L'etat vient de Windows, pas d'un fichier
// de reglages : si l'entree est desactivee dans le Gestionnaire des taches, la
// case apparait decochee.
const { execFile } = require('child_process');

const CLE_RUN = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const CLE_APPROUVEE = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run';
const NOM = 'VolubilActif';

// Seulement dans l'application installee (en developpement, l'entree
// pointerait vers electron.exe) et seulement sous Windows (sur Mac,
// l'argument --reduit n'est pas transmis).
function disponible(app, autoriser = app.isPackaged && process.platform === 'win32') {
  return Boolean(autoriser);
}

function reg(args) {
  return new Promise((resolve) => {
    execFile('reg', args, { windowsHide: true }, (err, stdout) => resolve({ ok: !err, sortie: stdout || '' }));
  });
}

// Texte de la valeur, ou null si elle n'existe pas.
async function lireValeur(cle, nom) {
  const { ok, sortie } = await reg(['query', cle, '/v', nom]);
  if (!ok) return null;
  const ligne = sortie.split(/\r?\n/).find((l) => l.trim().startsWith(nom));
  return ligne ? ligne.trim().slice(nom.length).trim() : null;
}

// Vrai si l'entree existe, pointe vers ce programme avec --reduit, et n'a pas
// ete desactivee par Windows (premier octet de StartupApproved impair).
async function lire(app, autoriser, nom = NOM, exe = process.execPath) {
  if (!disponible(app, autoriser)) return null;
  const valeur = await lireValeur(CLE_RUN, nom);
  if (!valeur || !valeur.toLowerCase().includes(exe.toLowerCase()) || !valeur.includes('--reduit')) return false;
  const approuvee = await lireValeur(CLE_APPROUVEE, nom);
  if (approuvee) {
    const m = approuvee.match(/REG_BINARY\s+([0-9A-Fa-f]{2})/);
    if (m && parseInt(m[1], 16) % 2 === 1) return false;
  }
  return true;
}

async function ecrire(app, actif, autoriser, nom = NOM, exe = process.execPath) {
  if (!disponible(app, autoriser)) return null;
  if (actif) {
    await reg(['add', CLE_RUN, '/v', nom, '/t', 'REG_SZ', '/d', `"${exe}" --reduit`, '/f']);
    // Si Windows avait desactive l'entree, cocher la case la reactive.
    await reg(['delete', CLE_APPROUVEE, '/v', nom, '/f']);
  } else {
    await reg(['delete', CLE_RUN, '/v', nom, '/f']);
    await reg(['delete', CLE_APPROUVEE, '/v', nom, '/f']);
  }
  return lire(app, autoriser, nom, exe);
}

module.exports = { lire, ecrire };

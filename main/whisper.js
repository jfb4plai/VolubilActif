// Localisation du binaire whisper-cli, telechargement des modeles ggml et
// lancement de la transcription.
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { spawn } = require('child_process');

const TAILLES_MODELES = {
  base: { fichier: 'ggml-base.bin', octetsAttendusMin: 100 * 1024 * 1024 },
  small: { fichier: 'ggml-small.bin', octetsAttendusMin: 400 * 1024 * 1024 },
  // large-v3-turbo quantise q5_0 : le plus precis en francais, taille contenue.
  turbo: { fichier: 'ggml-large-v3-turbo-q5_0.bin', octetsAttendusMin: 500 * 1024 * 1024 },
};

const TIMEOUT_TRANSCRIPTION_MS = 120000;
const MAX_REDIRECTIONS = 5;

function nomBinaire() {
  return process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
}

// Cherche le binaire whisper-cli dans l'ordre documente par la spec.
function trouverBinaire() {
  const nom = nomBinaire();

  if (process.env.WHISPER_CLI_PATH && fs.existsSync(process.env.WHISPER_CLI_PATH)) {
    return process.env.WHISPER_CLI_PATH;
  }

  const cheminInstalle = path.join(process.resourcesPath || '', 'bin', nom);
  if (process.resourcesPath && fs.existsSync(cheminInstalle)) {
    return cheminInstalle;
  }

  const dossierVendor = process.platform === 'win32' ? 'vendor/win' : 'vendor/mac';
  const cheminDev = path.join(__dirname, '..', dossierVendor, nom);
  if (fs.existsSync(cheminDev)) {
    return cheminDev;
  }

  return null;
}

function cheminModele(userDataPath, taille) {
  const infos = TAILLES_MODELES[taille] || TAILLES_MODELES.base;
  return path.join(userDataPath, 'models', infos.fichier);
}

function modeleDejaTelecharge(userDataPath, taille) {
  const chemin = cheminModele(userDataPath, taille);
  const infos = TAILLES_MODELES[taille] || TAILLES_MODELES.base;
  try {
    const stats = fs.statSync(chemin);
    return stats.size >= infos.octetsAttendusMin;
  } catch (err) {
    return false;
  }
}

// Telecharge un modele avec suivi manuel des redirections et progression.
function telechargerModele(userDataPath, taille, onProgression) {
  const infos = TAILLES_MODELES[taille] || TAILLES_MODELES.base;
  const urlDepart = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${infos.fichier}`;
  const cheminFinal = cheminModele(userDataPath, taille);
  const cheminPartiel = `${cheminFinal}.part`;

  fs.mkdirSync(path.dirname(cheminFinal), { recursive: true });

  return new Promise((resolve, reject) => {
    function telecharger(url, redirectionsRestantes) {
      https
        .get(url, (reponse) => {
          if (
            reponse.statusCode >= 300 &&
            reponse.statusCode < 400 &&
            reponse.headers.location
          ) {
            if (redirectionsRestantes <= 0) {
              reject(new Error('Trop de redirections lors du téléchargement du modèle.'));
              return;
            }
            reponse.resume();
            telecharger(reponse.headers.location, redirectionsRestantes - 1);
            return;
          }

          if (reponse.statusCode !== 200) {
            reject(new Error(`Téléchargement échoué (code ${reponse.statusCode}).`));
            return;
          }

          const tailleTotale = parseInt(reponse.headers['content-length'] || '0', 10);
          let octetsRecus = 0;
          const fluxEcriture = fs.createWriteStream(cheminPartiel);

          reponse.on('data', (chunk) => {
            octetsRecus += chunk.length;
            if (onProgression && tailleTotale > 0) {
              onProgression({
                octetsRecus,
                tailleTotale,
                pourcentage: Math.round((octetsRecus / tailleTotale) * 100),
              });
            }
          });

          reponse.pipe(fluxEcriture);

          fluxEcriture.on('finish', () => {
            fluxEcriture.close(() => {
              try {
                fs.renameSync(cheminPartiel, cheminFinal);
                resolve(cheminFinal);
              } catch (err) {
                reject(err);
              }
            });
          });

          fluxEcriture.on('error', (err) => reject(err));
          reponse.on('error', (err) => reject(err));
        })
        .on('error', (err) => reject(err));
    }

    telecharger(urlDepart, MAX_REDIRECTIONS);
  });
}

function nombreThreads() {
  const cpus = os.cpus().length || 4;
  return Math.max(2, cpus - 2);
}

// whisper-cli (whisper.cpp) lit ses arguments de chemin via l'ancienne API
// Windows en "code page" ANSI, pas en UTF-8 : un nom d'utilisateur accentue
// (ex. "FrançoisHascoet") corrompt le chemin et fait planter le chargement
// du modele des l'ouverture. On copie alors le fichier vers un chemin de
// secours garanti ASCII (C:\Windows\Temp sur Windows) avant l'appel.
function contientNonAscii(chemin) {
  return /[^\x00-\x7F]/.test(chemin);
}

function cheminSansAccent(cheminOriginal, prefixe) {
  if (!contientNonAscii(cheminOriginal)) return cheminOriginal;

  const dossierSecours =
    process.platform === 'win32'
      ? path.join(process.env.WINDIR || 'C:\\Windows', 'Temp', 'volubilactif-ascii')
      : path.join(os.tmpdir(), 'volubilactif-ascii');

  fs.mkdirSync(dossierSecours, { recursive: true });
  const cheminCopie = path.join(dossierSecours, `${prefixe}${path.extname(cheminOriginal)}`);
  fs.copyFileSync(cheminOriginal, cheminCopie);
  return cheminCopie;
}

// Lance whisper-cli sur un fichier WAV et retourne le texte transcrit.
function transcrire(wavPath, { userDataPath, modelSize, language }) {
  return new Promise((resolve, reject) => {
    const binaire = trouverBinaire();
    if (!binaire) {
      reject(
        new Error(
          'whisper-cli introuvable. Voir la section "Pour les bricoleurs" du README pour installer le binaire.'
        )
      );
      return;
    }

    const modelPath = cheminModele(userDataPath, modelSize);
    if (!fs.existsSync(modelPath)) {
      reject(new Error(`Modèle Whisper introuvable : ${modelPath}`));
      return;
    }

    let modelPathAppel;
    let wavPathAppel;
    try {
      modelPathAppel = cheminSansAccent(modelPath, 'modele');
      wavPathAppel = cheminSansAccent(wavPath, `audio-${Date.now()}`);
    } catch (err) {
      reject(err);
      return;
    }

    const args = [
      '-m', modelPathAppel,
      '-f', wavPathAppel,
      '-l', language || 'fr',
      '-nt',
      '-t', String(nombreThreads()),
    ];

    const processus = spawn(binaire, args);
    let sortie = '';
    let erreurs = '';
    let termine = false;

    function nettoyerCopiesTemporaires() {
      if (modelPathAppel !== modelPath) fs.unlink(modelPathAppel, () => {});
      if (wavPathAppel !== wavPath) fs.unlink(wavPathAppel, () => {});
    }

    const minuteur = setTimeout(() => {
      if (termine) return;
      termine = true;
      processus.kill();
      nettoyerCopiesTemporaires();
      reject(new Error('La transcription a dépassé le délai maximal (120 s).'));
    }, TIMEOUT_TRANSCRIPTION_MS);

    processus.stdout.on('data', (data) => {
      sortie += data.toString('utf8');
    });
    processus.stderr.on('data', (data) => {
      erreurs += data.toString('utf8');
    });

    processus.on('error', (err) => {
      if (termine) return;
      termine = true;
      clearTimeout(minuteur);
      nettoyerCopiesTemporaires();
      reject(err);
    });

    processus.on('close', (code) => {
      if (termine) return;
      termine = true;
      clearTimeout(minuteur);
      nettoyerCopiesTemporaires();
      if (code !== 0) {
        reject(new Error(`whisper-cli a échoué (code ${code}) : ${erreurs.slice(0, 500)}`));
        return;
      }
      resolve(sortie.trim());
    });
  });
}

module.exports = {
  trouverBinaire,
  cheminModele,
  modeleDejaTelecharge,
  telechargerModele,
  transcrire,
  TAILLES_MODELES,
};

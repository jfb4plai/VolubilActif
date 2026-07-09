// Lecture et ecriture de userData/settings.json, avec valeurs par defaut
// fusionnees si le fichier est absent ou incomplet.
const fs = require('fs');
const path = require('path');
const os = require('os');

function defautsParPlateforme() {
  return process.platform === 'darwin' ? 'Alt+Space' : 'Ctrl+Space';
}

const VALEURS_PAR_DEFAUT = {
  onboardingDone: false,
  userName: '',
  hotkey: defautsParPlateforme(),
  modelSize: 'base',
  language: 'fr',
  mode: 'simple',
  ollamaModel: 'qwen2.5:3b',
  ollamaUrl: 'http://127.0.0.1:11434',
  // 'normal' : historique sur disque (500 entrees max).
  // 'prive' : rien sur le disque, tout s'efface en quittant (machine partagee).
  historyRetention: 'normal',
  // Mode examen : transcription brute + nettoyage par regles, jamais de LLM.
  examMode: false,
  // Ponctuation dictee ("virgule", "point", "a la ligne"...) convertie par
  // regles, sans IA : active aussi en mode examen.
  dictatedPunctuation: true,
};

class Settings {
  constructor(userDataPath) {
    this.cheminFichier = path.join(userDataPath, 'settings.json');
    this.donnees = this._charger();
  }

  _charger() {
    let donneesDisque = {};
    try {
      const contenu = fs.readFileSync(this.cheminFichier, 'utf8');
      donneesDisque = JSON.parse(contenu);
    } catch (err) {
      // Fichier absent ou invalide : on repart des valeurs par defaut.
      donneesDisque = {};
    }
    return { ...VALEURS_PAR_DEFAUT, ...donneesDisque };
  }

  get(cle) {
    if (cle === undefined) return { ...this.donnees };
    return this.donnees[cle];
  }

  getAll() {
    return { ...this.donnees };
  }

  set(partiel) {
    this.donnees = { ...this.donnees, ...partiel };
    this._ecrireAtomique();
    return this.getAll();
  }

  _ecrireAtomique() {
    const dossier = path.dirname(this.cheminFichier);
    fs.mkdirSync(dossier, { recursive: true });
    const fichierTemp = path.join(
      dossier,
      `.settings.${process.pid}.${Date.now()}.tmp`
    );
    fs.writeFileSync(fichierTemp, JSON.stringify(this.donnees, null, 2), 'utf8');
    fs.renameSync(fichierTemp, this.cheminFichier);
  }
}

module.exports = { Settings, VALEURS_PAR_DEFAUT };

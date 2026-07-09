// Historique des dictees et calcul des statistiques, stocke dans
// userData/history.json. Plafonne a 500 entrees (les plus anciennes ejectees).
const fs = require('fs');
const path = require('path');

const LIMITE_ENTREES = 500;

class History {
  // retention : 'normal' (fichier sur disque) ou 'prive' (memoire seule,
  // rien n'est ecrit et un fichier laisse par une session precedente est efface).
  constructor(userDataPath, retention) {
    this.cheminFichier = path.join(userDataPath, 'history.json');
    this.retention = retention === 'prive' ? 'prive' : 'normal';
    if (this.retention === 'prive') {
      this._supprimerFichier();
      this.donnees = { entries: [] };
    } else {
      this.donnees = this._charger();
    }
  }

  definirRetention(retention) {
    this.retention = retention === 'prive' ? 'prive' : 'normal';
    if (this.retention === 'prive') {
      // Passage en mode prive : on efface aussi ce qui existait deja.
      this._supprimerFichier();
    } else {
      this._ecrireAtomique();
    }
  }

  _supprimerFichier() {
    try {
      fs.unlinkSync(this.cheminFichier);
    } catch (err) {
      // Fichier deja absent : rien a faire.
    }
  }

  _charger() {
    try {
      const contenu = fs.readFileSync(this.cheminFichier, 'utf8');
      const json = JSON.parse(contenu);
      if (Array.isArray(json.entries)) return json;
    } catch (err) {
      // Fichier absent ou invalide : historique vide.
    }
    return { entries: [] };
  }

  _ecrireAtomique() {
    if (this.retention === 'prive') return;
    const dossier = path.dirname(this.cheminFichier);
    fs.mkdirSync(dossier, { recursive: true });
    const fichierTemp = path.join(
      dossier,
      `.history.${process.pid}.${Date.now()}.tmp`
    );
    fs.writeFileSync(fichierTemp, JSON.stringify(this.donnees, null, 2), 'utf8');
    fs.renameSync(fichierTemp, this.cheminFichier);
  }

  ajouter({ text, rawText, durationMs, mode }) {
    const mots = text.trim().length ? text.trim().split(/\s+/).length : 0;
    const entree = {
      ts: Date.now(),
      text,
      rawText,
      durationMs,
      mode,
      words: mots,
    };
    this.donnees.entries.unshift(entree);
    if (this.donnees.entries.length > LIMITE_ENTREES) {
      this.donnees.entries.length = LIMITE_ENTREES;
    }
    this._ecrireAtomique();
    return entree;
  }

  mettreAJourTexte(ts, nouveauTexte) {
    const entree = this.donnees.entries.find((e) => e.ts === ts);
    if (!entree) return null;
    entree.text = nouveauTexte;
    entree.words = nouveauTexte.trim().length
      ? nouveauTexte.trim().split(/\s+/).length
      : 0;
    this._ecrireAtomique();
    return entree;
  }

  getAll() {
    return this.donnees.entries;
  }

  effacer() {
    this.donnees.entries = [];
    this._ecrireAtomique();
  }

  statistiques() {
    const entrees = this.donnees.entries;
    const totalMots = entrees.reduce((acc, e) => acc + (e.words || 0), 0);

    const dureeTotaleMs = entrees.reduce((acc, e) => acc + (e.durationMs || 0), 0);
    const motsParMinute =
      dureeTotaleMs > 0 ? Math.round((totalMots / dureeTotaleMs) * 60000) : 0;

    const joursAffiles = this._calculerSerieJours(entrees);

    return {
      totalMots,
      motsParMinute,
      joursAffiles,
    };
  }

  _calculerSerieJours(entrees) {
    if (entrees.length === 0) return 0;

    const joursUniques = new Set(
      entrees.map((e) => {
        const d = new Date(e.ts);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      })
    );

    const clesTri = Array.from(joursUniques)
      .map((cle) => {
        const [annee, mois, jour] = cle.split('-').map(Number);
        return new Date(annee, mois, jour).getTime();
      })
      .sort((a, b) => b - a);

    const UN_JOUR_MS = 24 * 60 * 60 * 1000;
    const aujourdHui = new Date();
    const debutAujourdHui = new Date(
      aujourdHui.getFullYear(),
      aujourdHui.getMonth(),
      aujourdHui.getDate()
    ).getTime();

    // La serie doit commencer aujourd'hui ou hier pour etre "en cours".
    if (clesTri[0] !== debutAujourdHui && clesTri[0] !== debutAujourdHui - UN_JOUR_MS) {
      return 0;
    }

    let serie = 1;
    for (let i = 1; i < clesTri.length; i++) {
      if (clesTri[i - 1] - clesTri[i] === UN_JOUR_MS) {
        serie++;
      } else {
        break;
      }
    }
    return serie;
  }
}

module.exports = { History };

// Dictionnaire personnel : userData/dictionary.json, editable a la main.
// Applique apres le nettoyage, avant l'insertion du texte.
const fs = require('fs');
const path = require('path');

function normaliser(mot) {
  return mot
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // retire les accents
    .toLowerCase()
    .replace(/[\s'\-]/g, ''); // retire espaces, apostrophes, traits d'union
}

// Analyse une ligne CSV en respectant les guillemets (une cellule peut
// contenir une virgule si elle est entre guillemets, comme Excel/Tableur
// le produisent). Pas de dependance externe : format simple, suffisant ici.
function analyserLigneCsv(ligne) {
  const champs = [];
  let champCourant = '';
  let dansGuillemets = false;

  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (dansGuillemets) {
      if (c === '"') {
        if (ligne[i + 1] === '"') {
          champCourant += '"';
          i++;
        } else {
          dansGuillemets = false;
        }
      } else {
        champCourant += c;
      }
    } else if (c === '"') {
      dansGuillemets = true;
    } else if (c === ',') {
      champs.push(champCourant);
      champCourant = '';
    } else {
      champCourant += c;
    }
  }
  champs.push(champCourant);
  return champs.map((c) => c.trim());
}

// Convertit un fichier CSV (une ligne par mot : forme correcte, puis ses
// variantes mal reconnues separees par des virgules) au meme format que
// fusionner() attend. Un enseignant peut preparer ce fichier directement
// dans Excel ou Google Sheets, sans jamais ouvrir VolubilActif au prealable.
function csvVersEntrees(contenu) {
  const lignes = contenu.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const entrees = [];
  for (const ligne of lignes) {
    const champs = analyserLigneCsv(ligne).filter((c) => c.length > 0);
    if (champs.length === 0) continue;
    const [correct, ...variants] = champs;
    entrees.push({ correct, variants });
  }
  return entrees;
}

// Distance de Levenshtein classique (matrice complete, suffisant pour des mots courts).
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dist = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dist[i][0] = i;
  for (let j = 0; j <= n; j++) dist[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      dist[i][j] = Math.min(
        dist[i - 1][j] + 1, // suppression
        dist[i][j - 1] + 1, // insertion
        dist[i - 1][j - 1] + cout // substitution
      );
    }
  }
  return dist[m][n];
}

function seuilFloue(longueur) {
  if (longueur >= 10) return 2;
  if (longueur >= 5) return 1;
  return 0;
}

class Dictionary {
  constructor(userDataPath) {
    this.cheminFichier = path.join(userDataPath, 'dictionary.json');
  }

  _charger() {
    try {
      const contenu = fs.readFileSync(this.cheminFichier, 'utf8');
      const json = JSON.parse(contenu);
      if (Array.isArray(json.entries)) return json;
    } catch (err) {
      // Fichier absent ou invalide : dictionnaire vide.
    }
    return { entries: [] };
  }

  _ecrireAtomique(donnees) {
    const dossier = path.dirname(this.cheminFichier);
    fs.mkdirSync(dossier, { recursive: true });
    const fichierTemp = path.join(
      dossier,
      `.dictionary.${process.pid}.${Date.now()}.tmp`
    );
    fs.writeFileSync(fichierTemp, JSON.stringify(donnees, null, 2), 'utf8');
    fs.renameSync(fichierTemp, this.cheminFichier);
  }

  getAll() {
    return this._charger().entries;
  }

  ajouter(entree) {
    const donnees = this._charger();
    donnees.entries.push(entree);
    this._ecrireAtomique(donnees);
    return donnees.entries;
  }

  modifier(index, entree) {
    const donnees = this._charger();
    if (index < 0 || index >= donnees.entries.length) return donnees.entries;
    donnees.entries[index] = entree;
    this._ecrireAtomique(donnees);
    return donnees.entries;
  }

  supprimer(index) {
    const donnees = this._charger();
    if (index < 0 || index >= donnees.entries.length) return donnees.entries;
    donnees.entries.splice(index, 1);
    this._ecrireAtomique(donnees);
    return donnees.entries;
  }

  // Fusionne des entrees importees (partage enseignant vers eleves) : une forme
  // correcte deja presente recupere les nouvelles variantes, les autres entrees
  // sont ajoutees. Rien n'est ecrase.
  fusionner(nouvellesEntrees) {
    const donnees = this._charger();
    let ajoutees = 0;
    let completees = 0;

    for (const entree of nouvellesEntrees || []) {
      if (!entree || typeof entree.correct !== 'string' || !entree.correct.trim()) continue;
      const correct = entree.correct.trim();
      const variants = Array.isArray(entree.variants)
        ? entree.variants.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim())
        : [];

      const existante = donnees.entries.find(
        (e) => normaliser(e.correct || '') === normaliser(correct)
      );
      if (existante) {
        const connues = new Set((existante.variants || []).map(normaliser));
        let modifie = false;
        for (const variante of variants) {
          if (!connues.has(normaliser(variante))) {
            existante.variants = existante.variants || [];
            existante.variants.push(variante);
            connues.add(normaliser(variante));
            modifie = true;
          }
        }
        if (modifie) completees++;
      } else {
        donnees.entries.push({ correct, variants });
        ajoutees++;
      }
    }

    this._ecrireAtomique(donnees);
    return { ajoutees, completees, total: donnees.entries.length };
  }

  // Construit la table normalise -> forme correcte, a partir des entrees actuelles.
  _construireTable() {
    const entries = this.getAll();
    const table = new Map();
    for (const entree of entries) {
      const correct = entree.correct;
      if (!correct) continue;
      table.set(normaliser(correct), correct);
      for (const variante of entree.variants || []) {
        table.set(normaliser(variante), correct);
      }
    }
    return table;
  }

  // Retourne la liste des formes correctes, pour injection dans le prompt Ollama.
  listeFormesCorrectes() {
    return this.getAll()
      .map((e) => e.correct)
      .filter(Boolean);
  }

  // Applique le dictionnaire sur un texte : parcours en n-grammes (3, 2, 1 mots),
  // les plus longs d'abord, avec correspondance exacte puis floue.
  appliquer(texte) {
    const table = this._construireTable();
    if (table.size === 0) return texte;

    const clesTable = Array.from(table.keys());

    // Decoupage en tokens "mot + ponctuation collee" pour preserver la mise en forme.
    const tokens = texte.split(/(\s+)/); // garde les espaces comme tokens separes
    const motsIndices = [];
    tokens.forEach((tok, i) => {
      if (!/^\s+$/.test(tok) && tok.length > 0) motsIndices.push(i);
    });

    function extraireMot(token) {
      const match = token.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}'\-]*)([^\p{L}\p{N}]*)$/u);
      if (!match) return { prefixe: '', coeur: token, suffixe: '' };
      return { prefixe: match[1], coeur: match[2], suffixe: match[3] };
    }

    function chercherCorrespondance(motsBrutsCoeurs) {
      const brut = motsBrutsCoeurs.join(' ');
      const norm = normaliser(brut);
      if (table.has(norm)) return table.get(norm);

      // Correspondance floue : uniquement si la longueur normalisee le justifie.
      const seuil = seuilFloue(norm.length);
      if (seuil === 0) return null;
      for (const cle of clesTable) {
        if (Math.abs(cle.length - norm.length) > seuil) continue;
        if (levenshtein(norm, cle) <= seuil) return table.get(cle);
      }
      return null;
    }

    for (let tailleGramme = 3; tailleGramme >= 1; tailleGramme--) {
      for (let depart = 0; depart <= motsIndices.length - tailleGramme; depart++) {
        const indicesGramme = motsIndices.slice(depart, depart + tailleGramme);
        if (indicesGramme.some((i) => tokens[i] === null)) continue; // deja consomme

        const coeurs = indicesGramme.map((i) => extraireMot(tokens[i]).coeur);
        if (coeurs.some((c) => c.length === 0)) continue;

        const correspondance = chercherCorrespondance(coeurs);
        if (!correspondance) continue;

        const premierIndex = indicesGramme[0];
        const dernierIndex = indicesGramme[indicesGramme.length - 1];
        const { prefixe } = extraireMot(tokens[premierIndex]);
        const { suffixe } = extraireMot(tokens[dernierIndex]);

        // Preserver la majuscule de debut de phrase seulement si la forme
        // correcte ne commence pas deja par une minuscule volontaire (son
        // orthographe officielle prime, cf. spec).
        let formeFinale = correspondance;
        const premierCoeurOriginal = extraireMot(tokens[premierIndex]).coeur;
        const commenceParMajuscule =
          premierCoeurOriginal[0] && premierCoeurOriginal[0] === premierCoeurOriginal[0].toUpperCase() &&
          premierCoeurOriginal[0] !== premierCoeurOriginal[0].toLowerCase();
        if (commenceParMajuscule && formeFinale[0] === formeFinale[0].toUpperCase()) {
          // deja coherent, rien a faire
        }

        tokens[premierIndex] = prefixe + formeFinale + suffixe;
        for (let k = 1; k < indicesGramme.length; k++) {
          tokens[indicesGramme[k]] = '';
          // Supprime aussi l'espace qui precedait ce mot consomme.
          if (indicesGramme[k] - 1 >= 0) tokens[indicesGramme[k] - 1] = '';
        }
        for (let k = 1; k < indicesGramme.length; k++) {
          motsIndices[motsIndices.indexOf(indicesGramme[k])] = null;
        }
      }
    }

    return tokens.filter((t) => t !== null).join('');
  }
}

module.exports = { Dictionary, normaliser, levenshtein, csvVersEntrees };

// Nettoyage par regles, applique dans les deux modes (avant Ollama en mode
// ameliore). Supprime hesitations, doublons, artefacts Whisper, corrige les
// espaces et la majuscule initiale.

const HESITATIONS = ['euh+', 'heu+', 'hum+', 'hmm+', 'mmh+', 'bah euh'];

const ARTEFACTS = [
  /\[BLANK_AUDIO\]/gi,
  /\[MUSIC\]/gi,
  /\(\s*\.\.\.\s*\)/g,
  /\[[^\]]*sous-titr[^\]]*\]/gi,
];

// Hallucinations connues de Whisper sur le silence : entraine sur des
// sous-titres TV, le modele produit ces mentions quand il n'entend rien.
// Une dictee qui ne contient que ca doit etre traitee comme du silence.
const HALLUCINATIONS = [
  /sous-?titrage\s+(?:société\s+)?radio-?canada/gi,
  /sous-?titrage\s+st'?\s*501/gi,
  /sous-?titres?\s+(?:réalisés?|faits?)\s+par\s+la\s+communauté\s+d[’']amara\.org/gi,
  /sous-?titrage\s+(?:par\s+)?soustitreur\.com/gi,
];

function retirerHallucinations(texte) {
  let resultat = texte;
  for (const motif of HALLUCINATIONS) {
    resultat = resultat.replace(motif, '');
  }
  return resultat;
}

function nettoyerHesitations(texte) {
  let resultat = texte;
  for (const motif of HESITATIONS) {
    // Hesitation isolee, avec la ponctuation/virgule qui l'entoure eventuellement.
    const regex = new RegExp(`(^|[\\s,.;:!?])\\b(${motif})\\b[\\s,]*`, 'gi');
    resultat = resultat.replace(regex, (correspondance, avant) => {
      // Le motif consomme le blanc avant ET les blancs apres : il faut en
      // restituer un, sinon les mots voisins se collent ("bonjourdemain").
      // corrigerEspaces compressera les doublons ensuite.
      if (avant && /\s/.test(avant)) return ' ';
      return avant || '';
    });
  }
  return resultat;
}

function reduireDoublons(texte) {
  // "le le" -> "le", mais on garde les repetitions legitimes de "nous"/"vous".
  return texte.replace(
    /\b(\p{L}+)\b(\s+\1\b)+/giu,
    (correspondance, mot) => {
      const motMinuscule = mot.toLowerCase();
      if (motMinuscule === 'nous' || motMinuscule === 'vous') return correspondance;
      return mot;
    }
  );
}

function corrigerEspaces(texte) {
  let resultat = texte;
  // Pas d'espace avant , et . ; un espace apres si suivi d'un caractere.
  // Exceptions : pas d'espace au sein d'un nombre ("3,5") ni de "...".
  resultat = resultat.replace(/\s+([.,])/g, '$1');
  resultat = resultat.replace(/([.,])(?=[^\s.,\d])/g, '$1 ');
  // Espace simple acceptee avant ?!;: (convention francaise simplifiee).
  resultat = resultat.replace(/\s*([?!;:])/g, ' $1');
  resultat = resultat.replace(/([?!;:])(?=\S)/g, '$1 ');
  // Compresser les espaces multiples.
  resultat = resultat.replace(/[ \t]+/g, ' ');
  resultat = resultat.replace(/ +\n/g, '\n');
  resultat = resultat.trim();
  return resultat;
}

function mettreMajusculeInitiale(texte) {
  if (!texte) return texte;
  const premierCaractereIndex = texte.search(/\p{L}/u);
  if (premierCaractereIndex === -1) return texte;
  // Un texte qui commence par un nombre ("3,5 grammes de sel") ne doit pas
  // recevoir de majuscule sur son premier mot.
  if (/\d/.test(texte.slice(0, premierCaractereIndex))) return texte;
  return (
    texte.slice(0, premierCaractereIndex) +
    texte[premierCaractereIndex].toUpperCase() +
    texte.slice(premierCaractereIndex + 1)
  );
}

function supprimerArtefacts(texte) {
  let resultat = texte;
  for (const motif of ARTEFACTS) {
    resultat = resultat.replace(motif, '');
  }
  return resultat;
}

// ---------------------------------------------------------------------------
// Ponctuation dictee a voix haute, convertie par regles (sans IA) : fonctionne
// donc aussi en mode examen. Les formes composees sont traitees avant les
// formes simples pour eviter les conversions partielles.
// ---------------------------------------------------------------------------

const PONCTUATION_DICTEE = [
  // "3 virgule 5" est un nombre decimal, pas une enumeration : pas d'espace.
  [/(\d)\s+virgule\s+(?=\d)/gi, '$1,'],
  [/\bpoints?\s+de\s+suspension\b/gi, '...'],
  [/\bpoint[\s-]+virgule\b/gi, ';'],
  [/\bpoint\s+d[’']interrogation\b/gi, '?'],
  [/\bpoint\s+d[’']exclamation\b/gi, '!'],
  [/\bdeux[\s-]+points\b/gi, ':'],
  [/\bnouveau\s+paragraphe\b/gi, '\n\n'],
  // \b ne fonctionne pas devant un caractere accentue ("à") : on ancre sur
  // le debut de texte ou un blanc, consomme avec le saut de ligne.
  [/(^|\s)[aà]\s+la\s+ligne\b/gi, '\n'],
  [/\bnouvelle\s+ligne\b/gi, '\n'],
  [/\bouvrez?\s+(?:les\s+)?guillemets\b/gi, '«'],
  [/\bfermez?\s+(?:les\s+)?guillemets\b/gi, '»'],
  [/\bouvrez?\s+(?:la\s+)?parenth[eè]se\b/gi, '('],
  [/\bfermez?\s+(?:la\s+)?parenth[eè]se\b/gi, ')'],
  [/\bpoint\s+final\b/gi, '.'],
  [/\bvirgule\b/gi, ','],
];

// "point" seul devient "." SAUF usage nominal courant : precede d'un
// determinant ("un point", "ce point") ou suivi de "de/d'/du/des"
// ("point de vue", "point d'eau"). Le pluriel "points" n'est jamais converti.
const DETERMINANT_AVANT_POINT =
  /\b(?:un|le|ce|cet|au|du|mon|ton|son|notre|votre|leur|chaque|quel|petit|bon|dernier|premier|deuxi[eè]me|troisi[eè]me)\s+$/i;

function convertirPointDicte(texte) {
  return texte.replace(/\bpoint\b/gi, (correspondance, index, chaine) => {
    const avant = chaine.slice(0, index);
    const apres = chaine.slice(index + correspondance.length);
    if (DETERMINANT_AVANT_POINT.test(avant)) return correspondance;
    if (/^\s*(?:de\b|d[’']|du\b|des\b)/i.test(apres)) return correspondance;
    return '.';
  });
}

function majusculesApresPonctuation(texte) {
  // Apres un "point" dicte, le mot suivant arrive en minuscule : on remet la
  // majuscule apres . ! ? et apres un saut de ligne.
  return texte.replace(
    /([.!?]\s+|\n\s*)(\p{L})/gu,
    (correspondance, avant, lettre) => avant + lettre.toUpperCase()
  );
}

function appliquerPonctuationDictee(texte) {
  if (!texte) return texte;
  let resultat = texte;
  for (const [motif, remplacement] of PONCTUATION_DICTEE) {
    resultat = resultat.replace(motif, remplacement);
  }
  resultat = convertirPointDicte(resultat);
  // Pas d'espaces residuels autour des sauts de ligne inseres.
  resultat = resultat.replace(/[ \t]*(\n+)[ \t]*/g, '$1');
  resultat = majusculesApresPonctuation(resultat);
  return resultat;
}

function nettoyerSimple(texteBrut) {
  if (!texteBrut) return '';
  let texte = texteBrut;
  texte = retirerHallucinations(texte);
  texte = supprimerArtefacts(texte);
  texte = nettoyerHesitations(texte);
  texte = reduireDoublons(texte);
  texte = corrigerEspaces(texte);
  texte = mettreMajusculeInitiale(texte);
  return texte;
}

module.exports = { nettoyerSimple, appliquerPonctuationDictee, retirerHallucinations };

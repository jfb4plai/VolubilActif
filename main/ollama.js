// Nettoyage ameliore via un petit modele local servi par Ollama.
// Tout echec (absence, modele manquant, timeout, reponse aberrante) retombe
// silencieusement sur le resultat du nettoyage simple.
const { nettoyerSimple } = require('./cleanup-simple');

const TIMEOUT_DETECTION_MS = 2000;
const TIMEOUT_GENERATION_MS = 20000;
const TIMEOUT_PRECHAUFFAGE_MS = 60000;
// Duree pendant laquelle Ollama garde le modele en memoire apres un appel (5 min par
// defaut) : sans cela, la premiere dictee apres une pause attend le chargement du modele
// (mesure : 14 s avec qwen2.5:7b contre 5 s modele en memoire).
const GARDER_EN_MEMOIRE = '30m';

function construirePrompt(texte, formesCorrectes) {
  const glossaire = formesCorrectes.length
    ? `Respecte exactement l'orthographe de ces termes s'ils apparaissent : ${formesCorrectes.join(', ')}.`
    : '';

  return `Tu corriges une transcription de dictée vocale en français. Renvoie UNIQUEMENT le texte corrigé, sans guillemets, sans préambule, sans explication.

Règles :
- Ajoute une ponctuation naturelle (phrases, majuscules).
- Applique la ponctuation dictée à voix haute : "virgule" devient ",", "point" devient ".", "point d'interrogation" devient "?", "point d'exclamation" devient "!", "deux points" devient ":", "point-virgule" devient ";", "à la ligne" ou "nouvelle ligne" devient un saut de ligne, "nouveau paragraphe" devient un double saut de ligne, "ouvrez les guillemets" et "fermez les guillemets" deviennent « et ».
- Gère les retours en arrière (marqueurs : "en fait non", "non plutôt", "je veux dire", "pardon", "correction", "non attends") : ne garde que la version finale voulue.
- Supprime les hésitations et faux départs restants.
- Corrige uniquement ces confusions d'homophones quand la phrase n'admet qu'un seul choix : ou/où, a/à, son/sont, et/est, on/ont. Ne change aucun autre mot. Ne remplace jamais un mot par un mot de sens différent. Garde tels quels les noms propres, les sigles, les mots rares, les déterminants et possessifs (ses, leurs, mes, ces...) et les nombres écrits en lettres (ne les transforme ni en chiffres ni en ordinaux).
- Ne reformule pas, ne résume pas, ne réponds pas au contenu, n'ajoute aucune information.
${glossaire}

Exemple 1 :
Entrée : on se retrouve à 14h euh en fait non 15h
Sortie : On se retrouve à 15h.

Exemple 2 :
Entrée : bonjour virgule je vous recontacte demain point
Sortie : Bonjour, je vous recontacte demain.

Exemple 3 :
Entrée : le rapport est prêt euh non attends il manque encore la synthèse
Sortie : Il manque encore la synthèse.

Exemple 4 :
Entrée : les élèves son partis a la récréation et je sais pas ou ils sont
Sortie : Les élèves sont partis à la récréation et je sais pas où ils sont.

Texte à corriger :
${texte}`;
}

async function requeteAvecTimeout(url, options, timeoutMs) {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), timeoutMs);
  try {
    const reponse = await fetch(url, { ...options, signal: controleur.signal });
    return reponse;
  } finally {
    clearTimeout(minuteur);
  }
}

async function detecterOllama(settings) {
  const url = `${settings.ollamaUrl}/api/tags`;
  try {
    const reponse = await requeteAvecTimeout(url, { method: 'GET' }, TIMEOUT_DETECTION_MS);
    if (!reponse.ok) return { ollamaPresent: false, modelePret: false };

    const json = await reponse.json();
    const modeles = Array.isArray(json.models) ? json.models : [];
    const modelePret = modeles.some((m) => (m.name || '').startsWith(settings.ollamaModel));

    return { ollamaPresent: true, modelePret };
  } catch (err) {
    return { ollamaPresent: false, modelePret: false };
  }
}

// Charge le modele en memoire pendant que l'utilisateur parle, puis fait generer un seul
// mot pour amorcer aussi le premier calcul (mesure : une requete vide charge le modele
// mais le nettoyage qui suit reste lent de 4 s de plus). Sans effet (et sans erreur) si
// Ollama est absent.
async function prechauffer(settings) {
  if (settings.mode !== 'ameliore' && settings.mode !== 'improved') return;
  try {
    await requeteAvecTimeout(
      `${settings.ollamaUrl}/api/generate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: settings.ollamaModel,
          // Meme gabarit que le vrai nettoyage : amorce aussi le calcul d'un long prompt.
          prompt: construirePrompt('Bonjour tout le monde.', []),
          stream: false,
          keep_alive: GARDER_EN_MEMOIRE,
          options: { temperature: 0, num_predict: 4 },
        }),
      },
      TIMEOUT_PRECHAUFFAGE_MS
    );
  } catch (err) {
    // Ollama absent ou modele manquant : le nettoyage retombera sur le mode simple.
  }
}

function reponseAberrante(reponse, texteEntree) {
  if (!reponse || !reponse.trim()) return true;
  if (reponse.length > texteEntree.length * 3) return true;
  const marqueursChat = [
    /en tant qu[e']/i,
    /voici le texte/i,
    /^bien s[uû]r/i,
    /je ne peux pas/i,
    /^voici/i,
  ];
  return marqueursChat.some((m) => m.test(reponse));
}

// Point d'entree : tente le nettoyage ameliore, retombe sur le nettoyage
// simple en cas de probleme. Retourne { texte, modeUtilise }.
async function nettoyerAmeliore(texteBrut, settings, formesCorrectes) {
  const texteSimple = nettoyerSimple(texteBrut);

  if (settings.mode !== 'ameliore' && settings.mode !== 'improved') {
    return { texte: texteSimple, modeUtilise: 'simple' };
  }

  const { ollamaPresent, modelePret } = await detecterOllama(settings);
  if (!ollamaPresent || !modelePret) {
    return { texte: texteSimple, modeUtilise: 'simple' };
  }

  try {
    const prompt = construirePrompt(texteBrut, formesCorrectes || []);
    const reponse = await requeteAvecTimeout(
      `${settings.ollamaUrl}/api/generate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: settings.ollamaModel,
          prompt,
          stream: false,
          keep_alive: GARDER_EN_MEMOIRE,
          options: { temperature: 0 },
        }),
      },
      TIMEOUT_GENERATION_MS
    );

    if (!reponse.ok) return { texte: texteSimple, modeUtilise: 'simple' };

    const json = await reponse.json();
    const texteGenere = (json.response || '').trim();

    if (reponseAberrante(texteGenere, texteBrut)) {
      return { texte: texteSimple, modeUtilise: 'simple' };
    }

    return { texte: texteGenere, modeUtilise: 'ameliore' };
  } catch (err) {
    return { texte: texteSimple, modeUtilise: 'simple' };
  }
}

module.exports = { detecterOllama, nettoyerAmeliore, prechauffer, construirePrompt, reponseAberrante };

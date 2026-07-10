// Logique de la fenetre principale : navigation entre pages, historique,
// statistiques, dictionnaire et reglages.

let reglagesCourants = null;
let annulerProgression = null;

function afficherPage(nomPage) {
  document.querySelectorAll('.page').forEach((page) => page.classList.remove('visible'));
  document.getElementById(`page-${nomPage}`).classList.add('visible');
  document.querySelectorAll('.barre-laterale button').forEach((bouton) => {
    bouton.classList.toggle('actif', bouton.dataset.page === nomPage);
  });
}

document.querySelectorAll('.barre-laterale button').forEach((bouton) => {
  bouton.addEventListener('click', () => afficherPage(bouton.dataset.page));
});

// ---------------------------------------------------------------------------
// Accueil : statistiques + historique
// ---------------------------------------------------------------------------

function formaterHeure(ts) {
  const date = new Date(ts);
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function libelleJour(ts) {
  const date = new Date(ts);
  const aujourdHui = new Date();
  const hier = new Date();
  hier.setDate(hier.getDate() - 1);

  const memeJour = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  if (memeJour(date, aujourdHui)) return "Aujourd'hui";
  if (memeJour(date, hier)) return 'Hier';
  return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

async function chargerAccueil() {
  const reglages = await window.volubil.getSettings();
  const nom = (reglages.userName || '').trim();
  document.getElementById('titre-accueil').textContent = nom ? `Bon retour, ${nom}` : 'Bon retour';

  const stats = await window.volubil.getStatistiques();
  document.getElementById('stat-mots').textContent = stats.totalMots;
  document.getElementById('stat-mpm').textContent = stats.motsParMinute;
  document.getElementById('stat-serie').textContent = stats.joursAffiles;

  const historique = await window.volubil.getHistorique();
  const conteneur = document.getElementById('liste-historique');
  conteneur.innerHTML = '';

  if (historique.length === 0) {
    conteneur.innerHTML = '<div class="vide">Aucune dictée pour l\'instant. Appuie sur ton raccourci pour commencer.</div>';
    return;
  }

  const groupes = new Map();
  for (const entree of historique) {
    const libelle = libelleJour(entree.ts);
    if (!groupes.has(libelle)) groupes.set(libelle, []);
    groupes.get(libelle).push(entree);
  }

  for (const [libelle, entrees] of groupes) {
    const blocJour = document.createElement('div');
    blocJour.className = 'groupe-jour';
    blocJour.innerHTML = `<h3>${libelle}</h3>`;

    for (const entree of entrees) {
      const ligne = document.createElement('div');
      ligne.className = 'entree-historique';
      ligne.innerHTML = `
        <div class="texte">
          <div class="heure">${formaterHeure(entree.ts)}</div>
          <div>${escapeHtml(entree.text)}</div>
        </div>
        <div class="actions">
          <button title="Copier" data-action="copier">Copier</button>
          <button title="Corriger" data-action="corriger">Corriger</button>
        </div>
      `;
      ligne.querySelector('[data-action="copier"]').addEventListener('click', () => {
        window.volubil.copierTexte(entree.text);
      });
      ligne.querySelector('[data-action="corriger"]').addEventListener('click', () => {
        window.volubil.ouvrirCorrection(entree);
      });
      blocJour.appendChild(ligne);
    }

    conteneur.appendChild(blocJour);
  }
}

function escapeHtml(texte) {
  const div = document.createElement('div');
  div.textContent = texte;
  return div.innerHTML;
}

document.getElementById('btn-tout-effacer').addEventListener('click', async () => {
  if (confirm('Effacer tout l\'historique ? Cette action est définitive.')) {
    await window.volubil.effacerHistorique();
    chargerAccueil();
  }
});

// ---------------------------------------------------------------------------
// Dictionnaire
// ---------------------------------------------------------------------------

async function chargerDictionnaire() {
  const entrees = await window.volubil.getDictionnaire();
  const conteneur = document.getElementById('liste-dictionnaire');
  conteneur.innerHTML = '';

  if (entrees.length === 0) {
    conteneur.innerHTML = '<div class="vide">Aucun mot enregistré pour l\'instant. Ajoute ton premier mot ci-dessus.</div>';
    return;
  }

  entrees.forEach((entree, index) => {
    const ligne = document.createElement('div');
    ligne.className = 'ligne-dictionnaire';
    ligne.innerHTML = `
      <div>
        <strong>${escapeHtml(entree.correct)}</strong>
        <div class="variantes">${escapeHtml((entree.variants || []).join(', '))}</div>
      </div>
      <div class="actions">
        <button data-action="modifier">Modifier</button>
        <button data-action="supprimer">Supprimer</button>
      </div>
    `;
    ligne.querySelector('[data-action="modifier"]').addEventListener('click', () => {
      entrerEnModeEdition(index, entree);
    });
    ligne.querySelector('[data-action="supprimer"]').addEventListener('click', async () => {
      await window.volubil.supprimerEntreeDictionnaire(index);
      chargerDictionnaire();
    });
    conteneur.appendChild(ligne);
  });
}

let indexEnEdition = null;

function entrerEnModeEdition(index, entree) {
  indexEnEdition = index;
  document.getElementById('dico-correct').value = entree.correct;
  document.getElementById('dico-variantes').value = (entree.variants || []).join(', ');
  const bouton = document.getElementById('btn-ajouter-dico');
  bouton.textContent = 'Enregistrer la modification';
}

function sortirDuModeEdition() {
  indexEnEdition = null;
  document.getElementById('dico-correct').value = '';
  document.getElementById('dico-variantes').value = '';
  document.getElementById('btn-ajouter-dico').textContent = 'Ajouter';
}

document.getElementById('btn-ajouter-dico').addEventListener('click', async () => {
  const correct = document.getElementById('dico-correct').value.trim();
  const variantesTexte = document.getElementById('dico-variantes').value.trim();
  if (!correct) return;

  const variants = variantesTexte
    ? variantesTexte.split(',').map((v) => v.trim()).filter(Boolean)
    : [];

  if (indexEnEdition !== null) {
    await window.volubil.modifierEntreeDictionnaire(indexEnEdition, { correct, variants });
  } else {
    await window.volubil.ajouterEntreeDictionnaire({ correct, variants });
  }

  sortirDuModeEdition();
  chargerDictionnaire();
});

document.getElementById('btn-exporter-dico').addEventListener('click', async () => {
  const statut = document.getElementById('statut-dico');
  const resultat = await window.volubil.exporterDictionnaire();
  if (resultat.annule) {
    statut.textContent = '';
    return;
  }
  statut.textContent = resultat.succes
    ? `Fichier enregistré : ${resultat.chemin}. Tu peux maintenant l'envoyer à qui tu veux.`
    : `Échec de l'enregistrement : ${resultat.erreur}`;
});

document.getElementById('btn-importer-dico').addEventListener('click', async () => {
  const statut = document.getElementById('statut-dico');
  const resultat = await window.volubil.importerDictionnaire();
  if (resultat.annule) {
    statut.textContent = '';
    return;
  }
  if (resultat.succes) {
    statut.textContent = `Fichier chargé : ${resultat.ajoutees} mot(s) ajouté(s), ${resultat.completees} complété(s). Tes mots existants n'ont pas été touchés.`;
    chargerDictionnaire();
  } else {
    statut.textContent = `Échec du chargement : ${resultat.erreur}`;
  }
});

// ---------------------------------------------------------------------------
// Reglages
// ---------------------------------------------------------------------------

async function chargerReglages() {
  reglagesCourants = await window.volubil.getSettings();

  document.getElementById('reg-prenom').value = reglagesCourants.userName;
  document.getElementById('reg-raccourci').value = reglagesCourants.hotkey;
  document.getElementById('reg-modele').value = reglagesCourants.modelSize;
  document.getElementById('reg-langue').value = reglagesCourants.language;
  document.getElementById('reg-mode').value = reglagesCourants.mode;
  document.getElementById('reg-ollama-modele').value = reglagesCourants.ollamaModel;
  document.getElementById('reg-retention').value = reglagesCourants.historyRetention || 'normal';
  document.getElementById('reg-examen').checked = Boolean(reglagesCourants.examMode);
  document.getElementById('reg-ponctuation').checked = reglagesCourants.dictatedPunctuation !== false;
  document.getElementById('reg-maintien').checked = Boolean(reglagesCourants.holdToTalk);

  basculerBlocOllama();
  if (reglagesCourants.mode === 'ameliore') testerOllamaEtAfficher();
}

function basculerBlocOllama() {
  const mode = document.getElementById('reg-mode').value;
  document.getElementById('bloc-ollama').style.display = mode === 'ameliore' ? 'block' : 'none';
}

document.getElementById('reg-mode').addEventListener('change', () => {
  basculerBlocOllama();
  if (document.getElementById('reg-mode').value === 'ameliore') testerOllamaEtAfficher();
});

async function testerOllamaEtAfficher() {
  const statut = document.getElementById('reg-ollama-statut');
  statut.innerHTML = '<span class="pastille orange">Vérification...</span>';

  const { ollamaPresent, modelePret } = await window.volubil.testerOllama();

  if (ollamaPresent && modelePret) {
    statut.innerHTML = '<span class="pastille verte">Ollama détecté, modèle prêt</span>';
  } else if (ollamaPresent && !modelePret) {
    statut.innerHTML = `
      <span class="pastille orange">Ollama présent mais modèle absent</span>
      <div style="margin-top: 6px;">Commande à copier : <code>ollama pull qwen2.5:3b</code></div>
    `;
  } else {
    statut.innerHTML = `
      <span class="pastille rouge">Ollama non détecté</span>
      <div style="margin-top: 6px;"><a href="https://ollama.com/download" target="_blank">Télécharger Ollama</a></div>
    `;
  }
}

document.getElementById('btn-retester-ollama').addEventListener('click', testerOllamaEtAfficher);

document.getElementById('reg-raccourci').addEventListener('click', () => {
  const champ = document.getElementById('reg-raccourci');
  const statut = document.getElementById('reg-raccourci-statut');
  champ.value = 'Appuie sur les touches souhaitées...';
  statut.textContent = '';

  function surTouche(event) {
    event.preventDefault();
    const touches = [];
    if (event.ctrlKey) touches.push('Ctrl');
    if (event.altKey) touches.push('Alt');
    if (event.shiftKey) touches.push('Shift');
    if (event.metaKey) touches.push('Cmd');

    const touche = event.key;
    const touchesModificatrices = ['Control', 'Alt', 'Shift', 'Meta'];
    if (!touchesModificatrices.includes(touche)) {
      const nomTouche = touche === ' ' ? 'Space' : touche.length === 1 ? touche.toUpperCase() : touche;
      touches.push(nomTouche);

      const accelerateur = touches.join('+');
      document.removeEventListener('keydown', surTouche);

      window.volubil.testHotkey(accelerateur).then(async ({ succes }) => {
        if (succes) {
          champ.value = accelerateur;
          statut.textContent = 'Enregistrement...';
          statut.style.color = '';
          // Le test valide juste que la combinaison n'est pas deja prise :
          // on enregistre tout de suite, sans attendre un clic sur le gros
          // bouton Enregistrer plus bas (sinon "valide" donne l'illusion
          // d'etre deja sauvegarde, alors que ca ne l'est pas). Jamais
          // d'echec silencieux : on verifie que la valeur ecrite sur le
          // disque correspond vraiment a ce qui vient d'etre teste.
          try {
            const misAJour = await window.volubil.saveSettings({ hotkey: accelerateur });
            if (misAJour.hotkey === accelerateur) {
              reglagesCourants = misAJour;
              statut.textContent = 'Raccourci enregistré.';
              statut.style.color = 'var(--vert)';
            } else {
              champ.value = misAJour.hotkey;
              statut.textContent = "Échec de l'enregistrement : le raccourci précédent a été conservé. Réessaie, ou ouvre le dossier des données (bouton plus bas) pour vérifier settings.json.";
              statut.style.color = 'var(--rouge)';
            }
          } catch (err) {
            champ.value = reglagesCourants.hotkey;
            statut.textContent = `Échec de l'enregistrement : ${err.message || err}. Le raccourci précédent a été conservé.`;
            statut.style.color = 'var(--rouge)';
          }
        } else {
          champ.value = reglagesCourants.hotkey;
          statut.textContent = 'Ce raccourci est déjà pris, essaie une autre combinaison.';
          statut.style.color = 'var(--rouge)';
        }
      });
    }
  }

  document.addEventListener('keydown', surTouche);
});

document.getElementById('reg-modele').addEventListener('change', async () => {
  const taille = document.getElementById('reg-modele').value;
  const statut = document.getElementById('reg-modele-statut');
  const barre = document.getElementById('reg-modele-barre');
  const remplissage = document.getElementById('reg-modele-remplissage');

  statut.textContent = 'Téléchargement du modèle en cours...';
  barre.style.display = 'block';

  if (annulerProgression) annulerProgression();
  annulerProgression = window.volubil.onProgressionTelechargement((progression) => {
    remplissage.style.width = `${progression.pourcentage}%`;
    statut.textContent = `Téléchargement : ${progression.pourcentage}%`;
  });

  const resultat = await window.volubil.telechargerModele(taille);
  barre.style.display = 'none';
  statut.textContent = resultat.succes
    ? 'Modèle prêt.'
    : `Erreur de téléchargement : ${resultat.erreur}`;
});

document.getElementById('btn-dossier-donnees').addEventListener('click', () => {
  window.volubil.ouvrirDossierDonnees();
});

document.getElementById('btn-enregistrer-reglages').addEventListener('click', async () => {
  const partiel = {
    userName: document.getElementById('reg-prenom').value.trim(),
    modelSize: document.getElementById('reg-modele').value,
    language: document.getElementById('reg-langue').value,
    mode: document.getElementById('reg-mode').value,
    ollamaModel: document.getElementById('reg-ollama-modele').value.trim() || 'qwen2.5:3b',
    historyRetention: document.getElementById('reg-retention').value,
    examMode: document.getElementById('reg-examen').checked,
    dictatedPunctuation: document.getElementById('reg-ponctuation').checked,
    holdToTalk: document.getElementById('reg-maintien').checked,
  };
  const statut = document.getElementById('statut-reglages');
  try {
    await window.volubil.saveSettings(partiel);
    reglagesCourants = { ...reglagesCourants, ...partiel };
    statut.textContent = 'Réglages enregistrés.';
    statut.style.color = 'var(--vert)';
  } catch (err) {
    statut.textContent = `Erreur d'enregistrement : ${err.message || err}`;
    statut.style.color = 'var(--rouge)';
  }
  setTimeout(() => {
    statut.textContent = '';
  }, 4000);
  chargerAccueil();
});

// ---------------------------------------------------------------------------
// Rafraichissement pousse par le main (nouvelle dictee, changement de raccourci)
// ---------------------------------------------------------------------------

window.volubil.onHistoriqueMisAJour(async () => {
  chargerAccueil();

  // Le modele et la langue peuvent changer depuis le menu de la barre
  // systeme : on resynchronise ces deux champs precis (sans recharger tout
  // le formulaire, pour ne pas ecraser une saisie en cours ailleurs).
  const reglages = await window.volubil.getSettings();
  reglagesCourants = reglages;
  document.getElementById('reg-modele').value = reglages.modelSize;
  document.getElementById('reg-langue').value = reglages.language;
});

// ---------------------------------------------------------------------------
// Mise a jour automatique (page A propos)
// ---------------------------------------------------------------------------

function afficherStatutMiseAJour(donnees) {
  const el = document.getElementById('statut-maj');
  if (!el) return;
  switch (donnees.etat) {
    case 'verification':
      el.textContent = 'Vérification des mises à jour...';
      break;
    case 'disponible':
      el.textContent = `Nouvelle version ${donnees.version} trouvée, téléchargement en cours...`;
      break;
    case 'telechargement':
      el.textContent = `Téléchargement de la mise à jour : ${donnees.pourcentage}%`;
      break;
    case 'prete':
      el.textContent = `Mise à jour ${donnees.version} prête, redémarre l'application pour l'appliquer.`;
      break;
    case 'a-jour':
      el.textContent = 'VolubilActif est à jour.';
      break;
    case 'erreur':
      el.textContent = "Vérification des mises à jour impossible pour l'instant (pas de réseau ?).";
      break;
    default:
      el.textContent = '';
  }
}

if (window.volubil.getEtatMiseAJour) {
  window.volubil.getEtatMiseAJour().then(afficherStatutMiseAJour);
  window.volubil.onEtatMiseAJour(afficherStatutMiseAJour);
}

// ---------------------------------------------------------------------------
// Chargement initial
// ---------------------------------------------------------------------------

chargerAccueil();
chargerDictionnaire();
chargerReglages();

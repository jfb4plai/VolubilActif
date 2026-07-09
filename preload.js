// Pont securise entre les fenetres et le processus principal : chaque fenetre
// n'a acces qu'a un sous-ensemble d'actions, jamais a Node ou Electron en direct.
const { contextBridge, ipcRenderer } = require('electron');

// API commune a la fenetre principale, aux reglages et a l'onboarding.
contextBridge.exposeInMainWorld('volubil', {
  // Reglages.
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (partiel) => ipcRenderer.invoke('settings:save', partiel),
  testHotkey: (accelerateur) => ipcRenderer.invoke('settings:test-hotkey', accelerateur),
  ouvrirDossierDonnees: () => ipcRenderer.invoke('settings:open-data-folder'),

  // Ollama.
  testerOllama: () => ipcRenderer.invoke('ollama:test'),

  // Modele Whisper.
  telechargerModele: (taille) => ipcRenderer.invoke('whisper:download-model', taille),
  onProgressionTelechargement: (callback) => {
    const gestionnaire = (_event, progression) => callback(progression);
    ipcRenderer.on('whisper:download-progress', gestionnaire);
    return () => ipcRenderer.removeListener('whisper:download-progress', gestionnaire);
  },

  // Historique et statistiques.
  getHistorique: () => ipcRenderer.invoke('history:get'),
  getStatistiques: () => ipcRenderer.invoke('history:stats'),
  effacerHistorique: () => ipcRenderer.invoke('history:clear'),
  copierTexte: (texte) => ipcRenderer.invoke('clipboard:write', texte),

  // Dictionnaire personnel.
  getDictionnaire: () => ipcRenderer.invoke('dictionary:get'),
  ajouterEntreeDictionnaire: (entree) => ipcRenderer.invoke('dictionary:add', entree),
  modifierEntreeDictionnaire: (index, entree) => ipcRenderer.invoke('dictionary:update', index, entree),
  supprimerEntreeDictionnaire: (index) => ipcRenderer.invoke('dictionary:remove', index),
  exporterDictionnaire: () => ipcRenderer.invoke('dictionary:export'),
  importerDictionnaire: () => ipcRenderer.invoke('dictionary:import'),

  // Correction rapide.
  ouvrirCorrection: (entree) => ipcRenderer.invoke('correction:open', entree),
  getEntreeCorrection: () => ipcRenderer.invoke('correction:get-entry'),
  validerCorrection: (donnees) => ipcRenderer.invoke('correction:submit', donnees),
  onCorrectionRefresh: (callback) => {
    const gestionnaire = (_event, entree) => callback(entree);
    ipcRenderer.on('correction:refresh', gestionnaire);
    return () => ipcRenderer.removeListener('correction:refresh', gestionnaire);
  },

  // Onboarding.
  terminerOnboarding: () => ipcRenderer.invoke('onboarding:done'),

  // Notifications pousees par le main vers la fenetre principale (rafraichir l'affichage).
  onHistoriqueMisAJour: (callback) => {
    const gestionnaire = () => callback();
    ipcRenderer.on('history:updated', gestionnaire);
    return () => ipcRenderer.removeListener('history:updated', gestionnaire);
  },
});

// API dediee au HUD (fenetre d'etat pendant la dictee).
contextBridge.exposeInMainWorld('volubilHud', {
  onEtat: (callback) => {
    const gestionnaire = (_event, etat) => callback(etat);
    ipcRenderer.on('hud:state', gestionnaire);
    return () => ipcRenderer.removeListener('hud:state', gestionnaire);
  },
  onNiveauMicro: (callback) => {
    const gestionnaire = (_event, niveau) => callback(niveau);
    ipcRenderer.on('hud:mic-level', gestionnaire);
    return () => ipcRenderer.removeListener('hud:mic-level', gestionnaire);
  },
  ouvrirCorrection: () => ipcRenderer.invoke('hud:open-correction'),
});

// API dediee a la fenetre cachee d'enregistrement.
contextBridge.exposeInMainWorld('volubilRecorder', {
  onDemarrer: (callback) => {
    const gestionnaire = () => callback();
    ipcRenderer.on('recorder:start', gestionnaire);
    return () => ipcRenderer.removeListener('recorder:start', gestionnaire);
  },
  onArreter: (callback) => {
    const gestionnaire = () => callback();
    ipcRenderer.on('recorder:stop', gestionnaire);
    return () => ipcRenderer.removeListener('recorder:stop', gestionnaire);
  },
  envoyerAudio: (arrayBuffer, sampleRate) => ipcRenderer.invoke('recorder:audio-data', arrayBuffer, sampleRate),
  envoyerNiveau: (rms) => ipcRenderer.send('recorder:mic-level', rms),
  envoyerErreur: (message) => ipcRenderer.invoke('recorder:error', message),
});

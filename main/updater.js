// Mise a jour automatique via les releases GitHub. Verifie au demarrage puis
// periodiquement (l'app reste souvent ouverte des heures dans le tray : une
// seule verification au lancement suffit rarement), telecharge en tache de
// fond si une nouvelle version existe, et ne redemarre jamais sans
// confirmation explicite. Un echec (pas de reseau, GitHub indisponible)
// n'empeche jamais l'app de fonctionner normalement, mais chaque etape est
// remontee via onEtat pour rester visible (page A propos) plutot que
// silencieuse.
const { autoUpdater } = require('electron-updater');
const { dialog } = require('electron');

const INTERVALLE_VERIFICATION_MS = 4 * 60 * 60 * 1000; // 4 heures

function initialiserMiseAJour(onEtat) {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => onEtat('verification', {}));

  autoUpdater.on('update-available', (info) => onEtat('disponible', { version: info.version }));

  autoUpdater.on('update-not-available', (info) => onEtat('a-jour', { version: info.version }));

  autoUpdater.on('download-progress', (progression) => {
    onEtat('telechargement', { pourcentage: Math.round(progression.percent) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    onEtat('prete', { version: info.version });
    dialog
      .showMessageBox({
        type: 'info',
        title: 'Mise à jour disponible',
        message: `VolubilActif ${info.version} est prête.`,
        detail: "L'application va redémarrer pour appliquer la mise à jour.",
        buttons: ['Redémarrer maintenant', 'Plus tard'],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      });
  });

  autoUpdater.on('error', (err) => {
    onEtat('erreur', { message: err.message || String(err) });
    console.error('Vérification de mise à jour échouée :', err.message);
  });

  autoUpdater.checkForUpdates().catch(() => {});

  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, INTERVALLE_VERIFICATION_MS);
}

module.exports = { initialiserMiseAJour };

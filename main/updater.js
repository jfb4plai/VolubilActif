// Mise a jour automatique via les releases GitHub. Verifie au demarrage,
// telecharge en tache de fond si une nouvelle version existe, et ne
// redemarre jamais sans confirmation explicite. Un echec (pas de reseau,
// GitHub indisponible) est silencieux : l'app continue de fonctionner
// normalement, la mise a jour n'est jamais bloquante.
const { autoUpdater } = require('electron-updater');
const { dialog } = require('electron');

function initialiserMiseAJour() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-downloaded', (info) => {
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
    console.error('Vérification de mise à jour échouée :', err.message);
  });

  autoUpdater.checkForUpdates().catch(() => {});
}

module.exports = { initialiserMiseAJour };

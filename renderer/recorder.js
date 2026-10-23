// Fenetre cachee dediee a la capture micro : getUserMedia + AudioWorklet.
// Accumule les blocs PCM pendant l'enregistrement, puis envoie le tout au
// processus principal au signal d'arret.
//
// Le pipeline (flux micro + AudioContext + module AudioWorklet) est cree une
// seule fois puis reutilise entre les dictees : le recreer a chaque appui
// (getUserMedia + compilation du worklet) coute ~1 a 1,5 s, un delai qui
// mange le debut de la phrase en mode "maintenir la touche" ou l'utilisateur
// parle des l'appui. Seule la connexion du noeud de capture est basculee au
// demarrage/arret (quasi instantanee).

let contexteAudio = null;
let noeudSource = null;
let noeudWorklet = null;
let flux = null;
let blocsAudio = [];
let enregistrementActif = false;
let initialisation = null;

async function assurerInitialisation() {
  if (contexteAudio) return;
  if (initialisation) return initialisation;

  initialisation = (async () => {
    flux = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });

    contexteAudio = new AudioContext();
    await contexteAudio.audioWorklet.addModule('worklet.js');

    noeudSource = contexteAudio.createMediaStreamSource(flux);
    noeudWorklet = new AudioWorkletNode(contexteAudio, 'capture-processor');

    noeudWorklet.port.onmessage = (event) => {
      if (!enregistrementActif) return;
      const { audio, rms } = event.data;
      blocsAudio.push(audio);
      window.volubilRecorder.envoyerNiveau(rms);
    };
  })();

  try {
    await initialisation;
  } finally {
    initialisation = null;
  }
}

async function demarrer() {
  blocsAudio = [];

  try {
    await assurerInitialisation();
  } catch (err) {
    contexteAudio = null;
    window.volubilRecorder.envoyerErreur(
      "Impossible d'accéder au micro. Vérifie les autorisations de l'application."
    );
    return;
  }

  enregistrementActif = true;
  noeudSource.connect(noeudWorklet);
}

async function arreter() {
  enregistrementActif = false;

  if (noeudSource) noeudSource.disconnect(noeudWorklet);

  const frequenceEchantillonnage = contexteAudio ? contexteAudio.sampleRate : 48000;

  const longueurTotale = blocsAudio.reduce((acc, bloc) => acc + bloc.length, 0);
  const fusionne = new Float32Array(longueurTotale);
  let position = 0;
  for (const bloc of blocsAudio) {
    fusionne.set(bloc, position);
    position += bloc.length;
  }
  blocsAudio = [];

  await window.volubilRecorder.envoyerAudio(fusionne.buffer, frequenceEchantillonnage);
}

// Envoie au processus principal la disposition du clavier en cours : pour
// chaque lettre/chiffre, la touche physique qui le produit (ex. sur AZERTY,
// 'Q' -> 'KeyA'). Le mode "maintien" en a besoin, son crochet clavier ne
// voit que des positions physiques.
async function envoyerCarteClavier() {
  if (!navigator.keyboard || !navigator.keyboard.getLayoutMap) return;
  try {
    const disposition = await navigator.keyboard.getLayoutMap();
    const carte = {};
    for (let c = 65; c <= 90; c++) {
      const code = 'Key' + String.fromCharCode(c);
      const caractere = (disposition.get(code) || '').toUpperCase();
      if (/^[A-Z]$/.test(caractere)) carte[caractere] = code;
    }
    for (let n = 0; n <= 9; n++) {
      const code = 'Digit' + n;
      const caractere = disposition.get(code) || '';
      if (/^[0-9]$/.test(caractere)) carte[caractere] = code;
    }
    window.volubilRecorder.envoyerCarteClavier(carte);
  } catch (err) {
    // Sans carte, le mode maintien suppose une disposition QWERTY.
  }
}

envoyerCarteClavier();
if (navigator.keyboard && navigator.keyboard.addEventListener) {
  navigator.keyboard.addEventListener('layoutchange', envoyerCarteClavier);
}

window.volubilRecorder.onDemarrer(() => {
  demarrer();
});

window.volubilRecorder.onArreter(() => {
  arreter();
});

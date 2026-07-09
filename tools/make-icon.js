// Genere les icones de l'application sans aucune dependance externe :
// - icon.png (32 x 32) pour la barre systeme (tray)
// - build/icon.png (512 x 512) pour les installateurs Windows et Mac
// Usage : node tools/make-icon.js
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const TEAL_PLAI = [10, 147, 112, 255];
const BLANC = [255, 255, 255, 255];

function drawIcon(SIZE) {
  const pixels = Buffer.alloc(SIZE * SIZE * 4);

  function setPixel(x, y, [r, g, b, a]) {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    const i = (y * SIZE + x) * 4;
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
    pixels[i + 3] = a;
  }

  const centre = (SIZE - 1) / 2;
  const rayon = SIZE / 2 - Math.max(0.5, SIZE / 64);

  // Disque teal PLAI en fond.
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x - centre;
      const dy = y - centre;
      if (dx * dx + dy * dy <= rayon * rayon) setPixel(x, y, TEAL_PLAI);
    }
  }

  // Capsule du micro (rectangle vertical avec demi-cercles en haut et en bas),
  // centree horizontalement, dans la moitie haute de l'icone.
  const largeurCapsule = Math.round(SIZE * 0.26);
  const hauteurCapsule = Math.round(SIZE * 0.38);
  const rayonCapsule = largeurCapsule / 2;
  const centreXCapsule = centre;
  const hautCapsule = Math.round(SIZE * 0.16);
  const basCapsule = hautCapsule + hauteurCapsule;
  const centreHautArrondi = hautCapsule + rayonCapsule;
  const centreBasArrondi = basCapsule - rayonCapsule;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x - centreXCapsule;
      let dedans = false;

      if (y >= centreHautArrondi && y <= centreBasArrondi) {
        // Partie rectangulaire centrale.
        dedans = Math.abs(dx) <= rayonCapsule;
      } else if (y < centreHautArrondi) {
        // Demi-cercle du haut.
        const dy = y - centreHautArrondi;
        dedans = dx * dx + dy * dy <= rayonCapsule * rayonCapsule;
      } else {
        // Demi-cercle du bas.
        const dy = y - centreBasArrondi;
        dedans = dx * dx + dy * dy <= rayonCapsule * rayonCapsule;
      }

      if (dedans) setPixel(x, y, BLANC);
    }
  }

  // Pied du micro : arc de support (approxime par un arc de cercle en pixels)
  // sous la capsule, puis un pied vertical et une base horizontale.
  const rayonArc = Math.round(SIZE * 0.22);
  const centreYArc = basCapsule - Math.round(SIZE * 0.02);
  const epaisseurTrait = Math.max(1, Math.round(SIZE / 32));

  for (let angleDeg = 20; angleDeg <= 160; angleDeg += 2) {
    const angle = (angleDeg * Math.PI) / 180;
    const x = Math.round(centreXCapsule - rayonArc * Math.cos(angle));
    const y = Math.round(centreYArc + rayonArc * Math.sin(angle));
    for (let ex = -epaisseurTrait; ex <= epaisseurTrait; ex++) {
      for (let ey = -epaisseurTrait; ey <= epaisseurTrait; ey++) {
        setPixel(x + ex, y + ey, BLANC);
      }
    }
  }

  // Pied vertical, du bas de l'arc jusqu'a la base.
  const hautPied = centreYArc + rayonArc - epaisseurTrait;
  const basPied = Math.round(SIZE * 0.82);
  for (let y = hautPied; y <= basPied; y++) {
    for (let ex = -epaisseurTrait; ex <= epaisseurTrait; ex++) {
      setPixel(Math.round(centreXCapsule) + ex, y, BLANC);
    }
  }

  // Base horizontale, socle du pied.
  const largeurBase = Math.round(SIZE * 0.22);
  for (let x = Math.round(centreXCapsule - largeurBase / 2); x <= Math.round(centreXCapsule + largeurBase / 2); x++) {
    for (let ey = -epaisseurTrait; ey <= epaisseurTrait; ey++) {
      setPixel(x, basPied + ey, BLANC);
    }
  }

  return pixels;
}

// Encodage PNG minimal (signature + IHDR + IDAT + IEND).
function crc32(buf) {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(pixels, SIZE) {
  const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
  for (let y = 0; y < SIZE; y++) {
    raw[y * (SIZE * 4 + 1)] = 0;
    pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // profondeur : 8 bits par canal
  ihdr[9] = 6; // type de couleur : RVB + transparence

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const cibles = [
  { taille: 32, fichier: path.join(__dirname, '..', 'icon.png') },
  { taille: 512, fichier: path.join(__dirname, '..', 'build', 'icon.png') },
];

for (const { taille, fichier } of cibles) {
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  const png = encodePng(drawIcon(taille), taille);
  fs.writeFileSync(fichier, png);
  console.log(`${fichier} genere (${taille} x ${taille}, ${png.length} octets)`);
}

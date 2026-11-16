// Ufficio virtuale - la stessa stanza in 3D (Three.js r128, incluso nella cartella lib/).
// Stessi dati e stessi gruppi della versione 2D (Ufficio.prepara): cambia solo la scena.
// Stile morbido: forme arrotondate, colori pastello, luce calda. Omini ORIGINALI (non copie
// di personaggi esistenti), tutto generato dal codice: niente modelli esterni.
(function () {
  const U = window.Ufficio;
  const wrap = document.getElementById("ufficio3d");
  if (!wrap || !window.THREE || !U) return;
  const T = THREE;

  const renderer = new T.WebGLRenderer({ antialias: true });
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const etichette = document.createElement("div");
  etichette.className = "etichette3d";
  wrap.append(renderer.domElement, etichette);

  const scena = new T.Scene();
  scena.background = new T.Color("#cfe6f5").convertSRGBToLinear();
  scena.fog = new T.Fog(new T.Color("#cfe6f5").convertSRGBToLinear(), 60, 140);
  const camera = new T.PerspectiveCamera(35, 2, 0.1, 400);
  const controlli = new T.OrbitControls(camera, renderer.domElement);
  controlli.enableDamping = true;
  controlli.maxPolarAngle = Math.PI * 0.44;          // mai sotto il pavimento
  controlli.minDistance = 6; controlli.maxDistance = 80;

  scena.add(new T.HemisphereLight(new T.Color("#ffffff").convertSRGBToLinear(), new T.Color("#d9c4a5").convertSRGBToLinear(), 0.55));
  const sole = new T.DirectionalLight(new T.Color("#ffe9cc").convertSRGBToLinear(), 1.35);
  sole.position.set(-14, 26, 18);
  sole.castShadow = true;
  sole.shadow.mapSize.set(2048, 2048);
  sole.shadow.bias = -0.0006;
  Object.assign(sole.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 90 });
  scena.add(sole);

  const mondo = new T.Group();                       // tutto quello che dipende dai dati
  scena.add(mondo);
  const mat = {};
  const lin = c => new T.Color(c).convertSRGBToLinear();   // i colori scritti in esadecimale sono sRGB
  function m(c, extra) {                             // un materiale per colore, riusato
    const k = c + JSON.stringify(extra || {});
    if (mat[k]) return mat[k];
    const o = Object.assign({ roughness: 0.55, metalness: 0 }, extra, { color: lin(c) });
    if (o.emissive) o.emissive = lin(o.emissive);
    return (mat[k] = new T.MeshStandardMaterial(o));
  }
  const geo = new T.BoxGeometry(1, 1, 1);
  const geoCache = {};
  function geoTondo(w, h, d, r) {                    // scatola con tutti gli spigoli arrotondati
    const k = [w, h, d, r].join();
    if (geoCache[k]) return geoCache[k];
    r = Math.max(0.005, Math.min(r, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002));
    const e = 0.00001, sh = new T.Shape(), W = w - 2 * r, H = h - 2 * r;
    sh.absarc(e, e, e, -Math.PI / 2, -Math.PI, true);
    sh.absarc(e, H - 2 * e, e, Math.PI, Math.PI / 2, true);
    sh.absarc(W - 2 * e, H - 2 * e, e, Math.PI / 2, 0, true);
    sh.absarc(W - 2 * e, e, e, 0, -Math.PI / 2, true);
    const g = new T.ExtrudeGeometry(sh, { depth: Math.max(0.001, d - 2 * r), bevelEnabled: true, bevelSegments: 3,
      steps: 1, bevelSize: r - e, bevelThickness: r, curveSegments: 3 });
    g.center(); g.computeVertexNormals();
    return (geoCache[k] = g);
  }
  function tondo(w, h, d, c, x, y, z, padre, r, extra) {   // come box ma arrotondata
    const b = new T.Mesh(geoTondo(w, h, d, r == null ? Math.min(w, h, d) * 0.3 : r), m(c, extra));
    b.position.set(x, y + h / 2, z);
    b.castShadow = b.receiveShadow = true;
    (padre || mondo).add(b);
    return b;
  }
  const sfere = {};
  function palla(r, c, x, y, z, padre, sx, sy, sz, extra) {    // sfera (anche schiacciata)
    const k = "s" + r;
    const b = new T.Mesh(sfere[k] || (sfere[k] = new T.SphereGeometry(r, 24, 16)), m(c, extra));
    b.position.set(x, y, z); b.scale.set(sx || 1, sy || 1, sz || 1);
    b.castShadow = true;
    (padre || mondo).add(b);
    return b;
  }
  const PASTELLI = ["#5c9ee6", "#ef7f9f", "#62c48a", "#f2b443", "#a283e3", "#4fc1bd", "#f08a5d", "#7f97c7"];
  function box(w, h, d, c, x, y, z, padre, extra) { // scatola appoggiata: y e' la base
    const b = new T.Mesh(geo, m(c, extra));
    b.scale.set(w, h, d);
    b.position.set(x, y + h / 2, z);
    b.castShadow = b.receiveShadow = true;
    (padre || mondo).add(b);
    return b;
  }

  // ---------- pezzi d'arredo ----------
  // schermi: codice colorato su nero (scorre), e codice con un grosso "?" arancione per chi aspetta una risposta
  const COLORI_CODICE = ["#c792ea", "#82aaff", "#c3e88d", "#f78c6c", "#89ddff", "#ffcb6b", "#ff5370"];
  function disegnaCodice(x, W, H, seme) {
    let r = seme * 9301 + 49297;
    const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    x.fillStyle = "#0d1117"; x.fillRect(0, 0, W, H);
    let rientro = 0;
    for (let y = 8; y < H - 6; y += 13) {
      if (rnd() < 0.12) continue;                                        // riga vuota
      rientro = Math.max(0, Math.min(4, rientro + (rnd() < 0.3 ? 1 : rnd() < 0.3 ? -1 : 0)));
      let px = 10 + rientro * 16;
      if (rnd() < 0.15) { x.fillStyle = "#5c6370"; x.fillRect(px, y, 60 + rnd() * 120, 7); continue; }   // commento
      const n = 1 + Math.floor(rnd() * 5);
      for (let i = 0; i < n && px < W - 20; i++) {
        const w = 12 + rnd() * 50;
        x.fillStyle = COLORI_CODICE[Math.floor(rnd() * COLORI_CODICE.length)];
        x.fillRect(px, y, Math.min(w, W - 10 - px), 7);
        px += w + 7;
      }
    }
  }
  const texCodice = [0, 1, 2].map(i => {
    const c = document.createElement("canvas"); c.width = 256; c.height = 512;
    disegnaCodice(c.getContext("2d"), 256, 512, i + 1);
    const tx = new T.CanvasTexture(c); tx.encoding = T.sRGBEncoding; tx.wrapT = T.RepeatWrapping; tx.repeat.set(1, 0.3);
    return tx;
  });
  const texDomanda = (() => {
    const c = document.createElement("canvas"); c.width = 256; c.height = 150;
    const x = c.getContext("2d");
    disegnaCodice(x, 256, 150, 7);
    x.fillStyle = "rgba(13,17,23,.35)"; x.fillRect(0, 0, 256, 150);
    x.font = "900 150px 'Segoe UI', system-ui, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
    x.lineWidth = 10; x.strokeStyle = "#3a1d00"; x.strokeText("?", 128, 82);
    x.fillStyle = "#ff9a1f"; x.fillText("?", 128, 82);
    const tx = new T.CanvasTexture(c); tx.encoding = T.sRGBEncoding;
    return tx;
  })();
  const BIANCO = new T.Color("#ffffff");

  // targhetta con testo (commessa) disegnata su una texture, messa sul pannello davanti della scrivania
  const texCache = {};
  function testoTex(testo, fondo, inchiostro, bordo) {
    const k = [testo, fondo, inchiostro, bordo].join("|");
    if (texCache[k]) return texCache[k];
    const c = document.createElement("canvas"); c.width = 512; c.height = 96;
    const x = c.getContext("2d");
    x.fillStyle = fondo; x.fillRect(0, 0, 512, 96);
    if (bordo) { x.strokeStyle = bordo; x.lineWidth = 8; x.strokeRect(6, 6, 500, 84); }
    x.fillStyle = inchiostro; x.textAlign = "center"; x.textBaseline = "middle";
    let fs = 58; x.font = `700 ${fs}px "Segoe UI", system-ui, sans-serif`;
    while (x.measureText(testo).width > 470 && fs > 22) { fs -= 2; x.font = `700 ${fs}px "Segoe UI", system-ui, sans-serif`; }
    x.fillText(testo, 256, 50);
    const tx = new T.CanvasTexture(c); tx.encoding = T.sRGBEncoding; tx.anisotropy = 4;
    return (texCache[k] = tx);
  }
  function targhetta(testo, w, h, x, y, z, padre, fondo, inchiostro, bordo) {
    if (!testo) return;
    const p = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshStandardMaterial({ map: testoTex(testo, fondo, inchiostro, bordo), roughness: 0.4, metalness: bordo ? 0.25 : 0 }));
    p.position.set(x, y, z); padre.add(p);
    return p;
  }
  // tappeto persiano disegnato al volo (motivo originale: cornice, medaglione centrale, angoli, frange)
  let tappetoTex = null;
  function texTappeto() {
    if (tappetoTex) return tappetoTex;
    const c = document.createElement("canvas"); c.width = 640; c.height = 420;
    const x = c.getContext("2d"), W = 640, H = 420;
    x.fillStyle = "#f3ead6"; x.fillRect(0, 0, W, H);                           // frange
    x.fillStyle = "#1f2e5c"; x.fillRect(24, 0, W - 48, H);                     // bordo blu
    x.fillStyle = "#f0dca8"; x.fillRect(44, 20, W - 88, H - 40);
    x.fillStyle = "#8e1f2a"; x.fillRect(54, 30, W - 108, H - 60);              // campo rosso
    x.strokeStyle = "#e9c46a"; x.lineWidth = 3; x.strokeRect(66, 42, W - 132, H - 84);
    for (let i = 0; i < 26; i++) {                                              // motivo sul bordo
      const px = 60 + i * ((W - 120) / 25);
      for (const py of [12, H - 12]) { x.fillStyle = i % 2 ? "#e9c46a" : "#c4473e"; x.beginPath(); x.arc(px, py, 5, 0, 7); x.fill(); }
    }
    x.fillStyle = "rgba(233,196,106,.35)";                                      // puntini sul campo
    for (let i = 80; i < W - 80; i += 28) for (let j = 56; j < H - 56; j += 28) { x.beginPath(); x.arc(i, j, 2.5, 0, 7); x.fill(); }
    const losanga = (cx, cy, rx, ry, col) => { x.fillStyle = col; x.beginPath(); x.moveTo(cx - rx, cy); x.lineTo(cx, cy - ry); x.lineTo(cx + rx, cy); x.lineTo(cx, cy + ry); x.closePath(); x.fill(); };
    losanga(W / 2, H / 2, 170, 120, "#1f2e5c");                                 // medaglione
    losanga(W / 2, H / 2, 150, 104, "#e9c46a");
    losanga(W / 2, H / 2, 128, 88, "#b8323a");
    x.fillStyle = "#f3ead6"; x.beginPath(); x.ellipse(W / 2, H / 2, 58, 40, 0, 0, 7); x.fill();
    x.fillStyle = "#1f2e5c"; x.beginPath(); x.ellipse(W / 2, H / 2, 30, 20, 0, 0, 7); x.fill();
    for (let a = 0; a < 8; a++) { x.fillStyle = "#e9c46a"; x.beginPath(); x.arc(W / 2 + Math.cos(a * Math.PI / 4) * 44, H / 2 + Math.sin(a * Math.PI / 4) * 30, 6, 0, 7); x.fill(); }
    for (const [cx, cy, sx, sy] of [[66, 42, 1, 1], [W - 66, 42, -1, 1], [66, H - 42, 1, -1], [W - 66, H - 42, -1, -1]]) {   // angoli
      x.fillStyle = "#1f2e5c"; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + 90 * sx, cy); x.lineTo(cx, cy + 70 * sy); x.closePath(); x.fill();
      x.fillStyle = "#e9c46a"; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + 54 * sx, cy); x.lineTo(cx, cy + 42 * sy); x.closePath(); x.fill();
    }
    x.strokeStyle = "#ddd2bb"; x.lineWidth = 2;                                 // fili delle frange
    for (let j = 4; j < H; j += 8) for (const [a, b] of [[0, 24], [W - 24, W]]) { x.beginPath(); x.moveTo(a, j); x.lineTo(b, j); x.stroke(); }
    tappetoTex = new T.CanvasTexture(c); tappetoTex.encoding = T.sRGBEncoding; tappetoTex.anisotropy = 4;
    return tappetoTex;
  }
  function lampada(x, z, padre, col) {
    palla(0.1, col, x, 0.82, z, padre, 1, 0.3, 1);
    tondo(0.03, 0.38, 0.03, col, x, 0.82, z, padre, 0.012);
    palla(0.11, col, x + 0.06, 1.22, z, padre, 1, 0.7, 1, { emissive: "#fff2c0", emissiveIntensity: 0.2 });
  }

  // ---------- pezzi d'arredo ----------
  // tipo: "capo" (scrivania di lusso), "resp" (bella, in legno), altrimenti quella normale
  function scrivania(x, z, padre, s, tipo, nome) {
    const g = new T.Group(); g.position.set(x, 0, z); padre.add(g);
    const capo = tipo === "capo", resp = tipo === "resp";
    const W = capo ? 2.7 : resp ? 2.0 : 1.8, D = capo ? 1.15 : resp ? 0.95 : 0.9;
    if (capo) {                                                          // noce scuro con finiture d'oro
      tondo(W, 0.11, D, "#6b3d22", 0, 0.72, 0, g, 0.04);
      tondo(W + 0.04, 0.03, D + 0.04, "#e3b23c", 0, 0.7, 0, g, 0.015, { metalness: 0.6, roughness: 0.3 });
      tondo(W - 0.2, 0.012, D - 0.25, "#1d4a3a", 0, 0.83, -0.02, g, 0.006);       // piano in pelle verde
      for (const dx of [-W / 2 + 0.3, W / 2 - 0.3]) tondo(0.55, 0.7, D - 0.08, "#7a4528", dx, 0, 0, g, 0.04);   // cassettiere
      tondo(W - 0.1, 0.62, 0.06, "#7a4528", 0, 0.06, D / 2 - 0.05, g, 0.03);       // pannello davanti
      for (const dx of [-W / 2 + 0.3, W / 2 - 0.3]) for (const dy of [0.2, 0.45]) palla(0.03, "#e3b23c", dx, dy, D / 2 - 0.0, g, 1, 1, 0.6, { metalness: 0.6 });
      targhetta(nome || "CAPO", 1.3, 0.26, 0, 0.4, D / 2 - 0.01, g, "#e3b23c", "#3a2208", "#fff2b0");
      lampada(-W / 2 + 0.3, -0.15, g, "#e3b23c");
      palla(0.13, "#4f8fd6", W / 2 - 0.3, 1.0, -0.1, g, 1, 1, 1);                   // mappamondo
      tondo(0.03, 0.12, 0.03, "#e3b23c", W / 2 - 0.3, 0.83, -0.1, g, 0.01);
      tondo(0.12, 0.18, 0.12, "#2b2b33", W / 2 - 0.65, 0.83, 0.15, g, 0.04);       // portapenne
    } else if (resp) {                                                   // legno caldo, lampada
      tondo(W, 0.1, D, "#c08850", 0, 0.72, 0, g, 0.045);
      for (const dx of [-W / 2 + 0.07, W / 2 - 0.07]) tondo(0.12, 0.72, D - 0.1, "#a8743f", dx, 0, 0, g, 0.04);
      tondo(W - 0.3, 0.42, 0.06, "#a8743f", 0, 0.28, D / 2 - 0.06, g, 0.03);
      targhetta(nome, 1.5, 0.27, 0, 0.47, D / 2 - 0.02, g, "#fbf3e2", "#5a3a1a", "#d9b27a");
      lampada(-W / 2 + 0.25, -0.15, g, "#3c4658");
      tondo(0.3, 0.06, 0.22, "#e9edf2", W / 2 - 0.35, 0.83, 0.05, g, 0.02);         // pila di fogli
    } else {
      tondo(1.8, 0.09, 0.9, "#e2b880", 0, 0.72, 0, g, 0.04);                // piano in legno chiaro
      for (const dx of [-0.78, 0.78]) tondo(0.1, 0.72, 0.8, "#e9edf2", dx, 0, 0, g, 0.04);   // fianchi
      tondo(1.5, 0.36, 0.06, "#e9edf2", 0, 0.32, 0.38, g, 0.03);          // pannello davanti
      targhetta(nome, 1.4, 0.27, 0, 0.5, 0.415, g, "#ffffff", "#2a3142", "#f2b443");
      const tz = ["#f29fb5", "#7fb3e8", "#f5c26b"][U.hash(s.id) % 3];
      tondo(0.12, 0.13, 0.12, tz, 0.65, 0.81, 0.05, g, 0.05);              // tazza
    }
    const ym = capo ? 0.83 : 0.8;
    tondo(0.1, 0.26, 0.1, "#f5f6f8", 0, ym, 0.2, g, 0.04);             // monitor bianco, visto da dietro
    tondo(0.8, 0.5, 0.07, capo ? "#2b2b33" : "#f5f6f8", 0, ym + 0.22, 0.2, g, 0.035);
    const schermo = new T.Mesh(new T.PlaneGeometry(0.7, 0.4), new T.MeshBasicMaterial({ color: new T.Color("#2a2e3a").convertSRGBToLinear() }));
    schermo.rotation.y = Math.PI; schermo.position.set(0, ym + 0.47, 0.158); g.add(schermo);   // guarda verso l'omino
    // retro del monitor (quello che si vede dalla telecamera): bordo e bollino dello stesso colore dello schermo
    const mr = new T.MeshStandardMaterial({ color: new T.Color("#2a2e3a").convertSRGBToLinear(), roughness: 0.4, emissive: new T.Color("#000000"), emissiveIntensity: 0.35 });
    const bordo = new T.Mesh(geoTondo(0.9, 0.6, 0.05, 0.05), mr); bordo.position.set(0, ym + 0.47, 0.2); g.add(bordo);
    const bollino = new T.Mesh(new T.CircleGeometry(0.07, 20), mr); bollino.position.set(0, ym + 0.49, 0.238); g.add(bollino);
    schermo.userData.retro = mr;
    tondo(0.52, 0.03, 0.18, "#ffffff", 0, ym + 0.01, -0.15, g, 0.012);        // tastiera
    g.userData.schermo = schermo;
    return g;
  }
  function sedia(x, z, padre, colore, capo) {
    const g = new T.Group(); g.position.set(x, 0, z); padre.add(g);
    if (capo) {                                                          // poltrona alta in pelle bordeaux
      tondo(0.78, 0.16, 0.7, "#7d2433", 0, 0.4, 0, g, 0.07);
      tondo(0.8, 1.15, 0.18, "#7d2433", 0, 0.48, -0.36, g, 0.09);
      for (const dx of [-0.42, 0.42]) tondo(0.1, 0.12, 0.6, "#5e1a26", dx, 0.62, 0.02, g, 0.05);
      for (let i = 0; i < 4; i++) palla(0.025, "#e3b23c", -0.27 + i * 0.18, 1.5, -0.26, g, 1, 1, 0.6);
      tondo(0.08, 0.4, 0.08, "#e3b23c", 0, 0, 0, g, 0.03);
      palla(0.28, "#2b2b33", 0, 0.03, 0, g, 1, 0.15, 1);
      return g;
    }
    tondo(0.6, 0.12, 0.58, colore || "#9fb4d6", 0, 0.42, 0, g, 0.06);
    tondo(0.58, 0.62, 0.12, colore || "#9fb4d6", 0, 0.5, -0.3, g, 0.06);
    tondo(0.08, 0.42, 0.08, "#d5dae2", 0, 0, 0, g, 0.03);
    palla(0.22, "#d5dae2", 0, 0.03, 0, g, 1, 0.15, 1);
    return g;
  }
  // omino originale: testa tonda e grande, corpo a pillola, mani a pallina, faccia che cambia con lo stato
  // ruolo: "capo" (vestito da re), "resp" (giacca e cravatta / tailleur con gonna), "dip" (casual, gonna per le donne)
  const COMPLETI = ["#2f3b55", "#3a3f47", "#46506a", "#5b4a3f"];
  const JEANS = ["#4a6fa5", "#5a7fb5", "#3d5a8a"];
  function omino(s, padre, x, z, ruolo) {
    const h = U.hash(s.id), capo = ruolo === "capo", resp = ruolo === "resp";
    const postino = ruolo === "postino";
    const donna = !capo && !postino && ((h >>> 12) & 1) === 1;
    const pelle = U.PELLE[h % U.PELLE.length], capelli = U.CAPELLI[(h >>> 4) % U.CAPELLI.length];
    const maglia = postino ? "#3b6fc4" : capo ? "#b3203a" : resp ? COMPLETI[(h >>> 8) % COMPLETI.length] : PASTELLI[(h >>> 8) % PASTELLI.length];
    const pantaloni = postino ? "#2a3f6b" : capo ? "#7a1426" : resp ? maglia : donna ? pelle : JEANS[(h >>> 9) % JEANS.length];
    const scarpe = capo ? "#e3b23c" : resp ? "#1f1f26" : donna ? ["#ef7f9f", "#2b2b33", "#ffffff"][(h >>> 10) % 3] : "#ffffff";
    const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = Math.PI; padre.add(g);
    const corpo = new T.Group(); g.add(corpo);
    palla(0.26, maglia, 0, 0.78, 0, corpo, 1, 1.3, 0.85);                 // busto a pillola
    if (capo) {                                                          // re: mantello rosso con collo d'ermellino, bottoni d'oro
      const mant = new T.Mesh(new T.CylinderGeometry(0.3, 0.42, 0.95, 20, 1, true, Math.PI * 0.62, Math.PI * 0.76), m("#9e1630", { side: T.DoubleSide }));
      mant.position.set(0, 0.62, 0.02); mant.castShadow = true; corpo.add(mant);
      const coll = new T.Mesh(new T.TorusGeometry(0.22, 0.07, 10, 24), m("#fbf7ee")); coll.rotation.x = Math.PI / 2; coll.position.y = 1.08; corpo.add(coll);
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; palla(0.018, "#1f1f26", Math.sin(a) * 0.24, 1.1, Math.cos(a) * 0.24, corpo); }
      for (const by of [0.95, 0.8, 0.65]) palla(0.03, "#e3b23c", 0, by, -0.225, corpo, 1, 1, 0.5, { metalness: 0.6 });
      tondo(0.5, 0.06, 0.4, "#e3b23c", 0, 0.52, 0, corpo, 0.03, { metalness: 0.6, roughness: 0.3 });   // cintura d'oro
    } else if (resp) {                                                   // camicia bianca a V, cravatta o collana
      palla(0.12, "#ffffff", 0, 0.98, -0.18, corpo, 0.8, 1.1, 0.4);
      if (donna) { const cl = new T.Mesh(new T.TorusGeometry(0.09, 0.012, 6, 20, Math.PI), m("#e3b23c", { metalness: 0.5 })); cl.rotation.set(-0.3, 0, Math.PI); cl.position.set(0, 1.02, -0.2); corpo.add(cl); }
      else tondo(0.07, 0.3, 0.03, s.colore || "#c62828", 0, 0.68, -0.23, corpo, 0.015);
      for (const by of [0.72, 0.6]) palla(0.022, "#1f1f26", 0.05, by, -0.215, corpo, 1, 1, 0.5);
    } else if (postino) {                                                // borsa a tracolla
      tondo(0.3, 0.24, 0.12, "#8a5a2b", 0.2, 0.55, -0.12, corpo, 0.04);
      const tr = new T.Mesh(new T.TorusGeometry(0.3, 0.02, 6, 24), m("#6b4420")); tr.rotation.set(0, Math.PI / 2, 0.7); tr.position.set(0, 0.85, 0); corpo.add(tr);
    } else if (!donna && (h >>> 13) & 1) {                                // felpa con cappuccio per qualcuno
      palla(0.2, maglia, 0, 1.0, 0.16, corpo, 1.1, 0.6, 0.7);
      for (const dx of [-0.06, 0.06]) tondo(0.015, 0.16, 0.015, "#ffffff", dx, 0.86, -0.22, corpo, 0.006);
    }
    let gonna = null;
    if (donna) {                                                         // gonna a campana
      gonna = new T.Mesh(new T.CylinderGeometry(0.22, 0.32, 0.3, 20), m(resp ? maglia : PASTELLI[(h >>> 14) % PASTELLI.length]));
      gonna.position.y = 0.46; gonna.castShadow = true; corpo.add(gonna);
    }
    const sedute = [palla(0.11, pantaloni, -0.12, 0.47, -0.2, corpo, 1, 0.9, 1.9),   // gambe sotto la scrivania (seduto)
                    palla(0.11, pantaloni, 0.12, 0.47, -0.2, corpo, 1, 0.9, 1.9)];
    const gambe = [-0.11, 0.11].map(lx => {                              // gambe in piedi, con l'anca come perno
      const a = new T.Group(); a.position.set(lx, 0.56, 0); corpo.add(a);
      const c = new T.Mesh(new T.CylinderGeometry(donna ? 0.055 : 0.075, donna ? 0.05 : 0.07, 0.42, 10), m(pantaloni)); c.position.y = -0.24; c.castShadow = true; a.add(c);
      palla(0.09, scarpe, 0, -0.47, -0.04, a, 1, 0.6, 1.4);               // scarpa
      a.visible = false; return a;
    });
    const testa = new T.Group(); testa.position.set(0, 1.33, 0); corpo.add(testa);
    palla(0.27, pelle, 0, 0, 0, testa, 1, 1.05, 1);                         // testa
    // capelli: calotta sopra e dietro, con un ciuffo diverso per ognuno
    const cal = new T.Mesh(new T.SphereGeometry(0.29, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.42), m(capelli));
    cal.rotation.x = 0.35; cal.position.y = 0.02; cal.castShadow = true; testa.add(cal);
    if (donna) {                                                         // capelli lunghi dietro e ai lati
      palla(0.27, capelli, 0, -0.12, 0.08, testa, 1.08, 1.1, 0.85);
      for (const sx of [-0.25, 0.25]) palla(0.09, capelli, sx, -0.12, 0.02, testa, 0.7, 1.9, 1);
    }
    if (postino) {                                                       // berretto con visiera
      const b = new T.Mesh(new T.CylinderGeometry(0.27, 0.29, 0.14, 20), m("#2a4f98")); b.position.y = 0.2; testa.add(b);
      tondo(0.3, 0.025, 0.16, "#1c2f5c", 0, 0.14, -0.27, testa, 0.01);
      palla(0.035, "#f2b443", 0, 0.22, -0.28, testa, 1, 1, 0.4, { metalness: 0.5 });
    }
    const ciuffo = postino ? -1 : h % 3;
    if (ciuffo === 0) palla(0.11, capelli, -0.1, 0.2, -0.17, testa, 1.3, 0.7, 0.8);
    if (ciuffo === 1) { palla(0.09, capelli, -0.24, 0.0, 0.02, testa, 0.6, 1.4, 1); palla(0.09, capelli, 0.24, 0.0, 0.02, testa, 0.6, 1.4, 1); }
    if (ciuffo === 2) palla(0.14, capelli, 0, 0.26, 0.05, testa, 1, 0.6, 1);
    // faccia (davanti = -z)
    const occhi = [palla(0.035, "#2b2b33", -0.09, 0.03, -0.25, testa, 1, 1.5, 0.6), palla(0.035, "#2b2b33", 0.09, 0.03, -0.25, testa, 1, 1.5, 0.6)];
    for (const o of occhi) o.castShadow = false;
    for (const sx of [-0.09, 0.09]) tondo(0.08, 0.018, 0.02, capelli, sx, 0.11, -0.245, testa, 0.008);   // sopracciglia
    palla(0.03, pelle, 0, -0.03, -0.27, testa, 1, 0.9, 0.8);              // naso
    for (const sx of [-0.15, 0.15]) palla(0.04, "#f6a8a8", sx, -0.06, -0.22, testa, 1, 0.6, 0.4, { transparent: true, opacity: 0.6 });   // guance
    const sorriso = new T.Mesh(new T.TorusGeometry(0.055, 0.012, 6, 16, Math.PI), m("#8a3b3b"));
    sorriso.position.set(0, -0.08, -0.255); sorriso.rotation.set(0, 0, Math.PI); testa.add(sorriso);
    const bocca_o = palla(0.03, "#8a3b3b", 0, -0.1, -0.25, testa, 1, 1.2, 0.5);
    const linea = tondo(0.07, 0.014, 0.02, "#8a3b3b", 0, -0.11, -0.255, testa, 0.006);
    if (capo) {                                                          // corona e cravatta
      const oro = { color: new T.Color("#f0c040").convertSRGBToLinear(), roughness: 0.3, metalness: 0.4, emissive: new T.Color("#4a3000").convertSRGBToLinear() };
      const anello = new T.Mesh(new T.CylinderGeometry(0.17, 0.17, 0.08, 20, 1, true), new T.MeshStandardMaterial(Object.assign({ side: T.DoubleSide }, oro)));
      anello.position.y = 0.3; testa.add(anello);
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2;
        const p = new T.Mesh(new T.ConeGeometry(0.035, 0.09, 8), new T.MeshStandardMaterial(oro));
        p.position.set(Math.sin(a) * 0.16, 0.38, Math.cos(a) * 0.16); testa.add(p);
        palla(0.02, "#ff6b8a", Math.sin(a) * 0.16, 0.43, Math.cos(a) * 0.16, testa);
      }
    }
    const braccio = dx => {                                              // spalla come perno
      const b = new T.Group(); b.position.set(dx, 1.0, 0); corpo.add(b);
      const c = new T.Mesh(new T.CylinderGeometry(0.065, 0.075, 0.36, 12), m(maglia));
      c.position.y = -0.18; c.castShadow = true; b.add(c);
      palla(0.085, pelle, 0, -0.4, 0, b);                                  // mano a pallina
      return b;
    };
    const sx = braccio(-0.31), dx = braccio(0.31);
    const telefono = tondo(0.07, 0.24, 0.06, "#2b2b33", 0, -0.52, -0.04, dx, 0.025); telefono.visible = false;   // cornetta in mano
    const tazza = tondo(0.1, 0.12, 0.1, "#ffffff", 0, -0.55, -0.06, dx, 0.04); tazza.visible = false;           // tazza del caffe'
    g.userData = { corpo, testa, sx, dx, s, fase: (h % 97) / 10, occhi, sorriso, bocca_o, linea, stato: null, salto: 0,
      sedute, gambe, telefono, tazza, gonna, casa: [x, z], giro: null, prossimo: 8 + (h % 40) };
    return g;
  }
  function etichetta(cls, testo, pos, titolo) {
    const e = document.createElement("div");
    e.className = "et3d " + cls;
    e.textContent = testo;
    if (titolo) e.title = titolo;
    etichette.append(e);
    return { e, pos };
  }

  // ---------- costruzione della scena dai dati ----------
  let animati = [], marcati = [], cliccabili = [], schermi = [], camminatori = [];
  // postino: quando un thread passa da "aspetta te" a "lavora" vuol dire che Stefano ha risposto
  const statiPrima = new Map();
  let postini = [], bersagli = new Map(), ingresso = [-2.5, 6];
  function creaPostino(p) {
    p.g = omino({ id: "postino" + p.id }, mondo, p.punti[0][0], p.punti[0][1], "postino");
    for (const l of p.g.userData.sedute) l.visible = false;
    for (const l of p.g.userData.gambe) l.visible = true;
    const busta = tondo(0.26, 0.17, 0.03, "#fffaf0", 0, -0.45, -0.1, p.g.userData.dx, 0.01);
    palla(0.035, "#d23c3c", 0, -0.45, -0.12, p.g.userData.dx, 1, 1, 0.4);
    p.busta = busta;
    p.pos = new T.Vector3(p.punti[0][0], 2.0, p.punti[0][1]);
    marcati.push(etichetta("f3d", "✉️ Da Stefano", p.pos));
  }
  let ordini = [], uffici = new Map();
  function avviaPostino(id) {
    let b = bersagli.get(id);
    if (!b) return;
    const dip = b.ufficio ? b : null;                                    // e' un dipendente: la busta va al suo capo/responsabile
    if (dip) { b = bersagli.get("capo:" + dip.ufficio); if (!b) return; }
    const [ix, iz] = ingresso, via = b.via;
    const punti = [[ix, iz, 0], [b.x, via, 0], [b.x, b.z, 1.6, "consegna"], [b.x, via, 0], [ix, iz, 0]];
    const p = { id, punti, inizio: performance.now() / 1000, verso: b.verso };
    postini.push(p); creaPostino(p);
    if (dip) avviaOrdine(dip, p.inizio + durata(punti.slice(0, 3), 1.6));
  }
  // il capo o il responsabile esce dall'ufficio, va accanto alla scrivania dell'omino, gesticola e torna a sedersi
  function avviaOrdine(dip, inizio) {
    const uf = uffici.get(dip.ufficio);
    if (!uf || ordini.some(o => o.chiave === dip.ufficio)) return;
    const { gx, gz, LW, LD, casa } = uf, porta = LW * 0.32, fuori = LD / 2 + 0.7;
    const tx = dip.dx - 1.15 - gx, tz = dip.dz - gz, via = dip.via - gz;
    const andata = [[casa[0], casa[1], 0.7], [porta, casa[1], 0], [porta, fuori, 0], [tx, via, 0], [tx, tz, 3.4, "ordini"]];
    const punti = andata.concat([[tx, via, 0], [porta, fuori, 0], [porta, casa[1], 0], [casa[0], casa[1], 0.4, "siede"]]);
    ordini.push({ chiave: dip.ufficio, punti, inizio, fine: inizio + durata(punti, 1.1) });
  }
  let primaVolta = true, centro = new T.Vector3(), larg = 20, prof = 10;

  function costruisci(sessioni, extra) {
    mondo.clear();
    etichette.replaceChildren();
    animati = []; marcati = []; cliccabili = []; schermi = []; camminatori = [];
    bersagli = new Map(); uffici = new Map();
    const gruppi = U.prepara(sessioni, extra);
    const capi = gruppi.filter(U.haUfficio);
    const UFF = 3.6, PASSO = 2.6;
    // 1) uffici a vetri in fila in fondo; quello del capo e' piu' grande, con tappeto persiano e finiture d'oro
    const dim = gr => gr.chiave === "r:capo" ? [5.6, 4.6] : [UFF, UFF];
    const pulito = s => (s || "").replace(/^\S*[^\w\s]\S*\s+/u, "").replace(/\s*\(.*\)$/, "");   // toglie l'emoji iniziale
    let xc = 0, profMax = UFF;
    const porte = {};
    capi.forEach((gr, i) => {
      const [LW, LD] = dim(gr), capo = gr.chiave === "r:capo";
      profMax = Math.max(profMax, LD);
      const x = xc + LW / 2, z = 0;
      porte[gr.chiave] = [x - LW * 0.15, z + LD / 2 + 0.45];               // davanti al vetro, accanto all'apertura
      bersagli.set("capo:" + gr.chiave, { x: x + LW * 0.3, z: z + LD / 2 + 0.45, via: z + LD / 2 + 2.2, verso: 0 });
      xc += LW + 0.6;
      const g = new T.Group(); g.position.set(x, 0, z); mondo.add(g);
      tondo(LW, 0.03, LD, capo ? "#efe6d6" : "#dfe7f1", 0, 0, 0, g, 0.01);         // pavimento dell'ufficio
      if (capo) {
        const tp = new T.Mesh(new T.PlaneGeometry(3.9, 2.6), new T.MeshStandardMaterial({ map: texTappeto(), roughness: 0.9 }));
        tp.rotation.x = -Math.PI / 2; tp.position.set(0, 0.04, 0.15); tp.receiveShadow = true; g.add(tp);
      }
      const HV = capo ? 2.5 : 2.2, telaio = capo ? "#e3b23c" : "#ffffff";
      const pv = new T.MeshStandardMaterial({ transparent: true, opacity: 0.16, color: new T.Color("#bfe3fb").convertSRGBToLinear(), roughness: 0.1 });
      for (const [w, d, px, pz] of [[LW, 0.05, 0, -LD / 2], [0.05, LD, -LW / 2, 0], [0.05, LD, LW / 2, 0], [LW * 0.62, 0.05, -LW * 0.19, LD / 2]]) {
        const v = new T.Mesh(geo, pv); v.scale.set(w, HV, d); v.position.set(px, HV / 2, pz); g.add(v);
        tondo(w + 0.04, 0.07, d + 0.04, telaio, px, HV, pz, g, 0.025, capo ? { metalness: 0.6, roughness: 0.3 } : undefined);
      }
      tondo(LW, 0.14, 0.1, capo ? "#e3b23c" : gr.colore, 0, HV + 0.07, -LD / 2, g, 0.05,
        capo ? { metalness: 0.6, roughness: 0.3, emissive: "#6a4a00", emissiveIntensity: 0.3 } : { emissive: gr.colore, emissiveIntensity: 0.25 });
      const piante = capo ? [[LW / 2 - 0.45, -LD / 2 + 0.45], [-LW / 2 + 0.45, -LD / 2 + 0.45]] : [[LW / 2 - 0.45, -LD / 2 + 0.45]];
      for (const [px, pz] of piante) {
        tondo(0.42, 0.45, 0.42, capo ? "#2b2b33" : "#f3f0ea", px, 0, pz, g, 0.12);   // pianta in vaso
        palla(0.3, "#7cc98a", px, 0.72, pz, g, 1, 1.15, 1);
        palla(0.2, "#93d6a0", px + 0.1, 0.95, pz - 0.07, g);
      }
      if (capo) {                                                        // tavolino con coppa d'oro
        tondo(0.5, 0.5, 0.5, "#6b3d22", -LW / 2 + 0.5, 0, LD / 2 - 0.9, g, 0.06);
        palla(0.1, "#e3b23c", -LW / 2 + 0.5, 0.68, LD / 2 - 0.9, g, 1, 1, 1, { metalness: 0.7, roughness: 0.25 });
        tondo(0.05, 0.12, 0.05, "#e3b23c", -LW / 2 + 0.5, 0.5, LD / 2 - 0.9, g, 0.02, { metalness: 0.7 });
      }
      const nelVetro = gr.sessioni.filter(q => q.inUfficio);
      const stato = nelVetro.some(q => q.stato === "aspetta") ? "aspetta" : "supervisore";
      const s = { id: "capo:" + gr.chiave, stato, colore: gr.colore };
      const nome = capo ? "CAPO" : pulito(U.nomeIsola(gr));
      const scr = scrivania(0, capo ? 0.35 : 0.3, g, s, capo ? "capo" : "resp", nome);
      sedia(0, capo ? -0.75 : -0.65, g, gr.colore, capo);
      const capoOm = omino(s, g, 0, capo ? -0.6 : -0.5, capo ? "capo" : "resp");
      animati.push(capoOm);
      capoOm.userData.chiave = gr.chiave;
      uffici.set(gr.chiave, { gx: x, gz: z, LW, LD, casa: [0, capo ? -0.6 : -0.5] });
      if (stato === "aspetta") {                                         // ti sta chiamando: in piedi con la cornetta, avanti e indietro
        const zc = capo ? -1.45 : -1.15, lx = LW / 2 - 0.9;
        capoOm.userData.telefonata = { giro: [[0, zc, 0.6], [-lx, zc, 1.6], [lx, zc, 1.6], [0, zc, 0.4]] };
        const pos = new T.Vector3(x, 1.85, z - 0.6);
        capoOm.userData.etichetta = { pos, base: [x, z] };
        marcati.push(etichetta("f3d st-aspetta", "📞", pos, "Ti sta chiamando: aspetta una tua risposta"));
      }
      schermi.push({ mesh: scr.userData.schermo, s });
      const link = gr.link || (gr.s0 && gr.s0.link);
      cliccabili.push({ obj: g, apri: () => link && apriLink(link) });
      const sc = gr.scheda;
      marcati.push(etichetta("nome uff", U.nomeIsola(gr), new T.Vector3(x, HV + 0.55, z - LD / 2)));
      marcati.push(etichetta("riep" + (stato === "aspetta" ? " chiama" : ""), U.riepilogo(gr), new T.Vector3(x, 0.05, z + LD / 2 + 0.9),
        sc ? [sc.fatto && "Fatto: " + sc.fatto, sc.in_corso && "In corso: " + sc.in_corso, sc.aspetta && "Aspetta: " + sc.aspetta].filter(Boolean).join("\n\n") : ""));
    });
    // 2) open space davanti: un'isola per gruppo, scrivanie in fila; ogni fila centrata sotto gli uffici
    const isole = gruppi.map(gr => ({ gr, fuori: gr.sessioni.filter(q => !q.inUfficio) })).filter(q => q.fuori.length);
    const largUffici = Math.max(UFF, xc - 0.6), mezzo = largUffici / 2;
    const rigaMax = Math.max(4, Math.floor(largUffici / PASSO));
    const file = [[]];
    let usate = 0;
    for (const q of isole) {
      if (usate && usate + q.fuori.length > rigaMax) { file.push([]); usate = 0; }
      file[file.length - 1].push(q); usate += q.fuori.length;
    }
    let z0 = profMax / 2 + 6.4;
    for (const fila of file) {
      if (!fila.length) continue;
      const w = fila.reduce((n, q) => n + q.fuori.length * PASSO, 0) + (fila.length - 1) * 0.8;
      let x0 = mezzo - w / 2;
      for (const { gr, fuori } of fila) {
        const wi = fuori.length * PASSO;
        const tappeto = tondo(wi, 0.03, 3.4, gr.colore, x0 + wi / 2, 0, z0 + 0.2, mondo, 0.012, { transparent: true, opacity: 0.4 });
        tappeto.castShadow = false;
        marcati.push(etichetta("nome", U.nomeIsola(gr), new T.Vector3(x0 + wi / 2, 0.05, z0 + 2.35)));
        fuori.forEach((s, i) => {
          const x = x0 + PASSO / 2 + i * PASSO;
          const scr = scrivania(x, z0, mondo, s, "", pulito(U.targa(s)).replace(/\s*❌\d*$/, ""));
          sedia(x, z0 - 0.95, mondo);
          const presente = U.PRESENTI.includes(s.stato);
          const om = presente ? omino(s, mondo, x, z0 - 0.8, "dip") : null;
          if (om) {
            animati.push(om); camminatori.push(om); om.userData.corridoio = z0 - 1.75;
            om.userData.porta = porte[gr.chiave] || porte["r:capo"] || null;   // i thread senza responsabile vanno dal capo
            bersagli.set(s.id, { dx: x, dz: z0 - 0.8, via: profMax / 2 + 2.2,
              ufficio: uffici.has(gr.chiave) ? gr.chiave : uffici.has("r:capo") ? "r:capo" : null });
          }
          schermi.push({ mesh: scr.userData.schermo, s: presente ? s : { stato: "spento" } });
          const apri = () => s.link ? apriLink(s.link) : window.open("/chat?id=" + encodeURIComponent(s.id), "chat-" + s.id);
          cliccabili.push({ obj: scr, apri });
          if (presente) {
            const [ic, testo] = U.testoFumetto(s);
            marcati.push(etichetta("f3d st-" + (s.download ? "allarme" : s.stato.replace("?", "")),
              ic + " " + U.corto(testo, s.stato === "aspetta" ? 40 : 30), om.userData.etichettaPos = new T.Vector3(x, 1.95, z0 - 0.8), s.titolo));
          }
          const tg = U.targa(s) || U.corto((s.titolo || "").replace(/^.*?›\s*/, ""), 18);
          if (tg) marcati.push(etichetta("tg3d", (s.cloud ? "☁️ " : "") + tg, new T.Vector3(x, 0.05, z0 + 1.5), s.titolo));
        });
        x0 += wi + 0.8;
      }
      // angolo caffe' in fondo alla fila: chi lavora ogni tanto si alza e ci va
      const cx = x0 + 0.6, cz = z0 - 1.75;
      tondo(1.2, 0.9, 0.6, "#ffffff", cx, 0, cz, mondo, 0.06);
      tondo(1.24, 0.06, 0.64, "#c08850", cx, 0.9, cz, mondo, 0.03);
      tondo(0.36, 0.5, 0.32, "#3c4658", cx - 0.2, 0.96, cz - 0.05, mondo, 0.06);       // macchinetta
      palla(0.035, "#ff6b6b", cx - 0.2, 1.3, cz + 0.12, mondo, 1, 1, 0.5, { emissive: "#ff6b6b", emissiveIntensity: 0.6 });
      for (const dx of [0.15, 0.32]) tondo(0.1, 0.11, 0.1, "#ffffff", cx + dx, 0.96, cz + 0.1, mondo, 0.04);
      for (const om of camminatori.splice(0)) om.userData.caffe = [cx - 0.2, cz + 0.65];
      z0 += 4.4;
    }
    // pavimento e pareti attorno a tutto
    const bb = new T.Box3().setFromObject(mondo);
    const size = bb.getSize(new T.Vector3()), mid = bb.getCenter(new T.Vector3());
    const pav = box(size.x + 6, 0.1, size.z + 6, "#dcc7a6", mid.x, -0.1, mid.z, mondo, { roughness: 0.35 });
    pav.castShadow = false;
    box(size.x + 6, 3, 0.2, "#f6f1e9", mid.x, 0, bb.min.z - 3);          // parete di fondo chiara
    box(size.x + 6, 0.2, 0.22, "#d9cbb5", mid.x, 0, bb.min.z - 2.9);     // battiscopa
    for (let i = 0; i < Math.max(1, Math.floor(size.x / 6)); i++) {        // finestre
      const fx = bb.min.x + 3 + i * 6;
      tondo(2.5, 1.4, 0.06, "#ffffff", fx, 1.15, bb.min.z - 2.88, mondo, 0.05);
      const v = box(2.2, 1.1, 0.06, "#7cc0ea", fx, 1.3, bb.min.z - 2.86, mondo, {});
      v.material = new T.MeshBasicMaterial({ color: new T.Color("#9fd4f2").convertSRGBToLinear() });
    }
    centro.copy(mid); larg = size.x + 1; prof = size.z + 2;
    ingresso = [bb.min.x - 2, profMax / 2 + 2.2];
    for (const p of postini) creaPostino(p);                               // quelli gia' in cammino continuano
    const ora = new Map(schermi.map(q => [q.s.id, q.s.stato]));
    const primaVoltaDati = statiPrima.size === 0;
    for (const [id, st] of ora) {
      if (!id || primaVoltaDati || postini.some(p => p.id === id)) continue;
      const prima = statiPrima.get(id), attivo = ["lavora", "pensa", "supervisore"].includes(st);
      // risposta di Stefano (aspetta -> lavora), nuovo compito (finito/fermo -> lavora) o thread nuovo che parte
      if (attivo && (prima === "aspetta" || prima === "finito" || prima === "ferma?" || prima === undefined)) avviaPostino(id);
    }
    statiPrima.clear(); for (const [id, st] of ora) statiPrima.set(id, st);
    if (primaVolta) inquadra();
  }

  function inquadra() {
    primaVolta = false;
    controlli.target.copy(centro);
    // distanza per far stare tutta la larghezza (e la profondita') nell'inquadratura
    const vf = camera.fov * Math.PI / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    const d = Math.max(larg / 2 / Math.tan(hf / 2), prof / 2 / Math.tan(vf / 2)) * 1.05;
    camera.position.set(centro.x, centro.y + d * 0.72, centro.z + d * 0.72);
    controlli.update();
  }

  // ---------- animazione ----------
  const COL = Object.assign({}, U.COLORI_STATO, { supervisore: "#9fd2f0", spento: "#2a2e3a", inattiva: "#2a2e3a", vuota: "#2a2e3a" });
  const v = new T.Vector3();
  let t = 0, ultimo = 0, attivo = false;
  // percorso a tappe: punti = [[x, z, pausa, azione]]; restituisce dove si trova l'omino dopo e secondi
  function durata(punti, vel) {
    let tt = 0;
    punti.forEach((p, i) => { tt += p[2] || 0; const q = punti[i + 1]; if (q) tt += Math.hypot(q[0] - p[0], q[1] - p[1]) / vel; });
    return tt;
  }
  function lungo(punti, e, vel) {
    let tt = 0;
    for (let i = 0; i < punti.length; i++) {
      const p = punti[i];
      if (e < tt + (p[2] || 0)) return { x: p[0], z: p[1], azione: p[3], fermo: true };
      tt += p[2] || 0;
      const q = punti[i + 1];
      if (!q) break;
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]), dur = d / vel;
      if (e < tt + dur) { const f = (e - tt) / dur; return { x: p[0] + (q[0] - p[0]) * f, z: p[1] + (q[1] - p[1]) * f, dir: [q[0] - p[0], q[1] - p[1]] }; }
      tt += dur;
    }
    const l = punti[punti.length - 1];
    return { x: l[0], z: l[1], fine: true, fermo: true };
  }
  function giroBussa(u) {                                            // fino alla porta dell'ufficio del responsabile e ritorno
    const [x, z] = u.casa, c = u.corridoio, [px, pz] = u.porta;
    return [[x, z, 0.7], [x, c, 0], [px, c, 0], [px, pz, 0], [px, pz, 2.4, "bussa"], [px, pz, 1.6, "attende"],
            [px, c, 0], [x, c, 0], [x, z, 0.4, "siede"]];
  }
  function giroCaffe(u) {                                            // dalla sedia al caffe' e ritorno, passando dietro le sedie
    const [x, z] = u.casa, c = u.corridoio, [mx, mz] = u.caffe;
    return [[x, z, 0.7], [x, c, 0], [mx - 0.7, c, 0], [mx - 0.7, mz, 0], [mx, mz, 4.5, "caffe"], [mx - 0.7, mz, 0],
            [mx - 0.7, c, 0], [x, c, 0], [x, z, 0.4, "siede"]];
  }
  function anima(ms) {
    requestAnimationFrame(anima);
    if (!attivo || document.hidden || ms - ultimo < 1000 / 24) return;   // 24 fotogrammi al secondo bastano
    ultimo = ms; t = ms / 1000;
    for (const a of animati) {
      const u = a.userData, { corpo, testa, sx, dx, s, fase } = u;
      const k = t + fase;
      if (u.stato !== s.stato) { u.stato = s.stato; u.salto = t; }     // saltello quando cambia stato
      const salto = Math.max(0, 1 - (t - u.salto) / 0.5);
      corpo.position.y = Math.sin(k * 2) * 0.012 + Math.sin(salto * Math.PI) * 0.12 * (u.salto ? 1 : 0);
      // faccia: sorriso se lavora, "o" se aspetta te, linea se pensa o e' fermo, occhi chiusi se ha finito
      const dorme = s.stato === "finito", batte = (k % 4) < 0.12;
      for (const o of u.occhi) o.scale.y = dorme || batte ? 0.25 : 1.5;
      u.sorriso.visible = ["lavora", "supervisore"].includes(s.stato);
      u.bocca_o.visible = s.stato === "aspetta";
      u.linea.visible = !u.sorriso.visible && !u.bocca_o.visible;
      testa.rotation.set(0, 0, 0); corpo.rotation.set(0, 0, 0); corpo.position.z = 0; if (u.gonna) u.gonna.rotation.x = 0; sx.rotation.set(1.2, 0, 0); dx.rotation.set(1.2, 0, 0);
      let inPiedi = false, cammina = false;
      u.telefono.visible = u.tazza.visible = false;
      // passeggiata al caffe' per chi lavora (ogni minuto circa); la finisce anche se nel frattempo cambia stato
      // chi aspetta una risposta va a bussare dal suo responsabile (circa ogni minuto)
      const vaCaffe = u.caffe && s.stato === "lavora", vaBussare = u.porta && s.stato === "aspetta";
      if (!u.giro && (vaCaffe || vaBussare)) {
        if (u.prossimoT == null) u.prossimoT = t + u.prossimo;
        if (t > u.prossimoT) u.giro = { punti: vaCaffe ? giroCaffe(u) : giroBussa(u), inizio: t };
      }
      if (u.chiave && !u.giro) {
        const o = ordini.find(o => o.chiave === u.chiave && t >= o.inizio && t < o.fine);
        if (o) u.giro = { punti: o.punti, inizio: o.inizio };
      }
      let pos = null;
      if (u.giro) {
        pos = lungo(u.giro.punti, t - u.giro.inizio, 1.1);
        if (pos.fine) { u.giro = null; u.prossimoT = t + 50 + (U.hash(s.id + t) % 40); pos = null; }
        else if (u.telefonata && pos) pos.azione = pos.azione || null;
      } else if (u.telefonata) {
        const g = u.telefonata.giro, tot = durata(g, 0.7);
        pos = lungo(g, (t + fase) % tot, 0.7);
        pos.azione = "telefono";
      }
      if (pos) {
        inPiedi = !(pos.azione === "siede" || (pos.fermo && pos.x === u.casa[0] && pos.z === u.casa[1] && !u.telefonata && !pos.azione));
        cammina = !pos.fermo;
        a.position.x = pos.x; a.position.z = pos.z;
        if (pos.dir) a.rotation.y = Math.atan2(-pos.dir[0], -pos.dir[1]);
        else if (["caffe", "bussa", "attende"].includes(pos.azione)) a.rotation.y = 0;      // verso la macchinetta o la porta
        else if (pos.azione === "ordini") a.rotation.y = -Math.PI / 2;                    // guarda l'omino alla scrivania
        else if (pos.azione === "telefono") a.rotation.y = Math.PI + Math.sin(k) * 0.3;
        else a.rotation.y = Math.PI;
        if (pos.fermo && u.giro && t - u.giro.inizio < 0.7) inPiedi = true;   // si alza
      } else { a.position.x = u.casa[0]; a.position.z = u.casa[1]; a.rotation.y = Math.PI; }
      for (const l of u.sedute) l.visible = !inPiedi;
      for (const l of u.gambe) { l.visible = inPiedi; l.rotation.x = 0; }
      if (inPiedi) {
        if (cammina) {
          const o = Math.sin(k * 9);
          u.gambe[0].rotation.x = o * 0.5; u.gambe[1].rotation.x = -o * 0.5;
          sx.rotation.set(-o * 0.5, 0, 0.12); dx.rotation.set(o * 0.5, 0, -0.12);
          corpo.position.y += Math.abs(Math.cos(k * 9)) * 0.03;
        } else { sx.rotation.set(0.1, 0, 0.12); dx.rotation.set(0.1, 0, -0.12); }
        if (pos && pos.azione === "telefono") {
          u.telefono.visible = true; dx.rotation.set(0.15, 0, 3.0);           // cornetta all'orecchio
          sx.rotation.set(0.5 + Math.sin(k * 3) * 0.4, 0, 0.3);               // gesticola
          testa.rotation.z = Math.sin(k * 2) * 0.1;
        } else if (pos && pos.azione === "ordini") {                        // gesticola mentre da' istruzioni
          sx.rotation.set(1.3 + Math.sin(k * 5) * 0.5, 0, 0.35);
          dx.rotation.set(1.6 + Math.cos(k * 4) * 0.6, 0, -0.35 + Math.sin(k * 3) * 0.2);
          testa.rotation.x = Math.sin(k * 6) * 0.08;
        } else if (pos && pos.azione === "bussa") {                         // bussa sul vetro
          dx.rotation.set(1.9 + Math.max(0, Math.sin(k * 14)) * 0.35, 0, 0.15);
        } else if (pos && pos.azione === "attende") {
          sx.rotation.set(0.3, 0, 0.5); dx.rotation.set(0.3, 0, -0.5);       // mani sui fianchi, aspetta
          testa.rotation.z = Math.sin(k * 2) * 0.12;
        } else if (pos && pos.azione === "caffe") {
          u.tazza.visible = true;
          const sorso = Math.sin((t - u.giro.inizio) * 1.4) > 0.3;
          dx.rotation.set(sorso ? 2.3 : 1.2, 0, -0.1);
          if (!sorso) { sx.rotation.set(0, 0, 2.6 + Math.sin(k * 2) * 0.2); }  // si stiracchia
        }
      } else if (s.stato === "lavora") { sx.rotation.x = 1.25 + Math.sin(k * 18) * 0.12; dx.rotation.x = 1.25 + Math.cos(k * 18) * 0.12; }
      else if (s.stato === "pensa") { testa.rotation.z = Math.sin(k * 1.2) * 0.15; dx.rotation.set(2.3, 0, 0.5); }
      else if (s.stato === "aspetta") { dx.rotation.set(-2.9, 0, 0.25 + Math.sin(k * 6) * 0.35); }
      else if (s.stato === "ferma?") { testa.rotation.y = Math.sin(k * 0.8) * 0.6; }
      else if (s.stato === "finito") {                                   // dorme sdraiato sulla scrivania, con il respiro
        // piegato in avanti dall'anca, sedia un po' indietro: testa sulle braccia incrociate, lontano dallo schermo
        const th = -0.9 - Math.sin(k * 1.3) * 0.02, yh = 0.55;
        a.position.z = u.casa[1] - 0.28;
        corpo.rotation.x = th; corpo.position.y = yh - yh * Math.cos(th); corpo.position.z = -yh * Math.sin(th);
        testa.rotation.set(0.35, 0, 0.5);
        sx.rotation.set(2.2, 0, -1.0); dx.rotation.set(2.2, 0, 1.0);     // braccia incrociate sotto la testa
        if (u.gonna) u.gonna.rotation.x = -th;                             // la gonna resta giu', non ruota col busto
      }
      else if (s.stato === "supervisore") { testa.rotation.y = Math.sin(k * 0.5) * 0.3; }
      if (u.etichettaPos) { u.etichettaPos.x = a.position.x; u.etichettaPos.z = a.position.z; }
      if (u.etichetta) { u.etichetta.pos.x = u.etichetta.base[0] + a.position.x; u.etichetta.pos.z = u.etichetta.base[1] + a.position.z; }
    }
    ordini = ordini.filter(o => t < o.fine + 1);
    postini = postini.filter(p => {
      const e = t - p.inizio, pos = lungo(p.punti, e, 1.6);
      if (pos.fine) { mondo.remove(p.g); const i = marcati.findIndex(q => q.pos === p.pos); if (i >= 0) { marcati[i].e.remove(); marcati.splice(i, 1); } return false; }
      const u = p.g.userData, o = Math.sin(e * 9);
      p.g.position.set(pos.x, 0, pos.z); p.pos.set(pos.x, 2.0, pos.z);
      if (pos.dir) p.g.rotation.y = Math.atan2(-pos.dir[0], -pos.dir[1]);
      else p.g.rotation.y = p.verso;                                       // consegna: guarda l'omino o la porta
      u.gambe[0].rotation.x = pos.fermo ? 0 : o * 0.5; u.gambe[1].rotation.x = pos.fermo ? 0 : -o * 0.5;
      u.sx.rotation.set(pos.fermo ? 0.1 : -o * 0.5, 0, 0.12);
      if (pos.azione === "consegna") { u.dx.rotation.set(1.5, 0, 0); if (!p.data) p.data = e; if (e - p.data > 0.8) p.busta.visible = false; }
      else u.dx.rotation.set(p.busta.visible ? 1.2 : o * 0.5, 0, -0.12);
      u.corpo.position.y = pos.fermo ? 0 : Math.abs(Math.cos(e * 9)) * 0.03;
      for (const oc of u.occhi) oc.scale.y = (e % 3) < 0.12 ? 0.25 : 1.5;
      u.sorriso.visible = true; u.bocca_o.visible = u.linea.visible = false;
      return true;
    });
    for (const tx of texCodice) tx.offset.y = (tx.offset.y - 0.004) % 1;     // il codice scorre
    for (const { mesh, s } of schermi) {
      const c = s.stato === "aspetta" && Math.floor(t * 2) % 2 ? "#ff5d5d" : (s.colore && s.stato === "supervisore" ? s.colore : COL[s.stato] || "#2a2e3a");
      const r = mesh.userData.retro;
      if (r) { r.color.set(c).convertSRGBToLinear(); r.emissive.copy(r.color); }     // il retro tiene la legenda dei colori
      const mat = mesh.material;
      const map = s.stato === "aspetta" ? texDomanda
        : ["lavora", "pensa", "supervisore"].includes(s.stato) ? texCodice[U.hash(s.id || "x") % 3] : null;
      if (mat.map !== map) { mat.map = map; mat.needsUpdate = true; }
      if (map) mat.color.copy(BIANCO);
      else mat.color.set(["finito", "spento", "inattiva", "vuota"].includes(s.stato) ? "#8f949c" : c).convertSRGBToLinear();
    }
    controlli.update();
    renderer.render(scena, camera);
    const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
    for (const { e, pos } of marcati) {                                  // etichette HTML sopra la scena
      v.copy(pos).project(camera);
      const fuori = v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1;
      e.style.display = fuori ? "none" : "";
      e.style.transform = `translate(${(v.x + 1) / 2 * w}px, ${(1 - v.y) / 2 * h}px) translate(-50%, -100%)`;
    }
  }
  requestAnimationFrame(anima);

  // clic: apre la chat del thread (come nella 2D)
  const ray = new T.Raycaster(), mouse = new T.Vector2();
  let giu = null;
  renderer.domElement.addEventListener("pointerdown", e => { giu = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener("pointerup", e => {
    if (!giu || Math.hypot(e.clientX - giu[0], e.clientY - giu[1]) > 5) return;   // era un trascinamento
    const r = renderer.domElement.getBoundingClientRect();
    mouse.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(mouse, camera);
    const colpi = ray.intersectObjects(mondo.children, true);
    for (const c of colpi) {
      let o = c.object;
      while (o) { const k = cliccabili.find(q => q.obj === o); if (k) return k.apri(); o = o.parent; }
    }
  });

  function misura() {
    const w = wrap.clientWidth || 1000, h = Math.max(420, Math.min(760, Math.round(w * 0.55)));
    renderer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", misura);

  window.Ufficio3D = {
    disegna(sessioni, extra) { misura(); costruisci(sessioni, extra || {}); },
    attiva(si) { attivo = si; if (si) misura(); },
    inquadra,
    camera, controlli,
    provaPostino(n) { const ids = [...bersagli.keys()].filter(k => !k.startsWith("capo:")); avviaPostino(ids[n || 0]); },
    get postini() { return postini.map(p => [p.id, p.g && p.g.position.x, p.g && p.g.position.z, !!(p.g && p.g.parent)]); },
    caffeSubito() { for (const a of animati) a.userData.prossimoT = 0; },   // per le prove
  };
})();

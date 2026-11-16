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
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));   // oltre 1.5 costa molto e si vede poco
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

  const cielo = new T.HemisphereLight(new T.Color("#ffffff").convertSRGBToLinear(), new T.Color("#d9c4a5").convertSRGBToLinear(), 0.55);
  scena.add(cielo);
  const sole = new T.DirectionalLight(new T.Color("#ffe9cc").convertSRGBToLinear(), 1.35);
  sole.position.set(-14, 26, 18);
  sole.castShadow = true;
  sole.shadow.mapSize.set(1024, 1024);
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
    const lp = palla(0.11, col, x + 0.06, 1.22, z, padre, 1, 0.7, 1, { emissive: "#fff2c0", emissiveIntensity: 0.2 });
    lp.material = lp.material.clone(); lampadine.push(lp);
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
    const postino = ruolo === "postino", operaio = ruolo === "operaio";
    const donna = !capo && !postino && !operaio && ((h >>> 12) & 1) === 1;
    const pelle = U.PELLE[h % U.PELLE.length], capelli = U.CAPELLI[(h >>> 4) % U.CAPELLI.length];
    const maglia = operaio ? "#f28c28" : postino ? "#3b6fc4" : capo ? "#b3203a" : resp ? COMPLETI[(h >>> 8) % COMPLETI.length] : PASTELLI[(h >>> 8) % PASTELLI.length];
    const pantaloni = operaio ? "#3d4a5c" : postino ? "#2a3f6b" : capo ? "#7a1426" : resp ? maglia : donna ? pelle : JEANS[(h >>> 9) % JEANS.length];
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
    } else if (operaio) {                                                // gilet con bande riflettenti
      for (const by of [0.66, 0.86]) { const b = new T.Mesh(new T.TorusGeometry(0.235, 0.022, 6, 24), m("#e8eef5", { emissive: "#ffffff", emissiveIntensity: 0.25 })); b.rotation.x = Math.PI / 2; b.position.y = by; b.scale.set(1, 0.78, 1); corpo.add(b); }
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
    if (operaio) {                                                       // casco giallo
      const c = new T.Mesh(new T.SphereGeometry(0.3, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), m("#f5c518", { roughness: 0.35 }));
      c.position.y = 0.06; testa.add(c);
      tondo(0.66, 0.025, 0.66, "#f5c518", 0, 0.06, 0, testa, 0.012);
    }
    if (postino) {                                                       // berretto con visiera
      const b = new T.Mesh(new T.CylinderGeometry(0.27, 0.29, 0.14, 20), m("#2a4f98")); b.position.y = 0.2; testa.add(b);
      tondo(0.3, 0.025, 0.16, "#1c2f5c", 0, 0.14, -0.27, testa, 0.01);
      palla(0.035, "#f2b443", 0, 0.22, -0.28, testa, 1, 1, 0.4, { metalness: 0.5 });
    }
    const ciuffo = postino || operaio ? -1 : h % 3;
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
    if (operaio) {                                                       // martello nella destra, scalpello nella sinistra
      tondo(0.08, 0.62, 0.08, "#b0703a", 0, -1.0, 0, dx, 0.03);                         // martellone: manico lungo
      tondo(0.22, 0.22, 0.5, "#3a3f4a", 0, -1.14, -0.08, dx, 0.05, { metalness: 0.7, roughness: 0.3 });   // testa enorme
      tondo(0.1, 0.18, 0.1, "#ffd23f", 0, -0.62, 0, sx, 0.03);                           // scalpello: impugnatura gialla
      tondo(0.06, 0.42, 0.06, "#c9d1dc", 0, -1.02, 0, sx, 0.02, { metalness: 0.7, roughness: 0.25 });
    }
    // cornetta da telefono classico, grande e rossa, con il filo a spirale (si vede bene anche da lontano)
    const giacca = palla(0.29, "#5b4a3f", 0, 0.8, 0, corpo, 1, 1.25, 0.9); giacca.visible = false;   // cappotto per uscire la sera
    const telefono = new T.Group(); dx.add(telefono); telefono.visible = false;
    tondo(0.09, 0.42, 0.09, "#e0303a", 0, -0.5, -0.1, telefono, 0.04);           // impugnatura
    palla(0.13, "#e0303a", 0, -0.48, -0.17, telefono, 1, 0.75, 0.6);               // auricolare, all'orecchio
    palla(0.13, "#e0303a", 0, -0.1, -0.17, telefono, 1, 0.75, 0.6);               // microfono, verso la bocca
    for (let i = 0; i < 7; i++) {                                                  // filo a spirale che pende
      const sp = new T.Mesh(new T.TorusGeometry(0.035, 0.009, 5, 12), m("#1f1f26"));
      sp.position.set(0, -0.02 + i * 0.05, -0.12); sp.rotation.x = Math.PI / 2; telefono.add(sp);
    }
    const tazza = tondo(0.1, 0.12, 0.1, "#ffffff", 0, -0.55, -0.06, dx, 0.04); tazza.visible = false;           // tazza del caffe'
    g.userData = { corpo, testa, sx, dx, s, fase: (h % 97) / 10, occhi, sorriso, bocca_o, linea, stato: null, salto: 0,
      sedute, gambe, telefono, tazza, gonna, giacca, casa: [x, z], giro: null, prossimo: 8 + (h % 40) };
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
  let postini = [], bersagli = new Map(), ingresso = [-2.5, 6], ultimiDati = null;
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
  // ---------- momenti divertenti ----------
  const momenti = new Map();                                             // id -> {tipo, inizio, fine}
  const compPrima = new Map(), schedePrima = new Map(), usciti = new Set();
  let effetti = [], lampadine = [], lampadari = [], chiacchiere = [], gruppoDi = new Map();
  let forzaSera = 0, forzaVenerdi = 0, passeggioSubito = false, corridoioPrimo = 7, xDestra = 0;
  const capoMondo = new T.Vector3(); let capoInGiro = false, tPrec = 0;
  const ora_ = () => new Date();
  const sera = () => t < forzaSera || ora_().getHours() >= 19 || ora_().getHours() < 6;
  const venerdi = () => t < forzaVenerdi || (ora_().getDay() === 5 && ora_().getHours() >= 14);
  function momento(id, tipo, durata) { const ini = performance.now() / 1000; momenti.set(id, { tipo, inizio: ini, fine: ini + durata }); }
  const MAT_COR = ["#ff5d8f", "#ffd43b", "#4dabf7", "#69db7c", "#b197fc", "#ff922b"].map(c => new T.MeshBasicMaterial({ color: lin(c), side: T.DoubleSide }));
  const geoCor = new T.PlaneGeometry(0.06, 0.04), geoFumo = new T.SphereGeometry(0.08, 8, 6), geoPallina = new T.IcosahedronGeometry(0.06, 0), geoPolvere = new T.IcosahedronGeometry(0.15, 1);
  function coriandoli(x, y, z) {
    for (let i = 0; i < 40; i++) {
      const c = new T.Mesh(geoCor, MAT_COR[i % MAT_COR.length]);
      c.position.set(x, y, z); mondo.add(c);
      const a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 1.5;
      effetti.push({ o: c, v: [Math.cos(a) * v * 0.5, 2.5 + Math.random() * 1.5, Math.sin(a) * v * 0.5], g: 5, gira: Math.random() * 10, vita: 2.6, nato: t });
    }
  }
  function fumo(x, y, z) {
    for (let i = 0; i < 10; i++) {
      const f = new T.Mesh(geoFumo, new T.MeshStandardMaterial({ color: lin("#6b6f78"), transparent: true, opacity: 0.7, roughness: 1 }));
      f.position.set(x + (Math.random() - 0.5) * 0.2, y, z); mondo.add(f);
      effetti.push({ o: f, v: [(Math.random() - 0.5) * 0.15, 0.5 + Math.random() * 0.3, 0], g: 0, cresce: 1.6, vita: 2.5, nato: t + i * 0.3, fumo: true });
    }
  }
  function polvere(x, y, z) {                                             // sbuffo di polvere a ogni martellata
    for (let i = 0; i < 7; i++) {
      const f = new T.Mesh(geoPolvere, new T.MeshStandardMaterial({ color: lin(i % 2 ? "#f6efe2" : "#d9c9a8"), transparent: true, opacity: 0.7, roughness: 1 }));
      const a = Math.random() * Math.PI * 2;
      f.position.set(x, y, z); f.scale.setScalar(0.8); mondo.add(f);
      effetti.push({ o: f, v: [Math.cos(a) * 0.45, 0.35 + Math.random() * 0.3, Math.sin(a) * 0.45], g: 0.25, cresce: 2.4, vita: 1.5, nato: t + i * 0.03, fumo: true });
    }
  }
  function pallina(da, a) {                                              // pallina di carta lanciata nel cestino
    const p = new T.Mesh(geoPallina, m("#f4f1ea"));
    p.position.copy(da); mondo.add(p);
    const dur = 1.1, dentro = Math.random() < 0.6;
    const arrivo = a.clone().add(new T.Vector3(dentro ? 0 : 0.35, 0, dentro ? 0 : 0.2));
    effetti.push({ o: p, arco: { da: da.clone(), a: arrivo, h: 1.2, dur }, vita: dur + (dentro ? 0 : 6), nato: t });
  }
  // cantiere: quando compare un thread nuovo (boss o dipendente) due operai montano scrivania o ufficio, poi arriva l'omino
  const DURATA_CANTIERE = 20;
  const cantieri = new Map();                                            // id -> inizio
  let lavori = [];
  function nascondi(pos, si) { const mk = marcati.find(q => q.pos === pos); if (mk) mk.e.style.visibility = si ? "hidden" : ""; }
  // proiettore: schizzo fisso della dashboard sul muro; cliccandolo si apre quella vera, aggiornata
  let texSchizzo = null;
  function schizzoDashboard() {                                          // disegno fisso, non cambia con i dati
    if (texSchizzo) return texSchizzo;
    const c = document.createElement("canvas"); c.width = 1024; c.height = 400;
    const x = c.getContext("2d");
    x.fillStyle = "#fbfaf6"; x.fillRect(0, 0, 1024, 400);
    x.fillStyle = "#2a3142"; x.font = "700 34px 'Segoe UI', system-ui, sans-serif"; x.fillText("📋 DASHBOARD", 28, 50);
    x.fillStyle = "#8a90a0"; x.font = "500 20px 'Segoe UI', system-ui, sans-serif"; x.fillText("clicca per aprirla", 300, 48);
    const colori = ["#3b82f6", "#a855f7", "#eab308", "#22c55e"], W = (1024 - 40 - 3 * 16) / 4;
    colori.forEach((col, i) => {
      const cx = 20 + i * (W + 16), cy = 80, H = 290;
      x.fillStyle = "#ffffff"; x.strokeStyle = "#c9ccd6"; x.lineWidth = 3;
      x.beginPath(); x.roundRect ? x.roundRect(cx, cy, W, H, 14) : x.rect(cx, cy, W, H); x.fill(); x.stroke();
      x.fillStyle = col; x.fillRect(cx, cy, W, 14);
      x.fillStyle = "#c4c8d2"; x.fillRect(cx + 16, cy + 36, W * 0.6, 16);          // titolo abbozzato
      x.fillStyle = col; x.fillRect(cx + 16, cy + 64, W * 0.4, 14);                  // etichetta di stato
      x.strokeStyle = "#dfe2e9"; x.lineWidth = 7;
      for (let r = 0; r < 6; r++) { x.beginPath(); x.moveTo(cx + 16, cy + 108 + r * 28); x.lineTo(cx + 16 + (W - 32) * (0.95 - (r % 3) * 0.2), cy + 108 + r * 28); x.stroke(); }
    });
    texSchizzo = new T.CanvasTexture(c); texSchizzo.encoding = T.sRGBEncoding; texSchizzo.anisotropy = 4;
    return texSchizzo;
  }
  // sala riunioni: colleghi seduti al tavolo che discutono, proiettore sul tavolo che proietta lo schizzo della dashboard;
  // cliccando lo schizzo (o il proiettore) si aprono le dashboard in alto nella pagina
  let riunione = [], fascio = null, raggi = null;
  function salaRiunioni(x, z) {
    const LW = 5.6, LD = 4.2, HV = 2.2;
    const g = new T.Group(); g.position.set(x, 0, z); mondo.add(g);
    tondo(LW, 0.03, LD, "#e7e2f3", 0, 0, 0, g, 0.01);                              // pavimento lilla chiaro
    const pv = new T.MeshStandardMaterial({ transparent: true, opacity: 0.16, color: lin("#bfe3fb"), roughness: 0.1 });
    for (const [w, d, px, pz] of [[0.05, LD, -LW / 2, 0], [0.05, LD, LW / 2, 0], [LW * 0.62, 0.05, -LW * 0.19, LD / 2]]) {
      const v = new T.Mesh(geo, pv); v.scale.set(w, HV, d); v.position.set(px, HV / 2, pz); g.add(v);
      tondo(w + 0.04, 0.07, d + 0.04, "#ffffff", px, HV, pz, g, 0.025);
    }
    tondo(LW, 2.4, 0.12, "#f3f1f8", 0, 0, -LD / 2, g, 0.04);                       // muro di fondo dove si proietta
    const tela = new T.Mesh(new T.PlaneGeometry(3.4, 3.4 * 400 / 1024), new T.MeshBasicMaterial({ map: schizzoDashboard(), toneMapped: false }));
    tela.position.set(0, 1.45, -LD / 2 + 0.07); g.add(tela);
    // tavolo ovale con il proiettore
    const tav = new T.Mesh(new T.CylinderGeometry(1, 1, 0.08, 32), m("#c08850", { roughness: 0.4 })); tav.scale.set(1.45, 1, 0.7);
    tav.position.set(0, 0.74, 0.35); tav.castShadow = tav.receiveShadow = true; g.add(tav);
    tondo(0.16, 0.7, 0.16, "#8a5a2b", 0, 0, 0.35, g, 0.05);
    const pr = tondo(0.42, 0.18, 0.36, "#e9edf2", 0, 0.78, 0.35, g, 0.05);
    palla(0.07, "#2b2b33", 0, 0.87, 0.17, g, 1, 1, 0.5, { emissive: "#bfe3ff", emissiveIntensity: 0.9 });
    // fascio del proiettore: piramide di luce dalla lente agli angoli dello schizzo, con i bordi dei raggi ben visibili
    const lente = [0, 0.87, 0.15], tw = 3.4 / 2, th = 3.4 * 400 / 1024 / 2, zt = -LD / 2 + 0.09;
    const ang = [[-tw, 1.45 - th], [tw, 1.45 - th], [tw, 1.45 + th], [-tw, 1.45 + th]].map(([ax, ay]) => [ax, ay, zt]);
    const v = [];
    for (const i of [0, 1, 3]) v.push(...lente, ...ang[i], ...ang[(i + 1) % 4]);        // senza la faccia di sopra, che coprirebbe lo schizzo
    const sfuma = n => { const c = []; for (let i = 0; i < n; i++) c.push(...(i % (n === 9 ? 3 : 2) ? [0.05, 0.045, 0.03] : [1, 0.95, 0.75])); return c; };
    const gf = new T.BufferGeometry(); gf.setAttribute("position", new T.Float32BufferAttribute(v, 3));
    gf.setAttribute("color", new T.Float32BufferAttribute(sfuma(9), 3));          // luce forte alla lente, sfuma verso il muro
    fascio = new T.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.35, depthWrite: false,
      side: T.DoubleSide, blending: T.AdditiveBlending, toneMapped: false });
    g.add(new T.Mesh(gf, fascio));
    const lv = []; for (const c of ang) lv.push(...lente, ...c);
    const gl = new T.BufferGeometry(); gl.setAttribute("position", new T.Float32BufferAttribute(lv, 3));
    gl.setAttribute("color", new T.Float32BufferAttribute(sfuma(8), 3));
    raggi = new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false });
    g.add(new T.LineSegments(gl, raggi));
    palla(0.11, "#fff8d8", ...lente, g, 1, 1, 0.4, { emissive: "#fff3b0", emissiveIntensity: 1.6 });   // lente accesa
    // quattro colleghi seduti intorno al tavolo
    riunione = [];
    [[-0.75, -0.45, Math.PI], [0.75, -0.45, Math.PI], [-0.75, 1.2, 0], [0.75, 1.2, 0]].forEach(([sx_, sz_, r], i) => {
      const sd = sedia(sx_, sz_ + (r ? -0.15 : 0.15), g, ["#a283e3", "#4fc1bd", "#f08a5d", "#5c9ee6"][i]);
      sd.rotation.y = r ? 0 : Math.PI;
      const o = omino({ id: "riunione" + i }, g, sx_, sz_, "resp");                 // tutti eleganti: giacca e cravatta (tailleur le donne)
      o.rotation.y = r; riunione.push(o);
    });
    const apri = () => window.apriDashboard && window.apriDashboard(!document.body.classList.contains("dash"));   // apre o richiude
    cliccabili.push({ obj: tela, apri }, { obj: pr, apri });
    marcati.push(etichetta("nome uff", "📽️ Sala riunioni · clicca lo schermo", new T.Vector3(x, HV + 0.55, z - LD / 2)));
  }
  function brindisi(chiave) {
    momento("capo:" + chiave, "brindisi", 7);
    for (const [id, g] of gruppoDi) if (g === chiave) momento(id, "brindisi", 7);
    if (chiave !== "r:capo") momento("capo:r:capo", "applauso", 7);
  }
  function apriCantiere(id, parti, om, x, z, ufficio) {
    const inizio = cantieri.get(id);
    if (inizio == null) return;
    const fine = inizio + DURATA_CANTIERE;
    const operai = (ufficio ? [[x - 1.0, z, 0], [x + 1.0, z, 0]] : [[x - 1.25, z, -Math.PI / 2], [x + 1.25, z, Math.PI / 2]]).map(([ox, oz, r], i) => {
      const o = omino({ id: "operaio" + id + i }, mondo, ox, oz, "operaio");
      o.rotation.y = r;
      for (const l of o.userData.sedute) l.visible = false;
      for (const l of o.userData.gambe) l.visible = true;
      return o;
    });
    const pos = new T.Vector3(x, 2.3, z);
    const et = etichetta("f3d", "🔨 Lavori in corso", pos);
    marcati.push(et);
    lavori.push({ id, parti, om, operai, inizio, fine, et, x, z });
  }
  // thread chiuso: l'omino prende lo scatolone, saluta ed esce, poi due operai smontano la scrivania
  const DURATA_CHIUSURA = 24, chiusi = new Map(), chiusiFatti = new Set(), ultimeSessioni = new Map();
  function chiudi(id, c) {
    chiusi.set(id, { ...c, inizio: performance.now() / 1000 }); chiusiFatti.add(id);
    setTimeout(() => { chiusi.delete(id); usciti.delete(id); if (ultimiDati) costruisci(...ultimiDati); }, DURATA_CHIUSURA * 1000);
  }
  function apriSmontaggio(id, parti, x, z, inizio) {
    const operai = [[x - 1.25, z, -Math.PI / 2], [x + 1.25, z, Math.PI / 2]].map(([ox, oz, r], i) => {
      const o = omino({ id: "operaio" + id + i }, mondo, ox, oz, "operaio");
      o.rotation.y = r; o.visible = false;
      for (const l of o.userData.sedute) l.visible = false;
      for (const l of o.userData.gambe) l.visible = true;
      return o;
    });
    const pos = new T.Vector3(x, 2.3, z), et = etichetta("f3d", "🔧 Smontaggio", pos);
    et.e.style.visibility = "hidden"; marcati.push(et);
    lavori.push({ id, parti, om: null, operai, inizio, fine: inizio + 11, et, x, z, smonta: true });
  }
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
    bersagli = new Map(); uffici = new Map(); lavori = []; lampadine = []; lampadari = []; chiacchiere = []; gruppoDi = new Map();
    for (const e of effetti) e.o.parent && e.o.parent.remove(e.o); effetti = [];
    const gruppi = U.prepara(sessioni, extra);
    for (const [id, c] of chiusi) {                                       // i thread appena chiusi restano finche' non e' finito il trasloco
      const gr = gruppi.find(g => g.chiave === c.chiave); if (!gr) continue;
      const i = gr.sessioni.findIndex(q => q.id === id);
      if (i >= 0) gr.sessioni[i] = { ...gr.sessioni[i], chiude: c.inizio };
      else gr.sessioni.splice(Math.min(c.idx, gr.sessioni.length), 0, { ...c.s, chiude: c.inizio });
    }
    const capi = gruppi.filter(U.haUfficio);
    const UFF = 3.6, PASSO = 2.6;
    // 1) uffici a vetri in fila in fondo; quello del capo e' piu' grande, con tappeto persiano e finiture d'oro
    const dim = gr => gr.chiave === "r:capo" ? [5.6, 4.6] : [UFF, UFF];
    const pulito = s => (s || "").replace(/^\S*[^\w\s]\S*\s+/u, "").replace(/\s*\(.*\)$/, "");   // toglie l'emoji iniziale
    let xc = 0, profMax = UFF;
    const porte = {};
    const schedePrimaOra = new Map();
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
      schedePrimaOra.set(gr.chiave, gr.scheda && gr.scheda.stato);
      apriCantiere("capo:" + gr.chiave, [g], capoOm, x, z + LD / 2 + 0.6, true);
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
    salaRiunioni(-0.6 - 2.8, 0);                                         // a sinistra dell'ufficio del capo
    const rigaMax = Math.max(4, Math.floor(largUffici / PASSO));
    const file = [[]];
    let usate = 0;
    for (const q of isole) {
      if (usate && usate + q.fuori.length > rigaMax) { file.push([]); usate = 0; }
      file[file.length - 1].push(q); usate += q.fuori.length;
    }
    let z0 = profMax / 2 + 6.4;
    corridoioPrimo = z0 - 1.75; xDestra = 0;
    for (const fila of file) {
      if (!fila.length) continue;
      const w = fila.reduce((n, q) => n + q.fuori.length * PASSO, 0) + (fila.length - 1) * 0.8;
      let x0 = mezzo - w / 2;
      for (const { gr, fuori } of fila) {
        const wi = fuori.length * PASSO;
        const tappeto = tondo(wi, 0.03, 3.4, gr.colore, x0 + wi / 2, 0, z0 + 0.2, mondo, 0.012, { transparent: true, opacity: 0.4 });
        for (let li = 0; li < fuori.length; li++) {                      // lampade a stelo dietro le sedie: si accendono la sera
          const lx = x0 + PASSO * (li + 1) - 0.12, lz = z0 - 1.25;
          tondo(0.04, 1.7, 0.04, "#3c4658", lx, 0, lz, mondo, 0.015);
          palla(0.14, "#3c4658", lx, 0.02, lz, mondo, 1, 0.15, 1);
          const pa = palla(0.17, "#fff3d6", lx, 1.82, lz, mondo, 1, 0.8, 1, { emissive: "#ffd98a", emissiveIntensity: 0.05 });
          pa.material = pa.material.clone(); lampadari.push(pa);
        }
        tappeto.castShadow = false;
        marcati.push(etichetta("nome", U.nomeIsola(gr), new T.Vector3(x0 + wi / 2, 0.05, z0 + 2.35)));
        fuori.forEach((s, i) => {
          const x = x0 + PASSO / 2 + i * PASSO;
          xDestra = Math.max(xDestra, x);
          const scr = scrivania(x, z0, mondo, s, "", pulito(U.targa(s)).replace(/\s*❌\d*$/, ""));
          const sd = sedia(x, z0 - 0.95, mondo);
          const presente = U.PRESENTI.includes(s.stato) || s.chiude != null;
          if (s.chiude == null) ultimeSessioni.set(s.id, { s, chiave: gr.chiave, idx: gr.sessioni.indexOf(s) });
          const om = presente ? omino(s, mondo, x, z0 - 0.8, "dip") : null;
          apriCantiere(s.id, [scr, sd], om, x, z0 - 0.3, false);
          if (s.chiude != null) apriSmontaggio(s.id, [scr, sd], x, z0 - 0.3, s.chiude + 10);
          if (om) {
            animati.push(om); camminatori.push(om); om.userData.corridoio = z0 - 1.75;
            om.userData.porta = porte[gr.chiave] || porte["r:capo"] || null;   // i thread senza responsabile vanno dal capo
            gruppoDi.set(s.id, gr.chiave); om.userData.via = profMax / 2 + 2.2;
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
      const cest = new T.Mesh(new T.CylinderGeometry(0.2, 0.16, 0.42, 14, 1, true), m("#8a9099", { side: T.DoubleSide }));
      cest.position.set(cx + 1.0, 0.21, cz + 0.2); mondo.add(cest);                  // cestino della carta
      const chi = { pos: new T.Vector3(cx - 0.2, 2.1, cz + 0.65) };
      chi.et = etichetta("f3d", "💬 bla bla bla…", chi.pos); chi.et.e.style.visibility = "hidden"; marcati.push(chi.et);
      chiacchiere.push(chi);
      for (const om of camminatori.splice(0)) {
        const lato = U.hash(om.userData.s.id) % 2;                       // due posti alla macchinetta: possono chiacchierare
        om.userData.caffe = [cx - 0.5 + lato * 0.6, cz + 0.65]; om.userData.lato = lato; om.userData.chiacchiera = chi;
        om.userData.cestino = new T.Vector3(cx + 1.0, 0.45, cz + 0.2);
      }
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
    let nuovi = false;
    for (const [id, st] of ora) {
      if (!id || primaVoltaDati || postini.some(p => p.id === id)) continue;
      const prima = statiPrima.get(id), attivo = ["lavora", "pensa", "supervisore"].includes(st);
      // risposta di Stefano (aspetta -> lavora), nuovo compito (finito/fermo -> lavora) o thread nuovo che parte
      if (prima === undefined) { cantieri.set(id, performance.now() / 1000); nuovi = true; continue; }
      if (attivo && (prima === "aspetta" || prima === "finito" || prima === "ferma?")) avviaPostino(id);
    }
    if (!primaVoltaDati) for (const id of statiPrima.keys())               // thread sparito dai dati: animazione di chiusura
      if (!ora.has(id) && ultimeSessioni.has(id) && !chiusiFatti.has(id)) { chiudi(id, ultimeSessioni.get(id)); nuovi = true; }
    for (const id of ora.keys()) if (!chiusi.has(id)) chiusiFatti.delete(id);
    statiPrima.clear(); for (const [id, st] of ora) statiPrima.set(id, st);
    for (const { s } of schermi) {                                        // esito della compilazione cambiato: festa o disperazione
      if (!s.id || !s.compilazione) continue;
      const firma = JSON.stringify(s.compilazione), prima = compPrima.get(s.id);
      compPrima.set(s.id, firma);
      const er = s.compilazione.errori;
      if (prima === undefined || prima === firma || primaVoltaDati || er == null) continue;
      momento(s.id, er === 0 ? "festa" : "disperazione", 4.5);
    }
    for (const [chiave, st] of schedePrimaOra) {                         // commessa passata a "fatto": brindisi e applauso del capo
      const prima = schedePrima.get(chiave);
      schedePrima.set(chiave, st);
      if (primaVoltaDati || prima === undefined || prima === st || st !== "fatto") continue;
      brindisi(chiave);
    }
    if (nuovi && ultimiDati) { const d = ultimiDati; setTimeout(() => costruisci(d[0], d[1]), 0); }   // ricostruisce con il cantiere aperto
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
  let t = 0, ultimo = 0, attivo = false, fps = 40, costo = 8;
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
  function giroUscita(u) {                                           // la sera: cappotto, saluta e va all'ingresso
    const [x, z] = u.casa, c = u.corridoio, [ix, iz] = ingresso;
    return [[x, z, 1.8, "saluta"], [x, c, 0], [x, u.via, 0], [ix, iz, 0]];
  }
  function giroPasseggio(u) {                                        // il capo fa il giro dell'open space, mani dietro la schiena
    const uf = uffici.get(u.chiave); if (!uf) return null;
    const { gx, gz, LW, LD, casa } = uf, porta = LW * 0.32, fuori = LD / 2 + 0.7;
    const c = corridoioPrimo - gz, xa = Math.max(porta, 0) , xb = xDestra + 1.2 - gx;
    return [[casa[0], casa[1], 0.7], [porta, casa[1], 0], [porta, fuori, 0], [xa, c, 0], [xb, c, 1.5, "guarda"],
            [xa, c, 0], [porta, fuori, 0], [porta, casa[1], 0], [casa[0], casa[1], 0.4, "siede"]];
  }
  function giroCaffe(u) {                                            // dalla sedia al caffe' e ritorno, passando dietro le sedie
    const [x, z] = u.casa, c = u.corridoio, [mx, mz] = u.caffe;
    return [[x, z, 0.7], [x, c, 0], [mx - 0.7, c, 0], [mx - 0.7, mz, 0], [mx, mz, 4.5, "caffe"], [mx - 0.7, mz, 0],
            [mx - 0.7, c, 0], [x, c, 0], [x, z, 0.4, "siede"]];
  }
  function anima(ms) {
    requestAnimationFrame(anima);
    // fluido ma leggero: punta a 40 fotogrammi al secondo; se il PC fatica scende da solo a 30 o 24
    if (!attivo || document.hidden || ms - ultimo < 1000 / fps - 2) return;
    ultimo = ms; t = ms / 1000;
    const inizioFrame = performance.now();
    const dt = Math.min(0.1, t - tPrec || 0.04); tPrec = t;
    const eSera = sera(), eVen = venerdi();
    cielo.intensity = eSera ? 0.3 : 0.55; sole.intensity = eSera ? 0.5 : 1.35;
    scena.background.set(eSera ? "#4f5f86" : "#cfe6f5").convertSRGBToLinear();
    for (const l of lampadine) l.material.emissiveIntensity = eSera ? 1.8 : 0.2;
    for (const l of lampadari) l.material.emissiveIntensity = eSera ? 2.2 : 0.05;
    for (const c of chiacchiere) c.alCaffe = [];
    let capoVisto = false;
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
      u.telefono.visible = u.tazza.visible = false; u.giacca.visible = false;
      // passeggiata al caffe' per chi lavora (ogni minuto circa); la finisce anche se nel frattempo cambia stato
      // chi aspetta una risposta va a bussare dal suo responsabile (circa ogni minuto)
      if (s.chiude != null) {                                             // chiuso: esce con lo scatolone e non torna
        if (usciti.has(s.id)) { a.visible = false; if (u.etichettaPos) nascondi(u.etichettaPos, true); continue; }
        if (!(u.giro && u.giro.trasloco) && t > s.chiude + 0.8) u.giro = { punti: giroUscita(u), inizio: t, uscita: true, trasloco: true };
      }
      const vaCaffe = u.caffe && s.stato === "lavora" && s.chiude == null, vaBussare = u.porta && s.stato === "aspetta";
      if (!u.giro && (vaCaffe || vaBussare)) {
        if (u.prossimoT == null) u.prossimoT = t + u.prossimo;
        if (t > u.prossimoT) u.giro = { punti: vaCaffe ? giroCaffe(u) : giroBussa(u), inizio: t };
      }
      if (u.chiave && !u.giro) {
        const o = ordini.find(o => o.chiave === u.chiave && t >= o.inizio && t < o.fine);
        if (o) u.giro = { punti: o.punti, inizio: o.inizio };
      }
      // la sera chi ha finito si mette il cappotto, saluta ed esce; il giorno dopo (o se riparte) torna
      if (u.caffe && s.stato === "finito" && eSera) {
        if (usciti.has(s.id)) { a.visible = false; if (u.etichettaPos) nascondi(u.etichettaPos, true); continue; }
        if (!u.giro) { if (u.uscitaT == null) u.uscitaT = t + 2 + (U.hash(s.id) % 25); if (t > u.uscitaT) u.giro = { punti: giroUscita(u), inizio: t, uscita: true }; }
      } else if (usciti.has(s.id)) { usciti.delete(s.id); a.visible = true; if (u.etichettaPos) nascondi(u.etichettaPos, false); }
      // il capo, se nessuno lo chiama, ogni tanto fa un giro dell'open space
      if (u.chiave === "r:capo" && !u.giro && !u.telefonata && s.stato === "supervisore") {
        if (u.passeggioT == null) u.passeggioT = t + 40;
        if (passeggioSubito || t > u.passeggioT) {
          const punti = giroPasseggio(u);
          if (punti) u.giro = { punti, inizio: t, passeggio: true };
          u.passeggioT = t + 150; passeggioSubito = false;
        }
      }
      let pos = null;
      if (u.giro) {
        pos = lungo(u.giro.punti, t - u.giro.inizio, 1.1);
        if (pos.fine) {
          if (u.giro.uscita) { usciti.add(s.id); a.visible = false; if (u.etichettaPos) nascondi(u.etichettaPos, true); u.giro = null; continue; }
          u.giro = null; u.prossimoT = t + 50 + (U.hash(s.id + t) % 40); pos = null;
        }
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
        else if (pos.azione === "guarda") a.rotation.y = Math.PI + Math.sin(k * 0.8) * 0.9;  // il capo controlla l'open space
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
        if (u.giro && u.giro.passeggio) { sx.rotation.set(-0.75, 0, 0.35); dx.rotation.set(-0.75, 0, -0.35); }   // mani dietro la schiena
        if (u.giro && u.giro.trasloco) {                                 // scatolone tra le braccia
          if (!u.scatola) { u.scatola = new T.Group(); corpo.add(u.scatola);
            tondo(0.56, 0.4, 0.4, "#c8955a", 0, 0.62, -0.38, u.scatola, 0.03);
            tondo(0.57, 0.05, 0.1, "#e9d8a6", 0, 1.0, -0.38, u.scatola, 0.01);
            palla(0.08, "#7cc98a", 0.12, 1.06, -0.38, u.scatola); }
          u.scatola.visible = true;
          if (!(pos && pos.azione === "saluta")) { sx.rotation.set(1.25, 0, 0.25); dx.rotation.set(1.25, 0, -0.25); }
        } else if (u.scatola) u.scatola.visible = false;
        if (u.giro && u.giro.uscita && !u.giro.trasloco) {
          u.giacca.visible = true;
        }
        if (u.giro && u.giro.uscita && pos && pos.azione === "saluta") dx.rotation.set(0, 0, 2.5 + Math.sin(k * 9) * 0.35);   // ciao ciao
        if (pos && pos.azione === "caffe" && u.chiacchiera) u.chiacchiera.alCaffe.push(a);
        if (u.nuvolaOrdini && !(pos && pos.azione === "ordini")) u.nuvolaOrdini.e.style.visibility = "hidden";
        if (pos && pos.azione === "telefono") {
          u.telefono.visible = true; dx.rotation.set(0.15, 0, 3.0);           // cornetta all'orecchio
          sx.rotation.set(0.5 + Math.sin(k * 3) * 0.4, 0, 0.3);               // gesticola
          testa.rotation.z = Math.sin(k * 2) * 0.1;
        } else if (pos && pos.azione === "ordini") {                        // gesticola animatamente mentre da' istruzioni
          sx.rotation.set(1.4 + Math.sin(k * 9) * 1.1, 0, 0.5 + Math.sin(k * 5) * 0.35);
          dx.rotation.set(1.6 + Math.cos(k * 8) * 1.2, 0, -0.5 + Math.cos(k * 6) * 0.35);
          testa.rotation.x = Math.sin(k * 7) * 0.12; testa.rotation.z = Math.sin(k * 3) * 0.1;
          u.corpo.position.y = Math.abs(Math.sin(k * 4.5)) * 0.04;
          if (!u.nuvolaOrdini) { u.nuvolaOrdini = etichetta("f3d", "", new T.Vector3()); marcati.push(u.nuvolaOrdini); }
          const nv = u.nuvolaOrdini, giro = Math.floor(t / 0.7);
          if (nv.giro !== giro) {                                           // simboli a caso, cambiano mentre parla
            nv.giro = giro; const S = ["⚙️", "📐", "🔧", "⚡", "📊", "💡", "🔩", "📋", "🧮", "✏️", "#", "@", "%", "&"];
            nv.e.textContent = [0, 1, 2].map(j => S[(U.hash(s.id + giro + j) >>> 3) % S.length]).join(" ") + " ❗";
          }
          a.getWorldPosition(nv.pos); nv.pos.y = 2.45; nv.e.style.visibility = "";
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
      const pw = (dx_, dy_, dz_) => new T.Vector3(a.position.x + (a.parent !== mondo ? a.parent.position.x : 0) + dx_, dy_,
                                                  a.position.z + (a.parent !== mondo ? a.parent.position.z : 0) + dz_);
      if (u.chiave === "r:capo" && u.giro && u.giro.passeggio) { capoMondo.copy(pw(0, 0, 0)); capoVisto = true; }
      const mo = momenti.get(s.id);
      if (mo && t >= mo.fine) momenti.delete(s.id);
      else if (mo && !pos && t >= mo.inizio) {
        const fr = t - mo.inizio, avanti = a.parent === mondo ? 1 : 1;
        if (mo.tipo === "festa") {                                       // compilazione a 0 errori: esulta
          if (!mo.fatto) { mo.fatto = true; coriandoli(pw(0, 2.0, 0).x, 2.0, pw(0, 0, 0).z); }
          sx.rotation.set(0, 0, -2.6 + Math.sin(k * 10) * 0.3); dx.rotation.set(0, 0, 2.6 - Math.sin(k * 10) * 0.3);
          corpo.position.y += Math.abs(Math.sin(k * 7)) * 0.1; u.sorriso.visible = true; u.bocca_o.visible = u.linea.visible = false;
        } else if (mo.tipo === "disperazione") {                         // compilazione con errori: mani nei capelli, fumo dallo schermo
          if (!mo.fatto) { mo.fatto = true; fumo(pw(0, 0, 0).x, 1.45, pw(0, 0, 0).z + 1.0 * avanti); }
          sx.rotation.set(0.9, 0, -2.2); dx.rotation.set(0.9, 0, 2.2);
          testa.rotation.set(0, Math.sin(k * 9) * 0.35, 0); u.bocca_o.visible = true; u.sorriso.visible = u.linea.visible = false;
        } else if (mo.tipo === "brindisi" || mo.tipo === "applauso") {   // commessa finita: in piedi a brindare, il capo applaude
          for (const l of u.sedute) l.visible = false;
          for (const l of u.gambe) l.visible = true;
          corpo.rotation.set(0, 0, 0); corpo.position.set(0, Math.abs(Math.sin(k * 4)) * 0.03, 0);
          if (mo.tipo === "brindisi") { u.tazza.visible = true; dx.rotation.set(2.7 + Math.sin(fr * 5) * 0.15, 0, -0.25); sx.rotation.set(0.2, 0, 0.3); }
          else { const b = Math.abs(Math.sin(k * 9)); sx.rotation.set(1.4, 0, 0.15 + b * 0.45); dx.rotation.set(1.4, 0, -0.15 - b * 0.45); }
          u.sorriso.visible = true; u.bocca_o.visible = u.linea.visible = false;
          for (const o of u.occhi) o.scale.y = 1.5;
        }
      } else if (!pos && eVen && u.cestino && s.stato === "lavora") {  // venerdi' pomeriggio: palline di carta nel cestino
        if (u.lancioT == null) u.lancioT = t + 4 + (U.hash(s.id) % 20);
        if (t > u.lancioT) { u.lancio = t; u.lancioT = t + 22 + Math.random() * 20; pallina(pw(0.25, 1.35, 0), u.cestino); }
        if (u.lancio && t - u.lancio < 0.6) dx.rotation.set(2.8 - (t - u.lancio) * 3, 0, -0.2);
      }
      if (!pos && u.caffe && capoInGiro && !mo) {                        // passa il capo: ci si raddrizza e lo si guarda
        const d = Math.hypot(capoMondo.x - a.position.x, capoMondo.z - a.position.z);
        if (d < 2.6 && s.stato !== "finito") {
          corpo.position.y += 0.05; sx.rotation.set(1.0, 0, 0); dx.rotation.set(1.0, 0, 0);
          testa.rotation.y = Math.max(-0.9, Math.min(0.9, (capoMondo.x - a.position.x) * 0.6));
        }
      }
      {                                                                  // si gira con dolcezza invece che di scatto
        const meta = a.rotation.y;
        if (u.rot == null) u.rot = meta;
        let d = ((meta - u.rot + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        u.rot += d * Math.min(1, dt * 9); a.rotation.y = u.rot;
      }
      if (u.etichettaPos) { u.etichettaPos.x = a.position.x; u.etichettaPos.z = a.position.z; }
      if (u.etichetta) { u.etichetta.pos.x = u.etichetta.base[0] + a.position.x; u.etichetta.pos.z = u.etichetta.base[1] + a.position.z; }
    }
    capoInGiro = capoVisto;
    const parla = Math.floor(t / 3.2) % 4;
    if (fascio) { const f = 0.9 + Math.sin(t * 7) * 0.05 + Math.sin(t * 13.3) * 0.05; fascio.opacity = 0.35 * f; raggi.opacity = 0.9 * f; }
    riunione.forEach((o, i) => {
      const u = o.userData, k = t + u.fase;
      for (const oc of u.occhi) oc.scale.y = (k % 4) < 0.12 ? 0.25 : 1.5;
      u.sorriso.visible = true; u.bocca_o.visible = u.linea.visible = false;
      if (i === parla) {                                                  // chi parla gesticola
        u.sx.rotation.set(1.3 + Math.sin(k * 5) * 0.4, 0, 0.3); u.dx.rotation.set(1.5 + Math.cos(k * 4) * 0.5, 0, -0.3);
        u.testa.rotation.set(Math.sin(k * 6) * 0.06, 0, 0); u.bocca_o.visible = Math.sin(k * 12) > 0; u.sorriso.visible = !u.bocca_o.visible;
      } else {                                                            // gli altri lo guardano e annuiscono
        const s = riunione[parla], dx_ = s.position.x - o.position.x, dz_ = s.position.z - o.position.z;
        const verso = Math.atan2(-dx_, -dz_) - o.rotation.y;
        u.testa.rotation.set(Math.sin(k * 2) * 0.05, Math.atan2(Math.sin(verso), Math.cos(verso)) * 0.6, 0);
        u.sx.rotation.set(1.2, 0, 0); u.dx.rotation.set(1.2, 0, 0);
      }
    });
    for (const c of chiacchiere) {                                        // due al caffe' insieme: si girano e chiacchierano
      const lati = new Set(c.alCaffe.map(a => a.userData.lato));
      const si = c.alCaffe.length >= 2 && lati.size === 2;
      c.et.e.style.visibility = si ? "" : "hidden";
      if (si) for (const a of c.alCaffe) {
        a.rotation.y = a.userData.lato === 0 ? -Math.PI / 2 : Math.PI / 2;
        a.userData.testa.rotation.z = Math.sin(t * 6 + a.userData.lato * 2) * 0.12;
      }
    }
    effetti = effetti.filter(e => {                                      // coriandoli, fumo, palline di carta
      const eta = t - e.nato;
      e.o.visible = eta >= 0;
      if (eta < 0) return true;
      if (eta > e.vita) { mondo.remove(e.o); if (e.fumo) e.o.material.dispose(); return false; }
      if (e.arco) {
        const f = Math.min(1, eta / e.arco.dur);
        e.o.position.lerpVectors(e.arco.da, e.arco.a, f); e.o.position.y += e.arco.h * 4 * f * (1 - f);
        if (f >= 1) e.o.position.y = Math.max(0.05, e.o.position.y);
        return true;
      }
      e.o.position.x += e.v[0] * dt; e.o.position.y += e.v[1] * dt; e.o.position.z += e.v[2] * dt;
      e.v[1] -= e.g * dt;
      if (e.fumo) { const sc = 1 + eta * e.cresce; e.o.scale.set(sc, sc, sc); e.o.material.opacity = 0.7 * (1 - eta / e.vita); }
      else { e.o.rotation.x += e.gira * dt; e.o.rotation.y += e.gira * 0.7 * dt; if (e.o.position.y < 0.02) { e.o.position.y = 0.02; e.v = [0, 0, 0]; e.g = 0; } }
      return true;
    });
    ordini = ordini.filter(o => t < o.fine + 1);
    lavori = lavori.filter(l => {
      const p = Math.min(1, Math.max(0, (t - l.inizio) / (l.fine - l.inizio)));
      const sy = l.smonta ? Math.max(0.03, 1 - Math.floor(p * 1.15 * 6) / 6)    // smontaggio: cala a scatti
        : Math.max(0.03, Math.min(1, Math.floor(p * 1.15 * 6) / 6));      // cresce a scatti, un pezzo alla volta
      if (l.smonta) { const via = t >= l.inizio; for (const o of l.operai) o.visible = via; l.et.e.style.visibility = via ? "" : "hidden"; }
      for (const q of l.parti) q.scale.set(1, sy, 1);
      if (l.om) {
        l.om.visible = p >= 1;
        const ep = l.om.userData.etichettaPos || (l.om.userData.etichetta && l.om.userData.etichetta.pos);
        const mk = ep && marcati.find(q => q.pos === ep);
        if (mk) mk.e.style.visibility = p >= 1 ? "" : "hidden";           // il pensiero compare quando arriva l'omino
      }
      for (const [i, o] of l.operai.entries()) {
        const giro = t * 1.4 + i * 0.45, c = giro % 1;                      // martellate esagerate: su piano, giu' di colpo
        if (Math.floor(giro) !== o.userData.colpi && p < 1 && t >= l.inizio) {               // appena ha colpito: nuvoletta di polvere
          if (o.userData.colpi != null) polvere(o.position.x + (l.x - o.position.x) * 0.4, 0.85, o.position.z + (l.z - o.position.z) * 0.45 + 0.3);
          o.userData.colpi = Math.floor(giro);
        }
        const su = c < 0.65 ? 1 - Math.pow(1 - c / 0.65, 2) : 1 - Math.pow((c - 0.65) / 0.35, 3);
        const u = o.userData, colpo = c < 0.1 ? 1 - c / 0.1 : 0;          // appena dopo il colpo: contraccolpo
        u.dx.rotation.set(0.5 + su * 2.7, 0, -0.15);                        // dal davanti fin sopra la testa
        u.sx.rotation.set(0.9 + colpo * 0.25, 0, 0.35);                     // scalpello puntato in avanti
        u.corpo.position.y = su * 0.06 - colpo * 0.05;
        u.corpo.rotation.x = 0.12 - su * 0.18;                              // si inarca caricando, si piega colpendo
        u.testa.rotation.x = colpo * 0.25;
      }
      if (p >= 1) {
        for (const o of l.operai) mondo.remove(o);
        l.et.e.remove(); cantieri.delete(l.id);
        return false;
      }
      return true;
    });
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
    costo = costo * 0.95 + (performance.now() - inizioFrame) * 0.05;     // media del tempo di disegno
    fps = costo > 16 ? 24 : costo > 11 ? 30 : 40;
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
    disegna(sessioni, extra) { misura(); ultimiDati = [sessioni, extra || {}]; costruisci(sessioni, extra || {}); },
    attiva(si) { attivo = si; if (si) misura(); },
    inquadra,
    camera, controlli,
    provaDivertenti() {
      const dip = animati.filter(a => a.userData.caffe), lav = dip.filter(a => a.userData.s.stato === "lavora");
      if (dip[0]) momento(dip[0].userData.s.id, "festa", 4.5);
      if (dip[1]) momento(dip[1].userData.s.id, "disperazione", 4.5);
      const uf = [...uffici.keys()].find(k => k !== "r:capo"); if (uf) setTimeout(() => brindisi(uf), 5000);
      forzaVenerdi = t + 90; passeggioSubito = true;
      setTimeout(() => { forzaSera = t + 60; }, 12000);
      for (const a of lav) a.userData.prossimoT = 0;
    },
    provaChiusura(n) { const ids = [...ultimeSessioni.keys()].filter(id => bersagli.has(id) && !chiusi.has(id)); const id = ids[ids.length - 1 - (n || 0)]; if (!id) return; chiudi(id, ultimeSessioni.get(id)); if (ultimiDati) costruisci(...ultimiDati); },
    provaCantiere(n) { const ids = [...bersagli.keys()].filter(k => !k.startsWith("capo:")); cantieri.set(ids[n || 0], performance.now() / 1000); const uf = [...bersagli.keys()].filter(k => k.startsWith("capo:") && k !== "capo:r:capo"); if (uf.length) cantieri.set(uf[uf.length - 1], performance.now() / 1000); if (ultimiDati) costruisci(...ultimiDati); },
    provaPostino(n) { const ids = [...bersagli.keys()].filter(k => !k.startsWith("capo:")); avviaPostino(ids[n || 0]); },
    get effetti() { return effetti.length; }, get postini() { return postini.map(p => [p.id, p.g && p.g.position.x, p.g && p.g.position.z, !!(p.g && p.g.parent)]); },
    caffeSubito() { for (const a of animati) a.userData.prossimoT = 0; },   // per le prove
  };
})();

// Ufficio virtuale - la stessa stanza in 3D (Three.js r128, incluso nella cartella lib/).
// Stessi dati e stessi gruppi della versione 2D (Ufficio.prepara): cambia solo la scena.
// Stile morbido: forme arrotondate, colori pastello, luce calda. Omini ORIGINALI (non copie
// di personaggi esistenti), tutto generato dal codice: niente modelli esterni.
(function () {
  const U = window.Ufficio;
  const wrap = document.getElementById("ufficio3d");
  if (!wrap || !window.THREE || !U) return;
  const T = THREE;
  const LUCE = T.NUOVO ? Math.PI : 1;   // r170: luci in unità fisiche

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
  renderer.domElement.addEventListener("dblclick", () => inquadra());
  controlli.enableDamping = true;
  controlli.maxPolarAngle = Math.PI * 0.44;          // mai sotto il pavimento
  controlli.minDistance = 6; controlli.maxDistance = 80;

  const cielo = new T.HemisphereLight(new T.Color("#ffffff").convertSRGBToLinear(), new T.Color("#d9c4a5").convertSRGBToLinear(), 0.55 * LUCE);
  scena.add(cielo);
  const sole = new T.DirectionalLight(new T.Color("#ffe9cc").convertSRGBToLinear(), 1.35 * LUCE);
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
  // parquet a spina di pesce in rovere: una sola texture ripetuta su tutto il pavimento
  let parquetTex = null;
  function texParquet() {
    if (parquetTex) return parquetTex;
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const x = c.getContext("2d"), L = 64, Wd = 16, toni = ["#dcc29c", "#e3cba6", "#d6bb93", "#e0c7a0", "#d9be97"];
    x.fillStyle = "#c8ab82"; x.fillRect(0, 0, 256, 256);
    let n = 0;
    for (let row = -4; row < 12; row++) for (let col = -2; col < 10; col++) for (const lato of [0, 1]) {
      x.save(); x.translate(col * Wd * 2 + lato * Wd, row * Wd * 2 + col * 0 + (lato ? Wd : 0));
      x.rotate(lato ? -Math.PI / 4 : Math.PI / 4);
      x.fillStyle = toni[(n++ * 7 + row * 3) % toni.length]; x.fillRect(0, 0, L, Wd - 1.5);
      x.fillStyle = "rgba(120,80,40,0.07)"; x.fillRect(0, (Wd - 1.5) * 0.45, L, 1.2);   // venatura
      x.restore();
    }
    parquetTex = new T.CanvasTexture(c); parquetTex.encoding = T.sRGBEncoding;
    parquetTex.wrapS = parquetTex.wrapT = T.RepeatWrapping; parquetTex.anisotropy = 8;
    return parquetTex;
  }
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
    const postino = ruolo === "postino", operaio = ruolo === "operaio", ctrl = ruolo === "controllore", segr = ruolo === "segretaria";
    const donna = segr || (s.donna != null && !capo && !resp ? !!s.donna : !capo && !resp && !postino && !operaio && ((h >>> 12) & 1) === 1);   // i capi commessa sono tutti uomini (come nelle foto)
    // aspetto ispirato alla squadra: capelli scuri o brizzolati, teste rasate, barbe, occhiali; il re ha barba scura e occhiali blu
    const PELLI = ["#f1c7a5", "#e8b896", "#d9a27c", "#c68a62"], CAPI = ["#1c1714", "#2b1d14", "#3b2a1e", "#5a3a22", "#8d8d96", "#b9b9c2"];
    const pelle = PELLI[h % PELLI.length];
    let capelli = segr ? "#3b2a1e" : postino ? "#5a3a22" : capo ? "#1c1714" : donna ? ["#2b1d14", "#a8743c", "#5a3a22", "#1c1714"][(h >>> 4) % 4] : CAPI[(h >>> 4) % CAPI.length];
    let calvo = ctrl || !capo && !donna && !postino && !operaio && (h >>> 17) % (resp ? 3 : 4) === 0;
    let barba = ctrl ? 1 : capo ? 3 : postino ? 6 : donna ? 0 : resp ? [1, 2, 3, 3, 2][(h >>> 19) % 5] : (h >>> 19) % 4;   // 0 niente, 1 accenno, 2 pizzetto, 3 piena
    let occhiali = ctrl ? null : capo ? "#1f3a8a" : !postino && !operaio && (h >>> 21) % (resp ? 2 : 3) === 0 ? ["#1c1c22", "#3b2a1e", "#1f3a8a"][(h >>> 23) % 3] : null;
    const ricci = !segr && donna && (h >>> 24) % 2 === 0;
    // i primi cinque capi commessa hanno l'aspetto scelto da Stefano, gli altri vengono dopo, a caso
    let rasatoCorto = false, orecchino = false, ciuffoFisso = null, coloreBarba = null;
    const modello = resp && s.modello != null ? s.modello : -1;
    if (modello === 0) { calvo = false; rasatoCorto = true; capelli = "#5a3a22"; barba = 4; coloreBarba = "#a8743c"; occhiali = null; }
    if (modello === 1) { calvo = false; capelli = "#8d8d96"; barba = 3; occhiali = "#111114"; ciuffoFisso = 1; }
    if (modello === 2) { calvo = false; capelli = "#1c1714"; barba = 5; occhiali = null; orecchino = true; ciuffoFisso = 2; }
    if (modello === 3) { calvo = false; capelli = "#2b1d14"; barba = 4; occhiali = null; ciuffoFisso = 0; }
    if (modello === 4) { calvo = true; barba = 2; capelli = "#1c1714"; occhiali = null; }
    const tuta = !!s.tuta && ruolo === "dip", vecchio = !!s.anziano && ruolo === "dip";   // meccanico in tuta, signore anziano
    if (vecchio) { calvo = true; capelli = "#e9e9ec"; barba = 2; occhiali = null; }                          // meccanico in tuta da lavoro
    const divisa = ruolo === "dip" && !tuta && !vecchio ? ((h >>> 25) & 1 ? "polo" : "polo bianca") : null;   // tutti in polo aziendale, nera o bianca
    const maglia = tuta ? "#3a5f8f" : vecchio ? "#8a7356" : ctrl ? "#f07d1e" : divisa === "polo" ? "#1f1f24" : divisa === "polo bianca" ? "#f4f4f2" : operaio ? "#f28c28" : segr ? "#d0213a" : postino ? "#2f9e44" : capo ? "#b3203a" : resp ? COMPLETI[(h >>> 8) % COMPLETI.length] : PASTELLI[(h >>> 8) % PASTELLI.length];
    const pantaloni = tuta ? "#3a5f8f" : vecchio ? "#6b6f78" : operaio ? "#3d4a5c" : postino ? "#3d5a8a" : capo ? "#7a1426" : resp ? maglia : donna ? pelle : JEANS[(h >>> 9) % JEANS.length];
    const scarpe = tuta ? "#2b2b33" : vecchio ? "#6b3d22" : segr ? "#b5122b" : capo ? "#e3b23c" : resp ? "#1f1f26" : donna ? ["#ef7f9f", "#2b2b33", "#ffffff"][(h >>> 10) % 3] : "#ffffff";
    const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = Math.PI; padre.add(g);
    const corpo = new T.Group(); g.add(corpo);
    const busto = palla(0.26, maglia, 0, 0.78, 0, corpo, 1, 1.3, 0.85);   // busto a pillola
    if (capo) {                                                          // il capo e' palestrato: torace largo, spalle e pettorali
      busto.scale.set(1.3, 1.3, 1.0);
      for (const sx_ of [-0.12, 0.12]) palla(0.13, maglia, sx_, 0.9, -0.12, corpo, 1.1, 0.8, 0.7);
      for (const sx_ of [-0.33, 0.33]) palla(0.14, maglia, sx_, 1.0, 0, corpo, 1, 0.85, 1);
    }
    if (capo) {                                                          // re: mantello rosso con collo d'ermellino, bottoni d'oro
      const mant = new T.Mesh(new T.CylinderGeometry(0.3, 0.42, 0.95, 20, 1, true, -Math.PI * 0.38, Math.PI * 0.76), m("#9e1630", { side: T.DoubleSide }));
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
      box(0.1, 0.045, 0.02, "#f28c28", -0.13, 0.9, -0.2, corpo);          // logo arancione sul taschino della giacca
    } else if (operaio) {                                                // gilet con bande riflettenti
      for (const by of [0.66, 0.86]) { const b = new T.Mesh(new T.TorusGeometry(0.235, 0.022, 6, 24), m("#e8eef5", { emissive: "#ffffff", emissiveIntensity: 0.25 })); b.rotation.x = Math.PI / 2; b.position.y = by; b.scale.set(1, 0.78, 1); corpo.add(b); }
    } else if (segr) {                                                   // vestito rosso corto, scollato davanti e dietro
      palla(0.1, pelle, 0, 1.0, -0.19, corpo, 1.1, 0.75, 0.35);
      palla(0.13, pelle, 0, 0.98, 0.18, corpo, 1.2, 0.9, 0.35);
      tondo(0.42, 0.04, 0.34, "#9e1630", 0, 0.58, 0, corpo, 0.02);     // cinturina
    } else if (postino) {                                                // felpa verde col cappuccio, un po' palestrato
      busto.scale.set(1.12, 1.3, 0.9);
      palla(0.2, maglia, 0, 1.0, 0.16, corpo, 1.15, 0.6, 0.7);
      for (const dx_ of [-0.06, 0.06]) tondo(0.015, 0.16, 0.015, "#ffffff", dx_, 0.86, -0.235, corpo, 0.006);
      tondo(0.3, 0.12, 0.03, "#278a3a", 0, 0.58, -0.225, corpo, 0.02);     // tascone davanti
    } else if (divisa) {                                                 // polo nera o bianca: piccola scritta arancione sul taschino sinistro, cordino
      box(0.09, 0.035, 0.02, "#f28c28", -0.11, 0.93, -0.225, corpo);
      tondo(0.14, 0.04, 0.02, maglia, 0, 1.05, -0.2, corpo, 0.01);
      for (const by of [0.98, 0.9]) palla(0.014, divisa === "polo" ? "#3a3a42" : "#c9c9c9", 0, by, -0.225, corpo, 1, 1, 0.5);   // bottoncini
      const cord = new T.Mesh(new T.TorusGeometry(0.17, 0.014, 6, 20, Math.PI * 1.1), m("#f28c28"));
      cord.rotation.set(0.25, 0, Math.PI * 0.95); cord.position.set(0, 0.92, -0.17); corpo.add(cord);
      box(0.08, 0.1, 0.02, "#ffffff", 0, 0.68, -0.235, corpo);
    } else if (divisa === "camicia") {                                  // camicia bianca con il colletto
      for (const sx of [-0.06, 0.06]) palla(0.06, "#ffffff", sx, 1.06, -0.16, corpo, 1, 0.5, 0.6);
      for (const by of [0.95, 0.82, 0.69]) palla(0.015, "#c9c9c9", 0, by, -0.225, corpo, 1, 1, 0.5);
    } else if (!donna && (h >>> 13) & 1) {                                // felpa con cappuccio per qualcuno
      palla(0.2, maglia, 0, 1.0, 0.16, corpo, 1.1, 0.6, 0.7);
      for (const dx of [-0.06, 0.06]) tondo(0.015, 0.16, 0.015, "#ffffff", dx, 0.86, -0.22, corpo, 0.006);
    }
    let gonna = null;
    if (donna) {                                                         // gonna a campana
      gonna = new T.Mesh(new T.CylinderGeometry(0.22, segr ? 0.27 : 0.32, segr ? 0.24 : 0.3, 20), m(resp || segr ? maglia : PASTELLI[(h >>> 14) % PASTELLI.length]));
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
    if (calvo) { cal.material = m(pelle, { roughness: 0.35 }); palla(0.275, capelli, 0, -0.04, 0.05, testa, 1.02, 0.6, 1, { transparent: true, opacity: 0.35 }); }   // testa rasata
    if (ricci) for (let i = 0; i < 14; i++) {                            // capelli ricci e voluminosi
      const a = i / 14 * Math.PI * 2, r = 0.27 + (i % 2) * 0.04;
      palla(0.1, capelli, Math.cos(a) * r, -0.05 + Math.sin(i * 1.7) * 0.18, 0.05 + Math.sin(a) * 0.2, testa);
    }
    if (segr) {                                                          // capelli raccolti in uno chignon, orecchini
      palla(0.13, capelli, 0, 0.12, 0.26, testa);
      for (const sx_ of [-0.27, 0.27]) palla(0.025, "#e3b23c", sx_, -0.1, 0.0, testa, 1, 1, 1, { metalness: 0.6 });
    } else if (donna) {                                                         // capelli lunghi dietro e ai lati
      palla(0.27, capelli, 0, -0.12, 0.08, testa, 1.08, 1.1, 0.85);
      for (const sx of [-0.25, 0.25]) palla(0.09, capelli, sx, -0.12, 0.02, testa, 0.7, 1.9, 1);
    }
    if (operaio) {                                                       // casco giallo
      const c = new T.Mesh(new T.SphereGeometry(0.3, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), m("#f5c518", { roughness: 0.35 }));
      c.position.y = 0.06; testa.add(c);
      tondo(0.66, 0.025, 0.66, "#f5c518", 0, 0.06, 0, testa, 0.012);
    }
    if (vecchio) {                                                       // curvo, corona di capelli bianchi, occhiali enormi
      busto.rotation.x = -0.32; testa.position.set(0, 1.24, -0.17);
      const corona = new T.Mesh(new T.TorusGeometry(0.235, 0.06, 8, 24, Math.PI * 1.3), m("#e9e9ec"));
      corona.rotation.set(Math.PI / 2, 0, -Math.PI * 0.15); corona.position.set(0, 0.0, 0.03); testa.add(corona);
      for (const sx of [-0.13, 0.13]) {
        const l = new T.Mesh(new T.TorusGeometry(0.115, 0.022, 8, 24), m("#3b2a1e")); l.position.set(sx, 0.03, -0.3); testa.add(l);
        const v = new T.Mesh(new T.CircleGeometry(0.11, 20), new T.MeshStandardMaterial({ color: lin("#dff1ff"), transparent: true, opacity: 0.35, roughness: 0.05 }));
        v.position.set(sx, 0.03, -0.305); v.rotation.y = Math.PI; testa.add(v);
      }
      box(0.04, 0.02, 0.02, "#3b2a1e", 0, 0.04, -0.3, testa);
      for (const sx of [-0.25, 0.25]) box(0.015, 0.015, 0.22, "#3b2a1e", sx, 0.04, -0.2, testa);
      for (let i = 0; i < 3; i++) palla(0.022, "#e3d6b8", 0, 0.92 - i * 0.12, -0.235, corpo);   // bottoni del cardigan
    }
    if (tuta) {                                                          // cappellino con visiera, bande riflettenti, chiave inglese nel taschino
      const cap = new T.Mesh(new T.SphereGeometry(0.295, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), m("#2c4a72")); cap.position.y = 0.05; testa.add(cap);
      tondo(0.32, 0.03, 0.2, "#2c4a72", 0, 0.12, -0.3, testa, 0.012);
      for (const zb of [-0.215, 0.215]) tondo(0.44, 0.045, 0.02, "#e8eef3", 0, 0.62, zb, corpo, 0.01, { emissive: "#c9d4dd", emissiveIntensity: 0.4 });
      tondo(0.12, 0.1, 0.02, "#2c4a72", 0.1, 0.86, -0.225, corpo, 0.01);     // taschino
      tondo(0.025, 0.16, 0.02, "#9aa3b0", 0.12, 0.9, -0.24, corpo, 0.008, { metalness: 0.6 });   // chiave inglese
    }
    if (postino) {                                                       // cuffione da gamer
      const arco = new T.Mesh(new T.TorusGeometry(0.3, 0.035, 8, 24, Math.PI), m("#1c1c22")); arco.position.y = 0.02; testa.add(arco);
      for (const sx_ of [-0.3, 0.3]) {
        const c = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 0.09, 18), m("#1c1c22")); c.rotation.z = Math.PI / 2; c.position.set(sx_, -0.02, 0); testa.add(c);
        const l = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 0.095, 14), m("#2fe06b", { emissive: "#2fe06b", emissiveIntensity: 0.8 })); l.rotation.z = Math.PI / 2; l.position.set(sx_ * 1.04, -0.02, 0); testa.add(l);
      }
    }
    if (rasatoCorto) cal.scale.set(0.97, 0.9, 0.97);
    const ciuffo = postino ? 2 : operaio || calvo || rasatoCorto ? -1 : ciuffoFisso != null ? ciuffoFisso : h % 3;
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
    if (segr) for (const q of [sorriso, bocca_o, linea]) q.material = m("#d0213a");      // rossetto
    const cBarba = coloreBarba || (capelli === "#b9b9c2" || capelli === "#8d8d96" ? "#6d6d75" : capelli);
    if (barba === 6) {                                                   // barba a punta
      palla(0.2, cBarba, 0, -0.14, -0.1, testa, 1.1, 0.6, 1);
      const pu = new T.Mesh(new T.ConeGeometry(0.1, 0.24, 12), m(cBarba)); pu.rotation.x = Math.PI; pu.position.set(0, -0.3, -0.2); testa.add(pu);
      tondo(0.14, 0.03, 0.04, cBarba, 0, -0.055, -0.28, testa, 0.015);
      for (const q of [sorriso, bocca_o, linea]) q.position.z -= 0.04;
    } else if (barba === 5) {                                                   // barba lunga e piena
      palla(0.24, cBarba, 0, -0.2, -0.1, testa, 1.15, 0.95, 1);
      tondo(0.16, 0.035, 0.04, cBarba, 0, -0.055, -0.285, testa, 0.015);
      for (const q of [sorriso, bocca_o, linea]) q.position.z -= 0.07;
    } else if (barba === 4) {                                            // barba corta curata
      palla(0.235, cBarba, 0, -0.12, -0.06, testa, 1.12, 0.66, 1.05);
      for (const q of [sorriso, bocca_o, linea]) q.position.z -= 0.04;
    } else if (barba === 3) {                                                   // barba piena e baffi; la bocca resta davanti
      palla(0.22, cBarba, 0, -0.15, -0.08, testa, 1.15, 0.72, 1);
      tondo(0.16, 0.035, 0.04, cBarba, 0, -0.055, -0.285, testa, 0.015);
      for (const q of [sorriso, bocca_o, linea]) q.position.z -= 0.06;
    } else if (barba === 2) {                                            // pizzetto
      palla(0.06, cBarba, 0, -0.17, -0.24, testa, 1, 1.2, 0.7);
      tondo(0.12, 0.03, 0.03, cBarba, 0, -0.06, -0.27, testa, 0.012);
      for (const q of [sorriso, bocca_o, linea]) q.position.z -= 0.02;
    } else if (barba === 1) palla(0.24, cBarba, 0, -0.1, -0.05, testa, 1.12, 0.7, 1.06, { transparent: true, opacity: 0.28 });   // barba di qualche giorno
    if (orecchino) for (const sx of [-0.27, 0.27]) {                       // dilatatore all'orecchio
      const o = new T.Mesh(new T.TorusGeometry(0.035, 0.012, 6, 14), m("#1c1c22")); o.rotation.y = Math.PI / 2; o.position.set(sx, -0.08, 0.02); testa.add(o);
    }
    if (ctrl) {                                                          // occhiali da vista appoggiati sulla testa
      const oc = new T.Group(); oc.position.set(0, 0.29, -0.12); oc.rotation.x = 1.0; testa.add(oc);
      for (const sx of [-0.095, 0.095]) {
        const l = new T.Mesh(new T.TorusGeometry(0.065, 0.013, 6, 4), m("#2b2b33")); l.rotation.z = Math.PI / 4; l.scale.set(1.25, 0.85, 1);
        l.position.set(sx, 0, 0); oc.add(l);
      }
      box(0.05, 0.015, 0.015, "#2b2b33", 0, 0, 0, oc);
      for (const sx of [-0.18, 0.18]) box(0.015, 0.015, 0.22, "#2b2b33", sx, 0, 0.1, oc);
      for (let i = 0; i < 4; i++) {                                      // maglioncino: righe a coste
        const r = new T.Mesh(new T.TorusGeometry(0.24, 0.012, 5, 22), m("#d96a12")); r.rotation.x = Math.PI / 2; r.scale.set(1, 0.8, 1); r.position.y = 0.62 + i * 0.1; corpo.add(r);
      }
    }
    if (occhiali) {                                                      // occhiali rettangolari
      for (const sx of [-0.095, 0.095]) {
        const l = new T.Mesh(new T.TorusGeometry(0.065, 0.013, 6, 4), m(occhiali)); l.rotation.z = Math.PI / 4; l.scale.set(1.25, 0.85, 1);
        l.position.set(sx, 0.03, -0.29); testa.add(l);
      }
      box(0.05, 0.015, 0.015, occhiali, 0, 0.04, -0.29, testa);
      for (const sx of [-0.18, 0.18]) box(0.015, 0.015, 0.2, occhiali, sx, 0.04, -0.2, testa);
    }
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
      if (postino) c.scale.set(1.25, 1, 1.25);
      if (capo) {                                                        // braccia grosse con i bicipiti
        c.scale.set(1.7, 1, 1.7);
        palla(0.12, maglia, 0, -0.14, -0.03, b, 1, 1.2, 1);
        palla(0.12, pelle, 0, -0.42, 0, b);
      }
      return b;
    };
    const sx = braccio(capo ? -0.42 : -0.31), dx = braccio(capo ? 0.42 : 0.31);
    const basePlus = []; g.traverse(o => { if (o.isMesh) basePlus.push(o); });   // per il 3D+: il corpo da nascondere
    if (ctrl) g.scale.set(1.12, 1.25, 1.12);                             // il controllore e' piu' alto di tutti
    if (operaio) {                                                       // martello nella destra, scalpello nella sinistra
      tondo(0.08, 0.62, 0.08, "#b0703a", 0, -1.0, 0, dx, 0.03);                         // martellone: manico lungo
      tondo(0.22, 0.22, 0.5, "#3a3f4a", 0, -1.14, -0.08, dx, 0.05, { metalness: 0.7, roughness: 0.3 });   // testa enorme
      tondo(0.1, 0.18, 0.1, "#ffd23f", 0, -0.62, 0, sx, 0.03);                           // scalpello: impugnatura gialla
      tondo(0.06, 0.42, 0.06, "#c9d1dc", 0, -1.02, 0, sx, 0.02, { metalness: 0.7, roughness: 0.25 });
    }
    // cornetta da telefono classico, grande e rossa, con il filo a spirale (si vede bene anche da lontano)
    const giacca = palla(0.29, "#5b4a3f", 0, 0.8, 0, corpo, 1, 1.25, 0.9); giacca.visible = false;   // cappotto per uscire la sera
    basePlus.push(giacca);
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
    if (window.Plus3D) Plus3D.registra(g, corpo, { maglia, pantaloni, capelli, pelle, scarpe, donna, capo, segr, occhiali, barba, calvo, coloreBarba, h, ruolo, tuta, vecchio }, basePlus);
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
  let porta = null, portaPos = null, portaAperta = 0, orologio = null, ispettore = null;
  // \pc off / \pc on dalla chat principale di Agente TIA: tutti a casa (restano le lampade) / tutti dentro, il primo accende la luce
  let pc = "on", pcT = -1e9, pcPrimaVolta = true, pcLuce = 1;
  const pcFuori = new Set(), spenti = new Set();
  function impostaPc(stato, subito) {
    stato = String(stato || "on").toLowerCase() === "off" ? "off" : "on";
    if (stato === pc && !pcPrimaVolta) return;
    pc = stato; pcT = subito ? -1e9 : performance.now() / 1000; pcPrimaVolta = false;
  }
  const arrivi = new Map();                                              // id -> quando entra dalla porta (dopo il cantiere)
  let postini = [], bersagli = new Map(), ingresso = [-2.5, 6], ultimiDati = null;
  // il "postino" e' un ragazzo che gioca alla PlayStation in poltrona: quando Stefano risponde si alza e porta il messaggio
  let gioc = null, giocLibero = 0;
  function creaGiocatore(lx, lz) {
    const an = new T.Group(); an.position.set(lx, 0, lz); mondo.add(an);
    tondo(0.9, 0.42, 0.85, "#7a3b2e", 0, 0, 0, an, 0.12);                 // poltrona: seduta
    tondo(0.24, 1.0, 0.9, "#6a3226", 0.42, 0, 0, an, 0.1);                // schienale (dietro = +x)
    for (const sz of [-0.44, 0.44]) tondo(0.85, 0.62, 0.18, "#6a3226", 0.03, 0, sz, an, 0.08);   // braccioli
    tondo(0.5, 0.5, 1.3, "#3c4658", -1.8, 0, 0, an, 0.05);                // mobiletto
    tondo(0.08, 0.8, 1.36, "#15151a", -1.8, 0.55, 0, an, 0.03);           // televisore
    const scr = new T.Mesh(new T.PlaneGeometry(1.2, 0.66), new T.MeshBasicMaterial({ color: 0x4dabf7 }));
    scr.rotation.y = Math.PI / 2; scr.position.set(-1.75, 0.95, 0); an.add(scr);
    tondo(0.32, 0.07, 0.24, "#f4f4f2", -1.8, 0.5, 0.42, an, 0.02);        // console
    palla(0.02, "#4dabf7", -1.63, 0.535, 0.42, an, 1, 1, 1, { emissive: "#4dabf7", emissiveIntensity: 1 });
    const g = omino({ id: "giocatore" }, mondo, lx, lz, "postino"), u = g.userData;
    const pad = tondo(0.3, 0.06, 0.14, "#1c1c22", -0.15, -0.44, -0.1, u.dx, 0.03);   // joypad tra le mani
    const busta = tondo(0.26, 0.17, 0.03, "#fffaf0", 0, -0.45, -0.1, u.dx, 0.01); busta.visible = false;
    palla(0.035, "#d23c3c", 0, -0.45, -0.12, busta, 1, 1, 0.4);
    const pos = new T.Vector3(lx, 2.0, lz), et = etichetta("f3d", "✉️ Da Stefano", pos);
    et.e.style.visibility = "hidden"; marcati.push(et);
    gioc = { g, u, casa: [lx, lz], scr, pad, busta, pos, et, prossima: gioc ? gioc.prossima : null, chat: gioc ? gioc.chat : null };
  }
  // la segretaria del capo: anima gli scambi tra Claude e TIA Portal (progetti aperti, compilazioni KO, download, TIA aperti)
  let segr = null, segrCoda = [], tiaPrima = new Map(), downPrima = new Set();
  function creaSegretaria() {
    const uf = uffici.get("r:capo"); if (!uf || !SC) { segr = null; return; }
    const dx_ = uf.gx - 0.6, dz_ = uf.gz + uf.LD / 2 + 0.85, via = SC.zp, H = SC.H;
    const sc = new T.Group(); sc.position.set(dx_, H, dz_); mondo.add(sc);
    tondo(1.1, 0.7, 0.5, "#f4f1ea", 0, 0, 0, sc, 0.04);                    // scrivanietta bianca
    tondo(1.16, 0.05, 0.56, "#c9a27a", 0, 0.7, 0, sc, 0.02);
    tondo(0.3, 0.05, 0.22, "#1c1c22", -0.3, 0.75, 0.02, sc, 0.02);        // telefono
    const corn = tondo(0.26, 0.06, 0.07, "#1c1c22", -0.3, 0.8, 0.02, sc, 0.03);
    for (let i = 0; i < 3; i++) tondo(0.3, 0.03, 0.22, ["#3b82f6", "#e03131", "#f2c230"][i], 0.32, 0.75 + i * 0.035, 0.0, sc, 0.01);   // pila di cartelline
    const cv = document.createElement("canvas"); cv.width = 128; cv.height = 64;
    const tx = new T.CanvasTexture(cv);
    const lav = new T.Mesh(new T.PlaneGeometry(0.46, 0.23), new T.MeshBasicMaterial({ map: tx }));   // lavagnetta "TIA aperti"
    lav.position.set(0.0, 0.98, 0.18); lav.rotation.y = Math.PI; sc.add(lav);
    const lav2 = lav.clone(); lav2.rotation.y = 0; lav2.position.z = 0.21; sc.add(lav2);
    tondo(0.5, 0.27, 0.03, "#7a4a20", 0, 0.835, 0.185, sc, 0.01);
    sedia(dx_, dz_ - 0.75, mondo).position.y = H;
    const g = omino({ id: "segretaria" }, mondo, dx_, dz_ - 0.6, "segretaria"), u = g.userData;
    g.position.y = H;
    const cart = tondo(0.3, 0.03, 0.24, "#3b82f6", 0, -0.46, -0.12, u.dx, 0.01); cart.visible = false;   // cartellina in mano
    const limetta = tondo(0.02, 0.14, 0.02, "#e8c9a0", 0, -0.5, -0.08, u.dx, 0.006); limetta.visible = false;
    const tazza = tondo(0.1, 0.12, 0.1, "#ffffff", 0, -0.55, -0.06, u.sx, 0.04); tazza.visible = false;
    const pos = new T.Vector3(dx_, 2.0 + H, dz_ - 0.6), et = etichetta("f3d", "", pos); et.e.style.visibility = "hidden"; marcati.push(et);
    segr = { g, u, casa: [dx_, dz_ - 0.6], via, cart, limetta, tazza, pos, et, cv, tx, corn, prossimoCaffe: segr ? segr.prossimoCaffe : null };
    disegnaLavagna();
  }
  function disegnaLavagna() {
    if (!segr) return;
    const lista = (ultimiDati && ultimiDati[1] && ultimiDati[1].tia) || [], per = {};
    for (const q of lista) per[q.versione] = (per[q.versione] || 0) + 1;
    segr.troppi = lista.length > 3 || Object.values(per).some(n => n > 2);
    const c = segr.cv.getContext("2d");
    c.fillStyle = "#1f3b2c"; c.fillRect(0, 0, 128, 64);
    c.fillStyle = segr.troppi ? "#ff8787" : "#f4f1ea"; c.font = "bold 22px sans-serif"; c.textAlign = "center";
    c.fillText("TIA " + lista.length + "/3", 64, 28);
    c.font = "15px sans-serif"; c.fillText(Object.entries(per).map(([v, n]) => v + ":" + n).join(" ") || "nessuno", 64, 52);
    segr.tx.needsUpdate = true;
  }
  function incarico(tipo, id, testo, colore) {                          // mette in coda una commissione della segretaria
    if (!segr) return;
    const b = id ? bersagli.get(id) : null, capoB = bersagli.get("capo:r:capo");
    const [sx0, sz0] = segr.casa; let punti, verso = 0;
    // dalla scrivania sul balcone: gira attorno alla scrivania, poi lungo il balcone (e giu' per la scala se deve scendere)
    const fuori = [[sx0, sz0, 0.5], [sx0 - 0.85, sz0, 0], [sx0 - 0.85, SC.zb, 0]], giu = giuScala().slice(0, -1).concat([[SC.xb, SC.zp, 0]]);
    const torna = a => [...a.slice().reverse().map(q => [q[0], q[1], 0]), [sx0, sz0, 0.3]];
    const d = b && !b.ufficio ? b : !b ? capoB : null;
    if (b && b.ufficio) {                                                // sottoagente: accanto alla sua sedia
      const c = b.dz - 0.95, sx_ = b.dx + 0.6, sz_ = c + 0.5;
      const via = [...fuori, ...giu, [SC.xb, c, 0], [sx_, c, 0]];
      punti = [...via, [sx_, sz_, tipo === "ko" ? 2.4 : 2.0, tipo], ...torna(via).slice(0, -1).concat([[sx0, sz0, 0.3]])];
      verso = Math.atan2(-(b.dx - sx_), -(b.dz - sz_));
    } else {
      if (!d) return;
      const via = d.scala ? [...fuori, [d.x, SC.zb, 0]] : [...fuori, ...giu, [d.x, SC.zp, 0]];
      punti = [...via, [d.x, d.z, tipo === "allarme" ? 4 : 2.6, tipo], ...torna(via)];
      verso = d.verso || 0;
    }
    const vel = tipo === "allarme" ? 3.2 : 1.7;
    const ora = performance.now() / 1000, inizio = segrCoda.reduce((a, q) => Math.max(a, q.fine), ora);
    const iAz = punti.findIndex(q => q[3] === tipo);
    segrCoda.push({ tipo, id, testo, colore, punti, verso, vel, iAz, inizio, fine: inizio + durata(punti, vel) });
  }
  function chiacchieraGioc() {                                            // ogni tanto va a fare due chiacchiere con un collega
    const dip = animati.filter(a => a.userData.caffe && a.visible && a.userData.corridoio != null);
    if (!dip.length || !gioc) return null;
    const u = dip[Math.floor(Math.random() * dip.length)].userData, [lx, lz] = gioc.casa;
    const c = u.corridoio, sx_ = u.casa[0] + 0.6, sz_ = c + 0.5;
    const punti = [[lx, lz, 0.6], [lx, c, 0], [sx_, c, 0], [sx_, sz_, 7, "chiacchiera"], [sx_, c, 0], [lx, c, 0], [lx, lz, 0.3]];
    const FRASI = ["💬 Hai visto la partita?", "💬 Stasera calcetto?", "💬 Ho battuto il record!", "💬 Pausa caffè?"];
    return { punti, inizio: t, fine: t + durata(punti, 1.6), verso: Math.atan2(-(u.casa[0] - sx_), -(u.casa[1] - sz_)), frase: FRASI[Math.floor(Math.random() * FRASI.length)] };
  }
  let ordini = [], uffici = new Map();
  // ---------- sala relax: macchinetta del caffe', divano con la TV, calcio balilla ----------
  let relax = null;
  function salaRelax(x0, z0) {
    const W = 5.6, D = 5.0, HV = 2.2, cx = x0 + W / 2, cz = z0 + D / 2, zd = corridoioPrimo;   // la porta e' sul corridoio della prima fila
    const g = new T.Group(); g.position.set(cx, 0, cz); mondo.add(g);
    tondo(W, 0.03, D, "#eadfcf", 0, 0, 0, g, 0.01);                          // pavimento caldo
    const tp = tondo(2.6, 0.02, 1.6, "#d97757", 1.3, 0.03, D / 2 - 1.2, g, 0.3); tp.castShadow = false;   // tappeto davanti al divano
    const pv = new T.MeshStandardMaterial({ transparent: true, opacity: 0.16, color: lin("#bfe3fb"), roughness: 0.1 });
    const pz = zd - cz, LP = 1.3;                                             // apertura nella parete di sinistra
    for (const [w, d, px, pz_] of [[W, 0.05, 0, -D / 2], [W, 0.05, 0, D / 2], [0.05, D, W / 2, 0],
                                   [0.05, (pz - LP / 2) + D / 2, -W / 2, (-D / 2 + pz - LP / 2) / 2], [0.05, D / 2 - (pz + LP / 2), -W / 2, (D / 2 + pz + LP / 2) / 2]]) {
      if (w <= 0.05 && d <= 0.05) continue;
      const v = new T.Mesh(geo, pv); v.scale.set(w, HV, d); v.position.set(px, HV / 2, pz_); g.add(v);
      tondo(w + 0.04, 0.07, d + 0.04, "#2fbf6d", px, HV, pz_, g, 0.025);
    }
    // bancone del caffe' sul fondo, a sinistra
    tondo(1.6, 0.9, 0.6, "#ffffff", -1.5, 0, -D / 2 + 0.35, g, 0.06);
    tondo(1.64, 0.06, 0.64, "#c08850", -1.5, 0.9, -D / 2 + 0.35, g, 0.03);
    tondo(0.36, 0.5, 0.32, "#3c4658", -1.8, 0.96, -D / 2 + 0.3, g, 0.06);
    palla(0.035, "#ff6b6b", -1.8, 1.3, -D / 2 + 0.47, g, 1, 1, 0.5, { emissive: "#ff6b6b", emissiveIntensity: 0.6 });
    for (const dx of [-1.3, -1.1, -0.9]) tondo(0.1, 0.11, 0.1, "#ffffff", dx, 0.96, -D / 2 + 0.45, g, 0.04);
    tondo(0.6, 1.5, 0.55, "#e9edf2", -W / 2 + 0.45, 0, -D / 2 + 0.4, g, 0.06);   // frigorifero
    tondo(0.04, 0.4, 0.04, "#8a9099", -W / 2 + 0.68, 0.9, -D / 2 + 0.69, g, 0.015);
    const cest = new T.Mesh(new T.CylinderGeometry(0.2, 0.16, 0.42, 14, 1, true), m("#8a9099", { side: T.DoubleSide }));
    cest.position.set(-0.45, 0.21, -D / 2 + 0.35); g.add(cest);
    // divano verso la TV appesa sul fondo, a destra
    tondo(2.3, 0.45, 0.8, "#4f7cac", 1.3, 0, D / 2 - 0.55, g, 0.12);
    tondo(2.3, 0.6, 0.25, "#3f6894", 1.3, 0.35, D / 2 - 0.2, g, 0.1);
    for (const sx_ of [0.1, 2.5]) tondo(0.22, 0.65, 0.8, "#3f6894", sx_, 0, D / 2 - 0.55, g, 0.1);
    for (const sx_ of [0.6, 1.3, 2.0]) tondo(0.36, 0.3, 0.12, ["#f2c230", "#d97757", "#7cc98a"][Math.round(sx_ * 2) % 3], sx_, 0.5, D / 2 - 0.36, g, 0.06);   // cuscini
    tondo(1.5, 0.9, 0.06, "#1c1c22", 1.3, 1.0, -D / 2 + 0.06, g, 0.03);       // TV
    const tv = new T.Mesh(new T.PlaneGeometry(1.38, 0.78), new T.MeshBasicMaterial({ color: "#5c9ee6", toneMapped: false }));
    tv.position.set(1.3, 1.45, -D / 2 + 0.1); g.add(tv);
    tondo(1.2, 0.4, 0.4, "#8a5a2b", 1.3, 0, -D / 2 + 0.3, g, 0.04);           // mobiletto TV
    tondo(0.6, 0.35, 0.5, "#c08850", 1.3, 0, 0.75, g, 0.08);                  // tavolino
    // calcio balilla al centro
    const bx = -1.0, bz = 0.55;
    tondo(1.3, 0.75, 0.72, "#2b6e3f", bx, 0.1, bz, g, 0.04);
    tondo(1.2, 0.03, 0.62, "#3fa35b", bx, 0.86, bz, g, 0.01);
    for (const [lx, lz] of [[-0.55, -0.28], [0.55, -0.28], [-0.55, 0.28], [0.55, 0.28]]) tondo(0.07, 0.12, 0.07, "#3c4658", bx + lx, 0, bz + lz, g, 0.02);
    const aste = [];
    for (let i = 0; i < 4; i++) {
      const ax = bx - 0.45 + i * 0.3, c = i % 2 ? "#e03131" : "#3b82f6";
      const asta = new T.Mesh(new T.CylinderGeometry(0.015, 0.015, 1.3, 6), m("#c9ced6", { metalness: 0.6 }));
      asta.rotation.x = Math.PI / 2; asta.position.set(ax, 0.95, bz); g.add(asta); aste.push(asta);
      for (const o of [-0.17, 0, 0.17]) palla(0.04, c, ax, 0.9, bz + o, g, 0.8, 1.6, 0.8);
      palla(0.05, "#1c1c22", ax, 0.95, bz + (i < 2 ? 0.68 : -0.68), g);      // manopola
    }
    const pall = palla(0.035, "#ffffff", bx, 0.9, bz, g);
    palla(0.3, "#7cc98a", W / 2 - 0.4, 0.75, -D / 2 + 0.45, g, 1, 1.15, 1); tondo(0.4, 0.45, 0.4, "#f3f0ea", W / 2 - 0.4, 0, -D / 2 + 0.45, g, 0.12);
    marcati.push(etichetta("nome uff", "🛋️ Sala relax", new T.Vector3(cx, HV + 0.55, z0)));
    const chi = { pos: new T.Vector3(cx - 1.65, 2.1, cz - D / 2 + 1.2) };
    chi.et = etichetta("f3d", "💬 bla bla bla…", chi.pos); chi.et.e.style.visibility = "hidden"; marcati.push(chi.et);
    chiacchiere.push(chi);
    const P = (lx, lz, az, ang, lato) => ({ x: cx + lx, z: cz + lz, az, ang, lato, libero: 0 });
    const posti = [P(-1.95, -D / 2 + 0.95, "caffe", 0, 0), P(-1.3, -D / 2 + 0.95, "caffe", 0, 1),
                   P(0.6, D / 2 - 0.62, "divano", 0), P(1.3, D / 2 - 0.62, "divano", 0), P(2.0, D / 2 - 0.62, "divano", 0),
                   P(bx, bz + 0.72, "balilla", 0, 0), P(bx, bz - 0.72, "balilla", Math.PI, 1)];
    relax = { zp: z0 - 1.1, posti, ingresso: [x0 - 0.7, zd], dentro: [x0 + 0.7, zd], tv, pall, aste, bx: cx + bx, chi, inBalilla: 0,
              cestino: new T.Vector3(cx - 0.45, 0.45, cz - D / 2 + 0.35) };
    for (const om of camminatori.splice(0)) {
      om.userData.caffe = [posti[0].x, posti[0].z]; om.userData.chiacchiera = chi; om.userData.cestino = relax.cestino;
    }
  }
  // sceglie un posto libero nella sala relax (macchinetta, divano o calcio balilla) e lo tiene occupato
  const SOSTA = { caffe: 5, divano: 14, balilla: 13 };
  function postoRelax(da) {
    if (!relax) return null;
    const ora = t, tipi = ["caffe", "caffe", "divano", "balilla"];
    // se uno gioca gia' a calcio balilla, l'altro posto ha la precedenza
    const giocaUno = relax.posti.filter(p => p.az === "balilla" && p.libero > ora).length === 1;
    let lib = relax.posti.filter(p => p.libero <= ora && (giocaUno ? p.az === "balilla" : p.az === tipi[Math.floor(Math.random() * tipi.length)]));
    if (!lib.length) lib = relax.posti.filter(p => p.libero <= ora);
    if (!lib.length) return null;
    return lib[Math.floor(Math.random() * lib.length)];
  }
  // percorso dal corridoio (x, zc) dentro la sala fino al posto, e ritorno; "andata" tiene conto di chi e' gia' in cammino
  function versoRelax(xa, zc, p, ox = 0, oz = 0, vel = 1.1, extra = 0) {
    const [ix, iz] = relax.ingresso, [dx, dz] = relax.dentro, L = (x, z, pa, a) => [x - ox, z - oz, pa || 0, a];
    const andata = [L(xa, zc), L(ix, zc), L(ix, iz), L(dx, iz), L(p.x, p.z, SOSTA[p.az], p.az)];
    const ritorno = [L(dx, iz), L(ix, iz), L(ix, zc), L(xa, zc)];
    const occupa = durata(andata.slice(0, -1), vel) + extra;
    p.libero = t + occupa + SOSTA[p.az] + 1.5;
    return { andata, ritorno };
  }
  // ---------- soppalco: capo, sala riunioni e ufficio del controllore stanno al piano di sopra ----------
  let SC = null;                                                       // { H, zb, zs, xl, xt, xb, zp, x0, x1, z0, z1 }
  function quota(x, z) {                                               // altezza del pavimento in quel punto
    if (!SC) return 0;
    const { H, zs, xt, xb, x0, x1, z0, z1 } = SC;
    if (x >= xb - 0.05 && x <= xt && Math.abs(z - zs) <= 0.45) return H * Math.max(0, (x - xb) / (xt - xb));   // scala
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1 + 0.02) return H;
    if (x >= xt && x <= xt + 0.95 && z > z1 && z <= zs + 0.48) return H;                                     // pianerottolo
    return 0;
  }
  let ufficioCtrl = null;
  function soppalco() {
    const { H, x0, x1, z0, z1, xt, xb, zs } = SC, zl = zs + 0.45, xr = xt + 0.95;
    box(x1 - x0, 0.16, z1 - z0, "#cdb79a", (x0 + x1) / 2, H - 0.16, (z0 + z1) / 2, mondo, { roughness: 0.6 });   // solaio in legno
    box(xr - xt, 0.16, zl - z1, "#cdb79a", (xt + xr) / 2, H - 0.16, (z1 + zl) / 2, mondo, { roughness: 0.6 });   // pianerottolo
    box(x1 - x0, 0.1, 0.06, "#e3b23c", (x0 + x1) / 2, H - 0.2, z1 + 0.03, mondo, { metalness: 0.5, roughness: 0.35 });   // bordo d'oro
    for (let x = x0 + 0.25; x < x1; x += 3.85) for (const zc of [z0 + 0.25, z1 - 0.25]) tondo(0.22, H - 0.16, 0.22, "#8a94a6", x, 0, zc, mondo, 0.06);
    tondo(0.22, H - 0.16, 0.22, "#8a94a6", xr - 0.12, 0, zl - 0.12, mondo, 0.06);
    tondo(0.22, H - 0.16, 0.22, "#8a94a6", x1 - 0.12, 0, z1 - 0.25, mondo, 0.06);
    const vetro = new T.MeshStandardMaterial({ transparent: true, opacity: 0.2, color: lin("#bfe3fb"), roughness: 0.1 });
    const ring = (xa, za, xb_, zb_) => {                                 // parapetto di vetro con corrimano
      const w = Math.max(0.04, Math.abs(xb_ - xa)), d = Math.max(0.04, Math.abs(zb_ - za)), px = (xa + xb_) / 2, pz = (za + zb_) / 2;
      const v = new T.Mesh(geo, vetro); v.scale.set(w, 0.85, d); v.position.set(px, H + 0.425, pz); mondo.add(v);
      tondo(w + 0.03, 0.05, d + 0.03, "#9aa3b2", px, H + 0.85, pz, mondo, 0.02, { metalness: 0.5, roughness: 0.3 });
    };
    ring(x0, z1, xt, z1); ring(xr, z1, x1, z1); ring(xt, zl, xr, zl); ring(xr, z1, xr, zl);
    ring(x1, z0, x1, z1); ring(x0, z0, x0, z1); ring(x0, z0, x1, z0);
    const n = 10, run = (xt - xb) / n;                                   // scala: dieci gradini verso sinistra
    for (let i = 0; i < n; i++) box(run + 0.01, (i + 1) * H / n, 0.86, i % 2 ? "#b89a74" : "#c8a982", xb + run * (i + 0.5), 0, zs, mondo);
    const lr = Math.hypot(xt - xb, H), an = Math.atan2(H, xt - xb);
    for (const zc of [zs + 0.45, zs - 0.45]) {                           // corrimano inclinati
      const c = new T.Mesh(geo, m("#9aa3b2", { metalness: 0.5, roughness: 0.3 })); c.scale.set(lr, 0.05, 0.05);
      c.position.set((xb + xt) / 2, H / 2 + 0.85, zc); c.rotation.z = an; mondo.add(c);
      for (let i = 0; i <= n; i += 2) { const x = xb + run * i; tondo(0.04, 0.85, 0.04, "#9aa3b2", x, H * i / n, zc, mondo, 0.015); }
    }
    // citofono ai piedi della scala: chi aspetta e non ha un responsabile suona qui
    tondo(0.12, 1.25, 0.12, "#3c4658", xb - 0.55, 0, SC.zp - 1.0, mondo, 0.04);
    tondo(0.26, 0.34, 0.08, "#e9edf2", xb - 0.55, 1.05, SC.zp - 0.94, mondo, 0.03);
    palla(0.035, "#2fbf6d", xb - 0.55, 1.28, SC.zp - 0.89, mondo, 1, 1, 0.5, { emissive: "#2fbf6d", emissiveIntensity: 0.8 });
    // l'ufficietto del controllore, a sinistra della sala riunioni
    const LW = 2.8, LD = 3.6, gx = -6.8 - LW / 2 + 0.05, g = new T.Group(); g.position.set(gx, H, 0); mondo.add(g);
    tondo(LW, 0.03, LD, "#e6dccb", 0, 0, 0, g, 0.01);
    const pv = new T.MeshStandardMaterial({ transparent: true, opacity: 0.16, color: lin("#bfe3fb"), roughness: 0.1 });
    for (const [w, d, px, pz] of [[LW, 0.05, 0, -LD / 2], [0.05, LD, -LW / 2, 0], [0.05, LD, LW / 2, 0], [LW * 0.55, 0.05, -LW * 0.225, LD / 2]]) {
      const v = new T.Mesh(geo, pv); v.scale.set(w, 2.1, d); v.position.set(px, 1.05, pz); g.add(v);
      tondo(w + 0.04, 0.07, d + 0.04, "#f28c28", px, 2.1, pz, g, 0.025);
    }
    tondo(1.3, 0.72, 0.6, "#5b4636", 0, 0, -0.5, g, 0.03);                 // scrivania scura
    for (let i = 0; i < 3; i++) tondo(0.3, 0.05, 0.22, ["#e03131", "#f2c230", "#868e96"][i], -0.4 + i * 0.02, 0.72 + i * 0.05, -0.55, g, 0.01);   // pratiche
    tondo(0.32, 0.02, 0.24, "#ffffff", 0.15, 0.73, -0.4, g, 0.005);       // il rapporto
    tondo(0.5, 1.3, 0.35, "#8a94a6", -LW / 2 + 0.4, 0, -LD / 2 + 0.3, g, 0.03);   // schedario
    palla(0.22, "#7cc98a", LW / 2 - 0.35, 0.55, -LD / 2 + 0.35, g, 1, 1.1, 1);
    tondo(0.3, 0.42, 0.3, "#3c4658", LW / 2 - 0.35, 0, -LD / 2 + 0.35, g, 0.08);
    ufficioCtrl = { x: gx, z: -0.5 + 0.55, porta: gx + LW * 0.22 };       // in piedi davanti alla scrivania, girato verso di lei
    marcati.push(etichetta("nome uff", "🕵️ Controllore", new T.Vector3(gx, H + 2.6, -LD / 2)));
  }
  // dal balcone giu' fino al corridoio (coordinate del mondo, spostate di ox, oz)
  const giuScala = (ox = 0, oz = 0) => SC ? [[SC.xl, SC.zb], [SC.xl, SC.zs], [SC.xb, SC.zs], [SC.xb, SC.zp]].map(([x, z]) => [x - ox, z - oz, 0]) : [];
  const suScala = (ox = 0, oz = 0) => giuScala(ox, oz).reverse();
  // da un punto del corridoio (x, via) fino a un bersaglio sul soppalco, e ritorno
  function suDalCapo(x, via, b, pausa, azione) {
    const su = [[SC.xb, via, 0], ...suScala().slice(1), [b.x, SC.zb, 0]];
    return { andata: [[x, via, 0], ...su, [b.x, b.z, pausa, azione]], ritorno: [...su.slice().reverse(), [x, via, 0]] };
  }
  // ---------- momenti divertenti ----------
  const momenti = new Map();                                             // id -> {tipo, inizio, fine}
  const compPrima = new Map(), schedePrima = new Map(), usciti = new Set();
  let effetti = [], lampadine = [], lampadari = [], chiacchiere = [], gruppoDi = new Map();
  let relaxSubito = false, forzaSera = 0, forzaVenerdi = 0, passeggioSubito = false, corridoioPrimo = 7, xDestra = 0;
  const capoMondo = new T.Vector3(); let capoInGiro = false, tPrec = 0;
  const ora_ = () => new Date();
  const sera = () => t < forzaSera || ora_().getHours() >= 19 || ora_().getHours() < 6;
  const venerdi = () => t < forzaVenerdi || (ora_().getDay() === 5 && ora_().getHours() >= 14);
  const MAT_AURA = [new T.MeshBasicMaterial({ color: lin("#ff9a1a"), transparent: true, opacity: 0.5, depthWrite: false, side: T.DoubleSide }),
                    new T.MeshBasicMaterial({ color: lin("#ffe14d"), transparent: true, opacity: 0.65, depthWrite: false, side: T.DoubleSide }),
                    new T.MeshBasicMaterial({ color: lin("#ffc93c"), transparent: true, opacity: 0.16, depthWrite: false })];
  const geoFiamma = new T.ConeGeometry(0.16, 0.9, 8, 1, true), geoAnello = new T.TorusGeometry(0.5, 0.05, 6, 32);
  function creaAura(a) {
    const g = new T.Group(); a.add(g);
    const fiamme = [];
    for (let i = 0; i < 14; i++) {                                       // lingue di fuoco tutto intorno, che salgono
      const f = new T.Mesh(geoFiamma, MAT_AURA[i % 3 === 0 ? 1 : 0]), an = i / 14 * Math.PI * 2, r = 0.42 + (i % 2) * 0.1;
      f.position.set(Math.cos(an) * r, 0.5 + (i % 3) * 0.35, Math.sin(an) * r); f.userData = { an, r, fase: i * 0.7, h: 0.5 + (i % 3) * 0.35 };
      g.add(f); fiamme.push(f);
    }
    const guscio = new T.Mesh(new T.SphereGeometry(0.62, 16, 12), MAT_AURA[2]); guscio.scale.set(1, 1.8, 1); guscio.position.y = 1.0; g.add(guscio);
    const anello = new T.Mesh(geoAnello, MAT_AURA[1].clone()); anello.rotation.x = Math.PI / 2; anello.position.y = 0.05; g.add(anello);
    g.userData = { fiamme, guscio, anello }; g.visible = false;
    return g;
  }
  function animaAura(g, fr) {
    const { fiamme, guscio, anello } = g.userData, cresce = Math.min(1, fr / 0.5);
    for (const f of fiamme) {
      const d = f.userData, sale = (t * 1.6 + d.fase) % 1;
      f.position.set(Math.cos(d.an + t * 0.8) * d.r, d.h + sale * 0.6, Math.sin(d.an + t * 0.8) * d.r);
      f.scale.set(cresce, cresce * (0.8 + Math.sin(t * 17 + d.fase) * 0.35), cresce);
    }
    guscio.scale.set(cresce * (1 + Math.sin(t * 23) * 0.05), cresce * 1.8, cresce * (1 + Math.cos(t * 19) * 0.05));
    const onda = (fr * 1.4) % 1;                                          // onde d'urto che si allargano a terra
    anello.scale.setScalar(0.6 + onda * 2.2); anello.material.opacity = 0.7 * (1 - onda);
  }
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
    const H = SC ? SC.H : 0;
    const g = new T.Group(); g.position.set(x, H, z); mondo.add(g);
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
    marcati.push(etichetta("nome uff", "📽️ Sala riunioni · clicca lo schermo", new T.Vector3(x, HV + 0.55 + H, z - LD / 2)));
  }
  function brindisi(chiave) {
    momento("capo:" + chiave, "brindisi", 7);
    for (const [id, g] of gruppoDi) if (g === chiave) momento(id, "brindisi", 7);
    if (chiave !== "r:capo") momento("capo:r:capo", "applauso", 7);
  }
  // operai: entrano dalla porta, vanno al posto, lavorano (costruiscono o smontano) ed escono di nuovo dalla porta
  const VEL_OPERAI = 2.8, FILA = 0.9, arrivoFatto = new Set();
  function squadra(id, posti) {
    return posti.map(([ox, oz, r], i) => {
      const o = omino({ id: "operaio" + id + i }, mondo, ox, oz, "operaio");
      o.userData.posto = [ox, oz, r]; o.visible = false;
      for (const l of o.userData.sedute) l.visible = false;
      for (const l of o.userData.gambe) l.visible = true;
      return o;
    });
  }
  function apriCantiere(id, parti, om, x, z, ufficio) {
    const inizio = cantieri.get(id);
    if (inizio == null) return;
    const operai = squadra(id, ufficio ? [[x - 1.0, z, 0], [x + 1.0, z, 0]] : [[x - 1.25, z, -Math.PI / 2], [x + 1.25, z, Math.PI / 2]]);
    const et = etichetta("f3d", "🔨 Lavori in corso", new T.Vector3(x, 2.3, z));
    marcati.push(et);
    if (om) om.userData.idArrivo = id;
    lavori.push({ id, parti, om, operai, durata: DURATA_CANTIERE, et, x, z });
  }
  // thread chiuso: l'omino prende lo scatolone, saluta ed esce dalla porta; solo dopo entrano gli operai a smontare
  const chiusi = new Map(), chiusiFatti = new Set(), ultimeSessioni = new Map();
  function fineChiusura(id) { if (!chiusi.has(id)) return; chiusi.delete(id); usciti.delete(id); if (ultimiDati) costruisci(...ultimiDati); }
  function chiudi(id, c) {
    chiusi.set(id, { ...c, inizio: performance.now() / 1000 }); chiusiFatti.add(id);
    setTimeout(() => fineChiusura(id), 240000);                          // sicurezza, se qualcosa si incastra
  }
  function apriSmontaggio(id, parti, x, z) {
    const operai = squadra(id, [[x - 1.25, z, -Math.PI / 2], [x + 1.25, z, Math.PI / 2]]);
    const et = etichetta("f3d", "🔧 Smontaggio", new T.Vector3(x, 2.3, z));
    et.e.style.visibility = "hidden"; marcati.push(et);
    lavori.push({ id, parti, om: null, operai, durata: 11, et, x, z, smonta: true });
  }
  function avviaPostino(id) {
    const b = bersagli.get(id);
    if (!b || !gioc) return;
    const [lx, lz] = gioc.casa; let punti, verso;
    if (b.ufficio) {                                                     // un sottoagente: va proprio da lui, accanto alla sedia
      const c = b.dz - 0.95, sx_ = b.dx + 0.6, sz_ = c + 0.5;
      punti = [[lx, lz, 0.6], [lx, c, 0], [sx_, c, 0], [sx_, sz_, 3.0, "consegna"], [sx_, c, 0], [lx, c, 0], [lx, lz, 0.3]];
      verso = Math.atan2(-(b.dx - sx_), -(b.dz - sz_));
    } else if (b.scala && SC) {                                          // il capo: su per la scala del soppalco
      const r = suDalCapo(lx, b.via, b, 2.4, "consegna");
      punti = [[lx, lz, 0.6], ...r.andata, ...r.ritorno, [lx, lz, 0.3]];
      verso = b.verso;
    } else {                                                             // un responsabile: davanti al suo ufficio
      punti = [[lx, lz, 0.6], [lx, b.via, 0], [b.x, b.via, 0], [b.x, b.z, 2.4, "consegna"], [b.x, b.via, 0], [lx, b.via, 0], [lx, lz, 0.3]];
      verso = b.verso;
    }
    const ora = performance.now() / 1000, ultimo = postini.reduce((a, p) => Math.max(a, p.fine), 0);
    const inizio = Math.max(ora, ultimo, giocLibero);
    const iAz = punti.findIndex(q => q[3] === "consegna");
    const p = { id, punti, inizio, verso, fine: inizio + durata(punti, 1.6), auraT: inizio + durata(punti.slice(0, iAz + 1), 1.6) };
    postini.push(p);
    if (b.ufficio) avviaOrdine(b, inizio + durata(punti.slice(0, iAz + 2), 1.6));   // poi passa anche il suo responsabile
  }
  // il capo o il responsabile esce dall'ufficio, va accanto alla scrivania dell'omino, gesticola e torna a sedersi
  function avviaOrdine(dip, inizio) {
    const uf = uffici.get(dip.ufficio);
    if (!uf || ordini.some(o => o.chiave === dip.ufficio)) return;
    const { gx, gz, LW, LD, casa } = uf, porta = LW * 0.32, fuori = LD / 2 + 0.7;
    const tx = dip.dx - 1.15 - gx, tz = dip.dz - gz, via = dip.via - gz;
    const sc = dip.ufficio === "r:capo" && SC, bal = sc ? SC.zb - gz : fuori;   // il capo scende dal soppalco
    const giu = sc ? giuScala(gx, gz) : [], su = giu.slice().reverse();
    const andata = [[casa[0], casa[1], 0.7], [porta, casa[1], 0], [porta, bal, 0], ...giu, [tx, via, 0], [tx, tz, 3.4, "ordini"]];
    const punti = andata.concat([[tx, via, 0], ...su, [porta, bal, 0], [porta, casa[1], 0], [casa[0], casa[1], 0.4, "siede"]]);
    ordini.push({ chiave: dip.ufficio, punti, inizio, fine: inizio + durata(punti, 1.1) });
  }
  let primaVolta = true, centro = new T.Vector3(), larg = 20, prof = 10;

  function costruisci(sessioni, extra) {
    ultimaAttivita = performance.now();                                  // dati nuovi: si torna fluidi
    mondo.clear();
    etichette.replaceChildren();
    animati = []; marcati = []; cliccabili = []; schermi = []; camminatori = [];
    SC = null; bersagli = new Map(); uffici = new Map(); lavori = []; lampadine = []; lampadari = []; chiacchiere = []; gruppoDi = new Map();
    for (const e of effetti) e.o.parent && e.o.parent.remove(e.o); effetti = [];
    const gruppi = U.prepara(sessioni, extra);
    impostaPc(extra.pc, pcPrimaVolta);                                   // all'apertura niente animazione: si parte gia' cosi'
    const ieri = Date.now() / 1000 - 86400;                              // finito da piu' di un giorno: si chiude (scatolone e smontaggio)
    for (const gr of gruppi) gr.sessioni = gr.sessioni.filter(q => q.inUfficio || !(q.stato === "finito" && q.modificato && q.modificato < ieri));
    for (const [id, c] of chiusi) {                                       // i thread appena chiusi restano finche' non e' finito il trasloco
      const gr = gruppi.find(g => g.chiave === c.chiave); if (!gr) continue;
      const i = gr.sessioni.findIndex(q => q.id === id);
      if (i >= 0) gr.sessioni[i] = { ...gr.sessioni[i], chiude: c.inizio };
      else gr.sessioni.splice(Math.min(c.idx, gr.sessioni.length), 0, { ...c.s, chiude: c.inizio });
    }
    const capi = gruppi.filter(U.haUfficio);
    const UFF = 3.6, PASSO = 2.3;
    // 1) uffici a vetri in fila in fondo; quello del capo e' piu' grande, con tappeto persiano e finiture d'oro
    const dim = gr => gr.chiave === "r:capo" ? [5.6, 4.6] : [UFF, UFF];
    const pulito = s => (s || "").replace(/^\S*[^\w\s]\S*\s+/u, "").replace(/\s*\(.*\)$/, "");   // toglie l'emoji iniziale
    let xc = 0, profMax = UFF;
    const porte = {};
    const schedePrimaOra = new Map();
    let nResp = 0;                                                       // ordine dei capi commessa: i primi cinque hanno l'aspetto scelto
    capi.forEach((gr, i) => {
      const [LW, LD] = dim(gr), capo = gr.chiave === "r:capo";
      profMax = Math.max(profMax, LD + (capo ? 1.6 : 0));                // davanti al capo c'e' il balcone del soppalco
      const x = xc + LW / 2, z = 0;
      porte[gr.chiave] = [x - LW * 0.15, z + LD / 2 + 0.45];               // davanti al vetro, accanto all'apertura
      bersagli.set("capo:" + gr.chiave, { x: x + LW * 0.3, z: z + LD / 2 + 0.45, via: profMax / 2 + 2.2, verso: 0, scala: capo });
      xc += LW + 0.6;
      if (capo) SC = { H: 2.0, zb: LD / 2 + 1.25, zs: LD / 2 + 1.9, xl: -0.15, xt: -0.6, xb: -3.4, zp: profMax / 2 + 2.2,
                       x0: -9.9, x1: LW + 0.2, z0: -LD / 2 - 0.25, z1: LD / 2 + 1.5 };
      const alto = capo ? SC.H : 0;
      const g = new T.Group(); g.position.set(x, alto, z); mondo.add(g);
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
      { const sat = new T.Mesh(geo, new T.MeshStandardMaterial({ color: lin("#ffffff"), transparent: true, opacity: 0.55, roughness: 0.9 }));
        sat.scale.set(LW * 0.62, 0.32, 0.07); sat.position.set(-LW * 0.19, 1.15, LD / 2); g.add(sat);       // fascia satinata
        tondo(LW * 0.62, 0.03, 0.075, capo ? "#e3b23c" : "#f28c28", -LW * 0.19, 1.0, LD / 2, g, 0.01); }
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
      const s = { id: "capo:" + gr.chiave, stato, colore: gr.colore, modello: capo ? null : nResp++ };
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
        const pos = new T.Vector3(x, 1.85 + alto, z - 0.6);
        capoOm.userData.etichetta = { pos, base: [x, z] };
        marcati.push(etichetta("f3d st-aspetta", "📞", pos, "Ti sta chiamando: aspetta una tua risposta"));
      }
      schermi.push({ mesh: scr.userData.schermo, s });
      const link = gr.link || (gr.s0 && gr.s0.link);
      cliccabili.push({ obj: g, apri: () => link && apriLink(link) });
      const sc = gr.scheda;
      marcati.push(etichetta("nome uff", U.nomeIsola(gr), new T.Vector3(x, HV + 0.55 + alto, z - LD / 2)));
      marcati.push(etichetta("riep" + (stato === "aspetta" ? " chiama" : ""), U.riepilogo(gr).split("\n").slice(0, stato === "aspetta" ? 3 : 2).map(r => U.corto(r, 18)).join("\n"), new T.Vector3(x, 0.05 + alto, z + LD / 2 + (capo ? 0.3 : 0.9)),
        sc ? [sc.fatto && "Fatto: " + sc.fatto, sc.in_corso && "In corso: " + sc.in_corso, sc.aspetta && "Aspetta: " + sc.aspetta].filter(Boolean).join("\n\n") : ""));
    });
    // 2) open space davanti: un'isola per gruppo, scrivanie in fila; ogni fila centrata sotto gli uffici
    const isole = gruppi.map(gr => ({ gr, fuori: gr.sessioni.filter(q => !q.inUfficio) })).filter(q => q.fuori.length);
    const largUffici = Math.max(UFF, xc - 0.6), mezzo = largUffici / 2;
    salaRiunioni(-0.6 - 2.8, 0);                                         // a sinistra dell'ufficio del capo
    if (SC) soppalco();
    const rigaMax = Math.max(4, Math.floor(largUffici / PASSO));
    const file = [[]];
    let usate = 0;
    // i colleghi degli altri progetti (Ufficio virtuale, KUKA, GX Works) stanno a parte, in un open space tutto loro
    const aParte = isole.filter(q => q.fuori.some(s => s.fisso || s.altro_progetto));
    for (const q of isole) {
      if (aParte.includes(q)) continue;
      if (usate && usate + q.fuori.length > rigaMax) { file.push([]); usate = 0; }
      file[file.length - 1].push(q); usate += q.fuori.length;
    }
    if (aParte.length) { const fa = [...aParte]; fa.aParte = true; file.push(fa); }
    let z0 = profMax / 2 + 5.3, xPrima = null, zPrima = 0;
    corridoioPrimo = z0 - 1.75; xDestra = 0; let fineFile = mezzo;
    for (const fila of file) {
      if (!fila.length) continue;
      const w = fila.reduce((n, q) => n + q.fuori.length * PASSO, 0) + (fila.length - 1) * 0.8;
      let x0 = mezzo - w / 2, cx = mezzo;
      if (!fila.aParte && xPrima == null) { xPrima = x0; zPrima = z0; }
      if (fila.aParte) {                                                 // open space a parte: moquette, fioriere basse e cartello
        if (xPrima != null) { cx = xPrima - 1.8 - (w + 2.2) / 2; z0 = zPrima + 0.6; x0 = cx - w / 2; }   // a sinistra della prima fila, dove c'era spazio vuoto
        else z0 += 1.2;
        const W = w + 2.2, zc = z0 + 0.1, D = 5.6;
        const mq = tondo(W, 0.02, D, "#c9d3df", cx, 0, zc, mondo, 0.05, { roughness: 1 }); mq.castShadow = false;
        tondo(W + 0.12, 0.012, D + 0.12, "#f28c28", cx, 0, zc, mondo, 0.05);
        const fioriera = (cx, cz, lw, ld) => {
          tondo(lw, 0.42, ld, "#5a6170", cx, 0, cz, mondo, 0.06);
          const n = Math.max(1, Math.round(Math.max(lw, ld) / 0.55));
          for (let i = 0; i < n; i++) {
            const f = (i + 0.5) / n - 0.5;
            palla(0.2, i % 2 ? "#5fae6e" : "#4f9a5e", cx + f * (lw > ld ? lw : 0), 0.55, cz + f * (ld > lw ? ld : 0), mondo, 1.1, 0.8, 1.1);
          }
        };
        fioriera(cx, zc + D / 2 - 0.2, W - 0.6, 0.3);                  // davanti
        for (const sx_ of [-1, 1]) fioriera(cx + sx_ * (W / 2 - 0.2), zc + 0.9, 0.3, D - 2.4);   // ai lati, il dietro resta aperto
        marcati.push(etichetta("nome uff", "🧪 Open space altri progetti", new T.Vector3(cx, 0.05, zc + D / 2 + 0.35)));
      }
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
          if (s.chiude != null) apriSmontaggio(s.id, [scr, sd], x, z0 - 0.3);
          if (om) {
            animati.push(om); camminatori.push(om); om.userData.corridoio = z0 - 1.75;
            om.userData.porta = (gr.chiave === "r:capo" || !porte[gr.chiave]) && SC ? [SC.xb - 0.55, SC.zp - 0.45] : porte[gr.chiave] || porte["r:capo"] || null;   // i thread senza responsabile vanno dal capo
            gruppoDi.set(s.id, gr.chiave); om.userData.via = profMax / 2 + 2.2;
            bersagli.set(s.id, { dx: x, dz: z0 - 0.8, via: profMax / 2 + 2.2,
              ufficio: uffici.has(gr.chiave) ? gr.chiave : uffici.has("r:capo") ? "r:capo" : null });
          }
          schermi.push({ mesh: scr.userData.schermo, s: presente ? s : { stato: "spento" } });
          const apri = () => s.link ? apriLink(s.link) : s.fisso ? null : window.open("/chat?id=" + encodeURIComponent(s.id), "chat-" + s.id);
          cliccabili.push({ obj: scr, apri });
          if (presente) {
            const [ic, testo] = U.testoFumetto(s);
            marcati.push(etichetta("f3d st-" + (s.download ? "allarme" : s.stato.replace("?", "")),
              ic + " " + U.corto(testo, s.stato === "aspetta" ? 40 : 30), om.userData.etichettaPos = new T.Vector3(x, 1.95, z0 - 0.8), s.titolo));
          }
          const tg = U.targa(s) || U.corto((s.titolo || "").replace(/^.*?›\s*/, ""), 18);
          if (tg) {
            const et = etichetta("tg3d", (s.cloud ? "☁️ " : "") + tg, new T.Vector3(x, 0.05, z0 + 1.5), s.titolo + (s.prossimo ? "\n➡️ " + s.prossimo : ""));
            if (s.prossimo && s.stato !== "finito") {                   // prossimo passo, scritto da Agente TIA, sotto la targa
              const d = document.createElement("div"); d.className = "pross"; d.textContent = "➡️ " + U.corto(s.prossimo, 40); et.e.append(d);
            }
            marcati.push(et);
          }
        });
        x0 += wi + 0.8;
      }
      fineFile = Math.max(fineFile, x0);
      z0 += 4.4;
    }
    salaRelax(fineFile + 1.4, (SC ? SC.zp : profMax / 2 + 2.2) + 1.1);   // sala relax a destra delle file: ci vanno tutti, ogni tanto
    // pavimento e pareti attorno a tutto
    const bb = new T.Box3().setFromObject(mondo);
    const size = bb.getSize(new T.Vector3()), mid = bb.getCenter(new T.Vector3());
    const pav = box(size.x + 6, 0.1, size.z + 4, "#ffffff", mid.x, -0.1, mid.z - 1, mondo, { roughness: 0.55 });   // davanti solo 1 m di margine
    pav.castShadow = false;
    { const tx = texParquet().clone(); tx.needsUpdate = true; tx.repeat.set((size.x + 6) / 1.8, (size.z + 4) / 1.8);
      pav.material = new T.MeshStandardMaterial({ map: tx, roughness: 0.55 }); }
    box(size.x + 6, 3, 0.2, "#f4efe6", mid.x, 0, bb.min.z - 3);          // parete di fondo calda
    box(size.x + 6, 1.05, 0.06, "#8fa58c", mid.x, 0, bb.min.z - 2.88);    // boiserie verde salvia
    box(size.x + 6, 0.05, 0.1, "#e3b23c", mid.x, 1.05, bb.min.z - 2.87, mondo, { metalness: 0.5, roughness: 0.35 });   // filo ottone
    box(size.x + 6, 0.2, 0.22, "#6f8a6c", mid.x, 0, bb.min.z - 2.85);     // battiscopa
    for (let i = 0; i < Math.max(1, Math.floor(size.x / 6)); i++) {        // finestre
      const fx = bb.min.x + 3 + i * 6;
      if (i % 2) {                                                       // fra le finestre: pannelli fonoassorbenti in feltro
        [["#f28c28", -0.55, 2.35], ["#5a6170", 0, 2.55], ["#d9cbb5", 0.55, 2.35], ["#5a6170", -0.28, 1.9], ["#f28c28", 0.28, 1.9]]
          .forEach(([c, dx, y]) => tondo(0.46, 0.4, 0.05, c, fx + 3 + dx, y, bb.min.z - 2.86, mondo, 0.08, { roughness: 1 }));
      }
      tondo(2.5, 1.4, 0.06, "#ffffff", fx, 1.15, bb.min.z - 2.88, mondo, 0.05);
      const v = box(2.2, 1.1, 0.06, "#7cc0ea", fx, 1.3, bb.min.z - 2.86, mondo, {});
      v.material = new T.MeshBasicMaterial({ color: new T.Color("#9fd4f2").convertSRGBToLinear() });
    }
    centro.copy(mid); larg = size.x + 1; prof = size.z + 2;
    // parete di sinistra con la porta d'ingresso: da qui si entra (con la 24 ore) e si esce (cappotto o scatolone)
    const xm = bb.min.x - 3, zp = profMax / 2 + 2.2, zb = bb.min.z - 3, zf = zp + 2.2, LP = 1.3;
    box(0.2, 3, zp - LP / 2 - zb, "#efe8dc", xm, 0, (zb + zp - LP / 2) / 2);
    box(0.2, 3, zf - zp - LP / 2, "#efe8dc", xm, 0, (zf + zp + LP / 2) / 2);
    box(0.2, 0.7, LP, "#efe8dc", xm, 2.3, zp);                             // architrave
    for (const [za, zb_] of [[zb, zp - LP / 2], [zp + LP / 2, zf]]) {        // boiserie anche qui
      box(0.06, 1.05, zb_ - za, "#8fa58c", xm + 0.12, 0, (za + zb_) / 2);
      box(0.1, 0.05, zb_ - za, "#e3b23c", xm + 0.13, 1.05, (za + zb_) / 2, mondo, { metalness: 0.5, roughness: 0.35 });
    }
    for (const dz of [-LP / 2, LP / 2]) box(0.3, 2.35, 0.1, "#6b3d22", xm, 0, zp + dz);   // stipiti
    box(0.3, 0.1, LP + 0.1, "#6b3d22", xm, 2.3, zp);
    const cartello = box(0.06, 0.24, 0.62, "#21a35b", xm + 0.14, 2.42, zp);   // cartello verde di uscita
    cartello.material = new T.MeshBasicMaterial({ color: lin("#2fbf6d") });
    porta = new T.Group(); porta.position.set(xm, 0, zp - LP / 2 + 0.03); mondo.add(porta);   // cardine
    tondo(0.08, 2.25, LP - 0.08, "#9a6233", 0, 0, (LP - 0.08) / 2, porta, 0.03);
    tondo(0.1, 0.9, LP - 0.4, "#b07a45", 0.02, 0.9, (LP - 0.08) / 2, porta, 0.03);   // pannello
    palla(0.06, "#e3b23c", 0.08, 1.05, LP - 0.25, porta, 1, 1, 1, { metalness: 0.7 });
    portaPos = new T.Vector3(xm, 0, zp);
    box(0.05, 0.22, 0.14, "#f4f1ea", xm + 0.12, 1.15, zp - 1.0);          // interruttore della luce
    box(0.04, 0.08, 0.05, "#c9c3b6", xm + 0.15, 1.22, zp - 1.0);
    ingresso = [xm - 0.3, zp];
    arreda(bb, xm, zp, zb);
    // il controllore: senza scrivania, fa avanti e indietro per tutto l'ufficio e controlla tutti
    {
      const o = omino({ id: "controllore" }, mondo, xm + 1, zp, "controllore");
      for (const l of o.userData.sedute) l.visible = false;
      for (const l of o.userData.gambe) l.visible = true;
      const punti = [[xm + 1, zp, 0]];
      if (SC && ufficioCtrl) {                                            // prima sale nel suo ufficietto a scrivere il rapporto
        const su = [[SC.xb, zp, 0], ...suScala().slice(1)], c = ufficioCtrl, bal = [[c.porta, SC.zb, 0], [c.porta, c.z + 0.6, 0]];
        punti.push(...su, ...bal, [c.x, c.z, 7, "scrive", 0], ...bal.slice().reverse(), ...su.slice().reverse());
      }
      for (const [k, uf] of [...uffici].sort((a, b) => a[1].gx - b[1].gx))    // davanti a ogni ufficio (quello del capo e' di sopra)
        if (!(SC && k === "r:capo")) punti.push([uf.gx, zp, 0], [uf.gx, uf.gz + uf.LD / 2 + 0.5, 1.6, "guarda", 0]);
      const dips = animati.map(c => c.userData).filter(u => u.corridoio != null && u.caffe).sort((a, b) => a.corridoio - b.corridoio || a.casa[0] - b.casa[0]);
      let zc = null;
      for (const u of dips) {                                             // dietro le sedie di ogni fila
        const [x] = u.casa, gx = x - PASSO / 2;
        if (u.corridoio !== zc) { const ul = punti[punti.length - 1]; punti.push([gx, ul[1], 0], [gx, u.corridoio, 0]); zc = u.corridoio; }
        const sx_ = x + 0.6, sz_ = u.corridoio + 0.5;                       // accanto alla sedia, girato verso di lui
        punti.push([sx_, u.corridoio, 0], [sx_, sz_, 3.2, "sgrida", Math.atan2(-(u.casa[0] - sx_), -(u.casa[1] - sz_))], [sx_, u.corridoio, 0]);
      }
      const ul = punti[punti.length - 1];
      punti.push([ul[0] + PASSO / 2, ul[1], 0], [ul[0] + PASSO / 2, zp, 0]);
      const iSc = punti.findIndex((p, i) => i > 1 && p[0] === SC?.xb && p[1] === zp);   // al ritorno non risale
      const ritorno = punti.slice(iSc > 0 ? iSc + 1 : 1, -1).reverse().map(p => [p[0], p[1], 0]);
      ispettore = { o, punti: [...punti, ...ritorno, [xm + 1, zp, 0]] };
      ispettore.nuvola = etichetta("f3d", "X#?%$£!!!", new T.Vector3()); ispettore.nuvola.e.style.visibility = "hidden"; marcati.push(ispettore.nuvola);
      ispettore.durata = durata(ispettore.punti, 1.3);
      creaGiocatore(xm + 2.9, zp + 3.9);                                     // angolo PlayStation vicino all'ingresso
      creaSegretaria();
    }
    const ora = new Map(schermi.map(q => [q.s.id, q.s.stato]));
    const primaVoltaDati = statiPrima.size === 0;
    let nuovi = false;
    for (const [id, st] of ora) {
      if (!id || primaVoltaDati || chiusi.has(id) || postini.some(p => p.id === id)) continue;
      const prima = statiPrima.get(id), attivo = ["lavora", "pensa", "supervisore"].includes(st);
      // risposta di Stefano (aspetta -> lavora), nuovo compito (finito/fermo -> lavora) o thread nuovo che parte
      if (prima === undefined) { arrivoFatto.delete(id); cantieri.set(id, performance.now() / 1000); nuovi = true; continue; }
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
      if (er > 0) incarico("ko", s.id, "❌ " + er + (er === 1 ? " errore" : " errori"), "#e03131");   // la segretaria porta la cartellina rossa
    }
    disegnaLavagna();
    for (const { s } of schermi) {                                        // progetto TIA aperto da un agente: la segretaria gli porta la cartellina
      if (!s.id || !s.progetto_tia) continue;
      const prima = tiaPrima.get(s.id); tiaPrima.set(s.id, s.progetto_tia);
      if (prima !== s.progetto_tia && !primaVoltaDati && bersagli.has(s.id))
        incarico("cartellina", s.id, "📁 " + U.corto(String(s.progetto_tia).replace(/\.ap\d+$/i, ""), 22), "#3b82f6");
      if (s.download && !downPrima.has(s.id) && !primaVoltaDati) incarico("allarme", null, "🚨 Download su PLC!", "#e03131");
      if (s.download) downPrima.add(s.id); else downPrima.delete(s.id);
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
  let tSemplice = -10;
  // a riposo: dopo 60 s senza dati nuovi e senza che Stefano tocchi la pagina, 5 fotogrammi al secondo
  var ultimaAttivita = performance.now();
  const sveglia = () => { ultimaAttivita = performance.now(); };
  for (const ev of ["pointermove", "pointerdown", "wheel", "keydown"]) window.addEventListener(ev, sveglia, { passive: true });
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
  // arredo: corridoi con le guide, armadi, libreria, stampante, boccione d'acqua, quadri, bacheca, orologio, appendiabiti, piante
  function arreda(bb, xm, zp, zb) {
    const xr = bb.max.x + 2.2, x1 = xm + 0.3, x2 = bb.max.x + 2.9;
    const guida = (xa, xb, z, w) => {                                    // passatoia del corridoio, con il bordo
      tondo(xb - xa, 0.012, w + 0.12, "#f28c28", (xa + xb) / 2, 0, z, mondo, 0.02);
      const g = tondo(xb - xa - 0.1, 0.02, w, "#5a6170", (xa + xb) / 2, 0, z, mondo, 0.02, { roughness: 1 });
      g.castShadow = false;
    };
    guida(x1, x2, zb + 1.55, 1.1);                                       // corridoio dietro gli uffici
    guida(x1, x2, zp, 1.3);                                              // corridoio davanti, dalla porta
    // lungo la parete di fondo: librerie e armadi, quadri e bacheca sopra
    const libri = ["#d9534f", "#5c9ee6", "#f0ad4e", "#5cb85c", "#a283e3", "#4fc1bd", "#e8dcc4"];
    const zw = zb + 0.45;
    for (let x = bb.min.x + 6, i = 0; x < bb.max.x; x += 6, i++) {
      if (i % 2 === 0) {                                                 // libreria
        tondo(1.7, 1.25, 0.42, "#8a5a2b", x, 0, zw, mondo, 0.03);
        for (let r = 0; r < 2; r++) for (let j = 0; j < 7; j++) {
          const h = 0.32 + ((i + j * 3 + r) % 3) * 0.05;
          box(0.16, h, 0.3, libri[(i + j + r * 2) % libri.length], x - 0.6 + j * 0.2, 0.12 + r * 0.56, zw + 0.08);
        }
      } else {                                                           // armadi a cassetti
        for (let j = 0; j < 3; j++) {
          tondo(0.55, 1.15, 0.5, "#9aa3b0", x - 0.6 + j * 0.6, 0, zw + 0.02, mondo, 0.03, { metalness: 0.3 });
          for (let c = 0; c < 3; c++) box(0.2, 0.05, 0.04, "#596273", x - 0.6 + j * 0.6, 0.25 + c * 0.33, zw + 0.28);
        }
      }
      const q = new T.Group(); q.position.set(x, 1.95, zb + 0.12); mondo.add(q);   // quadro
      tondo(1.3, 0.85, 0.06, "#6b3d22", 0, -0.42, 0, q, 0.02);
      const tela = box(1.12, 0.67, 0.02, "#ffffff", 0, -0.335, 0.04, q);
      tela.material = new T.MeshBasicMaterial({ color: lin(["#f2c14e", "#7cc0ea", "#e57a8a", "#8fd19e"][i % 4]) });
      palla(0.18, ["#e8603c", "#2f6fb0", "#ffffff", "#3b7d4f"][i % 4], -0.2 + (i % 3) * 0.2, 0, 0.06, q, 1, 1, 0.2);
    }
    const bach = new T.Group(); bach.position.set(xm + 1.9, 1.35, zb + 0.12); mondo.add(bach);   // bacheca con i foglietti
    tondo(1.5, 1.0, 0.05, "#b88a5a", 0, 0, 0, bach, 0.02);
    ["#fff27a", "#ffb3c1", "#a7e3ff", "#ffffff", "#c8f7a6", "#fff27a"].forEach((c, j) =>
      box(0.32, 0.28, 0.02, c, -0.48 + (j % 3) * 0.48, 0.14 + Math.floor(j / 3) * 0.42, 0.04, bach));
    const or = new T.Group(); or.position.set(xm + 1.9, 2.75, zb + 0.13); mondo.add(or);   // orologio
    const qd = new T.Mesh(new T.CylinderGeometry(0.28, 0.28, 0.05, 24), m("#ffffff")); qd.rotation.x = Math.PI / 2; or.add(qd);
    const bordo = new T.Mesh(new T.TorusGeometry(0.28, 0.035, 8, 24), m("#2b2b33")); or.add(bordo);
    box(0.03, 0.17, 0.02, "#2b2b33", 0, 0, 0.04, or); const lancetta = box(0.025, 0.22, 0.02, "#d9534f", 0, 0, 0.05, or);
    lancetta.geometry = lancetta.geometry; or.userData.lancetta = lancetta; orologio = or;
    // vicino alla porta: appendiabiti con cappotti e portaombrelli
    const ax = xm + 0.55, az = zp + 1.5;
    tondo(0.06, 1.85, 0.06, "#5b3a22", ax, 0, az, mondo, 0.02);
    palla(0.2, "#3b3b3b", ax, 0.02, az, mondo, 1, 0.15, 1);
    for (const [dx, dz, c] of [[0.12, 0, "#7a4b8a"], [-0.1, 0.06, "#c0763b"], [0, -0.12, "#3d5a80"]]) {
      palla(0.035, "#5b3a22", ax + dx, 1.8, az + dz, mondo);
      palla(0.17, c, ax + dx * 1.5, 1.45, az + dz * 1.5, mondo, 1, 2.1, 0.8);
    }
    tondo(0.3, 0.45, 0.3, "#2f6fb0", ax + 0.5, 0, az + 0.2, mondo, 0.06);
    tondo(0.03, 0.75, 0.03, "#e0303a", ax + 0.47, 0.3, az + 0.18, mondo, 0.01);
    // angolo a destra: stampante, boccione dell'acqua, armadio alto
    tondo(1.1, 0.75, 0.6, "#c9b28d", xr, 0, 1.0, mondo, 0.03);
    tondo(0.7, 0.32, 0.5, "#e9edf2", xr, 0.75, 1.0, mondo, 0.05);
    box(0.5, 0.03, 0.34, "#ffffff", xr, 1.07, 1.05);
    palla(0.03, "#2fbf6d", xr + 0.26, 0.98, 1.27, mondo, 1, 1, 1, { emissive: "#2fbf6d", emissiveIntensity: 1 });
    tondo(0.42, 0.95, 0.42, "#f3f0ea", xr, 0, 3.0, mondo, 0.05);
    const acqua = new T.Mesh(new T.CylinderGeometry(0.19, 0.19, 0.5, 16), new T.MeshStandardMaterial({ color: lin("#8fd3ff"), transparent: true, opacity: 0.6, roughness: 0.1 }));
    acqua.position.set(xr, 1.2, 3.0); mondo.add(acqua);
    tondo(0.8, 2.0, 0.55, "#9aa3b0", xr, 0, -1.2, mondo, 0.04, { metalness: 0.3 });
    box(0.02, 1.8, 0.02, "#596273", xr - 0.02, 0.1, -0.93);
    // piante alte lungo il corridoio davanti, fra gli uffici e le scrivanie
    for (let px = x1 + 3.5; px < x2 - 2; px += 7.5) {
      const pz = zp + 1.05;
      tondo(0.42, 0.55, 0.42, "#e9e4da", px, 0, pz, mondo, 0.1);
      tondo(0.04, 0.8, 0.04, "#6b4a2b", px, 0.5, pz, mondo, 0.015);
      for (const [dx, dy, dz, r] of [[0, 1.45, 0, 0.3], [0.17, 1.2, 0.06, 0.22], [-0.15, 1.3, -0.08, 0.22], [0.05, 1.7, -0.1, 0.18]])
        palla(r, dy > 1.4 ? "#4f9a5e" : "#3f8a50", px + dx, dy, pz + dz, mondo, 1.15, 0.9, 1.15);
    }
    // piante grandi negli angoli
    for (const [px, pz] of [[x1 + 0.4, zb + 0.6], [x2 - 0.4, zb + 0.6], [x2 - 0.4, bb.max.z + 0.5], [x1 + 0.4, bb.max.z + 0.5], [xr, 6]]) {
      tondo(0.5, 0.5, 0.5, "#c0763b", px, 0, pz, mondo, 0.12);
      palla(0.38, "#5fae6e", px, 0.9, pz, mondo, 1, 1.3, 1);
      palla(0.26, "#7cc98a", px + 0.15, 1.3, pz - 0.05, mondo);
      palla(0.22, "#93d6a0", px - 0.12, 1.15, pz + 0.12, mondo);
    }
  }
  function versoCasa(u, conLuce) {                                   // dalla porta alla propria sedia (coordinate del suo gruppo)
    const [ix, iz] = ingresso, uf = u.chiave && uffici.get(u.chiave);
    const ox = uf ? uf.gx : 0, oz = uf ? uf.gz : 0, L = (x, z, p, a) => [x - ox, z - oz, p, a];
    const pt = [L(ix, iz, 0)];
    if (conLuce && portaPos) pt.push(L(portaPos.x + 0.5, portaPos.z - 1.0, 1.8, "luce"));   // il primo accende la luce
    if (uf) { const { LW, LD, casa } = uf, px = LW * 0.32, fuori = LD / 2 + 0.7;
      const sc = u.chiave === "r:capo" && SC;
      return [...pt, ...(sc ? suScala(ox, oz) : []), [px, sc ? SC.zb - oz : fuori, 0], [px, casa[1], 0], [casa[0], casa[1], 0.6, "siede"]]; }
    const [x, z] = u.casa;
    return [...pt, [x, u.via, 0], [x, u.corridoio, 0], [x, z, 0.6, "siede"]];
  }
  function versoPorta(u) {
    const r = versoCasa(u, false).reverse().map(p => [p[0], p[1], 0]);
    r[0][2] = 1.4; r[0][3] = "saluta"; return r;
  }
  function giroUscita(u) {                                           // la sera: cappotto, saluta e va all'ingresso
    const [x, z] = u.casa, c = u.corridoio, [ix, iz] = ingresso;
    return [[x, z, 1.8, "saluta"], [x, c, 0], [x, u.via, 0], [ix, iz, 0]];
  }
  function giroPasseggio(u) {                                        // il capo fa il giro dell'open space, mani dietro la schiena
    const uf = uffici.get(u.chiave); if (!uf) return null;
    const { gx, gz, LW, LD, casa } = uf, porta = LW * 0.32, fuori = LD / 2 + 0.7;
    const c = corridoioPrimo - gz, xb = xDestra + 1.2 - gx;
    const sc = u.chiave === "r:capo" && SC, bal = sc ? SC.zb - gz : fuori, giu = sc ? giuScala(gx, gz) : [], su = giu.slice().reverse();
    const xa = sc ? SC.xb - gx : Math.max(porta, 0);
    return [[casa[0], casa[1], 0.7], [porta, casa[1], 0], [porta, bal, 0], ...giu, [xa, c, 0], [xb, c, 1.5, "guarda"],
            [xa, c, 0], ...su, [porta, bal, 0], [porta, casa[1], 0], [casa[0], casa[1], 0.4, "siede"]];
  }
  function giroCaffe(u) {                                            // dalla sedia alla sala relax e ritorno, passando dietro le sedie
    const p = postoRelax(); if (!p) return null;
    const [x, z] = u.casa, c = u.corridoio, r = versoRelax(x, c, p, 0, 0, 1.1, 0.7);
    u.relaxPosto = p; if (p.lato != null) u.lato = p.lato;
    return [[x, z, 0.7], ...r.andata, ...r.ritorno, [x, z, 0.4, "siede"]];
  }
  function giroRelaxCapo(u) {                                        // anche capo e responsabili, ogni tanto, si prendono una pausa
    const uf = uffici.get(u.chiave), p = uf && postoRelax(); if (!p) return null;
    const { gx, gz, LW, LD, casa } = uf, porta = LW * 0.32, fuori = LD / 2 + 0.7, sc = u.chiave === "r:capo" && SC;
    const bal = sc ? SC.zb - gz : fuori, giu = sc ? giuScala(gx, gz) : [], via = relax.zp - gz;
    const xa = sc ? SC.xb : gx + porta;
    const inizio = [[casa[0], casa[1], 0.7], [porta, casa[1], 0], [porta, bal, 0], ...giu];
    const r = versoRelax(xa, via + gz, p, gx, gz, 1.1, durata(inizio, 1.1));
    u.relaxPosto = p; if (p.lato != null) u.lato = p.lato;
    return [...inizio, ...r.andata, ...r.ritorno, ...giu.slice().reverse(), [porta, bal, 0], [porta, casa[1], 0], [casa[0], casa[1], 0.4, "siede"]];
  }
  function anima(ms) {
    requestAnimationFrame(anima);
    // fluido ma leggero: punta a 40 fotogrammi al secondo; se il PC fatica scende da solo a 30 o 24
    const passo = ms - ultimaAttivita > 60000 ? 5 : fps;
    if (!attivo || document.hidden || ms - ultimo < 1000 / passo - 2) return;
    ultimo = ms; t = ms / 1000;
    const inizioFrame = performance.now();
    const dt = Math.min(0.1, t - tPrec || 0.04); tPrec = t;
    const eSera = sera(), eVen = venerdi();
    // luce della stanza: con \pc off si spegne subito; con \pc on si riaccende quando il primo arriva all'interruttore
    const pcL = pc === "off" ? 1 - Math.min(1, Math.max(0, (t - pcT - 1.2) / 1.2)) : Math.min(1, Math.max(0, (t - pcT - 3.2) / 0.4));
    pcLuce = pcL; const buio = 1 - pcL;
    cielo.intensity = ((eSera ? 0.3 : 0.55) * pcL + 0.12 * buio) * LUCE; sole.intensity = ((eSera ? 0.5 : 1.35) * pcL + 0.06 * buio) * LUCE;
    scena.background.set(buio > 0.5 ? "#1a2034" : eSera ? "#4f5f86" : "#cfe6f5").convertSRGBToLinear();
    for (const l of lampadine) l.material.emissiveIntensity = eSera || buio > 0.5 ? 1.8 : 0.2;   // le lampade delle scrivanie restano accese
    for (const l of lampadari) l.material.emissiveIntensity = eSera || buio > 0.5 ? 2.2 : 0.05;
    for (const c of chiacchiere) c.alCaffe = [];
    if (relax) {                                                          // TV accesa, calcio balilla che va se giocano in due
      relax.tv.material.color.setHSL((t * 0.07) % 1, 0.55, 0.55 + Math.sin(t * 3) * 0.05);
      const due = relax.inBalilla >= 2; relax.inBalilla = 0;
      relax.pall.position.x = relax.bx - relax.pall.parent.position.x + (due ? Math.sin(t * 4.2) * 0.5 : 0);
      relax.pall.position.z = 0.55 + (due ? Math.sin(t * 7.3) * 0.2 : 0);
      relax.aste.forEach((a, i) => { a.position.z = 0.55 + (due ? Math.sin(t * 9 + i) * 0.08 : 0); });
    }
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
      const iPc = u.iPc = animati.indexOf(a), lontano = t - pcT > 900;
      if (pc === "off") {                                                 // tutti a casa: si alzano col cappotto, salutano, escono dalla porta
        if (lontano && !pcFuori.has(s.id)) { pcFuori.add(s.id); spenti.add(s.id); }
        if (pcFuori.has(s.id)) { a.visible = false; if (u.etichettaPos) nascondi(u.etichettaPos, true); continue; }
        if (t > pcT + 0.6 + iPc * 0.15) spenti.add(s.id);                  // per primo spengono il computer
        if (!(u.giro && u.giro.pc) && t > pcT + 2.5 + iPc * 0.8) u.giro = { punti: versoPorta(u), inizio: t, uscita: true, pc: true };
      } else if (pcFuori.has(s.id)) {                                     // si rientra: uno alla volta dalla porta
        const parte = pcT + (iPc === 0 ? 0 : 4 + iPc * 0.9);
        if (t < parte) { a.visible = false; if (u.etichettaPos) nascondi(u.etichettaPos, true); continue; }
        pcFuori.delete(s.id); a.visible = true; if (u.etichettaPos) nascondi(u.etichettaPos, false);
        u.giro = { punti: versoCasa(u, iPc === 0), inizio: parte, pc: true, entra: true };
      }
      if (s.chiude != null) {                                             // chiuso: esce con lo scatolone e non torna
        if (usciti.has(s.id)) { a.visible = false; if (u.etichettaPos) nascondi(u.etichettaPos, true); continue; }
        if (!(u.giro && u.giro.trasloco) && t > s.chiude + 0.8) u.giro = { punti: giroUscita(u), inizio: t, uscita: true, trasloco: true };
      }
      const vaCaffe = u.caffe && s.stato === "lavora" && s.chiude == null, vaBussare = u.porta && s.stato === "aspetta";
      if (!u.giro && (vaCaffe || vaBussare)) {
        if (u.prossimoT == null) u.prossimoT = t + u.prossimo;
        if (t > u.prossimoT) { const punti = vaCaffe ? giroCaffe(u) : giroBussa(u);
          if (punti) u.giro = { punti, inizio: t }; else u.prossimoT = t + 15 + Math.random() * 20; }
      }
      if (!u.giro && arrivi.has(u.idArrivo)) {                          // nuovo arrivato: entra dalla porta con la 24 ore
        u.giro = { punti: versoCasa(u, false), inizio: arrivi.get(u.idArrivo), arrivo: true };
      }
      if (u.chiave && !u.giro) {
        const o = ordini.find(o => o.chiave === u.chiave && t >= o.inizio && t < o.fine);
        if (o) u.giro = { punti: o.punti, inizio: o.inizio };
      }
      // (niente piu' uscita serale: chi ha finito resta a dormire sulla scrivania)
      if (s.chiude == null && usciti.has(s.id)) { usciti.delete(s.id); a.visible = true; if (u.etichettaPos) nascondi(u.etichettaPos, false); }
      // il capo, se nessuno lo chiama, ogni tanto fa un giro dell'open space
      if (u.chiave === "r:capo" && !u.giro && !u.telefonata && s.stato === "supervisore") {
        if (u.passeggioT == null) u.passeggioT = t + 40;
        if (passeggioSubito || t > u.passeggioT) {
          const punti = giroPasseggio(u);
          if (punti) u.giro = { punti, inizio: t, passeggio: true };
          u.passeggioT = t + 150; passeggioSubito = false;
        }
      }
      if (u.chiave && !u.giro && !u.telefonata && s.stato === "supervisore" && pc !== "off") {
        if (u.relaxT == null) u.relaxT = t + 70 + (U.hash(s.id) % 150);
        if (relaxSubito || t > u.relaxT) {
          const punti = giroRelaxCapo(u);
          if (punti) u.giro = { punti, inizio: t };
          u.relaxT = t + 260 + Math.random() * 200; relaxSubito = false;
        }
      }
      let pos = null;
      if (u.giro) {
        pos = lungo(u.giro.punti, t - u.giro.inizio, u.giro.uscita || u.giro.arrivo || u.giro.pc ? 2.8 : 1.1);
        if (pos.fine) {
          if (u.giro.pc && u.giro.uscita) { pcFuori.add(s.id); a.visible = false; if (u.etichettaPos) nascondi(u.etichettaPos, true); u.giro = null; continue; }
          if (u.giro.pc && u.giro.entra) spenti.delete(s.id);              // seduto: riaccende il computer
          if (u.giro.trasloco && chiusi.has(s.id) && chiusi.get(s.id).smonta == null) chiusi.get(s.id).smonta = t;   // e' uscito: tocca agli operai
          if (u.giro.uscita) { usciti.add(s.id); a.visible = false; if (u.etichettaPos) nascondi(u.etichettaPos, true); u.giro = null; continue; }
          if (u.giro.arrivo) arrivi.delete(u.idArrivo);
          u.giro = null; u.prossimoT = t + 50 + (U.hash(s.id + t) % 40); pos = null;
        }
        else if (u.telefonata && pos) pos.azione = pos.azione || null;
      } else if (u.telefonata) {
        const g = u.telefonata.giro, tot = durata(g, 0.7);
        pos = lungo(g, (t + fase) % tot, 0.7);
        pos.azione = "telefono";
      }
      if (pos) {
        inPiedi = !(pos.azione === "siede" || (pos.fermo && pos.azione === "divano") || (pos.fermo && pos.x === u.casa[0] && pos.z === u.casa[1] && !u.telefonata && !pos.azione));
        cammina = !pos.fermo;
        a.position.x = pos.x; a.position.z = pos.z;
        if (u.chiave === "r:capo" && SC) { const uf = uffici.get("r:capo"); a.position.y = quota(uf.gx + pos.x, uf.gz + pos.z) - SC.H; }
        if (pos.dir) a.rotation.y = Math.atan2(-pos.dir[0], -pos.dir[1]);
        else if (["divano", "balilla", "caffe"].includes(pos.azione) && u.relaxPosto) a.rotation.y = u.relaxPosto.ang;   // nella sala relax
        else if (["caffe", "bussa", "attende"].includes(pos.azione)) a.rotation.y = 0;      // verso la macchinetta o la porta
        else if (pos.azione === "guarda") a.rotation.y = Math.PI + Math.sin(k * 0.8) * 0.9;  // il capo controlla l'open space
        else if (pos.azione === "ordini") a.rotation.y = -Math.PI / 2;                    // guarda l'omino alla scrivania
        else if (pos.azione === "telefono") a.rotation.y = Math.PI + Math.sin(k) * 0.3;
        else a.rotation.y = Math.PI;
        if (pos.fermo && u.giro && t - u.giro.inizio < 0.7) inPiedi = true;   // si alza
      } else { a.position.x = u.casa[0]; a.position.z = u.casa[1]; a.position.y = 0; a.rotation.y = Math.PI; }
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
        if (u.giro && u.giro.arrivo) {                                   // grossa ventiquattrore nella destra
          if (!u.valigetta) { u.valigetta = new T.Group(); dx.add(u.valigetta);
            tondo(0.12, 0.42, 0.56, "#5a3420", 0, -0.98, 0, u.valigetta, 0.05);
            tondo(0.13, 0.05, 0.58, "#3b2214", 0, -0.66, 0, u.valigetta, 0.02);
            tondo(0.04, 0.1, 0.22, "#2b1a10", 0, -0.56, 0, u.valigetta, 0.02);
            for (const dz of [-0.17, 0.17]) palla(0.035, "#e3b23c", 0.07, -0.72, dz, u.valigetta, 1, 1, 1, { metalness: 0.7 }); }
          u.valigetta.visible = true; dx.rotation.set(Math.sin(k * 9) * 0.15, 0, -0.08);
        } else if (u.valigetta) u.valigetta.visible = false;
        if (u.giro && u.giro.trasloco) {                                 // scatolone tra le braccia
          if (!u.scatola) { u.scatola = new T.Group(); corpo.add(u.scatola);
            tondo(0.56, 0.4, 0.4, "#c8955a", 0, 0.62, -0.38, u.scatola, 0.03);
            tondo(0.57, 0.05, 0.1, "#e9d8a6", 0, 1.0, -0.38, u.scatola, 0.01);
            palla(0.08, "#7cc98a", 0.12, 1.06, -0.38, u.scatola);                     // le sue cose: piantina,
            tondo(0.16, 0.2, 0.03, "#e3b23c", -0.1, 0.98, -0.42, u.scatola, 0.01);       // cornice con la foto,
            tondo(0.1, 0.12, 0.1, "#e0303a", 0.02, 0.98, -0.3, u.scatola, 0.03); }       // tazza
          u.scatola.visible = true;
          if (!(pos && pos.azione === "saluta")) { sx.rotation.set(1.25, 0, 0.25); dx.rotation.set(1.25, 0, -0.25); }
        } else if (u.scatola) u.scatola.visible = false;
        if (u.giro && u.giro.uscita && !u.giro.trasloco) {
          u.giacca.visible = true;
        }
        if (pos && pos.azione === "luce") { dx.rotation.set(2.4, 0, 0.5); a.rotation.y = Math.PI / 2; }   // mano all'interruttore
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
          a.getWorldPosition(nv.pos); nv.pos.y += 2.45; nv.e.style.visibility = "";
        } else if (pos && pos.azione === "bussa") {                         // bussa sul vetro
          dx.rotation.set(1.9 + Math.max(0, Math.sin(k * 14)) * 0.35, 0, 0.15);
        } else if (pos && pos.azione === "attende") {
          sx.rotation.set(0.3, 0, 0.5); dx.rotation.set(0.3, 0, -0.5);       // mani sui fianchi, aspetta
          testa.rotation.z = Math.sin(k * 2) * 0.12;
        } else if (pos && pos.azione === "divano") {                       // sul divano a guardare la TV, mani dietro la testa
          sx.rotation.set(-2.7, 0, -0.5); dx.rotation.set(-2.7, 0, 0.5); testa.rotation.x = -0.12;
        } else if (pos && pos.azione === "balilla") {                      // calcio balilla: mani sulle manopole, colpi veloci
          const w = Math.sin(k * 13) * 0.35; sx.rotation.set(1.35 + w, 0, 0.25); dx.rotation.set(1.35 - w, 0, -0.25);
          testa.rotation.y = Math.sin(k * 5) * 0.25; relax.inBalilla++;
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
      if (u.aura) u.aura.visible = !!(mo && mo.tipo === "aura" && t >= mo.inizio && t < mo.fine && !pos);
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
        } else if (mo.tipo === "muscoli") {                              // il capo riceve il caffe' e fa i muscoli
          sx.rotation.set(0, 0, -1.6); dx.rotation.set(0, 0, 1.6);
          const fl = Math.abs(Math.sin(k * 5)); sx.rotation.x = -0.6 - fl * 0.8; dx.rotation.x = -0.6 - fl * 0.8;
          corpo.position.y += 0.03; u.sorriso.visible = true; u.bocca_o.visible = u.linea.visible = false;
        } else if (mo.tipo === "aura") {                                 // presa in carico: si trasforma con l'aura dorata fiammeggiante
          if (!u.aura) u.aura = creaAura(a);
          for (const l of u.sedute) l.visible = false;
          for (const l of u.gambe) l.visible = true;
          const tr = Math.sin(k * 40) * 0.015;                            // trema per la potenza
          corpo.rotation.set(0, 0, 0); corpo.position.set(tr, 0.04 + Math.min(fr, 0.6) * 0.1, 0);
          sx.rotation.set(0.15, 0, 0.55 + tr * 4); dx.rotation.set(0.15, 0, -0.55 - tr * 4);   // pugni stretti, braccia tese in basso
          testa.rotation.set(-0.15, 0, 0);
          u.bocca_o.visible = true; u.sorriso.visible = u.linea.visible = false;
          animaAura(u.aura, fr);
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
      if (u.etichetta && u.etichetta.y0 == null) u.etichetta.y0 = u.etichetta.pos.y;
      if (u.etichetta) u.etichetta.pos.y = u.etichetta.y0 + a.position.y;
      if (u.etichetta) { u.etichetta.pos.x = u.etichetta.base[0] + a.position.x; u.etichetta.pos.z = u.etichetta.base[1] + a.position.z; }
    }
    capoInGiro = capoVisto;
    const parla = Math.floor(t / 3.2) % 4;
    if (fascio) { const f = 0.9 + Math.sin(t * 7) * 0.05 + Math.sin(t * 13.3) * 0.05; fascio.opacity = 0.35 * f; raggi.opacity = 0.9 * f; }
    const salaPiena = pc === "on" ? t > pcT + 6 : t < pcT + 3;
    for (const o of riunione) o.visible = salaPiena;
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
    if (ispettore) {                                                       // giro di controllo continuo, mani dietro la schiena
      const { o, punti } = ispettore, u = o.userData, pos = lungo(punti, (t + (ispettore.anticipo || 0)) % ispettore.durata, 1.3);
      o.visible = pcLuce > 0.5;
      o.position.set(pos.x, quota(pos.x, pos.z), pos.z);
      const fermo = !pos.dir;
      if (pos.dir) o.rotation.y = Math.atan2(-pos.dir[0], -pos.dir[1]);
      else if (pos.azione === "guarda") { const pt = punti.find(p => p[0] === pos.x && p[1] === pos.z && p[3]); if (pt) o.rotation.y = pt[4]; }
      const w = fermo ? 0 : Math.sin(t * 8);
      u.gambe[0].rotation.x = w * 0.45; u.gambe[1].rotation.x = -w * 0.45;
      u.sx.rotation.set(-0.75, 0, 0.35); u.dx.rotation.set(-0.75, 0, -0.35);
      u.testa.rotation.set(fermo ? 0.15 : 0, fermo ? Math.sin(t * 1.5) * 0.5 : 0, 0);   // si guarda intorno
      u.corpo.position.y = fermo ? 0 : Math.abs(Math.cos(t * 8)) * 0.025;
      if (fermo) u.corpo.rotation.x = 0.08;
      else u.corpo.rotation.x = 0;
      for (const oc of u.occhi) oc.scale.y = (t % 3.5) < 0.12 ? 0.25 : 1.5;
      if (fermo && pos.azione === "scrive") {                            // chino sulla scrivania a scrivere il rapporto
        o.rotation.y = 0; u.sx.rotation.set(1.25, 0, 0.25); u.dx.rotation.set(1.3 + Math.sin(t * 18) * 0.12, 0, -0.2);
        u.testa.rotation.set(0.45, 0, 0); u.corpo.rotation.x = 0.25;
      }
      const sgrida = fermo && pos.azione === "sgrida";
      if (sgrida) {                                                      // gesticola arrabbiato con la nuvoletta di parolacce
        u.sx.rotation.set(1.5 + Math.sin(t * 10) * 1.1, 0, 0.5 + Math.sin(t * 6) * 0.4);
        u.dx.rotation.set(1.7 + Math.cos(t * 9) * 1.2, 0, -0.5 + Math.cos(t * 7) * 0.4);
        u.testa.rotation.set(Math.sin(t * 8) * 0.15, 0, Math.sin(t * 4) * 0.12);
        u.corpo.position.y = Math.abs(Math.sin(t * 5)) * 0.05; u.corpo.rotation.x = 0.12;
        o.getWorldPosition(ispettore.nuvola.pos); ispettore.nuvola.pos.y += 2.45;
      }
      ispettore.nuvola.e.style.visibility = sgrida && o.visible ? "" : "hidden";
    }
    if (orologio) { const d = new Date(); orologio.userData.lancetta.rotation.z = -(d.getMinutes() / 60) * Math.PI * 2; }   // la lancetta dei minuti gira davvero
    if (porta) {                                                          // la porta si apre quando qualcuno ci passa vicino
      let vicino = false; const w = new T.Vector3();
      for (const a of animati) { if (!a.visible || !a.userData.giro) continue; a.getWorldPosition(w); if (Math.hypot(w.x - portaPos.x, w.z - portaPos.z) < 2.2) { vicino = true; break; } }
      portaAperta += ((vicino ? 1 : 0) - portaAperta) * Math.min(1, dt * 4);
      porta.rotation.y = portaAperta * 1.45;
    }
    lavori = lavori.filter(l => {
      const t0 = l.smonta ? (chiusi.get(l.id) || {}).smonta : cantieri.get(l.id);
      if (t0 == null) {                                                   // smontaggio: aspettano che l'omino sia uscito
        for (const o of l.operai) o.visible = false; l.et.e.style.visibility = "hidden";
        for (const q of l.parti) q.scale.set(1, 1, 1);
        return true;
      }
      const [ix, iz] = ingresso;
      if (!l.cammino) {                                                   // percorsi dalla porta al posto e ritorno
        for (const o of l.operai) { const [ox, oz] = o.userData.posto;
          o.userData.andata = [[ix, iz, 0], [ox, iz, 0], [ox, oz, 0]]; o.userData.ritorno = [[ox, oz, 0], [ox, iz, 0], [ix, iz, 0]]; }
        l.cammino = Math.max(...l.operai.map((o, i) => durata(o.userData.andata, VEL_OPERAI) + i * FILA));
      }
      const tw = t0 + l.cammino, tf = tw + l.durata, tu = tf + l.cammino;
      const p = Math.min(1, Math.max(0, (t - tw) / l.durata));
      const sy = l.smonta ? Math.max(0.03, 1 - Math.floor(p * 1.15 * 6) / 6)    // smontaggio: cala a scatti
        : Math.max(0.03, Math.min(1, Math.floor(p * 1.15 * 6) / 6));      // cresce a scatti, un pezzo alla volta
      for (const q of l.parti) q.scale.set(1, sy, 1);
      l.et.e.style.visibility = t < tf ? "" : "hidden";
      if (l.om) {
        l.om.visible = p >= 1;
        const ep = l.om.userData.etichettaPos || (l.om.userData.etichetta && l.om.userData.etichetta.pos);
        const mk = ep && marcati.find(q => q.pos === ep);
        if (mk) mk.e.style.visibility = p >= 1 ? "" : "hidden";           // il pensiero compare quando arriva l'omino
        if (p >= 1 && !arrivoFatto.has(l.id)) { arrivoFatto.add(l.id); arrivi.set(l.om.userData.idArrivo, t); }   // ora arriva dalla porta
      }
      for (const [i, o] of l.operai.entries()) {
        const u = o.userData;
        if (t < tw || t >= tf) {                                          // in cammino, con il martello in spalla
          const e = (t < tw ? t - t0 : t - tf) - i * FILA;                 // in fila: uno dietro l'altro
          const pos = e < 0 ? (t < tw ? { x: ix, z: iz, fermo: true, fuori: true } : lungo(u.ritorno, 0, VEL_OPERAI))
            : t < tw ? lungo(u.andata, e, VEL_OPERAI) : lungo(u.ritorno, e, VEL_OPERAI);
          o.visible = !pos.fuori && !(t >= tf && pos.fine);
          o.position.set(pos.x, 0, pos.z);
          if (pos.dir) o.rotation.y = Math.atan2(-pos.dir[0], -pos.dir[1]);
          const w = pos.fermo ? 0 : Math.sin(t * 9 + i);
          u.gambe[0].rotation.x = w * 0.5; u.gambe[1].rotation.x = -w * 0.5;
          u.dx.rotation.set(2.6, 0, -0.2); u.sx.rotation.set(-w * 0.5, 0, 0.12);
          u.corpo.position.y = Math.abs(Math.cos(t * 9 + i)) * 0.03; u.corpo.rotation.x = 0; u.testa.rotation.x = 0;
          continue;
        }
        o.visible = true; o.position.set(u.posto[0], 0, u.posto[1]); o.rotation.y = u.posto[2];
        u.gambe[0].rotation.x = u.gambe[1].rotation.x = 0;
        const giro = t * 1.4 + i * 0.45, c = giro % 1;                      // martellate esagerate: su piano, giu' di colpo
        if (Math.floor(giro) !== u.colpi) {                                 // appena ha colpito: nuvoletta di polvere
          if (u.colpi != null) polvere(o.position.x + (l.x - o.position.x) * 0.4, 0.85, o.position.z + (l.z - o.position.z) * 0.45 + 0.3);
          u.colpi = Math.floor(giro);
        }
        const su = c < 0.65 ? 1 - Math.pow(1 - c / 0.65, 2) : 1 - Math.pow((c - 0.65) / 0.35, 3);
        const colpo = c < 0.1 ? 1 - c / 0.1 : 0;                           // appena dopo il colpo: contraccolpo
        u.dx.rotation.set(0.5 + su * 2.7, 0, -0.15);                        // dal davanti fin sopra la testa
        u.sx.rotation.set(0.9 + colpo * 0.25, 0, 0.35);                     // scalpello puntato in avanti
        u.corpo.position.y = su * 0.06 - colpo * 0.05;
        u.corpo.rotation.x = 0.12 - su * 0.18;                              // si inarca caricando, si piega colpendo
        u.testa.rotation.x = colpo * 0.25;
      }
      if (t >= tu) {
        for (const o of l.operai) mondo.remove(o);
        l.et.e.remove();
        if (l.smonta) setTimeout(() => fineChiusura(l.id), 0); else cantieri.delete(l.id);
        return false;
      }
      return true;
    });
    if (gioc) {                                                          // il ragazzo della PlayStation
      const { g, u } = gioc;
      for (const p of postini) if (!p.aura && t > p.auraT) { p.aura = true; momento(p.id, "aura", 4.5); }   // ricevuto l'ordine: si trasforma
      postini = postini.filter(p => t < p.fine + 0.5);
      let giro = postini.find(p => t >= p.inizio && t < p.fine) || (gioc.chat && t < gioc.chat.fine ? gioc.chat : null);
      if (!giro && !postini.length && pc !== "off") {
        if (gioc.prossima == null) gioc.prossima = t + 60 + Math.random() * 60;
        else if (t > gioc.prossima) { const c = chiacchieraGioc(); if (c) { gioc.chat = giro = c; giocLibero = c.fine; } gioc.prossima = t + 120 + Math.random() * 90; }
      }
      g.visible = pc !== "off" || pcLuce > 0.5;
      for (const oc of u.occhi) oc.scale.y = (t % 3) < 0.12 ? 0.25 : 1.5;
      u.sorriso.visible = true; u.bocca_o.visible = u.linea.visible = false;
      u.testa.rotation.set(0, 0, 0); u.corpo.rotation.set(0, 0, 0);
      if (giro) {
        const e = t - giro.inizio, pos = lungo(giro.punti, e, 1.6), o = Math.sin(e * 9);
        const y = quota(pos.x, pos.z); g.position.set(pos.x, y, pos.z); gioc.pos.set(pos.x, 2.0 + y, pos.z);
        if (pos.dir) g.rotation.y = Math.atan2(-pos.dir[0], -pos.dir[1]);
        else if (pos.azione) g.rotation.y = giro.verso;
        for (const l of u.sedute) l.visible = false;
        for (const l of u.gambe) l.visible = true;
        u.gambe[0].rotation.x = pos.fermo ? 0 : o * 0.5; u.gambe[1].rotation.x = pos.fermo ? 0 : -o * 0.5;
        u.corpo.position.y = pos.fermo ? 0 : Math.abs(Math.cos(e * 9)) * 0.03;
        gioc.pad.visible = false;
        const parla = pos.azione === "consegna" || pos.azione === "chiacchiera";
        if (parla && gioc.inizioParla == null) gioc.inizioParla = t;
        if (!parla) gioc.inizioParla = null;
        const dp = parla ? t - gioc.inizioParla : 0;
        gioc.busta.visible = !giro.frase && (pos.azione === "consegna" ? dp < 0.9 : e < durata(giro.punti.slice(0, 4), 1.6));
        if (parla && !gioc.busta.visible) {                             // parla gesticolando
          u.sx.rotation.set(1.2 + Math.sin(t * 8) * 0.6, 0, 0.4); u.dx.rotation.set(1.3 + Math.cos(t * 7) * 0.6, 0, -0.4);
          u.testa.rotation.z = Math.sin(t * 3) * 0.1;
        } else {
          u.sx.rotation.set(pos.fermo ? 0.1 : -o * 0.5, 0, 0.12);
          u.dx.rotation.set(gioc.busta.visible ? (pos.azione === "consegna" ? 1.5 : 1.2) : (pos.fermo ? 0.1 : o * 0.5), 0, -0.12);
        }
        const testo = giro.frase || "✉️ Da Stefano", vis = giro.frase ? pos.azione === "chiacchiera" : true;
        if (gioc.et.e.textContent !== testo) gioc.et.e.textContent = testo;
        gioc.et.e.style.visibility = vis && g.visible ? "" : "hidden";
      } else {                                                           // in poltrona a giocare
        const [lx, lz] = gioc.casa;
        g.position.set(lx, 0, lz); g.rotation.y = Math.PI / 2; gioc.pos.set(lx, 2.0, lz);
        for (const l of u.sedute) l.visible = true;
        for (const l of u.gambe) l.visible = false;
        gioc.pad.visible = true; gioc.busta.visible = false; gioc.inizioParla = null;
        const sc = Math.sin(t * 23) * 0.06, foga = Math.max(0, Math.sin(t * 0.7)) ;   // a volte si agita
        u.sx.rotation.set(1.15 + sc, 0, 0.35); u.dx.rotation.set(1.15 - sc, 0, -0.35);
        u.corpo.position.y = Math.abs(Math.sin(t * 6)) * 0.02 * foga;
        u.corpo.rotation.z = Math.sin(t * 1.3) * 0.12 * foga;            // si piega con la macchinina in curva
        u.testa.rotation.x = 0.1;
        gioc.et.e.style.visibility = "hidden";
      }
      if (segr && !giro) segr.giocVicino = false;
      if (segr && giro) { const d = Math.hypot(g.position.x - segr.casa[0], g.position.z - segr.casa[1]); segr.giocVicino = d < 2.2; }
      gioc.scr.material.color.setHSL((t * 0.15) % 1, 0.7, 0.55 + Math.sin(t * 9) * 0.08);   // il gioco sullo schermo
    }
    if (segr) {                                                          // la segretaria
      const { g, u } = segr;
      segrCoda = segrCoda.filter(q => t < q.fine + 0.5);
      let q = segrCoda.find(q => t >= q.inizio && t < q.fine);
      if (!q && !segrCoda.length && pc !== "off") {                        // ogni tanto porta il caffe' al capo
        if (segr.prossimoCaffe == null) segr.prossimoCaffe = t + 150 + Math.random() * 90;
        else if (t > segr.prossimoCaffe) { incarico("caffe", null, "☕ Il suo caffè, capo!", null); segr.prossimoCaffe = t + 200 + Math.random() * 120; q = segrCoda[0]; }
      }
      for (const oc of u.occhi) oc.scale.y = (t % 3.2) < 0.12 ? 0.25 : 1.5;
      u.testa.rotation.set(0, 0, 0); u.corpo.rotation.set(0, 0, 0); u.corpo.position.y = 0;
      segr.cart.visible = segr.limetta.visible = segr.tazza.visible = false; u.telefono.visible = false; segr.corn.visible = true;
      let testo = "", vis = false;
      if (q && t >= q.inizio) {
        const e = t - q.inizio, pos = lungo(q.punti, e, q.vel), o = Math.sin(e * (q.vel > 2 ? 14 : 9));
        const y = quota(pos.x, pos.z); g.position.set(pos.x, y, pos.z); segr.pos.set(pos.x, 2.0 + y, pos.z);
        if (pos.dir) g.rotation.y = Math.atan2(-pos.dir[0], -pos.dir[1]); else if (pos.azione) g.rotation.y = q.verso; else g.rotation.y = Math.PI;
        for (const l of u.sedute) l.visible = false;
        for (const l of u.gambe) l.visible = true;
        u.gambe[0].rotation.x = pos.fermo ? 0 : o * 0.45; u.gambe[1].rotation.x = pos.fermo ? 0 : -o * 0.45;
        u.corpo.position.y = pos.fermo ? 0 : Math.abs(Math.cos(e * 9)) * 0.03;
        u.corpo.rotation.z = pos.fermo ? 0 : Math.sin(e * 9) * 0.06;       // cammina ancheggiando
        const tArr = durata(q.punti.slice(0, q.iAz + 1), q.vel) - (q.punti[q.iAz][2] || 0);   // quando arriva a destinazione
        const arrivata = pos.azione === q.tipo, dopo = e > durata(q.punti.slice(0, q.iAz + 2), q.vel) - 0.01;
        const porta = q.tipo === "caffe" ? !dopo && !(arrivata && e - tArr > 0.9) : !dopo && !arrivata;
        u.sx.rotation.set(pos.fermo ? 0.1 : -o * 0.4, 0, 0.12); u.dx.rotation.set(pos.fermo ? 0.1 : o * 0.4, 0, -0.12);
        if (q.tipo === "allarme") { u.telefono.visible = true; u.dx.rotation.set(0.15, 0, 3.0); segr.corn.visible = false; testo = q.testo; vis = true; }
        else if (q.tipo === "caffe") { segr.tazza.visible = porta; if (porta) u.sx.rotation.set(1.3, 0, 0.1); testo = q.testo; vis = arrivata; if (arrivata && !q.muscoli) { q.muscoli = true; momento("capo:r:capo", "muscoli", 3.5); } }
        else {
          segr.cart.visible = porta || (arrivata && t % 1 < 2);
          segr.cart.material = m(q.colore || "#3b82f6");
          if (porta) u.dx.rotation.set(1.2, 0, -0.12);
          if (arrivata) {
            const da = e - tArr;
            if (q.tipo === "ko") { u.dx.rotation.set(da < 0.5 ? 2.3 - da * 3 : 0.6, 0, -0.12); segr.cart.visible = da < 0.6; testo = q.testo + " 😤"; }
            else { u.dx.rotation.set(1.5, 0, -0.12); segr.cart.visible = da < 1.2; testo = q.testo; }
            vis = true;
          }
          if (dopo && q.tipo === "ko") u.testa.rotation.y = Math.sin(t * 9) * 0.35;   // torna via scuotendo la testa
        }
      } else {                                                           // alla scrivania: unghie, telefono, tastiera
        const [x0, z0] = segr.casa;
        g.position.set(x0, SC.H, z0); g.rotation.y = Math.PI; segr.pos.set(x0, 2.0 + SC.H, z0);
        for (const l of u.sedute) l.visible = true;
        for (const l of u.gambe) l.visible = false;
        const fase = Math.floor(t / 9) % 3;
        if (segr.giocVicino) { u.sx.rotation.set(1.6, 0, 0.1); u.dx.rotation.set(0.6, 0, -0.1); testo = "🤫 Shhh!"; vis = true; }
        else if (fase === 0) { segr.limetta.visible = true; u.dx.rotation.set(1.3 + Math.sin(t * 14) * 0.12, 0, -0.5); u.sx.rotation.set(1.2, 0, 0.45); u.testa.rotation.x = 0.25; }
        else if (fase === 1) { u.telefono.visible = true; segr.corn.visible = false; u.dx.rotation.set(0.15, 0, 3.0); u.sx.rotation.set(1.1, 0, 0.3); testo = "📞 Ufficio del capo, attenda…"; vis = (t % 9) < 4; u.testa.rotation.z = 0.15; }
        else { const b = Math.sin(t * 26) * 0.1; u.sx.rotation.set(1.25 + b, 0, 0.2); u.dx.rotation.set(1.25 - b, 0, -0.2); }
      }
      if (segr.et.e.textContent !== testo) segr.et.e.textContent = testo;
      segr.et.e.style.visibility = vis && testo && g.visible ? "" : "hidden";
      g.visible = pc !== "off" || pcLuce > 0.5;
    }
    for (const tx of texCodice) tx.offset.y = (tx.offset.y - 0.004) % 1;     // il codice scorre
    for (const { mesh, s: s0 } of schermi) {
      const s = spenti.has(s0.id) ? { ...s0, stato: "spento" } : s0;     // computer spento da chi va a casa
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
    if (window.Plus3D) { Plus3D.aggiorna(dt, scena); if (t - tSemplice > 3) { tSemplice = t; Plus3D.semplifica(scena); } }
    controlli.update();
    renderer.render(scena, camera);
    costo = costo * 0.95 + (performance.now() - inizioFrame) * 0.05;     // media del tempo di disegno
    fps = costo > 16 ? 24 : costo > 11 ? 30 : 40;
    const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
    const visti = [];
    for (const { e, pos } of marcati) {                                  // etichette HTML sopra la scena
      v.copy(pos).project(camera);
      const fuori = v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1;
      e.style.display = fuori ? "none" : "";
      const px = (v.x + 1) / 2 * w, py = (1 - v.y) / 2 * h;
      e.style.transform = `translate(${px}px, ${py}px) translate(-50%, -100%)`;
      if (fuori || e.style.visibility === "hidden" || !e.textContent) continue;
      if (!e._mt || t - e._mt > 2) { e._mt = t; e._w = e.offsetWidth; e._h = e.offsetHeight; }   // misura ogni tanto, non a ogni giro
      const c = e.className;                                             // chi aspetta Stefano viene prima di tutto
      const p = /st-aspetta|st-allarme|chiama/.test(c) ? 0 : / st-/.test(c) || /⚠️|🔥|❌/.test(e.textContent) ? 1 : /nome|riep/.test(c) ? 2 : 3;
      visti.push({ e, p, x0: px - e._w / 2, x1: px + e._w / 2, y0: py - e._h, y1: py, z: v.z });
    }
    // una sola etichetta per punto: se due si coprono resta la piu' importante (a pari importanza la piu' vicina);
    // nessuna gag o nuvoletta copre mai un'attesa
    visti.sort((a, b) => a.p - b.p || a.z - b.z);
    const tenuti = [];
    const tocca = (q, dy) => tenuti.some(k => q.x0 < k.x1 - 2 && q.x1 > k.x0 + 2 && q.y0 + dy < k.y1 - 2 && q.y1 + dy > k.y0 + 2);
    for (const q of visti) {
      // prima prova a spostarla un po' sotto o sopra; se non c'e' posto la nasconde (riappare avvicinandosi)
      const dy = q.p === 0 ? 0 : [0, q.y1 - q.y0 + 3, -(q.y1 - q.y0 + 3)].find(d => !tocca(q, d));
      const copre = dy === undefined;
      q.e.style.opacity = copre ? "0" : ""; q.e.style.pointerEvents = copre ? "none" : "";
      if (dy) q.e.style.transform += ` translateY(${dy}px)`;
      if (!copre) { q.y0 += dy; q.y1 += dy; tenuti.push(q); }
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
    camera, controlli, omini: () => animati,                          // per le prove (viste ravvicinate)
    provaDivertenti() {
      const dip = animati.filter(a => a.userData.caffe), lav = dip.filter(a => a.userData.s.stato === "lavora");
      if (dip[0]) momento(dip[0].userData.s.id, "festa", 4.5);
      if (dip[1]) momento(dip[1].userData.s.id, "disperazione", 4.5);
      const uf = [...uffici.keys()].find(k => k !== "r:capo"); if (uf) setTimeout(() => brindisi(uf), 5000);
      forzaVenerdi = t + 90; passeggioSubito = true;
      setTimeout(() => { forzaSera = t + 60; }, 12000);
      for (const a of lav) a.userData.prossimoT = 0;
    },
    provaSgrida() { if (!ispettore) return; const i = ispettore.punti.findIndex(p => p[3] === "sgrida"); const d = durata(ispettore.punti.slice(0, i + 1), 1.3) - (ispettore.punti[i][2] || 0) - 0.5; ispettore.anticipo = ((d - t) % ispettore.durata + ispettore.durata) % ispettore.durata; },
    provaAura(n) { const d = animati.filter(a => a.userData.caffe)[n || 0]; if (d) { momento(d.userData.s.id, "aura", 4.5); const w = new T.Vector3(); d.getWorldPosition(w); return [w.x, w.z]; } },
    provaSegretaria(tipo, n) { const ids = [...bersagli.keys()].filter(k => !k.startsWith("capo:")); incarico(tipo || "ko", tipo === "allarme" || tipo === "caffe" ? null : ids[n || 0], tipo === "cartellina" ? "📁 148_F2X_OP20 V8.6" : tipo === "allarme" ? "🚨 Download su PLC!" : tipo === "caffe" ? "☕ Il suo caffè, capo!" : "❌ 3 errori", tipo === "cartellina" ? "#3b82f6" : "#e03131"); return segr && segr.casa; },
    provaPc(stato) { impostaPc(stato, false); },
    provaChiusura(n) { const ids = [...ultimeSessioni.keys()].filter(id => bersagli.has(id) && !chiusi.has(id)); const id = ids[ids.length - 1 - (n || 0)]; if (!id) return; chiudi(id, ultimeSessioni.get(id)); if (ultimiDati) costruisci(...ultimiDati); },
    provaCantiere(n) { const ids = [...bersagli.keys()].filter(k => !k.startsWith("capo:")); arrivoFatto.delete(ids[n || 0]); cantieri.set(ids[n || 0], performance.now() / 1000); const uf = [...bersagli.keys()].filter(k => k.startsWith("capo:") && k !== "capo:r:capo"); if (uf.length) { arrivoFatto.delete(uf[uf.length - 1]); cantieri.set(uf[uf.length - 1], performance.now() / 1000); } if (ultimiDati) costruisci(...ultimiDati); },
    provaPasseggio() { passeggioSubito = true; },
    provaPostinoCapo() { avviaPostino("capo:r:capo"); },
    provaCtrl(az, prima) { if (!ispettore) return; const i = ispettore.punti.findIndex(p => p[3] === (az || "scrive")); const d = durata(ispettore.punti.slice(0, i), 1.3) - (prima || 3); ispettore.anticipo = ((d - t) % ispettore.durata + ispettore.durata) % ispettore.durata; },
    provaPostino(n) { const ids = [...bersagli.keys()].filter(k => !k.startsWith("capo:")); avviaPostino(ids[n || 0]); },
    get effetti() { return effetti.length; }, get ispettore() { return ispettore && ispettore.o.position; }, get dati() { return ultimiDati; }, get scrivanie() { return [...bersagli.keys()].filter(k => !k.startsWith("capo:")); }, get postini() { return postini.map(p => [p.id, p.inizio, p.fine]); }, get giocatore() { return gioc && gioc.g.position; },
    get scena() { return scena; },
    get relax() { return relax && relax.posti.map(p => [p.x, p.z, p.az]); },
    relaxSubito() { relaxSubito = true; for (const a of animati) a.userData.prossimoT = 0; },
    caffeSubito() { for (const a of animati) a.userData.prossimoT = 0; },   // per le prove
  };
})();

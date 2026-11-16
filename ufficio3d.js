// Ufficio virtuale - la stessa stanza in 3D (Three.js r128, incluso nella cartella lib/).
// Stessi dati e stessi gruppi della versione 2D (Ufficio.prepara): cambia solo la scena.
// Tutto fatto con scatole colorate (stile "voxel"), niente modelli esterni.
(function () {
  const U = window.Ufficio;
  const wrap = document.getElementById("ufficio3d");
  if (!wrap || !window.THREE || !U) return;
  const T = THREE;

  const renderer = new T.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const etichette = document.createElement("div");
  etichette.className = "etichette3d";
  wrap.append(renderer.domElement, etichette);

  const scena = new T.Scene();
  scena.background = new T.Color("#1b1e26");
  const camera = new T.PerspectiveCamera(35, 2, 0.1, 400);
  const controlli = new T.OrbitControls(camera, renderer.domElement);
  controlli.enableDamping = true;
  controlli.maxPolarAngle = Math.PI * 0.44;          // mai sotto il pavimento
  controlli.minDistance = 6; controlli.maxDistance = 80;

  scena.add(new T.HemisphereLight("#dfe8ff", "#6b5440", 0.75));
  const sole = new T.DirectionalLight("#fff4e0", 0.75);
  sole.position.set(-14, 26, 18);
  sole.castShadow = true;
  sole.shadow.mapSize.set(2048, 2048);
  Object.assign(sole.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 90 });
  scena.add(sole);

  const mondo = new T.Group();                       // tutto quello che dipende dai dati
  scena.add(mondo);
  const mat = {};
  function m(c, extra) {                             // un materiale per colore, riusato
    const k = c + JSON.stringify(extra || {});
    return mat[k] || (mat[k] = new T.MeshLambertMaterial(Object.assign({ color: c }, extra)));
  }
  const geo = new T.BoxGeometry(1, 1, 1);
  function box(w, h, d, c, x, y, z, padre, extra) { // scatola appoggiata: y e' la base
    const b = new T.Mesh(geo, m(c, extra));
    b.scale.set(w, h, d);
    b.position.set(x, y + h / 2, z);
    b.castShadow = b.receiveShadow = true;
    (padre || mondo).add(b);
    return b;
  }

  // ---------- pezzi d'arredo ----------
  function scrivania(x, z, padre, s) {
    const g = new T.Group(); g.position.set(x, 0, z); padre.add(g);
    box(1.8, 0.08, 0.9, "#c99a62", 0, 0.74, 0, g);                       // piano
    for (const [dx, dz] of [[-0.82, -0.38], [0.82, -0.38], [-0.82, 0.38], [0.82, 0.38]])
      box(0.07, 0.74, 0.07, "#6b4a2a", dx, 0, dz, g);
    box(1.7, 0.4, 0.05, "#a87c4b", 0, 0.34, 0.42, g);                   // pannello davanti
    box(0.08, 0.3, 0.08, "#1d2029", 0, 0.82, 0.2, g);                   // monitor visto da dietro
    box(0.75, 0.48, 0.05, "#1d2029", 0, 1.08, 0.2, g);
    const schermo = box(0.68, 0.4, 0.01, "#2a2e3a", 0, 1.12, 0.17, g, {});
    schermo.material = new T.MeshBasicMaterial({ color: "#2a2e3a" });
    box(0.5, 0.02, 0.18, "#2b2f3b", 0, 0.82, -0.15, g);                 // tastiera
    box(0.1, 0.12, 0.1, ["#e8e8e8", "#d9534f", "#4a7fd6"][U.hash(s.id) % 3], 0.65, 0.82, 0.05, g);   // tazza
    if (s.commessa) box(0.36, 0.1, 0.02, "#f2c66d", 0, 0.42, 0.45, g);  // targhetta della commessa
    if (s.cloud) {                                                       // lavora nel cloud: nuvoletta
      const n = new T.Group(); n.position.set(0, 1.55, 0.2); g.add(n);
      for (const [dx, dy, r] of [[-0.14, 0, 0.13], [0.04, 0.05, 0.17], [0.2, 0, 0.12]]) {
        const p = new T.Mesh(new T.SphereGeometry(r, 10, 8), m("#eef4fb"));
        p.position.set(dx, dy, 0); n.add(p);
      }
      g.userData.nuvola = n;
    }
    g.userData.schermo = schermo;
    return g;
  }
  function sedia(x, z, padre) {
    const g = new T.Group(); g.position.set(x, 0, z); padre.add(g);
    box(0.55, 0.08, 0.55, "#2b2f3b", 0, 0.45, 0, g);
    box(0.55, 0.6, 0.08, "#3a3f4e", 0, 0.5, -0.3, g);
    box(0.08, 0.45, 0.08, "#222", 0, 0, 0, g);
    return g;
  }
  function omino(s, padre, x, z, capo) {
    const h = U.hash(s.id);
    const pelle = U.PELLE[h % U.PELLE.length], capelli = U.CAPELLI[(h >> 4) % U.CAPELLI.length];
    const maglia = U.MAGLIE[(h >> 8) % U.MAGLIE.length];
    const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = Math.PI; padre.add(g);
    const corpo = new T.Group(); g.add(corpo);
    box(0.5, 0.6, 0.3, maglia, 0, 0.55, 0, corpo);                      // busto (seduto)
    box(0.18, 0.45, 0.18, "#30384a", -0.13, 0.1, -0.15, corpo);          // gambe sotto la scrivania
    box(0.18, 0.45, 0.18, "#30384a", 0.13, 0.1, -0.15, corpo);
    const testa = new T.Group(); testa.position.set(0, 1.15, 0); corpo.add(testa);
    box(0.38, 0.38, 0.36, pelle, 0, 0, 0, testa);
    box(0.4, 0.12, 0.38, capelli, 0, 0.32, 0, testa);
    box(0.4, 0.2, 0.08, capelli, 0, 0.14, 0.17, testa);
    box(0.06, 0.06, 0.02, "#222", -0.08, 0.2, -0.185, testa);           // occhi
    box(0.06, 0.06, 0.02, "#222", 0.08, 0.2, -0.185, testa);
    if (capo) {                                                          // corona e cravatta
      for (const dx of [-0.13, 0, 0.13]) box(0.08, dx ? 0.12 : 0.18, 0.08, "#e0b040", dx, 0.42, 0, testa, { emissive: "#5a4000" });
      box(0.38, 0.06, 0.38, "#e0b040", 0, 0.4, 0, testa, { emissive: "#5a4000" });
      box(0.08, 0.3, 0.02, "#b8322a", 0, 0.75, -0.16, corpo);
    }
    const braccio = dx => {                                              // spalla come perno
      const b = new T.Group(); b.position.set(dx, 1.08, 0); corpo.add(b);
      box(0.13, 0.48, 0.14, maglia, 0, -0.48, 0, b);
      box(0.12, 0.1, 0.12, pelle, 0, -0.56, 0, b);
      return b;
    };
    const sx = braccio(-0.32), dx = braccio(0.32);
    g.userData = { corpo, testa, sx, dx, s, fase: (h % 97) / 10 };
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
  let animati = [], marcati = [], cliccabili = [], schermi = [];
  let primaVolta = true, centro = new T.Vector3(), larg = 20, prof = 10;

  function costruisci(sessioni, extra) {
    mondo.clear();
    etichette.replaceChildren();
    animati = []; marcati = []; cliccabili = []; schermi = [];
    const gruppi = U.prepara(sessioni, extra);
    const capi = gruppi.filter(U.haUfficio);
    const UFF = 3.6, PASSO = 2.2;
    // 1) uffici a vetri in fila in fondo
    capi.forEach((gr, i) => {
      const x = i * (UFF + 0.6), z = 0;
      const g = new T.Group(); g.position.set(x, 0, z); mondo.add(g);
      box(UFF, 0.02, UFF, "#5b6170", 0, 0, 0, g);                          // moquette
      const vetro = { transparent: true, opacity: 0.18, color: "#aad7f5" };
      const pv = new T.MeshLambertMaterial(vetro);
      for (const [w, d, px, pz] of [[UFF, 0.05, 0, -UFF / 2], [0.05, UFF, -UFF / 2, 0], [0.05, UFF, UFF / 2, 0], [UFF * 0.62, 0.05, -UFF * 0.19, UFF / 2]]) {
        const v = new T.Mesh(geo, pv); v.scale.set(w, 2.2, d); v.position.set(px, 1.1, pz); g.add(v);
        box(w + 0.02, 0.06, d + 0.02, "#8a93a8", px, 2.2, pz, g);         // telaio in alto
      }
      const fascia = box(UFF, 0.12, 0.08, gr.colore, 0, 2.26, -UFF / 2, g, {});
      fascia.material = new T.MeshBasicMaterial({ color: gr.colore });
      box(0.4, 0.5, 0.4, "#b85c38", UFF / 2 - 0.4, 0, -UFF / 2 + 0.4, g); // pianta
      box(0.5, 0.6, 0.5, "#3f9a4a", UFF / 2 - 0.4, 0.5, -UFF / 2 + 0.4, g);
      const nelVetro = gr.sessioni.filter(q => q.inUfficio);
      const stato = nelVetro.some(q => q.stato === "aspetta") ? "aspetta" : "supervisore";
      const s = { id: "capo:" + gr.chiave, stato, colore: gr.colore };
      const scr = scrivania(0, 0.3, g, s);
      sedia(0, -0.65, g);
      animati.push(omino(s, g, 0, -0.5, gr.chiave === "r:capo"));
      schermi.push({ mesh: scr.userData.schermo, s });
      const link = gr.link || (gr.s0 && gr.s0.link);
      cliccabili.push({ obj: g, apri: () => link && apriLink(link) });
      const sc = gr.scheda;
      marcati.push(etichetta("nome uff", U.nomeIsola(gr), new T.Vector3(x, 2.75, z - UFF / 2)));
      marcati.push(etichetta("riep" + (stato === "aspetta" ? " chiama" : ""), U.riepilogo(gr), new T.Vector3(x, 0.05, z + UFF / 2 + 0.9),
        sc ? [sc.fatto && "Fatto: " + sc.fatto, sc.in_corso && "In corso: " + sc.in_corso, sc.aspetta && "Aspetta: " + sc.aspetta].filter(Boolean).join("\n\n") : ""));
    });
    // 2) open space davanti: un'isola per gruppo, scrivanie in fila; ogni fila centrata sotto gli uffici
    const isole = gruppi.map(gr => ({ gr, fuori: gr.sessioni.filter(q => !q.inUfficio) })).filter(q => q.fuori.length);
    const largUffici = Math.max(1, capi.length) * (UFF + 0.6) - 0.6, mezzo = (largUffici - UFF) / 2;
    const rigaMax = Math.max(4, Math.floor(largUffici / PASSO));
    const file = [[]];
    let usate = 0;
    for (const q of isole) {
      if (usate && usate + q.fuori.length > rigaMax) { file.push([]); usate = 0; }
      file[file.length - 1].push(q); usate += q.fuori.length;
    }
    let z0 = UFF / 2 + 4.6;
    for (const fila of file) {
      if (!fila.length) continue;
      const w = fila.reduce((n, q) => n + q.fuori.length * PASSO, 0) + (fila.length - 1) * 0.8;
      let x0 = mezzo - w / 2;
      for (const { gr, fuori } of fila) {
        const wi = fuori.length * PASSO;
        const tappeto = box(wi, 0.02, 3.4, gr.colore, x0 + wi / 2, 0, z0 + 0.2, mondo, { transparent: true, opacity: 0.35 });
        tappeto.castShadow = false;
        marcati.push(etichetta("nome", U.nomeIsola(gr), new T.Vector3(x0 + wi / 2, 0.05, z0 + 2.35)));
        fuori.forEach((s, i) => {
          const x = x0 + PASSO / 2 + i * PASSO;
          const scr = scrivania(x, z0, mondo, s);
          sedia(x, z0 - 0.95, mondo);
          const presente = U.PRESENTI.includes(s.stato);
          if (presente) animati.push(omino(s, mondo, x, z0 - 0.8, false));
          schermi.push({ mesh: scr.userData.schermo, s: presente ? s : { stato: "spento" } });
          if (scr.userData.nuvola) animati.push({ nuvola: scr.userData.nuvola, fase: i });
          const apri = () => s.link ? apriLink(s.link) : window.open("/chat?id=" + encodeURIComponent(s.id), "chat-" + s.id);
          cliccabili.push({ obj: scr, apri });
          if (presente) {
            const [ic, testo] = U.testoFumetto(s);
            marcati.push(etichetta("f3d st-" + (s.download ? "allarme" : s.stato.replace("?", "")),
              ic + " " + U.corto(testo, s.stato === "aspetta" ? 52 : 34), new T.Vector3(x, 2.0, z0 - 0.8), s.titolo));
          }
          const tg = U.targa(s) || U.corto((s.titolo || "").replace(/^.*?›\s*/, ""), 18);
          if (tg) marcati.push(etichetta("tg3d", (s.cloud ? "☁️ " : "") + tg, new T.Vector3(x, 0.05, z0 + 1.5), s.titolo));
        });
        x0 += wi + 0.8;
      }
      z0 += 4.4;
    }
    // pavimento e pareti attorno a tutto
    const bb = new T.Box3().setFromObject(mondo);
    const size = bb.getSize(new T.Vector3()), mid = bb.getCenter(new T.Vector3());
    const pav = box(size.x + 6, 0.1, size.z + 6, "#8a6a48", mid.x, -0.1, mid.z);
    pav.castShadow = false;
    box(size.x + 6, 3, 0.2, "#3b4256", mid.x, 0, bb.min.z - 3);          // parete di fondo
    box(size.x + 6, 0.25, 0.22, "#4a3a2c", mid.x, 0, bb.min.z - 2.9);    // battiscopa
    for (let i = 0; i < Math.max(1, Math.floor(size.x / 6)); i++) {        // finestre
      const fx = bb.min.x + 3 + i * 6;
      box(2.4, 1.3, 0.05, "#d8dce6", fx, 1.2, bb.min.z - 2.88);
      const v = box(2.2, 1.1, 0.06, "#7cc0ea", fx, 1.3, bb.min.z - 2.86, mondo, {});
      v.material = new T.MeshBasicMaterial({ color: "#8fcbef" });
    }
    centro.copy(mid); larg = size.x + 1; prof = size.z + 2;
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
  function anima(ms) {
    requestAnimationFrame(anima);
    if (!attivo || document.hidden || ms - ultimo < 1000 / 24) return;   // 24 fotogrammi al secondo bastano
    ultimo = ms; t = ms / 1000;
    for (const a of animati) {
      if (a.nuvola) { a.nuvola.position.y = 1.55 + Math.sin(t * 1.5 + a.fase) * 0.04; continue; }
      const { corpo, testa, sx, dx, s, fase } = a.userData;
      const k = t + fase;
      corpo.position.y = Math.sin(k * 2) * 0.012;                      // respiro
      testa.rotation.set(0, 0, 0); sx.rotation.set(-1.2, 0, 0); dx.rotation.set(-1.2, 0, 0);
      if (s.stato === "lavora") { sx.rotation.x = -1.25 + Math.sin(k * 18) * 0.12; dx.rotation.x = -1.25 + Math.cos(k * 18) * 0.12; }
      else if (s.stato === "pensa") { testa.rotation.z = Math.sin(k * 1.2) * 0.15; dx.rotation.set(-2.3, 0, 0.5); }
      else if (s.stato === "aspetta") { dx.rotation.set(-2.9, 0, 0.25 + Math.sin(k * 6) * 0.35); }
      else if (s.stato === "ferma?") { testa.rotation.y = Math.sin(k * 0.8) * 0.6; }
      else if (s.stato === "finito") { testa.rotation.x = 0.45; corpo.position.y -= 0.03; sx.rotation.x = dx.rotation.x = -0.9; }
      else if (s.stato === "supervisore") { testa.rotation.y = Math.sin(k * 0.5) * 0.3; }
    }
    for (const { mesh, s } of schermi) {
      const c = s.stato === "aspetta" && Math.floor(t * 2) % 2 ? "#ff5d5d" : (s.colore && s.stato === "supervisore" ? s.colore : COL[s.stato] || "#2a2e3a");
      mesh.material.color.set(c);
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
  };
})();

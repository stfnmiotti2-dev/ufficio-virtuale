// Ufficio virtuale - modalita' GDR: entri nell'ufficio 3D come un omino e lo giri a piedi.
// Si scarica solo quando si preme "🎮 Entra": a GDR spenta il 3D non paga nulla.
// WASD/frecce = cammina, Shift = corre, mouse = guarda (clic sull'ufficio per agganciarlo),
// V o il pulsante = prima/terza persona, E = scheda di chi guardi, Esc = libera il mouse.
(function () {
  const U3 = window.Ufficio3D, T = window.THREE;
  if (!U3 || !T) return;
  const { camera, controlli, mondo, renderer, wrap } = U3;
  const tela = renderer.domElement;

  // ---------- muri e mobili: griglia vista dall'alto, rifatta solo quando cambiano i dati ----------
  const CELLA = 0.15, RAGGIO = 0.28;
  let griglia = null, gx0 = 0, gz0 = 0, gnx = 0, gnz = 0, sporca = true;
  function costruisciGriglia() {
    sporca = false;
    mondo.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(mondo);
    gx0 = box.min.x - 1; gz0 = box.min.z - 1;
    gnx = Math.ceil((box.max.x - gx0 + 1) / CELLA); gnz = Math.ceil((box.max.z - gz0 + 1) / CELLA);
    griglia = new Uint8Array(gnx * gnz);
    const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3();
    const salta = new Set();                                             // persone (si attraversano) e porta d'ingresso (si apre)
    mondo.traverse(o => { if ((o.userData && o.userData.corpo) || o === U3.porta) salta.add(o); });
    const visita = o => {
      if (!o.visible || salta.has(o)) return;
      if (o.isMesh && o.geometry && o.geometry.attributes.position && !(o.material && o.material.opacity === 0)) segna(o);
      for (const f of o.children) visita(f);
    };
    function segna(o) {
      const pos = o.geometry.attributes.position, idx = o.geometry.index, n = idx ? idx.count : pos.count, mw = o.matrixWorld;
      o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox.clone().applyMatrix4(mw);
      if (bb.max.y < 0.2 || bb.min.y > 1.7) return;                      // pavimento, tappeti, soppalco, lampade: si passa
      for (let i = 0; i < n; i += 3) {
        const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
        a.fromBufferAttribute(pos, i0).applyMatrix4(mw); b.fromBufferAttribute(pos, i1).applyMatrix4(mw); c.fromBufferAttribute(pos, i2).applyMatrix4(mw);
        if (Math.max(a.y, b.y, c.y) < 0.2 || Math.min(a.y, b.y, c.y) > 1.7) continue;
        const x0 = Math.floor((Math.min(a.x, b.x, c.x) - gx0) / CELLA), x1 = Math.floor((Math.max(a.x, b.x, c.x) - gx0) / CELLA);
        const z0 = Math.floor((Math.min(a.z, b.z, c.z) - gz0) / CELLA), z1 = Math.floor((Math.max(a.z, b.z, c.z) - gz0) / CELLA);
        if ((x1 - x0) * (z1 - z0) > 400) continue;                       // triangolo enorme e inclinato: meglio non murare mezza stanza
        for (let z = Math.max(0, z0); z <= Math.min(gnz - 1, z1); z++)
          for (let x = Math.max(0, x0); x <= Math.min(gnx - 1, x1); x++) griglia[z * gnx + x] = 1;
      }
    }
    visita(mondo);
  }
  function pieno(x, z) {
    const i = Math.floor((x - gx0) / CELLA), k = Math.floor((z - gz0) / CELLA);
    if (i < 0 || k < 0 || i >= gnx || k >= gnz) return true;
    if (U3.portaPos && x < U3.portaPos.x + 0.2) return true;              // la porta d'ingresso resta chiusa per chi gioca
    return griglia[k * gnx + i] === 1;
  }
  function libero(x, z) {
    for (let a = 0; a < 8; a++) if (pieno(x + Math.cos(a * Math.PI / 4) * RAGGIO, z + Math.sin(a * Math.PI / 4) * RAGGIO)) return false;
    return !pieno(x, z);
  }

  // ---------- stato ----------
  // squadra di supereroi ORIGINALE in stile film (muscoli, armature lucide, pose da eroe): ruoli, poteri,
  // colori e nomi inventati qui, non presi da nessuna squadra esistente
  const LOOK = [["maree", "🌊 Pilota delle maree"], ["solare", "☀️ Sentinella solare"], ["cometa", "☄️ Cacciatrice di comete"],
    ["vulcano", "🌋 Corazza vulcanica"], ["vento", "🌪️ Custode del vento"], ["cristallo", "💎 Ombra di cristallo"]];
  const leggi = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
  const salva = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  let attivo = false, primaPersona = leggi("gdrVista", "3") === "1", look = leggi("gdrLook", "maree");
  if (!LOOK.some(l => l[0] === look)) look = "maree";
  let av = null, x = 0, z = 0, yaw = 0, pitch = -0.12, passo = 0, alto = 1.5, distCam = 3.2;
  const tasti = new Set();
  let salvaCam = null;

  function creaAvatar() {
    if (av) { av.parent && av.parent.remove(av); }
    av = U3.nuovoOmino({ id: "gdr-eroe", donna: false }, x, z, "dip");
    av.userData.giocatore = true;
    vestiEroe(av.userData, look);
    const bb = new T.Box3().setFromObject(av); alto = Math.max(1.2, Math.min(2.2, bb.max.y));
    for (const l of av.userData.sedute) l.visible = false;
    for (const l of av.userData.gambe) l.visible = true;
    av.visible = !primaPersona;
  }

  // ---------- costumi da supereroe (sopra un omino normale: si nascondono polo, capelli, occhiali e barba) ----------
  function vestiEroe(u, tipo) {
    const { palla, tondo, box, m } = U3.aiuti;
    const { corpo, testa, sx, dx, gambe } = u;
    const metallo = { metalness: 0.6, roughness: 0.25 }, luce = c => ({ emissive: c, emissiveIntensity: 1.2 });
    const K = {
      maree: { c: "#1d4f91", gambe: "#163d70", guanti: "#3fa9d6", stivali: "#3fa9d6", spalle: "#3fa9d6" },
      solare: { c: "#f3efe6", gambe: "#e6dfcf", guanti: "#d9a521", stivali: "#d9a521", spalle: "#d9a521" },
      cometa: { c: "#3b2466", gambe: "#2c1a4d", guanti: "#ff6fb1", stivali: "#ff6fb1", spalle: "#5a3a94" },
      vulcano: { c: "#2b2a2e", gambe: "#2b2a2e", guanti: "#4a4448", stivali: "#4a4448", spalle: "#ff7a1a" },
      vento: { c: "#2a9d8f", gambe: "#1f6f66", guanti: "#e8f6f3", stivali: "#e8f6f3", spalle: "#e8f6f3" },
      cristallo: { c: "#1e2433", gambe: "#1e2433", guanti: "#2bbf87", stivali: "#151a24", spalle: null },
    }[tipo];
    const ex = metallo;
    for (const o of corpo.children.slice()) if (o.isMesh) o.visible = false;          // polo, logo, cordino
    testa.children.forEach((o, i) => { if (i > 0) o.visible = false; });               // resta solo la faccia
    const viso = () => { for (const o of u.occhi) o.visible = true; u.sorriso.visible = true; };
    const gC = new T.Group(); corpo.add(gC);
    // fisico da film: torace largo, pettorali, spalline lucide
    palla(0.272, K.c, 0, 0.78, 0, gC, tipo === "vulcano" ? 1.35 : 1.18, 1.32, 0.95, ex);
    for (const x_ of [-0.11, 0.11]) palla(0.13, K.c, x_, 0.9, -0.13, gC, 1.1, 0.8, 0.6, ex);
    if (K.spalle) for (const x_ of [-0.33, 0.33]) palla(0.15, K.spalle, x_, 1.0, 0, gC, 1.05, 0.75, 1.05, ex);
    for (const [g] of [[sx], [dx]]) {
      const c = new T.Mesh(new T.CylinderGeometry(0.1, 0.095, 0.4, 12), m(K.c, ex)); c.position.y = -0.18; g.add(c);
      palla(0.105, K.guanti, 0, -0.42, 0, g, 1, 1, 1, ex);
    }
    for (const a of gambe) {
      for (const o of a.children) o.visible = false;
      const c = new T.Mesh(new T.CylinderGeometry(0.1, 0.09, 0.45, 10), m(K.gambe, ex)); c.position.y = -0.24; a.add(c);
      palla(0.115, K.stivali, 0, -0.47, -0.04, a, 1, 0.65, 1.45, ex);
    }
    tondo(0.56, 0.07, 0.46, "#2b2b33", 0, 0.5, 0, gC, 0.03, ex);                      // cintura con lo stemma della squadra (inventato:
    { const st = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.03, 6), m("#f28c28", luce("#f28c28")));   // esagono arancione dell'ufficio)
      st.rotation.x = Math.PI / 2; st.position.set(0, 0.535, -0.235); gC.add(st); }
    const mantello = (c, e) => {
      const mt = new T.Mesh(new T.CylinderGeometry(0.3, 0.5, 1.0, 20, 1, true, -Math.PI * 0.4, Math.PI * 0.8), m(c, Object.assign({ side: T.DoubleSide }, e)));
      mt.position.set(0, 0.6, 0.06); mt.castShadow = true; gC.add(mt); u.mantello = mt;
    };
    const calotta = (c, fino, e) => { const q = new T.Mesh(new T.SphereGeometry(0.292, 24, 16, 0, Math.PI * 2, 0, Math.PI * fino), m(c, e)); q.scale.set(1, 1.06, 1); testa.add(q); return q; };
    const mento = (c, e) => palla(0.2, c, 0, -0.12, -0.08, testa, 1.25, 0.8, 1.2, e);
    const lenti = (c, w) => { for (const x_ of [-0.1, 0.1]) palla(0.06 * w, c, x_, 0.04, -0.27, testa, 1.3, 0.9, 0.45, luce(c)); };
    switch (tipo) {
      case "maree":                                                            // pinne sulle spalle, visiera d'acqua, sfera d'onda in mano
        u.sorriso.visible = true; calotta(K.c, 0.55, ex);
        tondo(0.44, 0.1, 0.08, "#7fe0ff", 0, -0.0, -0.25, testa, 0.04, luce("#3fc8ff"));
        for (const x_ of [-0.36, 0.36]) { const f = new T.Mesh(new T.ConeGeometry(0.08, 0.32, 4), m("#3fa9d6", ex)); f.position.set(x_, 1.12, 0.08); f.rotation.set(-0.5, 0, x_ < 0 ? 0.3 : -0.3); f.scale.z = 0.35; gC.add(f); }
        for (let i = 0; i < 3; i++) { const o = new T.Mesh(new T.TorusGeometry(0.09 + i * 0.05, 0.012, 6, 24, Math.PI), m("#7fe0ff", luce("#3fc8ff"))); o.position.set(0, 0.82 - i * 0.02, -0.26); gC.add(o); }
        u.sfera = palla(0.11, "#7fe0ff", 0, -0.62, -0.05, dx, 1, 1, 1, { transparent: true, opacity: 0.75, emissive: "#3fc8ff", emissiveIntensity: 0.9 });
        break;
      case "solare":                                                           // armatura perla e oro, alone di luce dietro la testa
        viso(); calotta("#7a4a20", 0.45).rotation.x = 0.35;
        { const al = new T.Mesh(new T.TorusGeometry(0.42, 0.025, 8, 32), m("#ffd34d", luce("#ffbf00"))); al.position.set(0, 0.05, 0.25); testa.add(al); u.alone = al;
          for (let i = 0; i < 8; i++) { const r = box(0.03, 0.12, 0.02, "#ffd34d", 0, 0, 0, al, luce("#ffbf00")); const a = i / 8 * Math.PI * 2; r.position.set(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0); r.rotation.z = a - Math.PI / 2; } }
        for (const [y_, w] of [[0.95, 0.42], [0.72, 0.34]]) tondo(w, 0.04, 0.05, "#d9a521", 0, y_, -0.24, gC, 0.02, ex);
        mantello("#f3efe6", { roughness: 0.6 });
        break;
      case "cometa":                                                           // mantello a coda di cometa, visiera rosa, scie sulle braccia
        u.sorriso.visible = true; calotta(K.c, 0.55, ex);
        { const v = tondo(0.46, 0.09, 0.08, "#ff6fb1", 0, -0.0, -0.25, testa, 0.04, luce("#ff3d9a")); v.rotation.z = 0.08; }
        for (let i = 0; i < 5; i++) palla(0.03, "#fff3b0", -0.12 + i * 0.06, 0.25 + Math.sin(i) * 0.03, -0.12, testa, 1, 1, 1, luce("#fff3b0"));   // diadema di stelline
        mantello("#ff6fb1", { emissive: "#7a2a8a", emissiveIntensity: 0.6 });
        for (const g of [sx, dx]) box(0.03, 0.34, 0.02, "#ff6fb1", 0, -0.38, -0.1, g, luce("#ff3d9a"));
        break;
      case "vulcano":                                                          // armatura pesante con crepe di lava e camini sulle spalle
        u.sorriso.visible = true; calotta(K.c, 0.6, ex);
        tondo(0.4, 0.07, 0.06, "#ffb000", 0, 0.0, -0.26, testa, 0.03, luce("#ff8a00"));
        for (const [x_, y_, r] of [[-0.12, 0.95, 0.4], [0.13, 0.8, -0.6], [-0.06, 0.65, 0.9], [0.15, 1.0, 0.2], [0.02, 0.58, -0.3]]) {
          const q = box(0.025, 0.15, 0.02, "#ff7a1a", x_, y_, -0.29, gC, luce("#ff5a00")); q.rotation.z = r; }
        for (const x_ of [-0.33, 0.33]) { const cm = new T.Mesh(new T.CylinderGeometry(0.05, 0.06, 0.16, 10), m("#4a4448", ex)); cm.position.set(x_, 1.17, 0.06); gC.add(cm);
          palla(0.045, "#ff7a1a", x_, 1.26, 0.06, gC, 1, 0.5, 1, luce("#ff5a00")); }
        break;
      case "vento":                                                            // anelli d'aria che girano sugli avambracci, sciarpa lunga
        viso(); calotta("#e8f6f3", 0.45).rotation.x = 0.35;
        tondo(0.34, 0.06, 0.06, "#1f6f66", 0, 0.0, -0.25, testa, 0.03);
        u.anelli = [];
        for (const g of [sx, dx]) for (const y_ of [-0.3, -0.4]) { const a = new T.Mesh(new T.TorusGeometry(0.15, 0.012, 6, 24), m("#e8f6f3", { transparent: true, opacity: 0.8, emissive: "#bff6ec", emissiveIntensity: 0.6 }));
          a.position.y = y_; a.rotation.x = Math.PI / 2; g.add(a); u.anelli.push(a); }
        { const sc = new T.Mesh(new T.TorusGeometry(0.2, 0.06, 8, 20), m("#e8f6f3")); sc.rotation.x = Math.PI / 2; sc.position.y = 1.07; gC.add(sc);
          const coda = tondo(0.12, 0.6, 0.04, "#e8f6f3", 0.1, 0.45, 0.24, gC, 0.02); coda.rotation.z = -0.12; u.mantello = coda; }
        break;
      case "cristallo":                                                        // spalline e maschera di cristallo smeraldo
        u.sorriso.visible = true; calotta(K.c, 0.55);
        palla(0.2, "#2bbf87", 0, 0.02, -0.17, testa, 1.15, 0.55, 0.65, { transparent: true, opacity: 0.85, roughness: 0.1, emissive: "#0f8f5f", emissiveIntensity: 0.5 });
        for (const x_ of [-0.33, 0.33]) for (let i = 0; i < 4; i++) {
          const q = new T.Mesh(new T.OctahedronGeometry(0.09 + (i % 2) * 0.03), m("#2bbf87", { transparent: true, opacity: 0.85, roughness: 0.1, emissive: "#0f8f5f", emissiveIntensity: 0.4 }));
          q.position.set(x_ + (x_ < 0 ? -1 : 1) * (i % 2) * 0.05, 1.02 + i * 0.05, (i - 1.5) * 0.07); q.scale.y = 1.6; q.rotation.z = x_ < 0 ? 0.4 : -0.4; gC.add(q); }
        box(0.03, 0.5, 0.02, "#2bbf87", 0, 0.55, -0.245, gC, luce("#0f8f5f"));
        break;
    }
  }
  function partenza() {                                                  // dalla porta d'ingresso, un passo dentro
    const p = U3.portaPos, c = U3.centro;
    const cand = p ? [[p.x + 1.2, p.z], [p.x + 1.8, p.z], [p.x + 1.2, p.z + 1], [p.x + 1.2, p.z - 1]] : [];
    cand.push([c.x, c.z + 2], [c.x, c.z]);
    for (const [cx, cz] of cand) if (libero(cx, cz)) return [cx, cz];
    for (let r = 1; r < 30; r++) for (let a = 0; a < 16; a++) {          // cerca un posto libero a spirale
      const cx = c.x + Math.cos(a / 16 * Math.PI * 2) * r * 0.5, cz = c.z + Math.sin(a / 16 * Math.PI * 2) * r * 0.5;
      if (libero(cx, cz)) return [cx, cz];
    }
    return [c.x, c.z];
  }

  // ---------- pannello ----------
  const pan = document.createElement("div");
  pan.className = "gdr-pannello";
  pan.innerHTML = `<style>
    .gdr-pannello{position:absolute;left:10px;top:10px;z-index:6;display:flex;gap:6px;align-items:center;flex-wrap:wrap;
      background:rgba(20,24,36,.82);color:#fff;padding:6px 8px;border-radius:10px;font:13px system-ui,sans-serif;max-width:calc(100% - 20px)}
    .gdr-pannello button,.gdr-pannello select{font:13px system-ui,sans-serif;border-radius:7px;border:0;padding:4px 9px;cursor:pointer}
    .gdr-pannello .vista{background:#f07d1e;color:#fff;font-weight:600}
    .gdr-aiuto{opacity:.8;font-size:12px}
    .gdr-mirino{position:absolute;left:50%;top:50%;width:10px;height:10px;margin:-5px 0 0 -5px;border:2px solid rgba(255,255,255,.85);
      border-radius:50%;box-shadow:0 0 2px #000;pointer-events:none;z-index:5}
  </style>
  <select title="Chi sei"></select>
  <button class="vista" title="Cambia visuale (tasto V)"></button>
  <button class="esci" title="Torna alla vista dall'alto">🚪 Esci</button>
  <span class="gdr-aiuto">Clic sull'ufficio per guidare col mouse · WASD cammina · Shift corre · V visuale · E scheda di chi guardi · Esc libera il mouse</span>`;
  const sel = pan.querySelector("select"), btnVista = pan.querySelector(".vista");
  for (const [k, n] of LOOK) { const o = document.createElement("option"); o.value = k; o.textContent = n; sel.append(o); }
  const mirino = document.createElement("div"); mirino.className = "gdr-mirino";
  sel.onchange = () => { look = sel.value; salva("gdrLook", look); creaAvatar(); sel.blur(); };
  btnVista.onclick = () => cambiaVista();
  pan.querySelector(".esci").onclick = () => esci();
  function scriviVista() { btnVista.textContent = primaPersona ? "👁 1ª persona" : "🎥 3ª persona"; mirino.hidden = !primaPersona; }
  function cambiaVista() {
    primaPersona = !primaPersona; salva("gdrVista", primaPersona ? "1" : "3");
    if (av) av.visible = !primaPersona;
    scriviVista(); btnVista.blur();
  }

  // ---------- comandi ----------
  const MOSSE = { KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, ShiftLeft: 1, ShiftRight: 1 };
  function giu(e) {
    if (!attivo || e.target.tagName === "SELECT") return;
    if (MOSSE[e.code]) { tasti.add(e.code); e.preventDefault(); }
    if (e.code === "KeyV" && !e.repeat) cambiaVista();
    if (e.code === "KeyE" && !e.repeat) scheda();
  }
  function su(e) { tasti.delete(e.code); }
  function clicTela() { if (attivo && document.pointerLockElement !== tela) tela.requestPointerLock && tela.requestPointerLock(); }
  function muovi(e) {
    if (!attivo || document.pointerLockElement !== tela) return;
    yaw -= e.movementX * 0.0025;
    pitch = Math.max(-1.2, Math.min(0.9, pitch - e.movementY * 0.0025));
  }
  function scheda() {                                                    // la mini-scheda di chi sta al centro della vista
    if (document.pointerLockElement) document.exitPointerLock();
    const r = tela.getBoundingClientRect();
    const vis = av && av.visible; if (av) av.visible = false;            // non cliccare se stessi
    U3.cliccaIn(r.left + r.width / 2, r.top + r.height / 2);
    if (av) av.visible = vis;
  }
  // rotella in terza persona: telecamera piu' vicina o piu' lontana
  function rotella(e) { if (!attivo || primaPersona) return; e.preventDefault(); e.stopPropagation(); distCam = Math.max(1.6, Math.min(7, distCam * (e.deltaY > 0 ? 1.12 : 0.9))); }

  // ---------- un fotogramma (chiamato dal 3D al posto dei controlli normali) ----------
  const fuoco = new T.Vector3();
  let tAn = 0;
  function passoGdr(dt) {
    if (sporca || !griglia) costruisciGriglia();
    let av_ = 0, la = 0;
    if (tasti.has("KeyW") || tasti.has("ArrowUp")) av_ += 1;
    if (tasti.has("KeyS") || tasti.has("ArrowDown")) av_ -= 1;
    if (tasti.has("KeyD")) la += 1;
    if (tasti.has("KeyA")) la -= 1;
    if (tasti.has("ArrowLeft")) yaw += 2.2 * dt;                         // frecce laterali: gira senza mouse
    if (tasti.has("ArrowRight")) yaw -= 2.2 * dt;
    const vel = (tasti.has("ShiftLeft") || tasti.has("ShiftRight") ? 4.2 : 2.2) * dt;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    let mx = fx * av_ + rx * la, mz = fz * av_ + rz * la;
    const n = Math.hypot(mx, mz), va = n > 0;
    if (va) {
      mx = mx / n * vel; mz = mz / n * vel;
      if (libero(x + mx, z)) x += mx;                                    // scivola lungo muri e scrivanie
      if (libero(x, z + mz)) z += mz;
      passo += dt * (vel / dt > 3 ? 13 : 9);
      U3.sveglia();
    }
    if (tasti.size) U3.sveglia();
    // omino: posizione, direzione di marcia, gambe e braccia
    if (av) {
      const u = av.userData;
      av.position.set(x, 0, z);
      if (va) av.rotation.y = Math.atan2(-mx, -mz);
      const o = va ? Math.sin(passo) : 0;
      u.gambe[0].rotation.x = o * 0.5; u.gambe[1].rotation.x = -o * 0.5;
      if (va) { u.sx.rotation.set(-o * 0.5, 0, 0.12); u.dx.rotation.set(o * 0.5, 0, -0.12); }
      else { u.sx.rotation.set(0.15, 0, 0.42); u.dx.rotation.set(0.15, 0, -0.42); }   // fermo: posa da eroe, pugni sui fianchi
      tAn += dt;
      if (u.anelli) u.anelli.forEach((r, i) => { r.rotation.z = tAn * (i % 2 ? -6 : 6); r.scale.setScalar(1 + Math.sin(tAn * 5 + i) * 0.08); });
      if (u.sfera) u.sfera.scale.setScalar(1 + Math.sin(tAn * 4) * 0.12);
      if (u.alone) u.alone.rotation.z = tAn * 0.6;
      u.corpo.position.y = va ? Math.abs(Math.cos(passo)) * 0.03 : 0;
      if (u.mantello) u.mantello.rotation.x = va ? -0.35 - Math.abs(Math.sin(passo)) * 0.15 : 0;   // mantello o sciarpa svolazzano
    }
    // telecamera
    const occhio = alto * 0.86;
    if (primaPersona) {
      camera.position.set(x + fx * 0.15, occhio + (va ? Math.abs(Math.cos(passo)) * 0.025 : 0), z + fz * 0.15);
      fuoco.set(x + fx * Math.cos(pitch) * 5, occhio + Math.sin(pitch) * 5, z + fz * Math.cos(pitch) * 5);
    } else {
      // dietro le spalle, un po' dall'alto; se dietro c'e' un muro si avvicina
      let d = distCam;
      for (let s = 0.4; s <= distCam; s += 0.2) if (pieno(x - fx * s, z - fz * s)) { d = Math.max(0.6, s - 0.3); break; }
      const h = occhio + 0.45 - pitch * d * 0.6;
      camera.position.set(x - fx * d, Math.max(0.5, h), z - fz * d);
      fuoco.set(x + fx * 1.2, occhio + Math.sin(pitch) * 1.5, z + fz * 1.2);
    }
    camera.lookAt(fuoco);
  }

  function entra() {
    if (attivo) return;
    attivo = true; window.Gdr.attivo = true;
    salvaCam = { pos: camera.position.clone(), fov: camera.fov, near: camera.near, target: controlli.target.clone() };
    controlli.enabled = false;
    camera.fov = 65; camera.near = 0.05; camera.updateProjectionMatrix();
    costruisciGriglia();
    [x, z] = partenza(); yaw = Math.PI / 2;                                // guarda dentro l'ufficio, verso destra
    if (U3.portaPos && U3.centro) yaw = Math.atan2(-(U3.centro.x - x), -(U3.centro.z - z));
    sel.value = look; creaAvatar(); scriviVista();
    wrap.append(pan, mirino);
    const b = document.getElementById("gdr3d"); if (b) b.textContent = "🚪 Esci";
    window.addEventListener("keydown", giu); window.addEventListener("keyup", su);
    tela.addEventListener("click", clicTela); document.addEventListener("mousemove", muovi);
    tela.addEventListener("wheel", rotella, { passive: false, capture: true });
    window.addEventListener("blur", vuota);
    U3.sveglia();
  }
  function vuota() { tasti.clear(); }
  function esci() {
    if (!attivo) return;
    attivo = false; window.Gdr.attivo = false;
    if (document.pointerLockElement) document.exitPointerLock();
    if (av) { av.parent && av.parent.remove(av); av = null; }
    pan.remove(); mirino.remove(); tasti.clear();
    window.removeEventListener("keydown", giu); window.removeEventListener("keyup", su);
    tela.removeEventListener("click", clicTela); document.removeEventListener("mousemove", muovi);
    tela.removeEventListener("wheel", rotella, { capture: true });
    window.removeEventListener("blur", vuota);
    if (salvaCam) { camera.fov = salvaCam.fov; camera.near = salvaCam.near; camera.updateProjectionMatrix(); camera.position.copy(salvaCam.pos); controlli.target.copy(salvaCam.target); }
    controlli.enabled = true; controlli.update();
    const b = document.getElementById("gdr3d"); if (b) b.textContent = "🎮 Entra";
  }

  window.Gdr = {
    attivo: false, entra, esci, passo: passoGdr,
    ricostruito() { sporca = true; },                                    // i dati sono cambiati: muri e mobili da rifare
    get pos() { return [x, z, yaw]; }, set pos(p) { [x, z, yaw] = p; },  // per le prove
    get griglia() { return { griglia, gx0, gz0, gnx, gnz, CELLA }; },
    galleria(x0, z0) {                                                   // per le prove: tutti gli eroi in fila
      return LOOK.map(([k], i) => { const o = U3.nuovoOmino({ id: "gdr-eroe", donna: false }, x0 + i * 1.0, z0, "dip"); vestiEroe(o.userData, k);
        o.userData.sedute.forEach(q => q.visible = false); o.userData.gambe.forEach(q => q.visible = true); o.userData.sx.rotation.set(0.15, 0, 0.42); o.userData.dx.rotation.set(0.15, 0, -0.42); o.rotation.y = 0; return k; });
    },
    vista(prima) { if (prima !== primaPersona) cambiaVista(); },
  };
})();

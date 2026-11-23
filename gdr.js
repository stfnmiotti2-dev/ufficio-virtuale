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
  // supereroi ORIGINALI, inventati qui, con sagome molto diverse tra loro (niente copie di personaggi esistenti)
  const LOOK = [["robot", "🤖 Robot cingolato"], ["colosso", "🪨 Colosso di pietra"], ["argento", "🦋 Eroina d'argento"],
    ["mago", "🔮 Mago del mantello"], ["scheggia", "💨 Scheggia"], ["cavaliere", "🛡️ Cavaliere smeraldo"], ["energia", "🔵 Uomo d'energia"]];
  const leggi = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
  const salva = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  let attivo = false, primaPersona = leggi("gdrVista", "3") === "1", look = leggi("gdrLook", "robot");
  if (!LOOK.some(l => l[0] === look)) look = "robot";
  let av = null, x = 0, z = 0, yaw = 0, pitch = -0.12, passo = 0, alto = 1.5, distCam = 3.2;
  const tasti = new Set();
  let salvaCam = null;

  function creaAvatar() {
    if (av) { av.parent && av.parent.remove(av); }
    av = U3.nuovoOmino({ id: "gdr-eroe", donna: false }, x, z, "dip");
    av.userData.giocatore = true;
    vestiEroe(av, look);
    const bb = new T.Box3().setFromObject(av); alto = Math.max(1.1, Math.min(3, bb.max.y));
    for (const l of av.userData.sedute) l.visible = false;
    for (const l of av.userData.gambe) l.visible = true;
    av.visible = !primaPersona;
  }

  // ---------- costumi da supereroe (sopra un omino normale: si nascondono polo, capelli, occhiali e barba) ----------
  function vestiEroe(g, tipo) {
    const u = g.userData, { palla, tondo, box, m } = U3.aiuti;
    const { corpo, testa, sx, dx, gambe } = u;
    const metallo = { metalness: 0.6, roughness: 0.25 }, luce = (c, k) => ({ emissive: c, emissiveIntensity: k || 1.2 });
    const vetro = (c, e) => ({ transparent: true, opacity: 0.55, roughness: 0.1, emissive: e || c, emissiveIntensity: 0.7, depthWrite: false });
    for (const o of corpo.children.slice()) if (o.isMesh) o.visible = false;          // polo, logo, cordino
    testa.children.forEach((o, i) => { if (i > 0) o.visible = false; });               // resta solo la faccia
    const viso = () => { for (const o of u.occhi) o.visible = true; u.sorriso.visible = true; };
    const faccia = testa.children[0];
    const gC = new T.Group(); corpo.add(gC);
    // pezzi comuni: tuta sul busto, maniche e guanti, gambe e stivali (ognuno poi cambia la sagoma)
    const tuta = (c, e, sx_, sy_, sz_) => palla(0.272, c, 0, 0.78, 0, gC, sx_ || 1, sy_ || 1.32, sz_ || 0.9, e);
    const braccia = (c, gu, e, r, rg) => { for (const b of [sx, dx]) { const q = new T.Mesh(new T.CylinderGeometry(r || 0.09, r || 0.095, 0.4, 12), m(c, e)); q.position.y = -0.18; b.add(q);
      palla(rg || 0.1, gu, 0, -0.42, 0, b, 1, 1, 1, e); } };
    const gambeTuta = (c, st, e, r) => { for (const a of gambe) { for (const o of a.children) o.visible = false;
      const q = new T.Mesh(new T.CylinderGeometry(r || 0.095, 0.09, 0.45, 10), m(c, e)); q.position.y = -0.24; a.add(q);
      palla(0.11, st, 0, -0.47, -0.04, a, 1, 0.65, 1.45, e); } };
    const calotta = (c, fino, e) => { const q = new T.Mesh(new T.SphereGeometry(0.292, 24, 16, 0, Math.PI * 2, 0, Math.PI * fino), m(c, e)); q.scale.set(1, 1.06, 1); testa.add(q); return q; };
    u.extra = [];                                                                      // pezzi animati
    switch (tipo) {
      case "robot": {                                                                  // corpo squadrato, testa a schermo, cingoli
        tondo(0.66, 0.84, 0.46, "#eef2f7", 0, 0.24, 0, gC, 0.08, metallo);
        tondo(0.3, 0.2, 0.03, "#2563eb", 0, 0.78, -0.24, gC, 0.03, luce("#2563eb", 0.6));
        faccia.visible = false;
        tondo(0.6, 0.48, 0.5, "#2563eb", 0, -0.26, 0, testa, 0.08, metallo);
        tondo(0.48, 0.32, 0.03, "#0b1630", 0, -0.18, -0.26, testa, 0.04);
        for (const x_ of [-0.1, 0.1]) palla(0.05, "#5ff3ff", x_, -0.01, -0.28, testa, 1.2, 1, 0.4, luce("#5ff3ff", 1.5));
        box(0.18, 0.025, 0.02, "#5ff3ff", 0, -0.13, -0.28, testa, luce("#5ff3ff", 1.5));
        tondo(0.03, 0.22, 0.03, "#94a3b8", 0.18, 0.2, 0, testa, 0.01); palla(0.045, "#ff4d4d", 0.18, 0.44, 0, testa, 1, 1, 1, luce("#ff4d4d"));
        braccia("#94a3b8", "#2563eb", metallo, 0.07, 0.11);
        for (const a of gambe) for (const o of a.children) o.visible = false;
        for (const x_ of [-0.2, 0.2]) { tondo(0.2, 0.26, 0.6, "#334155", x_, 0.0, 0, gC, 0.1);   // cingoli
          for (const z_ of [-0.2, 0, 0.2]) { const r = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 0.2, 12), m("#94a3b8", metallo)); r.rotation.z = Math.PI / 2; r.position.set(x_, 0.11, z_); gC.add(r); u.extra.push(["ruota", r]); } }
        u.cingoli = true;
        break; }
      case "colosso": {                                                                // il doppio degli altri, tutto rocce
        const pietra = "#8a7f72", scura = "#6b6157";
        tuta(pietra, { roughness: 0.95 }, 1.35, 1.35, 1.05); faccia.material = m(pietra, { roughness: 0.95 });
        for (const o of u.occhi) { o.visible = true; o.material = m("#ffa733", luce("#ff8a00", 1.5)); }
        for (const [x_, y_, z_, r] of [[-0.36, 1.02, 0, 0.17], [0.36, 1.02, 0, 0.17], [0, 1.0, 0.2, 0.15], [-0.18, 0.62, -0.22, 0.09], [0.2, 0.85, -0.24, 0.08], [0, 0.4, 0.15, 0.12]]) {
          const q = new T.Mesh(new T.DodecahedronGeometry(r), m(x_ ? scura : pietra, { roughness: 0.95 })); q.position.set(x_, y_, z_); q.rotation.set(x_, y_, z_); gC.add(q); }
        for (const b of [sx, dx]) { const q = new T.Mesh(new T.CylinderGeometry(0.14, 0.12, 0.42, 9), m(pietra, { roughness: 0.95 })); q.position.y = -0.18; b.add(q);
          const pu = new T.Mesh(new T.DodecahedronGeometry(0.2), m(scura, { roughness: 0.95 })); pu.position.y = -0.48; b.add(pu); }
        gambeTuta(pietra, scura, { roughness: 0.95 }, 0.13);
        u.scala = 1.5;
        break; }
      case "argento": {                                                                // eroina slanciata, capelli lunghi argento, ali luminose
        viso();
        calotta("#d9dde6", 0.5, { metalness: 0.4, roughness: 0.3 }).rotation.x = 0.3;
        palla(0.27, "#d9dde6", 0, -0.2, 0.1, testa, 1.08, 1.5, 0.8, { metalness: 0.4, roughness: 0.3 });   // capelli lunghi dietro
        for (const x_ of [-0.25, 0.25]) palla(0.09, "#d9dde6", x_, -0.15, 0.02, testa, 0.7, 2.1, 1, { metalness: 0.4, roughness: 0.3 });
        tuta("#f4f4f8", undefined, 0.92, 1.32, 0.85);
        { const v = palla(0.2, "#7c3aed", 0, 0.8, -0.1, gC, 0.9, 1.4, 0.6); }                // fascia viola sul petto
        braccia("#f4f4f8", "#7c3aed", undefined, 0.08, 0.09); gambeTuta("#f4f4f8", "#7c3aed", undefined, 0.085);
        tondo(0.46, 0.05, 0.38, "#7c3aed", 0, 0.52, 0, gC, 0.02);
        for (const x_ of [-1, 1]) { const ala = new T.Group(); ala.position.set(x_ * 0.08, 0.9, 0.22); gC.add(ala);
          palla(0.3, "#c4b5fd", x_ * 0.3, 0.12, 0.05, ala, 1, 0.75, 0.08, vetro("#c4b5fd", "#8b5cf6"));
          palla(0.2, "#c4b5fd", x_ * 0.24, -0.28, 0.05, ala, 1, 0.8, 0.08, vetro("#c4b5fd", "#8b5cf6"));
          ala.rotation.y = x_ * 0.5; u.extra.push(["ala", ala, x_]); }
        corpo.scale.set(0.92, 1.03, 0.92);
        break; }
      case "mago": {                                                                   // mantello fino a terra, cappuccio, occhi nell'ombra
        const blu = "#123c4a", oro = "#c9a227";
        const veste = new T.Mesh(new T.CylinderGeometry(0.26, 0.5, 1.25, 20), m(blu)); veste.position.y = 0.62; gC.add(veste);
        const bordo = new T.Mesh(new T.TorusGeometry(0.5, 0.025, 6, 32), m(oro, metallo)); bordo.rotation.x = Math.PI / 2; bordo.position.y = 0.03; gC.add(bordo);
        box(0.06, 1.2, 0.02, oro, 0, 0.03, -0.37, gC, metallo).rotation.x = -0.2;
        faccia.material = m("#0b1418");
        const cap = calotta(blu, 0.62); cap.scale.set(1.15, 1.25, 1.2); cap.position.y = 0.02;
        const punta = new T.Mesh(new T.ConeGeometry(0.2, 0.3, 14), m(blu)); punta.position.set(0, 0.33, 0.12); punta.rotation.x = 0.6; testa.add(punta);
        for (const x_ of [-0.09, 0.09]) palla(0.035, "#7df9ff", x_, 0.0, -0.27, testa, 1.3, 0.8, 0.5, luce("#7df9ff", 2));
        braccia(blu, "#0b1418", undefined, 0.12, 0.08);
        for (const a of gambe) for (const o of a.children) o.visible = false;
        tondo(0.04, 1.5, 0.04, "#4a3020", 0, -1.25, -0.05, dx, 0.02);                   // bastone con sfera
        u.extra.push(["sfera", palla(0.09, "#7df9ff", 0, 0.32, -0.05, dx, 1, 1, 1, luce("#22d3ee", 1.6))]);
        u.veste = true;
        break; }
      case "scheggia": {                                                               // piccolo e velocissimo, caschetto e scia
        viso();
        const casco = calotta("#a3e635", 0.55, metallo); casco.scale.set(1.08, 1.12, 1.12);
        tondo(0.4, 0.1, 0.06, "#e0f2fe", 0, 0.02, -0.27, testa, 0.04, { transparent: true, opacity: 0.6 });
        for (const x_ of [-0.3, 0.3]) { const p_ = new T.Mesh(new T.ConeGeometry(0.04, 0.22, 6), m("#ffffff")); p_.position.set(x_, 0.1, 0.12); p_.rotation.set(1.3, 0, 0); testa.add(p_); }
        tuta("#ffffff"); palla(0.15, "#a3e635", 0, 0.82, -0.17, gC, 1.4, 0.35, 0.6);
        braccia("#a3e635", "#ffffff", undefined, 0.08, 0.09); gambeTuta("#a3e635", "#ffffff", undefined, 0.085);
        for (let i = 0; i < 4; i++) { const sc = palla(0.25 - i * 0.04, "#d9f99d", 0, 0.75, 0.45 + i * 0.32, gC, 1, 1.3, 1.6, { transparent: true, opacity: 0.45 - i * 0.09, emissive: "#a3e635", emissiveIntensity: 0.5, depthWrite: false });
          sc.visible = false; u.extra.push(["scia", sc]); }
        u.scala = 0.72;
        break; }
      case "cavaliere": {                                                              // armatura smeraldo, elmo con cresta, ali meccaniche
        const sm = "#0f7a55", ar = "#cbd5e1", ma = { metalness: 0.75, roughness: 0.22 };
        tuta(sm, ma, 1.15, 1.32, 0.95);
        for (const x_ of [-0.34, 0.34]) palla(0.16, ar, x_, 1.0, 0, gC, 1.1, 0.7, 1.1, ma);
        tondo(0.3, 0.35, 0.03, ar, 0, 0.62, -0.25, gC, 0.04, ma);
        braccia(sm, ar, ma, 0.1, 0.11); gambeTuta(sm, ar, ma, 0.1);
        calotta(sm, 1, ma); palla(0.2, sm, 0, -0.12, -0.08, testa, 1.25, 0.8, 1.2, ma);
        box(0.36, 0.035, 0.03, "#111827", 0, 0.0, -0.3, testa);
        for (let i = 0; i < 5; i++) palla(0.05, ar, 0, 0.3 - i * 0.015, -0.12 + i * 0.07, testa, 0.6, 1.3, 1, ma);   // cresta
        for (const x_ of [-1, 1]) { const ala = new T.Group(); ala.position.set(x_ * 0.12, 1.0, 0.24); gC.add(ala);
          for (let i = 0; i < 4; i++) { const pn = box(0.08, 0.6 - i * 0.1, 0.02, i % 2 ? ar : sm, 0, -0.1, 0, ala, ma); pn.position.x = x_ * (0.12 + i * 0.1); pn.rotation.z = x_ * (0.9 + i * 0.25); }
          ala.rotation.y = x_ * 0.35; u.extra.push(["ala", ala, x_]); }
        u.scala = 1.1;
        break; }
      case "energia": {                                                                // tutto blu luminoso, scintille che girano
        const bl = "#38bdf8", e = luce("#1d9bf0", 1.6);
        tuta(bl, e); faccia.material = m(bl, e);
        for (const o of u.occhi) { o.visible = true; o.material = m("#ffffff", luce("#ffffff", 2)); }
        braccia(bl, "#7dd3fc", e); gambeTuta(bl, "#7dd3fc", e);
        palla(0.4, "#7dd3fc", 0, 0.85, 0, gC, 1.3, 1.9, 1.1, { transparent: true, opacity: 0.12, emissive: "#38bdf8", emissiveIntensity: 1, depthWrite: false });   // alone
        for (let i = 0; i < 8; i++) u.extra.push(["scintilla", palla(0.035, "#e0f2fe", Math.cos(i * 0.785) * 0.45, 0.25 + (i * 0.37) % 1.4, Math.sin(i * 0.785) * 0.45, gC, 1, 1, 1, luce("#bae6fd", 2)), i]);
        break; }
    }
    if (u.scala) g.scale.setScalar(u.scala);
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
  <span class="gdr-aiuto"><b>Frecce</b> muovi · <b>mouse</b> gira (clic sull'ufficio per agganciarlo, Esc per sganciarlo) · Shift corre · V visuale · E scheda</span>`;
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
  let trascina = false;
  function premi(e) { if (attivo && e.button === 0) trascina = true; }
  function lascia() { trascina = false; }
  function muovi(e) {                                                    // mouse agganciato, oppure tasto premuto e trascina
    if (!attivo || (document.pointerLockElement !== tela && !trascina)) return;
    const mx_ = Math.max(-60, Math.min(60, e.movementX)), my_ = Math.max(-60, Math.min(60, e.movementY));   // niente salti se il browser manda un valore pazzo
    yaw -= mx_ * 0.0028;
    pitch = Math.max(-1.0, Math.min(0.8, pitch - my_ * 0.0028));
    U3.sveglia();
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
  const fuoco = new T.Vector3(), voluta = new T.Vector3();
  let tAn = 0;
  function passoGdr(dt) {
    if (sporca || !griglia) costruisciGriglia();
    let av_ = 0, la = 0;
    if (tasti.has("KeyW") || tasti.has("ArrowUp")) av_ += 1;
    if (tasti.has("KeyS") || tasti.has("ArrowDown")) av_ -= 1;
    if (tasti.has("KeyD") || tasti.has("ArrowRight")) la += 1;          // frecce laterali: passo di lato (a girare ci pensa il mouse)
    if (tasti.has("KeyA") || tasti.has("ArrowLeft")) la -= 1;
    const vel = (tasti.has("ShiftLeft") || tasti.has("ShiftRight") ? 6 : 3) * dt;
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
      if (va) {                                                          // si gira verso dove cammina, senza scatti
        const voluto = Math.atan2(-mx, -mz); let d = voluto - av.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d)); av.rotation.y += d * Math.min(1, dt * 12);
      }
      const o = va ? Math.sin(passo) : 0;
      u.gambe[0].rotation.x = o * 0.5; u.gambe[1].rotation.x = -o * 0.5;
      if (va) { u.sx.rotation.set(-o * 0.5, 0, 0.12); u.dx.rotation.set(o * 0.5, 0, -0.12); }
      else { u.sx.rotation.set(0.15, 0, 0.42); u.dx.rotation.set(0.15, 0, -0.42); }   // fermo: posa da eroe, pugni sui fianchi
      tAn += dt;
      u.corpo.position.y = va && !u.cingoli && !u.veste ? Math.abs(Math.cos(passo)) * 0.03 : 0;   // chi va su cingoli o in veste scivola
      if (u.cingoli || u.veste) { u.gambe[0].rotation.x = u.gambe[1].rotation.x = 0; }
      for (const [tipo, o, k] of u.extra || []) {
        if (tipo === "ruota") o.rotation.x += va ? dt * 12 : 0;
        else if (tipo === "ala") o.rotation.y = k * (0.45 + Math.sin(tAn * (va ? 9 : 2.5)) * (va ? 0.3 : 0.1));
        else if (tipo === "sfera") o.scale.setScalar(1 + Math.sin(tAn * 4) * 0.15);
        else if (tipo === "scia") o.visible = va;
        else if (tipo === "scintilla") { const a = tAn * 3 + k * 0.785, r = 0.45 + Math.sin(tAn * 2 + k) * 0.08; o.position.set(Math.cos(a) * r, 0.25 + ((k * 0.37 + tAn * 0.5) % 1.4), Math.sin(a) * r); }
      }
    }
    // telecamera (morbida: insegue il punto voluto invece di saltarci)
    const occhio = alto * 0.86, k = primaPersona ? 1 : Math.min(1, dt * 10);
    if (primaPersona) {
      camera.position.set(x + fx * 0.15, occhio + (va ? Math.abs(Math.cos(passo)) * 0.025 : 0), z + fz * 0.15);
      fuoco.set(x + fx * Math.cos(pitch) * 5, occhio + Math.sin(pitch) * 5, z + fz * Math.cos(pitch) * 5);
    } else {
      // dietro le spalle, un po' dall'alto; se dietro c'e' un muro si avvicina
      let d = distCam;
      for (let s = 0.4; s <= distCam; s += 0.2) if (pieno(x - fx * s, z - fz * s)) { d = Math.max(1.0, s - 0.3); break; }
      const h = occhio + 0.55 - pitch * d * 0.5 + (distCam - d) * 0.7;   // muro dietro: invece di schiacciarsi addosso sale e guarda dall'alto
      voluta.set(x - fx * d, Math.max(0.5, h), z - fz * d);
      camera.position.lerp(voluta, k);
      fuoco.set(x + fx * 1.5, occhio + 0.1 + Math.sin(pitch) * 1.8, z + fz * 1.5);
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
    tela.addEventListener("mousedown", premi); window.addEventListener("mouseup", lascia);
    try { const r = tela.requestPointerLock && tela.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) {}   // se il browser lo permette, mouse subito agganciato
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
    tela.removeEventListener("mousedown", premi); window.removeEventListener("mouseup", lascia); trascina = false;
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
      return LOOK.map(([k], i) => { const o = U3.nuovoOmino({ id: "gdr-eroe", donna: false }, x0 + i * 1.15, z0, "dip"); vestiEroe(o, k);
        o.userData.sedute.forEach(q => q.visible = false); o.userData.gambe.forEach(q => q.visible = true); o.userData.sx.rotation.set(0.15, 0, 0.42); o.userData.dx.rotation.set(0.15, 0, -0.42); o.rotation.y = 0; return k; });
    },
    vista(prima) { if (prima !== primaPersona) cambiaVista(); },
  };
})();

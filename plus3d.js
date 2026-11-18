// Ufficio virtuale - modalita' "3D+": omini fatti con un modello 3D vero (Quaternius "Adventurer",
// CC0, in lib/modelli) al posto di quelli disegnati col codice, e oggetti fermi piu' semplici.
// Si accende col pulsante 3D+ (localStorage "vista3dplus"). Gli omini disegnati restano dove sono
// e continuano a muoversi come prima (sono loro a decidere dove stare e cosa fare): qui sopra
// ci mettiamo il modello nuovo, che li copia (seduto, cammina, braccio alzato) e li nasconde.
(function () {
  let on = false;
  try { on = localStorage.getItem("vista3dplus") === "1"; } catch (e) {}
  if (!on || !window.THREE || !THREE.GLTFLoader) { window.Plus3D = null; return; }
  const T = THREE;
  const NASCOSTO = 1;                              // layer che la telecamera non disegna
  const voci = [];                                 // { g, corpo, look, fig, mx, azioni, attuale }
  let modello = null, A = null;
  const lin = c => new T.Color(c).convertSRGBToLinear();

  const L = new T.GLTFLoader();
  if (window.MeshoptDecoder) L.setMeshoptDecoder(MeshoptDecoder);
  L.load("/lib/modelli/omino.glb", gl => {
    gl.scene.traverse(m => {                       // normali lisce: il modello sembra piu' rotondo
      if (!m.isSkinnedMesh) return;
      let g = m.geometry;
      for (const k of Object.keys(g.attributes)) {  // il file e' compresso (numeri interi): torno ai decimali
        const a = g.attributes[k], n = a.itemSize, arr = a.array || a.data.array, f = new Float32Array(a.count * n);
        const d = !a.normalized ? 1 : arr instanceof Int16Array ? 32767 : arr instanceof Int8Array ? 127 : arr instanceof Uint16Array ? 65535 : arr instanceof Uint8Array ? 255 : 1;
        const get = [i => a.getX(i), i => a.getY(i), i => a.getZ(i), i => a.getW(i)];
        for (let i = 0; i < a.count; i++) for (let c = 0; c < n; c++) { let v = get[c](i); if (d !== 1) v = Math.max(v / d, -1); f[i * n + c] = v; }
        g.setAttribute(k, new T.BufferAttribute(f, n));
      }
      g.deleteAttribute("normal");
      g = T.BufferGeometryUtils.mergeVertices(g, 1e-4); g.computeVertexNormals(); m.geometry = g;
    });
    // misure prese dalle ossa (il riquadro della mesh compressa non e' affidabile)
    const mx = new T.AnimationMixer(gl.scene);
    mx.clipAction(clip(gl, "Idle")).play(); mx.update(0.1); gl.scene.updateMatrixWorld(true);
    const bb = new T.Box3(), v = new T.Vector3(); let anca = 0;
    gl.scene.traverse(o => { if (o.isBone) { o.getWorldPosition(v); bb.expandByPoint(v); if (/Hips/.test(o.name)) anca = v.y; } });
    mx.stopAllAction();
    const S = 1.85 / (bb.max.y - bb.min.y);              // un po' piu' alto: i mobili dell'ufficio sono grandi
    A = { S, Y: -bb.min.y * S, anca: (anca - bb.min.y) * S };
    modello = gl;
  });

  function clip(gl, nome) { return gl.animations.find(a => new RegExp("\\|" + nome + "$").test(a.name)); }

  // da chiamare alla fine di omino(): base = le mesh del vecchio omino da nascondere
  function registra(g, corpo, look, base) {
    for (const ms of base) ms.layers.set(NASCOSTO);
    voci.push({ g, corpo, look, fig: null });
  }

  function crea(v) {
    const o = T.SkeletonUtils.clone(modello.scene);
    o.scale.setScalar(A.S); o.position.y = A.Y; o.rotation.y = Math.PI;   // il vecchio omino guarda verso -z
    const lk = v.look || {};
    const colori = { Green: lk.maglia, LightGreen: lk.maglia2 || "#ffffff", Brown: lk.pantaloni, Brown2: "#1f1f24", Grey: lk.scarpe, Black: "#1f1f24", Hair: lk.capelli, Skin: lk.pelle };
    o.traverse(m => {
      if (!m.isMesh) return;
      m.userData.plus = true;
      if (/Backpack/i.test(m.name) || (m.parent && /Backpack/i.test(m.parent.name))) { m.visible = false; return; }
      m.material = m.material.clone(); m.material.skinning = true;
      const c = colori[m.material.name]; if (c) m.material.color.copy(lin(c));
      m.castShadow = true; m.frustumCulled = false;
    });
    const fig = new T.Group(); fig.add(o); v.corpo.add(fig);
    const mx = new T.AnimationMixer(o), azioni = {};
    for (const n of ["Idle", "Walk", "Wave"]) { const c = clip(modello, n); if (c) azioni[n] = mx.clipAction(c); }
    azioni.Idle.play(); mx.update(Math.random() * 2);
    const ossa = {}; o.traverse(b => { if (b.isBone) ossa[b.name.replace(/[^A-Za-z0-9]/g, "")] = b; });
    const piedi = ["FootL", "FootR"].filter(n => ossa[n]).map(n => [ossa[n], ossa[n].position.clone(), ossa[n].quaternion.clone()]);
    Object.assign(v, { fig, o, mx, azioni, ossa, piedi, attuale: "Idle" });
  }

  const _q = new T.Quaternion(), _p = new T.Quaternion(), _w = new T.Vector3();
  function gira(b, asse, ang) {                    // ruota l'osso attorno a un asse del mondo
    b.parent.getWorldQuaternion(_p); const la = asse.clone().applyQuaternion(_p.invert());
    b.quaternion.premultiply(_q.setFromAxisAngle(la, ang)); b.updateMatrixWorld(true);
  }
  const _m1 = new T.Matrix4(), _m2 = new T.Matrix4(), _m3 = new T.Matrix4();
  function siede(v, dorme) {                              // gambe piegate a 90 gradi (i piedi sono a parte: li sposto io)
    v.o.updateMatrixWorld(true);
    const fq = new T.Quaternion(); v.o.getWorldQuaternion(fq);
    const asse = new T.Vector3(-1, 0, 0).applyQuaternion(fq);
    for (const sd of ["L", "R"]) {
      const F = v.ossa["Foot" + sd], LL = v.ossa["LowerLeg" + sd], UL = v.ossa["UpperLeg" + sd];
      if (!F || !LL || !UL) continue;
      F.getWorldPosition(_w); const loc = LL.worldToLocal(_w.clone());
      const q0 = new T.Quaternion(); F.getWorldQuaternion(q0); const l0 = new T.Quaternion(); LL.getWorldQuaternion(l0);
      gira(UL, asse, 1.5); gira(LL, asse, -1.5);
      const nw = LL.localToWorld(loc.clone()); F.parent.updateMatrixWorld(true); F.position.copy(F.parent.worldToLocal(nw));
      const l1 = new T.Quaternion(); LL.getWorldQuaternion(l1);
      const nq = l1.multiply(l0.invert()).multiply(q0); F.parent.getWorldQuaternion(_p); F.quaternion.copy(_p.invert().multiply(nq));
    }
    if (dorme) {                                   // testa sulle braccia, sulla scrivania
      for (const sd of ["L", "R"]) { if (v.ossa["UpperArm" + sd]) gira(v.ossa["UpperArm" + sd], asse, 1.0); if (v.ossa["LowerArm" + sd]) gira(v.ossa["LowerArm" + sd], asse, 0.6); }
    }
  }

  function inScena(o, scena) { while (o) { if (o === scena) return true; o = o.parent; } return false; }

  function aggiorna(dt, scena) {
    if (!modello) return;
    for (let i = voci.length - 1; i >= 0; i--) {
      const v = voci[i], u = v.g.userData;
      if (!inScena(v.g, scena)) { voci.splice(i, 1); continue; }
      if (!v.fig) crea(v);
      if (!v.g.visible) continue;
      const seduto = !!(u.sedute && u.sedute[0] && u.sedute[0].visible && !(u.gambe && u.gambe[0] && u.gambe[0].visible));
      const cammina = !seduto && u.gambe && u.gambe[0] && Math.abs(u.gambe[0].rotation.x) > 0.05;
      const alza = [u.sx, u.dx].some(b => b && b.rotation.x < -1.6);           // braccio alzato (aspetta), non mano al mento
      const dorme = seduto && v.corpo.rotation.x < -0.5;                         // piegato sulla scrivania (ha finito)
      const vuole = alza ? "Wave" : cammina ? "Walk" : "Idle";
      if (vuole !== v.attuale && v.azioni[vuole]) {
        const da = v.azioni[v.attuale], a = v.azioni[vuole];
        a.reset().play(); if (da) a.crossFadeFrom(da, 0.25, false);
        v.attuale = vuole;
      }
      for (const [F, p, q] of v.piedi) { F.position.copy(p); F.quaternion.copy(q); }   // le animazioni non muovono i piedi: li rimetto a posto
      v.mx.update(dt);
      if (dorme) {                                   // il vecchio omino si piega tutto: io lo piego meno, attorno all'anca
        v.corpo.updateMatrix();
        _m1.makeTranslation(0, 0.6, 0).multiply(_m2.makeRotationX(-0.7)).multiply(_m3.makeTranslation(0, -A.anca, 0));
        _m2.copy(v.corpo.matrix).invert().multiply(_m1);
        _m2.decompose(v.fig.position, v.fig.quaternion, v.fig.scale);
      } else { v.fig.rotation.set(0, 0, 0); v.fig.position.set(0, seduto ? 0.6 - A.anca : 0, 0); }
      if (seduto) siede(v, dorme);
    }
  }

  // oggetti fermi piu' semplici: materiale opaco e piatto, niente ombre proiettate
  const cache = new Map();
  function semplifica(radice) {
    radice.traverse(m => {
      if (!m.isMesh || m.isSkinnedMesh || m.userData.plus || m.userData.semplice) return;
      m.userData.semplice = true;
      const s = m.material;
      if (!s || Array.isArray(s) || !s.isMeshStandardMaterial || s.transparent) return;
      if (s.emissive && (s.emissive.r + s.emissive.g + s.emissive.b) > 0) return;   // lampade, schermi: restano come sono
      let n = cache.get(s.uuid);
      if (!n) {
        n = new T.MeshLambertMaterial({ color: s.color.clone(), map: s.map, side: s.side, flatShading: true });
        cache.set(s.uuid, n);
      }
      m.material = n;
      if (m.layers.mask === 1) m.castShadow = false;
    });
  }

  window.Plus3D = { registra, aggiorna, semplifica };
})();

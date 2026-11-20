// Ufficio virtuale - modalita' "3D++": personaggi realistici (MakeHuman / MPFB2, CC0, in lib/umani,
// caricati con humanforge, MIT) al posto degli omini disegnati col codice.
// Si accende col pulsante 3D++ (localStorage "vista3dpp") e usa la libreria 3D nuova (lib/three170.js).
// Come nel 3D+, gli omini disegnati restano dove sono e decidono cosa fare: qui sopra ci mettiamo
// il personaggio realistico, che li copia (seduto, scrive, cammina, braccio alzato, dorme) e li nasconde.
(function () {
  let on = false;
  try { on = localStorage.getItem("vista3dpp") === "1"; } catch (e) {}
  if (!on || !window.THREE || !THREE.NUOVO || !window.Umani) return;
  const T = THREE;
  const NASCOSTO = 1;
  const voci = [];
  let pkg = null, occupato = false;
  let ual = null;                                   // animazioni vere: Quaternius Universal Animation Library (CC0)
  Promise.all([
    Umani.loadHumanPackage("/lib/umani"),
    new Promise((ok, ko) => new T.GLTFLoader().load("/lib/umani/animazioni/AnimationLibrary_Godot_Standard.gltf", ok, undefined, ko)),
  ]).then(([p, g]) => { pkg = p; ual = g; }).catch(e => console.warn("3D++: personaggi non caricati", e));

  // corrispondenza fra le ossa dello scheletro delle animazioni (Rigify) e quello dei personaggi (Mixamo)
  const MAPPA = [["hips", "Hips"], ["spine.001", "Spine"], ["spine.002", "Spine1"], ["spine.003", "Spine2"], ["neck", "Neck"], ["head", "Head"]];
  for (const [l, L] of [["L", "Left"], ["R", "Right"]]) {
    for (const [a, b] of [["upper_arm", "Arm"], ["forearm", "ForeArm"], ["hand", "Hand"], ["thigh", "UpLeg"], ["shin", "Leg"], ["foot", "Foot"], ["toe", "ToeBase"]]) MAPPA.push([a + "." + l, L + b]);
    for (const [f, F] of [["f_index", "Index"], ["f_middle", "Middle"], ["f_ring", "Ring"], ["f_pinky", "Pinky"], ["thumb", "Thumb"]]) for (let k = 1; k <= 3; k++) MAPPA.push([f + ".0" + k + "." + l, L + "Hand" + F + k]);
  }
  const FIGLIO = { upper_arm: "forearm", forearm: "hand", hand: "f_middle.01", thigh: "shin", shin: "foot", foot: "toe" };
  const nomeUal = n => T.PropertyBinding.sanitizeNodeName("DEF-" + n);
  // prepara il passaggio delle animazioni a un personaggio: per ogni osso la rotazione di riposo dei due scheletri
  // (gli arti si allineano per direzione: i personaggi stanno in posa ad A, le animazioni a T; bacino e schiena no)
  function prepara(v) {
    const src = T.SkeletonUtils.clone(ual.scene); src.updateMatrixWorld(true);
    const mixer = new T.AnimationMixer(src), azioni = {};
    for (const n of ["Sitting_Idle_Loop", "Sitting_Talking_Loop", "Idle_Loop", "Walk_Loop"]) azioni[n] = mixer.clipAction(T.AnimationClip.findByName(ual.animations, n));
    const gq = v.av.group.getWorldQuaternion(new T.Quaternion()), gqi = gq.clone().invert(), coppie = [];
    for (const [sn, dn] of MAPPA) {
      const sb = src.getObjectByName(nomeUal(sn)), db = v.ossa[dn]; if (!sb || !db) continue;
      const base = sn.replace(/\.[LR]$/, ""), lr = sn.slice(-2);
      let cn = FIGLIO[base] ? FIGLIO[base] + lr : /0[12]$/.test(base) ? base.replace(/0([12])$/, (m, k) => "0" + (+k + 1)) + lr : null;
      if (/^(hips|spine|neck|head)/.test(sn)) cn = null;
      const sc = cn && src.getObjectByName(nomeUal(cn)), dnf = cn && (MAPPA.find(m => m[0] === cn) || [])[1], dc = dnf && v.ossa[dnf];
      let A = new T.Quaternion();
      if (sc && dc) {
        const sd = sc.getWorldPosition(new T.Vector3()).sub(sb.getWorldPosition(new T.Vector3())).normalize();
        const dd = dc.getWorldPosition(new T.Vector3()).sub(db.getWorldPosition(new T.Vector3())).applyQuaternion(gqi).normalize();
        A.setFromUnitVectors(dd, sd);
      } else if (!/^(hips|spine|neck|head)/.test(sn)) { const c = coppie.find(c => c.db === db.parent); if (c) A.copy(c.A); }
      const dR = A.clone().multiply(gqi.clone().multiply(db.getWorldQuaternion(new T.Quaternion())));
      coppie.push({ sb, db, A, sR: sb.getWorldQuaternion(new T.Quaternion()).invert(), dR,
        braccio: /Arm|Hand/.test(dn), gamba: /Hips|UpLeg|Leg|Foot|Toe/.test(dn), destro: dn.startsWith("Right"), schiena: /Spine|Neck|Head/.test(dn) });
    }
    const sh = src.getObjectByName(nomeUal("hips"));
    const hipS = sh.getWorldPosition(new T.Vector3()), hipD = v.av.group.worldToLocal(v.ossa.Hips.getWorldPosition(new T.Vector3()));
    Object.assign(v, { src, mixer, azioni, coppie, sh, hipS, hipD, scalaAnca: (hipD.y) / hipS.y, clip: null });
  }
  const _a = new T.Quaternion(), _b = new T.Quaternion(), _I = new T.Quaternion(), _v = new T.Vector3();
  function retarget(v, salta, muoviAnca, smorza) {
    const gq = v.av.group.getWorldQuaternion(new T.Quaternion());
    for (const c of v.coppie) {
      if (salta(c)) continue;
      c.sb.getWorldQuaternion(_a).multiply(c.sR);                       // quanto si e' girato l'osso dell'animazione
      if (smorza && c.schiena) _a.slerp(_I, smorza);
      _a.multiply(c.dR).premultiply(gq);
      c.db.parent.getWorldQuaternion(_b).invert();
      c.db.quaternion.copy(_b.multiply(_a)); c.db.updateMatrixWorld(true);
    }
    if (muoviAnca) {
      v.sh.getWorldPosition(_v).sub(v.hipS).multiplyScalar(v.scalaAnca); _v.x = 0; _v.z = 0; _v.add(v.hipD);   // solo su e giu'
      v.av.group.localToWorld(_v); v.ossa.Hips.parent.worldToLocal(_v); v.ossa.Hips.position.copy(_v); v.ossa.Hips.updateMatrixWorld(true);
    }
  }
  function suona(v, nome, dt) {                                         // cambia animazione con una breve dissolvenza
    if (v.clip !== nome) {
      const a = v.azioni[nome], da = v.clip && v.azioni[v.clip];
      a.reset().play(); a.time = Math.random() * a.getClip().duration;
      if (da) a.crossFadeFrom(da, 0.3, false);
      v.clip = nome;
    }
    v.mixer.update(dt); v.src.updateMatrixWorld(true);
  }

  // ---------- aspetto: dal look dell'omino alla configurazione del personaggio ----------
  const scegli = (h, lista) => lista[h % lista.length];
  const grigio = c => { const k = new T.Color(c); return k.r > 0.45 && Math.abs(k.r - k.b) < 0.08; };
  function configura(lk) {
    const h = lk.h >>> 0, donna = !!lk.donna, eta = lk.vecchio ? 0.9 : grigio(lk.capelli || "#000") ? 0.6 : lk.capo || lk.ruolo === "resp" ? 0.4 : 0.25;
    const fascia = eta > 0.8 ? "old" : eta > 0.5 ? "middleage" : "young";
    const scuro = new T.Color(lk.pelle || "#e8b896").r < 0.82;
    const skin = (scuro && !donna ? "young_asian" : fascia + "_caucasian") + (donna ? "_female" : "_male");
    let vestiti, ricolora = null;
    if (lk.capo) vestiti = "male_elegantsuit01";
    else if (lk.ruolo === "resp") vestiti = donna ? scegli(h >>> 3, ["toigo_female_suit", "toigo_female_double-breasted_suit"]) : scegli(h >>> 3, ["male_elegantsuit01", "toigo_male_suit_3", "toigo_male_double-breasted_suit"]);
    else if (lk.segr) vestiti = "toigo_halter_dress_knee_length";
    else if (lk.tuta || lk.ruolo === "operaio") vestiti = "male_worksuit01";
    else if (lk.vecchio) vestiti = "male_casualsuit01";
    else if (donna) vestiti = scegli(h >>> 3, ["female_elegantsuit01", "toigo_shift_dress"]);
    else { vestiti = "male_casualsuit05"; ricolora = lk.maglia; }          // maglietta bianca: la tingo del colore della polo / maglione
    const capelli = lk.calvo ? null : donna ? scegli(h >>> 5, ["toigo_blunt_bob", "ponytail01", "long01", "bob02"]) : scegli(h >>> 5, ["short02", "short04", "short01", "short03"]);
    const scarpe = donna ? scegli(h >>> 7, ["shoes04", "shoes06"]) : scegli(h >>> 7, ["shoes01", "shoes02"]);
    return {
      cfg: { gender: donna ? 0 : 1, age: eta, muscle: lk.capo ? 0.75 : 0.5, weight: 0.5, skin, eyes: scegli(h >>> 9, ["brown", "brown", "blue", "green", "grey"]),
        hair: capelli, hairColor: lk.capelli || "#2b1d14", clothes: [vestiti, scarpe] },
      vestiti, ricolora,
    };
  }

  // tinge le parti chiare e poco colorate della texture (la maglietta bianca), lasciando i jeans
  const tinte = new Map();
  function tingi(mat, colore) {
    if (!mat.map || !mat.map.image) return;
    const k = mat.map.uuid + colore;
    if (!tinte.has(k)) {
      const img = mat.map.image, c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
      const x = c.getContext("2d"); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height), p = d.data, t = new T.Color(colore);
      const tr = t.r * 255, tg = t.g * 255, tb = t.b * 255;
      for (let i = 0; i < p.length; i += 4) {
        const r = p[i], g = p[i + 1], b = p[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        if (mx > 120 && (mx - mn) < 40) { const l = mx / 255; p[i] = tr * l; p[i + 1] = tg * l; p[i + 2] = tb * l; }
      }
      x.putImageData(d, 0, 0);
      const tx = new T.CanvasTexture(c); tx.flipY = mat.map.flipY; tx.colorSpace = mat.map.colorSpace; tx.anisotropy = 4;
      tinte.set(k, tx);
    }
    mat.map = tinte.get(k); mat.needsUpdate = true;
  }

  function mesh(geo, col, x, y, z, padre, extra) {
    const m = new T.Mesh(geo, new T.MeshStandardMaterial(Object.assign({ color: col, roughness: 0.45 }, extra)));
    m.position.set(x, y, z); m.castShadow = true; m.userData.plus = true; padre.add(m); return m;
  }
  // accessori in metri attaccati a un osso (seguono i movimenti)
  function attacca(v, osso, costruisci) {
    const b = v.ossa[osso]; if (!b) return;
    v.av.group.updateMatrixWorld(true);
    const acc = new T.Group(); b.getWorldPosition(acc.position);
    const qc = v.av.group.getWorldQuaternion(new T.Quaternion());           // assi del corpo (avanti = +z)
    acc.quaternion.copy(qc);
    const s = new T.Vector3(); v.av.group.getWorldScale(s); acc.scale.setScalar(s.x);
    costruisci(acc); acc.updateMatrixWorld(true); b.attach(acc);         // misure in metri del personaggio
  }
  function accessori(v) {
    const lk = v.look;
    attacca(v, "RightHand", g => {                                       // cornetta: si vede solo quando l'omino telefona
      v.tel = new T.Group(); g.add(v.tel); v.tel.visible = false;
      mesh(new T.BoxGeometry(0.05, 0.2, 0.045), "#22252c", 0.0, 0.09, 0.03, v.tel, { roughness: 0.4 });
      mesh(new T.BoxGeometry(0.06, 0.05, 0.05), "#22252c", 0.0, 0.2, 0.05, v.tel);
      mesh(new T.BoxGeometry(0.06, 0.05, 0.05), "#22252c", 0.0, -0.01, 0.05, v.tel);
    });
    if (lk.ruolo === "postino") attacca(v, "Head", g => {                // il giocatore: cuffione da gamer
      const arco = mesh(new T.TorusGeometry(0.105, 0.012, 6, 20, Math.PI), "#1e1e24", 0, 0.1, 0, g, { roughness: 0.4 });
      arco.rotation.y = Math.PI / 2;
      for (const sx of [-0.1, 0.1]) { const c = mesh(new T.CylinderGeometry(0.05, 0.05, 0.035, 16), "#2f9e44", sx, 0.06, 0.0, g, { roughness: 0.4 });
        c.rotation.z = Math.PI / 2; }
    });
    if (lk.occhiali) attacca(v, "Head", g => {
      const q = g;
      const r = new T.TorusGeometry(0.026, 0.0035, 6, 20);
      for (const sx of [-0.032, 0.032]) mesh(r, lk.occhiali, sx, 0.075, 0.092, q, { metalness: 0.3 });
      mesh(new T.BoxGeometry(0.016, 0.004, 0.004), lk.occhiali, 0, 0.078, 0.094, q);
      for (const sx of [-0.06, 0.06]) mesh(new T.BoxGeometry(0.003, 0.004, 0.09), lk.occhiali, sx, 0.078, 0.05, q);
    });
    if (lk.capo) attacca(v, "Head", g => {                                // corona d'oro
      const q = g;
      const oro = { metalness: 0.7, roughness: 0.25, emissive: new T.Color("#3a2600") };
      mesh(new T.CylinderGeometry(0.085, 0.08, 0.045, 24, 1, true), "#e8b84a", 0, 0.185, 0.0, q, Object.assign({ side: T.DoubleSide }, oro));
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2;
        mesh(new T.ConeGeometry(0.016, 0.045, 8), "#e8b84a", Math.sin(a) * 0.082, 0.225, Math.cos(a) * 0.082, q, oro);
        mesh(new T.SphereGeometry(0.009, 8, 6), "#c81e3c", Math.sin(a) * 0.082, 0.25, Math.cos(a) * 0.082, q, { roughness: 0.2 }); }
    });
  }

  // ---------- creazione (uno alla volta, per non bloccare la pagina) ----------
  function registra(g, corpo, look, base) {
    voci.push({ g, corpo, look, base, fig: null });                // il vecchio omino resta visibile finche' il personaggio non e' pronto
  }

  async function crea(v) {
    const { cfg, vestiti, ricolora } = configura(v.look);
    const av = new Umani.HumanAvatar(pkg); av.textureSize = "1k"; av.normalMaps = false;
    await av.setConfig(cfg);
    av.group.traverse(m => {
      if (!m.isMesh) return;
      m.castShadow = !/eyes|eyebrow|eyelash|hair|teeth|tongue/.test(m.name);   // ombre solo da corpo e vestiti (piu' leggero)
      m.receiveShadow = false; m.frustumCulled = false; m.userData.plus = true;
      if (/teeth|tongue/.test(m.name)) m.visible = false;                 // denti e lingua non si vedono: non li disegno
      if (ricolora && /clothes-male_casualsuit05/.test(m.name)) tingi(m.material, ricolora);
    });
    const fig = new T.Group(); fig.add(av.group);
    av.group.rotation.y = Math.PI;                                     // il vecchio omino guarda verso -z
    av.group.updateMatrixWorld(true);
    const ossa = {}; for (const b of av.bones) ossa[b.name.replace("mixamorig:", "")] = b;
    const v3 = new T.Vector3(), alto = ossa.Head.getWorldPosition(new T.Vector3()).y + 0.11;
    const S = (v.look.donna ? 1.76 : 1.85) / alto;                     // alti come gli omini del 3D+ (i mobili sono grandi)
    av.group.scale.setScalar(S); av.group.updateMatrixWorld(true);
    const anca = ossa.Hips.getWorldPosition(v3).y;
    v.corpo.add(fig);
    Object.assign(v, { av, fig, ossa, S, anca, riposo: av.bones.map(b => [b, b.position.clone(), b.quaternion.clone()]), fase: Math.random() * 10 });
    prepara(v);
    accessori(v);
    for (const ms of v.base) ms.layers.set(NASCOSTO);                  // pronto: adesso si puo' nascondere l'omino disegnato
    const tv = v.g.userData.telefono;                                  // anche la cornetta grande del 3D: qui c'e' quella in mano
    if (tv) tv.traverse(m => m.layers.set(NASCOSTO));
  }

  // ---------- pose ----------
  const _q = new T.Quaternion(), _p = new T.Quaternion();
  function gira(b, asse, ang) {                                        // ruota l'osso attorno a un asse del mondo
    if (!b) return;
    b.parent.getWorldQuaternion(_p); const la = asse.clone().applyQuaternion(_p.invert());
    b.quaternion.premultiply(_q.setFromAxisAngle(la, ang)); b.updateMatrixWorld(true);
  }
  const _v1 = new T.Vector3(), _v2 = new T.Vector3(), _v3 = new T.Vector3(), _q2 = new T.Quaternion();
  function punta(b, figlio, meta) {                                    // ruota l'osso perché il figlio punti verso "meta" (mondo)
    b.getWorldPosition(_v2); figlio.getWorldPosition(_v3);
    const ora = _v3.sub(_v2).normalize(), voglio = meta.clone().sub(_v2).normalize();
    _q2.setFromUnitVectors(ora, voglio);
    b.parent.getWorldQuaternion(_p); b.getWorldQuaternion(_q);
    b.quaternion.copy(_p.invert().multiply(_q2).multiply(_q)); b.updateMatrixWorld(true);
  }
  const _m1 = new T.Matrix4(), _m2 = new T.Matrix4(), _m3 = new T.Matrix4();
  function posa(v, st, t, dt) {
    const o = v.ossa;
    for (const [b, p, q] of v.riposo) { b.position.copy(p); b.quaternion.copy(q); }
    if (st.seduto) {                                                   // anca ferma sulla sedia (chi dorme si piega in avanti)
      v.corpo.updateMatrix();
      _m1.makeTranslation(0, 0.6, 0).multiply(_m3.makeTranslation(0, -v.anca, 0));
      _m2.copy(v.corpo.matrix).invert().multiply(_m1);
      _m2.decompose(v.fig.position, v.fig.quaternion, v.fig.scale);
    } else { v.fig.position.set(0, 0, 0); v.fig.quaternion.identity(); v.fig.scale.set(1, 1, 1); }
    v.fig.updateMatrixWorld(true);
    const fq = v.av.group.getWorldQuaternion(new T.Quaternion());
    const lato = new T.Vector3(1, 0, 0).applyQuaternion(fq), avanti = new T.Vector3(0, 0, 1).applyQuaternion(fq), su = new T.Vector3(0, 1, 0);
    const k = t + v.fase;
    const braccia = st.seduto && (st.scrive || st.dorme);            // braccia guidate da me (tastiera, testa sulle braccia)
    // animazione vera per tutto il resto: le clavicole restano ferme (copiate spingono indietro le spalle)
    if (st.cammina) { suona(v, "Walk_Loop", dt); retarget(v, c => false, true, 0.6); }
    else if (st.seduto) { suona(v, st.parla ? "Sitting_Talking_Loop" : "Sitting_Idle_Loop", dt); retarget(v, c => c.gamba || (braccia && c.braccio) || (st.dorme && c.schiena), false, 0.3); }
    else { suona(v, "Idle_Loop", dt); retarget(v, c => c.gamba || (st.alza && c.braccio && c.destro), false, 0.3); }
    if (braccia) { gira(o.LeftArm, avanti, -0.95); gira(o.RightArm, avanti, 0.95); }
    if (st.alza && !st.cammina && !braccia) gira(o.RightArm, avanti, 0.95);
    if (st.seduto) {
      for (const sd of ["Left", "Right"]) {                           // gambe dritte in avanti, ginocchia non divaricate
        gira(o[sd + "UpLeg"], lato, -1.55); gira(o[sd + "UpLeg"], su, sd === "Left" ? -0.13 : 0.13); gira(o[sd + "Leg"], lato, 1.55);
      }
      if (st.dorme) {                                                  // dorme: schiena curva in avanti, testa appoggiata sulle braccia incrociate
        for (const n of ["Spine", "Spine1", "Spine2"]) gira(o[n], lato, 0.33);
        gira(o.Neck, lato, 0.4);
      }
      if (braccia) for (const sd of ["Left", "Right"]) {
        const fa = o[sd + "ForeArm"], ha = o[sd + "Hand"], s1 = sd === "Left" ? -1 : 1;
        if (st.dorme) {                                                // gomiti sul piano, avambracci incrociati davanti alla testa
          punta(o[sd + "Arm"], fa, _v1.set(s1 * 0.25, 0.88, -0.47).applyMatrix4(v.g.matrixWorld));
          punta(fa, ha, _v1.set(-s1 * 0.1, sd === "Left" ? 0.89 : 0.92, -0.6).applyMatrix4(v.g.matrixWorld));
        } else {
          const bt = st.scrive ? Math.sin(k * 13 + (sd === "Left" ? 0 : 2)) * 0.06 : 0;
          gira(o[sd + "Arm"], lato, -1.0); gira(o[sd + "Arm"], avanti, sd === "Left" ? 0.1 : -0.1);
          gira(fa, lato, -0.45 + bt);
        }
        const dir = ha.getWorldPosition(new T.Vector3()).sub(fa.getWorldPosition(new T.Vector3())).normalize();
        gira(fa, dir, sd === "Left" ? 1.4 : -1.4);                          // palmi verso il basso
      }
      if (st.dorme) gira(o.Head, lato, 0.35);
    }
    if (st.telefona) {                                                 // cornetta all'orecchio: gomito giu' di lato, mano alla testa
      const testa = o.Head.getWorldPosition(new T.Vector3()), sp = o.RightArm.getWorldPosition(new T.Vector3());
      punta(o.RightArm, o.RightForeArm, sp.clone().addScaledVector(su, -0.2).addScaledVector(avanti, 0.2).addScaledVector(lato, -0.06));
      punta(o.RightForeArm, o.RightHand, testa.addScaledVector(lato, -0.1).addScaledVector(su, 0.08));
    } else if (st.alza) { gira(o.RightArm, avanti, -2.3); gira(o.RightForeArm, lato, -0.3); }   // braccio alzato: aspetta Stefano
  }

  function inScena(o, scena) { while (o) { if (o === scena) return true; o = o.parent; } return false; }

  let tempo = 0;
  function aggiorna(dt, scena) {
    tempo += dt;
    if (!pkg || !ual) return;
    for (let i = voci.length - 1; i >= 0; i--) {
      const v = voci[i], u = v.g.userData;
      if (!inScena(v.g, scena)) { if (v.fig) v.fig.removeFromParent(); voci.splice(i, 1); continue; }
      if (!v.fig) {
        if (!occupato && !v.inCorso) { occupato = v.inCorso = true; crea(v).catch(e => { console.warn("3D++", e); v.errore = true; }).finally(() => { occupato = false; }); }
        continue;
      }
      if (!v.g.visible) continue;
      const seduto = !!(u.sedute && u.sedute[0] && u.sedute[0].visible && !(u.gambe && u.gambe[0] && u.gambe[0].visible));
      const passo = u.gambe && u.gambe[0] ? u.gambe[0].rotation.x : 0;
      const st = {
        seduto, passo, cammina: !seduto && Math.abs(passo) > 0.05,
        alza: [u.sx, u.dx].some(b => b && b.rotation.x < -1.6),
        dorme: seduto && v.corpo.rotation.x < -0.5,
      };
      st.scrive = seduto && !st.dorme && !st.alza && !!u.s && ["lavora", "supervisore"].includes(u.s.stato);
      st.parla = st.seduto && !u.s;                                  // in riunione: parlano
      st.telefona = !!(u.telefono && u.telefono.visible);
      if (st.telefona) st.alza = false;
      if (v.tel) v.tel.visible = st.telefona;
      posa(v, st, tempo, dt);
    }
  }

  window.Plus3D = { registra, aggiorna, semplifica() {} };
})();

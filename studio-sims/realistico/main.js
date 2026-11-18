import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { HumanAvatar, loadHumanPackage } from 'humanforge/human';
const T = THREE, W = 1280, H = 720;
const r = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
r.setSize(W, H); r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap; document.body.appendChild(r.domElement);
const s = new T.Scene(); s.background = new T.Color('#cfe3ee');
s.environment = new T.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
s.environmentIntensity = 0.55;
const cam = new T.PerspectiveCamera(30, W / H, 0.1, 100);
s.add(new T.HemisphereLight('#fff7ea', '#b89a74', 0.6));
const sun = new T.DirectionalLight('#ffe7c4', 2.2); sun.position.set(-4, 7, 5); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5 }); sun.shadow.bias = -0.0004; sun.shadow.radius = 4; s.add(sun);
const box = (w, h, d, c, x, y, z, rough = 0.8) => { const o = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshStandardMaterial({ color: c, roughness: rough })); o.position.set(x, y + h / 2, z); o.receiveShadow = true; o.castShadow = true; s.add(o); return o; };
box(9, 0.04, 7, '#b88a5c', 0, -0.04, 0, 0.6);                 // parquet chiaro
box(9, 2.7, 0.12, '#ece5d8', 0, 0, -3.5); box(0.12, 2.7, 7, '#e8e0d0', -4.5, 0, 0);
box(9, 0.9, 0.02, '#8fa58c', 0, 0, -3.43);                    // boiserie
box(2.4, 0.01, 1.7, '#4f6378', 2.2, 0, 1.1, 1);               // tappeto
const L = new GLTFLoader(); const load = f => new Promise(res => L.load(f, res));
function fit(o, dim, val) { const b = new T.Box3().setFromObject(o), z = b.getSize(new T.Vector3()); o.scale.multiplyScalar(val / z[dim]); const b2 = new T.Box3().setFromObject(o); const c = b2.getCenter(new T.Vector3()); o.position.x -= c.x; o.position.z -= c.z; o.position.y -= b2.min.y; }
function place(src, dim, val, x, z, ry = 0, y = 0) { const o = src.scene.clone(true); fit(o, dim, val); const g = new T.Group(); g.add(o); g.position.set(x, y, z); g.rotation.y = ry; g.traverse(m => { if (m.isMesh) { m.castShadow = m.receiveShadow = true; m.material = new T.MeshStandardMaterial({ color: m.material.color, roughness: 0.75 }); } }); s.add(g); return g; }

const asse = new T.Vector3(1, 0, 0), _p = new T.Quaternion(), _q = new T.Quaternion();
function gira(b, ax, ang) { b.parent.getWorldQuaternion(_p); const la = ax.clone().applyQuaternion(_p.invert()); b.quaternion.premultiply(_q.setFromAxisAngle(la, ang)); b.updateMatrixWorld(true); }
function bone(av, n) { return av.bones.find(b => b.name === 'mixamorig:' + n); }
const persone = [];
const MAPPA = [['hips', 'Hips'], ['spine.001', 'Spine'], ['spine.002', 'Spine1'], ['spine.003', 'Spine2'], ['neck', 'Neck'], ['head', 'Head']];
for (const [l, L] of [['L', 'Left'], ['R', 'Right']]) {
  for (const [a, b] of [['shoulder', 'Shoulder'], ['upper_arm', 'Arm'], ['forearm', 'ForeArm'], ['hand', 'Hand'], ['thigh', 'UpLeg'], ['shin', 'Leg'], ['foot', 'Foot'], ['toe', 'ToeBase']]) MAPPA.push([a + '.' + l, L + b]);
  for (const [f, F] of [['f_index', 'Index'], ['f_middle', 'Middle'], ['f_ring', 'Ring'], ['f_pinky', 'Pinky'], ['thumb', 'Thumb']]) for (let k = 1; k <= 3; k++) MAPPA.push([f + '.0' + k + '.' + l, L + 'Hand' + F + k]);
}
const _a = new T.Quaternion(), _b = new T.Quaternion(), _v = new T.Vector3();
const _I = new T.Quaternion();
function retarget(p, salta, fermiFianchi, smorza) {
  const { av } = p; const gq = av.group.getWorldQuaternion(new T.Quaternion());
  for (const c of p.coppie) {
    if (salta && salta(c)) continue;
    if (/Shoulder/.test(c.db.name)) continue;
    c.sb.getWorldQuaternion(_a).multiply(c.sR);              // delta mondo sorgente
    if (smorza && /Spine|Neck|Head/.test(c.db.name)) _a.slerp(_I, smorza);
    _a.multiply(c.dR); _a.premultiply(gq);                     // mondo destinazione
    c.db.parent.getWorldQuaternion(_b).invert();
    c.db.quaternion.copy(_b.multiply(_a)); c.db.updateMatrixWorld(true);
  }
  if (fermiFianchi) return;
  p.sh.getWorldPosition(_v).sub(p.hipS).multiplyScalar(p.scala).add(p.hipD);
  av.group.localToWorld(_v); p.dh.parent.worldToLocal(_v); p.dh.position.copy(_v); av.group.updateMatrixWorld(true);
}
(async () => {
  const [desk, chair, scr, kb, plant] = await Promise.all(['desk.glb', 'chairDesk.glb', 'computerScreen.glb', 'computerKeyboard.glb', 'pottedPlant.glb'].map(load));
  const pkg = await loadHumanPackage('/human');
  const ual = await load('AnimationLibrary_Godot_Standard.gltf');
  window.clipNames = ual.animations.map(a => a.name);
  const scrivanie = [[-1.4, -2.2], [0.6, -2.2]];
  for (const [x, z] of scrivanie) { place(desk, 'x', 1.4, x, z); place(scr, 'x', 0.55, x, z - 0.15, 0, 0.74); place(kb, 'x', 0.42, x, z + 0.12, 0, 0.74); const ch = place(chair, 'y', 1.0, x, z + 0.52, Math.PI); ch.traverse(m => { if (m.isMesh) m.material.color.multiplyScalar(0.35); }); }
  place(plant, 'y', 1.2, -3.9, -3.0); place(plant, 'y', 1.0, 3.9, -3.0);
  const cfg = [
    { gender: 0.0, age: 0.25, skin: 'young_caucasian_female', hair: 'toigo_blunt_bob', hairColor: '#2b1a10', clothes: ['toigo_female_suit', 'shoes02'], eyes: 'green' },
    { gender: 1.0, age: 0.35, skin: 'middleage_caucasian_male', hair: 'short02', hairColor: '#3a2a1e', clothes: ['toigo_male_suit_3', 'shoes01'], eyes: 'brown', muscle: 0.6 },
    { gender: 1.0, age: 0.2, skin: 'young_african_male', hair: 'short01', hairColor: '#111', clothes: ['male_casualsuit04', 'shoes03'], eyes: 'brown' },
    { gender: 0.0, age: 0.3, skin: 'young_asian_female', hair: 'ponytail01', hairColor: '#120c08', clothes: ['female_elegantsuit01', 'shoes04'], eyes: 'brown' },
    { gender: 1.0, age: 0.5, skin: 'middleage_caucasian_male', hair: 'short04', hairColor: '#6b6b6b', clothes: ['toigo_male_suit_3', 'shoes01'], eyes: 'blue' },
  ];
  const pos = [[-1.4, -1.63, Math.PI, 'siede'], [0.6, -1.63, Math.PI, 'siede'], [1.9, 1.0, 2.11, 'parla'], [2.9, 0.4, -1.03, 'ascolta'], [-3.5, -0.55, Math.PI / 2, 'cammina']];
  const CLIP = { siede: 'Sitting_Idle_Loop', parla: 'Idle_Talking_Loop', ascolta: 'Idle_Loop', cammina: 'Walk_Formal_Loop' };
  for (let i = 0; i < cfg.length; i++) {
    const av = new HumanAvatar(pkg); await av.setConfig(cfg[i]);
    av.group.position.set(pos[i][0], 0, pos[i][1]); av.group.rotation.y = pos[i][2];
    av.group.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; } });
    s.add(av.group); av.group.updateMatrixWorld(true);
    const rest = av.bones.map(b => b.quaternion.clone());
    const restP = av.bones.map(b => b.position.clone());
    const src = skClone(ual.scene); src.updateMatrixWorld(true);
    const mixer = new T.AnimationMixer(src); mixer.clipAction(T.AnimationClip.findByName(ual.animations, CLIP[pos[i][3]])).play();
    const gq = av.group.getWorldQuaternion(new T.Quaternion()), gqi = gq.clone().invert();
    const coppie = [];
    for (const [sn, dn] of MAPPA) {
      const sb = src.getObjectByName(T.PropertyBinding.sanitizeNodeName('DEF-' + sn)), db = bone(av, dn);
      if (!sb || !db) continue;
      const dR = gqi.clone().multiply(db.getWorldQuaternion(new T.Quaternion()));
      const FIGLIO = { 'upper_arm': 'forearm', 'forearm': 'hand', 'hand': 'f_middle.01', 'thigh': 'shin', 'shin': 'foot', 'foot': 'toe', 'shoulder': 'upper_arm' };
      const base = sn.replace(/\.[LR]$/, ''), lr = sn.slice(-2);
      let cn = FIGLIO[base] ? FIGLIO[base] + lr : (/0[12]$/.test(base) ? base.replace(/0([12])$/, (m, k) => '0' + (+k + 1)) + lr : null);
      if (/^(hips|spine|neck|head)/.test(sn)) cn = null;
      const sc = cn && src.getObjectByName(T.PropertyBinding.sanitizeNodeName('DEF-' + cn));
      const dnFiglio = cn && MAPPA.find(m => m[0] === cn)?.[1]; const dc = dnFiglio && bone(av, dnFiglio);
      let A = null;
      if (sc && dc) {
        const sd = sc.getWorldPosition(new T.Vector3()).sub(sb.getWorldPosition(new T.Vector3())).normalize();
        const dd = dc.getWorldPosition(new T.Vector3()).sub(db.getWorldPosition(new T.Vector3())).applyQuaternion(gqi).normalize();
        A = new T.Quaternion().setFromUnitVectors(dd, sd);
      } else A = /^(hips|spine|neck|head)/.test(sn) ? new T.Quaternion() : (coppie.find(c => c.db === db.parent)?.A || new T.Quaternion());
      coppie.push({ sb, db, A, sR: sb.getWorldQuaternion(new T.Quaternion()).invert(), dR: A.clone().multiply(dR), braccio: /Shoulder|Arm|Hand/.test(dn), gamba: /Hips|UpLeg|Leg|Foot|Toe/.test(dn), sx: dn.startsWith('Left') });
    }
    const sh = src.getObjectByName('DEF-hips'), dh = bone(av, 'Hips');
    const hipS = sh.getWorldPosition(new T.Vector3()), hipD = av.group.worldToLocal(dh.getWorldPosition(new T.Vector3()));
    persone.push({ av, tipo: pos[i][3], rest, restP, fase: i * 1.3, src, mixer, coppie, sh, dh, hipS, hipD, scala: hipD.y / hipS.y, x0: pos[i][0], dy: 0 });
  }
  window.ready = true;
})();
function posa(p, t) {
  const { av, tipo, rest } = p; av.bones.forEach((b, i) => { b.quaternion.copy(rest[i]); b.position.copy(p.restP[i]); });
  const k = t + p.fase;
  if (tipo === 'cammina') { const L = 6, v = 1.1, d = (k * v) % L; av.group.position.x = p.x0 + d; }
  av.group.updateMatrixWorld(true);
  p.mixer.setTime(k); p.src.updateMatrixWorld(true);
  const fq = new T.Quaternion(); av.group.getWorldQuaternion(fq);
  const lato = new T.Vector3(1, 0, 0).applyQuaternion(fq), avanti = new T.Vector3(0, 0, 1).applyQuaternion(fq);
  if (tipo === 'siede') {
    retarget(p, c => c.braccio);
    if (!p.fissato) { p.fissato = true; const h = p.dh.getWorldPosition(new T.Vector3()); av.group.position.x += p.x0 - h.x; av.group.position.z += -1.60 - h.z; av.group.position.y += 0.56 - h.y; av.group.updateMatrixWorld(true); retarget(p, c => c.braccio); }
    for (const sd of ['Left', 'Right']) {
      const bt = Math.sin(k * 13 + (sd === 'Left' ? 0 : 2)) * 0.06;
      gira(bone(av, sd + 'Arm'), avanti, sd === 'Left' ? -0.95 : 0.95);
      gira(bone(av, sd + 'Arm'), lato, -1.0); gira(bone(av, sd + 'Arm'), avanti, sd === 'Left' ? 0.1 : -0.1); gira(bone(av, sd + 'ForeArm'), lato, -0.45 + bt);
      const fa = bone(av, sd + 'ForeArm'), ha = bone(av, sd + 'Hand'); const dir = ha.getWorldPosition(new T.Vector3()).sub(fa.getWorldPosition(new T.Vector3())).normalize();
      gira(fa, dir, sd === 'Left' ? 1.4 : -1.4);
    }
  } else if (tipo === 'ascolta') {
    retarget(p, c => c.gamba || (c.braccio && c.sx), true);
    gira(bone(av, 'LeftArm'), avanti, -0.95); gira(bone(av, 'LeftArm'), lato, -0.25); gira(bone(av, 'LeftForeArm'), lato, -1.3);
    if (!p.tazza) {
      const m = new T.Group(); const mat = new T.MeshStandardMaterial({ color: '#f4efe6', roughness: 0.3 });
      const c = new T.Mesh(new T.CylinderGeometry(0.042, 0.036, 0.095, 28, 1, true), mat); c.material.side = T.DoubleSide; m.add(c);
      const f = new T.Mesh(new T.CircleGeometry(0.036, 24), mat); f.rotation.x = Math.PI / 2; f.position.y = -0.047; m.add(f);
      const caffe = new T.Mesh(new T.CircleGeometry(0.039, 24), new T.MeshStandardMaterial({ color: '#3b2314', roughness: 0.2 })); caffe.rotation.x = -Math.PI / 2; caffe.position.y = 0.035; m.add(caffe);
      const ansa = new T.Mesh(new T.TorusGeometry(0.025, 0.007, 8, 16, Math.PI), mat); ansa.rotation.z = -Math.PI / 2; ansa.position.x = 0.042; m.add(ansa);
      m.traverse(o => { o.castShadow = true; });
      const h = bone(av, 'LeftHand'), mf = bone(av, 'LeftHandMiddle1');
      const hp = h.getWorldPosition(new T.Vector3()), mp = mf.getWorldPosition(new T.Vector3());
      m.position.copy(hp.lerp(mp, 0.9)).add(new T.Vector3(0, 0.035, 0)); m.rotation.y = av.group.rotation.y + Math.PI;
      s.add(m); h.attach(m); p.tazza = m;
    }
  } else if (tipo === 'parla') retarget(p, c => c.gamba, true);
  else retarget(p, null, false, 0.6);
}
window.view = (az, el, d, tx, ty, tz) => { const t = new T.Vector3(tx, ty, tz), a = az * Math.PI / 180, e = el * Math.PI / 180; cam.position.set(t.x + d * Math.cos(e) * Math.sin(a), t.y + d * Math.sin(e), t.z + d * Math.cos(e) * Math.cos(a)); cam.lookAt(t); };
window.persone = persone; window.scene = s;
window.step = t => { persone.forEach(p => posa(p, t)); r.render(s, cam); };
view(-35, 30, 9.5, 0.3, 0.7, -0.6);

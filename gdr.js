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
  const LOOK = [["capo", "👑 Stefano"], ["dip", "👕 Dipendente"], ["resp", "👔 Responsabile"], ["controllore", "🧡 Controllore"], ["operaio", "👷 Operaio"]];
  const leggi = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
  const salva = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  let attivo = false, primaPersona = leggi("gdrVista", "3") === "1", look = leggi("gdrLook", "capo");
  let av = null, x = 0, z = 0, yaw = 0, pitch = -0.12, passo = 0, alto = 1.5, distCam = 3.2;
  const tasti = new Set();
  let salvaCam = null;

  function creaAvatar() {
    if (av) { av.parent && av.parent.remove(av); }
    av = U3.nuovoOmino({ id: "gdr-" + look }, x, z, look);
    av.userData.giocatore = true;
    const bb = new T.Box3().setFromObject(av); alto = Math.max(1.2, bb.max.y);
    for (const l of av.userData.sedute) l.visible = false;
    for (const l of av.userData.gambe) l.visible = true;
    av.visible = !primaPersona;
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
      u.sx.rotation.set(-o * 0.5, 0, 0.12); u.dx.rotation.set(o * 0.5, 0, -0.12);
      u.corpo.position.y = va ? Math.abs(Math.cos(passo)) * 0.03 : 0;
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
    vista(prima) { if (prima !== primaPersona) cambiaVista(); },
  };
})();

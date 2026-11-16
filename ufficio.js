// Ufficio virtuale - la stanza in pixel art.
// Tutto disegnato con rettangoli su un canvas piccolo, poi ingrandito senza sfocare:
// nessuna immagine esterna, nessuna licenza. Fumetti ed etichette sono HTML sopra il canvas.
(function () {
  const SLOT_W = 64, SLOT_H = 54, MURO = 44, MARGINE = 8, MAX_POSTI = 15;
  const PRESENTI = ["lavora", "pensa", "ferma?", "finito"];
  const COLORI_STATO = { "lavora": "#4cc38a", "pensa": "#5aa9f0", "ferma?": "#f2b14a", "finito": "#8b90a3" };
  const PELLE = ["#f1c7a5", "#e0ac84", "#c68a62", "#8d5a3c", "#f5d6bd"];
  const CAPELLI = ["#2b1d14", "#5a3a22", "#a8743c", "#d9b45a", "#1c1c22", "#7a2e1e", "#9a9aa6"];
  const MAGLIE = ["#d9534f", "#4a7fd6", "#3fae6a", "#e0913a", "#8e5bd0", "#2fa7a0", "#d65a9a", "#5c6b80"];

  const wrap = document.getElementById("ufficio");
  const canvas = document.createElement("canvas");
  const strato = document.createElement("div");
  strato.className = "strato";
  wrap.append(canvas, strato);
  const g = canvas.getContext("2d");
  const sfondo = document.createElement("canvas");     // stanza ferma, disegnata una volta sola
  const FPS = 8;                                       // pochi fotogrammi: stile pixel art e CPU quasi a zero
  let ultime = [];
  let posti = [];                                      // [{x, y, s, h}] da animare
  let W = 0, H = 0, finestre = [];
  let t = 0;                                           // fotogramma corrente
  const assegnati = new Map();                         // id sessione -> numero della scrivania (non cambia)
  const zone = new Map();                              // id sessione -> div cliccabile con fumetto

  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  let ctx = g;
  function r(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
  function linea(x0, y0, x1, y1, c) {           // segmento a pixel pieni (lancette)
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) r(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), 1, 1, c);
  }

  // ---------- stanza ----------
  function stanza(W, H) {
    // muro
    r(0, 0, W, MURO, "#3b4256");
    for (let x = 0; x < W; x += 16) r(x, 0, 1, MURO - 6, "#363c4f");
    r(0, MURO - 6, W, 2, "#2a2f3d");             // battiscopa
    r(0, MURO - 4, W, 4, "#4a3a2c");
    // pavimento a listoni: giunte sfalsate a caso (ma sempre uguali) per riga
    let riga = 0;
    for (let y = MURO; y < H; y += 6, riga++) {
      r(0, y, W, 6, riga % 2 ? "#8a6a48" : "#86674a");
      r(0, y + 5, W, 1, "#7a5c3d");
      for (let x = -(hash("r" + riga) % 70); x < W; x += 70) r(x, y, 1, 5, "#76583a");
    }
    // finestre
    const nf = Math.max(1, Math.floor(W / 120));
    finestre = [];
    for (let i = 0; i < nf; i++) {
      const fx = Math.round((W / nf) * (i + 0.5)) - 18;
      r(fx - 2, 6, 40, 28, "#d8dce6");
      r(fx, 8, 36, 24, "#7cc0ea");
      r(fx, 22, 36, 10, "#9fd2f0");
      finestre.push(fx);
      r(fx - 3, 33, 42, 2, "#b8bcc8");                                     // davanzale
    }
    // lavagna con un piccolo ladder
    const lx = 10;
    r(lx, 8, 34, 24, "#e9ecf2"); r(lx, 8, 34, 1, "#9aa0ae"); r(lx, 31, 34, 1, "#9aa0ae");
    r(lx + 3, 12, 1, 16, "#3a6fd8"); r(lx + 30, 12, 1, 16, "#3a6fd8");
    r(lx + 3, 15, 28, 1, "#3a6fd8"); r(lx + 3, 24, 28, 1, "#3a6fd8");
    r(lx + 9, 13, 1, 5, "#3a6fd8"); r(lx + 12, 13, 1, 5, "#3a6fd8");     // contatto
    r(lx + 20, 13, 3, 5, "#d84a4a");                                     // bobina
    r(lx + 9, 22, 1, 5, "#3a6fd8"); r(lx + 12, 22, 1, 5, "#3a6fd8");
    // pianta in un angolo
    const px = W - 14, py = MURO - 4;
    r(px - 4, py - 4, 8, 7, "#b85c38"); r(px - 5, py - 5, 10, 2, "#a04e2f");
    r(px - 1, py - 14, 2, 10, "#2f7a3a"); r(px - 6, py - 13, 5, 3, "#3f9a4a");
    r(px + 1, py - 17, 5, 3, "#3f9a4a"); r(px - 5, py - 19, 4, 3, "#4caf55");
  }

  // ---------- cose che si muovono nella stanza ----------
  function nuvoleEOrologio() {
    finestre.forEach((fx, i) => {
      ctx.save();
      ctx.beginPath(); ctx.rect(fx, 8, 36, 24); ctx.clip();
      const nx = fx - 16 + ((Math.floor(t / (FPS * 2)) + i * 23) % 52);   // 1 pixel ogni 2 secondi
      r(nx + 2, 12, 8, 3, "#f4f8fc"); r(nx, 13, 12, 2, "#f4f8fc");
      ctx.restore();
      r(fx + 17, 8, 2, 24, "#d8dce6"); r(fx, 19, 36, 2, "#d8dce6");     // telaio sopra la nuvola
    });
    const ox = W - 26, cx = ox + 6, cy = 16;
    r(ox, 10, 13, 13, "#555"); r(ox + 1, 11, 11, 11, "#f0f0f0");
    const d = new Date();
    const am = (d.getMinutes() / 60) * 2 * Math.PI, ah = ((d.getHours() % 12 + d.getMinutes() / 60) / 12) * 2 * Math.PI;
    linea(cx, cy, cx + Math.round(Math.sin(am) * 4), cy - Math.round(Math.cos(am) * 4), "#222");
    linea(cx, cy, cx + Math.round(Math.sin(ah) * 3), cy - Math.round(Math.cos(ah) * 3), "#c0392b");
  }

  // ---------- un posto di lavoro ----------
  function posto(x, y, s) {
    const presente = PRESENTI.includes(s.stato);
    const h = hash(s.id);
    // tappetino sotto la sedia
    r(x + 16, y + 40, 32, 10, "rgba(0,0,0,.12)");
    // schienale della sedia
    r(x + 24, y + 13, 16, 17, "#2b2f3b"); r(x + 25, y + 14, 14, 15, "#3a3f4e");
    if (presente) omino(x + 26, y + 9, h, s.stato);
    // scrivania
    r(x + 6, y + 29, 52, 4, "#c99a62");
    r(x + 6, y + 33, 52, 11, "#a87c4b");
    r(x + 6, y + 33, 52, 1, "#8e6639");
    r(x + 8, y + 44, 3, 6, "#6b4a2a"); r(x + 53, y + 44, 3, 6, "#6b4a2a");
    r(x + 40, y + 35, 14, 6, "#97703f"); r(x + 46, y + 37, 2, 1, "#d8b27a");   // cassetto
    // monitor visto da dietro
    const acceso = presente && s.stato !== "finito";
    r(x + 9, y + 13, 16, 13, "#1d2029");
    r(x + 10, y + 14, 14, 11, "#2a2e3a");
    r(x + 16, y + 26, 4, 3, "#1d2029");
    r(x + 13, y + 28, 10, 1, "#1d2029");
    if (acceso) {                                     // luce dello schermo sul bordo
      const c = COLORI_STATO[s.stato];
      ctx.globalAlpha = s.stato === "lavora" ? 0.75 + 0.25 * ((t + h) % 3 === 0) : 0.6 + 0.4 * Math.abs(Math.sin(t / FPS));
      r(x + 8, y + 12, 18, 1, c); r(x + 8, y + 12, 1, 14, c); r(x + 25, y + 12, 1, 14, c);
      ctx.globalAlpha = 1;
    }
    // tazza e fogli
    r(x + 48, y + 25, 4, 4, ["#e8e8e8", "#d9534f", "#4a7fd6"][h % 3]);
    r(x + 52, y + 26, 1, 2, "#bbb");
    r(x + 38, y + 27, 8, 2, "#f4f4f0"); r(x + 39, y + 26, 7, 1, "#e6e6df");
    if (s.commessa) r(x + 27, y + 36, 12, 4, "#f2c66d");   // targhetta della commessa
  }

  function omino(x0, y0, h, stato) {
    const pelle = PELLE[h % PELLE.length];
    const capelli = CAPELLI[(h >> 4) % CAPELLI.length];
    const maglia = MAGLIE[(h >> 8) % MAGLIE.length];
    const fase = h % 97;                              // ognuno con il suo ritmo
    const respiro = Math.floor((t + fase) / (FPS * 1.5)) % 2;      // su e giu' di 1 pixel
    const dorme = stato === "finito";
    let x = x0, y = y0 + respiro + (dorme ? 1 : 0);
    if (stato === "pensa") x += [0, 0, 1, 1, 0, 0, -1, -1][Math.floor((t + fase) / 4) % 8];   // dondola la testa
    // corpo
    r(x0 - 1, y0 + 13 + respiro, 14, 8 - respiro, maglia);
    r(x0 - 1, y0 + 13 + respiro, 14, 1, "rgba(255,255,255,.18)");
    r(x0 + 4, y + 13, 4, 2, pelle);                   // collo
    // braccia
    if (stato === "lavora") {                         // batte sui tasti: mani alternate
      const su = (t + fase) % 2;
      r(x0 - 3, y0 + 15, 3, 5 - su, maglia); r(x0 - 3, y0 + 20 - su, 3, 1, pelle);
      r(x0 + 12, y0 + 15, 3, 4 + su, maglia); r(x0 + 12, y0 + 19 + su, 3, 1, pelle);
    } else if (stato === "pensa") {                   // mano sotto il mento
      r(x0 - 3, y0 + 15, 3, 6, maglia); r(x0 - 3, y0 + 20, 3, 1, pelle);
      r(x0 + 12, y0 + 14, 3, 5, maglia); r(x0 + 9, y + 12, 4, 2, pelle);
    } else if (stato === "ferma?") {                  // tamburella con le dita
      const tic = Math.floor((t + fase) / 3) % 2;
      r(x0 - 3, y0 + 15, 3, 6, maglia); r(x0 - 3, y0 + 20, 3, 1, pelle);
      r(x0 + 12, y0 + 15, 3, 6, maglia); r(x0 + 12, y0 + 20 + tic, 3, 1, pelle);
    } else {                                          // ha finito: braccia giu'
      r(x0 - 2, y0 + 15, 2, 6, maglia); r(x0 + 12, y0 + 15, 2, 6, maglia);
    }
    // testa
    r(x + 1, y + 3, 10, 10, pelle);
    r(x, y + 6, 1, 3, pelle); r(x + 11, y + 6, 1, 3, pelle);   // orecchie
    const taglio = (h >> 12) % 3;
    r(x + 1, y + 1, 10, 3, capelli); r(x, y + 2, 12, 3, capelli);
    if (taglio === 1) { r(x, y + 4, 2, 5, capelli); r(x + 10, y + 4, 2, 5, capelli); }
    if (taglio === 2) r(x + 2, y, 8, 1, capelli);
    // occhi
    const ammicca = (t + fase * 3) % (FPS * 4) === 0;          // una volta ogni 4 secondi
    let ox = 0;
    if (stato === "ferma?") ox = [0, 0, -1, -1, 0, 0, 1, 1][Math.floor((t + fase) / 5) % 8];   // si guarda intorno
    if (stato === "pensa") ox = 1;                             // occhi in alto a destra
    if (dorme || ammicca) { r(x + 3, y + 8, 2, 1, "#2a2a2a"); r(x + 7, y + 8, 2, 1, "#2a2a2a"); }
    else {
      const oy = stato === "pensa" ? -1 : 0;
      r(x + 3 + ox, y + 7 + oy, 2, 2, "#2a2a2a"); r(x + 7 + ox, y + 7 + oy, 2, 2, "#2a2a2a");
    }
    r(x + 5, y + 11, 2, 1, "#b0705a");                // bocca
    if (dorme) zeta(x + 13, y + 7, fase);
  }

  function zeta(x, y, fase) {                         // "z" che salgono quando dorme
    const ciclo = FPS * 3;
    for (const k of [0, ciclo / 2]) {
      const p = ((t + fase + k) % ciclo) / ciclo;     // 0..1
      const zx = x + Math.round(p * 3), zy = y - Math.round(p * 6);
      ctx.globalAlpha = 1 - p;
      r(zx, zy, 3, 1, "#e8ecf4"); r(zx + 1, zy + 1, 1, 1, "#e8ecf4"); r(zx, zy + 2, 3, 1, "#e8ecf4");
    }
    ctx.globalAlpha = 1;
  }

  // ---------- fumetti ed etichette ----------
  function testoFumetto(s) {
    if (s.stato === "pensa") return ["💭", "Sta pensando…"];
    if (s.stato === "finito") return ["✅", "Ha finito"];
    if (s.stato === "ferma?") return ["⏳", s.attivita ? "Fermo su: " + s.attivita : "Fermo da un po'"];
    return [s.icona || "💬", s.attivita || "Lavora"];
  }
  function corto(t, n) { return t.length > n ? t.slice(0, n - 1) + "…" : t; }

  function scegli(sessioni) {
    // le prime MAX_POSTI per importanza, ma ognuno resta sempre alla sua scrivania
    const ordine = sessioni.filter(s => PRESENTI.includes(s.stato))
      .concat(sessioni.filter(s => !PRESENTI.includes(s.stato)))
      .slice(0, MAX_POSTI);
    const ids = new Set(ordine.map(s => s.id));
    for (const id of [...assegnati.keys()]) if (!ids.has(id)) assegnati.delete(id);
    const occupati = new Set(assegnati.values());
    for (const s of ordine) {
      if (assegnati.has(s.id)) continue;
      let n = 0;
      while (occupati.has(n)) n++;
      assegnati.set(s.id, n); occupati.add(n);
    }
    return ordine;
  }

  function disegna(sessioni) {
    ultime = sessioni;
    const scelte = scegli(sessioni);
    const disp = (wrap.clientWidth || 1000) - 40;   // tolgo il padding laterale
    const scala = Math.max(2, Math.min(3, Math.floor(disp / (4 * SLOT_W + 2 * MARGINE))));
    const colonne = Math.max(2, Math.min(6, Math.floor((disp / scala - 2 * MARGINE) / SLOT_W)));
    const ultimo = Math.max(-1, ...assegnati.values());
    const righe = Math.max(1, Math.ceil((ultimo + 1) / colonne));
    W = colonne * SLOT_W + 2 * MARGINE;
    H = MURO + 18 + righe * SLOT_H + 6;
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W; canvas.height = H;
    }
    canvas.style.width = W * scala + "px"; canvas.style.height = H * scala + "px";
    strato.style.width = canvas.style.width; strato.style.height = canvas.style.height;
    sfondo.width = W; sfondo.height = H;
    ctx = sfondo.getContext("2d");
    stanza(W, H);
    ctx = g;

    posti = [];
    const visti = new Set();
    for (const s of scelte) {
      const i = assegnati.get(s.id);
      const x = MARGINE + (i % colonne) * SLOT_W;
      const y = MURO + 18 + Math.floor(i / colonne) * SLOT_H;
      posti.push({ x, y, s, h: hash(s.id) });
      visti.add(s.id);
      let zona = zone.get(s.id);
      if (!zona) {
        zona = document.createElement("div");
        zona.append(document.createElement("div"), document.createElement("div"));
        zona.lastChild.className = "targa";
        zona.onclick = () => window.open("/chat?id=" + encodeURIComponent(s.id), "chat-" + s.id);
        zone.set(s.id, zona);
        strato.append(zona);
      }
      const presente = PRESENTI.includes(s.stato);
      zona.className = "posto " + (presente ? "presente" : "assente");
      Object.assign(zona.style, { left: x * scala + "px", top: y * scala + "px",
                                  width: SLOT_W * scala + "px", height: SLOT_H * scala + "px" });
      zona.title = (s.titolo || "(senza titolo)") + "\nClic: apri la chat";
      const f = zona.firstChild;
      const [ic, testo] = presente ? testoFumetto(s) : ["", ""];
      const nuovo = presente ? ic + " " + corto(testo, 34) : "";
      if (f.dataset.testo !== nuovo) {                // il fumetto "salta fuori" solo quando cambia
        f.dataset.testo = nuovo;
        f.textContent = nuovo;
        f.className = presente ? "fumetto st-" + s.stato.replace("?", "") : "";
        f.style.display = presente ? "" : "none";
        if (presente) { f.classList.remove("pop"); void f.offsetWidth; f.classList.add("pop"); }
      }
      zona.lastChild.textContent = corto(s.commessa ? "📌 " + s.commessa : (s.progetto_tia || s.titolo || s.progetto || ""), 22);
    }
    for (const [id, zona] of zone) if (!visti.has(id)) { zona.remove(); zone.delete(id); }
    let v = strato.querySelector(".ufficio-vuoto");
    if (!scelte.length && !v) {
      v = document.createElement("div");
      v.className = "ufficio-vuoto";
      v.textContent = "L'ufficio è vuoto: nessuna sessione recente.";
      strato.append(v);
    } else if (scelte.length && v) v.remove();
    fotogramma();
  }

  function fotogramma() {
    if (!W) return;
    g.imageSmoothingEnabled = false;
    g.drawImage(sfondo, 0, 0);
    nuvoleEOrologio();
    for (const p of posti) posto(p.x, p.y, p.s);
  }

  // l'animazione gira solo con la pagina visibile: a finestra ridotta o scheda nascosta non consuma nulla
  setInterval(() => {
    if (document.hidden) return;
    t++;
    fotogramma();
  }, 1000 / FPS);

  let attesa = null;
  window.addEventListener("resize", () => {
    clearTimeout(attesa);
    attesa = setTimeout(() => disegna(ultime), 150);
  });
  window.Ufficio = { disegna };
})();

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
  let ultime = [];

  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function r(x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }

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
    for (let i = 0; i < nf; i++) {
      const fx = Math.round((W / nf) * (i + 0.5)) - 18;
      r(fx - 2, 6, 40, 28, "#d8dce6");
      r(fx, 8, 36, 24, "#7cc0ea");
      r(fx, 22, 36, 10, "#9fd2f0");
      r(fx + 6, 12, 8, 3, "#f4f8fc"); r(fx + 4, 13, 12, 2, "#f4f8fc");   // nuvola
      r(fx + 17, 8, 2, 24, "#d8dce6"); r(fx, 19, 36, 2, "#d8dce6");
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
    // orologio
    const ox = W - 26;
    r(ox, 10, 12, 12, "#f0f0f0"); r(ox, 10, 12, 1, "#555"); r(ox, 21, 12, 1, "#555");
    r(ox, 10, 1, 12, "#555"); r(ox + 11, 10, 1, 12, "#555");
    const d = new Date();
    r(ox + 5, 12, 1, 4, "#222");                                          // lancetta fissa
    r(ox + 6, 15, (d.getHours() % 12) > 5 ? -3 : 3, 1, "#222");
    // pianta in un angolo
    const px = W - 14, py = MURO - 4;
    r(px - 4, py - 4, 8, 7, "#b85c38"); r(px - 5, py - 5, 10, 2, "#a04e2f");
    r(px - 1, py - 14, 2, 10, "#2f7a3a"); r(px - 6, py - 13, 5, 3, "#3f9a4a");
    r(px + 1, py - 17, 5, 3, "#3f9a4a"); r(px - 5, py - 19, 4, 3, "#4caf55");
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
      r(x + 8, y + 12, 18, 1, c); r(x + 8, y + 12, 1, 14, c); r(x + 25, y + 12, 1, 14, c);
    }
    // tazza e fogli
    r(x + 48, y + 25, 4, 4, ["#e8e8e8", "#d9534f", "#4a7fd6"][h % 3]);
    r(x + 52, y + 26, 1, 2, "#bbb");
    r(x + 38, y + 27, 8, 2, "#f4f4f0"); r(x + 39, y + 26, 7, 1, "#e6e6df");
    if (s.commessa) r(x + 27, y + 36, 12, 4, "#f2c66d");   // targhetta della commessa
  }

  function omino(x, y, h, stato) {
    const pelle = PELLE[h % PELLE.length];
    const capelli = CAPELLI[(h >> 4) % CAPELLI.length];
    const maglia = MAGLIE[(h >> 8) % MAGLIE.length];
    // corpo
    r(x - 1, y + 13, 14, 8, maglia);
    r(x - 1, y + 13, 14, 1, "rgba(255,255,255,.18)");
    r(x + 4, y + 13, 4, 2, pelle);                    // collo
    // braccia sulla scrivania
    r(x - 3, y + 15, 3, 6, maglia); r(x + 12, y + 15, 3, 6, maglia);
    r(x - 3, y + 20, 3, 1, pelle); r(x + 12, y + 20, 3, 1, pelle);
    // testa
    r(x + 1, y + 3, 10, 10, pelle);
    r(x, y + 6, 1, 3, pelle); r(x + 11, y + 6, 1, 3, pelle);   // orecchie
    // capelli: tre tagli diversi
    const taglio = (h >> 12) % 3;
    r(x + 1, y + 1, 10, 3, capelli); r(x, y + 2, 12, 3, capelli);
    if (taglio === 1) { r(x, y + 4, 2, 5, capelli); r(x + 10, y + 4, 2, 5, capelli); }
    if (taglio === 2) r(x + 2, y, 8, 1, capelli);
    // occhi: chiusi se ha finito
    if (stato === "finito") { r(x + 3, y + 8, 2, 1, "#2a2a2a"); r(x + 7, y + 8, 2, 1, "#2a2a2a"); }
    else { r(x + 3, y + 7, 2, 2, "#2a2a2a"); r(x + 7, y + 7, 2, 2, "#2a2a2a"); }
    r(x + 5, y + 11, 2, 1, "#b0705a");                // bocca
  }

  // ---------- fumetti ed etichette ----------
  function testoFumetto(s) {
    if (s.stato === "pensa") return ["💭", "Sta pensando…"];
    if (s.stato === "finito") return ["✅", "Ha finito"];
    if (s.stato === "ferma?") return ["⏳", s.attivita ? "Fermo su: " + s.attivita : "Fermo da un po'"];
    return [s.icona || "💬", s.attivita || "Lavora"];
  }
  function corto(t, n) { return t.length > n ? t.slice(0, n - 1) + "…" : t; }

  function disegna(sessioni) {
    ultime = sessioni;
    const scelte = sessioni.filter(s => PRESENTI.includes(s.stato))
      .concat(sessioni.filter(s => !PRESENTI.includes(s.stato)))
      .slice(0, MAX_POSTI);
    const disp = (wrap.clientWidth || 1000) - 40;   // tolgo il padding laterale
    const scala = Math.max(2, Math.min(3, Math.floor(disp / (4 * SLOT_W + 2 * MARGINE))));
    const colonne = Math.max(2, Math.min(6, Math.floor((disp / scala - 2 * MARGINE) / SLOT_W)));
    const righe = Math.max(1, Math.ceil(scelte.length / colonne));
    const W = colonne * SLOT_W + 2 * MARGINE;
    const H = MURO + 18 + righe * SLOT_H + 6;
    canvas.width = W; canvas.height = H;
    canvas.style.width = W * scala + "px"; canvas.style.height = H * scala + "px";
    strato.style.width = canvas.style.width; strato.style.height = canvas.style.height;
    g.imageSmoothingEnabled = false;
    stanza(W, H);
    strato.replaceChildren();
    scelte.forEach((s, i) => {
      const x = MARGINE + (i % colonne) * SLOT_W;
      const y = MURO + 18 + Math.floor(i / colonne) * SLOT_H;
      posto(x, y, s);
      const zona = document.createElement("div");
      zona.className = "posto " + (PRESENTI.includes(s.stato) ? "presente" : "assente");
      Object.assign(zona.style, { left: x * scala + "px", top: y * scala + "px",
                                  width: SLOT_W * scala + "px", height: SLOT_H * scala + "px" });
      zona.title = (s.titolo || "(senza titolo)") + "\nClic: apri la chat";
      zona.onclick = () => window.open("/chat?id=" + encodeURIComponent(s.id), "chat-" + s.id);
      if (PRESENTI.includes(s.stato)) {
        const [ic, t] = testoFumetto(s);
        const f = document.createElement("div");
        f.className = "fumetto st-" + s.stato.replace("?", "");
        f.textContent = ic + " " + corto(t, 34);
        zona.append(f);
      }
      const tag = document.createElement("div");
      tag.className = "targa";
      tag.textContent = corto(s.commessa ? "📌 " + s.commessa : (s.progetto_tia || s.titolo || s.progetto || ""), 22);
      zona.append(tag);
      strato.append(zona);
    });
    if (!scelte.length) {
      const v = document.createElement("div");
      v.className = "ufficio-vuoto";
      v.textContent = "L'ufficio è vuoto: nessuna sessione recente.";
      strato.append(v);
    }
  }

  let attesa = null;
  window.addEventListener("resize", () => {
    clearTimeout(attesa);
    attesa = setTimeout(() => disegna(ultime), 150);
  });
  window.Ufficio = { disegna };
})();

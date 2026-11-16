(function () {
  // Link a claude.ai: di base si aprono nell'app Claude per PC (claude://claude.ai/...), senza passare dal browser.
  // Con "apri nel browser" spuntato (o senza app) restano link web normali.
  function nelBrowser() { try { return localStorage.getItem("linkBrowser") === "1"; } catch (e) { return false; } }
  function perApp(url) {
    return !nelBrowser() && /^https:\/\/claude\.ai\//.test(url || "") ? url.replace(/^https:\/\//, "claude://") : null;
  }
  window.apriLink = function (url) {
    if (!url) return;
    const app = perApp(url);
    if (app) location.href = app; else window.open(url, "_blank", "noopener");
  };
  window.collegaLink = function (a, url) {
    const app = perApp(url);
    a.href = app || url;
    if (app) { a.removeAttribute("target"); a.title = (a.title ? a.title + " " : "") + "(nell'app Claude)"; }
    else { a.target = "_blank"; a.rel = "noopener"; }
  };
})();
// Ufficio virtuale - la stanza in pixel art.
// Tutto disegnato con rettangoli su un canvas piccolo, poi ingrandito senza sfocare:
// nessuna immagine esterna, nessuna licenza. Fumetti ed etichette sono HTML sopra il canvas.
(function () {
  const SLOT_W = 64, SLOT_H = 54, MURO = 44, MARGINE = 8, MAX_POSTI = 15;
  const PRESENTI = ["aspetta", "lavora", "pensa", "ferma?", "finito"];
  const COLORI_STATO = { "aspetta": "#ff5d5d", "lavora": "#4cc38a", "pensa": "#5aa9f0", "ferma?": "#f2b14a", "finito": "#8b90a3" };
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
  let extra = {};                                      // responsabili da mostrare sempre, TIA aperti, cloud
  let posti = [];                                      // [{x, y, s, h}] da animare
  let W = 0, H = 0, finestre = [];
  let t = 0;                                           // fotogramma corrente
  const arrivo = new Map();                            // id sessione -> ordine di arrivo (posto stabile nell'isola)
  let nArrivi = 0;
  const ISOLA_H = 14;
  const RIEPILOGO_H = 12;                              // due righe di riepilogo sotto ogni ufficio
  const UFF_W = SLOT_W + 8, UFF_H = SLOT_H + 8;      // ufficio a vetri di capo e responsabili
  const COLORI_ISOLE = ["#5aa9f0", "#4cc38a", "#d65a9a", "#e0913a", "#8e5bd0", "#2fa7a0", "#c9c24a"];
  const ORO = "#e0b040";
  let uffici = [];                                     // [{x, y, colore, s}] da animare                                  // spazio per il cartello sopra ogni isola
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
    const presente = PRESENTI.includes(s.stato) || s.stato === "supervisore";
    const h = hash(s.id);
    // tappetino sotto la sedia
    r(x + 16, y + 40, 32, 10, "rgba(0,0,0,.12)");
    // schienale della sedia
    r(x + 24, y + 13, 16, 17, "#2b2f3b"); r(x + 25, y + 14, 14, 15, "#3a3f4e");
    if (presente) omino(x + 26, y + 9, h, s.stato);
    if (s.capo) {                                     // cravatta e corona del capo
      r(x + 31, y + 23, 2, 4, "#b8322a");
      r(x + 28, y + 6, 8, 2, ORO); r(x + 28, y + 4, 2, 2, ORO); r(x + 31, y + 3, 2, 3, ORO); r(x + 34, y + 4, 2, 2, ORO);
    }
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
      const c = s.colore || COLORI_STATO[s.stato];
      ctx.globalAlpha = s.stato === "lavora" ? 0.75 + 0.25 * ((t + h) % 3 === 0) : 0.6 + 0.4 * Math.abs(Math.sin(t / FPS));
      r(x + 8, y + 12, 18, 1, c); r(x + 8, y + 12, 1, 14, c); r(x + 25, y + 12, 1, 14, c);
      ctx.globalAlpha = 1;
    }
    // tazza e fogli
    r(x + 48, y + 25, 4, 4, ["#e8e8e8", "#d9534f", "#4a7fd6"][h % 3]);
    r(x + 52, y + 26, 1, 2, "#bbb");
    r(x + 38, y + 27, 8, 2, "#f4f4f0"); r(x + 39, y + 26, 7, 1, "#e6e6df");
    if (s.commessa) r(x + 27, y + 36, 12, 4, "#f2c66d");   // targhetta della commessa
    if (s.cloud) {                                    // lavora nel cloud: nuvoletta sopra il monitor
      const dy = Math.floor((t + h) / (FPS * 2)) % 2;
      r(x + 11, y + 6 + dy, 10, 3, "#eef4fb"); r(x + 13, y + 4 + dy, 5, 2, "#eef4fb"); r(x + 11, y + 9 + dy, 10, 1, "#b8c6d8");
    }
    if (s.plcsim) {                                   // scatolina PLCSIM con il led che lampeggia
      r(x + 1, y + 23, 6, 6, "#2d6b8c"); r(x + 2, y + 24, 4, 2, "#9fd2f0");
      r(x + 2, y + 27, 1, 1, (t + h) % 4 < 2 ? "#5cff7a" : "#1d5a2a");
    }
    if (s.download && Math.floor(t / 2) % 2) {        // lampeggiante rosso: download sul PLC
      r(x + 29, y + 1, 6, 3, "#ff2b2b"); r(x + 30, y, 4, 1, "#ff8080");
    }
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
    if (stato === "aspetta") {                        // alza la mano e saluta per farsi vedere
      const onda = Math.floor((t + fase) / 2) % 2;
      r(x0 - 3, y0 + 15, 3, 6, maglia); r(x0 - 3, y0 + 20, 3, 1, pelle);
      r(x0 + 12, y0 + 3, 3, 13, maglia);
      r(x0 + 12 + onda, y0, 3, 3, pelle);
    } else if (stato === "lavora") {                  // batte sui tasti: mani alternate
      const su = (t + fase) % 2;
      r(x0 - 3, y0 + 15, 3, 5 - su, maglia); r(x0 - 3, y0 + 20 - su, 3, 1, pelle);
      r(x0 + 12, y0 + 15, 3, 4 + su, maglia); r(x0 + 12, y0 + 19 + su, 3, 1, pelle);
    } else if (stato === "pensa") {                   // mano sotto il mento
      r(x0 - 3, y0 + 15, 3, 6, maglia); r(x0 - 3, y0 + 20, 3, 1, pelle);
      r(x0 + 12, y0 + 14, 3, 5, maglia); r(x0 + 9, y + 12, 4, 2, pelle);
    } else if (stato === "supervisore") {             // mani sulla scrivania, controlla
      r(x0 - 3, y0 + 15, 3, 6, maglia); r(x0 - 3, y0 + 20, 3, 1, pelle);
      r(x0 + 12, y0 + 15, 3, 6, maglia); r(x0 + 12, y0 + 20, 3, 1, pelle);
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
    if (stato === "ferma?" || stato === "supervisore")
      ox = [0, 0, -1, -1, 0, 0, 1, 1][Math.floor((t + fase) / (stato === "supervisore" ? 9 : 5)) % 8];   // si guarda intorno
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

  // ---------- uffici a vetri ----------
  function pavimentoUfficio(x, y, colore) {          // nello sfondo: moquette e parete di fondo
    r(x, y, UFF_W, UFF_H, "#4a5168");
    for (let yy = y + 12; yy < y + UFF_H; yy += 4) r(x, yy, UFF_W, 1, "#454c62");
    r(x, y, UFF_W, 10, "#5a6380");                    // parete di fondo
    r(x + 4, y + 2, 14, 6, "#2f3442"); r(x + 5, y + 3, 12, 4, colore);   // quadro col colore dell'isola
    r(x + UFF_W - 10, y + 12, 6, 6, "#b85c38"); r(x + UFF_W - 9, y + 5, 2, 7, "#2f7a3a");
    r(x + UFF_W - 12, y + 5, 4, 3, "#3f9a4a"); r(x + UFF_W - 7, y + 3, 4, 3, "#4caf55");  // pianta
  }
  function vetrate(x, y, colore) {                   // davanti all'omino, a ogni fotogramma
    const vetro = "rgba(170,215,245,.22)", telaio = "#8a93a8";
    r(x, y, 2, UFF_H, vetro); r(x + UFF_W - 2, y, 2, UFF_H, vetro);           // pareti laterali
    r(x, y, 1, UFF_H, telaio); r(x + UFF_W - 1, y, 1, UFF_H, telaio);
    r(x, y, UFF_W, 1, telaio);
    const porta = x + UFF_W - 22;                                             // porta aperta a destra
    r(x, y + UFF_H - 12, porta - x, 12, vetro);                               // vetrata davanti
    r(x, y + UFF_H - 12, porta - x, 1, telaio); r(x, y + UFF_H - 1, UFF_W, 1, telaio);
    r(porta, y + UFF_H - 12, 1, 12, telaio); r(porta + 14, y + UFF_H - 12, 1, 12, telaio);
    r(porta + 14, y + UFF_H - 12, UFF_W - 14 - (porta - x), 12, vetro);
    // riflessi che scorrono piano sul vetro
    const k = Math.floor(t / 3) % (UFF_W + 20);
    for (const d of [0, 5]) {
      const rx = x + ((k + d) % (porta - x + 6));
      if (rx < porta - 2) { ctx.globalAlpha = .35; r(rx, y + UFF_H - 11, 1, 10, "#ffffff"); r(rx + 2, y + UFF_H - 11, 1, 10, "#ffffff"); ctx.globalAlpha = 1; }
    }
    r(x + 1, y + 1, UFF_W - 2, 1, colore);            // fascia colorata in alto
  }

  // ---------- fumetti ed etichette ----------
  function testoFumetto(s) {
    if (s.stato === "aspetta") return ["✋", s.attivita || "Aspetta te"];
    if (s.stato === "pensa") return ["💭", "Sta pensando…"];
    if (s.stato === "finito") return ["✅", "Ha finito"];
    if (s.download) return ["🚨", "DOWNLOAD SUL PLC: anomalia!"];
    if (s.stato === "ferma?") {
      const min = Math.max(1, Math.round((Date.now() / 1000 - s.modificato) / 60));
      return ["⏳", "Fermo da " + min + " min" + (s.attivita ? " · " + s.attivita : "")];
    }
    return [s.icona || "💬", s.attivita || "Lavora"];
  }
  function targa(s) {                                 // commessa + stazione, poi l'esito della compilazione
    const st = ((s.progetto_tia || "") + " " + (s.responsabile || "") + " " + (s.titolo || "")).match(/(?:^|[^A-Za-z0-9])(OP\s?\d{2,3})(?!\d)/i);
    const parti = [];
    if (s.commessa) parti.push("📌 " + s.commessa + (st ? " " + st[1].toUpperCase().replace(/\s/, "") : ""));
    else if (s.progetto_tia) parti.push("🧩 " + corto(s.progetto_tia, 20));
    else return "";
    const c = s.compilazione;
    if (c && c.errori !== 0 && c.errori != null) parti.push("❌" + (c.errori > 0 ? c.errori : ""));
    return parti.join(" ");
  }
  function corto(t, n) { return t.length > n ? t.slice(0, n - 1) + "…" : t; }

  function chiaveIsola(s) {
    if (s.responsabile) return "r:" + s.responsabile.toLowerCase();
    if (s.commessa) return "c:" + s.commessa;                 // senza responsabile: per commessa
    if (s.progetto_claude) return "p:" + s.progetto_claude.toLowerCase();   // poi per progetto claude.ai
    if (s.thread) return "t:" + s.thread;
    return "altro";
  }

  // isole: una per responsabile (o per thread senza nome); il capo davanti, poi chi aspetta te
  function isole(sessioni) {
    // nell'ufficio solo cio' che conta adesso: chi ha finito da piu' di 3 ore o e' ferma
    // da piu' di un'ora va a casa (resta nelle schede sotto)
    const ora = Date.now() / 1000;
    sessioni = sessioni.filter(s => PRESENTI.includes(s.stato) && s.stato !== "finito" ||
      (s.stato === "finito" && ora - s.modificato < 3 * 3600) || ora - s.modificato < 3600);
    const scelte = sessioni.filter(s => s.stato === "aspetta")
      .concat(sessioni.filter(s => PRESENTI.includes(s.stato) && s.stato !== "aspetta"))
      .concat(sessioni.filter(s => !PRESENTI.includes(s.stato)))
      .slice(0, MAX_POSTI);
    for (const s of scelte) if (!arrivo.has(s.id)) arrivo.set(s.id, nArrivi++);
    const gruppi = new Map();
    scelte.forEach((s, i) => {
      const k = chiaveIsola(s);
      if (!gruppi.has(k)) gruppi.set(k, { chiave: k, sessioni: [], prima: i, s0: s });
      gruppi.get(k).sessioni.push(s);
    });
    // i responsabili di nomi-isole.json hanno sempre il loro ufficio, anche senza nessuno al lavoro
    const ordine = new Map();
    (extra.responsabili || []).forEach((rsp, i) => {
      const k = "r:" + (rsp.chiave || rsp.nome).toLowerCase();
      ordine.set(k, i);
      if (!gruppi.has(k)) gruppi.set(k, { chiave: k, sessioni: [], prima: 1000 + i,
        s0: { responsabile: rsp.nome, thread: rsp.thread, link: rsp.link, chan: extra.chan } });
      gruppi.get(k).link = rsp.link;
      gruppi.get(k).scheda = rsp.scheda;
      gruppi.get(k).nome = rsp.nome;
    });
    const lista = [...gruppi.values()];
    for (const gr of lista) gr.sessioni.sort((a, b) => arrivo.get(a.id) - arrivo.get(b.id));
    const peso = gr => gr.chiave === "r:capo" ? 0 : gr.chiave === "p:ufficio virtuale" ? 5 : gr.chiave === "altro" ? 4 :
      gr.sessioni.some(s => s.stato === "aspetta") ? 1 : gr.chiave.startsWith("r:") ? 2 : 3;
    lista.sort((a, b) => peso(a) - peso(b) ||
      (ordine.has(a.chiave) && ordine.has(b.chiave) ? ordine.get(a.chiave) - ordine.get(b.chiave) : a.prima - b.prima));
    return lista;
  }

  function nomeIsola(gr) {
    const s = gr.s0;
    if (gr.chiave === "r:capo") return "👑 Capo";
    if (gr.nome) return "📌 " + gr.nome.replace(/\s+programma\b/i, "");
    if (s.responsabile) return "📌 " + s.responsabile.replace(/\s+programma\b/i, "");
    if (gr.chiave.startsWith("c:")) return "📌 " + s.commessa;
    if (gr.chiave === "p:ufficio virtuale") return "🏢 Ufficio virtuale (questa pagina)";
    if (gr.chiave.startsWith("p:")) return "🗂️ " + s.progetto_claude;
    if (s.thread) return "🧵 da assegnare";
    return "🗂️ Sessioni aperte sul PC";
  }

  function haUfficio(gr) { return gr.chiave.startsWith("r:"); }

  const STATI_COMMESSA = { "in lavorazione": "In lavorazione", "domande aperte": "Domande aperte",
                           "aspetta stefano": "Aspetta Stefano", "fatto": "Fatto" };
  function riepilogo(gr) {                            // es. "✋ 1 · ⚙️ 2 · 💤 1"
    const sc = gr.scheda;
    if (sc) {                                         // la scheda della dashboard Commesse PLC
      const n = gr.sessioni.filter(s => ["lavora", "pensa"].includes(s.stato)).length;
      return (STATI_COMMESSA[sc.stato] || sc.stato) + (n ? " · ⚙️ " + n : "") +
        (sc.progetto_tia ? "\n🧩 " + corto(sc.progetto_tia, 26) : "");
    }
    const n = st => gr.sessioni.filter(s => st.includes(s.stato)).length;
    const parti = [];
    if (n(["aspetta"])) parti.push("✋ " + n(["aspetta"]));
    if (n(["lavora", "pensa"])) parti.push("⚙️ " + n(["lavora", "pensa"]));
    if (n(["ferma?"])) parti.push("⏳ " + n(["ferma?"]));
    if (n(["finito", "inattiva", "vuota"])) parti.push("💤 " + n(["finito", "inattiva", "vuota"]));
    const ultimo = gr.sessioni.filter(s => s.progetto_tia).sort((a, b) => b.modificato - a.modificato)[0];
    return (parti.join(" · ") || "nessuno al lavoro") + (ultimo ? "\n🧩 " + corto(ultimo.progetto_tia, 26) : "");
  }

  function cartello(gr, x, y, w, scala, ufficio) {
    const c = document.createElement("div");
    c.className = "cartello" + (ufficio ? " ufficio" : "");
    const pallino = document.createElement("span");
    pallino.className = "pallino"; pallino.style.background = gr.colore;
    c.append(pallino);
    Object.assign(c.style, { left: x * scala + "px", top: y * scala + "px", width: w * scala + "px" });
    c.append(document.createTextNode(nomeIsola(gr)));
    const s = gr.s0;
    if (!ufficio && haUfficio(gr)) {                  // nell'open space basta il nome: i comandi sono sull'ufficio
      c.title = "Lavorano per " + nomeIsola(gr).replace(/^\S+ /, "");
      strato.append(c);
      return;
    }
    const link = gr.link ? gr.link : gr.chiave === "r:capo" && s.chan ? "https://claude.ai/code/project/" + s.chan :
      gr.chiave.startsWith("p:") && s.chan ? "https://claude.ai/code/project/" + s.chan :
      (s.thread && (gr.chiave.startsWith("t:") || gr.chiave.startsWith("r:")) ? s.link : null);
    if (link) {
      const a = document.createElement("a");
      collegaLink(a, link);
      a.textContent = "↗";
      a.title = gr.chiave === "r:capo" ? "Apri la chat principale del progetto" : "Apri la chat del responsabile";
      c.append(a);
    }
    if (ufficio) {
      const st = document.createElement("div");
      st.className = "riepilogo";
      st.textContent = riepilogo(gr);
      st.title = "✋ ti aspettano · ⚙️ lavorano · ⏳ fermi da un po' · 💤 hanno finito";
      if (gr.scheda) {
        const sc = gr.scheda;
        st.title = [sc.nome + " · " + (STATI_COMMESSA[sc.stato] || sc.stato), sc.progetto_tia,
          sc.fatto && "Fatto: " + sc.fatto, sc.in_corso && "In corso: " + sc.in_corso,
          sc.domande.length && "Domande aperte:\n- " + sc.domande.join("\n- "),
          sc.aspetta && "Aspetta: " + sc.aspetta, sc.testo].filter(Boolean).join("\n\n");
      }
      Object.assign(st.style, { left: x * scala + "px", top: (y + ISOLA_H + UFF_H + 1) * scala + "px", width: w * scala + "px" });
      if (gr.sessioni.some(q => q.stato === "aspetta")) st.classList.add("chiama");
      strato.append(st);
    }
    if (s.thread && !gr.chiave.startsWith("r:") && gr.sessioni.length === 1) {   // il nome vale per un thread
      const b = document.createElement("button");
      b.textContent = "✏️";
      b.title = "Dai un nome a questo responsabile (es. 24_247 op20)";
      b.onclick = async () => {
        const nome = prompt("Nome del responsabile di queste sessioni (es. 24_247 op20).\nLascia vuoto per toglierlo.", s.responsabile || "");
        if (nome === null) return;
        try {
          await fetch("/api/nome-isola?thread=" + encodeURIComponent(s.thread) + "&nome=" + encodeURIComponent(nome.trim()));
        } catch (e) {}
      };
      c.append(b);
    }
    strato.append(c);
  }

  function disegna(sessioni, nuovoExtra) {
    ultime = sessioni;
    if (nuovoExtra) extra = nuovoExtra;
    const gruppi = isole(sessioni);
    const disp = (wrap.clientWidth || 1000) - 40;   // tolgo il padding laterale
    // scala: la piu' grande che tiene gli uffici a vetri su due file al massimo
    const nUffici = gruppi.filter(haUfficio).length;
    const GAP = 8;
    const colonnePer = sc => Math.max(2, Math.min(8, Math.floor((disp / sc - 2 * MARGINE + GAP) / (SLOT_W + GAP))));
    const filePer = sc => Math.ceil(nUffici / Math.max(1, Math.floor((colonnePer(sc) * (SLOT_W + GAP)) / (UFF_W + GAP))));
    let scala = Math.max(2, Math.min(3, Math.floor(disp / (4 * SLOT_W + 2 * MARGINE))));
    while (scala > 2 && filePer(scala) > 2) scala--;
    const colonne = colonnePer(scala);
    // a scala 2 fumetti e scritte (in pixel veri) occupano piu' spazio: allargo le fasce dei testi
    const RIEP = scala >= 3 ? RIEPILOGO_H : RIEPILOGO_H + 6, ISO = scala >= 3 ? ISOLA_H : ISOLA_H + 12;
    // colore per ogni isola: oro per il capo, poi a giro
    let ci = 0;
    for (const gr of gruppi) gr.colore = gr.chiave === "r:capo" ? ORO : gr.scheda ? gr.scheda.colore :
      gr.chiave === "altro" ? "#8b90a3" : COLORI_ISOLE[ci++ % COLORI_ISOLE.length];
    // 1) direzione: uffici a vetri in fila sotto il muro (capo e responsabili)
    const capi = gruppi.filter(haUfficio);
    const perFila = Math.max(1, Math.floor((colonne * SLOT_W + (colonne - 1) * GAP + GAP) / (UFF_W + GAP)));
    uffici = [];
    let y = MURO + 14;
    capi.forEach((gr, i) => {
      const ux = MARGINE + (i % perFila) * (UFF_W + GAP), uy = y + Math.floor(i / perFila) * (UFF_H + ISOLA_H + RIEP);
      uffici.push({ gr, x: ux, y: uy, colore: gr.colore,
                    s: { id: "capo:" + gr.chiave, stato: "supervisore", colore: gr.colore, capo: gr.chiave === "r:capo" } });
    });
    if (capi.length) y += Math.ceil(capi.length / perFila) * (UFF_H + ISOLA_H + RIEP);
    const corridoio = y;
    y += 10;
    // 2) open space: le scrivanie delle sessioni, raggruppate per responsabile
    const pos = new Map(), aree = [];
    let x = MARGINE, hRiga = 0;
    const largMax = colonne * SLOT_W + (colonne - 1) * GAP;
    for (const gr of gruppi) {
      if (!gr.sessioni.length) continue;             // ufficio senza nessuno al lavoro: niente isola
      const perRiga = Math.min(colonne, gr.sessioni.length);
      const righe = Math.ceil(gr.sessioni.length / perRiga);
      const w = perRiga * SLOT_W, h = ISO + righe * SLOT_H;
      if (x > MARGINE && x + w > MARGINE + largMax) { x = MARGINE; y += hRiga + 4; hRiga = 0; }
      aree.push({ gr, x, y, w, h });
      gr.sessioni.forEach((s, i) => pos.set(s.id, {
        x: x + (i % perRiga) * SLOT_W, y: y + ISO + Math.floor(i / perRiga) * SLOT_H }));
      x += w + GAP; hRiga = Math.max(hRiga, h);
    }
    y += hRiga + 4;
    W = colonne * SLOT_W + (colonne - 1) * GAP + 2 * MARGINE;
    H = Math.max(y, MURO + 8 + ISOLA_H + SLOT_H) + 4;
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W; canvas.height = H;
    }
    canvas.style.width = W * scala + "px"; canvas.style.height = H * scala + "px";
    strato.style.width = canvas.style.width; strato.style.height = canvas.style.height;
    sfondo.width = W; sfondo.height = H;
    ctx = sfondo.getContext("2d");
    stanza(W, H);
    if (capi.length) {                              // corridoio tra direzione e open space
      r(0, corridoio + 2, W, 5, "#6d5a46"); r(0, corridoio + 2, W, 1, "#5c4a39");
      for (let cx = 6; cx < W; cx += 14) r(cx, corridoio + 4, 6, 1, "#8a7660");
    }
    for (const u of uffici) pavimentoUfficio(u.x, u.y + ISOLA_H, u.colore);
    for (const a of aree) {                         // tappeto col colore del responsabile
      ctx.globalAlpha = .22; r(a.x - 2, a.y + 2, a.w + 4, a.h - 2, a.gr.colore);
      ctx.globalAlpha = .6; r(a.x - 2, a.y + 2, a.w + 4, 1, a.gr.colore); ctx.globalAlpha = 1;
    }
    ctx = g;
    for (const c of strato.querySelectorAll(".cartello, .cartello-click, .riepilogo")) c.remove();
    for (const u of uffici) {
      cartello(u.gr, u.x, u.y + 2, UFF_W, scala, true);
      const s0 = u.gr.s0;
      const link = u.gr.link || (u.gr.chiave === "r:capo" && s0.chan ? "https://claude.ai/code/project/" + s0.chan : s0.link);
      const porta = document.createElement("div");
      porta.className = "posto cartello-click";
      Object.assign(porta.style, { left: u.x * scala + "px", top: (u.y + ISOLA_H) * scala + "px",
                                   width: UFF_W * scala + "px", height: UFF_H * scala + "px" });
      porta.title = link ? "Apri la chat di " + (u.gr.chiave === "r:capo" ? "Capo" : (s0.responsabile || "questo responsabile")) + " su claude.ai" : "";
      if (link) porta.onclick = () => apriLink(link);
      strato.append(porta);
    }
    for (const a of aree) cartello(a.gr, a.x, a.y + 3, a.w, scala, false);
    const scelte = gruppi.flatMap(gr => gr.sessioni);

    posti = [];
    const visti = new Set();
    for (const s of scelte) {
      const { x, y } = pos.get(s.id);
      posti.push({ x, y, s, h: hash(s.id) });
      visti.add(s.id);
      let zona = zone.get(s.id);
      if (!zona) {
        zona = document.createElement("div");
        zona.append(document.createElement("div"), document.createElement("div"));
        zona.lastChild.className = "targa";
        zona.onclick = () => s.link ? apriLink(s.link)
          : window.open("/chat?id=" + encodeURIComponent(s.id), "chat-" + s.id);
        zone.set(s.id, zona);
        strato.append(zona);
      }
      const presente = PRESENTI.includes(s.stato);
      zona.className = "posto " + (presente ? "presente" : "assente");
      Object.assign(zona.style, { left: x * scala + "px", top: y * scala + "px",
                                  width: SLOT_W * scala + "px", height: SLOT_H * scala + "px" });
      zona.title = (s.cloud ? "☁️ Thread nel cloud: " : "") + (s.titolo || "(senza titolo)") +
        (s.sottotitolo ? "\n" + s.sottotitolo : "") + (s.cloud ? (s.link ? "\nClic: apri su claude.ai" : "") : "\nClic: apri la chat");
      const f = zona.firstChild;
      const [ic, testo] = presente ? testoFumetto(s) : ["", ""];
      const nuovo = presente ? ic + " " + corto(testo, s.stato === "aspetta" ? 52 : 34) : "";
      if (f.dataset.testo !== nuovo) {                // il fumetto "salta fuori" solo quando cambia
        f.dataset.testo = nuovo;
        f.textContent = nuovo;
        f.className = presente ? "fumetto st-" + (s.download ? "allarme" : s.stato.replace("?", "")) : "";
        f.style.display = presente ? "" : "none";
        if (presente) { f.classList.remove("pop"); void f.offsetWidth; f.classList.add("pop"); }
      }
      zona.lastChild.textContent = (s.cloud ? "☁️ " : "") + (targa(s) || corto((s.progetto_tia ? "🧩 " + s.progetto_tia : (s.titolo || s.progetto || "")), 30))
        + (s.sotto_agenti ? " 👥" + s.sotto_agenti : "");
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
    for (const u of uffici) {
      posto(u.x + 4, u.y + ISOLA_H + 6, u.s);
      const chiama = u.gr.sessioni.some(q => q.stato === "aspetta") && Math.floor(t / 4) % 2;
      vetrate(u.x, u.y + ISOLA_H, chiama ? "#ff5d5d" : u.colore);
    }
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

"""Ufficio virtuale - Task 2: server locale.

Avvio:   python server.py            (poi apri http://localhost:8787)
Opzioni: --porta 8787  --ore 24

Ascolta solo su 127.0.0.1, quindi dagli altri PC non si raggiunge. Legge i transcript
con scanner.py, non chiama nessuna AI e non scrive nulla.
"""
import argparse
import json
import re
import os
import socket
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import aggiorna
import chat
import etichette
import scanner

HERE = Path(__file__).resolve().parent
STATIC = {"/": ("index.html", "text/html; charset=utf-8"),
          "/chat": ("chat.html", "text/html; charset=utf-8"),
          "/ufficio.js": ("ufficio.js", "text/javascript; charset=utf-8"),
          "/ufficio3d.js": ("ufficio3d.js", "text/javascript; charset=utf-8"),
          "/lib/three.min.js": ("lib/three.min.js", "text/javascript; charset=utf-8"),
          "/lib/OrbitControls.js": ("lib/OrbitControls.js", "text/javascript; charset=utf-8")}
VERSIONE = "task 9.16 (finestra senza barre del browser)"
FERMI_ORE = 48          # thread e sessioni fermi da piu' di cosi' spariscono dalla pagina
POLL_S = 1.5            # ogni quanto ricontrollo i file
AGGIORNA_MIN = 15       # ogni quanto controllo se su GitHub c'e' una versione nuova

_cache = {}             # file -> ((mtime, size), info)
_lock = threading.Lock()
_snapshot = {"versione": 0, "sessioni": [], "json": b"[]"}
_cond = threading.Condition()
_SERVER = None


def _scan(hours):
    """Come scanner.scan, ma rianalizza solo i file cambiati."""
    if not scanner.PROJECTS_DIR.is_dir():
        return []
    limit = time.time() - hours * 3600
    out, seen = [], set()
    for proj in scanner.PROJECTS_DIR.iterdir():
        if not proj.is_dir():
            continue
        for path in proj.glob("*.jsonl"):
            try:
                st = path.stat()
            except OSError:
                continue
            if st.st_mtime < limit:
                continue
            key = str(path)
            seen.add(key)
            sig = (st.st_mtime, st.st_size)
            hit = _cache.get(key)
            # rianalizzo anche ogni 30 s: lo stato "inattiva" dipende dall'orologio
            if hit and hit[0] == sig and time.time() - hit[2] < 30 and hit[3] == etichette.FILE_MTIME():
                info = hit[1]
            else:
                try:
                    info = scanner.analyze(path)
                except OSError:
                    continue
                info["progetto"] = scanner.project_name(info, proj.name)
                _cache[key] = (sig, info, time.time(), etichette.FILE_MTIME())
            out.append(info)
    for key in list(_cache):
        if key not in seen:
            del _cache[key]
    out.sort(key=lambda s: s["modificato"], reverse=True)
    return out


NOMI_FILE = HERE / "nomi-isole.json"     # thread -> nome del responsabile, scritto dalla pagina
_nomi = {"mtime": None, "dati": {}}
_THREAD_ID = re.compile(r"^cmsg_[A-Za-z0-9]{10,}$")


def _nomi_isole():
    try:
        mt = NOMI_FILE.stat().st_mtime
    except OSError:
        return {}
    if mt != _nomi["mtime"]:
        try:
            dati = json.loads(NOMI_FILE.read_text(encoding="utf-8"))
            _nomi.update(mtime=mt, dati=dati if isinstance(dati, dict) else {})
        except (OSError, ValueError):
            pass
    return _nomi["dati"]


_BOSS = re.compile(r"\s*-\s*boss\s*$", re.I)


def _senza_boss(nome):
    """'24_247 OP60 -boss' -> '24_247 OP60' (il suffisso dice che il thread e' un responsabile)."""
    return _BOSS.sub("", str(nome or "")).strip()


_SEPARATORE = re.compile(r"\s+(?:›|>)\s+")
_COMMESSA_STAZIONE = re.compile(r"^\d{2}_\d{3}\s+OP\s?\d{2,3}(?:\s*/\s*OP\s?\d{2,3})*$", re.I)
_STAZIONE = re.compile(r"(?<![A-Za-z0-9])OP\s?(\d{2,3})(?!\d)", re.I)
_voci_cache = {}


def _distanza(a, b, limite=2):
    """Distanza di edit (Levenshtein), ma si ferma appena supera il limite."""
    if abs(len(a) - len(b)) > limite:
        return limite + 1
    prec = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prec[j] + 1, cur[j - 1] + 1, prec[j - 1] + (ca != cb)))
        if min(cur) > limite:
            return limite + 1
        prec = cur
    return prec[-1]


def _trova_voce(nomi, thread):
    """La voce di nomi-isole.json per un thread, tollerando piccoli errori di battitura nel codice
    (maiuscole/minuscole, una o due lettere): il file lo scrive a mano Agente TIA."""
    if not thread:
        return None
    if thread in nomi:
        return nomi[thread]
    chiave = (thread, _nomi["mtime"])
    if chiave not in _voci_cache:
        tl = thread.lower()
        voce = next((v for k, v in nomi.items() if k.lower() == tl), None)
        if voce is None:
            vicini = [v for k, v in nomi.items() if _distanza(k.lower(), tl) <= 2]
            voce = vicini[0] if len(vicini) == 1 else None
        _voci_cache[chiave] = voce
    return _voci_cache[chiave]


def _responsabili(nomi):
    """[(nome, thread)] dei responsabili: le voci stringa di nomi-isole.json, piu' il Capo."""
    out = [("Capo", None)]
    for k, v in nomi.items():
        if str(k).startswith("cmsg_") and isinstance(v, str) and _senza_boss(v) and _senza_boss(v).lower() != "capo":
            out.append((_senza_boss(v), k))
    return out


def _stazione(*testi):
    for t in testi:
        m = _STAZIONE.search(t or "")
        if m:
            return "OP" + m.group(1)
    return None


def _per_stazione(s, nomi_resp):
    """Responsabile dedotto da commessa + stazione (es. 24_247 + OP20 dal progetto TIA)."""
    c = s.get("commessa")
    if not c:
        return None
    cand = [n for n in nomi_resp if c in n]
    st = _stazione(s.get("progetto_tia"), s.get("titolo"))
    if st:
        cand = [n for n in cand if _stazione(n) == st or re.search(r"(?i)OP\s?" + st[2:] + r"(?!\d)", n)]
    return cand[0] if len(cand) == 1 else None


def _con_nomi(sessions):
    """Titoli dei thread e responsabili da nomi-isole.json. Il file lo scrive la pagina
    (matita) oppure la chat principale di claude.ai, con una di queste forme:
      "cmsg_...": "24_247 op20"                                   (il thread e' un responsabile)
      "cmsg_...": {"titolo": "Correggi MSG_104", "responsabile": "24_247 op20"}"""
    nomi = _nomi_isole()
    nomi_resp = [n for n, _ in _responsabili(nomi)]
    canonico = {n.lower(): n for n in nomi_resp}
    # titolo del thread -> titolo del suo responsabile (anche per le sessioni con la riga "Thread:")
    per_titolo = {"capo": "Capo"}
    for k, v in nomi.items():
        if not str(k).startswith("cmsg_"):          # es. "aggiornato_utc": non e' un thread
            continue
        if isinstance(v, str):
            per_titolo[_senza_boss(v).lower()] = _senza_boss(v)
        elif isinstance(v, dict) and v.get("titolo"):
            per_titolo[str(v["titolo"]).strip().lower()] = v.get("responsabile") or v["titolo"]
    out = []
    for s in sessions:
        s = dict(s)
        titolo_thread, resp = s.get("thread_titolo"), None
        if titolo_thread and _BOSS.search(titolo_thread):     # "24_247 OP60 -boss": e' un responsabile
            titolo_thread = resp = _senza_boss(titolo_thread)
        voce = _trova_voce(nomi, s.get("thread"))
        if isinstance(voce, str):                       # il thread e' un responsabile
            titolo_thread, resp = titolo_thread or _senza_boss(voce), resp or _senza_boss(voce)
        elif isinstance(voce, dict):
            titolo_thread = voce.get("titolo") or titolo_thread
            resp = resp or (_senza_boss(voce.get("responsabile")) or None)
        if voce is not None:
            s["in_nomi"] = True
        # schema dei titoli "24_247 OP60 › Criticare pulsanti": prima di " › " c'e' il responsabile
        m = _SEPARATORE.split(str(titolo_thread or ""), 1)
        if not resp and len(m) == 2 and m[0].strip():
            capo = _senza_boss(m[0])
            resp = canonico.get(capo.lower()) or ("Capo" if capo.lower() == "capo" else
                                                  (capo if _COMMESSA_STAZIONE.match(capo) else "Capo"))
        if str(s.get("voce_cloud_resp") or "").startswith("("):   # "(responsabile)": e' lui stesso un responsabile
            s["voce_cloud_resp"] = None
        if not resp and s.get("voce_cloud_resp"):      # il responsabile scritto in stato-thread.json
            resp = s["voce_cloud_resp"]
        if titolo_thread and not resp:
            resp = per_titolo.get(titolo_thread.strip().lower())
            if resp is None and not s.get("cloud"):
                resp = titolo_thread
        if titolo_thread and titolo_thread.strip().lower() != "capo":
            s["titolo"] = str(titolo_thread)[:90]       # il titolo vero della chat
        elif not titolo_thread and s.get("progetto_tia"):
            # niente titolo del thread: commessa · stazione · progetto TIA, l'ultimo messaggio sotto
            parti = [s.get("commessa"), _stazione(s.get("progetto_tia")), s["progetto_tia"]]
            s["sottotitolo"] = s.get("titolo")
            s["titolo"] = " · ".join(p for p in parti if p)
        if not resp:
            resp = _per_stazione(s, nomi_resp)
        if resp:
            resp = str(resp).strip()
            s["responsabile"] = canonico.get(resp.lower(), resp)[:60]
        t = str(s.get("titolo") or "").strip()
        if not titolo_thread and not s.get("progetto_tia") and (len(t) < 12 or t.startswith("\\")):
            # titoli presi da un messaggio come "Ora" o "\pc on": non dicono niente
            s["sottotitolo"] = t or None
            s["titolo"] = (s.get("responsabile") or s.get("progetto_claude") or "Sessione") + " · sessione sul PC"
        for fonte in (titolo_thread, s.get("responsabile")):
            m = scanner._COMMESSA.search(fonte or "")
            if m:
                s["commessa"] = m.group(1)
                break
        out.append(s)
    return out


# ---------- thread che lavorano nel cloud (stato-thread.json, scritto da Agente TIA) ----------
CLOUD_FILE = HERE / "stato-thread.json"
_cloud = {"mtime": None, "dati": {}}


def _iso(ts):
    from datetime import datetime
    try:
        d = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
        if d.tzinfo is None:                       # senza fuso: e' UTC (lo dice il nome del campo)
            from datetime import timezone
            d = d.replace(tzinfo=timezone.utc)
        return d.timestamp()
    except (TypeError, ValueError):
        return None


def _stato_cloud():
    try:
        mt = CLOUD_FILE.stat().st_mtime
    except OSError:
        return {}
    if mt != _cloud["mtime"]:
        try:
            dati = json.loads(CLOUD_FILE.read_text(encoding="utf-8"))
            _cloud.update(mtime=mt, dati=dati if isinstance(dati, dict) else {})
        except (OSError, ValueError):
            pass
    return _cloud["dati"]


def _sessioni_cloud(locali):
    """Una figura per ogni thread del cloud, se sul PC non c'e' gia' una sua sessione al lavoro."""
    dati = _stato_cloud()
    al_pc = {(s.get("thread") or "").lower() for s in locali
             if s.get("stato") in ("aspetta", "lavora", "pensa", "ferma?")}
    chan = next((s.get("chan") for s in locali if s.get("chan") and s.get("progetto_claude", "").lower().startswith("agente")), None)
    out = []
    for t in dati.get("thread") or []:
        if not isinstance(t, dict) or not t.get("id") or str(t["id"]).lower() in al_pc:
            continue
        testo = str(t.get("stato") or "").strip()
        st = testo.lower()
        stato = "aspetta" if st.startswith("aspetta") else "finito" if st.startswith(("finit", "fatto")) else "lavora"
        ts = _iso(t.get("ultima_attivita_utc")) or _iso(dati.get("aggiornato_utc")) or time.time()
        out.append({
            "id": "cloud:" + str(t["id"]), "cloud": True, "thread": str(t["id"]),
            "thread_titolo": t.get("titolo"), "titolo": t.get("titolo") or "(thread nel cloud)",
            "responsabile": None, "stato": stato, "modificato": ts,
            "icona": "✋" if stato == "aspetta" else "☁️",
            "attivita": str(t["attesa"])[:120] if stato == "aspetta" and t.get("attesa") else
                        (testo[:1].upper() + testo[1:] if testo else "Lavora nel cloud"),
            "progetto": "cloud", "progetto_claude": "Agente Tia portal", "chan": chan,
            "link": t.get("link") if str(t.get("link") or "").startswith("https://claude.ai/") else
                    (f"https://claude.ai/code/project/{chan}?thread={t['id']}" if chan else None),
            "voce_cloud_resp": t.get("responsabile"),
        })
    return out


# ---------- istanze di TIA Portal aperte sul PC (processi veri, non stime) ----------
_tia = {"lista": [], "ok": False}


def _leggi_processi_tia():
    if sys.platform != "win32":
        return None
    cmd = ("Get-Process Siemens.Automation.Portal -ErrorAction SilentlyContinue | "
           "ForEach-Object { [pscustomobject]@{titolo=$_.MainWindowTitle; percorso=$_.Path} } | "
           "ConvertTo-Json -Compress")
    try:
        r = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", cmd],
                           capture_output=True, text=True, errors="replace", timeout=20,
                           creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except (OSError, subprocess.SubprocessError):
        return None
    testo = (r.stdout or "").strip()
    if not testo:
        return []
    try:
        dati = json.loads(testo)
    except ValueError:
        return None
    return dati if isinstance(dati, list) else [dati]


def _tia_processi():
    while True:
        lista = _leggi_processi_tia()
        if lista is not None:
            out = []
            for p in lista:
                titolo, percorso = p.get("titolo") or "", p.get("percorso") or ""
                m = re.search(r"\.ap(\d{2})\b", titolo, re.I) or re.search(r"Portal V(\d{2})", percorso, re.I) \
                    or re.search(r"\bV(\d{2})\b", titolo)
                prog = re.search(r"([^\\/]+)\.ap\d{2}\b", titolo, re.I)
                out.append({"versione": "V" + m.group(1) if m else "?",
                            "progetto": prog.group(1) if prog else "", "finestra": bool(titolo.strip())})
            _tia.update(lista=out, ok=True)
        time.sleep(30)


def _tia_con_proprietario(sessions):
    """Chi usa ogni TIA: la sessione recente con lo stesso progetto, altrimenti Stefano
    (finestra visibile) o un agente (TIA senza finestra, aperto via Openness)."""
    ora = time.time()
    recenti = [s for s in sessions if s.get("progetto_tia") and ora - s.get("modificato", 0) < 4 * 3600]
    out = []
    for p in _tia["lista"]:
        di = None
        if p["progetto"]:
            base = p["progetto"].lower()
            s = next((s for s in recenti if s["progetto_tia"].lower().startswith(base[:24])
                      or base.startswith(s["progetto_tia"].lower()[:24])), None)
            if s:
                di = s.get("responsabile") or s.get("commessa") or "agente"
        out.append(dict(p, di=di or ("Stefano" if p["finestra"] else "agente")))
    return out


# ---------- schede delle commesse (commesse.json, la dashboard "Commesse PLC" di Agente TIA) ----------
COMMESSE_FILE = HERE / "commesse.json"
_comm = {"mtime": None, "dati": {}}
COLORI_COMMESSA = {"in lavorazione": "#3b82f6", "domande aperte": "#a855f7", "aspetta stefano": "#eab308", "fatto": "#22c55e"}


def _commesse():
    try:
        mt = COMMESSE_FILE.stat().st_mtime
    except OSError:
        return {}
    if mt != _comm["mtime"]:
        try:
            dati = json.loads(COMMESSE_FILE.read_text(encoding="utf-8"))
            _comm.update(mtime=mt, dati=dati if isinstance(dati, dict) else {})
        except (OSError, ValueError):
            pass
    return _comm["dati"]


def _schede():
    """Le commesse ripulite: solo testo, link solo verso claude.ai."""
    out = []
    for c in _commesse().get("commesse") or []:
        if not isinstance(c, dict) or not c.get("nome"):
            continue
        stato = str(c.get("stato") or "").strip().lower()
        txt = lambda k: str(c.get(k) or "").strip()[:600]
        link = txt("link")
        out.append({"nome": txt("nome")[:60], "thread": txt("thread"), "stato": stato,
                    "colore": COLORI_COMMESSA.get(stato, "#8b90a3"), "progetto_tia": txt("progetto_tia")[:120],
                    "fatto": txt("fatto"), "in_corso": txt("in_corso"), "aspetta": txt("aspetta"), "testo": txt("testo"),
                    "domande": [str(d)[:300] for d in (c.get("domande") or []) if d][:8],
                    "link": link if link.startswith("https://claude.ai/") else None})
    return out


def _extra(sessions):
    """Dati dell'ufficio oltre alle sessioni: responsabili da mostrare sempre, TIA aperti, cloud."""
    nomi = _nomi_isole()
    chan = next((s.get("chan") for s in sessions if s.get("in_nomi") and s.get("chan")), None) or \
        next((s.get("chan") for s in sessions if s.get("chan") and s.get("progetto_claude", "").lower().startswith("agente")), None)
    schede = _schede()
    if not chan:                                   # il progetto claude.ai si legge anche dai link delle commesse
        m = next((re.search(r"/project/(chan_[A-Za-z0-9]+)", c["link"]) for c in schede if c["link"]), None)
        chan = m.group(1) if m else None
    per_thread = {c["thread"].lower(): c for c in schede if c["thread"]}
    resp = []
    for nome, thread in _responsabili(nomi):
        link = f"https://claude.ai/code/project/{chan}" if chan else None
        if thread and chan:
            link += f"?thread={thread}"
        scheda = per_thread.get((thread or "").lower())
        resp.append({"nome": scheda["nome"] if scheda else nome, "chiave": nome, "thread": thread, "link": link,
                     "scheda": scheda})
    cloud, comm = _stato_cloud(), _commesse()
    return {"responsabili": resp, "chan": chan, "commesse": schede,
            "commesse_aggiornate": _iso(comm.get("aggiornato_utc")) if comm else None,
            "tia": _tia_con_proprietario(sessions) if _tia["ok"] else None,
            "cloud_aggiornato": _iso(cloud.get("aggiornato_utc")) if cloud else None}


def _diagnosi(sessions, extra=None):
    """Quello che vede la pagina (sessioni + dati dell'ufficio), per rifare la stessa schermata
    da fuori senza screenshot. Niente percorsi dei file e niente dettagli dei comandi."""
    try:
        (HERE / "diagnosi-sessioni.json").write_text(json.dumps(
            {"nomi_isole": len(_nomi_isole()), "scritto": time.time(),
             "extra": json.loads(extra) if extra else None,
             "sessioni": [{k: v for k, v in s.items() if k not in ("file", "dettaglio")} for s in sessions]},
            ensure_ascii=False, indent=1), encoding="utf-8")
    except (OSError, ValueError):
        pass


def _watcher(hours):
    while True:
        try:
            locali = _scan(hours)
            # regola di Stefano: chi e' fermo da 48 ore o piu' non si mostra (i responsabili restano, dagli uffici)
            limite = time.time() - FERMI_ORE * 3600
            sessions = [s for s in _con_nomi(locali + _sessioni_cloud(locali)) if s.get("modificato", 0) >= limite]
            data = json.dumps(sessions, ensure_ascii=False).encode("utf-8")
            extra = json.dumps(_extra(sessions), ensure_ascii=False).encode("utf-8")
            with _cond:
                if data != _snapshot["json"] or extra != _snapshot.get("extra"):
                    _snapshot.update(versione=_snapshot["versione"] + 1, sessioni=sessions, json=data, extra=extra)
                    _diagnosi(sessions, extra)
                    _cond.notify_all()
        except Exception as exc:  # non deve mai fermarsi
            print("errore durante la scansione:", exc, file=sys.stderr)
        time.sleep(POLL_S)


class Server(ThreadingHTTPServer):
    daemon_threads = True
    # Su Windows SO_REUSEADDR permette a DUE server di usare la stessa porta, e
    # risponde quello vecchio: lo disattivo, cosi' un secondo avvio da' errore.
    allow_reuse_address = sys.platform != "win32"

    def server_bind(self):
        if sys.platform == "win32" and hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # niente log a ogni richiesta

    def _send(self, code, body, ctype):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path in STATIC:
            name, ctype = STATIC[path]
            return self._send(200, (HERE / name).read_bytes(), ctype)
        if path == "/api/sessions":
            return self._send(200, _snapshot["json"], "application/json; charset=utf-8")
        if path == "/api/stream":
            return self._stream()
        if path == "/api/versione":
            body = json.dumps({"versione": VERSIONE, "git": aggiorna.local_sha()[:7]})
            return self._send(200, body.encode(), "application/json")
        if path == "/api/etichette":
            body = json.dumps(etichette.load(), ensure_ascii=False).encode("utf-8")
            return self._send(200, body, "application/json; charset=utf-8")
        if path == "/api/chat":
            return self._chat()
        if path == "/api/nome-isola":       # ?thread=cmsg_...&nome=24_247 op20 (nome vuoto = cancella)
            q = parse_qs(urlparse(self.path).query)
            thread, nome = q.get("thread", [""])[0], q.get("nome", [""])[0].strip()[:60]
            if not _THREAD_ID.match(thread):
                return self._send(400, b'{"errore": "thread non valido"}', "application/json")
            nomi = dict(_nomi_isole())
            if nome:
                nomi[thread] = nome
            else:
                nomi.pop(thread, None)
            NOMI_FILE.write_text(json.dumps(nomi, ensure_ascii=False, indent=1), encoding="utf-8")
            return self._send(200, b'{"ok": true}', "application/json")
        if path == "/api/riavvia":          # usato da avvio.pyw dopo un aggiornamento
            self._send(200, b'{"ok": true}', "application/json")
            if _SERVER:
                threading.Thread(target=_riavvia, args=(_SERVER,), daemon=True).start()
            return
        self._send(404, b"non trovato", "text/plain; charset=utf-8")

    def _chat(self):
        """Voci della chat di una sessione, dal byte `da` in poi."""
        q = parse_qs(urlparse(self.path).query)
        sid = q.get("id", [""])[0]
        # cerco l'id solo tra le sessioni note: nessun percorso arriva dal browser
        info = next((s for s in _snapshot["sessioni"] if s["id"] == sid), None)
        if info is None:
            return self._send(404, b'{"errore": "sessione non trovata"}', "application/json")
        try:
            da = int(q["da"][0]) if "da" in q else None
        except ValueError:
            da = None
        try:
            res = chat.read_chat(Path(info["file"]), da)
        except OSError as exc:
            return self._send(500, json.dumps({"errore": str(exc)}).encode(), "application/json")
        res["sessione"] = {k: info[k] for k in ("id", "titolo", "progetto", "stato", "attivita", "link", "commessa")}
        body = json.dumps(res, ensure_ascii=False).encode("utf-8")
        self._send(200, body, "application/json; charset=utf-8")

    def _stream(self):
        """Server-Sent Events: mando la lista ogni volta che cambia."""
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        seen = -1
        try:
            while True:
                with _cond:
                    if _snapshot["versione"] == seen:
                        _cond.wait(timeout=15)
                    version, data, extra = _snapshot["versione"], _snapshot["json"], _snapshot.get("extra") or b"{}"
                if version != seen:
                    self.wfile.write(b"event: ufficio\ndata: " + extra + b"\n\nevent: sessioni\ndata: " + data + b"\n\n")
                    seen = version
                else:
                    self.wfile.write(b": ping\n\n")  # tiene viva la connessione
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass


def _riavvia(server):
    """Dopo un aggiornamento: libero la porta e riparto con il codice nuovo."""
    print("Versione nuova installata: riavvio il server.", flush=True)
    time.sleep(0.3)                  # lascio partire la risposta HTTP in corso
    server.server_close()
    flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" and not _ha_console() else 0
    subprocess.Popen([sys.executable] + sys.argv, cwd=HERE, creationflags=flags,
                     stdout=sys.stdout if _ha_console() else None)
    os._exit(0)


def _ha_console():
    try:
        return sys.stdin is not None and sys.stdin.isatty()
    except (AttributeError, ValueError):
        return False


def _aggiornatore(server):
    time.sleep(60)
    while True:
        try:
            if aggiorna.update():
                _riavvia(server)
        except Exception as exc:
            print("errore nell'aggiornamento:", exc, file=sys.stderr)
        time.sleep(AGGIORNA_MIN * 60)


def main():
    ap = argparse.ArgumentParser(description="Ufficio virtuale: server locale")
    ap.add_argument("--porta", type=int, default=8787)
    ap.add_argument("--ore", type=float, default=24, help="sessioni modificate nelle ultime N ore")
    ap.add_argument("--senza-aggiornamenti", action="store_true", help="non controllare GitHub")
    args = ap.parse_args()
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except AttributeError:
        pass
    server = None
    for _ in range(20):              # dopo un riavvio la porta puo' restare occupata per un attimo
        try:
            server = Server(("127.0.0.1", args.porta), Handler)
            break
        except OSError:
            time.sleep(0.5)
    if server is None:
        print(f"La porta {args.porta} e' gia' occupata: un altro server dell'ufficio e' ancora acceso.")
        if _ha_console():
            print("Chiudi le altre finestre del server (o termina python.exe dal Task Manager) e riprova.")
            input("Premi Invio per chiudere questa finestra...")
        return
    global _SERVER
    _SERVER = server
    threading.Thread(target=_watcher, args=(args.ore,), daemon=True).start()
    threading.Thread(target=_tia_processi, daemon=True).start()
    if not args.senza_aggiornamenti:
        threading.Thread(target=_aggiornatore, args=(server,), daemon=True).start()
    print(f"Ufficio virtuale ({VERSIONE}, {aggiorna.local_sha()[:7] or 'locale'}) su "
          f"http://localhost:{args.porta}  (Ctrl+C per fermare)", flush=True)
    print(f"Leggo i transcript da {scanner.PROJECTS_DIR}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nFermato.")


if __name__ == "__main__":
    main()

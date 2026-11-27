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
          "/gdr.js": ("gdr.js", "text/javascript; charset=utf-8"),
          "/lib/three.min.js": ("lib/three.min.js", "text/javascript; charset=utf-8"),
          "/pp3d.js": ("pp3d.js", "text/javascript; charset=utf-8"),
          "/lib/three170.js": ("lib/three170.js", "text/javascript; charset=utf-8"),
          "/lib/OrbitControls.js": ("lib/OrbitControls.js", "text/javascript; charset=utf-8"),
          "/lib/GLTFLoader.js": ("lib/GLTFLoader.js", "text/javascript; charset=utf-8"),
          "/lib/meshopt_decoder.js": ("lib/meshopt_decoder.js", "text/javascript; charset=utf-8"),
          "/lib/SkeletonUtils.js": ("lib/SkeletonUtils.js", "text/javascript; charset=utf-8"),
          "/lib/BufferGeometryUtils.js": ("lib/BufferGeometryUtils.js", "text/javascript; charset=utf-8"),
          "/lib/modelli/omino.glb": ("lib/modelli/omino.glb", "model/gltf-binary"),
          "/plus3d.js": ("plus3d.js", "text/javascript; charset=utf-8")}
VERSIONE = "task 9.69 (GDR: frecce avanti/indietro e laterali che ruotano, il mouse gira solo la testa di circa 80 gradi; pulsante AGGIORNA nascosto: zero token; chiamate degli agenti solo a inizio, attesa, fine e chiusura; motivo esatto se il pulsante AGGIORNA viene rifiutato; il pulsante AGGIORNA chiede il codice e lo salva da solo; interruttore 📋 dei resoconti dell ispettrice: spento = zero token; ispettrice sui tacchi a spillo con camminata da passerella; modalita GDR)"
FERMI_ORE = 48          # thread e sessioni fermi da piu' di cosi' spariscono dalla pagina
VECCHIO_S = 3 * 3600    # (23/11: i thread avvisano solo a inizio e fine richiesta) un thread del cloud "al lavoro" senza notizie da piu' di cosi' diventa "dato vecchio?"
ATTESA_LUNGA_S = 2 * 3600   # chi aspetta Stefano da piu' di cosi' (o dati cloud piu' vecchi di cosi'): ⏳
FINITI_ORE = 24         # chi ha finito da piu' di cosi' non si vede piu' (stessa regola per 2D e 3D)
POLL_S = 1.5            # ogni quanto ricontrollo i file
ISPETTRICE_MIN = 20     # l'ispettrice chiede un resoconto a un omino ogni tanti minuti (solo a ufficio aperto)
ISPETTRICE_MAX = 3      # richieste ancora senza risposta oltre le quali non ne fa altre
ISPETTRICE_ORE = 8      # dopo tante ore una richiesta senza risposta si lascia perdere
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
        if s.get("altro_progetto"):                     # KUKA, GX Works...: niente commesse ne' responsabili TIA
            out.append(s)
            continue
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


# ---------- connettore Ufficio (connettore.py): i progetti scrivono qui il loro stato, direttamente ----------
CONN_FILE = HERE / "connettore-stato.json"
_conn = {"mtime": None, "dati": {}}


def _stato_connettore():
    try:
        mt = CONN_FILE.stat().st_mtime
    except OSError:
        return {}
    if mt != _conn["mtime"]:
        try:
            dati = json.loads(CONN_FILE.read_text(encoding="utf-8"))
            _conn.update(mtime=mt, dati=dati if isinstance(dati, dict) else {})
        except (OSError, ValueError):
            pass
    return _conn["dati"]


def _e_tia(progetto):
    return "tia" in str(progetto or "").lower()


def _thread_cloud():
    """[(voce, progetto)]: stato-thread.json (Agente TIA) piu' il connettore. Se lo stesso thread
    c'e' in tutti e due, vale la voce scritta per ultima."""
    voci = {}
    for t in _stato_cloud().get("thread") or []:
        if isinstance(t, dict) and t.get("id"):
            voci[("agente tia portal", str(t["id"]).lower())] = (t, "Agente Tia portal")
    for t in _stato_connettore().get("thread") or []:
        if not isinstance(t, dict) or not t.get("id"):
            continue
        prog = str(t.get("progetto") or "").strip() or "Altro progetto"
        k = ("agente tia portal" if _e_tia(prog) else prog.lower(), str(t["id"]).lower())
        vecchia = voci.get(k)
        if vecchia and (_iso(vecchia[0].get("ultima_attivita_utc")) or 0) > (_iso(t.get("ultima_attivita_utc")) or 0):
            continue
        voci[k] = (t, "Agente Tia portal" if _e_tia(prog) else prog)
    return list(voci.values())


def _chan_di(progetto, locali):
    if _e_tia(progetto):
        return next((s.get("chan") for s in locali if s.get("chan") and s.get("progetto_claude", "").lower().startswith("agente tia")), None) or \
            next((s.get("chan") for s in locali if s.get("chan") and s.get("progetto_claude", "").lower().startswith("agente")), None)
    try:
        noti = json.loads(LINK_PROGETTI.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        noti = {}
    for p in PROGETTI_FISSI:
        if p["cerca"] in progetto.lower() and str(noti.get(p["id"], "")).startswith("chan_"):
            return noti[p["id"]]
    return next((s.get("chan") for s in locali if s.get("chan") and progetto.lower() in str(s.get("progetto_claude") or "").lower()), None)


def _sessioni_cloud(locali):
    """Una figura per ogni thread del cloud, se sul PC non c'e' gia' una sua sessione al lavoro."""
    dati = _stato_cloud()
    al_pc = {(s.get("thread") or "").lower() for s in locali
             if s.get("stato") in ("aspetta", "lavora", "pensa", "ferma?")}
    chans = {}
    out = []
    for t, progetto in _thread_cloud():
        if str(t["id"]).lower() in al_pc:
            continue
        if progetto not in chans:
            chans[progetto] = _chan_di(progetto, locali)
        chan = chans[progetto]
        altro = not _e_tia(progetto)
        testo = str(t.get("stato") or "").strip()
        st = testo.lower()
        if st.startswith(("chius", "archiviat")):    # chiuso da Stefano: sparisce, e l'ufficio fa la scena di chiusura
            continue
        stato = "aspetta" if st.startswith("aspetta") else "finito" if st.startswith(("finit", "fatto")) else "lavora"
        ts = _iso(t.get("ultima_attivita_utc")) or _iso(dati.get("aggiornato_utc")) or time.time()
        vecchio = stato == "lavora" and time.time() - ts > VECCHIO_S     # "lavora" ma nessuna notizia da troppo
        out.append({
            "id": "cloud:" + str(t["id"]), "cloud": True, "thread": str(t["id"]),
            "thread_titolo": t.get("titolo"), "titolo": t.get("titolo") or "(thread nel cloud)",
            "responsabile": None, "stato": stato, "modificato": ts,
            "icona": "✋" if stato == "aspetta" else "☁️",
            "attivita": str(t["attesa"])[:120] if stato == "aspetta" and t.get("attesa") else
                        str(t["attivita"])[:120] if t.get("attivita") else
                        (testo[:1].upper() + testo[1:] if testo else "Lavora nel cloud"),
            "progetto": "cloud", "progetto_claude": progetto, "chan": chan, "altro_progetto": altro,
            "link": t.get("link") if str(t.get("link") or "").startswith("https://claude.ai/") else
                    (f"https://claude.ai/code/project/{chan}?thread={t['id']}" if chan and str(t["id"]).startswith("cmsg_") else
                     f"https://claude.ai/code/project/{chan}" if chan else None),
            "voce_cloud_resp": None if altro else t.get("responsabile"),
            **_info_extra(t, stato),
            **_aspetto_progetto(progetto),
        })
        if vecchio:                                    # omino arancione con ⏳: il dato potrebbe non essere vero
            ore = int((time.time() - ts) // 3600)
            out[-1].update(stato="ferma?", icona="⏳", vecchio=True,
                           attivita="Dato vecchio? " + str(out[-1]["attivita"])[:90])
        out += _sottoagenti_interni(t, ts, out[-1]["link"], chan, progetto)
    return out


def _aspetto_progetto(progetto):
    """I thread di KUKA e GX Works hanno l'aspetto della loro figura fissa (tuta, signore anziano...)."""
    p = next((p for p in PROGETTI_FISSI if p["cerca"] in str(progetto).lower()), None) if not _e_tia(progetto) else None
    return {"donna": p["donna"], "tuta": p.get("tuta", False), "anziano": p.get("anziano", False)} if p else {}


def _info_extra(t, stato):
    """Campi facoltativi scritti da Agente TIA (Messaggio 28): versione, prossimo passo,
    compilazione solo se KO, da quando aspetta, priorita'."""
    out = {}
    if t.get("versione"):
        out["versione"] = str(t["versione"])[:40]
    if t.get("prossimo"):
        out["prossimo"] = str(t["prossimo"])[:80]
    c = t.get("compilazione")
    n = c.get("errori") if isinstance(c, dict) else c
    if isinstance(n, str):
        m = re.search(r"\d+", n)
        n = int(m.group(0)) if m else (1 if re.search(r"ko|error", n, re.I) else 0)
    if isinstance(n, (int, float)) and not isinstance(n, bool) and n > 0:
        out["compilazione"] = {"errori": int(n)}
    if stato == "aspetta" and _iso(t.get("aspetta_dal_utc")):
        out["aspetta_dal"] = _iso(t.get("aspetta_dal_utc"))
    p = str(t.get("priorita") or "").lower()
    if p.startswith(("alt", "urg")):
        out["priorita"] = "alta"
    elif p.startswith("bass"):
        out["priorita"] = "bassa"
    return out


# Progetti claude.ai che hanno sempre una persona fissa in ufficio (richiesta di Stefano, 18/11).
# Se sul PC ci sono gia' sessioni di quel progetto al lavoro, si vedono quelle e la figura fissa non serve.
PROGETTI_FISSI = [
    {"id": "fisso:ufficio-virtuale", "progetto": "Ufficio virtuale", "cerca": "ufficio virtuale", "donna": True,
     "titolo": "Ufficio virtuale › Progettista", "aggiornamenti": True},
    {"id": "fisso:agente-kuka", "progetto": "Agente robot KUKA", "cerca": "kuka", "donna": False,
     "titolo": "Agente robot KUKA › Meccanico robot", "tuta": True},
    {"id": "fisso:agente-gx", "progetto": "Agente GX Works", "cerca": "gx", "donna": False,
     "titolo": "Agente GX Works › Programmatore", "anziano": True},
]


LINK_PROGETTI = HERE / "progetti-link.json"     # personale: chan dei progetti visti sul PC (non va nel repo)


def _chan_progetti(locali):
    """Il codice (chan_...) di ogni progetto fisso, preso dalle sessioni sul PC e ricordato in progetti-link.json."""
    try:
        noti = json.loads(LINK_PROGETTI.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        noti = {}
    nuovi = dict(noti)
    for p in PROGETTI_FISSI:
        for s in locali:
            ch = str(s.get("chan") or "")
            if ch.startswith("chan_") and p["cerca"] in str(s.get("progetto_claude") or "").lower():
                nuovi[p["id"]] = ch
                break
    if nuovi != noti:
        try:
            LINK_PROGETTI.write_text(json.dumps(nuovi, indent=1), encoding="utf-8")
        except OSError:
            pass
    return nuovi


def _progetti_fissi(locali, cloud=()):
    ora = time.time()
    out = []
    chan = _chan_progetti(locali)
    for p in PROGETTI_FISSI:
        suoi = [s for s in list(locali) + [c for c in cloud if c.get("altro_progetto")]
                if p["cerca"] in str(s.get("progetto_claude") or "").lower()]
        if any(s.get("stato") in ("aspetta", "lavora", "pensa") for s in suoi):
            continue                                   # ci sono gia' le sue sessioni vere
        ultimo = max([s.get("modificato", 0) for s in suoi] + [0])
        if p.get("aggiornamenti"):                     # l'ufficio stesso: quando arriva una versione nuova, ci sta lavorando
            try:
                ultimo = max(ultimo, aggiorna.SHA_FILE.stat().st_mtime)
            except OSError:
                pass
        lavora = ora - ultimo < 40 * 60
        out.append({
            "id": p["id"], "titolo": p["titolo"], "thread_titolo": p["titolo"], "progetto_claude": p["progetto"],
            "progetto": "cloud", "cloud": True, "responsabile": None, "donna": p["donna"], "tuta": p.get("tuta", False), "anziano": p.get("anziano", False), "fisso": True,
            "stato": "lavora" if lavora else "finito",
            "icona": "🛠️" if lavora else "✅",
            "attivita": ("Nuova versione: " + VERSIONE.split("(", 1)[-1].rstrip(")") if p.get("aggiornamenti") else "Lavora al progetto")
                        if lavora else "Nessun lavoro in corso",
            "modificato": ora // 3600 * 3600,          # resta in ufficio (non si chiude dopo un giorno)
            "link": f"https://claude.ai/code/project/{chan[p['id']]}" if str(chan.get(p["id"], "")).startswith("chan_") else None,
        })
    return out


def _sottoagenti_interni(t, ts, link, chan, progetto="Agente Tia portal"):
    """Sottoagenti lanciati DENTRO un thread (campo "sottoagenti" di stato-thread.json):
    una figura temporanea ciascuno, nell'isola del thread. Quando finiscono spariscono
    (l'ufficio li fa uscire dalla porta)."""
    sub = t.get("sottoagenti")
    if isinstance(sub, int):
        sub = [{"nome": f"Sottoagente {i + 1}", "stato": "lavora"} for i in range(max(0, min(sub, 8)))]
    if not isinstance(sub, list):
        return []
    base = str(t.get("titolo") or "")
    if not _e_tia(progetto):
        isola = base or progetto
    elif _BOSS.search(base):
        isola = _senza_boss(base)
    else:
        parti = _SEPARATORE.split(base, 1)
        resp = str(t.get("responsabile") or "")
        isola = _senza_boss(parti[0]) if len(parti) == 2 else (resp if resp and not resp.startswith("(") else "Capo")
    out = []
    for i, a in enumerate(sub[:8]):
        a = {"nome": a} if isinstance(a, str) else a
        if not isinstance(a, dict):
            continue
        nome = str(a.get("nome") or f"Sottoagente {i + 1}").strip()[:40]
        st = str(a.get("stato") or "lavora").lower()
        if st.startswith(("finit", "fatto", "chius")):
            continue
        out.append({
            "id": "cloud:" + str(t["id"]) + ":sub:" + re.sub(r"[^a-z0-9]+", "-", nome.lower()).strip("-"),
            "cloud": True, "thread": None, "sottoagente": True,
            "thread_titolo": f"{isola} › {nome}", "titolo": f"{isola} › {nome}",
            "responsabile": None, "stato": "aspetta" if st.startswith("aspetta") else "lavora", "modificato": ts,
            "icona": "🧩", "attivita": nome, "progetto": "cloud", "progetto_claude": progetto, "chan": chan,
            "altro_progetto": not _e_tia(progetto),
            "link": link, "voce_cloud_resp": None,
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
                    "versione": txt("versione")[:40], "priorita": txt("priorita")[:20],
                    "domande": [str(d)[:300] for d in ([c["domande"]] if isinstance(c.get("domande"), str) else c.get("domande") or []) if d][:8],
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
    ora = time.time()
    # Una sola verita' (critica 19/11): lo stato vero e' quello del thread; commesse.json e' l'anagrafica.
    sess_thread = {str(s.get("thread") or "").lower(): s for s in sessions if s.get("thread") and not s.get("sottoagente")}
    for r in resp:
        sc, st = r["scheda"], sess_thread.get(str(r["thread"] or "").lower())
        if not sc or not st:
            continue
        dal_thread = {"aspetta": "aspetta stefano", "finito": "fatto"}.get(st.get("stato"),
                     "in lavorazione" if st.get("stato") in ("lavora", "pensa", "ferma?") else None)
        scheda_aspetta = sc["stato"] in ("aspetta stefano", "domande aperte")
        if dal_thread and (scheda_aspetta != (dal_thread == "aspetta stefano") or (dal_thread == "fatto") != (sc["stato"] == "fatto")):
            r["scheda"] = dict(sc, stato_scheda=sc["stato"], stato=dal_thread, disaccordo=True,
                               colore=COLORI_COMMESSA.get(dal_thread, sc["colore"]))
    for s in sessions:                       # chi aspetta da troppo, e chi ha finito da troppo (non si vede)
        if s.get("stato") == "aspetta" and ora - (s.get("aspetta_dal") or s.get("modificato") or ora) > ATTESA_LUNGA_S:
            s["attesa_lunga"] = True
        if s.get("stato") == "finito" and not s.get("fisso") and ora - (s.get("modificato") or ora) > FINITI_ORE * 3600:
            s["visibile"] = False
    azioni = sorted(({"titolo": s.get("titolo"), "link": s.get("link"), "da": s.get("aspetta_dal") or s.get("modificato"),
                      "cosa": s.get("attivita")} for s in sessions if s.get("stato") == "aspetta" and s.get("visibile", True)),
                    key=lambda a: a["da"] or 0)
    ids = {str(s.get("thread") or "").lower() for s in sessions}
    problemi = [f"commessa {c['nome']} senza thread" for c in schede if not c["thread"]] + \
               [f"commessa {c['nome']}: thread non trovato" for c in schede if c["thread"] and c["thread"].lower() not in ids
                and c["stato"] != "fatto"]
    agg = _iso(cloud.get("aggiornato_utc")) if cloud else None
    return {"responsabili": resp, "azioni_per_te": azioni, "finiti_ore": FINITI_ORE, "problemi_dati": problemi[:10],
            "dati_vecchi": bool(agg and ora - agg > ATTESA_LUNGA_S), "chan": chan, "commesse": schede,
            "commesse_aggiornate": _iso(comm.get("aggiornato_utc")) if comm else None,
            "tia": _tia_con_proprietario(sessions) if _tia["ok"] else None,
            "cloud_aggiornato": _iso(cloud.get("aggiornato_utc")) if cloud else None,
            "pc": (cloud.get("pc") or "on") if cloud else "on"}           # "\\pc off" / "\\pc on" scritti da Agente TIA


# ---------- l'ispettrice: chiede davvero un resoconto al thread di un omino ----------
# Scrive solo ispettrice.json (personale). La richiesta arriva al thread la prossima volta che usa
# il connettore (ufficio_aggiorna / ufficio_guarda); la risposta torna in connettore-stato.json.
ISP_FILE = HERE / "ispettrice.json"
_isp = {"dati": None}


def _isp_leggi():
    if _isp["dati"] is None:
        try:
            d = json.loads(ISP_FILE.read_text(encoding="utf-8"))
            _isp["dati"] = d if isinstance(d, dict) else {}
        except (OSError, ValueError):
            _isp["dati"] = {}
        _isp["dati"].setdefault("richieste", [])
    return _isp["dati"]


# interruttore dei resoconti (pulsante 📋 nella pagina): impostazioni.json, personale, letto anche da connettore.py
IMPOSTAZIONI = HERE / "impostazioni.json"


def isp_resoconti():
    """True se l'ispettrice puo' chiedere davvero il resoconto ai thread (spende token). Di base: spento."""
    try:
        return bool(json.loads(IMPOSTAZIONI.read_text(encoding="utf-8")).get("ispettrice_resoconti"))
    except (OSError, ValueError, AttributeError):
        return False


def isp_resoconti_imposta(acceso):
    try:
        d = json.loads(IMPOSTAZIONI.read_text(encoding="utf-8"))
        d = d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        d = {}
    d["ispettrice_resoconti"] = bool(acceso)
    tmp = IMPOSTAZIONI.with_suffix(".tmp")
    tmp.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, IMPOSTAZIONI)
    if not acceso:                                   # spento: le richieste ancora aperte non arrivano piu' ai thread
        d = _isp_leggi()
        d["richieste"] = [r for r in d["richieste"] if r.get("risposta")]
        _isp_scrivi(d)


def _isp_scrivi(d):
    try:
        tmp = ISP_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")
        os.replace(tmp, ISP_FILE)
    except OSError:
        pass


def _ispettrice(sessions, ora=None):
    """Ogni ISPETTRICE_MIN minuti sceglie a caso un omino con un thread e gli chiede il resoconto."""
    import random
    ora = ora or time.time()
    d, cambiato = _isp_leggi(), False
    risposte = {str(t.get("id") or "").lower(): t for t in _stato_connettore().get("thread") or []
                if isinstance(t, dict) and t.get("resoconto")}
    for r in d["richieste"]:                                    # chi ha risposto?
        v = risposte.get(r["thread"].lower())
        q = _iso(v.get("resoconto_utc")) if v else None
        if q and q >= r["chiesta"] - 5 and not r.get("risposta"):
            r.update(risposta=str(v["resoconto"])[:600], risposto=q); cambiato = True
    tieni = [r for r in d["richieste"] if ora - r["chiesta"] < (24 * 3600 if r.get("risposta") else ISPETTRICE_ORE * 3600)]
    cambiato |= len(tieni) != len(d["richieste"])
    d["richieste"] = tieni
    aperte = [r for r in tieni if not r.get("risposta")]
    if ora - (d.get("ultima") or 0) >= ISPETTRICE_MIN * 60 and len(aperte) < ISPETTRICE_MAX:
        gia = {r["thread"].lower() for r in tieni}
        scelti = [s for s in sessions if s.get("thread") and not s.get("sottoagente") and not s.get("fisso")
                  and s.get("visibile", True) and s.get("stato") in ("lavora", "aspetta", "pensa", "ferma?")
                  and str(s["thread"]).lower() not in gia]
        if scelti:
            pesi = [3 if s.get("stato") == "ferma?" or s.get("vecchio") else 1 for s in scelti]   # i dati vecchi prima
            s = random.choices(scelti, pesi)[0]
            d["richieste"].append({"thread": str(s["thread"]), "sessione": s.get("id"), "titolo": s.get("titolo"),
                                   "progetto": s.get("progetto_claude") or "", "chiesta": ora,
                                   "mostrato": {"stato": s.get("stato"), "attivita": s.get("attivita"),
                                                "prossimo": s.get("prossimo")}})
        d["ultima"] = ora; cambiato = True
    if cambiato:
        _isp_scrivi(d)
    ultima = max(d["richieste"], key=lambda r: r["chiesta"], default=None)
    return {"visita": {k: ultima.get(k) for k in ("sessione", "titolo", "chiesta", "risposto")} if ultima else None,
            "per_sessione": {r["sessione"]: {"chiesta": r["chiesta"], "risposta": r.get("risposta"), "risposto": r.get("risposto")}
                             for r in d["richieste"] if r.get("sessione")}}


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
            cloud = _sessioni_cloud(locali)
            sessions = [s for s in _con_nomi(locali + cloud) + _progetti_fissi(locali, cloud) if s.get("modificato", 0) >= limite]
            ex = _extra(sessions)
            # 23/11 Stefano: l'ispettrice gira sempre (grafica), ma chiede i resoconti ai thread (token) solo se l'interruttore e' acceso
            ex["ispettrice"] = _ispettrice(sessions) if isp_resoconti() else {"visita": None, "per_sessione": {}}
            ex["ispettrice"]["resoconti"] = isp_resoconti()
            extra = json.dumps(ex, ensure_ascii=False).encode("utf-8")   # prima: aggiunge campi alle sessioni
            data = json.dumps(sessions, ensure_ascii=False).encode("utf-8")
            with _cond:
                if data != _snapshot["json"] or extra != _snapshot.get("extra"):
                    _snapshot.update(versione=_snapshot["versione"] + 1, sessioni=sessions, json=data, extra=extra)
                    _diagnosi(sessions, extra)
                    _cond.notify_all()
        except Exception as exc:  # non deve mai fermarsi
            print("errore durante la scansione:", exc, file=sys.stderr)
        time.sleep(POLL_S)


# ---------- pulsante AGGIORNA ----------
# aggiorna-token.json (personale, resta sul PC): {"url": "https://api.anthropic.com/v1/claude_code/routines/trig_.../fire",
# "token": "sk-ant-oat01-..."}. Il POST avvia l'attivita' "Ufficio: pulsante AGGIORNA": apre un thread
# "Capo › Giro AGGIORNA ufficio" che rilegge lo stato di tutti i thread, riscrive stato-thread.json e si chiude da solo.
TOKEN_FILE = HERE / "aggiorna-token.json"
URL_AGGIORNA = "https://api.anthropic.com/v1/claude_code/routines/trig_01B3kGy9WsMA7MWSVZfbPZQ5/fire"   # l'attivita' "Ufficio: pulsante AGGIORNA"
_agg = {"ultima": 0}


def _chiedi_aggiornamento():
    import urllib.request
    import urllib.error
    if time.time() - _agg["ultima"] < 60:
        return {"ok": True, "nota": "Aggiornamento gia' chiesto meno di un minuto fa: arriva tra poco."}
    try:
        cfg = json.loads(TOKEN_FILE.read_text(encoding="utf-8"))
        url, token = str(cfg["url"]).strip(), str(cfg["token"]).strip()
    except (OSError, ValueError, KeyError, TypeError):
        return {"ok": False, "manca_token": True, "errore": "Manca il codice del pulsante: incollalo quando te lo chiede."}
    if not url.startswith("https://api.anthropic.com/") or not url.endswith("/fire"):
        return {"ok": False, "errore": "L'indirizzo in aggiorna-token.json non e' quello giusto (deve finire con /fire)."}
    req = urllib.request.Request(url, data=json.dumps({"text": "pulsante AGGIORNA dall'ufficio sul PC"}).encode("utf-8"),
                                 method="POST", headers={
                                     "Authorization": "Bearer " + token,
                                     "anthropic-version": "2023-06-01",
                                     "anthropic-beta": "experimental-cc-routine-2026-04-01",
                                     "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            r.read()
    except urllib.error.HTTPError as e:
        motivo = {401: "codice non valido o rigenerato", 403: "accesso negato", 404: "attivita' non trovata",
                  429: "troppe richieste, riprova tra poco"}.get(e.code, "errore " + str(e.code))
        try:                                   # il motivo vero, dalla risposta di Anthropic (senza il codice)
            dett = json.loads(e.read().decode("utf-8", "replace")).get("error", {}).get("message", "")
        except (ValueError, OSError, AttributeError):
            dett = ""
        try:
            with open(HERE / "aggiorna.log", "a", encoding="utf-8") as f:
                f.write(time.strftime("%Y-%m-%d %H:%M:%S") + f" pulsante AGGIORNA: HTTP {e.code} {dett[:300]}\n")
        except OSError:
            pass
        return {"ok": False, "manca_token": e.code in (401, 403),
                "errore": "Aggiornamento non partito: " + motivo + (" (" + dett[:160] + ")" if dett else "") + "."}
    except (urllib.error.URLError, OSError) as e:
        return {"ok": False, "errore": "Aggiornamento non partito: internet non raggiungibile (" + str(e)[:80] + ")."}
    _agg["ultima"] = time.time()
    return {"ok": True, "nota": "Aggiornamento chiesto: arriva in 1-2 minuti."}


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

    def _chiamata_lecita(self):
        """Solo la pagina dell'ufficio (o i programmi del PC) possono usare il server:
        - Host deve essere localhost/127.0.0.1 (blocca il "DNS rebinding" di un sito esterno);
        - una richiesta partita da un ALTRO sito (Sec-Fetch-Site: cross-site, o Origin diverso)
          viene rifiutata (blocca un sito che prova a chiamare localhost:8787 dal browser)."""
        host = (self.headers.get("Host") or "").rsplit(":", 1)[0].strip("[]").lower()
        if host not in ("localhost", "127.0.0.1", "::1", ""):
            return False
        sito = (self.headers.get("Sec-Fetch-Site") or "").lower()
        if sito in ("cross-site", "same-site"):
            return False
        origin = (self.headers.get("Origin") or "").lower()
        if origin and origin != "null":
            o = urlparse(origin)
            if o.hostname not in ("localhost", "127.0.0.1", "::1"):
                return False
        return True

    def do_POST(self):
        if not self._chiamata_lecita():
            return self._send(403, b"vietato", "text/plain; charset=utf-8")
        self._corpo = b""
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n:
                self._corpo = self.rfile.read(min(n, 65536))
        except (ValueError, OSError):
            pass
        return self._azione(self.path.split("?", 1)[0])

    def _azione(self, path):
        """Le richieste che CAMBIANO qualcosa (scrivono un file, riavviano)."""
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
        if path == "/api/ispettrice":       # ?resoconti=1|0: interruttore dei resoconti chiesti ai thread
            q = parse_qs(urlparse(self.path).query)
            try:
                isp_resoconti_imposta(q.get("resoconti", ["0"])[0] == "1")
            except OSError:
                return self._send(500, b'{"ok": false}', "application/json")
            return self._send(200, json.dumps({"ok": True, "resoconti": isp_resoconti()}).encode("utf-8"), "application/json")
        if path == "/api/aggiorna-token":   # la pagina salva il codice del pulsante AGGIORNA (resta solo sul PC)
            try:
                token = str(json.loads(self._corpo.decode("utf-8")).get("token") or "").strip()
            except (ValueError, AttributeError):
                token = ""
            if not token.startswith("sk-ant-") or len(token) > 400 or any(c.isspace() for c in token):
                return self._send(400, json.dumps({"ok": False, "errore": "Il codice deve iniziare con sk-ant-"}).encode("utf-8"),
                                  "application/json; charset=utf-8")
            TOKEN_FILE.write_text(json.dumps({"url": URL_AGGIORNA, "token": token}, indent=1), encoding="utf-8")
            return self._send(200, b'{"ok": true}', "application/json")
        if path == "/api/aggiorna":         # pulsante AGGIORNA: sveglia il thread che rilegge lo stato dei thread
            esito = _chiedi_aggiornamento()
            return self._send(200 if esito.get("ok") else 502, json.dumps(esito, ensure_ascii=False).encode("utf-8"),
                              "application/json; charset=utf-8")
        if path == "/api/riavvia":          # usato da avvio.pyw dopo un aggiornamento
            self._send(200, b'{"ok": true}', "application/json")
            if _SERVER:
                threading.Thread(target=_riavvia, args=(_SERVER,), daemon=True).start()
            return
        self._send(404, b"non trovato", "text/plain; charset=utf-8")

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if not self._chiamata_lecita():
            return self._send(403, b"vietato", "text/plain; charset=utf-8")
        if path in STATIC:
            name, ctype = STATIC[path]
            return self._send(200, (HERE / name).read_bytes(), ctype)
        if path.startswith("/lib/umani/"):            # personaggi realistici del 3D++ (MakeHuman, CC0)
            base = (HERE / "lib" / "umani").resolve()
            f = (base / path[len("/lib/umani/"):]).resolve()
            if base in f.parents and f.is_file():
                tipi = {".json": "application/json", ".webp": "image/webp", ".gz": "application/octet-stream", ".gltf": "model/gltf+json", ".bin": "application/octet-stream"}
                return self._send(200, f.read_bytes(), tipi.get(f.suffix, "application/octet-stream"))
            return self._send(404, b"", "text/plain")
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
        if path in ("/api/nome-isola", "/api/riavvia"):
            # compatibilita': le versioni vecchie di avvio.pyw chiamano /api/riavvia con GET.
            # Una richiesta GET dal browser arriva solo dalla pagina stessa (controllo sopra).
            return self._azione(path)
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
    """Dopo un aggiornamento: libero la porta e riparto con il codice nuovo.
    Prima lancio la verifica (con il codice vecchio): se il nuovo non parte, torna indietro."""
    aggiorna.lancia_verifica(PORTA_ATTIVA)
    print("Versione nuova installata: riavvio il server.", flush=True)
    time.sleep(0.3)                  # lascio partire la risposta HTTP in corso
    server.server_close()
    flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" and not _ha_console() else 0
    subprocess.Popen([sys.executable] + sys.argv, cwd=HERE, creationflags=flags,
                     stdout=sys.stdout if _ha_console() else None)
    os._exit(0)


PORTA_ATTIVA = 8787


def _conferma_avvio(porta):
    """Il server nuovo risponde davvero: confermo la versione (toglie .in-prova)."""
    time.sleep(5)
    try:
        import urllib.request
        with urllib.request.urlopen(f"http://127.0.0.1:{porta}/api/versione", timeout=10) as r:
            json.loads(r.read())
        with urllib.request.urlopen(f"http://127.0.0.1:{porta}/api/sessions", timeout=30) as r:
            json.loads(r.read())
        aggiorna.conferma()
    except Exception as exc:
        print("avvio non confermato:", exc, file=sys.stderr)


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
    try:                             # connettore Ufficio in Claude Desktop (anche dopo un aggiornamento automatico)
        import registra_connettore
        registra_connettore.registra()
    except Exception as exc:
        print("connettore non registrato:", exc, file=sys.stderr)
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
    global _SERVER, PORTA_ATTIVA
    _SERVER = server
    PORTA_ATTIVA = args.porta
    threading.Thread(target=_conferma_avvio, args=(args.porta,), daemon=True).start()
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

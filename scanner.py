"""Ufficio virtuale - Task 1: scanner delle sessioni di Claude Code.

Legge i transcript in ~/.claude/projects/**/*.jsonl e stampa una tabella con le
sessioni attive di recente e cosa stanno facendo. Usa solo la libreria standard
di Python, non chiama nessuna AI e non scrive nulla: legge e basta.

Uso:
    python scanner.py            # sessioni delle ultime 24 ore
    python scanner.py --ore 4    # sessioni delle ultime 4 ore
    python scanner.py --json     # stessa cosa in JSON (servira' al task 2)
"""
import argparse
import html
import json
import re
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import etichette  # noqa: E402

PROJECTS_DIR = Path(os.environ.get("CLAUDE_CONFIG_DIR", Path.home() / ".claude")) / "projects"
HEAD_BYTES = 256 * 1024   # inizio del file: serve per il titolo
TAIL_BYTES = 2 * 1024 * 1024  # fine del file: serve per lo stato attuale
IDLE_MIN = 10             # oltre questi minuti senza scritture la sessione e' "inattiva"


def _read_lines(path, start, size):
    with open(path, "rb") as f:
        f.seek(start)
        data = f.read(size)
    lines = data.split(b"\n")
    if start > 0:
        lines = lines[1:]          # la prima riga e' tagliata a meta'
    out = []
    for raw in lines:
        raw = raw.strip()
        if not raw:
            continue
        try:
            out.append(json.loads(raw))
        except ValueError:
            pass                    # riga incompleta (il file si sta scrivendo)
    return out


def _text_of(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return " ".join(b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text")
    return ""


def _is_real_prompt(rec):
    """Un messaggio scritto da una persona (non un tool_result o un messaggio di sistema)."""
    if rec.get("type") != "user" or rec.get("isMeta") or rec.get("isSidechain"):
        return False
    content = rec.get("message", {}).get("content")
    if isinstance(content, list) and any(isinstance(b, dict) and b.get("type") == "tool_result" for b in content):
        return False
    text = _text_of(content).strip()
    return bool(text) and not text.startswith("<") and not text.startswith("Caveat:")


_TAGGED = re.compile(r"<(message|note|cited)\b[^>]*>(.*?)</\1>", re.S)
_NOISE = re.compile(r"<(system-reminder|session-context|system-note|untrusted-uploads|"
                    r"local-command-stdout|local-command-stderr)\b[^>]*>.*?</\1\b[^>]*>", re.S)


def clean_text(text):
    """Testo leggibile di un messaggio utente. Le sessioni avviate da remoto
    avvolgono il messaggio in buste <wake>/<relay>: tengo i <message>, <cited>
    e <note> non vuoti; altrimenti tolgo i blocchi tecnici e i tag."""
    text = _NOISE.sub(" ", text or "")
    parts = [p for _, p in _TAGGED.findall(text) if re.sub(r"<[^>]+>", "", p).strip()]
    if parts:
        text = "\n\n".join(parts)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    text = re.sub(r"[ \t]+", " ", text)
    return re.sub(r"\n\s*\n+", "\n\n", text).strip()


def _title_from(text):
    """Come clean_text, ma per il titolo nelle buste remote preferisco le istruzioni
    (<note>) e il messaggio (<message>) alla risposta citata della persona (<cited>),
    che spesso e' corta: "\\pc on", "fatto", "vai"."""
    pulito = _NOISE.sub(" ", text or "")
    for tag in ("note", "message"):
        parts = [p for t, p in _TAGGED.findall(pulito) if t == tag and re.sub(r"<[^>]+>", "", p).strip()]
        if parts:
            return clean_text("\n\n".join(parts)) or None
    t = clean_text(text)
    return t or None


def _short(text, n):
    text = " ".join(str(text).split())
    return text if len(text) <= n else text[: n - 1] + "…"


def _describe_tool(block):
    name = block.get("name", "?")
    inp = block.get("input") or {}
    detail = ""
    for key in ("description", "command", "file_path", "pattern", "query", "url", "prompt", "action", "operation"):
        if isinstance(inp.get(key), str) and inp[key].strip():
            detail = inp[key]
            break
    if name.startswith("mcp__"):
        parts = name.split("__")
        name = "/".join(parts[1:])   # es. tiamulti/tia_plc
    return name, _short(detail, 60)


def _parse_ts(value):
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except (AttributeError, ValueError):
        return None


_THREAD_TITLE = re.compile(rb'Thread title: \\"((?:[^"\\]|\\.)*?)\\"')
MIN_TITLE = 15            # un messaggio piu' corto ("Ora", "pc on") non fa da titolo


_PROJECT = re.compile(rb'<project id=\\?"(chan_[A-Za-z0-9]{10,})\\?"[^>]*?name=\\?"([^"\\]+)')
_PROJECT_CTX = re.compile(rb'Project: \\"([^"\\]+)\\" \(id: `(chan_[A-Za-z0-9]{10,})`\)')
_THREAD = re.compile(rb'<thread ts=\\?"(cmsg_[A-Za-z0-9]{10,})')
_RESPONSABILE = re.compile(r"^[ \t*_]*Thread[ \t]*:[ \t]*[«\"']?(.+?)[»\"']?[ \t*_]*$", re.M | re.I)
_COMMESSA = re.compile(r"(?<![\w])(\d{2}_\d{3})(?![\w])")    # es. 24_247


def _first_title(path, max_bytes=32 * 1024 * 1024):
    """Compatibilita': cartella e titolo."""
    meta = session_meta(path, max_bytes)
    return meta["cwd"], meta["titolo"]


def session_meta(path, max_bytes=32 * 1024 * 1024):
    """Dati dall'inizio della sessione:
    - titolo: il titolo del thread claude.ai se c'e', altrimenti il primo messaggio
      della persona lungo almeno MIN_TITLE caratteri, altrimenti il primo messaggio;
    - progetto claude.ai (nome e id) e thread, per il link alla chat;
    - commessa: il primo codice tipo 24_247 nei messaggi della persona.
    Legge riga per riga: le righe possono essere enormi (screenshot in base64)."""
    meta = {"cwd": None, "titolo": None, "progetto_claude": None, "chan": None,
            "thread": None, "commessa": None, "thread_titolo": None, "remoto": False}
    first, title, thread_title, read = None, None, None, 0
    with open(path, "rb") as f:
        for raw in f:
            read += len(raw)
            if read > max_bytes:
                break
            if thread_title is None:
                m = _THREAD_TITLE.search(raw)
                if m:
                    try:
                        thread_title = json.loads(b'"' + m.group(1) + b'"').strip()
                    except ValueError:
                        thread_title = m.group(1).decode("utf-8", "replace").strip()
            if meta["chan"] is None or meta["progetto_claude"] is None:
                m = _PROJECT.search(raw) or None
                if m:
                    meta["chan"], meta["progetto_claude"] = (m.group(1).decode(),
                                                             m.group(2).decode("utf-8", "replace"))
                else:
                    m = _PROJECT_CTX.search(raw)
                    if m:
                        meta["progetto_claude"], meta["chan"] = (m.group(1).decode("utf-8", "replace"),
                                                                 m.group(2).decode())
            if meta["thread"] is None:
                m = _THREAD.search(raw)
                if m:
                    meta["thread"] = m.group(1).decode()
            done = (thread_title or title) and meta["chan"] and meta["thread"] and meta["commessa"] \
                and meta["thread_titolo"]
            if done:
                break
            if b'"type":"user"' not in raw and b'"type": "user"' not in raw and meta["cwd"] is not None:
                continue
            try:
                rec = json.loads(raw)
            except ValueError:
                continue
            if meta["cwd"] is None and rec.get("cwd"):
                meta["cwd"] = rec["cwd"]
            if rec.get("type") != "user" or rec.get("isMeta") or rec.get("isSidechain"):
                continue
            if first is None and re.match(r"\s*<(wake|relay|coordinator-relay)\b", _text_of(rec.get("message", {}).get("content"))):
                meta["remoto"] = True        # aperta da un thread di claude.ai: risponde a lui, non a te
            t = _title_from(_text_of(rec.get("message", {}).get("content")))
            if not t or t.startswith("Caveat:"):
                continue
            # riga "Thread: 24_247 op20" messa dal thread che ha aperto la sessione
            m = _RESPONSABILE.search(t)
            if m:
                if meta["thread_titolo"] is None:
                    meta["thread_titolo"] = _short(m.group(1), 90)
                t = _RESPONSABILE.sub("", t).strip()
                if not t:
                    continue
            if meta["commessa"] is None:
                m = _COMMESSA.search(t)
                if m:
                    meta["commessa"] = m.group(1)
            first = first or t
            if title is None and len(t) >= MIN_TITLE:
                title = t
                # continuo ancora un po' per titolo del thread, progetto e commessa
                max_bytes = min(max_bytes, read + 2 * 1024 * 1024)
    t = thread_title or title or first
    meta["titolo"] = _short(t, 70) if t else None
    if meta["chan"] and meta["thread"]:
        meta["link"] = f"https://claude.ai/code/project/{meta['chan']}?thread={meta['thread']}"
    return meta


def _cwd_of(raw):
    try:
        return json.loads(raw).get("cwd")
    except ValueError:
        return None


_VERSIONE_TIA = re.compile(r"\.ap(\d{2})\b", re.I)
_ERRORI = re.compile(r"(\d+)\s*(?:errori|errors?|error\(s\))\b|\"?errors?\"?\s*[:=]\s*(\d+)", re.I)
_AVVISI = re.compile(r"(\d+)\s*(?:avvisi|warnings?)\b|\"?warnings?\"?\s*[:=]\s*(\d+)", re.I)


def _versione_tia(inp):
    v = str(inp.get("version") or inp.get("versione") or "")
    m = re.search(r"(\d{2})", v)
    if m:
        return "V" + m.group(1)
    m = _VERSIONE_TIA.search(str(inp.get("path") or inp.get("name") or inp.get("file_path") or ""))
    return "V" + m.group(1) if m else None


def _esito_compilazione(testo):
    """{"errori": n, "avvisi": n} da un risultato di compilazione; errori -1 = falliti, numero ignoto."""
    m = _ERRORI.search(testo)
    a = _AVVISI.search(testo)
    avvisi = int(next(g for g in a.groups() if g)) if a else 0
    if m:
        return {"errori": int(next(g for g in m.groups() if g)), "avvisi": avvisi}
    if re.search(r"\b(error|errore|failed|fallit)", testo, re.I):
        return {"errori": -1, "avvisi": avvisi}
    return {"errori": 0, "avvisi": avvisi}


ASPETTA_ORE = 12            # oltre, una domanda senza risposta non conta piu'
_URL = re.compile(r"https?://\S+|\(#[^)]*\)|\(/[^)]*\)")
_DOMANDE_STRUMENTI = {"askuserquestion", "request_decision"}
_MESSAGGI_STRUMENTI = {"post_message"}   # send_message va a un'altra sessione, non alla persona


def _domanda(testo):
    """L'ultima frase con il punto interrogativo, se c'e' (link e markdown tolti)."""
    t = _URL.sub("", testo or "")
    t = re.sub(r"[*_`#>\[\]]", "", t)
    frasi = [f.strip(" -•\t") for f in re.split(r"(?<=[?.!:])\s+|\n+", t)]
    domande = [f for f in frasi if f.endswith("?") and len(f) > 3]
    return domande[-1] if domande else None


def _domanda_da_strumento(b):
    """("decisione", testo) per le domande con le scelte, ("messaggio", domanda o None)
    per i messaggi alla persona, (None, None) per gli altri strumenti."""
    nome = etichette.short_name(b.get("name", "")).lower()
    inp = b.get("input") if isinstance(b.get("input"), dict) else {}
    if nome in _DOMANDE_STRUMENTI:
        qs = inp.get("questions")
        if inp.get("question"):
            return "decisione", str(inp["question"])
        if isinstance(qs, list) and qs and isinstance(qs[0], dict) and qs[0].get("question"):
            return "decisione", str(qs[0]["question"])
        return "decisione", "Aspetta una tua decisione"
    if nome in _MESSAGGI_STRUMENTI:
        return "messaggio", _domanda(str(inp.get("text") or inp.get("message") or ""))
    return None, None


def analyze(path):
    """Riassume una sessione leggendo solo l'inizio e la fine del file."""
    size = path.stat().st_size
    head = _read_lines(path, 0, HEAD_BYTES)
    tail = head if size <= HEAD_BYTES else _read_lines(path, max(0, size - TAIL_BYTES), TAIL_BYTES)

    info = {
        "id": path.stem,
        "file": str(path),
        "cartella": None,
        "titolo": None,
        "stato": "sconosciuto",
        "attivita": "",
        "ultimo_strumento": None,
        "ultimo_evento": None,
        "sotto_agenti": 0,
        "icona": "",
        "dettaglio": "",
        "progetto_tia": None,
    }

    meta = session_meta(path)
    info["cartella"], info["titolo"] = meta["cwd"], meta["titolo"]
    info["progetto_claude"] = meta["progetto_claude"]
    info["commessa"] = meta["commessa"]
    info["link"] = meta.get("link")
    info["thread"], info["chan"] = meta["thread"], meta["chan"]
    info["thread_titolo"] = meta["thread_titolo"]    # dalla riga "Thread: ..." (il responsabile lo trova il server)
    info["responsabile"] = None
    info["remoto"] = meta["remoto"]
    m = _COMMESSA.search(meta["thread_titolo"] or "")
    if m:                                   # la commessa del titolo del thread vince
        info["commessa"] = m.group(1)
    # titoli espliciti (rinomina della sessione o riassunto), se presenti
    for rec in head + tail:
        if rec.get("type") in ("custom-title", "ai-title") and rec.get(rec["type"].replace("-t", "T")):
            info["titolo"] = _short(rec[rec["type"].replace("-t", "T")], 70)
        elif rec.get("type") == "summary" and rec.get("summary") and not info["titolo"]:
            info["titolo"] = _short(rec["summary"], 70)
    if info["cartella"] is None:
        for rec in tail:
            if rec.get("cwd"):
                info["cartella"] = rec["cwd"]

    # Stato: guardo l'ultimo messaggio "vero" (user/assistant) del filo principale.
    pending = {}           # tool_use senza risposta
    last = None
    commessa_strumenti = None   # codice commessa trovato nei percorsi usati dagli strumenti
    domanda = None              # domanda nell'ultimo messaggio dell'agente alla persona
    decisione = None            # decisione chiesta dopo l'ultimo messaggio della persona
    usa_messaggi = False        # l'agente parla con uno strumento (post_message): il testo libero non si vede
    tia = None                  # {"versione": "V18"} se l'ultimo evento TIA e' un'apertura
    plcsim = False
    compilazioni = {}           # id tool_use -> True
    info["compilazione"] = None
    info["download"] = None
    for rec in tail:
        if rec.get("isSidechain") or rec.get("type") not in ("user", "assistant"):
            continue
        ts = _parse_ts(rec.get("timestamp"))
        if ts:
            info["ultimo_evento"] = ts
        content = rec.get("message", {}).get("content")
        if _is_real_prompt(rec) or (rec["type"] == "user" and _text_of(content).lstrip().startswith("<")):
            domanda = decisione = None                     # la persona (o un nuovo messaggio) ha risposto
        if rec["type"] == "assistant" and isinstance(content, list):
            for b in content:
                # nelle sessioni avviate da claude.ai la persona vede solo i messaggi
                # mandati con lo strumento, non il testo libero dell'agente
                if isinstance(b, dict) and b.get("type") == "text" and b.get("text", "").strip() \
                        and not usa_messaggi and not meta["remoto"]:
                    domanda = _domanda(b["text"])
                if isinstance(b, dict) and b.get("type") == "tool_use":
                    tipo, testo = _domanda_da_strumento(b)
                    if tipo == "decisione":
                        decisione = testo
                    elif tipo == "messaggio":
                        domanda, usa_messaggi = testo, True
                if isinstance(b, dict) and b.get("type") == "tool_use":
                    pending[b.get("id")] = b
                    inp = b.get("input") if isinstance(b.get("input"), dict) else {}
                    if etichette.short_name(b.get("name", "")).lower() == "tia_project" and \
                            inp.get("action") in ("open", "retrieve", "create") and (inp.get("path") or inp.get("name")):
                        p_tia = re.split(r"[\\/]", str(inp.get("path") or inp.get("name")).rstrip("\\/"))[-1]
                        info["progetto_tia"] = re.sub(r"\.(ap|zap)\d+$", "", p_tia, flags=re.I)
                    icon, text = etichette.label(b.get("name", "?"), b.get("input"))
                    info["ultimo_strumento"] = f"{icon} {text}"
                    corto_nome = etichette.short_name(b.get("name", "")).lower()
                    azione = str(inp.get("action") or "").lower()
                    if corto_nome == "tia_session" and azione in ("launch", "connect", "start", "open"):
                        tia = {"versione": _versione_tia(inp) or (tia or {}).get("versione")}
                    elif corto_nome in ("tia_project", "open_project") and azione in ("open", "retrieve", "create", ""):
                        if corto_nome == "open_project" or azione:
                            tia = {"versione": _versione_tia(inp) or (tia or {}).get("versione")}
                    elif (corto_nome == "tia_session" and azione in ("close", "exit", "quit", "kill", "disconnect", "stop")) \
                            or corto_nome == "close_project" or (corto_nome == "tia_project" and azione == "close"):
                        tia = None
                    if corto_nome == "tia_sim" and azione in ("start", "stop"):
                        plcsim = azione == "start"
                    if corto_nome == "tia_online" and azione == "download":
                        info["download"] = ts or time.time()
                    if (corto_nome == "tia_plc" and azione in ("compile", "write_source")) or corto_nome == "compile_check":
                        compilazioni[b.get("id")] = True
                    if not commessa_strumenti:          # es. D:\\Commesse\\24_247\\progetto.ap18
                        percorsi = " ".join(str(v) for k, v in inp.items()
                                            if isinstance(v, str) and ("path" in k.lower() or k in ("name", "project")))
                        m = _COMMESSA.search(percorsi.replace("\\", "/"))
                        if m:
                            commessa_strumenti = m.group(1)
        if rec["type"] == "user" and isinstance(content, list):
            for b in content:
                if isinstance(b, dict) and b.get("type") == "tool_result":
                    pending.pop(b.get("tool_use_id"), None)
                    if compilazioni.pop(b.get("tool_use_id"), None):
                        c = b.get("content")
                        testo = c if isinstance(c, str) else json.dumps(c, ensure_ascii=False)
                        info["compilazione"] = dict(_esito_compilazione(testo), ts=ts)
        if rec["type"] == "assistant" or _is_real_prompt(rec) or isinstance(content, list):
            last = rec

    # commessa: prima quella scritta dalla persona, poi percorsi e nomi del progetto
    if not info["commessa"]:
        info["commessa"] = commessa_strumenti
        for fonte in (info["progetto_tia"], info["progetto_claude"], info["cartella"]):
            m = None if info["commessa"] else _COMMESSA.search((fonte or "").replace("\\", "/"))
            if m:
                info["commessa"] = m.group(1)

    info["tia"] = tia
    info["plcsim"] = plcsim
    mtime = path.stat().st_mtime
    age_min = (time.time() - mtime) / 60
    if last is None:
        info["stato"] = "vuota"
    elif pending:
        block = list(pending.values())[-1]
        name, detail = _describe_tool(block)
        icon, text = etichette.label(block.get("name", "?"), block.get("input"))
        info["stato"] = "lavora"
        info["icona"] = icon
        info["attivita"] = text
        inp = block.get("input") if isinstance(block.get("input"), dict) else {}
        if detail in (inp.get("action"), inp.get("operation")) or detail in text:
            detail = ""
        info["dettaglio"] = detail
        if age_min > 2:
            info["stato"] = "ferma?"   # strumento lungo, oppure aspetta un permesso
    elif last["type"] == "user":
        info["stato"] = "pensa"
        info["icona"] = "💭"
        info["attivita"] = "Ragiona sulla risposta"
    elif (decisione or domanda) and age_min < ASPETTA_ORE * 60:
        info["stato"] = "aspetta"
        info["icona"] = "✋"
        info["attivita"] = _short(decisione or domanda, 90)
    else:
        info["stato"] = "finito"
        info["icona"] = "☕"
        info["attivita"] = _short(_text_of(last.get("message", {}).get("content")), 60) or "turno concluso"
    if age_min > IDLE_MIN and info["stato"] in ("lavora", "pensa", "ferma?"):
        info["stato"] = "inattiva"   # probabilmente chiusa a meta'

    # Sotto-agenti: <sessione>/subagents/agent-*.jsonl scritti negli ultimi minuti
    sub_dir = path.with_suffix("") / "subagents"
    if sub_dir.is_dir():
        info["sotto_agenti"] = sum(
            1 for p in sub_dir.glob("*.jsonl") if time.time() - p.stat().st_mtime < 120
        )
    info["modificato"] = mtime
    return info


def project_name(info, fallback):
    """Nome della cartella di lavoro (funziona con percorsi Windows e Linux)."""
    cwd = (info.get("cartella") or "").rstrip("\\/")
    return re.split(r"[\\/]", cwd)[-1] if cwd else fallback


def scan(hours=24):
    if not PROJECTS_DIR.is_dir():
        return []
    limit = time.time() - hours * 3600
    sessions = []
    for proj in PROJECTS_DIR.iterdir():
        if not proj.is_dir():
            continue
        for path in proj.glob("*.jsonl"):
            try:
                if path.stat().st_mtime < limit:
                    continue
                info = analyze(path)
            except OSError:
                continue
            info["progetto"] = project_name(info, proj.name)
            sessions.append(info)
    sessions.sort(key=lambda s: s["modificato"], reverse=True)
    return sessions


def _ago(ts):
    if not ts:
        return "-"
    s = int(time.time() - ts)
    if s < 60:
        return f"{s}s fa"
    if s < 3600:
        return f"{s // 60} min fa"
    return f"{s // 3600} h {s % 3600 // 60} min fa"


def main():
    ap = argparse.ArgumentParser(description="Elenca le sessioni di Claude Code e cosa stanno facendo.")
    ap.add_argument("--ore", type=float, default=24, help="quante ore indietro guardare (default 24)")
    ap.add_argument("--json", action="store_true", help="stampa in JSON")
    ap.add_argument("--diagnosi", action="store_true",
                    help="scrive diagnosi-titoli.txt con l'inizio dei primi messaggi utente")
    args = ap.parse_args()
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except AttributeError:
        pass

    sessions = scan(args.ore)
    if args.diagnosi:
        out = Path(__file__).resolve().parent / "diagnosi-titoli.txt"
        with open(out, "w", encoding="utf-8") as f:
            for sess in sessions[:12]:
                f.write(f"=== {sess['id']}  titolo={sess['titolo']!r}\n")
                n = 0
                for rec in _read_lines(Path(sess["file"]), 0, HEAD_BYTES):
                    if rec.get("type") != "user":
                        continue
                    c = rec.get("message", {}).get("content")
                    raw = c if isinstance(c, str) else json.dumps(c, ensure_ascii=False)
                    f.write(f"--- isMeta={rec.get('isMeta')} sidechain={rec.get('isSidechain')}\n{raw[:400]}\n")
                    n += 1
                    if n >= 3:
                        break
        print("Scritto", out)
        return
    if args.json:
        print(json.dumps(sessions, ensure_ascii=False, indent=2))
        return
    if not sessions:
        print(f"Nessuna sessione nelle ultime {args.ore:g} ore in {PROJECTS_DIR}")
        return
    print(f"{len(sessions)} sessioni nelle ultime {args.ore:g} ore ({PROJECTS_DIR})\n")
    for s in sessions:
        sub = f"  +{s['sotto_agenti']} sotto-agenti" if s["sotto_agenti"] else ""
        print(f"[{s['stato']:^9}] {s['progetto']}  ·  {_ago(s['modificato'])}{sub}")
        print(f"            titolo:   {s['titolo'] or '(senza titolo)'}")
        if s["attivita"]:
            print(f"            attivita: {s['attivita']}")
        if s["ultimo_strumento"]:
            print(f"            ultimo strumento: {s['ultimo_strumento']}")
        print(f"            id: {s['id']}")
        print()


if __name__ == "__main__":
    main()

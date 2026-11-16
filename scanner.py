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


def _first_title(path, max_bytes=32 * 1024 * 1024):
    """Cartella di lavoro e titolo della sessione.
    1) il titolo del thread claude.ai, se il transcript lo contiene;
    2) altrimenti il primo messaggio della persona lungo almeno MIN_TITLE caratteri;
    3) altrimenti il primo messaggio qualsiasi.
    Legge riga per riga: le righe possono essere enormi (screenshot in base64)."""
    cwd, first, title, read = None, None, None, 0
    with open(path, "rb") as f:
        for raw in f:
            read += len(raw)
            if read > max_bytes:
                break
            m = _THREAD_TITLE.search(raw)
            if m:
                try:
                    t = json.loads(b'"' + m.group(1) + b'"').strip()
                except ValueError:
                    t = m.group(1).decode("utf-8", "replace").strip()
                if t:
                    return cwd or _cwd_of(raw), _short(t, 70)
            if b'"type":"user"' not in raw and b'"type": "user"' not in raw and cwd is not None:
                continue
            try:
                rec = json.loads(raw)
            except ValueError:
                continue
            if cwd is None and rec.get("cwd"):
                cwd = rec["cwd"]
            if title or rec.get("type") != "user" or rec.get("isMeta") or rec.get("isSidechain"):
                continue
            t = _title_from(_text_of(rec.get("message", {}).get("content")))
            if not t or t.startswith("Caveat:"):
                continue
            first = first or t
            if len(t) >= MIN_TITLE:
                title = t
                # continuo un po' solo per cercare il titolo del thread
                max_bytes = min(max_bytes, read + 512 * 1024)
    t = title or first
    return cwd, (_short(t, 70) if t else None)


def _cwd_of(raw):
    try:
        return json.loads(raw).get("cwd")
    except ValueError:
        return None


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
    }

    info["cartella"], info["titolo"] = _first_title(path)
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
    for rec in tail:
        if rec.get("isSidechain") or rec.get("type") not in ("user", "assistant"):
            continue
        ts = _parse_ts(rec.get("timestamp"))
        if ts:
            info["ultimo_evento"] = ts
        content = rec.get("message", {}).get("content")
        if rec["type"] == "assistant" and isinstance(content, list):
            for b in content:
                if isinstance(b, dict) and b.get("type") == "tool_use":
                    pending[b.get("id")] = b
                    icon, text = etichette.label(b.get("name", "?"), b.get("input"))
                    info["ultimo_strumento"] = f"{icon} {text}"
        if rec["type"] == "user" and isinstance(content, list):
            for b in content:
                if isinstance(b, dict) and b.get("type") == "tool_result":
                    pending.pop(b.get("tool_use_id"), None)
        if rec["type"] == "assistant" or _is_real_prompt(rec) or isinstance(content, list):
            last = rec

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

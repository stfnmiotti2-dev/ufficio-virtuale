"""Ufficio virtuale - Task 4: traduce i nomi degli strumenti in frasi italiane.

Le frasi stanno in etichette.json, che si puo' modificare a mano: viene riletto
da solo quando cambia.
"""
import json
import re
from pathlib import Path

FILE = Path(__file__).resolve().parent / "etichette.json"
# le tue modifiche: stesse chiavi di etichette.json, vincono loro e gli
# aggiornamenti automatici non le sovrascrivono mai
MIE = Path(__file__).resolve().parent / "etichette-mie.json"
_cache = {"mtime": None, "map": {}}


def FILE_MTIME():
    out = []
    for f in (FILE, MIE):
        try:
            out.append(f.stat().st_mtime)
        except OSError:
            out.append(None)
    return tuple(out)


def load():
    mtime = FILE_MTIME()
    if mtime != _cache["mtime"]:
        table = {}
        for f in (FILE, MIE):
            if not f.exists():
                continue
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
                table.update({k.lower(): v for k, v in data.items() if not k.startswith("_")})
            except (OSError, ValueError) as exc:
                print(f"{f.name} non valido:", exc)
        _cache["map"] = table
        _cache["mtime"] = mtime
    return _cache["map"]


def short_name(name):
    """mcp__remote-devices__tiamulti__tia_plc -> tia_plc ; Bash -> Bash"""
    return name.split("__")[-1] if name.startswith("mcp__") else name


def _fill(text, inp):
    def repl(m):
        key = m.group(1)
        if key == "nomefile":
            val = inp.get("file_path") or inp.get("notebook_path") or inp.get("path") or ""
            val = re.split(r"[\\/]", str(val).rstrip("\\/"))[-1]
        else:
            val = inp.get(key, "")
        return str(val) if isinstance(val, (str, int, float)) else ""
    out = re.sub(r"\{(\w+)\}", repl, text)
    out = re.sub(r"\(\s*\)", "", out)          # "(...)" rimasto vuoto
    return re.sub(r"\s+", " ", out).strip(" :")


def label(name, inp=None):
    """Restituisce (icona, frase) per uno strumento."""
    inp = inp if isinstance(inp, dict) else {}
    tool = short_name(name).lower()
    action = str(inp.get("action") or "").lower()
    table = load()
    hit = table.get(f"{tool}:{action}") if action else None
    hit = hit or table.get(tool)
    if hit:
        return hit[0], _fill(hit[1], inp)
    readable = "/".join(name.split("__")[1:]) if name.startswith("mcp__") else name
    return "🔧", readable + (f" ({action})" if action else "")

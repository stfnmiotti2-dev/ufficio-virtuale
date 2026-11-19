"""Ufficio virtuale - registra il connettore Ufficio (connettore.py) in Claude Desktop.

Aggiunge la voce "ufficio" a mcpServers in claude_desktop_config.json, se manca o se punta
a un percorso vecchio. Prima di cambiare il file ne salva una copia (.prima-del-connettore).
Lo chiama avvio.pyw a ogni apertura dell'ufficio; se non cambia nulla non tocca niente.
Dopo la prima registrazione Claude Desktop va chiuso e riaperto una volta.
"""
import json
import os
import shutil
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
NOME = "ufficio"
LOG = HERE / "aggiorna.log"


def log(msg):
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(time.strftime("%Y-%m-%d %H:%M:%S ") + "connettore: " + msg + "\n")
    except OSError:
        pass


def file_config():
    """I claude_desktop_config.json esistenti: installazione classica e versione dello Store (MSIX)."""
    trovati = []
    app = os.environ.get("APPDATA")
    if app:
        trovati.append(Path(app) / "Claude" / "claude_desktop_config.json")
    loc = os.environ.get("LOCALAPPDATA")
    if loc:
        try:                                         # versione attuale dell'app: %LOCALAPPDATA%\Claude-Data\<pacchetto>
            vere = [f for f in (Path(loc) / "Claude-Data").glob("*/claude_desktop_config.json") if f.is_file()]
        except OSError:
            vere = []
        if vere:
            return vere
        pk = Path(loc) / "Packages"
        try:
            for d in pk.glob("Claude_*"):
                trovati.append(d / "LocalCache" / "Roaming" / "Claude" / "claude_desktop_config.json")
        except OSError:
            pass
    # se manca, lo creo in tutte le cartelle di Claude Desktop: la versione dello Store puo' leggere
    # %APPDATA%\Claude oppure la sua copia in LocalCache (dipende da come e' installata)
    cartelle = [f for f in trovati if f.parent.is_dir()]
    for f in cartelle:
        if not f.exists():
            try:
                f.write_text('{"mcpServers": {}}', encoding="utf-8")
                log(f"creato {f}")
            except OSError as exc:
                log(f"non creo {f}: {exc}")
    if not cartelle:
        log("nessuna cartella di Claude Desktop trovata: " + ", ".join(str(f.parent) for f in trovati))
    return [f for f in cartelle if f.exists()]


def python_exe():
    exe = Path(sys.executable)
    if exe.name.lower() == "pythonw.exe":            # serve quello con stdin/stdout
        c = exe.with_name("python.exe")
        if c.exists():
            exe = c
    return str(exe)


def registra():
    voce = {"command": python_exe(), "args": [str(HERE / "connettore.py")]}
    cambiati = 0
    for f in file_config():
        try:
            cfg = json.loads(f.read_text(encoding="utf-8") or "{}")
        except (OSError, ValueError) as exc:
            log(f"non leggo {f}: {exc}")
            continue
        if not isinstance(cfg, dict):
            continue
        server = cfg.setdefault("mcpServers", {})
        if server.get(NOME) == voce:
            continue
        copia = f.with_name(f.name + ".prima-del-connettore")
        if not copia.exists():
            shutil.copy2(f, copia)
        server[NOME] = voce
        tmp = f.with_name(f.name + ".tmp")
        tmp.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, f)
        log(f"registrato in {f}")
        cambiati += 1
    return cambiati


if __name__ == "__main__":
    print("registrato" if registra() else "gia' a posto (o Claude Desktop non trovato)")

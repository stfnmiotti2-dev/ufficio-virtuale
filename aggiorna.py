"""Ufficio virtuale - aggiornamento automatico dal repo GitHub pubblico.

Controlla l'ultima versione sul ramo main e, se e' cambiata, scarica lo zip e
sostituisce i file del programma. Non tocca i file personali (PERSONALI).
Usa solo la libreria standard e nessun login: il repo e' pubblico.

Uso a mano:  python aggiorna.py
"""
import io
import json
import sys
import time
import urllib.request
import zipfile
from pathlib import Path

REPO = "stfnmiotti2-dev/ufficio-virtuale"
BRANCH = "main"
HERE = Path(__file__).resolve().parent
SHA_FILE = HERE / ".versione-git"
LOG = HERE / "aggiorna.log"
# file che restano sempre quelli del PC, anche se il repo ne ha una copia
PERSONALI = {"etichette-mie.json", "links.json"}
UA = {"User-Agent": "ufficio-virtuale-aggiorna"}


def log(msg):
    line = time.strftime("%Y-%m-%d %H:%M:%S ") + msg
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass
    try:
        print(line)
    except Exception:
        pass


def local_sha():
    try:
        return SHA_FILE.read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def remote_sha(timeout=10):
    req = urllib.request.Request(
        f"https://api.github.com/repos/{REPO}/commits/{BRANCH}",
        headers={**UA, "Accept": "application/vnd.github.sha"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("ascii").strip()


def update():
    """Restituisce True se ha installato una versione nuova."""
    try:
        sha = remote_sha()
    except Exception as exc:
        log(f"controllo aggiornamenti non riuscito: {exc}")
        return False
    if not sha or sha == local_sha():
        return False
    try:
        req = urllib.request.Request(f"https://codeload.github.com/{REPO}/zip/{sha}", headers=UA)
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
        written = 0
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            for info in z.infolist():
                parts = info.filename.split("/", 1)       # tolgo la cartella "ufficio-virtuale-sha/"
                if len(parts) < 2 or not parts[1] or info.is_dir():
                    continue
                rel = Path(parts[1])
                if rel.is_absolute() or ".." in rel.parts:
                    continue
                target = HERE / rel
                if rel.name in PERSONALI and target.exists():
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                tmp = target.with_name(target.name + ".nuovo")
                tmp.write_bytes(z.read(info))
                tmp.replace(target)
                written += 1
        SHA_FILE.write_text(sha, encoding="utf-8")
        log(f"aggiornato alla versione {sha[:7]} ({written} file)")
        return True
    except Exception as exc:
        log(f"aggiornamento non riuscito: {exc}")
        return False


if __name__ == "__main__":
    changed = update()
    print("Aggiornato." if changed else f"Gia' aggiornato ({local_sha()[:7] or 'nessuna versione'}).")
    sys.exit(0)

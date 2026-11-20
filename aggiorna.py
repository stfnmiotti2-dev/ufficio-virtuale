"""Ufficio virtuale - aggiornamento automatico dal repo GitHub pubblico.

Controlla l'ultima versione sul ramo "pubblicato" (non main: su main si puo' lavorare
senza che arrivi subito sul PC) e, se e' cambiata:
  1. scarica lo zip in una cartella di appoggio e lo CONTROLLA (i .py devono compilare,
     i .json devono leggersi): se qualcosa non va non installa nulla;
  2. salva i file che sta per sostituire in .backup/ (la versione di prima);
  3. installa, e lascia il segno .in-prova: il server nuovo lo toglie quando parte bene.
     Se entro 90 secondi il server nuovo non risponde, la verifica (lanciata con il codice
     VECCHIO salvato in .backup) rimette la versione di prima e scarta quella nuova.
Non tocca i file personali (PERSONALI). Usa solo la libreria standard e nessun login.

Uso a mano:  python aggiorna.py
"""
import io
import json
import py_compile
import shutil
import os
import subprocess
import sys
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path

REPO = "stfnmiotti2-dev/ufficio-virtuale"
BRANCH = "pubblicato"
HERE = Path(__file__).resolve().parent
SHA_FILE = HERE / ".versione-git"
LOG = HERE / "aggiorna.log"
BACKUP = HERE / ".backup"                 # i file della versione precedente
IN_PROVA = HERE / ".in-prova"             # c'e' finche' il server nuovo non conferma
SCARTATA = HERE / ".versione-scartata"    # versione rotta: non la riscarico
# file che restano sempre quelli del PC, anche se il repo ne ha una copia
PERSONALI = {"etichette-mie.json", "links.json", "nomi-isole.json", "stato-thread.json", "commesse.json",
             "progetti-link.json", "connettore-stato.json", "diagnosi-sessioni.json"}
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


def _powershell_get(url, headers):
    """Download con PowerShell: usa i certificati di Windows, che a volte Python
    non riesce a verificare (antivirus o proxy aziendali che ispezionano HTTPS)."""
    fd, tmp = tempfile.mkstemp(prefix="ufficio-")
    os.close(fd)
    try:
        h = "; ".join(f"'{k}'='{v}'" for k, v in headers.items())
        cmd = (f"$ProgressPreference='SilentlyContinue'; "
               f"Invoke-WebRequest -UseBasicParsing -Uri '{url}' -Headers @{{{h}}} -OutFile '{tmp}'")
        subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", cmd],
                       check=True, timeout=120, capture_output=True,
                       creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        with open(tmp, "rb") as f:
            return f.read()
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass


def fetch(url, headers=None, timeout=60):
    headers = {**UA, **(headers or {})}
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read()
    except Exception as exc:
        if sys.platform != "win32":
            raise
        log(f"Python non riesce a scaricare ({exc}); provo con PowerShell")
        return _powershell_get(url, {k: v for k, v in headers.items() if k != "User-Agent"})


def remote_sha(timeout=10):
    data = fetch(f"https://api.github.com/repos/{REPO}/commits/{BRANCH}",
                 {"Accept": "application/vnd.github.sha"}, timeout)
    return data.decode("ascii").strip()


def _controlla(cartella):
    """Errori trovati nei file scaricati (lista vuota = va bene)."""
    errori = []
    for f in cartella.rglob("*"):
        if not f.is_file():
            continue
        try:
            if f.suffix == ".py" or f.suffix == ".pyw":
                py_compile.compile(str(f), cfile=str(f) + ".c", doraise=True)
                os.remove(str(f) + ".c")
            elif f.suffix == ".json":
                json.loads(f.read_text(encoding="utf-8"))
            elif f.suffix in (".js", ".html") and f.stat().st_size == 0:
                errori.append(f"{f.name}: vuoto")
        except Exception as exc:
            errori.append(f"{f.relative_to(cartella)}: {exc}")
    for essenziale in ("server.py", "scanner.py", "index.html", "aggiorna.py"):
        if not (cartella / essenziale).is_file():
            errori.append(f"manca {essenziale}")
    return errori


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
        if SCARTATA.read_text(encoding="utf-8").strip() == sha:
            return False                       # gia' provata e rotta: aspetto la prossima
    except OSError:
        pass
    vecchia = local_sha()
    appoggio = Path(tempfile.mkdtemp(prefix="ufficio-nuovo-"))
    try:
        data = fetch(f"https://codeload.github.com/{REPO}/zip/{sha}")
        nuovi = []
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            for info in z.infolist():
                parts = info.filename.split("/", 1)       # tolgo la cartella "ufficio-virtuale-sha/"
                if len(parts) < 2 or not parts[1] or info.is_dir():
                    continue
                rel = Path(parts[1])
                if rel.is_absolute() or ".." in rel.parts:
                    continue
                if rel.name in PERSONALI and (HERE / rel).exists():
                    continue
                (appoggio / rel).parent.mkdir(parents=True, exist_ok=True)
                (appoggio / rel).write_bytes(z.read(info))
                nuovi.append(rel)
        errori = _controlla(appoggio)
        if errori:
            log(f"versione {sha[:7]} SCARTATA, non installo nulla: " + "; ".join(errori[:5]))
            SCARTATA.write_text(sha, encoding="utf-8")
            return False
        # copia della versione di adesso, per poter tornare indietro
        shutil.rmtree(BACKUP, ignore_errors=True)
        BACKUP.mkdir()
        for rel in nuovi:
            if (HERE / rel).is_file():
                (BACKUP / rel).parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(HERE / rel, BACKUP / rel)
        (BACKUP / ".nuovi").write_text("\n".join(str(r) for r in nuovi if not (HERE / r).exists()), encoding="utf-8")
        (BACKUP / ".versione-git").write_text(vecchia, encoding="utf-8")
        # installo: ogni file prima accanto (.nuovo) e poi al suo posto
        for rel in nuovi:
            target = HERE / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            tmp = target.with_name(target.name + ".nuovo")
            shutil.copy2(appoggio / rel, tmp)
            os.replace(tmp, target)
        SHA_FILE.write_text(sha, encoding="utf-8")
        IN_PROVA.write_text(json.dumps({"nuova": sha, "vecchia": vecchia, "ora": time.time()}), encoding="utf-8")
        log(f"aggiornato alla versione {sha[:7]} ({len(nuovi)} file), in prova; copia della {vecchia[:7]} in .backup")
        return True
    except Exception as exc:
        log(f"aggiornamento non riuscito: {exc}")
        ripristina(f"errore durante l'installazione: {exc}")
        return False
    finally:
        shutil.rmtree(appoggio, ignore_errors=True)


def ripristina(motivo, cartella=HERE):
    """Rimette i file salvati in .backup (la versione di prima) e scarta quella nuova."""
    bk = cartella / ".backup"
    if not (bk / ".versione-git").exists():
        return False
    nuova = ""
    try:
        nuova = json.loads((cartella / ".in-prova").read_text(encoding="utf-8")).get("nuova", "")
    except (OSError, ValueError):
        pass
    for f in bk.rglob("*"):
        if f.is_file() and f.name not in (".versione-git", ".nuovi"):
            dest = cartella / f.relative_to(bk)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(f, dest)
    try:
        for r in (bk / ".nuovi").read_text(encoding="utf-8").splitlines():
            if r.strip():
                (cartella / r.strip()).unlink(missing_ok=True)
    except OSError:
        pass
    shutil.copy2(bk / ".versione-git", cartella / ".versione-git")
    if nuova:
        (cartella / ".versione-scartata").write_text(nuova, encoding="utf-8")
    (cartella / ".in-prova").unlink(missing_ok=True)
    log(f"TORNATO alla versione precedente ({motivo})")
    return True


def conferma():
    """La chiama il server nuovo quando e' partito bene."""
    if IN_PROVA.exists():
        IN_PROVA.unlink(missing_ok=True)
        log(f"versione {local_sha()[:7]} confermata: il server e' partito")


def verifica(cartella, porta=8787, attesa=90):
    """Lanciata dalla copia VECCHIA (in .backup) dopo il riavvio: se il server nuovo non
    conferma entro `attesa` secondi, torna alla versione di prima e riaccende il server."""
    cartella = Path(cartella)
    fine = time.time() + attesa
    while time.time() < fine:
        if not (cartella / ".in-prova").exists():
            return True
        time.sleep(2)
    global LOG
    LOG = cartella / "aggiorna.log"
    if ripristina("il server nuovo non e' partito entro %d s" % attesa, cartella):
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        exe = Path(sys.executable)
        if exe.with_name("pythonw.exe").exists():
            exe = exe.with_name("pythonw.exe")
        out = open(cartella / "server.log", "a", encoding="utf-8")
        subprocess.Popen([str(exe), str(cartella / "server.py")], cwd=cartella,
                         stdout=out, stderr=out, stdin=subprocess.DEVNULL, creationflags=flags)
    return False


def lancia_verifica(porta=8787):
    """Avvia la verifica con l'aggiorna.py della versione VECCHIA (se c'e'), staccata dal server."""
    vecchio = BACKUP / "aggiorna.py"
    if not IN_PROVA.exists() or not vecchio.exists():
        return
    try:                                   # la copia vecchia deve saper fare la verifica (dalla v9.58)
        if "--verifica" not in vecchio.read_text(encoding="utf-8"):
            return
    except OSError:
        return
    flags = 0
    if sys.platform == "win32":
        flags = subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS
    try:
        subprocess.Popen([sys.executable, str(vecchio), "--verifica", str(HERE), str(porta)],
                         cwd=str(BACKUP), stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL, creationflags=flags)
    except Exception as exc:
        log(f"verifica non avviata: {exc}")


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "--verifica":
        verifica(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 8787)
        sys.exit(0)
    changed = update()
    print("Aggiornato." if changed else f"Gia' aggiornato ({local_sha()[:7] or 'nessuna versione'}).")
    sys.exit(0)

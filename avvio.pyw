"""Ufficio virtuale - avvio.

1. scarica l'ultima versione dal repo GitHub, se c'e';
2. avvia il server senza finestra, se non e' gia' acceso;
3. apre l'ufficio nel browser.
Si lancia dall'icona "Ufficio virtuale" sul desktop.
L'estensione .pyw lo fa girare con pythonw, cioe' senza finestra nera.
"""
import os
import socket
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

HERE = Path(__file__).resolve().parent
os.chdir(HERE)
sys.path.insert(0, str(HERE))
PORTA = 8787
URL = f"http://localhost:{PORTA}"


def server_acceso():
    try:
        with socket.create_connection(("127.0.0.1", PORTA), timeout=1):
            return True
    except OSError:
        return False


def pythonw():
    exe = Path(sys.executable)
    candidate = exe.with_name("pythonw.exe")
    return str(candidate if candidate.exists() else exe)


def main():
    changed = False
    try:
        import aggiorna
        changed = aggiorna.update()
    except Exception:
        pass
    if changed and server_acceso():
        # il server acceso ha il codice vecchio: gli chiedo di ripartire
        try:
            import urllib.request
            urllib.request.urlopen(URL + "/api/riavvia", timeout=3).read()
        except Exception:
            pass
        for _ in range(20):
            if not server_acceso():
                break
            time.sleep(0.25)
        for _ in range(40):
            if server_acceso():
                break
            time.sleep(0.25)
    if not server_acceso():
        flags = 0
        if sys.platform == "win32":
            flags = subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS
        log = open(HERE / "server.log", "a", encoding="utf-8")
        subprocess.Popen([pythonw(), str(HERE / "server.py")], cwd=HERE,
                         stdout=log, stderr=log, stdin=subprocess.DEVNULL, creationflags=flags)
        for _ in range(40):
            if server_acceso():
                break
            time.sleep(0.25)
    webbrowser.open(URL)


if __name__ == "__main__":
    main()

"""Ufficio virtuale - avvio.

1. scarica l'ultima versione dal repo GitHub, se c'e';
2. avvia il server senza finestra, se non e' gia' acceso;
3. apre l'ufficio in una finestra tutta sua, senza barre del browser
   (Chrome, o Edge se manca, in modalita' app; se non ci sono, il browser normale).
   Se e' gia' aperto non ne apre un'altra: riporta davanti quella che c'e'.
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


def _scrivi_log(msg):
    try:
        with open(HERE / "aggiorna.log", "a", encoding="utf-8") as f:
            f.write(time.strftime("%Y-%m-%d %H:%M:%S ") + msg + "\n")
    except OSError:
        pass


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
    except Exception as exc:
        _scrivi_log(f"aggiornamento: errore {exc}")
    try:                                  # connettore Ufficio per le chat dei progetti (Claude Desktop)
        import registra_connettore
        registra_connettore.registra()
    except Exception as exc:
        _scrivi_log(f"connettore: errore {exc}")
    if changed and server_acceso():
        # il server acceso ha il codice vecchio: gli chiedo di ripartire
        try:
            import urllib.request
            urllib.request.urlopen(urllib.request.Request(URL + "/api/riavvia", data=b"", method="POST"), timeout=3).read()
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
        if changed:
            try:
                aggiorna.lancia_verifica(PORTA)
            except Exception:
                pass
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
    if not porta_davanti():
        apri_finestra()


def porta_davanti():
    """Se l'ufficio e' gia' aperto in una finestra, la riporta davanti invece di aprirne un'altra."""
    if sys.platform != "win32":
        return False
    try:
        import ctypes
        from ctypes import wintypes
        u32 = ctypes.windll.user32
        trovate = []

        @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
        def guarda(hwnd, _):
            n = u32.GetWindowTextLengthW(hwnd)
            if n and u32.IsWindowVisible(hwnd):
                buf = ctypes.create_unicode_buffer(n + 1)
                u32.GetWindowTextW(hwnd, buf, n + 1)
                t = buf.value
                if t.endswith("Ufficio virtuale") or "Ufficio virtuale - " in t:
                    trovate.append(hwnd)
            return True

        u32.EnumWindows(guarda, 0)
        if not trovate:
            return False
        h = trovate[0]
        if u32.IsIconic(h):
            u32.ShowWindow(h, 9)          # SW_RESTORE: era iconizzata
        u32.SetForegroundWindow(h)
        return True
    except Exception:
        return False


def apri_finestra():
    """Finestra 'app': niente schede, indirizzo o pulsanti del browser intorno all'ufficio."""
    if sys.platform == "win32":
        cartelle = [os.environ.get(k, "") for k in ("ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA")]
        for rel in (r"Google\Chrome\Application\chrome.exe", r"Microsoft\Edge\Application\msedge.exe"):   # prima Chrome
            for c in cartelle:
                exe = Path(c) / rel
                if c and exe.exists():
                    try:
                        subprocess.Popen([str(exe), f"--app={URL}", "--start-maximized"])
                        return
                    except OSError:
                        pass
    webbrowser.open(URL)


if __name__ == "__main__":
    main()

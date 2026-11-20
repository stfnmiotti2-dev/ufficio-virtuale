"""Prova veloce prima di pubblicare: avvia il server su una porta di prova e controlla
che pagina, dati e protezioni rispondano come devono. Uso: python prove/prova_server.py"""
import json, subprocess, sys, time, urllib.request, urllib.error
from pathlib import Path

QUI = Path(__file__).resolve().parent.parent
PORTA = 8799


def chiama(percorso, metodo="GET", intestazioni=None):
    r = urllib.request.Request(f"http://127.0.0.1:{PORTA}{percorso}", method=metodo,
                               data=b"" if metodo == "POST" else None, headers=intestazioni or {})
    try:
        with urllib.request.urlopen(r, timeout=10) as f:
            return f.status, f.read()
    except urllib.error.HTTPError as e:
        return e.code, b""


def main():
    srv = subprocess.Popen([sys.executable, str(QUI / "server.py"), "--porta", str(PORTA), "--senza-aggiornamenti"],
                           cwd=QUI, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    errori = []
    try:
        for _ in range(40):
            try:
                if chiama("/api/versione")[0] == 200:
                    break
            except OSError:
                time.sleep(0.5)
        controlli = [
            ("pagina", chiama("/")[0] == 200),
            ("script 3D", chiama("/ufficio3d.js")[0] == 200),
            ("sessioni in JSON", isinstance(json.loads(chiama("/api/sessions")[1] or b"null"), list)),
            ("versione", b"task" in chiama("/api/versione")[1]),
            ("blocca altri siti", chiama("/api/riavvia", "POST", {"Origin": "http://esempio.com"})[0] == 403),
            ("blocca Host estraneo", chiama("/api/versione", "GET", {"Host": "esempio.com"})[0] == 403),
        ]
        errori = [n for n, ok in controlli if not ok]
        for n, ok in controlli:
            print(("OK  " if ok else "NO  ") + n)
    finally:
        srv.terminate()
        try:
            err = srv.communicate(timeout=5)[1].decode(errors="replace")
        except subprocess.TimeoutExpired:
            srv.kill(); err = ""
        if "Traceback" in err:
            errori.append("errori nel server"); print(err[-1500:])
    print("TUTTO OK" if not errori else "PROBLEMI: " + ", ".join(errori))
    return 1 if errori else 0


if __name__ == "__main__":
    sys.exit(main())

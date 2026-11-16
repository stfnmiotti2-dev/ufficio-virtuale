"""Ufficio virtuale - Task 2: server locale.

Avvio:   python server.py            (poi apri http://localhost:8787)
Opzioni: --porta 8787  --ore 24

Ascolta solo su 127.0.0.1, quindi dagli altri PC non si raggiunge. Legge i transcript
con scanner.py, non chiama nessuna AI e non scrive nulla.
"""
import argparse
import json
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
          "/ufficio.js": ("ufficio.js", "text/javascript; charset=utf-8")}
VERSIONE = "task 6"
POLL_S = 1.5            # ogni quanto ricontrollo i file
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


def _watcher(hours):
    while True:
        try:
            sessions = _scan(hours)
            data = json.dumps(sessions, ensure_ascii=False).encode("utf-8")
            with _cond:
                if data != _snapshot["json"]:
                    _snapshot.update(versione=_snapshot["versione"] + 1, sessioni=sessions, json=data)
                    _cond.notify_all()
        except Exception as exc:  # non deve mai fermarsi
            print("errore durante la scansione:", exc, file=sys.stderr)
        time.sleep(POLL_S)


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

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path in STATIC:
            name, ctype = STATIC[path]
            return self._send(200, (HERE / name).read_bytes(), ctype)
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
        if path == "/api/riavvia":          # usato da avvio.pyw dopo un aggiornamento
            self._send(200, b'{"ok": true}', "application/json")
            if _SERVER:
                threading.Thread(target=_riavvia, args=(_SERVER,), daemon=True).start()
            return
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
                    version, data = _snapshot["versione"], _snapshot["json"]
                if version != seen:
                    self.wfile.write(b"event: sessioni\ndata: " + data + b"\n\n")
                    seen = version
                else:
                    self.wfile.write(b": ping\n\n")  # tiene viva la connessione
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass


def _riavvia(server):
    """Dopo un aggiornamento: libero la porta e riparto con il codice nuovo."""
    print("Versione nuova installata: riavvio il server.", flush=True)
    time.sleep(0.3)                  # lascio partire la risposta HTTP in corso
    server.server_close()
    flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" and not _ha_console() else 0
    subprocess.Popen([sys.executable] + sys.argv, cwd=HERE, creationflags=flags,
                     stdout=sys.stdout if _ha_console() else None)
    os._exit(0)


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
    global _SERVER
    _SERVER = server
    threading.Thread(target=_watcher, args=(args.ore,), daemon=True).start()
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

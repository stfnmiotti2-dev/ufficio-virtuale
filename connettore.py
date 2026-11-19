"""Ufficio virtuale - connettore per i progetti claude.ai (server MCP locale, solo libreria standard).

Claude Desktop lo avvia da solo (lo registra avvio.pyw in claude_desktop_config.json) e lo
mostra a tutte le chat dei progetti che usano questo PC, anche quelle nel cloud.
Le chat lo usano per parlare direttamente con l'ufficio:
  ufficio_aggiorna  la chat dice cosa sta facendo: l'omino cambia subito
  ufficio_guarda    la chat legge chi lavora, chi aspetta Stefano e cosa fanno gli altri progetti
Scrive solo connettore-stato.json (personale, accanto a questo file). Niente rete, niente AI.

Protocollo: JSON-RPC 2.0 su stdin/stdout, un messaggio per riga (MCP stdio).
"""
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
STATO = HERE / "connettore-stato.json"          # scritto qui, letto da server.py
DIAGNOSI = HERE / "diagnosi-sessioni.json"      # scritto da server.py: quello che mostra la pagina
CLOUD_TIA = HERE / "stato-thread.json"          # il file storico di Agente TIA (resta valido)
VERSIONE = "1.0"
TENGO_GIORNI = 7                                # le voci piu' vecchie si cancellano

STATI = ["lavora", "aspetta", "finito", "chiuso"]

STRUMENTI = [
    {
        "name": "ufficio_aggiorna",
        "description": (
            "Dice all'ufficio virtuale di Stefano cosa sta facendo questa chat: il suo omino cambia subito. "
            "Chiamalo quando inizi un lavoro, quando ti fermi per aspettare Stefano (stato 'aspetta' + cosa "
            "aspetti in 'attesa'), quando riprendi e quando finisci. Basta il campo che cambia: gli altri restano. "
            "Usa sempre lo stesso 'thread' (l'id cmsg_... del thread, o il titolo se non lo conosci)."),
        "inputSchema": {
            "type": "object",
            "properties": {
                "progetto": {"type": "string", "description": "Nome del progetto claude.ai, es. 'Agente Tia portal', 'Agente robot KUKA', 'Agente GX Works'."},
                "thread": {"type": "string", "description": "Id del thread (cmsg_...) o, se non lo sai, il titolo del thread."},
                "titolo": {"type": "string", "description": "Titolo del thread, es. '24_247 OP60 › Correggere MSG_104'."},
                "stato": {"type": "string", "enum": STATI, "description": "lavora | aspetta (Stefano) | finito | chiuso (thread chiuso: l'omino esce con lo scatolone)."},
                "attivita": {"type": "string", "description": "Cosa fa adesso, breve, con un verbo: 'Compila FB_Pinza'."},
                "attesa": {"type": "string", "description": "Solo con stato 'aspetta': cosa serve da Stefano."},
                "responsabile": {"type": "string", "description": "Solo per Agente TIA: il responsabile, es. '24_247 OP60'. Vuoto per gli altri progetti."},
                "prossimo": {"type": "string", "description": "Il prossimo passo."},
                "versione": {"type": "string", "description": "Versione del progetto su cui lavori, es. 'OP60 V12'."},
                "errori_compilazione": {"type": "integer", "description": "Solo se la compilazione e' KO: numero di errori (0 = tutto ok)."},
                "link": {"type": "string", "description": "Link https://claude.ai/... del thread, se lo conosci."},
                "sottoagenti": {"type": "array", "description": "Sottoagenti lanciati da questa chat.",
                                "items": {"type": "object", "properties": {"nome": {"type": "string"}, "stato": {"type": "string", "enum": ["lavora", "aspetta", "finito"]}}}},
            },
            "required": ["progetto", "thread"],
        },
    },
    {
        "name": "ufficio_guarda",
        "description": (
            "Legge l'ufficio virtuale di Stefano: chi aspetta Stefano, chi lavora, chi ha finito, per ogni progetto. "
            "Usalo quando Stefano ti chiede di guardare l'ufficio, o per sapere cosa fanno gli altri progetti."),
        "inputSchema": {
            "type": "object",
            "properties": {"progetto": {"type": "string", "description": "Facoltativo: solo questo progetto (basta una parte del nome)."}},
        },
    },
]


def _ora_utc():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _leggi(path):
    try:
        dati = json.loads(path.read_text(encoding="utf-8"))
        return dati if isinstance(dati, dict) else {}
    except (OSError, ValueError):
        return {}


def _scrivi(dati):
    tmp = STATO.with_suffix(".tmp")
    tmp.write_text(json.dumps(dati, ensure_ascii=False, indent=1), encoding="utf-8")
    for _ in range(10):                          # su Windows il server puo' tenerlo aperto un attimo
        try:
            os.replace(tmp, STATO)
            return
        except PermissionError:
            time.sleep(0.1)
    os.replace(tmp, STATO)


def _testo(v, n):
    return str(v).strip()[:n] if v is not None else None


def aggiorna(arg):
    progetto, thread = _testo(arg.get("progetto"), 60), _testo(arg.get("thread"), 120)
    if not progetto or not thread:
        raise ValueError("servono 'progetto' e 'thread'")
    stato = str(arg.get("stato") or "").lower().strip()
    if stato and stato not in STATI:
        raise ValueError("stato deve essere uno di: " + ", ".join(STATI))
    dati = _leggi(STATO)
    voci = [v for v in dati.get("thread") or [] if isinstance(v, dict)]
    limite = time.time() - TENGO_GIORNI * 86400
    voci = [v for v in voci if (_ts(v.get("ultima_attivita_utc")) or 0) >= limite]
    chiave = (progetto.lower(), thread.lower())
    voce = next((v for v in voci if (str(v.get("progetto", "")).lower(), str(v.get("id", "")).lower()) == chiave), None)
    if voce is None:
        voce = {"progetto": progetto, "id": thread, "stato": "lavora"}
        voci.append(voce)
    for campo, n in (("titolo", 90), ("attivita", 120), ("attesa", 200), ("responsabile", 60),
                     ("prossimo", 80), ("versione", 40), ("link", 300)):
        if campo in arg and arg[campo] is not None:
            voce[campo] = _testo(arg[campo], n)
    if stato:
        voce["stato"] = stato
        if stato == "aspetta" and not voce.get("aspetta_dal_utc"):
            voce["aspetta_dal_utc"] = _ora_utc()
        if stato != "aspetta":
            voce.pop("aspetta_dal_utc", None)
            if "attesa" not in arg:
                voce.pop("attesa", None)
    if "errori_compilazione" in arg:
        try:
            voce["compilazione"] = {"errori": max(0, int(arg["errori_compilazione"]))}
        except (TypeError, ValueError):
            pass
    if isinstance(arg.get("sottoagenti"), list):
        voce["sottoagenti"] = [{"nome": _testo(s.get("nome"), 40) or f"Sottoagente {i + 1}",
                                "stato": str(s.get("stato") or "lavora")}
                               for i, s in enumerate(arg["sottoagenti"][:8]) if isinstance(s, dict)]
    voce["ultima_attivita_utc"] = _ora_utc()
    dati.update(aggiornato_utc=_ora_utc(), thread=voci)
    _scrivi(dati)
    acceso = _diagnosi_fresca() is not None
    # chi chiama vede anche i thread del suo progetto fermi da piu' di un'ora: se puo', li aggiorna lui
    vecchi = [v for v in voci if v is not voce and str(v.get("progetto", "")).lower() == progetto.lower()
              and v.get("stato") == "lavora" and time.time() - (_ts(v.get("ultima_attivita_utc")) or 0) > 3600]
    nota = ("\nAttenzione: in ufficio questi thread del tuo progetto risultano 'al lavoro' ma senza notizie da piu' di un'ora "
            "(dato vecchio?): " + "; ".join(f"{v.get('titolo') or v['id']} ({v['id']})" for v in vecchi[:10])
            + ". Se sai com'e' andata, aggiornali con ufficio_aggiorna.") if vecchi else ""
    return (f"Fatto: in ufficio '{voce.get('titolo') or thread}' ({progetto}) ora e' '{voce['stato']}'"
            + (f" - {voce.get('attesa') if voce['stato'] == 'aspetta' and voce.get('attesa') else voce.get('attivita')}"
               if voce.get("attivita") or voce.get("attesa") else "") + "."
            + ("" if acceso else " (L'ufficio adesso e' chiuso: lo vedra' quando Stefano lo apre.)") + nota)


def _ts(s):
    try:
        d = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        return (d if d.tzinfo else d.replace(tzinfo=timezone.utc)).timestamp()
    except (TypeError, ValueError):
        return None


def _diagnosi_fresca():
    d = _leggi(DIAGNOSI)
    if d and time.time() - float(d.get("scritto") or 0) < 15 * 60 and isinstance(d.get("sessioni"), list):
        return d
    return None


def _da_quanto(ts):
    if not ts:
        return ""
    m = int((time.time() - ts) // 60)
    return f"{m} min" if m < 60 else f"{m // 60} h {m % 60:02d}" if m < 24 * 60 else f"{m // 1440} g"


def guarda(arg):
    filtro = str(arg.get("progetto") or "").lower().strip()
    d = _diagnosi_fresca()
    righe = []
    if d:
        persone = []
        for s in d["sessioni"]:
            if s.get("sottoagente"):
                continue
            persone.append({"progetto": s.get("progetto_claude") or "Sul PC", "titolo": s.get("titolo") or "?",
                            "stato": s.get("stato") or "?", "attivita": s.get("attivita") or "",
                            "quando": s.get("modificato"), "fisso": s.get("fisso")})
        righe.append("Ufficio aperto: questo e' quello che si vede adesso.")
    else:
        persone = []
        fonti = [(_leggi(STATO), None), (_leggi(CLOUD_TIA), "Agente Tia portal")]
        for dati, prog in fonti:
            for t in dati.get("thread") or []:
                if isinstance(t, dict):
                    st = str(t.get("stato") or "lavora").lower()
                    persone.append({"progetto": t.get("progetto") or prog or "?", "titolo": t.get("titolo") or t.get("id"),
                                    "stato": "aspetta" if st.startswith("aspetta") else "finito" if st.startswith(("finit", "fatto")) else "chiuso" if st.startswith("chius") else "lavora",
                                    "attivita": t.get("attesa") or t.get("attivita") or "",
                                    "quando": _ts(t.get("ultima_attivita_utc"))})
        persone = [p for p in persone if p["stato"] != "chiuso" and time.time() - (p["quando"] or 0) < 48 * 3600]
        righe.append("Ufficio chiuso: riassunto da quello che i progetti hanno scritto.")
    if filtro:
        persone = [p for p in persone if filtro in str(p["progetto"]).lower()]
    gruppi = [("aspetta", "Aspettano Stefano"), ("lavora", "Lavorano"), ("pensa", "Pensano"),
              ("ferma?", "Forse bloccati"), ("finito", "Hanno finito")]
    for st, nome in gruppi:
        sel = [p for p in persone if p["stato"] == st and not (p.get("fisso") and st == "finito")]
        if not sel:
            continue
        righe.append(f"\n{nome} ({len(sel)}):")
        for p in sorted(sel, key=lambda p: -(p["quando"] or 0))[:25]:
            righe.append(f"- [{p['progetto']}] {p['titolo']}" + (f": {p['attivita']}" if p["attivita"] else "")
                         + (f" (da {_da_quanto(p['quando'])})" if p["quando"] else ""))
    if len(righe) == 1:
        righe.append("Nessuno al lavoro" + (f" per '{filtro}'." if filtro else "."))
    return "\n".join(righe)


def _risposta(id_, result=None, errore=None):
    msg = {"jsonrpc": "2.0", "id": id_}
    if errore:
        msg["error"] = {"code": errore[0], "message": errore[1]}
    else:
        msg["result"] = result
    sys.stdout.write(json.dumps(msg, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def gestisci(msg):
    metodo, id_ = msg.get("method"), msg.get("id")
    if id_ is None:                                  # notifiche (initialized, cancelled...): niente risposta
        return
    if metodo == "initialize":
        ver = (msg.get("params") or {}).get("protocolVersion") or "2025-06-18"
        _risposta(id_, {"protocolVersion": ver, "capabilities": {"tools": {}},
                        "serverInfo": {"name": "ufficio", "version": VERSIONE},
                        "instructions": "Ufficio virtuale di Stefano: aggiorna il tuo omino con ufficio_aggiorna a ogni cambio di stato."})
    elif metodo == "ping":
        _risposta(id_, {})
    elif metodo == "tools/list":
        _risposta(id_, {"tools": STRUMENTI})
    elif metodo == "tools/call":
        p = msg.get("params") or {}
        nome, arg = p.get("name"), p.get("arguments") or {}
        try:
            if nome == "ufficio_aggiorna":
                testo = aggiorna(arg)
            elif nome == "ufficio_guarda":
                testo = guarda(arg)
            else:
                return _risposta(id_, errore=(-32602, f"strumento sconosciuto: {nome}"))
            _risposta(id_, {"content": [{"type": "text", "text": testo}], "isError": False})
        except Exception as exc:
            _risposta(id_, {"content": [{"type": "text", "text": f"Errore: {exc}"}], "isError": True})
    elif metodo in ("resources/list", "prompts/list"):
        _risposta(id_, {metodo.split("/")[0]: []})
    else:
        _risposta(id_, errore=(-32601, f"metodo non gestito: {metodo}"))


def main():
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8")
        sys.stdout.reconfigure(encoding="utf-8", newline="\n")
    for riga in sys.stdin:
        riga = riga.strip()
        if not riga:
            continue
        try:
            msg = json.loads(riga)
        except ValueError:
            _risposta(None, errore=(-32700, "JSON non valido"))
            continue
        for m in (msg if isinstance(msg, list) else [msg]):
            if isinstance(m, dict):
                gestisci(m)


if __name__ == "__main__":
    main()

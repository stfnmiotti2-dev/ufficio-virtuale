"""Ufficio virtuale - Task 3: lettura della chat completa di una sessione.

read_chat(path, offset) legge il transcript dal byte `offset` in poi (solo righe
complete) e restituisce le voci in un formato semplice per la pagina chat.html.
Alla prima apertura legge al massimo gli ultimi FIRST_BYTES byte, cosi' anche i
transcript molto lunghi si aprono subito.
"""
import json

from scanner import clean_text

FIRST_BYTES = 4 * 1024 * 1024
MAX_FIELD = 6000          # taglio i testi lunghissimi (output di strumenti, file letti)


def _cut(text):
    text = text if isinstance(text, str) else json.dumps(text, ensure_ascii=False, indent=1)
    if len(text) > MAX_FIELD:
        return text[:MAX_FIELD] + f"\n… (tagliato, {len(text) - MAX_FIELD} caratteri in più)"
    return text


def _result_text(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for b in content:
            if isinstance(b, dict):
                if b.get("type") == "text":
                    parts.append(b.get("text", ""))
                elif b.get("type") == "image":
                    parts.append("[immagine]")
        return "\n".join(parts)
    return "" if content is None else str(content)


def _entries(rec):
    """Converte una riga del transcript in zero o piu' voci della chat."""
    if rec.get("isSidechain") or rec.get("type") not in ("user", "assistant"):
        return []
    ts = rec.get("timestamp")
    content = rec.get("message", {}).get("content")
    out = []
    if rec["type"] == "user":
        if isinstance(content, str):
            if rec.get("isMeta"):
                return []
            text = clean_text(content)
            if text:
                out.append({"tipo": "utente", "testo": _cut(text), "ts": ts})
            return out
        for b in content or []:
            if not isinstance(b, dict):
                continue
            if b.get("type") == "tool_result":
                out.append({"tipo": "risultato", "rif": b.get("tool_use_id"),
                            "testo": _cut(_result_text(b.get("content"))),
                            "errore": bool(b.get("is_error")), "ts": ts})
            elif b.get("type") == "text" and not rec.get("isMeta"):
                text = clean_text(b.get("text", ""))
                if text:
                    out.append({"tipo": "utente", "testo": _cut(text), "ts": ts})
            elif b.get("type") == "image":
                out.append({"tipo": "utente", "testo": "[immagine allegata]", "ts": ts})
        return out
    for b in content or []:
        if not isinstance(b, dict):
            continue
        if b.get("type") == "text" and b.get("text", "").strip():
            out.append({"tipo": "agente", "testo": _cut(b["text"]), "ts": ts})
        elif b.get("type") == "thinking" and b.get("thinking", "").strip():
            out.append({"tipo": "pensiero", "testo": _cut(b["thinking"]), "ts": ts})
        elif b.get("type") == "tool_use":
            out.append({"tipo": "strumento", "id": b.get("id"), "nome": b.get("name", "?"),
                        "input": _cut(b.get("input") or {}), "ts": ts})
    return out


def read_chat(path, offset=None):
    """Restituisce {"offset": nuovo_offset, "troncato": bool, "voci": [...]}."""
    size = path.stat().st_size
    truncated = False
    if offset is None or offset < 0 or offset > size:
        offset = max(0, size - FIRST_BYTES)
        truncated = offset > 0
    with open(path, "rb") as f:
        f.seek(offset)
        data = f.read(size - offset)
    if truncated:                       # salto la prima riga, tagliata a meta'
        nl = data.find(b"\n")
        data = data[nl + 1:] if nl >= 0 else b""
        offset = size - len(data)
    end = data.rfind(b"\n")             # tengo solo le righe complete
    complete = data[: end + 1] if end >= 0 else b""
    voci = []
    for raw in complete.split(b"\n"):
        raw = raw.strip()
        if not raw:
            continue
        try:
            voci.extend(_entries(json.loads(raw)))
        except ValueError:
            continue
    return {"offset": offset + len(complete), "troncato": truncated, "voci": voci}

# Ufficio virtuale

Pagina locale che mostra le sessioni di Claude Code del PC (letti da `~/.claude/projects/*.jsonl`):
cosa sta facendo ogni agente, e la chat completa con un clic.

- Solo libreria standard di Python 3, nessuna installazione.
- Il server ascolta solo su `127.0.0.1:8787` e legge i file senza modificarli.
- Non chiama nessuna AI e non manda dati fuori dal PC. L'unica connessione esterna è il
  controllo degli aggiornamenti su questo repo GitHub.

## Uso

- `avvio.pyw` (doppio clic, o l'icona sul desktop): si aggiorna da questo repo, avvia il server
  senza finestra e apre il browser.
- `python server.py`: avvio a mano, con la finestra dei messaggi.
- `python scanner.py`: elenco delle sessioni nel terminale.

## File personali

`etichette-mie.json` (frasi per gli strumenti, stesso formato di `etichette.json`) e `links.json`
restano sul PC e gli aggiornamenti non li toccano.

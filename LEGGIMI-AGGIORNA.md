# Pulsante 🔄 AGGIORNA

Dal 23/11 i thread nel cloud non avvisano più l'ufficio a ogni cambio di stato, perché costava token.
Avvisano da soli solo in due momenti: quando **hanno finito** e quando **si fermano ad aspettarti**.
Tutto il resto (chi ha ripreso a lavorare, chi è nuovo) arriva quando premi **🔄 AGGIORNA**.

Il pulsante chiede al server dell'ufficio di avviare un'attività programmata su claude.ai.
Quell'attività apre un thread corto "Capo › Giro AGGIORNA ufficio", che rilegge lo stato di tutti i thread, riscrive `stato-thread.json` e si chiude da solo.
In 1-2 minuti l'ufficio si aggiorna da solo. Il pulsante si può ripremere dopo 1 minuto.

## Da fare una volta sola

1. Su https://claude.ai/code/routines apri l'attività "Ufficio: pulsante AGGIORNA", scegli **Edit**, poi in **Trigger** premi **+** e scegli **API**.
2. Premi **Generate token** e copia subito il codice: si vede una volta sola. Copia anche l'indirizzo che finisce con `/fire`.
3. Nella cartella dell'ufficio crea il file `aggiorna-token.json` con:

```json
{"url": "https://api.anthropic.com/v1/claude_code/routines/trig_.../fire",
 "token": "sk-ant-oat01-..."}
```

Il file resta solo sul PC: è nel `.gitignore` e gli aggiornamenti automatici non lo toccano.
Se rigeneri il codice, quello vecchio smette di funzionare: aggiorna il file.

## Clic

- Clic sull'**omino**: scheda con stato, da quanto, cosa fa e il pulsante per aprire il thread.
- Clic sulla **scrivania** (o sull'ufficio a vetri): apre subito il thread.

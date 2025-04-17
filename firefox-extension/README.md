# Browser Developer Tools

Estensione Firefox che fornisce strumenti avanzati per lo sviluppo web, ispezione e debug delle pagine web.

## Funzionalità

L'estensione offre le seguenti funzionalità:

### Console
- Visualizzazione dei log della console
- Visualizzazione degli errori della console
- Pulizia dei log

### Rete
- Monitoraggio delle richieste di rete
- Visualizzazione degli errori di rete
- Pulizia dei log di rete

### Strumenti
- Acquisizione screenshot della pagina
- Ispezione dell'elemento selezionato
- Audit di accessibilità
- Audit di performance
- Audit SEO
- Audit best practices
- Modalità debugger

## Installazione

### Installazione temporanea (per sviluppo)

1. Apri Firefox e naviga a `about:debugging`
2. Clicca su "Questo Firefox"
3. Clicca su "Carica componente aggiuntivo temporaneo"
4. Seleziona il file `manifest.json` nella cartella dell'estensione

### Pacchettizzazione per la distribuzione

1. Comprimere l'intera cartella dell'estensione in un file ZIP
2. Rinominare l'estensione del file da `.zip` a `.xpi`
3. L'estensione può essere installata trascinando il file `.xpi` in Firefox

## Utilizzo

1. Clicca sull'icona dell'estensione nella barra degli strumenti di Firefox
2. Seleziona la scheda appropriata (Console, Rete o Strumenti)
3. Utilizza i pulsanti per eseguire le azioni desiderate

## Shortcut da tastiera

- **Alt+Shift+B**: Apri il popup degli strumenti di sviluppo

## Struttura del progetto

```
firefox-extension/
├── icons/                  # Icone dell'estensione
├── popup/                  # UI del popup
│   ├── popup.html          # HTML del popup
│   ├── popup.css           # Stili del popup
│   └── popup.js            # JavaScript del popup
├── content_scripts/        # Script per interagire con le pagine web
│   └── content.js          # Content script principale
├── background.js           # Script di background
├── manifest.json           # Configurazione dell'estensione
└── README.md               # Documentazione
```

## Sviluppo

Per contribuire allo sviluppo:

1. Clona il repository
2. Modifica i file come necessario
3. Testa l'estensione usando l'installazione temporanea
4. Invia una pull request

## Requisiti

- Firefox 57 o superiore

## Licenza

MIT 
# VICE COAST — browser open-world

Una prima vertical slice 3D giocabile, costruita per funzionare nel browser. Il mondo è generato proceduralmente con Three.js: architettura costiera, boulevard, spiaggia, palme, insegne, illuminazione al tramonto, auto, obiettivi e minimappa.

> Progetto originale e indipendente: usa ambientazioni e geometrie create nel codice, non asset, marchi o contenuti ufficiali di Rockstar Games.

## Avvio con un doppio clic (Windows)

1. Scarica la versione aggiornata della repository con **Code → Download ZIP** ed estrai la cartella.
2. Nella cartella estratta fai doppio clic su **AVVIA_GIOCO.bat**.
3. Si aprirà automaticamente il browser all'indirizzo locale. Premi **ENTRA IN CITTÀ**.

**Non aprire index.html con doppio clic:** Chrome blocca i moduli JavaScript ES quando la pagina usa l'indirizzo `file://`. Il launcher avvia un piccolo server HTTP limitato a `127.0.0.1` (solo il tuo PC), necessario per caricare correttamente Three.js e `game.js`. Non richiede Python, Node.js o Visual Studio Code; Windows PowerShell è già incluso in Windows.

Per chiudere il gioco, torna alla finestra nera del launcher e premi **CTRL+C**.

È necessaria una connessione Internet per caricare Three.js e i font. È consigliato Chrome, Edge o Firefox aggiornato con accelerazione hardware/WebGL attiva.

## Pubblicazione online con GitHub Pages

La repository include un workflow che pubblica il gioco a ogni push su `main`. Per il primo avvio, abilita Pages una sola volta:

1. Apri **Settings → Pages**: https://github.com/mungigue/GTA_VI/settings/pages
2. In **Build and deployment**, imposta **Source: GitHub Actions**.
3. Apri Actions e attendi che **Deploy static game to GitHub Pages** termini con esito verde.

Dopo la pubblicazione, il gioco sarà disponibile a:

**https://mungigue.github.io/GTA_VI/**

## Comandi

| Tasto | Azione |
|---|---|
| W / A / S / D | Guida o movimento a piedi |
| SHIFT | Boost / corsa |
| SPACE | Freno a mano |
| E | Scendi / entra nel veicolo |
| ESC | Pausa |

Il veicolo è il punto di partenza. Per risalire, avvicinati all'auto e premi E.

## Struttura

- `index.html` — entry point, interfaccia e controllo per apertura file locale
- `style.css` — HUD, menu, pausa e layout responsive
- `game.js` — scena Three.js, città procedurale, veicoli, controlli e missioni
- `AVVIA_GIOCO.bat` — launcher Windows con doppio clic
- `avvia-gioco.ps1` — server HTTP locale limitato a localhost
- `.github/workflows/deploy.yml` — pubblicazione automatica GitHub Pages

## Stato del progetto

**0.1.0 — Pre-alpha.** È una base giocabile e un primo mondo esplorabile, non ancora un prodotto AAA: fisica, collisioni, audio, personaggi, missioni e livello di dettaglio continueranno a essere ampliati.

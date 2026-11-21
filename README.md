# VICE COAST — browser open-world

Una prima vertical slice 3D giocabile, costruita per funzionare direttamente nel browser. Il mondo è generato proceduralmente con Three.js: architettura costiera, boulevard, spiaggia, palme, insegne, illuminazione al tramonto, auto, obiettivi e minimappa.

> Progetto originale e indipendente: usa ambientazioni e geometrie create nel codice, non asset, marchi o contenuti ufficiali di Rockstar Games.

## Avvio rapido

### In locale
1. Scarica o clona la repository.
2. Apri la cartella in Visual Studio Code.
3. Avvia index.html con l'estensione Live Server (oppure usa un server statico locale).
4. Premi ENTRA IN CITTÀ.

È necessaria una connessione Internet per caricare Three.js e i font. È consigliato Chrome, Edge o Firefox aggiornato con accelerazione hardware/WebGL attiva.

### Pubblicazione su GitHub Pages
Il workflow in .github/workflows/deploy.yml pubblica automaticamente il sito a ogni push su main.

Al primo utilizzo:
1. Apri Settings → Pages nella repository.
2. In Build and deployment, imposta Source: GitHub Actions.
3. Apri Actions e controlla il workflow Deploy static game to GitHub Pages.

Quando il deploy termina, il sito sarà disponibile all'indirizzo:

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

- index.html — entry point e interfaccia del gioco
- style.css — HUD, menu, pausa e layout responsive
- game.js — scena Three.js, città procedurale, veicoli, controlli e missioni
- .github/workflows/deploy.yml — pubblicazione automatica GitHub Pages

## Stato del progetto

**0.1.0 — Pre-alpha.** È una base giocabile e un primo mondo esplorabile, non ancora un prodotto AAA: fisica, collisioni, audio, personaggi, missioni e livello di dettaglio continueranno a essere ampliati.
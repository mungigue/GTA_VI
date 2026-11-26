# VICE COAST — browser open-world

Una vertical slice 3D per browser, costruita con Three.js 0.187 e WebGPU, con fallback automatico a WebGL 2. La città include una griglia urbana più ampia, edifici istanziati, asfalto PBR, HDRI, acqua animata, traffico e auto in scala reale.

## Avvio con un doppio clic (Windows)

1. Scarica la versione aggiornata della repository con **Code → Download ZIP** ed estrai la cartella.
2. Nella cartella estratta fai doppio clic su **AVVIA_GIOCO.bat**.
3. Si aprirà automaticamente il browser su localhost. Premi **ENTRA IN CITTÀ**.

**Non aprire `index.html` direttamente:** Chrome blocca i moduli JavaScript ES con `file://`. Il launcher crea un server HTTP limitato a `127.0.0.1`, solo sul PC locale. Non richiede Python, Node.js o Visual Studio Code.

Per chiudere, torna alla finestra del launcher e premi **CTRL+C**.

È necessaria una connessione Internet per Three.js, i modelli GLB, le texture PBR, l'HDRI e i font.

## Ray tracing reale

Durante la guida il gioco usa il renderer WebGPU con fallback WebGL 2, ombre, materiali fisici e risoluzione adattiva per privilegiare la fluidità.

Premi **P** oppure il pulsante **RT FOTO** per avviare la modalità path tracing:
- costruisce una BVH della scena sul GPU path tracer;
- traccia raggi per riflessioni e trasporto della luce;
- accumula progressivamente fino a 64 campioni;
- ferma la simulazione mentre la vista viene calcolata, per non rallentare la guida.

Questa modalità richiede un browser con **WebGPU** e una GPU compatibile. Se WebGPU non è disponibile, il gioco continua in modalità PBR/WebGL 2 e il pulsante RT resta disabilitato. Il path tracing è una modalità statica/cinematica, non un ray tracing continuo mentre l'auto si muove.

## Comandi

| Tasto | Azione |
|---|---|
| W / A / S / D | Guida o movimento a piedi |
| SHIFT | Boost / corsa |
| SPACE | Freno a mano |
| E | Scendi / entra nel veicolo |
| P | Ray tracing foto (solo WebGPU) |
| ESC | Pausa |

## Grafica e asset

- Auto: modelli GLB Innerscene CC0 con dimensioni in metri; il modello del giocatore è circa 4,63 × 2,09 × 1,19 m.
- Asfalto PBR e HDRI: Poly Haven CC0.
- Edifici, illuminazione, palme, traffico e dettagli: scena procedurale e modelli GLB CC0.
- Edifici, lampioni, segnaletica e traffico usano instancing per ridurre le draw call.
- La risoluzione del renderer si adatta in base al frame time, con limite iniziale al pixel ratio.

Il progetto è originale e indipendente: non include asset o contenuti ufficiali Rockstar Games.

## Pubblicazione online con GitHub Pages

Per il primo utilizzo, apri **Settings → Pages**:
https://github.com/mungigue/GTA_VI/settings/pages

In **Build and deployment**, imposta **Source: GitHub Actions**. Dopo che il workflow termina con esito verde, il gioco sarà disponibile a:

**https://mungigue.github.io/GTA_VI/**

## Stato del progetto

**0.3.0 — Pre-alpha.** Renderer WebGPU, modalità path tracing statica, auto in scala reale e orientamento corretto, edifici e strade ottimizzati. Non è ancora un gioco AAA: i modelli e la città sono una base giocabile che continuerà a richiedere asset ambientali più dettagliati, animazioni, fisica, audio, personaggi e missioni complete.

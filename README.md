# VICE COAST — browser open-world

Una vertical slice 3D giocabile per browser, con una città costiera procedurale più ampia, strade PBR, illuminazione ambientale HDR, mare animato, palme, facciate dettagliate, auto con carrozzeria arrotondata, traffico, obiettivi e minimappa.

I materiali PBR dell'asfalto e l'illuminazione HDRI arrivano da **Poly Haven** (CC0). I modelli 3D del veicolo, del traffico e delle palme arrivano dalla libreria **Innerscene** (CC0): [sedan](https://www.innerscene.com/tools/library/3d-parts/sedan-car-42109739), [supercar](https://www.innerscene.com/tools/library/3d-parts/generic-mid-engine-supercar-73f252c5), [palma dettagliata](https://www.innerscene.com/tools/library/3d-parts/palm-detailed-a8777b8c). Il progetto è originale e indipendente: non include asset o contenuti ufficiali Rockstar Games.

## Avvio con un doppio clic (Windows)

1. Scarica la versione aggiornata della repository con **Code → Download ZIP** ed estrai la cartella.
2. Nella cartella estratta fai doppio clic su **AVVIA_GIOCO.bat**.
3. Si aprirà automaticamente il browser su localhost. Premi **ENTRA IN CITTÀ**.

**Non aprire `index.html` direttamente:** Chrome blocca i moduli JavaScript ES con `file://`. Il launcher avvia un piccolo server HTTP limitato a `127.0.0.1` (solo sul tuo PC). Non richiede Python, Node.js o Visual Studio Code; Windows PowerShell è già incluso in Windows.

Per chiudere, torna alla finestra del launcher e premi **CTRL+C**.

È necessaria una connessione Internet per caricare Three.js, il materiale PBR dell'asfalto, l'HDRI e i font. È consigliato Chrome/Edge aggiornato con accelerazione hardware e WebGL attivi.

## Pubblicazione online con GitHub Pages

La repository contiene un workflow per GitHub Pages. Per il primo utilizzo, abilita Pages:

1. Apri **Settings → Pages**: https://github.com/mungigue/GTA_VI/settings/pages
2. In **Build and deployment**, imposta **Source: GitHub Actions**.
3. Apri Actions e verifica che **Deploy static game to GitHub Pages** termini con esito verde.

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

- `index.html` — entry point, menu e import map Three.js
- `style.css` — HUD, menu, pausa e layout responsive
- `game.js` — mondo 3D, città, veicoli, controlli e missioni
- `AVVIA_GIOCO.bat` — launcher Windows con doppio clic
- `avvia-gioco.ps1` — server HTTP locale limitato a localhost
- `.github/workflows/deploy.yml` — workflow GitHub Pages

## Stato del progetto

**0.2.0 — Pre-alpha.** Città ampliata, asfalto PBR, HDRI, modelli GLB CC0 per auto e palme, traffico, obiettivi e guida. È una base giocabile con asset reali, non ancora un gioco AAA fotorealistico: per arrivare a quel livello servono ulteriori ambienti e architetture fotogrammetriche, animazioni avanzate, fisica, audio, personaggi e missioni complete.

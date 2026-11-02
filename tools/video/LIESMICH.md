# Trailer (YouTube Short, Englisch, ~45 s)

Ergebnis: `store/video/pizza_panic_trailer_en.mp4` (1080×1920, 30 fps, Musik = Spiel-Loop aus `public/sound.js`, 104 BPM).

Die Skripte erwarten einen Arbeitsordner mit `playwright-core` (z. B. `%TEMP%\pp-shot` mit `npm install playwright-core`,
Skripte nach `%TEMP%\pp-shot\video\` kopieren), installiertes Chrome und ffmpeg (winget Gyan.FFmpeg.Essentials).

1. Vorführprofil schreiben und lokalen Server mit Demo-Szenen starten: `SMASH_DEMO=1`, `PORT=3125` (Szene `video` in `server.js`).
2. `node rec.js` – nimmt die 7 Szenen als Bildfolgen auf (CDP-Screencast) → `clips/*.mp4`.
3. `node music.js 52 104` – rendert die Musik → `music.wav`.
4. `node cards.js` – Rahmen, Titel-/Abschlusskarte, Einblendungen → `gfx/`.
5. `node make.js` – schneidet alles mit Überblendungen zusammen.

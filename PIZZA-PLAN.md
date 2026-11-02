# Pizza Panic – Bauplan (Startpunkt: Kopie von Smash Burger, Stand 02.11.2026)

**Name der App: „Pizza Panic“** (vom Nutzer gewählt). Ordner: `Desktop\pizza-panic`. Vorschlag Paket-ID: `com.duoh.pizzapanic`.

Dieser Ordner ist eine **Kopie des fertigen Smash-Burger-Codes** (`Desktop\smash-burger`). Ziel: eine **eigene, zweite App** mit
**identischem Spielprinzip**, aber mit **Pizzas statt Burgern** und einem **anderen Look am Tisch**, damit man den Unterschied sieht.
Smash Burger selbst bleibt unverändert und darf nicht angefasst werden.

## Was gleich bleibt
- Regeln (1–3 Karten pro Zug, auf 3 nachziehen, Bestellung in fester Reihenfolge, kein Rezept doppelt), Aktionskarten
  (Anbrennen, Klauen, Mülltaucher, Falscher Tisch), Paar-Regel, Kombi-Karten.
- Technik: Node-Server ohne Abhängigkeiten (`server.js`, SSE), gemeinsame Spiellogik `public/engine.js`, Capacitor-Android-App in `app/`,
  Profile/Level/XP, Matchmaking, Bots (leicht/normal/schwer), Tutorial mit Koch-Figur, Shop (Münzen, Designs, Emotes, Themen-Packs),
  AdMob-Belohnungsvideos, Google-Play-Käufe, Musik/Sounds, Lade-Bildschirm, Zug-Banner, Animationen.

## Was sich ändert (Vorschlag – mit dem Nutzer abstimmen)
| Burger | Pizza |
|---|---|
| Brötchen (letzte Zutat) | **Teig** ist die unterste Zutat, **Käse/Ofen** zum Schluss – Reihenfolge von unten nach oben wie beim Belegen |
| Beef/Chicken-Patty, Tomate, Salat, Käse | Tomatensoße, Mozzarella, Salami, Schinken, Pilze, Paprika, Basilikum, Ananas … |
| Cheeseburger, Chicken, Deluxe, Classic | z. B. Margherita, Salami, Funghi, Hawaii (4 klassische Pizzen) |
| Kombi-Karten (Salat+Tomate, Cheese-Patty) | z. B. „Soße + Käse“, „Salami + Pilze“ |
| „Fertiger Burger“-Karten | „Fertige Pizza“-Karten |
| Tablett | **Pizzabrett / Holzschieber** oder Pizzakarton – anderes Tisch-Design |
| Koch Kalle | eigener Pizzabäcker (z. B. „Luigi“/„Toni“) – neue Figma-Figur |
| Logo „Smash Burger“, orange Farbwelt | eigenes Logo, eigene Farbwelt (z. B. Rot/Grün/Creme, italienisch) |
| Themen-Packs | eigene Pizza-Themen (z. B. Napoli, Amerikanisch, Vegetarisch, Meeresfrüchte, Weihnachten) |

## Zuerst klären (Nutzer fragen)
1. ~~Name der App~~ → **Pizza Panic** (entschieden). Paket-ID `com.duoh.pizzapanic` noch bestätigen lassen.
2. **Pizzen und Zutaten** – Vorschlag oben bestätigen lassen.
3. **Eigener Server/eigene Datenbank** (empfohlen: neuer Render-Dienst + neues Supabase-Projekt oder neue Tabellen) – sonst würden
   sich Profile/Level mit Smash Burger vermischen.
4. Gleiche Monetarisierung (Münzen, Themen-Packs 0,99 €, Unterstützer 2,99 €, Belohnungsvideos 15 Münzen/3 pro Tag, ×2 max. 5/Tag)?

## Entscheidungen (02.11.2026, vom Nutzer bestätigt)
- Paket-ID **com.duoh.pizzapanic**. Pizzabäcker heißt **Luigi**, Farbwelt Rot/Grün/Creme, Brett = Holzschieber.
- Teig ist keine Karte (liegt schon auf dem Brett). Jede Pizza: **Tomatensoße zuerst, Mozzarella zum Schluss**.
- Klassiker (Index 0–3, 4–6 Personen spielen 0–2): Margherita (Soße, Basilikum, Mozz.), Prosciutto e Funghi (Soße, Schinken,
  Pilze, Mozz.), Speciale (Soße, Salami, Schinken, Pilze, Mozz.), Salami (Soße, Salami, Paprika, Mozz.).
- Kombi: „Soße + Salami“, „Schinken + Pilze“. Fertige Pizzen: Margherita, Prosciutto e Funghi, Speciale.
- Themen: Aloha Hawaii, Feuer & Flamme (diavolo), Grüner Garten (veggie), Frutti di Mare (seafood), Weihnachtsbäckerei (xmas).
- **Eigener Render-Dienst + eigenes Supabase-Projekt** (Schema in `supabase/schema.sql`).
- Monetarisierung wie Smash Burger (Packs 0,99 €, Unterstützer 2,99 €, Videos 15 Münzen 3×/Tag, ×2 max. 5/Tag).

## Stand
- [x] Spiellogik, Themen, Kartenanzahl (Partielängen wie Smash Burger), Tutorial mit Luigi, `npm test` grün
- [x] Alle Texte, Shop (Pizzabretter, Emotes, Themen-Pack-IDs), Konfiguration (Paket-ID, Server-URL pizza-panic.onrender.com)
- [x] Grafiken (Figma-Datei „Pizza Panic – Grafiken“): Zutaten, Luigi, Logo, Hintergründe; Quellen in `art-src/pizza/`
- [x] Aktionskarten-Bilder neu (Anbrennen, Klauen, Mülltaucher, Falscher Tisch), App-Icon (panische Pizzascheibe),
      Startbild, Favicon, `store/app-icon-512.png` – neu bauen mit `node tools/make-icons.js`
- [x] Android: Paket com.duoh.pizzapanic, Strings, AdMob (App ca-app-pub-2648510730204337~7315516608,
      Belohnung ca-app-pub-2648510730204337/1514901729), neuer Keystore in `Desktop\pizza-panic-keys` (PASSWORT.txt),
      Version 1.0 / versionCode 1 (bei jedem Upload erhöhen), APK im Drive `G:\Mon Drive\PizzaPanic` (nur die neueste)
- [x] Datenbank: Gratis-Tarif erlaubt nur 2 Projekte → Nutzer-Entscheidung: Tabellen `pizza_profiles` / `pizza_purchases`
      im Supabase-Projekt „smash-burger“ (svadhluclwfakgfgpgtu, Frankfurt). Gleiche SUPABASE_URL + Secret-Key wie Smash Burger.
- [x] Lokales Git-Repo mit Commits, Remote https://github.com/Windwidos/pizza-panic.git
- [ ] GitHub-Repo anlegen (Nutzer) → push; Render-Blueprint aus render.yaml (Nutzer) + Env-Variablen
- [ ] Play-Console-App, Store-Eintrag (`store/`) und Promo-Bilder neu

## Wichtige Hinweise aus Smash Burger (bitte übernehmen)
- Alle Texte Deutsch, Antworten an den Nutzer immer auf Deutsch.
- Grafiken per Figma-KI (`gpt-image-2.5-sunburst`), Sprite-Sheets auf Magenta, zuschneiden mit `node tools/cut-sheet.js` (sharp aus `app/node_modules`).
- Rezepte/Indizes in `public/engine.js` (`TYPES`, `RECIPES`, `THEMES`), Shop-Katalog in `public/shop.js`, Server-Rigs fürs Tutorial in `server.js`
  (`TUTORIAL_RIG`, `TUTORIAL_BOT_RIG`) + `test/tutorial.js` müssen zusammenpassen.
- `npm test` muss grün bleiben (Bot-Partien, Themen, Tutorial bis zum Sieg).
- Android-Build: `app/` → `node build-www.js`, `npx cap sync android`, `gradlew bundleRelease` mit JDK 21 (Eclipse Adoptium) und
  `ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk`. **Neuer Signaturschlüssel** für die neue App (nicht den von Smash Burger!).
  build.gradle ohne BOM schreiben.
- APK-Ablage im Drive: eigener Ordner, immer **nur die neueste APK** behalten.
- AdMob: neue App + Anzeigenblock anlegen lassen; Play Console: neue App unter dem DuOh-Konto.
- Datenschutz/Impressum: DuOh Corporation UG (wie Atomic Nerds / Smash Burger).
- Git: neues GitHub-Repo (Konto Windwidos), MinGit unter `%LOCALAPPDATA%\Programs\MinGit\cmd\git.exe`.

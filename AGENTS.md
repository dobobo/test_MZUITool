# AGENTS.md

## Cursor Cloud specific instructions

### What this repo is
The tracked git tree only contains `README.md`, `docs/`, and a committed release ZIP
(`DB_UIComposer_release_*.zip`). The actual product lives inside that ZIP: **DB_UIComposer**,
an Electron desktop UI-layout editor for RPG Maker MZ (Japanese UI), plus the companion
`DB_UIComposer.js` MZ plugin. Releases are shipped by committing an updated ZIP, so there is
no unpacked source in the repo by design.

### Where the runnable app comes from
The startup update script extracts the newest `DB_UIComposer_release_*.zip` into
`DB_UIComposer_extracted/` and runs `npm install` inside
`DB_UIComposer_extracted/DB_UIComposer_Tool/`. `DB_UIComposer_extracted/` is gitignored — edits
there are NOT committed (the repo ships the ZIP, not unpacked source). To change the shipped
product you must repackage the ZIP.

### Running the app (Electron GUI)
- App dir: `DB_UIComposer_extracted/DB_UIComposer_Tool` (npm scripts: `start` = `electron .`, `debug` = `electron . --debug`).
- A TigerVNC X server runs on `DISPLAY=:1` (this is the display the computer-use/VNC pane shows). Launch the app there so it is visible:
  `cd DB_UIComposer_extracted/DB_UIComposer_Tool && DISPLAY=:1 ./node_modules/.bin/electron . --no-sandbox`
- `--no-sandbox` is REQUIRED in this container (the Chromium sandbox cannot initialize).
- Headless-only smoke test (no VNC): `xvfb-run -a ./node_modules/.bin/electron . --no-sandbox`.
- Benign noise on startup (safe to ignore): `Failed to connect to the bus` (no D-Bus), `Exiting GPU process ... errors during initialization` / `dri3 extension not supported` (software GPU). A `FATAL: Failed to shutdown` line only appears when the process is killed by a `timeout`/signal, not from normal use.
- The VNC screen may blank/screensaver during long idle recordings; disable with `DISPLAY=:1 xset s off` before recording GUI demos.

### Exercising core functionality
Top toolbar icon buttons add elements (▣ window, T text, ▰ gauge, □ button, ☰ choice, 🖼 image);
each opens a small variant palette. Added elements render in the center preview and populate the
right-side properties panel. `MZスクリプトをコピー` exports the composed layout as an MZ
`PluginManager.callCommand(... "ApplyLayoutJson" ...)` script to the clipboard. To verify the
export headlessly: `DISPLAY=:1 xclip -selection clipboard -o`.

### Tests / lint / build
There are none — `package.json` defines only `start` and `debug`, and there is no bundler,
linter, or test framework. The app is loaded unbundled (`app.js`, `vendor/ag-psd.bundle.js` via
`index.html`).

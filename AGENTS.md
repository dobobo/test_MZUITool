# testgo

This repository distributes two RPG Maker MZ artifacts as committed zip archives:

- `DB_UIComposer_release_*.zip` — **DB_UIComposer Tool**, an Electron desktop app (the primary application). It is a Japanese-language visual UI composer for RPG Maker MZ: you lay out windows/text/gauges/buttons/images in a preview and export an MZ event-command "script" (a `PluginManager.callCommand(...)` block) plus a companion plugin `DB_UIComposer.js`.
- `Project1.zip` — a sample RPG Maker MZ game project (`data/`, `js/`), used as reference/test content for the tool.

## Cursor Cloud specific instructions

The zips are the source of truth. The startup update script extracts them into `build/` (git-ignored) and runs `npm install` for the Electron tool. `build/` is derived — never commit it, and expect it to be recreated on each run.

- **Electron tool location after setup:** `build/dbui/DB_UIComposer_Tool` (contains `package.json`, `electron-main.js`, `app.js`, `index.html`).
- **Run the app (GUI):** the GUI display (`DISPLAY=:1`, Xtigervnc + Xfce) is only started when the computer-use environment is initialized; a plain shell sees no X server until then. Once a screenshot/computer-use session has booted the desktop, launch with:
  `DISPLAY=:1 build/dbui/DB_UIComposer_Tool/node_modules/.bin/electron build/dbui/DB_UIComposer_Tool --no-sandbox`
  - `--no-sandbox` is required (containerized/root-less environment).
  - Startup logs harmless warnings: `Failed to connect to the bus` (no D-Bus) and a GPU fallback to SwiftShader software rendering. These are expected; the window still renders and is fully interactive.
  - `npm start` (`electron .`) works too if run from the tool directory, but you must have `DISPLAY` set and the desktop up.
- **No build/lint/test tooling ships with this project** — there is no bundler, linter, or test suite. "Building" is not applicable; the app runs directly from source. Verification is manual GUI interaction (compose UI → `MZスクリプトをコピー` → paste back into the `JSON / MZスクリプト読込` textarea).
- **The RPG Maker MZ game (`Project1`) cannot be fully run here:** the zip contains only `data/` and `js/` — the engine's `img/`, `audio/`, and `index.html` runtime are absent — so it is reference content, not a runnable web app. Do not spend time trying to boot it as a game.

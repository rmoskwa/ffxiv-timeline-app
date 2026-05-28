# FFXIV Raid Timeline

Local desktop app for building FFXIV raid timelines with drag-and-drop boss abilities and per-player mitigation planning.

## Quickstart

1. Download the latest installer from the [Releases page](https://github.com/rmoskwa/ffxiv-timeline-app/releases/latest) — the `*.exe` asset
2. Run the installer
3. Launch from the Start menu. The app checks for updates on launch and prompts you when a new version is available.

**Requirements:** Windows 10 or 11. Windows 11 ships with WebView2; on Windows 10, install it from <https://developer.microsoft.com/microsoft-edge/webview2/>.

## For developers

Built with React 19 + TypeScript (Vite) on a Tauri 2 (Rust) desktop shell. State is Zustand; persistence is JSON files via the Tauri FS plugin.

### Setup

1. Install Rust via [rustup](https://rustup.rs)
2. Install Microsoft C++ Build Tools — Visual Studio 2022 or newer with "Desktop development with C++", or the standalone Build Tools.
3. Install Node 20+ (currently dev'd against Node 24).
4. Then:
   ```
   npm install
   npm run tauri:dev
   ```
   First build takes several minutes — Cargo compiles all Rust deps. Subsequent runs are fast.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite-only (browser at http://localhost:1420). No Tauri shell, no filesystem access. |
| `npm run tauri:dev` | Full app: launches the Tauri window, hot-reloads frontend. |
| `npm run typecheck` | `tsc --noEmit` over `src/`. |
| `npm test` | Vitest run. |
| `npm run check` | Biome lint + format with auto-fix. |
| `npm run build` | Production frontend build. |
| `npm run tauri:build` | Production desktop binary. |

## Repo structure

```
src/
├── domain/         Pure TS types + math/coverage/conflicts logic
├── data/
│   └── mit-library/  Curated bundled mit data (all 21 jobs)
├── persistence/    JSON serialize/deserialize + schema version
├── state/          Zustand store
└── ui/             React components

src-tauri/          Rust crate for the desktop shell
CLAUDE.md           Working agreement with Claude Code
CONTEXT.md          Project glossary — canonical vocabulary
```

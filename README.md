# FFXIV Raid Timeline

Local desktop app for building FFXIV raid timelines with drag-and-drop boss abilities and per-player mitigation planning.

**Status:** v0.1 scaffolding — data model + mit library populated, drag-and-drop and damage math pending.

## Tech stack

- **Frontend:** React 19 + TypeScript, Vite dev server
- **Desktop shell:** Tauri 2 (Rust)
- **State:** Zustand (added when first consumer needs it)
- **Persistence:** JSON files via Tauri FS plugin

## First-time setup (Windows)

The project lives on the D: drive and is developed from native Windows (not WSL — Tauri's webview won't render from WSL2 without extra GUI setup).

1. **Install Rust.** Download `rustup-init.exe` from <https://rustup.rs> and run it. Accept defaults.
2. **Install Microsoft C++ Build Tools.** Tauri's Rust deps need MSVC. Either install Visual Studio 2022 with the "Desktop development with C++" workload, or just the standalone Build Tools.
3. **WebView2.** Preinstalled on Windows 11. On Windows 10, install from <https://developer.microsoft.com/microsoft-edge/webview2/>.
4. **Install Node 20+** (currently dev'd against Node 24).
5. From `D:\Documents\coding\ffxiv-timeline-app` in PowerShell or cmd:
   ```
   npm install
   npm run tauri:dev
   ```
   First build takes several minutes — Cargo is fetching and compiling all Rust deps. Subsequent runs are fast.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite-only (browser at http://localhost:1420). No Tauri shell, no FS access. |
| `npm run tauri:dev` | Full app: launches the Tauri window, hot-reloads frontend. |
| `npm run typecheck` | `tsc --noEmit` over `src/`. |
| `npm run build` | Production frontend build. |
| `npm run tauri:build` | Production desktop binary. **Requires icons** — see below. |

## Icons

`src-tauri/icons/` currently contains the placeholder icons from create-tauri-app (Tauri logo). On Windows, `icon.ico` is required by `tauri-build` to embed the window/taskbar icon into the `.exe` — this happens even when `bundle.active = false` in `tauri.conf.json`.

To swap in custom branding later, drop a 1024×1024 source PNG anywhere and run:

```
npm run tauri icon -- path/to/source.png
```

That regenerates the full icon set in `src-tauri/icons/`.

## Before first `tauri:build`

`bundle.active` in `src-tauri/tauri.conf.json` is `false`, so `tauri build` won't try to bundle distributable installers. To ship a binary later, set `"active": true` in the `bundle` block.

## Repo layout

```
src/
├── domain/         Pure TS types + (future) math/coverage/conflicts logic
├── data/
│   └── mit-library/  Curated bundled mit data (DRK/SCH/MNK/BLM for v0.1)
├── persistence/    JSON serialize/deserialize + schema version
├── state/          (next session) Zustand store
└── ui/             React components

src-tauri/          Rust crate for the desktop shell
CLAUDE.md           Working agreement with Claude Code
```

## Known gaps surfaced during v0.1 scaffolding

- **Split-damage-type mits aren't representable in the current schema.** Feint (10% phys + 5% mag) and Addle (10% mag + 5% phys) reduce two damage types at different percentages, but `mitigation_percent` is a single number per mit type. v0.1 models only the dominant effect. Resolve in v0.2 by either splitting into paired entries or extending the schema to `mitigation_per_type: Record<DamageType, %>`.
- **Multi-charge mits (e.g., DRK Oblation) are deferred indefinitely**, so they are intentionally absent from the library.
- **SCH's in-scope kit looks thin** because heals/shields are excluded. Adloquium, Succor, and Protraction are not modeled.

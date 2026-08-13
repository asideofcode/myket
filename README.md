# myket

A tiny desktop cat. It walks around, accepts pets, meows when you bother its tail, and occasionally judges you.

**Open source.** Binaries are on [Releases](https://github.com/asideofcode/myket/releases).

## Download

Grab the latest build for your OS from **[Releases](https://github.com/asideofcode/myket/releases/latest)**:

| Platform | File |
| --- | --- |
| macOS Apple Silicon | `myket_*_aarch64.dmg` |
| macOS Intel | `myket_*_x64.dmg` |
| Windows | `myket_*_x64-setup.exe` (or `.msi`) |
| Linux (no sudo) | `myket_*_amd64.AppImage` |
| Linux (deb) | `myket_*_amd64.deb` |

## Install without admin / sudo

### macOS
1. Open the `.dmg`
2. Drag **myket** into **`~/Applications`** (your user Applications folder — create it if needed). You do **not** need `/Applications` or an admin password.
3. First launch: **right-click → Open** (the build is unsigned; Gatekeeper may block a normal double-click)

### Windows
1. Run the `*-setup.exe`
2. If prompted, choose install for **just you** / current user when available
3. SmartScreen may warn on unsigned builds: **More info → Run anyway**

### Linux (recommended: AppImage)
```bash
chmod +x myket_*_amd64.AppImage
./myket_*_amd64.AppImage
```
No root required. Put it somewhere in your home directory (e.g. `~/bin` or `~/Applications`).

The `.deb` package needs elevated install privileges — skip it if you don’t have sudo.

## Controls

| Action | How |
| --- | --- |
| Pet | Click the **head** |
| Chat | **Ctrl-click** (⌘-click on Mac) the **head** |
| Move | Drag by the **back** |
| Meow | Click the **tail** (also happens randomly) |
| Mute | `M` |
| Summon home | `H` |
| Close chat | `Esc` or click outside the chat |

## Build from source

```bash
npm install
npm run tauri dev    # development
npm run tauri build  # release bundles
```

Needs Node, Rust, and the usual [Tauri platform deps](https://v2.tauri.app/start/prerequisites/).

## License

MIT

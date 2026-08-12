# myagent

Desktop cat companion. **M0–M3**: always-on-top sprite pet — pet, stub chat,
mood, and multi-monitor roaming. SQLite + Bedrock come later.

## Run

```bash
cd myagent
npm install
npm run tauri dev
```

## Controls

- **Click** — pet (heart + purr sound + sit)
- **Double-click** — chat bubble (stub replies, mood-aware)
- **Esc** — close chat
- **M** — mute / unmute purr (when chat input isn't focused)
- **H** — summon cat back to the primary display (if lost)

The cat walks across display edges onto neighboring monitors when layout allows.
If you move your cursor to another screen (or far away on the same one), it hops
or dashes over to follow you.

## Layout

- `src/cat/` — sprites, behavior, mood, monitors, sound
- `assets/sprites/` + `public/sprites/` — atlas
- `src-tauri/` — transparent always-on-top window

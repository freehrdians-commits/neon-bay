# Neon Bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/freehrdians-commits/neon-bay/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/freehrdians-commits/neon-bay/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Neon Bay** is an original 2D top-down open-world crime game for the
[make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01) — a sun-soaked,
neon-lit fictional city you explore on foot and by car, with traffic,
pedestrians, a wanted level, police who chase you, and a four-mission story.
No network requests: the whole game is static files under `game/`.

## The story

Rook is broke, fast, and out of options. Delia Vane runs the night from her
club — and she has work for a driver who asks no questions.

1. **First Gear** — steal any car and drive it to Delia's Club. ($250)
2. **Neon Run** — courier run: deliver 3 packages across the city before the timer ends. ($400)
3. **Tag the Town** — spray 8 neon tags on the marked walls. The cops hate fresh paint. ($350)
4. **The Ledger** — steal the ledger from the guarded compound, lose the heat, reach the safehouse. ($800)

## How to play

Serve the game locally and open it in a desktop browser:

```
node serve.ts
# open http://localhost:8080
```

| Key | Action |
| --- | --- |
| W A S D / arrows | Move on foot, drive a car |
| E | Enter / steal a car, exit a car, hold to spray a tag or grab the ledger |
| Shift | Nitro (in a car) |
| Space | Punch |
| P / Esc | Pause |
| M | Mission list (press 1–4 to start an unlocked mission) |
| Q | Save game (also auto-saves after every mission) |

## Systems

- **City** — a 5×5 block grid with roads, a beach, a port, traffic and
  pedestrians, all generated from a seed (`?seed=N` fixes the layout).
- **Wanted level** — stealing cars, hitting pedestrians and tagging raise
  your stars; stay clean and unseen and the heat cools off.
- **Police** — patrol cars intercept you by aiming where you are headed.
  The bust meter only fills while you are slow or on foot with a cop close
  by; a fast getaway drains it.
- **Roadblocks** — at 3 stars and up the police block the road ahead.
  Hit a barrier above 300 and you smash straight through it.
- **Day / night** — the clock runs, the city darkens, and the neon takes over.
- **Save** — progress, cash and unlocked missions persist in the browser.

## Screenshots

The four screenshots in `screenshots/` are real renders of the game,
staged deterministically with `?shot=start|play|chase|end&seed=1`
(see `shots.json`).

## Layout

- `game/index.html` — the page and canvas
- `game/src/main.js` — boot, loop, screens, save/load
- `game/src/config.js` — constants, tuning, mission definitions
- `game/src/city.js` — the map: blocks, roads, buildings, tag spots
- `game/src/entities.js` — player, cars, traffic, peds, police, roadblocks
- `game/src/missions.js` — the four-mission story state machine
- `game/src/render.js` — canvas drawing, HUD, minimap, day/night
- `game/src/shots.js` — screenshot scenes and the autopilot that drives them
- `game/src/input.js` — keyboard input
- `game/src/audio.js` — synthesised sound effects (WebAudio, no files)
- `main.ts` — the entrypoint: copies `game/` + `screenshots/` to the
  output directory and writes `dossier.json`

MIT licensed. Built from scratch for the make.fun gta6-01 bounty.

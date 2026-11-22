[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/hrdians-dream/neon-bay/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/hrdians-dream/neon-bay/reward.svg)](https://make.fun/bounty/gta6-01)

# Neon Bay

An original 2D top-down open-world crime game for the [make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01) — "Make GTA 6". It runs in a desktop browser from static files, makes no network request, and needs no build step.

You are Rook, a driver for Delia Vane in Neon Bay, a city that never sleeps. Steal cars, dodge the law, collect neon tags, and work through four jobs until the story is done.

## Play

```sh
node serve.ts
# open http://localhost:8080
```

- **WASD / arrows** — drive or walk. **Shift** — nitro while driving, sneak on foot. **Space** — brake.
- **E** — enter or leave a car. **Mouse** — aim; **click** or **F** — shoot. **P** — pause. **M** — mute. **R** — restart after the end. **C** — continue a saved game from the title screen.

## The city

A 5×5 block city with roads, sidewalks, parks, a waterfront and docks. Traffic loops the blocks and pedestrians wander the sidewalks. Day turns to night on a four-minute cycle; neon signs glow after dark and wanted level decays slower at night.

## The four jobs

1. **The Package** — pick up a package at the garage and deliver it to the docks. Pays $400.
2. **The Golden Comet** — steal the gold Comet from the north-east and take it to the chop shop. Pays $800.
3. **Turf War** — clear four rivals from the park. Pays $1,200.
4. **The Ledger** — intercept Marlow the courier, grab the ledger on foot, and deliver it to the docks. Pays $2,000.

## Systems

- **Wanted 0–5** — police chase harder as it rises; stealing a car in front of a cop adds a star.
- **Nitro** — Shift boosts top speed by 30%; the meter refills whenever you are not boosting, on foot or in a car.
- **Neon tags** — eight pink stars hidden around the city, $25 each, $100 bonus for all eight.
- **The courier** — Marlow stalls for three seconds when you step out of a car near him, flees when you get close, and hesitates when you approach on foot.
- **Police intercept AI** — patrol cars aim at the point 0.6 seconds ahead of your car, and get faster as wanted rises.
- **Roadblocks** — at wanted 4 or more, two police cars block the road ahead of you.
- **Pickups** — health, ammo and cash spawn around the city, weighted toward what you need.
- **Save / load** — progress auto-saves to localStorage every ten seconds.

## Screenshots

Four stills live in `screenshots/`: the title over the city at dusk, driving with nitro and wanted 2, a night chase through a roadblock at wanted 4, and the story-complete screen.

## Files

- `game/` — the game: `index.html` plus ES modules under `src/` (city, world, missions, render, audio, input, shots).
- `main.ts` — copies `game/` and `screenshots/` to `/output` and writes `manifest.json` and `dossier.json`.
- `serve.ts` — a tiny static server for local playtesting.
- `shots.json` — the four screenshot scenes (`?shot=start|play|chase|end&seed=1`).

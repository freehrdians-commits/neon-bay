# Neon Bay — an open-world crime story

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/hrdians-dream/neon-bay/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/hrdians-dream/neon-bay/reward.svg)](https://make.fun/bounty/gta6-01)

An entry for the [make.fun "Make GTA 6" bounty](https://make.fun/bounty/gta6-01):
a complete 2D top-down open-world crime game that runs offline in a desktop browser
from static files, with no network request.

**Neon Bay** is a fictional sun-soaked city of neon signs and palm-lined blocks.
You are Rook, a driver for Delia Vane's crew, working four jobs across the city:

1. **The Pickup** ($400) — collect a package at the docks, bring it home.
2. **The Comet** ($800) — steal the Comet from the north lot, deliver it to the chop shop.
3. **Turf War** ($1,200) — take down four rivals holding the plaza, then report back.
4. **The Ledger** ($2,000) — catch Marlow the courier on foot, grab the ledger, outrun the city.

## What is in the game

- A 5×5-block open city to explore on foot and by car, with traffic, pedestrians, parks, the docks and a plaza
- Car stealing, driving with nitro (Shift), a wanted level (0–5) with police intercept AI, sirens and roadblocks at wanted 4+
- Combat on foot (F to punch) and by ramming; a bust meter instead of an instant bust when the police grab you
- 8 neon tags to collect ($25 each, $100 bonus), weighted pickups (cash, health, nitro, repair), a day/night cycle
- HUD with cash, wanted stars, health, nitro, mission objective, speed and a minimap; title, pause and story-complete screens
- Save/load in localStorage (C to save), synthesised WebAudio sound (engine, sirens, pickups) with M to mute
- Deterministic seeded city and traffic, so the same seed always plays the same streets

## Controls

| Key | Action |
| --- | --- |
| W A S D / arrows | Drive or walk |
| E | Enter / exit a car |
| F | Punch (on foot) |
| Shift | Nitro (driving) / sprint (on foot) |
| Space | Handbrake / confirm |
| C | Save |
| M | Mute |
| P / Esc | Pause |

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to `/output` and writes
`/output/dossier.json` with the kit's `vendor/makefun-game.ts`.

## Screenshots

The four shots in `screenshots/` are real renders of the game's own code:
the title over the living city, Rook driving to the docks, a night chase at
wanted 4 with a roadblock, and the story-complete screen.

## License

MIT — see `LICENSE`.

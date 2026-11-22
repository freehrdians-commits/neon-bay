// The city of Neon Bay: a 5x5 grid of blocks around a road network, built once from
// the seeded generator. Buildings, parks, neon signs, the docks and the plaza are all
// placed here; the world asks this module whether a point is road, sidewalk or solid,
// and where the mission spots are.

import { CITY, TAG_SPOTS, PICKUP_KINDS, SPOTS, blockCenter, roadCenter } from './config.js';
import { pick, range } from './random.js';

const SIGN_WORDS = [
  { text: 'NEON BAY', color: '#ff2d78' },
  { text: 'DELIA', color: '#22e6ff' },
  { text: '24H TACOS', color: '#ffd166' },
  { text: 'HOTEL LUMEN', color: '#b388ff' },
  { text: 'CHOP SHOP', color: '#39ff88' },
  { text: 'MARLOW & CO', color: '#ffb300' },
  { text: 'THE COMET', color: '#ff2d78' },
  { text: 'VICE DOCK', color: '#22e6ff' },
  { text: 'ROOK AUTO', color: '#39ff88' },
  { text: 'PALM MOTEL', color: '#ffd166' },
];

const BUILDING_COLORS = ['#1d2130', '#232840', '#1a2233', '#262b3d', '#201d33'];

/** Is point (x, y) on a road (within half a road width of a road centreline)? */
export function onRoad(x, y) {
  const half = CITY.road / 2;
  for (let i = 0; i < CITY.roads; i += 1) {
    const c = roadCenter(i);
    if (Math.abs(x - c) <= half || Math.abs(y - c) <= half) return true;
  }
  return false;
}

/** Is point (x, y) on a sidewalk ring (just inside a block's edge)? */
export function onSidewalk(x, y) {
  if (onRoad(x, y)) return false;
  for (let c = 0; c < 5; c += 1) {
    for (let r = 0; r < 5; r += 1) {
      const x0 = c * CITY.pitch + CITY.road / 2;
      const y0 = r * CITY.pitch + CITY.road / 2;
      const x1 = x0 + CITY.block;
      const y1 = y0 + CITY.block;
      if (x >= x0 - 2 && x <= x1 + 2 && y >= y0 - 2 && y <= y1 + 2) {
        const inner = 14;
        if (x < x0 + inner || x > x1 - inner || y < y0 + inner || y > y1 - inner) return true;
        return false;
      }
    }
  }
  return false;
}

export function createCity(random) {
  const buildings = [];
  const signs = [];
  const parks = [];

  // One or two buildings per block, with a gap between them; the plaza and docks
  // blocks stay open so missions have room to play out.
  for (let c = 0; c < 5; c += 1) {
    for (let r = 0; r < 5; r += 1) {
      const x0 = c * CITY.pitch + CITY.road / 2;
      const y0 = r * CITY.pitch + CITY.road / 2;
      if (c === 2 && r === 2) {
        parks.push({ x: x0, y: y0, w: CITY.block, h: CITY.block, kind: 'plaza' });
        continue;
      }
      if (c === 4 && r === 2) {
        parks.push({ x: x0, y: y0, w: CITY.block, h: CITY.block, kind: 'docks' });
        continue;
      }
      // The mission lots stay open pavement, so the garage, the Comet's lot, the
      // chop shop and the market are never inside a building.
      if ((c === 0 && r === 4) || (c === 1 && r === 0) || (c === 4 && r === 0) || (c === 2 && r === 3)) {
        const labels = { '0,4': 'GARAGE', '1,0': 'PARKING', '4,0': 'CHOP SHOP', '2,3': 'MARKET' };
        parks.push({ x: x0, y: y0, w: CITY.block, h: CITY.block, kind: 'lot', label: labels[`${c},${r}`] });
        continue;
      }
      if (random() < 0.18) {
        parks.push({ x: x0, y: y0, w: CITY.block, h: CITY.block, kind: 'park' });
        continue;
      }
      const split = random() < 0.55;
      const spots = split
        ? [
            { x: x0 + 8, y: y0 + 8, w: CITY.block / 2 - 12, h: CITY.block - 16 },
            { x: x0 + CITY.block / 2 + 4, y: y0 + 8, w: CITY.block / 2 - 12, h: CITY.block - 16 },
          ]
        : [{ x: x0 + 10, y: y0 + 10, w: CITY.block - 20, h: CITY.block - 20 }];
      for (const s of spots) {
        const windows = [];
        const cols = Math.max(2, Math.floor(s.w / 26));
        const rows = Math.max(2, Math.floor(s.h / 26));
        for (let wx = 0; wx < cols; wx += 1) {
          for (let wy = 0; wy < rows; wy += 1) {
            windows.push({
              x: s.x + 8 + wx * ((s.w - 16) / cols),
              y: s.y + 8 + wy * ((s.h - 16) / rows),
              lit: random() < 0.45,
            });
          }
        }
        buildings.push({
          x: s.x,
          y: s.y,
          w: s.w,
          h: s.h,
          color: pick(random, BUILDING_COLORS),
          height: 1 + Math.floor(random() * 3),
          windows,
        });
      }
      if (random() < 0.6) {
        const sign = pick(random, SIGN_WORDS);
        signs.push({
          x: x0 + range(random, 20, CITY.block - 20),
          y: y0 + (random() < 0.5 ? 4 : CITY.block - 16),
          text: sign.text,
          color: sign.color,
        });
      }
    }
  }

  // Parked cars wait along the road edges, where the player can reach them.
  const parked = [];
  const garageCar = {
    x: SPOTS.garage.x - 24,
    y: SPOTS.garage.y + 38,
    angle: 0,
    color: '#29b6f6',
    kind: 'parked',
  };
  parked.push(garageCar);
  for (let i = 0; i < 5; i += 1) {
    const road = Math.floor(random() * CITY.roads);
    const along = range(random, 80, CITY.size - 80);
    const side = random() < 0.5 ? -1 : 1;
    const horizontal = random() < 0.5;
    parked.push({
      x: horizontal ? along : roadCenter(road) + side * 20,
      y: horizontal ? roadCenter(road) + side * 20 : along,
      angle: horizontal ? 0 : Math.PI / 2,
      color: pick(random, ['#c62828', '#1565c0', '#f9a825', '#6a1b9a', '#00897b', '#e0e0e0']),
      kind: 'parked',
    });
  }

  // The Comet waits at the north lot for mission 2.
  const comet = {
    x: SPOTS.cometLot.x,
    y: SPOTS.cometLot.y,
    angle: Math.PI / 2,
    color: '#ff2d78',
    kind: 'comet',
  };

  const tags = TAG_SPOTS.map((spot) => ({ x: spot.x, y: spot.y, taken: false }));

  // Pickups sit on the roads, where a car or a walker can reach them.
  const pickupSpots = [
    { x: roadCenter(1), y: roadCenter(3) + 40 },
    { x: roadCenter(3), y: roadCenter(1) - 40 },
    { x: roadCenter(2) + 40, y: roadCenter(4) },
    { x: roadCenter(4), y: roadCenter(2) + 40 },
    { x: roadCenter(0) + 40, y: roadCenter(2) },
    { x: roadCenter(5) - 40, y: roadCenter(3) },
  ];
  const pickups = pickupSpots.map((spot, i) => ({
    x: spot.x,
    y: spot.y,
    kind: PICKUP_KINDS[i % PICKUP_KINDS.length].kind,
    active: true,
    timer: 0,
  }));

  return {
    buildings,
    signs,
    parks,
    parked,
    comet,
    tags,
    pickups,
    spots: SPOTS,
    /** Push a circle (x, y, radius) out of every building it overlaps. */
    collide(x, y, radius) {
      let px = x;
      let py = y;
      for (const b of buildings) {
        const cx = Math.max(b.x, Math.min(px, b.x + b.w));
        const cy = Math.max(b.y, Math.min(py, b.y + b.h));
        const dx = px - cx;
        const dy = py - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < radius * radius) {
          if (d2 < 0.001) {
            py = b.y - radius;
          } else {
            const d = Math.sqrt(d2);
            px = cx + (dx / d) * radius;
            py = cy + (dy / d) * radius;
          }
        }
      }
      return { x: px, y: py };
    },
    /** Is point (x, y) inside any building (with a small margin)? */
    insideBuilding(x, y, margin = 0) {
      for (const b of buildings) {
        if (x > b.x - margin && x < b.x + b.w + margin && y > b.y - margin && y < b.y + b.h + margin) return true;
      }
      return false;
    },
  };
}

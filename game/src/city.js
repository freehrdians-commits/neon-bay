// Neon Bay's map: a 5x5 grid of blocks split by roads, a beach on the west
// edge and a port on the north-east, built once from a seed. Buildings are
// solid rectangles; the road graph (intersection centres) is what cars and
// the autopilot steer along.

import { BLOCK, PALETTE, PITCH, PLACES, ROAD, ROAD_CENTRES, WORLD } from './config.js';
import { createRng } from './rng.js';

const NEON_SIGNS = [PALETTE.neonPink, PALETTE.neonCyan, PALETTE.neonYellow, PALETTE.neonGreen, PALETTE.neonPurple];
const BUILDING_FACES = ['#2b3a55', '#3a2b4d', '#274b3a', '#4d3a2b', '#333a4d', '#41304a'];
const BUILDING_NAMES = [
  'Vane Tower', 'The Marlin', 'Hotel Lumen', 'Casa Neon', 'Bay Arcade', 'The Rusty Anchor',
  'Club Delia', 'Pier 9', 'Sunset Mall', 'The Foundry', 'Coral Court', 'Neon Plaza',
  'The Lantern', 'Harbor View', 'Studio 88', 'The Drift', 'Palm Court', 'The Vault',
];

export function isOnRoad(x, y) {
  for (let i = 0; i < 6; i += 1) {
    const start = i * PITCH;
    if (x >= start && x < start + ROAD) return true;
    if (y >= start && y < start + ROAD) return true;
  }
  return false;
}

/** The centre of the road band nearest to a point (snaps a point onto the road). */
export function nearestRoadCentre(v) {
  let best = ROAD_CENTRES[0];
  for (let i = 1; i < ROAD_CENTRES.length; i += 1) {
    if (Math.abs(ROAD_CENTRES[i] - v) < Math.abs(best - v)) best = ROAD_CENTRES[i];
  }
  return best;
}

/** Build the city from a seed. Returns buildings, tag spots and fixed places. */
export function buildCity(seed) {
  const rng = createRng(seed * 7919 + 13);
  const buildings = [];
  let nameIndex = 0;
  for (let bx = 0; bx < 5; bx += 1) {
    for (let by = 0; by < 5; by += 1) {
      const x0 = ROAD + bx * PITCH + 14;
      const y0 = ROAD + by * PITCH + 14;
      const w0 = BLOCK - 28;
      const h0 = BLOCK - 28;
      // The south-west block is the beach; the north-east block is the port.
      if (bx === 0 && by === 4) continue;
      if (bx === 4 && by === 0) continue;
      const count = rng.int(1, 3);
      if (count === 1) {
        buildings.push(makeBuilding(rng, x0 + 20, y0 + 20, w0 - 40, h0 - 40, nameIndex++));
      } else if (count === 2) {
        const vertical = rng.chance(0.5);
        if (vertical) {
          buildings.push(makeBuilding(rng, x0 + 10, y0 + 10, w0 / 2 - 14, h0 - 20, nameIndex++));
          buildings.push(makeBuilding(rng, x0 + w0 / 2 + 4, y0 + 10, w0 / 2 - 14, h0 - 20, nameIndex++));
        } else {
          buildings.push(makeBuilding(rng, x0 + 10, y0 + 10, w0 - 20, h0 / 2 - 14, nameIndex++));
          buildings.push(makeBuilding(rng, x0 + 10, y0 + h0 / 2 + 4, w0 - 20, h0 / 2 - 14, nameIndex++));
        }
      } else {
        buildings.push(makeBuilding(rng, x0 + 8, y0 + 8, w0 / 2 - 12, h0 / 2 - 12, nameIndex++));
        buildings.push(makeBuilding(rng, x0 + w0 / 2 + 4, y0 + 8, w0 / 2 - 12, h0 / 2 - 12, nameIndex++));
        buildings.push(makeBuilding(rng, x0 + w0 / 4, y0 + h0 / 2 + 4, w0 / 2, h0 / 2 - 12, nameIndex++));
      }
    }
  }

  // Eight tag spots: one wall each on eight spread-out buildings, the spot
  // standing on the sidewalk just outside the wall that faces a road.
  const tagSpots = [];
  const spread = rng.shuffle(buildings.slice());
  for (const b of spread) {
    if (tagSpots.length >= 8) break;
    const side = rng.pick(['n', 's', 'e', 'w']);
    let x;
    let y;
    if (side === 'n') { x = b.x + b.w / 2; y = b.y - 16; }
    else if (side === 's') { x = b.x + b.w / 2; y = b.y + b.h + 16; }
    else if (side === 'e') { x = b.x + b.w + 16; y = b.y + b.h / 2; }
    else { x = b.x - 16; y = b.y + b.h / 2; }
    if (x < 20 || y < 20 || x > WORLD - 20 || y > WORLD - 20) continue;
    if (pointInAnyBuilding(x, y, buildings)) continue;
    tagSpots.push({ x, y, done: false, color: rng.pick(NEON_SIGNS) });
  }

  return {
    buildings,
    tagSpots,
    beach: { x: ROAD, y: ROAD + 4 * PITCH, w: BLOCK, h: BLOCK },
    port: { x: ROAD + 4 * PITCH, y: ROAD, w: BLOCK, h: BLOCK },
    places: PLACES,
  };
}

function makeBuilding(rng, x, y, w, h, nameIndex) {
  return {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(w),
    h: Math.round(h),
    face: rng.pick(BUILDING_FACES),
    neon: rng.pick(NEON_SIGNS),
    name: BUILDING_NAMES[nameIndex % BUILDING_NAMES.length],
    lit: rng.chance(0.75),
  };
}

export function pointInAnyBuilding(x, y, buildings) {
  for (let i = 0; i < buildings.length; i += 1) {
    const b = buildings[i];
    if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
  }
  return false;
}

/**
 * Push a circle (x, y, r) out of every building it overlaps. Returns the
 * corrected position; the caller keeps its own velocity handling.
 */
export function collideBuildings(x, y, r, buildings) {
  let px = x;
  let py = y;
  for (let i = 0; i < buildings.length; i += 1) {
    const b = buildings[i];
    const cx = Math.max(b.x, Math.min(px, b.x + b.w));
    const cy = Math.max(b.y, Math.min(py, b.y + b.h));
    const dx = px - cx;
    const dy = py - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      px = cx + (dx / d) * r;
      py = cy + (dy / d) * r;
    } else {
      // Centre inside the building: push out along the smallest penetration.
      const left = px - b.x;
      const right = b.x + b.w - px;
      const top = py - b.y;
      const bottom = b.y + b.h - py;
      const m = Math.min(left, right, top, bottom);
      if (m === left) px = b.x - r;
      else if (m === right) px = b.x + b.w + r;
      else if (m === top) py = b.y - r;
      else py = b.y + b.h + r;
    }
  }
  px = Math.max(r, Math.min(WORLD - r, px));
  py = Math.max(r, Math.min(WORLD - r, py));
  return { x: px, y: py };
}

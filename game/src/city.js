// Neon Bay's map: a fixed 40x30 tile city, drawn from one layout so every mission spot,
// tag and road loop is a named place. Roads run in a grid; the blocks between them hold
// buildings (with a sidewalk ring), two parks, the docks pier and the warehouses by the water.
// Nothing here is random: the same seed always builds the same city.

import { COLS, ROWS, TILE, WORLD } from './config.js';

/** Tile columns that are road (two tiles wide each). */
const ROAD_COLS = [0, 8, 16, 24, 32];
/** Tile rows that are road (two tiles wide each). */
const ROAD_ROWS = [0, 8, 16, 24];
/** The water's first tile row (the south edge). */
const WATER_ROW = 28;

/** Block columns in tiles: [first, last] of each block column. */
const BLOCK_COLS = [[2, 7], [10, 15], [18, 23], [26, 31], [34, 39]];
/** Block rows in tiles: [first, last] of each block row. */
const BLOCK_ROWS = [[2, 7], [10, 15], [18, 23], [26, 27]];

/** Blocks that are parks (walkable grass, no building): [col, row]. */
const PARKS = [[2, 1], [0, 2]];
/** The docks pier: tile columns 2..9 of the bottom block row. */
const DOCK_COLS = [2, 9];

function inRanges(value, ranges) {
  for (const [a, b] of ranges) if (value >= a && value <= b) return true;
  return false;
}

function blockAt(tx, ty) {
  let col = -1;
  let row = -1;
  for (let i = 0; i < BLOCK_COLS.length; i++) if (tx >= BLOCK_COLS[i][0] && tx <= BLOCK_COLS[i][1]) col = i;
  for (let i = 0; i < BLOCK_ROWS.length; i++) if (ty >= BLOCK_ROWS[i][0] && ty <= BLOCK_ROWS[i][1]) row = i;
  if (col < 0 || row < 0) return null;
  return { col, row };
}

function isParkBlock(col, row) {
  return PARKS.some(([c, r]) => c === col && r === row);
}

/** What kind of ground a tile is: road, sidewalk, building, park, dock or water. */
export function tileAt(tx, ty) {
  if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return 'water';
  if (ty >= WATER_ROW) return 'water';
  const roadCol = ROAD_COLS.some((c) => tx === c || tx === c + 1);
  const roadRow = ROAD_ROWS.some((r) => ty === r || ty === r + 1);
  if (roadCol || roadRow) return 'road';
  const block = blockAt(tx, ty);
  if (block === null) return 'walk';
  if (block.row === 3 && tx >= DOCK_COLS[0] && tx <= DOCK_COLS[1]) return 'dock';
  if (isParkBlock(block.col, block.row)) return 'park';
  const [c0, c1] = BLOCK_COLS[block.col];
  const [r0, r1] = BLOCK_ROWS[block.row];
  // The block's outer ring is sidewalk; the inside is the building's footprint.
  if (tx === c0 || tx === c1 || ty === r0 || ty === r1) return 'walk';
  return 'block';
}

export function tileAtPx(x, y) {
  return tileAt(Math.floor(x / TILE), Math.floor(y / TILE));
}

/** Whether a circle's centre tile can be walked on foot. */
export function isWalkable(x, y) {
  const t = tileAtPx(x, y);
  return t === 'road' || t === 'walk' || t === 'park' || t === 'dock';
}

/** Whether a car may drive here (roads only). */
export function isDrivable(x, y) {
  return tileAtPx(x, y) === 'road';
}

/** The buildings: one rect per block that is not a park or the docks. */
function buildBuildings() {
  const list = [];
  const roofColors = ['#33334a', '#3a3040', '#2c3a44', '#40384a', '#343a30'];
  for (let col = 0; col < BLOCK_COLS.length; col++) {
    for (let row = 0; row < BLOCK_ROWS.length; row++) {
      if (isParkBlock(col, row)) continue;
      if (row === 3 && col === 0) continue; // the docks pier takes the bottom-left block
      const [c0, c1] = BLOCK_COLS[col];
      const [r0, r1] = BLOCK_ROWS[row];
      const inset = row === 3 ? 0 : TILE;
      list.push({
        x: c0 * TILE + inset,
        y: r0 * TILE + inset,
        width: (c1 - c0 + 1) * TILE - inset * 2,
        height: (r1 - r0 + 1) * TILE - inset * 2,
        color: roofColors[(col * 3 + row) % roofColors.length],
        block: [col, row],
        sign: null,
      });
    }
  }
  // Neon signs on five facades, each on its building's south face.
  const signSpots = [
    { block: [0, 0], text: 'NEON', color: '#ff2e88' },
    { block: [2, 0], text: 'BAY', color: '#22d3ee' },
    { block: [4, 0], text: '24H', color: '#f5c542' },
    { block: [1, 2], text: 'DINE', color: '#4ade80' },
    { block: [4, 1], text: 'HOTEL', color: '#ff2e88' },
  ];
  for (const spot of signSpots) {
    const building = list.find((b) => b.block[0] === spot.block[0] && b.block[1] === spot.block[1]);
    if (building) building.sign = { text: spot.text, color: spot.color };
  }
  return list;
}

export const BUILDINGS = buildBuildings();

/** The water as one rect (the south strip), for collision and drawing. */
export const WATER_RECT = { x: 0, y: WATER_ROW * TILE, width: WORLD.width, height: (ROWS - WATER_ROW) * TILE };

/** Every solid rect a circle can hit: buildings plus the water. */
export const SOLIDS = [...BUILDINGS.map((b) => ({ x: b.x, y: b.y, width: b.width, height: b.height })), WATER_RECT];

/** Push a circle out of every solid rect it overlaps; returns the corrected position. */
export function collideCircle(x, y, radius) {
  let px = x;
  let py = y;
  for (const solid of SOLIDS) {
    const nearestX = Math.max(solid.x, Math.min(px, solid.x + solid.width));
    const nearestY = Math.max(solid.y, Math.min(py, solid.y + solid.height));
    const dx = px - nearestX;
    const dy = py - nearestY;
    const distSq = dx * dx + dy * dy;
    if (distSq >= radius * radius) continue;
    if (distSq === 0) {
      // Centre inside the rect: push out along the shortest side.
      const left = px - solid.x;
      const right = solid.x + solid.width - px;
      const top = py - solid.y;
      const bottom = solid.y + solid.height - py;
      const min = Math.min(left, right, top, bottom);
      if (min === left) px = solid.x - radius;
      else if (min === right) px = solid.x + solid.width + radius;
      else if (min === top) py = solid.y - radius;
      else py = solid.y + solid.height + radius;
      continue;
    }
    const dist = Math.sqrt(distSq);
    const push = (radius - dist) / dist;
    px += dx * push;
    py += dy * push;
  }
  return { x: Math.max(radius, Math.min(WORLD.width - radius, px)), y: Math.max(radius, Math.min(WORLD.height - radius, py)) };
}

/** Whether the straight line between two points crosses a building or the water. */
export function lineBlocked(x1, y1, x2, y2) {
  const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 24);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    for (const solid of SOLIDS) {
      if (x >= solid.x && x <= solid.x + solid.width && y >= solid.y && y <= solid.y + solid.height) return true;
    }
  }
  return false;
}

/** The named places missions and spawns use, in pixels. */
export const PLACES = {
  // Delia's garage: block (0,0), door on its south face.
  garage: { x: 5 * TILE, y: 8 * TILE + 10 },
  garageDoor: { x: 5 * TILE, y: 8 * TILE },
  // The docks pier end, where the package and the ledger are delivered.
  docks: { x: 6 * TILE, y: 27 * TILE },
  docksDoor: { x: 6 * TILE, y: 26 * TILE },
  // The gold Comet, parked at the hotel valet (block (4,1), west face).
  comet: { x: 34 * TILE - 44, y: 13 * TILE },
  // The chop shop: block (4,2), door on its north face.
  chopShop: { x: 37 * TILE, y: 18 * TILE - 10 },
  chopShopDoor: { x: 37 * TILE, y: 18 * TILE },
  // Rook's Lookout: the north-east corner of block (2,0).
  lookout: { x: 24 * TILE, y: 2 * TILE },
  // The turf-war park: block (2,1), its centre.
  park: { x: 21 * TILE, y: 13 * TILE },
  // Where the player starts: on the road in front of the garage.
  spawn: { x: 5 * TILE, y: 9 * TILE + 20 },
};

/** Marlow's walking loop: the road rectangle around block (1,0). */
export const COURIER_LOOP = [
  { x: 9 * TILE, y: 1 * TILE + TILE / 2 },
  { x: 17 * TILE, y: 1 * TILE + TILE / 2 },
  { x: 17 * TILE, y: 9 * TILE },
  { x: 9 * TILE, y: 9 * TILE },
];

/** The eight neon tags, on sidewalk corners across the city. */
export const TAG_SPOTS = [
  { x: 2 * TILE + 32, y: 2 * TILE + 32 },
  { x: 18 * TILE + 32, y: 2 * TILE + 32 },
  { x: 34 * TILE + 32, y: 2 * TILE + 32 },
  { x: 2 * TILE + 32, y: 10 * TILE + 32 },
  { x: 18 * TILE + 32, y: 18 * TILE + 32 },
  { x: 34 * TILE + 32, y: 10 * TILE + 32 },
  { x: 10 * TILE + 32, y: 18 * TILE + 32 },
  { x: 26 * TILE + 32, y: 26 * TILE + 32 },
];

/** Health, ammo and cash pickups, on sidewalk corners. */
export const PICKUP_SPOTS = [
  { x: 2 * TILE + 32, y: 8 * TILE + 32 },
  { x: 18 * TILE + 32, y: 8 * TILE + 32 },
  { x: 34 * TILE + 32, y: 18 * TILE + 32 },
  { x: 10 * TILE + 32, y: 2 * TILE + 32 },
  { x: 26 * TILE + 32, y: 10 * TILE + 32 },
  { x: 34 * TILE + 32, y: 26 * TILE + 32 },
];

/** Rectangular traffic loops around blocks, on road centrelines. */
function loopAround(col, row) {
  const [c0, c1] = BLOCK_COLS[col];
  const [r0, r1] = BLOCK_ROWS[row];
  const west = (c0 - 1) * TILE + TILE / 2;
  const east = (c1 + 1) * TILE + TILE / 2;
  const north = (r0 - 1) * TILE + TILE / 2;
  const south = (r1 + 1) * TILE + TILE / 2;
  return [
    { x: west, y: north },
    { x: east, y: north },
    { x: east, y: south },
    { x: west, y: south },
  ];
}

export const TRAFFIC_LOOPS = [
  loopAround(0, 0),
  loopAround(2, 0),
  loopAround(4, 0),
  loopAround(1, 1),
  loopAround(3, 1),
  loopAround(0, 2),
  loopAround(2, 2),
  loopAround(4, 2),
];

/** Road centrelines: vertical roads run at these x, horizontal at these y. */
export const ROAD_X = ROAD_COLS.map((c) => c * TILE + TILE);
export const ROAD_Y = ROAD_ROWS.map((r) => r * TILE + TILE);

/** Snap a point to the nearest road centreline point (same row or column). */
export function snapToRoad(x, y) {
  let bestX = ROAD_X[0];
  for (const rx of ROAD_X) if (Math.abs(rx - x) < Math.abs(bestX - x)) bestX = rx;
  let bestY = ROAD_Y[0];
  for (const ry of ROAD_Y) if (Math.abs(ry - y) < Math.abs(bestY - y)) bestY = ry;
  return { x: bestX, y: bestY };
}

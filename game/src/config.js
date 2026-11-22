// Neon Bay — every tuning number and colour in one place.
// The city is a 5x5 grid of blocks separated by roads; the renderer shows a 1280x720
// window onto it, so no rule below depends on the screen size.

export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** City geometry: blocks of 200 px, roads of 64 px, pitch 264 px, 6 roads a side. */
export const CITY = {
  block: 200,
  road: 64,
  pitch: 264,
  roads: 6,
  size: 1384, // 5 * 264 + 64
};

/** Centre of road i (0..5) on either axis. */
export function roadCenter(i) {
  return i * CITY.pitch;
}

/** Centre of block (col, row) on one axis. */
export function blockCenter(i) {
  return i * CITY.pitch + CITY.road / 2 + CITY.block / 2;
}

export const PLAYER = {
  radius: 10,
  walk: 175,
  sprint: 265,
  health: 100,
  punchDamage: 34,
  punchRange: 34,
  punchArc: 1.1,
  punchCooldown: 0.45,
};

export const CAR = {
  length: 46,
  width: 22,
  accel: 430,
  brake: 620,
  maxSpeed: 345,
  maxReverse: 150,
  steer: 2.7,
  drag: 0.55,
  grip: 8.5,
  health: 100,
  nitroMult: 1.3,
  nitroDrain: 34,
  nitroRefill: 9,
  nitroMax: 100,
};

export const COMET = {
  length: 46,
  width: 21,
  accel: 540,
  maxSpeed: 415,
  maxReverse: 150,
  color: '#ff2d78',
  name: 'The Comet',
};

export const POLICE = {
  length: 46,
  width: 22,
  accel: 490,
  maxSpeed: 368,
  maxReverse: 150,
  ramDamage: 5,
  ramInterval: 1.5,
};

export const TRAFFIC = { minSpeed: 115, maxSpeed: 185, count: 10 };
export const PEDS = { count: 14 };

export const WANTED = {
  max: 5,
  decayDay: 20,
  decayNight: 30,
  stealCar: 1,
  punch: 1,
  hitPed: 2,
  bustTime: 1.2,
  bustFine: 150,
};

export const DAY_LENGTH = 240; // seconds per full day/night cycle
export const NIGHT_START = 0.68; // fraction of the cycle where night begins

export const MISSIONS = [
  {
    name: 'The Pickup',
    reward: 400,
    intro: 'Delia needs a package from the docks. Pick it up and bring it home.',
    pickupText: 'Grab the package at the docks',
    returnText: 'Deliver the package to the garage',
  },
  {
    name: 'The Comet',
    reward: 800,
    intro: 'A Comet is parked at the north lot. Steal it and bring it to the chop shop.',
    pickupText: 'Steal the Comet at the north lot',
    returnText: 'Deliver the Comet to the chop shop',
  },
  {
    name: 'Turf War',
    reward: 1200,
    intro: 'Four rivals hold the plaza. Take them all down, then report back.',
    pickupText: 'Defeat the 4 rivals at the plaza',
    returnText: 'Report back at the garage',
  },
  {
    name: 'The Ledger',
    reward: 2000,
    intro: 'Marlow the courier carries the ledger. Catch him on foot, grab it, run.',
    pickupText: 'Catch Marlow near the market — on foot',
    returnText: 'Deliver the ledger to the docks',
  },
];

/** The eight neon tag spots, at road crossings around the city — always reachable. */
export const TAG_SPOTS = [
  { x: 0, y: 0 },
  { x: 1320, y: 0 },
  { x: 0, y: 1320 },
  { x: 1320, y: 1320 },
  { x: 528, y: 264 },
  { x: 792, y: 1056 },
  { x: 264, y: 792 },
  { x: 1056, y: 528 },
];
export const TAG_REWARD = 25;
export const TAG_BONUS = 100;

/** Weighted pickup kinds; the weight is the chance a fresh spawn is that kind. */
export const PICKUP_KINDS = [
  { kind: 'cash', weight: 5, value: 50 },
  { kind: 'health', weight: 3, value: 30 },
  { kind: 'nitro', weight: 2, value: 100 },
  { kind: 'repair', weight: 2, value: 40 },
];
export const PICKUP_RESPAWN = 25;

export const SPOTS = {
  garage: { x: blockCenter(0), y: blockCenter(4) },
  docks: { x: 1330, y: blockCenter(2) },
  chopShop: { x: blockCenter(4), y: blockCenter(0) },
  plaza: { x: blockCenter(2), y: blockCenter(2) },
  market: { x: blockCenter(2), y: blockCenter(3) },
  cometLot: { x: blockCenter(1), y: blockCenter(0) },
};

export const PALETTE = {
  ground: '#14161d',
  road: '#23262f',
  roadEdge: '#31343f',
  lane: '#565b6b',
  sidewalk: '#2e313c',
  park: '#17301f',
  water: '#0e2a3a',
  building: '#1d2130',
  buildingEdge: '#3a3f55',
  windowLit: '#ffd166',
  windowDark: '#2c3040',
  player: '#4fc3f7',
  playerCar: '#29b6f6',
  traffic: '#9aa3b2',
  police: '#e8e8f0',
  policeLight: '#ff3b30',
  policeLight2: '#2979ff',
  rival: '#ff5252',
  courier: '#ffb300',
  tag: '#ff2d78',
  cash: '#7ee081',
  health: '#ff6b6b',
  nitro: '#4fc3f7',
  repair: '#ffd166',
  text: '#eef1f5',
  muted: '#8b93a3',
  gold: '#ffd166',
  neonPink: '#ff2d78',
  neonCyan: '#22e6ff',
  neonGreen: '#39ff88',
  neonPurple: '#b388ff',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save is kept between visits (this browser only). */
export const SAVE_KEY = 'neon-bay.save.v1';
export const BEST_KEY = 'neon-bay.best.v1';

// Every tuning number and colour in one place. Neon Bay is a fixed 2560x1920 city of 40x30
// tiles of 64px; the renderer follows the player with a camera, so no rule below depends on
// the screen size. Times are seconds, speeds are px/s, angles are radians.

export const TILE = 64;
export const COLS = 40;
export const ROWS = 30;
export const WORLD = { width: COLS * TILE, height: ROWS * TILE };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** One full day/night cycle, in seconds of play. */
export const DAY_LENGTH = 240;

export const PLAYER = {
  radius: 14,
  walkSpeed: 175,
  sneakSpeed: 92,
  health: 100,
  maxAmmo: 24,
  startAmmo: 12,
  shootInterval: 0.22,
  bulletDamage: 25,
  interactRange: 56,
};

export const CAR = {
  radius: 26,
  length: 54,
  width: 28,
  accel: 540,
  reverseAccel: 320,
  maxSpeed: 340,
  nitroMultiplier: 1.3,
  nitroDrain: 40,
  nitroRefill: 15,
  turnRate: 2.7,
  brake: 760,
  drag: 0.55,
  stealRange: 64,
};

export const POLICE = {
  accel: 500,
  baseSpeed: 300,
  speedPerWanted: 16,
  /** Police aim at the point this far ahead of the player's car, in seconds. */
  interceptLead: 0.6,
  ramDamage: 5,
  ramInterval: 1.5,
  bustWanted: 3,
};

export const TRAFFIC = { count: 10, minSpeed: 115, maxSpeed: 165 };
export const PEDS = { count: 14, minSpeed: 46, maxSpeed: 72 };

export const COURIER = {
  walkSpeed: 72,
  fleeSpeed: 152,
  /** Seconds Marlow stalls when the player steps out of a car near him. */
  stallTime: 3,
  /** How close the player must be on foot before Marlow hesitates instead of walking. */
  hesitateRange: 150,
  /** How close the player must be before Marlow runs. */
  fleeRange: 110,
  grabRange: 30,
};

export const RIVAL = {
  count: 4,
  radius: 14,
  health: 50,
  speed: 120,
  shootRange: 330,
  shootInterval: 1.25,
  bulletDamage: 8,
  bulletSpeed: 460,
};

export const BULLET = { speed: 720, range: 520, radius: 3 };

export const WANTED = {
  max: 5,
  decayDay: 20,
  decayNight: 42,
  stealInSight: 1,
  shotFired: 0,
  kill: 1,
  pedestrianKilled: 2,
  missionTheft: 1,
  ledgerGrab: 3,
};

export const TAGS = { count: 8, value: 25, allBonus: 100, collectRange: 42 };

export const PICKUPS = {
  health: { value: 30, weight: 40 },
  ammo: { value: 12, weight: 35 },
  cash: { value: 50, weight: 25 },
  respawn: 30,
};

/** Mission rewards, in dollars, in story order. */
export const MISSION_PAY = [400, 800, 1200, 2000];

export const PALETTE = {
  asphalt: '#262633',
  asphaltLine: '#3d3d52',
  sidewalk: '#3b3b4a',
  sidewalkEdge: '#2c2c3a',
  park: '#234d2e',
  parkDark: '#1b3d24',
  water: '#0e3a5c',
  waterDeep: '#0a2c48',
  dock: '#6b4f2e',
  dockEdge: '#543d22',
  building: '#2e2e42',
  buildingRoof: '#3a3a52',
  buildingEdge: '#1d1d2c',
  glass: '#67e8f9',
  neonPink: '#ff2e88',
  neonCyan: '#22d3ee',
  neonGold: '#f5c542',
  neonGreen: '#4ade80',
  text: '#eef1f5',
  muted: '#9aa1b5',
  hudPanel: 'rgba(12, 12, 22, 0.72)',
  wanted: '#f43f5e',
  police: '#3b82f6',
  policeLight: '#ef4444',
  player: '#f5c542',
  courier: '#111111',
  courierGold: '#d4af37',
  rival: '#c2410c',
  health: '#4ade80',
  ammo: '#f5c542',
  cash: '#22c55e',
  night: 'rgba(6, 8, 24, 0.55)',
  dusk: 'rgba(255, 120, 40, 0.16)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save is kept between visits (this browser only). */
export const SAVE_KEY = 'neon-bay.save.v1';

/** The neon signs painted on building facades, with the building they sit on. */
export const SIGNS = ['NEON', 'BAY', '24H', 'DINE', 'HOTEL'];

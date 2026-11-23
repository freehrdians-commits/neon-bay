// Neon Bay — shared constants, tuning and mission definitions.
// Everything the other modules need to agree on lives here, so a single
// change to a number retunes the whole game.

export const WORLD = 2000;
export const BLOCK = 280;
export const ROAD = 90;
export const PITCH = BLOCK + ROAD; // 370 — distance between road centres
export const ROAD_CENTRES = [45, 415, 785, 1155, 1525, 1895];
export const STEP = 1 / 60;

export const PALETTE = {
  grass: '#0d2b1d',
  sidewalk: '#232a33',
  road: '#171c24',
  roadLine: '#c9a227',
  buildingEdge: '#10151d',
  water: '#0a2e4d',
  sand: '#c2a878',
  neonPink: '#ff2e88',
  neonCyan: '#19e3ff',
  neonYellow: '#ffd319',
  neonGreen: '#39ff6a',
  neonPurple: '#b967ff',
  hudBg: 'rgba(8, 12, 20, 0.72)',
  hudText: '#eef4ff',
  hudDim: '#9fb0c8',
};

export const TUNING = {
  footSpeed: 175,
  punchRange: 34,
  punchCooldown: 0.45,
  carAccel: 430,
  carBrake: 640,
  carReverseMax: 170,
  carMaxSpeed: 520,
  nitroMaxSpeed: 780,
  nitroDrain: 42,
  nitroRefill: 9,
  carTurn: 2.7,
  carRadius: 17,
  playerRadius: 10,
  pedSpeed: 55,
  policeMaxSpeed: 480,
  bustFill: 0.15, // per second, while stopped and a cop is close
  bustDrain: 0.5,
  wantedDecayDelay: 25,
  wantedDecayEvery: 10,
  roadblockMinSpeed: 300, // ramming a roadblock faster than this breaks it
  tagChannel: 1.2,
  grabChannel: 1.0,
  courierTime: 150,
  saveKey: 'neonbay-v4-save',
};

export const PLACES = {
  spawn: { x: 1000, y: 1895 },
  club: { x: 1000, y: 1155 },
  safehouse: { x: 300, y: 1895 },
  compound: { x: 1750, y: 415 },
  packages: [
    { x: 300, y: 415 },
    { x: 1700, y: 785 },
    { x: 500, y: 1525 },
  ],
};

export const MISSIONS = [
  {
    id: 1,
    name: 'First Gear',
    giver: 'Delia Vane',
    brief: 'Rook needs wheels. Steal any car and drive it to Delia\u2019s Club.',
    reward: 250,
    hint: 'Walk up to a car and press E to take it. Then follow the pink marker.',
  },
  {
    id: 2,
    name: 'Neon Run',
    giver: 'Delia Vane',
    brief: 'Courier run: deliver 3 packages across Neon Bay before the timer runs out.',
    reward: 400,
    timeLimit: TUNING.courierTime,
    hint: 'Drive into each glowing marker. Nitro (Shift) burns fast — save it for the long straights.',
  },
  {
    id: 3,
    name: 'Tag the Town',
    giver: 'Rook',
    brief: 'Spray 8 neon tags on the marked walls. The cops hate fresh paint.',
    reward: 350,
    hint: 'Stand by a glowing tag spot and hold E. Your first tag draws the law.',
  },
  {
    id: 4,
    name: 'The Ledger',
    giver: 'Delia Vane',
    brief: 'Steal the ledger from the guarded compound, then lose the heat and reach the safehouse.',
    reward: 800,
    hint: 'Grab the ledger (E), then run. Roadblocks break only above 300 — hit them fast.',
  },
];

export const STORY = {
  intro:
    'Neon Bay, 9pm. Rook is broke, fast, and out of options. Delia Vane runs the night from her club — and she has work for a driver who asks no questions.',
  outro:
    'The ledger is safe, the heat is off, and Rook is no longer broke. Neon Bay belongs to whoever drives it best — tonight, that is you.',
};

export const DAY_LENGTH = 240; // seconds of play per full day/night cycle
export const START_HOUR = 18; // dusk, so the neon pops on the title screen

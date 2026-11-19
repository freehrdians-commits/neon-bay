// The city of Neon Bay: a 5x5 grid of blocks between six roads each way.
// Roads sit on a 272 px pitch with a 72 px asphalt band; the block between two
// roads is 200 px wide. Everything the game places — the garage, the docks,
// the chop shop, the plaza and the park — is a point on or beside a road, so a
// car can always drive to it and a pedestrian can always walk to it.

export const CITY_W = 1432;
export const CITY_H = 1432;
export const ROAD_PITCH = 272;
export const ROAD_WIDTH = 72;
export const BLOCK = 200;

// Centre line of road i (0..5) on either axis.
export function roadCenter(i) {
  return i * ROAD_PITCH + ROAD_WIDTH / 2;
}

export function nearestRoadIndex(v) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i <= 5; i++) {
    const d = Math.abs(v - roadCenter(i));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

// Waypoints along road centrelines from (x, y) to (tx, ty), then the target
// itself: the same router the driving tests and the police use.
export function routeWaypoints(x, y, tx, ty) {
  const points = [];
  let ci = nearestRoadIndex(x);
  let cj = nearestRoadIndex(y);
  points.push({ x: roadCenter(ci), y: roadCenter(cj) });
  const ti = nearestRoadIndex(tx);
  const tj = nearestRoadIndex(ty);
  let guard = 0;
  while ((ci !== ti || cj !== tj) && guard++ < 24) {
    if (Math.abs(ti - ci) >= Math.abs(tj - cj)) ci += Math.sign(ti - ci);
    else cj += Math.sign(tj - cj);
    points.push({ x: roadCenter(ci), y: roadCenter(cj) });
  }
  points.push({ x: tx, y: ty });
  return points;
}

export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

// The named places of the story. Markers sit on a road or on open ground so
// no building ever stands between the player and an objective.
export const MARKERS = {
  garage: { x: 172, y: 1386, label: "Delia's Garage" },
  docks: { x: 1260, y: 1260, label: 'Neon Docks' },
  chopshop: { x: 1124, y: 1260, label: 'Chop Shop' },
  plaza: { x: 716, y: 716, label: 'Crescent Plaza' },
  park: { x: 988, y: 444, label: 'Palm Park' },
};

// Build the blocks: every block gets one or two buildings, inset from the
// block edge so the pavement around them stays open for walking and for cars
// cutting a corner. Special blocks stay open on purpose: the plaza is a
// square, the park is trees, the docks are containers, the garage block holds
// only Delia's small workshop on its eastern side.
export function buildCity(rng) {
  const buildings = [];
  const trees = [];
  const crates = [];
  const palette = ['#c98f5f', '#8fa8bf', '#b7a06a', '#9fb08a', '#b98a8a', '#7d9bb5', '#c2a878'];

  for (let bi = 0; bi < 5; bi++) {
    for (let bj = 0; bj < 5; bj++) {
      const bx = ROAD_WIDTH + bi * ROAD_PITCH;
      const by = ROAD_WIDTH + bj * ROAD_PITCH;
      if (bi === 2 && bj === 2) continue; // plaza
      if (bi === 3 && bj === 1) {
        // park: trees only, no buildings
        for (let t = 0; t < 14; t++) {
          trees.push({
            x: bx + 25 + rng() * 150,
            y: by + 25 + rng() * 150,
            r: 9 + rng() * 7,
          });
        }
        continue;
      }
      if (bi === 4 && bj === 4) {
        // docks: stacked containers, kept to the far corner away from the marker
        for (let c = 0; c < 8; c++) {
          crates.push({
            x: bx + 110 + (c % 4) * 22,
            y: by + 20 + Math.floor(c / 4) * 26,
            w: 18,
            h: 22,
            color: ['#b8542e', '#3e6e8e', '#7a8a3e', '#8e5a7a'][c % 4],
          });
        }
        continue;
      }
      if (bi === 0 && bj === 4) {
        // garage block: Delia's workshop on the east side, west strip clear
        buildings.push({
          x: bx + 118, y: by + 80, w: 76, h: 100,
          color: '#8fa8bf', roof: '#5d7488', label: 'GARAGE',
        });
        continue;
      }
      const count = rng() < 0.55 ? 1 : 2;
      for (let k = 0; k < count; k++) {
        const w = 60 + rng() * 50;
        const h = 60 + rng() * 50;
        const x = bx + 45 + rng() * Math.max(1, BLOCK - 90 - w);
        const y = by + 45 + rng() * Math.max(1, BLOCK - 90 - h);
        buildings.push({
          x, y, w, h,
          color: palette[Math.floor(rng() * palette.length)],
          roof: '#00000022',
          label: '',
        });
      }
    }
  }
  return { buildings, trees, crates };
}

// Is point (x, y) inside a road band (either axis)?
export function onRoad(x, y) {
  for (let i = 0; i <= 5; i++) {
    const c = roadCenter(i);
    if (Math.abs(x - c) <= ROAD_WIDTH / 2) return true;
    if (Math.abs(y - c) <= ROAD_WIDTH / 2) return true;
  }
  return false;
}

// Push a circle of radius r out of every building it overlaps. Returns true
// when a push happened. The caller decides what to do with the velocity.
export function collideBuildings(x, y, r, buildings) {
  let pushed = false;
  for (const b of buildings) {
    const cx = clamp(x, b.x, b.x + b.w);
    const cy = clamp(y, b.y, b.y + b.h);
    const dx = x - cx;
    const dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    pushed = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      const push = (r - d) / d;
      x += dx * push;
      y += dy * push;
    } else {
      // Centre inside the building: push out along the smallest overlap.
      const left = x - b.x;
      const right = b.x + b.w - x;
      const top = y - b.y;
      const bottom = b.y + b.h - y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) x = b.x - r;
      else if (m === right) x = b.x + b.w + r;
      else if (m === top) y = b.y - r;
      else y = b.y + b.h + r;
    }
  }
  return { x, y, pushed };
}

export function pointInBuildings(x, y, buildings) {
  for (const b of buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  return false;
}

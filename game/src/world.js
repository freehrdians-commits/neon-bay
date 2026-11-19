// The simulation of Neon Bay: the player on foot and in cars, traffic,
// pedestrians, rivals, police, bullets, pickups and the wanted level. No
// drawing and no DOM here — the renderer reads this state, and main.js feeds
// it input. Two rules from the first build are baked in from the start:
// traffic keeps right-hand lanes and only ever yields to a car ahead in its
// own lane and direction (no head-on deadlocks), and the wanted level always
// decays so the police always leave.
import {
  CITY_W, CITY_H, ROAD_WIDTH, MARKERS, buildCity, roadCenter,
  nearestRoadIndex, routeWaypoints, angleDiff, dist, clamp,
  collideBuildings,
} from './city.js';
import { makeRng, range, pick, shuffle } from './rng.js';
import { MISSIONS, objectiveFor as missionObjective } from './missions.js';

export const WALK_SPEED = 150;
export const PUNCH_RANGE = 60;
export const PUNCH_DAMAGE = 25;
export const BULLET_SPEED = 760;
export const BULLET_DAMAGE = 34;
export const RIVAL_HP = 75;
export const RIVAL_SPEED = 95;
export const INTERACT_RADIUS = 75;
export const ENTER_RADIUS = 55;
export const WANTED_DECAY_SECONDS = 12;

const CAR_COLORS = ['#c94f3d', '#3d7dc9', '#d8b13a', '#7a9a4d', '#8a5fc0', '#c9c9c9', '#3a3a3a', '#d97b2e'];
const PED_COLORS = ['#e8b04b', '#7fb3d5', '#c98bb0', '#8bc98f', '#d5d5d5', '#b08a5a'];
const LANE = 13; // right-hand lane offset from the road centre line

function laneOffset(axis, dir) {
  // Right-hand traffic: facing south the right side is west (-x); facing
  // north it is east (+x); facing east it is south (+y); facing west, north.
  if (axis === 'v') return dir > 0 ? -LANE : LANE;
  return dir > 0 ? LANE : -LANE;
}

function angleFor(axis, dir) {
  if (axis === 'v') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? 0 : Math.PI;
}

export function createWorld(seed, saveData) {
  const rng = makeRng(seed);
  const city = buildCity(rng);
  const state = {
    rng,
    city,
    seed,
    time: 0,
    timeOfDay: 0.32,
    cash: 0,
    missionIndex: 0,
    missionStage: 0,
    missionsDone: 0,
    wanted: 0,
    wantedTimer: 0,
    lastHeat: -100,
    screen: 'title',
    dialog: null,
    gameOver: null,
    toasts: [],
    player: {
      x: MARKERS.garage.x, y: MARKERS.garage.y, angle: -Math.PI / 2,
      health: 100, ammo: 12, inCar: false, car: null, speed: 0,
      punchCd: 0, shootCd: 0, invuln: 0, moving: false,
    },
    cars: [],
    peds: [],
    rivals: [],
    policeFoot: [],
    bullets: [],
    pickups: [],
    particles: [],
    stats: { shotsFired: 0, carsStolen: 0, rivalsDown: 0 },
    _policeRouteTimer: 0,
  };

  spawnTraffic(state);
  spawnParked(state);
  spawnWalkers(state);
  spawnPickups(state);

  if (saveData) applySave(state, saveData);
  return state;
}

function applySave(state, data) {
  state.cash = data.cash || 0;
  state.missionIndex = data.missionIndex || 0;
  state.missionStage = data.missionStage || 0;
  state.missionsDone = data.missionsDone || 0;
  state.player.x = data.x ?? MARKERS.garage.x;
  state.player.y = data.y ?? MARKERS.garage.y;
  state.player.health = data.health ?? 100;
  state.player.ammo = data.ammo ?? 12;
  state.wanted = data.wanted || 0;
  state.timeOfDay = data.timeOfDay ?? 0.32;
  if (state.missionIndex >= 1) ensureGoldCar(state);
  if (state.missionIndex >= 2) ensureRivals(state);
}

// ---------------------------------------------------------------------------
// Spawning
// ---------------------------------------------------------------------------

let carId = 1;

function makeCar(state, opts) {
  const car = {
    id: carId++,
    x: opts.x, y: opts.y,
    angle: opts.angle ?? 0,
    speed: 0,
    maxSpeed: opts.maxSpeed ?? 330,
    accel: opts.accel ?? 320,
    brake: 620,
    reverseMax: 130,
    turn: opts.turn ?? 3.0,
    kind: opts.kind || 'traffic', // traffic | parked | police | player
    driver: opts.driver || 'npc', // npc | none | police | player
    color: opts.color || pick(state.rng, CAR_COLORS),
    gold: !!opts.gold,
    axis: opts.axis || 'h',
    road: opts.road ?? 0,
    dir: opts.dir ?? 1,
    targetSpeed: opts.targetSpeed ?? 0,
    ramCd: 0,
    route: null,
    routeTimer: 0,
    routeIndex: 0,
  };
  state.cars.push(car);
  return car;
}

function randomRoadSpot(state) {
  const axis = pick(state.rng, ['v', 'h']);
  const road = Math.floor(state.rng() * 6);
  const along = 100 + state.rng() * (CITY_W - 200);
  if (axis === 'v') return { x: roadCenter(road), y: along, axis, road };
  return { x: along, y: roadCenter(road), axis, road };
}

function spawnTraffic(state) {
  for (let i = 0; i < 26; i++) {
    const spot = randomRoadSpot(state);
    const dir = pick(state.rng, [-1, 1]);
    const car = makeCar(state, {
      x: spot.axis === 'v' ? roadCenter(spot.road) + laneOffset('v', dir) : spot.x,
      y: spot.axis === 'h' ? roadCenter(spot.road) + laneOffset('h', dir) : spot.y,
      angle: angleFor(spot.axis, dir),
      kind: 'traffic', driver: 'npc',
      axis: spot.axis, road: spot.road, dir,
      maxSpeed: 65 + state.rng() * 22,
      targetSpeed: 65 + state.rng() * 22,
    });
    car.speed = car.targetSpeed;
  }
}

function farFromMarkers(x, y) {
  for (const key of Object.keys(MARKERS)) {
    if (dist(x, y, MARKERS[key].x, MARKERS[key].y) < 110) return false;
  }
  return true;
}

function spawnParked(state) {
  let placed = 0;
  let guard = 0;
  while (placed < 10 && guard++ < 200) {
    const axis = pick(state.rng, ['v', 'h']);
    const road = Math.floor(state.rng() * 6);
    const along = 120 + state.rng() * (CITY_W - 240);
    const side = pick(state.rng, [-1, 1]);
    const off = side * (ROAD_WIDTH / 2 - 8);
    const x = axis === 'v' ? roadCenter(road) + off : along;
    const y = axis === 'h' ? roadCenter(road) + off : along;
    if (!farFromMarkers(x, y)) continue;
    if (state.cars.some((c) => dist(c.x, c.y, x, y) < 90)) continue;
    makeCar(state, {
      x, y,
      angle: axis === 'v' ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI),
      kind: 'parked', driver: 'none', axis, road, dir: side,
    });
    placed++;
  }
}

// The pavement beside a road: on the outer roads only the inward side
// exists — the other side would be outside the city.
function sidewalkSide(state, road) {
  if (road === 0) return 1;
  if (road === 5) return -1;
  return pick(state.rng, [-1, 1]);
}

function spawnWalkers(state) {
  for (let i = 0; i < 22; i++) {
    const axis = pick(state.rng, ['v', 'h']);
    const road = Math.floor(state.rng() * 6);
    const along = 60 + state.rng() * (CITY_W - 120);
    const side = sidewalkSide(state, road);
    const off = side * (ROAD_WIDTH / 2 + 9);
    state.peds.push({
      x: axis === 'v' ? roadCenter(road) + off : along,
      y: axis === 'h' ? roadCenter(road) + off : along,
      angle: pick(state.rng, [0, Math.PI / 2, Math.PI, -Math.PI / 2]),
      speed: 40 + state.rng() * 16,
      color: pick(state.rng, PED_COLORS),
      axis, road, dir: pick(state.rng, [-1, 1]),
      wander: 0,
    });
  }
}

function spawnPickups(state) {
  const kinds = ['health', 'ammo', 'cash', 'health', 'ammo', 'cash'];
  for (const kind of kinds) {
    state.pickups.push({ ...randomSidewalkSpot(state), kind, timer: 0 });
  }
}

function randomSidewalkSpot(state) {
  const axis = pick(state.rng, ['v', 'h']);
  const road = Math.floor(state.rng() * 6);
  const along = 90 + state.rng() * (CITY_W - 180);
  const side = sidewalkSide(state, road);
  const off = side * (ROAD_WIDTH / 2 + 10);
  return {
    x: axis === 'v' ? roadCenter(road) + off : along,
    y: axis === 'h' ? roadCenter(road) + off : along,
  };
}

export function ensureGoldCar(state) {
  if (state.cars.some((c) => c.gold)) return;
  makeCar(state, {
    x: 980, y: MARKERS.park.y + 162,
    angle: 0, kind: 'parked', driver: 'none',
    color: '#e8c33a', gold: true, maxSpeed: 380, axis: 'h', road: 2, dir: 1,
  });
}

export function ensureRivals(state) {
  if (state.rivals.length > 0) return;
  const spots = [
    { x: MARKERS.plaza.x - 45, y: MARKERS.plaza.y - 45 },
    { x: MARKERS.plaza.x + 45, y: MARKERS.plaza.y - 45 },
    { x: MARKERS.plaza.x - 45, y: MARKERS.plaza.y + 45 },
    { x: MARKERS.plaza.x + 45, y: MARKERS.plaza.y + 45 },
  ];
  for (const s of spots) {
    state.rivals.push({
      x: s.x, y: s.y, angle: 0, hp: RIVAL_HP, down: false,
      shootCd: 1 + state.rng(), speed: RIVAL_SPEED, wander: state.rng() * 6,
      homeX: s.x, homeY: s.y,
    });
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function objectiveFor(state) {
  return missionObjective(state.missionIndex, state.missionStage, state);
}

export function rivalsLeft(state) {
  return state.rivals.filter((r) => !r.down).length;
}

export function policeCarCount(state) {
  return state.cars.filter((c) => c.kind === 'police').length;
}

export function nightFactor(state) {
  const t = state.timeOfDay;
  // Night roughly from 0.55 to 0.97 of the day, with soft edges.
  const rise = clamp((t - 0.55) / 0.08, 0, 1);
  const fall = 1 - clamp((t - 0.93) / 0.05, 0, 1);
  return Math.max(0, Math.min(1, rise * fall));
}

export function addToast(state, text) {
  state.toasts.push({ text, life: 2.6 });
  if (state.toasts.length > 3) state.toasts.shift();
}

export function raiseWanted(state, amount) {
  if (state.missionIndex === 2) return; // the plaza turf war is off the books
  state.wanted = Math.min(5, state.wanted + amount);
  state.lastHeat = state.time;
  state.wantedTimer = 0;
}

export function clearWanted(state) {
  state.wanted = 0;
  state.wantedTimer = 0;
  state.cars = state.cars.filter((c) => c.kind !== 'police');
  state.policeFoot = [];
}

// ---------------------------------------------------------------------------
// Player actions
// ---------------------------------------------------------------------------

export function interact(state) {
  const p = state.player;
  if (p.inCar) {
    exitCar(state);
    return;
  }
  // 1. The current objective marker first — a car parked beside it must
  // never swallow the interaction.
  const obj = objectiveFor(state);
  if (obj && obj.action && dist(p.x, p.y, obj.x, obj.y) < INTERACT_RADIUS) {
    if (obj.action === 'pickup') {
      state.missionStage = 1;
      addToast(state, 'Package collected — take it to the garage');
    } else {
      completeMission(state);
    }
    return;
  }
  // 2. The nearest car within reach.
  let best = null;
  let bestD = ENTER_RADIUS;
  for (const car of state.cars) {
    if (car.kind === 'police' || car.driver === 'player') continue;
    if (car.kind === 'traffic' && Math.abs(car.speed) > 60) continue;
    const d = dist(p.x, p.y, car.x, car.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  if (best) enterCar(state, best);
}

function enterCar(state, car) {
  const p = state.player;
  if (car.driver === 'npc') {
    // The driver bails out and runs off on foot.
    state.peds.push({
      x: car.x, y: car.y, angle: car.angle, speed: 130,
      color: '#d5d5d5', axis: 'h', road: 0, dir: 1, wander: 3, fleeing: true,
    });
  }
  if (car.gold && state.missionIndex === 1 && state.missionStage === 0) {
    state.missionStage = 1;
    state.wanted = Math.max(state.wanted, 2);
    state.lastHeat = state.time;
    state.wantedTimer = 0;
    addToast(state, 'Stolen! Wanted level 2 — lose the cops and reach the Chop Shop');
  }
  car.driver = 'player';
  car.kind = 'player';
  p.inCar = true;
  p.car = car;
  p.angle = car.angle;
  p.speed = car.speed;
  state.stats.carsStolen += 1;
}

function exitCar(state) {
  const p = state.player;
  const car = p.car;
  if (!car) {
    p.inCar = false;
    return;
  }
  car.driver = 'none';
  car.kind = car.gold ? 'parked' : 'parked';
  car.speed = 0;
  // Step out to the car's left side, clear of its doors.
  const side = -Math.PI / 2;
  p.x = car.x + Math.cos(car.angle + side) * 26;
  p.y = car.y + Math.sin(car.angle + side) * 26;
  p.x = clamp(p.x, 10, CITY_W - 10);
  p.y = clamp(p.y, 10, CITY_H - 10);
  p.angle = car.angle;
  p.inCar = false;
  p.car = null;
  p.speed = 0;
}

export function punch(state) {
  const p = state.player;
  if (p.inCar || p.punchCd > 0) return false;
  p.punchCd = 0.45;
  let hit = false;
  for (const r of state.rivals) {
    if (r.down) continue;
    const d = dist(p.x, p.y, r.x, r.y);
    if (d < PUNCH_RANGE) {
      hit = true;
      damageRival(state, r, PUNCH_DAMAGE, p.x, p.y);
    }
  }
  return hit;
}

export function shoot(state, worldX, worldY) {
  const p = state.player;
  if (p.inCar || p.shootCd > 0 || p.ammo <= 0) return false;
  p.shootCd = 0.25;
  p.ammo -= 1;
  state.stats.shotsFired += 1;
  const dx = worldX - p.x;
  const dy = worldY - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const spread = (state.rng() - 0.5) * 0.03;
  const a = Math.atan2(dy, dx) + spread;
  state.bullets.push({
    x: p.x + Math.cos(a) * 20, y: p.y + Math.sin(a) * 20,
    vx: Math.cos(a) * BULLET_SPEED, vy: Math.sin(a) * BULLET_SPEED,
    from: 'player', dmg: BULLET_DAMAGE, life: 0.8,
  });
  p.angle = a;
  spawnParticles(state, p.x + Math.cos(a) * 24, p.y + Math.sin(a) * 24, 4, '#ffd76a', 120);
  raiseWanted(state, 1);
  return true;
}

function damageRival(state, rival, dmg, fromX, fromY) {
  rival.hp -= dmg;
  const d = Math.max(1, dist(fromX, fromY, rival.x, rival.y));
  rival.x += ((rival.x - fromX) / d) * 14;
  rival.y += ((rival.y - fromY) / d) * 14;
  spawnParticles(state, rival.x, rival.y, 6, '#ff5a4d', 140);
  if (rival.hp <= 0 && !rival.down) {
    rival.down = true;
    state.stats.rivalsDown += 1;
    state.cash += 50;
    addToast(state, 'Rival down — $50');
    if (rivalsLeft(state) === 0 && state.missionIndex === 2 && state.missionStage === 0) {
      state.missionStage = 1;
      addToast(state, 'Plaza clear — get back to the garage');
    }
  }
}

function spawnParticles(state, x, y, n, color, speed) {
  for (let i = 0; i < n; i++) {
    const a = state.rng() * Math.PI * 2;
    const s = speed * (0.4 + state.rng() * 0.6);
    state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + state.rng() * 0.3, color });
  }
  if (state.particles.length > 240) state.particles.splice(0, state.particles.length - 240);
}

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------

export function completeMission(state) {
  const m = MISSIONS[state.missionIndex];
  if (!m) return;
  state.cash += m.reward;
  state.missionsDone += 1;
  clearWanted(state);
  if (state.missionIndex >= 2) {
    state.gameOver = 'complete';
    state.screen = 'complete';
    return;
  }
  state.missionIndex += 1;
  state.missionStage = 0;
  const next = MISSIONS[state.missionIndex];
  if (state.missionIndex === 1) ensureGoldCar(state);
  if (state.missionIndex === 2) ensureRivals(state);
  state.dialog = {
    title: next.title,
    speaker: next.speaker,
    lines: next.briefing,
  };
}

// ---------------------------------------------------------------------------
// The step
// ---------------------------------------------------------------------------

export function stepWorld(state, input, dt) {
  state.time += dt;
  state.timeOfDay = (state.timeOfDay + dt / 300) % 1;
  for (const t of state.toasts) t.life -= dt;
  state.toasts = state.toasts.filter((t) => t.life > 0);
  const p = state.player;
  if (p.punchCd > 0) p.punchCd -= dt;
  if (p.shootCd > 0) p.shootCd -= dt;
  if (p.invuln > 0) p.invuln -= dt;

  stepPlayer(state, input, dt);
  stepTraffic(state, dt);
  stepWalkers(state, dt);
  stepRivals(state, dt);
  stepPolice(state, dt);
  stepBullets(state, dt);
  stepPickups(state, dt);
  stepParticles(state, dt);
  stepWanted(state, dt);

  if (p.health <= 0 && !state.gameOver) {
    state.gameOver = 'busted';
    state.screen = 'gameover';
  }
}

function stepPlayer(state, input, dt) {
  const p = state.player;
  if (p.inCar && p.car) {
    const car = p.car;
    const throttle = input.down('KeyW', 'ArrowUp') ? 1 : input.down('KeyS', 'ArrowDown') ? -1 : 0;
    const steer = input.down('KeyD', 'ArrowRight') ? 1 : input.down('KeyA', 'ArrowLeft') ? -1 : 0;
    stepCarPhysics(state, car, throttle, steer, dt);
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    p.speed = car.speed;
    p.moving = Math.abs(car.speed) > 10;
    return;
  }
  let dx = 0;
  let dy = 0;
  if (input.down('KeyW', 'ArrowUp')) dy -= 1;
  if (input.down('KeyS', 'ArrowDown')) dy += 1;
  if (input.down('KeyA', 'ArrowLeft')) dx -= 1;
  if (input.down('KeyD', 'ArrowRight')) dx += 1;
  p.moving = dx !== 0 || dy !== 0;
  if (p.moving) {
    const len = Math.hypot(dx, dy);
    const nx = clamp(p.x + (dx / len) * WALK_SPEED * dt, 12, CITY_W - 12);
    const ny = clamp(p.y + (dy / len) * WALK_SPEED * dt, 12, CITY_H - 12);
    const res = collideBuildings(nx, ny, 12, state.city.buildings);
    p.x = res.x;
    p.y = res.y;
    p.angle = Math.atan2(dy, dx);
  }
  p.speed = 0;
}

function stepCarPhysics(state, car, throttle, steer, dt) {
  if (throttle > 0) {
    car.speed += car.accel * dt;
  } else if (throttle < 0) {
    if (car.speed > 5) car.speed -= car.brake * dt;
    else car.speed -= car.accel * 0.5 * dt;
  } else {
    const drag = 130 * dt;
    if (Math.abs(car.speed) <= drag) car.speed = 0;
    else car.speed -= Math.sign(car.speed) * drag;
  }
  // A car that is steering hard cannot hold top speed: the speed cap in a
  // turn keeps the turning circle tight enough to stay on the road instead
  // of swinging wide into a block and wedging against a building.
  if (steer !== 0 && car.speed > car.maxSpeed * 0.5) {
    car.speed = Math.max(car.maxSpeed * 0.5, car.speed - 500 * dt);
  }
  car.speed = clamp(car.speed, -car.reverseMax, car.maxSpeed);
  const grip = clamp(Math.abs(car.speed) / 120, 0.3, 1);
  car.angle += steer * car.turn * grip * Math.sign(car.speed || 1) * dt;
  const nx = clamp(car.x + Math.cos(car.angle) * car.speed * dt, 16, CITY_W - 16);
  const ny = clamp(car.y + Math.sin(car.angle) * car.speed * dt, 16, CITY_H - 16);
  const res = collideBuildings(nx, ny, 15, state.city.buildings);
  if (res.pushed) car.speed *= 0.55; // scrape the wall, keep sliding along it
  car.x = res.x;
  car.y = res.y;
}

// ---------------------------------------------------------------------------
// Traffic: right-hand lanes, yield only to a car ahead in the same lane and
// direction, snap to the lane at every turn. Head-on deadlocks cannot form
// because opposing flows never share a lane.
// ---------------------------------------------------------------------------

function stepTraffic(state, dt) {
  const cars = state.cars;
  for (const car of cars) {
    if (car.kind !== 'traffic') continue;
    // Yield to a car ahead in the same lane and direction — and nothing else.
    let blocked = false;
    for (const other of cars) {
      if (other === car) continue;
      if (other.axis !== car.axis || other.road !== car.road || other.dir !== car.dir) continue;
      const ahead = car.axis === 'v'
        ? (other.y - car.y) * car.dir
        : (other.x - car.x) * car.dir;
      const side = car.axis === 'v' ? Math.abs(other.x - car.x) : Math.abs(other.y - car.y);
      if (ahead > 0 && ahead < 70 && side < 26) {
        blocked = true;
        break;
      }
    }
    const target = blocked ? 0 : car.targetSpeed;
    car.speed += clamp(target - car.speed, -260 * dt, 160 * dt);
    const prevX = car.x;
    const prevY = car.y;
    if (car.axis === 'v') car.y += car.dir * car.speed * dt;
    else car.x += car.dir * car.speed * dt;
    car.x = clamp(car.x, 16, CITY_W - 16);
    car.y = clamp(car.y, 16, CITY_H - 16);
    maybeTurnTraffic(state, car, prevX, prevY);
    // Safety net: a car shoved past the last intersection by a collision
    // would otherwise sit at the city's edge forever, and the cars behind
    // it would queue up into a jam. Force it onto the edge road.
    if (car.axis === 'v' && car.dir > 0 && car.y > roadCenter(5)) forceEdgeTurn(state, car, 'h', 5);
    else if (car.axis === 'v' && car.dir < 0 && car.y < roadCenter(0)) forceEdgeTurn(state, car, 'h', 0);
    else if (car.axis === 'h' && car.dir > 0 && car.x > roadCenter(5)) forceEdgeTurn(state, car, 'v', 5);
    else if (car.axis === 'h' && car.dir < 0 && car.x < roadCenter(0)) forceEdgeTurn(state, car, 'v', 0);
  }
  separateCars(state);
}

function forceEdgeTurn(state, car, newAxis, edgeRoad) {
  const newDir = pick(state.rng, [-1, 1]);
  if (newAxis === 'h') {
    car.y = roadCenter(edgeRoad) + laneOffset('h', newDir);
  } else {
    car.x = roadCenter(edgeRoad) + laneOffset('v', newDir);
  }
  car.axis = newAxis;
  car.road = edgeRoad;
  car.dir = newDir;
  car.angle = angleFor(newAxis, newDir);
}

function maybeTurnTraffic(state, car, prevX, prevY) {
  // Did the car cross a road centre on the perpendicular axis?
  for (let j = 0; j <= 5; j++) {
    const c = roadCenter(j);
    const crossed = car.axis === 'v'
      ? (prevY - c) * (car.y - c) <= 0 && Math.abs(car.y - c) < 46
      : (prevX - c) * (car.x - c) <= 0 && Math.abs(car.x - c) < 46;
    if (!crossed) continue;
    const atEdge = (car.axis === 'v' && (j === 0 || j === 5)) || (car.axis === 'h' && (j === 0 || j === 5));
    const mustTurn = atEdge && (
      (car.axis === 'v' && ((car.dir > 0 && j === 5) || (car.dir < 0 && j === 0))) ||
      (car.axis === 'h' && ((car.dir > 0 && j === 5) || (car.dir < 0 && j === 0)))
    );
    if (!mustTurn && state.rng() > 0.3) continue;
    if (mustTurn && state.rng() < 0.5) {
      // U-turn at the edge of the city, snapping to the new direction's lane
      // so the car never drives head-on down its old lane.
      car.dir *= -1;
      car.angle = angleFor(car.axis, car.dir);
      if (car.axis === 'v') car.x = roadCenter(car.road) + laneOffset('v', car.dir);
      else car.y = roadCenter(car.road) + laneOffset('h', car.dir);
      return;
    }
    // Turn onto the cross road, snapping to its right-hand lane. The car
    // crossed road j on the perpendicular axis, so the new road is j and the
    // coordinate along the old axis stays where it is.
    const newAxis = car.axis === 'v' ? 'h' : 'v';
    const newDir = pick(state.rng, [-1, 1]);
    if (newAxis === 'h') car.y = c + laneOffset('h', newDir);
    else car.x = c + laneOffset('v', newDir);
    car.axis = newAxis;
    car.road = j;
    car.dir = newDir;
    car.angle = angleFor(newAxis, newDir);
    return;
  }
}

function separateCars(state) {
  const cars = state.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = 32;
      if (d >= min || d < 0.01) continue;
      const push = (min - d) / d;
      const px = dx * push;
      const py = dy * push;
      const aIsPlayer = a.kind === 'player';
      const bIsPlayer = b.kind === 'player';
      if (aIsPlayer && !bIsPlayer) {
        // Never damp the player's car: shove the other car clear instead.
        b.x += px;
        b.y += py;
      } else if (bIsPlayer && !aIsPlayer) {
        a.x -= px;
        a.y -= py;
      } else if (!aIsPlayer && !bIsPlayer) {
        a.x -= px / 2;
        a.y -= py / 2;
        b.x += px / 2;
        b.y += py / 2;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Pedestrians, rivals, police
// ---------------------------------------------------------------------------

function stepWalkers(state, dt) {
  for (const ped of state.peds) {
    if (ped.fleeing) {
      ped.x = clamp(ped.x + Math.cos(ped.angle) * ped.speed * dt, 12, CITY_W - 12);
      ped.y = clamp(ped.y + Math.sin(ped.angle) * ped.speed * dt, 12, CITY_H - 12);
      ped.wander -= dt;
      if (ped.wander <= 0) ped.fleeing = false;
      continue;
    }
    const along = ped.axis === 'v' ? ped.y : ped.x;
    const next = along + ped.dir * ped.speed * dt;
    // At an intersection, sometimes turn onto the cross road. The crossed
    // road j becomes the ped's new road; the coordinate along the old axis
    // stays where it is, and the new lane sits beside the new road.
    let turned = false;
    for (let j = 0; j <= 5; j++) {
      const c = roadCenter(j);
      if ((along - c) * (next - c) <= 0 && Math.abs(next - c) < 30 && state.rng() < 0.25) {
        const newAxis = ped.axis === 'v' ? 'h' : 'v';
        const newDir = pick(state.rng, [-1, 1]);
        const side = sidewalkSide(state, j);
        if (newAxis === 'h') ped.y = c + side * (ROAD_WIDTH / 2 + 9);
        else ped.x = c + side * (ROAD_WIDTH / 2 + 9);
        ped.axis = newAxis;
        ped.road = j;
        ped.dir = newDir;
        ped.angle = angleFor(newAxis, newDir);
        turned = true;
        break;
      }
    }
    if (turned) continue;
    if (next < 40 || next > CITY_W - 40) {
      ped.dir *= -1;
      ped.angle = angleFor(ped.axis, ped.dir);
      continue;
    }
    if (ped.axis === 'v') ped.y = next;
    else ped.x = next;
    ped.x = clamp(ped.x, 12, CITY_W - 12);
    ped.y = clamp(ped.y, 12, CITY_H - 12);
  }
}

function stepRivals(state, dt) {
  const p = state.player;
  // The Vipers hold the plaza: they only fight while the player is on their
  // turf. Once the player leaves the area they fall back to the plaza
  // instead of chasing across the city — a chase that never ends is how a
  // stuck car gets shot to pieces.
  const playerOnTurf = dist(p.x, p.y, MARKERS.plaza.x, MARKERS.plaza.y) < 280;
  for (const r of state.rivals) {
    if (r.down) continue;
    if (r.shootCd > 0) r.shootCd -= dt;
    const d = dist(r.x, r.y, p.x, p.y);
    if (d < 460 && playerOnTurf) {
      const a = Math.atan2(p.y - r.y, p.x - r.x);
      r.angle = a;
      if (d > 90) {
        r.x += Math.cos(a) * r.speed * dt;
        r.y += Math.sin(a) * r.speed * dt;
      }
      if (d < 330 && r.shootCd <= 0) {
        r.shootCd = 1.4;
        const aim = a + (state.rng() - 0.5) * 0.44;
        state.bullets.push({
          x: r.x + Math.cos(aim) * 18, y: r.y + Math.sin(aim) * 18,
          vx: Math.cos(aim) * 500, vy: Math.sin(aim) * 500,
          from: 'rival', dmg: 4, life: 1.1,
        });
      }
    } else {
      // Fall back to the plaza and wait there.
      const hd = dist(r.x, r.y, r.homeX, r.homeY);
      if (hd > 24) {
        const a = Math.atan2(r.homeY - r.y, r.homeX - r.x);
        r.angle = a;
        r.x += Math.cos(a) * r.speed * 0.6 * dt;
        r.y += Math.sin(a) * r.speed * 0.6 * dt;
      } else {
        r.wander -= dt;
        if (r.wander <= 0) {
          r.wander = 1.5 + state.rng() * 2;
          r.angle = state.rng() * Math.PI * 2;
        }
        r.x += Math.cos(r.angle) * 18 * dt;
        r.y += Math.sin(r.angle) * 18 * dt;
        r.x = clamp(r.x, MARKERS.plaza.x - 90, MARKERS.plaza.x + 90);
        r.y = clamp(r.y, MARKERS.plaza.y - 90, MARKERS.plaza.y + 90);
      }
    }
  }
}

function stepPolice(state, dt) {
  const p = state.player;
  const wantCars = state.wanted === 0 ? 0 : Math.min(state.wanted, 3);
  const wantFoot = state.wanted >= 3 ? Math.min(state.wanted - 2, 2) : 0;

  // Spawn police cars on a nearby road when the heat rises.
  let have = policeCarCount(state);
  while (have < wantCars) {
    const spot = nearestRoadSpotNear(state, p.x, p.y, 320);
    makeCar(state, {
      x: spot.x, y: spot.y, angle: 0,
      kind: 'police', driver: 'police', color: '#1c2733',
      maxSpeed: 300, accel: 380, turn: 3.0,
    });
    have++;
  }
  // Excess police leave the moment the heat drops.
  if (have > wantCars) {
    const cops = state.cars.filter((c) => c.kind === 'police');
    cops.sort((a, b) => dist(b.x, b.y, p.x, p.y) - dist(a.x, a.y, p.x, p.y));
    for (let i = wantCars; i < cops.length; i++) {
      state.cars.splice(state.cars.indexOf(cops[i]), 1);
    }
  }
  while (state.policeFoot.length < wantFoot) {
    const a = state.rng() * Math.PI * 2;
    state.policeFoot.push({
      x: clamp(p.x + Math.cos(a) * 260, 20, CITY_W - 20),
      y: clamp(p.y + Math.sin(a) * 260, 20, CITY_H - 20),
      angle: 0, speed: 125, hitCd: 0,
    });
  }
  if (state.policeFoot.length > wantFoot) {
    state.policeFoot.length = wantFoot;
  }

  // Police cars drive the roads toward the player, then ram up close.
  for (const cop of state.cars.filter((c) => c.kind === 'police')) {
    if (cop.ramCd > 0) cop.ramCd -= dt;
    const d = dist(cop.x, cop.y, p.x, p.y);
    let target;
    if (d < 70) {
      target = { x: p.x, y: p.y };
    } else {
      cop.routeTimer -= dt;
      if (!cop.route || cop.routeTimer <= 0 || cop.routeIndex >= cop.route.length) {
        cop.route = routeWaypoints(cop.x, cop.y, p.x, p.y);
        cop.routeIndex = 0;
        cop.routeTimer = 0.8;
      }
      target = cop.route[cop.routeIndex] || { x: p.x, y: p.y };
      if (dist(cop.x, cop.y, target.x, target.y) < 40) cop.routeIndex += 1;
    }
    const desired = Math.atan2(target.y - cop.y, target.x - cop.x);
    const diff = angleDiff(cop.angle, desired);
    const steer = diff > 0.15 ? 1 : diff < -0.15 ? -1 : 0;
    const throttle = d < 46 ? -1 : Math.abs(diff) < 1.1 ? 1 : 0;
    stepCarPhysics(state, cop, throttle, steer, dt);
    // Ram the player on contact.
    if (d < 36 && cop.ramCd <= 0 && p.invuln <= 0) {
      cop.ramCd = 1.5;
      p.invuln = 1.2;
      p.health -= p.inCar ? 3 : 4;
      if (p.inCar && p.car) {
        p.car.x += Math.cos(cop.angle) * 14;
        p.car.y += Math.sin(cop.angle) * 14;
      }
      spawnParticles(state, p.x, p.y, 8, '#ff5a4d', 160);
    }
  }
  // Foot police chase on foot and hit up close.
  for (const cop of state.policeFoot) {
    if (cop.hitCd > 0) cop.hitCd -= dt;
    const d = dist(cop.x, cop.y, p.x, p.y);
    const a = Math.atan2(p.y - cop.y, p.x - cop.x);
    cop.angle = a;
    if (d > 26) {
      cop.x += Math.cos(a) * cop.speed * dt;
      cop.y += Math.sin(a) * cop.speed * dt;
    } else if (cop.hitCd <= 0 && p.invuln <= 0) {
      cop.hitCd = 1.5;
      p.invuln = 1.0;
      p.health -= 5;
      spawnParticles(state, p.x, p.y, 6, '#ff5a4d', 140);
    }
  }
}

function nearestRoadSpotNear(state, x, y, minDist) {
  // A road intersection at least minDist away from (x, y), nearest such.
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i <= 5; i++) {
    for (let j = 0; j <= 5; j++) {
      const cx = roadCenter(i);
      const cy = roadCenter(j);
      const d = dist(cx, cy, x, y);
      if (d >= minDist && d < bestD) {
        bestD = d;
        best = { x: cx, y: cy };
      }
    }
  }
  if (best) return best;
  return { x: roadCenter(0), y: roadCenter(0) };
}

// ---------------------------------------------------------------------------
// Bullets, pickups, particles, wanted
// ---------------------------------------------------------------------------

function stepBullets(state, dt) {
  const p = state.player;
  for (const b of state.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) continue;
    if (b.x < 0 || b.x > CITY_W || b.y < 0 || b.y > CITY_H) {
      b.life = 0;
      continue;
    }
    if (state.city.buildings.some((bd) => b.x >= bd.x && b.x <= bd.x + bd.w && b.y >= bd.y && b.y <= bd.y + bd.h)) {
      b.life = 0;
      spawnParticles(state, b.x, b.y, 3, '#c9c9c9', 90);
      continue;
    }
    if (b.from === 'player') {
      for (const r of state.rivals) {
        if (r.down) continue;
        if (dist(b.x, b.y, r.x, r.y) < 15) {
          b.life = 0;
          damageRival(state, r, b.dmg, p.x, p.y);
          break;
        }
      }
    } else if (b.from === 'rival') {
      const targetR = p.inCar ? 20 : 14;
      if (dist(b.x, b.y, p.x, p.y) < targetR && p.invuln <= 0) {
        b.life = 0;
        p.invuln = 0.6;
        // A moving car shrugs off most of a pistol round.
        p.health -= p.inCar ? 2 : b.dmg;
        spawnParticles(state, p.x, p.y, 5, '#ff5a4d', 120);
      }
    }
  }
  state.bullets = state.bullets.filter((b) => b.life > 0);
}

function stepPickups(state, dt) {
  const p = state.player;
  for (const pk of state.pickups) {
    if (pk.timer > 0) {
      pk.timer -= dt;
      if (pk.timer <= 0) {
        const spot = randomSidewalkSpot(state);
        pk.x = spot.x;
        pk.y = spot.y;
      }
      continue;
    }
    if (dist(p.x, p.y, pk.x, pk.y) < 32) {
      if (pk.kind === 'health') p.health = Math.min(100, p.health + 40);
      else if (pk.kind === 'ammo') p.ammo += 12;
      else state.cash += 50;
      pk.timer = 25;
      spawnParticles(state, pk.x, pk.y, 8, '#7be382', 120);
    }
  }
}

function stepParticles(state, dt) {
  for (const pt of state.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 1 - 2.4 * dt;
    pt.vy *= 1 - 2.4 * dt;
    pt.life -= dt;
  }
  state.particles = state.particles.filter((pt) => pt.life > 0);
}

function stepWanted(state, dt) {
  if (state.wanted <= 0) return;
  if (state.time - state.lastHeat < 6) {
    state.wantedTimer = 0;
    return;
  }
  state.wantedTimer += dt;
  if (state.wantedTimer >= WANTED_DECAY_SECONDS) {
    state.wanted -= 1;
    state.wantedTimer = 0;
    if (state.wanted === 0) clearWanted(state);
  }
}

// ---------------------------------------------------------------------------
// Snapshot for the tests (window.NB.snapshot)
// ---------------------------------------------------------------------------

export function snapshot(state) {
  const p = state.player;
  const obj = objectiveFor(state);
  return {
    screen: state.screen,
    dialog: state.dialog !== null,
    gameOver: state.gameOver,
    player: {
      x: Math.round(p.x), y: Math.round(p.y),
      angle: Math.round(p.angle * 100) / 100,
      health: Math.round(p.health),
      ammo: p.ammo,
      inCar: p.inCar,
      carSpeed: Math.round(Math.abs(p.inCar && p.car ? p.car.speed : 0)),
    },
    cars: state.cars.map((c) => ({
      x: Math.round(c.x), y: Math.round(c.y),
      angle: Math.round(c.angle * 100) / 100,
      driver: c.driver, gold: c.gold, police: c.kind === 'police',
    })),
    peds: state.peds.map((w) => ({ x: Math.round(w.x), y: Math.round(w.y), hostile: false, down: false }))
      .concat(state.rivals.map((r) => ({ x: Math.round(r.x), y: Math.round(r.y), hostile: true, down: r.down })))
      .concat(state.policeFoot.map((c) => ({ x: Math.round(c.x), y: Math.round(c.y), hostile: true, down: false, police: true }))),
    objective: obj ? { key: obj.key, x: obj.x, y: obj.y, label: obj.label } : null,
    missionIndex: state.missionIndex,
    missionStage: state.missionStage,
    missionsDone: state.missionsDone,
    cash: state.cash,
    wanted: state.wanted,
    policeCars: policeCarCount(state),
    rivalsLeft: rivalsLeft(state),
    timeOfDay: Math.round(state.timeOfDay * 100) / 100,
  };
}

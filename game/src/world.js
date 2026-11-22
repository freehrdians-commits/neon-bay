// The game's rules and state, with no drawing and no browser in it: the player on foot and in
// cars, traffic and pedestrians, police and roadblocks, the courier, the rivals, missions,
// wanted level, pickups, neon tags, combat and the day/night cycle. step() advances one fixed
// step and returns what happened as bit flags, so the caller can react (sounds, toasts) without
// the world knowing about screens or sound. All randomness comes from the seeded generator
// passed in, so the same seed always plays the same city.

import {
  BULLET, CAR, COURIER, DAY_LENGTH, PICKUPS, PLAYER, POLICE, RIVAL, STEP, TAGS, TRAFFIC, PEDS, WANTED, WORLD,
} from './config.js';
import {
  BUILDINGS, COURIER_LOOP, PICKUP_SPOTS, PLACES, SOLIDS, TAG_SPOTS, TRAFFIC_LOOPS, WATER_RECT,
  collideCircle, isWalkable, lineBlocked, tileAtPx,
} from './city.js';
import { missionAt, missionPay, stepAt } from './missions.js';
import { choice, gauss, intBetween, weightedPick } from './rng.js';

export const EVENT_MISSION = 1;
export const EVENT_TAG = 2;
export const EVENT_PICKUP = 4;
export const EVENT_SHOT = 8;
export const EVENT_HIT = 16;
export const EVENT_WASTED = 32;
export const EVENT_BUSTED = 64;
export const EVENT_STORY = 128;
export const EVENT_CASH = 256;

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;

const CAR_COLORS = ['#e5534b', '#3b82f6', '#f5c542', '#e5e7eb', '#14b8a6', '#a855f7', '#f97316', '#84cc16'];
const TWO_PI = Math.PI * 2;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

/** The shortest turn from angle `from` toward `to`, in (-PI, PI]. */
function angleDiff(from, to) {
  let d = (to - from) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d < -Math.PI) d += TWO_PI;
  return d;
}

function lerpAngle(from, to, t) {
  return from + angleDiff(from, to) * t;
}

export function createWorld(random) {
  const state = {
    time: 0,
    timeOfDay: 0.3,
    cash: 0,
    mission: 0,
    missionStep: 0,
    packageGot: false,
    inComet: false,
    rivalsLeft: RIVAL.count,
    rivalsSpawned: false,
    ledgerGot: false,
    wanted: 0,
    wantedTimer: 0,
    crimeTimer: 0,
    bustTimer: 0,
    tags: TAG_SPOTS.map((spot) => ({ x: spot.x, y: spot.y, got: false })),
    tagsGot: 0,
    player: null,
    cars: [],
    traffic: [],
    peds: [],
    police: [],
    courier: null,
    rivals: [],
    bullets: [],
    pickups: [],
    roadblocks: [],
    comet: null,
    toast: '',
    toastTimer: 0,
    storyComplete: false,
    busted: false,
    wasted: false,
    lastHurt: -99,
  };

  function toast(message, seconds = 3.5) {
    state.toast = message;
    state.toastTimer = seconds;
  }

  function addWanted(amount, reason) {
    if (amount <= 0) return;
    state.wanted = Math.min(WANTED.max, state.wanted + amount);
    state.wantedTimer = 0;
    state.crimeTimer = 0;
    if (reason) toast(reason, 2.5);
  }

  function makeCar(x, y, angle, kind, color, maxSpeed) {
    return {
      x, y, angle, speed: 0, kind, color, maxSpeed: maxSpeed ?? CAR.maxSpeed,
      length: CAR.length, width: CAR.width, radius: CAR.radius,
      nitro: 100, ramTimer: 0, active: true,
    };
  }

  function spawnTraffic() {
    state.traffic = [];
    for (let i = 0; i < TRAFFIC.count; i++) {
      const loop = TRAFFIC_LOOPS[i % TRAFFIC_LOOPS.length];
      const point = loop[Math.floor(random() * loop.length)];
      const next = loop[(loop.indexOf(point) + 1) % loop.length];
      const car = makeCar(
        point.x + (random() - 0.5) * 20,
        point.y + (random() - 0.5) * 20,
        angleTo(point.x, point.y, next.x, next.y),
        'traffic',
        choice(random, CAR_COLORS),
        TRAFFIC.minSpeed + random() * (TRAFFIC.maxSpeed - TRAFFIC.minSpeed),
      );
      car.loop = loop;
      car.loopIndex = (loop.indexOf(point) + 1) % loop.length;
      car.speed = car.maxSpeed * 0.8;
      state.traffic.push(car);
    }
  }

  function spawnPeds() {
    state.peds = [];
    for (let i = 0; i < PEDS.count; i++) {
      const x = 128 + random() * (WORLD.width - 256);
      const y = 128 + random() * (WORLD.height - 256);
      // Pedestrians start on the sidewalks and parks, never in the middle of a road.
      if (!isWalkable(x, y) || tileAtPx(x, y) === 'road') continue;
      state.peds.push({
        x, y, angle: random() * TWO_PI, speed: PEDS.minSpeed + random() * (PEDS.maxSpeed - PEDS.minSpeed),
        target: { x, y }, active: true, dead: false, fade: 0,
      });
    }
    retargetPeds();
  }

  /** Does the straight line between two points cross a road tile? */
  function pathCrossesRoad(x0, y0, x1, y1) {
    const steps = Math.max(1, Math.ceil(dist(x0, y0, x1, y1) / 32));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (tileAtPx(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t) === 'road') return true;
    }
    return false;
  }

  /** A new wander target for a pedestrian: on a sidewalk or in a park, reached without
   * crossing a road, so pedestrians do not stroll into fast traffic. */
  function pickPedTarget(ped) {
    const tx = clamp(ped.x + (random() - 0.5) * 700, 64, WORLD.width - 64);
    const ty = clamp(ped.y + (random() - 0.5) * 700, 64, WORLD.height - 64);
    if (isWalkable(tx, ty) && tileAtPx(tx, ty) !== 'road' && !pathCrossesRoad(ped.x, ped.y, tx, ty)) {
      ped.target = { x: tx, y: ty };
    }
  }

  function retargetPeds() {
    for (const ped of state.peds) {
      if (!ped.active || ped.dead) continue;
      pickPedTarget(ped);
    }
  }

  function spawnPickups() {
    state.pickups = PICKUP_SPOTS.map((spot) => ({
      x: spot.x, y: spot.y,
      kind: weightedPick(random, [
        { value: 'health', weight: PICKUPS.health.weight },
        { value: 'ammo', weight: PICKUPS.ammo.weight },
        { value: 'cash', weight: PICKUPS.cash.weight },
      ]),
      active: true, respawnTimer: 0,
    }));
  }

  function spawnCourier() {
    state.courier = {
      x: COURIER_LOOP[0].x, y: COURIER_LOOP[0].y, angle: 0,
      mode: 'walk', stallTimer: 0, loopIndex: 1, active: true, gone: false,
    };
  }

  function spawnComet() {
    state.comet = makeCar(PLACES.comet.x, PLACES.comet.y, Math.PI / 2, 'comet', '#d4af37', CAR.maxSpeed);
    state.comet.speed = 0;
  }

  function reset() {
    state.time = 0;
    state.timeOfDay = 0.3;
    state.cash = 0;
    state.mission = 0;
    state.missionStep = 0;
    state.packageGot = false;
    state.inComet = false;
    state.rivalsLeft = RIVAL.count;
    state.rivalsSpawned = false;
    state.ledgerGot = false;
    state.wanted = 0;
    state.wantedTimer = 0;
    state.crimeTimer = 0;
    state.bustTimer = 0;
    state.tags = TAG_SPOTS.map((spot) => ({ x: spot.x, y: spot.y, got: false }));
    state.tagsGot = 0;
    state.player = {
      x: PLACES.spawn.x, y: PLACES.spawn.y, angle: -Math.PI / 2,
      health: PLAYER.health, ammo: PLAYER.startAmmo, inCar: null,
      shootCooldown: 0, invulnerable: 0, onFoot: true,
    };
    state.cars = [];
    state.traffic = [];
    state.peds = [];
    state.police = [];
    state.rivals = [];
    state.bullets = [];
    state.roadblocks = [];
    state.toast = '';
    state.toastTimer = 0;
    state.storyComplete = false;
    state.busted = false;
    state.wasted = false;
    state.lastHurt = -99;
    spawnTraffic();
    spawnPeds();
    spawnPickups();
    spawnCourier();
    spawnComet();
  }

  // ------------------------------------------------------------ player

  function hurtPlayer(amount) {
    const player = state.player;
    if (player.invulnerable > 0 || state.wasted || state.busted) return 0;
    player.health -= amount;
    player.invulnerable = 0.6;
    state.lastHurt = state.time;
    if (player.health <= 0) {
      player.health = 0;
      state.wasted = true;
      return EVENT_WASTED;
    }
    return EVENT_HIT;
  }

  function nearestCar(maxRange) {
    const player = state.player;
    let best = null;
    let bestDist = maxRange;
    // Traffic, the Comet, and the player's own parked cars (a car left behind when the
    // player stepped out stays where it is and can be climbed back into).
    const candidates = [...state.traffic, state.comet, ...state.cars].filter((c) => c && c.active);
    for (const car of candidates) {
      const d = dist(player.x, player.y, car.x, car.y);
      if (d < bestDist) {
        bestDist = d;
        best = car;
      }
    }
    return best;
  }

  function enterCar(car) {
    const player = state.player;
    player.inCar = car;
    player.onFoot = false;
    car.kind = car.kind === 'comet' ? 'comet' : 'player';
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    // Stealing in sight of the law draws heat. Climbing back into your own parked car
    // is not stealing.
    const wasMine = state.cars.includes(car);
    const policeNear = state.police.some((p) => p.active && dist(player.x, player.y, p.x, p.y) < 320);
    if (car === state.comet) {
      state.inComet = true;
      if (state.mission === 1 && state.missionStep === 0) {
        addWanted(WANTED.missionTheft, 'Stolen! The law is on you.');
        state.missionStep = 1;
        toast('The Comet is yours. Lose the heat, get it to the chop shop.', 4);
      }
    } else if (policeNear && !wasMine) {
      addWanted(WANTED.stealInSight, 'Caught stealing! Wanted up.');
    }
    // A stolen traffic car leaves the traffic flow; your own car leaves the parked row.
    const index = state.traffic.indexOf(car);
    if (index >= 0) state.traffic.splice(index, 1);
    const parked = state.cars.indexOf(car);
    if (parked >= 0) state.cars.splice(parked, 1);
  }

  function exitCar() {
    const player = state.player;
    const car = player.inCar;
    if (!car) return;
    const side = { x: car.x + Math.cos(car.angle + Math.PI / 2) * 44, y: car.y + Math.sin(car.angle + Math.PI / 2) * 44 };
    const spot = collideCircle(side.x, side.y, PLAYER.radius);
    player.x = spot.x;
    player.y = spot.y;
    player.angle = car.angle;
    player.inCar = null;
    player.onFoot = true;
    if (car === state.comet) state.inComet = false;
    // A car left behind stays parked where it is, so the player can climb back in.
    else if (!state.cars.includes(car)) state.cars.push(car);
    // Marlow stalls when the player steps out of a car near him.
    const courier = state.courier;
    if (courier && courier.active && !state.ledgerGot && dist(player.x, player.y, courier.x, courier.y) < 160) {
      courier.mode = 'stall';
      courier.stallTimer = COURIER.stallTime;
    }
  }

  function interact() {
    const player = state.player;
    if (!player.onFoot) {
      exitCar();
      return;
    }
    const car = nearestCar(CAR.stealRange);
    if (car) enterCar(car);
  }

  function fireBullet(from, x, y, angle, damage, speed) {
    state.bullets.push({
      x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      from, damage, life: BULLET.range / speed, active: true,
    });
  }

  function playerShoot(aimAngle) {
    const player = state.player;
    if (player.shootCooldown > 0 || player.ammo <= 0) return 0;
    player.shootCooldown = PLAYER.shootInterval;
    player.ammo -= 1;
    player.angle = aimAngle;
    fireBullet('player', player.x + Math.cos(aimAngle) * 20, player.y + Math.sin(aimAngle) * 20, aimAngle, PLAYER.bulletDamage, BULLET.speed);
    return EVENT_SHOT;
  }

  function updatePlayer(dt, controls) {
    const player = state.player;
    if (player.shootCooldown > 0) player.shootCooldown -= dt;
    if (player.invulnerable > 0) player.invulnerable -= dt;
    // Slow health recovery when out of trouble.
    if (state.time - state.lastHurt > 5 && player.health > 0 && player.health < PLAYER.health) {
      player.health = Math.min(PLAYER.health, player.health + 2 * dt);
    }

    if (player.onFoot) {
      const speed = controls.sneak ? PLAYER.sneakSpeed : PLAYER.walkSpeed;
      const len = Math.hypot(controls.mx, controls.my);
      let nx = player.x;
      let ny = player.y;
      if (len > 0.01) {
        nx += (controls.mx / len) * speed * dt;
        ny += (controls.my / len) * speed * dt;
        player.angle = Math.atan2(controls.my, controls.mx);
      }
      const spot = collideCircle(nx, ny, PLAYER.radius);
      player.x = spot.x;
      player.y = spot.y;
      if (controls.shooting) {
        return playerShoot(controls.aimAngle);
      }
      return 0;
    }

    // Driving.
    const car = player.inCar;
    const boosting = controls.nitro && car.nitro > 0 && car.speed > 40;
    if (boosting) car.nitro = Math.max(0, car.nitro - CAR.nitroDrain * dt);
    else car.nitro = Math.min(100, car.nitro + CAR.nitroRefill * dt);
    const topSpeed = car.maxSpeed * (boosting ? CAR.nitroMultiplier : 1);
    if (controls.my < 0) car.speed += CAR.accel * dt;
    else if (controls.my > 0) car.speed -= CAR.reverseAccel * dt;
    if (controls.brake) car.speed -= Math.sign(car.speed) * CAR.brake * dt;
    // Drag and the speed cap.
    car.speed -= car.speed * CAR.drag * dt;
    if (car.speed > topSpeed) car.speed = Math.max(topSpeed, car.speed - CAR.brake * dt);
    if (car.speed < -CAR.maxSpeed * 0.45) car.speed = -CAR.maxSpeed * 0.45;
    const steer = controls.mx * CAR.turnRate * clamp(Math.abs(car.speed) / 120, 0, 1) * (car.speed >= 0 ? 1 : -1);
    car.angle += steer * dt;
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const spot = collideCircle(nx, ny, CAR.radius);
    if (spot.x !== nx || spot.y !== ny) car.speed *= 0.45;
    car.x = spot.x;
    car.y = spot.y;
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    // Running over a pedestrian at speed is a crime.
    for (const ped of state.peds) {
      if (!ped.active || ped.dead) continue;
      if (Math.abs(car.speed) > 120 && dist(car.x, car.y, ped.x, ped.y) < CAR.radius + 12) {
        ped.dead = true;
        ped.fade = 1;
        addWanted(WANTED.pedestrianKilled, 'Pedestrian down! Wanted up.');
      }
    }
    return 0;
  }

  // ------------------------------------------------------------ traffic, peds, police

  function updateTraffic(dt) {
    for (const car of state.traffic) {
      if (!car.active) continue;
      const target = car.loop[car.loopIndex];
      const d = dist(car.x, car.y, target.x, target.y);
      if (d < 40) {
        car.loopIndex = (car.loopIndex + 1) % car.loop.length;
        continue;
      }
      const want = angleTo(car.x, car.y, target.x, target.y);
      car.angle = lerpAngle(car.angle, want, clamp(2.2 * dt, 0, 1));
      // Slow down for the car ahead.
      let ahead = false;
      for (const other of state.traffic) {
        if (other === car || !other.active) continue;
        const dx = other.x - car.x;
        const dy = other.y - car.y;
        const forward = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
        const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
        if (forward > 0 && forward < 90 && side < 40) {
          ahead = true;
          break;
        }
      }
      const wantSpeed = ahead ? car.maxSpeed * 0.3 : car.maxSpeed;
      car.speed += clamp(wantSpeed - car.speed, -260 * dt, 200 * dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      const spot = collideCircle(car.x, car.y, CAR.radius);
      car.x = spot.x;
      car.y = spot.y;
    }
  }

  function updatePeds(dt) {
    for (const ped of state.peds) {
      if (!ped.active) continue;
      if (ped.dead) {
        ped.fade = Math.max(0, ped.fade - dt * 0.25);
        if (ped.fade === 0) ped.active = false;
        continue;
      }
      const d = dist(ped.x, ped.y, ped.target.x, ped.target.y);
      if (d < 12) {
        pickPedTarget(ped);
        continue;
      }
      const angle = angleTo(ped.x, ped.y, ped.target.x, ped.target.y);
      ped.angle = angle;
      const nx = ped.x + Math.cos(angle) * ped.speed * dt;
      const ny = ped.y + Math.sin(angle) * ped.speed * dt;
      if (isWalkable(nx, ny)) {
        ped.x = nx;
        ped.y = ny;
      } else {
        ped.target = { x: ped.x, y: ped.y };
      }
    }
  }

  function policeSpawnPoint() {
    const player = state.player;
    const roadXs = [64, 576, 1088, 1600, 2112];
    const roadYs = [64, 576, 1088, 1600];
    for (let tries = 0; tries < 12; tries++) {
      const useX = random() < 0.5;
      const x = useX ? choice(random, roadXs) : clamp(player.x + (random() < 0.5 ? -1 : 1) * (560 + random() * 200), 64, WORLD.width - 64);
      const y = useX ? clamp(player.y + (random() < 0.5 ? -1 : 1) * (560 + random() * 200), 64, WORLD.height - 64) : choice(random, roadYs);
      if (dist(x, y, player.x, player.y) > 480) return { x, y };
    }
    return { x: clamp(player.x + 600, 64, WORLD.width - 64), y: player.y };
  }

  function updatePolice(dt) {
    const player = state.player;
    // Keep one police car per wanted star.
    while (state.police.filter((p) => p.active).length < state.wanted) {
      const spot = policeSpawnPoint();
      const car = makeCar(spot.x, spot.y, angleTo(spot.x, spot.y, player.x, player.y), 'police', '#1d4ed8', POLICE.baseSpeed + POLICE.speedPerWanted * state.wanted);
      car.active = true;
      state.police.push(car);
    }
    if (state.wanted === 0) {
      for (const car of state.police) car.active = false;
      state.police = state.police.filter((p) => p.active);
      state.roadblocks = [];
      return;
    }
    for (const car of state.police) {
      if (!car.active) continue;
      // Intercept: aim at where the player will be, not where they are.
      const lead = POLICE.interceptLead;
      const tx = player.x + Math.cos(player.angle) * (player.onFoot ? 0 : (player.inCar ? player.inCar.speed : 0) * lead);
      const ty = player.y + Math.sin(player.angle) * (player.onFoot ? 0 : (player.inCar ? player.inCar.speed : 0) * lead);
      const want = angleTo(car.x, car.y, tx, ty);
      car.angle = lerpAngle(car.angle, want, clamp(2.6 * dt, 0, 1));
      const topSpeed = POLICE.baseSpeed + POLICE.speedPerWanted * state.wanted;
      car.speed = Math.min(topSpeed, car.speed + POLICE.accel * dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      const spot = collideCircle(car.x, car.y, CAR.radius);
      if (spot.x !== car.x || spot.y !== car.y) car.speed *= 0.5;
      car.x = spot.x;
      car.y = spot.y;
      if (car.ramTimer > 0) car.ramTimer -= dt;
      // Touching the player on foot at high wanted starts an arrest, it does not finish
      // it: the officer slows to a walk beside the player and the bust meter fills over
      // 1.2 seconds of unbroken contact. Walk away and the meter drains — a player who
      // keeps moving through a fight is never busted by a drive-by touch.
      if (player.onFoot) {
        if (state.wanted >= POLICE.bustWanted && dist(car.x, car.y, player.x, player.y) < CAR.radius + 14) {
          car.speed = Math.min(car.speed, 50);
          state.bustTimer += dt;
          if (state.bustTimer >= 1.2) {
            state.busted = true;
            toast('Busted!', 3);
          }
        }
      } else if (dist(car.x, car.y, player.x, player.y) < CAR.radius * 2 && car.ramTimer <= 0) {
        car.ramTimer = POLICE.ramInterval;
        car.speed *= 0.55;
        return hurtPlayer(POLICE.ramDamage);
      }
    }
    // The arrest meter drains when no officer is holding the player.
    const held = state.police.some((car) => car.active && player.onFoot
      && state.wanted >= POLICE.bustWanted && dist(car.x, car.y, player.x, player.y) < CAR.radius + 14);
    if (!held) state.bustTimer = Math.max(0, state.bustTimer - dt * 1.5);
    return 0;
  }

  function updateRoadblocks(dt) {
    if (state.wanted < 4) {
      state.roadblocks = [];
      return;
    }
    if (state.roadblocks.length === 0) {
      // Two police cars parked across the road ahead of the player.
      const player = state.player;
      const ahead = player.angle;
      const cx = player.x + Math.cos(ahead) * 380;
      const cy = player.y + Math.sin(ahead) * 380;
      const perp = ahead + Math.PI / 2;
      for (const side of [-1, 1]) {
        const car = makeCar(cx + Math.cos(perp) * 52 * side, cy + Math.sin(perp) * 52 * side, ahead + Math.PI / 2, 'police', '#1d4ed8', POLICE.baseSpeed);
        car.parked = true;
        car.active = true;
        state.roadblocks.push(car);
      }
      toast('Roadblock ahead!', 3);
    }
    const player = state.player;
    for (const car of state.roadblocks) {
      if (!car.active) continue;
      if (car.parked && dist(car.x, car.y, player.x, player.y) < 320) {
        car.parked = false;
        car.kind = 'police';
        state.police.push(car);
      }
    }
    state.roadblocks = state.roadblocks.filter((c) => c.active && c.parked);
  }

  // ------------------------------------------------------------ courier, rivals, bullets

  function updateCourier(dt) {
    const courier = state.courier;
    if (!courier || !courier.active || courier.gone) return;
    const player = state.player;
    const d = dist(player.x, player.y, courier.x, courier.y);
    if (state.ledgerGot) {
      // He runs for the edge of the map and is gone.
      courier.mode = 'flee';
      courier.angle = angleTo(player.x, player.y, courier.x, courier.y);
      courier.x += Math.cos(courier.angle) * COURIER.fleeSpeed * dt;
      courier.y += Math.sin(courier.angle) * COURIER.fleeSpeed * dt;
      if (courier.x < 40 || courier.x > WORLD.width - 40 || courier.y < 40 || courier.y > WORLD.height - 40) courier.gone = true;
      return;
    }
    if (courier.mode === 'stall') {
      courier.stallTimer -= dt;
      if (courier.stallTimer <= 0) courier.mode = 'walk';
      return;
    }
    if (!player.onFoot) {
      if (d < COURIER.fleeRange) courier.mode = 'flee';
      else courier.mode = 'walk';
    } else if (d < COURIER.fleeRange) {
      courier.mode = 'flee';
    } else if (d < COURIER.hesitateRange) {
      courier.mode = 'hesitate';
    } else {
      courier.mode = 'walk';
    }
    if (courier.mode === 'hesitate') return;
    if (courier.mode === 'flee') {
      const away = angleTo(player.x, player.y, courier.x, courier.y);
      courier.angle = away;
      const nx = courier.x + Math.cos(away) * COURIER.fleeSpeed * dt;
      const ny = courier.y + Math.sin(away) * COURIER.fleeSpeed * dt;
      if (isWalkable(nx, ny)) {
        courier.x = nx;
        courier.y = ny;
      }
      return;
    }
    // Walk the loop.
    const target = COURIER_LOOP[courier.loopIndex];
    const dd = dist(courier.x, courier.y, target.x, target.y);
    if (dd < 16) {
      courier.loopIndex = (courier.loopIndex + 1) % COURIER_LOOP.length;
      return;
    }
    const angle = angleTo(courier.x, courier.y, target.x, target.y);
    courier.angle = angle;
    courier.x += Math.cos(angle) * COURIER.walkSpeed * dt;
    courier.y += Math.sin(angle) * COURIER.walkSpeed * dt;
  }

  function spawnRivals() {
    state.rivals = [];
    for (let i = 0; i < RIVAL.count; i++) {
      const angle = (i / RIVAL.count) * TWO_PI;
      state.rivals.push({
        x: PLACES.park.x + Math.cos(angle) * 110,
        y: PLACES.park.y + Math.sin(angle) * 110,
        angle, health: RIVAL.health, shootTimer: 0.6 + i * 0.3,
        active: true, target: { x: PLACES.park.x, y: PLACES.park.y },
      });
    }
    state.rivalsLeft = RIVAL.count;
    state.rivalsSpawned = true;
  }

  function updateRivals(dt) {
    const player = state.player;
    for (const rival of state.rivals) {
      if (!rival.active) continue;
      const d = dist(rival.x, rival.y, player.x, player.y);
      if (d < RIVAL.shootRange && !lineBlocked(rival.x, rival.y, player.x, player.y)) {
        // Face the player and shoot.
        rival.angle = angleTo(rival.x, rival.y, player.x, player.y);
        rival.shootTimer -= dt;
        if (rival.shootTimer <= 0) {
          rival.shootTimer = RIVAL.shootInterval + random() * 0.5;
          const spread = gauss(random) * 0.09;
          fireBullet('rival', rival.x + Math.cos(rival.angle) * 20, rival.y + Math.sin(rival.angle) * 20, rival.angle + spread, RIVAL.bulletDamage, RIVAL.bulletSpeed);
        }
      } else {
        // Drift around the park.
        rival.shootTimer = Math.max(0.3, rival.shootTimer - dt);
        const td = dist(rival.x, rival.y, rival.target.x, rival.target.y);
        if (td < 16) {
          rival.target = {
            x: PLACES.park.x + (random() - 0.5) * 220,
            y: PLACES.park.y + (random() - 0.5) * 220,
          };
        } else {
          const angle = angleTo(rival.x, rival.y, rival.target.x, rival.target.y);
          rival.angle = angle;
          rival.x += Math.cos(angle) * RIVAL.speed * dt;
          rival.y += Math.sin(angle) * RIVAL.speed * dt;
        }
      }
    }
  }

  function updateBullets(dt) {
    let events = 0;
    for (const bullet of state.bullets) {
      if (!bullet.active) continue;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      if (bullet.life <= 0 || bullet.x < 0 || bullet.x > WORLD.width || bullet.y < 0 || bullet.y > WORLD.height) {
        bullet.active = false;
        continue;
      }
      const tile = tileAtPx(bullet.x, bullet.y);
      if (tile === 'block' || tile === 'water') {
        bullet.active = false;
        continue;
      }
      if (bullet.from === 'player') {
        for (const rival of state.rivals) {
          if (!rival.active) continue;
          if (dist(bullet.x, bullet.y, rival.x, rival.y) < RIVAL.radius + BULLET.radius) {
            bullet.active = false;
            rival.health -= bullet.damage;
            if (rival.health <= 0) {
              rival.active = false;
              state.rivalsLeft -= 1;
              addWanted(WANTED.kill, null);
              toast(`Rival down (${RIVAL.count - state.rivalsLeft}/${RIVAL.count}).`, 2);
            }
            break;
          }
        }
      } else if (bullet.from === 'rival') {
        const player = state.player;
        if (player.onFoot && dist(bullet.x, bullet.y, player.x, player.y) < PLAYER.radius + BULLET.radius) {
          bullet.active = false;
          events |= hurtPlayer(bullet.damage);
        }
      }
    }
    state.bullets = state.bullets.filter((b) => b.active);
    return events;
  }

  // ------------------------------------------------------------ pickups, tags, wanted

  function updatePickups(dt) {
    const player = state.player;
    for (const pickup of state.pickups) {
      if (!pickup.active) {
        pickup.respawnTimer -= dt;
        if (pickup.respawnTimer <= 0) {
          pickup.active = true;
          pickup.kind = weightedPick(random, [
            { value: 'health', weight: PICKUPS.health.weight },
            { value: 'ammo', weight: PICKUPS.ammo.weight },
            { value: 'cash', weight: PICKUPS.cash.weight },
          ]);
        }
        continue;
      }
      if (dist(player.x, player.y, pickup.x, pickup.y) < 34) {
        pickup.active = false;
        pickup.respawnTimer = PICKUPS.respawn;
        if (pickup.kind === 'health') {
          player.health = Math.min(PLAYER.health, player.health + PICKUPS.health.value);
          toast(`+${PICKUPS.health.value} health`, 1.5);
        } else if (pickup.kind === 'ammo') {
          player.ammo = Math.min(PLAYER.maxAmmo, player.ammo + PICKUPS.ammo.value);
          toast(`+${PICKUPS.ammo.value} ammo`, 1.5);
        } else {
          state.cash += PICKUPS.cash.value;
          toast(`+$${PICKUPS.cash.value}`, 1.5);
        }
        return EVENT_PICKUP;
      }
    }
    return 0;
  }

  function updateTags() {
    const player = state.player;
    for (const tag of state.tags) {
      if (tag.got) continue;
      if (dist(player.x, player.y, tag.x, tag.y) < TAGS.collectRange) {
        tag.got = true;
        state.tagsGot += 1;
        state.cash += TAGS.value;
        if (state.tagsGot === TAGS.count) {
          state.cash += TAGS.allBonus;
          toast(`All ${TAGS.count} tags! +$${TAGS.value} + $${TAGS.allBonus} bonus`, 4);
        } else {
          toast(`Neon tag ${state.tagsGot}/${TAGS.count} +$${TAGS.value}`, 2);
        }
        return EVENT_TAG;
      }
    }
    return 0;
  }

  function updateWanted(dt) {
    if (state.wanted === 0) return;
    state.crimeTimer += dt;
    const night = isNight();
    const decay = night ? WANTED.decayNight : WANTED.decayDay;
    if (state.crimeTimer >= decay) {
      state.crimeTimer = 0;
      state.wanted -= 1;
      if (state.wanted === 0) toast('You lost them.', 2);
    }
  }

  /** Whether it is night right now (timeOfDay past dusk). */
  function isNight() {
    return state.timeOfDay >= 0.62 || state.timeOfDay < 0.08;
  }

  // ------------------------------------------------------------ missions

  function completeMission() {
    const pay = missionPay(state.mission);
    state.cash += pay;
    toast(`Job done — +$${pay}`, 4);
    state.mission += 1;
    state.missionStep = 0;
    const next = missionAt(state.mission);
    if (next) toast(`${next.name}: ${next.briefing}`, 5);
    return EVENT_MISSION | EVENT_CASH;
  }

  function updateMissions() {
    const player = state.player;
    const mission = missionAt(state.mission);
    if (mission === null || state.storyComplete) return 0;
    const step = stepAt(state.mission, state.missionStep);
    if (step === null) return 0;
    let events = 0;
    if (step.kind === 'reach') {
      const target = step.target;
      const d = dist(player.x, player.y, target.x, target.y);
      const inCometOk = !step.needsComet || state.inComet;
      if (d < step.radius && inCometOk) {
        if (state.mission === 0 && state.missionStep === 0) {
          state.packageGot = true;
          toast('Package secured. Get it to the garage.', 3);
        }
        state.missionStep += 1;
        if (state.missionStep >= mission.steps.length) events |= completeMission();
        else events |= EVENT_MISSION;
      }
    } else if (step.kind === 'defeat') {
      if (!state.rivalsSpawned) {
        spawnRivals();
        toast('Rivals in the park — clear them out.', 3);
      } else if (state.rivalsLeft === 0) {
        state.missionStep += 1;
        // The last step of the job pays out; a middle step just moves the job on.
        if (state.missionStep >= mission.steps.length) events |= completeMission();
        else events |= EVENT_MISSION;
      }
    } else if (step.kind === 'grab-ledger') {
      const courier = state.courier;
      if (courier && courier.active && !courier.gone && player.onFoot && dist(player.x, player.y, courier.x, courier.y) < COURIER.grabRange) {
        state.ledgerGot = true;
        addWanted(WANTED.ledgerGrab, 'Ledger taken! Wanted up.');
        state.missionStep = 1;
        events |= EVENT_MISSION;
        toast('Ledger in hand. Get it to the docks — fast.', 4);
      }
    }
    return events;
  }

  // ------------------------------------------------------------ step

  function step(dt, controls) {
    let events = 0;
    state.time += dt;
    state.timeOfDay = (state.timeOfDay + dt / DAY_LENGTH) % 1;
    if (state.toastTimer > 0) {
      state.toastTimer -= dt;
      if (state.toastTimer <= 0) state.toast = '';
    }
    if (state.busted || state.wasted || state.storyComplete) {
      // The world freezes on an end screen, but the clock keeps its place.
      return 0;
    }
    if (controls.actions & ACTION_INTERACT) interact();
    events |= updatePlayer(dt, controls);
    if (state.wasted || state.busted) return events | (state.wasted ? EVENT_WASTED : EVENT_BUSTED);
    updateTraffic(dt);
    updatePeds(dt);
    events |= updatePolice(dt) || 0;
    if (state.busted) return events | EVENT_BUSTED;
    updateRoadblocks(dt);
    updateCourier(dt);
    updateRivals(dt);
    events |= updateBullets(dt);
    if (state.wasted) return events | EVENT_WASTED;
    events |= updatePickups(dt);
    events |= updateTags();
    updateWanted(dt);
    events |= updateMissions();
    if (state.mission >= 4 && !state.storyComplete) {
      state.storyComplete = true;
      events |= EVENT_STORY;
    }
    return events;
  }

  // ------------------------------------------------------------ save / load

  function save() {
    return {
      cash: state.cash,
      mission: state.mission,
      missionStep: state.missionStep,
      tagsGot: state.tagsGot,
      tags: state.tags.map((t) => t.got),
      player: { x: state.player.x, y: state.player.y, health: state.player.health, ammo: state.player.ammo },
      timeOfDay: state.timeOfDay,
      inComet: state.inComet,
    };
  }

  function load(data) {
    if (!data || typeof data !== 'object') return false;
    reset();
    state.cash = data.cash | 0;
    state.mission = data.mission | 0;
    state.missionStep = data.missionStep | 0;
    if (Array.isArray(data.tags)) {
      data.tags.forEach((got, i) => {
        if (state.tags[i]) state.tags[i].got = !!got;
      });
      state.tagsGot = state.tags.filter((t) => t.got).length;
    }
    if (data.player) {
      state.player.x = data.player.x ?? PLACES.spawn.x;
      state.player.y = data.player.y ?? PLACES.spawn.y;
      state.player.health = data.player.health ?? PLAYER.health;
      state.player.ammo = data.player.ammo ?? PLAYER.startAmmo;
    }
    if (typeof data.timeOfDay === 'number') state.timeOfDay = data.timeOfDay;
    state.inComet = !!data.inComet;
    return true;
  }

  reset();

  return {
    state, reset, step, interact, save, load, isNight,
    // Staging helpers the screenshot scenes use: they set state through the same fields
    // the rules read, so a staged frame is a real frame of the game.
    setMission(index, missionStepValue) {
      state.mission = index;
      state.missionStep = missionStepValue;
    },
    setWanted(value) {
      state.wanted = value;
    },
    placePlayer(x, y, angle) {
      state.player.x = x;
      state.player.y = y;
      state.player.angle = angle;
    },
    placePlayerCar(x, y, angle) {
      const car = makeCar(x, y, angle, 'player', '#f5c542', CAR.maxSpeed);
      state.player.inCar = car;
      state.player.onFoot = false;
      state.player.x = x;
      state.player.y = y;
      state.player.angle = angle;
      state.cars.push(car);
      return car;
    },
    spawnPoliceAt(x, y) {
      const car = makeCar(x, y, angleTo(x, y, state.player.x, state.player.y), 'police', '#1d4ed8', POLICE.baseSpeed + POLICE.speedPerWanted * state.wanted);
      car.speed = car.maxSpeed * 0.7;
      state.police.push(car);
      return car;
    },
    spawnRoadblockAt(x, y, angle) {
      const perp = angle + Math.PI / 2;
      const made = [];
      for (const side of [-1, 1]) {
        const car = makeCar(x + Math.cos(perp) * 52 * side, y + Math.sin(perp) * 52 * side, angle + Math.PI / 2, 'police', '#1d4ed8', POLICE.baseSpeed);
        car.parked = true;
        made.push(car);
      }
      state.roadblocks = made;
      return made;
    },
  };
}

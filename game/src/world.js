// Neon Bay's rules and state, with no drawing and no browser in it: the player on
// foot and in cars, traffic, pedestrians, police, the wanted level, missions, tags,
// pickups, the courier and the day/night cycle. step() advances one fixed step and
// returns what happened as bit flags, so the caller can react (sound, screens) without
// the world knowing about them. All randomness comes from the seeded generator.

import {
  CAR, CITY, COMET, DAY_LENGTH, MISSIONS, NIGHT_START, PICKUP_KINDS, PICKUP_RESPAWN,
  PLAYER, POLICE, SPOTS, TAG_BONUS, TAG_REWARD, TRAFFIC, PEDS, WANTED,
  blockCenter, roadCenter,
} from './config.js';
import { createCity, onRoad } from './city.js';
import { pick, range } from './random.js';

export const EVENT_PICKUP = 1;
export const EVENT_TAG = 2;
export const EVENT_MISSION = 4;
export const EVENT_PUNCH = 8;
export const EVENT_CRASH = 16;
export const EVENT_BUST = 32;
export const EVENT_STEAL = 64;
export const EVENT_WANTED = 128;
export const EVENT_WIN = 256;
export const EVENT_WASTED = 512;
export const EVENT_DENIED = 1024;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

export function createWorld(random, seed) {
  const city = createCity(random);

  const state = {
    seed,
    elapsed: 0,
    dayT: 0.12,
    night: false,
    player: null,
    cars: [],
    peds: [],
    rivals: [],
    courier: null,
    roadblocks: [],
    particles: [],
    mission: { index: 0, phase: 'pickup', target: { x: SPOTS.docks.x, y: SPOTS.docks.y }, text: MISSIONS[0].pickupText },
    tagsTaken: 0,
    storyComplete: false,
    crashCooldown: 0,
    policeTimer: 0,
    message: '',
    messageTimer: 0,
    stats: { carsStolen: 0, punches: 0, tags: 0, missions: 0 },
  };

  function say(text) {
    state.message = text;
    state.messageTimer = 4;
  }

  function spawnTrafficCar() {
    const horizontal = random() < 0.5;
    const road = Math.floor(random() * CITY.roads);
    const along = range(random, 60, CITY.size - 60);
    const dir = random() < 0.5 ? 1 : -1;
    return {
      id: `t${Math.floor(random() * 1e9)}`,
      kind: 'traffic',
      x: horizontal ? along : roadCenter(road),
      y: horizontal ? roadCenter(road) : along,
      angle: horizontal ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2),
      speed: range(random, TRAFFIC.minSpeed, TRAFFIC.maxSpeed),
      cruise: range(random, TRAFFIC.minSpeed, TRAFFIC.maxSpeed),
      horizontal,
      dir,
      health: 100,
      color: pick(random, ['#c62828', '#1565c0', '#f9a825', '#6a1b9a', '#00897b', '#e0e0e0', '#9aa3b2']),
      parked: false,
      wrecked: false,
      stolen: false,
    };
  }

  function spawnPed() {
    const c = Math.floor(random() * 5);
    const r = Math.floor(random() * 5);
    const x0 = c * CITY.pitch + CITY.road / 2 + 7;
    const y0 = r * CITY.pitch + CITY.road / 2 + 7;
    const w = CITY.block - 14;
    const h = CITY.block - 14;
    return {
      x0, y0, w, h,
      s: random() * (2 * (w + h)),
      dir: random() < 0.5 ? 1 : -1,
      speed: range(random, 32, 55),
      x: x0,
      y: y0,
      down: 0,
      color: pick(random, ['#e57373', '#81c784', '#64b5f6', '#ffb74d', '#ba68c8', '#fff176']),
    };
  }

  function pedPosition(ped) {
    const p = ((ped.s % (2 * (ped.w + ped.h))) + 2 * (ped.w + ped.h)) % (2 * (ped.w + ped.h));
    if (p < ped.w) return { x: ped.x0 + p, y: ped.y0 };
    if (p < ped.w + ped.h) return { x: ped.x0 + ped.w, y: ped.y0 + (p - ped.w) };
    if (p < 2 * ped.w + ped.h) return { x: ped.x0 + ped.w - (p - ped.w - ped.h), y: ped.y0 + ped.h };
    return { x: ped.x0, y: ped.y0 + ped.h - (p - 2 * ped.w - ped.h) };
  }

  function reset(save) {
    state.elapsed = 0;
    state.dayT = 0.12;
    state.night = false;
    state.cars = [];
    state.peds = [];
    state.rivals = [];
    state.roadblocks = [];
    state.particles = [];
    state.tagsTaken = 0;
    state.storyComplete = false;
    state.crashCooldown = 0;
    state.policeTimer = 0;
    state.stats = { carsStolen: 0, punches: 0, tags: 0, missions: 0 };

    for (const tag of city.tags) tag.taken = false;
    for (const pickup of city.pickups) {
      pickup.active = true;
      pickup.timer = 0;
    }

    // Rook's own car at the garage, plus the parked cars and the Comet.
    const own = {
      id: 'own', kind: 'player', x: SPOTS.garage.x - 24, y: SPOTS.garage.y + 38,
      angle: 0, speed: 0, health: CAR.health, color: '#29b6f6',
      parked: true, wrecked: false, stolen: false, owned: true,
    };
    state.cars.push(own);
    for (const p of city.parked) {
      state.cars.push({
        id: `p${Math.floor(random() * 1e9)}`, kind: 'parked',
        x: p.x, y: p.y, angle: p.angle, speed: 0, health: CAR.health,
        color: p.color, parked: true, wrecked: false, stolen: false, owned: false,
      });
    }
    state.cars.push({
      id: 'comet', kind: 'comet', x: city.comet.x, y: city.comet.y, angle: city.comet.angle,
      speed: 0, health: CAR.health, color: COMET.color, parked: true, wrecked: false,
      stolen: false, owned: false,
    });
    for (let i = 0; i < TRAFFIC.count; i += 1) state.cars.push(spawnTrafficCar());
    for (let i = 0; i < PEDS.count; i += 1) state.peds.push(spawnPed());

    state.courier = {
      x: SPOTS.market.x + 40, y: SPOTS.market.y - 30,
      angle: 0, mode: 'walk', timer: 0, hasLedger: true, speed: 60,
    };

    state.player = {
      x: SPOTS.garage.x, y: SPOTS.garage.y, angle: -Math.PI / 2,
      health: PLAYER.health, onFoot: true, car: null,
      cash: 0, wanted: 0, wantedTimer: 0, bust: 0,
      nitro: CAR.nitroMax, punchCooldown: 0, vx: 0, vy: 0,
    };

    const missionIndex = save && Number.isInteger(save.missionIndex) ? save.missionIndex : 0;
    state.player.cash = save && Number.isFinite(save.cash) ? save.cash : 0;
    if (save && Array.isArray(save.tags)) {
      for (const i of save.tags) if (city.tags[i]) city.tags[i].taken = true;
      state.tagsTaken = save.tags.length;
    }
    startMission(Math.min(missionIndex, MISSIONS.length - 1));
    if (missionIndex >= MISSIONS.length) state.storyComplete = true;
  }

  function startMission(index) {
    const m = MISSIONS[index];
    state.mission.index = index;
    state.mission.phase = 'pickup';
    state.mission.text = m.pickupText;
    if (index === 0) state.mission.target = { x: SPOTS.docks.x, y: SPOTS.docks.y };
    else if (index === 1) state.mission.target = { x: SPOTS.cometLot.x, y: SPOTS.cometLot.y };
    else if (index === 2) state.mission.target = { x: SPOTS.plaza.x, y: SPOTS.plaza.y };
    else state.mission.target = { x: SPOTS.market.x, y: SPOTS.market.y };
    say(`Mission: ${m.name} — ${m.intro}`);
  }

  function completeMission(events) {
    const m = MISSIONS[state.mission.index];
    state.player.cash += m.reward;
    state.stats.missions += 1;
    state.mission.index += 1;
    if (state.mission.index >= MISSIONS.length) {
      state.storyComplete = true;
      state.mission.text = 'Story complete — Neon Bay is yours, Rook.';
      return events | EVENT_MISSION | EVENT_WIN;
    }
    startMission(state.mission.index);
    return events | EVENT_MISSION;
  }

  function raiseWanted(amount) {
    const before = state.player.wanted;
    state.player.wanted = clamp(state.player.wanted + amount, 0, WANTED.max);
    state.player.wantedTimer = 0;
    if (state.player.wanted > before) return true;
    return false;
  }

  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      if (state.particles.length > 220) return;
      const a = random() * Math.PI * 2;
      const s = range(random, speed * 0.3, speed);
      state.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: range(random, 0.3, 0.7), maxLife: 0.7, color, size: range(random, 2, 4.5),
      });
    }
  }

  function driveCar(car, throttle, steer, dt, nitroOn, tuning) {
    const max = tuning.maxSpeed * (nitroOn ? CAR.nitroMult : 1);
    const accel = tuning.accel * (nitroOn ? 1.25 : 1);
    if (throttle > 0) car.speed += accel * dt;
    else if (throttle < 0) {
      if (car.speed > 5) car.speed -= CAR.brake * dt;
      else car.speed = Math.max(-tuning.maxReverse, car.speed - accel * 0.6 * dt);
    } else {
      car.speed -= car.speed * CAR.drag * dt;
      if (Math.abs(car.speed) < 2) car.speed = 0;
    }
    car.speed = clamp(car.speed, -tuning.maxReverse, max);
    const steerAuthority = clamp(Math.abs(car.speed) / 60, 0, 1);
    car.angle += steer * CAR.steer * steerAuthority * Math.sign(car.speed || 1) * dt;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
  }

  // The player's car can smash through a roadblock barrier at speed (a
  // breakable barricade): the barrier is destroyed and the car takes a dent.
  // At low speed the barrier is solid and the player must back up and ram it,
  // or find another way round. Returns true when a barrier was smashed.
  function collideCar(car, breakBarrier = false) {
    // Two circles (nose and tail) against buildings and roadblock barriers.
    for (const sign of [1, -1]) {
      const px = car.x + Math.cos(car.angle) * sign * (CAR.length / 2 - 8);
      const py = car.y + Math.sin(car.angle) * sign * (CAR.length / 2 - 8);
      const fixed = city.collide(px, py, 13);
      car.x += fixed.x - px;
      car.y += fixed.y - py;
      if (fixed.x !== px || fixed.y !== py) car.speed *= 0.55;
    }
    for (let i = 0; i < state.roadblocks.length; i += 1) {
      const rb = state.roadblocks[i];
      const dx = car.x - rb.x;
      const dy = car.y - rb.y;
      const along = dx * Math.cos(rb.angle) + dy * Math.sin(rb.angle);
      const across = -dx * Math.sin(rb.angle) + dy * Math.cos(rb.angle);
      if (Math.abs(along) < 34 && Math.abs(across) < 16) {
        if (breakBarrier && Math.abs(car.speed) > 120) {
          state.roadblocks.splice(i, 1);
          car.health -= 10;
          car.speed *= 0.6;
          burst(car.x, car.y, '#ffd166', 12, 200);
          return true;
        }
        const push = across > 0 ? 16 - across : -16 - across;
        car.x += -Math.sin(rb.angle) * push;
        car.y += Math.cos(rb.angle) * push;
        if (Math.abs(car.speed) > 120) {
          car.health -= 10;
          car.speed *= 0.4;
          burst(car.x, car.y, '#ffd166', 10, 160);
        } else {
          car.speed *= 0.6;
        }
      }
    }
    car.x = clamp(car.x, 20, CITY.size - 20);
    car.y = clamp(car.y, 20, CITY.size - 20);
    return false;
  }

  function nearestCar(x, y, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of state.cars) {
      if (car.kind === 'traffic' || car.kind === 'police' || car.wrecked) continue;
      const d = dist(x, y, car.x, car.y);
      if (d < bestD) {
        best = car;
        bestD = d;
      }
    }
    return best;
  }

  function enterCar(car, events) {
    const p = state.player;
    p.onFoot = false;
    p.car = car;
    car.parked = false;
    if (!car.owned && !car.stolen) {
      car.stolen = true;
      state.stats.carsStolen += 1;
      if (raiseWanted(WANTED.stealCar)) events |= EVENT_WANTED;
      events |= EVENT_STEAL;
      say(car.kind === 'comet' ? 'The Comet is yours — the cops noticed.' : 'Car stolen — wanted level up.');
    }
    return events;
  }

  function exitCar() {
    const p = state.player;
    const car = p.car;
    if (!car) return;
    const side = car.angle + Math.PI / 2;
    let x = car.x + Math.cos(side) * 34;
    let y = car.y + Math.sin(side) * 34;
    const fixed = city.collide(x, y, PLAYER.radius + 2);
    p.x = fixed.x;
    p.y = fixed.y;
    p.angle = car.angle;
    p.onFoot = true;
    p.car = null;
    car.parked = true;
    car.speed = 0;
  }

  function punch(events) {
    const p = state.player;
    if (p.punchCooldown > 0 || !p.onFoot) return events;
    p.punchCooldown = PLAYER.punchCooldown;
    state.stats.punches += 1;
    let hit = false;
    for (const rival of state.rivals) {
      if (!rival.alive) continue;
      const d = dist(p.x, p.y, rival.x, rival.y);
      const ang = Math.abs(angleDiff(Math.atan2(rival.y - p.y, rival.x - p.x), p.angle));
      if (d < PLAYER.punchRange + 12 && ang < PLAYER.punchArc) {
        rival.health -= PLAYER.punchDamage;
        rival.x += Math.cos(Math.atan2(rival.y - p.y, rival.x - p.x)) * 14;
        rival.y += Math.sin(Math.atan2(rival.y - p.y, rival.x - p.x)) * 14;
        burst(rival.x, rival.y, '#ffffff', 8, 140);
        hit = true;
        if (rival.health <= 0) {
          rival.alive = false;
          burst(rival.x, rival.y, '#ff5252', 16, 200);
        }
      }
    }
    if (hit) {
      events |= EVENT_PUNCH;
      for (const car of state.cars) {
        if (car.kind === 'police' && dist(p.x, p.y, car.x, car.y) < 350) {
          if (raiseWanted(WANTED.punch)) events |= EVENT_WANTED;
          break;
        }
      }
    }
    return events;
  }

  function spawnPolice(events) {
    const wanted = state.player.wanted;
    const desired = wanted === 0 ? 0 : Math.min(wanted, 4) + (wanted >= 4 ? 1 : 0);
    const current = state.cars.filter((c) => c.kind === 'police').length;
    if (current >= desired || state.policeTimer > 0) return events;
    state.policeTimer = 1.6;
    // A road point 250-420 px from the player, on a road.
    for (let tries = 0; tries < 12; tries += 1) {
      const a = random() * Math.PI * 2;
      const d = range(random, 250, 420);
      const x = clamp(state.player.x + Math.cos(a) * d, 40, CITY.size - 40);
      const y = clamp(state.player.y + Math.sin(a) * d, 40, CITY.size - 40);
      if (!onRoad(x, y)) continue;
      state.cars.push({
        id: `pol${Math.floor(random() * 1e9)}`, kind: 'police',
        x, y, angle: random() * Math.PI * 2, speed: 0,
        health: CAR.health, color: '#e8e8f0', parked: false,
        wrecked: false, stolen: false, ramTimer: 0,
      });
      break;
    }
    return events;
  }

  function updatePolice(dt, events) {
    const p = state.player;
    const px = p.onFoot ? p.x : p.car.x;
    const py = p.onFoot ? p.y : p.car.y;
    const pvx = p.onFoot ? p.vx : Math.cos(p.car.angle) * p.car.speed;
    const pvy = p.onFoot ? p.vy : Math.sin(p.car.angle) * p.car.speed;
    // Intercept: aim 0.6 s ahead of where the player is going.
    const tx = px + pvx * 0.6;
    const ty = py + pvy * 0.6;
    let anyNear = false;
    for (const car of state.cars) {
      if (car.kind !== 'police') continue;
      const d = dist(car.x, car.y, px, py);
      if (d < 420) anyNear = true;
      const want = Math.atan2(ty - car.y, tx - car.x);
      const turn = clamp(angleDiff(want, car.angle), -1, 1);
      driveCar(car, 1, turn, dt, false, POLICE);
      collideCar(car);
      if (car.ramTimer > 0) car.ramTimer -= dt;
      if (d < 34 && car.ramTimer <= 0) {
        car.ramTimer = POLICE.ramInterval;
        if (p.onFoot) {
          p.health -= POLICE.ramDamage;
          burst(p.x, p.y, '#ff3b30', 10, 180);
        } else {
          p.car.health -= POLICE.ramDamage;
          burst(car.x, car.y, '#ffd166', 10, 180);
        }
        events |= EVENT_CRASH;
      }
      // Bust: at wanted 3+, a police car touching the player fills the bust meter —
      // but only when the player is caught standing still (on foot, or crawling in
      // a car). Speed is the escape: a moving car is never busted by a touch.
      const playerSpeed = p.onFoot ? 0 : Math.abs(p.car.speed);
      if (p.wanted >= 3 && d < 36 && playerSpeed < 40) {
        p.bust += dt / WANTED.bustTime;
        if (p.bust >= 1) {
          p.cash = Math.max(0, p.cash - WANTED.bustFine);
          p.wanted = 0;
          p.bust = 0;
          if (!p.onFoot) p.car = null;
          p.onFoot = true;
          p.x = SPOTS.garage.x;
          p.y = SPOTS.garage.y;
          p.health = PLAYER.health;
          say('BUSTED — fined $150, back at the garage.');
          events |= EVENT_BUST;
        }
      }
    }
    if (p.bust > 0 && (p.wanted < 3 || !state.cars.some((c) => c.kind === 'police' && dist(c.x, c.y, px, py) < 40))) {
      p.bust = Math.max(0, p.bust - dt * 0.8);
    }
    // Roadblocks at wanted 4+: one barrier ahead on the player's road.
    if (p.wanted >= 4 && state.roadblocks.length === 0 && !p.onFoot && onRoad(px, py)) {
      const ahead = 190;
      const bx = px + Math.cos(p.car.angle) * ahead;
      const by = py + Math.sin(p.car.angle) * ahead;
      if (onRoad(bx, by) && bx > 40 && bx < CITY.size - 40 && by > 40 && by < CITY.size - 40) {
        state.roadblocks.push({ x: bx, y: by, angle: p.car.angle + Math.PI / 2, timer: 45 });
        // Two police cars parked across the road behind the barrier.
        for (const side of [-1, 1]) {
          state.cars.push({
            id: `rb${Math.floor(random() * 1e9)}`, kind: 'police',
            x: bx + Math.cos(p.car.angle + Math.PI / 2) * side * 26,
            y: by + Math.sin(p.car.angle + Math.PI / 2) * side * 26,
            angle: p.car.angle + Math.PI / 2, speed: 0, health: CAR.health,
            color: '#e8e8f0', parked: true, wrecked: false, stolen: false, ramTimer: 0,
          });
        }
      }
    }
    for (let i = state.roadblocks.length - 1; i >= 0; i -= 1) {
      state.roadblocks[i].timer -= dt;
      if (state.roadblocks[i].timer <= 0 || p.wanted < 4) state.roadblocks.splice(i, 1);
    }
    return anyNear ? events : events;
  }

  function updateTraffic(dt) {
    const p = state.player;
    for (const car of state.cars) {
      if (car.kind !== 'traffic') continue;
      // Slow for a car ahead on the same road.
      let ahead = Infinity;
      for (const other of state.cars) {
        if (other === car || other.kind === 'traffic' && other === car) continue;
        if (other.kind !== 'traffic' && other.kind !== 'police' && other.kind !== 'player' && other.kind !== 'parked' && other.kind !== 'comet') continue;
        const dx = other.x - car.x;
        const dy = other.y - car.y;
        const forward = car.horizontal ? dx * car.dir : dy * car.dir;
        const lateral = car.horizontal ? Math.abs(dy) : Math.abs(dx);
        if (forward > 0 && forward < 80 && lateral < 30 && forward < ahead) ahead = forward;
      }
      const want = ahead < 80 ? 0 : car.cruise;
      car.speed += clamp(want - car.speed, -260 * dt, 200 * dt);
      const step = car.speed * dt;
      if (car.horizontal) car.x += car.dir * step;
      else car.y += car.dir * step;
      // Turn at an intersection, sometimes.
      const nearCross = (() => {
        for (let i = 0; i < CITY.roads; i += 1) {
          const c = roadCenter(i);
          const coord = car.horizontal ? car.x : car.y;
          if (Math.abs(coord - c) < 8) return c;
        }
        return null;
      })();
      if (nearCross !== null && random() < 0.012) {
        car.horizontal = !car.horizontal;
        car.dir = random() < 0.5 ? 1 : -1;
        if (car.horizontal) {
          car.y = nearCross;
          car.angle = car.dir > 0 ? 0 : Math.PI;
        } else {
          car.x = nearCross;
          car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        }
      }
      // Wrap around the city edge.
      if (car.x < -60) car.x = CITY.size + 60;
      if (car.x > CITY.size + 60) car.x = -60;
      if (car.y < -60) car.y = CITY.size + 60;
      if (car.y > CITY.size + 60) car.y = -60;
      // A traffic car running the player over hurts — but the player committed no
      // crime by being hit, so the wanted level does not move.
      if (p.onFoot && dist(car.x, car.y, p.x, p.y) < 26 && Math.abs(car.speed) > 40) {
        p.health -= 15;
        p.x += Math.cos(car.angle) * 30;
        p.y += Math.sin(car.angle) * 30;
        burst(p.x, p.y, '#ff6b6b', 12, 180);
        car.speed *= 0.5;
        return EVENT_CRASH;
      }
    }
    return 0;
  }

  function updatePeds(dt, events) {
    const p = state.player;
    for (const ped of state.peds) {
      if (ped.down > 0) {
        ped.down -= dt;
        if (ped.down <= 0) {
          const fresh = spawnPed();
          Object.assign(ped, fresh);
        }
        continue;
      }
      ped.s += ped.dir * ped.speed * dt;
      const pos = pedPosition(ped);
      ped.x = pos.x;
      ped.y = pos.y;
      // A car running a pedestrian over: the ped goes down, the law notices.
      for (const car of state.cars) {
        if (car.kind === 'traffic' || car.kind === 'police') continue;
        if (car.parked || car.wrecked || Math.abs(car.speed) < 40) continue;
        if (dist(car.x, car.y, ped.x, ped.y) < 26) {
          ped.down = 3;
          burst(ped.x, ped.y, '#ffffff', 10, 150);
          if (car === p.car) {
            if (raiseWanted(WANTED.hitPed)) events |= EVENT_WANTED;
            events |= EVENT_CRASH;
          }
          break;
        }
      }
      // On foot, bumping a pedestrian just pushes past them.
      if (p.onFoot && dist(p.x, p.y, ped.x, ped.y) < 20) {
        const a = Math.atan2(p.y - ped.y, p.x - ped.x);
        p.x = ped.x + Math.cos(a) * 20;
        p.y = ped.y + Math.sin(a) * 20;
      }
    }
    return events;
  }

  function updateRivals(dt, events) {
    const p = state.player;
    for (const rival of state.rivals) {
      if (!rival.alive) continue;
      const px = p.onFoot ? p.x : p.car.x;
      const py = p.onFoot ? p.y : p.car.y;
      const d = dist(rival.x, rival.y, px, py);
      if (d < 320) {
        const a = Math.atan2(py - rival.y, px - rival.x);
        rival.angle = a;
        const step = 95 * dt;
        const nx = rival.x + Math.cos(a) * step;
        const ny = rival.y + Math.sin(a) * step;
        const fixed = city.collide(nx, ny, 12);
        rival.x = fixed.x;
        rival.y = fixed.y;
        if (rival.punchTimer > 0) rival.punchTimer -= dt;
        if (d < 32 && rival.punchTimer <= 0) {
          rival.punchTimer = 1.0;
          if (p.onFoot) {
            p.health -= 8;
            burst(p.x, p.y, '#ff5252', 8, 140);
          } else {
            p.car.health -= 6;
          }
          events |= EVENT_CRASH;
        }
      }
      // Rammed by the player's car: heavy damage.
      if (!p.onFoot && p.car && dist(rival.x, rival.y, p.car.x, p.car.y) < 30 && Math.abs(p.car.speed) > 60) {
        rival.health -= 50;
        const a = Math.atan2(rival.y - p.car.y, rival.x - p.car.x);
        rival.x += Math.cos(a) * 26;
        rival.y += Math.sin(a) * 26;
        burst(rival.x, rival.y, '#ff5252', 12, 180);
        if (rival.health <= 0) {
          rival.alive = false;
          burst(rival.x, rival.y, '#ff5252', 18, 220);
        }
        events |= EVENT_CRASH;
      }
    }
    // Mission 3 completes the moment the last rival falls — never forget this branch.
    if (state.mission.index === 2 && state.mission.phase === 'fight' && state.rivals.length > 0 && state.rivals.every((r) => !r.alive)) {
      state.mission.phase = 'return';
      state.mission.target = { x: SPOTS.garage.x, y: SPOTS.garage.y };
      state.mission.text = MISSIONS[2].returnText;
      say('Plaza is yours. Report back at the garage.');
      events |= EVENT_MISSION;
    }
    return events;
  }

  function updateCourier(dt, events) {
    const c = state.courier;
    const p = state.player;
    if (state.mission.index !== 3) {
      // Marlow walks his usual loop near the market until his mission starts.
      c.mode = 'walk';
      c.timer -= dt;
      if (c.timer <= 0) {
        c.timer = 2 + random() * 2;
        c.angle = pick(random, [0, Math.PI / 2, Math.PI, -Math.PI / 2]);
      }
      const nx = c.x + Math.cos(c.angle) * c.speed * 0.5 * dt;
      const ny = c.y + Math.sin(c.angle) * c.speed * 0.5 * dt;
      const fixed = city.collide(nx, ny, 10);
      c.x = fixed.x;
      c.y = fixed.y;
      return events;
    }
    const d = dist(c.x, c.y, p.x, p.y);
    if (c.mode === 'walk' && p.onFoot && d < 55) {
      c.mode = 'stall';
      c.timer = 3;
      say('Marlow froze — grab the ledger!');
    } else if (c.mode === 'stall') {
      c.timer -= dt;
      if (d < 26 && p.onFoot) {
        c.hasLedger = false;
        c.mode = 'flee';
        state.mission.phase = 'return';
        state.mission.target = { x: SPOTS.docks.x, y: SPOTS.docks.y };
        state.mission.text = MISSIONS[3].returnText;
        if (raiseWanted(3 - p.wanted > 0 ? 3 - p.wanted : 0)) events |= EVENT_WANTED;
        p.wanted = Math.max(p.wanted, 3);
        say('Ledger grabbed — the whole city is after you. Run!');
        events |= EVENT_MISSION;
      } else if (c.timer <= 0) {
        c.mode = 'flee';
        c.timer = 2;
      }
    } else if (c.mode === 'flee') {
      c.timer -= dt;
      const a = Math.atan2(c.y - p.y, c.x - p.x);
      c.x += Math.cos(a) * 150 * dt;
      c.y += Math.sin(a) * 150 * dt;
      const fixed = city.collide(c.x, c.y, 10);
      c.x = fixed.x;
      c.y = fixed.y;
      if (c.timer <= 0) {
        c.mode = 'walk';
        c.timer = 1;
      }
    }
    return events;
  }

  function updateMission(dt, events) {
    const p = state.player;
    const m = state.mission;
    if (state.storyComplete) return events;
    const px = p.onFoot ? p.x : p.car.x;
    const py = p.onFoot ? p.y : p.car.y;
    const atTarget = dist(px, py, m.target.x, m.target.y) < 46;
    if (m.index === 0) {
      if (m.phase === 'pickup' && atTarget) {
        m.phase = 'return';
        m.target = { x: SPOTS.garage.x, y: SPOTS.garage.y };
        m.text = MISSIONS[0].returnText;
        say('Package secured. Back to the garage.');
        events |= EVENT_MISSION;
      } else if (m.phase === 'return' && atTarget) {
        events = completeMission(events);
      }
    } else if (m.index === 1) {
      const comet = state.cars.find((c) => c.id === 'comet');
      if (m.phase === 'pickup' && p.car === comet) {
        m.phase = 'return';
        m.target = { x: SPOTS.chopShop.x, y: SPOTS.chopShop.y };
        m.text = MISSIONS[1].returnText;
        say('Comet stolen. Get it to the chop shop.');
        events |= EVENT_MISSION;
      } else if (m.phase === 'return' && p.car === comet && atTarget) {
        events = completeMission(events);
      }
    } else if (m.index === 2) {
      if (m.phase === 'pickup' && atTarget) {
        m.phase = 'fight';
        m.text = MISSIONS[2].pickupText;
        for (let i = 0; i < 4; i += 1) {
          const a = (i / 4) * Math.PI * 2;
          state.rivals.push({
            x: SPOTS.plaza.x + Math.cos(a) * 70,
            y: SPOTS.plaza.y + Math.sin(a) * 70,
            angle: 0, health: 100, alive: true, punchTimer: 0,
          });
        }
        say('Four rivals. Take them all down.');
        events |= EVENT_MISSION;
      } else if (m.phase === 'return' && atTarget) {
        events = completeMission(events);
      }
    } else if (m.index === 3) {
      if (m.phase === 'return' && atTarget) {
        events = completeMission(events);
      }
    }
    return events;
  }

  function updatePickupsAndTags(dt, events) {
    const p = state.player;
    const px = p.onFoot ? p.x : p.car.x;
    const py = p.onFoot ? p.y : p.car.y;
    for (const tag of city.tags) {
      if (!tag.taken && dist(px, py, tag.x, tag.y) < 28) {
        tag.taken = true;
        state.tagsTaken += 1;
        state.stats.tags += 1;
        p.cash += TAG_REWARD;
        burst(tag.x, tag.y, '#ff2d78', 14, 160);
        events |= EVENT_TAG;
        if (state.tagsTaken === 8) {
          p.cash += TAG_BONUS;
          say('All 8 tags — $100 bonus!');
          events |= EVENT_MISSION;
        }
      }
    }
    for (const pickup of city.pickups) {
      if (!pickup.active) {
        pickup.timer -= dt;
        if (pickup.timer <= 0) {
          pickup.active = true;
          const total = PICKUP_KINDS.reduce((s, k) => s + k.weight, 0);
          let roll = random() * total;
          for (const k of PICKUP_KINDS) {
            roll -= k.weight;
            if (roll <= 0) {
              pickup.kind = k.kind;
              break;
            }
          }
        }
        continue;
      }
      if (dist(px, py, pickup.x, pickup.y) < 28) {
        pickup.active = false;
        pickup.timer = PICKUP_RESPAWN;
        const def = PICKUP_KINDS.find((k) => k.kind === pickup.kind);
        if (pickup.kind === 'cash') p.cash += def.value;
        else if (pickup.kind === 'health') p.health = Math.min(PLAYER.health, p.health + def.value);
        else if (pickup.kind === 'nitro') p.nitro = CAR.nitroMax;
        else if (pickup.kind === 'repair' && p.car) p.car.health = Math.min(CAR.health, p.car.health + def.value);
        burst(pickup.x, pickup.y, '#7ee081', 12, 150);
        events |= EVENT_PICKUP;
      }
    }
    return events;
  }

  function carCarCollisions(events) {
    const cars = state.cars.filter((c) => !c.wrecked);
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        const a = cars[i];
        const b = cars[j];
        if (a.parked && b.parked) continue;
        const d = dist(a.x, a.y, b.x, b.y);
        if (d < 34 && d > 0.01) {
          const nx = (b.x - a.x) / d;
          const ny = (b.y - a.y) / d;
          const push = (34 - d) / 2;
          if (!a.parked) {
            a.x -= nx * push;
            a.y -= ny * push;
          }
          if (!b.parked) {
            b.x += nx * push;
            b.y += ny * push;
          }
          const relSpeed = Math.abs(a.speed - b.speed);
          if (relSpeed > 120 && state.crashCooldown <= 0) {
            state.crashCooldown = 0.6;
            a.health -= 6;
            b.health -= 6;
            burst((a.x + b.x) / 2, (a.y + b.y) / 2, '#ffd166', 12, 180);
            events |= EVENT_CRASH;
          }
        }
      }
    }
    return events;
  }

  function wreckCheck(events) {
    for (const car of state.cars) {
      if (car.health <= 0 && !car.wrecked) {
        car.wrecked = true;
        car.speed = 0;
        burst(car.x, car.y, '#888888', 24, 220);
        if (state.player.car === car) {
          exitCar();
          say('Your car is wrecked — on foot now.');
        }
        events |= EVENT_CRASH;
      }
    }
    return events;
  }

  /**
   * One fixed step. `controls` is the input object (real keyboard or an autopilot
   * with the same shape). Returns the events that happened, as bit flags.
   */
  function step(dt, controls) {
    let events = 0;
    state.elapsed += dt;
    state.dayT = (state.elapsed / DAY_LENGTH) % 1;
    state.night = state.dayT >= NIGHT_START;
    if (state.messageTimer > 0) state.messageTimer -= dt;
    if (state.crashCooldown > 0) state.crashCooldown -= dt;
    if (state.policeTimer > 0) state.policeTimer -= dt;

    const p = state.player;
    if (p.punchCooldown > 0) p.punchCooldown -= dt;

    // Wanted decays when the player stays clean — slower at night.
    if (p.wanted > 0) {
      p.wantedTimer += dt;
      const decay = state.night ? WANTED.decayNight : WANTED.decayDay;
      if (p.wantedTimer >= decay) {
        p.wanted -= 1;
        p.wantedTimer = 0;
      }
    }

    // --- Player movement ---
    // E arrives as a queued tap (takeInteract), so a quick press never falls
    // between two fixed steps and cannot enter and instantly exit again.
    const interactPressed = controls.takeInteract();
    if (p.onFoot) {
      const w = controls.walk();
      const len = Math.hypot(w.x, w.y);
      const speed = controls.nitroHeld() ? PLAYER.sprint : PLAYER.walk;
      if (len > 0.01) {
        p.angle = Math.atan2(w.y, w.x);
        p.vx = (w.x / len) * speed;
        p.vy = (w.y / len) * speed;
      } else {
        p.vx = 0;
        p.vy = 0;
      }
      const fixed = city.collide(p.x + p.vx * dt, p.y + p.vy * dt, PLAYER.radius);
      p.x = clamp(fixed.x, 16, CITY.size - 16);
      p.y = clamp(fixed.y, 16, CITY.size - 16);
      if (controls.takeAttack()) events = punch(events);
      if (interactPressed) {
        const car = nearestCar(p.x, p.y, 60);
        if (car) events = enterCar(car, events);
      }
    } else if (p.car) {
      const d = controls.drive();
      const nitroOn = controls.nitroHeld() && p.nitro > 0 && d.throttle > 0;
      if (nitroOn) {
        p.nitro = Math.max(0, p.nitro - CAR.nitroDrain * dt);
        if (random() < 0.6) {
          const bx = p.car.x - Math.cos(p.car.angle) * 26;
          const by = p.car.y - Math.sin(p.car.angle) * 26;
          state.particles.push({
            x: bx, y: by,
            vx: -Math.cos(p.car.angle) * 60 + range(random, -20, 20),
            vy: -Math.sin(p.car.angle) * 60 + range(random, -20, 20),
            life: 0.3, maxLife: 0.3, color: pick(random, ['#22e6ff', '#ff2d78', '#ffd166']),
            size: range(random, 2, 4),
          });
        }
      } else {
        p.nitro = Math.min(CAR.nitroMax, p.nitro + CAR.nitroRefill * dt);
      }
      const tuning = p.car.kind === 'comet' ? COMET : CAR;
      driveCar(p.car, d.throttle, d.steer, dt, nitroOn, tuning);
      if (collideCar(p.car, true)) events |= EVENT_CRASH;
      if (interactPressed) exitCar();
      // exitCar() clears p.car: everything below needs the car still there.
      if (p.car) {
        if (controls.takeAttack()) {
          // A drive-by shove: the car nudges rivals it touches.
          for (const rival of state.rivals) {
            if (rival.alive && dist(rival.x, rival.y, p.car.x, p.car.y) < 44) {
              rival.health -= 20;
              if (rival.health <= 0) rival.alive = false;
            }
          }
        }
        p.x = p.car.x;
        p.y = p.car.y;
        p.angle = p.car.angle;
        p.vx = Math.cos(p.car.angle) * p.car.speed;
        p.vy = Math.sin(p.car.angle) * p.car.speed;
      }
    }

    // --- The city lives on ---
    events |= updateTraffic(dt);
    events = updatePeds(dt, events);
    events = updatePolice(dt, events);
    events = spawnPolice(events);
    events = updateRivals(dt, events);
    events = updateCourier(dt, events);
    events = updateMission(dt, events);
    events = updatePickupsAndTags(dt, events);
    events = carCarCollisions(events);
    events = wreckCheck(events);

    // Particles fade.
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const pt = state.particles[i];
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      if (pt.life <= 0) state.particles.splice(i, 1);
    }

    // Wasted: no health left, wake up at the garage poorer.
    if (p.health <= 0) {
      p.health = PLAYER.health;
      p.cash = Math.max(0, p.cash - 100);
      p.wanted = 0;
      p.bust = 0;
      if (p.car) {
        p.car = null;
      }
      p.onFoot = true;
      p.x = SPOTS.garage.x;
      p.y = SPOTS.garage.y;
      say('WASTED — you wake up at the garage, $100 lighter.');
      events |= EVENT_WASTED;
    }

    return events;
  }

  function getSave() {
    return {
      cash: state.player.cash,
      missionIndex: state.mission.index,
      tags: city.tags.map((t, i) => (t.taken ? i : -1)).filter((i) => i >= 0),
    };
  }

  reset();
  return { state, city, reset, step, getSave, startMission, say };
}

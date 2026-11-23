// The things that move in Neon Bay: the player on foot and in cars, traffic,
// pedestrians, the police and their roadblocks. All updates run on the
// fixed step, so the same inputs always give the same world.

import { PLACES, ROAD, ROAD_CENTRES, TUNING, WORLD } from './config.js';
import { collideBuildings, isOnRoad, nearestRoadCentre } from './city.js';
import { angleDelta, clamp, dist } from './rng.js';

const CAR_COLORS = ['#c0392b', '#2980b9', '#f39c12', '#8e44ad', '#16a085', '#d5dbdb', '#e67e22', '#7f8c8d'];
const PED_SHIRTS = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6', '#ecf0f1'];

let nextCarId = 1;

export function makeCar(x, y, heading, kind, color) {
  return {
    id: nextCarId++,
    x, y, heading, speed: 0,
    kind, // 'traffic' | 'parked' | 'police'
    color,
    turnAt: 0, // next intersection where a traffic car may turn
    stuck: 0,
  };
}

export function createPlayer(x, y) {
  return {
    x, y, heading: -Math.PI / 2, speed: 0,
    car: null, // the car the player is driving, or null on foot
    nitro: 100,
    punchCd: 0,
    punchAnim: 0,
    channel: null, // { type: 'tag'|'grab', t, dur, target }
  };
}

export function addWanted(world, n) {
  world.wanted = clamp(world.wanted + n, 0, 5);
  world.crimeTimer = 0;
  if (world.wanted > 0) world.message = { text: `Wanted level ${world.wanted}`, t: 2.5 };
}

export function spawnTrafficCars(rng, count) {
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const vertical = rng.chance(0.5);
    const centre = rng.pick(ROAD_CENTRES);
    const along = rng.range(120, WORLD - 120);
    const heading = vertical
      ? (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2)
      : (rng.chance(0.5) ? 0 : Math.PI);
    const car = makeCar(vertical ? centre : along, vertical ? along : centre, heading, 'traffic', rng.pick(CAR_COLORS));
    car.speed = rng.range(90, 150);
    cars.push(car);
  }
  return cars;
}

export function spawnParkedCars(rng, city, count) {
  const cars = [];
  let tries = 0;
  while (cars.length < count && tries < 200) {
    tries += 1;
    const vertical = rng.chance(0.5);
    const centre = rng.pick(ROAD_CENTRES);
    const along = rng.range(150, WORLD - 150);
    const edge = rng.pick([-1, 1]);
    const x = vertical ? centre + edge * 28 : along;
    const y = vertical ? along : centre + edge * 28;
    if (cars.some((c) => dist(c.x, c.y, x, y) < 120)) continue;
    if (dist(x, y, PLACES.spawn.x, PLACES.spawn.y) < 200) continue;
    const heading = vertical ? (edge > 0 ? Math.PI / 2 : -Math.PI / 2) : (edge > 0 ? 0 : Math.PI);
    cars.push(makeCar(x, y, heading, 'parked', rng.pick(CAR_COLORS)));
  }
  return cars;
}

export function spawnPeds(rng, count) {
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const centre = rng.pick(ROAD_CENTRES);
    const along = rng.range(120, WORLD - 120);
    const vertical = rng.chance(0.5);
    peds.push({
      x: vertical ? centre + rng.pick([-32, 32]) : along,
      y: vertical ? along : centre + rng.pick([-32, 32]),
      heading: rng.range(0, Math.PI * 2),
      speed: rng.range(40, 70),
      down: 0,
      hitCd: 0,
      target: null,
      shirt: rng.pick(PED_SHIRTS),
    });
  }
  return peds;
}

export function nearestCar(world, x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of world.cars) {
    if (car.kind === 'police') continue;
    if (world.player.car === car) continue;
    const d = dist(car.x, car.y, x, y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

/** Step into the nearest car (stealing it if it is not already ours). */
export function enterCar(world, car) {
  const player = world.player;
  if (!car || player.car) return false;
  player.car = car;
  if (car.kind !== 'police') {
    if (car.kind === 'parked' || car.kind === 'traffic') {
      addWanted(world, 1);
      world.stats.carsStolen += 1;
      world.message = { text: 'Car stolen — the law is watching', t: 2.5 };
    }
    car.kind = 'player';
  }
  player.x = car.x;
  player.y = car.y;
  player.heading = car.heading;
  player.speed = 0;
  player.channel = null;
  return true;
}

/**
 * Step out of the car. The v2 bug was here: exiting dereferenced the car
 * after clearing it. This version never touches a null car — if the player
 * is not in a car it is a no-op, and the exit spot is always a free point
 * beside the car, never inside a building.
 */
export function exitCar(world) {
  const player = world.player;
  const car = player.car;
  if (!car) return false; // on foot already: nothing to do, never crash
  const spots = [
    { x: car.x - Math.sin(car.heading) * 34, y: car.y + Math.cos(car.heading) * 34 },
    { x: car.x + Math.sin(car.heading) * 34, y: car.y - Math.cos(car.heading) * 34 },
    { x: car.x - Math.cos(car.heading) * 40, y: car.y - Math.sin(car.heading) * 40 },
    { x: car.x + Math.cos(car.heading) * 40, y: car.y + Math.sin(car.heading) * 40 },
  ];
  let spot = spots[0];
  for (const s of spots) {
    if (s.x > 15 && s.x < WORLD - 15 && s.y > 15 && s.y < WORLD - 15) { spot = s; break; }
  }
  const fixed = collideBuildings(spot.x, spot.y, TUNING.playerRadius + 2, world.city.buildings);
  player.x = fixed.x;
  player.y = fixed.y;
  player.heading = car.heading;
  player.speed = 0;
  player.car = null;
  player.channel = null;
  return true;
}

/** Drive one car one step. `throttle` -1..1, `steer` -1..1, `nitro` on/off. */
export function driveCar(car, throttle, steer, nitro, dt) {
  const max = nitro && car.nitro > 0 ? TUNING.nitroMaxSpeed : TUNING.carMaxSpeed;
  if (nitro && car.nitro > 0 && throttle > 0) car.nitro = Math.max(0, car.nitro - TUNING.nitroDrain * dt);
  else car.nitro = Math.min(100, car.nitro + TUNING.nitroRefill * dt);
  if (throttle > 0) car.speed += TUNING.carAccel * throttle * dt * (nitro ? 1.6 : 1);
  else if (throttle < 0) {
    if (car.speed > 5) car.speed -= TUNING.carBrake * dt;
    else car.speed = Math.max(-TUNING.carReverseMax, car.speed + TUNING.carAccel * 0.6 * dt);
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 260 * dt);
  }
  car.speed = clamp(car.speed, -TUNING.carReverseMax, max);
  // Tighter turns at low speed (a slow car can swing around a corner),
  // wider ones flat out. Gentle enough that the car does not overshoot
  // the heading it is steering toward and spin.
  const turnRate = clamp(2.6 * (1.1 - Math.abs(car.speed) / 800), 1.0, 2.6);
  car.heading += steer * turnRate * dt * (car.speed >= 0 ? 1 : -1);
  car.x += Math.cos(car.heading) * car.speed * dt;
  car.y += Math.sin(car.heading) * car.speed * dt;
  return car;
}

/** The player's own movement, on foot or in a car. */
export function updatePlayer(world, input, dt) {
  const player = world.player;
  if (player.punchCd > 0) player.punchCd -= dt;
  if (player.punchAnim > 0) player.punchAnim -= dt;

  if (player.car) {
    const car = player.car;
    const throttle = (input.up ? 1 : 0) - (input.down ? 1 : 0);
    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    driveCar(car, throttle, steer, input.nitro, dt);
    const before = { x: car.x, y: car.y };
    const fixed = collideBuildings(car.x, car.y, TUNING.carRadius, world.city.buildings);
    if (fixed.x !== before.x || fixed.y !== before.y) {
      car.x = fixed.x;
      car.y = fixed.y;
      car.speed *= 0.55; // scrubbed speed on a wall hit
      if (Math.abs(car.speed) > 200) world.events.push({ type: 'crash', x: car.x, y: car.y });
    }
    player.x = car.x;
    player.y = car.y;
    player.heading = car.heading;
    player.speed = car.speed;
    player.nitro = car.nitro;
    return;
  }

  // On foot.
  const mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (mx !== 0 || my !== 0) {
    const len = Math.hypot(mx, my);
    const nx = (mx / len) * TUNING.footSpeed * dt;
    const ny = (my / len) * TUNING.footSpeed * dt;
    player.heading = Math.atan2(my, mx);
    const fixed = collideBuildings(player.x + nx, player.y + ny, TUNING.playerRadius, world.city.buildings);
    player.x = fixed.x;
    player.y = fixed.y;
    player.speed = TUNING.footSpeed;
  } else {
    player.speed = 0;
  }
}

export function punch(world) {
  const player = world.player;
  if (player.car || player.punchCd > 0) return;
  player.punchCd = TUNING.punchCooldown;
  player.punchAnim = 0.25;
  const fx = player.x + Math.cos(player.heading) * 22;
  const fy = player.y + Math.sin(player.heading) * 22;
  for (const ped of world.peds) {
    if (ped.down > 0) continue;
    if (dist(ped.x, ped.y, fx, fy) < TUNING.punchRange) {
      ped.down = 2;
      addWanted(world, 1);
      world.message = { text: 'Assault — wanted level up', t: 2 };
      world.events.push({ type: 'punch', x: ped.x, y: ped.y });
    }
  }
}

export function updateTraffic(world, dt) {
  for (const car of world.cars) {
    if (car.kind !== 'traffic') continue;
    // A car ahead on the same road: slow down instead of rear-ending it.
    let slow = false;
    for (const other of world.cars) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const ahead = dx * Math.cos(car.heading) + dy * Math.sin(car.heading);
      const side = Math.abs(-dx * Math.sin(car.heading) + dy * Math.cos(car.heading));
      if (ahead > 0 && ahead < 70 && side < 30) { slow = true; break; }
    }
    const targetSpeed = slow ? 0 : 120;
    if (car.speed < targetSpeed) car.speed = Math.min(targetSpeed, car.speed + 200 * dt);
    else if (car.speed > targetSpeed) car.speed = Math.max(targetSpeed, car.speed - 300 * dt);
    car.x += Math.cos(car.heading) * car.speed * dt;
    car.y += Math.sin(car.heading) * car.speed * dt;
    // At an intersection, sometimes turn; at the edge, turn around.
    const onX = Math.abs(car.x - nearestRoadCentre(car.x)) < 6;
    const onY = Math.abs(car.y - nearestRoadCentre(car.y)) < 6;
    if (onX && onY && car.turnAt <= 0) {
      car.turnAt = 1.2;
      const r = world.rng.next();
      if (r < 0.3) car.heading += Math.PI / 2;
      else if (r < 0.6) car.heading -= Math.PI / 2;
    }
    if (car.turnAt > 0) car.turnAt -= dt;
    if (car.x < 60 || car.x > WORLD - 60 || car.y < 60 || car.y > WORLD - 60) {
      car.heading += Math.PI;
      car.x = clamp(car.x, 60, WORLD - 60);
      car.y = clamp(car.y, 60, WORLD - 60);
    }
    // Keep traffic on its road: nudge back onto the centre line.
    if (Math.abs(Math.sin(car.heading)) < 0.5) car.y += (nearestRoadCentre(car.y) - car.y) * Math.min(1, 2 * dt);
    else car.x += (nearestRoadCentre(car.x) - car.x) * Math.min(1, 2 * dt);
  }
}

export function updatePeds(world, dt) {
  for (const ped of world.peds) {
    if (ped.hitCd > 0) ped.hitCd -= dt;
    if (ped.down > 0) { ped.down -= dt; continue; }
    if (!ped.target || dist(ped.x, ped.y, ped.target.x, ped.target.y) < 12) {
      const centre = world.rng.pick(ROAD_CENTRES);
      const along = world.rng.range(120, WORLD - 120);
      const vertical = world.rng.chance(0.5);
      ped.target = vertical
        ? { x: centre + world.rng.pick([-38, 38]), y: along }
        : { x: along, y: centre + world.rng.pick([-38, 38]) };
    }
    const heading = Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x);
    ped.heading = heading;
    const nx = ped.x + Math.cos(heading) * ped.speed * dt;
    const ny = ped.y + Math.sin(heading) * ped.speed * dt;
    const fixed = collideBuildings(nx, ny, 9, world.city.buildings);
    ped.x = fixed.x;
    ped.y = fixed.y;
    // Run over by the player's fast car: the ped goes down and the law
    // notices. (Only the player's car counts — a traffic car hitting a
    // ped is not the player's crime.)
    const pc = world.player.car;
    if (pc && pc.speed > 80 && ped.hitCd <= 0 && dist(pc.x, pc.y, ped.x, ped.y) < 20) {
      ped.down = 2.5;
      ped.hitCd = 3;
      addWanted(world, 1);
      world.message = { text: 'Pedestrian hit — wanted level up', t: 2 };
      world.events.push({ type: 'pedhit', x: ped.x, y: ped.y });
    }
  }
}

/** Police: spawn to match the wanted level, chase, and fill the bust meter. */
export function updatePolice(world, dt) {
  const wanted = world.wanted;
  const target = wanted === 0 ? 0 : wanted <= 1 ? 1 : wanted === 2 ? 2 : wanted === 3 ? 3 : wanted === 4 ? 4 : 5;
  while (world.police.length < target) {
    const angle = world.rng.range(0, Math.PI * 2);
    const d = world.rng.range(650, 850);
    const x = clamp(world.player.x + Math.cos(angle) * d, 80, WORLD - 80);
    const y = clamp(world.player.y + Math.sin(angle) * d, 80, WORLD - 80);
    const car = makeCar(x, y, Math.atan2(world.player.y - y, world.player.x - x), 'police', '#1c2733');
    car.speed = 200;
    world.police.push(car);
    world.cars.push(car);
  }
  while (world.police.length > target) {
    const car = world.police.pop();
    const i = world.cars.indexOf(car);
    if (i >= 0) world.cars.splice(i, 1);
  }

  let nearest = Infinity;
  for (const cop of world.police) {
    // Intercept: aim at where the player will be, not where they are.
    const px = world.player.x + Math.cos(world.player.heading) * world.player.speed * 0.45;
    const py = world.player.y + Math.sin(world.player.heading) * world.player.speed * 0.45;
    const want = Math.atan2(py - cop.y, px - cop.x);
    const turn = clamp(angleDelta(cop.heading, want), -1, 1);
    cop.heading += turn * 3.1 * dt;
    cop.speed = Math.min(TUNING.policeMaxSpeed, cop.speed + 300 * dt);
    cop.x += Math.cos(cop.heading) * cop.speed * dt;
    cop.y += Math.sin(cop.heading) * cop.speed * dt;
    const fixed = collideBuildings(cop.x, cop.y, TUNING.carRadius, world.city.buildings);
    if (fixed.x !== cop.x || fixed.y !== cop.y) {
      cop.x = fixed.x;
      cop.y = fixed.y;
      cop.speed *= 0.6;
      cop.heading += 0.5; // slide along the wall instead of grinding it
    }
    const d = dist(cop.x, cop.y, world.player.x, world.player.y);
    if (d < nearest) nearest = d;
    // A cop that rams the player's car nudges it, but does not stop it: a
    // single touch must never be a death spiral.
    if (world.player.car && d < 30 && cop.speed > 200) {
      world.player.car.speed *= 0.88;
      world.events.push({ type: 'ram', x: cop.x, y: cop.y });
    }
  }

  // The bust meter only fills while the player is stopped or on foot and a
  // cop is right there; a moving getaway drains it. (v2 filled it at any
  // speed, so a single touch from a cop could end a run.)
  const slow = !world.player.car || Math.abs(world.player.speed) < 25;
  if (world.police.length > 0 && nearest < 75 && slow) {
    world.bust = clamp(world.bust + TUNING.bustFill * dt, 0, 1);
  } else {
    world.bust = clamp(world.bust - TUNING.bustDrain * dt, 0, 1);
  }
  if (world.bust >= 1) world.busted = true;
}

/** Roadblocks: at wanted 3+, a barrier across the road ahead of the player. */
export function updateRoadblocks(world, dt) {
  world.roadblockTimer -= dt;
  if (world.wanted >= 3 && world.roadblockTimer <= 0 && world.roadblocks.length < 2) {
    world.roadblockTimer = 22;
    const p = world.player;
    const ahead = 420;
    const x = clamp(p.x + Math.cos(p.heading) * ahead, 120, WORLD - 120);
    const y = clamp(p.y + Math.sin(p.heading) * ahead, 120, WORLD - 120);
    const vertical = Math.abs(Math.sin(p.heading)) > Math.abs(Math.cos(p.heading));
    world.roadblocks.push({
      x: nearestRoadCentre(x), y: nearestRoadCentre(y),
      vertical, broken: false, life: 1,
    });
    world.message = { text: 'Roadblock ahead!', t: 2.5 };
  }
  // The player's car meeting a barrier.
  const car = world.player.car;
  if (car) {
    for (const rb of world.roadblocks) {
      if (rb.broken) continue;
      const dx = car.x - rb.x;
      const dy = car.y - rb.y;
      const across = rb.vertical ? Math.abs(dx) : Math.abs(dy);
      const along = rb.vertical ? Math.abs(dy) : Math.abs(dx);
      if (across < 26 && along < ROAD / 2) {
        if (Math.abs(car.speed) > TUNING.roadblockMinSpeed) {
          // Fast enough: smash straight through it.
          rb.broken = true;
          car.speed *= 0.82;
          world.events.push({ type: 'breakthrough', x: rb.x, y: rb.y });
          world.message = { text: 'Roadblock smashed!', t: 2 };
        } else {
          // Too slow: the barrier holds, the car bounces off it.
          car.speed *= -0.35;
          if (rb.vertical) car.x = rb.x + Math.sign(dx || 1) * 28;
          else car.y = rb.y + Math.sign(dy || 1) * 28;
          world.events.push({ type: 'blocked', x: rb.x, y: rb.y });
        }
      }
    }
  }
}

/** Push overlapping cars apart (traffic, police and the player's car). */
export function separateCars(world) {
  const cars = world.cars;
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = TUNING.carRadius * 2 - 2;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        a.speed *= 0.96;
        b.speed *= 0.96;
      }
    }
  }
}

/** Wanted level decays when the player has been clean and unseen a while. */
export function updateWantedDecay(world, dt) {
  if (world.wanted === 0) return;
  world.crimeTimer += dt;
  if (world.crimeTimer < TUNING.wantedDecayDelay) return;
  world.decayTimer += dt;
  if (world.decayTimer >= TUNING.wantedDecayEvery) {
    world.decayTimer = 0;
    const near = world.police.some((c) => dist(c.x, c.y, world.player.x, world.player.y) < 400);
    if (!near) {
      world.wanted -= 1;
      world.message = { text: `Heat cooling off — wanted ${world.wanted}`, t: 2 };
    }
  }
}

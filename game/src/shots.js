// The screenshot scenes behind ?shot=start|play|chase|end, and the autopilot
// that drives them. Each scene plays the real rules forward from a fresh
// world for a fixed number of steps, so the frame is what a short game
// really looks like and the same seed always gives the same frame. The
// playtests use the same autopilot to drive the missions.

import { PITCH, ROAD_CENTRES, STEP } from './config.js';
import { enterCar, exitCar, nearestCar } from './entities.js';
import { nearestRoadCentre } from './city.js';
import { angleDelta, clamp, dist } from './rng.js';
import { SCREEN_COMPLETE, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 24;
const CHASE_SECONDS = 14;
const END_LIMIT_SECONDS = 600;

/** First step of a breadth-first search on the intersection grid, from
 * (sx, sy) to (gx, gy). Returns the first intersection on the shortest
 * path (or the goal itself when already there). */
function bfsStep(sx, sy, gx, gy) {
  const key = (x, y) => `${x},${y}`;
  const prev = new Map();
  const queue = [[sx, sy]];
  prev.set(key(sx, sy), null);
  while (queue.length > 0) {
    const [x, y] = queue.shift();
    if (x === gx && y === gy) break;
    for (const [nx, ny] of [[x + PITCH, y], [x - PITCH, y], [x, y + PITCH], [x, y - PITCH]]) {
      if (!ROAD_CENTRES.includes(nx) || !ROAD_CENTRES.includes(ny)) continue;
      if (prev.has(key(nx, ny))) continue;
      prev.set(key(nx, ny), [x, y]);
      queue.push([nx, ny]);
    }
  }
  let cur = [gx, gy];
  let step = cur;
  while (cur && !(cur[0] === sx && cur[1] === sy)) {
    step = cur;
    cur = prev.get(key(cur[0], cur[1]));
  }
  return step;
}

/** Next road-grid waypoint toward a target: the next intersection on the
 * shortest path (BFS) to the target's corner. Waypoints always lie on the
 * road the player is already on, so the player moves axis-aligned along
 * roads and never cuts diagonally across a block into a building. */
function driveWaypoint(p, tx, ty) {
  // Close to the target: go straight to it, even if it sits off the road
  // grid (a tag spot on a sidewalk, the compound between intersections).
  // Kept short on purpose: from far away the straight line can cross a
  // building, and the player would wedge against it instead of routing
  // around on the roads.
  if (dist(p.x, p.y, tx, ty) < 90) return { x: tx, y: ty };
  // On the same road as the target (same row or same column): head for the
  // point on the road centre at the target's position, so the player walks
  // along the road and only cuts toward the target (a sidewalk spot, the
  // compound) for the last short hop — walking straight at it from here
  // would cut the corner into a building. The 80px slack covers spots on
  // the sidewalk, which can sit ~60px off the road centre line; 44px is
  // the road half-width, so a player inside the road band counts as on
  // the road.
  const rowY = nearestRoadCentre(p.y);
  const colX = nearestRoadCentre(p.x);
  if (Math.abs(ty - rowY) < 80 && Math.abs(p.y - rowY) < 44) return { x: tx, y: rowY };
  if (Math.abs(tx - colX) < 80 && Math.abs(p.x - colX) < 44) return { x: colX, y: ty };
  const cx = nearestRoadCentre(tx);
  const cy = nearestRoadCentre(ty);
  const ix = nearestRoadCentre(p.x);
  const iy = nearestRoadCentre(p.y);
  // At an intersection: BFS to the target's corner, take the first step.
  // (60px, wider than the 44px road half-width, so there is no gap where
  // the player is near an intersection but "off-road" and gets sent back.)
  if (dist(p.x, p.y, ix, iy) <= 60) {
    const step = bfsStep(ix, iy, cx, cy);
    return { x: step[0], y: step[1] };
  }
  // Between intersections, on a horizontal road: head for the adjacent
  // intersection in the direction of the target's column, staying on
  // this road. (44px is the road half-width.)
  const onH = Math.abs(p.y - iy) < 44;
  const onV = Math.abs(p.x - ix) < 44;
  if (onH && !onV) {
    const nx = cx >= p.x ? ix + PITCH : ix - PITCH;
    if (ROAD_CENTRES.includes(nx)) return { x: nx, y: iy };
    return { x: ix, y: iy };
  }
  if (onV && !onH) {
    const ny = cy >= p.y ? iy + PITCH : iy - PITCH;
    if (ROAD_CENTRES.includes(ny)) return { x: ix, y: ny };
    return { x: ix, y: iy };
  }
  // Off-road (or at a crossing): close the larger gap first, axis-aligned,
  // so the player gets back onto a road instead of cutting across a block.
  if (Math.abs(p.x - ix) > Math.abs(p.y - iy)) return { x: ix, y: p.y };
  return { x: p.x, y: iy };
}

/** Held keys that walk toward a point (axis-aligned keys, diagonals allowed). */
function walkKeys(p, tx, ty) {
  const dx = tx - p.x;
  const dy = ty - p.y;
  return {
    up: dy < -6, down: dy > 6,
    left: dx < -6, right: dx > 6,
    nitro: false, interact: false,
  };
}

/** Held keys that drive a car toward a point. A speed controller brakes for
 * sharp turns (so the car stays on the road) and opens up on straights; the
 * car always turns forward — reversing is only for getting unwedged, which
 * the autopilot handles separately. It also slows down near any junction,
 * because a fast car cannot make a 90° turn inside a 90px road. */
function driveKeys(car, tx, ty, wantNitro) {
  const desired = Math.atan2(ty - car.y, tx - car.x);
  const delta = angleDelta(car.heading, desired);
  const d = dist(car.x, car.y, tx, ty);
  const keys = { up: false, down: false, left: false, right: false, nitro: false, interact: false };
  let targetSpeed = Math.abs(delta) > 1.2 ? 160 : Math.abs(delta) > 0.5 ? 300 : 320;
  const ix = nearestRoadCentre(car.x);
  const iy = nearestRoadCentre(car.y);
  // Slow near any junction: braking from 320 takes ~70px, and a 90° turn
  // needs a tight radius or the car overshoots the corner. 200 still
  // clips the wall on a turn, but the wall slides the car around it.
  if (dist(car.x, car.y, ix, iy) < 110) targetSpeed = Math.min(targetSpeed, 200);
  if (car.speed < targetSpeed) keys.up = true;
  else if (car.speed > targetSpeed + 40) keys.down = true;
  keys.left = delta < -0.1;
  keys.right = delta > 0.1;
  keys.nitro = wantNitro && Math.abs(delta) < 0.3 && d > 400 && car.speed > 200;
  return keys;
}

/**
 * One autopilot step: look at the active mission, work out what the player
 * should be doing (steal a car, drive, tag, grab, escape) and return the
 * held keys for this step. Edge actions (enter/exit a car) happen here
 * directly, because the autopilot drives the world, not the keyboard.
 */
export function computeAutopilot(world) {
  const p = world.player;
  const m = world.mission;
  const idle = { up: false, down: false, left: false, right: false, nitro: false, interact: false };

  // Channeling (spraying a tag, grabbing the ledger): stand still and hold E.
  if (p.channel) return { ...idle, interact: true };
  if (m.index >= 4 || m.failed) return idle;

  // Stuck recovery: if the car has barely moved in 2 s, back straight up
  // for a second to unwedge it, then drive on.
  if (p.car) {
    const s = world.autoStuck || (world.autoStuck = { x: p.x, y: p.y, t: 0, reverseT: 0 });
    if (s.reverseT > 0) {
      s.reverseT -= STEP;
      return { up: false, down: true, left: false, right: false, nitro: false, interact: false };
    }
    s.t += STEP;
    if (s.t >= 2) {
      if (dist(p.x, p.y, s.x, s.y) < 6 && Math.abs(p.speed) < 30) s.reverseT = 1;
      s.x = p.x;
      s.y = p.y;
      s.t = 0;
    }
  }

  // Mission 3 is done on foot: get out of the car near a tag spot.
  if (m.index === 2) {
    const spot = world.city.tagSpots.find((s) => !s.done);
    if (!spot) return idle;
    const d = dist(p.x, p.y, spot.x, spot.y);
    if (p.car) {
      if (d < 110) { exitCar(world); return idle; }
      const wp = driveWaypoint(p, spot.x, spot.y);
      return driveKeys(p.car, wp.x, wp.y, false);
    }
    if (d < 40) return { ...idle, interact: true };
    const wp = driveWaypoint(p, spot.x, spot.y);
    return walkKeys(p, wp.x, wp.y);
  }

  // Mission 4's grab is done on foot too: walk up to the compound and hold E.
  // (This must come before the steal-a-car branch, or the pilot would climb
  // straight back into the car it just left.)
  if (m.index === 3 && m.stage === 'go' && !p.car) {
    const target = m.target;
    if (!target) return idle;
    if (dist(p.x, p.y, target.x, target.y) < 46) return { ...idle, interact: true };
    const wp = driveWaypoint(p, target.x, target.y);
    return walkKeys(p, wp.x, wp.y);
  }

  // Every other mission is driven. On foot, go and steal the nearest car.
  if (!p.car) {
    const car = nearestCar(world, p.x, p.y, 400);
    if (!car) return idle;
    if (dist(p.x, p.y, car.x, car.y) < 48) {
      enterCar(world, car);
      return idle;
    }
    const wp = driveWaypoint(p, car.x, car.y);
    return walkKeys(p, wp.x, wp.y);
  }

  // In a car: drive to the mission target. Mission 4's grab needs a stop
  // on foot at the compound first.
  const target = m.target;
  if (!target) return idle;
  if (m.index === 3 && m.stage === 'go' && dist(p.x, p.y, target.x, target.y) < 95) {
    exitCar(world);
    return idle;
  }
  const wp = driveWaypoint(p, target.x, target.y);
  return driveKeys(p.car, wp.x, wp.y, true);
}

/** Run the world forward `seconds` with the autopilot at the wheel. */
export function autoplay(world, seconds, stepWorld) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    stepWorld(world, computeAutopilot(world), STEP);
  }
}

/** Run the world forward `seconds` with no input at all (traffic rolls, the player stands). */
export function idleplay(world, seconds, stepWorld) {
  const idle = { up: false, down: false, left: false, right: false, nitro: false, interact: false };
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    stepWorld(world, idle, STEP);
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * start: the title over the city at dusk. play: the courier run mid-delivery.
 * chase: three stars with the police on the tail. end: the story complete.
 */
export function stageShot(name, world, stepWorld, startMissionFn) {
  if (name === 'play') {
    startMissionFn(world, 1);
    const car = world.cars.find((c) => c.kind === 'parked');
    if (car) {
      enterCar(world, car);
      car.speed = 250; // already rolling, so the chase starts at speed
    }
    autoplay(world, PLAY_SECONDS, stepWorld);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'chase') {
    startMissionFn(world, 3);
    world.mission.stage = 'escape';
    world.mission.target = { x: world.city.places.safehouse.x, y: world.city.places.safehouse.y, label: 'Safehouse' };
    const car = world.cars.find((c) => c.kind === 'parked');
    if (car) enterCar(world, car);
    world.wanted = 3;
    world.crimeTimer = 0;
    // Start the escape at the compound, far from the safehouse, so the
    // 14-second chase does not reach it mid-shot.
    if (world.player.car) {
      const c = world.player.car;
      c.x = 1700; c.y = 415; c.heading = Math.PI; c.speed = 220;
      world.player.x = c.x; world.player.y = c.y; world.player.heading = c.heading;
    }
    autoplay(world, CHASE_SECONDS, stepWorld);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'end') {
    world.mission.index = 4;
    world.mission.stage = 'done';
    world.mission.target = null;
    world.storyDone = true;
    world.cash = 2400;
    world.stats.missionsDone = 4;
    world.stats.tagsDone = 8;
    // No car, no crime: the city just moves behind the panel.
    idleplay(world, 6, stepWorld);
    return { screen: SCREEN_COMPLETE };
  }
  // start (and anything else): a quiet moment on the title screen. The
  // player stands at spawn and the traffic rolls by — no autopilot here,
  // or the pilot would steal a car and get busted before the title shows.
  idleplay(world, START_SECONDS, stepWorld);
  return { screen: SCREEN_TITLE };
}

// Exported for the playtest/diag tools, which probe the autopilot's decisions.
export { driveWaypoint, driveKeys };

// The screenshot scenes behind ?shot=start|play|chase|end. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a simple
// road-following autopilot, so the frame is what a short game really looks like and
// the same seed always gives the same frame.

import { STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 24;
const CHASE_SECONDS = 9;

/** A controls object that does nothing — the title backdrop just lets the city live. */
function neutralControls() {
  return {
    drive: () => ({ throttle: 0, steer: 0 }),
    walk: () => ({ x: 0, y: 0 }),
    nitroHeld: () => false,
    takeInteract: () => false,
    takeAttack: () => false,
    takeActions: () => 0,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * An autopilot that drives the player's car along the road grid toward a waypoint:
 * first along the current road to the target's road, then down it. It steers toward
 * the next waypoint and eases off the throttle when it must turn sharply.
 */
function roadPilot(world) {
  let waypoints = null;
  function buildWaypoints() {
    const p = world.state.player;
    const t = world.state.mission.target;
    const px = p.onFoot ? p.x : p.car.x;
    const py = p.onFoot ? p.y : p.car.y;
    // Nearest road centreline to the player on each axis, then to the target.
    const roads = [0, 264, 528, 792, 1056, 1320];
    const nearest = (v) => roads.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
    const rx = nearest(px);
    const ry = nearest(py);
    const tx = nearest(t.x);
    const ty = nearest(t.y);
    waypoints = [
      { x: rx, y: ry },
      { x: tx, y: ry },
      { x: tx, y: ty },
      { x: t.x, y: t.y },
    ];
  }
  buildWaypoints();
  return {
    drive() {
      const p = world.state.player;
      if (!p.car) return { throttle: 0, steer: 0 };
      let wp = waypoints[0];
      while (waypoints.length > 1 && Math.hypot(wp.x - p.car.x, wp.y - p.car.y) < 50) {
        waypoints.shift();
        wp = waypoints[0];
      }
      const want = Math.atan2(wp.y - p.car.y, wp.x - p.car.x);
      const turn = angleDiff(want, p.car.angle);
      const steer = clamp(turn * 1.6, -1, 1);
      const throttle = Math.abs(turn) > 1.1 ? 0.3 : 1;
      return { throttle, steer };
    },
    walk: () => ({ x: 0, y: 0 }),
    nitroHeld: () => false,
    takeInteract: () => false,
    takeAttack: () => false,
    takeActions: () => 0,
  };
}

function putPlayerInCar(world) {
  const p = world.state.player;
  const own = world.state.cars.find((c) => c.id === 'own');
  p.onFoot = false;
  p.car = own;
  own.parked = false;
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * start: the title over a living city. play: Rook driving to the docks for job one.
 * chase: night, wanted 4, police and a roadblock. end: the story complete screen.
 */
export function stageShot(name, world) {
  world.reset();
  const controls = neutralControls();
  if (name !== 'play' && name !== 'chase' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, controls);
    return { screen: SCREEN_TITLE };
  }
  if (name === 'play') {
    putPlayerInCar(world);
    const pilot = roadPilot(world);
    for (let i = 0; i < PLAY_SECONDS / STEP; i += 1) world.step(STEP, pilot);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'chase') {
    // Night, wanted 4, a chase already in progress: the car is tough for the
    // staging so the scene survives its own police, and the roadblock spawns
    // ahead on the road as the car drives east toward the docks.
    world.state.elapsed = 0.8 * 240;
    putPlayerInCar(world);
    world.state.player.car.health = 500;
    world.state.player.health = 500;
    world.state.player.wanted = 4;
    world.state.player.x = 660;
    world.state.player.y = 792;
    world.state.player.car.x = 660;
    world.state.player.car.y = 792;
    world.state.player.car.angle = 0;
    const pilot = roadPilot(world);
    for (let i = 0; i < CHASE_SECONDS / STEP; i += 1) world.step(STEP, pilot);
    return { screen: SCREEN_PLAY };
  }
  // end: the ledger delivered, the story done, tags collected.
  world.state.player.cash = 4400;
  world.state.player.x = 1300;
  world.state.player.y = 660;
  for (const tag of world.city.tags) tag.taken = true;
  world.state.tagsTaken = 8;
  world.state.mission.index = 4;
  world.state.storyComplete = true;
  world.state.mission.text = 'Story complete — Neon Bay is yours, Rook.';
  for (let i = 0; i < 3 / STEP; i += 1) world.step(STEP, controls);
  return { screen: SCREEN_WIN };
}

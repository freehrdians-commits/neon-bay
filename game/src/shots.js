// The screenshot scenes behind ?shot=start|play|chase|end. Each one resets the world and then
// sets up a real state through the world's own helpers — a car placed and driven, police
// spawned, a roadblock staged, the story finished — and steps it a few frames, so the frame is
// what the game really looks like and the same seed always gives the same frame.

import { PLACES } from './city.js';
import { SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const IDLE = { mx: 0, my: 0, sneak: false, nitro: false, brake: false, aimAngle: 0, shooting: false, actions: 0 };
const DRIVE = { mx: 0, my: -1, sneak: false, nitro: true, brake: false, aimAngle: 0, shooting: false, actions: 0 };

function stepFor(world, seconds, controls) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) world.step(1 / 60, controls);
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * start: the title over a living city at dusk. play: driving with nitro, wanted 2, police
 * behind. chase: wanted 4 at night, a roadblock across the road ahead. end: the story
 * complete at the docks.
 */
export function stageShot(name, world) {
  const state = world.state;
  if (name === 'play') {
    world.reset();
    state.timeOfDay = 0.58;
    world.setMission(0, 1);
    world.placePlayerCar(420, 576, 0);
    const car = state.player.inCar;
    car.speed = 300;
    world.setWanted(2);
    world.spawnPoliceAt(240, 576);
    world.spawnPoliceAt(700, 320);
    stepFor(world, 1.2, DRIVE);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'chase') {
    world.reset();
    state.timeOfDay = 0.78;
    world.setMission(3, 0);
    world.placePlayerCar(420, 576, 0);
    const car = state.player.inCar;
    car.speed = 320;
    car.nitro = 62;
    world.setWanted(4);
    world.spawnRoadblockAt(800, 576, 0);
    world.spawnPoliceAt(240, 576);
    world.spawnPoliceAt(640, 320);
    world.spawnPoliceAt(900, 832);
    stepFor(world, 0.8, DRIVE);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'end') {
    world.reset();
    state.timeOfDay = 0.58;
    world.setMission(4, 0);
    state.mission = 4;
    state.storyComplete = true;
    state.cash = 4925;
    for (const tag of state.tags) tag.got = true;
    state.tagsGot = state.tags.length;
    world.placePlayer(PLACES.docks.x, PLACES.docks.y - 40, -Math.PI / 2);
    stepFor(world, 0.5, IDLE);
    state.storyComplete = true;
    return { screen: SCREEN_WIN };
  }
  // start (and any other name): the title over the city at dusk, traffic moving.
  world.reset();
  state.timeOfDay = 0.58;
  stepFor(world, 5, IDLE);
  return { screen: SCREEN_TITLE };
}

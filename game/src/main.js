// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. Screens: title, play, paused, missions,
// failed and complete.
//
// ?seed=N fixes the city and the traffic. ?shot=start|play|chase|end (with
// &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot.

import { DAY_LENGTH, MISSIONS, PLACES, STEP, TUNING } from './config.js';
import { createRng } from './rng.js';
import { buildCity } from './city.js';
import {
  addWanted, createPlayer, enterCar, exitCar, nearestCar, punch,
  separateCars, spawnParkedCars, spawnPeds, spawnTrafficCars,
  updatePeds, updatePlayer, updatePolice, updateRoadblocks, updateTraffic,
  updateWantedDecay,
} from './entities.js';
import { applyBusted, createMissionState, failMission, startMission, updateMission } from './missions.js';
import {
  ACTION_CONFIRM, ACTION_INTERACT, ACTION_MISSIONS, ACTION_PAUSE, ACTION_PUNCH,
  ACTION_SAVE, createInput,
} from './input.js';
import { createAudio } from './audio.js';
import {
  SCREEN_COMPLETE, SCREEN_FAILED, SCREEN_MISSIONS, SCREEN_PAUSED, SCREEN_PLAY,
  SCREEN_TITLE, createRenderer,
} from './render.js';
import { computeAutopilot, driveWaypoint, stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

/** Build a fresh world: city, cars, peds, player and mission 1. */
export function createWorld(seedValue) {
  const rng = createRng(seedValue);
  const city = buildCity(seedValue);
  const world = {
    seed: seedValue,
    rng,
    city,
    time: 0,
    player: createPlayer(PLACES.spawn.x, PLACES.spawn.y),
    cars: [...spawnTrafficCars(rng, 8), ...spawnParkedCars(rng, city, 6)],
    peds: spawnPeds(rng, 14),
    police: [],
    roadblocks: [],
    roadblockTimer: 10,
    particles: [],
    events: [],
    wanted: 0,
    bust: 0,
    busted: false,
    crimeTimer: 0,
    decayTimer: 0,
    cash: 50,
    bestCash: 0,
    mission: createMissionState(),
    missionDefs: MISSIONS,
    missionDef: MISSIONS[0],
    storyDone: false,
    saveDirty: false,
    stats: { missionsDone: 0, carsStolen: 0, tagsDone: 0 },
    message: null,
  };
  startMission(world, 0);
  return world;
}

function burst(world, x, y, color, n) {
  for (let i = 0; i < n; i += 1) {
    const a = world.rng.range(0, Math.PI * 2);
    const s = world.rng.range(40, 160);
    world.particles.push({
      x, y,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0.6, max: 0.6, color,
    });
  }
}

/** Advance the simulation one fixed step. Pure: no DOM, no input devices. */
export function stepWorld(world, keys, dt) {
  world.time += dt;
  updatePlayer(world, keys, dt);
  updateTraffic(world, dt);
  updatePeds(world, dt);
  updatePolice(world, dt);
  updateRoadblocks(world, dt);
  separateCars(world);
  updateWantedDecay(world, dt);
  updateMission(world, keys, dt);
  world.missionDef = MISSIONS[world.mission.index] || null;
  if (world.message) {
    world.message.t -= dt;
    if (world.message.t <= 0) world.message = null;
  }
  // Turn the step's events into particles and sounds the loop will play.
  for (const ev of world.events) {
    if (ev.type === 'crash' || ev.type === 'ram') burst(world, ev.x, ev.y, '#ffcf3f', 8);
    else if (ev.type === 'breakthrough') burst(world, ev.x, ev.y, '#ff3b30', 16);
    else if (ev.type === 'tagged') burst(world, ev.x, ev.y, '#39ff6a', 12);
    else if (ev.type === 'delivered' || ev.type === 'mission-complete') burst(world, world.player.x, world.player.y, '#19e3ff', 14);
  }
  world.events.length = 0;
  for (let i = world.particles.length - 1; i >= 0; i -= 1) {
    const pt = world.particles[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
    if (pt.life <= 0) world.particles.splice(i, 1);
  }
  if (world.busted) applyBusted(world);
  if (world.saveDirty) {
    world.saveDirty = false;
    saveGame(world);
  }
}

function readSave() {
  try {
    const raw = window.localStorage.getItem(TUNING.saveKey);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

function saveGame(world) {
  try {
    const data = {
      cash: world.cash,
      unlocked: Math.max(world.mission.index, world.stats.missionsDone),
      completed: world.mission.completed,
      bestCash: Math.max(world.bestCash, world.cash),
    };
    window.localStorage.setItem(TUNING.saveKey, JSON.stringify(data));
    world.bestCash = data.bestCash;
  } catch {
    // Storage can be off: the save then lasts this visit only.
  }
}

function loadSaveInto(world, data) {
  if (!data) return;
  world.cash = data.cash || 0;
  world.bestCash = data.bestCash || 0;
  if (Array.isArray(data.completed)) {
    for (let i = 0; i < 4; i += 1) world.mission.completed[i] = !!data.completed[i];
  }
  const unlocked = Math.min(3, data.unlocked || 0);
  startMission(world, unlocked);
}

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const world = createWorld(seed);
const renderer = createRenderer(canvas);
const audio = createAudio();

function runShot(name) {
  const scene = stageShot(name, world, stepWorld, startMission);
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput();
  const saved = readSave();
  if (saved) loadSaveInto(world, saved);
  let screen = SCREEN_TITLE;
  let autopilot = false;
  let accumulator = 0;
  let last = performance.now();
  const menuKeys = new Set();

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyC') menuKeys.add('continue');
    if (event.code.startsWith('Digit')) menuKeys.add(event.code);
    audio.unlock();
  });
  canvas.addEventListener('pointerdown', () => {
    audio.unlock();
    input.press(ACTION_CONFIRM);
  });

  function announce(message) {
    statusEl.textContent = message;
  }

  function toPlay() {
    screen = SCREEN_PLAY;
    announce('Playing Neon Bay.');
  }

  function retryMission() {
    const index = Math.min(3, world.mission.index);
    startMission(world, index);
    world.mission.failed = null;
    toPlay();
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_PUNCH && screen === SCREEN_PLAY) {
      punch(world);
      audio.blip();
    }
    if (actions & ACTION_INTERACT && screen === SCREEN_PLAY) {
      const p = world.player;
      if (p.car) exitCar(world);
      else {
        const car = nearestCar(world, p.x, p.y, 55);
        if (car) enterCar(world, car);
      }
    }
    if (actions & ACTION_SAVE && screen === SCREEN_PLAY) {
      saveGame(world);
      world.message = { text: 'Game saved', t: 2 };
    }
    if (actions & ACTION_MISSIONS && (screen === SCREEN_PLAY || screen === SCREEN_TITLE)) {
      screen = SCREEN_MISSIONS;
      announce('Missions.');
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) { screen = SCREEN_PAUSED; announce('Paused.'); }
      else if (screen === SCREEN_PAUSED) toPlay();
      else if (screen === SCREEN_MISSIONS) screen = SCREEN_TITLE;
    }
    if (actions & ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE) toPlay();
      else if (screen === SCREEN_FAILED) retryMission();
      else if (screen === SCREEN_COMPLETE) toPlay();
    }
    if (menuKeys.has('continue') && screen === SCREEN_TITLE && saved) {
      menuKeys.delete('continue');
      toPlay();
    } else {
      menuKeys.delete('continue');
    }
    if (screen === SCREEN_MISSIONS) {
      for (const code of ['Digit1', 'Digit2', 'Digit3', 'Digit4']) {
        if (!menuKeys.has(code)) continue;
        menuKeys.delete(code);
        const index = Number(code.slice(5)) - 1;
        const unlocked = world.mission.completed[index] || index <= world.mission.index;
        if (unlocked) {
          startMission(world, index);
          toPlay();
        }
      }
    } else {
      menuKeys.clear();
    }
  }

  function step() {
    const keys = autopilot ? computeAutopilot(world) : input;
    const before = world.events.length;
    stepWorld(world, keys, STEP);
    // Play a sound for the step's notable events.
    void before;
    if (screen === SCREEN_PLAY && world.mission.failed) screen = SCREEN_FAILED;
    else if (screen === SCREEN_PLAY && world.storyDone && world.mission.index >= 4) screen = SCREEN_COMPLETE;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world, screen);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  // The debug hook the playtests drive the game through: the world, the
  // autopilot switch, and the pieces a test needs to start a mission.
  window.__NEONBAY__ = {
    world,
    stepWorld,
    autopilot: () => computeAutopilot(world),
    waypoint: (x, y) => driveWaypoint(world.player, x, y),
    startMission: (index) => startMission(world, index),
    setAutopilot: (on) => { autopilot = !!on; },
    get screen() { return screen; },
    setScreen: (s) => { screen = s; },
    saveGame: () => saveGame(world),
    readSave,
  };

  announce('Neon Bay. Press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

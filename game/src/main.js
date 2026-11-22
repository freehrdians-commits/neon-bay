// Boot and the one loop for Neon Bay: input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what is there. The
// game moves between five screens — title, play, paused, complete and
// game over — with mission briefings as dialogs that freeze the world.
// ?seed=N fixes the city; ?shot=start|play|chase|end stages that scene for
// a screenshot and sets window.__shotReady.
import { MISSIONS } from './missions.js';
import { SoundBank } from './audio.js';
import { Input } from './input.js';
import { createWorld, stepWorld, interact, punch, shoot, snapshot } from './world.js';
import { createRenderer, titleButtonAt, cameraFor } from './render.js';
import { stageShot } from './shots.js';
import { readSave, writeSave, hasSave } from './save.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const input = new Input(canvas);
const renderer = createRenderer(canvas);
const sfx = new SoundBank();

let world = createWorld(seed);
let prevMission = 0;
let prevStage = 0;
let prevCash = 0;
let prevAmmo = 12;
let prevHealth = 100;
let prevTags = 0;
let prevNitro = 100;
let skidTimer = 0;
let nitroTimer = 0;

function announce(message) {
  if (statusEl) statusEl.textContent = message;
}

function startNewGame() {
  world = createWorld(seed);
  world.screen = 'play';
  const m = MISSIONS[0];
  world.dialog = { title: m.title, speaker: m.speaker, lines: m.briefing };
  prevMission = 0;
  prevStage = 0;
  prevCash = 0;
  prevAmmo = 12;
  prevHealth = 100;
  prevTags = 0;
  prevNitro = 100;
  announce('Playing Neon Bay. First Job: pick up the package at the docks.');
}

function continueGame() {
  const save = readSave();
  if (!save) return;
  world = createWorld(seed, save);
  world.screen = 'play';
  world.dialog = null;
  prevMission = world.missionIndex;
  prevStage = world.missionStage;
  prevCash = world.cash;
  prevAmmo = world.player.ammo;
  prevHealth = world.player.health;
  prevTags = world.tagsCollected || 0;
  prevNitro = world.player.nitro ?? 100;
  announce('Continuing Neon Bay.');
}

function backToTitle() {
  world = createWorld(seed);
  world.screen = 'title';
  announce('Neon Bay. Press Enter to start.');
}

// Sounds follow what changed since the last frame.
function watchChanges() {
  const w = world;
  if (w.cash > prevCash) {
    sfx.cash();
    if (w.missionIndex !== prevMission) sfx.jingle();
  } else if (w.missionIndex !== prevMission || w.missionStage !== prevStage) {
    if (w.missionStage === 1 && w.missionIndex === prevMission) sfx.pickup();
    else if (w.missionIndex !== prevMission) sfx.jingle();
  }
  if ((w.tagsCollected || 0) > prevTags) sfx.tag();
  if (w.gameOver === 'busted' && prevHealth > 0) sfx.busted();
  // The courier's alarm: once, the first time he comes into view.
  if (w.missionIndex === 3 && w.missionStage === 0 && !w.courierSpotted) {
    const courier = w.cars.find((c) => c.kind === 'courier');
    if (courier && Math.hypot(courier.x - w.player.x, courier.y - w.player.y) < 420) {
      w.courierSpotted = true;
      sfx.alarm();
    }
  }
  prevMission = w.missionIndex;
  prevStage = w.missionStage;
  prevCash = w.cash;
  prevAmmo = w.player.ammo;
  prevHealth = w.player.health;
  prevTags = w.tagsCollected || 0;
  prevNitro = w.player.nitro ?? 100;
}

function handleInput() {
  const w = world;
  sfx.unlock();
  if (input.wasPressed('Enter', 'Space')) {
    if (w.dialog) {
      w.dialog = null;
    } else if (w.screen === 'title') {
      startNewGame();
    } else if (w.screen === 'gameover' || w.screen === 'complete') {
      backToTitle();
    }
    return;
  }
  if (input.wasPressed('Escape')) {
    if (w.screen === 'play' && !w.dialog) w.screen = 'paused';
    else if (w.screen === 'paused') w.screen = 'play';
    return;
  }
  if (w.screen === 'title') {
    if (input.mouseClicked) {
      const button = titleButtonAt(input.mouseX, input.mouseY, hasSave());
      if (button === 'new') startNewGame();
      else if (button === 'continue') continueGame();
    }
    return;
  }
  if (w.screen === 'paused') {
    if (input.wasPressed('KeyS')) writeSave(w);
    return;
  }
  if (w.screen !== 'play' || w.dialog) return;
  if (input.wasPressed('KeyE')) interact(w);
  if (input.wasPressed('KeyF')) {
    if (punch(w)) sfx.punch();
  }
  if (input.mouseDown) {
    const cam = cameraFor(w);
    if (shoot(w, input.mouseX + cam.x, input.mouseY + cam.y)) sfx.gunshot();
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  handleInput();
  const w = world;
  if (shotName) {
    // Shot scenes: drive forward on the play and chase scenes so the frame
    // has motion; the title and end scenes just sit.
    const fake = shotName === 'play' || shotName === 'chase'
      ? { down: (...codes) => codes.includes('KeyW') }
      : { down: () => false };
    if (w.screen === 'play' && !w.dialog) stepWorld(w, fake, STEP);
    else if (w.screen === 'title') stepWorld(w, { down: () => false }, STEP);
  } else if (w.screen === 'play' && !w.dialog) {
    accumulator += dt;
    while (accumulator >= STEP) {
      stepWorld(w, input, STEP);
      accumulator -= STEP;
    }
    if (w.gameOver === 'complete' || w.gameOver === 'busted') {
      // The world already set the screen; auto-save the ending.
      writeSave(w);
    }
  } else if (w.screen === 'title') {
    accumulator += dt;
    while (accumulator >= STEP) {
      stepWorld(w, { down: () => false }, STEP);
      accumulator -= STEP;
    }
  } else {
    accumulator = 0;
  }
  // Continuous sounds: engine hum and the police siren.
  const p = w.player;
  sfx.setEngine(p.inCar && p.car ? Math.abs(p.car.speed) / p.car.maxSpeed : 0, p.inCar);
  const nearCop = w.cars.some((c) => c.kind === 'police' && Math.hypot(c.x - p.x, c.y - p.y) < 600);
  sfx.setSiren(nearCop, STEP);
  // Skid: hard steering at speed. Nitro: the boost engaging and draining.
  skidTimer -= dt;
  nitroTimer -= dt;
  if (p.inCar && p.car && Math.abs(p.car.speed) > 220
    && (input.down('KeyA', 'ArrowLeft') || input.down('KeyD', 'ArrowRight')) && skidTimer <= 0) {
    skidTimer = 0.5;
    sfx.skid();
  }
  if (p.inCar && input.boost() && p.nitro < prevNitro && nitroTimer <= 0) {
    nitroTimer = 0.4;
    sfx.nitro();
  }
  watchChanges();
  renderer.draw(w, hasSave());
  input.endFrame();
  if (shotName) {
    painted += 1;
    if (painted >= 2 && !window.__shotReady) window.__shotReady = true;
  }
}

let accumulator = 0;
let last = performance.now();
let painted = 0;

// The test and screenshot interface: a plain snapshot of the world.
window.NB = {
  snapshot: () => snapshot(world),
  get state() {
    return world;
  },
};

if (shotName) {
  stageShot(shotName, world);
  world.time = 0;
  announce(`Neon Bay screenshot scene: ${shotName}.`);
} else {
  announce('Neon Bay. Press Enter or click New Game to start.');
}
requestAnimationFrame(frame);

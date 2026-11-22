// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between four screens: title, play, paused and story complete.
//
// ?seed=N fixes the city and the traffic. ?shot=start|play|chase|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot. window.__game exposes the world for playtests.
import { BEST_KEY, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUST, EVENT_CRASH, EVENT_MISSION, EVENT_PICKUP, EVENT_PUNCH, EVENT_STEAL, EVENT_TAG, EVENT_WASTED, EVENT_WIN } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_SAVE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed), seed);
const renderer = createRenderer(canvas);
const audio = createAudio();
window.__game = { world, seed };

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch {
    return null;
  }
}

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best then lasts this visit only.
  }
}

function saveGame() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.getSave()));
    return true;
  } catch {
    return false;
  }
}

function playEventSound(events) {
  if (events & EVENT_PICKUP) audio.pickup();
  if (events & EVENT_TAG) audio.tag();
  if (events & EVENT_MISSION) audio.mission();
  if (events & EVENT_PUNCH) audio.punch();
  if (events & EVENT_CRASH) audio.crash();
  if (events & EVENT_BUST) audio.bust();
  if (events & EVENT_STEAL) audio.steal();
  if (events & EVENT_WASTED) audio.bust();
  if (events & EVENT_WIN) audio.mission();
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, { best: readBest(), muted: audio.isMuted(), save: readSave(), savedFlash: false });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let saved = readSave();
  let savedFlash = 0;
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.ensure();
    world.reset(saved);
    saved = null;
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing Neon Bay. Follow the gold star.');
  }

  function finishStory() {
    screen = SCREEN_WIN;
    const cash = world.state.player.cash;
    if (cash > best) {
      best = cash;
      saveBest(best);
    }
    saveGame();
    announce(`Story complete. Cash $${cash}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      announce(audio.isMuted() ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_SAVE && screen === SCREEN_PLAY) {
      if (saveGame()) savedFlash = 2;
    }
    if (actions & ACTION_CONFIRM && screen === SCREEN_TITLE) startGame();
    else if (actions & ACTION_CONFIRM && screen === SCREEN_WIN) {
      screen = SCREEN_PLAY;
      announce('Free roam. The city is yours.');
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, {
        drive: () => ({ throttle: 0, steer: 0 }),
        walk: () => ({ x: 0, y: 0 }),
        nitroHeld: () => false,
        takeInteract: () => false,
        takeAttack: () => false,
        takeActions: () => 0,
      });
      return;
    }
    const events = world.step(STEP, input);
    playEventSound(events);
    if (events & EVENT_WIN && screen === SCREEN_PLAY) finishStory();
    // Engine hum and sirens follow the action every frame.
    const p = world.state.player;
    const driving = !p.onFoot && p.car ? Math.abs(p.car.speed) / 345 : 0;
    audio.engine(driving, !p.onFoot && !!p.car);
    const policeNear = world.state.cars.some((c) => c.kind === 'police' && Math.hypot(c.x - p.x, c.y - p.y) < 420);
    audio.siren(policeNear, STEP);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (savedFlash > 0) savedFlash -= Math.min((now - last) / 1000, MAX_FRAME);
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY || screen === SCREEN_WIN) {
      while (accumulator >= STEP && screen !== SCREEN_PAUSED) {
        step();
        accumulator -= STEP;
        if (screen === SCREEN_WIN) break;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world, screen, { best, muted: audio.isMuted(), save: saved, savedFlash: savedFlash > 0 });
  }

  // Leaving the tab pauses a running game rather than letting the city move unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Neon Bay. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

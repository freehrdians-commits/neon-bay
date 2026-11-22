// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is there.
// The game moves between five screens: title, play, paused, game over and story complete.
// Progress auto-saves to localStorage every ten seconds of play; C on the title continues it.
//
// ?seed=N fixes the city's random life. ?shot=start|play|chase|end (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady.

import { SAVE_KEY, STEP } from './config.js';
import { createRandom } from './rng.js';
import {
  ACTION_CONFIRM, ACTION_INTERACT, ACTION_PAUSE, EVENT_BUSTED, EVENT_CASH, EVENT_HIT,
  EVENT_MISSION, EVENT_PICKUP, EVENT_SHOT, EVENT_STORY, EVENT_TAG, EVENT_WASTED, createWorld,
} from './world.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import {
  SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN, createRenderer,
} from './render.js';
import { stageShot } from './shots.js';
import { missionAt, stepAt } from './missions.js';

const MAX_FRAME = 0.25;
const AUTOSAVE_SECONDS = 10;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const input = createInput(canvas);
const audio = createAudio();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.save()));
  } catch {
    // Storage can be off (private windows): the save then lasts this visit only.
  }
}

let savedGame = readSave();

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, { saveExists: savedGame !== null });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  let autosaveTimer = 0;
  let wasBoosting = false;
  let skidTimer = 0;

  function announce(message) {
    status.textContent = message;
  }

  function startGame(fresh) {
    if (fresh || savedGame === null) {
      world.reset();
    } else {
      world.load(savedGame);
    }
    accumulator = 0;
    autosaveTimer = 0;
    screen = SCREEN_PLAY;
    const mission = missionAt(world.state.mission);
    announce(mission ? `Playing. ${mission.name}.` : 'Playing.');
    audio.unlock();
  }

  function missionTarget() {
    const mission = missionAt(world.state.mission);
    if (mission === null) return null;
    const step = stepAt(world.state.mission, world.state.missionStep);
    if (step === null) return null;
    if (step.kind === 'grab-ledger') {
      const courier = world.state.courier;
      return courier && courier.active ? { x: courier.x, y: courier.y, kind: 'grab-ledger' } : null;
    }
    if (step.target) return { x: step.target.x, y: step.target.y, kind: step.kind };
    return null;
  }

  // The playtest bot reads the game through this handle: state, screen and the current target.
  window.__neonBay = {
    world,
    state: world.state,
    missionTarget,
    get screen() {
      return screen;
    },
  };

  function playEventSound(events) {
    if (events & EVENT_SHOT) audio.shot();
    if (events & EVENT_TAG) audio.tag();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_MISSION) audio.mission();
    if (events & EVENT_CASH) audio.cash();
    if (events & EVENT_HIT) audio.hurt();
    if (events & EVENT_STORY) {
      audio.mission();
      audio.cash();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;

    const actions = input.takeActions();
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    if (screen === SCREEN_TITLE && (actions & ACTION_CONFIRM)) {
      startGame(true);
    } else if ((screen === SCREEN_OVER || screen === SCREEN_WIN) && (actions & ACTION_CONFIRM)) {
      startGame(true);
    }

    if (screen === SCREEN_PLAY) {
      const move = input.move();
      const mouse = input.mouse();
      const aimWorld = renderer.screenToWorld(mouse.x, mouse.y);
      const player = world.state.player;
      const aimAngle = input.mouseSeen()
        ? Math.atan2(aimWorld.y - player.y, aimWorld.x - player.x)
        : player.angle;
      const controls = {
        mx: move.mx,
        my: move.my,
        sneak: input.sneak(),
        nitro: input.nitro(),
        brake: input.brake(),
        aimAngle,
        shooting: input.shooting(),
        actions: actions & ACTION_INTERACT,
      };
      while (accumulator >= STEP) {
        const events = world.step(STEP, controls);
        playEventSound(events);
        accumulator -= STEP;
        if (world.state.wasted || world.state.busted) {
          screen = SCREEN_OVER;
          announce(world.state.busted ? 'Busted. The law caught up with Rook.' : 'Wasted. Rook went down in Neon Bay.');
          writeSave();
          break;
        }
        if (world.state.storyComplete) {
          screen = SCREEN_WIN;
          announce('Story complete. Neon Bay is yours.');
          writeSave();
          break;
        }
      }
      // Nitro whoosh on the rising edge of a boost; skid while braking hard at speed.
      const boosting = !player.onFoot && player.inCar && input.nitro() && player.inCar.nitro > 0 && Math.abs(player.inCar.speed) > 40;
      if (boosting && !wasBoosting) audio.nitro();
      wasBoosting = boosting;
      skidTimer -= 1 / 60;
      if (!player.onFoot && player.inCar && input.brake() && Math.abs(player.inCar.speed) > 200 && skidTimer <= 0) {
        audio.skid();
        skidTimer = 0.6;
      }
      autosaveTimer += 1 / 60;
      if (autosaveTimer >= AUTOSAVE_SECONDS) {
        autosaveTimer = 0;
        writeSave();
      }
      const car = player.inCar;
      audio.update(1 / 60, {
        speed: car ? car.speed : 0,
        driving: !player.onFoot,
        wanted: world.state.wanted,
      });
    } else {
      accumulator = 0;
      audio.update(1 / 60, { speed: 0, driving: false, wanted: 0 });
    }

    renderer.draw(world.state, screen, { saveExists: savedGame !== null });
  }

  // M mutes; R restarts from an end screen; C continues a save from the title.
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyM') {
      audio.toggleMute();
      announce(audio.isMuted() ? 'Muted.' : 'Sound on.');
    } else if (event.code === 'KeyR' && (screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      startGame(true);
    } else if (event.code === 'KeyC' && screen === SCREEN_TITLE && savedGame !== null) {
      startGame(false);
    }
  });

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Neon Bay. Press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

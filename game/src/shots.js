// The screenshot scenes behind ?shot=start|play|chase|end. Each one stages
// the real game in a chosen moment — the title, a drive through traffic, a
// police chase at dusk, the finished story — so a screenshot is a frame of
// the game itself, and the same seed always stages the same frame.
import { MARKERS } from './city.js';
import { ensureGoldCar, ensureRivals } from './world.js';

function putPlayerInCar(state, car, x, y, angle) {
  car.x = x;
  car.y = y;
  car.angle = angle;
  car.speed = 0;
  car.driver = 'player';
  car.kind = 'player';
  const p = state.player;
  p.inCar = true;
  p.car = car;
  p.x = x;
  p.y = y;
  p.angle = angle;
  p.speed = 0;
}

export function stageShot(name, state) {
  state.dialog = null;
  state.gameOver = null;
  if (name === 'play') {
    state.screen = 'play';
    state.timeOfDay = 0.3;
    const car = state.cars.find((c) => c.driver === 'none' && !c.gold);
    if (car) putPlayerInCar(state, car, 580, 852, 0);
    return;
  }
  if (name === 'chase') {
    state.screen = 'play';
    state.timeOfDay = 0.58;
    state.missionIndex = 1;
    state.missionStage = 1;
    state.wanted = 3;
    state.lastHeat = state.time;
    ensureGoldCar(state);
    const gold = state.cars.find((c) => c.gold);
    if (gold) putPlayerInCar(state, gold, 852, 580, 0);
    // Two police cars closing in from behind.
    const spots = [
      { x: 700, y: 580 },
      { x: 640, y: 606 },
    ];
    spots.forEach((s, i) => {
      state.cars.push({
        id: 9000 + i, x: s.x, y: s.y, angle: 0, speed: 180,
        maxSpeed: 300, accel: 380, brake: 620, reverseMax: 130, turn: 3.0,
        kind: 'police', driver: 'police', color: '#1c2733', gold: false,
        axis: 'h', road: 2, dir: 1, targetSpeed: 0, ramCd: 0,
        route: null, routeTimer: 0, routeIndex: 0,
      });
    });
    return;
  }
  if (name === 'end') {
    state.screen = 'complete';
    state.gameOver = 'complete';
    state.timeOfDay = 0.4;
    state.cash = 2900;
    state.missionsDone = 3;
    state.missionIndex = 2;
    state.missionStage = 1;
    state.player.x = MARKERS.garage.x;
    state.player.y = MARKERS.garage.y;
    return;
  }
  // start (and anything else): the title over a living city.
  state.screen = 'title';
  state.timeOfDay = 0.32;
}

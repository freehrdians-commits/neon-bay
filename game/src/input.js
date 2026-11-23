// Keyboard input for Neon Bay. Held keys steer and drive; one-shot presses
// (interact, punch, pause, save, mission menu) are queued as flags and taken
// once by the loop, so a press between two frames is never lost or counted
// twice. A released key while the tab is hidden never sends keyup, so blur
// lets go of everything.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_PUNCH = 8;
export const ACTION_SAVE = 16;
export const ACTION_MISSIONS = 32;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const NITRO = new Set(['ShiftLeft', 'ShiftRight']);
const INTERACT = new Set(['KeyE']);
const PUNCH = new Set(['Space']);
const PAUSE = new Set(['KeyP', 'Escape']);
const SAVE = new Set(['KeyQ']);
const MISSIONS = new Set(['KeyM']);
const CONFIRM = new Set(['Enter']);

export function createInput() {
  const held = { up: false, down: false, left: false, right: false, nitro: false, interact: false };
  let actions = 0;

  function down(event) {
    if (UP.has(event.code)) held.up = true;
    else if (DOWN.has(event.code)) held.down = true;
    else if (LEFT.has(event.code)) held.left = true;
    else if (RIGHT.has(event.code)) held.right = true;
    else if (NITRO.has(event.code)) held.nitro = true;
    else if (INTERACT.has(event.code)) { held.interact = true; if (!event.repeat) actions |= ACTION_INTERACT; }
    else if (PUNCH.has(event.code)) { if (!event.repeat) actions |= ACTION_PUNCH; }
    else if (PAUSE.has(event.code)) { if (!event.repeat) actions |= ACTION_PAUSE; }
    else if (SAVE.has(event.code)) { if (!event.repeat) actions |= ACTION_SAVE; }
    else if (MISSIONS.has(event.code)) { if (!event.repeat) actions |= ACTION_MISSIONS; }
    else if (CONFIRM.has(event.code)) { if (!event.repeat) actions |= ACTION_CONFIRM; }
    else return;
    if (event.code !== 'Space' || document.activeElement === document.body) event.preventDefault();
  }

  function up(event) {
    if (UP.has(event.code)) held.up = false;
    else if (DOWN.has(event.code)) held.down = false;
    else if (LEFT.has(event.code)) held.left = false;
    else if (RIGHT.has(event.code)) held.right = false;
    else if (NITRO.has(event.code)) held.nitro = false;
    else if (INTERACT.has(event.code)) held.interact = false;
  }

  function blur() {
    held.up = held.down = held.left = held.right = held.nitro = held.interact = false;
  }

  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);

  return {
    /** The held-key state the simulation reads every step. */
    get up() { return held.up; },
    get down() { return held.down; },
    get left() { return held.left; },
    get right() { return held.right; },
    get nitro() { return held.nitro; },
    get interact() { return held.interact; },
    /** One-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Drive the simulation from a script (playtests, screenshots). */
    set(keys) {
      held.up = !!keys.up;
      held.down = !!keys.down;
      held.left = !!keys.left;
      held.right = !!keys.right;
      held.nitro = !!keys.nitro;
      held.interact = !!keys.interact;
    },
    press(action) {
      actions |= action;
    },
  };
}

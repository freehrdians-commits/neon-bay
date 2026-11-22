// Keyboard and mouse input. Held keys give a steering vector; one-shot presses (confirm,
// pause, interact) are queued as bit flags and taken once by the loop, so a press between two
// frames is never lost and never counted twice. The mouse aims on foot and fires while held;
// F fires toward the way the player faces, for keyboard-only play.

import { ACTION_CONFIRM, ACTION_INTERACT, ACTION_PAUSE } from './world.js';

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const INTERACT = new Set(['KeyE']);
const SNEAK = new Set(['ShiftLeft', 'ShiftRight']);
const FIRE_KEY = new Set(['KeyF']);

export function createInput(target) {
  let up = false;
  let down = false;
  let left = false;
  let right = false;
  let sneak = false;
  let space = false;
  let fireKey = false;
  let mouseDown = false;
  let mouseX = 0;
  let mouseY = 0;
  let mouseSeen = false;
  let actions = 0;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (SNEAK.has(event.code)) sneak = true;
    else if (FIRE_KEY.has(event.code)) fireKey = true;
    else if (CONFIRM.has(event.code)) {
      if (event.code === 'Space') space = true;
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (INTERACT.has(event.code)) {
      if (!event.repeat) actions |= ACTION_INTERACT;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
    else if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (SNEAK.has(event.code)) sneak = false;
    else if (FIRE_KEY.has(event.code)) fireKey = false;
    else if (event.code === 'Space') space = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    up = false;
    down = false;
    left = false;
    right = false;
    sneak = false;
    space = false;
    fireKey = false;
    mouseDown = false;
  });
  target.addEventListener('pointermove', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
    mouseSeen = true;
  });
  target.addEventListener('pointerdown', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
    mouseSeen = true;
    mouseDown = true;
    actions |= ACTION_CONFIRM;
  });
  target.addEventListener('pointerup', () => {
    mouseDown = false;
  });
  target.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** Movement vector: mx -1..1 (left/right), my -1..1 (up is -1, down is +1). */
    move() {
      return { mx: (right ? 1 : 0) - (left ? 1 : 0), my: (down ? 1 : 0) - (up ? 1 : 0) };
    },
    sneak() {
      return sneak;
    },
    /** Nitro while driving: the same Shift key that sneaks on foot. */
    nitro() {
      return sneak;
    },
    brake() {
      return space;
    },
    /** Whether the player is holding fire (mouse held, or F). */
    shooting() {
      return mouseDown || fireKey;
    },
    /** Whether the mouse has ever aimed (false until the first pointer move). */
    mouseSeen() {
      return mouseSeen;
    },
    /** The mouse position in screen pixels. */
    mouse() {
      return { x: mouseX, y: mouseY };
    },
    /** Fire with the keyboard: true only on the frame F is held. */
    fireKey() {
      return fireKey;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}

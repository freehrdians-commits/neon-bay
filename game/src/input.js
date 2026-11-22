// Keyboard and pointer input. Held keys steer or drive; one-shot presses (confirm,
// pause, save, mute, attack) are queued as bit flags and taken once by the loop, so a
// press between two frames is never lost and never counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_SAVE = 4;
export const ACTION_MUTE = 8;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const INTERACT = new Set(['KeyE']);
const ATTACK = new Set(['KeyF']);
const NITRO = new Set(['ShiftLeft', 'ShiftRight']);
const SAVE = new Set(['KeyC']);
const MUTE = new Set(['KeyM']);

export function createInput(target) {
  let up = false;
  let down = false;
  let left = false;
  let right = false;
  let nitro = false;
  let attack = false;
  let interactQueued = false;
  let actions = 0;

  function keydown(event) {
    if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (NITRO.has(event.code)) nitro = true;
    else if (INTERACT.has(event.code)) {
      // Queued separately from the other one-shot flags, so the world can take
      // it in its own step without the main loop's takeActions() eating it.
      if (!event.repeat) interactQueued = true;
    } else if (ATTACK.has(event.code)) {
      if (!event.repeat) attack = true;
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (SAVE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_SAVE;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else return;
    event.preventDefault();
  }

  function keyup(event) {
    if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
    else if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (NITRO.has(event.code)) nitro = false;
  }

  // A key released while the tab is hidden never sends keyup: let go of everything.
  window.addEventListener('blur', () => {
    up = down = left = right = nitro = false;
  });
  window.addEventListener('keydown', keydown);
  window.addEventListener('keyup', keyup);
  target.addEventListener('pointerdown', () => {
    actions |= ACTION_CONFIRM;
  });

  return {
    /** -1..1 throttle (up positive), -1..1 steering (right positive). */
    drive() {
      return {
        throttle: (up ? 1 : 0) - (down ? 1 : 0),
        steer: (right ? 1 : 0) - (left ? 1 : 0),
      };
    },
    /** -1..1 on each axis, for walking. */
    walk() {
      return {
        x: (right ? 1 : 0) - (left ? 1 : 0),
        y: (down ? 1 : 0) - (up ? 1 : 0),
      };
    },
    nitroHeld() {
      return nitro;
    },
    /** True once per E press, then consumed — a tap never falls between frames. */
    takeInteract() {
      const taken = interactQueued;
      interactQueued = false;
      return taken;
    },
    /** True once per F press, then consumed. */
    takeAttack() {
      const taken = attack;
      attack = false;
      return taken;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}

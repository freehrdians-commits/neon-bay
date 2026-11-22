// Save and load for Neon Bay: one localStorage key, plain JSON. The shape is
// deliberately small and stable — a save written by one version loads in
// another — and the playtests seed exactly this shape. New fields are added
// with defaults, so a v1 save without them still loads.
export const SAVE_KEY = 'neon-bay.save.v1';

export function writeSave(state) {
  try {
    const data = {
      cash: Math.round(state.cash),
      missionIndex: state.missionIndex,
      missionStage: state.missionStage,
      x: Math.round(state.player.x),
      y: Math.round(state.player.y),
      health: Math.round(state.player.health),
      ammo: state.player.ammo,
      wanted: state.wanted,
      timeOfDay: state.timeOfDay,
      missionsDone: state.missionsDone,
      tags: state.tagsCollected || 0,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    if (typeof data.missionIndex !== 'number' || typeof data.cash !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return readSave() !== null;
}

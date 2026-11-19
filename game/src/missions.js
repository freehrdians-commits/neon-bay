// The story of Neon Bay: three jobs for Rook, a driver fresh out of the
// east-side lockup, working for Delia Vane, who runs a garage on the
// waterfront. Pure data — the world asks this file where the player has to go
// next and what the briefing says; the world itself runs the consequences.
import { MARKERS } from './city.js';

export const MISSIONS = [
  {
    key: 'first-job',
    title: 'First Job',
    speaker: 'Delia Vane',
    reward: 400,
    briefing: [
      'Rook. You are out, and the city forgot you already. Good — that is how I like it.',
      'A package is waiting at the Neon Docks, south-east corner. Bring it to my garage.',
      'Walk there, or take a car. Cars on this street are unlocked. Do not make a scene.',
    ],
  },
  {
    key: 'hot-wheels',
    title: 'Hot Wheels',
    speaker: 'Delia Vane',
    reward: 800,
    briefing: [
      'That was clean. Now the real money.',
      'A gold Comet GT is parked by Palm Park. It belongs to a Vipers lieutenant. Take it.',
      'The moment you touch it, the whole city will know. Get it to the Chop Shop fast.',
    ],
  },
  {
    key: 'turf-war',
    title: 'Turf War',
    speaker: 'Delia Vane',
    reward: 1500,
    briefing: [
      'The Vipers want their car back, and they want you in the harbour.',
      'Four of them are holding Crescent Plaza. Clear them out — fists or fire, your call.',
      'The cops are paid to look away tonight. When the plaza is yours, come home.',
    ],
  },
];

// Where the player has to go, for the current mission and stage. `action`
// names what pressing E there does: pick up a package, deliver a job, or
// finish the story. Gold car and plaza have no marker action — the car
// itself, and the rivals, are the objective.
export function objectiveFor(missionIndex, missionStage, state) {
  if (missionIndex === 0 && missionStage === 0) {
    return { key: 'docks', x: MARKERS.docks.x, y: MARKERS.docks.y, label: 'Pick up the package', action: 'pickup' };
  }
  if (missionIndex === 0 && missionStage === 1) {
    return { key: 'garage', x: MARKERS.garage.x, y: MARKERS.garage.y, label: 'Deliver to the garage', action: 'deliver' };
  }
  if (missionIndex === 1 && missionStage === 0) {
    const gold = state.cars.find((c) => c.gold);
    if (!gold) return null;
    return { key: 'goldcar', x: gold.x, y: gold.y, label: 'Steal the gold Comet GT', action: null };
  }
  if (missionIndex === 1 && missionStage === 1) {
    return { key: 'chopshop', x: MARKERS.chopshop.x, y: MARKERS.chopshop.y, label: 'Deliver to the Chop Shop', action: 'deliver' };
  }
  if (missionIndex === 2 && missionStage === 0) {
    return { key: 'plaza', x: MARKERS.plaza.x, y: MARKERS.plaza.y, label: 'Clear the plaza — 4 Vipers', action: null };
  }
  if (missionIndex === 2 && missionStage === 1) {
    return { key: 'garage', x: MARKERS.garage.x, y: MARKERS.garage.y, label: 'Return to the garage', action: 'deliver' };
  }
  return null;
}

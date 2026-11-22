// The story of Neon Bay: four jobs for Rook, a driver fresh out of the
// east-side lockup, working for Delia Vane, who runs a garage on the
// waterfront. The arc runs from a first errand to the ledger that owns the
// whole city: Delia's rival Marlow keeps his payoffs in one black book, and
// his courier drives it through Neon Bay every night. Pure data — the world
// asks this file where the player has to go next and what the briefing says;
// the world itself runs the consequences.
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
  {
    key: 'the-ledger',
    title: 'The Ledger',
    speaker: 'Delia Vane',
    reward: 2000,
    briefing: [
      'One more job, and then we own this city, Rook.',
      'Marlow keeps every name, every debt, every payoff in one black ledger.',
      'His courier drives it through Neon Bay in a black Comet. Take it off him.',
      'Cut the car off and grab it — on foot, up close. Then bring it to my contact at the docks.',
      'The cops will NOT look away this time. Hold Shift in the car for nitro when you need to run.',
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
  if (missionIndex === 3 && missionStage === 0) {
    const courier = state.cars.find((c) => c.kind === 'courier');
    if (!courier) return null;
    return { key: 'courier', x: courier.x, y: courier.y, label: 'Cut off the courier — grab the ledger', action: null };
  }
  if (missionIndex === 3 && missionStage === 1) {
    return { key: 'docks', x: MARKERS.docks.x, y: MARKERS.docks.y, label: 'Deliver the ledger to the docks', action: 'deliver' };
  }
  return null;
}

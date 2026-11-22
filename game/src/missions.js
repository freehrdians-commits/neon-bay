// The story: four jobs for Rook and Delia Vane, in order. Each mission is data — a name, a
// briefing shown when it starts, and steps. A step is finished by arriving somewhere, by
// stealing a car, by defeating the rivals, or by taking the ledger; the world owns those
// triggers and asks here for the current step's text and target.

import { PLACES } from './city.js';
import { MISSION_PAY, RIVAL } from './config.js';

/**
 * Step kinds:
 *   reach        arrive within `radius` of `target` (on foot or in a car)
 *   steal-comet  arrive on foot at the Comet and press E to take it
 *   defeat       defeat every rival (the target is where they stand)
 *   grab-ledger  touch Marlow on foot and take the ledger
 */
export const MISSIONS = [
  {
    id: 'pickup',
    name: 'The Pickup',
    briefing: 'Delia needs a package from the docks. Pick it up and bring it back to the garage.',
    steps: [
      { kind: 'reach', target: PLACES.docks, radius: 56, text: 'Pick up the package at the docks' },
      { kind: 'reach', target: PLACES.garage, radius: 72, text: "Deliver the package to Delia's garage" },
    ],
  },
  {
    id: 'comet',
    name: 'The Comet',
    briefing: 'A gold Comet is parked at the hotel valet. Steal it and bring it to the chop shop. The law will notice.',
    steps: [
      { kind: 'steal-comet', target: PLACES.comet, radius: 56, text: 'Steal the gold Comet at the hotel' },
      { kind: 'reach', target: PLACES.chopShop, radius: 72, text: 'Deliver the Comet to the chop shop', needsComet: true },
    ],
  },
  {
    id: 'turf',
    name: 'Turf War',
    briefing: 'Four rivals hold the park. Clear them out, then report back to the garage.',
    steps: [
      { kind: 'reach', target: PLACES.park, radius: 140, text: 'Go to the park' },
      { kind: 'defeat', target: PLACES.park, radius: 200, text: 'Defeat the rivals' },
      { kind: 'reach', target: PLACES.garage, radius: 72, text: "Report back to Delia's garage" },
    ],
  },
  {
    id: 'ledger',
    name: 'The Ledger',
    briefing: "Marlow carries the ledger on his evening walk. Take it from him — on foot — and bring it to the docks.",
    steps: [
      { kind: 'grab-ledger', target: null, radius: 0, text: 'Take the ledger from Marlow' },
      { kind: 'reach', target: PLACES.docks, radius: 72, text: 'Deliver the ledger to the docks' },
    ],
  },
];

/** The mission at `index`, or null when the story is done. */
export function missionAt(index) {
  return index >= 0 && index < MISSIONS.length ? MISSIONS[index] : null;
}

/** The current step of the mission at `index`, or null when the story is done. */
export function stepAt(index, step) {
  const mission = missionAt(index);
  if (mission === null) return null;
  return step >= 0 && step < mission.steps.length ? mission.steps[step] : null;
}

/**
 * The HUD objective line for the current step. `flags` carries live counts the world keeps:
 * rivalsLeft for the defeat step.
 */
export function objectiveText(index, step, flags) {
  const mission = missionAt(index);
  if (mission === null) return 'Story complete — Neon Bay is yours.';
  const current = stepAt(index, step);
  if (current === null) return mission.name;
  if (current.kind === 'defeat') {
    const left = flags.rivalsLeft ?? RIVAL.count;
    return `Defeat the rivals (${RIVAL.count - left}/${RIVAL.count})`;
  }
  return current.text;
}

/** The pay for finishing the mission at `index`. */
export function missionPay(index) {
  return MISSION_PAY[index] ?? 0;
}

/** A short "Job N of 4" label for the HUD and the end screen. */
export function missionLabel(index) {
  if (index >= MISSIONS.length) return `Job ${MISSIONS.length} of ${MISSIONS.length}`;
  return `Job ${index + 1} of ${MISSIONS.length}`;
}

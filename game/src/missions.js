// The story: four missions for Rook, handed out by Delia Vane. A mission is
// a small state machine — a stage, a target point, and a condition that
// completes it. The module only reads and writes the world; the renderer
// and the autopilot read the same fields.

import { MISSIONS, PLACES, TUNING } from './config.js';
import { addWanted } from './entities.js';
import { dist } from './rng.js';

export function createMissionState() {
  return {
    index: 0, // 0-based: which mission is active (4 = story done)
    stage: 'go', // go | grab | escape | done
    target: null, // { x, y, label }
    timer: 0,
    delivered: 0,
    tagsDone: 0,
    failed: null, // 'busted' | 'timeout' | null
    completed: [false, false, false, false],
  };
}

export function missionDef(world) {
  return MISSIONS[world.mission.index] || null;
}

export function currentObjective(world) {
  const m = world.mission;
  const def = missionDef(world);
  if (!def) return 'Free roam — Neon Bay is yours. Press M for missions.';
  if (m.stage === 'go' && m.index === 0) return 'Steal a car and drive to Delia\u2019s Club';
  if (m.stage === 'go' && m.index === 1) return `Deliver package ${m.delivered + 1} of 3 — ${Math.ceil(m.timer)}s left`;
  if (m.stage === 'go' && m.index === 2) return `Spray the tags — ${m.tagsDone} of 8 done (hold E at a glowing wall)`;
  if (m.stage === 'go' && m.index === 3) return 'Reach the guarded compound and grab the ledger';
  if (m.stage === 'grab') return 'Grabbing the ledger…';
  if (m.stage === 'escape') return 'Lose the heat — reach the safehouse!';
  return def.brief;
}

/** Start (or restart) a mission by index. Resets its stage and target. */
export function startMission(world, index) {
  const m = world.mission;
  m.index = index;
  m.stage = 'go';
  m.failed = null;
  m.delivered = 0;
  m.tagsDone = 0;
  m.timer = MISSIONS[index].timeLimit || 0;
  for (const spot of world.city.tagSpots) spot.done = false;
  world.roadblocks.length = 0;
  world.roadblockTimer = 10;
  // Each mission starts cold: the heat from the last job has died down and
  // the police have lost the trail, so a mission is never lost before it
  // begins. (Carrying the wanted level across missions made the on-foot
  // tagging mission nearly impossible.)
  world.wanted = 0;
  world.bust = 0;
  world.crimeTimer = 0;
  if (index === 0) m.target = { x: PLACES.club.x, y: PLACES.club.y, label: 'Delia\u2019s Club' };
  else if (index === 1) m.target = { ...PLACES.packages[0], label: 'Package 1' };
  else if (index === 2) m.target = { ...world.city.tagSpots[0], label: 'Tag spot' };
  else m.target = { x: PLACES.compound.x, y: PLACES.compound.y, label: 'Compound' };
  world.message = { text: `${MISSIONS[index].name} — ${MISSIONS[index].brief}`, t: 4 };
}

function completeMission(world) {
  const m = world.mission;
  const def = MISSIONS[m.index];
  m.completed[m.index] = true;
  world.cash += def.reward;
  world.stats.missionsDone += 1;
  world.message = { text: `${def.name} complete! +$${def.reward}`, t: 3.5 };
  world.events.push({ type: 'mission-complete', id: def.id });
  m.index += 1;
  if (m.index >= MISSIONS.length) {
    m.stage = 'done';
    m.target = null;
    world.storyDone = true;
    world.message = { text: 'STORY COMPLETE — Neon Bay is yours', t: 5 };
  } else {
    startMission(world, m.index);
  }
  world.saveDirty = true;
}

export function failMission(world, reason) {
  const m = world.mission;
  if (m.failed) return;
  m.failed = reason;
  world.message = { text: reason === 'busted' ? 'BUSTED! The mission failed.' : 'Time up! The mission failed.', t: 3 };
  world.events.push({ type: 'mission-failed', reason });
}

/** Called when the player is busted: lose the mission and some cash. */
export function applyBusted(world) {
  world.busted = false;
  world.bust = 0;
  world.wanted = 0;
  world.police.length = 0;
  world.roadblocks.length = 0;
  const lost = Math.min(world.cash, 50);
  world.cash -= lost;
  const p = world.player;
  if (p.car) {
    p.car.kind = 'parked';
    p.car.speed = 0;
    p.car = null;
  }
  p.x = PLACES.spawn.x;
  p.y = PLACES.spawn.y;
  p.heading = -Math.PI / 2;
  p.speed = 0;
  failMission(world, 'busted');
  world.message = { text: `BUSTED! You lost $${lost} and the mission.`, t: 3.5 };
}

/**
 * Advance the active mission one step. Handles arrivals, channels (tagging
 * and grabbing), the courier timer and the escape leg of the last mission.
 */
export function updateMission(world, input, dt) {
  const m = world.mission;
  if (m.index >= MISSIONS.length) return;
  if (m.failed) return;
  const def = MISSIONS[m.index];
  const p = world.player;

  if (def.timeLimit) {
    m.timer -= dt;
    if (m.timer <= 0) {
      m.timer = 0;
      failMission(world, 'timeout');
      return;
    }
  }

  const target = m.target;
  if (!target) return;

  if (m.index === 0) {
    // First Gear: arrive at the club while driving a stolen car.
    if (p.car && dist(p.x, p.y, target.x, target.y) < 75) completeMission(world);
    return;
  }

  if (m.index === 1) {
    // Neon Run: drive into each package marker in turn.
    if (dist(p.x, p.y, target.x, target.y) < 65) {
      m.delivered += 1;
      world.events.push({ type: 'delivered', n: m.delivered });
      world.message = { text: `Package ${m.delivered} of 3 delivered`, t: 2 };
      if (m.delivered >= 3) { completeMission(world); return; }
      m.target = { ...PLACES.packages[m.delivered], label: `Package ${m.delivered + 1}` };
    }
    return;
  }

  if (m.index === 2) {
    // Tag the Town: hold E beside a glowing wall to spray it.
    let near = null;
    for (const spot of world.city.tagSpots) {
      if (!spot.done && dist(p.x, p.y, spot.x, spot.y) < 46) { near = spot; break; }
    }
    if (near && !p.car && input.interact) {
      if (!p.channel || p.channel.type !== 'tag') {
        p.channel = { type: 'tag', t: 0, dur: TUNING.tagChannel, target: near };
      }
      p.channel.t += dt;
      if (p.channel.t >= p.channel.dur) {
        near.done = true;
        m.tagsDone += 1;
        world.stats.tagsDone += 1;
        p.channel = null;
        world.events.push({ type: 'tagged', n: m.tagsDone });
        if (m.tagsDone === 1) addWanted(world, 1);
        world.message = { text: `Tag ${m.tagsDone} of 8 sprayed`, t: 2 };
        const left = world.city.tagSpots.find((s) => !s.done);
        if (left) m.target = { ...left, label: 'Tag spot' };
        else { completeMission(world); return; }
      }
    } else if (p.channel && p.channel.type === 'tag') {
      p.channel = null; // walked away or let go: the tag is not finished
    }
    return;
  }

  // The Ledger.
  if (m.stage === 'go') {
    if (dist(p.x, p.y, target.x, target.y) < 70) {
      if (!p.car && input.interact) {
        if (!p.channel || p.channel.type !== 'grab') {
          p.channel = { type: 'grab', t: 0, dur: TUNING.grabChannel, target };
        }
        p.channel.t += dt;
        if (p.channel.t >= p.channel.dur) {
          p.channel = null;
          m.stage = 'escape';
          m.target = { x: PLACES.safehouse.x, y: PLACES.safehouse.y, label: 'Safehouse' };
          addWanted(world, 3);
          world.roadblockTimer = 4;
          world.message = { text: 'Ledger grabbed! 3 stars — run for the safehouse!', t: 3.5 };
          world.events.push({ type: 'ledger' });
        }
      } else if (p.channel && p.channel.type === 'grab') {
        p.channel = null;
      }
    }
    return;
  }
  if (m.stage === 'escape') {
    if (dist(p.x, p.y, target.x, target.y) < 75) completeMission(world);
  }
}

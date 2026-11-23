// Drawing only: the world state and the current screen in, pixels out.
// The camera follows the player; the HUD (cash, wanted stars, objective,
// minimap, speed and nitro) is drawn on the canvas so it shows in the
// screenshots exactly as the player sees it.

import { BLOCK, DAY_LENGTH, PALETTE, PITCH, ROAD, ROAD_CENTRES, START_HOUR, WORLD } from './config.js';
import { currentObjective } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_MISSIONS = 'missions';
export const SCREEN_FAILED = 'failed';
export const SCREEN_COMPLETE = 'complete';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** How dark the night overlay is at each hour (0 = noon, 1 = midnight). */
export function darknessAt(hour) {
  if (hour >= 8 && hour < 17) return 0;
  if (hour >= 17 && hour < 20) return (hour - 17) / 3 * 0.45;
  if (hour >= 20 || hour < 5) return 0.5;
  if (hour >= 5 && hour < 8) return (8 - hour) / 3 * 0.45;
  return 0;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const fonts = new Map();
  let vw = 1280;
  let vh = 720;

  function text(value, x, y, size, color, align, weight) {
    const key = `${size}|${weight || ''}`;
    if (!fonts.has(key)) fonts.set(key, `${weight ? weight + ' ' : ''}${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    vw = Math.round(window.innerWidth * ratio);
    vh = Math.round(window.innerHeight * ratio);
    canvas.width = vw;
    canvas.height = vh;
  }

  function drawCity(world, cam) {
    const city = world.city;
    // Ground: grass everywhere, then the beach and the port.
    context.fillStyle = PALETTE.grass;
    context.fillRect(cam.x, cam.y, cam.w, cam.h);
    context.fillStyle = PALETTE.sand;
    context.fillRect(city.beach.x - cam.ox, city.beach.y - cam.oy, city.beach.w, city.beach.h);
    context.fillStyle = PALETTE.water;
    context.fillRect(city.port.x - cam.ox, city.port.y - cam.oy, city.port.w, city.port.h);
    // Roads: dark bands with a dashed centre line.
    context.fillStyle = PALETTE.road;
    for (let i = 0; i < 6; i += 1) {
      const s = i * PITCH;
      context.fillRect(s - cam.ox, -cam.oy, ROAD, WORLD);
      context.fillRect(-cam.ox, s - cam.oy, WORLD, ROAD);
    }
    context.strokeStyle = PALETTE.roadLine;
    context.lineWidth = 2;
    context.setLineDash([18, 22]);
    for (const c of ROAD_CENTRES) {
      context.beginPath();
      context.moveTo(c - cam.ox, -cam.oy);
      context.lineTo(c - cam.ox, WORLD - cam.oy);
      context.moveTo(-cam.ox, c - cam.oy);
      context.lineTo(WORLD - cam.ox, c - cam.oy);
      context.stroke();
    }
    context.setLineDash([]);
    // Blocks: sidewalk slabs between the roads.
    context.fillStyle = PALETTE.sidewalk;
    for (let bx = 0; bx < 5; bx += 1) {
      for (let by = 0; by < 5; by += 1) {
        context.fillRect(ROAD + bx * PITCH - cam.ox, ROAD + by * PITCH - cam.oy, BLOCK, BLOCK);
      }
    }
    // Buildings: face, roof edge, neon sign strip and lit windows.
    for (let i = 0; i < city.buildings.length; i += 1) {
      const b = city.buildings[i];
      const x = b.x - cam.ox;
      const y = b.y - cam.oy;
      context.fillStyle = b.face;
      context.fillRect(x, y, b.w, b.h);
      context.strokeStyle = PALETTE.buildingEdge;
      context.lineWidth = 3;
      context.strokeRect(x + 1, y + 1, b.w - 2, b.h - 2);
      context.fillStyle = b.neon;
      context.fillRect(x + 4, y + 4, Math.min(46, b.w - 8), 5);
      if (b.lit) {
        context.fillStyle = 'rgba(255, 230, 140, 0.75)';
        const cols = Math.max(1, Math.floor(b.w / 26));
        const rows = Math.max(1, Math.floor(b.h / 26));
        for (let cx = 0; cx < cols; cx += 1) {
          for (let cy = 0; cy < rows; cy += 1) {
            if ((cx * 7 + cy * 11 + i * 3) % 4 === 0) {
              context.fillRect(x + 10 + cx * 26, y + 14 + cy * 26, 9, 11);
            }
          }
        }
      }
    }
    // Tag spots: glowing walls waiting for paint (or freshly sprayed).
    for (const spot of city.tagSpots) {
      const pulse = 0.55 + 0.45 * Math.sin(world.time * 4 + spot.x);
      context.globalAlpha = spot.done ? 0.95 : pulse;
      context.fillStyle = spot.color;
      context.beginPath();
      context.arc(spot.x - cam.ox, spot.y - cam.oy, spot.done ? 12 : 9, 0, Math.PI * 2);
      context.fill();
      if (spot.done) {
        context.font = `bold 16px ${FONT}`;
        context.textAlign = 'center';
        context.fillText('✦', spot.x - cam.ox, spot.y - cam.oy + 6);
      }
      context.globalAlpha = 1;
    }
  }

  function drawMarker(world, cam) {
    const m = world.mission;
    if (!m.target || m.index >= 4) return;
    const pulse = 1 + 0.18 * Math.sin(world.time * 5);
    const x = m.target.x - cam.ox;
    const y = m.target.y - cam.oy;
    context.strokeStyle = PALETTE.neonPink;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(x, y, 26 * pulse, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = PALETTE.neonPink;
    context.beginPath();
    context.moveTo(x, y - 34);
    context.lineTo(x + 9, y - 16);
    context.lineTo(x - 9, y - 16);
    context.closePath();
    context.fill();
    text(m.target.label, x, y - 42, 15, PALETTE.hudText, 'center', 'bold');
  }

  function drawRoadblocks(world, cam) {
    for (const rb of world.roadblocks) {
      if (rb.broken) continue;
      const x = rb.x - cam.ox;
      const y = rb.y - cam.oy;
      context.fillStyle = '#d23b2e';
      context.strokeStyle = '#f5f5f5';
      context.lineWidth = 2;
      if (rb.vertical) {
        context.fillRect(x - 8, y - 42, 16, 84);
        context.strokeRect(x - 8, y - 42, 16, 84);
      } else {
        context.fillRect(x - 42, y - 8, 84, 16);
        context.strokeRect(x - 42, y - 8, 84, 16);
      }
      text('POLICE', x, y - 48, 12, '#ff6b5e', 'center', 'bold');
    }
  }

  function drawCar(car, cam, isPlayer, time) {
    const x = car.x - cam.ox;
    const y = car.y - cam.oy;
    context.save();
    context.translate(x, y);
    context.rotate(car.heading);
    context.fillStyle = '#0a0d12';
    context.fillRect(-24, -11, 48, 22);
    context.fillStyle = car.color;
    context.fillRect(-22, -10, 44, 20);
    context.fillStyle = 'rgba(180, 220, 255, 0.85)';
    context.fillRect(2, -9, 12, 18);
    context.fillStyle = '#ffe9a8';
    context.fillRect(20, -8, 3, 5);
    context.fillRect(20, 3, 3, 5);
    if (car.kind === 'police') {
      context.fillStyle = '#ffffff';
      context.fillRect(-6, -10, 12, 20);
      context.fillStyle = '#2244ff';
      context.fillRect(-6, -10, 6, 20);
      context.fillStyle = '#ff2222';
      context.fillRect(0, -10, 6, 20);
      const flash = Math.floor(time * 6) % 2 === 0;
      context.fillStyle = flash ? '#ff2e2e' : '#2e6bff';
      context.beginPath();
      context.arc(-2, 0, 5, 0, Math.PI * 2);
      context.fill();
    }
    if (isPlayer) {
      context.strokeStyle = PALETTE.neonCyan;
      context.lineWidth = 2;
      context.strokeRect(-26, -13, 52, 26);
    }
    context.restore();
  }

  function drawPlayer(world, cam) {
    const p = world.player;
    if (p.car) return; // the car is drawn as the car
    const x = p.x - cam.ox;
    const y = p.y - cam.oy;
    context.save();
    context.translate(x, y);
    context.rotate(p.heading);
    context.fillStyle = '#ffd319';
    context.beginPath();
    context.arc(0, 0, 10, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#222';
    context.fillRect(6, -4, 8, 8);
    if (p.punchAnim > 0) {
      context.strokeStyle = '#fff';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(14, 0, 12, -0.9, 0.9);
      context.stroke();
    }
    context.restore();
    // Channel progress ring while tagging or grabbing.
    if (p.channel) {
      const f = p.channel.t / p.channel.dur;
      context.strokeStyle = PALETTE.neonGreen;
      context.lineWidth = 4;
      context.beginPath();
      context.arc(x, y, 18, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
      context.stroke();
    }
  }

  function drawPeds(world, cam) {
    for (const ped of world.peds) {
      const x = ped.x - cam.ox;
      const y = ped.y - cam.oy;
      if (ped.down > 0) {
        context.fillStyle = ped.shirt;
        context.beginPath();
        context.ellipse(x, y, 11, 6, ped.heading, 0, Math.PI * 2);
        context.fill();
        continue;
      }
      context.fillStyle = ped.shirt;
      context.beginPath();
      context.arc(x, y, 7, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#e8b98a';
      context.beginPath();
      context.arc(x + Math.cos(ped.heading) * 3, y + Math.sin(ped.heading) * 3, 3.5, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawParticles(world, cam) {
    for (const pt of world.particles) {
      context.globalAlpha = Math.max(0, pt.life / pt.max);
      context.fillStyle = pt.color;
      context.fillRect(pt.x - cam.ox - 2, pt.y - cam.oy - 2, 4, 4);
    }
    context.globalAlpha = 1;
  }

  function drawNight(world) {
    const hour = (START_HOUR + (world.time / DAY_LENGTH) * 24) % 24;
    const dark = darknessAt(hour);
    if (dark <= 0) return;
    context.fillStyle = `rgba(4, 8, 28, ${dark})`;
    context.fillRect(0, 0, vw, vh);
  }

  function drawMinimap(world) {
    const size = 168;
    const x0 = vw - size - 14;
    const y0 = 14;
    const s = size / WORLD;
    context.fillStyle = PALETTE.hudBg;
    context.fillRect(x0 - 4, y0 - 4, size + 8, size + 8);
    context.fillStyle = '#0a1410';
    context.fillRect(x0, y0, size, size);
    context.fillStyle = '#2a2f38';
    for (let i = 0; i < 6; i += 1) {
      const c = ROAD_CENTRES[i] * s;
      context.fillRect(x0, y0 + c - 2, size, 4);
      context.fillRect(x0 + c - 2, y0, 4, size);
    }
    context.fillStyle = '#4d5a6e';
    for (const b of world.city.buildings) {
      context.fillRect(x0 + b.x * s, y0 + b.y * s, Math.max(2, b.w * s), Math.max(2, b.h * s));
    }
    if (world.mission.target && world.mission.index < 4) {
      const pulse = 3 + Math.sin(world.time * 5) * 1.5;
      context.fillStyle = PALETTE.neonPink;
      context.beginPath();
      context.arc(x0 + world.mission.target.x * s, y0 + world.mission.target.y * s, pulse, 0, Math.PI * 2);
      context.fill();
    }
    for (const cop of world.police) {
      context.fillStyle = '#3b82ff';
      context.beginPath();
      context.arc(x0 + cop.x * s, y0 + cop.y * s, 3, 0, Math.PI * 2);
      context.fill();
    }
    const p = world.player;
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.arc(x0 + p.x * s, y0 + p.y * s, 4, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#19e3ff';
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(x0 + p.x * s, y0 + p.y * s, 6.5, 0, Math.PI * 2);
    context.stroke();
  }

  function drawHud(world) {
    const m = world.mission;
    // Top-left: cash, mission, objective.
    context.fillStyle = PALETTE.hudBg;
    context.fillRect(14, 14, 360, 92);
    text(`$${world.cash}`, 28, 46, 30, PALETTE.neonGreen, 'left', 'bold');
    const def = m.index < 4 ? world.missionDef : null;
    text(def ? `${def.name} — ${def.giver}` : 'Neon Bay', 28, 72, 17, PALETTE.hudText, 'left', 'bold');
    text(currentObjective(world), 28, 96, 15, PALETTE.hudDim, 'left');
    // Bottom-left: wanted stars.
    context.fillStyle = PALETTE.hudBg;
    context.fillRect(14, vh - 58, 210, 44);
    text('WANTED', 28, vh - 30, 14, PALETTE.hudDim, 'left', 'bold');
    for (let i = 0; i < 5; i += 1) {
      text(i < world.wanted ? '★' : '☆', 96 + i * 22, vh - 30, 20, i < world.wanted ? '#ffcf3f' : '#5a6a80', 'left');
    }
    // Bottom-right: speed and nitro.
    const p = world.player;
    if (p.car) {
      context.fillStyle = PALETTE.hudBg;
      context.fillRect(vw - 224, vh - 58, 210, 44);
      const mph = Math.round(Math.abs(p.speed) * 0.42);
      text(`${mph}`, vw - 200, vh - 26, 26, PALETTE.hudText, 'right', 'bold');
      text('mph', vw - 186, vh - 26, 14, PALETTE.hudDim, 'left');
      context.fillStyle = '#1d2733';
      context.fillRect(vw - 150, vh - 34, 110, 10);
      context.fillStyle = p.nitro > 25 ? PALETTE.neonCyan : PALETTE.neonPink;
      context.fillRect(vw - 150, vh - 34, Math.round(110 * p.nitro / 100), 10);
      text('NITRO', vw - 150, vh - 40, 11, PALETTE.hudDim, 'left', 'bold');
    } else {
      context.fillStyle = PALETTE.hudBg;
      context.fillRect(vw - 224, vh - 58, 210, 44);
      text('ON FOOT', vw - 30, vh - 26, 16, PALETTE.hudText, 'right', 'bold');
      text('E — enter a car', vw - 30, vh - 44, 12, PALETTE.hudDim, 'right');
    }
    // Bust meter, centre top, only while it matters.
    if (world.bust > 0.02) {
      context.fillStyle = PALETTE.hudBg;
      context.fillRect(vw / 2 - 130, 14, 260, 34);
      text('BUSTED?', vw / 2 - 118, 38, 15, '#ff6b5e', 'left', 'bold');
      context.fillStyle = '#3a0d0d';
      context.fillRect(vw / 2 - 40, 22, 160, 14);
      context.fillStyle = '#ff3b30';
      context.fillRect(vw / 2 - 40, 22, Math.round(160 * world.bust), 14);
    }
    // Banner message.
    if (world.message && world.message.t > 0) {
      context.globalAlpha = Math.min(1, world.message.t);
      text(world.message.text, vw / 2, 66, 18, PALETTE.neonYellow, 'center', 'bold');
      context.globalAlpha = 1;
    }
    // Controls hint, bottom centre.
    text('WASD drive · E enter car · Shift nitro · Space punch · P pause · Q save · M missions', vw / 2, vh - 14, 13, PALETTE.hudDim, 'center');
    drawMinimap(world);
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const height = 150 + lines.length * 30 + 60;
    const x = (vw - width) / 2;
    const y = (vh - height) / 2;
    context.fillStyle = 'rgba(6, 10, 18, 0.88)';
    context.fillRect(x, y, width, height);
    context.strokeStyle = accent || PALETTE.neonCyan;
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
    text(title, vw / 2, y + 64, 44, accent || PALETTE.neonCyan, 'center', 'bold');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], vw / 2, y + 116 + i * 30, 19, PALETTE.hudText, 'center');
    }
    text(prompt, vw / 2, y + height - 30, 18, PALETTE.neonYellow, 'center');
  }

  function drawTitle(world) {
    context.fillStyle = 'rgba(4, 6, 14, 0.55)';
    context.fillRect(0, 0, vw, vh);
    text('NEON BAY', vw / 2, 150, 84, PALETTE.neonPink, 'center', 'bold');
    text('an open-world crime game', vw / 2, 190, 22, PALETTE.hudText, 'center');
    const lines = [
      'Rook is broke, fast, and out of options. Delia Vane runs the night —',
      'and she has work for a driver who asks no questions.',
      '',
      `Cash $${world.cash}   ·   Missions complete ${world.stats.missionsDone} of 4   ·   Best cash $${world.bestCash || 0}`,
      '',
      '1 First Gear    2 Neon Run    3 Tag the Town    4 The Ledger',
      'Steal a car, run couriers, spray the town, steal the ledger.',
    ];
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], vw / 2, 250 + i * 28, 18, i < 2 ? PALETTE.hudDim : PALETTE.hudText, 'center');
    }
    text('Press Enter to start · C to continue · M for missions', vw / 2, vh - 90, 20, PALETTE.neonYellow, 'center');
    text('WASD move / drive · E enter or steal a car · Shift nitro · Space punch · P pause · Q save', vw / 2, vh - 56, 15, PALETTE.hudDim, 'center');
  }

  function drawMissions(world) {
    context.fillStyle = 'rgba(4, 6, 14, 0.6)';
    context.fillRect(0, 0, vw, vh);
    const lines = world.missionDefs.map((d, i) => {
      const state = world.mission.completed[i] ? 'DONE' : i === world.mission.index ? 'ACTIVE' : i < world.mission.index ? 'OPEN' : 'LOCKED';
      const locked = i > world.mission.index && !world.mission.completed[i];
      return `${i + 1}. ${d.name} — ${d.brief}  [${locked ? 'LOCKED' : state}]  $${d.reward}`;
    });
    drawPanel('Missions', lines, 'Press 1-4 to start a mission · Esc to close', PALETTE.neonYellow);
  }

  /** Paint one frame: the city, then the HUD and the screen's panel. */
  function draw(world, screen) {
    const p = world.player;
    const cam = {
      ox: Math.max(0, Math.min(WORLD - vw, p.x - vw / 2)),
      oy: Math.max(0, Math.min(WORLD - vh, p.y - vh / 2)),
      x: 0, y: 0, w: vw, h: vh,
    };
    // When the window is bigger than the world, centre the world instead.
    if (vw >= WORLD) cam.ox = (WORLD - vw) / 2;
    if (vh >= WORLD) cam.oy = (WORLD - vh) / 2;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#05070d';
    context.fillRect(0, 0, vw, vh);
    drawCity(world, cam);
    drawMarker(world, cam);
    drawRoadblocks(world, cam);
    drawPeds(world, cam);
    for (const car of world.cars) drawCar(car, cam, car === p.car, world.time);
    drawPlayer(world, cam);
    drawParticles(world, cam);
    drawNight(world);
    if (screen === SCREEN_TITLE) {
      drawHud(world);
      drawTitle(world);
      return;
    }
    drawHud(world);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The city will wait for you.'], 'Press P to resume', PALETTE.neonCyan);
    } else if (screen === SCREEN_MISSIONS) {
      drawMissions(world);
    } else if (screen === SCREEN_FAILED) {
      drawPanel('Mission failed', [world.mission.failed === 'busted' ? 'The police caught Rook.' : 'The clock ran out.'], 'Press Enter to retry the mission', '#ff6b5e');
    } else if (screen === SCREEN_COMPLETE) {
      drawPanel('STORY COMPLETE', [
        'The ledger is safe, the heat is off, and Rook is no longer broke.',
        `Final cash $${world.cash} · ${world.stats.carsStolen} car${world.stats.carsStolen === 1 ? '' : 's'} stolen · ${world.stats.tagsDone} tags sprayed`,
      ], 'Press Enter to keep roaming Neon Bay', PALETTE.neonGreen);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, resize };
}

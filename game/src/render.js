// Drawing only: the world's state and the current screen in, pixels out. The camera
// follows the player across the 1384x1384 city and the 1280x720 window shows what is
// around them; the HUD, minimap and panels sit on top. Flat shapes and canvas text.

import { CITY, FONT, MISSIONS, PALETTE, VIEW, blockCenter, roadCenter } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_WIN = 'win';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const cam = { x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align = 'left', weight = '') {
    const key = `${weight}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function panel(x, y, w, h, alpha = 0.72) {
    context.fillStyle = `rgba(16, 18, 28, ${alpha})`;
    context.beginPath();
    context.roundRect(x, y, w, h, 10);
    context.fill();
    context.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    context.stroke();
  }

  function bar(x, y, w, h, ratio, color, bg = '#2a2e3d') {
    context.fillStyle = bg;
    context.beginPath();
    context.roundRect(x, y, w, h, h / 2);
    context.fill();
    if (ratio > 0) {
      context.fillStyle = color;
      context.beginPath();
      context.roundRect(x, y, Math.max(h, w * clamp(ratio, 0, 1)), h, h / 2);
      context.fill();
    }
  }

  function drawCity(world) {
    const { city, state } = world;
    const night = state.night;
    // Ground.
    context.fillStyle = PALETTE.ground;
    context.fillRect(cam.x - 40, cam.y - 40, VIEW.width + 80, VIEW.height + 80);

    // Sidewalk blocks (the ring shows where buildings and parks do not cover it).
    context.fillStyle = PALETTE.sidewalk;
    for (let c = 0; c < 5; c += 1) {
      for (let r = 0; r < 5; r += 1) {
        context.fillRect(c * CITY.pitch + CITY.road / 2, r * CITY.pitch + CITY.road / 2, CITY.block, CITY.block);
      }
    }

    // Parks and the plaza.
    for (const park of city.parks) {
      if (park.kind === 'docks') {
        context.fillStyle = '#1b2b38';
        context.fillRect(park.x, park.y, park.w, park.h);
        context.fillStyle = PALETTE.water;
        context.fillRect(1336, 528, CITY.size - 1336, 264);
        context.strokeStyle = '#3a5a70';
        context.lineWidth = 2;
        context.strokeRect(1336, 528, CITY.size - 1336, 264);
        context.fillStyle = '#7fb3cc';
        for (let i = 0; i < 6; i += 1) {
          context.fillRect(1344 + i * 6, 560 + i * 36, 26, 2);
        }
      } else if (park.kind === 'lot') {
        context.fillStyle = '#22242e';
        context.fillRect(park.x, park.y, park.w, park.h);
        context.strokeStyle = '#565b6b';
        context.lineWidth = 2;
        context.setLineDash([8, 8]);
        context.strokeRect(park.x + 10, park.y + 10, park.w - 20, park.h - 20);
        context.setLineDash([]);
        context.fillStyle = '#565b6b';
        context.font = `700 18px ${FONT}`;
        context.textAlign = 'center';
        context.fillText(park.label || 'LOT', park.x + park.w / 2, park.y + park.h / 2 + 6);
      } else {
        context.fillStyle = PALETTE.park;
        context.fillRect(park.x, park.y, park.w, park.h);
        context.strokeStyle = '#2c5a37';
        context.lineWidth = 2;
        context.strokeRect(park.x + 4, park.y + 4, park.w - 8, park.h - 8);
        if (park.kind === 'plaza') {
          context.fillStyle = '#232838';
          context.beginPath();
          context.arc(park.x + park.w / 2, park.y + park.h / 2, 52, 0, Math.PI * 2);
          context.fill();
          context.strokeStyle = '#3a3f55';
          context.stroke();
        } else {
          context.fillStyle = '#2c5a37';
          for (let i = 0; i < 5; i += 1) {
            context.beginPath();
            context.arc(park.x + 30 + i * 36, park.y + 40 + (i % 2) * 90, 16, 0, Math.PI * 2);
            context.fill();
          }
        }
      }
    }

    // Roads.
    context.fillStyle = PALETTE.road;
    for (let i = 0; i < CITY.roads; i += 1) {
      const c = roadCenter(i);
      context.fillRect(c - CITY.road / 2, 0, CITY.road, CITY.size);
      context.fillRect(0, c - CITY.road / 2, CITY.size, CITY.road);
    }
    // Lane dashes, skipping the intersections.
    context.fillStyle = PALETTE.lane;
    for (let i = 0; i < CITY.roads; i += 1) {
      const c = roadCenter(i);
      for (let s = 0; s < CITY.size; s += 44) {
        const nearCross = [0, 1, 2, 3, 4, 5].some((j) => Math.abs(s + 12 - roadCenter(j)) < 46);
        if (nearCross) continue;
        context.fillRect(c - 2, s, 4, 22);
        context.fillRect(s, c - 2, 22, 4);
      }
    }

    // Buildings with lit windows and a neon edge.
    for (const b of city.buildings) {
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.strokeStyle = PALETTE.buildingEdge;
      context.lineWidth = 2;
      context.strokeRect(b.x, b.y, b.w, b.h);
      for (const win of b.windows) {
        context.fillStyle = win.lit ? PALETTE.windowLit : PALETTE.windowDark;
        context.globalAlpha = win.lit ? (night ? 0.95 : 0.55) : 0.8;
        context.fillRect(win.x, win.y, 12, 10);
      }
      context.globalAlpha = 1;
      context.fillStyle = 'rgba(255,255,255,0.05)';
      context.fillRect(b.x, b.y, b.w, 4);
    }

    // Neon signs glow harder at night.
    context.save();
    context.shadowBlur = night ? 18 : 8;
    for (const sign of city.signs) {
      context.shadowColor = sign.color;
      context.fillStyle = sign.color;
      context.font = `700 15px ${FONT}`;
      context.textAlign = 'center';
      context.fillText(sign.text, sign.x, sign.y);
    }
    context.restore();
  }

  function drawCarShape(car, isPlayer) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    const len = 46;
    const wid = 22;
    context.fillStyle = 'rgba(0,0,0,0.35)';
    context.beginPath();
    context.roundRect(-len / 2 + 3, -wid / 2 + 3, len, wid, 7);
    context.fill();
    context.fillStyle = car.wrecked ? '#3a3d47' : car.color;
    context.beginPath();
    context.roundRect(-len / 2, -wid / 2, len, wid, 7);
    context.fill();
    if (!car.wrecked) {
      context.fillStyle = 'rgba(20, 26, 38, 0.9)';
      context.beginPath();
      context.roundRect(-4, -wid / 2 + 3, 14, wid - 6, 3);
      context.fill();
      context.fillStyle = '#dfe6f2';
      context.beginPath();
      context.roundRect(len / 2 - 9, -wid / 2 + 2, 7, wid - 4, 2);
      context.fill();
      context.fillStyle = '#ffe9a8';
      context.fillRect(len / 2 - 2, -wid / 2 + 2, 3, 5);
      context.fillRect(len / 2 - 2, wid / 2 - 7, 3, 5);
      context.fillStyle = '#ff3b30';
      context.fillRect(-len / 2, -wid / 2 + 2, 3, 5);
      context.fillRect(-len / 2, wid / 2 - 7, 3, 5);
    }
    if (car.kind === 'police') {
      const flash = Math.floor(performance.now() / 260) % 2 === 0;
      context.fillStyle = flash ? PALETTE.policeLight : PALETTE.policeLight2;
      context.fillRect(-6, -wid / 2 - 3, 12, 6);
      context.fillStyle = '#11141b';
      context.font = `700 9px ${FONT}`;
      context.textAlign = 'center';
      context.fillText('POLICE', 0, 3);
    }
    if (isPlayer) {
      context.strokeStyle = '#ffffff';
      context.lineWidth = 2;
      context.beginPath();
      context.roundRect(-len / 2 - 4, -wid / 2 - 4, len + 8, wid + 8, 9);
      context.stroke();
    }
    context.restore();
  }

  function drawPerson(x, y, angle, color, label) {
    context.save();
    context.translate(x, y);
    context.fillStyle = 'rgba(0,0,0,0.35)';
    context.beginPath();
    context.ellipse(1, 3, 9, 7, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = color;
    context.beginPath();
    context.arc(0, 0, 10, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = 'rgba(0,0,0,0.6)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(Math.cos(angle) * 13, Math.sin(angle) * 13);
    context.stroke();
    if (label) {
      context.fillStyle = '#fff';
      context.font = `700 11px ${FONT}`;
      context.textAlign = 'center';
      context.fillText(label, 0, -15);
    }
    context.restore();
  }

  function drawWorld(world) {
    const { city, state } = world;
    const p = state.player;
    cam.x = clamp(p.x - VIEW.width / 2, 0, Math.max(0, CITY.size - VIEW.width));
    cam.y = clamp(p.y - VIEW.height / 2, 0, Math.max(0, CITY.size - VIEW.height));

    context.save();
    context.translate(-cam.x, -cam.y);
    drawCity(world);

    // Mission beacon: a pulsing ring where the player is headed.
    if (!state.storyComplete) {
      const t = state.mission.target;
      const pulse = 1 + 0.12 * Math.sin(state.elapsed * 4);
      context.strokeStyle = '#ffd166';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(t.x, t.y, 30 * pulse, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = 'rgba(255, 209, 102, 0.25)';
      context.beginPath();
      context.arc(t.x, t.y, 20 * pulse, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#ffd166';
      context.font = `700 13px ${FONT}`;
      context.textAlign = 'center';
      context.fillText('★', t.x, t.y + 5);
    }

    // Tags: pink neon diamonds, taken ones gone.
    for (const tag of city.tags) {
      if (tag.taken) continue;
      const glow = 0.6 + 0.4 * Math.sin(state.elapsed * 5 + tag.x);
      context.save();
      context.translate(tag.x, tag.y);
      context.rotate(Math.PI / 4);
      context.globalAlpha = glow;
      context.fillStyle = '#ff2d78';
      context.shadowColor = '#ff2d78';
      context.shadowBlur = 14;
      context.fillRect(-9, -9, 18, 18);
      context.restore();
      context.globalAlpha = 1;
    }

    // Pickups.
    for (const pickup of city.pickups) {
      if (!pickup.active) continue;
      const colors = { cash: '#7ee081', health: '#ff6b6b', nitro: '#4fc3f7', repair: '#ffd166' };
      const labels = { cash: '$', health: '+', nitro: 'N', repair: 'R' };
      context.fillStyle = colors[pickup.kind];
      context.beginPath();
      context.arc(pickup.x, pickup.y, 12, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#14161d';
      context.font = `700 13px ${FONT}`;
      context.textAlign = 'center';
      context.fillText(labels[pickup.kind], pickup.x, pickup.y + 5);
    }

    // Roadblocks: striped barriers.
    for (const rb of state.roadblocks) {
      context.save();
      context.translate(rb.x, rb.y);
      context.rotate(rb.angle);
      context.fillStyle = '#e8e8f0';
      context.fillRect(-30, -8, 60, 16);
      context.fillStyle = '#ff3b30';
      for (let i = -30; i < 30; i += 12) context.fillRect(i, -8, 6, 16);
      context.restore();
    }

    // Cars: parked and traffic first, police, then the player's.
    for (const car of state.cars) {
      if (car.kind === 'police' || car === p.car) continue;
      drawCarShape(car, false);
    }
    for (const car of state.cars) {
      if (car.kind === 'police') drawCarShape(car, false);
    }
    if (p.car) drawCarShape(p.car, true);

    // Pedestrians keep to the sidewalks; the fallen stay down a while.
    for (const ped of state.peds) {
      if (ped.down > 0) {
        context.save();
        context.translate(ped.x, ped.y);
        context.rotate(1.2);
        context.fillStyle = ped.color;
        context.fillRect(-10, -4, 20, 8);
        context.restore();
      } else {
        drawPerson(ped.x, ped.y, 0, ped.color, null);
      }
    }

    // Rivals with health bars.
    for (const rival of state.rivals) {
      if (!rival.alive) continue;
      drawPerson(rival.x, rival.y, rival.angle, '#ff5252', null);
      context.fillStyle = '#2a2e3d';
      context.fillRect(rival.x - 14, rival.y - 26, 28, 5);
      context.fillStyle = '#ff5252';
      context.fillRect(rival.x - 14, rival.y - 26, 28 * clamp(rival.health / 100, 0, 1), 5);
    }

    // Marlow the courier, ledger in hand until it is taken.
    const c = state.courier;
    if (c) {
      drawPerson(c.x, c.y, c.angle, '#ffb300', c.mode === 'stall' ? '!' : null);
      if (c.hasLedger) {
        context.fillStyle = '#8d6e00';
        context.fillRect(c.x + 8, c.y - 4, 8, 6);
      }
    }

    // The player on foot.
    if (p.onFoot) {
      const blink = p.punchCooldown > 0.3;
      drawPerson(p.x, p.y, p.angle, blink ? '#9be7ff' : '#4fc3f7', 'ROOK');
    }

    // Particles: nitro flames, sparks, tag glitter.
    for (const pt of state.particles) {
      context.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
      context.fillStyle = pt.color;
      context.beginPath();
      context.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;

    // Night: a blue veil, and headlights ahead of the cars.
    if (state.night) {
      context.fillStyle = 'rgba(8, 10, 28, 0.34)';
      context.fillRect(cam.x, cam.y, VIEW.width, VIEW.height);
      for (const car of state.cars) {
        if (car.parked || car.wrecked) continue;
        context.save();
        context.translate(car.x, car.y);
        context.rotate(car.angle);
        const grad = context.createRadialGradient(30, 0, 4, 60, 0, 90);
        grad.addColorStop(0, 'rgba(255, 240, 180, 0.20)');
        grad.addColorStop(1, 'rgba(255, 240, 180, 0)');
        context.fillStyle = grad;
        context.beginPath();
        context.moveTo(20, -8);
        context.lineTo(110, -42);
        context.lineTo(110, 42);
        context.lineTo(20, 8);
        context.closePath();
        context.fill();
        context.restore();
      }
    }
    context.restore();

    // Objective arrow at the screen edge when the target is off-screen.
    if (!state.storyComplete) {
      const t = state.mission.target;
      const sx = t.x - cam.x;
      const sy = t.y - cam.y;
      if (sx < 20 || sx > VIEW.width - 20 || sy < 20 || sy > VIEW.height - 20) {
        const cx = VIEW.width / 2;
        const cy = VIEW.height / 2;
        const a = Math.atan2(sy - cy, sx - cx);
        const ex = cx + Math.cos(a) * 300;
        const ey = cy + Math.sin(a) * 180;
        const dd = Math.round(dist(t.x, t.y, p.x, p.y));
        context.save();
        context.translate(ex, ey);
        context.rotate(a);
        context.fillStyle = '#ffd166';
        context.beginPath();
        context.moveTo(14, 0);
        context.lineTo(-10, -10);
        context.lineTo(-10, 10);
        context.closePath();
        context.fill();
        context.restore();
        text(`${dd}m`, ex, ey + 28, 14, '#ffd166', 'center', '700 ');
      }
    }
  }

  function drawHud(world, ui) {
    const { state } = world;
    const p = state.player;
    // Cash and wanted, top left.
    panel(16, 14, 250, 96);
    text(`$${p.cash.toLocaleString('en-US')}`, 30, 46, 30, '#eef1f5', 'left', '700 ');
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += i < p.wanted ? '★' : '☆';
    text(stars, 30, 78, 24, p.wanted >= 3 ? '#ff5252' : '#ffd166', 'left');
    text(p.wanted === 0 ? 'CLEAN' : `WANTED ${p.wanted}`, 150, 78, 15, '#8b93a3', 'left', '700 ');
    text(`TAGS ${state.tagsTaken}/8`, 30, 100, 14, '#ff2d78', 'left', '700 ');

    // Health and nitro, bottom left.
    panel(16, VIEW.height - 86, 250, 70);
    text('HP', 30, VIEW.height - 56, 13, '#8b93a3', 'left', '700 ');
    bar(62, VIEW.height - 68, 180, 12, p.health / 100, p.health > 30 ? '#7ee081' : '#ff5252');
    if (!p.onFoot && p.car) {
      text('NITRO', 30, VIEW.height - 32, 13, '#8b93a3', 'left', '700 ');
      bar(62, VIEW.height - 44, 180, 12, p.nitro / 100, '#4fc3f7');
      // Speedometer: px/s scaled so the Comet's nitro top speed reads ~300 km/h.
      text(`${Math.round(Math.abs(p.car.speed) * 0.55)} km/h`, VIEW.width - 30, VIEW.height - 30, 22, '#eef1f5', 'right', '700 ');
    } else {
      text('ON FOOT — E near a car to drive', 30, VIEW.height - 32, 13, '#8b93a3', 'left');
    }

    // Mission line, top centre.
    const m = state.mission;
    const label = state.storyComplete ? 'STORY COMPLETE' : `MISSION ${m.index + 1}/4 — ${MISSIONS[m.index].name}`;
    const sub = state.storyComplete ? 'Neon Bay is yours, Rook.' : m.text;
    panel(VIEW.width / 2 - 260, 14, 520, 64);
    text(label, VIEW.width / 2, 40, 17, '#ffd166', 'center', '700 ');
    text(sub, VIEW.width / 2, 64, 15, '#eef1f5', 'center');

    // Clock and mute, top right — above the minimap.
    const hour = Math.floor(6 + state.dayT * 24) % 24;
    const minute = Math.floor((state.dayT * 24 * 60) % 60);
    const clock = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    text(`${state.night ? '🌙' : '☀️'} ${clock}${ui.muted ? '  ·  MUTED' : ''}`, VIEW.width - 216, 40, 16, '#eef1f5', 'right', '700 ');

    // Bust warning, centre.
    if (p.bust > 0.05) {
      const w = 340;
      panel(VIEW.width / 2 - w / 2, 96, w, 44);
      text('⚠ POLICE ARE GRABBING YOU — DRIVE!', VIEW.width / 2, 118, 16, '#ff5252', 'center', '700 ');
      bar(VIEW.width / 2 - w / 2 + 16, 128, w - 32, 8, p.bust, '#ff5252');
    }

    // Toast message from the world.
    if (state.messageTimer > 0 && state.message) {
      const alpha = clamp(state.messageTimer, 0, 1);
      context.globalAlpha = alpha;
      panel(VIEW.width / 2 - 320, VIEW.height - 150, 640, 40);
      text(state.message, VIEW.width / 2, VIEW.height - 124, 16, '#eef1f5', 'center');
      context.globalAlpha = 1;
    }
    if (ui.savedFlash) {
      panel(VIEW.width / 2 - 90, VIEW.height - 200, 180, 34);
      text('Saved ✓', VIEW.width / 2, VIEW.height - 177, 15, '#7ee081', 'center', '700 ');
    }
  }

  function drawMinimap(world) {
    const { state } = world;
    const size = 190;
    const x0 = VIEW.width - size - 16;
    const y0 = 54;
    const scale = size / CITY.size;
    panel(x0 - 6, y0 - 6, size + 12, size + 12, 0.8);
    context.save();
    context.beginPath();
    context.rect(x0, y0, size, size);
    context.clip();
    context.fillStyle = '#14161d';
    context.fillRect(x0, y0, size, size);
    context.fillStyle = '#2e313c';
    for (let c = 0; c < 5; c += 1) {
      for (let r = 0; r < 5; r += 1) {
        context.fillRect(x0 + (c * CITY.pitch + 32) * scale, y0 + (r * CITY.pitch + 32) * scale, 200 * scale, 200 * scale);
      }
    }
    context.fillStyle = '#3a3f55';
    for (let i = 0; i < CITY.roads; i += 1) {
      const c = roadCenter(i) * scale;
      context.fillRect(x0 + c - 2, y0, 4, size);
      context.fillRect(x0, y0 + c - 2, size, 4);
    }
    const dot = (x, y, color, r = 3) => {
      context.fillStyle = color;
      context.beginPath();
      context.arc(x0 + x * scale, y0 + y * scale, r, 0, Math.PI * 2);
      context.fill();
    };
    for (const tag of world.city.tags) if (!tag.taken) dot(tag.x, tag.y, '#ff2d78', 2);
    for (const car of state.cars) {
      if (car.kind === 'police') dot(car.x, car.y, Math.floor(state.elapsed * 2) % 2 === 0 ? '#ff3b30' : '#2979ff', 3);
    }
    if (state.courier && state.mission.index === 3) dot(state.courier.x, state.courier.y, '#ffb300', 3);
    if (!state.storyComplete) {
      const t = state.mission.target;
      const pulse = 3 + Math.sin(state.elapsed * 5) * 1.5;
      dot(t.x, t.y, '#ffd166', pulse);
    }
    dot(state.player.x, state.player.y, '#4fc3f7', 4);
    context.restore();
    context.strokeStyle = 'rgba(255,255,255,0.25)';
    context.strokeRect(x0 - 6, y0 - 6, size + 12, size + 12);
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const height = 150 + lines.length * 30 + 60;
    const x = (VIEW.width - width) / 2;
    const y = (VIEW.height - height) / 2;
    context.fillStyle = 'rgba(10, 12, 20, 0.82)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    context.fillStyle = '#171a26';
    context.beginPath();
    context.roundRect(x, y, width, height, 14);
    context.fill();
    context.strokeStyle = accent;
    context.lineWidth = 2;
    context.stroke();
    text(title, VIEW.width / 2, y + 66, 44, accent, 'center', '800 ');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], VIEW.width / 2, y + 112 + i * 30, 19, '#c8ccd8', 'center');
    }
    text(prompt, VIEW.width / 2, y + height - 30, 20, '#ffd166', 'center', '700 ');
  }

  function drawTitle(world, ui) {
    drawWorld(world);
    const lines = [
      'Rook drives for Delia Vane. Four jobs stand between',
      'a nobody and the whole of Neon Bay — if the cops let him.',
      '',
      'WASD drive & walk · E enter/exit car · F punch · Shift nitro/sprint',
      'Space handbrake · C save · M mute · P pause',
    ];
    if (ui.save) lines.push(`Continue: ${ui.save.missionIndex + 1 <= 4 ? `Mission ${ui.save.missionIndex + 1}/4` : 'Story complete'} · $${ui.save.cash.toLocaleString('en-US')}`);
    lines.push(`Best cash: $${ui.best.toLocaleString('en-US')}`);
    drawPanel('NEON BAY', lines, ui.save ? 'Press ENTER to continue the story' : 'Press ENTER to start', '#ff2d78');
  }

  function drawWin(world, ui) {
    drawWorld(world);
    const lines = [
      `All four jobs done. Cash: $${world.state.player.cash.toLocaleString('en-US')}`,
      `Tags collected: ${world.state.tagsTaken}/8 · Cars stolen: ${world.state.stats.carsStolen}`,
      'Delia is proud. The city is yours, Rook.',
    ];
    drawPanel('STORY COMPLETE', lines, 'Press ENTER to keep cruising Neon Bay', '#ffd166');
  }

  /** Paint one frame: the world, then the HUD or a panel for the screen the game is on. */
  function draw(world, screen, ui) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#0b0d14';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen === SCREEN_TITLE) {
      drawTitle(world, ui);
      return;
    }
    drawWorld(world);
    drawHud(world, ui);
    drawMinimap(world);
    if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The city waits for you.', 'WASD drive & walk · E enter/exit car · F punch', 'Shift nitro · C save · M mute'], 'Press P to resume', '#4fc3f7');
    } else if (screen === SCREEN_WIN) {
      drawWin(world, ui);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}

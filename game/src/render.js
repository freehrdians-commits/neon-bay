// Drawing only: the world state and the screen in, pixels out. The canvas
// is a fixed 1280x720 logical field, scaled by CSS to the window. The camera
// follows the player with the exact formula the playtests assume: the view's
// top-left corner is the player's position minus half the screen, clamped to
// the city.
import { CITY_W, CITY_H, ROAD_WIDTH, MARKERS, roadCenter, clamp, dist } from './city.js';
import { MISSIONS, objectiveFor } from './missions.js';
import { nightFactor, TAG_SPOTS } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

export function cameraFor(state) {
  const p = state.player;
  return {
    x: clamp(p.x - 640, 0, CITY_W - 1280),
    y: clamp(p.y - 360, 0, CITY_H - 720),
  };
}

// Title-screen buttons, in logical canvas coordinates. The playtests click
// Continue at (640, 526), so that rect must stay exactly here.
export const BUTTONS = {
  newGame: { x: 440, y: 430, w: 400, h: 56 },
  continue: { x: 440, y: 498, w: 400, h: 56 },
};

function inRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function titleButtonAt(mx, my, hasSave) {
  if (inRect(mx, my, BUTTONS.newGame)) return 'new';
  if (hasSave && inRect(mx, my, BUTTONS.continue)) return 'continue';
  return null;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const fonts = new Map();
  function font(size, weight) {
    const key = `${weight || ''}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight || ''} ${size}px Arial, sans-serif`);
    return fonts.get(key);
  }
  function text(value, x, y, size, color, align, weight) {
    ctx.font = font(size, weight);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // -------------------------------------------------------------------------
  function drawCity(state, cam) {
    const { buildings, trees, crates } = state.city;
    // Ground: warm pavement.
    ctx.fillStyle = '#b5ac9c';
    ctx.fillRect(cam.x - 4, cam.y - 4, 1288, 728);
    // Blocks: alternating warm tones.
    for (let bi = 0; bi < 5; bi++) {
      for (let bj = 0; bj < 5; bj++) {
        const bx = ROAD_WIDTH + bi * 272;
        const by = ROAD_WIDTH + bj * 272;
        ctx.fillStyle = (bi + bj) % 2 === 0 ? '#a89f8d' : '#9d9482';
        ctx.fillRect(bx, by, 200, 200);
      }
    }
    // Park and plaza ground.
    ctx.fillStyle = '#6fae5e';
    ctx.fillRect(ROAD_WIDTH + 3 * 272, ROAD_WIDTH + 1 * 272, 200, 200);
    ctx.fillStyle = '#c9bda6';
    ctx.fillRect(ROAD_WIDTH + 2 * 272, ROAD_WIDTH + 2 * 272, 200, 200);
    ctx.fillStyle = '#8d8578';
    ctx.fillRect(ROAD_WIDTH + 4 * 272, ROAD_WIDTH + 4 * 272, 200, 200);
    // Plaza fountain.
    ctx.fillStyle = '#5e93b8';
    ctx.beginPath();
    ctx.arc(MARKERS.plaza.x, MARKERS.plaza.y, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c9bda6';
    ctx.beginPath();
    ctx.arc(MARKERS.plaza.x, MARKERS.plaza.y, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5e93b8';
    ctx.beginPath();
    ctx.arc(MARKERS.plaza.x, MARKERS.plaza.y, 12, 0, Math.PI * 2);
    ctx.fill();

    // Roads: asphalt with edge lines and a dashed centre line.
    ctx.fillStyle = '#3a3d42';
    for (let i = 0; i <= 5; i++) {
      const c = roadCenter(i);
      ctx.fillRect(c - ROAD_WIDTH / 2, 0, ROAD_WIDTH, CITY_H);
      ctx.fillRect(0, c - ROAD_WIDTH / 2, CITY_W, ROAD_WIDTH);
    }
    ctx.strokeStyle = '#e8c33a';
    ctx.lineWidth = 2;
    ctx.setLineDash([18, 22]);
    ctx.beginPath();
    for (let i = 0; i <= 5; i++) {
      const c = roadCenter(i);
      ctx.moveTo(c, 0);
      ctx.lineTo(c, CITY_H);
      ctx.moveTo(0, c);
      ctx.lineTo(CITY_W, c);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#d8d8d8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 5; i++) {
      const c = roadCenter(i);
      ctx.moveTo(c - ROAD_WIDTH / 2 + 2, 0);
      ctx.lineTo(c - ROAD_WIDTH / 2 + 2, CITY_H);
      ctx.moveTo(c + ROAD_WIDTH / 2 - 2, 0);
      ctx.lineTo(c + ROAD_WIDTH / 2 - 2, CITY_H);
      ctx.moveTo(0, c - ROAD_WIDTH / 2 + 2);
      ctx.lineTo(CITY_W, c - ROAD_WIDTH / 2 + 2);
      ctx.moveTo(0, c + ROAD_WIDTH / 2 - 2);
      ctx.lineTo(CITY_W, c + ROAD_WIDTH / 2 - 2);
    }
    ctx.stroke();

    // Trees, crates, buildings.
    for (const t of trees) {
      ctx.fillStyle = '#2f6b2f';
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4c8a3f';
      ctx.beginPath();
      ctx.arc(t.x - 3, t.y - 3, t.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const cr of crates) {
      ctx.fillStyle = cr.color;
      ctx.fillRect(cr.x, cr.y, cr.w, cr.h);
      ctx.strokeStyle = '#00000044';
      ctx.strokeRect(cr.x, cr.y, cr.w, cr.h);
    }
    for (const b of buildings) {
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = '#00000030';
      ctx.fillRect(b.x, b.y, b.w, 10);
      ctx.fillRect(b.x, b.y, 10, b.h);
      ctx.fillStyle = '#ffffff2e';
      for (let wx = b.x + 14; wx < b.x + b.w - 10; wx += 22) {
        for (let wy = b.y + 16; wy < b.y + b.h - 10; wy += 22) {
          ctx.fillRect(wx, wy, 8, 10);
        }
      }
      if (b.label) {
        text(b.label, b.x + b.w / 2, b.y + b.h / 2 + 6, 15, '#ffffff', 'center', 'bold');
      }
    }
    // Street lamps at every intersection.
    ctx.fillStyle = '#2c2f33';
    for (let i = 0; i <= 5; i++) {
      for (let j = 0; j <= 5; j++) {
        ctx.fillRect(roadCenter(i) + 30, roadCenter(j) - 34, 4, 8);
      }
    }
    // Neon signs on building faces: dim by day, glowing after dark.
    const night = nightFactor(state);
    for (const s of state.city.signs || []) {
      ctx.save();
      if (night > 0.3) {
        ctx.shadowColor = s.color;
        ctx.shadowBlur = 14;
      }
      text(s.text, s.x, s.y, 13, s.color, 'center', 'bold');
      ctx.restore();
    }
  }

  function drawMarker(state) {
    const obj = objectiveFor(state.missionIndex, state.missionStage, state);
    if (!obj || state.gameOver) return;
    const pulse = 1 + 0.18 * Math.sin(state.time * 4);
    ctx.save();
    ctx.translate(obj.x, obj.y);
    ctx.strokeStyle = '#ffd21f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 30 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffd21f';
    ctx.beginPath();
    ctx.moveTo(0, -52);
    ctx.lineTo(10, -34);
    ctx.lineTo(-10, -34);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd21f';
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    text(obj.label, obj.x, obj.y - 62, 15, '#ffd21f', 'center', 'bold');
  }

  function drawCarShape(car, night) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    // Body.
    ctx.fillStyle = car.color;
    roundRect(-18, -10, 36, 20, 5);
    ctx.fill();
    // Roof and windshield.
    ctx.fillStyle = '#20242a';
    roundRect(-4, -8, 12, 16, 3);
    ctx.fill();
    ctx.fillStyle = '#9fc4e8';
    ctx.fillRect(6, -8, 5, 16);
    // Headlights at night.
    if (night) {
      ctx.fillStyle = '#fff6b0';
      ctx.fillRect(16, -8, 3, 4);
      ctx.fillRect(16, 4, 3, 4);
    }
    if (car.kind === 'police') {
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(-18, -10, 12, 20);
      const flash = Math.floor(state_time() * 4) % 2 === 0;
      ctx.fillStyle = flash ? '#ff2e2e' : '#2e6bff';
      ctx.fillRect(-8, -9, 8, 4);
      ctx.fillStyle = flash ? '#2e6bff' : '#ff2e2e';
      ctx.fillRect(-8, 5, 8, 4);
    }
    if (car.gold) {
      ctx.strokeStyle = '#fff2a8';
      ctx.lineWidth = 2;
      roundRect(-18, -10, 36, 20, 5);
      ctx.stroke();
    }
    if (car.kind === 'courier') {
      // Marlow's ledger car: black with a gold racing stripe.
      ctx.strokeStyle = '#e8c33a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-18, 0);
      ctx.lineTo(18, 0);
      ctx.stroke();
      ctx.fillStyle = '#e8c33a';
      ctx.fillRect(-14, -7, 6, 4);
      ctx.fillRect(-14, 3, 6, 4);
    }
    if (car.roadblock) {
      // A striped barrier plank along the car's length, spanning the road.
      ctx.strokeStyle = '#ff2e2e';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-28, 0);
      ctx.lineTo(28, 0);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(-28, 0);
      ctx.lineTo(28, 0);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  // The renderer keeps its own clock for the police light bar.
  let clock = 0;
  function state_time() {
    return clock;
  }

  function drawEntities(state, cam, night) {
    // Neon tags: pink spray stars that pulse until collected.
    for (let i = 0; i < TAG_SPOTS.length; i++) {
      if (state.tags[i]) continue;
      const spot = TAG_SPOTS[i];
      const pulse = 1 + 0.25 * Math.sin(state.time * 5 + i);
      ctx.save();
      ctx.translate(spot.x, spot.y);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#ff4fd8';
      ctx.beginPath();
      ctx.arc(0, 0, 12 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // Pickups.
    for (const pk of state.pickups) {
      if (pk.timer > 0) continue;
      const bob = Math.sin(state.time * 3 + pk.x) * 3;
      ctx.save();
      ctx.translate(pk.x, pk.y + bob);
      if (pk.kind === 'health') {
        ctx.fillStyle = '#2fae4e';
        ctx.beginPath();
        ctx.arc(0, 0, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(-2, -7, 4, 14);
        ctx.fillRect(-7, -2, 14, 4);
      } else if (pk.kind === 'ammo') {
        ctx.fillStyle = '#e8c33a';
        roundRect(-9, -9, 18, 18, 4);
        ctx.fill();
        ctx.fillStyle = '#3a3d42';
        ctx.fillRect(-5, -5, 3, 10);
        ctx.fillRect(0, -5, 3, 10);
        ctx.fillRect(5, -5, 3, 10);
      } else {
        ctx.fillStyle = '#2fae4e';
        ctx.beginPath();
        ctx.arc(0, 0, 13, 0, Math.PI * 2);
        ctx.fill();
        text('$', 0, 5, 16, '#fff', 'center', 'bold');
      }
      ctx.restore();
    }
    // Cars: parked and traffic first, then police, then the player's car.
    const cars = state.cars.slice().sort((a, b) => {
      const rank = (c) => (c.kind === 'player' ? 2 : c.kind === 'police' ? 1 : 0);
      return rank(a) - rank(b);
    });
    for (const car of cars) drawCarShape(car, night);
    // Pedestrians.
    for (const ped of state.peds) {
      ctx.fillStyle = ped.color;
      ctx.beginPath();
      ctx.arc(ped.x, ped.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2b2b2b';
      ctx.beginPath();
      ctx.arc(ped.x + Math.cos(ped.angle) * 4, ped.y + Math.sin(ped.angle) * 4, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Rivals: red jackets, a gun line when they are up.
    for (const r of state.rivals) {
      ctx.save();
      ctx.translate(r.x, r.y);
      if (r.down) {
        ctx.rotate(1.2);
        ctx.fillStyle = '#7a1f1f';
        ctx.beginPath();
        ctx.ellipse(0, 0, 12, 6, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#a12323';
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(r.angle) * 16, Math.sin(r.angle) * 16);
        ctx.stroke();
        ctx.fillStyle = '#ffd21f';
        text('!', 0, -14, 16, '#ffd21f', 'center', 'bold');
      }
      ctx.restore();
    }
    // Foot police.
    for (const cop of state.policeFoot) {
      ctx.fillStyle = '#1c2733';
      ctx.beginPath();
      ctx.arc(cop.x, cop.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4d7dd1';
      ctx.beginPath();
      ctx.arc(cop.x, cop.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // The player on foot.
    const p = state.player;
    if (!p.inCar) {
      const blink = p.invuln > 0 && Math.floor(p.invuln * 10) % 2 === 0;
      if (!blink) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.fillStyle = '#2e6bff';
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffd9a0';
        ctx.beginPath();
        ctx.arc(Math.cos(p.angle) * 5, Math.sin(p.angle) * 5, 5, 0, Math.PI * 2);
        ctx.fill();
        if (p.punchCd > 0.28) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, 22, p.angle - 0.7, p.angle + 0.7);
          ctx.stroke();
        }
        ctx.restore();
      }
    } else if (p.car) {
      // A white ring marks the driven car.
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.car.x, p.car.y, 26, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Bullets.
    ctx.strokeStyle = '#ffd76a';
    ctx.lineWidth = 3;
    for (const b of state.bullets) {
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // Particles.
    for (const pt of state.particles) {
      ctx.globalAlpha = Math.max(0, pt.life * 2);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
  }

  function duskFactor(state) {
    // Sunrise (~0.00) and sunset (~0.55): a warm orange wash as the day
    // turns, so the light changes smoothly instead of snapping to night.
    const t = state.timeOfDay;
    const sunset = 1 - Math.min(1, Math.abs(t - 0.55) / 0.05);
    const sunrise = 1 - Math.min(1, Math.min(Math.abs(t), Math.abs(t - 1)) / 0.05);
    return Math.max(0, Math.max(sunset, sunrise));
  }

  function drawNight(state, cam) {
    const n = nightFactor(state);
    const dusk = duskFactor(state);
    if (dusk > 0.01) {
      ctx.fillStyle = `rgba(255, 110, 40, ${0.13 * dusk})`;
      ctx.fillRect(cam.x, cam.y, 1280, 720);
    }
    if (n <= 0.01) return;
    ctx.fillStyle = `rgba(8, 12, 42, ${0.52 * n})`;
    ctx.fillRect(cam.x, cam.y, 1280, 720);
    // Street lamps and headlights punch through the dark.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i <= 5; i++) {
      for (let j = 0; j <= 5; j++) {
        const x = roadCenter(i) + 32;
        const y = roadCenter(j) - 30;
        const g = ctx.createRadialGradient(x, y, 4, x, y, 70);
        g.addColorStop(0, `rgba(255, 220, 120, ${0.20 * n})`);
        g.addColorStop(1, 'rgba(255, 220, 120, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, 70, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const car of state.cars) {
      if (car.kind === 'parked') continue;
      const hx = car.x + Math.cos(car.angle) * 18;
      const hy = car.y + Math.sin(car.angle) * 18;
      const g = ctx.createRadialGradient(hx, hy, 4, hx, hy, 60);
      g.addColorStop(0, `rgba(255, 244, 170, ${0.22 * n})`);
      g.addColorStop(1, 'rgba(255, 244, 170, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(hx, hy, 60, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // -------------------------------------------------------------------------
  function drawHud(state) {
    const p = state.player;
    const obj = objectiveFor(state.missionIndex, state.missionStage, state);
    // Top-left: health, cash, ammo, nitro, tags.
    ctx.fillStyle = '#000000c8';
    roundRect(14, 12, 250, 108, 8);
    ctx.fill();
    text('ROOK', 26, 34, 15, '#ffffff', 'left', 'bold');
    ctx.fillStyle = '#333';
    ctx.fillRect(26, 42, 150, 12);
    ctx.fillStyle = p.health > 40 ? '#37c24a' : '#e23b3b';
    ctx.fillRect(26, 42, Math.max(0, 150 * p.health) / 100, 12);
    text(`$${state.cash}`, 26, 76, 18, '#7be382', 'left', 'bold');
    text(`AMMO ${p.ammo}`, 150, 76, 15, '#ffd76a', 'left', 'bold');
    // Nitro meter, only while driving.
    if (p.inCar) {
      text('NITRO', 26, 98, 12, '#2ee6ff', 'left', 'bold');
      ctx.fillStyle = '#333';
      ctx.fillRect(80, 88, 150, 10);
      ctx.fillStyle = '#2ee6ff';
      ctx.fillRect(80, 88, Math.max(0, 150 * p.nitro) / 100, 10);
    } else {
      text(`TAGS ${state.tagsCollected}/${TAG_SPOTS.length}`, 26, 98, 12, '#ff4fd8', 'left', 'bold');
    }
    // Top-right: wanted stars.
    ctx.fillStyle = '#000000c8';
    roundRect(1050, 12, 216, 44, 8);
    ctx.fill();
    for (let i = 0; i < 5; i++) {
      text(i < state.wanted ? '★' : '☆', 1064 + i * 40, 44, 26, i < state.wanted ? '#ffd21f' : '#888888', 'left', 'bold');
    }
    // Top-centre: mission and objective.
    if (obj && !state.gameOver) {
      const mission = MISSIONS[state.missionIndex];
      const d = Math.round(dist(p.x, p.y, obj.x, obj.y) / 10);
      ctx.fillStyle = '#000000c8';
      const label = `${mission ? mission.title + ' — ' : ''}${obj.label} · ${d}m`;
      const w = ctx.measureText(label) + 28;
      roundRect(640 - w / 2, 12, w, 40, 8);
      ctx.fill();
      ctx.font = font(16, 'bold');
      const tw = ctx.measureText(label).width;
      text(label, 640 - tw / 2, 38, 16, '#ffffff', 'left', 'bold');
    }
    // Toasts under the objective bar.
    let ty = 66;
    for (const t of state.toasts) {
      ctx.globalAlpha = Math.min(1, t.life);
      text(t.text, 640, ty, 16, '#ffd21f', 'center', 'bold');
      ty += 24;
    }
    ctx.globalAlpha = 1;
    // Controls hint, early on.
    if (state.time < 25 && !state.dialog) {
      ctx.globalAlpha = 0.85;
      text('WASD move/drive · Shift nitro · E enter car / interact · F punch · Click shoot · Esc pause', 20, 706, 14, '#ffffff', 'left');
      ctx.globalAlpha = 1;
    }
    drawMinimap(state);
  }

  function drawMinimap(state) {
    const S = 180;
    const ox = 1280 - S - 14;
    const oy = 720 - S - 14;
    const k = S / CITY_W;
    ctx.fillStyle = '#000000aa';
    roundRect(ox - 6, oy - 6, S + 12, S + 12, 8);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, S, S);
    ctx.clip();
    ctx.fillStyle = '#2e3237';
    ctx.fillRect(ox, oy, S, S);
    ctx.fillStyle = '#7d838a';
    for (let i = 0; i <= 5; i++) {
      const c = roadCenter(i) * k;
      ctx.fillRect(ox, oy + c - 4, S, 8);
      ctx.fillRect(ox + c - 4, oy, 8, S);
    }
    const obj = objectiveFor(state.missionIndex, state.missionStage, state);
    if (obj) {
      ctx.fillStyle = '#ffd21f';
      ctx.beginPath();
      ctx.arc(ox + obj.x * k, oy + obj.y * k, 5 + Math.sin(state.time * 4) * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const car of state.cars) {
      if (car.kind === 'police') {
        ctx.fillStyle = '#4d7dd1';
        ctx.fillRect(ox + car.x * k - 2, oy + car.y * k - 2, 4, 4);
      } else if (car.gold) {
        ctx.fillStyle = '#e8c33a';
        ctx.fillRect(ox + car.x * k - 2, oy + car.y * k - 2, 4, 4);
      } else if (car.kind === 'courier') {
        // The ledger courier: a white diamond on the minimap.
        ctx.fillStyle = '#ffffff';
        ctx.save();
        ctx.translate(ox + car.x * k, oy + car.y * k);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-3, -3, 6, 6);
        ctx.restore();
      } else if (car.roadblock) {
        ctx.fillStyle = '#ff2e2e';
        ctx.fillRect(ox + car.x * k - 2, oy + car.y * k - 2, 4, 4);
      }
    }
    for (const r of state.rivals) {
      if (r.down) continue;
      ctx.fillStyle = '#ff4d4d';
      ctx.fillRect(ox + r.x * k - 2, oy + r.y * k - 2, 4, 4);
    }
    const p = state.player;
    ctx.save();
    ctx.translate(ox + p.x * k, oy + p.y * k);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    ctx.strokeStyle = '#ffffff55';
    ctx.strokeRect(ox - 6, oy - 6, S + 12, S + 12);
  }

  // -------------------------------------------------------------------------
  function drawDialog(state) {
    const d = state.dialog;
    if (!d) return;
    ctx.fillStyle = '#00000088';
    ctx.fillRect(0, 0, 1280, 720);
    const lines = d.lines;
    const h = 150 + lines.length * 30;
    const x = 290;
    const y = (720 - h) / 2;
    ctx.fillStyle = '#14161c';
    roundRect(x, y, 700, h, 10);
    ctx.fill();
    ctx.strokeStyle = '#ffd21f';
    ctx.lineWidth = 2;
    roundRect(x, y, 700, h, 10);
    ctx.stroke();
    text(d.speaker, 640, y + 44, 16, '#ffd21f', 'center', 'bold');
    text(d.title, 640, y + 82, 30, '#ffffff', 'center', 'bold');
    lines.forEach((line, i) => {
      text(line, 640, y + 122 + i * 30, 17, '#dddddd', 'center');
    });
    text('Press Enter to continue', 640, y + h - 24, 15, '#ffd21f', 'center');
  }

  function drawPanel(title, lines, prompt, accent) {
    const h = 170 + lines.length * 30;
    const x = 340;
    const y = (720 - h) / 2;
    ctx.fillStyle = '#14161cee';
    roundRect(x, y, 600, h, 10);
    ctx.fill();
    ctx.strokeStyle = accent || '#ffd21f';
    ctx.lineWidth = 2;
    roundRect(x, y, 600, h, 10);
    ctx.stroke();
    text(title, 640, y + 72, 40, '#ffffff', 'center', 'bold');
    lines.forEach((line, i) => {
      text(line, 640, y + 116 + i * 30, 17, '#dddddd', 'center');
    });
    text(prompt, 640, y + h - 26, 15, '#ffd21f', 'center');
  }

  function drawTitle(state, hasSave) {
    // A slow pan across the city behind the menu.
    const cam = {
      x: (Math.sin(state.time * 0.05) * 0.5 + 0.5) * (CITY_W - 1280),
      y: 300 + Math.sin(state.time * 0.03) * 120,
    };
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    drawCity(state, cam);
    ctx.restore();
    ctx.fillStyle = '#00000066';
    ctx.fillRect(0, 0, 1280, 720);
    text('NEON BAY', 640, 210, 92, '#ffd21f', 'center', 'bold');
    text('An open-world crime story', 640, 258, 24, '#ffffff', 'center');
    text('Four jobs. One ledger. The city is yours.', 640, 292, 17, '#cccccc', 'center');
    // Buttons.
    const b1 = BUTTONS.newGame;
    ctx.fillStyle = '#ffd21f';
    roundRect(b1.x, b1.y, b1.w, b1.h, 8);
    ctx.fill();
    text('NEW GAME', 640, b1.y + 37, 22, '#14161c', 'center', 'bold');
    const b2 = BUTTONS.continue;
    ctx.fillStyle = hasSave ? '#2e6bff' : '#555555';
    roundRect(b2.x, b2.y, b2.w, b2.h, 8);
    ctx.fill();
    text('CONTINUE SAVED GAME', 640, b2.y + 37, 22, '#ffffff', 'center', 'bold');
    text('WASD move & drive · E enter a car · F punch · Click to shoot · Esc pause', 640, 640, 15, '#bbbbbb', 'center');
    text('A game by an AI agent for make.fun — all characters and places are original', 640, 668, 13, '#888888', 'center');
  }

  // -------------------------------------------------------------------------
  function draw(state, hasSave) {
    clock = state.time;
    const night = nightFactor(state);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#11141b';
    ctx.fillRect(0, 0, 1280, 720);
    if (state.screen === 'title') {
      drawTitle(state, hasSave);
      return;
    }
    const cam = cameraFor(state);
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    drawCity(state, cam);
    drawMarker(state);
    drawEntities(state, cam, night > 0.3);
    ctx.restore();
    drawNight(state, cam);
    if (state.screen === 'play' || state.screen === 'paused') drawHud(state);
    if (state.dialog) drawDialog(state);
    if (state.screen === 'paused') {
      drawPanel('PAUSED', ['The city waits for you.'], 'S — save game · Esc — resume', '#2e6bff');
    } else if (state.screen === 'complete') {
      drawPanel('STORY COMPLETE', [
        `Rook owns Neon Bay. Cash: $${state.cash}.`,
        `Missions finished: ${state.missionsDone} of 4.`,
        `Neon tags found: ${state.tagsCollected} of ${TAG_SPOTS.length}.`,
        'Delia is pouring something expensive.',
      ], 'Thanks for playing Neon Bay', '#37c24a');
    } else if (state.screen === 'gameover') {
      drawPanel('BUSTED', [
        'The Neon Bay police caught up with Rook.',
        'The city is not done with you yet.',
      ], 'Press Enter to return to the title', '#e23b3b');
    }
  }

  return { draw };
}

// Drawing only: the world's state and the current screen in, pixels out. A fixed 1280x720
// logical view follows the player with a camera; the canvas scales it to the window. The city
// is drawn tile by tile, then buildings, tags, pickups, cars, people and bullets, then the
// night overlay, the minimap and the HUD, then the screen's own panel.

import { CAR, FONT, PALETTE, PLAYER, RIVAL, TILE, WORLD } from './config.js';
import { BUILDINGS, PLACES, TAG_SPOTS, WATER_RECT, tileAt } from './city.js';
import { missionAt, missionLabel, objectiveText } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const VIEW = { width: 1280, height: 720 };

/** How dark the night overlay is at each time of day (0 = noon, 1 = deep night). */
function darknessAt(timeOfDay) {
  if (timeOfDay < 0.08) return 0.5;
  if (timeOfDay < 0.2) return 0.5 - (timeOfDay - 0.08) / 0.12 * 0.5;
  if (timeOfDay < 0.55) return 0;
  if (timeOfDay < 0.68) return (timeOfDay - 0.55) / 0.13 * 0.55;
  if (timeOfDay < 0.92) return 0.55;
  return 0.55 - (timeOfDay - 0.92) / 0.08 * 0.05;
}

function timeLabel(timeOfDay) {
  const hours = (6 + timeOfDay * 24) % 24;
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  const day = timeOfDay >= 0.08 && timeOfDay < 0.62 ? 'Day' : 'Night';
  return `${day} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, width: 0, height: 0 };
  const camera = { x: 0, y: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.scale = scale;
    view.width = VIEW.width * scale;
    view.height = VIEW.height * scale;
    view.x = (width - view.width) / 2;
    view.y = (height - view.height) / 2;
  }

  function cameraFor(state) {
    const player = state.player;
    camera.x = Math.max(0, Math.min(WORLD.width - VIEW.width, player.x - VIEW.width / 2));
    camera.y = Math.max(0, Math.min(WORLD.height - VIEW.height, player.y - VIEW.height / 2));
    return camera;
  }

  function drawGround(state) {
    const x0 = Math.max(0, Math.floor(camera.x / TILE));
    const x1 = Math.min(39, Math.floor((camera.x + VIEW.width) / TILE));
    const y0 = Math.max(0, Math.floor(camera.y / TILE));
    const y1 = Math.min(29, Math.floor((camera.y + VIEW.height) / TILE));
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const type = tileAt(tx, ty);
        const px = tx * TILE;
        const py = ty * TILE;
        if (type === 'road') {
          context.fillStyle = PALETTE.asphalt;
          context.fillRect(px, py, TILE, TILE);
          // Centre dashes on two-tile roads: along the road's middle.
          context.fillStyle = PALETTE.asphaltLine;
          if (tx % 2 === 0 && ty % 2 === 0) context.fillRect(px + TILE / 2 - 2, py, 4, TILE);
          else if (ty % 2 === 0) context.fillRect(px, py + TILE / 2 - 2, TILE, 4);
        } else if (type === 'walk') {
          context.fillStyle = PALETTE.sidewalk;
          context.fillRect(px, py, TILE, TILE);
          context.fillStyle = PALETTE.sidewalkEdge;
          context.fillRect(px, py, TILE, 2);
        } else if (type === 'park') {
          context.fillStyle = (tx + ty) % 2 === 0 ? PALETTE.park : PALETTE.parkDark;
          context.fillRect(px, py, TILE, TILE);
          // A tree here and there, fixed by tile so it never moves.
          if ((tx * 7 + ty * 13) % 5 === 0) {
            context.fillStyle = '#2f6b3a';
            context.beginPath();
            context.arc(px + 32, py + 32, 16, 0, Math.PI * 2);
            context.fill();
          }
        } else if (type === 'water') {
          context.fillStyle = (tx + ty) % 2 === 0 ? PALETTE.water : PALETTE.waterDeep;
          context.fillRect(px, py, TILE, TILE);
          context.fillStyle = 'rgba(255,255,255,0.08)';
          context.fillRect(px + ((tx * 31 + ty * 17) % 48), py + 12, 22, 2);
        } else if (type === 'dock') {
          context.fillStyle = PALETTE.dock;
          context.fillRect(px, py, TILE, TILE);
          context.fillStyle = PALETTE.dockEdge;
          context.fillRect(px, py + TILE - 4, TILE, 4);
        } else {
          context.fillStyle = PALETTE.sidewalk;
          context.fillRect(px, py, TILE, TILE);
        }
      }
    }
  }

  function drawBuildings(state) {
    const night = darknessAt(state.timeOfDay);
    for (const building of BUILDINGS) {
      if (building.x + building.width < camera.x || building.x > camera.x + VIEW.width
        || building.y + building.height < camera.y || building.y > camera.y + VIEW.height) continue;
      context.fillStyle = PALETTE.buildingEdge;
      context.fillRect(building.x - 3, building.y - 3, building.width + 6, building.height + 6);
      context.fillStyle = building.color;
      context.fillRect(building.x, building.y, building.width, building.height);
      context.fillStyle = PALETTE.buildingRoof;
      context.fillRect(building.x + 10, building.y + 10, building.width - 20, building.height - 20);
      // Lit windows: a fixed pattern per building, brighter at night.
      const lit = 0.25 + night * 0.6;
      context.fillStyle = `rgba(103, 232, 249, ${lit.toFixed(2)})`;
      const cols = Math.floor(building.width / 44);
      const rows = Math.floor(building.height / 44);
      for (let cx = 0; cx < cols; cx++) {
        for (let cy = 0; cy < rows; cy++) {
          if ((cx * 5 + cy * 3 + building.x) % 4 !== 0) continue;
          context.fillRect(building.x + 18 + cx * 44, building.y + 18 + cy * 44, 16, 12);
        }
      }
      // A neon sign glows on the building's south face.
      if (building.sign) {
        const cx = building.x + building.width / 2;
        const cy = building.y + building.height - 14;
        context.save();
        context.font = `bold 26px ${FONT}`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.shadowColor = building.sign.color;
        context.shadowBlur = 18 + night * 14;
        context.fillStyle = building.sign.color;
        context.fillText(building.sign.text, cx, cy);
        context.restore();
      }
    }
  }

  function drawCarShape(car, isPlayerCar) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    context.fillStyle = 'rgba(0,0,0,0.35)';
    context.fillRect(-CAR.length / 2 + 3, -CAR.width / 2 + 4, CAR.length, CAR.width);
    context.fillStyle = car.color;
    context.beginPath();
    context.roundRect(-CAR.length / 2, -CAR.width / 2, CAR.length, CAR.width, 8);
    context.fill();
    context.fillStyle = 'rgba(20,24,40,0.85)';
    context.beginPath();
    context.roundRect(-8, -CAR.width / 2 + 4, 18, CAR.width - 8, 5);
    context.fill();
    // Headlights: two bright dots at the front, only visible at night.
    context.fillStyle = '#fef9c3';
    context.beginPath();
    context.arc(CAR.length / 2 - 2, -CAR.width / 2 + 6, 3, 0, Math.PI * 2);
    context.arc(CAR.length / 2 - 2, CAR.width / 2 - 6, 3, 0, Math.PI * 2);
    context.fill();
    if (isPlayerCar) {
      context.strokeStyle = '#ffffff';
      context.lineWidth = 2;
      context.beginPath();
      context.roundRect(-CAR.length / 2 - 2, -CAR.width / 2 - 2, CAR.length + 4, CAR.width + 4, 10);
      context.stroke();
    }
    context.restore();
  }

  function drawPoliceLights(car, time) {
    const phase = Math.floor(time * 3) % 2 === 0;
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    context.shadowBlur = 16;
    context.shadowColor = phase ? '#ef4444' : '#3b82f6';
    context.fillStyle = phase ? '#ef4444' : '#3b82f6';
    context.beginPath();
    context.arc(-4, -8, 5, 0, Math.PI * 2);
    context.arc(-4, 8, 5, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawWorld(state) {
    drawGround(state);
    drawBuildings(state);

    // The docks and garage markers: gold diamonds the player can find.
    context.save();
    context.fillStyle = PALETTE.neonGold;
    for (const spot of [PLACES.garageDoor, PLACES.docksDoor, PLACES.chopShopDoor]) {
      const pulse = 6 + Math.sin(state.time * 3) * 2;
      context.beginPath();
      context.moveTo(spot.x, spot.y - pulse - 6);
      context.lineTo(spot.x + 8, spot.y);
      context.lineTo(spot.x, spot.y + pulse + 6);
      context.lineTo(spot.x - 8, spot.y);
      context.closePath();
      context.fill();
    }
    context.restore();

    // Neon tags: pulsing pink stars.
    for (const tag of state.tags) {
      if (tag.got) continue;
      const pulse = 1 + Math.sin(state.time * 4 + tag.x) * 0.2;
      context.save();
      context.translate(tag.x, tag.y);
      context.scale(pulse, pulse);
      context.shadowColor = PALETTE.neonPink;
      context.shadowBlur = 14;
      context.fillStyle = PALETTE.neonPink;
      context.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 12 : 5;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        if (i === 0) context.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else context.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      context.closePath();
      context.fill();
      context.restore();
    }

    // Pickups: a coloured circle with a letter.
    for (const pickup of state.pickups) {
      if (!pickup.active) continue;
      const color = pickup.kind === 'health' ? PALETTE.health : pickup.kind === 'ammo' ? PALETTE.ammo : PALETTE.cash;
      const label = pickup.kind === 'health' ? '+' : pickup.kind === 'ammo' ? 'A' : '$';
      context.save();
      context.fillStyle = color;
      context.beginPath();
      context.arc(pickup.x, pickup.y, 11, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#0b0b14';
      context.font = `bold 13px ${FONT}`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(label, pickup.x, pickup.y + 0.5);
      context.restore();
    }

    // The Comet: gold, with a star on its roof.
    const comet = state.comet;
    if (comet && comet.active && !state.inComet) {
      drawCarShape(comet, false);
      context.save();
      context.fillStyle = '#fff7cc';
      context.font = `bold 15px ${FONT}`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('★', comet.x, comet.y);
      context.restore();
    }

    // Traffic, parked cars the player left behind, roadblocks, police, then the player's car.
    for (const car of state.traffic) if (car.active) drawCarShape(car, false);
    for (const car of state.cars) {
      if (!car.active || car === state.player.inCar) continue;
      drawCarShape(car, false);
    }
    for (const car of state.roadblocks) {
      if (!car.active) continue;
      drawCarShape(car, false);
      // Red-white barrier stripes across the road between the two cars.
      context.save();
      context.translate(car.x, car.y);
      context.rotate(car.angle);
      context.fillStyle = '#ef4444';
      context.fillRect(-30, -52, 60, 10);
      context.fillStyle = '#f8fafc';
      context.fillRect(-30, -42, 60, 10);
      context.restore();
    }
    for (const car of state.police) {
      if (!car.active) continue;
      drawCarShape(car, false);
      drawPoliceLights(car, state.time);
    }
    const player = state.player;
    if (player.inCar) drawCarShape(player.inCar, true);

    // The courier: black suit, gold trim, a briefcase.
    const courier = state.courier;
    if (courier && courier.active && !courier.gone) {
      context.save();
      context.translate(courier.x, courier.y);
      context.rotate(courier.angle);
      context.fillStyle = PALETTE.courier;
      context.beginPath();
      context.arc(0, 0, 13, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = PALETTE.courierGold;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(0, 0, 13, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = PALETTE.courierGold;
      context.fillRect(10, -4, 8, 8);
      context.restore();
      if (courier.mode === 'flee') {
        context.save();
        context.fillStyle = '#f43f5e';
        context.font = `bold 15px ${FONT}`;
        context.textAlign = 'center';
        context.fillText('!', courier.x, courier.y - 22);
        context.restore();
      }
    }

    // Pedestrians: small walking dots, in pairs of colours.
    for (const ped of state.peds) {
      if (!ped.active) continue;
      context.save();
      context.globalAlpha = ped.dead ? Math.max(0, ped.fade) : 1;
      context.fillStyle = ped.dead ? '#7f1d1d' : '#cbd5e1';
      context.beginPath();
      context.arc(ped.x, ped.y, 8, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }

    // Rivals: orange, with a gun barrel toward where they face.
    for (const rival of state.rivals) {
      if (!rival.active) continue;
      context.save();
      context.translate(rival.x, rival.y);
      context.rotate(rival.angle);
      context.fillStyle = PALETTE.rival;
      context.beginPath();
      context.arc(0, 0, RIVAL.radius, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#1c1917';
      context.fillRect(10, -2, 14, 4);
      context.restore();
      // A thin health bar.
      context.fillStyle = 'rgba(0,0,0,0.5)';
      context.fillRect(rival.x - 14, rival.y - 24, 28, 4);
      context.fillStyle = '#f97316';
      context.fillRect(rival.x - 14, rival.y - 24, 28 * (rival.health / 50), 4);
    }

    // Bullets: short bright streaks.
    for (const bullet of state.bullets) {
      if (!bullet.active) continue;
      context.save();
      context.strokeStyle = bullet.from === 'player' ? '#fef08a' : '#fca5a5';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(bullet.x - bullet.vx * 0.02, bullet.y - bullet.vy * 0.02);
      context.lineTo(bullet.x, bullet.y);
      context.stroke();
      context.restore();
    }

    // The player on foot: a gold dot with a facing tick and a faint aim line.
    if (player.onFoot) {
      context.save();
      context.translate(player.x, player.y);
      context.rotate(player.angle);
      context.fillStyle = PALETTE.player;
      context.beginPath();
      context.arc(0, 0, PLAYER.radius, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#0b0b14';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(PLAYER.radius + 8, 0);
      context.stroke();
      context.restore();
    }
  }

  function drawNight(state) {
    const dark = darknessAt(state.timeOfDay);
    if (dark > 0) {
      context.fillStyle = `rgba(6, 8, 24, ${dark.toFixed(2)})`;
      context.fillRect(camera.x, camera.y, VIEW.width, VIEW.height);
    }
    // An orange wash at dawn and dusk.
    const dusk = (state.timeOfDay > 0.55 && state.timeOfDay < 0.68) || (state.timeOfDay > 0.02 && state.timeOfDay < 0.1);
    if (dusk) {
      context.fillStyle = 'rgba(255, 120, 40, 0.10)';
      context.fillRect(camera.x, camera.y, VIEW.width, VIEW.height);
    }
  }

  function drawMinimap(state) {
    const mapW = 216;
    const mapH = 162;
    const mx = VIEW.width - mapW - 14;
    const my = 14;
    const sx = mapW / WORLD.width;
    const sy = mapH / WORLD.height;
    context.save();
    context.fillStyle = PALETTE.hudPanel;
    context.fillRect(mx - 6, my - 6, mapW + 12, mapH + 12);
    context.strokeStyle = 'rgba(255,255,255,0.25)';
    context.lineWidth = 1;
    context.strokeRect(mx - 6, my - 6, mapW + 12, mapH + 12);
    // Roads as faint lines.
    context.strokeStyle = 'rgba(148, 163, 184, 0.5)';
    for (let x = 0; x < 40; x++) {
      if (x % 8 === 0) {
        context.beginPath();
        context.moveTo(mx + x * TILE * sx, my);
        context.lineTo(mx + x * TILE * sx, my + mapH);
        context.stroke();
      }
    }
    for (let y = 0; y < 30; y++) {
      if (y % 8 === 0) {
        context.beginPath();
        context.moveTo(mx, my + y * TILE * sy);
        context.lineTo(mx + mapW, my + y * TILE * sy);
        context.stroke();
      }
    }
    // The water along the bottom.
    context.fillStyle = PALETTE.water;
    context.fillRect(mx, my + 28 * TILE * sy, mapW, 2 * TILE * sy);
    const dot = (x, y, color, r) => {
      context.fillStyle = color;
      context.beginPath();
      context.arc(mx + x * sx, my + y * sy, r, 0, Math.PI * 2);
      context.fill();
    };
    for (const tag of state.tags) if (!tag.got) dot(tag.x, tag.y, PALETTE.neonPink, 2.5);
    for (const car of state.police) if (car.active) dot(car.x, car.y, '#ef4444', 3);
    for (const car of state.roadblocks) if (car.active) dot(car.x, car.y, '#ef4444', 3);
    const courier = state.courier;
    if (courier && courier.active && !courier.gone) {
      context.fillStyle = '#ffffff';
      context.save();
      context.translate(mx + courier.x * sx, my + courier.y * sy);
      context.rotate(Math.PI / 4);
      context.fillRect(-3, -3, 6, 6);
      context.restore();
    }
    // The mission target: a gold diamond.
    const mission = missionAt(state.mission);
    if (mission) {
      const step = mission.steps[state.missionStep];
      const target = step && step.target ? step.target : (courier && courier.active ? { x: courier.x, y: courier.y } : null);
      if (target) {
        context.fillStyle = PALETTE.neonGold;
        context.save();
        context.translate(mx + target.x * sx, my + target.y * sy);
        context.rotate(Math.PI / 4);
        context.fillRect(-4, -4, 8, 8);
        context.restore();
      }
    }
    dot(state.player.x, state.player.y, '#ffffff', 3.5);
    // Camera frame.
    context.strokeStyle = 'rgba(255,255,255,0.6)';
    context.strokeRect(mx + camera.x * sx, my + camera.y * sy, VIEW.width * sx, VIEW.height * sy);
    context.restore();
  }

  function drawHud(state, screen) {
    const player = state.player;
    context.save();
    // Top-left panel: cash, wanted, health, ammo, job.
    context.fillStyle = PALETTE.hudPanel;
    context.fillRect(14, 14, 300, 132);
    context.strokeStyle = 'rgba(255,255,255,0.2)';
    context.strokeRect(14, 14, 300, 132);
    context.fillStyle = PALETTE.text;
    context.font = `bold 24px ${FONT}`;
    context.textAlign = 'left';
    context.textBaseline = 'top';
    context.fillText(`$${state.cash}`, 28, 24);
    // Wanted stars: filled stars are red, empty ones are a dim outline.
    context.font = `22px ${FONT}`;
    let starX = 28;
    for (let i = 0; i < 5; i++) {
      context.fillStyle = i < state.wanted ? PALETTE.wanted : PALETTE.muted;
      context.fillText(i < state.wanted ? '★' : '☆', starX, 56);
      starX += context.measureText('★').width;
    }
    // Health bar.
    context.fillStyle = 'rgba(255,255,255,0.2)';
    context.fillRect(28, 90, 150, 10);
    context.fillStyle = player.health > 35 ? PALETTE.health : PALETTE.wanted;
    context.fillRect(28, 90, 150 * (player.health / 100), 10);
    context.fillStyle = PALETTE.text;
    context.font = `15px ${FONT}`;
    context.fillText(`HP ${Math.ceil(player.health)}`, 186, 88);
    context.fillText(`Ammo ${player.ammo}`, 28, 106);
    context.fillStyle = PALETTE.muted;
    context.fillText(timeLabel(state.timeOfDay), 200, 106);
    // The job line under the panel.
    const mission = missionAt(state.mission);
    if (mission) {
      context.fillStyle = PALETTE.hudPanel;
      context.fillRect(14, 154, 340, 52);
      context.fillStyle = PALETTE.neonGold;
      context.font = `bold 15px ${FONT}`;
      context.fillText(`${missionLabel(state.mission)} — ${mission.name}`, 28, 164);
      context.fillStyle = PALETTE.text;
      context.font = `15px ${FONT}`;
      const flags = { rivalsLeft: state.rivalsLeft };
      const objective = objectiveText(state.mission, state.missionStep, flags);
      context.fillText(objective.length > 46 ? objective.slice(0, 46) + '…' : objective, 28, 184);
    }
    // Nitro bar while driving, tag counter on foot — bottom centre.
    if (!player.onFoot && player.inCar) {
      const barW = 260;
      const bx = (VIEW.width - barW) / 2;
      const by = VIEW.height - 44;
      context.fillStyle = PALETTE.hudPanel;
      context.fillRect(bx - 10, by - 8, barW + 20, 34);
      context.fillStyle = 'rgba(255,255,255,0.2)';
      context.fillRect(bx, by, barW, 10);
      context.fillStyle = player.inCar.nitro > 25 ? PALETTE.neonCyan : PALETTE.wanted;
      context.fillRect(bx, by, barW * (player.inCar.nitro / 100), 10);
      context.fillStyle = PALETTE.text;
      context.font = `bold 13px ${FONT}`;
      context.textAlign = 'center';
      context.fillText(`NITRO ${Math.round(player.inCar.nitro)}  •  ${Math.round(Math.abs(player.inCar.speed) * 0.9)} km/h`, VIEW.width / 2, by + 14);
      context.textAlign = 'left';
    } else {
      context.fillStyle = PALETTE.hudPanel;
      const label = `Tags ${state.tagsGot}/${TAG_SPOTS.length}  •  Shift to sneak  •  E to drive`;
      context.font = `bold 14px ${FONT}`;
      const w = context.measureText(label).width + 24;
      context.fillRect((VIEW.width - w) / 2, VIEW.height - 42, w, 30);
      context.fillStyle = PALETTE.neonPink;
      context.textAlign = 'center';
      context.fillText(label, VIEW.width / 2, VIEW.height - 34);
      context.textAlign = 'left';
    }
    // The bust meter: a flashing warning while an officer is holding the player.
    if (state.bustTimer > 0) {
      const flash = Math.floor(state.time * 6) % 2 === 0;
      context.fillStyle = flash ? 'rgba(239, 68, 68, 0.9)' : 'rgba(127, 29, 29, 0.9)';
      const bw = 300;
      const bx = (VIEW.width - bw) / 2;
      const by = 120;
      context.fillRect(bx, by, bw, 30);
      context.fillStyle = '#ffffff';
      context.font = `bold 15px ${FONT}`;
      context.textAlign = 'center';
      context.fillText('ARREST — BREAK AWAY!', VIEW.width / 2, by + 8);
      context.fillStyle = 'rgba(255,255,255,0.35)';
      context.fillRect(bx + 8, by + 24, bw - 16, 4);
      context.fillStyle = '#ffffff';
      context.fillRect(bx + 8, by + 24, (bw - 16) * Math.min(1, state.bustTimer / 1.2), 4);
      context.textAlign = 'left';
    }
    // Toast: one line under the top centre.
    if (state.toast) {
      context.font = `bold 18px ${FONT}`;
      const w = context.measureText(state.toast).width + 28;
      context.fillStyle = PALETTE.hudPanel;
      context.fillRect((VIEW.width - w) / 2, 70, w, 34);
      context.fillStyle = PALETTE.text;
      context.textAlign = 'center';
      context.fillText(state.toast, VIEW.width / 2, 78);
      context.textAlign = 'left';
    }
    context.restore();
    drawMinimap(state);
  }

  function panel(title, lines, prompt, accent) {
    const width = 640;
    const height = 120 + lines.length * 30 + 56;
    const x = (VIEW.width - width) / 2;
    const y = (VIEW.height - height) / 2;
    context.save();
    context.fillStyle = 'rgba(8, 8, 18, 0.88)';
    context.fillRect(x, y, width, height);
    context.strokeStyle = accent;
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
    context.textAlign = 'center';
    context.fillStyle = accent;
    context.font = `bold 40px ${FONT}`;
    context.fillText(title, VIEW.width / 2, y + 52);
    context.fillStyle = PALETTE.text;
    context.font = `19px ${FONT}`;
    lines.forEach((line, i) => context.fillText(line, VIEW.width / 2, y + 100 + i * 30));
    context.fillStyle = PALETTE.muted;
    context.font = `16px ${FONT}`;
    context.fillText(prompt, VIEW.width / 2, y + height - 22);
    context.restore();
  }

  function draw(state, screen, extras) {
    resize();
    cameraFor(state);
    const scale = view.scale;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#0b0b14';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(scale, 0, 0, scale, view.x - camera.x * scale, view.y - camera.y * scale);
    drawWorld(state);
    drawNight(state);
    // The HUD and panels draw in screen space, not world space.
    context.setTransform(scale, 0, 0, scale, view.x, view.y);
    if (screen === SCREEN_TITLE) {
      // The city keeps moving behind the title: dim it, then the panel.
      context.fillStyle = 'rgba(8, 8, 18, 0.55)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      const lines = [
        'Rook drives for Delia Vane in a city that never sleeps.',
        'Four jobs. One ledger. Steal cars, dodge the law,',
        'collect all 8 neon tags — and finish the story.',
        '',
        'WASD drive / walk   •   Shift nitro / sneak   •   E enter a car',
        'Mouse aim, click or F to shoot   •   P pause   •   M mute',
      ];
      panel('NEON BAY', lines, extras && extras.saveExists ? 'Press Enter to continue — a save is waiting' : 'Press Enter or click to start', PALETTE.neonPink);
    } else if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) {
      drawHud(state, screen);
      if (screen === SCREEN_PAUSED) {
        panel('PAUSED', ['The city waits. Nothing moves while you are away.'], 'Press P or Enter to keep playing', PALETTE.neonCyan);
      }
    } else if (screen === SCREEN_OVER) {
      drawHud(state, screen);
      const reason = state.busted ? 'Busted — the law caught up with Rook.' : 'Wasted — Rook went down in Neon Bay.';
      panel(state.busted ? 'BUSTED' : 'WASTED', [reason, `Cash $${state.cash}  •  Job ${Math.min(state.mission + 1, 4)} of 4  •  Tags ${state.tagsGot}/8`], 'Press R to try again', PALETTE.wanted);
    } else if (screen === SCREEN_WIN) {
      drawHud(state, screen);
      panel('STORY COMPLETE', [
        'Four jobs done. The ledger is at the docks,',
        `and Rook owns Neon Bay.  Cash $${state.cash}  •  Tags ${state.tagsGot}/8`,
        'Missions 4 of 4 — thanks for playing.',
      ], 'Press R to play again', PALETTE.neonGold);
    }
  }

  /** Convert screen pixels (client coordinates) to world coordinates. */
  function screenToWorld(sx, sy) {
    const ratio = window.devicePixelRatio || 1;
    return {
      x: camera.x + (sx * ratio - view.x) / view.scale,
      y: camera.y + (sy * ratio - view.y) / view.scale,
    };
  }

  return { draw, resize, cameraFor, screenToWorld };
}

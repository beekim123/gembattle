// 生态场景环境：全屏 2D 地面 + 左右两翼摆件 + 微粒氛围。绝不画圆台。
// 画布坐标是 960×540 布局单位（调用方已缩放好）。第 3 步把摆件换成工坊的 3D 像素模型。
import { BIOMES } from '../content/biomes.js';

const W = 960, H = 540;

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function bake(biome, seed) {
  const cv = document.createElement('canvas');
  cv.width = W * 2; cv.height = H * 2;
  const c = cv.getContext('2d'); c.scale(2, 2);
  const r = rng(seed);
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, biome.groundTop); g.addColorStop(1, biome.groundBottom);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // 草坪的深浅斑块
  for (let i = 0; i < 150; i++) {
    c.globalAlpha = 0.14 + r() * 0.18; c.fillStyle = biome.patch;
    c.beginPath(); c.ellipse(r() * W, r() * H, 14 + r() * 50, 6 + r() * 20, 0, 0, Math.PI * 2); c.fill();
  }
  c.globalAlpha = 1;
  // 细草
  c.lineWidth = 1.4;
  for (let i = 0; i < 520; i++) {
    const x = r() * W, y = r() * H, hgt = 3 + r() * 6;
    c.strokeStyle = r() < 0.5 ? 'rgba(20,50,24,0.5)' : 'rgba(150,210,110,0.35)';
    c.beginPath(); c.moveTo(x, y); c.lineTo(x - 1.5, y - hgt); c.moveTo(x, y); c.lineTo(x + 1.5, y - hgt * 0.8); c.stroke();
  }
  if (biome.id === 'forest') {
    // 落叶与散落的红果
    for (let i = 0; i < 110; i++) {
      c.fillStyle = biome.leaf[(r() * 3) | 0]; c.globalAlpha = 0.55;
      c.save(); c.translate(r() * W, r() * H); c.rotate(r() * 6.28);
      c.beginPath(); c.ellipse(0, 0, 4 + r() * 3, 2 + r() * 1.5, 0, 0, Math.PI * 2); c.fill(); c.restore();
    }
    c.globalAlpha = 1;
    for (let i = 0; i < 16; i++) {
      const x = r() * W, y = 60 + r() * (H - 60);
      c.beginPath(); c.arc(x, y, 3 + r() * 1.5, 0, Math.PI * 2); c.fillStyle = biome.fruit; c.fill();
      c.beginPath(); c.arc(x - 1, y - 1.2, 1, 0, Math.PI * 2); c.fillStyle = 'rgba(255,255,255,0.55)'; c.fill();
    }
    forestWings(c, r);
  } else {
    // 花甸：散落的小花
    for (let i = 0; i < 150; i++) {
      const x = r() * W, y = 30 + r() * (H - 30), col = biome.leaf[(r() * 3) | 0];
      c.fillStyle = col;
      for (let k = 0; k < 5; k++) { const a = k * 1.2566; c.beginPath(); c.arc(x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.6, 1.7, 0, 6.3); c.fill(); }
      c.beginPath(); c.arc(x, y, 1.4, 0, 6.3); c.fillStyle = '#e8a030'; c.fill();
    }
    meadowWings(c, r);
  }
  // 整层压暗 15%，让战区的角色和数字跳出来
  c.fillStyle = 'rgba(0,0,0,0.15)'; c.fillRect(0, 0, W, H);
  // 四角暗边
  const v = c.createRadialGradient(W / 2, H * 0.52, H * 0.35, W / 2, H * 0.52, W * 0.66);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, biome.vignette);
  c.fillStyle = v; c.fillRect(0, 0, W, H);
  return cv;
}

function tree(c, x, trunkW, top, bottom, canopyR, r) {
  c.fillStyle = '#4a3320'; c.fillRect(x - trunkW / 2, top, trunkW, bottom - top);
  c.fillStyle = '#5c4129'; c.fillRect(x - trunkW / 2, top, trunkW * 0.35, bottom - top);
  c.fillStyle = '#4a3320';
  c.beginPath(); c.moveTo(x - trunkW / 2, bottom); c.quadraticCurveTo(x - trunkW, bottom, x - trunkW * 1.3, bottom + 6); c.lineTo(x + trunkW * 1.3, bottom + 6); c.quadraticCurveTo(x + trunkW, bottom, x + trunkW / 2, bottom); c.fill();
  const shades = ['#1d4426', '#265a30', '#2e6a38', '#1a3a22'];
  for (let i = 0; i < 16; i++) {
    c.fillStyle = shades[(r() * 4) | 0];
    c.beginPath(); c.arc(x + (r() - 0.5) * canopyR * 1.8, top + (r() - 0.6) * canopyR * 1.1, canopyR * (0.35 + r() * 0.3), 0, 6.3); c.fill();
  }
  for (let i = 0; i < 7; i++) { // 树冠里挂的红果
    c.beginPath(); c.arc(x + (r() - 0.5) * canopyR * 1.6, top + (r() - 0.4) * canopyR * 0.9, 3, 0, 6.3); c.fillStyle = '#c8402e'; c.fill();
  }
}
function forestWings(c, r) {
  tree(c, 56, 30, 110, 250, 80, r);
  tree(c, 916, 28, 96, 236, 76, r);
  // 右侧：一根卧着的苔藓倒木，上面堆着赤果
  c.fillStyle = '#5a3f26'; c.beginPath(); c.roundRect(836, 296, 140, 34, 14); c.fill();
  c.fillStyle = '#3d6a38'; c.beginPath(); c.roundRect(846, 292, 90, 12, 6); c.fill();
  c.fillStyle = '#3a2816'; c.beginPath(); c.ellipse(838, 313, 6, 16, 0, 0, 6.3); c.fill();
  for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(868 + i * 12, 290 - (i % 2) * 4, 4, 0, 6.3); c.fillStyle = '#c8402e'; c.fill(); }
}
function meadowWings(c, r) {
  const cluster = (x, y, n) => {
    for (let i = 0; i < n; i++) {
      const fx = x + (r() - 0.5) * 70, fy = y + (r() - 0.5) * 26;
      c.strokeStyle = '#2f6a30'; c.lineWidth = 2; c.beginPath(); c.moveTo(fx, fy + 22); c.lineTo(fx, fy); c.stroke();
      c.fillStyle = ['#f6a8c4', '#fbf0d0', '#f6d878'][(r() * 3) | 0];
      for (let k = 0; k < 5; k++) { const a = k * 1.2566; c.beginPath(); c.arc(fx + Math.cos(a) * 5, fy + Math.sin(a) * 5, 3.6, 0, 6.3); c.fill(); }
      c.beginPath(); c.arc(fx, fy, 3, 0, 6.3); c.fillStyle = '#e8a030'; c.fill();
    }
  };
  cluster(60, 190, 9); cluster(76, 300, 8); cluster(900, 210, 9); cluster(884, 310, 8);
  // 左上：巨大的含露花苞
  c.fillStyle = '#3f8a3c'; c.beginPath(); c.ellipse(70, 96, 36, 54, 0, 0, 6.3); c.fill();
  c.fillStyle = '#f0a0bc'; c.beginPath(); c.moveTo(34, 80); c.quadraticCurveTo(70, 8, 106, 80); c.quadraticCurveTo(70, 46, 34, 80); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.ellipse(58, 70, 5, 8, 0.4, 0, 6.3); c.fill();
}

export function createEnv(biomeId, seed = 1) {
  const biome = BIOMES[biomeId] || BIOMES.forest;
  const base = bake(biome, seed * 131 + biomeId.length);
  const r = rng(seed + 99);
  const parts = [];
  const count = biomeId === 'forest' ? 20 : 46;
  for (let i = 0; i < count; i++) parts.push(spawn(biomeId, r, true));
  let fruit = null, fruitTimer = 3, time = 0;
  return {
    update(dt) {
      time += dt;
      for (const p of parts) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.ph += dt * p.spin;
        if (p.x > W + 20 || p.y > H + 20) Object.assign(p, spawn(biomeId, r, false));
      }
      if (biomeId === 'forest') {
        fruitTimer -= dt;
        if (!fruit && fruitTimer <= 0) { fruit = { x: r() < 0.5 ? 40 + r() * 70 : 850 + r() * 70, y: 150, vy: 0, bounces: 0 }; fruitTimer = 6 + r() * 4; }
        if (fruit) {
          fruit.vy += 420 * dt; fruit.y += fruit.vy * dt;
          if (fruit.y > 262) { fruit.y = 262; fruit.vy *= -0.45; fruit.bounces++; if (fruit.bounces > 2) fruit = null; }
        }
      }
    },
    draw(ctx) {
      ctx.drawImage(base, 0, 0, W, H);
      // 林隙里的暖斑，慢慢明暗
      for (let k = 0; k < 3; k++) {
        const a = 0.5 + 0.5 * Math.sin(time * 0.5 + k * 2);
        const gx = 220 + k * 250, gy = 150 + (k % 2) * 90;
        const gr = ctx.createRadialGradient(gx, gy, 5, gx, gy, 110);
        gr.addColorStop(0, biome.sunPatch.replace(/[\d.]+\)$/, (0.05 + 0.1 * a).toFixed(3) + ')')); gr.addColorStop(1, 'rgba(255,240,180,0)');
        ctx.fillStyle = gr; ctx.fillRect(gx - 110, gy - 110, 220, 220);
      }
      for (const p of parts) {
        ctx.save(); ctx.translate(p.x, p.y);
        if (biomeId === 'forest') {
          ctx.rotate(p.ph); ctx.fillStyle = p.color; ctx.globalAlpha = 0.8;
          ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, 6.3); ctx.fill();
        } else {
          ctx.globalAlpha = 0.45 + 0.35 * Math.sin(p.ph); ctx.fillStyle = '#ffe9a0';
          ctx.beginPath(); ctx.arc(0, 0, p.size * 0.55, 0, 6.3); ctx.fill();
        }
        ctx.restore();
      }
      if (fruit) { ctx.beginPath(); ctx.arc(fruit.x, fruit.y, 4, 0, 6.3); ctx.fillStyle = '#c8402e'; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke(); }
    },
  };
}

function spawn(biomeId, r, anywhere) {
  const forest = biomeId === 'forest';
  return {
    x: anywhere ? r() * W : -10 + r() * 60, y: anywhere ? r() * H : -10 + r() * 200,
    vx: forest ? 12 + r() * 14 : 8 + r() * 10, vy: forest ? 10 + r() * 12 : -2 + r() * 6,
    ph: r() * 6.3, spin: forest ? 1 + r() * 2 : 2 + r() * 2,
    size: forest ? 3 + r() * 2.5 : 1.8 + r() * 1.8,
    color: ['#7ab356', '#5c9a48', '#d8a040'][(r() * 3) | 0],
  };
}

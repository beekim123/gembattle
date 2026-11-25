// 生态场景环境：全屏 2D 地面（env-ground.js 烘焙）+ 动态微粒与氛围。绝不画圆台。
// 画布坐标是 960×540 布局单位（调用方已缩放好）。
// 第 3 步：地面和微粒照旧是全屏 2D；再按 biomes.js 里的 props，远到近摆 2~3 件工坊的 3D 像素堆叠摆件
// （接了像素美术时，原来手画的花簇和火堆就不再画，免得叠成两份；?art=blocks 时照旧手画）。
//   落果浅林：斜飘碎叶 + 红果滚落 + 林隙暖斑      泽畔浅洼：冒泡与涟漪 + 低空薄雾
//   花甸林隙：暖金花粉 + 花簇轻摇                苔石古径：温水汽升腾 + 青苔孢
//   巨木树冠：劲风碎叶掠过 + 树梢亮斑呼吸（进第 3 条血风更急）
//   营火 / 行商 / 界门：火屑与暖晕 / 尘埃 / 青苔细屑
import { BIOMES } from '../content/biomes.js';
import { bakeGround, rng, W, H } from './env-ground.js';
import { getStage } from './workshop-adapter.js';

const TAU = Math.PI * 2;

function sunPatches(ctx, biome, time) {
  for (let k = 0; k < 3; k++) {
    const a = 0.5 + 0.5 * Math.sin(time * 0.5 + k * 2);
    const gx = 220 + k * 250, gy = 150 + (k % 2) * 90;
    const gr = ctx.createRadialGradient(gx, gy, 5, gx, gy, 110);
    gr.addColorStop(0, biome.sunPatch.replace(/[\d.]+\)$/, (0.05 + 0.1 * a).toFixed(3) + ')')); gr.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = gr; ctx.fillRect(gx - 110, gy - 110, 220, 220);
  }
}

// 一群会漂的小东西：spawn 出生、step 每帧走一步、draw 画一个
function swarm(n, r, spawn, step, draw) {
  const parts = Array.from({ length: n }, () => spawn(r, true));
  return {
    update(dt, time) { for (const p of parts) { step(p, dt, time); if (p.dead) Object.assign(p, spawn(r, false), { dead: false }); } },
    draw(ctx, time) { for (const p of parts) { ctx.save(); ctx.translate(p.x, p.y); draw(ctx, p, time); ctx.restore(); } },
  };
}
const drift = (p, dt) => { p.x += p.vx * dt; p.y += p.vy * dt; p.ph += dt * p.spin; if (p.x > W + 20 || p.x < -30 || p.y > H + 20 || p.y < -30) p.dead = true; };

const SYSTEMS = {
  forest(r, biome) {
    const leaves = swarm(20, r,
      (r, any) => ({ x: any ? r() * W : -10 + r() * 60, y: any ? r() * H : -10 + r() * 200, vx: 12 + r() * 14, vy: 10 + r() * 12, ph: r() * TAU, spin: 1 + r() * 2, size: 3 + r() * 2.5, color: ['#7ab356', '#5c9a48', '#d8a040'][(r() * 3) | 0] }),
      drift,
      (ctx, p) => { ctx.rotate(p.ph); ctx.fillStyle = p.color; ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, TAU); ctx.fill(); });
    let fruit = null, timer = 3;
    return {
      update(dt, time) {
        leaves.update(dt, time);
        timer -= dt;
        if (!fruit && timer <= 0) { fruit = { x: r() < 0.5 ? 40 + r() * 70 : 850 + r() * 70, y: 150, vy: 0, bounces: 0 }; timer = 6 + r() * 4; }
        if (fruit) { fruit.vy += 420 * dt; fruit.y += fruit.vy * dt; if (fruit.y > 262) { fruit.y = 262; fruit.vy *= -0.45; fruit.bounces++; if (fruit.bounces > 2) fruit = null; } }
      },
      draw(ctx, time) {
        sunPatches(ctx, biome, time); leaves.draw(ctx, time);
        if (fruit) { ctx.beginPath(); ctx.arc(fruit.x, fruit.y, 4, 0, TAU); ctx.fillStyle = '#c8402e'; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke(); }
      },
    };
  },
  meadow(r, biome, env) {
    const pollen = swarm(46, r,
      (r, any) => ({ x: any ? r() * W : -10 + r() * 60, y: any ? r() * H : -10 + r() * 200, vx: 8 + r() * 10, vy: -2 + r() * 6, ph: r() * TAU, spin: 2 + r() * 2, size: 1.8 + r() * 1.8 }),
      drift,
      (ctx, p) => { ctx.globalAlpha = 0.45 + 0.35 * Math.sin(p.ph); ctx.fillStyle = '#ffe9a0'; ctx.beginPath(); ctx.arc(0, 0, p.size * 0.55, 0, TAU); ctx.fill(); });
    const sway = [[60, 190], [76, 300], [900, 210], [884, 310]];
    return {
      update(dt, time) { pollen.update(dt, time); },
      draw(ctx, time) {
        sunPatches(ctx, biome, time); pollen.draw(ctx, time);
        if (!env.art3d) sway.forEach(([x, y], i) => {           // 花簇节奏轻摇：叠几朵会晃的花头（接了像素摆件就交给摆件）
          for (let k = 0; k < 3; k++) {
            const fx = x + (k - 1) * 18 + Math.sin(time * 1.6 + i + k) * 3, fy = y - 12 + k * 3;
            ctx.fillStyle = ['#f6a8c4', '#fbf0d0', '#f6d878'][(i + k) % 3];
            for (let q = 0; q < 5; q++) { const a = q * 1.2566; ctx.beginPath(); ctx.arc(fx + Math.cos(a) * 4, fy + Math.sin(a) * 4, 3, 0, TAU); ctx.fill(); }
            ctx.beginPath(); ctx.arc(fx, fy, 2.4, 0, TAU); ctx.fillStyle = '#e8a030'; ctx.fill();
          }
        });
      },
    };
  },
  swamp(r, biome) {
    const spots = [[120, 150, 80], [150, 330, 60], [840, 170, 86], [810, 350, 62], [480, 78, 100]];
    let bubbles = [], ripples = [], timer = 0.4;
    const mist = Array.from({ length: 5 }, (_, i) => ({ x: r() * W, y: 300 + i * 40 + r() * 30, w: 220 + r() * 200, vx: 6 + r() * 6, a: 0.05 + r() * 0.05 }));
    return {
      update(dt) {
        timer -= dt;
        if (timer <= 0) {                                     // 水洼里随机冒一个泡
          const [x, y, rx] = spots[(r() * spots.length) | 0];
          bubbles.push({ x: x + (r() - 0.5) * rx, y, t: 0, life: 0.9 + r() * 0.6 });
          timer = 0.3 + r() * 0.5;
        }
        for (const b of bubbles) { b.t += dt; b.y -= dt * 10; }
        for (const b of bubbles.filter(b => b.t >= b.life)) ripples.push({ x: b.x, y: b.y + 8, t: 0 });
        bubbles = bubbles.filter(b => b.t < b.life);
        for (const p of ripples) p.t += dt;
        ripples = ripples.filter(p => p.t < 1.4);
        for (const m of mist) { m.x += m.vx * dt; if (m.x - m.w > W) m.x = -m.w; }
      },
      draw(ctx, time) {
        sunPatches(ctx, biome, time);
        for (const p of ripples) { const k = p.t / 1.4; ctx.strokeStyle = `rgba(190,240,200,${0.55 * (1 - k)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(p.x, p.y, 4 + k * 22, 2 + k * 8, 0, 0, TAU); ctx.stroke(); }
        for (const b of bubbles) { const k = b.t / b.life; ctx.globalAlpha = 1 - k * 0.5; ctx.fillStyle = 'rgba(220,255,230,0.8)'; ctx.beginPath(); ctx.arc(b.x, b.y, 1.5 + k * 2.2, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
        for (const m of mist) { const g = ctx.createRadialGradient(m.x, m.y, 4, m.x, m.y, m.w / 2); g.addColorStop(0, `rgba(210,240,225,${m.a})`); g.addColorStop(1, 'rgba(210,240,225,0)'); ctx.save(); ctx.translate(0, m.y); ctx.scale(1, 0.18); ctx.translate(0, -m.y); ctx.fillStyle = g; ctx.fillRect(m.x - m.w / 2, m.y - m.w / 2, m.w, m.w); ctx.restore(); }
      },
    };
  },
  ruins(r, biome) {
    const pools = [[150, 330], [820, 150], [730, 400]];
    const steam = swarm(24, r,
      (r, any) => { const [x, y] = pools[(r() * pools.length) | 0]; return { x: x + (r() - 0.5) * 40, y: any ? y - r() * 70 : y, vx: (r() - 0.5) * 4, vy: -(6 + r() * 6), ph: r() * TAU, spin: 1, size: 5 + r() * 5, born: 0, life: 4 + r() * 3 }; },
      (p, dt) => { p.x += p.vx * dt + Math.sin(p.ph) * 0.15; p.y += p.vy * dt; p.ph += dt; p.born += dt; if (p.born > p.life) p.dead = true; },
      (ctx, p) => { const k = p.born / p.life; ctx.globalAlpha = 0.22 * Math.sin(Math.PI * Math.min(1, k)); ctx.fillStyle = '#e6f3e6'; ctx.beginPath(); ctx.arc(0, 0, p.size * (0.6 + k), 0, TAU); ctx.fill(); });
    const spores = swarm(14, r,
      (r, any) => ({ x: any ? r() * W : r() * W, y: any ? r() * H : H + 6, vx: (r() - 0.5) * 6, vy: -(3 + r() * 5), ph: r() * TAU, spin: 1.5, size: 1.6 + r() * 1.2 }),
      drift,
      (ctx, p) => { ctx.globalAlpha = 0.5 + 0.3 * Math.sin(p.ph); ctx.fillStyle = '#9ed89a'; ctx.beginPath(); ctx.arc(Math.sin(p.ph) * 2, 0, p.size, 0, TAU); ctx.fill(); });
    return { update(dt, time) { steam.update(dt, time); spores.update(dt, time); }, draw(ctx, time) { sunPatches(ctx, biome, time); steam.draw(ctx, time); spores.draw(ctx, time); } };
  },
  canopy(r, biome, env) {
    const streaks = swarm(26, r,
      (r, any) => ({ x: any ? r() * W : -30, y: any ? r() * H : r() * H, vx: 70 + r() * 80, vy: 18 + r() * 24, ph: r() * TAU, spin: 3 + r() * 3, size: 3 + r() * 3 }),
      (p, dt) => { const k = env.wind; p.x += p.vx * dt * k; p.y += p.vy * dt * k; p.ph += dt * p.spin; if (p.x > W + 40 || p.y > H + 20) p.dead = true; },
      (ctx, p) => { ctx.rotate(Math.atan2(p.vy, p.vx)); ctx.strokeStyle = 'rgba(190,230,150,0.22)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-22 * env.wind, 0); ctx.lineTo(0, 0); ctx.stroke(); ctx.fillStyle = '#9ac860'; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.45, Math.sin(p.ph) * 0.6, 0, TAU); ctx.fill(); });
    const spots = Array.from({ length: 9 }, () => ({ x: 60 + r() * 840, y: 90 + r() * 400, rx: 24 + r() * 40, ph: r() * TAU }));
    return {
      update(dt, time) { streaks.update(dt, time); },
      draw(ctx, time) {
        for (const s of spots) {                              // 树梢斑驳亮斑呼吸明暗
          const a = 0.05 + 0.07 * (0.5 + 0.5 * Math.sin(time * 0.7 * env.wind + s.ph));
          ctx.fillStyle = `rgba(255,236,170,${a})`; ctx.beginPath(); ctx.ellipse(s.x, s.y, s.rx, s.rx * 0.45, -0.3, 0, TAU); ctx.fill();
        }
        streaks.draw(ctx, time);
      },
    };
  },
};
// 营火 / 行商 / 界门三个变体
SYSTEMS.camp = (r, biome, env) => {
  const fx = env.opts.fireX ?? 480, fy = env.opts.fireY ?? 262;
  const embers = swarm(34, r,
    (r, any) => ({ x: fx + (r() - 0.5) * 24, y: any ? fy - r() * 150 : fy - 6, vx: (r() - 0.5) * 10, vy: -(24 + r() * 30), ph: r() * TAU, spin: 3 + r() * 3, size: 1.2 + r() * 1.6, born: any ? r() * 2 : 0, life: 2 + r() * 2 }),
    (p, dt) => { p.x += p.vx * dt + Math.sin(p.ph) * 0.3; p.y += p.vy * dt; p.ph += dt * p.spin; p.born += dt; if (p.born > p.life) p.dead = true; },
    (ctx, p) => { const k = p.born / p.life; ctx.globalAlpha = 1 - k; ctx.fillStyle = k < 0.4 ? '#ffd870' : '#ff8a3a'; ctx.beginPath(); ctx.arc(0, 0, p.size * (1 - k * 0.4), 0, TAU); ctx.fill(); });
  return {
    update(dt, time) { embers.update(dt, time); },
    draw(ctx, time) {
      const pulse = 0.85 + 0.15 * Math.sin(time * 7) + 0.05 * Math.sin(time * 13);
      const g = ctx.createRadialGradient(fx, fy - 10, 6, fx, fy - 10, 220 * pulse);   // 地面呼吸暖晕
      g.addColorStop(0, 'rgba(255,170,70,0.38)'); g.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = g; ctx.fillRect(fx - 240, fy - 250, 480, 480);
      if (env.art3d) { embers.draw(ctx, time); return; }      // 火堆本体是 3D 摆件，这里只留暖晕和火屑
      ctx.fillStyle = '#4a321f'; ctx.save(); ctx.translate(fx, fy); ctx.rotate(0.35); ctx.fillRect(-26, -3, 52, 7); ctx.rotate(-0.7); ctx.fillRect(-26, -3, 52, 7); ctx.restore();
      const flame = (h, w, col, off) => {
        const wob = Math.sin(time * 9 + off) * 3, tip = Math.sin(time * 6 + off * 2) * 4;
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(fx - w, fy - 2);
        ctx.quadraticCurveTo(fx - w * 0.9 + wob, fy - h * 0.55, fx + tip, fy - h); ctx.quadraticCurveTo(fx + w * 0.9 + wob, fy - h * 0.55, fx + w, fy - 2); ctx.closePath(); ctx.fill();
      };
      flame(50 * pulse, 17, '#e0561e', 0); flame(38 * pulse, 12, '#ff9a2e', 1.3); flame(24 * pulse, 7, '#ffe27a', 2.6);
      embers.draw(ctx, time);
    },
  };
};
SYSTEMS.trade = (r, biome) => {
  const dust = swarm(40, r,
    (r, any) => ({ x: any ? r() * W : -10, y: 280 + r() * 170, vx: 6 + r() * 10, vy: (r() - 0.5) * 3, ph: r() * TAU, spin: 1 + r(), size: 1 + r() * 1.6 }),
    drift,
    (ctx, p) => { ctx.globalAlpha = 0.3 + 0.2 * Math.sin(p.ph); ctx.fillStyle = '#f0dcae'; ctx.beginPath(); ctx.arc(0, 0, p.size, 0, TAU); ctx.fill(); });
  return { update(dt, time) { dust.update(dt, time); }, draw(ctx, time) { sunPatches(ctx, biome, time); dust.draw(ctx, time); } };
};
SYSTEMS.gate = (r, biome) => {
  const flakes = swarm(30, r,
    (r, any) => ({ x: 340 + r() * 280, y: any ? 60 + r() * 380 : 70 + r() * 20, vx: (r() - 0.5) * 6, vy: 8 + r() * 10, ph: r() * TAU, spin: 2 + r() * 2, size: 1.4 + r() * 1.4 }),
    drift,
    (ctx, p) => { ctx.globalAlpha = 0.65; ctx.fillStyle = ['#7fb078', '#5a8756', '#a0c890'][((p.size * 7) | 0) % 3]; ctx.rotate(p.ph); ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size); });
  return { update(dt, time) { flakes.update(dt, time); }, draw(ctx, time) { sunPatches(ctx, biome, time); flakes.draw(ctx, time); } };
};

// opts: { fireX, fireY }（营火位置）、props: false（不摆像素摆件，比如路线图背景）。env.setWind(k)：巨木树冠的风速倍数。
export function createEnv(biomeId, seed = 1, opts = {}) {
  const biome = BIOMES[biomeId] || BIOMES.forest;
  const id = BIOMES[biomeId] ? biomeId : 'forest';
  const stage = getStage();
  const list = opts.props === false ? [] : (biome.props || []).filter(p => stage && stage.has(p.id));
  const base = bakeGround(biome, seed * 131 + id.length * 7 + id.charCodeAt(0));
  const r = rng(seed + 99);
  const art3d = !!stage && list.length > 0;
  const fire = art3d && biome.fire ? { fireX: biome.fire.x, fireY: biome.fire.y } : {};
  const env = { opts: { ...fire, ...opts }, wind: 1, time: 0, art3d };
  const sys = SYSTEMS[id](r, biome, env);
  // 远 → 近：落脚点靠上的先画
  const placed = list.map((p, i) => ({ ...p, slot: id + ':' + i })).sort((a, b) => a.y - b.y);
  return {
    biome, art3d,
    setWind(k) { env.wind = k; },
    update(dt) { env.time += dt; sys.update(dt, env.time); },
    // 先地面，再摆件（比地面上的微粒靠后），最后微粒、薄雾和暖晕盖在摆件前面
    draw(ctx) {
      ctx.drawImage(base, 0, 0, W, H);
      for (const p of placed) stage.draw(ctx, p.id, p.x, p.y, { slot: p.slot, yaw: p.yaw ?? 0, act: p.act, dark: 0.85 });   // 摆件压暗 15%，让战区更跳出来
      ctx.save(); sys.draw(ctx, env.time); ctx.restore();
    },
  };
}

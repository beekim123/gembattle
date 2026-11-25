// 色块角色：第 1 步先用清晰的色块画角色，全部经 drawActor 出口。
// 第 3 步换成工坊的 3D 像素模型时，只改 render/ 里的实现，玩法和界面代码不动。
import { hexMix } from '../ui/draw.js';

// 各角色的大致尺寸（局部单位，脚底在原点、向上为负）：用来点选和摆血条
export const ACTOR_SIZE = {
  npc_mage: { w: 44, h: 78 },
  slime_jelly: { w: 60, h: 46 },
  earth2_barometz: { w: 70, h: 56 },
  goblin_scout: { w: 52, h: 66 },
  fairy_meadow: { w: 56, h: 74 },
};

// o: { t 秒, scale, flash 0..1 发白, alpha, dx, dy 位移, squash }
export function drawActor(ctx, look, x, y, o = {}) {
  const { t = 0, scale = 1, flash = 0, alpha = 1, dx = 0, dy = 0, seed = 0 } = o;
  const F = c => (flash > 0 ? hexMix(c, '#ffffff', Math.min(1, flash)) : c);
  const fn = DRAW[look] || DRAW.fallback;
  // 落地的椭圆（不是展示台，只是脚下压一块暗）
  ctx.save();
  ctx.globalAlpha = alpha * 0.28; ctx.fillStyle = '#000';
  const sz = ACTOR_SIZE[look] || { w: 50, h: 60 };
  ctx.beginPath(); ctx.ellipse(x, y + 1, sz.w * 0.5 * scale, 6 * scale, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x + dx, y + dy); ctx.scale(scale, scale);
  fn(ctx, F, t + seed, o);
  ctx.restore();
}

const ell = (ctx, x, y, rx, ry, fill, stroke = 'rgba(0,0,0,0.55)') => {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = stroke; ctx.stroke();
};
const poly = (ctx, pts, fill, stroke = 'rgba(0,0,0,0.55)') => {
  ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = stroke; ctx.stroke();
};
const rect = (ctx, x, y, w, h, fill, stroke = 'rgba(0,0,0,0.55)') => {
  ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); ctx.lineWidth = 1.6; ctx.strokeStyle = stroke; ctx.strokeRect(x, y, w, h);
};

const DRAW = {
  // 主角：宝石卡牌法师（紫袍、尖帽、宝石杖）
  npc_mage(ctx, F, t, o) {
    const bob = Math.sin(t * 2.6) * 1.2;
    ctx.translate(0, bob);
    poly(ctx, [[-17, 0], [17, 0], [10, -36], [-10, -36]], F('#5b4bb0'));
    rect(ctx, -10, -22, 20, 5, F('#e8c24a'));
    ell(ctx, 0, -44, 9, 9.5, F('#f0c8a0'));
    poly(ctx, [[-14, -50], [14, -50], [2, -80], [-2, -80]], F('#3d3480'));
    rect(ctx, -15, -52, 30, 4, F('#2b2562'));
    ell(ctx, -3, -45, 1.6, 1.8, '#2a2020', 'transparent'); ell(ctx, 4, -45, 1.6, 1.8, '#2a2020', 'transparent');
    ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(22, 2); ctx.lineTo(22, -56); ctx.stroke();
    ctx.beginPath(); ctx.arc(22, -60, 6, 0, Math.PI * 2);
    ctx.fillStyle = F('#f6f6ff'); ctx.fill(); ctx.strokeStyle = '#9a9ad0'; ctx.lineWidth = 2; ctx.stroke();
    // 三颗小宝石绕着杖头转
    for (let k = 0; k < 3; k++) {
      const a = t * 2 + k * 2.09;
      ctx.beginPath(); ctx.arc(22 + Math.cos(a) * 10, -60 + Math.sin(a) * 4, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = ['#ff5a4a', '#52d65a', '#5a8cff'][k]; ctx.fill();
    }
  },
  // 水滴软泥：半透明的蓝绿色一团，会一压一弹
  slime_jelly(ctx, F, t) {
    const sq = 1 + Math.sin(t * 3) * 0.06;
    ctx.scale(1 / sq, sq);
    ctx.beginPath();
    ctx.moveTo(-30, 0); ctx.bezierCurveTo(-34, -20, -16, -44, 0, -44); ctx.bezierCurveTo(16, -44, 34, -20, 30, 0); ctx.closePath();
    ctx.fillStyle = F('#5ec8e0'); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(10,50,70,0.7)'; ctx.stroke();
    ell(ctx, -10, -30, 7, 4, 'rgba(255,255,255,0.45)', 'transparent');
    ell(ctx, -9, -16, 3, 4, '#16323c', 'transparent'); ell(ctx, 9, -16, 3, 4, '#16323c', 'transparent');
    ctx.beginPath(); ctx.arc(0, -9, 4, 0.1 * Math.PI, 0.9 * Math.PI); ctx.strokeStyle = '#16323c'; ctx.lineWidth = 1.8; ctx.stroke();
  },
  // 草茎绵羊：一团软白的毛，四条绿茎当腿
  earth2_barometz(ctx, F, t) {
    const bob = Math.sin(t * 2.2) * 1.4;
    for (const lx of [-22, -8, 8, 22]) { ctx.strokeStyle = F('#4a8a3c'); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(lx, -14); ctx.lineTo(lx + (lx > 0 ? 2 : -2), 0); ctx.stroke(); }
    ctx.translate(0, bob);
    ell(ctx, 0, -28, 29, 20, F('#f4f1e4'));
    ell(ctx, -14, -38, 12, 10, F('#fffdf0'), 'transparent'); ell(ctx, 10, -40, 13, 10, F('#fffdf0'), 'transparent');
    ell(ctx, 28, -28, 11, 10, F('#6aa850'));
    ell(ctx, 31, -30, 1.8, 2.2, '#1c2a14', 'transparent');
    poly(ctx, [[-4, -46], [4, -46], [0, -56]], F('#58b04a'));
  },
  // 拾荒地精：绿皮、大耳朵、背着破布袋
  goblin_scout(ctx, F, t) {
    const bob = Math.sin(t * 3.2) * 1.2;
    ctx.translate(0, bob);
    ell(ctx, -16, -22, 10, 14, F('#8a6a44'));
    rect(ctx, -11, -34, 22, 28, F('#7a5a38'));
    rect(ctx, -9, -6, 7, 8, F('#4a3a28')); rect(ctx, 2, -6, 7, 8, F('#4a3a28'));
    ell(ctx, 0, -44, 12, 11, F('#6aa84f'));
    poly(ctx, [[-11, -48], [-24, -52], [-12, -41]], F('#6aa84f'));
    poly(ctx, [[11, -48], [24, -52], [12, -41]], F('#6aa84f'));
    ell(ctx, -4.5, -46, 2.2, 2.6, '#f2e060', 'transparent'); ell(ctx, 4.5, -46, 2.2, 2.6, '#f2e060', 'transparent');
    ctx.strokeStyle = '#4b2a14'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(15, -8); ctx.lineTo(24, -40); ctx.stroke();
    ell(ctx, 25, -42, 5, 6, F('#8a5a30'));
  },
  // 花甸灵精：一朵粉花当脸，两片薄翅，绿茎身子
  fairy_meadow(ctx, F, t) {
    const bob = Math.sin(t * 2.4) * 3;
    ctx.translate(0, bob - 8);
    const flap = Math.sin(t * 9) * 0.12;
    ctx.save(); ctx.rotate(-0.5 + flap); ell(ctx, -22, -30, 14, 7, 'rgba(235,250,255,0.75)', 'rgba(120,160,180,0.7)'); ctx.restore();
    ctx.save(); ctx.rotate(0.5 - flap); ell(ctx, 22, -30, 14, 7, 'rgba(235,250,255,0.75)', 'rgba(120,160,180,0.7)'); ctx.restore();
    poly(ctx, [[-7, 6], [7, 6], [4, -24], [-4, -24]], F('#4f9a48'));
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3 + t * 0.4;
      ell(ctx, Math.cos(a) * 14, -40 + Math.sin(a) * 14, 8, 6, F('#f6a8c4'));
    }
    ell(ctx, 0, -40, 9, 9, F('#fbe06a'));
    ell(ctx, -3, -41, 1.5, 2, '#5a3a18', 'transparent'); ell(ctx, 3, -41, 1.5, 2, '#5a3a18', 'transparent');
  },
  fallback(ctx, F) { rect(ctx, -16, -40, 32, 40, F('#c06060')); },
};

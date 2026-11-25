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
  earth3_zheng: { w: 88, h: 54 },
  earth6_long_arm: { w: 62, h: 84 },
  earth1_belly_maw: { w: 86, h: 66 },
  tree3_leshy: { w: 100, h: 112 },
  npc_gear_smith: { w: 46, h: 72 },
};
// 战斗里怪的放大倍数（首领大一些，别的差不多）
export const ENEMY_SCALE = { slime_jelly: 1.5, tree3_leshy: 1.1, earth3_zheng: 1.3, earth1_belly_maw: 1.3, earth6_long_arm: 1.3 };

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
  // 五尾赤豹：低伏的赤色豹，身后扇开五条尾巴
  earth3_zheng(ctx, F, t) {
    const sway = Math.sin(t * 2.4) * 0.12;
    for (let k = 0; k < 5; k++) {
      const a = -0.9 + k * 0.45 + sway * (k - 2) * 0.5;
      ctx.save(); ctx.translate(-26, -26); ctx.rotate(a - Math.PI / 2 + Math.PI);
      ctx.strokeStyle = F(k % 2 ? '#c8402e' : '#e0663a'); ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(10, 18, 2, 36); ctx.stroke(); ctx.restore();
    }
    for (const lx of [-18, -6, 16, 28]) rect(ctx, lx - 3, -14, 7, 14, F('#b8381f'));
    ell(ctx, 0, -28, 32, 15, F('#d8502e'));
    for (const [sx, sy] of [[-14, -33], [-2, -36], [10, -32], [-6, -24], [18, -26]]) ell(ctx, sx, sy, 3.5, 2.5, F('#7a2214'), 'transparent');
    ell(ctx, 34, -34, 13, 11, F('#e0663a'));
    poly(ctx, [[28, -42], [31, -52], [37, -43]], F('#b8381f')); poly(ctx, [[38, -43], [43, -51], [45, -40]], F('#b8381f'));
    ell(ctx, 38, -35, 2, 2.4, '#fff2a0', 'transparent'); ell(ctx, 45, -31, 2.4, 1.8, '#3a1410', 'transparent');
  },
  // 摇果长臂猿：灰褐的身子，两条超长的手臂，手里攥着红果
  earth6_long_arm(ctx, F, t) {
    const sw = Math.sin(t * 2) * 5;
    rect(ctx, -10, -16, 8, 16, F('#6a4a30')); rect(ctx, 3, -16, 8, 16, F('#6a4a30'));
    ell(ctx, 0, -38, 15, 22, F('#8a6240'));
    ell(ctx, 0, -32, 9, 13, F('#c8a47c'), 'transparent');
    for (const sx of [-1, 1]) {
      ctx.strokeStyle = F('#8a6240'); ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx * 13, -52); ctx.quadraticCurveTo(sx * (34 + sw), -34, sx * (30 + sw * 1.4), -4); ctx.stroke();
      ell(ctx, sx * (30 + sw * 1.4), -3, 6, 6, F('#c8402e'));
    }
    ell(ctx, 0, -66, 13, 12, F('#8a6240'));
    ell(ctx, 0, -63, 9, 8, F('#d8b890'), 'transparent');
    ell(ctx, -4, -66, 1.8, 2.2, '#2a1a10', 'transparent'); ell(ctx, 4, -66, 1.8, 2.2, '#2a1a10', 'transparent');
  },
  // 腹口懒兽：圆滚滚的一大团，肚皮上裂开一张大嘴
  earth1_belly_maw(ctx, F, t) {
    const br = 1 + Math.sin(t * 1.6) * 0.03;
    ctx.scale(br, 1 / br);
    rect(ctx, -26, -10, 14, 12, F('#6a5a46')); rect(ctx, 12, -10, 14, 12, F('#6a5a46'));
    ell(ctx, 0, -30, 36, 28, F('#8a7a5e'));
    ell(ctx, 0, -22, 22, 15, F('#3a1e1a'));
    for (let k = -3; k <= 3; k++) { poly(ctx, [[k * 6 - 3, -33], [k * 6 + 3, -33], [k * 6, -26]], '#f2ecd8', 'transparent'); poly(ctx, [[k * 6 - 3, -11], [k * 6 + 3, -11], [k * 6, -18]], '#f2ecd8', 'transparent'); }
    ell(ctx, 0, -16, 7, 4, F('#c0504a'), 'transparent');
    ell(ctx, -22, -54, 11, 9, F('#7a6a50'));
    ell(ctx, -25, -55, 1.6, 2, '#2a2218', 'transparent');
    ctx.strokeStyle = '#2a2218'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-29, -58); ctx.lineTo(-22, -57); ctx.stroke();
  },
  // 千丈古树精：一棵会走的老树，树干上有脸，枝条当手臂，顶着一冠叶子
  tree3_leshy(ctx, F, t) {
    const sw = Math.sin(t * 1.4) * 4;
    for (const [rx, rw] of [[-34, 18], [-14, 12], [16, 12], [34, 18]]) poly(ctx, [[rx - rw / 2, 0], [rx + rw / 2, 0], [rx * 0.6, -26]], F('#4a321f'));
    poly(ctx, [[-26, -22], [26, -22], [20, -76], [-20, -76]], F('#5c4129'));
    rect(ctx, -26, -22, 9, 54, F('#6a4a2e'), 'transparent');
    for (const sx of [-1, 1]) {
      ctx.strokeStyle = F('#4a321f'); ctx.lineWidth = 9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx * 22, -60); ctx.quadraticCurveTo(sx * (46 + sw), -64, sx * (52 + sw), -88); ctx.stroke();
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(sx * (52 + sw), -88); ctx.lineTo(sx * (60 + sw), -98); ctx.moveTo(sx * (52 + sw), -88); ctx.lineTo(sx * (46 + sw), -100); ctx.stroke();
    }
    for (const [lx, ly, lr, col] of [[0, -96, 34, '#2e6a38'], [-24, -88, 24, '#265a30'], [24, -88, 24, '#265a30'], [0, -108, 22, '#3a7a42']]) ell(ctx, lx, ly, lr, lr * 0.8, F(col));
    for (let k = 0; k < 5; k++) ell(ctx, -22 + k * 11, -92 + (k % 2) * 8, 3.2, 3.2, '#c8402e', 'transparent');
    ell(ctx, -8, -52, 4, 5, '#f2c050', 'transparent'); ell(ctx, 8, -52, 4, 5, '#f2c050', 'transparent');
    ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -40, 9, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  },
  // 行商：背着大包袱的矮个子
  npc_gear_smith(ctx, F, t) {
    const bob = Math.sin(t * 2.2) * 1;
    ctx.translate(0, bob);
    ell(ctx, -14, -34, 14, 18, F('#8a5a30'));
    poly(ctx, [[-14, 0], [14, 0], [11, -34], [-11, -34]], F('#5a7a4a'));
    rect(ctx, -12, -20, 24, 5, F('#e8c24a'));
    ell(ctx, 0, -44, 9, 9.5, F('#f0c8a0'));
    poly(ctx, [[-12, -48], [12, -48], [8, -62], [-8, -62]], F('#a03a2c'));
    ell(ctx, -3, -45, 1.6, 1.8, '#2a2020', 'transparent'); ell(ctx, 4, -45, 1.6, 1.8, '#2a2020', 'transparent');
    ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(18, 2); ctx.lineTo(18, -40); ctx.stroke();
    ell(ctx, 18, -44, 5, 6, F('#e8c24a'));
  },
  fallback(ctx, F) { rect(ctx, -16, -40, 32, 40, F('#c06060')); },
};

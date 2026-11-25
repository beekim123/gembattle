// 路线图用的小图标：节点类型图标和右下角的战利品角标（全是路径画的，不靠字体里的符号）。
const TAU = Math.PI * 2;

export const NODE_STYLE = {
  battle: { ring: '#e07a68', fill: '#44282a', r: 19 },
  elite: { ring: '#ffa23a', fill: '#4e2f14', r: 22 },
  event: { ring: '#a99aff', fill: '#2c2a52', r: 19 },
  shop: { ring: '#f2cc58', fill: '#4a3c18', r: 19 },
  camp: { ring: '#ff9248', fill: '#46281a', r: 19 },
  boss: { ring: '#ffd24a', fill: '#3e2c0e', r: 30 },
};

// 画在 (x, y) 中心，大小跟着半径 r 走
export function drawNodeIcon(ctx, type, x, y, r, color = '#fff') {
  ctx.save(); ctx.translate(x, y); ctx.scale(r / 19, r / 19);
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (type === 'battle') {                      // 双刃：两把交叉的剑
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(-9 * s, -9); ctx.lineTo(9 * s, 9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-3 * s - 3, 5 - 3 * s * 0); ctx.lineTo(3 * s + 3, 5); ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 2.6;
    }
  } else if (type === 'elite') {                // 兽角：一对向上弯的角 + 脸
    ctx.beginPath(); ctx.moveTo(-6, 6); ctx.quadraticCurveTo(-16, 2, -12, -12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(6, 6); ctx.quadraticCurveTo(16, 2, 12, -12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(6, -2); ctx.lineTo(4, 10); ctx.lineTo(-4, 10); ctx.closePath(); ctx.fill();
  } else if (type === 'event') {                // 问号
    ctx.font = '800 26px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 0; ctx.fillText('?', 0, 1);
  } else if (type === 'shop') {                 // 帐篷
    ctx.beginPath(); ctx.moveTo(-12, 9); ctx.lineTo(0, -10); ctx.lineTo(12, 9); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4, 9); ctx.lineTo(0, 1); ctx.lineTo(4, 9); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, -15); ctx.stroke();
  } else if (type === 'camp') {                 // 火苗
    ctx.beginPath(); ctx.moveTo(0, -13); ctx.bezierCurveTo(10, -3, 11, 4, 6, 9); ctx.quadraticCurveTo(0, 13, -6, 9); ctx.bezierCurveTo(-11, 4, -8, -3, 0, -13); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.moveTo(0, -2); ctx.bezierCurveTo(4, 3, 4, 6, 0, 8); ctx.bezierCurveTo(-4, 6, -4, 3, 0, -2); ctx.fill();
  } else if (type === 'boss') {                 // 王冠
    ctx.beginPath(); ctx.moveTo(-14, 8); ctx.lineTo(-16, -8); ctx.lineTo(-7, 0); ctx.lineTo(0, -12); ctx.lineTo(7, 0); ctx.lineTo(16, -8); ctx.lineTo(14, 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-14, 4, 28, 4);
  }
  ctx.restore();
}

export const LOOT_HEX = { carve: '#6ad8ff', seal: '#c490ff', arcana: '#ffd24a', hand: '#7ae07a', heal: '#ff6a78', attr: '#ff9a3a' };

// 战利品角标：一枚 size × size 的小方牌，中心在 (x, y)
export function drawLootBadge(ctx, kind, x, y, size = 15) {
  const h = size / 2, col = LOOT_HEX[kind] || '#fff';
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = '#17120c'; ctx.strokeStyle = col; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.roundRect(-h, -h, size, size, 3); ctx.fill(); ctx.stroke();
  ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
  const k = size / 15;
  ctx.scale(k, k);
  if (kind === 'carve') {                       // 宝石：菱形切面
    ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(5, -1); ctx.lineTo(0, 5.5); ctx.lineTo(-5, -1); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#17120c'; ctx.beginPath(); ctx.moveTo(-5, -1); ctx.lineTo(5, -1); ctx.stroke();
  } else if (kind === 'seal') {                 // 印记：六边环里一点
    ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i * TAU / 6 - Math.PI / 2; i ? ctx.lineTo(Math.cos(a) * 5.5, Math.sin(a) * 5.5) : ctx.moveTo(Math.cos(a) * 5.5, Math.sin(a) * 5.5); } ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, TAU); ctx.fill();
  } else if (kind === 'arcana') {               // 秘术牌：一张带横线的小牌
    ctx.beginPath(); ctx.roundRect(-4, -5.5, 8, 11, 1.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-2, -2); ctx.lineTo(2, -2); ctx.moveTo(-2, 1); ctx.lineTo(2, 1); ctx.stroke();
  } else if (kind === 'hand') {                 // 加号
    ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.moveTo(0, -5); ctx.lineTo(0, 5); ctx.stroke();
  } else if (kind === 'heal') {                 // 心
    ctx.beginPath(); ctx.moveTo(0, 5); ctx.bezierCurveTo(-8, -1, -4, -7, 0, -3); ctx.bezierCurveTo(4, -7, 8, -1, 0, 5); ctx.fill();
  } else if (kind === 'attr') {                 // 实心菱形
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(5, 0); ctx.lineTo(0, 6); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

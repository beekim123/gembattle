// 怪出手的技能特效（2D 画在布局单位上）。从怪（from）打向主角（to），t 是出手以后过了几秒。
// 每种一小段函数：kind 见 content/monsters.js 的 ATTACK_FX。
const TAU = Math.PI * 2;
export const ATTACK_FX_DUR = 0.7;

const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = k => Math.max(0, Math.min(1, k));
const arcPos = (from, to, k, lift) => ({ x: lerp(from.x, to.x, k), y: lerp(from.y, to.y, k) - Math.sin(Math.PI * k) * lift });
function ring(ctx, x, y, k, color, w = 3) {
  ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = color; ctx.lineWidth = w * (1 - k * 0.5);
  ctx.beginPath(); ctx.ellipse(x, y, 8 + k * 36, 3 + k * 13, 0, 0, TAU); ctx.stroke(); ctx.restore();
}

const FX = {
  // 水滴：一团水滴划过去，砸在主角身上溅开
  spit(ctx, k, from, to) {
    const f = clamp01(k / 0.55);
    if (k < 0.55) {
      const p = arcPos(from, to, f, 46);
      ctx.fillStyle = '#6fd6e8'; ctx.strokeStyle = '#1b5f70'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 9 - f * 2, 7 + f, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(p.x - 3, p.y - 3, 2.4, 0, TAU); ctx.fill();
    } else {
      const u = (k - 0.55) / 0.45; ring(ctx, to.x, to.y + 10, u, '#8fe6f4');
      ctx.fillStyle = '#6fd6e8'; ctx.globalAlpha = 1 - u;
      for (let i = 0; i < 7; i++) { const a = i * 0.9, r = 6 + u * 26; ctx.beginPath(); ctx.arc(to.x + Math.cos(a) * r, to.y + Math.sin(a) * r * 0.7 - u * 10, 3 - u * 1.5, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
  },
  // 撞过去：路上一串毛团，撞上去迸出几点火花
  puff(ctx, k, from, to) {
    const f = clamp01(k / 0.5);
    ctx.fillStyle = '#fffdf0'; ctx.strokeStyle = 'rgba(80,70,50,0.6)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      const kk = Math.max(0, f - i * 0.1); if (kk <= 0) continue;
      const p = arcPos(from, to, kk, 8); ctx.globalAlpha = (1 - i * 0.18) * (1 - Math.max(0, (k - 0.7) / 0.3));
      ctx.beginPath(); ctx.arc(p.x + Math.sin(i * 2) * 4, p.y + Math.cos(i) * 3, 7 - i, 0, TAU); ctx.fill(); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (k > 0.5) { const u = (k - 0.5) / 0.5; ring(ctx, to.x, to.y + 6, u, '#fff6c8', 4); star(ctx, to.x, to.y - 16, 10 + u * 12, 1 - u, '#fff2a0'); }
  },
  // 抡棒：主角头上落下一道粗弧
  club(ctx, k, from, to) {
    const u = clamp01(k / 0.6);
    ctx.save(); ctx.translate(to.x, to.y - 20);
    for (let i = 0; i < 4; i++) {
      const e = clamp01(u - i * 0.07);
      ctx.globalAlpha = (1 - i * 0.25) * (1 - Math.max(0, (k - 0.6) / 0.4));
      ctx.strokeStyle = i === 0 ? '#fff0b0' : '#c8a060'; ctx.lineWidth = 9 - i * 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, 46, -2.4, -2.4 + 3.4 * e); ctx.stroke();
    }
    ctx.restore();
    if (k > 0.55) ring(ctx, to.x, to.y + 8, (k - 0.55) / 0.45, '#e8d090', 4);
  },
  // 花瓣：一捧花瓣旋着飞过来
  petals(ctx, k, from, to) {
    const f = clamp01(k / 0.75);
    for (let i = 0; i < 9; i++) {
      const kk = clamp01(f - i * 0.04); const p = arcPos(from, to, kk, 20 + (i % 3) * 8);
      const a = kk * 9 + i;
      ctx.save(); ctx.globalAlpha = 1 - Math.max(0, (k - 0.7) / 0.3); ctx.translate(p.x + Math.sin(a) * 10, p.y + Math.cos(a * 1.3) * 8); ctx.rotate(a);
      ctx.fillStyle = i % 2 ? '#f6a8c4' : '#fbe0ea'; ctx.strokeStyle = 'rgba(120,40,70,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(0, 0, 6, 3, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
    }
  },
  // 抛红果：高高抛过来，砸开一滩红汁
  fruit(ctx, k, from, to) {
    const f = clamp01(k / 0.6);
    if (k < 0.6) {
      const p = arcPos(from, to, f, 90);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(f * 12);
      ctx.fillStyle = '#c8402e'; ctx.strokeStyle = '#4a1410'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#6aa850'; ctx.fillRect(-1, -11, 3, 5); ctx.restore();
    } else {
      const u = (k - 0.6) / 0.4; ring(ctx, to.x, to.y + 8, u, '#ff7a5a');
      ctx.fillStyle = '#c8402e'; ctx.globalAlpha = 1 - u;
      for (let i = 0; i < 8; i++) { const a = i * 0.8, r = 8 + u * 28; ctx.beginPath(); ctx.arc(to.x + Math.cos(a) * r, to.y - 6 + Math.sin(a) * r * 0.6, 3.4 - u * 2, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
  },
  // 爪痕：三道斜斜划下
  claw(ctx, k, from, to) {
    ctx.save(); ctx.translate(to.x, to.y - 36); ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const e = clamp01((k - i * 0.1) / 0.3); if (e <= 0) continue;
      ctx.globalAlpha = (1 - clamp01((k - 0.45) / 0.55));
      ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = 5 - i; ctx.beginPath(); ctx.moveTo(-26 + i * 16, -34); ctx.lineTo(-26 + i * 16 + 30 * e, -34 + 76 * e); ctx.stroke();
      ctx.strokeStyle = '#fff0e0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-26 + i * 16, -34); ctx.lineTo(-26 + i * 16 + 30 * e, -34 + 76 * e); ctx.stroke();
    }
    ctx.restore();
  },
  // 咬：上下两排牙合拢
  bite(ctx, k, from, to) {
    const c = ease(clamp01(k / 0.4)), fade = 1 - clamp01((k - 0.6) / 0.4);
    ctx.save(); ctx.translate(to.x, to.y - 34); ctx.globalAlpha = fade;
    const gap = lerp(46, 4, c);
    for (const dir of [-1, 1]) {
      ctx.fillStyle = '#3a1e1a'; ctx.fillRect(-34, dir * gap - (dir > 0 ? 0 : 10), 68, 10);
      ctx.fillStyle = '#f2ecd8';
      for (let i = 0; i < 6; i++) { const x = -30 + i * 12; ctx.beginPath(); ctx.moveTo(x, dir * gap); ctx.lineTo(x + 10, dir * gap); ctx.lineTo(x + 5, dir * gap - dir * 14); ctx.closePath(); ctx.fill(); }
    }
    ctx.restore();
    if (k > 0.35) star(ctx, to.x, to.y - 34, 16, 1 - clamp01((k - 0.35) / 0.4), '#ffd0a0');
  },
  // 树根：几根粗根从主角脚下破土
  roots(ctx, k, from, to) {
    const grow = ease(clamp01(k / 0.35)), fade = 1 - clamp01((k - 0.65) / 0.35);
    ctx.save(); ctx.globalAlpha = fade; ctx.lineCap = 'round';
    [-34, -14, 10, 32].forEach((dx, i) => {
      const h = (46 + (i % 2) * 22) * grow;
      ctx.strokeStyle = '#4a321f'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(to.x + dx, to.y + 10); ctx.quadraticCurveTo(to.x + dx + (i % 2 ? 12 : -12), to.y - h * 0.5, to.x + dx + (i % 2 ? -6 : 6), to.y + 10 - h); ctx.stroke();
      ctx.strokeStyle = '#7a5a38'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(to.x + dx - 2, to.y + 8); ctx.quadraticCurveTo(to.x + dx + (i % 2 ? 10 : -14), to.y - h * 0.5, to.x + dx + (i % 2 ? -8 : 4), to.y + 8 - h); ctx.stroke();
    });
    ctx.restore();
    ring(ctx, to.x, to.y + 10, clamp01(k / 0.6), '#a07848', 5);
  },
};
const ease = u => u * u * (3 - 2 * u);
function star(ctx, x, y, r, a, color) {
  ctx.save(); ctx.globalAlpha = Math.max(0, a); ctx.fillStyle = color; ctx.translate(x, y); ctx.beginPath();
  for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * 0.4 : r; ctx.lineTo(Math.cos(i * Math.PI / 4) * rr, Math.sin(i * Math.PI / 4) * rr); }
  ctx.closePath(); ctx.fill(); ctx.restore();
}

export function drawAttackFx(ctx, kind, t, from, to) {
  const fn = FX[kind]; if (!fn) return;
  ctx.save(); fn(ctx, clamp01(t / ATTACK_FX_DUR), from, to); ctx.restore();
}
export const ATTACK_FX_KINDS = Object.keys(FX);

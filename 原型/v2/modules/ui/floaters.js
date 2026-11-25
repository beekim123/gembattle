import { text } from './draw.js';

// 飘字：纯数字（发数不封顶，不写万亿）。也用来飘「扣半心」等短提示。
export class Floaters {
  constructor() { this.items = []; }
  add(o) { this.items.push({ t: 0, life: 1.1, vy: -38, dx: 0, size: 18, color: '#fff', delay: 0, ...o }); }
  update(dt) {
    for (const f of this.items) { if (f.delay > 0) { f.delay -= dt; continue; } f.t += dt; }
    this.items = this.items.filter(f => f.t < f.life);
  }
  draw(ctx) {
    for (const f of this.items) {
      if (f.delay > 0) continue;
      const k = f.t / f.life, a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      const pop = f.t < 0.12 ? 1 + (0.12 - f.t) * 5 : 1;
      ctx.save(); ctx.globalAlpha = Math.max(0, a);
      ctx.translate(f.x + f.dx * f.t, f.y + f.vy * f.t); ctx.scale(pop, pop);
      text(ctx, String(f.text), 0, 0, { size: f.size, color: f.color, align: 'center', weight: 800 });
      ctx.restore();
    }
  }
}

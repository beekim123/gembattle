import { text, roundRect } from './draw.js';

export class Button {
  constructor(id, label, x, y, w, h) { Object.assign(this, { id, label, x, y, w, h, enabled: true, hover: false, accent: false }); }
  hit(px, py) { return px >= this.x && px <= this.x + this.w && py >= this.y && py <= this.y + this.h; }
  draw(ctx) {
    roundRect(ctx, this.x, this.y, this.w, this.h, 6);
    ctx.fillStyle = !this.enabled ? 'rgba(40,46,40,0.55)' : this.accent ? (this.hover ? '#e8b92c' : '#c99a1c') : (this.hover ? 'rgba(90,110,90,0.95)' : 'rgba(46,62,48,0.92)');
    ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = this.enabled ? (this.accent ? '#ffe9a0' : 'rgba(255,255,255,0.45)') : 'rgba(255,255,255,0.12)'; ctx.stroke();
    text(ctx, this.label, this.x + this.w / 2, this.y + this.h / 2 + 1, { size: this.size || 14, align: 'center', color: this.enabled ? '#fff' : 'rgba(255,255,255,0.4)', outline: null });
  }
}

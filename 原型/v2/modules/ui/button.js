import { drawButton } from './skin.js';

// 按钮：位置、命中、状态在这里，画法交给 skin.js（有美术包用美术包按钮，没有就退回内置色块）。
// variant：'primary' 金 | 'secondary' 绿（默认）| 'danger' 红 | 'ghost' 灰；accent = true 等于 primary。
export class Button {
  constructor(id, label, x, y, w, h) { Object.assign(this, { id, label, x, y, w, h, enabled: true, hover: false, accent: false, variant: null, pressed: false }); }
  hit(px, py) { return px >= this.x && px <= this.x + this.w && py >= this.y && py <= this.y + this.h; }
  draw(ctx) {
    drawButton(ctx, this.x, this.y, this.w, this.h, this.label, {
      variant: this.variant || (this.accent ? 'primary' : 'secondary'), hover: this.hover, pressed: this.pressed, enabled: this.enabled, fontSize: this.size || 14,
    });
  }
}

// 顶栏的音乐 / 音效按钮：点一下开关；鼠标放上去，下面落下一根音量滑条，按住拖动调音量。
// 不依赖 audio 模块本身，只要一个有 getState / toggle / setVolume 的对象（api）。命中判断是纯函数，能在 node 里测。
import { text, roundRect } from './draw.js';
import { drawButton, drawPanel } from './skin.js';

export const BAR = { x: 756, y: 5, w: 38, h: 22, gap: 4 };     // 顶栏高 32，按钮垂直居中
export const SLIDER = { w: 92, h: 32, trackW: 70 };

export class AudioBar {
  constructor(api, pos = BAR) { this.api = api; this.pos = pos; this.hover = null; this.drag = null; }

  btnRect(kind) { const p = this.pos; return { x: p.x + (kind === 'sfx' ? p.w + p.gap : 0), y: p.y, w: p.w, h: p.h }; }
  // 滑条面板：悬停在哪个按钮上，就挂在它下面
  panelRect(kind) { const b = this.btnRect(kind); return { x: b.x + b.w / 2 - SLIDER.w / 2, y: b.y + b.h + 2, w: SLIDER.w, h: SLIDER.h }; }
  trackRect(kind) { const r = this.panelRect(kind); return { x: r.x + (r.w - SLIDER.trackW) / 2, y: r.y + 20, w: SLIDER.trackW, h: 6 }; }
  static inside(r, x, y) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

  // 返回现在鼠标在哪：{ kind, part: 'btn' | 'panel' } 或 null
  where(x, y) {
    for (const kind of ['music', 'sfx']) {
      if (AudioBar.inside(this.btnRect(kind), x, y)) return { kind, part: 'btn' };
      const open = this.hover === kind || (this.drag && this.drag.kind === kind);
      if (open && AudioBar.inside(this.panelRect(kind), x, y)) return { kind, part: 'panel' };
    }
    return null;
  }
  volumeAt(kind, x) {
    const t = this.trackRect(kind);
    return Math.max(0, Math.min(1, (x - t.x) / t.w));
  }
  // 以下三个返回 true 表示这次输入归音量条，场景不要再处理
  pointerMove(x, y) {
    if (this.drag) { this.api.setVolume(this.drag.kind, this.volumeAt(this.drag.kind, x)); return true; }
    const w = this.where(x, y);
    this.hover = w ? w.kind : null;
    return !!w;
  }
  pointerDown(x, y) {
    const w = this.where(x, y);
    if (!w) return false;
    if (w.part === 'btn') { this.api.toggle(w.kind); this.hover = w.kind; return true; }
    const r = this.trackRect(w.kind);
    if (y >= r.y - 8 && y <= r.y + r.h + 8) { this.drag = { kind: w.kind }; this.api.setVolume(w.kind, this.volumeAt(w.kind, x)); }
    return true;
  }
  pointerUp() { const was = !!this.drag; this.drag = null; return was; }

  draw(ctx) {
    const st = this.api.getState();
    for (const kind of ['music', 'sfx']) {
      const r = this.btnRect(kind), s = st[kind], hov = this.hover === kind;
      drawButton(ctx, r.x, r.y, r.w, r.h, kind === 'music' ? '音乐' : '音效', { variant: s.on ? 'secondary' : 'ghost', hover: hov, fontSize: 12 });
      if (!s.on) { ctx.save(); ctx.strokeStyle = 'rgba(255,120,110,0.85)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(r.x + 6, r.y + r.h - 5); ctx.lineTo(r.x + r.w - 6, r.y + 5); ctx.stroke(); ctx.restore(); }
      if (hov || (this.drag && this.drag.kind === kind)) {
        const p = this.panelRect(kind), t = this.trackRect(kind);
        drawPanel(ctx, p.x, p.y, p.w, p.h, 'tooltip');
        text(ctx, `${kind === 'music' ? '音乐' : '音效'}音量 ${Math.round(s.vol * 100)}%`, p.x + p.w / 2, p.y + 10, { size: 11, align: 'center', color: '#e8e0c8', outline: null, weight: 600 });
        roundRect(ctx, t.x, t.y, t.w, t.h, 3); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill();
        roundRect(ctx, t.x, t.y, Math.max(3, t.w * s.vol), t.h, 3); ctx.fillStyle = s.on ? '#9ad88a' : '#7a7a70'; ctx.fill();
        ctx.beginPath(); ctx.arc(t.x + t.w * s.vol, t.y + t.h / 2, 5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      }
    }
  }
}

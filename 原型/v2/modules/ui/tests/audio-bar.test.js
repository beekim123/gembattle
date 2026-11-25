import { AudioBar } from '../audio-bar.js';

const fakeApi = () => {
  const s = { music: { on: true, vol: 0.6 }, sfx: { on: true, vol: 0.8 } };
  return { s, getState: () => s, toggle: k => { s[k].on = !s[k].on; }, setVolume: (k, v) => { s[k].vol = v; if (v > 0) s[k].on = true; } };
};
export default function (t) {
  t.test('音量条：点按钮开关音乐和音效，各管各的', () => {
    const api = fakeApi(), bar = new AudioBar(api);
    const m = bar.btnRect('music'), e = bar.btnRect('sfx');
    t.assert.ok(e.x > m.x + m.w, '两个按钮不重叠');
    t.assert.equal(bar.pointerDown(m.x + 5, m.y + 5), true);
    t.assert.equal(api.s.music.on, false); t.assert.equal(api.s.sfx.on, true);
    t.assert.equal(bar.pointerDown(e.x + 5, e.y + 5), true);
    t.assert.equal(api.s.sfx.on, false);
  });
  t.test('音量条：鼠标放上去才落下滑条，拖动改音量，松手结束', () => {
    const api = fakeApi(), bar = new AudioBar(api);
    const m = bar.btnRect('music');
    t.assert.equal(bar.pointerMove(300, 300), false, '别处不拦');
    t.assert.equal(bar.pointerDown(bar.panelRect('music').x + 4, bar.panelRect('music').y + 10), false, '没悬停时滑条不存在');
    t.assert.equal(bar.pointerMove(m.x + 3, m.y + 3), true);
    const tr = bar.trackRect('music');
    t.assert.equal(bar.pointerMove(tr.x + 2, tr.y + 2), true, '移到滑条上不会收回');
    t.assert.equal(bar.pointerDown(tr.x + tr.w * 0.25, tr.y + 3), true);
    t.assert.ok(Math.abs(api.s.music.vol - 0.25) < 1e-9);
    bar.pointerMove(tr.x + tr.w * 2, 400);                     // 拖出去也跟着走，夹在 0..1
    t.assert.equal(api.s.music.vol, 1);
    bar.pointerMove(tr.x - 50, 400);
    t.assert.equal(api.s.music.vol, 0);
    t.assert.equal(bar.pointerUp(), true);
    t.assert.equal(bar.pointerUp(), false);
  });
}

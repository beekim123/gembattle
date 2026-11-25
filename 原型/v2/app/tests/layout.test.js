// 排版安全区：路线图头区 y 0..64 永远不被滚动内容压住、战斗画面顶栏/怪头文字/按钮的位置规矩。
import { readFileSync } from 'node:fs';
import { MapScene } from '../scenes/map-scene.js';
import { createTrip } from '../../modules/run-rules/index.js';

const src = f => readFileSync(new URL(f, import.meta.url), 'utf8');
const num = (code, name) => { const m = code.match(new RegExp(`\\b${name}\\s*=\\s*(-?[\\d.]+)`)); if (!m) throw new Error('源码里找不到常量 ' + name); return Number(m[1]); };

// 记录 rect（裁切窗口）调用的假画布
function recCtx() {
  const rects = [], calls = [];
  const ctx = new Proxy({}, {
    get: (o, k) => {
      if (k === '__rects') return rects;
      if (k === '__calls') return calls;
      if (k in o) return o[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'rect') return (...a) => { rects.push(a); };
      return (...a) => { calls.push(String(k)); };
    },
    set: (o, k, v) => { o[k] = v; return true; },
  });
  return ctx;
}
// 不进浏览器就能用的路线图：跳过 show() 里要建场景环境的部分
function mapScene(seed = 5) {
  const m = new MapScene();
  m.trip = createTrip(seed); m.hooks = {}; m.env = { update() {}, draw() {} }; m.sealHits = [];
  m.cam = m.camTarget = m.focusCam();
  return m;
}

export default function (t) {
  const mapSrc = src('../scenes/map-scene.js'), battleSrc = src('../scenes/battle-scene.js');

  t.test('路线图：头区 0..64，卷轴窗口从 66 开始，窗口占满剩下的高度', () => {
    t.assert.equal(num(mapSrc, 'HEAD_H'), 64);
    t.assert.equal(num(mapSrc, 'VIEW_TOP'), 66);
    t.assert.ok(num(mapSrc, 'VIEW_TOP') > num(mapSrc, 'HEAD_H'), '窗口在头区下面，不重叠');
    t.assert.ok(/VIEW_H\s*=\s*540\s*-\s*VIEW_TOP/.test(mapSrc), '窗口高 = 540 - VIEW_TOP');
  });

  t.test('路线图：整张图任意滚到哪，头区里（y < 66）点不到任何节点；窗口里的节点都点得到自己', () => {
    const m = mapScene();
    const nodes = Object.values(m.trip.map.nodes);
    t.assert.ok(nodes.length > 10);
    for (let cam = 0; cam <= m.maxCam(); cam += 37) {
      m.cam = m.camTarget = cam;
      for (const n of nodes) {
        const [x, y] = m.screenPos(n.id);
        if (y < 66) t.assert.equal(m.hitNode(x, y), null, `cam ${cam}：节点 ${n.id} 滚进头区（y=${y.toFixed(0)}）不该能点`);
        else if (y < 540 - 8) t.assert.equal(m.hitNode(x, y), n.id, `cam ${cam}：节点 ${n.id} 应该点得到`);
      }
      for (const y of [0, 20, 40, 63, 65]) for (const x of [150, 300, 480, 700]) t.assert.equal(m.hitNode(x, y), null, `头区 (${x},${y}) 不该有节点`);
    }
  });

  t.test('路线图：开图时镜头对准现在站的位置；镜头夹在 [0, maxCam]；最深一步和起点都到得了', () => {
    const m = mapScene();
    t.assert.ok(m.cam >= 0 && m.cam <= m.maxCam());
    m.scrollBy(-99999); t.assert.equal(m.camTarget, 0);
    m.scrollBy(99999); t.assert.equal(m.camTarget, m.maxCam());
    // 起点的屏幕位置在窗口里
    m.cam = m.camTarget = m.maxCam();
    const sy = m.startXY()[1] - m.cam + 66;
    t.assert.ok(sy > 66 && sy < 540, '起点在窗口里：' + sy);
    // 最深一步（图最上面）滚到 cam=0 时不被头区盖住
    m.cam = m.camTarget = 0;
    const top = Math.min(...Object.values(m.trip.map.nodes).map(n => m.screenPos(n.id)[1]));
    t.assert.ok(top >= 66 + 20, '最深一步离窗口上沿至少 20：' + top);
  });

  t.test('路线图：能画；卷轴内容被裁在 y=66 的窗口里；展开图例也能画', () => {
    const m = mapScene();
    const ctx = recCtx();
    m.draw(ctx);
    t.assert.ok(ctx.__calls.length > 200, '画了东西：' + ctx.__calls.length);
    t.assert.ok(ctx.__rects.some(r => r[1] === 66), '裁切窗口从 y=66 开始：' + JSON.stringify(ctx.__rects));
    for (const r of ctx.__rects) t.assert.ok(r[1] >= 66 || r[3] >= 540, '没有别的裁切窗口伸进头区：' + JSON.stringify(r));
    m.legendOpen = true; m.hover = Object.keys(m.trip.map.nodes)[0];
    m.draw(recCtx());
  });

  t.test('战斗画面：顶栏高 32；怪头顶文字和血条整行在 y ≥ 58；战场更深、主角更靠下', () => {
    t.assert.equal(num(battleSrc, 'TOP_H'), 32);
    t.assert.ok(num(battleSrc, 'TOP_SAFE') >= 58, '怪头顶内容的最高线 ≥ 58');
    const feet = num(battleSrc, 'ENEMY_FEET_Y');
    t.assert.ok(feet >= 176 && feet <= 184, '普通怪脚下 y：' + feet);
    const boss = Number(battleSrc.match(/FEET_OVERRIDE\s*=\s*\{[^}]*?:\s*(\d+)/)[1]);
    t.assert.ok(boss >= 206 && boss <= 212, '大首领脚下 y：' + boss);
    const hero = Number(battleSrc.match(/HERO\s*=\s*\{[^}]*y:\s*(\d+)/)[1]);
    t.assert.ok(hero >= 332 && hero <= 342, '主角 y：' + hero);
  });

  t.test('战斗画面：三个操作按钮在右下角一列；左上角的集色环和等级条在窗口左边；手牌拱形最高点不超出画面', () => {
    const btn = n => { const m = battleSrc.match(new RegExp(`${n}:\\s*new Button\\('${n}',\\s*'[^']*',\\s*(\\d+),\\s*(\\d+),\\s*(\\d+),\\s*(\\d+)`)); if (!m) throw new Error('找不到按钮 ' + n); return m.slice(1).map(Number); };
    for (const n of ['clear', 'undo', 'cast']) {
      const [x, y, w, h] = btn(n);
      t.assert.ok(x >= 826 && y >= 402 && x + w <= 960 && y + h <= 540, `${n} 在右下角：${[x, y, w, h]}`);
    }
    const ys = ['clear', 'undo', 'cast'].map(n => btn(n)[1]); t.assert.ok(ys[0] < ys[1] && ys[1] < ys[2], '从上到下：清空、退回一张、施法');
    const arc = src('../../modules/ui/arc.js');
    t.assert.ok(Number(arc.match(/y:\s*(\d+)\s*\+\s*Math\.min/)[1]) <= 480, '手牌弧顶 y ≤ 480');
  });
}

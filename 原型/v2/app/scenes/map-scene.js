// 路线图场景：落果密林第 1~8 步，从下往上走。一眼看全：
//   顶部是独立的安全头区（y 0~64：顶栏加一行提示），卷轴从 y = 66 开始，只在自己的窗口里裁切、滚动，不压头区；
//   卷轴底、青苔界门分隔线、节点图标都来自 UI-03 美术包（skin.js），整张卷轴居中舒展；
//   已走过的是实金线，现在能走的是脉冲金环 + 流动箭头，悬停未来节点会把上下连通的路径亮出来，走不到的压暗；
//   节点图例收成右上角一个折叠的「图例 ?」按钮，点开才展开。
import {
  childrenOf, parentsOf, reachableFrom, ancestorsOf, nextNodes, nodeOf, nodeInfo, TYPE_NAME,
} from '../../modules/run-rules/index.js';
import { SEALS, LINES, LOOT, BIOMES, HERO_LOOK } from '../../modules/content/index.js';
import { drawActorNow, createEnv, setView, flushWorld } from '../../modules/render/index.js';
import { audio } from '../../modules/audio/index.js';
import {
  text, wrap, roundRect, drawPanel, drawButton as drawButtonSkin, drawHearts, drawCoin, drawSealIcon, Button, drawTip, GOLD, NODE_STYLE, drawNodeIcon, drawLootBadge, LOOT_HEX,
  drawMapScrollBg, drawMapGateDivider, drawMapNode,
  layoutDeckGrid, drawDeckGrid, hitDeckGrid, GRID_CARD_H, WHEEL_HEX,
} from '../../modules/ui/index.js';
import { ARCANA, CARVES, JUNK } from '../../modules/content/index.js';

// 路线图是一张比窗口高的长图：每一步隔 STEP_H，上下拖动、滚轮或方向键看。深度加多少步都排得下。
// 世界坐标：y 从图的最上面往下数；镜头 cam 是窗口顶端对应的世界 y；窗口在屏幕上占 y = VIEW_TOP ~ 540。
const XL = 220, XW = 520;                             // 节点横向范围：x = 220 ~ 740，正好居中
const STEP_H = 104, MARGIN_TOP = 84, MARGIN_BOTTOM = 150;
const HEAD_H = 64, VIEW_TOP = 66, VIEW_H = 540 - VIEW_TOP;         // 头区 0~64，窗口从 66 开始
const VIEW_X = 100, VIEW_W = 760;                                   // 卷轴窗口：左右各留 100，居中
const LINE_HEX = { shield: '#8ff0ff', white: '#ffffff', rainbow: '#ffb0f0', hold: '#ffd24a', chain: '#9aff9a' };

function bez(a, b) {
  const dy = (a[1] - b[1]) * 0.45;
  return [a, [a[0], a[1] - dy], [b[0], b[1] + dy], b];
}
function bezPoint(p, t) {
  const u = 1 - t;
  const x = u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0];
  const y = u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1];
  const dx = 3 * u * u * (p[1][0] - p[0][0]) + 6 * u * t * (p[2][0] - p[1][0]) + 3 * t * t * (p[3][0] - p[2][0]);
  const dy = 3 * u * u * (p[1][1] - p[0][1]) + 6 * u * t * (p[2][1] - p[1][1]) + 3 * t * t * (p[3][1] - p[2][1]);
  return { x, y, a: Math.atan2(dy, dx) };
}
function strokeBez(ctx, p) { ctx.beginPath(); ctx.moveTo(...p[0]); ctx.bezierCurveTo(...p[1], ...p[2], ...p[3]); ctx.stroke(); }

export class MapScene {
  constructor() {
    this.t = 0; this.hover = null; this.hooks = null; this.trip = null; this.overlay = null;
    this.cam = 0; this.camTarget = 0; this.press = null; this.legendOpen = false;
    this.buttons = { deck: new Button('deck', '查看牌组', 842, 4, 64, 24), restart: new Button('restart', '重开', 910, 4, 44, 24) };
    for (const b of Object.values(this.buttons)) { b.variant = 'ghost'; b.size = 13; }
    this.legendBtn = { x: 866, y: 36, w: 88, h: 24 };
  }
  show(trip, hooks) {
    this.trip = trip; this.hooks = hooks; this.hover = null; this.overlay = null; this.legendOpen = false;
    setView({ mode: 'fixed', origin: [480, 300] });                       // 路线图不转镜头
    this.env = createEnv('forest', trip.seed + 5, { props: false });     // 路线图背景只要地面和微粒，不摆像素摆件
    this.sealHits = [];
    this.press = null;
    this.cam = this.camTarget = this.focusCam();
  }
  update(dt) {
    this.t += dt; this.env.update(dt);
    this.cam += (this.camTarget - this.cam) * (1 - Math.exp(-dt * 12));   // 滚轮、方向键是滑过去的
    if (Math.abs(this.camTarget - this.cam) < 0.2) this.cam = this.camTarget;
  }

  // ---------- 长图的尺寸与镜头 ----------
  get steps() { return this.trip.map.steps; }
  worldH() { return MARGIN_TOP + (this.steps - 1) * STEP_H + MARGIN_BOTTOM; }
  maxCam() { return Math.max(0, this.worldH() - VIEW_H); }
  stepY(step) { return MARGIN_TOP + (this.steps - step) * STEP_H; }
  wxy(n) { return [XL + n.x * XW, this.stepY(n.step)]; }
  startXY() { return [XL + XW / 2, this.stepY(1) + 86]; }
  clampCam(v) { return Math.max(0, Math.min(this.maxCam(), v)); }
  // 开图时把镜头摆到「现在站的位置」和下一步能走的那几个格子都看得见的地方
  focusCam() {
    const trip = this.trip, curStep = trip.pos ? trip.map.nodes[trip.pos].step : 0;
    const y = curStep ? this.stepY(curStep) : this.startXY()[1];
    return this.clampCam(y - VIEW_H * 0.74);
  }
  scrollBy(dy) { this.camTarget = this.clampCam(this.camTarget + dy); }
  wheel(dy) { if (!this.overlay) this.scrollBy(dy * 0.8); }

  // ---------- 状态 ----------
  states() {
    const trip = this.trip, map = trip.map, pos = trip.pos;
    const path = new Set(trip.path);
    const avail = new Set(nextNodes(trip));
    const reach = new Set();
    if (pos) for (const id of reachableFrom(map, pos)) reach.add(id);
    else for (const id of map.layers[0]) for (const x of reachableFrom(map, id)) reach.add(x);
    return { path, avail, reach, pos };
  }
  pos(id) { return this.wxy(this.trip.map.nodes[id]); }                              // 世界坐标
  screenPos(id) { const [x, y] = this.pos(id); return [x, y - this.cam + VIEW_TOP]; }   // 屏幕坐标（点击、悬停用）

  // ---------- 输入 ----------
  inView(x, y) { return y >= VIEW_TOP && x >= VIEW_X && x <= VIEW_X + VIEW_W; }
  hitNode(x, y) {
    if (!this.inView(x, y)) return null;
    const map = this.trip.map;
    let best = null, bd = 1e9;
    for (const n of Object.values(map.nodes)) {
      const [nx, ny] = this.screenPos(n.id), r = NODE_STYLE[n.type].r + 6, d = Math.hypot(x - nx, y - ny);
      if (d <= r && d < bd) { best = n.id; bd = d; }
    }
    return best;
  }
  hitLegend(x, y) { const b = this.legendBtn; return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; }
  pointerMove(x, y) {
    this.mx = x; this.my = y;
    for (const b of Object.values(this.buttons)) b.hover = b.enabled && b.hit(x, y);
    this.legendHover = this.hitLegend(x, y);
    this.hoverSeal = this.sealHits.find(h => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h)?.id || null;
    // 按住拖动：整张图跟着手上下走（移动超过 5 个单位才算拖，不算点击）
    if (this.press) {
      if (!this.press.moved && Math.hypot(x - this.press.x, y - this.press.y) > 5) this.press.moved = true;
      if (this.press.moved) { this.cam = this.camTarget = this.clampCam(this.press.cam - (y - this.press.y)); this.hover = null; return; }
    }
    if (this.overlay) { this.hoverCard = hitDeckGrid(this.gridItems || [], x, y); this.hover = null; return; }
    this.hover = this.hitNode(x, y);
  }
  pointerDown(x, y) {
    this.pointerMove(x, y);
    this.press = { x, y, cam: this.cam, moved: false };
  }
  // 点击在松手时才算：按下后没拖动，才当成点
  pointerUp(x, y) {
    const pr = this.press; this.press = null;
    if (!pr || pr.moved) return;
    if (this.overlay) { this.overlay = null; return; }
    if (this.hitLegend(x, y)) { audio.sfx('click'); this.legendOpen = !this.legendOpen; return; }
    for (const b of Object.values(this.buttons)) if (b.hit(x, y)) {
      audio.sfx('click');
      if (b.id === 'deck') this.overlay = { kind: 'deck' }; else this.hooks.onRestart();
      return;
    }
    if (this.legendOpen) this.legendOpen = false;
    const id = this.hitNode(x, y);
    if (id && nextNodes(this.trip).includes(id)) this.hooks.onPick(id);
  }
  key(k) {
    if (k === 'Escape') { this.overlay = null; this.legendOpen = false; }
    else if (k === 'ArrowUp' || k === 'w') this.scrollBy(-120);
    else if (k === 'ArrowDown' || k === 's') this.scrollBy(120);
    else if (k === 'PageUp') this.scrollBy(-360);
    else if (k === 'PageDown') this.scrollBy(360);
    else if (k === 'Home') this.camTarget = 0;                      // 看最深处（图的最上面）
    else if (k === 'End') this.camTarget = this.maxCam();           // 回到起点（图的最下面）
  }

  // ---------- 绘制 ----------
  draw(ctx) {
    const trip = this.trip, map = trip.map, st = this.states();
    this.env.draw(ctx); flushWorld(ctx);
    ctx.fillStyle = 'rgba(6,12,8,0.7)'; ctx.fillRect(0, 0, 960, 540);       // 森林背景压暗，卷轴才是主体
    // 卷轴窗口：卷轴底从 y = 66 开始，只在窗口里画，跟着镜头上下滚；头区（y < 66）永远不被盖
    const gateY = (this.stepY(map.gateAfter) + this.stepY(map.gateAfter + 1)) / 2;
    drawMapScrollBg(ctx, VIEW_X, VIEW_TOP, VIEW_W, VIEW_H, this.cam, this.worldH(), gateY, map.segments);
    ctx.save();
    ctx.beginPath(); ctx.rect(VIEW_X + 18, VIEW_TOP, VIEW_W - 36, VIEW_H); ctx.clip();
    ctx.translate(0, VIEW_TOP - this.cam);
    this.drawGate(ctx, gateY);
    this.drawEdges(ctx, st);
    this.drawStart(ctx, st);
    for (const n of Object.values(map.nodes)) this.drawNode(ctx, n, st);
    this.drawRail(ctx);
    ctx.restore();
    this.drawTopBar(ctx);
    this.drawScrollbar(ctx);
    this.drawLegend(ctx);
    if (this.hover && !this.overlay) this.drawNodeTip(ctx, map.nodes[this.hover], st);
    if (this.hoverSeal && !this.overlay) {
      const sd = SEALS[this.hoverSeal];
      drawTip(ctx, [sd.name, LINES[sd.line].name, sd.text], 726, 70, 228);
    }
    if (this.overlay) this.drawDeck(ctx);
  }

  drawGate(ctx, y) {
    const passed = this.trip.gateChosen;
    drawMapGateDivider(ctx, VIEW_X + 28, VIEW_X + VIEW_W - 28, y, passed, this.t);
    text(ctx, '青苔界门', VIEW_X + 36, y + 24, { size: 13, align: 'left', color: '#3e5a3a', weight: 800, outline: 'rgba(244,236,214,0.7)' });
  }

  drawEdges(ctx, st) {
    const trip = this.trip, map = trip.map, t = this.t;
    // 悬停：高亮这个节点上下连通的整条路径
    let hl = null;
    if (this.hover && !st.path.has(this.hover) && st.reach.has(this.hover)) {
      hl = new Set([...ancestorsOf(map, this.hover)].filter(id => st.reach.has(id) || st.path.has(id)));
      for (const id of reachableFrom(map, this.hover)) hl.add(id);
    }
    const path = trip.path;
    const walked = new Set(path.slice(1).map((id, i) => path[i] + '>' + id));
    const edges = map.edges.map(e => {
      const a = this.pos(e.from), b = this.pos(e.to), key = e.from + '>' + e.to;
      let kind = 'dim';
      if (walked.has(key)) kind = 'walked';
      else if (st.pos === e.from && st.avail.has(e.to)) kind = 'avail';
      else if (st.reach.has(e.from) && st.reach.has(e.to)) kind = 'future';
      return { e, p: bez(a, b), kind, hl: hl && hl.has(e.from) && hl.has(e.to) };
    });
    // 起点到第 1 步
    const starts = trip.pos ? [] : map.layers[0].map(id => ({ e: { from: 'start', to: id }, p: bez(this.startXY(), this.pos(id)), kind: 'avail', hl: false }));
    ctx.save(); ctx.lineCap = 'round';
    const order = { dim: 0, future: 1, avail: 2, walked: 3 };
    // 卷轴是浅色的羊皮纸，所以线用深褐墨色；走过的实金线下面垫一条深色描边
    for (const E of [...edges, ...starts].sort((a, b) => order[a.kind] - order[b.kind] || (a.hl - b.hl))) {
      const { p, kind } = E;
      if (kind === 'dim') { ctx.globalAlpha = 0.3; ctx.strokeStyle = '#6a5a3c'; ctx.lineWidth = 2; ctx.setLineDash([3, 6]); strokeBez(ctx, p); }
      else if (kind === 'future') {
        ctx.globalAlpha = E.hl ? 1 : 0.7; ctx.strokeStyle = E.hl ? '#b8741a' : '#6e5430'; ctx.lineWidth = E.hl ? 4 : 2.2; ctx.setLineDash(E.hl ? [] : [7, 6]);
        if (E.hl) { const w = ctx.lineWidth, a = ctx.globalAlpha; ctx.lineWidth = w + 5; ctx.globalAlpha = a * 0.35; ctx.strokeStyle = '#ffd666'; strokeBez(ctx, p); ctx.lineWidth = w; ctx.globalAlpha = a; ctx.strokeStyle = '#b8741a'; }
        strokeBez(ctx, p);
      } else if (kind === 'avail') {
        ctx.globalAlpha = 1; ctx.strokeStyle = '#3a2a12'; ctx.lineWidth = 6; ctx.setLineDash([9, 7]); ctx.lineDashOffset = -t * 36; strokeBez(ctx, p);
        ctx.strokeStyle = '#f2b93a'; ctx.lineWidth = 3.4; strokeBez(ctx, p); ctx.lineDashOffset = 0; ctx.setLineDash([]);
        for (let k = 0; k < 3; k++) {                 // 向前流动的箭头
          const q = bezPoint(p, (t * 0.45 + k / 3) % 1);
          ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.a); ctx.fillStyle = '#fff2b0'; ctx.strokeStyle = '#3a2a12'; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.95;
          ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -5); ctx.lineTo(-1, 0); ctx.lineTo(-4, 5); ctx.closePath(); ctx.stroke(); ctx.fill(); ctx.restore();
        }
      } else if (kind === 'walked') {
        ctx.globalAlpha = 1; ctx.setLineDash([]);
        ctx.strokeStyle = '#3a2a12'; ctx.lineWidth = 8; strokeBez(ctx, p);                          // 走过的路：深色描边，里面一条实金线
        ctx.strokeStyle = '#f2b93a'; ctx.lineWidth = 4.5; strokeBez(ctx, p);
      }
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  drawStart(ctx, st) {
    const [x, y] = this.startXY();
    ctx.fillStyle = 'rgba(40,28,10,0.3)'; ctx.beginPath(); ctx.ellipse(x, y + 6, 22, 7, 0, 0, Math.PI * 2); ctx.fill();
    if (!this.trip.pos) {
      drawActorNow(ctx, HERO_LOOK, x, y + 8, { t: this.t, scale: 0.55 });
      text(ctx, '出发点', x + 32, y - 6, { size: 13, align: 'left', color: '#fff2c0', outline: 'rgba(40,28,10,0.8)' });
    } else {
      text(ctx, '出发点', x, y + 4, { size: 12, align: 'center', color: 'rgba(70,50,24,0.6)', outline: 'rgba(244,236,214,0.6)' });
    }
  }

  drawNode(ctx, n, st) {
    const [x0, y0] = this.wxy(n), sty = NODE_STYLE[n.type], visited = st.path.has(n.id), isPos = st.pos === n.id;
    const avail = st.avail.has(n.id), dim = !visited && !st.reach.has(n.id);
    const bob = avail ? Math.sin(this.t * 3 + n.col) * 2.5 : 0;
    const x = x0, y = y0 + bob, r = sty.r;
    drawMapNode(ctx, n.type, x, y, r, { status: visited ? 'visited' : avail ? 'avail' : dim ? 'dim' : 'future', hover: this.hover === n.id, t: this.t });
    // 战利品角标：右下角
    if ((n.type === 'battle' || n.type === 'elite') && n.loot) drawLootBadge(ctx, n.loot, x + r * 0.78, y + r * 0.78, 17);
    // 现在站在这个节点上：主角小头像
    if (isPos) drawActorNow(ctx, HERO_LOOK, x - r - 20, y + 14, { t: this.t, scale: 0.5 });
  }

  // 左边的步数刻度（卷轴自己的边上有生态段名的暗纹，这里只画数字）
  drawRail(ctx) {
    const trip = this.trip, rx = VIEW_X + 54;
    for (let s = 1; s <= this.steps; s++) {
      const y = this.stepY(s), cur = trip.step === s, done = trip.step > s;
      ctx.beginPath(); ctx.arc(rx, y, 14, 0, Math.PI * 2);
      ctx.fillStyle = cur ? '#f2b93a' : done ? 'rgba(242,185,58,0.4)' : 'rgba(40,28,12,0.78)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = cur ? '#fff2b0' : '#2a1c0c'; ctx.stroke();
      text(ctx, String(s), rx, y + 1, { size: 15, align: 'center', color: cur ? '#2a1c08' : '#f4ecd6', outline: null, weight: 800 });
      ctx.strokeStyle = 'rgba(90,66,30,0.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(rx + 18, y); ctx.lineTo(XL - 40, y); ctx.stroke();
    }
    for (const sg of trip.map.segments) {
      const y1 = this.stepY(sg.to) - 14, y2 = this.stepY(sg.from) + 14;
      ctx.strokeStyle = 'rgba(70,52,24,0.6)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(rx - 22, y1); ctx.lineTo(rx - 26, y1); ctx.lineTo(rx - 26, y2); ctx.lineTo(rx - 22, y2); ctx.stroke();
    }
  }

  // 头区（y 0~64）：上面一条顶栏，下面一行提示。卷轴在它下面，永远不压它。
  drawTopBar(ctx) {
    const trip = this.trip, p = trip.player;
    drawPanel(ctx, 0, 0, 960, 32, 'bar');
    drawHearts(ctx, 20, 16, p.hearts, p.maxHearts, 8);
    let x = 20 + p.maxHearts * 22.4 + 8;
    drawCoin(ctx, x + 6, 16, 7); text(ctx, String(trip.gold), x + 18, 16, { size: 13, align: 'left', color: GOLD }); x += 66;
    text(ctx, '落果密林 · 探索路线', x, 16, { size: 13, align: 'left', color: '#bfe0b0' }); x += 142;
    text(ctx, `N = ${p.handBase}`, x, 16, { size: 12, align: 'left', color: '#cfd8dc' }); x += 52;
    text(ctx, `攻击 ${p.atk}`, x, 16, { size: 12, align: 'left', color: '#cfd8dc' }); x += 58;
    p.gems.forEach((g, j) => text(ctx, `${['红', '绿', '蓝'][j]}${g.level}级`, x + j * 46, 16, { size: 12, align: 'left', color: ['#ff8a7a', '#7ae07a', '#8aaaff'][j] }));
    this.sealHits = [];
    p.seals.forEach((id, k) => {
      const sx = 606 + k * 23, sy = 16;
      drawSealIcon(ctx, id, sx + 10, sy, 20, { t: this.t });
      this.sealHits.push({ x: sx, y: sy - 10, w: 20, h: 20, id });
    });
    for (const b of Object.values(this.buttons)) { b.enabled = true; b.draw(ctx); }
    // 提示条：第二行，居中；右边是折叠的「图例 ?」按钮
    drawPanel(ctx, 0, 32, 960, 32, 'bar');
    if (nextNodes(trip).length > 0) {
      const a = 0.75 + 0.25 * Math.sin(this.t * 4);
      ctx.save(); ctx.globalAlpha = a;
      text(ctx, trip.pos ? '选择下一步去向（亮着金环的格子；按住上下拖动、滚轮看全图）' : '选择从哪里进入密林（亮着金环的两个入口；按住上下拖动、滚轮看全图）', 480, 48, { size: 14, align: 'center', color: '#ffe9a0', weight: 800 });
      ctx.restore();
    }
    const lb = this.legendBtn;
    drawButton2(ctx, lb, this.legendOpen ? '收起图例' : '图例 ?', this.legendHover);
  }

  // 右边一根细滚动条 + 上下还有路时的提示箭头（都在卷轴窗口里）
  drawScrollbar(ctx) {
    const mc = this.maxCam();
    if (mc <= 0) return;
    const x = VIEW_X + VIEW_W - 16, y0 = VIEW_TOP + 10, h = VIEW_H - 20;
    ctx.fillStyle = 'rgba(60,44,20,0.25)'; roundRect(ctx, x, y0, 6, h, 3); ctx.fill();
    const th = Math.max(28, h * VIEW_H / this.worldH()), ty = y0 + (h - th) * (this.cam / mc);
    ctx.fillStyle = this.press?.moved ? '#d89a1c' : 'rgba(150,100,30,0.85)'; roundRect(ctx, x, ty, 6, th, 3); ctx.fill();
    const hint = (label, y, up) => {                          // 看不到的那头还有东西
      const a = 0.6 + 0.4 * Math.sin(this.t * 4);
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#ffe9a0'; ctx.strokeStyle = '#3a2a12'; ctx.lineWidth = 1.5;
      ctx.beginPath(); up ? (ctx.moveTo(480 - 7, y + 4), ctx.lineTo(480 + 7, y + 4), ctx.lineTo(480, y - 6)) : (ctx.moveTo(480 - 7, y - 4), ctx.lineTo(480 + 7, y - 4), ctx.lineTo(480, y + 6));
      ctx.closePath(); ctx.stroke(); ctx.fill(); ctx.restore();
      text(ctx, label, 496, y, { size: 12, align: 'left', color: '#ffe9a0', outline: 'rgba(40,28,10,0.85)' });
    };
    if (this.cam > 4) hint('往上拖还有更深处', VIEW_TOP + 18, true);
    if (this.cam < mc - 4) hint('往下拖回到起点', 530, false);
  }

  // 折叠的图例：点右上角「图例 ?」才展开，节点图标 6 种、战利品 6 种、线的含义
  drawLegend(ctx) {
    if (!this.legendOpen) return;
    const x = 760, y = 66, w = 194, h = 340;
    drawPanel(ctx, x, y, w, h, 'tooltip');
    text(ctx, '节点图标', x + 12, y + 18, { size: 13, align: 'left', color: GOLD });
    ['battle', 'elite', 'event', 'shop', 'camp', 'boss'].forEach((tp, i) => {
      const cx = x + 30 + (i % 2) * 90, cy = y + 48 + Math.floor(i / 2) * 32;
      drawMapNode(ctx, tp, cx, cy, tp === 'boss' ? 14 : 12, { status: 'future', t: this.t });
      text(ctx, TYPE_NAME[tp].replace('林地', ''), cx + 18, cy, { size: 12, align: 'left', outline: null });
    });
    text(ctx, '右下角的战利品', x + 12, y + 152, { size: 13, align: 'left', color: GOLD });
    ['carve', 'seal', 'arcana', 'hand', 'heal', 'attr'].forEach((k, i) => {
      const cy = y + 176 + i * 21;
      drawLootBadge(ctx, k, x + 22, cy, 16);
      text(ctx, LOOT[k].name, x + 38, cy, { size: 12, align: 'left', outline: null });
    });
    text(ctx, '金实线 = 走过的路', x + 12, y + 312, { size: 12, align: 'left', color: '#f2b93a', outline: null });
    text(ctx, '流动箭头 = 现在能走', x + 12, y + 328, { size: 12, align: 'left', color: '#fff2b0', outline: null });
  }

  drawNodeTip(ctx, n, st) {
    const info = nodeInfo(n);
    const [nx, ny] = this.screenPos(n.id);
    const w = 250;
    const wr = [];
    wr.push({ s: info.title, k: 0 });
    wr.push({ s: `生态：${info.biome}`, k: 1, c: '#bfe0b0' });
    for (const l of info.lines) wrap(ctx, l, w - 16, 12).forEach(s => wr.push({ s, k: 2 }));
    if (info.loot) wr.push({ s: `战利品：${info.loot.name}`, k: 1, c: LOOT_HEX[n.loot], loot: n.loot }), wrap(ctx, info.loot.text, w - 16, 12).forEach(s => wr.push({ s, k: 2, c: '#cfd8dc' }));
    wrap(ctx, '风险：' + info.risk, w - 16, 12).forEach(s => wr.push({ s, k: 2, c: '#ffb0a0' }));
    const h = 14 + wr.length * 17;
    let x = nx + 40; if (x + w > VIEW_X + VIEW_W) x = nx - 40 - w;
    let y = Math.max(VIEW_TOP + 6, Math.min(540 - h - 6, ny - h / 2));
    drawPanel(ctx, x, y, w, h, 'tooltip');
    let yy = y + 15;
    for (const l of wr) {
      text(ctx, l.s, x + 8, yy, { size: l.k === 0 ? 15 : 12, align: 'left', weight: l.k === 0 ? 800 : 500, color: l.c || (l.k === 0 ? GOLD : '#fff'), outline: null });
      yy += 17;
    }
  }

  drawDeck(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, 960, 540);
    drawPanel(ctx, 150, 36, 660, 470, 'stone');
    text(ctx, '我的牌组（点任意处关闭）', 480, 58, { size: 16, align: 'center', color: GOLD });
    const items = this.gridItems = layoutDeckGrid(this.trip.deckCards, 190, 80);
    drawDeckGrid(ctx, items, 190, 80, { hover: this.hoverCard });
    const c = this.hoverCard;
    if (c) {
      const lines = c.arcana ? [ARCANA[c.arcana].name, ARCANA[c.arcana].text] : c.junk ? [JUNK.name, JUNK.text]
        : [`${['红', '黄', '绿', '青', '蓝', '紫', '白'][c.color]}牌`, ...(c.carve || []).map(k => `${CARVES[k].name}：${CARVES[k].text}`)];
      if (lines.length > 1 || c.arcana || c.junk) drawTip(ctx, lines, Math.min(580, (this.mx || 400) + 14), Math.min(400, (this.my || 300) + 14), 220);
    }
    const p = this.trip.player;
    if (p.seals.length) {
      text(ctx, '秘宝印记：' + p.seals.map(id => SEALS[id].name).join('、'), 170, 482, { size: 13, align: 'left', color: '#ffe9a0' });
    }
  }
}

// 头区右边那个小按钮（图例 ?）：用皮肤的 ghost 按钮
function drawButton2(ctx, b, label, hover) { drawButtonSkin(ctx, b.x, b.y, b.w, b.h, label, { variant: 'ghost', hover, fontSize: 13 }); }

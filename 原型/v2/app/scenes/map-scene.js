// 路线图场景：落果密林第 1~8 步，从下往上走。一眼看全：
//   左边是步数刻度和生态段名；中间画青苔界门分界线；
//   已走过的是实金线，现在能走的是脉冲金环 + 流动箭头，悬停未来节点会把上下连通的路径亮出来，走不到的压暗。
import {
  childrenOf, parentsOf, reachableFrom, ancestorsOf, nextNodes, nodeOf, nodeInfo, TYPE_NAME,
} from '../../modules/run-rules/index.js';
import { SEALS, LINES, LOOT, BIOMES, HERO_LOOK } from '../../modules/content/index.js';
import { drawActor, createEnv } from '../../modules/render/index.js';
import { audio } from '../../modules/audio/index.js';
import {
  text, panel, wrap, roundRect, drawHearts, Button, GOLD, NODE_STYLE, drawNodeIcon, drawLootBadge, LOOT_HEX,
  layoutDeckGrid, drawDeckGrid, hitDeckGrid, GRID_CARD_H, WHEEL_HEX,
} from '../../modules/ui/index.js';
import { ARCANA, CARVES, JUNK } from '../../modules/content/index.js';

// 路线图是一张比屏幕高的长图：每一步隔 STEP_H，上下拖动、滚轮或方向键看。深度加多少步都排得下。
// 世界坐标：y 从图的最上面往下数；镜头 cam 是屏幕顶端对应的世界 y。
const XL = 214, XW = 520;
const STEP_H = 104, MARGIN_TOP = 84, MARGIN_BOTTOM = 150, VIEW_TOP = 30, VIEW_H = 540 - VIEW_TOP;
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
    this.cam = 0; this.camTarget = 0; this.press = null;
    this.buttons = { deck: new Button('deck', '查看牌组', 842, 1, 64, 24), restart: new Button('restart', '重开', 910, 1, 44, 24) };
  }
  show(trip, hooks) {
    this.trip = trip; this.hooks = hooks; this.hover = null; this.overlay = null;
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
  maxCam() { return Math.max(0, this.worldH() - 540); }
  stepY(step) { return MARGIN_TOP + (this.steps - step) * STEP_H; }
  wxy(n) { return [XL + n.x * XW, this.stepY(n.step)]; }
  startXY() { return [XL + XW / 2, this.stepY(1) + 86]; }
  clampCam(v) { return Math.max(0, Math.min(this.maxCam(), v)); }
  // 开图时把镜头摆到「现在站的位置」和下一步能走的那几个格子都看得见的地方
  focusCam() {
    const trip = this.trip, curStep = trip.pos ? trip.map.nodes[trip.pos].step : 0;
    const y = curStep ? this.stepY(curStep) : this.startXY()[1];
    return this.clampCam(y - 400);
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
  pos(id) { return this.wxy(this.trip.map.nodes[id]); }                    // 世界坐标
  screenPos(id) { const [x, y] = this.pos(id); return [x, y - this.cam]; }   // 屏幕坐标（点击、悬停用）

  // ---------- 输入 ----------
  hitNode(x, y) {
    if (y < VIEW_TOP) return null;
    const map = this.trip.map;
    let best = null, bd = 1e9;
    for (const n of Object.values(map.nodes)) {
      const [nx, ny] = this.wxy(n), r = NODE_STYLE[n.type].r + 6, d = Math.hypot(x - nx, y + this.cam - ny);
      if (d <= r && d < bd) { best = n.id; bd = d; }
    }
    return best;
  }
  pointerMove(x, y) {
    this.mx = x; this.my = y;
    for (const b of Object.values(this.buttons)) b.hover = b.enabled && b.hit(x, y);
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
    for (const b of Object.values(this.buttons)) if (b.hit(x, y)) {
      audio.sfx('click');
      if (b.id === 'deck') this.overlay = { kind: 'deck' }; else this.hooks.onRestart();
      return;
    }
    const id = this.hitNode(x, y);
    if (id && nextNodes(this.trip).includes(id)) this.hooks.onPick(id);
  }
  key(k) {
    if (k === 'Escape') this.overlay = null;
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
    this.env.draw(ctx);
    ctx.fillStyle = 'rgba(6,12,8,0.62)'; ctx.fillRect(0, 0, 960, 540);       // 压暗，路线图才是主体
    // 长图：只在顶栏下面的窗口里画，跟着镜头上下走
    ctx.save();
    ctx.beginPath(); ctx.rect(0, VIEW_TOP, 960, VIEW_H); ctx.clip();
    ctx.translate(0, -this.cam);
    this.drawGate(ctx);
    this.drawEdges(ctx, st);
    this.drawStart(ctx, st);
    for (const n of Object.values(map.nodes)) this.drawNode(ctx, n, st);
    this.drawRail(ctx);
    ctx.restore();
    const fade = ctx.createLinearGradient(0, VIEW_TOP, 0, VIEW_TOP + 56);   // 顶上淡出，别跟提示条糊在一起
    fade.addColorStop(0, 'rgba(6,12,8,0.9)'); fade.addColorStop(1, 'rgba(6,12,8,0)');
    ctx.fillStyle = fade; ctx.fillRect(0, VIEW_TOP, 780, 56);
    this.drawTopBar(ctx);
    this.drawScrollbar(ctx);
    this.drawLegend(ctx);
    if (this.hover && !this.overlay) this.drawCard(ctx, map.nodes[this.hover], st);
    if (this.hoverSeal && !this.overlay) {
      const sd = SEALS[this.hoverSeal];
      this.tip(ctx, [sd.name, LINES[sd.line].name, sd.text], 560, 36, 224);
    }
    if (this.overlay) this.drawDeck(ctx);
  }

  tip(ctx, lines, x, y, w) {
    const wr = lines.map((ln, k) => wrap(ctx, ln, w - 16, k === 0 ? 14 : 12));
    const h = 14 + wr.reduce((a, l) => a + l.length, 0) * 17;
    panel(ctx, x, y, w, h, 'rgba(10,16,12,0.95)', 'rgba(255,255,255,0.3)');
    let yy = y + 15;
    wr.forEach((ls, k) => ls.forEach(l => { text(ctx, l, x + 8, yy, { size: k === 0 ? 14 : 12, align: 'left', weight: k === 0 ? 800 : 500, color: k === 0 ? GOLD : '#fff', outline: null }); yy += 17; }));
    return h;
  }

  drawGate(ctx) {
    const y = (this.stepY(this.trip.map.gateAfter) + this.stepY(this.trip.map.gateAfter + 1)) / 2;
    const passed = this.trip.gateChosen;
    // 青苔石门横界线：一条贯穿全图的虚线，左边立一座小石门，门名写在左边的刻度栏里
    ctx.save();
    ctx.strokeStyle = passed ? 'rgba(160,220,150,0.5)' : 'rgba(170,230,160,0.9)'; ctx.lineWidth = 3; ctx.setLineDash([14, 8]);
    ctx.beginPath(); ctx.moveTo(100, y); ctx.lineTo(786, y); ctx.stroke(); ctx.setLineDash([]);
    for (const px of [158, 224]) {
      ctx.fillStyle = '#4a5855'; ctx.fillRect(px - 8, y - 24, 16, 40);
      ctx.fillStyle = '#5a8756'; ctx.fillRect(px - 8, y - 24, 16, 7); ctx.fillRect(px - 8, y + 6, 7, 10);
      ctx.strokeStyle = '#1a2422'; ctx.lineWidth = 2; ctx.strokeRect(px - 8, y - 24, 16, 40);
    }
    ctx.fillStyle = '#566663'; ctx.fillRect(146, y - 30, 90, 10); ctx.fillStyle = '#5a8756'; ctx.fillRect(150, y - 30, 30, 4);
    ctx.strokeStyle = '#1a2422'; ctx.lineWidth = 2; ctx.strokeRect(146, y - 30, 90, 10);
    ctx.restore();
    text(ctx, '青苔界门', 72, y - 8, { size: 15, align: 'left', color: '#c8f0c0', weight: 800 });
    text(ctx, '第 4 步打完在此折返或深入', 72, y + 10, { size: 12, align: 'left', color: '#a8d0a0' });
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
    for (const E of [...edges, ...starts].sort((a, b) => order[a.kind] - order[b.kind] || (a.hl - b.hl))) {
      const { p, kind } = E;
      if (kind === 'dim') { ctx.globalAlpha = 0.3; ctx.strokeStyle = '#8a9a90'; ctx.lineWidth = 2; ctx.setLineDash([3, 6]); strokeBez(ctx, p); }
      else if (kind === 'future') {
        ctx.globalAlpha = E.hl ? 1 : 0.6; ctx.strokeStyle = E.hl ? '#fff2b0' : '#e6efe8'; ctx.lineWidth = E.hl ? 4 : 2.2; ctx.setLineDash(E.hl ? [] : [7, 6]);
        if (E.hl) { ctx.shadowColor = '#ffe27a'; ctx.shadowBlur = 8; }
        strokeBez(ctx, p); ctx.shadowBlur = 0;
      } else if (kind === 'avail') {
        ctx.globalAlpha = 1; ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 3.4; ctx.setLineDash([9, 7]); ctx.lineDashOffset = -t * 36;
        strokeBez(ctx, p); ctx.lineDashOffset = 0; ctx.setLineDash([]);
        for (let k = 0; k < 3; k++) {                 // 向前流动的箭头
          const q = bezPoint(p, (t * 0.45 + k / 3) % 1);
          ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.a); ctx.fillStyle = '#fff2b0'; ctx.globalAlpha = 0.95;
          ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -5); ctx.lineTo(-1, 0); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill(); ctx.restore();
        }
      } else if (kind === 'walked') {
        ctx.globalAlpha = 1; ctx.strokeStyle = '#f2b93a'; ctx.lineWidth = 5.5; ctx.setLineDash([]); ctx.shadowColor = '#ffd24a'; ctx.shadowBlur = 6; strokeBez(ctx, p); ctx.shadowBlur = 0;
      }
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  drawStart(ctx, st) {
    const [x, y] = this.startXY();
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(x, y + 6, 22, 7, 0, 0, Math.PI * 2); ctx.fill();
    if (!this.trip.pos) {
      drawActor(ctx, HERO_LOOK, x, y + 8, { t: this.t, scale: 0.55 });
      text(ctx, '出发点', x + 32, y - 6, { size: 13, align: 'left', color: '#ffe9a0' });
    } else {
      text(ctx, '出发点', x, y + 4, { size: 12, align: 'center', color: 'rgba(255,255,255,0.4)' });
    }
  }

  drawNode(ctx, n, st) {
    const [x0, y0] = this.wxy(n), sty = NODE_STYLE[n.type], visited = st.path.has(n.id), isPos = st.pos === n.id;
    const avail = st.avail.has(n.id), dim = !visited && !st.reach.has(n.id);
    const hov = this.hover === n.id;
    const bob = avail ? Math.sin(this.t * 3 + n.col) * 2.5 : 0;
    const x = x0, y = y0 + bob, r = sty.r;
    ctx.save();
    ctx.globalAlpha = dim ? 0.3 : 1;
    if (avail) {                                       // 呼吸脉冲金环
      const k = (this.t * 0.9 + n.col * 0.3) % 1;
      ctx.strokeStyle = `rgba(255,210,74,${0.9 * (1 - k)})`; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y, r + 5 + k * 16, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 3.5; ctx.shadowColor = '#ffd24a'; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(x, y, r + 6 + Math.sin(this.t * 4) * 1.5, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
    }
    if (hov && !dim) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2); ctx.stroke(); }
    // 节点圆底
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = visited ? '#3a3a36' : sty.fill; ctx.fill();
    ctx.lineWidth = n.type === 'boss' || n.type === 'elite' ? 4 : 3; ctx.strokeStyle = visited ? '#8a8a80' : sty.ring; ctx.stroke();
    if (n.type === 'elite' || n.type === 'boss') { ctx.beginPath(); ctx.arc(x, y, r - 5, 0, Math.PI * 2); ctx.lineWidth = 1.5; ctx.strokeStyle = visited ? '#6a6a60' : 'rgba(255,255,255,0.35)'; ctx.stroke(); }
    drawNodeIcon(ctx, n.type, x, y, r * (n.type === 'boss' ? 0.8 : 0.9), visited ? '#9a9a90' : sty.ring);
    if (visited) {                                     // 走过的：灰化打勾
      ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x - 7, y + 1); ctx.lineTo(x - 2, y + 7); ctx.lineTo(x + 8, y - 6); ctx.stroke();
    }
    // 战利品角标：右下角
    if ((n.type === 'battle' || n.type === 'elite') && n.loot) {
      const bx = x + r * 0.78, by = y + r * 0.78;
      drawLootBadge(ctx, n.loot, bx, by, 17);
    }
    ctx.restore();
    // 现在站在这个节点上：主角小头像
    if (isPos) drawActor(ctx, HERO_LOOK, x - r - 20, y + 14, { t: this.t, scale: 0.5 });
  }

  drawRail(ctx) {
    const trip = this.trip;
    // 步数刻度
    for (let s = 1; s <= this.steps; s++) {
      const y = this.stepY(s), cur = trip.step === s, done = trip.step > s;
      ctx.beginPath(); ctx.arc(34, y, 14, 0, Math.PI * 2);
      ctx.fillStyle = cur ? '#f2b93a' : done ? 'rgba(255,210,74,0.25)' : 'rgba(20,30,22,0.8)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = cur ? '#fff2b0' : 'rgba(255,255,255,0.45)'; ctx.stroke();
      text(ctx, String(s), 34, y + 1, { size: 15, align: 'center', color: cur ? '#2a1c08' : '#fff', outline: null, weight: 800 });
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(52, y); ctx.lineTo(XL - 40, y); ctx.stroke();
    }
    text(ctx, '第几步', 34, this.stepY(this.steps) - 38, { size: 12, align: 'center', color: '#cfd8dc' });
    // 生态段名：每段一道竖括号
    for (const sg of trip.map.segments) {
      const y1 = this.stepY(sg.to) - 14, y2 = this.stepY(sg.from) + 14;
      ctx.strokeStyle = 'rgba(190,230,170,0.7)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(64, y1); ctx.lineTo(60, y1); ctx.lineTo(60, y2); ctx.lineTo(64, y2); ctx.stroke();
      text(ctx, sg.name, 72, (y1 + y2) / 2, { size: 14, align: 'left', color: '#d8f0c8', weight: 800 });
      text(ctx, sg.from === sg.to ? `第 ${sg.from} 步` : `第 ${sg.from}~${sg.to} 步`, 72, (y1 + y2) / 2 + 18, { size: 12, align: 'left', color: '#a8c8a0' });
    }
  }

  drawTopBar(ctx) {
    const trip = this.trip, p = trip.player;
    ctx.fillStyle = 'rgba(8,16,10,0.75)'; ctx.fillRect(0, 0, 960, 28);
    drawHearts(ctx, 20, 14, p.hearts, p.maxHearts, 8);
    text(ctx, '落果密林 · 探索路线', 108, 14, { size: 14, color: '#bfe0b0' });
    text(ctx, `金币 ${trip.gold}`, 250, 14, { size: 13, color: GOLD });
    text(ctx, `手牌 N = ${p.handBase}`, 308, 14, { size: 13, color: '#cfd8dc' });
    text(ctx, `攻击 ${p.atk}`, 384, 14, { size: 13, color: '#cfd8dc' });
    p.gems.forEach((g, j) => text(ctx, `${['红', '绿', '蓝'][j]}${g.level}级`, 442 + j * 46, 14, { size: 12, color: ['#ff8a7a', '#7ae07a', '#8aaaff'][j] }));
    this.sealHits = [];
    p.seals.forEach((id, k) => {
      const x = 584 + k * 16, y = 6;
      roundRect(ctx, x, y, 15, 15, 3); ctx.fillStyle = LINE_HEX[SEALS[id].line]; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = '#111'; ctx.stroke();
      text(ctx, SEALS[id].name[0], x + 7.5, y + 8, { size: 12, align: 'center', color: '#1a1a14', outline: null, weight: 800 });
      this.sealHits.push({ x, y, w: 15, h: 15, id });
    });
    for (const b of Object.values(this.buttons)) { b.enabled = true; b.draw(ctx); }
    // 提示条
    const going = nextNodes(trip).length > 0;
    if (going) {
      panel(ctx, 150, 34, 640, 24, 'rgba(6,12,8,0.7)', null);
      const a = 0.75 + 0.25 * Math.sin(this.t * 4);
      ctx.save(); ctx.globalAlpha = a;
      text(ctx, trip.pos ? '请选择下一步去向（亮着金环的格子；按住上下拖动、滚轮看全图）' : '请选择从哪里进入密林（亮着金环的两个入口；按住上下拖动、滚轮看全图）', 480, 46, { size: 16, align: 'center', color: '#ffe9a0', weight: 800 });
      ctx.restore();
    }
  }

  // 右边一根细滚动条 + 上下还有路时的提示箭头
  drawScrollbar(ctx) {
    const mc = this.maxCam();
    if (mc <= 0) return;
    const x = 778, y0 = VIEW_TOP + 8, h = VIEW_H - 16;
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; roundRect(ctx, x, y0, 6, h, 3); ctx.fill();
    const th = Math.max(28, h * VIEW_H / this.worldH()), ty = y0 + (h - th) * (this.cam / mc);
    ctx.fillStyle = this.press?.moved ? '#ffd24a' : 'rgba(255,230,150,0.7)'; roundRect(ctx, x, ty, 6, th, 3); ctx.fill();
    const hint = (label, y, up) => {                          // 看不到的那头还有东西
      const a = 0.6 + 0.4 * Math.sin(this.t * 4);
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#ffe9a0';
      ctx.beginPath(); up ? (ctx.moveTo(480 - 7, y + 4), ctx.lineTo(480 + 7, y + 4), ctx.lineTo(480, y - 6)) : (ctx.moveTo(480 - 7, y - 4), ctx.lineTo(480 + 7, y - 4), ctx.lineTo(480, y + 6));
      ctx.closePath(); ctx.fill(); ctx.restore();
      text(ctx, label, 496, y, { size: 12, align: 'left', color: '#ffe9a0' });
    };
    if (this.cam > 4) hint('往上拖还有更深处', VIEW_TOP + 52, true);
    if (this.cam < mc - 4) hint('往下拖回到起点', 534, false);
  }

  drawLegend(ctx) {
    const x = 790, y = 44, w = 164;
    panel(ctx, x, y, w, 330, 'rgba(10,16,12,0.78)');
    text(ctx, '节点图标', x + 10, y + 14, { size: 13, align: 'left', color: GOLD });
    ['battle', 'elite', 'event', 'shop', 'camp', 'boss'].forEach((tp, i) => {
      const cx = x + 22 + (i % 2) * 80, cy = y + 40 + Math.floor(i / 2) * 30;
      const sty = NODE_STYLE[tp];
      ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.fillStyle = sty.fill; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = sty.ring; ctx.stroke();
      drawNodeIcon(ctx, tp, cx, cy, 11, sty.ring);
      text(ctx, TYPE_NAME[tp].replace('林地', ''), cx + 15, cy, { size: 12, align: 'left', outline: null });
    });
    text(ctx, '右下角的战利品', x + 10, y + 142, { size: 13, align: 'left', color: GOLD });
    ['carve', 'seal', 'arcana', 'hand', 'heal', 'attr'].forEach((k, i) => {
      const cy = y + 164 + i * 21;
      drawLootBadge(ctx, k, x + 20, cy, 16);
      text(ctx, LOOT[k].name, x + 36, cy, { size: 12, align: 'left', outline: null });
    });
    text(ctx, '金实线 = 走过的路', x + 10, y + 294, { size: 12, align: 'left', color: '#f2b93a', outline: null });
    text(ctx, '流动箭头 = 现在能走', x + 10, y + 311, { size: 12, align: 'left', color: '#fff2b0', outline: null });
  }

  drawCard(ctx, n, st) {
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
    let x = nx + 40; if (x + w > 780) x = nx - 40 - w;
    let y = Math.max(VIEW_TOP + 6, Math.min(540 - h - 6, ny - h / 2));
    panel(ctx, x, y, w, h, 'rgba(10,16,12,0.96)', 'rgba(255,255,255,0.35)');
    let yy = y + 15;
    for (const l of wr) {
      text(ctx, l.s, x + 8, yy, { size: l.k === 0 ? 15 : 12, align: 'left', weight: l.k === 0 ? 800 : 500, color: l.c || (l.k === 0 ? GOLD : '#fff'), outline: null });
      yy += 17;
    }
  }

  drawDeck(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, 960, 540);
    panel(ctx, 150, 36, 660, 470, 'rgba(14,22,16,0.97)', 'rgba(255,255,255,0.3)');
    text(ctx, '我的牌组（点任意处关闭）', 480, 56, { size: 16, align: 'center', color: GOLD });
    const items = this.gridItems = layoutDeckGrid(this.trip.deckCards, 190, 78);
    drawDeckGrid(ctx, items, 190, 78, { hover: this.hoverCard });
    const c = this.hoverCard;
    if (c) {
      const lines = c.arcana ? [ARCANA[c.arcana].name, ARCANA[c.arcana].text] : c.junk ? [JUNK.name, JUNK.text]
        : [`${['红', '黄', '绿', '青', '蓝', '紫', '白'][c.color]}牌`, ...(c.carve || []).map(k => `${CARVES[k].name}：${CARVES[k].text}`)];
      if (lines.length > 1 || c.arcana || c.junk) this.tip(ctx, lines, Math.min(580, (this.mx || 400) + 14), Math.min(400, (this.my || 300) + 14), 220);
    }
    const p = this.trip.player;
    if (p.seals.length) {
      text(ctx, '秘宝印记：' + p.seals.map(id => SEALS[id].name).join('、'), 170, 480, { size: 13, align: 'left', color: '#ffe9a0' });
    }
  }
}

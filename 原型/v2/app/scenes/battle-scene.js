// 战斗场景：上下布局。怪在上，主角在下，手牌一道弧，拖进链尾，施法后链收到左侧竖成一列逐张亮起。
// 规则全在 battle-rules（纯逻辑）；这里只负责摆、画、收输入、把结算事件播成动画。
import {
  createRun, createBattle, queueCard, undoLast, undoAll, previewChain, cast, setTarget, commitVictory, enemyView,
} from '../../modules/battle-rules/index.js';
import { BATTLES, HERO_LOOK, BIOMES } from '../../modules/content/index.js';
import { COLOR_NAMES, CHANNELS, relationOf, REL_TEXT, CONFIG } from '../../modules/shared/index.js';
import { drawActor, ACTOR_SIZE, createEnv } from '../../modules/render/index.js';
import {
  text, panel, wrap, roundRect, drawCard, CARD_W, CARD_H, drawCardBack, drawHpBar, drawShield, drawCountdown, drawHearts,
  drawColorRing, Button, Floaters, handPos, cardHitTest, WHEEL_HEX, GEM_HEX, ART_HEX, REL_HEX, font, GOLD,
} from '../../modules/ui/index.js';

const SLOT_S = 0.72;
const ENEMY_FEET_Y = 205, HERO = { x: 480, y: 308 };
const enemyScale = look => (look === 'slime_jelly' ? 1.5 : 1.4);
const attackText = h => (h >= 1 ? `扣 ${h} 心` : '扣半心');

export class BattleScene {
  constructor() {
    this.t = 0;
    this.floaters = new Floaters();
    this.banners = [];
    this.bolts = [];
    this.cardPos = new Map();
    this.hurt = []; this.fade = [];
    this.hero = { lunge: 0, hurt: 0 };
    this.rainbowGlow = 0; this.waveRing = 0;
    this.buttons = {
      undo: new Button('undo', '退回一张', 0, 0, 100, 28),
      clear: new Button('clear', '清空', 0, 0, 72, 28),
      cast: new Button('cast', '施法（空格）', 0, 0, 124, 28),
      deck: new Button('deck', '查看牌组', 842, 1, 64, 24),
      restart: new Button('restart', '重开', 910, 1, 44, 24),
    };
    this.buttons.cast.accent = true;
    // 三个按钮横排居中：退回一张 | 清空 | 施法
    this.buttons.undo.x = 324; this.buttons.clear.x = 432; this.buttons.cast.x = 512;
    for (const k of ['undo', 'clear', 'cast']) this.buttons[k].y = 414;
    this.overlayButtons = [];
    this.newRun();
  }

  // ---------- 流程 ----------
  newRun(seed = (Math.random() * 1e6) | 0) {
    this.run = createRun(seed);
    this.startBattle();
  }
  startBattle() {
    const def = BATTLES[this.run.battleIndex];
    this.def = def;
    this.b = createBattle(this.run, def);
    this.env = createEnv(def.biome, this.run.seed + this.run.battleIndex * 7);
    this.play = null; this.vis = null; this.drag = null; this.overlay = null;
    this.hidden = new Set(); this.cardPos.clear();
    this.hurt = this.b.enemies.map(() => ({ shake: 0, flash: 0 }));
    this.atk = this.b.enemies.map(() => 0);
    this.fade = this.b.enemies.map(() => 1);
    this.floaters.items.length = 0; this.bolts.length = 0; this.banners.length = 0;
    this.toast = null;
    this.refresh();
  }
  refresh() { this.prev = previewChain(this.b); }

  enemyX(i) {
    const n = this.b.enemies.length;
    return n === 1 ? 480 : 480 + (i - (n - 1) / 2) * 170;
  }
  view(i) { return this.vis ? this.vis.enemies[i] : enemyView(this.b.enemies[i]); }
  heartsNow() { return this.vis ? this.vis.hearts : this.b.player.hearts; }

  // ---------- 摆位 ----------
  slotCount() { return Math.max(this.b.player.handBase + CONFIG.handCapExtra, this.b.deck.chain.length + (this.drag ? 1 : 0)); }
  slotPos(k) {
    const S = this.slotCount();
    return { x: 480 + (k - (S - 1) / 2) * 54, y: 344, rot: 0, s: SLOT_S };
  }
  columnPos(k, n) {
    const step = Math.min(60, 270 / Math.max(1, n));
    return { x: 40, y: 262 + k * step, rot: 0, s: 0.62 };
  }
  dropZone() {
    const S = this.slotCount(), half = S * 27 + 24;
    return { x: 480 - half, y: 292, w: half * 2, h: 110 };
  }
  targetPos(card, i, n, zone) {
    if (this.drag && this.drag.uid === card.uid) return { x: this.drag.x, y: this.drag.y, rot: 0, s: 1.12 };
    if (zone === 'chain') return this.slotPos(i);
    if (zone === 'column') return this.columnPos(i, n);
    const p = handPos(i, n);
    if (this.hoverHand === card.uid && !this.drag && !this.play) { p.y -= 16; p.s = 1.08; }
    return p;
  }
  visibleCards() {
    const out = [];
    const d = this.b.deck;
    d.hand.forEach((c, i) => { if (!this.hidden.has(c.uid)) out.push({ c, i, n: d.hand.length, zone: 'hand' }); });
    d.chain.forEach((c, i) => out.push({ c, i, n: d.chain.length, zone: 'chain' }));
    if (this.play) this.play.cards.forEach((c, i) => out.push({ c, i, n: this.play.cards.length, zone: 'column' }));
    return out;
  }

  // ---------- 更新 ----------
  update(dt) {
    this.t += dt;
    this.env.update(dt);
    this.floaters.update(dt);
    const k = 1 - Math.exp(-dt * 16);
    for (const v of this.visibleCards()) {
      const tp = this.targetPos(v.c, v.i, v.n, v.zone);
      let p = this.cardPos.get(v.c.uid);
      if (!p) { p = { x: 930, y: 470, rot: 0.4, s: 0.5, a: 0 }; this.cardPos.set(v.c.uid, p); }
      p.x += (tp.x - p.x) * k; p.y += (tp.y - p.y) * k; p.rot += (tp.rot - p.rot) * k; p.s += (tp.s - p.s) * k;
      p.a = Math.min(1, (p.a ?? 0) + dt * 5);
    }
    this.atk = this.atk.map(a => Math.max(0, a - dt * 3));
    this.hurt.forEach(h => { h.shake = Math.max(0, h.shake - dt * 4); h.flash = Math.max(0, h.flash - dt * 5); });
    this.fade.forEach((f, i) => { if (!this.view(i).alive) this.fade[i] = Math.max(0, f - dt * 2.2); });
    this.hero.lunge = Math.max(0, this.hero.lunge - dt * 4.5);
    this.hero.hurt = Math.max(0, this.hero.hurt - dt * 4);
    this.rainbowGlow = Math.max(0, this.rainbowGlow - dt * 0.8);
    this.waveRing = Math.max(0, this.waveRing - dt * 1.6);
    for (const bn of this.banners) bn.t += dt;
    this.banners = this.banners.filter(b => b.t < b.life);
    for (const bo of this.bolts) bo.t += dt;
    this.bolts = this.bolts.filter(b => b.t < b.dur);
    if (this.toast) { this.toast.t -= dt; if (this.toast.t <= 0) this.toast = null; }
    if (this.play) {
      this.play.t += dt;
      const items = this.play.items;
      while (items.length && items[0].at <= this.play.t) items.shift().fn();
      if (!items.length && this.play.t >= this.play.end) this.endPlayback();
    }
    const B = this.buttons, ch = this.b.deck.chain.length;
    B.undo.enabled = !this.play && ch > 0 && this.b.phase === 'player';
    B.clear.enabled = B.undo.enabled;
    B.cast.enabled = !this.play && this.b.phase === 'player';
    B.cast.label = ch ? '施法（空格）' : '过回合（空格）';
    B.deck.enabled = true; B.restart.enabled = true;
  }

  // ---------- 施法与回放 ----------
  doCast() {
    if (this.play || this.b.phase !== 'player' || this.overlay) return;
    this.drag = null;
    const b = this.b;
    this.vis = {
      enemies: b.enemies.map(enemyView), hearts: b.player.hearts,
      ring: { collected: b.color.collected, cursor: b.color.cursor },
      gems: b.player.gems.map(g => ({ ...g })),
    };
    const cards = b.deck.chain.map(c => ({ ...c }));
    const res = cast(b);
    this.play = { t: 0, items: [], cards, end: 0, info: [], lit: -1, castRes: res };
    this.hidden = new Set();
    const events = res.events;
    for (const ev of events) if (ev.type === 'draw') for (const u of ev.uids) this.hidden.add(u);
    this.schedule(events);
    this.refresh();
  }

  at(T, fn) { this.play.items.push({ at: T, fn }); }
  schedule(events) {
    const P = this.play;
    let T = cards0(P) ? 0.5 : 0.15;
    let lastType = '';
    const b = this.b;
    for (const ev of events) {
      switch (ev.type) {
        case 'card': {
          T += lastType === '' ? 0 : 0.1;
          const e = ev;
          this.at(T, () => {
            P.lit = e.i; P.info[e.i] = { mult: e.mult, rel: e.rel };
            this.vis.ring = { collected: e.collected, cursor: e.color };
            this.hero.lunge = 1;
          });
          T += 0.22; break;
        }
        case 'shave': {
          const e = ev; this.at(T, () => { this.vis.enemies[e.enemy] = e.view; this.floaters.add({ x: this.enemyX(e.enemy), y: ENEMY_FEET_Y - 70, text: '盾 −' + e.cells.reduce((a, c) => a + c, 0), color: '#8ff0ff', size: 14, life: 0.8 }); });
          T += 0.06; break;
        }
        case 'break': {
          const e = ev; this.at(T, () => { this.vis.enemies[e.enemy] = e.view; this.banner('破盾！', '#8ff0ff', this.enemyX(e.enemy), ENEMY_FEET_Y - 90, 26); this.hurt[e.enemy].flash = 1; });
          T += 0.3; break;
        }
        case 'resisted': {
          const e = ev; this.at(T, () => this.floaters.add({ x: this.enemyX(e.enemy), y: 150, text: '抵制·减半', color: '#ffb0a0', size: 14, life: 0.9 }));
          break;
        }
        case 'hit': {
          const e = ev, many = e.art === 'white' || e.art === 'rainbow';
          this.at(T, () => this.spawnBolt(e));
          this.at(T + 0.15, () => this.impact(e));
          T += many ? 0.1 : 0.2; break;
        }
        case 'wave': {
          const e = ev; this.at(T, () => { this.waveRing = 1; this.banner('补色合白：全体', '#ffffff', 480, 262); });
          T += 0.3; break;
        }
        case 'rainbow': {
          this.at(T, () => { this.rainbowGlow = 1.6; this.banner('集齐六色：彩虹，全体再打两遍', '#ffd0ff', 480, 262, 26); });
          T += 0.5; break;
        }
        case 'kill': {
          const e = ev; this.at(T + 0.15, () => { this.vis.enemies[e.enemy] = e.view; });
          T += 0.25; break;
        }
        case 'bar': {
          const e = ev; this.at(T + 0.15, () => { this.vis.enemies[e.enemy] = e.view; this.floaters.add({ x: this.enemyX(e.enemy), y: 140, text: '下一条血', color: '#ffb0a0', size: 14 }); });
          T += 0.2; break;
        }
        case 'levelup': {
          const e = ev; this.at(T, () => { this.vis.gems[e.ch].level = e.level; this.vis.gems[e.ch].exp = 0; this.floaters.add({ x: 66, y: 190 + e.ch * 22, text: CHANNELS[e.ch] + '宝石升到 ' + e.level + ' 级', color: GOLD, size: 14, life: 1.6 }); });
          T += 0.2; break;
        }
        case 'tick': {
          const e = ev; this.at(T, () => { this.vis.enemies[e.enemy] = e.view; });
          T += 0.05; break;
        }
        case 'attack': {
          const e = ev;
          T += 0.2;
          this.at(T, () => {
            this.vis.enemies[e.enemy] = e.view; this.vis.hearts = e.heartsAfter;
            this.hero.hurt = 1; this.atk[e.enemy] = 1;
            this.floaters.add({ x: HERO.x, y: HERO.y - 90, text: attackText(e.hearts), color: '#ff6a78', size: 22, life: 1.3 });
          });
          T += 0.5; break;
        }
        case 'draw': {
          const e = ev; this.at(T, () => { for (const u of e.uids) this.hidden.delete(u); });
          T += 0.2; break;
        }
        case 'victory': case 'defeat': break;
      }
      lastType = ev.type;
    }
    P.end = T + 0.35;
    const last = events[events.length - 1];
    P.outcome = last?.type === 'victory' ? 'win' : last?.type === 'defeat' ? 'lose' : null;
  }

  banner(str, color, x, y, size = 28) { this.banners.push({ str, color, x, y, size, t: 0, life: 1.1 }); }
  spawnBolt(e) {
    const to = this.enemyX(e.enemy);
    const n = e.art === 'white' || e.art === 'rainbow' ? 1 : Math.min(5, Math.max(1, Math.round(Math.log2(e.shots + 1))));
    for (let i = 0; i < n; i++) this.bolts.push({ t: -i * 0.03, dur: 0.18, from: { x: HERO.x + 22, y: HERO.y - 62 }, to: { x: to + (i - (n - 1) / 2) * 7, y: ENEMY_FEET_Y - 30 }, color: ART_HEX[e.art], big: e.art === 'rainbow' });
  }
  impact(e) {
    const x = this.enemyX(e.enemy);
    this.vis.enemies[e.enemy] = e.view;
    this.hurt[e.enemy].shake = 0.7; this.hurt[e.enemy].flash = 1;
    const col = ART_HEX[e.art] || '#fff';
    const y0 = ENEMY_FEET_Y - 52;
    if (e.shots <= 4 && e.shots > 0) {
      // 发数少：一发一个数
      let k = 0;
      const crits = e.crits;
      for (let s = 0; s < e.shots; s++) {
        const isCrit = s < crits;
        this.floaters.add({ x: x + (s - (e.shots - 1) / 2) * 24, y: y0 - s * 3, delay: s * 0.05, text: isCrit ? e.perCrit : e.perShot, color: isCrit ? '#ffe35a' : col, size: isCrit ? 24 : 18 });
        k++;
      }
    } else if (e.shots > 4) {
      this.floaters.add({ x: x + (Math.random() - 0.5) * 30, y: y0, text: e.total, color: col, size: Math.min(34, 20 + Math.log10(Math.max(10, e.total)) * 4), life: 1.3 });
      if (e.crits) this.floaters.add({ x: x + 34, y: y0 + 14, delay: 0.08, text: e.crits ? '暴击 ' + e.crits : '', color: '#ffe35a', size: 14, life: 1 });
    }
  }
  endPlayback() {
    const out = this.play.outcome;
    this.play = null; this.vis = null; this.hidden.clear();
    this.refresh();
    if (out === 'win') this.overlay = { kind: 'win' };
    else if (out === 'lose') this.overlay = { kind: 'lose' };
  }

  // ---------- 输入 ----------
  endCursor() { return this.prev.endCursor; }
  handFrames() {
    const ec = this.endCursor();
    return this.b.deck.hand.map(c => relationOf(c.color, ec));
  }
  hitHand(x, y) {
    const hand = this.b.deck.hand;
    for (let i = hand.length - 1; i >= 0; i--) {
      const p = this.cardPos.get(hand[i].uid);
      if (p && !this.hidden.has(hand[i].uid) && cardHitTest(p, x, y)) return i;
    }
    return -1;
  }
  hitEnemy(x, y) {
    for (let i = 0; i < this.b.enemies.length; i++) {
      const v = this.view(i); if (!v.alive) continue;
      const sz = ACTOR_SIZE[this.b.enemies[i].look] || { w: 50, h: 60 }, sc = enemyScale(this.b.enemies[i].look);
      const ex = this.enemyX(i);
      if (Math.abs(x - ex) <= sz.w * sc / 2 + 6 && y >= ENEMY_FEET_Y - sz.h * sc - 6 && y <= ENEMY_FEET_Y + 14) return i;
    }
    return -1;
  }
  pointerMove(x, y) {
    this.mx = x; this.my = y;
    for (const bt of [...Object.values(this.buttons), ...this.overlayButtons]) bt.hover = bt.enabled && bt.hit(x, y);
    if (this.drag) { this.drag.x = x - this.drag.gx; this.drag.y = y - this.drag.gy; return; }
    if (this.play || this.overlay) { this.hoverHand = null; this.hoverEnemy = -1; return; }
    const hi = this.hitHand(x, y);
    this.hoverHand = hi >= 0 ? this.b.deck.hand[hi].uid : null;
    this.hoverEnemy = this.hitEnemy(x, y);
  }
  pointerDown(x, y) {
    this.pointerMove(x, y);
    if (this.overlay) {
      for (const bt of this.overlayButtons) if (bt.hit(x, y)) return this.onButton(bt.id);
      if (this.overlay.kind === 'deck') this.overlay = null;
      return;
    }
    for (const bt of Object.values(this.buttons)) if (bt.enabled && bt.hit(x, y)) return this.onButton(bt.id);
    if (this.play) return;
    const hi = this.hitHand(x, y);
    if (hi >= 0) {
      const c = this.b.deck.hand[hi], p = this.cardPos.get(c.uid);
      this.drag = { uid: c.uid, handIndex: hi, x: p.x, y: p.y, gx: x - p.x, gy: y - p.y };
      return;
    }
    const ei = this.hitEnemy(x, y);
    if (ei >= 0) { setTarget(this.b, ei); this.refresh(); return; }
    // 点到链里的牌：提醒不能拖
    const zone = this.dropZone();
    if (this.b.deck.chain.length && y >= zone.y && y <= zone.y + 90 && x >= zone.x && x <= zone.x + zone.w) {
      this.toast = { str: '链里的牌不能拖动、不能改顺序：放错了点「退回一张」或「清空」', t: 2.4 };
    }
  }
  pointerUp(x, y) {
    if (!this.drag) return;
    const d = this.drag; this.drag = null;
    const zone = this.dropZone();
    const inZone = x >= zone.x && x <= zone.x + zone.w && y >= zone.y - 40 && y <= zone.y + zone.h;
    if (inZone) {
      const idx = this.b.deck.hand.findIndex(c => c.uid === d.uid);
      if (idx >= 0 && queueCard(this.b, idx)) this.refresh();
    }
  }
  onButton(id) {
    const b = this.b;
    if (id === 'undo') { if (undoLast(b)) this.refresh(); }
    else if (id === 'clear') { if (undoAll(b)) this.refresh(); }
    else if (id === 'cast') this.doCast();
    else if (id === 'deck') this.overlay = this.overlay?.kind === 'deck' ? null : { kind: 'deck' };
    else if (id === 'restart' || id === 'again') this.newRun();
    else if (id === 'next') {
      commitVictory(this.run, this.b);
      if (this.run.battleIndex >= BATTLES.length) this.overlay = { kind: 'clear' };
      else this.startBattle();
    }
    else if (id === 'close') this.overlay = null;
  }
  key(k) {
    if (k === ' ' || k === 'Enter') { if (this.overlay?.kind === 'win') this.onButton('next'); else this.doCast(); }
    else if (k === 'Backspace' || k === 'z') { if (!this.play && undoLast(this.b)) this.refresh(); }
    else if (k === 'Escape') { if (this.overlay?.kind === 'deck') this.overlay = null; else if (!this.play && undoAll(this.b)) this.refresh(); }
  }

  // ---------- 绘制 ----------
  draw(ctx) {
    const b = this.b, t = this.t;
    this.env.draw(ctx);
    this.drawTopBar(ctx);
    this.drawEnemies(ctx);
    this.drawHero(ctx);
    this.drawSidePanels(ctx);
    this.drawChainArea(ctx);
    this.drawBolts(ctx);
    this.drawCards(ctx);
    this.floaters.draw(ctx);
    this.drawBanners(ctx);
    if (this.rainbowGlow > 0) this.drawRainbowEdge(ctx);
    if (this.hoverEnemy >= 0 && !this.drag && !this.overlay) this.drawEnemyTip(ctx, this.hoverEnemy);
    if (this.toast) { const w = 520; panel(ctx, 480 - w / 2, 232, w, 28, 'rgba(60,20,16,0.85)'); text(ctx, this.toast.str, 480, 247, { size: 13, align: 'center' }); }
    if (this.overlay) this.drawOverlay(ctx);
    this.overlayButtonsDraw(ctx);
  }

  drawTopBar(ctx) {
    const b = this.b;
    ctx.fillStyle = 'rgba(8,16,10,0.62)'; ctx.fillRect(0, 0, 960, 28);
    drawHearts(ctx, 20, 14, this.heartsNow(), b.player.maxHearts, 8);
    text(ctx, `${this.def.title}／共 ${BATTLES.length} 战`, 108, 14, { size: 14 });
    text(ctx, BIOMES[b.biome].name, 232, 14, { size: 13, color: '#bfe0b0' });
    text(ctx, `第 ${b.turn} 回合`, 316, 14, { size: 13, color: '#cfd8dc' });
    // 抽牌堆各色剩余
    text(ctx, '抽牌堆', 432, 14, { size: 12, color: '#cfd8dc' });
    const cnt = [0, 0, 0, 0, 0, 0, 0];
    b.deck.draw.forEach(c => cnt[c.color]++);
    for (let i = 0; i < 7; i++) {
      const x = 470 + i * 44;
      roundRect(ctx, x, 5, 18, 18, 4); ctx.fillStyle = WHEEL_HEX[i]; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
      text(ctx, String(cnt[i]), x + 22, 14, { size: 12, align: 'left' });
    }
    this.buttons.deck.draw(ctx); this.buttons.restart.draw(ctx);
  }

  drawEnemies(ctx) {
    const b = this.b, t = this.t;
    b.enemies.forEach((e, i) => {
      const v = this.view(i), fade = this.fade[i];
      if (fade <= 0.01) return;
      const x = this.enemyX(i), h = this.hurt[i];
      const sc = enemyScale(e.look);
      const sz = ACTOR_SIZE[e.look] || { w: 50, h: 60 };
      // 选中环
      if (i === b.target && v.alive) {
        ctx.save(); ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 5);
        ctx.beginPath(); ctx.ellipse(x, ENEMY_FEET_Y + 2, sz.w * sc * 0.62, 11, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
      drawActor(ctx, e.look, x, ENEMY_FEET_Y, { t, scale: sc, flash: h.flash, alpha: fade, dx: Math.sin(this.t * 60) * 5 * h.shake, dy: 34 * this.atk[i], seed: i * 1.7 });
      if (!v.alive) return;
      const topY = ENEMY_FEET_Y - sz.h * sc;
      const hpY = topY - 20;
      drawHpBar(ctx, x, hpY, 92, v.hp, v.maxHp, v.bar, v.barsTotal);
      drawShield(ctx, x, hpY + 14, v.shield, v.shieldMax, v.broken);
      drawCountdown(ctx, x - 46, hpY - 30, v.countdown, t);
      text(ctx, e.name, x - 30, hpY - 30, { size: 14, align: 'left' });
      text(ctx, attackText(e.attackHearts), x + 70, hpY - 30, { size: 13, align: 'right', color: e.attackHearts >= 1 ? '#ff9a8a' : '#ffe0a0' });
      if (e.trait === 'resist' && b.resist) {
        const rx = x + sz.w * sc / 2 + 14;
        text(ctx, '本回合抵制', rx, ENEMY_FEET_Y - 78, { size: 12, align: 'left', color: '#d8d8c8' });
        text(ctx, `${COLOR_NAMES[b.resist.now]}（伤减半、不削盾）`, rx, ENEMY_FEET_Y - 62, { size: 13, align: 'left', color: WHEEL_HEX[b.resist.now], weight: 800 });
        text(ctx, `下回合抵制：${COLOR_NAMES[b.resist.next]}`, rx, ENEMY_FEET_Y - 44, { size: 12, align: 'left', color: '#d8d8c8' });
      }
    });
  }

  drawHero(ctx) {
    const h = this.hero;
    drawActor(ctx, HERO_LOOK, HERO.x, HERO.y, { t: this.t, scale: 1.05, dy: -12 * h.lunge, dx: Math.sin(this.t * 70) * 4 * h.hurt, flash: h.hurt * 0.7 });
  }

  drawSidePanels(ctx) {
    // 左：集色环 + 宝石等级
    panel(ctx, 6, 34, 124, 202);
    const ring = this.vis ? this.vis.ring : { collected: this.prev.endCollected, cursor: this.prev.endCursor };
    drawColorRing(ctx, 68, 80, 30, ring.collected, ring.cursor, this.t);
    const gems = this.vis ? this.vis.gems : this.b.player.gems;
    for (let j = 0; j < 3; j++) {
      const y = 158 + j * 25, g = gems[j];
      ctx.beginPath(); ctx.arc(20, y, 7, 0, 6.3); ctx.fillStyle = GEM_HEX[j]; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      text(ctx, `${g.level}级`, 32, y, { size: 13, align: 'left' });
      roundRect(ctx, 66, y - 4, 56, 8, 3); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill();
      roundRect(ctx, 66, y - 4, Math.max(2, 56 * g.exp / CONFIG.gemExpPerLevel), 8, 3); ctx.fillStyle = GEM_HEX[j]; ctx.fill();
    }
    text(ctx, '宝石等级', 68, 226, { size: 12, align: 'center', color: '#cfd8dc' });
    // 右：这一战要验证什么
    panel(ctx, 790, 34, 164, 150);
    text(ctx, `${this.def.title}：${BIOMES[this.b.biome].name}`, 800, 50, { size: 13, color: GOLD, align: 'left' });
    wrap(ctx, this.def.lesson, 144, 12).forEach((ln, i) => text(ctx, ln, 800, 72 + i * 17, { size: 12, align: 'left', weight: 500, outline: null, color: '#f0ece0' }));
  }

  drawChainArea(ctx) {
    const b = this.b, S = this.slotCount();
    for (let k = 0; k < S; k++) {
      const p = this.slotPos(k), filled = k < b.deck.chain.length;
      if (filled) continue;
      const isNext = k === b.deck.chain.length;
      roundRect(ctx, p.x - CARD_W * SLOT_S / 2, p.y - CARD_H * SLOT_S / 2, CARD_W * SLOT_S, CARD_H * SLOT_S, 5);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();
      ctx.setLineDash([5, 4]); ctx.lineWidth = isNext && this.drag ? 3 : 1.5;
      ctx.strokeStyle = isNext && this.drag ? GOLD : 'rgba(255,255,255,0.3)'; ctx.stroke(); ctx.setLineDash([]);
      if (isNext && !this.drag && !b.deck.chain.length) text(ctx, '拖进来', p.x, p.y, { size: 12, align: 'center', color: 'rgba(255,255,255,0.6)', outline: null });
    }
    if (this.drag) { const z = this.dropZone(); roundRect(ctx, z.x, z.y, z.w, z.h - 10, 10); ctx.fillStyle = 'rgba(255,230,120,0.07)'; ctx.fill(); }
    // 每张链牌的接法（框上）与倍率（框下）
    if (!this.play) this.prev.steps.forEach((s, k) => {
      const p = this.slotPos(k);
      text(ctx, REL_TEXT[s.rel], p.x, p.y - CARD_H * SLOT_S / 2 - 8, { size: 12, align: 'center', color: REL_HEX[s.rel] });
      text(ctx, '×' + s.mult, p.x, p.y + CARD_H * SLOT_S / 2 + 11, { size: 14, align: 'center', color: '#fff' });
    });
    // 预览一行
    const pv = this.prev, ch = b.deck.chain.length;
    if (!this.play) {
      let line;
      if (!ch) line = this.b.deck.hand.length ? '把手里的牌拖进链里，按空格施法；不想打的牌留着，下回合先摸 2 张。' : '手里没牌了：点「过回合」。';
      else {
        const parts = [`倍率 ×${pv.mult}`, `预计伤害 ${pv.total}（暴击最高 ${pv.maxTotal}）`];
        if (pv.waves) parts.push(`合白 ${pv.waves} 次`);
        if (pv.rainbow) parts.push('彩虹');
        if (pv.shaved) parts.push(`削盾 ${pv.shaved} 格`);
        if (pv.breaks) parts.push('破盾');
        if (pv.kills) parts.push(`击败 ${pv.kills} 只`);
        line = parts.join('  ·  ');
      }
      text(ctx, line, 480, 403, { size: 14, align: 'center', color: ch ? '#fff6d0' : '#d8e0d0' });
    } else text(ctx, '施法中……', 480, 403, { size: 14, align: 'center', color: '#fff6d0' });
    this.buttons.undo.draw(ctx); this.buttons.clear.draw(ctx); this.buttons.cast.draw(ctx);
    // 施法时左侧竖列的标题
    if (this.play) text(ctx, '施法链', 40, 246, { size: 13, align: 'center', color: GOLD });
  }

  drawCards(ctx) {
    const b = this.b;
    const frames = this.drag || this.hoverHand ? this.handFrames() : null;
    const list = this.visibleCards();
    const order = list.filter(v => v.zone !== 'hand').concat(list.filter(v => v.zone === 'hand'));
    // 悬停与拖动的牌画在最上面
    order.sort((a, c) => (this.drag?.uid === a.c.uid) - (this.drag?.uid === c.c.uid) || (this.hoverHand === a.c.uid) - (this.hoverHand === c.c.uid));
    const resistNow = b.resist && b.enemies[b.target]?.trait === 'resist' ? b.resist.now : -1;
    for (const v of order) {
      const p = this.cardPos.get(v.c.uid); if (!p) continue;
      ctx.save(); ctx.globalAlpha = Math.min(1, p.a ?? 1);
      ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(p.s, p.s);
      const o = {};
      if (v.zone === 'hand' && frames) {
        const idx = b.deck.hand.indexOf(v.c);
        const rel = frames[idx];
        const show = this.drag || this.hoverHand === v.c.uid;
        if (show) {
          if (rel === 'near' || rel === 'comp' || rel === 'wild') o.frame = rel;
          else if (rel === 'break') { o.dim = true; o.frame = 'break'; }
          o.tag = REL_TEXT[rel]; o.tagColor = REL_HEX[rel];
          if (resistNow === v.c.color) { o.tag = '抵制'; o.tagColor = '#ff9a8a'; }
        }
      }
      if (v.zone === 'column') { o.lit = this.play.lit >= v.i; o.dim = this.play.lit < v.i; }
      drawCard(ctx, v.c, o);
      ctx.restore();
      if (v.zone === 'column' && this.play.info[v.i]) {
        const inf = this.play.info[v.i];
        text(ctx, '×' + inf.mult, p.x + 34, p.y - 6, { size: 14, align: 'left', color: '#fff' });
        text(ctx, REL_TEXT[inf.rel], p.x + 34, p.y + 10, { size: 12, align: 'left', color: REL_HEX[inf.rel] });
      }
    }
  }

  drawBolts(ctx) {
    for (const bo of this.bolts) {
      if (bo.t < 0) continue;
      const k = bo.t / bo.dur, x = bo.from.x + (bo.to.x - bo.from.x) * k, y = bo.from.y + (bo.to.y - bo.from.y) * k;
      ctx.save(); ctx.shadowColor = bo.color; ctx.shadowBlur = 14; ctx.fillStyle = bo.color;
      for (let s = 0; s < 4; s++) { const kk = Math.max(0, k - s * 0.06); ctx.globalAlpha = 1 - s * 0.22; ctx.beginPath(); ctx.arc(bo.from.x + (bo.to.x - bo.from.x) * kk, bo.from.y + (bo.to.y - bo.from.y) * kk, (bo.big ? 7 : 4.5) - s, 0, 6.3); ctx.fill(); }
      ctx.restore();
    }
    if (this.waveRing > 0) {
      const k = 1 - this.waveRing;
      ctx.save(); ctx.globalAlpha = this.waveRing * 0.8; ctx.strokeStyle = '#fff'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.ellipse(480, 200, 60 + k * 420, 20 + k * 80, 0, 0, 6.3); ctx.stroke(); ctx.restore();
    }
  }
  drawBanners(ctx) {
    for (const bn of this.banners) {
      const k = bn.t / bn.life; ctx.save(); ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      text(ctx, bn.str, bn.x, bn.y - k * 20, { size: bn.size, align: 'center', color: bn.color, weight: 800 }); ctx.restore();
    }
  }
  drawRainbowEdge(ctx) {
    const a = Math.min(1, this.rainbowGlow);
    ctx.save(); ctx.globalAlpha = a * 0.55;
    const g = ctx.createLinearGradient(0, 0, 960, 0);
    ['#ff5a4a', '#f4c93f', '#52d65a', '#3fbac4', '#5a8cff', '#9254cf'].forEach((c, i) => g.addColorStop(i / 5, c));
    ctx.strokeStyle = g; ctx.lineWidth = 22; ctx.strokeRect(0, 0, 960, 540); ctx.restore();
  }

  drawEnemyTip(ctx, i) {
    const e = this.b.enemies[i], v = this.view(i); if (!v.alive) return;
    const lines = [
      e.name,
      `血条 第 ${v.bar + 1}/${v.barsTotal} 条：${v.hp} / ${v.maxHp}`,
      v.shieldMax.some(c => c) ? '盾：' + v.shield.map((c, j) => (v.shieldMax[j] ? `${CHANNELS[j]}${c}/${v.shieldMax[j]}` : '')).filter(Boolean).join('  ') + (v.broken ? '（已破盾，受伤 ×1.5）' : '（有盾受伤 ×0.75）') : '没有盾',
      `${v.countdown} 回合后出手：${attackText(e.attackHearts)}`,
    ];
    if (e.trait === 'resist') lines.push('每回合抵制一种颜色：该色的牌伤减半、不削盾');
    const w = 270, h = 10 + lines.length * 18 + 6;
    let x = Math.min(950 - w, Math.max(10, this.enemyX(i) + 50)), y = 60;
    panel(ctx, x, y, w, h, 'rgba(10,16,12,0.92)', 'rgba(255,255,255,0.3)');
    lines.forEach((ln, k) => { const lines2 = wrap(ctx, ln, w - 16, 12); text(ctx, lines2[0] + (lines2.length > 1 ? '…' : ''), x + 8, y + 16 + k * 18, { size: k === 0 ? 14 : 12, align: 'left', weight: k === 0 ? 800 : 500, color: k === 0 ? GOLD : '#fff', outline: null }); });
  }

  drawOverlay(ctx) {
    const o = this.overlay;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, 960, 540);
    this.overlayButtons = [];
    const mk = (id, label, x, y, w = 150) => { const bt = new Button(id, label, x, y, w, 34); bt.accent = true; this.overlayButtons.push(bt); return bt; };
    if (o.kind === 'deck') {
      panel(ctx, 230, 70, 500, 400, 'rgba(14,22,16,0.96)', 'rgba(255,255,255,0.3)');
      text(ctx, '牌组（固定 29 张，一趟里不加不删）', 480, 94, { size: 16, color: GOLD, align: 'center' });
      const d = this.b.deck, cnt = k => [0, 1, 2, 3, 4, 5, 6].map(c => k.filter(x => x.color === c).length);
      const draw = cnt(d.draw), dis = cnt(d.discard), hand = cnt([...d.hand, ...d.chain]);
      text(ctx, '色', 270, 124, { size: 13, color: '#cfd8dc', align: 'center' });
      ['合计', '抽牌堆', '弃牌堆', '手里'].forEach((s, i) => text(ctx, s, 380 + i * 90, 124, { size: 13, color: '#cfd8dc', align: 'center' }));
      for (let c = 0; c < 7; c++) {
        const y = 156 + c * 38;
        roundRect(ctx, 252, y - 14, 36, 28, 5); ctx.fillStyle = WHEEL_HEX[c]; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();
        text(ctx, COLOR_NAMES[c], 270, y, { size: 16, align: 'center', color: c === 6 || c === 1 ? '#3a3320' : '#fff', outline: null });
        [draw[c] + dis[c] + hand[c], draw[c], dis[c], hand[c]].forEach((n, i) => text(ctx, String(n), 380 + i * 90, y, { size: 16, align: 'center' }));
      }
      text(ctx, '点任意处关闭', 480, 446, { size: 12, align: 'center', color: '#cfd8dc' });
      return;
    }
    panel(ctx, 280, 150, 400, 240, 'rgba(14,22,16,0.95)', GOLD);
    if (o.kind === 'win') {
      text(ctx, `${this.def.title}胜利`, 480, 188, { size: 28, color: GOLD, align: 'center', weight: 800 });
      drawHearts(ctx, 480 - 40, 232, this.b.player.hearts, this.b.player.maxHearts, 9);
      text(ctx, '心不会自动回满，宝石等级带进下一战', 480, 270, { size: 14, align: 'center' });
      const last = this.run.battleIndex + 1 >= BATTLES.length;
      mk('next', last ? '完成 4 战' : '继续前进', 405, 330);
    } else if (o.kind === 'lose') {
      text(ctx, '心耗尽了', 480, 190, { size: 28, color: '#ff8a8a', align: 'center', weight: 800 });
      text(ctx, `倒在 ${this.def.title}。宝石等级也一起归 1 级。`, 480, 250, { size: 14, align: 'center' });
      mk('again', '重新开始', 405, 330);
    } else if (o.kind === 'clear') {
      text(ctx, '4 场全部打完', 480, 190, { size: 28, color: GOLD, align: 'center', weight: 800 });
      text(ctx, `剩 ${this.run.player.hearts} 颗心 · 宝石等级 红${this.run.player.gems[0].level} 绿${this.run.player.gems[1].level} 蓝${this.run.player.gems[2].level}`, 480, 250, { size: 14, align: 'center' });
      mk('again', '再打一遍', 405, 330);
    }
  }
  overlayButtonsDraw(ctx) { if (this.overlay) for (const b of this.overlayButtons) { if (b.enabled !== false) b.draw(ctx); } else this.overlayButtons = []; }
}
function cards0(P) { return P.cards.length > 0; }

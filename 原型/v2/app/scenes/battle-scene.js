// 战斗场景：上下布局。怪在上，主角在下，手牌一道弧，拖进链尾，施法后链收到左侧竖成一列逐张亮起。
// 规则全在 battle-rules（纯逻辑）；这里只负责摆、画、收输入、把结算事件播成动画。
import {
  createRun, createBattle, queueCard, undoLast, undoAll, previewChain, cast, setTarget, commitVictory, enemyView,
  playInstant, instantCheck, handCap, hasSeal,
} from '../../modules/battle-rules/index.js';
import {
  BATTLES, HERO_LOOK, BIOMES, ARCANA, SEALS, LINES, CARVES, TRAITS, JUNK, LOOT, isInstant, ATTACK_FX,
} from '../../modules/content/index.js';
import { COLOR_NAMES, CHANNELS, relationOf, REL_TEXT, CONFIG, countBits } from '../../modules/shared/index.js';
import { audio } from '../../modules/audio/index.js';
import { recorder } from '../record.js';
import {
  drawActor, ACTOR_SIZE, ENEMY_SCALE, createEnv, poseOf, POSE_PROFILES, ATTACK_T, artMode, flushWorld, drawRing, anchorAt, worldOf,
  setView, vfx3d, camera, ViewInput, BATTLE_TH0, heightToWorld, actDuration,
} from '../../modules/render/index.js';
import {
  text, wrap, roundRect, drawPanel, drawCard, CARD_W, CARD_H, drawChainSlot, drawHpBar, drawShield, drawCountdown, drawHearts, drawCoin,
  drawColorRing, drawGemLevelBar, drawSealIcon, Button, Floaters, handPos, cardHitTest, WHEEL_HEX, ART_HEX, REL_HEX, font, GOLD, drawAttackFx, ATTACK_FX_DUR,
} from '../../modules/ui/index.js';

const SLOT_S = 0.72;
const SLOT_GAP = 58;                               // 链槽中心距
const SLOT_Y = 394;                                // 链槽中心：贴在手牌上方、主角脚下
// 对战纵深拉开：怪的脚底上移、主角脚底下移，中间留出开阔战区给弹道飞（旧值 205 / 308）
const ENEMY_FEET_Y = 180, HERO = { x: 480, y: 336 };
// 首领个子大（约主角的 1.8 倍），脚底放低一点，头才不顶到顶栏
const FEET_OVERRIDE = { tree3_leshy: 210 };
const VIEW_ORIGIN = [480, 258];                    // 世界原点（也是转镜头的中心）落在布局的哪里：怪和主角的正中间
const TOP_H = 32;                                  // 顶栏固定高
const TOP_SAFE = 58;                               // 怪头顶的名字行不许压到顶栏：y 至少 58
// 8 只怪的原生出手动作里，打到主角身上的那一下是第几秒（美术库里写死的时间轴）；特殊技的结算统一取 0.6 秒
const HIT_T = { slime_jelly: 0.56, earth2_barometz: 0.48, goblin_scout: 0.5, fairy_meadow: 0.55, earth6_long_arm: 0.58, earth3_zheng: 0.5, earth1_belly_maw: 0.53, tree3_leshy: 0.65 };
const SPECIAL_T = 0.6;
const FX3_DUR = 1.0;                               // 3D 出手特效的总时长（秒），从出手动作开始算
const clamp01 = k => Math.max(0, Math.min(1, k));
const hitTime = look => (artMode() === 'workshop' ? (HIT_T[look] ?? 0.5) : ATTACK_T.strike);
// 哪些怪的特殊技在「没出手的那个回合」播：花甸灵精每回合换抵制色，摇果长臂猿的集色威压，千丈古树精从第 2 条血起遮牌
const specialOnTick = (look, view) => look === 'fairy_meadow' || look === 'earth6_long_arm' || (look === 'tree3_leshy' && view && view.bar >= 1);
const enemyScale = look => ENEMY_SCALE[look] || 1.4;
const LINE_HEX = { shield: '#8ff0ff', white: '#ffffff', rainbow: '#ffb0f0', hold: '#ffd24a', chain: '#9aff9a' };
const attackText = (h, note = '') => (h >= 1 ? `扣 ${h} 心` : '扣半心') + note;

export class BattleScene {
  // mode: 'tutorial' 第 1 步的 4 场教学仗（?mode=tutorial）；'trip' 一趟里的战斗（由 app/flow.js 驱动）
  constructor({ mode = 'trip' } = {}) {
    this.mode = mode; this.hooks = null; this.node = null;
    this.t = 0;
    this.floaters = new Floaters();
    this.banners = [];
    this.bolts = [];
    this.cardPos = new Map();
    this.hurt = []; this.fade = [];
    this.hero = { lunge: 0, hurt: 0, ward: 0, castT: -1, yaw: Math.PI };
    this.sparks = [];
    this.fx = [];                                  // 怪出手的技能特效
    this.fx3 = [];                                 // 3D 特效（波纹、怪出手）：{ type, kind, t, dur, ... }
    this.viewIn = new ViewInput();                 // 拖动转镜头
    this.anim = []; this.heroAnim = { pulse: -1, hurt: -1 };   // 战斗姿态各自的计时（秒，-1 = 没在放）
    this.rainbowGlow = 0; this.waveRing = 0;
    this.buttons = {
      // 操作按钮在右下侧边，竖排：清空、退回一张、施法。画面中轴线上什么也不摆
      clear: new Button('clear', '清空', 838, 412, 112, 26),
      undo: new Button('undo', '退回一张', 838, 442, 112, 26),
      cast: new Button('cast', '施法（空格）', 838, 476, 112, 36),
      // 顶栏右段：镜头与牌组
      home: new Button('home', '回正 R', 626, 4, 54, 24),
      unlock: new Button('unlock', '解锁 360°', 684, 4, 68, 24),
      deck: new Button('deck', '查看牌组', 842, 4, 64, 24),
      restart: new Button('restart', '重开', 910, 4, 44, 24),
    };
    this.buttons.home.size = this.buttons.unlock.size = this.buttons.deck.size = this.buttons.restart.size = 13;
    this.buttons.cast.accent = true;
    for (const k of ['home', 'unlock', 'deck', 'restart']) this.buttons[k].variant = 'ghost';
    this.slotA = 0;                                // 链槽的浮现程度：拖牌或链里有牌时才亮出来
    this.overlayButtons = [];
    if (mode === 'tutorial') this.newRun();
  }

  // ---------- 流程 ----------
  newRun(seed = (Math.random() * 1e6) | 0) {
    this.run = createRun(seed);
    this.startBattle();
  }
  // 一趟里的战斗：trip 是一趟的存档（跟 createRun 的形状兼容），node 是路线图上的节点，def 是这场仗的定义
  beginTrip(trip, node, def, b, hooks) {
    this.mode = 'trip'; this.run = trip; this.node = node; this.hooks = hooks;
    this.startBattle(def, b);
  }
  startBattle(defIn, bIn) {
    const def = defIn || BATTLES[this.run.battleIndex];
    this.def = def;
    this.b = bIn || createBattle(this.run, def);
    setView({ mode: 'battle', th0: BATTLE_TH0, origin: VIEW_ORIGIN, parallax: true });      // 微斜机位，± 45° 里能转
    this.viewIn.cancel();
    this.env = createEnv(def.biome, this.run.seed + this.run.battleIndex * 7);
    // 背景音乐：强敌和首领战用紧张鼓点，别的战斗用轻快节拍；环境音跟生态走
    this.bossHot = false;
    recorder.beginTurn();                                    // 试玩记录：这一回合开始计思考时间
    audio.scene(this.node?.type === 'elite' || this.node?.type === 'boss' ? 'tense' : 'battle', { biome: def.biome });
    this.tip = null;
    this.play = null; this.vis = null; this.drag = null; this.overlay = null;
    this.hidden = new Set(); this.cardPos.clear();
    this.hurt = this.b.enemies.map(() => ({ shake: 0, flash: 0 }));
    this.anim = this.b.enemies.map(() => ({ attack: -1, hurt: -1, dead: -1, stagger: -1, special: false }));
    this.heroAnim = { pulse: -1, hurt: -1 }; this.fx.length = 0; this.fx3.length = 0;
    this.atk = this.b.enemies.map(() => 0);
    this.fade = this.b.enemies.map(() => 1);
    this.floaters.items.length = 0; this.bolts.length = 0; this.banners.length = 0; this.sparks.length = 0;
    this.hero.castT = -1;
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

  // ---------- 镜头下的位置 ----------
  // 怪和主角站在布局点（th = 0 时的位置）上；转镜头以后他们在屏幕上的位置、血条和飘字挂的位置都从这里取
  enemyFeet(i) { return FEET_OVERRIDE[this.b.enemies[i].look] ?? ENEMY_FEET_Y; }
  eAt(i, h = 0) { const a = anchorAt(this.enemyX(i), this.enemyFeet(i), h); return { x: a[0], y: a[1] }; }
  hAt(h = 0) { const a = anchorAt(HERO.x, HERO.y, h); return { x: a[0], y: a[1] }; }
  enemyWorld(i) { return worldOf(this.enemyX(i), this.enemyFeet(i)); }
  heroWorld() { return worldOf(HERO.x, HERO.y); }
  enemyMid(i) { const e = this.b.enemies[i]; return Math.min(36, (ACTOR_SIZE[e.look]?.h || 60) * enemyScale(e.look) * 0.5); }   // 怪身子中段的高度（布局单位）
  fieldCenter() { const [x, y] = worldOf(VIEW_ORIGIN[0], VIEW_ORIGIN[1]); return [x, y, 6]; }

  // ---------- 摆位 ----------
  slotCount() { return Math.max(handCap(this.b), this.b.deck.chain.length + (this.drag && !isInstant(this.dragCard()) ? 1 : 0)); }
  dragCard() { return this.drag ? this.b.deck.hand.find(c => c.uid === this.drag.uid) : null; }
  slotPos(k) {
    const S = this.slotCount();
    return { x: 480 + (k - (S - 1) / 2) * SLOT_GAP, y: SLOT_Y, rot: 0, s: SLOT_S };
  }
  columnPos(k, n) {
    const step = Math.min(60, 270 / Math.max(1, n));
    return { x: 40, y: 262 + k * step, rot: 0, s: 0.62 };
  }
  dropZone() {
    const S = this.slotCount(), half = S * SLOT_GAP / 2 + 28;
    return { x: 480 - half, y: 350, w: half * 2, h: 96 };
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
    this.hero.ward = Math.max(0, this.hero.ward - dt * 2.5);
    // 主角施法：整段回放里举杖，中段循环（杖顶迸出宝石弹丸）；平时背朝画面、慢慢转向被点中的目标
    this.hero.castT = this.play ? this.hero.castT + dt : -1;
    const adv = (o, key, limit) => { if (o[key] >= 0) { o[key] += dt; if (limit && o[key] > limit) o[key] = -1; } };
    this.anim.forEach((a, i) => {
      const look = this.b.enemies[i].look;
      adv(a, 'attack', (actDuration(look, a.special ? 'battle_special' : 'battle_attack') ?? 0.85) + 0.05);
      adv(a, 'stagger', (actDuration(look, 'battle_stagger') ?? 0.85) + 0.05);
      adv(a, 'hurt', (actDuration(look, 'battle_hurt') ?? 0.4) + 0.05);
      if (!this.view(i).alive && a.dead < 0) a.dead = 0; else if (a.dead >= 0) a.dead = Math.min(5, a.dead + dt);
    });
    // 首领打到第 3 条血：背景音乐提速，叠一层高频紧迫节拍
    if (this.node?.type === 'boss' && !this.bossHot && this.b.enemies.some(e => enemyView(e).bar >= 2)) { this.bossHot = true; audio.intensity(1); }
    adv(this.heroAnim, 'pulse', 0.3); adv(this.heroAnim, 'hurt', 0.4);
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter(f => f.t < ATTACK_FX_DUR);
    for (const f of this.fx3) f.t += dt;
    this.fx3 = this.fx3.filter(f => f.t < f.dur);
    const tx = this.b.enemies[this.b.target] ? this.enemyX(this.b.target) : 480;
    this.hero.yaw += (Math.PI + Math.max(-0.45, Math.min(0.45, (tx - 480) * 0.0016)) - this.hero.yaw) * (1 - Math.exp(-dt * 5));
    for (const s of this.sparks) { s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += s.g * dt; s.rot += s.vr * dt; }
    this.sparks = this.sparks.filter(s => s.t < s.life);
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
    // 链槽只在需要时柔和浮现：开始拖牌、或链里已有牌；平时（没拖牌、链空）完全隐藏
    const wantSlots = !this.play && (this.drag || this.b.deck.chain.length > 0) ? 1 : 0;
    this.slotA += (wantSlots - this.slotA) * (1 - Math.exp(-dt * 12));
    if (Math.abs(wantSlots - this.slotA) < 0.01) this.slotA = wantSlots;
    const B = this.buttons, ch = this.b.deck.chain.length;
    B.undo.enabled = !this.play && ch > 0 && this.b.phase === 'player';
    B.clear.enabled = B.undo.enabled;
    B.cast.enabled = !this.play && this.b.phase === 'player';
    B.cast.label = ch ? '施法（空格）' : '过回合（空格）';
    B.deck.enabled = true; B.restart.enabled = true;
    B.home.enabled = B.unlock.enabled = camera.canRotate;   // 色块模式镜头不转，两个钮不出现
    B.unlock.label = camera.unlocked ? '锁回 ± 45°' : '解锁 360°';
    B.unlock.accent = camera.unlocked;
  }

  // ---------- 施法与回放 ----------
  doCast() {
    if (this.play || this.b.phase !== 'player' || this.overlay) return;
    this.drag = null;
    recorder.endTurn();
    const b = this.b;
    this.vis = {
      enemies: b.enemies.map(enemyView), hearts: b.player.hearts,
      ring: { collected: b.color.collected, cursor: b.color.cursor },
      gems: b.player.gems.map(g => ({ ...g })), ward: b.ward,
    };
    const cards = b.deck.chain.map(c => ({ ...c }));
    const res = cast(b);
    this.play = { t: 0, items: [], cards, end: 0, info: [], lit: -1, castRes: res };
    this.hero.castT = 0;
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
            audio.sfx(e.rel === 'break' ? 'cut' : 'chain', e.i);
            this.vis.ring = { collected: e.collected, cursor: e.color };
            this.hero.lunge = 1; this.heroAnim.pulse = 0;
          });
          T += 0.22; break;
        }
        case 'shave': {
          const e = ev; this.at(T, () => { this.vis.enemies[e.enemy] = e.view; this.floaters.add({ ...this.eAt(e.enemy, 70), text: '盾 −' + e.cells.reduce((a, c) => a + c, 0), color: '#8ff0ff', size: 14, life: 0.8 }); });
          T += 0.06; break;
        }
        case 'break': {
          const e = ev; this.at(T, () => {
            this.vis.enemies[e.enemy] = e.view; const top = this.eAt(e.enemy, 90), mid = this.eAt(e.enemy, 52);
            this.banner('破盾！', '#8ff0ff', top.x, top.y, 26); this.hurt[e.enemy].flash = 1; this.anim[e.enemy].stagger = 0;     // 破盾：硬直
            this.shatter(mid.x, mid.y); audio.sfx('break');
            const [wx, wy] = this.enemyWorld(e.enemy);
            this.fx3.push({ type: 'wave', kind: 'shield_shatter', t: 0, dur: 0.8, center: [wx, wy, heightToWorld(this.enemyMid(e.enemy))] });
          });
          T += 0.3; break;
        }
        case 'resisted': {
          const e = ev; this.at(T, () => this.floaters.add({ ...this.eAt(e.enemy, 55), text: '抵制·减半', color: '#ffb0a0', size: 14, life: 0.9 }));
          break;
        }
        case 'hit': {
          const e = ev, many = e.art === 'white' || e.art === 'rainbow';
          this.at(T, () => this.spawnBolt(e));
          this.at(T + 0.15, () => this.impact(e));
          T += many ? 0.1 : 0.2; break;
        }
        case 'wave': {
          const e = ev; this.at(T, () => { this.waveRing = 1; this.fx3.push({ type: 'wave', kind: 'white_wave', t: 0, dur: 0.9, center: this.fieldCenter() }); this.banner('补色合白：全体', '#ffffff', 480, 262); audio.sfx('white'); });
          T += 0.3; break;
        }
        case 'tide': {
          this.at(T, () => { this.waveRing = 1; this.fx3.push({ type: 'wave', kind: 'white_wave', t: 0, dur: 0.9, center: this.fieldCenter() }); this.banner('碎甲白潮：全体再来一轮', '#8ff0ff', 480, 262, 24); audio.sfx('white'); });
          T += 0.4; break;
        }
        case 'rainbow': {
          this.at(T, () => { this.rainbowGlow = 1.6; this.fx3.push({ type: 'wave', kind: 'rainbow_burst', t: 0, dur: 1.2, center: this.fieldCenter() }); this.banner('集齐六色：彩虹，全体再打两遍', '#ffd0ff', 480, 262, 26); audio.sfx('rainbow'); });
          T += 0.5; break;
        }
        case 'kill': {
          const e = ev; this.at(T + 0.15, () => { this.vis.enemies[e.enemy] = e.view; });
          T += 0.25; break;
        }
        case 'bar': {
          const e = ev; this.at(T + 0.15, () => { this.vis.enemies[e.enemy] = e.view; this.floaters.add({ ...this.eAt(e.enemy, 65), text: '下一条血', color: '#ffb0a0', size: 14 }); });
          T += 0.2; break;
        }
        case 'levelup': {
          const e = ev; this.at(T, () => { this.vis.gems[e.ch].level = e.level; this.vis.gems[e.ch].exp = 0; this.floaters.add({ x: 64, y: 150 + e.ch * 25, text: CHANNELS[e.ch] + '宝石升到 ' + e.level + ' 级', color: GOLD, size: 14, life: 1.6 }); });
          T += 0.2; break;
        }
        case 'tick': {
          // 没出手的回合：有特殊技的怪在这里放特殊技（换抵制色、集色威压、林雾遮牌）
          const e = ev, look = b.enemies[e.enemy].look;
          const sp = artMode() === 'workshop' && actDuration(look, 'battle_special') != null && specialOnTick(look, e.view);
          this.at(T, () => { this.vis.enemies[e.enemy] = e.view; if (sp) { const a = this.anim[e.enemy]; a.attack = 0; a.special = true; } });
          T += sp ? 0.25 : 0.05; break;
        }
        case 'attack': {
          const e = ev, look = b.enemies[e.enemy].look;
          const special = artMode() === 'workshop' && !!e.junk && actDuration(look, 'battle_special') != null;   // 塞废牌的那一下用特殊技
          this.at(T, () => {                                                         // 出手动作开始（工坊模型：原生回合制动作）
            const a = this.anim[e.enemy]; a.attack = 0; a.special = special;
            const kind = ATTACK_FX[look];
            if (kind && !special) {
              const [ex, ey] = this.enemyWorld(e.enemy), [hx, hy] = this.heroWorld();
              this.fx3.push({ type: 'atk', kind, t: 0, dur: FX3_DUR, from: [ex, ey, heightToWorld(this.enemyMid(e.enemy))], to: [hx, hy, heightToWorld(30)] });
            }
          });
          T += special ? SPECIAL_T : hitTime(look);
          this.at(T, () => {                                                         // 打到的那一下
            this.vis.enemies[e.enemy] = e.view; this.vis.hearts = e.heartsAfter;
            this.atk[e.enemy] = 1;
            const kind = ATTACK_FX[look];
            if (kind) this.fx.push({ kind, t: 0, from: this.eAt(e.enemy, 40), to: this.hAt(30) });
            audio.sfx(e.blocked ? 'cut' : 'hurt');
            const hh = this.hAt(90);
            if (e.blocked) {
              this.vis.ward = e.ward; this.hero.ward = 1;
              this.floaters.add({ x: hh.x, y: hh.y, text: '护壁挡下了', color: '#8ff0ff', size: 22, life: 1.3 });
              const [hx, hy] = this.heroWorld();
              this.fx3.push({ type: 'wave', kind: 'ward_block', t: 0, dur: 0.8, center: [hx, hy, heightToWorld(30)] });
            } else {
              this.hero.hurt = 1; this.heroAnim.hurt = 0;
              this.floaters.add({ x: hh.x, y: hh.y, text: attackText(e.hearts), color: '#ff6a78', size: 22, life: 1.3 });
              if (e.junk) this.floaters.add({ x: hh.x, y: hh.y + 24, delay: 0.25, text: '弃牌堆里多了一张缠藤废牌', color: '#b8d890', size: 14, life: 1.6 });
            }
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

  // 命中的小碎屑；破盾时一把青色的碎片
  burst(x, y, color, n = 4) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 50 + Math.random() * 90;
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, g: 260, t: 0, life: 0.35 + Math.random() * 0.2, size: 2 + Math.random() * 2, color, rot: 0, vr: 0, shard: false });
    }
  }
  shatter(x, y) {
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, v = 70 + Math.random() * 150;
      this.sparks.push({ x: x + Math.cos(a) * 14, y: y + Math.sin(a) * 10, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, g: 420, t: 0, life: 0.6 + Math.random() * 0.3, size: 4 + Math.random() * 5, color: i % 3 ? '#8ff0ff' : '#e8fcff', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, shard: true });
    }
  }
  banner(str, color, x, y, size = 28) { this.banners.push({ str, color, x, y, size, t: 0, life: 1.1 }); }
  spawnBolt(e) {
    const to = this.enemyX(e.enemy);
    const n = e.art === 'white' || e.art === 'rainbow' ? 1 : Math.min(5, Math.max(1, Math.round(Math.log2(e.shots + 1))));
    const [hx, hy] = this.heroWorld(), [ex, ey] = this.enemyWorld(e.enemy), zt = heightToWorld(this.enemyMid(e.enemy));
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * 7;                          // 一排弹丸互相错开几个布局单位
      this.bolts.push({
        t: -i * 0.03, dur: 0.18, color: ART_HEX[e.art], art: e.art, big: e.art === 'rainbow',
        from3: [hx + 9, hy, heightToWorld(62)], to3: [ex + off / 2.5, ey, zt],                          // 3D：UI-04 的弹道
        from2: [HERO.x + 22, HERO.y, 62], to2: [to + off, this.enemyFeet(e.enemy), 30],                              // 兜底：2D 小圆点
      });
    }
  }
  impact(e) {
    const p = this.eAt(e.enemy, 52), x = p.x;
    this.vis.enemies[e.enemy] = e.view;
    this.hurt[e.enemy].shake = 0.7; this.hurt[e.enemy].flash = 1; this.anim[e.enemy].hurt = 0;
    const col = ART_HEX[e.art] || '#fff';
    const y0 = p.y;
    this.burst(x, y0, col, e.art === 'white' || e.art === 'rainbow' ? 7 : 4);
    audio.sfx('hit', e.shots);
    if (e.shots <= 4 && e.shots > 0) {
      // 发数少：一发一个数
      const crits = e.crits;
      for (let s = 0; s < e.shots; s++) {
        const isCrit = s < crits;
        this.floaters.add({ x: x + (s - (e.shots - 1) / 2) * 24, y: y0 - s * 3, delay: s * 0.05, text: isCrit ? e.perCrit : e.perShot, color: isCrit ? '#ffe35a' : col, size: isCrit ? 24 : 18 });
      }
    } else if (e.shots > 4) {
      this.floaters.add({ x: x + (Math.random() - 0.5) * 30, y: y0, text: e.total, color: col, size: Math.min(34, 20 + Math.log10(Math.max(10, e.total)) * 4), life: 1.3 });
      if (e.crits) this.floaters.add({ x: x + 34, y: y0 + 14, delay: 0.08, text: e.crits ? '暴击 ' + e.crits : '', color: '#ffe35a', size: 14, life: 1 });
    }
  }
  endPlayback() {
    const out = this.play.outcome;
    this.play = null; this.vis = null; this.hidden.clear();
    recorder.beginTurn();
    this.refresh();
    if (out === 'win') { this.overlay = { kind: 'win' }; audio.sfx('reward'); }
    else if (out === 'lose') { this.overlay = { kind: 'lose' }; audio.sfx('hurt'); }
  }

  // ---------- 输入 ----------
  endCursor() { return this.prev.endCursor; }
  handFrames() {
    const ec = this.endCursor();
    return this.b.deck.hand.map(c => (c.color < 0 || c.uid === this.b.maskedUid ? null : relationOf(c.color, ec)));
  }
  hitHand(x, y) {
    const hand = this.b.deck.hand;
    for (let i = hand.length - 1; i >= 0; i--) {
      const p = this.cardPos.get(hand[i].uid);
      if (p && !this.hidden.has(hand[i].uid) && cardHitTest(p, x, y)) return i;
    }
    return -1;
  }
  // 点选范围跟着镜头走：脚底和头顶都用当前镜头下的屏幕位置算
  hitEnemy(x, y) {
    for (let i = 0; i < this.b.enemies.length; i++) {
      const v = this.view(i); if (!v.alive) continue;
      const sz = ACTOR_SIZE[this.b.enemies[i].look] || { w: 50, h: 60 }, sc = enemyScale(this.b.enemies[i].look);
      const foot = this.eAt(i, 0), head = this.eAt(i, sz.h * sc);
      if (Math.abs(x - foot.x) <= sz.w * sc / 2 + 6 && y >= head.y - 6 && y <= foot.y + 14) return i;
    }
    return -1;
  }
  pointerMove(x, y) {
    this.mx = x; this.my = y;
    if (this.viewIn.active) { this.viewIn.move(x); camera.setParallax(0); return; }                  // 正在转镜头
    camera.setParallax(this.drag || this.play ? 0 : (x - 480) / 480);                                 // 没拖牌时叠一点鼠标视差
    for (const bt of [...Object.values(this.buttons), ...this.overlayButtons]) bt.hover = bt.enabled && bt.hit(x, y);
    this.hoverSeal = (this.sealHits || []).find(h => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h)?.id || null;
    const th = this.tagHit; this.hoverTag = !!th && x >= th.x && x <= th.x + th.w && y >= th.y && y <= th.y + th.h;
    if (this.drag) { this.drag.x = x - this.drag.gx; this.drag.y = y - this.drag.gy; return; }
    if (this.play || this.overlay) { this.hoverHand = null; this.hoverEnemy = -1; return; }
    const hi = this.hitHand(x, y);
    this.hoverHand = hi >= 0 ? this.b.deck.hand[hi].uid : null;
    this.hoverEnemy = this.hitEnemy(x, y);
  }
  pointerDown(x, y, btn = 0) {
    this.pointerMove(x, y);
    if (this.overlay) {
      for (const bt of this.overlayButtons) if (bt.hit(x, y)) return this.onButton(bt.id);
      if (this.overlay.kind === 'deck') this.overlay = null;
      return;
    }
    for (const bt of Object.values(this.buttons)) if (bt.enabled && bt.hit(x, y)) return this.onButton(bt.id);
    if (btn === 2) { this.viewIn.down(x, 2); return; }                           // 右键随便拖：转镜头
    if (this.play) { this.viewIn.down(x, 0); return; }
    const hi = this.hitHand(x, y);
    if (hi >= 0) {
      const c = this.b.deck.hand[hi], p = this.cardPos.get(c.uid);
      this.drag = { uid: c.uid, handIndex: hi, x: p.x, y: p.y, gx: x - p.x, gy: y - p.y };
      audio.sfx('card');
      return;
    }
    const ei = this.hitEnemy(x, y);
    if (ei >= 0) { setTarget(this.b, ei); this.refresh(); this.viewIn.down(x, 0); return; }
    // 点到链里的牌：提醒不能拖
    const zone = this.dropZone();
    if (this.b.deck.chain.length && y >= zone.y && y <= zone.y + 90 && x >= zone.x && x <= zone.x + zone.w) {
      this.toast = { str: '链里的牌不能拖动、不能改顺序：放错了点「退回一张」或「清空」', t: 2.4 };
      return;
    }
    this.viewIn.down(x, 0);                                                      // 左键拖空白地面：转镜头
  }
  pointerUp(x, y) {
    if (this.viewIn.active) { this.viewIn.up(); return; }
    if (!this.drag) return;
    const d = this.drag; this.drag = null;
    const zone = this.dropZone();
    const inZone = x >= zone.x && x <= zone.x + zone.w && y >= zone.y - 40 && y <= zone.y + zone.h;
    if (inZone) {
      const idx = this.b.deck.hand.findIndex(c => c.uid === d.uid);
      if (idx < 0) return;
      if (isInstant(this.b.deck.hand[idx])) this.useInstant(idx);
      else if (queueCard(this.b, idx)) {
        this.refresh();
        // 接上一张：链越长音越高；断色：低沉顿一下
        const steps = this.prev.steps, last = steps[steps.length - 1];
        audio.sfx(last && last.rel === 'break' ? 'cut' : 'chain', steps.length - 1);
      }
    } else audio.sfx('card');                                  // 拖回手里
  }
  // 瞬发秘术和废牌：松手立刻生效，不占链位
  useInstant(idx) {
    const b = this.b, c = b.deck.hand[idx];
    const r = playInstant(b, idx);
    if (!r.ok) { this.toast = { str: r.reason, t: 2.2 }; return; }
    audio.sfx('reward');
    for (const ev of r.events) {
      if (ev.type === 'instant') this.banner(ARCANA[ev.id].name, '#ffe9a0', 480, 300, 24);
      else if (ev.type === 'junkDrop') this.floaters.add({ x: 480, y: 330, text: '丢掉了一张废牌', color: '#b8d890', size: 14, life: 1.2 });
      else if (ev.type === 'ward') this.floaters.add({ ...this.hAt(90), text: `护壁 ×${ev.ward}`, color: '#8ff0ff', size: 18, life: 1.4 });
      else if (ev.type === 'surge') this.floaters.add({ ...this.hAt(90), text: '本回合每发 +50%', color: '#ffb04a', size: 18, life: 1.4 });
      else if (ev.type === 'light') this.floaters.add({ x: 68, y: 76, text: '点亮 ' + ev.colors.map(k => COLOR_NAMES[k]).join('、'), color: '#ffe9a0', size: 14, life: 1.4 });
      else if (ev.type === 'shave') { this.hurt[ev.enemy].flash = 0.8; this.floaters.add({ ...this.eAt(ev.enemy, 70), text: '盾 −' + ev.cells.reduce((a, k) => a + k, 0), color: '#8ff0ff', size: 14, life: 0.9 }); }
      else if (ev.type === 'break') {
        const top = this.eAt(ev.enemy, 90), mid = this.eAt(ev.enemy, 52);
        this.banner('破盾！', '#8ff0ff', top.x, top.y, 26); this.shatter(mid.x, mid.y); this.anim[ev.enemy].stagger = 0;
        const [wx, wy] = this.enemyWorld(ev.enemy);
        this.fx3.push({ type: 'wave', kind: 'shield_shatter', t: 0, dur: 0.8, center: [wx, wy, heightToWorld(this.enemyMid(ev.enemy))] });
      }
    }
    this.refresh();
  }
  onButton(id) {
    const b = this.b;
    if (id !== 'cast' && id !== 'undo' && id !== 'clear') audio.sfx('click');
    if (id === 'undo') { if (undoLast(b)) { audio.sfx('card'); recorder.undo(); this.refresh(); } }
    else if (id === 'clear') { if (undoAll(b)) { audio.sfx('card'); recorder.undo(); this.refresh(); } }
    else if (id === 'cast') this.doCast();
    else if (id === 'deck') this.overlay = this.overlay?.kind === 'deck' ? null : { kind: 'deck' };
    else if (id === 'restart') { if (this.hooks) this.hooks.onRestart(); else this.newRun(); }
    else if (id === 'again') { if (this.hooks) this.hooks.onLose(); else this.newRun(); }
    else if (id === 'next') {
      if (this.hooks) { this.hooks.onWin(this.b); return; }
      commitVictory(this.run, this.b);
      if (this.run.battleIndex >= BATTLES.length) this.overlay = { kind: 'clear' };
      else this.startBattle();
    }
    else if (id === 'close') this.overlay = null;
    else if (id === 'home') camera.recenter();
    else if (id === 'unlock') camera.setUnlocked(!camera.unlocked);
  }
  key(k) {
    if (!this.overlay && this.viewIn.key(k)) return;                             // Q / E 转镜头，R 回正
    if (k === ' ' || k === 'Enter') { if (this.overlay?.kind === 'win') this.onButton('next'); else this.doCast(); }
    else if (k === 'Backspace' || k === 'z') { if (!this.play && undoLast(this.b)) { audio.sfx('card'); recorder.undo(); this.refresh(); } }
    else if (k === 'Escape') { if (this.overlay?.kind === 'deck') this.overlay = null; else if (!this.play && undoAll(this.b)) { audio.sfx('card'); recorder.undo(); this.refresh(); } }
  }

  // ---------- 绘制 ----------
  draw(ctx) {
    // 先把世界排好队一次画完（地面、摆件、怪、主角、3D 特效），再在上面画 2D 界面
    this.env.draw(ctx);
    this.queueEnemies(ctx);
    this.queueHero(ctx);
    this.queueFx3d();
    flushWorld(ctx);
    this.drawTopBar(ctx);
    this.drawEnemyUi(ctx);
    this.drawHeroUi(ctx);
    this.drawSidePanels(ctx);
    this.drawChainArea(ctx);
    this.drawBolts(ctx);
    this.drawCards(ctx);
    this.floaters.draw(ctx);
    this.drawBanners(ctx);
    if (this.rainbowGlow > 0) this.drawRainbowEdge(ctx);
    if (this.hoverEnemy >= 0 && !this.drag && !this.overlay) this.drawEnemyTip(ctx, this.hoverEnemy);
    if (this.hoverHand && !this.drag && !this.overlay && !this.play) this.drawCardTip(ctx);
    if (this.hoverSeal && !this.overlay) this.drawSealTip(ctx);
    else if (this.hoverTag && !this.overlay && this.def.lesson) this.tipBox(ctx, [BIOMES[this.b.biome].name, this.def.lesson], 726, 70, 228);
    if (this.toast) { const w = 560; drawPanel(ctx, 480 - w / 2, 222, w, 30, 'tooltip', { accentColor: '#ff9a8a' }); text(ctx, this.toast.str, 480, 238, { size: 13, align: 'center' }); }
    if (this.overlay) this.drawOverlay(ctx);
    this.overlayButtonsDraw(ctx);
  }

  // 顶栏：固定高 32，左中右三段。左：心与金币；中：这一仗、回合、手牌基数、牌堆各色剩余；右：镜头与牌组按钮（音乐音效按钮由 flow 画）
  drawTopBar(ctx) {
    const b = this.b, trip = this.mode === 'trip';
    drawPanel(ctx, 0, 0, 960, TOP_H, 'bar');
    drawHearts(ctx, 20, 16, this.heartsNow(), b.player.maxHearts, 8);
    let x = 20 + b.player.maxHearts * 22.4 + 4;
    if (trip) { drawCoin(ctx, x + 6, 16, 7); text(ctx, String(this.run.gold), x + 18, 16, { size: 13, align: 'left', color: GOLD }); x += 18 + 34; }
    x += 10;
    // 中段：仗名、回合、手牌基数、牌堆各色剩余
    const title = trip ? this.def.title : `${this.def.title}／共 ${BATTLES.length} 战`;
    text(ctx, title, x, 16, { size: 13, align: 'left' });
    ctx.font = font(13, 600);
    x += ctx.measureText(title).width + 14;
    text(ctx, `第 ${b.turn} 回合`, x, 16, { size: 12, align: 'left', color: '#cfd8dc' });
    x += 62;
    text(ctx, `N = ${b.player.handBase}`, x, 16, { size: 12, align: 'left', color: '#cfd8dc' });
    x += 46;
    const cnt = [0, 0, 0, 0, 0, 0, 0];
    let extra = 0;
    b.deck.draw.forEach(c => { if (c.color >= 0 && !c.arcana) cnt[c.color]++; else extra++; });
    text(ctx, '牌堆', x, 16, { size: 12, align: 'left', color: '#cfd8dc' });
    x += 32;
    for (let i = 0; i < 7; i++) {
      const cx = x + i * 26;
      roundRect(ctx, cx, 9, 14, 14, 3); ctx.fillStyle = WHEEL_HEX[i]; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1.5; ctx.stroke();
      text(ctx, String(cnt[i]), cx + 16, 16, { size: 12, align: 'left' });
    }
    if (extra) text(ctx, `+${extra}`, x + 7 * 26, 16, { size: 12, align: 'left', color: '#ffe9a0' });
    for (const k of ['home', 'unlock', 'deck', 'restart']) if (camera.canRotate || (k !== 'home' && k !== 'unlock')) this.buttons[k].draw(ctx);
  }

  // 排进世界队列：选中环、怪。怪的出手、硬直、受击是美术库里的原生回合制动作，这里只告诉它现在该放哪个、放到第几秒。
  enemyAct(look, an) {
    const dur = (act, d) => actDuration(look, act) ?? d;
    if (an.attack >= 0 && an.attack < dur(an.special ? 'battle_special' : 'battle_attack', 0.85)) return [an.special ? 'battle_special' : 'battle_attack', an.attack];
    if (an.stagger >= 0 && an.stagger < dur('battle_stagger', 0.85)) return ['battle_stagger', an.stagger];
    if (an.hurt >= 0 && an.hurt < dur('battle_hurt', 0.35)) return ['battle_hurt', an.hurt];
    return ['idle', undefined];
  }
  queueEnemies(ctx) {
    const b = this.b, t = this.t, work = artMode() === 'workshop';
    const [hx, hy] = this.heroWorld();
    b.enemies.forEach((e, i) => {
      const v = this.view(i), fade = this.fade[i];
      if (fade <= 0.01) return;
      const x = this.enemyX(i), h = this.hurt[i];
      const sc = enemyScale(e.look);
      const sz = ACTOR_SIZE[e.look] || { w: 50, h: 60 };
      // 选中环：世界地面上的一个圆（色块模式画 2D 的）
      if (i === b.target && v.alive) {
        const alpha = 0.7 + 0.3 * Math.sin(t * 5), r = sz.w * sc * 0.62;
        if (!drawRing(x, this.enemyFeet(i) + 2, r, { color: GOLD, alpha, width: 3 })) {
          const f = this.eAt(i, 0);
          ctx.save(); ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.globalAlpha = alpha;
          ctx.beginPath(); ctx.ellipse(f.x, f.y + 2, r, 11, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        }
      }
      const n = b.enemies.length, yaw = n > 1 ? (i < (n - 1) / 2 ? -0.4 : i > (n - 1) / 2 ? 0.4 : 0) : 0;   // 两只并排时各自微微转向中间
      const an = this.anim[i];
      const native = work && actDuration(e.look, 'battle_attack') != null;
      const [act, actT] = native ? this.enemyAct(e.look, an) : [an.attack >= 0 && POSE_PROFILES[e.look]?.native ? POSE_PROFILES[e.look].native : 'idle', undefined];
      drawActor(ctx, e.look, x, this.enemyFeet(i), {
        t, scale: sc, flash: h.flash, alpha: fade, dx: Math.sin(this.t * 60) * 5 * h.shake, dy: work ? 0 : 22 * this.atk[i], seed: i * 1.7, slot: 'e' + i, yaw,
        pose: poseOf(e.look, native ? { dead: an.dead } : an), act, actT, target: [hx, hy, 14],
      });
    });
  }
  // 怪头顶：一排名字 + 意图 + 倒计时印章，下面一根血条、一排色盾。整体缩小一档，贴着头顶，位置跟着镜头走，名字行不压到顶栏（y >= 58）。
  // 抵制 / 集色威压 / 遮牌这类要紧的规则，收成怪身子右边的一小块字签；别的细节等鼠标放上去才显示。
  drawEnemyUi(ctx) {
    const b = this.b, t = this.t;
    b.enemies.forEach((e, i) => {
      const v = this.view(i), fade = this.fade[i];
      if (fade <= 0.01 || !v.alive) return;
      const sc = enemyScale(e.look), sz = ACTOR_SIZE[e.look] || { w: 50, h: 60 };
      const head = this.eAt(i, sz.h * sc), x = head.x;
      const hpY = Math.max(head.y - 28, TOP_SAFE + 24);              // 血条上沿；名字行在它上面 24
      const rowY = hpY - 24;
      const ah = v.attackHearts ?? e.attackHearts, note = attackText(ah, e.attackNote);
      ctx.font = font(12, 700); const nameW = ctx.measureText(e.name).width;
      ctx.font = font(12, 600); const noteW = ctx.measureText(note).width;
      const groupW = 24 + 5 + nameW + 8 + noteW, gx = x - groupW / 2;
      ctx.save(); ctx.translate(gx + 12, rowY); ctx.scale(0.72, 0.72); drawCountdown(ctx, 0, 0, v.countdown, t); ctx.restore();   // 倒计时印章缩小一档
      text(ctx, e.name, gx + 29, rowY, { size: 12, align: 'left', weight: 700 });
      text(ctx, note, gx + 29 + nameW + 8, rowY, { size: 12, align: 'left', color: ah >= 1 ? '#ff9a8a' : '#ffe0a0' });
      drawHpBar(ctx, x, hpY, 84, v.hp, v.maxHp, v.bar, v.barsTotal);
      drawShield(ctx, x, hpY + 15, v.shield, v.shieldMax, v.broken);
      const foot = this.eAt(i, 0), rx = foot.x + sz.w * sc / 2 + 10;
      let tag = null;
      if (e.trait === 'resist' && b.resist) tag = [[`抵制 ${COLOR_NAMES[b.resist.now]}（伤减半、不削盾）`, WHEEL_HEX[b.resist.now]], [`下回合 ${COLOR_NAMES[b.resist.next]}`, '#d8d8c8']];
      else if (e.trait === 'gibbon') {
        const n = countBits(this.vis ? this.vis.ring.collected : this.prev.endCollected), ok = n >= CONFIG.gibbonNeed;
        tag = [[`集色 ${n}/${CONFIG.gibbonNeed}`, ok ? '#9aff9a' : '#ffb0a0'], [ok ? '已满，伤害正常' : '没满：受伤减半', '#d8d8c8']];
      } else if (e.trait === 'canopy' && v.bar >= 1) tag = [['每回合遮住 1 张手牌', '#ffd0a0'], ['只标「已遮蔽」', '#d8d8c8']];
      if (tag) tag.forEach(([str, col], k) => text(ctx, str, rx, foot.y - 56 + k * 16, { size: 12, align: 'left', color: col, weight: k ? 500 : 800 }));
    });
  }

  queueHero(ctx) {
    const h = this.hero, ct = h.castT, casting = ct >= 0;
    drawActor(ctx, HERO_LOOK, HERO.x, HERO.y, {
      t: this.t, scale: 1.05, dy: -12 * h.lunge, dx: Math.sin(this.t * 70) * 4 * h.hurt, flash: h.hurt * 0.7,
      slot: 'battle', yaw: h.yaw, act: casting ? 'cast' : 'idle', actT: casting ? (ct < 1.7 ? ct : 0.65 + ((ct - 1.7) % 1.0)) : undefined,
      pose: poseOf(HERO_LOOK, this.heroAnim),
    });
  }
  drawHeroUi(ctx) {
    const h = this.hero, b = this.b;
    const ward = this.vis ? this.vis.ward : b.ward;
    if (ward > 0 || h.ward > 0) {                         // 护壁：罩在主角身上的一层半透明壳
      const c = this.hAt(40);
      ctx.save(); ctx.globalAlpha = (ward > 0 ? 0.5 : 0.5 * h.ward) + 0.1 * Math.sin(this.t * 4);
      ctx.strokeStyle = '#8ff0ff'; ctx.lineWidth = 3; ctx.fillStyle = 'rgba(140,240,255,0.15)';
      ctx.beginPath(); ctx.ellipse(c.x + 4, c.y, 36, 52, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    // 主角身边的状态说明
    const lines = [];
    if (ward > 0) lines.push([`护壁 ×${ward}：挡下一次攻击`, '#8ff0ff']);
    if (b.buff.surge > 0) lines.push([`魔力沸腾：每发 +${50 * b.buff.surge}%`, '#ffb04a']);
    if (b.startMult > 1 && !this.vis) lines.push([`蓄锋待发：链倍率 ×${b.startMult} 起步`, '#ffd24a']);
    if (b.capExtra > 0) lines.push([`手牌上限 +${b.capExtra}`, '#b0e0ff']);
    const hp = this.hAt(62);
    lines.forEach(([str, col], k) => text(ctx, str, hp.x + 46, hp.y + k * 16, { size: 12, align: 'left', color: col, weight: 800 }));
  }

  // 3D 技能特效排进世界：施法弹道、波纹、怪出手。没有 UI-04 包时由 drawBolts 画 2D 兜底。
  queueFx3d() {
    if (!vfx3d.available()) return;
    for (const f of this.fx3) {
      const k = clamp01(f.t / f.dur);
      if (f.type === 'wave') vfx3d.wave(f.kind, f.center, k);
      else if (f.type === 'atk') vfx3d.attack(f.kind, k, f.from, f.to);
    }
    for (const bo of this.bolts) if (bo.t >= 0) vfx3d.bolt({ from: bo.from3, to: bo.to3, k: bo.t / bo.dur, art: bo.art, big: bo.big });
  }

  // 左：器物式竖条仪表（集色环 + 三条宝石等级）。右上：一张紧凑的生态名签 + 一排印记图标（悬停看详情）。
  drawSidePanels(ctx) {
    drawPanel(ctx, 6, 38, 116, 176, 'wood');
    const ring = this.vis ? this.vis.ring : { collected: this.prev.endCollected, cursor: this.prev.endCursor };
    drawColorRing(ctx, 64, 77, 24, ring.collected, ring.cursor, this.t);            // 环下面自带「集色 n/6」铭牌
    const gems = this.vis ? this.vis.gems : this.b.player.gems;
    for (let j = 0; j < 3; j++) drawGemLevelBar(ctx, 12, 140 + j * 24, 104, j, gems[j].level, gems[j].exp, CONFIG.gemExpPerLevel);
    const trip = this.mode === 'trip';
    const tagName = trip ? BIOMES[this.b.biome].name : `${this.def.title}：${BIOMES[this.b.biome].name}`;
    ctx.font = font(13, 700);
    const tw = Math.max(96, ctx.measureText(tagName).width + 28), tx = 954 - tw;
    drawPanel(ctx, tx, 38, tw, 26, 'wood');
    text(ctx, tagName, tx + tw / 2, 52, { size: 13, align: 'center', color: GOLD, weight: 700 });
    this.tagHit = { x: tx, y: 38, w: tw, h: 26 };
    this.sealHits = [];
    const seals = trip ? this.b.player.seals : [];
    seals.forEach((id, k) => {
      const col = k % 7, row = Math.floor(k / 7), x = 954 - 12 - col * 26, y = 80 + row * 26;
      drawSealIcon(ctx, id, x, y, 22, { t: this.t });
      this.sealHits.push({ x: x - 11, y: y - 11, w: 22, h: 22, id });
    });
  }

  drawChainArea(ctx) {
    const b = this.b, S = this.slotCount();
    // 链槽（含已放进去的牌的底框）：只在拖牌或链里有牌时柔和浮现
    if (this.slotA > 0.02) {
      ctx.save(); ctx.globalAlpha = this.slotA;
      if (this.drag) { const z = this.dropZone(); roundRect(ctx, z.x, z.y, z.w, z.h, 10); ctx.fillStyle = 'rgba(255,230,120,0.07)'; ctx.fill(); }
      for (let k = 0; k < S; k++) {
        const p = this.slotPos(k), filled = k < b.deck.chain.length;
        drawChainSlot(ctx, p.x, p.y, CARD_W * SLOT_S + 10, CARD_H * SLOT_S + 12, { filled, index: k, isNext: k === b.deck.chain.length, dragging: !!this.drag });
      }
      // 每张链牌的接法与倍率，写在槽的正上方一行
      if (!this.play) this.prev.steps.forEach((s, k) => {
        const p = this.slotPos(k);
        text(ctx, `${REL_TEXT[s.rel]} ×${s.mult}`, p.x, p.y - CARD_H * SLOT_S / 2 - 12, { size: 12, align: 'center', color: REL_HEX[s.rel], weight: 700 });
      });
      ctx.restore();
    }
    // 链里有牌时才有一行极简预览：×倍率 · 预计伤害 · 合白 / 彩虹 / 削盾 / 破盾 / 击败
    const pv = this.prev, ch = b.deck.chain.length;
    if (!this.play && ch) {
      const parts = [`×${pv.mult}`, `预计 ${pv.total}`];
      if (pv.waves) parts.push(`合白 ${pv.waves} 次`);
      if (pv.rainbow) parts.push('彩虹');
      if (pv.shaved) parts.push(`削盾 ${pv.shaved} 格`);
      if (pv.breaks) parts.push('破盾');
      if (pv.kills) parts.push(`击败 ${pv.kills} 只`);
      text(ctx, parts.join(' · '), 950, 398, { size: 13, align: 'right', color: '#fff6d0' });
    }
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
      const o = { t: this.t };
      if (v.zone === 'hand' && b.maskedUid === v.c.uid) o.masked = true;
      if (v.zone === 'hand' && frames && !o.masked) {
        const idx = b.deck.hand.indexOf(v.c);
        const rel = frames[idx];
        const show = this.drag || this.hoverHand === v.c.uid;
        if (show && rel) {
          if (rel === 'near' || rel === 'comp' || rel === 'wild') o.frame = rel;
          else if (rel === 'break') { o.dim = true; o.frame = 'break'; }
          o.tag = REL_TEXT[rel]; o.tagColor = REL_HEX[rel];
          if (resistNow === v.c.color) { o.tag = '抵制'; o.tagColor = '#ff9a8a'; }
        } else if (show && !rel) {
          o.tag = v.c.junk ? '拖进来丢掉' : '松手生效'; o.tagColor = '#ffe9a0';
          if (v.c.junk) o.dim = true;
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

  // 2D 部分：碎屑（始终画）；弹道、怪出手、白波纹的 2D 兜底只在没有 UI-04 包时画
  drawBolts(ctx) {
    const flat = !vfx3d.available();
    if (flat) {
      for (const bo of this.bolts) {
        if (bo.t < 0) continue;
        const k = bo.t / bo.dur, f = anchorAt(...bo.from2), to = anchorAt(...bo.to2);
        const lerp = (a, c, q) => a + (c - a) * q;
        ctx.save(); ctx.fillStyle = bo.color;
        for (let s = 0; s < 4; s++) {
          const kk = Math.max(0, k - s * 0.06), r = (bo.big ? 7 : 4.5) - s;
          ctx.globalAlpha = 1 - s * 0.22; ctx.beginPath(); ctx.arc(lerp(f[0], to[0], kk), lerp(f[1], to[1], kk), r, 0, 6.3); ctx.fill();
          ctx.globalAlpha = (1 - s * 0.22) * 0.25; ctx.beginPath(); ctx.arc(lerp(f[0], to[0], kk), lerp(f[1], to[1], kk), r + 4, 0, 6.3); ctx.fill();      // 外圈再淡淡画一层，当作亮边
        }
        ctx.restore();
      }
      for (const f of this.fx) drawAttackFx(ctx, f.kind, f.t, f.from, f.to);
    }
    for (const sp of this.sparks) {
      const k = sp.t / sp.life;
      ctx.save(); ctx.globalAlpha = 1 - k * k; ctx.fillStyle = sp.color; ctx.translate(sp.x, sp.y); ctx.rotate(sp.rot);
      if (sp.shard) { ctx.beginPath(); ctx.moveTo(-sp.size, 0); ctx.lineTo(0, -sp.size * 0.5); ctx.lineTo(sp.size, 0); ctx.lineTo(0, sp.size * 0.8); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1; ctx.stroke(); }
      else ctx.fillRect(-sp.size / 2, -sp.size / 2, sp.size, sp.size);
      ctx.restore();
    }
    if (flat && this.waveRing > 0) {
      const k = 1 - this.waveRing, cy = anchorAt(480, 256, 0)[1] - 56;
      ctx.save(); ctx.globalAlpha = this.waveRing * 0.8; ctx.strokeStyle = '#fff'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.ellipse(480, cy, 60 + k * 420, 20 + k * 80, 0, 0, 6.3); ctx.stroke(); ctx.restore();
    }
  }
  drawBanners(ctx) {
    for (const bn of this.banners) {
      const k = bn.t / bn.life; ctx.save(); ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      text(ctx, bn.str, bn.x, bn.y - k * 20, { size: bn.size, align: 'center', color: bn.color, weight: 800 }); ctx.restore();
    }
  }
  // 集齐六色：画面四周泛起柔和的七彩边晕（几层由宽到窄、越靠边越浓的描边叠出来）
  drawRainbowEdge(ctx) {
    const a = Math.min(1, this.rainbowGlow);
    const g = ctx.createLinearGradient(0, 0, 960, 0);
    ['#ff5a4a', '#f4c93f', '#52d65a', '#3fbac4', '#5a8cff', '#c27af0', '#ff5a4a'].forEach((c, i) => g.addColorStop(i / 6, c));
    ctx.save(); ctx.strokeStyle = g;
    for (const w of [64, 46, 30, 16]) { ctx.globalAlpha = a * 0.16; ctx.lineWidth = w; ctx.strokeRect(0, 0, 960, 540); }
    ctx.restore();
  }

  drawEnemyTip(ctx, i) {
    const e = this.b.enemies[i], v = this.view(i); if (!v.alive) return;
    const lines = [
      e.name,
      `血条 第 ${v.bar + 1}/${v.barsTotal} 条：${v.hp} / ${v.maxHp}`,
      v.shieldMax.some(c => c) ? '盾：' + v.shield.map((c, j) => (v.shieldMax[j] ? `${CHANNELS[j]}${c}/${v.shieldMax[j]}` : '')).filter(Boolean).join('  ') + (v.broken ? `（已破盾，受伤 ×${hasSeal(this.b, 'desperate') ? 2.25 : 1.5}）` : '（有盾受伤 ×0.75）') : '没有盾',
      `${v.countdown} 回合后出手：${attackText(v.attackHearts ?? e.attackHearts, e.attackNote)}`,
    ];
    if (e.trait && TRAITS[e.trait]) lines.push(TRAITS[e.trait]);
    this.tipBox(ctx, lines, Math.min(950 - 270, Math.max(10, this.enemyX(i) + 56)), 60, 270);
  }

  // 悬停说明框：第一行是标题，后面逐行折行显示
  tipBox(ctx, lines, x, y, w, bottomY = null) {
    const wrapped = lines.map((ln, k) => wrap(ctx, ln, w - 16, k === 0 ? 14 : 12));
    const total = wrapped.reduce((a, l) => a + l.length, 0);
    const h = 14 + total * 17;
    if (bottomY !== null) y = bottomY - h;
    drawPanel(ctx, x, y, w, h, 'tooltip');
    let yy = y + 15;
    wrapped.forEach((ls, k) => ls.forEach(l => { text(ctx, l, x + 8, yy, { size: k === 0 ? 14 : 12, align: 'left', weight: k === 0 ? 800 : 500, color: k === 0 ? GOLD : '#fff', outline: null }); yy += 17; }));
  }

  drawCardTip(ctx) {
    const c = this.b.deck.hand.find(x => x.uid === this.hoverHand), p = c && this.cardPos.get(c.uid);
    if (!c || !p) return;
    let lines = null;
    if (this.b.maskedUid === c.uid) lines = ['已遮蔽', '这张牌的颜色被遮住了：靠你记住牌组和已打出的牌来判断'];
    else if (c.junk) lines = [JUNK.name, JUNK.text];
    else if (c.arcana) lines = [ARCANA[c.arcana].name, ARCANA[c.arcana].kind === 'instant' ? '瞬发秘术：拖进链区松手生效，补摸 1 张，不占链位' : '入链秘术：拖进链尾', ARCANA[c.arcana].text];
    else if (c.carve && c.carve.length) lines = [`${COLOR_NAMES[c.color]}牌的宝石雕琢`, ...c.carve.map(k => `${CARVES[k].name}：${CARVES[k].text}`)];
    if (!lines) return;
    const w = 230;
    this.tipBox(ctx, lines, Math.max(8, Math.min(952 - w, p.x - w / 2)), 0, w, 436);
  }
  drawSealTip(ctx) {
    const sd = SEALS[this.hoverSeal];
    if (!sd) return;
    this.tipBox(ctx, [sd.name, LINES[sd.line].name, sd.text], 726, 112, 228);
  }

  drawOverlay(ctx) {
    const o = this.overlay;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, 960, 540);
    this.overlayButtons = [];
    const mk = (id, label, x, y, w = 150) => { const bt = new Button(id, label, x, y, w, 34); bt.accent = true; this.overlayButtons.push(bt); return bt; };
    if (o.kind === 'deck') {
      drawPanel(ctx, 230, 70, 500, 400, 'stone');
      text(ctx, this.mode === 'trip' ? '牌组（29 张宝石牌 + 一趟里拿到的秘术牌和废牌）' : '牌组（固定 29 张，一趟里不加不删）', 480, 94, { size: 16, color: GOLD, align: 'center' });
      const d = this.b.deck, cnt = k => [0, 1, 2, 3, 4, 5, 6].map(c => k.filter(x => x.color === c && !x.arcana && !x.junk).length);
      const draw = cnt(d.draw), dis = cnt(d.discard), hand = cnt([...d.hand, ...d.chain]);
      text(ctx, '色', 270, 124, { size: 13, color: '#cfd8dc', align: 'center' });
      ['合计', '抽牌堆', '弃牌堆', '手里'].forEach((s, i) => text(ctx, s, 380 + i * 90, 124, { size: 13, color: '#cfd8dc', align: 'center' }));
      const other = k => [k.filter(x => x.arcana).length, k.filter(x => x.junk).length];
      const o1 = other(d.draw), o2 = other(d.discard), o3 = other([...d.hand, ...d.chain]);
      if (this.mode === 'trip') ['秘术牌', '缠藤废牌'].forEach((nm, r) => {
        const y = 156 + (7 + r) * 34;
        text(ctx, nm, 270, y, { size: 14, align: 'center', color: '#ffe9a0' });
        [o1[r] + o2[r] + o3[r], o1[r], o2[r], o3[r]].forEach((n, i) => text(ctx, String(n), 380 + i * 90, y, { size: 16, align: 'center' }));
      });
      for (let c = 0; c < 7; c++) {
        const y = 156 + c * (this.mode === 'trip' ? 34 : 38);
        roundRect(ctx, 252, y - 14, 36, 28, 5); ctx.fillStyle = WHEEL_HEX[c]; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();
        text(ctx, COLOR_NAMES[c], 270, y, { size: 16, align: 'center', color: c === 6 || c === 1 ? '#3a3320' : '#fff', outline: null });
        [draw[c] + dis[c] + hand[c], draw[c], dis[c], hand[c]].forEach((n, i) => text(ctx, String(n), 380 + i * 90, y, { size: 16, align: 'center' }));
      }
      text(ctx, '点任意处关闭', 480, 452, { size: 12, align: 'center', color: '#cfd8dc' });
      return;
    }
    drawPanel(ctx, 280, 150, 400, 240, 'wood', { accentColor: GOLD });
    if (o.kind === 'win') {
      text(ctx, `${this.def.title}胜利`, 480, 188, { size: 28, color: GOLD, align: 'center', weight: 800 });
      drawHearts(ctx, 480 - 40, 232, this.b.player.hearts, this.b.player.maxHearts, 9);
      if (this.hooks) {
        const gold = this.node?.type === 'elite' ? 45 : this.node?.type === 'boss' ? 0 : 25;
        text(ctx, gold ? `掉落金币 ${gold}` : '林地首领倒下了', 480, 270, { size: 15, align: 'center', color: GOLD });
        if (this.node?.loot) text(ctx, `战利品：${LOOT[this.node.loot].name}`, 480, 296, { size: 15, align: 'center' });
        mk('next', this.node?.type === 'boss' ? '看结算' : (this.node?.loot ? '去拿战利品' : '继续前进'), 405, 330);
      } else {
        text(ctx, '心不会自动回满，宝石等级带进下一战', 480, 270, { size: 14, align: 'center' });
        const last = this.run.battleIndex + 1 >= BATTLES.length;
        mk('next', last ? '完成 4 战' : '继续前进', 405, 330);
      }
    } else if (o.kind === 'lose') {
      text(ctx, '心耗尽了', 480, 190, { size: 28, color: '#ff8a8a', align: 'center', weight: 800 });
      text(ctx, this.hooks ? `倒在 ${this.def.title}。这一趟的战利品都没带出去。` : `倒在 ${this.def.title}。宝石等级也一起归 1 级。`, 480, 250, { size: 14, align: 'center' });
      mk('again', this.hooks ? '看结算' : '重新开始', 405, 330);
    } else if (o.kind === 'clear') {
      text(ctx, '4 场全部打完', 480, 190, { size: 28, color: GOLD, align: 'center', weight: 800 });
      text(ctx, `剩 ${this.run.player.hearts} 颗心 · 宝石等级 红${this.run.player.gems[0].level} 绿${this.run.player.gems[1].level} 蓝${this.run.player.gems[2].level}`, 480, 250, { size: 14, align: 'center' });
      mk('again', '再打一遍', 405, 330);
    }
  }
  overlayButtonsDraw(ctx) { if (this.overlay) for (const b of this.overlayButtons) { if (b.enabled !== false) b.draw(ctx); } else this.overlayButtons = []; }
}
function cards0(P) { return P.cards.length > 0; }

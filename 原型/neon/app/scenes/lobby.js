// 大厅（用户 2026-11-23 定的，见 给用户挑-画面和加成队友.md D2）：
// 跟旧样片的大厅一样干净：整屏森林，左上大字 code00，下面一列没框的文字按钮。
// 要配置的东西不摆在大厅上：
//   - 开始游戏：右边滑出一块板，挑这一仗（仗、牌组、加成和队友），点「出发」；
//   - 设置：「试玩调整」，测手感用的开关和万发压测都收在这里；
//   - 卡册：牌 / 加成 / 队友三栏。
// 阶段 1 还没有地图，「开始游戏」先直接接挑仗板；以后有了冒险再换成真的出发。
// 只经各模块 index.js 导入，不碰 DOM。

import {
  ALLY_LIST,
  ALL_ENCOUNTERS,
  BUFF_LIST,
  DECK_LOADOUTS,
  DEFAULT_ALLY_IDS,
  DEFAULT_BUFF_IDS,
  DEFAULT_RULES_CONFIG,
  FUNCTION_CARD_LIST,
  GEM_CARD_DEFS,
} from '../../modules/content/index.js';
import { COLOR_META, SEVEN_COLORS } from '../../modules/shared/index.js';
import { session } from '../session.js';
import { F, LANE, T, bold, buffIcon, fnCard, forest, gemCard, stackSprite, txt } from '../../modules/battle-view/index.js';

const W = 960;
const H = 540;
const LOADOUT_IDS = ['all_8_functions', 'starter_4_functions', 'pure_gems'];
const LOADOUT_SHORT = { all_8_functions: '宝石 + 8 种功能牌', starter_4_functions: '宝石 + 4 张常用', pure_gems: '只有宝石' };
const N_VALUES = [4, 5, 6, 8];
const CREAM = '#efe2c4';
const GOLD = '#ffd79a';
const MENU = [
  { id: 'start', label: '试打一仗', y: 272, size: 30 },
  { id: 'album', label: '牌和加成', y: 322, size: 22 },
  { id: 'settings', label: '开关', y: 360, size: 22 },
  { id: 'home', label: '回大厅', y: 398, size: 22 },
];
const PANEL = { x: 392, y: 26, w: 544, h: 488 };
const ROLE_COLOR = { assassin: '#9a78c2', support: '#86d6a6', tank: '#86b4dc', warrior: '#e09a62' };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const inRect = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

/** 按宽度折行（中文一个字一个字量） */
function wrap(r, s, maxW, size) {
  const lines = [];
  let cur = '';
  for (const ch of String(s)) {
    if (r.measureText(cur + ch, { size }).width > maxW && cur) { lines.push(cur); cur = ch; } else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines;
}

export function createLobbyScene(context) {
  let encounterId = 'dual_shield';
  let loadoutIdx = 0;
  let drawTargetIdx = 0;
  let rulesConfig = { ...DEFAULT_RULES_CONFIG, ...(session.rulesConfig || {}) };
  let buffIds = new Set(DEFAULT_BUFF_IDS);
  let allyIds = new Set(DEFAULT_ALLY_IDS);
  let battleCounter = 1;

  let panel = null; // null | 'start' | 'album' | 'settings'
  let panelT = 0; // 板滑出来过了多久
  let albumTab = 'cards';
  let clock = 0;
  let toast = null; // { text, t }
  const pointer = { x: -1, y: -1 };
  let hot = null; // 鼠标下面那个东西的 id
  let boxes = []; // 这一帧能点的：{ id, x, y, w, h, info?, onClick }

  function startBattle(override = {}) {
    battleCounter++;
    session.rulesConfig = { ...rulesConfig };
    context.switchTo('battle', {
      encounterId: override.encounterId || encounterId,
      extraCards: override.extraCards ?? [...DECK_LOADOUTS[LOADOUT_IDS[loadoutIdx]].extraCards],
      drawTarget: override.drawTarget ?? N_VALUES[drawTargetIdx],
      rulesConfig: { ...rulesConfig, ...(override.rulesConfig || {}) },
      seed: override.seed || `play-${encounterId}-${battleCounter}`,
      stressMode: Boolean(override.stressMode),
      buffs: override.buffs ?? BUFF_LIST.map((b) => b.id).filter((id) => buffIds.has(id)),
      allies: override.allies ?? ALLY_LIST.map((a) => a.id).filter((id) => allyIds.has(id)),
    });
  }

  function openPanel(id) {
    if (panel === id) { panel = null; return; }
    panel = id;
    panelT = 0;
  }

  // ───────── 画 ─────────
  function render(r) {
    boxes = [];
    forest(r, W, H);
    // 左边压暗一层，字才看得清
    for (let i = 0; i < 12; i++) r.rect({ x: 0, y: 0, w: 420 - i * 30, h: H, fill: '#05070a', alpha: 0.07 });
    // 空地上站着主角和两个队友，背对着我们看林子
    stackSprite(r, 690, 400, 64, { hue: '#7a6a4e', top: '#e8cfa0', eyes: null, slot: false, alpha: panel ? 0.35 : 1 });
    stackSprite(r, 610, 392, 48, { hue: '#3a3550', top: '#9a78c2', eyes: null, slot: false, alpha: panel ? 0.35 : 1 });
    stackSprite(r, 770, 392, 48, { hue: '#3a3550', top: '#86d6a6', eyes: null, slot: false, alpha: panel ? 0.35 : 1 });

    // 标题
    bold(r, 'code00', 64, 168, { size: 60, color: CREAM, outline: '#0b0d12' });
    txt(r, '试打台 · 只打一仗，测手感', 68, 212, { size: F.s, color: '#a9b7b2' });

    // 菜单：没有框的文字，鼠标放上去变金色
    MENU.forEach((m) => {
      const on = hot === m.id || panel === m.id;
      const x = 68 + (on ? 8 : 0);
      if (on) r.rect({ x: 52, y: m.y - 2, w: 6, h: 6, radius: 1, fill: GOLD });
      bold(r, m.label, x, m.y, { size: m.size, color: on ? GOLD : '#e0dccc', outline: '#0b0d12' });
      boxes.push({ id: m.id, x: 50, y: m.y - m.size * 0.7, w: 230, h: m.size * 1.4, onClick: () => menuClick(m.id) });
    });

    if (toast) {
      const k = (clock - toast.t) / 2.4;
      if (k > 1) toast = null;
      else txt(r, toast.text, 68, 470, { size: F.xs, color: '#a9b7b2', alpha: k < 0.8 ? 1 : (1 - k) / 0.2 });
    }

    if (panel) drawPanel(r);
  }

  function menuClick(id) {
    if (id === 'home') { session.rulesConfig = { ...rulesConfig }; context.switchTo('home'); return; }
    if (id === 'quit') { toast = { text: '原型在浏览器里，关掉这个标签页就退出了', t: clock }; panel = null; return; }
    openPanel(id);
  }

  function drawPanel(r) {
    const k = 1 - (1 - clamp(panelT / 0.22, 0, 1)) ** 3;
    const P = { ...PANEL, x: PANEL.x + (1 - k) * 80 };
    r.withAlpha(k, () => {
      r.rect({ x: P.x, y: P.y, w: P.w, h: P.h, radius: 14, fill: '#0b0e13', alpha: 0.9, stroke: '#2c3446', lineWidth: 1 });
      // 右上角关掉
      const cb = { id: 'close', x: P.x + P.w - 40, y: P.y + 10, w: 30, h: 30 };
      txt(r, '×', cb.x + 15, cb.y + 15, { size: F.xl, align: 'center', color: hot === 'close' ? GOLD : T.text2 });
      boxes.push({ ...cb, onClick: () => { panel = null; } });
      if (panel === 'start') drawStart(r, P);
      else if (panel === 'settings') drawSettings(r, P);
      else if (panel === 'album') drawAlbum(r, P);
    });
  }

  /** 板子底下一行：鼠标放在哪个上面，就说它是什么 */
  function infoLine(r, P, y, fallback) {
    const b = boxes.find((x) => x.id === hot && x.info);
    const s = b ? b.info : fallback;
    wrap(r, s, P.w - 48, F.xs).slice(0, 2).forEach((line, i) => txt(r, line, P.x + 24, y + i * 17, { size: F.xs, color: b ? T.text : T.text3 }));
  }

  function chip(r, b, { on, label, size = F.xs, icon = null }) {
    const h = hot === b.id;
    r.rect({ x: b.x, y: b.y, w: b.w, h: b.h, radius: b.h / 2, fill: on ? '#1d2840' : '#11151d', stroke: on ? GOLD : (h ? '#5a6788' : '#2c3446'), lineWidth: on ? 1.5 : 1 });
    let tx = b.x + 14;
    if (icon) { icon(tx); tx += 24; }
    txt(r, label, tx, b.y + b.h / 2, { size, weight: on ? 'bold' : 'normal', color: on ? CREAM : (h ? T.text : T.text2) });
  }

  function section(r, P, y, s, note = null) {
    txt(r, s, P.x + 24, y, { size: F.xs, weight: 'bold', color: '#a9b7b2' });
    if (note) txt(r, note, P.x + 24 + r.measureText(s, { size: F.xs }).width + 10, y, { size: F.xs, color: T.text3 });
  }

  function drawStart(r, P) {
    bold(r, '挑这一仗', P.x + 24, P.y + 30, { size: F.l, color: CREAM });
    const x0 = P.x + 24;
    const cw = (P.w - 48 - 10) / 2;

    section(r, P, P.y + 62, '打什么');
    ALL_ENCOUNTERS.forEach((enc, i) => {
      const b = { id: `enc-${enc.id}`, x: x0 + (i % 2) * (cw + 10), y: P.y + 74 + Math.floor(i / 2) * 40, w: cw, h: 34 };
      const on = enc.id === encounterId;
      const h = hot === b.id;
      r.rect({ x: b.x, y: b.y, w: b.w, h: b.h, radius: 8, fill: on ? '#1d2840' : '#11151d', stroke: on ? GOLD : (h ? '#5a6788' : '#2c3446'), lineWidth: on ? 1.5 : 1 });
      txt(r, enc.label, b.x + 12, b.y + b.h / 2, { size: F.s, weight: on ? 'bold' : 'normal', color: on ? CREAM : T.text });
      if (!enc.stage1Core) txt(r, '拓展', b.x + b.w - 12, b.y + b.h / 2, { size: 11, align: 'right', color: T.text3 });
      boxes.push({ ...b, info: `${enc.label}：${enc.summary}`, onClick: () => { encounterId = enc.id; } });
    });

    section(r, P, P.y + 248, '牌组');
    const lw = (P.w - 48 - 20) / 3;
    LOADOUT_IDS.forEach((id, i) => {
      const b = { id: `deck-${id}`, x: x0 + i * (lw + 10), y: P.y + 260, w: lw, h: 28 };
      chip(r, b, { on: loadoutIdx === i, label: LOADOUT_SHORT[id] });
      boxes.push({ ...b, info: DECK_LOADOUTS[id].label, onClick: () => { loadoutIdx = i; } });
    });

    section(r, P, P.y + 306, '带上', '加成和队友先照倾向做的，还没拍板');
    // 加成：一排小图标（鼠标放上去看说明，点一下带 / 不带）；队友：一排小牌子
    BUFF_LIST.forEach((d, i) => {
      const b = { id: `take-${d.id}`, x: x0 + i * 37, y: P.y + 318, w: 32, h: 32 };
      const on = buffIds.has(d.id);
      r.withAlpha(on ? 1 : 0.35, () => buffIcon(r, b.x + 2, b.y + 2, { lane: LANE[d.lane] ? d.lane : 'chain', flash: hot === b.id }, 28));
      boxes.push({ ...b, info: `加成${on ? '' : '（没带）'}：${d.label}。${d.description}${d.locked ? '（要解锁）' : ''}`, onClick: () => { if (on) buffIds.delete(d.id); else buffIds.add(d.id); } });
    });
    const aw = (P.w - 48 - 30) / 4;
    ALLY_LIST.forEach((d, i) => {
      const b = { id: `take-${d.id}`, x: x0 + i * (aw + 10), y: P.y + 360, w: aw, h: 28 };
      const on = allyIds.has(d.id);
      chip(r, b, {
        on,
        label: `${d.roleTag} · ${d.label}`,
        icon: (x) => {
          const col = ROLE_COLOR[d.role] || T.text2;
          r.circle({ x: x + 4, y: b.y + b.h / 2, r: 6, fill: on ? col : '#151821', stroke: col, lineWidth: 1.5 });
        },
      });
      boxes.push({ ...b, info: `队友：${d.description}`, onClick: () => { if (on) allyIds.delete(d.id); else allyIds.add(d.id); } });
    });

    // 底下：说明一行 + 出发
    const go = { id: 'go', x: P.x + P.w - 24 - 132, y: P.y + P.h - 58, w: 132, h: 40 };
    r.rect({ x: go.x, y: go.y + 3, w: go.w, h: go.h, radius: 10, fill: '#6b5226' });
    r.rect({ x: go.x, y: go.y, w: go.w, h: go.h, radius: 10, fill: hot === 'go' ? '#f0c87a' : '#d9b264' });
    txt(r, '出发', go.x + go.w / 2, go.y + go.h / 2, { size: F.l, weight: 'bold', align: 'center', color: '#2a1e08' });
    boxes.push({ ...go, onClick: () => startBattle() });
    infoLine(r, { ...P, w: P.w - 170 }, P.y + P.h - 48, '鼠标放到上面看说明');
  }

  function settingRows() {
    return [
      { label: '摸牌', value: ({ draw_floor: '摸 2，不到 N 补到 N（第 4 版）', refill: '补到 N 张（第 3 版）', draw_one: '每回合摸 1 张（第 1 版）' })[rulesConfig.drawMode] || rulesConfig.drawMode, click: () => { const order = ['draw_floor', 'refill', 'draw_one']; rulesConfig.drawMode = order[(order.indexOf(rulesConfig.drawMode) + 1) % order.length]; } },
      { label: '每回合补到几张（N）', value: `${N_VALUES[drawTargetIdx]} 张`, click: () => { drawTargetIdx = (drawTargetIdx + 1) % N_VALUES.length; } },
      { label: '留 1 张不占名额', value: rulesConfig.freeKeepCount > 0 ? '开' : '关', click: () => { rulesConfig.freeKeepCount = rulesConfig.freeKeepCount > 0 ? 0 : 1; } },
      {
        label: '盾的倍数（没破 / 破了）',
        value: `×${rulesConfig.shieldActiveMultiplier} / ×${rulesConfig.shieldBrokenMultiplier}`,
        click: () => {
          const a = rulesConfig.shieldActiveMultiplier === 0.75;
          rulesConfig.shieldActiveMultiplier = a ? 0.5 : 0.75;
          rulesConfig.shieldBrokenMultiplier = a ? 2.0 : 1.5;
        },
      },
      { label: '破盾把倒计时往后推', value: `${rulesConfig.shieldBreakPush} 格`, click: () => { rulesConfig.shieldBreakPush = rulesConfig.shieldBreakPush === 1 ? 2 : 1; } },
      { label: '普通怪的倒计时从几开始', value: String(rulesConfig.initialCountdown), click: () => { rulesConfig.initialCountdown = rulesConfig.initialCountdown === 4 ? 3 : 4; } },
      { label: '「自动排」按钮', value: rulesConfig.allowAutoArrange ? '有' : '没有', click: () => { rulesConfig.allowAutoArrange = !rulesConfig.allowAutoArrange; } },
      { label: '预览写出大概打多少', value: rulesConfig.showExactDamage ? '写' : '不写', click: () => { rulesConfig.showExactDamage = !rulesConfig.showExactDamage; } },
    ];
  }

  function drawSettings(r, P) {
    bold(r, '设置', P.x + 24, P.y + 30, { size: F.l, color: CREAM });
    txt(r, '试玩调整', P.x + 24, P.y + 66, { size: F.s, weight: 'bold', color: GOLD });
    r.rect({ x: P.x + 24, y: P.y + 78, w: 56, h: 2, fill: GOLD });
    settingRows().forEach((row, i) => {
      const y = P.y + 96 + i * 40;
      const b = { id: `set-${i}`, x: P.x + 16, y, w: P.w - 32, h: 34 };
      if (hot === b.id) r.rect({ x: b.x, y: b.y, w: b.w, h: b.h, radius: 8, fill: '#151a25' });
      txt(r, row.label, P.x + 28, y + 17, { size: F.s, color: T.text });
      const vw = r.measureText(row.value, { size: F.s }).width + 28;
      r.rect({ x: P.x + P.w - 28 - vw, y: y + 5, w: vw, h: 24, radius: 12, fill: '#1d2840', stroke: hot === b.id ? GOLD : '#2c3446', lineWidth: 1 });
      txt(r, row.value, P.x + P.w - 28 - vw / 2, y + 17, { size: F.s, weight: 'bold', align: 'center', color: CREAM });
      boxes.push({ ...b, info: '点一下换', onClick: row.click });
    });
    const y = P.y + 96 + 8 * 40 + 8;
    const b = { id: 'stress', x: P.x + 16, y, w: P.w - 32, h: 34 };
    if (hot === b.id) r.rect({ x: b.x, y: b.y, w: b.w, h: b.h, radius: 8, fill: '#151a25' });
    txt(r, '万发飘字压测：满手 12 张，一下打出上万发', P.x + 28, y + 17, { size: F.s, color: T.text });
    txt(r, '去试试 ›', P.x + P.w - 28, y + 17, { size: F.s, weight: 'bold', align: 'right', color: hot === b.id ? GOLD : '#d9b264' });
    boxes.push({ ...b, onClick: () => startBattle({ encounterId: 'dual_shield', drawTarget: 12, stressMode: true, seed: 'stress-ui-demo' }) });
    txt(r, '这些是测手感用的，正式版没有', P.x + 24, P.y + P.h - 26, { size: F.xs, color: T.text3 });
  }

  function drawAlbum(r, P) {
    bold(r, '卡册', P.x + 24, P.y + 30, { size: F.l, color: CREAM });
    const tabs = [['cards', '牌'], ['buffs', '加成'], ['allies', '队友']];
    let tx = P.x + 24;
    tabs.forEach(([id, label]) => {
      const w = r.measureText(label, { size: F.m }).width;
      const b = { id: `tab-${id}`, x: tx - 6, y: P.y + 52, w: w + 12, h: 28 };
      const on = albumTab === id;
      txt(r, label, tx, P.y + 66, { size: F.m, weight: 'bold', color: on ? GOLD : (hot === b.id ? T.text : T.text3) });
      if (on) r.rect({ x: tx, y: P.y + 80, w, h: 2, fill: GOLD });
      boxes.push({ ...b, onClick: () => { albumTab = id; } });
      tx += w + 28;
    });
    const x0 = P.x + 24;
    if (albumTab === 'cards') {
      section(r, P, P.y + 104, '宝石牌', '一副牌 29 张，每局都从这副开始');
      SEVEN_COLORS.forEach((c, i) => {
        const def = GEM_CARD_DEFS[`gem_${c}`];
        const b = { id: `card-${def.defId}`, x: x0 + i * 70, y: P.y + 118, w: 58, h: 80 };
        r.withAlpha(hot === b.id ? 1 : 0.92, () => gemCard(r, { x: b.x, y: b.y - (hot === b.id ? 4 : 0), w: b.w, h: b.h, color: c, gems: def.gems }));
        txt(r, `×${COLOR_META[c].baseDeckCount}`, b.x + b.w / 2, b.y + b.h + 12, { size: F.xs, align: 'center', color: T.text2 });
        boxes.push({ ...b, info: `${def.label}：${def.description}`, onClick: () => {} });
      });
      section(r, P, P.y + 228, '功能牌', '8 种');
      FUNCTION_CARD_LIST.forEach((def, i) => {
        const b = { id: `card-${def.defId}`, x: x0 + (i % 4) * 86, y: P.y + 242 + Math.floor(i / 4) * 114, w: 76, h: 104 };
        r.withAlpha(hot === b.id ? 1 : 0.92, () => fnCard(r, { x: b.x, y: b.y - (hot === b.id ? 4 : 0), w: b.w, h: b.h, text: def.label, color: def.color && def.color !== 'colorless' ? def.color : null, draw: def.drawAfterPlay || 0, instant: def.usage === 'instant' }));
        boxes.push({ ...b, info: `${def.label}：${def.description}`, onClick: () => {} });
      });
      // 右边一块：鼠标放在哪张牌上，就写它干什么
      const ib = { x: x0 + 4 * 86 + 6, y: P.y + 242, w: P.w - 48 - 4 * 86 - 6, h: 218 };
      r.rect({ x: ib.x, y: ib.y, w: ib.w, h: ib.h, radius: 10, fill: '#11151d', stroke: '#2c3446', lineWidth: 1 });
      const hb = boxes.find((x) => x.id === hot && x.info);
      const lines = hb ? wrap(r, hb.info, ib.w - 24, F.s) : ['鼠标放到牌上，', '看它干什么'];
      lines.slice(0, 9).forEach((line, j) => txt(r, line, ib.x + 12, ib.y + 20 + j * 21, { size: F.s, color: hb ? T.text : T.text3 }));
    } else {
      const list = albumTab === 'buffs' ? BUFF_LIST : ALLY_LIST;
      txt(r, '先照倾向做的，还没跟用户拍板', x0, P.y + 104, { size: F.xs, color: T.text3 });
      const cols = albumTab === 'buffs' ? 3 : 2;
      const cw = (P.w - 32 - (cols - 1) * 8) / cols;
      list.forEach((d, i) => {
        const x = x0 - 8 + (i % cols) * (cw + 8);
        const y = P.y + 122 + Math.floor(i / cols) * 70;
        r.rect({ x, y, w: cw, h: 62, radius: 10, fill: '#11151d', stroke: '#2c3446', lineWidth: 1 });
        if (albumTab === 'buffs') buffIcon(r, x + 8, y + 8, { lane: LANE[d.lane] ? d.lane : 'chain' }, 22);
        else {
          const col = ROLE_COLOR[d.role] || T.text2;
          r.circle({ x: x + 19, y: y + 19, r: 11, fill: '#0b0d12', stroke: col, lineWidth: 2 });
          txt(r, d.roleTag || '友', x + 19, y + 19, { size: F.xs, weight: 'bold', align: 'center', color: col });
        }
        txt(r, d.label + (d.locked ? '（锁）' : ''), x + 38, y + 19, { size: F.s, weight: 'bold', color: CREAM });
        wrap(r, d.description, cw - 16, F.xs).slice(0, 2).forEach((line, j) => txt(r, line, x + 8, y + 38 + j * 14, { size: F.xs, color: T.text2 }));
        boxes.push({ id: `album-${d.id}`, x, y, w: cw, h: 62, info: d.description, onClick: () => {} });
      });
    }
  }

  // ───────── 鼠标 ─────────
  function onPointer(event) {
    if (!event) return { cursor: 'default' };
    const { type, x, y } = event;
    if (type === 'leave') { pointer.x = -1; pointer.y = -1; hot = null; return { cursor: 'default' }; }
    pointer.x = x; pointer.y = y;
    // 后放进去的在上面
    const hit = [...boxes].reverse().find((b) => inRect(b, x, y));
    hot = hit?.id || null;
    if (type === 'up') {
      if (hit) { hit.onClick(); session.rulesConfig = { ...rulesConfig }; } // 开关改了，出发也照着用
      else if (panel && !inRect(PANEL, x, y) && x > 300) panel = null; // 点板子外面的空地：收起来
    }
    return { cursor: hit ? 'pointer' : 'default' };
  }

  return {
    getSelectedEncounterId: () => encounterId,
    getRulesConfig: () => ({ ...rulesConfig }),
    getPanel: () => panel,
    /** 测试用：现在能点的东西 */
    getHitBoxes: () => boxes.map(({ onClick, ...b }) => b),

    onEnter(payload) {
      if (payload?.encounterId) encounterId = payload.encounterId;
      if (payload?.rulesConfig) rulesConfig = { ...rulesConfig, ...payload.rulesConfig };
      if (Array.isArray(payload?.buffs)) buffIds = new Set(payload.buffs);
      if (Array.isArray(payload?.allies)) allyIds = new Set(payload.allies);
      panel = null;
    },

    onUpdate(dt) {
      clock += dt;
      panelT += dt;
    },

    onPointer,

    onRender(renderer) {
      render(renderer);
    },
  };
}

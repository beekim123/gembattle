// 大厅场景（阶段 3）：hub 只摆入口；点了哪个入口，就把工会 / 招募 / 出发 / 卡册的板画在右边。
// 各模块只交回「要改什么」（新存档），这里交给 save 统一写。出发时拼出发包，换到走一趟的场景。

import { createHubView, HUB_PANEL } from '../../modules/hub/index.js';
import { createGuildView, refreshBoard, takeQuest, abandonQuest, submitQuest, submitAll, buyGear, submittableCount } from '../../modules/guild/index.js';
import { createRecruitView, hireAlly, refundAlly } from '../../modules/recruit/index.js';
import { createDepartView, cycleGear, buildDepartPacket } from '../../modules/depart/index.js';
import { createAlbumView } from '../../modules/album/index.js';
import {
  ALLY_DEFS, ALL_CARD_DEFS, BUFF_LIST, ENCOUNTERS, FREE_GEAR, GEAR_DEFS, GEAR_LIST, HIDDEN_QUEST, QUEST_BOARD, QUEST_DEFS, ZONES, buildHeroLoadout,
} from '../../modules/content/index.js';
import { F, T, inRect, panelButton, txt, wrapText } from '../../modules/ui/index.js';
import { COLOR_META } from '../../modules/shared/index.js';
import { session } from '../session.js';

const ENTRIES = [
  { id: 'depart', label: '出发' },
  { id: 'guild', label: '工会' },
  { id: 'recruit', label: '招募' },
  { id: 'album', label: '卡册' },
  { id: 'settings', label: '设置' },
  { id: 'quit', label: '退出' },
];

const GUILD_CONTENT = { quests: QUEST_DEFS, board: QUEST_BOARD, rankQuestId: 'q_rank_b', hiddenQuest: HIDDEN_QUEST, gear: GEAR_DEFS };
const ALL_QUESTS = { ...QUEST_DEFS, [HIDDEN_QUEST.id]: HIDDEN_QUEST };

function albumData() {
  const monsters = [];
  const seen = new Set();
  for (const enc of Object.values(ENCOUNTERS)) {
    for (const m of enc.monsters) {
      if (seen.has(m.defId)) continue;
      seen.add(m.defId);
      const bars = m.bars.length;
      const shields = m.bars[0].shields.map((s) => `${COLOR_META[s.color]?.label || s.color} ${s.max} 格`).join('、') || '没有盾';
      const traits = m.bars.flatMap((b) => b.traits.map((t) => t.label)).join('；') || '没有特性';
      monsters.push({ defId: m.defId, look: m.look, label: m.label, tier: m.tier, info: `${bars} 条血 · 盾：${shields} · ${traits}` });
    }
  }
  const cards = Object.values(ALL_CARD_DEFS).filter((c) => c.kind !== 'junk').map((c) => ({ id: c.defId, label: c.label, description: c.description, kind: c.kind, color: c.color, gems: c.gems }));
  return { cards, buffs: BUFF_LIST, allies: Object.values(ALLY_DEFS), monsters, gear: GEAR_LIST };
}

/** 装备算主角属性：武器空着就借工会的基础武器 */
export function loadoutFor(save) {
  const eq = save.gear.equipped;
  return buildHeroLoadout({ weapon: eq.weapon || FREE_GEAR.weapon, armor: eq.armor, trinket: eq.trinket });
}

export function createHubScene(context) {
  const store = session.saveStore;
  let save = null;
  let active = null;
  let panelT = 0;
  let toast = null; // { lines, t }
  let clock = 0;
  let settingsHot = null;
  let settingsBoxes = [];
  let resetArmed = false;

  const hub = createHubView({ entries: ENTRIES, callbacks: { onSelect: select } });
  const guild = createGuildView({
    callbacks: {
      onTake: (id) => apply((s) => takeQuest(s, id, GUILD_CONTENT)),
      onAbandon: (id) => apply((s) => abandonQuest(s, id)),
      onSubmit: (id) => apply((s) => submitQuest(s, id, GUILD_CONTENT)),
      onSubmitAll: () => apply((s) => submitAll(s, GUILD_CONTENT)),
      onBuy: (id) => apply((s) => buyGear(s, id, GUILD_CONTENT)),
    },
  });
  const recruit = createRecruitView({
    callbacks: {
      onHire: (id) => apply((s) => hireAlly(s, id, ALLY_DEFS)),
      onRefund: (id) => apply((s) => refundAlly(s, id, ALLY_DEFS)),
    },
  });
  const depart = createDepartView({
    callbacks: {
      onCycle: (slot, dir) => apply((s) => cycleGear(s, slot, dir, GEAR_DEFS)),
      onGo: go,
    },
  });
  const album = createAlbumView();
  const ALBUM_DATA = albumData();

  /** 模块交回 { save, ok, msg }：写进存档，冒一句话 */
  function apply(change) {
    let out = null;
    save = store.apply((s) => {
      out = change(s);
      return out.save;
    });
    save = store.replace(refreshBoard(save, GUILD_CONTENT));
    if (out?.msg) toast = { lines: String(out.msg).split('\n'), t: clock, bad: !out.ok };
    sync();
  }

  function select(id) {
    if (id === 'quit') { toast = { lines: ['原型在浏览器里，关掉这个标签页就退出了'], t: clock }; active = null; sync(); return; }
    active = active === id ? null : id;
    panelT = 0;
    resetArmed = false;
    sync();
  }

  function go() {
    session.save = save;
    session.onSettled = (next) => { store.replace(refreshBoard(next, GUILD_CONTENT)); };
    session.runCounter = (session.runCounter || 0) + 1;
    const packet = buildDepartPacket(save, {
      loadout: loadoutFor(save),
      quests: ALL_QUESTS,
      seed: `run-${save.runs + 1}-${session.runCounter}-${Math.floor(clock * 1000) % 100000}`,
      rulesConfig: session.rulesConfig || {},
    });
    context.switchTo('run', { depart: packet });
  }

  function sync() {
    hub.setState({
      gold: save.gold,
      rank: save.rank,
      badges: { guild: submittableCount(save) || null },
      allies: save.hired.map((id) => ALLY_DEFS[id]?.role).filter(Boolean),
      active,
      subtitle: '原型 · 阶段 3',
      note: toast ? '' : save.lastRun ? `上一趟：${save.lastRun.outcome === 'returned' ? '活着回来' : '死在林子里'}，带回 ${save.lastRun.gold} 金币 · 一共走了 ${save.runs} 趟` : '先去工会接任务、买装备，再出发',
    });
    guild.setState({ save, content: GUILD_CONTENT });
    recruit.setState({ save, allies: ALLY_DEFS });
    depart.setState({ save, gear: GEAR_DEFS, quests: ALL_QUESTS, allies: ALLY_DEFS, loadout: loadoutFor(save), zoneLabel: ZONES.forest.label });
    album.setState({ save, data: ALBUM_DATA });
  }

  const panelView = () => ({ guild, recruit, depart, album }[active] || null);

  function renderSettings(r, P) {
    settingsBoxes = [];
    const x0 = P.x + 24;
    txt(r, '设置', x0, P.y + 30, { size: F.xl, weight: 'bold', color: '#efe2c4' });
    const rows = [
      { id: 'trial', label: '试打台（只打一仗，测手感）', note: '挑仗、开关摸牌规则和盾的倍数、万发压测都在里面；那里改的开关，出发也照着用' },
      { id: 'reset', label: resetArmed ? '再点一下，真的重开' : '重开存档', note: '金币、装备、任务、等级全回到新档' },
    ];
    rows.forEach((row, i) => {
      const b = { id: row.id, x: x0, y: P.y + 70 + i * 86, w: 300, h: 38 };
      panelButton(r, b, row.label, { hot: settingsHot === row.id, kind: row.id === 'reset' && resetArmed ? 'primary' : 'normal' });
      wrapText(r, row.note, P.w - 60, { size: F.xs }).forEach((ln, j) => txt(r, ln, x0, b.y + 52 + j * 15, { size: F.xs, color: T.text3 }));
      settingsBoxes.push(b);
    });
  }

  function onSettingsPointer(ev) {
    const b = settingsBoxes.find((x) => inRect(x, ev.x, ev.y));
    settingsHot = b?.id || null;
    if (ev.type === 'up' && b) {
      if (b.id === 'trial') context.switchTo('trial');
      else if (b.id === 'reset') {
        if (!resetArmed) resetArmed = true;
        else { save = store.replace(refreshBoard(store.reset(), GUILD_CONTENT)); resetArmed = false; toast = { lines: ['重开了'], t: clock }; sync(); }
      }
    }
    return { cursor: b ? 'pointer' : 'default' };
  }

  return {
    getSave: () => save,
    getHub: () => hub,
    getPanel: () => active,
    getPanelView: () => panelView(),

    onEnter(payload) {
      payload = payload || {};
      save = store.replace(refreshBoard(store.get(), GUILD_CONTENT));
      if (payload.fromRun && session.summary) {
        toast = { lines: session.summary.lines, t: 0, long: true };
        if (submittableCount(save) > 0) active = 'guild';
      }
      if (payload.panel) active = payload.panel;
      sync();
    },

    onUpdate(dt) {
      clock += dt;
      panelT += dt;
      hub.update(dt);
      recruit.update(dt);
      album.update(dt);
    },

    onPointer(ev) {
      const h = hub.onPointer(ev);
      if (h.handled) return h;
      if (active && inRect(HUB_PANEL, ev.x, ev.y)) {
        if (active === 'settings') return onSettingsPointer(ev);
        return panelView()?.onPointer(ev) || { cursor: 'default' };
      }
      return h;
    },

    onKeyDown(key) {
      if (key === 'Escape') { active = null; sync(); }
    },

    onRender(r) {
      hub.render(r);
      if (active) {
        const k = 1 - (1 - Math.min(1, panelT / 0.22)) ** 3;
        const P = hub.panelFrame(r, k);
        r.withAlpha(k, () => {
          if (active === 'settings') renderSettings(r, P);
          else panelView()?.render(r, P);
        });
      }
      if (toast) {
        const dur = toast.long ? 6 : 2.6;
        const k = (clock - toast.t) / dur;
        if (k > 1) toast = null;
        else {
          const a = k < 0.85 ? 1 : (1 - k) / 0.15;
          const lines = toast.lines.slice(0, 6);
          const y0 = 520 - lines.length * 18;
          r.rect({ x: 40, y: y0 - 14, w: 340, h: lines.length * 18 + 14, radius: 10, fill: '#0b0d12', alpha: 0.85 * a });
          lines.forEach((ln, i) => txt(r, ln, 54, y0 + i * 18, { size: F.xs, color: toast.bad ? '#ffb3ba' : '#e0dccc', alpha: a }));
        }
      }
    },
  };
}

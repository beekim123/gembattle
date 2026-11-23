// 阶段 1 试打大厅（选仗 + 牌组配置 + 全部手感开关 + 万发压测入口）。
// 仅通过各模块 index.js 导入，不碰 DOM。

import { ALL_ENCOUNTERS, DECK_LOADOUTS, DEFAULT_RULES_CONFIG } from '../../modules/content/index.js';
import { COLOR_META, COLOR_RING } from '../../modules/shared/index.js';
import {
  UI_THEME,
  createButton,
  createUiLayer,
  drawPanel,
  drawText,
} from '../../modules/ui/index.js';

const LOADOUT_IDS = ['all_8_functions', 'starter_4_functions', 'pure_gems'];
const N_VALUES = [4, 5, 6, 8];

export function createTrySetupScene(context) {
  const ui = createUiLayer();

  // 当前选中的配置（从上次配置继承或默认）
  let selectedEncounterId = 'dual_shield';
  let loadoutIdx = 0; // 默认带上全部 8 种功能牌，方便直接试全套
  let drawTargetIdx = 0; // 默认 N = 4
  let rulesConfig = { ...DEFAULT_RULES_CONFIG };
  let battleCounter = 1;

  function currentEncounter() {
    return ALL_ENCOUNTERS.find((e) => e.id === selectedEncounterId) || ALL_ENCOUNTERS[0];
  }

  function currentLoadout() {
    return DECK_LOADOUTS[LOADOUT_IDS[loadoutIdx]];
  }

  function startBattle(override = {}) {
    battleCounter++;
    const enc = currentEncounter();
    const loadout = currentLoadout();
    context.switchTo('battle', {
      encounterId: override.encounterId || enc.id,
      extraCards: override.extraCards ?? [...loadout.extraCards],
      drawTarget: override.drawTarget ?? N_VALUES[drawTargetIdx],
      rulesConfig: { ...rulesConfig, ...(override.rulesConfig || {}) },
      seed: override.seed || `try-${enc.id}-${battleCounter}`,
      stressMode: Boolean(override.stressMode),
    });
  }

  function rebuildButtons() {
    const btns = [];

    // 左侧：7 种仗选择按钮（前 5 个为阶段 1 核心仗，后 2 个为 5.8 拓展仗）
    ALL_ENCOUNTERS.forEach((enc, idx) => {
      const y = 104 + idx * 42;
      const isSel = enc.id === selectedEncounterId;
      const tag = enc.stage1Core ? '核心' : '拓展';
      btns.push(
        createButton({
          id: `enc-${enc.id}`,
          label: `[${tag}] ${enc.label}`,
          x: 38,
          y,
          w: 484,
          h: 36,
          variant: isSel ? 'primary' : 'default',
          fontSize: 13,
          tooltip: {
            title: enc.label,
            lines: [enc.summary, `推荐档位：第 ${enc.layer} 层`],
            tag: enc.stage1Core ? '阶段 1 必试 5 种仗之一' : '设计稿 5.8 拓展仗',
          },
          onClick: () => {
            selectedEncounterId = enc.id;
            rebuildButtons();
          },
        }),
      );
    });

    // 牌组套装切换按钮
    btns.push(
      createButton({
        id: 'cycle-loadout',
        label: `牌组：${currentLoadout().label}`,
        x: 38,
        y: 412,
        w: 484,
        h: 36,
        variant: 'default',
        fontSize: 13,
        tooltip: {
          title: '切换功能牌配置',
          lines: ['在「29 宝石 + 8 种功能牌」「+ 4 张常用功能牌」「纯 29 张宝石」之间循环切换。'],
        },
        onClick: () => {
          loadoutIdx = (loadoutIdx + 1) % LOADOUT_IDS.length;
          rebuildButtons();
        },
      }),
    );

    // 主入口按钮：试打
    btns.push(
      createButton({
        id: 'start-battle',
        label: '开始试打',
        x: 38,
        y: 462,
        w: 318,
        h: 48,
        variant: 'primary',
        fontSize: 18,
        onClick: () => startBattle(),
      }),
    );

    // 万发压测按钮（设计稿 10.4：一键打出大发数链检验飘字与性能）
    btns.push(
      createButton({
        id: 'stress-battle',
        label: '万发飘字压测',
        x: 368,
        y: 462,
        w: 154,
        h: 48,
        variant: 'danger',
        fontSize: 14,
        tooltip: {
          title: '大发数压测（10.4）',
          lines: ['进入一场满手 12 张高连携宝石的仗，点「自动帮排」再「打出」即可直接看上万发打包飘字。'],
          tag: '性能验收',
        },
        onClick: () => startBattle({ encounterId: 'dual_shield', drawTarget: 12, stressMode: true, seed: 'stress-ui-demo' }),
      }),
    );

    // 右栏：设计稿 10.4 全部 8 个手感与数值开关
    const switchSpecs = [
      {
        id: 'sw-draw-mode',
        label: `摸牌：${rulesConfig.drawMode === 'refill' ? '每回合补到 N 张' : '第 1 版每回合摸 1 张'}`,
        onClick: () => { rulesConfig.drawMode = rulesConfig.drawMode === 'refill' ? 'draw_one' : 'refill'; },
      },
      {
        id: 'sw-free-keep',
        label: `留 1 张不占名额：${rulesConfig.freeKeepCount > 0 ? '开启（+1 名额）' : '关闭（基础规则）'}`,
        onClick: () => { rulesConfig.freeKeepCount = rulesConfig.freeKeepCount > 0 ? 0 : 1; },
      },
      {
        id: 'sw-n-target',
        label: `每回合补牌数 N：${N_VALUES[drawTargetIdx]} 张（点此切换 4/5/6/8）`,
        onClick: () => { drawTargetIdx = (drawTargetIdx + 1) % N_VALUES.length; },
      },
      {
        id: 'sw-shield-mult',
        label: `盾倍数：未破 ×${rulesConfig.shieldActiveMultiplier} / 破盾 ×${rulesConfig.shieldBrokenMultiplier}`,
        onClick: () => {
          if (rulesConfig.shieldActiveMultiplier === 0.75) {
            rulesConfig.shieldActiveMultiplier = 0.5;
            rulesConfig.shieldBrokenMultiplier = 2.0;
          } else {
            rulesConfig.shieldActiveMultiplier = 0.75;
            rulesConfig.shieldBrokenMultiplier = 1.5;
          }
        },
      },
      {
        id: 'sw-break-push',
        label: `破盾推倒计时：往后推 ${rulesConfig.shieldBreakPush} 格`,
        onClick: () => { rulesConfig.shieldBreakPush = rulesConfig.shieldBreakPush === 1 ? 2 : 1; },
      },
      {
        id: 'sw-init-cd',
        label: `标准初始倒计时：从 ${rulesConfig.initialCountdown} 起`,
        onClick: () => { rulesConfig.initialCountdown = rulesConfig.initialCountdown === 4 ? 3 : 4; },
      },
      {
        id: 'sw-auto-arrange',
        label: `自动帮排按钮：${rulesConfig.allowAutoArrange ? '显示（一键排链）' : '隐藏（纯手动排）'}`,
        onClick: () => { rulesConfig.allowAutoArrange = !rulesConfig.allowAutoArrange; },
      },
      {
        id: 'sw-exact-dmg',
        label: `预览精确总伤害：${rulesConfig.showExactDamage ? '显示纯数字' : '隐藏（只看接链与盾）'}`,
        onClick: () => { rulesConfig.showExactDamage = !rulesConfig.showExactDamage; },
      },
    ];

    switchSpecs.forEach((sw, idx) => {
      btns.push(
        createButton({
          id: sw.id,
          label: sw.label,
          x: 568,
          y: 104 + idx * 46,
          w: 356,
          h: 38,
          variant: 'default',
          fontSize: 13,
          onClick: () => {
            sw.onClick();
            rebuildButtons();
          },
        }),
      );
    });

    ui.setButtons(btns);
  }

  return {
    getSelectedEncounterId: () => selectedEncounterId,
    getRulesConfig: () => ({ ...rulesConfig }),

    onEnter(payload) {
      if (payload?.encounterId) selectedEncounterId = payload.encounterId;
      if (payload?.rulesConfig) rulesConfig = { ...rulesConfig, ...payload.rulesConfig };
      rebuildButtons();
    },

    onPointer(event) {
      if (!event) return { cursor: 'default' };
      if (event.type === 'move') return ui.onPointerMove(event.x, event.y);
      if (event.type === 'down') return ui.onPointerDown(event.x, event.y);
      if (event.type === 'up') return ui.onPointerUp(event.x, event.y);
      if (event.type === 'leave') return ui.onPointerLeave();
      return { cursor: 'default' };
    },

    onRender(renderer) {
      const { width } = renderer.getSize();
      renderer.clear(UI_THEME.bg);

      // 顶栏
      renderer.rect({ x: 0, y: 0, w: width, h: 48, fill: '#1d222e' });
      renderer.line({ x1: 0, y1: 48, x2: width, y2: 48, color: '#313a4f', lineWidth: 1 });
      drawText(renderer, { text: 'code00 · 阶段 1 战斗试打台', x: 24, y: 14, size: 18, weight: 'bold' });

      // 七色小点
      const dotColors = [...COLOR_RING, 'white'];
      dotColors.forEach((cid, i) => {
        renderer.circle({ x: width - 170 + i * 22, y: 24, r: 6, fill: COLOR_META[cid].swatch, stroke: '#12151c', lineWidth: 1.5 });
      });

      // 左栏：选仗面板
      drawPanel(renderer, {
        x: 24,
        y: 60,
        w: 512,
        h: 464,
        title: '1. 选一种仗试打（前 5 种为阶段 1 核心仗）',
        subtitle: '全色块原型',
        radius: 10,
      });

      // 右栏：规则开关面板
      drawPanel(renderer, {
        x: 552,
        y: 60,
        w: 386,
        h: 464,
        title: '2. 手感与规则开关（点一下切换）',
        subtitle: '设计稿 10.4',
        radius: 10,
      });

      drawText(renderer, {
        text: `当前选中：${currentEncounter().summary}`,
        x: 568,
        y: 478,
        size: 12,
        color: '#9db6df',
        maxWidth: 356,
      });

      ui.render(renderer);
    },
  };
}

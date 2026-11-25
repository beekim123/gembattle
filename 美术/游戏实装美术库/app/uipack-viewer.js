'use strict';
// =============================================================================
// UI / 贴图包可视化预览器（总工坊 & 游戏实装美术库共用）
// 渲染全部 5 套外派贴图包（UI-01 / UI-02A / UI-02B / UI-03 / UI-04）的真实离屏素材与实时动态特效
// =============================================================================
(function initUiPackViewer() {
  const UI_PACKS = [
    {
      id: 'ui01_skin', code: 'UI-01', name: '像素皮肤与通用控件',
      file: 'art-packs/pack_ui_skin.js', key: 'uiSkin',
      tag: '44 张离屏 · 0.21 MB · 5 类 9-slice 面板 + 4×4 按钮 + 血条/护盾/倒数/七色环/像素数字',
      preview: '../外包/外派/分包-UI01-像素皮肤与通用控件/preview.html'
    },
    {
      id: 'ui02a_cards', code: 'UI-02A', name: '七色宝石与秘术卡牌',
      file: 'art-packs/pack_cards.js', key: 'cards',
      tag: '27 张离屏 · 0.51 MB · 7 色宝石牌 + 5 瞬发秘术 + 3 连锁秘术 + 牌背/废牌/遮蔽/卡槽',
      preview: '../外包/外派/分包-UI02A-七色宝石与秘术卡牌/preview.html'
    },
    {
      id: 'ui02b_icons', code: 'UI-02B', name: '印记雕琢与战利品图标',
      file: 'art-packs/pack_icons.js', key: 'cards',
      tag: '23 张离屏 · 0.05 MB · 10 秘宝印记 + 6 战利品徽章 + 4 雕琢角标',
      preview: '../外包/外派/分包-UI02B-印记雕琢与战利品图标/preview.html'
    },
    {
      id: 'ui03_map', code: 'UI-03', name: '探索地图与非战斗装饰',
      file: 'art-packs/pack_map_panels.js', key: 'mapPanels',
      tag: '41 张离屏 · 0.25 MB · 卷轴底图 + 关隘门 + 6 类节点 + 11 选项图标 + 3 结算纹章',
      preview: '../外包/外派/分包-UI03-探索地图与非战斗装饰/preview.html'
    },
    {
      id: 'ui04_ground_vfx', code: 'UI-04', name: '旋转像素地面与3D特效',
      file: 'art-packs/pack_ground_vfx.js', key: 'groundVfx',
      tag: '8 套 360° 像素地面 + 5 色法术弹道 + 4 类冲击波 + 8 怪专属 3D 攻击特效',
      preview: '../外包/外派/分包-UI04-旋转像素地面与3D特效/preview.html'
    }
  ];

  const UI_PACK_BY_ID = Object.fromEntries(UI_PACKS.map(p => [p.id, p]));
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function defaultMakeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  let rafId = 0;
  let animDrawers = [];

  function stopAnim() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    animDrawers = [];
  }

  function startAnim() {
    if (!animDrawers.length) return;
    const t0 = performance.now();
    const loop = (now) => {
      const t = (now - t0) / 1000;
      for (let i = 0; i < animDrawers.length; i++) {
        try { animDrawers[i](t); } catch (e) { /* 单项容错 */ }
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
  }

  // 简易 3D 俯视坐标变换（用于 UI-04 3D 特效卡片实时展示）
  function makeMiniProj(cx, cy, scale) {
    return (x, y, z) => ({
      x: cx + x * scale,
      y: cy + y * scale * 0.62 - z * scale * 0.85,
      s: scale
    });
  }

  function renderPack(stageEl, pack, makeCanvas) {
    stopAnim();
    if (!stageEl || !pack) return;
    const mk = typeof makeCanvas === 'function' ? makeCanvas : defaultMakeCanvas;
    const packs = window.Code00ArtPacks || {};
    const mod = packs[pack.key];

    if (!mod) {
      stageEl.innerHTML = `<div class="uipack-h"><h3>${esc(pack.code)} · ${esc(pack.name)}</h3></div>
        <div class="lib-empty">未检测到 <code>window.Code00ArtPacks.${esc(pack.key)}</code>，请确认 <code>${esc(pack.file)}</code> 已加载。</div>`;
      stageEl.classList.add('show');
      return;
    }

    if (typeof mod.init === 'function') {
      try { mod.init(mk); } catch (e) { /* ignore */ }
    }
    if (pack.id === 'ui02b_icons' && typeof mod.initIcons === 'function') {
      try { mod.initIcons(mk); } catch (e) { /* ignore */ }
    }

    const sections = [];
    const addSec = (title, wide) => {
      const sec = { title, wide: !!wide, items: [] };
      sections.push(sec);
      return sec;
    };

    const addSample = (sec, label, w, h, fn, bg, animate) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      const drawOnce = (t) => {
        ctx.clearRect(0, 0, w, h);
        if (bg) {
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, w, h);
        }
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        try { fn(ctx, w, h, t); } catch (e) {
          ctx.fillStyle = '#ff6b6b';
          ctx.font = '11px monospace';
          ctx.fillText('ERR', 6, 16);
        }
        ctx.restore();
      };
      drawOnce(0);
      if (animate) animDrawers.push(drawOnce);
      sec.items.push({ label, canvas: c });
    };

    const addDirectCanvas = (sec, label, srcCv, drawW, drawH) => {
      if (!srcCv || !srcCv.width || !srcCv.height) return;
      const c = document.createElement('canvas');
      c.width = drawW || srcCv.width;
      c.height = drawH || srcCv.height;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(srcCv, 0, 0, c.width, c.height);
      sec.items.push({ label, canvas: c });
    };

    // ---------------- UI-01：像素皮肤与通用控件 ----------------
    if (pack.id === 'ui01_skin') {
      const sPanels = addSec('9-slice 面板框（5 种材质）');
      const panelNames = [
        ['wood', '橡木面板 · wood'],
        ['parchment', '羊皮卷面板 · parchment'],
        ['stone', '石刻面板 · stone'],
        ['tooltip', '浮窗提示框 · tooltip'],
        ['bar', '底栏条 · bar']
      ];
      for (const [v, nm] of panelNames) {
        addSample(sPanels, nm, 180, 108, (x, w, h) => {
          mod.drawPanel(x, 10, 10, w - 20, h - 20, v);
        }, '#18202a');
      }

      const sBtns = addSec('像素按钮（4 变体 × 4 状态）');
      const variants = [
        ['primary', '主按钮'],
        ['secondary', '次按钮'],
        ['danger', '警示'],
        ['ghost', '透明']
      ];
      const states = [
        ['常态', { enabled: true }],
        ['悬停', { enabled: true, hover: true }],
        ['按下', { enabled: true, pressed: true }],
        ['禁用', { enabled: false }]
      ];
      for (const [v, vn] of variants) {
        for (const [sn, st] of states) {
          addSample(sBtns, `${vn} · ${sn}`, 160, 56, (x, w, h) => {
            mod.drawButton(x, 12, 10, w - 24, h - 20, `${vn}`, Object.assign({ variant: v }, st));
          }, '#18202a');
        }
      }

      const sHud = addSec('战斗 HUD 控件（心形 / 金币 / 血条 / 护盾 / 倒数 / 七色环 / 通道等级 / 像素数字）', true);
      addSample(sHud, '心形（满 / 半 / 空）与金币', 220, 76, (x) => {
        mod.drawHeart(x, 34, 38, 22, 'full');
        mod.drawHeart(x, 82, 38, 22, 'half');
        mod.drawHeart(x, 130, 38, 22, 'empty');
        mod.drawCoin(x, 182, 38, 22);
      }, '#18202a');

      addSample(sHud, '血条（普通 & 多管 Boss）', 240, 88, (x) => {
        mod.drawHpBar(x, 120, 18, 196, 68, 100, 1, 1);
        mod.drawHpBar(x, 120, 54, 196, 145, 200, 2, 3);
      }, '#18202a');

      addSample(sHud, '三色护盾（完整 & 破盾）', 240, 88, (x) => {
        mod.drawShield(x, 120, 20, [2, 1, 2], [2, 2, 2], false);
        mod.drawShield(x, 120, 56, [0, 0, 0], [2, 2, 2], true);
      }, '#18202a');

      addSample(sHud, '行动倒数（常规 & 濒危脉冲）', 220, 88, (x, w, h, t) => {
        mod.drawCountdown(x, 66, 44, 3, t, false);
        mod.drawCountdown(x, 154, 44, 1, t, true);
      }, '#18202a', true);

      addSample(sHud, '七色收集环（动态高亮）', 180, 120, (x, w, h, t) => {
        const cur = Math.floor(t * 2) % 7;
        mod.drawColorRing(x, 90, 60, 42, 0b1011011, cur, t);
      }, '#18202a', true);

      addSample(sHud, '红 / 绿 / 蓝 宝石通道等级条', 240, 104, (x) => {
        mod.drawGemLevelBar(x, 14, 10, 212, 0, 3, 7, 10);
        mod.drawGemLevelBar(x, 14, 42, 212, 1, 2, 4, 8);
        mod.drawGemLevelBar(x, 14, 74, 212, 2, 4, 9, 10);
      }, '#18202a');

      addSample(sHud, '像素数字（普通 / 暴击 / 七彩）', 240, 104, (x) => {
        mod.drawPixelNumber(x, '128', 22, 18, { size: 18, color: '#ffffff' });
        mod.drawPixelNumber(x, '999!', 22, 46, { size: 20, crit: true });
        mod.drawPixelNumber(x, '+777', 22, 76, { size: 18, rainbow: true });
      }, '#18202a');
    }

    // ---------------- UI-02A：七色宝石与秘术卡牌 ----------------
    else if (pack.id === 'ui02a_cards') {
      const CW = mod.CARD_W || 62;
      const CH = mod.CARD_H || 88;
      const S = 2; // 2× 整数像素放大，清晰锐利
      const W = CW * S + 16;
      const H = CH * S + 16;

      const sGem = addSec('七色宝石基础牌（2× 像素高清展示）');
      const gemNames = ['赤红 · 0', '暖橙 · 1', '明黄 · 2', '翠绿 · 3', '碧青 · 4', '深蓝 · 5', '绛紫 · 6'];
      for (let i = 0; i < 7; i++) {
        addSample(sGem, gemNames[i], W, H, (x, w, h) => {
          x.translate(w / 2, h / 2);
          x.scale(S, S);
          mod.drawCard(x, { color: i, power: 3 }, {});
        }, '#18202a');
      }

      const sInst = addSec('瞬发秘术牌（5 张）');
      const instants = [
        ['spring', '甘泉 · spring'],
        ['ward', '结界 · ward'],
        ['shatter', '碎盾 · shatter'],
        ['surge', '激涌 · surge'],
        ['resonance', '共鸣 · resonance']
      ];
      for (const [id, nm] of instants) {
        addSample(sInst, nm, W, H, (x, w, h) => {
          x.translate(w / 2, h / 2);
          x.scale(S, S);
          mod.drawCard(x, { arcana: id }, {});
        }, '#18202a');
      }

      const sChain = addSec('连锁秘术牌（3 张）与特殊牌态 / 连锁槽');
      const chains = [
        ['refract', 6, '折射 · refract'],
        ['prism', 0, '棱镜 · prism'],
        ['keep', 3, '留存 · keep']
      ];
      for (const [id, col, nm] of chains) {
        addSample(sChain, nm, W, H, (x, w, h) => {
          x.translate(w / 2, h / 2);
          x.scale(S, S);
          mod.drawCard(x, { arcana: id, color: col }, {});
        }, '#18202a');
      }

      addSample(sChain, '牌背 · drawCardBack', W, H, (x, w, h) => {
        mod.drawCardBack(x, w / 2, h / 2, S);
      }, '#18202a');

      addSample(sChain, '塞入废牌 · junk', W, H, (x, w, h) => {
        x.translate(w / 2, h / 2);
        x.scale(S, S);
        mod.drawCard(x, { junk: true }, {});
      }, '#18202a');

      addSample(sChain, '林雾遮蔽 · masked', W, H, (x, w, h) => {
        x.translate(w / 2, h / 2);
        x.scale(S, S);
        mod.drawCard(x, { color: 2 }, { masked: true });
      }, '#18202a');

      addSample(sChain, '连锁槽（空 / 下一格 / 已填）', 220, 120, (x) => {
        mod.drawChainSlot(x, 42, 60, 52, 74, { index: 0, filled: true });
        mod.drawChainSlot(x, 110, 60, 52, 74, { index: 1, isNext: true });
        mod.drawChainSlot(x, 178, 60, 52, 74, { index: 2, filled: false });
      }, '#18202a');
    }

    // ---------------- UI-02B：印记雕琢与战利品图标 ----------------
    else if (pack.id === 'ui02b_icons') {
      const sSeal = addSec('秘宝印记图标（10 枚 · 3× 高清放大）');
      const seals = [
        ['shatter_tide', '碎甲白潮'],
        ['desperate', '背水一击'],
        ['double_white', '双白回响'],
        ['white_echo', '白潮余韵'],
        ['rainbow_bridge', '虹桥连携'],
        ['ring_keep', '环印留存'],
        ['wide_bag', '扩容行囊'],
        ['hold_edge', '蓄势待发'],
        ['leap', '跨步连段'],
        ['chain_surge', '连锁激涌']
      ];
      for (const [id, nm] of seals) {
        addSample(sSeal, `${nm} · ${id}`, 96, 96, (x, w, h) => {
          mod.drawSealIcon(x, id, w / 2, h / 2, 72);
        }, '#18202a');
      }

      const sLoot = addSec('战利品徽章（6 枚）');
      const loots = [
        ['carve', '宝石雕琢 · carve'],
        ['seal', '秘宝印记 · seal'],
        ['arcana', '秘术残卷 · arcana'],
        ['hand', '手牌上限 · hand'],
        ['heal', '生命回复 · heal'],
        ['attr', '属性成长 · attr']
      ];
      for (const [id, nm] of loots) {
        addSample(sLoot, nm, 96, 96, (x, w, h) => {
          mod.drawLootBadge(x, id, w / 2, h / 2, 72);
        }, '#18202a');
      }

      const sCarve = addSec('雕琢角标（4 枚）');
      const carves = [
        ['sharp', '锐切 · sharp'],
        ['twin', '双晶 · twin'],
        ['pierce', '穿透 · pierce'],
        ['overflow', '溢伤 · overflow']
      ];
      for (const [id, nm] of carves) {
        addSample(sCarve, nm, 96, 96, (x, w, h) => {
          mod.drawCarveBadge(x, id, w / 2, h / 2, 72);
        }, '#18202a');
      }
    }

    // ---------------- UI-03：探索地图与非战斗装饰 ----------------
    else if (pack.id === 'ui03_map') {
      const sBanner = addSec('卷轴底图 / 关隘分隔 / 标题徽章 / 场景丝带', true);
      addSample(sBanner, '手绘卷轴底图 + 关隘门（动态）', 320, 180, (x, w, h, t) => {
        mod.drawMapScrollBg(x, 0, 0, w, h, 40, 900, 320, []);
        mod.drawMapGateDivider(x, 24, w - 24, 92, false, t);
      }, '#18202a', true);

      addSample(sBanner, '标题徽章 · drawTitleEmblem', 320, 140, (x, w, h, t) => {
        mod.drawTitleEmblem(x, w / 2, h / 2, '落果密林', '林间秘境试炼', t);
      }, '#18202a', true);

      addSample(sBanner, '场景丝带 · drawSceneRibbon', 320, 96, (x, w, h) => {
        mod.drawSceneRibbon(x, w / 2, h / 2, 280, '林间营地', '休整 · 雕琢 · 净化');
      }, '#18202a');

      const sNodes = addSec('地图节点（6 类 · 含当前/可选/已通状态）');
      const nodes = [
        ['battle', '战斗节点 · battle', 'avail'],
        ['elite', '精英节点 · elite', 'current'],
        ['event', '奇遇节点 · event', 'avail'],
        ['shop', '行商节点 · shop', 'done'],
        ['camp', '营地节点 · camp', 'avail'],
        ['boss', '首领节点 · boss', 'current']
      ];
      for (const [tp, nm, status] of nodes) {
        addSample(sNodes, nm, 112, 112, (x, w, h, t) => {
          mod.drawMapNode(x, tp, w / 2, h / 2, tp === 'boss' ? 32 : 24, { status, hover: status === 'current', t });
        }, '#26313e', true);
      }

      const sChoices = addSec('非战斗选项图标（11 枚）');
      const choices = [
        ['camp_heal', '营地休整'],
        ['camp_carve', '营地雕琢'],
        ['camp_purge', '营地净化'],
        ['shop_potion', '行商药水'],
        ['shop_carve', '行商雕琢'],
        ['gate_retreat', '关隘撤退'],
        ['gate_advance', '关隘深入'],
        ['event_wood', '奇遇古木'],
        ['event_stele', '奇遇石碑'],
        ['event_pool', '奇遇清泉'],
        ['event_bag', '奇遇行囊']
      ];
      for (const [id, nm] of choices) {
        addSample(sChoices, `${nm} · ${id}`, 96, 96, (x, w, h) => {
          mod.drawChoiceIcon(x, id, w / 2, h / 2, 64);
        }, '#18202a');
      }

      const sCrests = addSec('结算纹章（3 枚 · 动态）', true);
      const crests = [
        ['victory', '胜利纹章 · victory'],
        ['retreat', '撤退纹章 · retreat'],
        ['defeat', '败北纹章 · defeat']
      ];
      for (const [id, nm] of crests) {
        addSample(sCrests, nm, 220, 108, (x, w, h, t) => {
          mod.drawSummaryCrest(x, w / 2, h / 2, id, t);
        }, '#18202a', true);
      }
    }

    // ---------------- UI-04：旋转像素地面与 3D 特效 ----------------
    else if (pack.id === 'ui04_ground_vfx') {
      const sGround = addSec('8 套 360° 可旋转像素地面（buildGroundTile）');
      const biomeNames = {
        forest: '落果密林 · forest',
        swamp: '枯木沼泽 · swamp',
        meadow: '浅草花甸 · meadow',
        ruins: '古石遗迹 · ruins',
        canopy: '林冠树梢 · canopy',
        camp: '林间营地 · camp',
        trade: '林地行商 · trade',
        gate: '石门关隘 · gate'
      };
      const biomes = mod.BIOME_IDS || Object.keys(biomeNames);
      for (const b of biomes) {
        const tile = mod.buildGroundTile(b, mk, 192);
        const src = (tile && tile.canvas) ? tile.canvas : tile;
        addDirectCanvas(sGround, biomeNames[b] || b, src, 168, 168);
      }

      const sBolts = addSec('5 色 3D 法术弹道（实时动画）');
      const bolts = [
        ['red', '赤红火弹 · red'],
        ['green', '翠绿木弹 · green'],
        ['blue', '深蓝水弹 · blue'],
        ['white', '纯白清弹 · white'],
        ['rainbow', '七彩虹弹 · rainbow']
      ];
      for (const [art, nm] of bolts) {
        addSample(sBolts, nm, 160, 128, (x, w, h, t) => {
          const proj = makeMiniProj(w / 2, h / 2 + 8, 2.2);
          const k = (t * 0.9) % 1;
          mod.drawSpellBolt3D(x, { from: [-24, 18, 10], to: [24, -18, 12], k, art, big: art === 'rainbow' }, proj);
        }, '#18202a', true);
      }

      const sWaves = addSec('4 类 3D 冲击波（实时动画）');
      const waves = [
        ['white_wave', '白潮扩散 · white_wave'],
        ['rainbow_burst', '七彩爆发 · rainbow_burst'],
        ['shield_shatter', '破盾震爆 · shield_shatter'],
        ['ward_block', '结界格挡 · ward_block']
      ];
      for (const [kind, nm] of waves) {
        addSample(sWaves, nm, 160, 128, (x, w, h, t) => {
          const proj = makeMiniProj(w / 2, h / 2 + 10, 2.2);
          const k = (t * 0.85) % 1;
          mod.drawImpactWave3D(x, kind, [0, 0, 8], k, proj);
        }, '#18202a', true);
      }

      const sAtk = addSec('8 怪专属 3D 攻击特效（drawAttackFx3D · 实时动画）');
      const atks = [
        ['spit', '水滴软泥 · spit'],
        ['puff', '草茎绵羊 · puff'],
        ['club', '拾荒地精 · club'],
        ['petals', '花甸灵精 · petals'],
        ['fruit', '摇果长臂猿 · fruit'],
        ['claw', '五尾赤豹 · claw'],
        ['bite', '腹口懒兽 · bite'],
        ['roots', '千丈古树精 · roots']
      ];
      for (const [kind, nm] of atks) {
        addSample(sAtk, nm, 168, 132, (x, w, h, t) => {
          const proj = makeMiniProj(w / 2, h / 2 + 8, 2.1);
          const k = (t * 0.85) % 1;
          mod.drawAttackFx3D(x, kind, k, [0, -24, 10], [0, 22, 8], proj);
        }, '#18202a', true);
      }
    }

    // 渲染 DOM
    let totalItems = 0;
    for (const s of sections) totalItems += s.items.length;

    stageEl.innerHTML = `
      <div class="uipack-h">
        <div>
          <h3>${esc(pack.code)} · ${esc(pack.name)}</h3>
          <div class="hint" style="margin-top:2px">${esc(pack.tag)}（本页共实时绘制 ${totalItems} 项）</div>
        </div>
        <a class="btn primary sm" href="${esc(pack.preview)}" target="_blank">打开独立 preview.html</a>
      </div>
      <div id="uiPackSections"></div>
    `;
    const wrap = stageEl.querySelector('#uiPackSections');
    for (const sec of sections) {
      const h4 = document.createElement('div');
      h4.className = 'uipack-sec-t';
      h4.textContent = `${sec.title}（${sec.items.length}）`;
      wrap.appendChild(h4);

      const grid = document.createElement('div');
      grid.className = sec.wide ? 'uipack-grid wide' : 'uipack-grid';
      for (const it of sec.items) {
        const card = document.createElement('div');
        card.className = 'uipack-card';
        card.appendChild(it.canvas);
        const cap = document.createElement('div');
        cap.className = 'cap';
        cap.textContent = it.label;
        card.appendChild(cap);
        grid.appendChild(card);
      }
      wrap.appendChild(grid);
    }

    stageEl.scrollTop = 0;
    stageEl.classList.add('show');
    startAnim();
  }

  window.PixelWorkshop = window.PixelWorkshop || {};
  window.PixelWorkshop.UiPackViewer = {
    UI_PACKS,
    UI_PACK_BY_ID,
    renderPack,
    stopAnim
  };
})();

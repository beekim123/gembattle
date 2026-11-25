'use strict';
// =============================================================================
// 异世界生态可视化页（ecology.html）
//   三层视图：
//     1. #map           世界平面地图（21 块地貌色块 + 7 种连接画法 + 悬停生物头像条）
//     2. #hab/<id>      生境实时舞台（复用唯一 StackRenderer + 真模型/占位体素 + 可开关食物链箭头 + 头像食物链）
//     3. #c/<code>      单只生物百科（复用同一 StackRenderer 特写 + 图标化属性 + 全头像关系 + 默认折叠做法）
//   工程规矩：
//     - 全页仅 1 个 StackRenderer，离开舞台即停循环，守 28MB 贴图上限与整数像素缩放；
//     - 复用 core/、scenes/habitats.js、creatures/，不改其原有行为；
//     - 未来新增生物脚本后按 impl 或 code 自动替换占位，无需改本文件。
// =============================================================================
(function initEcology() {
  const D = window.EcoDesign;
  const ML = window.EcoMapLayout;
  const PW = window.PixelWorkshop;
  const PH = window.EcoPlaceholder;
  const { TAU, clamp } = PW.Math;
  const { HABITAT_MAP, buildHabitatPlatform } = PW.Habitats;
  const { makeCanvas, StackRenderer } = PW.Renderer;
  const { computeEcoAvoidance } = PW.Behaviors;
  const Assets = PW.Assets;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------------------------------------------------------------- 数据索引
  const HAB = new Map(D.habitats.map((h) => [h.id, h]));
  const CR = new Map(D.creatures.map((c) => [c.code, c]));
  const FOOD = new Map(D.foods.map((f) => [f.id, f]));
  const NICHE = new Map(D.niches.map((n) => [n.id, n]));
  const TPL = new Map(D.templates.map((t) => [t.id, t]));
  const LAYER_ORDER = ['sky', 'dry', 'wood', 'water', 'under'];
  const LAYER_NAME = Object.fromEntries(D.layers.map((l) => [l.id, l.label]));

  const STATUS_TEXT = { made: '已有模型', existing: '图鉴里有', decided: '已定', proposal: '提案' };
  const STATUS_COLOR = { made: '#1f8a4c', existing: '#57657a', decided: '#2563eb', proposal: '#c96a12' };

  const pushMap = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  const eatenBy = new Map();
  const withAll = new Map();
  const hostedBy = new Map();
  for (const c of D.creatures) {
    for (const e of c.eats || []) pushMap(eatenBy, e, c.code);
    for (const [o, how] of c.with || []) {
      pushMap(withAll, c.code, [o, how, false]);
      if (CR.has(o)) pushMap(withAll, o, [c.code, how, true]);
    }
    for (const h of c.hosts || []) pushMap(hostedBy, h, c.code);
  }

  const residentsOf = (hid) => D.creatures.filter((c) => c.hab.includes(hid));
  const habName = (id) => (HAB.get(id) ? HAB.get(id).name : id);
  const habPal = (id) => (HABITAT_MAP[id] && HABITAT_MAP[id].pal) || (HAB.get(id) && HAB.get(id).pal) || {};

  // 自动匹配已做真模型：优先 impl，其次按 code 兜底（新做的怪自动换上！）
  function findAssetDef(c) {
    if (!c) return null;
    if (c.impl && Assets.byId[c.impl]) return Assets.byId[c.impl];
    return Assets.list.find((d) => d.category === 'creature' && d.code === c.code) || null;
  }

  // ---------------------------------------------------------------- 像素头像图标（按模板 12 类精绘轮廓）
  const TPL_PIXELS = {
    // 漂浮水母 / 悬停
    float: 'M5 2h6v1h2v3h-1v2H4V6H3V3h2V2zM5 9h1v4H5V9zm3 0h1v5H8V9zm3 0h1v3h-1V9z',
    // 振翅飞翼 / 滑翔
    wing:  'M1 4h4v1h2v1h2V5h2V4h4v3h-2v2h-3v1H9v3H7v-3H6V9H3V7H1V4z',
    // 游鱼 / 水生
    swim:  'M4 5h6v1h2v4h-2v1H4v-1H2V6h2V5zm8 1h2v1h1v2h-1v1h-2V6z',
    // 长蛇 / 拖拽链 / 钻地 / 多足
    snake: 'M2 10h3v-2h2V6h3V4h4v3h-2v2H9v2H6v2H2v-3z',
    // 弹跳软体 / 滚球
    blob:  'M5 4h6v1h2v2h1v4h-2v2H4v-2H2V7h1V5h2V4z',
    // 两足
    biped: 'M6 2h4v3H9v2h2v3h-1v4H8v-3H7v3H5v-4H4V7h2V5H5V2h1z',
    // 四足兽
    quad:  'M3 5h9v2h2v3h-2v4h-2v-3H6v3H4v-4H2V7h1V5z',
    // 多足节肢
    bug:   'M5 4h6v6H5V4zM2 4h2v2H2V4zm10 0h2v2h-2V4zM1 7h3v2H1V7zm11 0h3v2h-3V7zM2 10h2v2H2v-2zm10 0h2v2h-2v-2z',
    // 扎根 / 树 / 垂吊
    root:  'M6 2h4v2h2v3H9v4h3v2H4v-2h3V7H4V4h2V2z',
    // 层叠 / 巨型 / 方甲
    stack: 'M3 2h10v3H3V2zm-1 4h12v3H2V6zm1 4h10v3H3v-3z',
    // 高跷 / 长臂
    stilt: 'M5 2h6v4H5V2zM4 6h2v8H4V6zm6 0h2v8h-2V6z',
    // 伏击静物 / 菌网 / 翻面 / 寄生
    web:   'M7 2h2v3h2v2h3v2h-3v2H9v3H7v-3H5V9H2V7h3V5h2V2z'
  };

  function iconKeyFor(tpl) {
    if (tpl === 'M01' || tpl === 'M33') return 'float';
    if (tpl === 'M02' || tpl === 'M28' || tpl === 'M29') return 'wing';
    if (tpl === 'M03' || tpl === 'M13') return 'swim';
    if (tpl === 'M04' || tpl === 'M18' || tpl === 'M22' || tpl === 'M23') return 'snake';
    if (tpl === 'M05' || tpl === 'M08' || tpl === 'M11' || tpl === 'M21') return 'blob';
    if (tpl === 'M06' || tpl === 'M12' || tpl === 'M17') return 'biped';
    if (tpl === 'M07') return 'quad';
    if (tpl === 'M09' || tpl === 'M15' || tpl === 'M31') return 'bug';
    if (tpl === 'M10' || tpl === 'M20') return 'root';
    if (tpl === 'M14' || tpl === 'M16' || tpl === 'M30' || tpl === 'M34' || tpl === 'M35' || tpl === 'M32') return 'stack';
    if (tpl === 'M25' || tpl === 'M26' || tpl === 'M27') return 'stilt';
    return 'web';
  }

  function creatureAvatar(c, opts = {}) {
    const nObj = NICHE.get(c.niche[0]) || { color: '#5b9a48' };
    const stCol = STATUS_COLOR[c.status] || '#64748b';
    const hasModel = !!findAssetDef(c);
    const cls = ['ava', opts.sm ? 'sm' : '', opts.visitor ? 'visitor' : ''].filter(Boolean).join(' ');
    const title = `${c.code} ${c.name}（${STATUS_TEXT[c.status] || c.status}）\n${c.brief || ''}`;
    const dPath = TPL_PIXELS[iconKeyFor(c.tpl)] || TPL_PIXELS.quad;
    const inner = `${hasModel ? '<i class="ava-3d" title="已有3D堆叠模型"></i>' : ''}
      <i class="ava-st"></i>
      <svg class="ava-ico" viewBox="0 0 16 16" aria-hidden="true"><path d="${dPath}" fill="#ffffff" fill-opacity="0.95"/></svg>
      <span class="ava-code">${esc(c.code)}</span>`;
    if (opts.noLink) {
      return `<span class="${cls}" style="--ava-bg:${nObj.color};--ava-st:${stCol}" title="${esc(title)}">${inner}</span>`;
    }
    return `<a class="${cls}" href="#c/${encodeURIComponent(c.code)}" data-code="${esc(c.code)}" style="--ava-bg:${nObj.color};--ava-st:${stCol}" title="${esc(title)}">${inner}</a>`;
  }

  function creatureTile(c, subText = '', extraCls = '') {
    return `<a class="ava-tile ${extraCls}" href="#c/${encodeURIComponent(c.code)}" data-code="${esc(c.code)}">
      ${creatureAvatar(c, { sm: true, noLink: true })}
      <span class="at-info">
        <span class="at-name">${esc(c.name)}</span>
        <span class="at-sub">${esc(subText || c.size || '')}</span>
      </span>
    </a>`;
  }

  function foodChip(fid, cls = 'tag-chip food') {
    const f = FOOD.get(fid);
    if (!f) return `<span class="${cls}">${esc(fid)}</span>`;
    const ico = (ML.foodIcons && ML.foodIcons[fid]) || '•';
    return `<span class="${cls}" data-food="${esc(fid)}" title="${esc(f.desc || f.name)}"><span>${ico}</span>${esc(f.name)}</span>`;
  }

  // ---------------------------------------------------------------- 视图一：世界平面地图
  let mapBuilt = false;
  let activeFlowKind = null;
  let hoveredHabId = null;

  function regionShapePath(r) {
    const x = r.cx - r.w / 2, y = r.cy - r.h / 2, w = r.w, h = r.h;
    if (r.shape === 'cloud') {
      return `M${x + 28},${y + h - 4} C${x - 4},${y + h - 4} ${x - 6},${y + h * 0.42} ${x + 20},${y + h * 0.34} ` +
        `C${x + 24},${y + 4} ${x + w * 0.40},${y - 4} ${x + w * 0.54},${y + 12} ` +
        `C${x + w * 0.72},${y - 4} ${x + w * 0.94},${y + 12} ${x + w - 16},${y + h * 0.38} ` +
        `C${x + w + 6},${y + h * 0.52} ${x + w + 2},${y + h - 4} ${x + w - 26},${y + h - 4} Z`;
    }
    if (r.shape === 'peak') {
      return `M${x + 8},${y + h - 4} L${x + w * 0.24},${y + 18} L${x + w * 0.46},${y + 30} L${x + w * 0.62},${y + 4} ` +
        `L${x + w * 0.84},${y + 26} L${x + w - 6},${y + h - 4} Q${r.cx},${y + h + 4} ${x + 8},${y + h - 4} Z`;
    }
    if (r.shape === 'hex') {
      const k = 22;
      return `M${x + k},${y} L${x + w - k},${y} L${x + w},${r.cy} L${x + w - k},${y + h} L${x + k},${y + h} L${x},${r.cy} Z`;
    }
    if (r.shape === 'ice') {
      return `M${x + 14},${y + 4} L${x + w - 20},${y} L${x + w},${y + 22} L${x + w - 8},${y + h - 6} ` +
        `L${x + w * 0.42},${y + h} L${x + 6},${y + h - 10} L${x},${y + 24} Z`;
    }
    if (r.shape === 'dune') {
      return `M${x + 16},${y + 14} Q${x + w * 0.36},${y - 8} ${x + w * 0.64},${y + 10} ` +
        `Q${x + w * 0.86},${y + 2} ${x + w - 6},${y + 24} L${x + w - 4},${y + h - 16} ` +
        `Q${x + w * 0.68},${y + h + 6} ${x + w * 0.34},${y + h - 8} Q${x + 10},${y + h} ${x + 4},${y + h - 22} Z`;
    }
    if (r.shape === 'rib') {
      return `M${x + 22},${y + 6} Q${r.cx},${y - 6} ${x + w - 22},${y + 6} ` +
        `Q${x + w + 4},${r.cy} ${x + w - 22},${y + h - 6} ` +
        `Q${r.cx},${y + h + 6} ${x + 22},${y + h - 6} Q${x - 4},${r.cy} ${x + 22},${y + 6} Z`;
    }
    if (r.shape === 'step') {
      return `M${x + 10},${y + 4} L${x + w - 10},${y + 4} L${x + w - 10},${y + 30} L${x + w},${y + 30} ` +
        `L${x + w},${y + 58} L${x + w - 6},${y + 58} L${x + w - 6},${y + h - 4} L${x + 6},${y + h - 4} ` +
        `L${x + 6},${y + 58} L${x},${y + 58} L${x},${y + 30} L${x + 10},${y + 30} Z`;
    }
    if (r.shape === 'oval' || r.shape === 'pool') {
      const rx = 28, ry = 24;
      return `M${x + rx},${y} H${x + w - rx} Q${x + w},${y} ${x + w},${y + ry} V${y + h - ry} ` +
        `Q${x + w},${y + h} ${x + w - rx},${y + h} H${x + rx} Q${x},${y + h} ${x},${y + h - ry} ` +
        `V${y + ry} Q${x},${y} ${x + rx},${y} Z`;
    }
    // 默认柔和地形块
    const rad = 18;
    return `M${x + rad},${y} H${x + w - rad} Q${x + w},${y} ${x + w},${y + rad} V${y + h - rad} ` +
      `Q${x + w},${y + h} ${x + w - rad},${y + h} H${x + rad} Q${x},${y + h} ${x},${y + h - rad} ` +
      `V${y + rad} Q${x},${y} ${x + rad},${y} Z`;
  }

  function buildMapPatterns() {
    let defs = '';
    for (const h of D.habitats) {
      const p = habPal(h.id);
      const r = ML.regions[h.id];
      if (!r) continue;
      const deep = p.deep || '#334', mid = p.mid || '#556', hi = p.hi || '#778', foam = p.foam || '#eee', speck = p.speck || '#99a';
      let body = `<rect width="28" height="28" fill="${mid}"/>`;
      switch (r.pat) {
        case 'cloud':
          body += `<circle cx="7" cy="10" r="8" fill="${hi}" opacity=".65"/><circle cx="19" cy="14" r="9" fill="${foam}" opacity=".55"/><circle cx="14" cy="24" r="7" fill="${deep}" opacity=".25"/>`;
          break;
        case 'thunder':
          body += `<rect width="28" height="14" fill="${deep}" opacity=".55"/><path d="M16 2l-5 11h5l-4 12" stroke="${foam}" stroke-width="1.6" fill="none" opacity=".75"/>`;
          break;
        case 'dune':
          body += `<path d="M0 9 Q7 4 14 9 T28 9" stroke="${hi}" stroke-width="3.5" fill="none" opacity=".7"/><path d="M0 21 Q7 16 14 21 T28 21" stroke="${deep}" stroke-width="3" fill="none" opacity=".5"/>`;
          break;
        case 'oasis':
          body = `<rect width="28" height="28" fill="${hi}"/><ellipse cx="14" cy="14" rx="10" ry="8" fill="${mid}"/><ellipse cx="14" cy="14" rx="6" ry="4.5" fill="${deep}" opacity=".65"/><circle cx="22" cy="7" r="2.2" fill="${speck}"/>`;
          break;
        case 'salt':
          body = `<rect width="28" height="28" fill="${hi}"/><polygon points="14,1 26,8 26,20 14,27 2,20 2,8" fill="${mid}" stroke="${speck}" stroke-width="1.5"/><circle cx="23" cy="23" r="2.5" fill="${deep}" opacity=".85"/>`;
          break;
        case 'bamboo':
          body += `<rect x="4" y="0" width="4" height="28" fill="${hi}" opacity=".65"/><rect x="16" y="0" width="4" height="28" fill="${deep}" opacity=".55"/><line x1="4" y1="10" x2="8" y2="10" stroke="${foam}" stroke-width="1.5"/><line x1="16" y1="20" x2="20" y2="20" stroke="${foam}" stroke-width="1.5"/>`;
          break;
        case 'canopy':
          body += `<circle cx="8" cy="8" r="7" fill="${hi}" opacity=".65"/><circle cx="21" cy="11" r="8" fill="${deep}" opacity=".45"/><circle cx="12" cy="22" r="7" fill="${foam}" opacity=".35"/>`;
          break;
        case 'meadow':
          body += `<rect width="28" height="28" fill="${mid}"/><circle cx="6" cy="8" r="2.2" fill="${foam}"/><circle cx="20" cy="7" r="2.2" fill="${speck}"/><circle cx="14" cy="19" r="2.4" fill="${foam}"/><circle cx="24" cy="22" r="2" fill="${speck}"/><circle cx="5" cy="23" r="2" fill="${hi}"/>`;
          break;
        case 'forest':
          body += `<circle cx="9" cy="9" r="6" fill="${hi}" opacity=".45"/><circle cx="22" cy="20" r="7" fill="${deep}" opacity=".45"/><circle cx="19" cy="8" r="2.2" fill="${foam}"/><circle cx="7" cy="22" r="2" fill="${foam}"/>`;
          break;
        case 'carcass':
          body = `<rect width="28" height="28" fill="${deep}"/><path d="M8 0 Q14 14 8 28" stroke="${foam}" stroke-width="4" fill="none" opacity=".82"/><circle cx="22" cy="10" r="2.5" fill="${speck}" opacity=".75"/><circle cx="20" cy="22" r="2" fill="${hi}" opacity=".65"/>`;
          break;
        case 'water':
          body = `<rect width="28" height="28" fill="${deep}"/><path d="M2 9 Q9 5 16 9 T28 9" stroke="${hi}" stroke-width="2" fill="none" opacity=".55"/><path d="M0 21 Q7 17 14 21 T26 21" stroke="${foam}" stroke-width="1.5" fill="none" opacity=".4"/>`;
          break;
        case 'pebble':
          body += `<ellipse cx="7" cy="8" rx="4.5" ry="3.2" fill="${hi}" opacity=".75"/><ellipse cx="20" cy="12" rx="5" ry="3.5" fill="${speck}" opacity=".7"/><ellipse cx="12" cy="22" rx="4.5" ry="3" fill="${deep}" opacity=".6"/>`;
          break;
        case 'swamp':
          body += `<circle cx="8" cy="10" r="4" fill="${deep}" opacity=".7"/><circle cx="8" cy="10" r="2" fill="${foam}" opacity=".55"/><circle cx="21" cy="20" r="3.2" fill="${hi}" opacity=".55"/>`;
          break;
        case 'tide':
          body = `<rect width="28" height="14" fill="${mid}"/><rect y="14" width="28" height="14" fill="${hi}" opacity=".85"/><line x1="0" y1="14" x2="28" y2="14" stroke="${foam}" stroke-width="2.2"/>`;
          break;
        case 'reef':
          body += `<circle cx="14" cy="14" r="9" fill="none" stroke="${hi}" stroke-width="3" opacity=".6"/><circle cx="6" cy="7" r="2.4" fill="${speck}"/><circle cx="22" cy="21" r="2.4" fill="${speck}"/>`;
          break;
        case 'sea':
          body = `<rect width="28" height="28" fill="${deep}"/><path d="M0 10 Q14 4 28 10" stroke="${mid}" stroke-width="4" fill="none"/><path d="M0 22 Q14 16 28 22" stroke="${hi}" stroke-width="2" fill="none" opacity=".6"/>`;
          break;
        case 'ice':
          body = `<rect width="28" height="28" fill="${foam}"/><polygon points="0,0 16,0 10,16 0,12" fill="${hi}" opacity=".7"/><path d="M16 0 L10 16 L24 28" stroke="${deep}" stroke-width="2.4" fill="none"/>`;
          break;
        case 'ruins':
          body += `<rect x="1" y="1" width="12" height="12" fill="${hi}" opacity=".45" stroke="${speck}" stroke-width="1"/><rect x="15" y="15" width="12" height="12" fill="${deep}" opacity=".45" stroke="${speck}" stroke-width="1"/><circle cx="14" cy="14" r="2.6" fill="${foam}" opacity=".85"/>`;
          break;
        case 'cave':
          body = `<rect width="28" height="28" fill="${mid}"/><path d="M10 0 Q16 14 10 28" stroke="${deep}" stroke-width="7" fill="none"/><path d="M10 0 Q16 14 10 28" stroke="${foam}" stroke-width="1.2" fill="none" opacity=".5"/>`;
          break;
        case 'terrace':
          body = `<rect width="28" height="9" fill="#e0742c"/><rect y="9" width="28" height="9" fill="#c9b23a"/><rect y="18" width="28" height="10" fill="#6aa84f"/><line x1="0" y1="9" x2="28" y2="9" stroke="#ece6d8" stroke-width="2"/><line x1="0" y1="18" x2="28" y2="18" stroke="#ece6d8" stroke-width="2"/>`;
          break;
        case 'volcano':
          body = `<rect width="28" height="28" fill="${deep}"/><path d="M2 6 L12 14 L26 8 M12 14 L18 26" stroke="${foam}" stroke-width="2.2" fill="none"/><path d="M12 14 L18 26" stroke="${speck}" stroke-width="1" fill="none"/>`;
          break;
      }
      defs += `<pattern id="pat-${h.id}" width="28" height="28" patternUnits="userSpaceOnUse">${body}</pattern>`;
    }
    for (const [k, st] of Object.entries(ML.flowStyles)) {
      defs += `<marker id="arr-${k}" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M1,1.5 L11,6 L1,10.5 L3.5,6 z" fill="${st.color}" stroke="#ffffff" stroke-width="0.9" stroke-linejoin="round"/>
      </marker>`;
    }
    return defs;
  }

  function buildWorldMap() {
    if (mapBuilt) return;
    mapBuilt = true;
    const W = ML.width, H = ML.height;
    let s = `<svg id="worldSvg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><defs>${buildMapPatterns()}</defs>`;

    // 1. 地理分层底景（天空 / 西部干地 / 中部林木 / 东部水海 / 地下剖面）
    s += `<g class="map-bg">
      <rect x="16" y="10" width="1248" height="134" rx="22" fill="#d9ecfc" fill-opacity="0.72"/>
      <text x="34" y="34" fill="#46729c" font-size="13" font-weight="800" letter-spacing="2">☁ 天上云带</text>

      <rect x="16" y="158" width="244" height="398" rx="18" fill="#efe2cc" fill-opacity="0.78"/>
      <text x="32" y="182" fill="#8b6334" font-size="13" font-weight="800" letter-spacing="1.5">干地盆地</text>

      <rect x="272" y="158" width="412" height="398" rx="18" fill="#ddecd8" fill-opacity="0.78"/>
      <text x="288" y="182" fill="#3a6b3d" font-size="13" font-weight="800" letter-spacing="1.5">林木腹地</text>

      <rect x="696" y="158" width="568" height="398" rx="18" fill="#d5eaf5" fill-opacity="0.78"/>
      <text x="712" y="178" fill="#23658a" font-size="13" font-weight="800" letter-spacing="1.5">河道 → 浅海 → 远洋与冰缝</text>

      <!-- 地表与地下剖面断层线 -->
      <path d="M16 574 L68 568 L130 576 L210 568 L310 575 L420 568 L540 576 L670 568 L800 575 L940 568 L1080 575 L1200 568 L1264 574 L1264 726 Q1264 734 1254 734 L26 734 Q16 734 16 726 Z"
        fill="#313542" fill-opacity="0.88" stroke="#1e222c" stroke-width="2"/>
      <text x="34" y="600" fill="#cbd5e1" font-size="13" font-weight="800" letter-spacing="2">▼ 地下剖面与地热层</text>
    </g>`;

    // 2. 生境区域（先画区域底色，连线在区域上方走细弧，避免被大片遮断；再画标签在最顶）
    let regionsSvg = '';
    let labelsSvg = '';

    for (const h of D.habitats) {
      const r = ML.regions[h.id];
      if (!r) continue;
      const d = regionShapePath(r);
      const isNew = h.status === 'new';
      const res = residentsOf(h.id);
      const p = habPal(h.id);
      const strokeCol = isNew ? '#ea7a1c' : (p.rimA || '#334155');
      const dashAttr = isNew ? 'stroke-dasharray="8 4"' : '';

      regionsSvg += `<g class="map-region ${isNew ? 'is-new' : ''}" data-h="${h.id}">
        <path class="reg-shape" d="${d}" fill="url(#pat-${h.id})" stroke="${strokeCol}" stroke-width="${isNew ? 3.4 : 2.2}" ${dashAttr}/>
      </g>`;

      // 状态小色点（一眼看出这个生境里有几只已做/图鉴/定了/提案，完全不靠文字）
      const dotGap = 11;
      const dotsW = (res.length - 1) * dotGap;
      const dotsSvg = res.map((c, idx) => {
        const dx = r.cx - dotsW / 2 + idx * dotGap;
        const dy = r.cy + 22;
        return `<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="4" fill="${STATUS_COLOR[c.status]}" stroke="#ffffff" stroke-width="1.3"/>`;
      }).join('');

      const newBadge = isNew
        ? `<g transform="translate(${r.cx + r.w / 2 - 22}, ${r.cy - r.h / 2 + 4})">
             <rect x="-14" y="-9" width="28" height="18" rx="9" fill="#ea580c" stroke="#fff" stroke-width="1.5"/>
             <text x="0" y="4.5" text-anchor="middle" fill="#fff" font-size="12" font-weight="800">新</text>
           </g>`
        : '';

      const pillW = Math.min(r.w - 16, Math.max(88, h.name.length * 16 + 24));
      labelsSvg += `<g class="map-region-lbl" data-h="${h.id}" style="pointer-events:none">
        <rect x="${(r.cx - pillW / 2).toFixed(1)}" y="${(r.cy - 20).toFixed(1)}" width="${pillW.toFixed(1)}" height="39" rx="10" fill="rgba(15, 23, 42, 0.56)"/>
        <text class="reg-title" x="${r.cx}" y="${r.cy - 2}" text-anchor="middle">${esc(h.name)}</text>
        <text class="reg-cnt" x="${r.cx}" y="${r.cy + 13}" text-anchor="middle">${esc(h.code)} · ${res.length} 种</text>
        ${dotsSvg}
        ${newBadge}
      </g>`;
    }

    // 3. 生境之间的连接（7 种截然不同的画法，一眼分辨）
    let flowsSvg = '<g class="map-flows">';
    const edgePoint = (r, ux, uy) => {
      const hw = r.w * 0.48, hh = r.h * 0.48;
      const t = Math.min(Math.abs(ux) > 1e-4 ? hw / Math.abs(ux) : 1e9, Math.abs(uy) > 1e-4 ? hh / Math.abs(uy) : 1e9);
      return [r.cx + ux * t, r.cy + uy * t];
    };
    D.flows.forEach((f, idx) => {
      const ra = ML.regions[f.from], rb = ML.regions[f.to];
      if (!ra || !rb) return;
      const dx = rb.cx - ra.cx, dy = rb.cy - ra.cy, len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const [x1, y1] = edgePoint(ra, ux, uy);
      const [x2, y2] = edgePoint(rb, -ux, -uy);
      const key = `${f.from}->${f.to}`;
      const bend = ML.flowBends[key] !== undefined ? ML.flowBends[key] : (f.bend ?? 0.14);
      const mx = (x1 + x2) / 2 - uy * len * bend;
      const my = (y1 + y2) / 2 + ux * len * bend;
      const pathD = `M${x1.toFixed(1)},${y1.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
      const st = ML.flowStyles[f.kind] || { color: '#64748b', glow: '#fff', width: 2.5, kind: 'river' };

      let inner = '';
      // 柔和白边打底防与地貌纹理混色
      inner += `<path d="${pathD}" stroke="${st.glow}" stroke-width="${st.width + 3.4}" stroke-opacity="0.72"/>`;
      if (st.kind === 'river') {
        inner += `<path d="${pathD}" stroke="${st.color}" stroke-width="${st.width}" marker-end="url(#arr-${f.kind})"/>`;
        inner += `<path class="flow-anim" d="${pathD}" stroke="#d8f0ff" stroke-width="1.6" stroke-dasharray="5 9"/>`;
      } else if (st.kind === 'track') {
        inner += `<path d="${pathD}" stroke="${st.color}" stroke-width="${st.width}" stroke-dasharray="2 7" marker-end="url(#arr-${f.kind})"/>`;
      } else if (st.kind === 'life') {
        inner += `<path d="${pathD}" stroke="${st.color}" stroke-width="${st.width}" stroke-dasharray="10 5 3 5" marker-end="url(#arr-${f.kind})"/>`;
      } else if (st.kind === 'fall') {
        inner += `<path d="${pathD}" stroke="${st.color}" stroke-width="${st.width}" stroke-dasharray="6 4 2 4" marker-end="url(#arr-${f.kind})"/>`;
      } else if (st.kind === 'nutri') {
        inner += `<path d="${pathD}" stroke="${st.color}" stroke-width="${st.width + 0.6}" stroke-dasharray="1 6" marker-end="url(#arr-${f.kind})"/>`;
      } else if (st.kind === 'seed') {
        inner += `<path d="${pathD}" stroke="${st.color}" stroke-width="${st.width}" stroke-dasharray="2 6" marker-end="url(#arr-${f.kind})"/>`;
      } else if (st.kind === 'heat') {
        inner += `<path d="${pathD}" stroke="#ff9a52" stroke-width="${st.width + 1.5}" stroke-opacity="0.75"/>`;
        inner += `<path class="flow-anim" d="${pathD}" stroke="${st.color}" stroke-width="${st.width - 0.6}" stroke-dasharray="7 5" marker-end="url(#arr-${f.kind})"/>`;
      }
      // 宽透明命中区，鼠标好点好悬停
      inner += `<path d="${pathD}" stroke="transparent" stroke-width="14"/>`;

      flowsSvg += `<g class="map-flow" data-idx="${idx}" data-from="${f.from}" data-to="${f.to}" data-kind="${esc(f.kind)}">${inner}</g>`;
    });
    flowsSvg += '</g>';

    s += regionsSvg + flowsSvg + labelsSvg + '</svg>';
    $('#mapSvgBox').innerHTML = s;

    // 右上角极简图例（画迷你线型 + 2字）
    const legHtml = Object.entries(ML.flowStyles).map(([k, st]) => {
      let dash = '';
      if (st.kind === 'track') dash = 'stroke-dasharray="2 5"';
      else if (st.kind === 'life') dash = 'stroke-dasharray="8 3 2 3"';
      else if (st.kind === 'fall') dash = 'stroke-dasharray="5 3 2 3"';
      else if (st.kind === 'nutri' || st.kind === 'seed') dash = 'stroke-dasharray="1 5"';
      else if (st.kind === 'heat') dash = 'stroke-dasharray="5 3"';
      return `<button class="mfl-item" data-fk="${esc(k)}" title="点击高亮「${esc(st.label)}」连线">
        <svg width="24" height="10"><line x1="2" y1="5" x2="22" y2="5" stroke="${st.color}" stroke-width="3" stroke-linecap="round" ${dash}/></svg>
        <span>${esc(st.label)}</span>
      </button>`;
    }).join('');
    $('#mapFlowLegend').innerHTML = legHtml;

    // 绑定地图事件
    const svg = $('#worldSvg');
    const tip = $('#mapFlowTip');

    function applyMapHighlight(hid, flowIdx, kindOnly) {
      const dim = !!(hid || flowIdx != null || kindOnly);
      svg.classList.toggle('dim-mode', dim);
      $$('.map-region', svg).forEach((el) => el.classList.remove('hot'));
      $$('.map-flow', svg).forEach((el) => el.classList.remove('hot'));
      if (!dim) return;
      if (hid) {
        const hitReg = svg.querySelector(`.map-region[data-h="${hid}"]`);
        if (hitReg) hitReg.classList.add('hot');
        $$('.map-flow', svg).forEach((fl) => {
          if (fl.dataset.from === hid || fl.dataset.to === hid) {
            fl.classList.add('hot');
            const other = fl.dataset.from === hid ? fl.dataset.to : fl.dataset.from;
            const oReg = svg.querySelector(`.map-region[data-h="${other}"]`);
            if (oReg) oReg.classList.add('hot');
          }
        });
      } else if (flowIdx != null) {
        const fl = svg.querySelector(`.map-flow[data-idx="${flowIdx}"]`);
        if (fl) {
          fl.classList.add('hot');
          const r1 = svg.querySelector(`.map-region[data-h="${fl.dataset.from}"]`);
          const r2 = svg.querySelector(`.map-region[data-h="${fl.dataset.to}"]`);
          if (r1) r1.classList.add('hot');
          if (r2) r2.classList.add('hot');
        }
      } else if (kindOnly) {
        $$('.map-flow', svg).forEach((fl) => {
          if (fl.dataset.kind === kindOnly) {
            fl.classList.add('hot');
            const r1 = svg.querySelector(`.map-region[data-h="${fl.dataset.from}"]`);
            const r2 = svg.querySelector(`.map-region[data-h="${fl.dataset.to}"]`);
            if (r1) r1.classList.add('hot');
            if (r2) r2.classList.add('hot');
          }
        });
      }
    }

    function showMapHoverBar(hid) {
      hoveredHabId = hid;
      const bar = $('#mapHoverBar');
      const h = HAB.get(hid);
      if (!h) {
        bar.innerHTML = '<div class="mhb-empty">将鼠标停在任意生境区域，看住在这里的生物；点击进入实时生态舞台。</div>';
        return;
      }
      const res = residentsOf(hid);
      bar.innerHTML = `
        <div class="mhb-head">
          <div class="mhb-title">
            <span>${esc(h.name)}</span>
            <span class="muted" style="font-size:12px;font-weight:500">${esc(h.code)}</span>
            ${h.status === 'new' ? '<span class="pill st-new">新</span>' : ''}
          </div>
          <div class="mhb-rule" title="${esc(h.rule)}">${esc(h.rule)}</div>
        </div>
        <div class="mhb-avatars">${res.map((c) => creatureAvatar(c)).join('')}</div>
        <a class="mhb-enter" href="#hab/${encodeURIComponent(h.id)}">进舞台 →</a>
      `;
    }

    $$('.map-region', svg).forEach((el) => {
      const hid = el.dataset.h;
      el.addEventListener('mouseenter', () => {
        activeFlowKind = null;
        $$('.mfl-item').forEach((b) => b.classList.remove('on'));
        tip.classList.remove('show');
        applyMapHighlight(hid, null, null);
        showMapHoverBar(hid);
      });
      el.addEventListener('mouseleave', () => {
        if (!activeFlowKind) applyMapHighlight(null, null, null);
      });
      el.addEventListener('click', () => {
        location.hash = 'hab/' + encodeURIComponent(hid);
      });
    });

    $$('.map-flow', svg).forEach((fl) => {
      const idx = Number(fl.dataset.idx);
      const f = D.flows[idx];
      fl.addEventListener('mouseenter', () => {
        applyMapHighlight(null, idx, null);
        tip.innerHTML = `<b>${esc(f.kind)}</b> · ${esc(habName(f.from))} → ${esc(habName(f.to))}：${esc(f.text)}`;
        tip.classList.add('show');
      });
      fl.addEventListener('mouseleave', () => {
        tip.classList.remove('show');
        applyMapHighlight(null, null, activeFlowKind);
      });
    });

    $$('.mfl-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const k = btn.dataset.fk;
        activeFlowKind = activeFlowKind === k ? null : k;
        $$('.mfl-item').forEach((b) => b.classList.toggle('on', b.dataset.fk === activeFlowKind));
        applyMapHighlight(null, null, activeFlowKind);
      });
    });

    // 默认在底部条预先展示「林地落果空坪」头像，首屏就一眼能看清有生物头像条
    showMapHoverBar('forest');
  }

  // ---------------------------------------------------------------- 全页唯一的像素堆叠舞台引擎
  const sharedStage = $('#sharedStage');
  const stageCv = $('#stageCanvas');
  const ovCv = $('#stageOverlay');
  const ovCtx = ovCv.getContext('2d');
  const renderer = new StackRenderer(stageCv);

  const stageState = {
    running: false,
    rafId: 0,
    mode: 'none',       // 'none' | 'hab' | 'bio'
    habId: 'forest',
    bioCode: null,
    actors: [],
    actorTemplates: new Map(), // 缓存真模型首实例，跨生境复用体素和贴图
    params: { gaitFreq: 1, tailFlex: 1, springiness: 1, speed: 1, scaleMul: 1 },
    thTarget: 0.56,
    patrol: true,
    autoSpin: false,
    showWeb: true,
    showTags: true,
    hoverCode: null,    // 悬停中的生物编号（台上或右侧联动）
    hoverFood: null,    // 悬停中的底层吃食
    stageRelations: [], // 当前生境内部关系边 { type: 'eat'|'with'|'host', from, to, label }
    projPts: new Map(), // code -> { x, y, topY, r }（CSS 像素）
    lastMs: 0,
    animTime: 0,
    // 轻量性能统计
    fpsFrames: 0,
    fpsAccMs: 0,
    cpuAccMs: 0,
    lastPerfAt: 0,
    perfSnap: { fps: 0, cpuMs: 0, frameMs: 0, mb: 0, count: 0 }
  };
  renderer.th = stageState.thTarget;

  const SIM_STEP = 1 / 120;
  const ZERO_AVOID = { avoidX: 0, avoidY: 0 };

  function homeSlot(i, n) {
    if (n <= 1) return [0, 0, 0.35];
    if (n <= 6) {
      const r = 34, a = (i / n) * TAU + 0.3;
      return [Math.cos(a) * r, Math.sin(a) * r, a + Math.PI * 0.5];
    }
    // 7~12 只分内外两圈舒展铺开，不挤堆
    const inner = Math.min(3, Math.floor(n / 3));
    if (i < inner) {
      const a = (i / inner) * TAU + 0.45;
      return [Math.cos(a) * 20, Math.sin(a) * 20, a + Math.PI * 0.5];
    }
    const k = i - inner, m = n - inner;
    const a = (k / m) * TAU + 0.18;
    return [Math.cos(a) * 52, Math.sin(a) * 52, a + Math.PI * 0.5];
  }

  function spawnEcoActor(c, seedIdx) {
    const def = findAssetDef(c);
    let inst;
    if (def) {
      const tpl = stageState.actorTemplates.get(def.id);
      inst = Assets.spawn(def, { seed: 23 + seedIdx * 37 }, tpl);
      if (!tpl) stageState.actorTemplates.set(def.id, inst);
      inst.isPlaceholder = false;
      inst.headZ = 22;
      // 尽量从模型部件推断头顶高度
      if (inst.parts) {
        let maxH = 14;
        for (const k in inst.parts) {
          const a = inst.parts[k];
          if (a && a.meta && a.meta.headZ) maxH = Math.max(maxH, a.meta.headZ);
          else if (a && a.h) maxH = Math.max(maxH, a.h);
        }
        inst.headZ = clamp(maxH, 14, 42);
      }
    } else {
      inst = PH.createPlaceholderActor(c, makeCanvas);
    }
    inst.ecoCode = c.code;
    inst.ecoData = c;
    inst.action = stageState.patrol ? 'patrol' : 'idle';
    inst.actionTime = 0;
    return inst;
  }

  function fitSharedStage() {
    if (!stageState.running) return;
    const host = sharedStage.parentElement;
    if (!host) return;
    const w = host.clientWidth || 640;
    const h = host.clientHeight || 420;
    const hab = HABITAT_MAP[stageState.habId] || HABITAT_MAP.forest;
    renderer.fit(hab, w, h);
    ovCv.width = stageCv.width;
    ovCv.height = stageCv.height;
    $('#scZoomLbl').textContent = `×${renderer.artPx}`;
  }

  const stageRO = new ResizeObserver(() => fitSharedStage());

  function mountStageTo(hostEl, mode, habId, bioCode) {
    stageState.mode = mode;
    stageState.habId = HABITAT_MAP[habId] ? habId : 'forest';
    stageState.bioCode = bioCode || null;
    stageState.hoverCode = null;
    stageState.hoverFood = null;

    if (sharedStage.parentElement !== hostEl) {
      stageRO.disconnect();
      // 插到最前，让悬浮按钮（返回 / 翻页 / 收起侧栏 / 换色）稳居画布之上
      hostEl.prepend(sharedStage);
      stageRO.observe(hostEl);
    }
    sharedStage.hidden = false;

    // 装配台上生物
    stageState.actors.length = 0;
    stageState.stageRelations.length = 0;
    const hab = HABITAT_MAP[stageState.habId];

    if (mode === 'hab') {
      const res = residentsOf(stageState.habId);
      const codeSet = new Set(res.map((c) => c.code));
      res.forEach((c, i) => {
        const inst = spawnEcoActor(c, i);
        const [x, y, yaw] = homeSlot(i, res.length);
        inst.reset(x, y, yaw);
        stageState.actors.push(inst);
      });
      // 计算生境内部的关系边（在台上画箭头）
      const seenWith = new Set();
      for (const c of res) {
        for (const e of c.eats || []) {
          if (codeSet.has(e)) stageState.stageRelations.push({ type: 'eat', from: e, to: c.code, label: '吃' });
        }
        for (const [o] of c.with || []) {
          if (!codeSet.has(o)) continue;
          const k = [c.code, o].sort().join('|');
          if (seenWith.has(k)) continue;
          seenWith.add(k);
          stageState.stageRelations.push({ type: 'with', from: c.code, to: o, label: '共生' });
        }
        for (const hst of c.hosts || []) {
          if (codeSet.has(hst)) stageState.stageRelations.push({ type: 'host', from: c.code, to: hst, label: '挂在' });
        }
      }
      renderer.zoom = 0;
      $('#scWeb').hidden = false;
      $('#scTags').hidden = false;
      const madeN = stageState.actors.filter((a) => !a.isPlaceholder).length;
      const todoN = stageState.actors.length - madeN;
      $('#stageBadge').style.left = '';
      $('#stageBadge').innerHTML = `<span class="sb-pill">${esc(hab.code)} ${esc(hab.name)} · 共 ${stageState.actors.length} 只（真模型 ${madeN}${todoN ? ` · 占位 ${todoN}` : ''}）</span>`;
    } else if (mode === 'bio') {
      const c = CR.get(bioCode);
      if (c) {
        const inst = spawnEcoActor(c, 0);
        inst.reset(0, 0, 0.35);
        stageState.actors.push(inst);
        renderer.zoom = 1; // 百科特写放大一档
        $('#stageBadge').innerHTML = inst.isPlaceholder
          ? `<span class="sb-pill warn">待做 · 体素占位预览</span><span class="sb-pill">${esc(hab.name)}</span>`
          : `<span class="sb-pill">${esc(c.code)} ${esc(c.name)} · 真模型</span><span class="sb-pill">${esc(hab.name)}</span>`;
      }
      $('#scWeb').hidden = true;
      $('#scTags').hidden = true;
    }

    renderer.vfx.clear();
    renderer.renderSky(hab);
    syncStageControls();
    stageState.running = true;
    fitSharedStage();

    if (!stageState.rafId) {
      stageState.lastMs = 0;
      stageState.fpsFrames = 0;
      stageState.fpsAccMs = 0;
      stageState.cpuAccMs = 0;
      stageState.lastPerfAt = performance.now();
      stageState.rafId = requestAnimationFrame(stageTick);
    }
  }

  function stopStage() {
    stageState.running = false;
    stageState.mode = 'none';
    if (stageState.rafId) {
      cancelAnimationFrame(stageState.rafId);
      stageState.rafId = 0;
    }
    stageState.actors.length = 0;
    stageState.projPts.clear();
    stageRO.disconnect();
    sharedStage.hidden = true;
  }

  function syncStageControls() {
    $('#scWeb').classList.toggle('on', stageState.showWeb);
    $('#scTags').classList.toggle('on', stageState.showTags);
    $('#scPatrol').classList.toggle('on', stageState.patrol);
    $('#scPatrol').textContent = stageState.patrol ? '巡游' : '待机';
    $('#scSpin').classList.toggle('on', stageState.autoSpin);
    $('#scOutline').classList.toggle('on', renderer.useOutline);
    $('#scZoomLbl').textContent = `×${renderer.artPx}`;
  }

  function simulateStage(dt) {
    const hab = HABITAT_MAP[stageState.habId];
    const actors = stageState.actors;
    const n = actors.length;
    const crowd = n > 1;
    for (let i = 0; i < n; i++) {
      const a = actors[i];
      a.action = stageState.patrol ? 'patrol' : 'idle';
      a.actionTime += dt;
      const avoid = crowd ? computeEcoAvoidance(a, actors) : ZERO_AVOID;
      const [hx, hy, hyaw] = homeSlot(i, n);
      a.update(dt, stageState.animTime, stageState.params, hab, renderer.vfx, {
        patrol: stageState.patrol,
        action: a.action,
        actionTime: a.actionTime,
        homeX: crowd ? hx : 0,
        homeY: crowd ? hy : 0,
        homeYaw: hyaw,
        maxRadius: crowd ? 64 : 44,
        seed: 29 + i * 41,
        avoidX: avoid.avoidX,
        avoidY: avoid.avoidY,
        self: a,
        allActors: actors
      });
    }
    renderer.vfx.update(dt);
  }

  function drawStageOverlay() {
    const dpr = renderer.DPR || 1;
    const cw = ovCv.width / dpr, ch = ovCv.height / dpr;
    ovCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ovCtx.clearRect(0, 0, cw, ch);

    stageState.projPts.clear();
    if (stageState.mode !== 'hab') return;

    const actors = stageState.actors;
    for (const a of actors) {
      const [bx, by] = renderer.proj(a.state.x, a.state.y, a.state.z + 5);
      const [tx, ty] = renderer.proj(a.state.x, a.state.y, a.state.z + (a.headZ || 20));
      const hitR = clamp(((a.def.footRadius || 10) + 4) * renderer.SCALE / dpr, 18, 48);
      stageState.projPts.set(a.ecoCode, { x: bx / dpr, y: by / dpr, topY: ty / dpr, r: hitR, actor: a });
    }

    const hov = stageState.hoverCode;
    const hovFood = stageState.hoverFood;

    // 1. 食物链 / 共生 / 寄生箭头
    if (stageState.showWeb && stageState.stageRelations.length) {
      const tFlow = (stageState.animTime * 0.45) % 1;
      for (const rel of stageState.stageRelations) {
        const p1 = stageState.projPts.get(rel.from);
        const p2 = stageState.projPts.get(rel.to);
        if (!p1 || !p2) continue;
        const dx = p2.x - p1.x, dy = p2.y - p1.y, dist = Math.hypot(dx, dy);
        if (dist < 14) continue;
        const related = !hov || hov === rel.from || hov === rel.to;
        const ux = dx / dist, uy = dy / dist;
        const sx = p1.x + ux * Math.min(20, dist * 0.25);
        const sy = p1.y + uy * Math.min(20, dist * 0.25);
        const ex = p2.x - ux * Math.min(22, dist * 0.28);
        const ey = p2.y - uy * Math.min(22, dist * 0.28);
        const arc = Math.min(48, Math.max(18, dist * 0.22));
        const cx = (sx + ex) * 0.5;
        const cy = (sy + ey) * 0.5 - arc;

        const col = rel.type === 'eat' ? '#f87171' : (rel.type === 'host' ? '#fb923c' : '#38bdf8');
        ovCtx.save();
        ovCtx.globalAlpha = related ? (hov ? 0.98 : 0.86) : 0.14;
        // 暗边垫底，保证在草地/沙地/水面上都清亮分明
        ovCtx.strokeStyle = 'rgba(10, 15, 25, 0.55)';
        ovCtx.lineWidth = (hov && related) ? 5.2 : 4.2;
        if (rel.type === 'with') ovCtx.setLineDash([6, 4]);
        else if (rel.type === 'host') ovCtx.setLineDash([3, 4]);
        ovCtx.beginPath();
        ovCtx.moveTo(sx, sy);
        ovCtx.quadraticCurveTo(cx, cy, ex, ey);
        ovCtx.stroke();

        ovCtx.strokeStyle = col;
        ovCtx.lineWidth = (hov && related) ? 3.2 : 2.3;
        ovCtx.beginPath();
        ovCtx.moveTo(sx, sy);
        ovCtx.quadraticCurveTo(cx, cy, ex, ey);
        ovCtx.stroke();
        ovCtx.setLineDash([]);

        // 方向箭头（吃 / 挂在）
        if (rel.type === 'eat' || rel.type === 'host') {
          const tx = ex - cx, ty = ey - cy, tl = Math.hypot(tx, ty) || 1;
          const ax = tx / tl, ay = ty / tl;
          const sz = (hov && related) ? 9 : 7.5;
          ovCtx.fillStyle = col;
          ovCtx.beginPath();
          ovCtx.moveTo(ex, ey);
          ovCtx.lineTo(ex - ax * sz - ay * sz * 0.55, ey - ay * sz + ax * sz * 0.55);
          ovCtx.lineTo(ex - ax * sz + ay * sz * 0.55, ey - ay * sz - ax * sz * 0.55);
          ovCtx.closePath();
          ovCtx.fill();

          // 流动方向小白点，肉眼一眼看清流向
          if (related) {
            const u = tFlow, iu = 1 - u;
            const px = iu * iu * sx + 2 * iu * u * cx + u * u * ex;
            const py = iu * iu * sy + 2 * iu * u * cy + u * u * ey;
            ovCtx.fillStyle = '#ffffff';
            ovCtx.beginPath();
            ovCtx.arc(px, py, 2.8, 0, TAU);
            ovCtx.fill();
          }
        }

        // 悬停相关时在弧顶标 2 字关系标签
        if (hov && related) {
          const mx = 0.25 * sx + 0.5 * cx + 0.25 * ex;
          const my = 0.25 * sy + 0.5 * cy + 0.25 * ey;
          ovCtx.font = '700 12px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
          const tw = ovCtx.measureText(rel.label).width + 10;
          ovCtx.fillStyle = col;
          roundRect(ovCtx, mx - tw / 2, my - 10, tw, 19, 9);
          ovCtx.fill();
          ovCtx.fillStyle = '#ffffff';
          ovCtx.textAlign = 'center';
          ovCtx.textBaseline = 'middle';
          ovCtx.fillText(rel.label, mx, my);
        }
        ovCtx.restore();
      }
    }

    // 2. 选中环 + 头顶编号牌
    for (const [code, pt] of stageState.projPts.entries()) {
      const a = pt.actor;
      const c = a.ecoData;
      const isHov = hov === code;
      const eatsFood = hovFood && (c.eats || []).includes(hovFood);

      if (isHov || eatsFood) {
        ovCtx.save();
        ovCtx.strokeStyle = isHov ? '#60a5fa' : '#4ade80';
        ovCtx.lineWidth = 2.4;
        ovCtx.beginPath();
        ovCtx.ellipse(pt.x, pt.y + 8, pt.r * 0.9, pt.r * 0.54, 0, 0, TAU);
        ovCtx.stroke();
        ovCtx.restore();
      }

      const showPill = stageState.showTags || a.isPlaceholder || isHov || eatsFood;
      if (!showPill) continue;

      const label = isHov ? `${c.code} ${c.name}` : c.code;
      ovCtx.save();
      ovCtx.font = isHov
        ? '700 12px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif'
        : '700 12px ui-monospace, SFMono-Regular, Menlo, sans-serif';
      const tw = ovCtx.measureText(label).width;
      const pw = tw + 20;
      const ph = 20;
      const px = clamp(pt.x - pw / 2, 6, cw - pw - 6);
      const py = clamp(pt.topY - ph - 6, 46, ch - 68);

      ovCtx.fillStyle = isHov ? 'rgba(37, 99, 235, 0.94)' : (a.isPlaceholder ? 'rgba(15, 23, 42, 0.86)' : 'rgba(15, 23, 42, 0.64)');
      ovCtx.strokeStyle = isHov ? '#ffffff' : 'rgba(255, 255, 255, 0.28)';
      ovCtx.lineWidth = isHov ? 1.6 : 1;
      roundRect(ovCtx, px, py, pw, ph, 10);
      ovCtx.fill();
      ovCtx.stroke();

      // 四态色点
      ovCtx.fillStyle = STATUS_COLOR[c.status] || '#94a3b8';
      ovCtx.beginPath();
      ovCtx.arc(px + 9, py + ph / 2, 3.6, 0, TAU);
      ovCtx.fill();

      ovCtx.fillStyle = '#ffffff';
      ovCtx.textAlign = 'left';
      ovCtx.textBaseline = 'middle';
      ovCtx.fillText(label, px + 16, py + ph / 2 + 0.5);
      ovCtx.restore();
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function stageTick(ms) {
    if (!stageState.running) { stageState.rafId = 0; return; }
    stageState.rafId = requestAnimationFrame(stageTick);

    const frameMs = stageState.lastMs ? (ms - stageState.lastMs) : 16.67;
    stageState.lastMs = ms;
    const dt = Math.min(0.05, frameMs / 1000);

    if (stageState.autoSpin && !stageDrag) stageState.thTarget += dt * 0.5;
    if (!stageDrag) renderer.th += (stageState.thTarget - renderer.th) * Math.min(1, dt * 8);

    const t0 = performance.now();
    let rem = dt;
    while (rem > 1e-6) {
      const h = Math.min(SIM_STEP, rem);
      stageState.animTime += h;
      simulateStage(h);
      rem -= h;
    }
    const platform = buildHabitatPlatform(stageState.habId, makeCanvas, 200);
    renderer.renderScene(platform, stageState.actors, stageState.animTime);
    drawStageOverlay();
    const cpuMs = performance.now() - t0;

    if (frameMs > 0 && frameMs < 500) {
      stageState.fpsFrames++;
      stageState.fpsAccMs += frameMs;
      stageState.cpuAccMs += cpuMs;
    }
    if (ms - stageState.lastPerfAt >= 400 && stageState.fpsFrames > 0) {
      const avgFrame = stageState.fpsAccMs / stageState.fpsFrames;
      const avgCpu = stageState.cpuAccMs / stageState.fpsFrames;
      const fps = Math.round(1000 / avgFrame);
      const ci = renderer.cacheInfo();
      stageState.perfSnap = {
        fps,
        frameMs: +avgFrame.toFixed(2),
        cpuMs: +avgCpu.toFixed(2),
        mb: ci.mb,
        budgetMB: ci.budgetMB,
        count: stageState.actors.length
      };
      $('#stagePerf').textContent = `${fps} fps · 主线程 ${avgCpu.toFixed(2)}ms · 图集 ${ci.mb}/${ci.budgetMB}MB`;
      stageState.fpsFrames = 0;
      stageState.fpsAccMs = 0;
      stageState.cpuAccMs = 0;
      stageState.lastPerfAt = ms;
    }
  }

  // 舞台鼠标拖动转视角 + 滚轮整数缩放 + 点击生物进百科
  let stageDrag = null;
  function hitTestActor(clientX, clientY) {
    if (stageState.mode !== 'hab') return null;
    const rect = stageCv.getBoundingClientRect();
    const mx = clientX - rect.left, my = clientY - rect.top;
    let best = null, bestD = Infinity;
    for (const [code, pt] of stageState.projPts.entries()) {
      const d = Math.hypot(mx - pt.x, my - pt.y);
      if (d <= pt.r && d < bestD) { best = code; bestD = d; }
    }
    return best;
  }

  stageCv.addEventListener('pointerdown', (e) => {
    stageDrag = { x: e.clientX, y: e.clientY, th: renderer.th, moved: false };
    stageCv.classList.add('dragging');
    stageCv.setPointerCapture(e.pointerId);
  });
  stageCv.addEventListener('pointermove', (e) => {
    if (stageDrag) {
      const dx = e.clientX - stageDrag.x, dy = e.clientY - stageDrag.y;
      if (Math.hypot(dx, dy) > 5) stageDrag.moved = true;
      renderer.th = stageState.thTarget = stageDrag.th + dx * 0.01;
      return;
    }
    const hit = hitTestActor(e.clientX, e.clientY);
    if (hit !== stageState.hoverCode) {
      setHoverCode(hit);
    }
    stageCv.classList.toggle('pick', !!hit);
  });
  stageCv.addEventListener('pointerup', (e) => {
    if (!stageDrag) return;
    const wasClick = !stageDrag.moved;
    stageDrag = null;
    stageCv.classList.remove('dragging');
    if (wasClick) {
      const hit = hitTestActor(e.clientX, e.clientY);
      if (hit) location.hash = 'c/' + encodeURIComponent(hit);
    }
  });
  stageCv.addEventListener('pointerleave', () => {
    if (!stageDrag && stageState.hoverCode) setHoverCode(null);
    stageCv.classList.remove('pick');
  });
  stageCv.addEventListener('wheel', (e) => {
    e.preventDefault();
    renderer.zoom = clamp(renderer.zoom + (e.deltaY > 0 ? -1 : 1), -2, 6);
    fitSharedStage();
    syncStageControls();
  }, { passive: false });

  // 舞台控制按钮
  $('#scWeb').addEventListener('click', () => { stageState.showWeb = !stageState.showWeb; syncStageControls(); });
  $('#scTags').addEventListener('click', () => { stageState.showTags = !stageState.showTags; syncStageControls(); });
  $('#scPatrol').addEventListener('click', () => { stageState.patrol = !stageState.patrol; syncStageControls(); });
  $('#scSpin').addEventListener('click', () => { stageState.autoSpin = !stageState.autoSpin; syncStageControls(); });
  $('#scOutline').addEventListener('click', () => { renderer.useOutline = !renderer.useOutline; syncStageControls(); });
  $('#scZoomOut').addEventListener('click', () => { renderer.zoom = clamp(renderer.zoom - 1, -2, 6); fitSharedStage(); syncStageControls(); });
  $('#scZoomIn').addEventListener('click', () => { renderer.zoom = clamp(renderer.zoom + 1, -2, 6); fitSharedStage(); syncStageControls(); });
  $('#scReset').addEventListener('click', () => {
    stageState.thTarget = 0.56;
    renderer.zoom = stageState.mode === 'bio' ? 1 : 0;
    stageState.autoSpin = false;
    fitSharedStage();
    syncStageControls();
  });

  // 双向高亮同步（舞台 ↔ 右侧食物链面板）
  function setHoverCode(code) {
    stageState.hoverCode = code;
    const cards = $$('#chainPanel .cp-card');
    if (!code) {
      cards.forEach((el) => { el.classList.remove('hot', 'dim'); });
      $$('#chainPanel .cp-food-chip').forEach((el) => el.classList.remove('hot'));
      return;
    }
    const c = CR.get(code);
    const linked = new Set([code]);
    const linkedFoods = new Set();
    if (c) {
      for (const e of c.eats || []) { if (CR.has(e)) linked.add(e); else linkedFoods.add(e); }
      for (const p of eatenBy.get(code) || []) linked.add(p);
      for (const [o] of withAll.get(code) || []) { if (CR.has(o)) linked.add(o); else linkedFoods.add(o); }
      for (const hst of c.hosts || []) linked.add(hst);
      for (const par of hostedBy.get(code) || []) linked.add(par);
    }
    cards.forEach((el) => {
      const ec = el.dataset.code;
      el.classList.toggle('hot', linked.has(ec));
      el.classList.toggle('dim', !linked.has(ec));
    });
    $$('#chainPanel .cp-food-chip').forEach((el) => {
      el.classList.toggle('hot', linkedFoods.has(el.dataset.food));
    });
  }

  // ---------------------------------------------------------------- 视图二：生境生态图
  let lastHabId = 'forest';

  function renderHabView(hid) {
    const h = HAB.get(hid) || D.habitats[0];
    lastHabId = h.id;

    // 顶条：快速切换生境 + 规矩一句话 + 最底下吃食图标 + 上下游直跳
    const groupsHtml = LAYER_ORDER.map((lid) => {
      const hs = D.habitats.filter((x) => x.layer === lid);
      return `<optgroup label="${esc(LAYER_NAME[lid])}">${hs.map((x) =>
        `<option value="${x.id}" ${x.id === h.id ? 'selected' : ''}>${x.code} ${esc(x.name)}${x.status === 'new' ? '（新）' : ''}</option>`
      ).join('')}</optgroup>`;
    }).join('');

    const ins = D.flows.filter((f) => f.to === h.id);
    const outs = D.flows.filter((f) => f.from === h.id);
    const linkBtns = [
      ...ins.map((f) => `<a class="tag-chip" href="#hab/${encodeURIComponent(f.from)}" title="${esc(f.kind)}：${esc(f.text)}">← ${esc(habName(f.from))}</a>`),
      ...outs.map((f) => `<a class="tag-chip" href="#hab/${encodeURIComponent(f.to)}" title="${esc(f.kind)}：${esc(f.text)}">→ ${esc(habName(f.to))}</a>`)
    ].join('');

    $('#habBar').innerHTML = `
      <a class="nav-btn" href="#map">← 地图</a>
      <select class="hab-pick" id="habPick" title="切换生境">${groupsHtml}</select>
      ${h.status === 'new' ? '<span class="pill st-new">新</span>' : ''}
      <div class="hab-rule-line" title="${esc(h.rule)}">${esc(h.rule)}</div>
      <div class="hab-foods" title="最底下的吃食">${(h.base || []).map((fid) => foodChip(fid)).join('')}</div>
      ${linkBtns ? `<div class="hab-links">${linkBtns}</div>` : ''}
    `;
    $('#habPick').addEventListener('change', (e) => {
      location.hash = 'hab/' + encodeURIComponent(e.target.value);
    });

    // 右侧：按营养级排布的头像食物链面板
    const res = residentsOf(h.id);
    const resSet = new Set(res.map((c) => c.code));
    const predators = [];
    const consumers = [];
    const helpers = [];
    for (const c of res) {
      const eatsAnimal = (c.eats || []).some((e) => CR.has(e));
      if (c.niche.includes('追猎') || c.niche.includes('伏击') || eatsAnimal) predators.push(c);
      else if (c.niche.includes('分解') || c.niche.includes('寄生清洁')) helpers.push(c);
      else consumers.push(c);
    }

    const renderChainCard = (c) => {
      const relBadges = [];
      for (const e of c.eats || []) {
        if (CR.has(e)) relBadges.push(`<span class="cp-rel-pill eat">吃 ${esc(e)}</span>`);
        else if (FOOD.has(e)) {
          const ico = (ML.foodIcons && ML.foodIcons[e]) || '';
          relBadges.push(`<span class="cp-rel-pill">${ico}${esc(FOOD.get(e).name)}</span>`);
        }
      }
      for (const hst of c.hosts || []) relBadges.push(`<span class="cp-rel-pill host">挂 ${esc(hst)}</span>`);
      for (const [o] of c.with || []) {
        const lbl = CR.has(o) ? o : (FOOD.has(o) ? FOOD.get(o).name : o);
        relBadges.push(`<span class="cp-rel-pill with">伴 ${esc(lbl)}</span>`);
      }
      if (!relBadges.length) relBadges.push(`<span class="cp-rel-pill">${esc(c.niche.join(' / '))}</span>`);

      return `<div class="cp-card" data-code="${esc(c.code)}">
        ${creatureAvatar(c, { sm: true, noLink: true })}
        <div class="cp-card-body">
          <div class="cp-card-name">${esc(c.name)}</div>
          <div class="cp-card-rels">${relBadges.join('')}</div>
        </div>
      </div>`;
    };

    const tierHtml = (title, list) => list.length ? `
      <div class="cp-tier">
        <div class="cp-tier-lbl"><span>${title}</span><span>${list.length}</span></div>
        <div class="cp-row">${list.map(renderChainCard).join('')}</div>
      </div>` : '';

    // 外来关联者（只在本生境被吃或来吃，但不住这的）
    const visitors = [];
    const seenVis = new Set();
    for (const c of res) {
      for (const p of eatenBy.get(c.code) || []) {
        if (!resSet.has(p) && !seenVis.has(p) && CR.has(p)) { seenVis.add(p); visitors.push(CR.get(p)); }
      }
    }

    $('#chainPanel').innerHTML = `
      <div class="cp-head">
        <span>食物链与关系（${res.length} 种）</span>
        <span class="muted" style="font-size:12px;font-weight:400">点头像看百科</span>
      </div>
      <div class="cp-legend">
        <span><i class="cp-line eat"></i>吃</span>
        <span><i class="cp-line with"></i>共生</span>
        <span><i class="cp-line host"></i>挂在身上</span>
      </div>
      ${tierHtml('▲ 捕食 · 伏击', predators)}
      ${tierHtml('● 吃草 · 改地形 · 传粉 · 共生', consumers)}
      ${tierHtml('◆ 分解 · 寄生清洁', helpers)}
      ${visitors.length ? `<div class="cp-tier">
        <div class="cp-tier-lbl"><span>◇ 跨生境捕食者</span><span>${visitors.length}</span></div>
        <div class="cp-row">${visitors.map((c) => renderChainCard(c).replace('class="cp-card"', 'class="cp-card visitor"')).join('')}</div>
      </div>` : ''}
      <div class="cp-tier">
        <div class="cp-tier-lbl"><span>▼ 最底下的吃食</span><span>${(h.base || []).length}</span></div>
        <div class="cp-foods">${(h.base || []).map((fid) => foodChip(fid, 'cp-food-chip')).join('') || '<span class="muted">—</span>'}</div>
      </div>
    `;

    // 绑定右侧食物链悬停联动与点击进百科
    $$('#chainPanel .cp-card').forEach((card) => {
      const code = card.dataset.code;
      card.addEventListener('mouseenter', () => setHoverCode(code));
      card.addEventListener('mouseleave', () => setHoverCode(null));
      card.addEventListener('click', (e) => {
        if (e.target.closest('a')) return;
        location.hash = 'c/' + encodeURIComponent(code);
      });
    });
    $$('#chainPanel .cp-food-chip').forEach((chip) => {
      const fid = chip.dataset.food;
      chip.addEventListener('mouseenter', () => {
        stageState.hoverFood = fid;
        chip.classList.add('hot');
      });
      chip.addEventListener('mouseleave', () => {
        stageState.hoverFood = null;
        chip.classList.remove('hot');
      });
    });

    // 挂载并启动唯一渲染器
    mountStageTo($('#habStageHost'), 'hab', h.id, null);
  }

  // ---------------------------------------------------------------- 视图三：单只生物百科（大舞台 + 精简右侧栏）
  function renderBioView(code) {
    const c = CR.get(code) || D.creatures[0];
    const idx = D.creatures.indexOf(c);
    const prev = D.creatures[(idx - 1 + D.creatures.length) % D.creatures.length];
    const next = D.creatures[(idx + 1) % D.creatures.length];
    const backHab = c.hab.includes(lastHabId) ? lastHabId : c.hab[0];
    const t = TPL.get(c.tpl);
    const assetDef = findAssetDef(c);

    // 舞台悬浮返回胶囊 + 左右轻巧翻页箭头
    const backBtn = $('#bioFloatBack');
    backBtn.href = `#hab/${encodeURIComponent(backHab)}`;
    backBtn.textContent = `← ${habName(backHab)}`;
    const prevBtn = $('#bioPrev');
    prevBtn.href = `#c/${encodeURIComponent(prev.code)}`;
    prevBtn.title = `上一只：${prev.code} ${prev.name}（快捷键 ←）`;
    const nextBtn = $('#bioNext');
    nextBtn.href = `#c/${encodeURIComponent(next.code)}`;
    nextBtn.title = `下一只：${next.code} ${next.name}（快捷键 →）`;

    // 挂载共享舞台到左侧大视口
    mountStageTo($('#bioStageHost'), 'bio', backHab, c.code);
    // 动态避开返回胶囊宽度，保证 badge 不重叠
    requestAnimationFrame(() => {
      const badge = $('#stageBadge');
      if (badge && backBtn) badge.style.left = `${Math.ceil(backBtn.getBoundingClientRect().width) + 20}px`;
    });

    // 舞台左下悬浮换色皮肤胶囊（仅已做多皮肤生物出现）
    const inst = stageState.actors[0];
    const skins = (assetDef && assetDef.skins) || [];
    const skinFloat = $('#bioSkinFloat');
    skinFloat.innerHTML = skins.length
      ? skins.map((sk, i) => `<button class="skin-btn ${i === 0 ? 'on' : ''}" data-skin="${i}"><i class="skin-dot" style="background:${sk.dot}"></i>${esc(sk.name)}</button>`).join('')
      : '';
    $$('.skin-btn', skinFloat).forEach((btn) => {
      btn.addEventListener('click', () => {
        const si = Number(btn.dataset.skin);
        if (inst && inst.applySkin) inst.applySkin(si);
        $$('.skin-btn', skinFloat).forEach((b) => b.classList.toggle('on', b === btn));
      });
    });

    // 右侧精简百科窄栏
    const eatsHtml = (c.eats || []).map((e) => CR.has(e) ? creatureTile(CR.get(e), '猎物') : foodChip(e)).join('');
    const eatenHtml = (eatenBy.get(c.code) || []).map((e) => creatureTile(CR.get(e), '天敌')).join('');
    const hostsHtml = (c.hosts || []).map((e) => creatureTile(CR.get(e), '宿主')).join('');
    const hostedHtml = (hostedBy.get(c.code) || []).map((e) => creatureTile(CR.get(e), '挂在身上')).join('');
    const withHtml = (withAll.get(c.code) || []).map(([o, how]) => {
      if (CR.has(o)) return creatureTile(CR.get(o), how);
      return foodChip(o);
    }).join('');

    const relBox = (title, html) => html ? `<div class="rel-box"><h3>${title}</h3><div class="rel-list">${html}</div></div>` : '';
    const relsGrid = [
      relBox('吃什么', eatsHtml),
      relBox('被谁吃', eatenHtml),
      relBox('挂在谁身上', hostsHtml),
      relBox('身上会挂着', hostedHtml),
      relBox('跟谁一起过', withHtml)
    ].filter(Boolean).join('');

    const signMain = c.sign || c.brief || '';
    const signTitle = c.sign ? '一眼认得出的动作' : '一句话特征';

    const techLines = [
      c.note ? `<p><b>做法要点：</b>${esc(c.note)}</p>` : '',
      t && t.how ? `<p><b>${esc(t.id)} 通用做法：</b>${esc(t.how)}</p>` : '',
      t && t.rule ? `<p><b>模板归属：</b>${esc(t.rule)}</p>` : '',
      c.variants && c.variants.length ? `<p><b>同类变体：</b></p><ul>${c.variants.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>` : ''
    ].filter(Boolean).join('');

    const wsLink = assetDef
      ? `<a class="nav-btn primary" style="height:26px;padding:0 9px" href="index.html?focus=${encodeURIComponent(assetDef.id)}&hab=${encodeURIComponent(backHab)}">去工坊 →</a>`
      : '';

    $('#bioCard').innerHTML = `
      <div class="bio-head-bar">
        <span class="bio-seq">${idx + 1} / ${D.creatures.length}</span>
        ${wsLink}
      </div>

      <div class="bio-title-row">
        <span class="bio-code">${esc(c.code)}</span>
        <h1>${esc(c.name)}</h1>
        <span class="pill st-${c.status}">${STATUS_TEXT[c.status] || c.status}</span>
        ${c.nicheProposal ? '<span class="pill st-proposal">吃食提案</span>' : ''}
      </div>

      <div class="bio-tags">
        ${c.hab.map((hid) => `<a class="tag-chip" href="#hab/${encodeURIComponent(hid)}">📍 ${esc(habName(hid))}</a>`).join('')}
        <span class="tag-chip tpl" title="${esc(t ? t.name : '')}">🧩 ${esc(c.tpl)} ${esc(t ? t.name : '')}</span>
        ${c.niche.map((nid) => {
          const n = NICHE.get(nid);
          const ico = (ML.nicheIcons && ML.nicheIcons[nid]) || '';
          return `<span class="tag-chip niche" style="background:${n ? n.color : '#64748b'}">${ico} ${esc(n ? n.label : nid)}</span>`;
        }).join('')}
        <span class="tag-chip">📏 ${esc(c.size)}</span>
      </div>

      ${signMain ? `<div class="bio-sign">
        <div class="bio-sign-lbl">${signTitle}</div>
        <div class="bio-sign-txt">${esc(signMain)}</div>
      </div>` : ''}

      ${relsGrid ? `<div class="bio-rels">${relsGrid}</div>` : ''}

      ${c.cycle ? `<div class="bio-cycle"><b>一生蜕变：</b>${esc(c.cycle)}</div>` : ''}

      <div class="bio-paras">
        ${c.look ? `<div class="para-box"><h3>长相</h3><p>${esc(c.look)}</p></div>` : (c.brief && c.sign ? `<div class="para-box"><h3>简述</h3><p>${esc(c.brief)}</p></div>` : '')}
        ${c.life ? `<div class="para-box"><h3>一天怎么过</h3><p>${esc(c.life)}</p></div>` : ''}
        ${c.motion ? `<div class="para-box"><h3>动作照什么来</h3><p>${esc(c.motion)}</p></div>` : ''}
      </div>

      ${techLines ? `<details class="bio-details">
        <summary>给做模型的人看（做法要点 · 模板${c.variants ? ' · 变体' : ''}）</summary>
        ${techLines}
      </details>` : ''}
    `;
    $('#bioCard').scrollTop = 0;
  }

  // ---------------------------------------------------------------- 面包屑与路由
  function updateCrumb(mode, arg) {
    const el = $('#crumb');
    if (mode === 'map') {
      el.innerHTML = `<span class="cur">世界生态地图</span><span class="muted" style="font-size:12px;font-weight:400">${D.habitats.length} 生境 · ${D.creatures.length} 生物</span>`;
    } else if (mode === 'hab') {
      const h = HAB.get(arg);
      el.innerHTML = `<a href="#map">世界生态地图</a><span class="sep">/</span><span class="cur">${esc(h ? `${h.code} ${h.name}` : arg)}</span>`;
    } else if (mode === 'bio') {
      const c = CR.get(arg);
      const hid = c && c.hab.includes(lastHabId) ? lastHabId : (c ? c.hab[0] : 'forest');
      el.innerHTML = `<a href="#map">世界生态地图</a><span class="sep">/</span><a href="#hab/${encodeURIComponent(hid)}">${esc(habName(hid))}</a><span class="sep">/</span><span class="cur">${esc(c ? `${c.code} ${c.name}` : arg)}</span>`;
    }
  }

  function applyRoute() {
    const raw = decodeURIComponent((location.hash || '#map').replace(/^#/, ''));
    const [kind, ...rest] = raw.split('/');
    const arg = rest.join('/');

    $('#viewMap').hidden = true;
    $('#viewHab').hidden = true;
    $('#viewBio').hidden = true;

    if (kind === 'hab' && HAB.has(arg)) {
      $('#viewHab').hidden = false;
      updateCrumb('hab', arg);
      renderHabView(arg);
    } else if (kind === 'c' && CR.has(arg)) {
      $('#viewBio').hidden = false;
      updateCrumb('bio', arg);
      renderBioView(arg);
    } else {
      stopStage();
      $('#viewMap').hidden = false;
      updateCrumb('map');
      buildWorldMap();
    }
  }

  // ---------------------------------------------------------------- 快速搜索下拉
  const qInput = $('#q');
  const qDrop = $('#searchDrop');

  function renderSearch(val) {
    const q = val.trim().toLowerCase();
    if (!q) { qDrop.classList.remove('open'); qDrop.innerHTML = ''; return; }
    const hits = [];
    for (const h of D.habitats) {
      if (`${h.code} ${h.name} ${h.id} ${h.rule}`.toLowerCase().includes(q)) {
        hits.push({ href: `#hab/${encodeURIComponent(h.id)}`, code: h.code, name: h.name, sub: '生境' });
      }
    }
    for (const c of D.creatures) {
      const hay = `${c.code} ${c.name} ${c.tpl} ${c.brief || ''} ${c.hab.map(habName).join(' ')} ${c.niche.join(' ')}`.toLowerCase();
      if (hay.includes(q)) {
        hits.push({ href: `#c/${encodeURIComponent(c.code)}`, code: c.code, name: c.name, sub: `${c.tpl} · ${habName(c.hab[0])}` });
      }
    }
    if (!hits.length) {
      qDrop.innerHTML = '<div class="sd-item"><span class="muted">没有找到匹配的生境或生物</span></div>';
    } else {
      qDrop.innerHTML = hits.slice(0, 14).map((it) =>
        `<a class="sd-item" href="${it.href}"><span class="sd-code">${esc(it.code)}</span><span class="sd-name">${esc(it.name)}</span><span class="sd-sub">${esc(it.sub)}</span></a>`
      ).join('');
    }
    qDrop.classList.add('open');
  }
  qInput.addEventListener('input', (e) => renderSearch(e.target.value));
  qInput.addEventListener('focus', (e) => renderSearch(e.target.value));
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-box')) qDrop.classList.remove('open');
  });
  qDrop.addEventListener('click', () => { qDrop.classList.remove('open'); qInput.value = ''; });

  // ---------------------------------------------------------------- 不显眼的速查抽屉（完整对照在 md）
  let refTab = 'niche';
  function renderRefBody() {
    const el = $('#refBody');
    if (refTab === 'niche') {
      let s = '<table class="ref-tbl"><thead><tr><th>生境</th>' + D.niches.map((n) => `<th>${esc(n.id)}</th>`).join('') + '</tr></thead><tbody>';
      for (const lid of LAYER_ORDER) {
        for (const h of D.habitats.filter((x) => x.layer === lid)) {
          const res = residentsOf(h.id);
          s += `<tr><td><a href="#hab/${encodeURIComponent(h.id)}">${esc(h.code)} ${esc(h.name)}</a></td>` +
            D.niches.map((n) => {
              const hit = res.filter((c) => c.niche.includes(n.id));
              if (!hit.length) return '<td class="empty">·</td>';
              return `<td>${hit.map((c) => `<a href="#c/${encodeURIComponent(c.code)}">${esc(c.code)}</a>`).join(' ')}</td>`;
            }).join('') + '</tr>';
        }
      }
      el.innerHTML = s + '</tbody></table>';
    } else if (refTab === 'tpl') {
      let s = '<table class="ref-tbl"><thead><tr><th>模板</th><th>名称</th><th>标杆 ★</th><th>同类</th></tr></thead><tbody>';
      for (const t of D.templates) {
        if (t.merged) { s += `<tr><td><code>${t.id}</code></td><td colspan="3" class="muted">并入 ${t.merged}</td></tr>`; continue; }
        const std = CR.get(t.std);
        const rest = D.creatures.filter((c) => c.tpl === t.id && c.code !== t.std);
        s += `<tr><td><code>${t.id}</code></td><td>${esc(t.name)}</td>` +
          `<td>${std ? `<a href="#c/${encodeURIComponent(std.code)}">${esc(std.code)} ${esc(std.name)}</a>` : '—'}</td>` +
          `<td>${rest.map((c) => `<a href="#c/${encodeURIComponent(c.code)}">${esc(c.code)}</a>`).join(' ') || '—'}</td></tr>`;
      }
      el.innerHTML = s + '</tbody></table>';
    } else {
      let s = '<table class="ref-tbl"><thead><tr><th>类型</th><th>从 → 到</th><th>说明</th></tr></thead><tbody>';
      for (const f of D.flows) {
        s += `<tr><td><b>${esc(f.kind)}</b></td><td><a href="#hab/${encodeURIComponent(f.from)}">${esc(habName(f.from))}</a> → <a href="#hab/${encodeURIComponent(f.to)}">${esc(habName(f.to))}</a></td><td>${esc(f.text)}</td></tr>`;
      }
      el.innerHTML = s + '</tbody></table>';
    }
  }
  function openRef() {
    renderRefBody();
    $('#refDrawer').classList.add('open');
    $('#refScrim').classList.add('open');
  }
  function closeRef() {
    $('#refDrawer').classList.remove('open');
    $('#refScrim').classList.remove('open');
  }
  $('#btnRef').addEventListener('click', openRef);
  $('#refClose').addEventListener('click', closeRef);
  $('#refScrim').addEventListener('click', closeRef);
  $$('#refTabs button').forEach((b) => b.addEventListener('click', () => {
    refTab = b.dataset.rt;
    $$('#refTabs button').forEach((x) => x.classList.toggle('on', x === b));
    renderRefBody();
  }));
  $('#refBody').addEventListener('click', (e) => { if (e.target.closest('a')) closeRef(); });

  // ---------------------------------------------------------------- 键盘快捷键
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    if (e.key === 'Escape') { closeRef(); return; }
    if (e.key.toLowerCase() === 's' && stageState.running) {
      stageState.patrol = !stageState.patrol;
      syncStageControls();
    }
    if (stageState.mode === 'bio' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const idx = D.creatures.findIndex((c) => c.code === stageState.bioCode);
      if (idx >= 0) {
        const nextIdx = (idx + (e.key === 'ArrowRight' ? 1 : -1) + D.creatures.length) % D.creatures.length;
        location.hash = 'c/' + encodeURIComponent(D.creatures[nextIdx].code);
      }
    }
  });

  // 一键收起 / 展开右侧栏（把大舞台随时全屏拉满）
  function bindSideToggle(btnId, wsId) {
    const btn = $(btnId), ws = $(wsId);
    if (!btn || !ws) return;
    btn.addEventListener('click', () => {
      const collapsed = ws.classList.toggle('side-collapsed');
      btn.textContent = collapsed ? '‹' : '›';
      setTimeout(fitSharedStage, 200);
    });
  }
  bindSideToggle('#toggleHabSide', '#habWorkspace');
  bindSideToggle('#toggleBioSide', '#bioWorkspace');

  // ---------------------------------------------------------------- 调试与压测接口
  window.__ECO_DEBUG__ = {
    renderer,
    getState: () => ({
      mode: stageState.mode,
      habId: stageState.habId,
      bioCode: stageState.bioCode,
      running: stageState.running,
      actorCount: stageState.actors.length,
      madeCount: stageState.actors.filter((a) => !a.isPlaceholder).length,
      placeholderCount: stageState.actors.filter((a) => a.isPlaceholder).length,
      perf: stageState.perfSnap,
      cache: renderer.cacheInfo()
    }),
    // 满负荷实测当前生境舞台每帧耗时（同 tools/bench.js 测法，含 GPU）
    benchCurrentStage(frames = 90) {
      if (!stageState.running) return null;
      const platform = buildHabitatPlatform(stageState.habId, makeCanvas, 200);
      const probe = makeCanvas(1, 1);
      const pctx = probe.getContext('2d');
      const flush = () => pctx.drawImage(stageCv, 0, 0, 1, 1, 0, 0, 1, 1);
      // 预热 30 帧让图集热起来
      for (let i = 0; i < 30; i++) {
        stageState.animTime += SIM_STEP;
        simulateStage(SIM_STEP);
        renderer.renderScene(platform, stageState.actors, stageState.animTime);
        drawStageOverlay();
      }
      flush(); pctx.getImageData(0, 0, 1, 1);
      const cpu = [];
      const T0 = performance.now();
      for (let i = 0; i < frames; i++) {
        const t0 = performance.now();
        stageState.animTime += SIM_STEP;
        simulateStage(SIM_STEP);
        renderer.renderScene(platform, stageState.actors, stageState.animTime);
        drawStageOverlay();
        flush();
        cpu.push(performance.now() - t0);
      }
      pctx.getImageData(0, 0, 1, 1);
      const total = performance.now() - T0;
      cpu.sort((a, b) => a - b);
      const frameMs = total / frames;
      return {
        habId: stageState.habId,
        count: stageState.actors.length,
        made: stageState.actors.filter((a) => !a.isPlaceholder).length,
        placeholder: stageState.actors.filter((a) => a.isPlaceholder).length,
        canvas: `${stageCv.width}×${stageCv.height}`,
        artPx: renderer.artPx,
        frameMs: +frameMs.toFixed(2),
        fps: Math.round(1000 / frameMs),
        cpuMs: +(cpu.reduce((s, x) => s + x, 0) / cpu.length).toFixed(2),
        p95Ms: +cpu[Math.floor(cpu.length * 0.95)].toFixed(2),
        ...renderer.cacheInfo()
      };
    }
  };

  // ---------------------------------------------------------------- 启动
  $('#statusLegend').innerHTML = Object.entries(STATUS_TEXT)
    .map(([k, lbl]) => `<span><i class="st-dot" style="background:${STATUS_COLOR[k]}"></i>${lbl}</span>`)
    .join('');

  window.addEventListener('hashchange', applyRoute);
  if (!location.hash) location.replace('#map');
  applyRoute();
})();

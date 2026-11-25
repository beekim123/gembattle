'use strict';

// =============================================================================
// 工坊界面（只管界面和主循环，不放任何资产逻辑）
//   左：资产库 = 制作清单（app/catalog.js，从 文档/生物图鉴与逐只精制规划.md 生成）+ 已登记的资产
//   中：预览台（多只同屏、压测）+ 左上角半透明性能浮层（app/perf-hud.js，P 键 折叠 / 展开 / 隐藏）
//   右：焦点资产的属性 / 展示动作 / 换色 / 调参 / 导出 / 压测
// 网址参数：?focus=资产id  &hab=生境id  &bench=1（打开就跑一轮压测）
// =============================================================================
(function initWorkshop() {
  const PW = window.PixelWorkshop;
  const { TAU, clamp } = PW.Math;
  const { HABITAT_DEFS, HABITAT_MAP, buildHabitatPlatform } = PW.Habitats;
  const { makeCanvas, StackRenderer } = PW.Renderer;
  const { computeEcoAvoidance } = PW.Behaviors;
  const Assets = PW.Assets;
  const Catalog = PW.Catalog || { groups: [], items: [], knownAssets: {} };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const STATUS_LABEL = { todo: '待做', draft: '初版', done: '精制完成' };
  const STORE_KEY = 'pw-workshop-v2';
  const SIM_STEP = 1 / 120;   // 逻辑最长一步 1/120 秒：60Hz / 120Hz 屏幕上手感一致

  // ---------------------------------------------------------------- 资产 ↔ 清单
  for (const [code, id] of Object.entries(Catalog.knownAssets || {})) {
    if (Assets.byId[id] && !Assets.byId[id].code) Assets.byId[id].code = code;
    else if (Assets.byId[id]) Assets.byId[id].code = code;
  }
  const defByCode = {};
  for (const d of Assets.list) if (d.code) defByCode[d.code] = d;
  const assetTimes = Object.assign(Object.create(null), Catalog.assetTimes || {});
  const typeGroupList = Catalog.typeGroups || [];
  const catTemplates = Catalog.templates || { npc: [], building: [], scene: [], vfx: [] };

  function fmtShortTime(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function timeOfDef(def, fallbackItem) {
    const t = (def && assetTimes[def.id]) || null;
    if (t) return { createdAt: t.createdAt || 0, updatedAt: t.updatedAt || 0, createdLabel: t.createdLabel || '', updatedLabel: t.updatedLabel || '' };
    if (fallbackItem && (fallbackItem.createdAt || fallbackItem.updatedAt)) {
      return { createdAt: fallbackItem.createdAt || 0, updatedAt: fallbackItem.updatedAt || 0, createdLabel: fallbackItem.createdLabel || '', updatedLabel: fallbackItem.updatedLabel || '' };
    }
    return { createdAt: 0, updatedAt: 0, createdLabel: '', updatedLabel: '' };
  }

  const catItems = Catalog.items.map((it, idx) => {
    const def = defByCode[it.code] || null;
    let status = it.status;
    if (def) status = (def.status === 'done' || it.status === 'done') ? 'done' : 'draft';
    const tm = timeOfDef(def, it);
    return { ...it, _origIdx: idx, def, status, ...tm };
  });

  // 实时从静态服务 HEAD 响应头读取每个脚本最新的 Last-Modified，
  // 哪怕刚新增/修改完脚本没跑 sync-catalog.js，刷新页面也能精准把最新修改排到最前！
  function refreshLiveTimestamps() {
    if (!location.protocol.startsWith('http')) return;
    const jobs = Assets.list.filter(d => d._scriptSrc).map(async (d) => {
      try {
        const res = await fetch(d._scriptSrc, { method: 'HEAD', cache: 'no-store' });
        const lm = res.headers.get('Last-Modified');
        if (!lm) return false;
        const ms = Date.parse(lm);
        if (!Number.isFinite(ms) || ms <= 0) return false;
        const prev = assetTimes[d.id] || {};
        const createdAt = prev.createdAt || ms;
        const updatedAt = Math.max(prev.updatedAt || 0, ms);
        const changed = updatedAt !== prev.updatedAt || createdAt !== prev.createdAt;
        assetTimes[d.id] = {
          file: d._scriptSrc,
          createdAt,
          updatedAt,
          createdLabel: fmtShortTime(createdAt),
          updatedLabel: fmtShortTime(updatedAt)
        };
        return changed;
      } catch (e) {
        return false;
      }
    });
    Promise.all(jobs).then((flags) => {
      if (!flags.some(Boolean)) return;
      for (const it of catItems) {
        if (!it.def) continue;
        Object.assign(it, timeOfDef(it.def, it));
      }
      renderLib();
      syncInspector();
    });
  }
  const madeCreatures = Assets.list.filter(d => d.category === 'creature');
  const orphanCreatures = madeCreatures.filter(d => !catItems.some(it => it.def === d));
  const habByName = {};
  for (const h of HABITAT_DEFS) { habByName[h.name] = h; habByName[h.short] = h; }

  // ---------------------------------------------------------------- 状态
  const saved = (() => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch (e) { return {}; } })();
  const qs = new URLSearchParams(location.search);

  const cv = $('view');
  const renderer = new StackRenderer(cv);
  const ui = {
    category: saved.category || 'creature',
    groupBy: saved.groupBy || 'type',         // 'type' | 'habitat' | 'flat'
    prevGroupBy: saved.prevGroupBy || 'type', // 选时间排序自动切平铺前记住的分组方式
    filter: saved.filter || 'all',            // 'all' | 'made' | 'done' | 'draft' | 'todo'
    typeFilter: saved.typeFilter || 'all',    // 'all' | 'M01'.. | 'N01'.. | 'B01'.. | 'S01'.. | 'habitat'
    sort: saved.sort || 'default',            // 'default' | 'updated-desc' | 'updated-asc' | 'created-desc' | 'created-asc'
    search: '',
    autoHabitat: saved.autoHabitat !== false,
    autoSpin: false,
    perfHud: saved.perfHud || 'mini',
    plan: null           // 正在看的「待做」清单条目或模板条目
  };
  let lastFilteredDefs = [];
  let habitatId = qs.get('hab') || saved.habitatId || (madeCreatures[0] && madeCreatures[0].defaultHabitat) || 'forest';
  if (!HABITAT_MAP[habitatId]) habitatId = 'forest';
  const params = { gaitFreq: 1, tailFlex: 1, springiness: 1, speed: 1, scaleMul: 1 };

  const onStage = [];               // 台上的实例
  const templates = new Map();      // 资产 id → 第一个实例（克隆共用它的部件和烘焙缓存）
  const skinIdx = Object.create(null);
  let focus = null;                 // 焦点实例
  let activeUiPack = null;          // 当前正在预览的 UI/贴图包
  const UI_PACKS = (PW.UiPackViewer && PW.UiPackViewer.UI_PACKS) || [];
  const UI_PACK_BY_ID = (PW.UiPackViewer && PW.UiPackViewer.UI_PACK_BY_ID) || {};

  function clearUiPack() {
    if (!activeUiPack) return;
    activeUiPack = null;
    if (PW.UiPackViewer) PW.UiPackViewer.stopAnim();
    const st = $('uiPackStage');
    if (st) st.classList.remove('show');
  }

  function selectUiPack(id) {
    const pack = UI_PACK_BY_ID[id];
    if (!pack) return;
    activeUiPack = pack;
    ui.plan = null;
    if (PW.UiPackViewer) PW.UiPackViewer.renderPack($('uiPackStage'), pack, makeCanvas);
    renderLib();
    syncInspector();
    banner(`已加载 ${pack.code} · ${pack.name}`);
  }
  let spawnSeq = 0;
  let thTarget = saved.th ?? 0.56;
  renderer.th = thTarget;
  renderer.zoom = saved.zoom ?? 0;
  if (saved.mode) renderer.setRenderMode(saved.mode, HABITAT_MAP[habitatId]);
  let drag = null;
  let bannerTimer = 0;
  let paused = false;

  function saveState() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        category: ui.category, groupBy: ui.groupBy, prevGroupBy: ui.prevGroupBy, filter: ui.filter,
        typeFilter: ui.typeFilter, sort: ui.sort,
        habitatId, autoHabitat: ui.autoHabitat,
        focusId: focus ? focus.def.id : null,
        stageIds: [...new Set(onStage.filter(a => !a.isClone).map(a => a.def.id))],
        mode: renderer.getRenderMode(), zoom: renderer.zoom, th: thTarget, perfHud: ui.perfHud
      }));
    } catch (e) { /* 存不了就算了 */ }
  }

  function banner(msg, dur = 1.3) {
    const b = $('banner');
    b.textContent = msg;
    b.classList.add('show');
    bannerTimer = dur;
  }

  // ---------------------------------------------------------------- 实例
  function spawn(def, asClone) {
    const tpl = templates.get(def.id);
    const inst = Assets.spawn(def, { seed: 17 + (spawnSeq++) * 31 }, tpl);
    if (!tpl) templates.set(def.id, inst);
    inst.isClone = !!asClone;
    inst.action = def.actions[0].id;
    inst.actionTime = 0;
    const si = skinIdx[def.id] || 0;
    if (si && inst.applySkin) inst.applySkin(si);
    return inst;
  }

  function homeOf(i, n) {
    if (n <= 1) return [0, 0, 0];
    let ring, ang;
    if (n <= 8) {
      ring = 28; ang = (i / n) * TAU + 0.35;
    } else {
      const per = [6, 12, 18, 24, 30];
      let k = i, r = 0, before = 0;
      while (r < per.length - 1 && k >= per[r]) { k -= per[r]; before += per[r]; r++; }
      const cnt = Math.min(per[r], n - before);
      ring = 18 + r * 16; ang = (k / cnt) * TAU + r * 0.4;
    }
    return [Math.cos(ang) * ring, Math.sin(ang) * ring, ang + Math.PI * 0.5];
  }

  function relayout() {
    const n = onStage.length;
    onStage.forEach((a, i) => { const [x, y, yaw] = homeOf(i, n); a.reset(x, y, yaw); });
    renderer.vfx.clear();
  }

  function setStage(defs, focusDef) {
    clearUiPack();
    onStage.length = 0;
    for (const d of defs) onStage.push(spawn(d));
    focus = onStage.find(a => a.def === focusDef) || onStage[0] || null;
    ui.plan = null;
    relayout();
    syncAll();
  }

  function focusDef(def, announce = true) {
    if (!def) return;
    clearUiPack();
    const existing = onStage.find(a => a.def === def);
    if (existing && onStage.length > 1) {
      focus = existing;
      ui.plan = null;
      syncAll();
      if (announce) banner(`焦点 · ${def.name}`);
      return;
    }
    if (ui.autoHabitat && def.defaultHabitat && HABITAT_MAP[def.defaultHabitat]) setHabitat(def.defaultHabitat, false);
    setStage([def], def);
    if (announce) banner(`${def.code ? def.code + ' · ' : ''}${def.name}（${HABITAT_MAP[habitatId].short}）`);
  }

  function toggleOnStage(def) {
    const idx = onStage.findIndex(a => a.def === def && !a.isClone);
    if (idx >= 0) {
      if (onStage.length <= 1) { banner('台上至少留 1 只'); return; }
      const removed = onStage.splice(idx, 1)[0];
      if (focus === removed) focus = onStage[0];
    } else {
      const inst = spawn(def);
      onStage.push(inst);
      focus = inst;
    }
    ui.plan = null;
    relayout();
    syncAll();
  }

  function crowd(n) {
    const pool = madeCreatures;
    if (!pool.length) return;
    onStage.length = 0;
    for (let i = 0; i < n; i++) {
      const def = pool[i % pool.length];
      onStage.push(spawn(def, i >= pool.length));
    }
    focus = onStage[0];
    ui.plan = null;
    relayout();
    syncAll();
    banner(`压测 · 同屏 ${n} 只（${Math.min(n, pool.length)} 种，同种共用部件和缓存）`, 1.8);
  }

  function setHabitat(id, announce = true) {
    if (!HABITAT_MAP[id]) return;
    clearUiPack();
    habitatId = id;
    renderer.renderSky(HABITAT_MAP[id]);
    renderer.vfx.clear();
    syncAll();
    if (announce) banner(`生境 · ${HABITAT_MAP[id].code} ${HABITAT_MAP[id].name}`);
  }

  function nativesOf(hid) { return madeCreatures.filter(d => d.defaultHabitat === hid); }

  function setAction(inst, actId) {
    const targets = inst ? [inst] : onStage;
    for (const a of targets) {
      const ok = a.def.actions.find(x => x.id === actId);
      if (!ok) continue;
      a.action = actId;
      a.actionTime = 0;
    }
    syncInspector();
  }

  function applySkinToDef(def, idx) {
    const n = def.skins ? def.skins.length : 0;
    if (!n) return;
    const si = ((idx % n) + n) % n;
    skinIdx[def.id] = si;
    let sk = null;
    for (const a of onStage) if (a.def === def && a.applySkin) sk = a.applySkin(si);
    const tpl = templates.get(def.id);
    if (tpl && !onStage.includes(tpl) && tpl.applySkin) tpl.applySkin(si);
    syncAll();
    if (sk) banner(`换色 · ${def.name} · ${sk.name}`);
  }

  // ---------------------------------------------------------------- 左栏：资产库（类型分类 / 筛选 / 时间正倒序）
  function catCounts() {
    const made = (c) => Assets.list.filter(d => d.category === c).length;
    const tplCount = (c) => (catTemplates[c] || []).length;
    return {
      creature: `${madeCreatures.length}/${catItems.length + orphanCreatures.length}`,
      npc: `${made('npc')}/${Math.max(made('npc'), tplCount('npc'))}`,
      building: `${made('building')}/${Math.max(made('building'), tplCount('building'))}`,
      scene: `${HABITAT_DEFS.length}+${made('scene')}/${Math.max(made('scene'), tplCount('scene'))}`
    };
  }

  function renderCatTabs() {
    const counts = catCounts();
    const tabs = [
      ...Assets.CATEGORIES.map(c => ({ id: c.id, name: c.name, cnt: counts[c.id] })),
      { id: 'uipacks', name: 'UI贴图', cnt: `${UI_PACKS.length}/${UI_PACKS.length}` }
    ];
    $('catTabs').innerHTML = tabs.map(t =>
      `<button data-cat="${t.id}" class="${ui.category === t.id ? 'on' : ''}"><b>${t.name}</b><span>${t.cnt}</span></button>`
    ).join('');
    $('catTabs').querySelectorAll('button').forEach(b => {
      b.onclick = () => {
        if (ui.category !== b.dataset.cat) {
          ui.category = b.dataset.cat;
          ui.typeFilter = 'all';
        }
        if (ui.category === 'uipacks' && UI_PACKS.length && !activeUiPack) {
          selectUiPack(UI_PACKS[0].id);
          saveState();
          return;
        }
        if (ui.category !== 'uipacks') clearUiPack();
        renderLib();
        syncInspector();
        saveState();
      };
    });
  }

  function matches(text) {
    const q = ui.search.trim().toLowerCase();
    return !q || text.toLowerCase().includes(q);
  }

  function passStatus(status, hasDef) {
    if (ui.filter === 'all') return true;
    if (ui.filter === 'made') return !!hasDef;
    if (ui.filter === 'done') return !!hasDef && status === 'done';
    if (ui.filter === 'draft') return !!hasDef && status === 'draft';
    if (ui.filter === 'todo') return !hasDef || status === 'todo';
    return true;
  }

  function sortEntries(arr) {
    if (ui.sort === 'default') return arr;
    const isCreated = ui.sort.startsWith('created');
    const isDesc = ui.sort.endsWith('desc');
    const key = isCreated ? 'createdAt' : 'updatedAt';
    return [...arr].sort((a, b) => {
      const ta = a[key] || 0;
      const tb = b[key] || 0;
      if (ta && tb) return isDesc ? (tb - ta) : (ta - tb);
      if (ta && !tb) return -1;
      if (!ta && tb) return 1;
      return (a._origIdx ?? 0) - (b._origIdx ?? 0);
    });
  }

  function sortGroups(groupsWithItems) {
    if (ui.sort === 'default') return groupsWithItems;
    const isCreated = ui.sort.startsWith('created');
    const isDesc = ui.sort.endsWith('desc');
    const key = isCreated ? 'createdAt' : 'updatedAt';
    const stampOf = (items) => {
      let best = 0;
      for (const it of items) {
        const v = it[key] || 0;
        if (!v) continue;
        if (!best || (isDesc ? v > best : v < best)) best = v;
      }
      return best;
    };
    return [...groupsWithItems].sort((a, b) => {
      const ta = stampOf(a.vis);
      const tb = stampOf(b.vis);
      if (ta && tb) return isDesc ? (tb - ta) : (ta - tb);
      if (ta && !tb) return -1;
      if (!ta && tb) return 1;
      return a.origIdx - b.origIdx;
    });
  }

  function timeBadgeHtml(it) {
    if (!it.createdAt && !it.updatedAt) return '';
    if (ui.sort.startsWith('created')) return `<span class="li-time" title="创建时间">建 ${esc(it.createdLabel)}</span>`;
    if (ui.sort.startsWith('updated')) return `<span class="li-time" title="修改时间">改 ${esc(it.updatedLabel)}</span>`;
    return `<span class="li-time" title="创建时间 ${esc(it.createdLabel)} / 修改时间 ${esc(it.updatedLabel)}">${esc(it.createdLabel)}</span>`;
  }

  function actionChips(def) {
    if (!def) return '';
    return `<div class="li-acts">${def.actions.map(a => `<span class="li-act ${a.status === 'done' ? '' : (a.status || 'draft')}">${esc(a.name)}</span>`).join('')}</div>`;
  }

  function creatureRow(it) {
    const def = it.def;
    const onIt = def && onStage.some(a => a.def === def);
    const focused = (def && focus && focus.def === def) || (ui.plan && ui.plan === it);
    const name = def ? def.name : (it.nick || it.ref);
    const sub = def
      ? `${it.ref} · ${HABITAT_MAP[def.defaultHabitat] ? HABITAT_MAP[def.defaultHabitat].short : ''}`
      : `${it.ref} · ${it.size} · ${(it.habitats || []).join(' / ')}`;
    const showTypeTag = ui.groupBy !== 'type' && it.typeCode;
    return `<div class="lib-item ${it.status}${focused ? ' focused' : ''}" data-code="${esc(it.code)}">
      <input type="checkbox" ${onIt ? 'checked' : ''} ${def ? '' : 'disabled'} title="${def ? '勾选放上台（多只同屏）' : '还没做'}">
      <div class="li-main">
        <div class="li-name"><span class="code">${esc(it.code)}</span>${showTypeTag ? `<span class="li-type-tag">${esc(it.typeCode)}</span>` : ''}<span class="nm">${esc(name)}</span></div>
        <div class="li-sub">${esc(sub)}</div>
        ${def ? actionChips(def) : ''}
      </div>
      <div class="li-right">
        <span class="st ${it.status}">${STATUS_LABEL[it.status]}</span>
        ${timeBadgeHtml(it)}
      </div>
    </div>`;
  }

  function templateRow(tpl) {
    const def = tpl.def || null;
    const onIt = def && onStage.some(a => a.def === def);
    const focused = (def && focus && focus.def === def) || (ui.plan && ui.plan === tpl);
    const name = def ? def.name : tpl.name;
    const sub = def ? `${tpl.typeName} · ${def.id}` : `${tpl.typeName} · 覆盖：${tpl.covers}`;
    return `<div class="lib-item ${tpl.status}${focused ? ' focused' : ''}" data-tpl="${esc(tpl.code)}"${def ? ` data-id="${esc(def.id)}"` : ''}>
      <input type="checkbox" ${onIt ? 'checked' : ''} ${def ? '' : 'disabled'} title="${def ? '勾选放上台' : '待做模板'}">
      <div class="li-main">
        <div class="li-name"><span class="code">${esc(tpl.code)}</span><span class="nm">${esc(name)}</span></div>
        <div class="li-sub">${esc(sub)}</div>
        ${def ? actionChips(def) : ''}
      </div>
      <div class="li-right">
        <span class="st ${tpl.status}">${STATUS_LABEL[tpl.status] || '待做'}</span>
        ${timeBadgeHtml(tpl)}
      </div>
    </div>`;
  }

  function orphanRow(def) {
    const onIt = onStage.some(a => a.def === def);
    const focused = focus && focus.def === def;
    const tm = timeOfDef(def);
    const habShort = HABITAT_MAP[def.defaultHabitat] ? HABITAT_MAP[def.defaultHabitat].short : '';
    const tplMatch = /\b(M\d+)\b/.exec(def.tag || '');
    const tplTag = tplMatch ? `<span class="li-type-tag">${esc(tplMatch[1])}</span>` : '';
    const sub = [def.tag || def.id, habShort].filter(Boolean).join(' · ');
    return `<div class="lib-item ${def.status || 'draft'}${focused ? ' focused' : ''}" data-id="${esc(def.id)}">
      <input type="checkbox" ${onIt ? 'checked' : ''} title="勾选放上台">
      <div class="li-main">
        <div class="li-name"><span class="code">${esc(def.code || '—')}</span>${tplTag}<span class="nm">${esc(def.name)}</span></div>
        <div class="li-sub">${esc(sub)}</div>
        ${actionChips(def)}
      </div>
      <div class="li-right">
        <span class="st ${def.status || 'draft'}">${STATUS_LABEL[def.status] || '初版'}</span>
        ${timeBadgeHtml(tm)}
      </div>
    </div>`;
  }

  function buildCategoryEntries(catId) {
    const tpls = (catTemplates[catId] || []).map((t, idx) => {
      const def = Assets.byId[t.suggestedId] || Assets.list.find(d => d.category === catId && d.code === t.code) || null;
      const status = def ? (def.status === 'done' ? 'done' : 'draft') : (t.status || 'todo');
      const tm = timeOfDef(def);
      return { ...t, _origIdx: idx, def, status, isCategoryTemplate: true, ...tm };
    });
    const matchedDefs = new Set(tpls.map(t => t.def).filter(Boolean));
    const extras = Assets.list.filter(d => d.category === catId && !matchedDefs.has(d)).map((d, i) => ({
      code: d.code || '—',
      category: catId,
      typeCode: d.code || 'EXTRA',
      typeName: '自定义资产',
      typeLabel: '自定义资产',
      name: d.name,
      suggestedId: d.id,
      covers: d.tag || '',
      spec: d.summary || '',
      status: d.status || 'draft',
      _origIdx: 1000 + i,
      def: d,
      isCategoryTemplate: true,
      ...timeOfDef(d)
    }));
    return [...tpls, ...extras];
  }

  function syncLibControls() {
    $('libGroupBy').querySelectorAll('button').forEach(b => {
      b.classList.toggle('on', b.dataset.g === ui.groupBy);
      if (b.dataset.g === 'habitat') {
        b.style.display = (ui.category === 'creature' || ui.category === 'scene') ? '' : 'none';
      }
    });
    $('libFilter').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.f === ui.filter));
    $('libSort').value = ui.sort;

    const sel = $('libTypeFilter');
    let opts = [{ val: 'all', text: '全部类型' }];
    if (ui.category === 'creature') {
      for (const tg of typeGroupList) {
        const allIn = catItems.filter(it => it.typeCode === tg.code);
        const madeIn = allIn.filter(it => !!it.def).length;
        opts.push({ val: tg.code, text: `${tg.code} ${tg.name} (${madeIn}/${allIn.length})` });
      }
    } else if (ui.category === 'scene') {
      opts.push({ val: 'habitat', text: `生境地台 (${HABITAT_DEFS.length})` });
      for (const t of (catTemplates.scene || [])) {
        opts.push({ val: t.code, text: `${t.code} ${t.typeName}` });
      }
    } else {
      for (const t of (catTemplates[ui.category] || [])) {
        opts.push({ val: t.code, text: `${t.code} ${t.typeName}` });
      }
    }
    if (!opts.some(o => o.val === ui.typeFilter)) ui.typeFilter = 'all';
    sel.innerHTML = opts.map(o => `<option value="${esc(o.val)}">${esc(o.text)}</option>`).join('');
    sel.value = ui.typeFilter;
  }

  function renderLib() {
    renderCatTabs();
    syncLibControls();
    const list = $('libList');
    let html = '';
    let shown = 0, total = 0;
    lastFilteredDefs = [];
    let activeTemplates = [];

    if (ui.category === 'creature') {
      total = catItems.length + orphanCreatures.length;
      const visItems = catItems.filter(it =>
        passStatus(it.status, !!it.def) &&
        (ui.typeFilter === 'all' || it.typeCode === ui.typeFilter) &&
        matches([it.code, it.typeCode, it.typeName, it.nick, it.ref, it.size, it.look, it.habit, (it.habitats || []).join(' '), it.def ? it.def.name : ''].join(' '))
      );
      const visOrphans = orphanCreatures.filter(d =>
        passStatus(d.status || 'draft', true) &&
        ui.typeFilter === 'all' &&
        matches([d.code || '', d.name, d.id, d.tag || '', d.summary || ''].join(' '))
      ).map((d, i) => ({ _origIdx: 9000 + i, isOrphan: true, def: d, ...timeOfDef(d) }));

      const combinedFlat = sortEntries([...visItems, ...visOrphans]);
      lastFilteredDefs = combinedFlat.map(it => it.def).filter(Boolean);
      shown = visItems.length + visOrphans.length;

      if (ui.groupBy === 'flat') {
        if (combinedFlat.length) {
          const title = ui.sort === 'default' ? '全部怪物（平铺）' : `按时间排序（${$('libSort').selectedOptions[0].textContent}）`;
          html += `<div class="lib-group"><div class="lib-group-title"><span>${esc(title)}</span><span>${combinedFlat.length}</span></div>${combinedFlat.map(it => it.isOrphan ? orphanRow(it.def) : creatureRow(it)).join('')}</div>`;
        }
      } else if (ui.groupBy === 'type') {
        const blocks = [];
        typeGroupList.forEach((tg, origIdx) => {
          const allIn = catItems.filter(it => it.typeCode === tg.code);
          const vis = sortEntries(visItems.filter(it => it.typeCode === tg.code));
          if (!vis.length) return;
          blocks.push({ origIdx, label: tg.label, tip: tg.spec || '', madeN: allIn.filter(it => !!it.def).length, allN: allIn.length, vis });
        });
        const ungrouped = sortEntries(visItems.filter(it => !typeGroupList.some(tg => tg.code === it.typeCode)));
        if (ungrouped.length) {
          blocks.push({ origIdx: 999, label: '其他类型', tip: '', madeN: ungrouped.filter(it => !!it.def).length, allN: ungrouped.length, vis: ungrouped });
        }
        if (visOrphans.length) {
          blocks.push({ origIdx: -1, label: '生态扩展新模板（M18~M38）', tip: '异世界生态新增模板标杆', madeN: visOrphans.length, allN: visOrphans.length, vis: sortEntries(visOrphans), isOrphanGroup: true });
        }
        for (const blk of sortGroups(blocks)) {
          html += `<div class="lib-group"><div class="lib-group-title" title="${esc(blk.tip)}"><span>${esc(blk.label)}</span><span>${blk.madeN}/${blk.allN}</span></div>${blk.vis.map(it => blk.isOrphanGroup ? orphanRow(it.def) : creatureRow(it)).join('')}</div>`;
        }
      } else {
        const blocks = [];
        Catalog.groups.forEach((g, origIdx) => {
          const rows = catItems.filter(it => it.group === g);
          const vis = sortEntries(visItems.filter(it => it.group === g));
          if (!vis.length) return;
          blocks.push({ origIdx, label: g, tip: '', madeN: rows.filter(it => !!it.def).length, allN: rows.length, vis });
        });
        if (visOrphans.length) {
          blocks.push({ origIdx: -1, label: '生态扩展新模板（M18~M38）', tip: '', madeN: visOrphans.length, allN: visOrphans.length, vis: sortEntries(visOrphans), isOrphanGroup: true });
        }
        for (const blk of sortGroups(blocks)) {
          html += `<div class="lib-group"><div class="lib-group-title"><span>${esc(blk.label)}</span><span>${blk.madeN}/${blk.allN}</span></div>${blk.vis.map(it => blk.isOrphanGroup ? orphanRow(it.def) : creatureRow(it)).join('')}</div>`;
        }
      }
      $('libFoot').innerHTML = `来源：生物图鉴 + 全品类模板规划 · 改完跑 <code>node tools/sync-catalog.js</code>`;
    } else if (ui.category === 'scene') {
      const propEntries = buildCategoryEntries('scene');
      activeTemplates = propEntries;
      total = HABITAT_DEFS.length + propEntries.length;

      // 1. 场景摆件模板（S01~S05 + 已做摆件）
      if (ui.typeFilter !== 'habitat') {
        const visProps = sortEntries(propEntries.filter(p =>
          passStatus(p.status, !!p.def) &&
          (ui.typeFilter === 'all' || p.typeCode === ui.typeFilter) &&
          matches([p.code, p.typeName, p.name, p.covers, p.spec, p.suggestedId].join(' '))
        ));
        lastFilteredDefs = visProps.map(p => p.def).filter(Boolean);
        if (visProps.length) {
          shown += visProps.length;
          const madeP = propEntries.filter(p => !!p.def).length;
          html += `<div class="lib-group"><div class="lib-group-title"><span>场景摆件模板（S01~S05）</span><span>${madeP}/${propEntries.length}</span></div>${visProps.map(templateRow).join('')}</div>`;
        }
      }

      // 2. 18 种生境地台
      if ((ui.typeFilter === 'all' || ui.typeFilter === 'habitat') && (ui.filter === 'all' || ui.filter === 'made' || ui.filter === 'draft')) {
        const groups = [...new Set(HABITAT_DEFS.map(h => h.group))];
        if (ui.groupBy === 'flat') {
          const rows = HABITAT_DEFS.filter(h => matches([h.code, h.name, h.desc, h.group].join(' ')));
          if (rows.length) {
            shown += rows.length;
            html += `<div class="lib-group"><div class="lib-group-title"><span>18 种生境地台</span><span>${rows.length}</span></div>` +
              rows.map(h => {
                const nat = nativesOf(h.id).map(d => d.name).join('、');
                return `<div class="lib-item draft${h.id === habitatId ? ' focused' : ''}" data-hab="${h.id}">
                  <span></span>
                  <div class="li-main"><div class="li-name"><span class="code">${h.code}</span><span class="nm">${esc(h.name)}</span></div>
                  <div class="li-sub">${esc(nat ? '原住民：' + nat : h.desc)}</div></div>
                  <span class="st draft">地台</span></div>`;
              }).join('') + `</div>`;
          }
        } else {
          for (const g of groups) {
            const rows = HABITAT_DEFS.filter(h => h.group === g && matches([h.code, h.name, h.desc, h.group].join(' ')));
            if (!rows.length) continue;
            shown += rows.length;
            html += `<div class="lib-group"><div class="lib-group-title"><span>地台 · ${esc(g)}</span><span>${rows.length}</span></div>` +
              rows.map(h => {
                const nat = nativesOf(h.id).map(d => d.name).join('、');
                return `<div class="lib-item draft${h.id === habitatId ? ' focused' : ''}" data-hab="${h.id}">
                  <span></span>
                  <div class="li-main"><div class="li-name"><span class="code">${h.code}</span><span class="nm">${esc(h.name)}</span></div>
                  <div class="li-sub">${esc(nat ? '原住民：' + nat : h.desc)}</div></div>
                  <span class="st draft">地台</span></div>`;
              }).join('') + `</div>`;
          }
        }
      }
      $('libFoot').textContent = '场景环境：scenes/（18 种生境地台 + 5 类摆件模板）';
    } else if (ui.category === 'uipacks') {
      total = UI_PACKS.length;
      const vis = UI_PACKS.filter(p => matches([p.id, p.code, p.name, p.tag, p.file].join(' ')));
      shown = vis.length;
      if (vis.length) {
        html = `<div class="lib-group"><div class="lib-group-title"><span>UI 皮肤与 3D 特效贴图包（art-packs/）</span><span>${vis.length}/${total}</span></div>` +
          vis.map(p => {
            const focused = activeUiPack && activeUiPack.id === p.id;
            return `<div class="lib-item done${focused ? ' focused' : ''}" data-uipack="${esc(p.id)}">
              <span></span>
              <div class="li-main"><div class="li-name"><span class="code">${esc(p.code)}</span><span class="nm">${esc(p.name)}</span></div>
              <div class="li-sub">${esc(p.file)}</div></div>
              <span class="st done">已入库</span></div>`;
          }).join('') + `</div>`;
      }
      $('libFoot').textContent = 'UI 贴图包：art-packs/ 目录 · 点任一项即可实时高清预览全部离屏素材';
    } else {
      const cat = Assets.CATEGORIES.find(c => c.id === ui.category);
      const entries = buildCategoryEntries(ui.category);
      activeTemplates = entries;
      total = entries.length;
      const vis = sortEntries(entries.filter(it =>
        passStatus(it.status, !!it.def) &&
        (ui.typeFilter === 'all' || it.typeCode === ui.typeFilter) &&
        matches([it.code, it.typeName, it.name, it.covers, it.spec, it.suggestedId].join(' '))
      ));
      lastFilteredDefs = vis.map(it => it.def).filter(Boolean);
      shown = vis.length;
      if (vis.length) {
        if (ui.groupBy === 'flat') {
          html = `<div class="lib-group"><div class="lib-group-title"><span>${esc(cat.name)}列表</span><span>${vis.length}</span></div>${vis.map(templateRow).join('')}</div>`;
        } else {
          const madeN = entries.filter(e => !!e.def).length;
          html = `<div class="lib-group"><div class="lib-group-title"><span>${esc(cat.name)}模板（按类型）</span><span>${madeN}/${entries.length}</span></div>${vis.map(templateRow).join('')}</div>`;
        }
      } else {
        html = `<div class="lib-empty">没有符合当前筛选条件的${cat.name}。<br>新建脚本放进 <code>${cat.dir}</code>，末尾调用 <code>PW.Assets.register(Def, '${cat.id}')</code>，写法见 <code>${cat.dir}README.md</code>。</div>`;
      }
      $('libFoot').textContent = `${cat.name}：${cat.dir} 目录 · 模板来自 全品类模板规划与参考.md`;
    }

    list.innerHTML = html || `<div class="lib-empty">没有符合条件的条目。</div>`;
    $('libCount').textContent = `${shown}/${total}`;
    const btnStageF = $('btnStageFiltered');
    if (btnStageF) {
      btnStageF.disabled = lastFilteredDefs.length === 0;
      btnStageF.textContent = lastFilteredDefs.length ? `上台(${lastFilteredDefs.length})` : '上台';
    }

    list.querySelectorAll('.lib-item').forEach(row => {
      const cb = row.querySelector('input[type=checkbox]');
      const def = row.dataset.code
        ? (catItems.find(it => it.code === row.dataset.code) || {}).def
        : (row.dataset.id ? Assets.byId[row.dataset.id] : null);
      if (cb) cb.onclick = (e) => { e.stopPropagation(); if (def) toggleOnStage(def); };
      row.onclick = () => {
        if (row.dataset.uipack) { selectUiPack(row.dataset.uipack); return; }
        if (row.dataset.hab) { setHabitat(row.dataset.hab); return; }
        if (def) { focusDef(def); return; }
        if (row.dataset.tpl) {
          ui.plan = activeTemplates.find(t => t.code === row.dataset.tpl) || null;
        } else {
          ui.plan = catItems.find(it => it.code === row.dataset.code) || null;
        }
        renderLib();
        syncInspector();
      };
    });
  }

  // ---------------------------------------------------------------- 右栏
  function idPrefixOf(code) {
    const en = Object.keys(Assets.CODE_PREFIX).find(k => Assets.CODE_PREFIX[k] === code[0]) || 'special';
    return en + code.slice(1);
  }

  function syncInspector() {
    const secF = $('secFocus'), secA = $('secActions'), secS = $('secSkin');
    if (activeUiPack) {
      const p = activeUiPack;
      secF.innerHTML = `<div class="sec-t">UI / 特效贴图包 <span class="key">总工坊真源</span></div>
        <div class="focus-title"><span class="code">${esc(p.code)}</span><h2>${esc(p.name)}</h2><span class="st done">已入库</span></div>
        <div class="focus-sub">${esc(p.tag)}</div>
        <dl class="kv">
          <dt>文件路径</dt><dd><span class="code">${esc(p.file)}</span></dd>
          <dt>全局接口</dt><dd><span class="code">Code00ArtPacks.${esc(p.key)}</span></dd>
          <dt>校验状态</dt><dd>verify.mjs 全部通过</dd>
        </dl>`;
      secA.style.display = '';
      secA.innerHTML = `<div class="sec-t">完整独立验收页</div>
        <div class="row"><a class="btn primary sm" href="${esc(p.preview)}" target="_blank">打开 ${esc(p.code)} preview.html</a></div>`;
      secS.style.display = 'none';
      $('secParams').style.display = 'none';
      $('secExport').style.display = 'none';
      return;
    }
    if (ui.plan) {
      const it = ui.plan;
      if (it.isCategoryTemplate) {
        const catObj = Assets.CATEGORIES.find(c => c.id === it.category) || { name: '资产', dir: '' };
        secF.innerHTML = `<div class="sec-t">全品类模板规格</div>
          <div class="focus-title"><span class="code">${esc(it.code)}</span><h2>${esc(it.name)}</h2><span class="st ${it.status}">${STATUS_LABEL[it.status] || '待做'}</span></div>
          <div class="focus-sub">${esc(it.typeLabel)} · ${esc(catObj.name)}</div>
          <dl class="kv"><dt>建议脚本</dt><dd><span class="code">${esc(catObj.dir)}${esc(it.suggestedId)}.js</span></dd><dt>覆盖资产</dt><dd>${esc(it.covers)}</dd><dt>调试重点</dt><dd>${esc(it.spec)}</dd></dl>
          <div class="note">该模板还没制作。做的时候在 <b>${esc(catObj.dir)}</b> 新建脚本，末尾调用 <b>PW.Assets.register(Def, '${esc(it.category)}')</b>，并在 index.html 对应区加一行 script；完成后改 <b>文档/全品类模板规划与参考.md</b> 状态并跑 <code>node tools/sync-catalog.js</code>。</div>`;
      } else {
        const sugName = it.suggestedId || `${idPrefixOf(it.code)}_xxx`;
        secF.innerHTML = `<div class="sec-t">${it.isTemplateOnly ? '拓展骨架模板' : '清单条目'}</div>
          <div class="focus-title"><span class="code">${esc(it.code)}</span><h2>${esc(it.nick || it.ref)}</h2><span class="st ${it.status}">${STATUS_LABEL[it.status]}</span></div>
          <div class="focus-sub">${esc(it.ref)} · ${esc(it.typeLabel || it.group)}</div>
          <dl class="kv"><dt>模板类型</dt><dd>${esc(it.typeLabel || '—')}</dd><dt>生境分组</dt><dd>${esc(it.group)}</dd><dt>体型</dt><dd>${esc(it.size)}</dd><dt>外观要点</dt><dd>${esc(it.look)}</dd><dt>生态习性</dt><dd>${esc(it.habit)}</dd><dt>积木组合</dt><dd>${esc(it.blocks)}</dd></dl>
          <div class="tags">${(it.habitats || []).map(n => { const h = habByName[n]; return h ? `<button class="btn sm" data-hab="${h.id}">${h.code} ${esc(n)}</button>` : `<span class="chip">${esc(n)}</span>`; }).join('')}</div>
          <div class="note">还没做。做的时候：脚本放 <b>creatures/</b>，建议文件名与 id <b>${esc(sugName)}</b>，就会自动挂到这一条和对应模板类型下。</div>`;
      }
      secF.querySelectorAll('[data-hab]').forEach(b => { b.onclick = () => setHabitat(b.dataset.hab); });
      secA.style.display = 'none'; secS.style.display = 'none';
      $('secParams').style.display = 'none'; $('secExport').style.display = 'none';
      return;
    }
    secA.style.display = ''; secS.style.display = '';
    $('secParams').style.display = ''; $('secExport').style.display = '';
    if (!focus) { secF.innerHTML = '<div class="sec-t">焦点</div><div class="focus-sub">台上没有东西</div>'; return; }
    const def = focus.def;
    const it = catItems.find(x => x.def === def);
    const status = it ? it.status : (def.status || 'draft');
    const tm = timeOfDef(def, it);
    const timeStr = tm.createdLabel ? `建 ${tm.createdLabel} · 改 ${tm.updatedLabel}` : '—';
    secF.innerHTML = `<div class="sec-t">焦点${onStage.length > 1 ? `<span class="key">台上 ${onStage.length} 只，点左栏切换</span>` : ''}</div>
      <div class="focus-title"><span class="code">${esc(def.code || '—')}</span><h2>${esc(def.name)}</h2><span class="st ${status}">${STATUS_LABEL[status] || '初版'}</span></div>
      <div class="focus-sub">${esc(def.tag || '')}</div>
      <div class="note">${esc(def.summary || '')}${def.soulHabit ? `<br><b>专属习性：</b>${esc(def.soulHabit)}` : ''}</div>
      <div class="tags">${(def.blocks || []).map(b => `<span class="chip">${esc(b)}</span>`).join('')}</div>
      <dl class="kv">
        <dt>模板类型</dt><dd>${esc(it && it.typeLabel ? it.typeLabel : '—')}</dd>
        <dt>脚本</dt><dd><span class="code">${esc((Assets.CATEGORIES.find(c => c.id === def.category) || {}).dir || '')}${esc(def.id)}</span></dd>
        <dt>生境</dt><dd>${HABITAT_MAP[def.defaultHabitat] ? `${HABITAT_MAP[def.defaultHabitat].code} ${HABITAT_MAP[def.defaultHabitat].name}` : '通用'}</dd>
        <dt>时间</dt><dd><span style="font-family:var(--mono);font-size:11px">${esc(timeStr)}</span></dd>
      </dl>`;

    secA.innerHTML = `<div class="sec-t">展示动作 <span class="key">S 切巡游/待机</span></div>
      <div class="actions">${def.actions.map(a => `<div class="act-row${focus.action === a.id ? ' on' : ''}" data-act="${a.id}">
        <div><div class="nm">${esc(a.name)}</div><div class="meta">${a.loop ? '循环' : `单次 ${a.duration || '?'} 秒`} · ${esc(a.id)}</div></div>
        <span class="st ${a.status || 'draft'}">${STATUS_LABEL[a.status || 'draft']}</span></div>`).join('')}</div>
      <div class="row" style="margin-top:6px"><button class="btn sm" id="btnActAll">台上全部用这个动作</button></div>
      <div class="note">以后的技能展示加在脚本 Def 的 <b>actions</b> 里，脚本 update() 从 <b>eco.action</b> 读当前动作（见 README「加技能展示」）。</div>`;
    secA.querySelectorAll('.act-row').forEach(r => { r.onclick = () => setAction(focus, r.dataset.act); });
    $('btnActAll').onclick = () => setAction(null, focus.action);

    const si = skinIdx[def.id] || 0;
    secS.style.display = def.skins && def.skins.length ? '' : 'none';
    secS.innerHTML = `<div class="sec-t">换色 <span class="key">C</span></div>
      <div class="row">${(def.skins || []).map((sk, i) => `<button class="btn sm${i === si ? ' on' : ''}" data-skin="${i}"><span class="swatch" style="background:${sk.dot}"></span>${esc(sk.name)}</button>`).join('')}</div>`;
    secS.querySelectorAll('[data-skin]').forEach(b => { b.onclick = () => applySkinToDef(def, Number(b.dataset.skin)); });
  }

  const SLIDERS = [['slGaitFreq', 'vGaitFreq', 'gaitFreq'], ['slTailFlex', 'vTailFlex', 'tailFlex'], ['slSpring', 'vSpring', 'springiness'], ['slSpeed', 'vSpeed', 'speed'], ['slScale', 'vScale', 'scaleMul']];
  function syncSliders() {
    for (const [sl, v, k] of SLIDERS) { $(sl).value = params[k]; $(v).textContent = params[k].toFixed(2); }
  }

  function syncStage() {
    const sel = $('habSelect');
    if (!sel.options.length) {
      const groups = [...new Set(HABITAT_DEFS.map(h => h.group))];
      sel.innerHTML = groups.map(g => `<optgroup label="${esc(g)}">${HABITAT_DEFS.filter(h => h.group === g).map(h => `<option value="${h.id}">${h.code} ${esc(h.name)}</option>`).join('')}</optgroup>`).join('');
      sel.onchange = () => setHabitat(sel.value);
    }
    sel.value = habitatId;
    $('autoHab').checked = ui.autoHabitat;
    const kinds = new Set(onStage.map(a => a.def.id)).size;
    $('stageCount').textContent = `同屏 ${onStage.length}${kinds !== onStage.length ? `（${kinds} 种）` : ''}`;
    $('modeSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.mode === renderer.getRenderMode()));
    $('btnOutline').classList.toggle('on', renderer.useOutline);
    $('btnSpin').classList.toggle('on', ui.autoSpin);
    $('zoomLabel').textContent = `×${renderer.artPx}`;
  }

  function syncAll() {
    renderLib();
    syncInspector();
    syncStage();
    saveState();
  }

  // ---------------------------------------------------------------- 绑定
  $('libSearch').oninput = (e) => { ui.search = e.target.value; renderLib(); };
  $('libGroupBy').querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      ui.groupBy = b.dataset.g;
      if (ui.groupBy !== 'flat') ui.prevGroupBy = ui.groupBy;
      renderLib();
      saveState();
    };
  });
  $('libFilter').querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      ui.filter = b.dataset.f;
      renderLib();
      saveState();
    };
  });
  $('libTypeFilter').onchange = (e) => {
    ui.typeFilter = e.target.value;
    renderLib();
    saveState();
  };
  $('libSort').onchange = (e) => {
    const nextSort = e.target.value;
    if (nextSort !== 'default' && ui.groupBy !== 'flat') {
      // 选时间排序时自动切平铺，让最近新增/修改的直接排在列表最顶一眼可见（手动点回分组则按组内最新时间置顶）
      ui.prevGroupBy = ui.groupBy;
      ui.groupBy = 'flat';
    } else if (nextSort === 'default' && ui.groupBy === 'flat') {
      ui.groupBy = ui.prevGroupBy || 'type';
    }
    ui.sort = nextSort;
    renderLib();
    $('libList').scrollTop = 0;
    saveState();
  };
  $('btnStageFiltered').onclick = () => {
    if (!lastFilteredDefs.length) { banner('当前筛选结果里没有已做的资产'); return; }
    setStage(lastFilteredDefs, lastFilteredDefs[0]);
    banner(`已将当前筛选的 ${lastFilteredDefs.length} 项放上台对比`);
  };
  $('autoHab').onchange = (e) => { ui.autoHabitat = e.target.checked; saveState(); };
  $('btnSolo').onclick = () => { if (focus) setStage([focus.def], focus.def); };
  $('btnNatives').onclick = () => {
    const nat = nativesOf(habitatId);
    if (!nat.length) { banner(`${HABITAT_MAP[habitatId].name}还没有原住民`); return; }
    setStage(nat, nat[0]);
    banner(`${HABITAT_MAP[habitatId].name} · 原住民 ${nat.length} 只`);
  };
  $('btnAllMade').onclick = () => setStage(madeCreatures, focus ? focus.def : null);
  document.querySelectorAll('[data-crowd]').forEach(b => { b.onclick = () => crowd(Number(b.dataset.crowd)); });
  $('modeSeg').querySelectorAll('button').forEach(b => {
    b.onclick = () => { renderer.setRenderMode(b.dataset.mode, HABITAT_MAP[habitatId]); syncStage(); saveState(); banner(`渲染 · ${renderer.getRenderModeLabel()}`); };
  });
  $('btnOutline').onclick = () => { renderer.useOutline = !renderer.useOutline; syncStage(); };
  $('btnSpin').onclick = () => { ui.autoSpin = !ui.autoSpin; syncStage(); };
  $('btnResetView').onclick = () => {
    thTarget = 0.56;
    renderer.th = thTarget + (((renderer.th - thTarget + Math.PI) % TAU + TAU) % TAU - Math.PI);
    renderer.zoom = 0;
    ui.autoSpin = false;
    fitStage();
    syncStage(); saveState();
  };
  const zoomBy = (d) => { renderer.zoom = clamp(renderer.zoom + d, -3, 8); fitStage(); syncStage(); saveState(); };
  $('btnZoomIn').onclick = () => zoomBy(1);
  $('btnZoomOut').onclick = () => zoomBy(-1);
  $('toggleLib').onclick = () => { $('app').classList.toggle('no-lib'); fitStage(); };
  $('toggleInsp').onclick = () => { $('app').classList.toggle('no-insp'); fitStage(); };

  for (const [sl, v, k] of SLIDERS) {
    $(sl).oninput = () => { params[k] = Number($(sl).value); $(v).textContent = params[k].toFixed(2); };
  }
  $('btnResetParams').onclick = () => {
    Object.assign(params, { gaitFreq: 1, tailFlex: 1, springiness: 1, speed: 1, scaleMul: 1 }, (focus && focus.def.defaultParams) || {});
    syncSliders();
    banner('调参已恢复默认');
  };

  $('btnExportJson').onclick = () => {
    if (!focus || !focus.exportManifest) return;
    const manifest = focus.exportManifest(params);
    manifest.habitat = habitatId;
    manifest.renderMode = renderer.getRenderMode();
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.download = `${manifest.id}_${manifest.skin}_manifest.json`;
    a.href = URL.createObjectURL(blob);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    banner(`已导出 · ${a.download}`);
  };
  $('btnExportPng').onclick = () => {
    if (!focus) return;
    const firstKey = Object.keys(focus.parts)[0];
    const asset = focus.parts[firstKey];
    const a = document.createElement('a');
    a.download = `${focus.def.id}_${focus.curSkin.id}_${firstKey}_${asset.w}x${asset.d}x${asset.h}.png`;
    a.href = asset.strip.toDataURL('image/png');
    a.click();
    banner(`已导出 · ${firstKey}`);
  };

  $('atlasBudget').onchange = (e) => {
    renderer.atlas.setBudgetMB(Number(e.target.value));
    banner(`贴图预算 ${e.target.value}MB（超过 32MB 在 Chrome 上会掉到慢路径）`, 2);
  };

  // 压测：离屏跑一轮，主循环先停
  async function runBench() {
    if (!PW.Bench) return;
    const btn = $('btnBench');
    btn.disabled = true;
    paused = true;
    const out = $('benchOut');
    const rect = cv.getBoundingClientRect();
    out.innerHTML = `<table class="bench"><thead><tr><th>同屏</th><th>每帧</th><th>fps</th><th>主线程</th><th>p95</th><th>烘焙/帧</th></tr></thead><tbody id="benchRows"></tbody></table>
      <div class="note" id="benchNote">画布 ${Math.round(rect.width * renderer.DPR)}×${Math.round(rect.height * renderer.DPR)}，${madeCreatures.length} 种怪轮流上，同种共用部件。跑的时候画面会停一下。</div>`;
    const rows = $('benchRows');
    const cls = (fps) => fps >= 240 ? 'good' : fps >= 120 ? 'mid' : 'bad';
    try {
      await PW.Bench.suite({ cssW: rect.width, cssH: rect.height, dpr: renderer.DPR, hab: habitatId, frames: 120, warm: 240 }, (r) => {
        rows.insertAdjacentHTML('beforeend', `<tr><td>${r.count}</td><td>${r.frameMs}ms</td><td class="${cls(r.fps)}">${r.fps}</td><td>${r.cpuMs}</td><td>${r.p95Ms}</td><td>${r.bakesPerFrame}</td></tr>`);
      });
      $('benchNote').innerHTML += '<br>fps 是「不等屏幕刷新、连着跑」能到的帧数：≥ 屏幕刷新率（常见 60 / 120）就是稳满帧，绿色表示还有一倍以上余量。';
    } catch (err) {
      $('benchNote').textContent = '压测出错：' + err.message;
    }
    paused = false;
    btn.disabled = false;
    last = 0;
  }
  $('btnBench').onclick = runBench;

  // 拖动转视角、滚轮缩放
  cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, th: renderer.th }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => { if (drag) renderer.th = thTarget = drag.th + (e.clientX - drag.x) * 0.01; });
  cv.addEventListener('pointerup', () => { if (drag) { drag = null; saveState(); } });
  cv.addEventListener('wheel', (e) => { zoomBy(e.deltaY > 0 ? -1 : 1); e.preventDefault(); }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    const k = e.key.toLowerCase();
    if (k === 'q') thTarget -= Math.PI / 4;
    if (k === 'e') thTarget += Math.PI / 4;
    if (k === 'p') { hud.cycle(); banner(`性能浮层 · ${{ mini: '折叠', full: '展开', off: '隐藏' }[hud.mode]}`); }
    if (k === 'c' && focus) applySkinToDef(focus.def, (skinIdx[focus.def.id] || 0) + 1);
    if (k === 'm') { renderer.setRenderMode(renderer.modeIdx + 1, HABITAT_MAP[habitatId]); syncStage(); banner(`渲染 · ${renderer.getRenderModeLabel()}`); }
    if (k === 's' && focus) {
      const next = focus.action === 'idle' ? 'patrol' : 'idle';
      setAction(null, next);
      banner(next === 'idle' ? '全部 · 原地待机' : '全部 · 自由巡游');
    }
    if (k === 'a') { if (onStage.length >= madeCreatures.length && focus) setStage([focus.def], focus.def); else setStage(madeCreatures, focus ? focus.def : null); }
  });

  function fitStage() { renderer.fit(HABITAT_MAP[habitatId]); }
  new ResizeObserver(() => fitStage()).observe($('stage'));

  // ---------------------------------------------------------------- 主循环
  let last = 0, animTime = 0;
  const hud = PW.PerfHud.create({
    root: $('perfHud'), renderer, canvas: cv, mode: ui.perfHud,
    onMode: (m) => { if (ui.perfHud !== m) { ui.perfHud = m; saveState(); } }
  });
  const ZERO = { avoidX: 0, avoidY: 0 };

  function simulate(dt) {
    const hab = HABITAT_MAP[habitatId];
    const n = onStage.length;
    const crowdMode = n > 1;
    for (let i = 0; i < n; i++) {
      const a = onStage[i];
      a.actionTime += dt;
      const act = a.def.actions.find(x => x.id === a.action);
      if (act && !act.loop && act.duration && a.actionTime > act.duration) { a.action = a.def.actions[0].id; a.actionTime = 0; }
      const avoid = crowdMode ? computeEcoAvoidance(a, onStage) : ZERO;
      const [hx, hy, hyaw] = homeOf(i, n);
      a.update(dt, animTime, params, hab, renderer.vfx, {
        patrol: a.action !== 'idle',
        action: a.action, actionTime: a.actionTime,
        homeX: crowdMode ? hx : 0, homeY: crowdMode ? hy : 0, homeYaw: hyaw,
        maxRadius: crowdMode ? 56 : 48,
        seed: 19 + i * 37,
        avoidX: avoid.avoidX, avoidY: avoid.avoidY,
        self: a, allActors: onStage
      });
    }
    renderer.vfx.update(dt);
  }

  function tick(ms) {
    requestAnimationFrame(tick);
    if (paused) return;
    const t = ms / 1000;
    const frameDt = last ? t - last : 1 / 60;
    last = t;
    const dt = Math.min(0.05, frameDt);

    if (bannerTimer > 0) { bannerTimer -= dt; if (bannerTimer <= 0) $('banner').classList.remove('show'); }
    if (ui.autoSpin && !drag) thTarget += dt * 0.55;
    if (!drag) renderer.th += (thTarget - renderer.th) * Math.min(1, dt * 8);

    // 逻辑按不超过 1/120 秒一步走（弹簧、链条在任何刷新率下手感一致），渲染用最新状态
    const t0 = performance.now();
    let rem = dt;
    while (rem > 1e-6) {
      const h = Math.min(SIM_STEP, rem);
      animTime += h;
      simulate(h);
      rem -= h;
    }

    const t1 = performance.now();
    const platform = buildHabitatPlatform(habitatId, makeCanvas, 200);
    renderer.renderScene(platform, onStage, animTime);
    const t2 = performance.now();

    hud.frame(frameDt * 1000, t1 - t0, t2 - t1);
    // 场景一变（同屏、生境、渲染方式、缩放、画布大小），浮层会在原画面上测一次满负荷（画面停几十毫秒）
    hud.maybeMeasure(t2, `${onStage.length}|${habitatId}|${renderer.getRenderMode()}|${renderer.zoom}|${cv.width}x${cv.height}`,
      () => renderer.renderScene(platform, onStage, animTime));
    hud.update(t2, { count: onStage.length, renderMode: renderer.getRenderMode() });
  }

  // ---------------------------------------------------------------- 启动
  window.__WORKSHOP_DEBUG__ = {
    renderer, onStage, catItems,
    hud,
    getStats: () => {
      const h = hud.snapshot({ count: onStage.length, renderMode: renderer.getRenderMode() });
      return { fps: Math.round(h.fps), hz: h.hz, logicMs: +h.logic.toFixed(2), renderMs: +h.render.toFixed(2), bakeMs: +h.bake.toFixed(2), fullFrameMs: h.full ? +h.full.frameMs.toFixed(2) : null, gpuBound: h.gpuBound, weak: h.weak.k, count: onStage.length, habitatId, focus: focus && focus.def.id, ...renderer.cacheInfo(), ...renderer.stats };
    },
    setStage: (ids) => setStage(ids.map(id => Assets.byId[id]).filter(Boolean)),
    crowd, setHabitat, focusDef: (id) => focusDef(Assets.byId[id]), runBench
  };

  syncSliders();
  fitStage();
  renderer.renderSky(HABITAT_MAP[habitatId]);
  const wantFocus = Assets.byId[qs.get('focus')] || Assets.byId[saved.focusId] || madeCreatures[0];
  const wantStage = (saved.stageIds || []).map(id => Assets.byId[id]).filter(Boolean);
  if (qs.get('focus') || !wantStage.length) {
    const keepHab = qs.get('hab') || saved.habitatId;
    if (keepHab && HABITAT_MAP[keepHab]) { const a = ui.autoHabitat; ui.autoHabitat = false; focusDef(wantFocus, false); ui.autoHabitat = a; }
    else focusDef(wantFocus, false);
  } else {
    setStage(wantStage, wantFocus);
  }
  refreshLiveTimestamps();
  requestAnimationFrame(tick);
  if (qs.get('bench')) setTimeout(runBench, 800);
})();

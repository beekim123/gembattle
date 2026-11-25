#!/usr/bin/env node
'use strict';
// =============================================================================
// 生态设计检查 + 生成给 AI 看的对应关系文档（文档/生态设计-对应关系.md）
// 用法（在 美术/像素堆叠生物工坊/ 目录或仓库根目录均可运行）：
//   node tools/eco-md.js
//   node tools/eco-md.js --check-only   （只做检查，不写 md）
// =============================================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT, '文档/生态设计数据.js');
const OUT_PATH = path.join(ROOT, '文档/生态设计-对应关系.md');
const CHECK_ONLY = process.argv.includes('--check-only');

// ---------------------------------------------------------------- 加载数据与已做脚本
function loadEcoDesign() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(DATA_PATH, 'utf8'), sandbox, { filename: DATA_PATH });
  if (!sandbox.window.EcoDesign) throw new Error('未能从 生态设计数据.js 读取 window.EcoDesign');
  return sandbox.window.EcoDesign;
}

function loadMadeAssetIds() {
  const ctx = {
    window: {}, console, Math,
    Int16Array, Uint8Array, Float32Array, Set, Map, Object, Array
  };
  ctx.window = ctx;
  for (const f of ['core/math.js', 'core/voxel.js', 'core/solvers.js', 'core/behaviors.js', 'core/registry.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  const crDir = path.join(ROOT, 'creatures');
  for (const f of fs.readdirSync(crDir).filter((x) => x.endsWith('.js')).sort()) {
    vm.runInNewContext(fs.readFileSync(path.join(crDir, f), 'utf8'), ctx, { filename: f });
  }
  return new Set(ctx.PixelWorkshop.Assets.list.map((d) => d.id));
}

// ---------------------------------------------------------------- 数据与用词检查
const FORBID_CHAR = /[灯烬影夜魂噬幽渊星光]/g;
const FORBID_GUARD = /守[^\s，。、；：（(]{1,2}者/g;
// 排除常见方位介词「之间」「之外」「之上」「之下」「之中」「之内」「之前」「之后」「之类」「之一」
const FORBID_OF = /(?<![一二三四五六七八九十两每这那其])[一-龥]{1,3}之(?![间外上下中内前后类一])[一-龥]{1,3}/g;

function validate(D, madeIds) {
  const errors = [];
  const infos = [];
  const err = (msg) => errors.push(msg);
  const info = (msg) => infos.push(msg);

  const habMap = new Map();
  const habCodes = new Set();
  for (const h of D.habitats) {
    if (habMap.has(h.id)) err(`生境 id 重复：${h.id}`);
    habMap.set(h.id, h);
    if (habCodes.has(h.code)) err(`生境编号重复：${h.code}`);
    habCodes.add(h.code);
  }

  const foodMap = new Map();
  for (const f of D.foods) {
    if (foodMap.has(f.id)) err(`吃食 id 重复：${f.id}`);
    foodMap.set(f.id, f);
  }

  const tplMap = new Map();
  for (const t of D.templates) {
    if (tplMap.has(t.id)) err(`模板 id 重复：${t.id}`);
    tplMap.set(t.id, t);
  }

  const nicheMap = new Map();
  for (const n of D.niches) {
    if (nicheMap.has(n.id)) err(`生态位 id 重复：${n.id}`);
    nicheMap.set(n.id, n);
  }

  const crMap = new Map();
  for (const c of D.creatures) {
    if (crMap.has(c.code)) err(`生物编号重复：${c.code}`);
    crMap.set(c.code, c);
  }

  // 检查 foods <-> habitats.base 双向一致
  for (const f of D.foods) {
    for (const hid of f.hab || []) {
      if (!habMap.has(hid)) err(`吃食 ${f.id} 引用不存在的生境：${hid}`);
      else if (!(habMap.get(hid).base || []).includes(f.id)) {
        err(`生境 ${hid} 的 base 缺少吃食 ${f.id}（${f.name}）`);
      }
    }
  }
  for (const h of D.habitats) {
    for (const fid of h.base || []) {
      if (!foodMap.has(fid)) err(`生境 ${h.id} 的 base 引用不存在的吃食：${fid}`);
      else if (!(foodMap.get(fid).hab || []).includes(h.id)) {
        err(`吃食 ${fid} 的 hab 未包含生境 ${h.id}`);
      }
    }
  }

  // 检查 flows
  for (const fl of D.flows) {
    if (!habMap.has(fl.from)) err(`连接 from 不存在：${fl.from}`);
    if (!habMap.has(fl.to)) err(`连接 to 不存在：${fl.to}`);
    if (!D.flowKinds[fl.kind]) err(`连接类型未定义：${fl.kind}`);
  }

  // 检查 templates.std
  for (const t of D.templates) {
    if (t.merged) continue;
    if (!crMap.has(t.std)) err(`模板 ${t.id} 的标杆不存在：${t.std}`);
    else if (crMap.get(t.std).tpl !== t.id) {
      err(`模板 ${t.id} 的标杆 ${t.std} 实际模板是 ${crMap.get(t.std).tpl}`);
    }
  }

  // 检查 creatures
  const usedImpls = new Set();
  const eatenCount = new Map();
  for (const c of D.creatures) {
    if (!tplMap.has(c.tpl) || tplMap.get(c.tpl).merged) err(`${c.code} 模板无效或已合并：${c.tpl}`);
    if (!c.hab || !c.hab.length) err(`${c.code} 未填生境`);
    for (const hid of c.hab || []) if (!habMap.has(hid)) err(`${c.code} 生境不存在：${hid}`);
    if (!c.niche || !c.niche.length) err(`${c.code} 未填生态位`);
    for (const nid of c.niche || []) if (!nicheMap.has(nid)) err(`${c.code} 生态位不存在：${nid}`);

    if (c.status === 'made') {
      if (!c.impl) err(`${c.code} 状态为 made 但缺 impl`);
      else if (!madeIds.has(c.impl)) err(`${c.code} 的 impl「${c.impl}」在 creatures/ 里找不到对应脚本`);
      else usedImpls.add(c.impl);
    } else if (c.impl) {
      err(`${c.code} 状态为 ${c.status} 但填了 impl：${c.impl}`);
    }

    if ((c.status === 'made' || c.status === 'existing') && (c.life || '').includes('提案') && !c.nicheProposal) {
      err(`${c.code} 文案标了提案，但漏标 nicheProposal: true`);
    }

    for (const e of c.eats || []) {
      eatenCount.set(e, (eatenCount.get(e) || 0) + 1);
      if (foodMap.has(e)) {
        const f = foodMap.get(e);
        if (!c.hab.some((h) => f.hab.includes(h))) {
          err(`${c.code}（${c.hab.join(',')}）吃 ${e}，但该吃食只在 ${f.hab.join(',')}`);
        }
      } else if (crMap.has(e)) {
        const prey = crMap.get(e);
        if (!c.hab.some((h) => prey.hab.includes(h))) {
          err(`${c.code}（${c.hab.join(',')}）捕食 ${e}，但两者生境不重合（${prey.hab.join(',')}）`);
        }
      } else {
        err(`${c.code} 的 eats 引用不存在：${e}`);
      }
    }

    for (const [o] of c.with || []) {
      const target = crMap.get(o) || foodMap.get(o);
      if (!target) err(`${c.code} 的 with 引用不存在：${o}`);
      else if (!c.hab.some((h) => target.hab.includes(h))) {
        err(`${c.code}（${c.hab.join(',')}）的 with 目标 ${o} 生境不重合（${target.hab.join(',')}）`);
      }
    }

    for (const hst of c.hosts || []) {
      const host = crMap.get(hst);
      if (!host) err(`${c.code} 的 hosts 引用不存在：${hst}`);
      else if (!c.hab.some((h) => host.hab.includes(h))) {
        err(`${c.code}（${c.hab.join(',')}）的宿主 ${hst} 生境不重合（${host.hab.join(',')}）`);
      }
    }
  }

  for (const id of madeIds) {
    if (!usedImpls.has(id)) err(`creatures/ 里已有脚本「${id}」，但生态数据里未引用`);
  }

  // 提示性统计（不阻断，方便审视待拍板缺口）
  for (const f of D.foods) {
    if (!eatenCount.has(f.id)) info(`吃食暂无人吃：${f.id}（${f.name}，${f.hab.join(',')}）`);
  }
  for (const h of D.habitats) {
    const deg = D.flows.filter((fl) => fl.from === h.id || fl.to === h.id).length;
    if (deg === 0) info(`生境暂无连线：${h.code} ${h.name}（${h.id}）`);
  }

  // 禁用字与套路格式扫描（递归扫数据对象内全部字符串）
  function scanStr(val, p) {
    if (typeof val === 'string') {
      const m1 = val.match(FORBID_CHAR);
      if (m1) err(`禁用字 [${m1.join('')}] 位于 ${p}：「${val}」`);
      const m2 = val.match(FORBID_GUARD);
      if (m2) err(`套路格式 [${m2.join(',')}] 位于 ${p}：「${val}」`);
      const m3 = val.match(FORBID_OF);
      if (m3) err(`疑似「×之×」[${m3.join(',')}] 位于 ${p}：「${val}」`);
    } else if (Array.isArray(val)) {
      val.forEach((x, i) => scanStr(x, `${p}[${i}]`));
    } else if (val && typeof val === 'object') {
      for (const [k, v] of Object.entries(val)) scanStr(v, `${p}.${k}`);
    }
  }
  scanStr(D, 'EcoDesign');

  return { errors, infos };
}

// ---------------------------------------------------------------- 生成 Markdown
function generateMarkdown(D) {
  const habMap = new Map(D.habitats.map((h) => [h.id, h]));
  const crMap = new Map(D.creatures.map((c) => [c.code, c]));
  const foodMap = new Map(D.foods.map((f) => [f.id, f]));
  const layerMap = new Map(D.layers.map((l) => [l.id, l.label]));
  const layerOrder = D.layers.map((l) => l.id);

  const STATUS_TEXT = {
    made: '已有模型',
    existing: '图鉴里有',
    decided: '定了',
    proposal: '提案'
  };

  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  const eatenBy = new Map();
  const withAll = new Map();
  const hostedBy = new Map();
  for (const c of D.creatures) {
    for (const e of c.eats || []) push(eatenBy, e, c.code);
    for (const [o, how] of c.with || []) {
      push(withAll, c.code, `${o}（${how}）`);
      if (crMap.has(o)) push(withAll, o, `${c.code}（对方：${how}）`);
    }
    for (const h of c.hosts || []) push(hostedBy, h, c.code);
  }

  const fmtRef = (id) => {
    if (crMap.has(id)) return `${id} ${crMap.get(id).name}`;
    if (foodMap.has(id)) return `${foodMap.get(id).name}(\`${id}\`)`;
    return id;
  };
  const escCell = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

  const counts = {
    made: D.creatures.filter((c) => c.status === 'made').length,
    existing: D.creatures.filter((c) => c.status === 'existing').length,
    decided: D.creatures.filter((c) => c.status === 'decided').length,
    proposal: D.creatures.filter((c) => c.status === 'proposal').length,
    newHab: D.habitats.filter((h) => h.status === 'new').length
  };

  const out = [];
  out.push(`# 异世界生态设计 · 对应关系表（自动生成，勿手改）`);
  out.push('');
  out.push(`> **数据源**：\`美术/像素堆叠生物工坊/文档/生态设计数据.js\`（${D.version}）`);
  out.push(`> **生成命令**：\`node tools/eco-md.js\`（改完数据后重跑本脚本同步）`);
  out.push(`> **概览**：${D.habitats.length} 个生境（新增 ${counts.newHab} 个） · ${D.flows.length} 条生境连接 · ${D.foods.length} 种底层吃食 · ${D.creatures.length} 种生物（已有模型 ${counts.made} / 图鉴里有 ${counts.existing} / 定了 ${counts.decided} / 提案 ${counts.proposal}）`);
  out.push('');

  // 1. 生境 -> 住着谁
  out.push('## 一、生境 → 住着谁');
  out.push('');
  out.push('| 编号 | 生境（id） | 分层 | 状态 | 数量 | 住着谁 | 底层吃食 | 这里才有的规矩 |');
  out.push('|---|---|---|---|---|---|---|---|');
  for (const lid of layerOrder) {
    for (const h of D.habitats.filter((x) => x.layer === lid)) {
      const res = D.creatures.filter((c) => c.hab.includes(h.id));
      const resTxt = res.map((c) => `${c.code} ${c.name}`).join('、') || '—';
      const baseTxt = (h.base || []).map((fid) => foodMap.has(fid) ? foodMap.get(fid).name : fid).join('、') || '—';
      const st = h.status === 'new' ? '新增 · 提案' : '原有';
      out.push(`| ${h.code} | ${escCell(h.name)} (\`${h.id}\`) | ${escCell(layerMap.get(h.layer))} | ${st} | ${res.length} | ${escCell(resTxt)} | ${escCell(baseTxt)} | ${escCell(h.rule)} |`);
    }
  }
  out.push('');

  // 2. 生物总表
  out.push('## 二、生物总表（全量对应关系）');
  out.push('');
  out.push('| 编号 | 名字 | 生境 | 模板 | 生态位 | 体型 | 吃 | 被吃 | 一起过 | 宿主 / 身上挂着 | 状态 | 模型脚本 id |');
  out.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const c of D.creatures) {
    const habs = c.hab.map((hid) => habMap.has(hid) ? `${habMap.get(hid).code} ${habMap.get(hid).name}` : hid).join('、');
    const eats = (c.eats || []).map(fmtRef).join('、') || '—';
    const by = (eatenBy.get(c.code) || []).map(fmtRef).join('、') || '—';
    const w = (withAll.get(c.code) || []).join('；') || '—';
    const hostParts = [];
    if (c.hosts && c.hosts.length) hostParts.push('挂在：' + c.hosts.map(fmtRef).join('、'));
    if (hostedBy.has(c.code)) hostParts.push('身上挂着：' + hostedBy.get(c.code).map(fmtRef).join('、'));
    const hostTxt = hostParts.join('；') || '—';
    const st = STATUS_TEXT[c.status] + (c.nicheProposal ? '（吃食提案）' : '');
    out.push(`| ${c.code} | ${escCell(c.name)} | ${escCell(habs)} | \`${c.tpl}\` | ${escCell(c.niche.join('、'))} | ${escCell(c.size)} | ${escCell(eats)} | ${escCell(by)} | ${escCell(w)} | ${escCell(hostTxt)} | ${st} | ${c.impl ? `\`${c.impl}\`` : '—'} |`);
  }
  out.push('');

  // 3. 模板 -> 标杆和同类
  out.push('## 三、模板（M01 ~ M38）→ 标杆和同类');
  out.push('');
  out.push('| 编号 | 模板类型 | 扩展 | 标杆 ★ | 同类生物 | 归不归这类 / 做法要点 |');
  out.push('|---|---|---|---|---|---|');
  for (const t of D.templates) {
    if (t.merged) {
      out.push(`| \`${t.id}\` | ${escCell(t.name)} | 是 | — | — | 并入 \`${t.merged}\` |`);
      continue;
    }
    const std = crMap.get(t.std);
    const stdTxt = std ? `${std.code} ${std.name}（${STATUS_TEXT[std.status]}）` : '—';
    const others = D.creatures.filter((c) => c.tpl === t.id && c.code !== t.std).map((c) => `${c.code} ${c.name}`).join('、') || '—';
    const desc = [t.rule, t.how, t.note].filter(Boolean).join(' / ') || '—';
    out.push(`| \`${t.id}\` | ${escCell(t.name)} | ${t.isNew ? '扩展' : '基础'} | ${escCell(stdTxt)} | ${escCell(others)} | ${escCell(desc)} |`);
  }
  out.push('');

  // 4. 生境之间的连接
  out.push('## 四、生境之间的连接');
  out.push('');
  out.push('| 类型 | 从 | 到 | 说明 |');
  out.push('|---|---|---|---|');
  for (const fl of D.flows) {
    const a = habMap.get(fl.from), b = habMap.get(fl.to);
    out.push(`| ${escCell(fl.kind)} | ${a ? `${a.code} ${a.name}` : fl.from} | ${b ? `${b.code} ${b.name}` : fl.to} | ${escCell(fl.text)} |`);
  }
  out.push('');

  // 5. 生态位 × 生境表
  out.push('## 五、生态位 × 生境表');
  out.push('');
  out.push('| 生境 | ' + D.niches.map((n) => escCell(n.id)).join(' | ') + ' |');
  out.push('|---|' + D.niches.map(() => '---').join('|') + '|');
  let emptyCells = 0;
  for (const lid of layerOrder) {
    for (const h of D.habitats.filter((x) => x.layer === lid)) {
      const res = D.creatures.filter((c) => c.hab.includes(h.id));
      const cells = D.niches.map((n) => {
        const hit = res.filter((c) => c.niche.includes(n.id));
        if (!hit.length) { emptyCells++; return '·'; }
        return escCell(hit.map((c) => `${c.code} ${c.name}`).join('、'));
      });
      out.push(`| ${h.code} ${escCell(h.name)}${h.status === 'new' ? '（新）' : ''} | ${cells.join(' | ')} |`);
    }
  }
  out.push('');
  out.push(`共 ${D.habitats.length * D.niches.length} 格，已填 ${D.habitats.length * D.niches.length - emptyCells} 格，空 ${emptyCells} 格。`);
  out.push('');

  return out.join('\n');
}

// ---------------------------------------------------------------- 主流程
const D = loadEcoDesign();
const madeIds = loadMadeAssetIds();
const { errors, infos } = validate(D, madeIds);

if (infos.length) {
  console.log(`[提示] 共 ${infos.length} 条生态待补提示（不阻断）：`);
  for (const x of infos) console.log(`  - ${x}`);
}
if (errors.length) {
  console.error(`[检查失败] 发现 ${errors.length} 处错误：`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}

console.log(`[检查通过] 0 报错（${D.habitats.length} 生境 · ${D.flows.length} 连接 · ${D.foods.length} 吃食 · ${D.templates.length} 模板 · ${D.creatures.length} 生物 · ${madeIds.size} 已做脚本，无重复、无悬空引用、无禁用字）`);

if (!CHECK_ONLY) {
  const md = generateMarkdown(D);
  fs.writeFileSync(OUT_PATH, md, 'utf8');
  console.log(`[已生成] ${path.relative(process.cwd(), OUT_PATH)}（${md.split('\n').length} 行）`);
}

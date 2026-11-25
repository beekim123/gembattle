import { readFileSync } from 'node:fs';
import { pickK, sizeFromBox } from '../workshop-adapter.js';
import { poseOf, applyPose, sample, ZERO_POSE, PROFILES, DURATIONS, ATTACK_T } from '../battle-pose.js';
import { MONSTERS, ATTACK_FX, BIOMES, HERO_LOOK } from '../../content/index.js';
import { drawAttackFx, ATTACK_FX_KINDS, ATTACK_FX_DUR } from '../../ui/attack-fx.js';

// 一个什么都接得住的假画布上下文：只用来确认绘制代码跑得过去
function fakeCtx() {
  const grad = { addColorStop() {} };
  return new Proxy({}, {
    get: (o, k) => (k in o ? o[k] : (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => grad : k === 'measureText' ? () => ({ width: 10 }) : () => {})),
    set: (o, k, v) => { o[k] = v; return true; },
  });
}

export default function (t) {
  t.test('整数缩放：1 个美术像素取整数个设备像素，不出现小数拉伸', () => {
    t.assert.equal(pickK(2, 1), 2);       // 1920×1080：美术像素和布局单位一比一
    t.assert.equal(pickK(2, 1.5), 3);
    t.assert.equal(pickK(2, 0.5), 1);
    t.assert.equal(pickK(4, 1), 4);       // 2 倍屏
    t.assert.equal(pickK(1, 1), 1);
    t.assert.equal(pickK(0.3, 1), 1, '最小 1');
    t.assert.equal(pickK(100, 1), 16, '最大 16');
    t.assert.equal(pickK(NaN, 1), 1);
    for (let u = 0.5; u <= 4; u += 0.07) for (const s of [0.5, 1, 1.05, 1.5]) t.assert.ok(Number.isInteger(pickK(u, s)));
  });

  t.test('模型包围盒 → 血条和点选用的尺寸', () => {
    t.assert.deepEqual(sizeFromBox({ l: -24, r: 24, t: -81, b: 14 }), { w: 48, h: 81 });
    t.assert.deepEqual(sizeFromBox({ l: 0, r: 0, t: 0, b: 0 }), { w: 1, h: 1 });
  });

  t.test('战斗姿态：没动作就是零；蓄势下蹲、出手前扑、受击后仰、倒下向前倒', () => {
    t.assert.deepEqual(poseOf('slime_jelly', {}), ZERO_POSE);
    t.assert.deepEqual(poseOf('slime_jelly', { attack: -1, hurt: -1, dead: -1 }), ZERO_POSE);
    const wind = poseOf('slime_jelly', { attack: ATTACK_T.strike }), hit = poseOf('slime_jelly', { attack: 0.42 });
    t.assert.ok(wind.shrink > 0.2 && wind.dive < 0, '蓄势：压扁并后撤');
    t.assert.ok(hit.hop > 2 && hit.dive > 2, '出手：弹起并前扑');
    t.assert.ok(poseOf('goblin_scout', { hurt: 0.2 }).lean < 0, '受击：后仰');
    const d0 = poseOf('tree3_leshy', { dead: 0 }), d1 = poseOf('tree3_leshy', { dead: 0.7 }), d2 = poseOf('tree3_leshy', { dead: 3 });
    t.assert.equal(d0.topple, 0); t.assert.ok(d1.topple > 1); t.assert.equal(d2.topple, d1.topple, '倒下以后停住');
    t.assert.ok(poseOf(HERO_LOOK, { pulse: 0.08 }).lean > 0, '主角送杖一下');
    t.assert.deepEqual(poseOf('slime_jelly', { attack: DURATIONS.attack + 1 }), ZERO_POSE, '放完回到零');
  });

  t.test('姿态关键帧：相邻两帧平滑、超出就停在最后一帧', () => {
    const f = [{ t: 0 }, { t: 1, lean: 1 }];
    t.assert.equal(sample(f, -1).lean, 0); t.assert.equal(sample(f, 0).lean, 0);
    const mid = sample(f, 0.5).lean; t.assert.ok(mid > 0.4 && mid < 0.6);
    t.assert.equal(sample(f, 5).lean, 1);
  });

  t.test('每只怪都有出手姿态（或走默认），参数都有限且不夸张', () => {
    for (const look of [...Object.keys(MONSTERS), HERO_LOOK, '没有配置的']) for (const st of [{ attack: 0.1 }, { attack: 0.3 }, { attack: 0.42 }, { attack: 0.8 }, { hurt: 0.2 }, { dead: 1 }, { pulse: 0.1 }]) {
      const p = poseOf(look, st);
      for (const [k, v] of Object.entries(p)) t.assert.ok(Number.isFinite(v), `${look} ${k}`);
      t.assert.ok(Math.abs(p.lean) < 1 && Math.abs(p.dive) < 6 && p.hop < 6 && p.shrink < 0.6 && Math.abs(p.twist) < 1 && p.topple < 1.6, `${look} ${JSON.stringify(st)} ${JSON.stringify(p)}`);
    }
    for (const look of Object.keys(MONSTERS)) t.assert.ok(PROFILES[look], look + ' 要有自己的姿态');
  });

  t.test('姿态用到部件表：前倾沿朝向走（朝下的往画面下方，背朝画面的往上方），离地、下蹲、线段也跟着动', () => {
    const mk = () => [{ x: 0, y: 0, lift: 10, ro: 0 }, { kind: 'line', x0: 0, y0: 0, z0: 0, x1: 1, y1: 1, z1: 5 }];
    const st0 = { x: 0, y: 0, yaw: 0 }, stPi = { x: 0, y: 0, yaw: Math.PI };
    const a = applyPose(mk(), st0, { ...ZERO_POSE, lean: 0.5, dive: 1 });
    t.assert.ok(Math.abs(a[0].y - 6) < 1e-9 && Math.abs(a[0].x) < 1e-9, '朝画面下方：y 变大');
    t.assert.ok(a[1].y0 > 0.9 && a[1].y1 > 1.9);
    const b = applyPose(mk(), stPi, { ...ZERO_POSE, lean: 0.5, dive: 1 });
    t.assert.ok(b[0].y < -5.9, '背朝画面：y 变小');
    const h = applyPose(mk(), st0, { ...ZERO_POSE, hop: 3 });
    t.assert.equal(h[0].lift, 13); t.assert.equal(h[1].z0, 3);
    const s = applyPose(mk(), st0, { ...ZERO_POSE, shrink: 0.5 });
    t.assert.equal(s[0].lift, 5);
    const tp = applyPose(mk(), st0, { ...ZERO_POSE, topple: Math.PI / 2 });
    t.assert.ok(tp[0].lift < 1e-9 && tp[0].y > 9.9, '倒到 90 度：高度变成向前的距离');
    const tw = applyPose([{ x: 2, y: 0, lift: 0, ro: 0.1 }], st0, { ...ZERO_POSE, twist: Math.PI / 2 });
    t.assert.ok(Math.abs(tw[0].y - 2) < 1e-9 && Math.abs(tw[0].ro - (0.1 + Math.PI / 2)) < 1e-9);
    const z = mk(); t.assert.equal(applyPose(z, st0, ZERO_POSE), z, '零姿态原样返回');
  });

  t.test('怪出手的技能特效：每只怪都配了、画法都存在、各个时刻都画得出来', () => {
    for (const look of Object.keys(MONSTERS)) { t.assert.ok(ATTACK_FX[look], look); t.assert.ok(ATTACK_FX_KINDS.includes(ATTACK_FX[look]), look); }
    t.assert.equal(new Set(Object.values(ATTACK_FX)).size, Object.keys(MONSTERS).length, '每只怪一种，互不重复');
    const ctx = fakeCtx();
    for (const kind of ATTACK_FX_KINDS) for (const tt of [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.9]) drawAttackFx(ctx, kind, tt, { x: 400, y: 160 }, { x: 480, y: 278 });
    drawAttackFx(ctx, '不存在', 0.3, { x: 0, y: 0 }, { x: 1, y: 1 });
    t.assert.ok(ATTACK_FX_DUR > 0.3);
  });

  t.test('生态摆件：每个生态 1~3 件，只用方案 4.2 里的摆件，落脚点在画面里', () => {
    const html = readFileSync(new URL('../../../app/index.html', import.meta.url), 'utf8');
    const scripts = [...html.matchAll(/<script src="\.\.\/art\/([^"]+)"/g)].map(m => m[1]);
    const want = { forest: 3, swamp: 2, meadow: 3, ruins: 2, canopy: 3, camp: 2, trade: 2, gate: 1 };
    for (const [id, n] of Object.entries(want)) {
      const props = BIOMES[id].props;
      t.assert.equal(props.length, n, id);
      for (const p of props) {
        t.assert.ok(scripts.some(s => /^(scenes|buildings)\//.test(s) && s.endsWith('/' + p.id + '.js')), `${id}：${p.id} 不在 4.2 清单里`);
        t.assert.ok(p.x > 0 && p.x < 960 && p.y > 0 && p.y < 540, `${id}：${p.id} 落脚点`);
      }
    }
    t.assert.ok(BIOMES.camp.props.some(p => p.id === 'scene_campfire') && BIOMES.camp.props.some(p => p.id === 'scene_rock_hollow'), '营火 + 树洞石碑');
    t.assert.ok(BIOMES.trade.props.some(p => p.id === 'building_camp_tent') && BIOMES.trade.props.some(p => p.id === 'scene_crates_sign'), '帐篷 + 木牌宝箱');
    t.assert.equal(BIOMES.gate.props[0].id, 'building_stone_gate');
    // 战场正中（怪和主角）不放摆件：摆件落脚点的 x 不在 330~630
    for (const id of ['forest', 'swamp', 'meadow', 'canopy']) for (const p of BIOMES[id].props) t.assert.ok(p.x < 330 || p.x > 630, `${id}：${p.id} 不能压在战区中间`);
  });
}

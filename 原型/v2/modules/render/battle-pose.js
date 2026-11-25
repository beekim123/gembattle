// 战斗姿态：工坊的模型现在只有「待机」和「巡游」，战斗里要的蓄势、出手、受击、倒下，在这里算。
// 工坊的文件一个字不动（美术/ 只读）：我们只在每帧拿到模型的部件表以后，按姿态参数把部件整体挪一挪
// （前倾、前扑、离地、下蹲、转身、后倒），像素贴图本身不拉伸。
// 纯函数、不碰 canvas，node 里能直接测。
//
// 姿态参数（工坊世界的格子，1 格 ≈ 2.5 个美术像素）：
//   lean   沿朝向前倾：每升高 1 格，身体前移 lean 格（负数是后仰）
//   dive   整体沿朝向前冲几格（负数是后撤）
//   hop    整体离地几格
//   shrink 身高压缩比例（下蹲、蓄力）
//   twist  绕脚下转多少弧度（挥击）
//   topple 向前倒下的角度（倒下用）
export const ZERO_POSE = Object.freeze({ lean: 0, dive: 0, hop: 0, shrink: 0, twist: 0, topple: 0 });
const KEYS = Object.keys(ZERO_POSE);

const ease = u => u * u * (3 - 2 * u);
// 关键帧：[{ t, ...参数 }]，没写的参数按 0 算；相邻两帧平滑过渡；t 超过最后一帧就停在最后一帧
export function sample(frames, t) {
  const out = { ...ZERO_POSE };
  if (!frames || !frames.length || t < 0) return out;
  let a = frames[0], b = frames[frames.length - 1];
  if (t >= b.t) { for (const k of KEYS) out[k] = b[k] || 0; return out; }
  for (let i = 0; i < frames.length - 1; i++) if (t >= frames[i].t && t < frames[i + 1].t) { a = frames[i]; b = frames[i + 1]; break; }
  const u = ease(Math.max(0, Math.min(1, (t - a.t) / Math.max(1e-6, b.t - a.t))));
  for (const k of KEYS) out[k] = (a[k] || 0) + ((b[k] || 0) - (a[k] || 0)) * u;
  return out;
}
const add = (a, b) => { for (const k of KEYS) a[k] += b[k]; return a; };

// 每只怪一套出手姿态（蓄势 → 出手 → 收回，共约 0.85 秒；出手那一下在 0.30 秒）。参数是我先按各自模样定的默认值，等用户挑。
export const ATTACK_T = { strike: 0.3, total: 0.85 };
const A = (wind, strike, rec = {}) => [{ t: 0, ...{} }, { t: 0.3, ...wind }, { t: 0.42, ...strike }, { t: 0.85, ...rec }];
export const PROFILES = {
  // 水滴软泥：先压扁蓄力，再整个弹起扑过去
  slime_jelly: { attack: A({ shrink: 0.34, dive: -0.8 }, { hop: 3.2, dive: 3.4, shrink: -0.08 }), hurt: { lean: -0.2, dive: -1.2, shrink: 0.12 } },
  // 草茎绵羊：低头后撤，再一头撞过去
  earth2_barometz: { attack: A({ lean: -0.18, dive: -2, shrink: 0.1 }, { lean: 0.22, dive: 3.4 }), hurt: { lean: -0.3, dive: -1.6 } },
  // 拾荒地精：向后抡棒，再转身砸下
  goblin_scout: { attack: A({ lean: -0.3, twist: -0.5, hop: 0.6 }, { lean: 0.28, twist: 0.55, dive: 1.8 }), hurt: { lean: -0.3, twist: 0.2, dive: -1 } },
  // 花甸灵精：升高一点蓄力，俯冲撒花瓣
  fairy_meadow: { attack: A({ hop: 4, lean: -0.1 }, { hop: 1, lean: 0.26, dive: 2.4 }), hurt: { hop: 1.2, dive: -1.4, twist: 0.2 } },
  // 摇果长臂猿：抱树猛摇的动作（工坊自带 shake）当蓄势，出手时整个人前压
  earth6_long_arm: { attack: A({ lean: -0.12, shrink: 0.06 }, { lean: 0.24, dive: 2.2 }), hurt: { lean: -0.26, dive: -1.2 }, native: 'shake' },
  // 五尾赤豹：伏低，再猛扑
  earth3_zheng: { attack: A({ shrink: 0.24, lean: -0.2, dive: -1.4 }, { hop: 2.4, lean: 0.2, dive: 4 }), hurt: { lean: -0.3, dive: -1.6 } },
  // 腹口懒兽：向后仰起，再整个压下来咬
  earth1_belly_maw: { attack: A({ lean: -0.34, hop: 0.8 }, { lean: 0.32, shrink: 0.1, dive: 2.4 }), hurt: { lean: -0.3, dive: -1 } },
  // 千丈古树精：整棵树升高蓄势，再砸地
  tree3_leshy: { attack: A({ hop: 2.4, lean: -0.14 }, { hop: 0, lean: 0.2, shrink: 0.08, dive: 1 }), hurt: { lean: -0.16, dive: -0.8, twist: 0.06 } },
  // 主角：每点亮一张牌，杖往前送一下
  npc_mage: { pulse: [{ t: 0 }, { t: 0.08, lean: 0.24, dive: 1.0 }, { t: 0.3 }], hurt: { lean: -0.36, dive: -1.4, shrink: 0.08 } },
};
const DEFAULT = { attack: A({ lean: -0.2, shrink: 0.1 }, { lean: 0.24, dive: 2 }), hurt: { lean: -0.25, dive: -1.2 } };
const prof = look => PROFILES[look] || DEFAULT;

const HURT_T = 0.4, DEAD_T = 0.7, PULSE_T = 0.3;
export const DURATIONS = { attack: ATTACK_T.total, hurt: HURT_T, dead: DEAD_T, pulse: PULSE_T };

// st: { attack, hurt, dead, pulse } 各是「这个姿态已经过了几秒」，< 0 表示没在放
export function poseOf(look, st = {}) {
  const p = prof(look), out = { ...ZERO_POSE };
  if (st.attack >= 0 && st.attack < ATTACK_T.total + 0.05) add(out, sample(p.attack, st.attack));
  if (st.pulse >= 0 && p.pulse && st.pulse < PULSE_T + 0.02) add(out, sample(p.pulse, st.pulse));
  if (st.hurt >= 0 && st.hurt < HURT_T) {
    const k = Math.sin(Math.PI * Math.min(1, st.hurt / HURT_T)) ;          // 先猛后仰、再慢慢回来
    for (const key of KEYS) out[key] += (p.hurt[key] || 0) * k;
  }
  if (st.dead >= 0) {
    const u = ease(Math.min(1, st.dead / DEAD_T));
    out.topple += 1.25 * u; out.shrink += 0.35 * u; out.dive += 1.2 * u;
  }
  return out;
}

// 把姿态用到一份部件表上（就地改）。state: { x, y, yaw } 是模型的根。
// 部件有两种：点（x y lift ro）和线（x0 y0 z0 x1 y1 z1）。
export function applyPose(list, st, pose) {
  if (!pose || KEYS.every(k => !pose[k])) return list;
  const fx = -Math.sin(st.yaw), fy = Math.cos(st.yaw);          // 朝向（工坊里 yaw = 0 面朝画面下方）
  const cs = Math.cos(pose.twist), sn = Math.sin(pose.twist);
  const ct = Math.cos(pose.topple), stt = Math.sin(pose.topple);
  const pt = (x, y, z) => {
    let dx = x - st.x, dy = y - st.y;
    if (pose.twist) { const rx = dx * cs - dy * sn, ry = dx * sn + dy * cs; dx = rx; dy = ry; }
    let h = Math.max(0, z) * (1 - pose.shrink);
    let fwd = pose.dive + pose.lean * h;
    if (pose.topple) { fwd += h * stt; h *= ct; }
    return [st.x + dx + fx * fwd, st.y + dy + fy * fwd, h + pose.hop + Math.min(0, z)];
  };
  for (const p of list) {
    if (p.kind === 'line') {
      [p.x0, p.y0, p.z0] = pt(p.x0, p.y0, p.z0);
      [p.x1, p.y1, p.z1] = pt(p.x1, p.y1, p.z1);
    } else {
      [p.x, p.y, p.lift] = pt(p.x, p.y, p.lift);
      if (pose.twist) p.ro = (p.ro || 0) + pose.twist;
    }
  }
  return list;
}

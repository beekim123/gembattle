'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, expSmooth, wrapAngle, fbm1, hash2i, localToWorldXY } = PW.Math;

  // =========================================================================
  // 自主生物探索导航器（Organic Wander Steering）
  // 告别机械匀速转圈！模拟真实生物：选点 -> 加速切弯游/走 -> 减速停顿观察 -> 突然折返转向
  // 正是「变速启停 + 曲率变化」把 P5.js 链式甩尾、弹簧回弹和四足迈步彻底逼活！
  // =========================================================================
  function stepOrganicTarget(state, dt, time, eco, cfg = {}) {
    const seed = eco.seed ?? 17;
    const maxR = eco.maxRadius ?? 46;
    const minHop = cfg.minHop ?? 22;
    const pauseMin = cfg.pauseMin ?? 0.7;
    const pauseMax = cfg.pauseMax ?? 1.9;

    if (state.navX === undefined) {
      state.navX = (eco.homeX ?? 0) + 20;
      state.navY = (eco.homeY ?? 0) + 12;
      state.navPause = 0;
      state.navSeq = 1;
    }

    if (state.navPause > 0) {
      state.navPause -= dt;
      return { x: state.navX, y: state.navY, pausing: true };
    }

    const d = Math.hypot(state.navX - state.x, state.navY - state.y);
    if (d < (cfg.arriveDist ?? 7.5)) {
      // 到达目标后短暂停顿观察，然后挑选一个新的折返点
      state.navSeq = (state.navSeq || 1) + 1;
      const r1 = hash2i(state.navSeq, seed, 101);
      const r2 = hash2i(state.navSeq, seed, 211);
      const r3 = hash2i(state.navSeq, seed, 307);
      state.navPause = lerp(pauseMin, pauseMax, r3);

      // 优先选与当前位置有明显角度差的新点，制造优雅的大弧线转弯
      const curAng = Math.atan2(state.y, state.x);
      const turnAng = curAng + (r1 > 0.5 ? 1 : -1) * lerp(1.15, 2.55, r2);
      const rad = lerp(minHop * 0.65, maxR, hash2i(state.navSeq, seed, 419));
      state.navX = (eco.centerX || 0) + Math.cos(turnAng) * rad;
      state.navY = (eco.centerY || 0) + Math.sin(turnAng) * rad;
      return { x: state.navX, y: state.navY, pausing: true };
    }

    return { x: state.navX, y: state.navY, pausing: false };
  }

  // =========================================================================
  // 第二层：可混搭「推进积木」（v2 生物感升级版）
  // =========================================================================
  const Propulsion = {
    // 1. 脉冲摆尾游泳（真实鱼类：一甩尾猛蹿 -> 惯性滑行 -> 急转切弯）
    pulseSwim(state, dt, time, params, eco) {
      const speed = params.speed ?? 1.0;
      const freq = (params.gaitFreq ?? 1.0) * 5.2;
      const patrol = eco.patrol !== false;

      if (!patrol) {
        // 原地鲜活悬停划水（缓慢轻微游移 + 尾波反扭）
        state.phase = (state.phase || 0) + dt * freq * 0.65;
        const beat = Math.sin(state.phase);
        const tx = (eco.homeX ?? 0) + Math.sin(time * 0.7) * 3.5;
        const ty = (eco.homeY ?? 0) + Math.cos(time * 0.55) * 3.0;
        const k = expSmooth(dt, 4.5);
        const nx = lerp(state.x, tx, k);
        const ny = lerp(state.y, ty, k);
        state.vx = (nx - state.x) / Math.max(dt, 0.001);
        state.vy = (ny - state.y) / Math.max(dt, 0.001);
        state.x = nx; state.y = ny;
        state.z = lerp(state.z, (eco.baseLift ?? 1.8) + Math.sin(state.phase * 1.6) * 0.85, k);
        const idleAim = (eco.homeYaw ?? 0) + Math.sin(time * 0.85) * 0.32 - beat * 0.12;
        state.yaw += wrapAngle(idleAim - state.yaw) * expSmooth(dt, 6.5);
        state.thrustPulse = Math.abs(beat) * 0.35;
        state.turnRate = 0;
        return state;
      }

      const nav = stepOrganicTarget(state, dt, time, eco, {
        minHop: 26, pauseMin: 0.35, pauseMax: 1.05, arriveDist: 9.0
      });

      const tx = nav.x + (eco.avoidX || 0);
      const ty = nav.y + (eco.avoidY || 0);
      const dx = tx - state.x, dy = ty - state.y;
      const dist = Math.hypot(dx, dy) || 0.001;
      const desiredYaw = Math.atan2(-dx, dy);

      // 转向角速度受限（鱼类有最小转弯半径，甩出自然弧线！）
      const yawDiff = wrapAngle(desiredYaw - state.yaw);
      const maxTurn = (nav.pausing ? 2.1 : 3.4) * (0.65 + speed * 0.5);
      const turnStep = clamp(yawDiff, -maxTurn * dt, maxTurn * dt);
      state.yaw = wrapAngle(state.yaw + turnStep);
      state.turnRate = turnStep / Math.max(dt, 0.001);

      // 脉冲摆尾推力（Burst-and-Glide）：摆尾瞬间加速，滑行阶段靠水阻慢降
      state.phase = (state.phase || 0) + dt * freq * (nav.pausing ? 0.55 : (0.78 + speed * 0.42));
      const pulse = Math.pow(Math.abs(Math.sin(state.phase)), 2.2);
      const burstBoost = eco.burstBoost ?? 1.0;

      // 朝向与目标越对齐，往前冲得越快；大转弯时先减速切弯再加速蹿出
      const alignFactor = clamp(Math.cos(yawDiff), 0.18, 1.0);
      const targetSpd = nav.pausing
        ? (5.0 + pulse * 4.0) * speed
        : (14.5 + pulse * 26.0) * speed * alignFactor * burstBoost;

      const fwdX = -Math.sin(state.yaw), fwdY = Math.cos(state.yaw);
      const kVel = expSmooth(dt, nav.pausing ? 4.5 : 6.2);
      state.vx = lerp(state.vx, fwdX * targetSpd, kVel);
      state.vy = lerp(state.vy, fwdY * targetSpd, kVel);
      state.x += state.vx * dt;
      state.y += state.vy * dt;

      // 平台安全软边界
      const curD = Math.hypot(state.x, state.y);
      const maxR = eco.maxRadius ?? 50;
      if (curD > maxR) {
        state.x *= maxR / curD;
        state.y *= maxR / curD;
      }

      // 海豚式波浪潜浮（加速时微微破水昂头，滑行时轻潜）
      const dive = Math.sin(time * 2.1 * speed + (eco.seed || 0)) * 3.4 + pulse * 1.4;
      state.z = lerp(state.z, (eco.baseLift ?? 1.2) + dive, expSmooth(dt, 7.5));
      state.thrustPulse = pulse;
      return state;
    },

    // 2. 噪声随风漂浮（带真实惯性加速/停顿漂移，激发软体果冻晃动与垂腿摆荡！）
    windDrift(state, dt, time, params, eco) {
      const speed = params.speed ?? 1.0;
      const freq = params.gaitFreq ?? 1.0;
      const seed = eco.seed ?? 37;
      const patrol = eco.patrol !== false;
      const baseLift = eco.baseLift ?? 16.0;

      state.phase = (state.phase || 0) + dt * 2.3 * freq;

      let tx, ty, pausing = false;
      if (!patrol) {
        tx = (eco.homeX ?? 0) + (fbm1(time * 0.42 * speed, seed) - 0.5) * 14;
        ty = (eco.homeY ?? 0) + (fbm1(time * 0.38 * speed, seed + 53) - 0.5) * 14;
      } else {
        const nav = stepOrganicTarget(state, dt, time, eco, {
          minHop: 22, pauseMin: 1.0, pauseMax: 2.2, arriveDist: 8.0
        });
        pausing = nav.pausing;
        // 叠加柔和风场扰动
        tx = nav.x + (fbm1(time * 0.45, seed) - 0.5) * 10 + (eco.avoidX || 0);
        ty = nav.y + (fbm1(time * 0.42, seed + 71) - 0.5) * 10 + (eco.avoidY || 0);
      }

      // 模拟浮空惯性（推力 + 空气阻力），启停时有柔和过冲感！
      const dx = tx - state.x, dy = ty - state.y;
      const accel = (pausing ? 1.8 : 4.2) * (0.65 + speed * 0.55);
      const drag = pausing ? 2.4 : 1.75;
      state.vx += (dx * accel - state.vx * drag) * dt;
      state.vy += (dy * accel - state.vy * drag) * dt;
      const maxSpd = 28 * speed;
      const curSpd = Math.hypot(state.vx, state.vy);
      if (curSpd > maxSpd) { state.vx *= maxSpd / curSpd; state.vy *= maxSpd / curSpd; }

      state.x += state.vx * dt;
      state.y += state.vy * dt;

      const dCenter = Math.hypot(state.x, state.y);
      const maxR = eco.maxRadius ?? 50;
      if (dCenter > maxR) { state.x *= maxR / dCenter; state.y *= maxR / dCenter; }

      const bob = Math.sin(state.phase) * 2.8 + (fbm1(time * 0.55, seed + 19) - 0.5) * 4.2;
      state.z = lerp(state.z, baseLift + bob, expSmooth(dt, 4.8));

      const targetYaw = curSpd > 2.2
        ? Math.atan2(-state.vx, state.vy)
        : (eco.homeYaw ?? 0) + Math.sin(time * 0.75 + seed) * 0.45;
      state.yaw += wrapAngle(targetYaw - state.yaw) * expSmooth(dt, 3.2);
      state.thrustPulse = clamp(curSpd / 20, 0, 1);
      return state;
    },

    // 3. 多足差异化陆地移动（支持 heavy / stalk / scurry / crawl 四种生物移动性格）
    //    彻底告别「扫地机器人匀速平推 + 背向硬蹭」：先转头拧身对准方向，再带蹬地步态脉动迈步！
    multiLegWalk(state, dt, time, params, eco) {
      const speed = params.speed ?? 1.0;
      const gFreq = params.gaitFreq ?? 1.0;
      const patrol = eco.patrol !== false;
      const pauseFactor = eco.pauseFactor ?? 1.0;

      const WALK_STYLES = {
        // 沉重巨兽（犀牛/大地懒/牛犊慢走）：稳重慢转、步幅长、停顿久、每步带沉重蹬地顿挫
        heavy:  { baseSpd: 11.8, turnWalk: 1.55, turnPause: 1.15, minHop: 22, pauseMin: 1.4, pauseMax: 2.6, arriveDist: 7.5, velSmooth: 4.4, pulseAmp: 0.24, pulseFreq: 3.1, burstChance: 0 },
        // 敏捷潜行猛兽（五尾红豹/狼鲸）：急转切弯、停顿观察后爆发小跑、刹车干脆
        stalk:  { baseSpd: 19.2, turnWalk: 3.55, turnPause: 2.35, minHop: 24, pauseMin: 0.45, pauseMax: 1.35, arriveDist: 7.0, velSmooth: 7.8, pulseAmp: 0.26, pulseFreq: 5.8, burstChance: 0.45 },
        // 碎步灵动小型/二足（哥布林/竹鸡/尾手水兽）：高频短距折返、转向极快、走走停停张望
        scurry: { baseSpd: 16.0, turnWalk: 4.65, turnPause: 3.10, minHop: 14, pauseMin: 0.35, pauseMax: 1.15, arriveDist: 5.8, velSmooth: 9.2, pulseAmp: 0.28, pulseFreq: 7.6, burstChance: 0.35 },
        // 软体脉冲蠕动（拼骨幼虫）：仅伸展推进相挪动，停顿相几乎静止
        crawl:  { baseSpd: 8.8,  turnWalk: 2.40, turnPause: 1.80, minHop: 13, pauseMin: 0.70, pauseMax: 1.60, arriveDist: 5.5, velSmooth: 6.0, pulseAmp: 0.72, pulseFreq: 3.8, burstChance: 0 },
        // 兼容未显式指定的旧脚本：比原版更自然，不再背向硬蹭且带轻柔步伐脉动
        default:{ baseSpd: 14.5, turnWalk: 2.35, turnPause: 1.55, minHop: 20, pauseMin: 1.0, pauseMax: 2.1, arriveDist: 7.0, velSmooth: 5.8, pulseAmp: 0.22, pulseFreq: 4.4, burstChance: 0 }
      };
      const st = WALK_STYLES[eco.walkStyle] || WALK_STYLES.default;

      if (!patrol || pauseFactor < 0.05) {
        const k = expSmooth(dt, 7.5);
        state.vx = lerp(state.vx, 0, k);
        state.vy = lerp(state.vy, 0, k);
        state.x += state.vx * dt;
        state.y += state.vy * dt;
        state.z = lerp(state.z, eco.baseLift ?? 8.8, expSmooth(dt, 8));
        if (!patrol) {
          const idleYaw = (eco.homeYaw ?? 0) + Math.sin(time * 0.75) * 0.20;
          state.yaw += wrapAngle(idleYaw - state.yaw) * expSmooth(dt, 4.0);
        }
        state.thrustPulse = 0;
        state.turnRate = 0;
        return state;
      }

      const nav = stepOrganicTarget(state, dt, time, eco, {
        minHop: st.minHop,
        pauseMin: st.pauseMin,
        pauseMax: st.pauseMax,
        arriveDist: st.arriveDist
      });

      const tx = nav.x + (eco.avoidX || 0);
      const ty = nav.y + (eco.avoidY || 0);
      const dx = tx - state.x, dy = ty - state.y;
      const dist = Math.hypot(dx, dy) || 0.001;
      const desiredYaw = Math.atan2(-dx, dy);
      const yawDiff = wrapAngle(desiredYaw - state.yaw);

      // 转向：大角度调头时先收住前进速度，稳稳拧身对准目标再起步（彻底消除背向硬蹭！）
      const maxTurn = (nav.pausing ? st.turnPause : st.turnWalk) * (0.68 + speed * 0.42);
      const turnStep = clamp(yawDiff, -maxTurn * dt, maxTurn * dt);
      state.yaw = wrapAngle(state.yaw + turnStep);
      state.turnRate = turnStep / Math.max(dt, 0.001);

      // 步态蹬地脉动相位：每一步有「发力推进 -> 落脚微滞」节律，拒绝气垫船匀速平推
      state.walkPhase = (state.walkPhase || 0) + dt * st.pulseFreq * gFreq * (0.72 + speed * 0.36);
      const rawWave = Math.sin(state.walkPhase);
      const strideMod = eco.walkStyle === 'crawl'
        ? (0.12 + Math.pow(Math.max(0, rawWave), 1.6) * 1.45)
        : (1.0 - st.pulseAmp * 0.45 + Math.abs(rawWave) * st.pulseAmp);

      // 敏捷/窜行生物按 navSeq 交替出现“快步窜段”与“慢步审视段”
      const burstSeed = hash2i(state.navSeq || 1, eco.seed ?? 17, 613);
      const burstMul = (st.burstChance > 0 && burstSeed < st.burstChance) ? 1.24 : 0.92;

      // 自然圆弧拐弯：不再像坦克那样停死原地干转！
      // 在场地内保持 0.30~1.0 的弧线切弯前向速度，顺滑划出弧线转向；仅停顿或大角度急掉头时适当收慢
      const minArc = eco.walkStyle === 'stalk' ? 0.42 : (eco.walkStyle === 'scurry' ? 0.34 : 0.26);
      const align = lerp(minArc, 1.0, smoothstep(-0.35, 0.85, Math.cos(yawDiff)));
      const nearSlow = smoothstep(st.arriveDist * 0.30, st.arriveDist * 1.55, dist);
      const walkSpd = nav.pausing ? 0 : (st.baseSpd * speed * burstMul * align * nearSlow * strideMod * pauseFactor);
      const fwdX = -Math.sin(state.yaw), fwdY = Math.cos(state.yaw);

      const kVel = expSmooth(dt, nav.pausing ? st.velSmooth * 1.35 : st.velSmooth);
      state.vx = lerp(state.vx, fwdX * walkSpd, kVel);
      state.vy = lerp(state.vy, fwdY * walkSpd, kVel);
      state.x += state.vx * dt;
      state.y += state.vy * dt;

      const curD = Math.hypot(state.x, state.y);
      const maxR = eco.maxRadius ?? 46;
      if (curD > maxR) { state.x *= maxR / curD; state.y *= maxR / curD; }

      state.z = lerp(state.z, eco.baseLift ?? 8.8, expSmooth(dt, 9));
      state.thrustPulse = clamp(Math.hypot(state.vx, state.vy) / Math.max(8, st.baseSpd), 0, 1);
      return state;
    },

    // 3b. 定点自然走位（供交互归位/接近目标使用，彻底取代 lerp 横移滑冰！）
    //     返回 { dist, arrived, yawDiff }
    walkToPoint(state, tx, ty, dt, params, cfg = {}) {
      const speed = params.speed ?? 1.0;
      const gFreq = params.gaitFreq ?? 1.0;
      const arriveDist = cfg.arriveDist ?? 2.2;
      const maxSpeed = (cfg.maxSpeed ?? 14.5) * speed;
      const maxTurn = (cfg.maxTurn ?? 3.6) * (0.7 + speed * 0.38);
      const pulseAmp = cfg.pulseAmp ?? 0.20;
      const pulseFreq = cfg.pulseFreq ?? 4.8;

      const dx = tx - state.x, dy = ty - state.y;
      const dist = Math.hypot(dx, dy);

      if (dist <= arriveDist) {
        // 到位后自然刹停并缓缓转向目标朝向（不横移滑冰）
        const kStop = expSmooth(dt, 8.8);
        state.vx = lerp(state.vx, 0, kStop);
        state.vy = lerp(state.vy, 0, kStop);
        state.x += state.vx * dt;
        state.y += state.vy * dt;
        let yawDiff = 0;
        if (cfg.aimYaw !== undefined) {
          yawDiff = wrapAngle(cfg.aimYaw - state.yaw);
          const step = clamp(yawDiff, -maxTurn * 0.9 * dt, maxTurn * 0.9 * dt);
          state.yaw = wrapAngle(state.yaw + step);
          state.turnRate = step / Math.max(dt, 0.001);
        } else {
          state.turnRate = 0;
        }
        if (cfg.baseLift !== undefined) {
          state.z = lerp(state.z, cfg.baseLift, expSmooth(dt, 8.5));
        }
        state.thrustPulse = 0;
        return { dist, arrived: true, yawDiff };
      }

      const desiredYaw = Math.atan2(-dx, dy);
      const yawDiff = wrapAngle(desiredYaw - state.yaw);
      const step = clamp(yawDiff, -maxTurn * dt, maxTurn * dt);
      state.yaw = wrapAngle(state.yaw + step);
      state.turnRate = step / Math.max(dt, 0.001);

      state.walkPhase = (state.walkPhase || 0) + dt * pulseFreq * gFreq;
      const strideMod = 1.0 - pulseAmp * 0.45 + Math.abs(Math.sin(state.walkPhase)) * pulseAmp;
      const align = smoothstep(-0.05, 0.72, Math.cos(yawDiff));
      const nearSlow = clamp(dist / Math.max(arriveDist * 3.0, 7.5), 0.32, 1.0);
      const walkSpd = maxSpeed * align * nearSlow * strideMod;

      const fwdX = -Math.sin(state.yaw), fwdY = Math.cos(state.yaw);
      const kVel = expSmooth(dt, 7.2);
      state.vx = lerp(state.vx, fwdX * walkSpd, kVel);
      state.vy = lerp(state.vy, fwdY * walkSpd, kVel);
      state.x += state.vx * dt;
      state.y += state.vy * dt;

      if (cfg.baseLift !== undefined) {
        state.z = lerp(state.z, cfg.baseLift, expSmooth(dt, 8.5));
      }
      state.thrustPulse = clamp(Math.hypot(state.vx, state.vy) / Math.max(8, maxSpeed), 0, 1);
      return { dist, arrived: false, yawDiff };
    },

    wingFlap(state, dt, time, params, eco) {
      const freq = (params.gaitFreq ?? 1.0) * 6.2;
      state.phase = (state.phase || 0) + dt * freq;
      const liftLag = Math.sin(state.phase - 1.15) * 2.4;
      const res = Propulsion.windDrift(state, dt, time, params, { ...eco, baseLift: (eco.baseLift ?? 18) + liftLag });
      res.wingStroke = Math.sin(state.phase);
      return res;
    },

    chargeJump(state, dt, time, params, eco) {
      const freq = (params.gaitFreq ?? 1.0) * 1.35;
      const cy = (time * freq + (eco.seed || 0)) % 1;
      state.jumpCycle = cy;
      if (cy < 0.25) {
        state.z = 0;
        state.squashZ = lerp(1.0, 0.72, cy / 0.25);
      } else if (cy < 0.80) {
        const u = (cy - 0.25) / 0.55;
        state.z = Math.sin(u * Math.PI) * 14;
        state.squashZ = 1 + Math.sin(u * Math.PI) * 0.22;
      } else {
        const u = (cy - 0.80) / 0.20;
        state.z = 0;
        state.squashZ = 1 - Math.sin(u * Math.PI) * 0.18;
      }
      return state;
    },

    rooted(state, dt, time, params, eco) {
      state.x = eco.homeX ?? 0;
      state.y = eco.homeY ?? 0;
      state.z = eco.baseLift ?? 0;
      state.vx = 0; state.vy = 0;
      state.yaw = (eco.homeYaw ?? 0) + Math.sin(time * 1.2) * 0.08;
      return state;
    }
  };

  // =========================================================================
  // 第二层：环境反馈积木（破水白沫、半潜淡化、落地扬尘、高度接地印）
  // =========================================================================
  const EnvFeedback = {
    calcSubmerge(z, waterLevel = 2.6, range = 5.2, isWater = true) {
      if (!isWater) return 0;
      return clamp((waterLevel - z) / range, 0, 1);
    },

    emitFootstep(vfx, habitat, x, y, power = 1.0) {
      if (habitat.isWater) {
        vfx.addRipple(x, y, 2.5, 14 * power, 0.62, 1.5);
        vfx.spawnSplash(x, y, Math.round(4 * power), power * 0.7, habitat.fx);
      } else {
        vfx.spawnDust(x, y, Math.round(5 * power), power, habitat.fx);
      }
    },

    emitWaterWake(vfx, habitat, x, y, yaw, width, power = 1.0) {
      if (!habitat.isWater) return;
      vfx.addWake(x, y, yaw, width, 1.12);
      if (power > 0.72) {
        vfx.addRipple(x, y, 3, 18, 0.70, 1.7);
      }
    },

    calcGroundShadow(lift, footRadius) {
      const hFactor = clamp(1 - lift / 54, 0.22, 1.0);
      return {
        alpha: 0.46 * hFactor,
        radius: footRadius * (0.58 + 0.42 * hFactor),
        offsetX: 1.6 + lift * 0.14,
        offsetY: -1.6 - lift * 0.14
      };
    }
  };

  function computeEcoAvoidance(self, allActors) {
    let ax = 0, ay = 0;
    const mySize = self.def.ecoWeight ?? 1.0;
    for (const other of allActors) {
      if (other === self) continue;
      const dx = self.state.x - other.state.x;
      const dy = self.state.y - other.state.y;
      const d = Math.hypot(dx, dy) || 0.01;
      const otherSize = other.def.ecoWeight ?? 1.0;
      const safeDist = 20 + (mySize + otherSize) * 6.5;
      if (d < safeDist) {
        const repel = ((safeDist - d) / safeDist) * (otherSize > mySize ? 18 : 9);
        ax += (dx / d) * repel;
        ay += (dy / d) * repel;
      }
    }
    return { avoidX: ax, avoidY: ay };
  }

  // =========================================================================
  // 第三层：通用「伏击流程」状态机（供 M19 装成静物 / M27 陆上弹射共用）
  // 阶段：disguise(伪装静伏) -> tense(察觉绷紧) -> strike(迅速出手)
  //       -> digest(吞下鼓动) -> recover(缓慢复原/破绽) -> [relocate(极慢挪位)] -> disguise
  // =========================================================================
  function createAmbushCycle(cfg = {}) {
    const seed = cfg.seed ?? 53;
    const rngRange = (range, seq, salt, defMin, defMax) => {
      const a = Array.isArray(range) ? range[0] : (range ?? defMin);
      const b = Array.isArray(range) ? range[1] : (range ?? defMax);
      return lerp(a, b, hash2i(seq, seed, salt));
    };

    const st = {
      mode: 'disguise',
      prevMode: 'disguise',
      t: 0,
      dur: 9.0,
      seq: 1,
      cycleCount: 0,
      tremorCd: 2.8,
      tremorT: -1
    };

    function enter(nextMode, customDur) {
      st.prevMode = st.mode;
      st.mode = nextMode;
      st.t = 0;
      st.seq++;
      if (customDur != null) {
        st.dur = Math.max(0.05, customDur);
      } else if (nextMode === 'disguise') {
        st.dur = rngRange(cfg.disguiseDur, st.seq, 101, 8.0, 14.0);
        st.tremorCd = rngRange(cfg.tremorInterval, st.seq, 107, 2.2, 4.4);
        st.tremorT = -1;
      } else if (nextMode === 'tense') {
        st.dur = rngRange(cfg.tenseDur, st.seq, 211, 0.32, 0.56);
      } else if (nextMode === 'strike') {
        st.dur = rngRange(cfg.strikeDur, st.seq, 307, 0.25, 0.40);
      } else if (nextMode === 'digest') {
        st.dur = rngRange(cfg.digestDur, st.seq, 409, 1.5, 2.2);
      } else if (nextMode === 'recover') {
        st.dur = rngRange(cfg.recoverDur, st.seq, 503, 3.0, 4.5);
      } else if (nextMode === 'relocate') {
        st.dur = rngRange(cfg.relocateDur, st.seq, 607, 2.4, 3.8);
      } else {
        st.dur = 2.0;
      }
    }

    function reset(initialMode = 'disguise') {
      st.seq = 1;
      st.cycleCount = 0;
      enter(initialMode);
    }

    function trigger() {
      if (st.mode === 'disguise') {
        enter('tense');
        return true;
      }
      return false;
    }

    function forceState(mode, customDur) {
      enter(mode, customDur);
    }

    function update(dt, opts = {}) {
      const speed = clamp(opts.speed ?? 1.0, 0.2, 3.0);
      const autoTrigger = opts.autoTrigger !== false;
      const canRelocate = opts.canRelocate !== false;
      const relocateEvery = cfg.relocateEvery ?? 2;

      const beforeMode = st.mode;
      st.t += dt * speed;

      // 伪装态偶发微颤（0..1 脉冲，让静伏也有活体呼吸感）
      let tremor = 0;
      if (st.mode === 'disguise') {
        st.tremorCd -= dt * speed;
        if (st.tremorCd <= 0 && st.tremorT < 0) {
          st.tremorT = 0;
        }
        if (st.tremorT >= 0) {
          st.tremorT += dt * speed;
          const trDur = 0.42;
          if (st.tremorT >= trDur) {
            st.tremorT = -1;
            st.tremorCd = rngRange(cfg.tremorInterval, st.seq + Math.floor(st.t * 3), 173, 2.4, 4.8);
          } else {
            tremor = Math.sin((st.tremorT / trDur) * Math.PI);
          }
        }
      }

      if (st.t >= st.dur) {
        if (st.mode === 'disguise') {
          if (autoTrigger) {
            enter('tense');
          } else if (canRelocate && relocateEvery > 0) {
            enter('relocate');
          } else {
            enter('disguise');
          }
        } else if (st.mode === 'tense') {
          enter('strike');
        } else if (st.mode === 'strike') {
          enter('digest');
        } else if (st.mode === 'digest') {
          enter('recover');
        } else if (st.mode === 'recover') {
          st.cycleCount++;
          if (canRelocate && relocateEvery > 0 && (st.cycleCount % relocateEvery === 0)) {
            enter('relocate');
          } else {
            enter('disguise');
          }
        } else {
          enter('disguise');
        }
      }

      return {
        mode: st.mode,
        prevMode: beforeMode,
        changed: st.mode !== beforeMode,
        t: st.t,
        dur: st.dur,
        p: clamp(st.t / Math.max(0.01, st.dur), 0, 1),
        tremor,
        seq: st.seq,
        cycleCount: st.cycleCount
      };
    }

    reset('disguise');
    return { state: st, reset, trigger, forceState, update };
  }

  // =========================================================================
  // 第四层：跨个体挂点搭载 + 宿主受扰/蹭树生态积木（供 M30 / M36 / 停靠小鸟共用）
  // 宿主规约：
  //   - 显式挂点：inst.mountSockets = [{ id, x, y, z, yaw, r?, occupiedBy }]，每帧刷新
  //   - 普通宿主：无 mountSockets 时自动按 state + footRadius/backZ 估算默认背心挂点
  // =========================================================================
  function isValidMountHost(actor, opts = {}) {
    if (!actor || !actor.state || !actor.def) return false;
    if (actor.def.noHost) return false;
    if (!opts.allowPlaceholders && actor.isPlaceholder) return false;
    if (actor.state.mode === 'burrow' || (actor.state.shadowScale !== undefined && actor.state.shadowScale <= 0.02)) {
      return false;
    }
    const r = (actor.def.footRadius || 10) * (actor.scaleMul || 1);
    if (r < (opts.minFootRadius ?? 6)) return false;
    return true;
  }

  function estimateAutoBackHeight(host, footR) {
    if (host.def.mountHeight != null) return host.def.mountHeight * (host.scaleMul || 1);
    if (host.def.backZ != null) return host.def.backZ * (host.scaleMul || 1);
    if (host._autoBackH == null) {
      let est = (host.def.headZ ?? Math.max(9, footR * 1.15));
      if (host.parts && typeof host.parts === 'object') {
        let bestBodyH = 0;
        for (const k in host.parts) {
          const a = host.parts[k];
          if (a && a.h > bestBodyH) bestBodyH = a.h;
        }
        if (bestBodyH > 0) {
          // 多数四足/直立怪躯干抬升约 footR*0.65，取顶高约 82% 落在肩背表皮处
          est = Math.max(est, bestBodyH * 0.86);
        }
      }
      host._autoBackH = clamp(est, 8, Math.max(28, footR * 2.1));
    }
    return host._autoBackH * (host.scaleMul || 1);
  }

  function updateAutoBackSocket(host) {
    const sMul = host.scaleMul || 1;
    const footR = (host.def.footRadius || 10) * sMul;
    const backOff = host.def.mountBackOffset ?? (-footR * 0.12);
    const baseZ = estimateAutoBackHeight(host, footR / sMul);
    const [wx, wy] = localToWorldXY(host.state.x, host.state.y, host.state.yaw || 0, 0, backOff);
    if (!host._autoMountSockets) {
      host._autoMountSockets = [{ id: 'auto_back', x: wx, y: wy, z: (host.state.z || 0) + baseZ, yaw: host.state.yaw || 0, r: footR * 0.55, occupiedBy: null, auto: true }];
    } else {
      const slot = host._autoMountSockets[0];
      slot.x = wx;
      slot.y = wy;
      slot.z = (host.state.z || 0) + baseZ;
      slot.yaw = host.state.yaw || 0;
      slot.r = footR * 0.55;
    }
    return host._autoMountSockets;
  }

  const MountSystem = {
    // 取得宿主的所有可用挂点（显式 mountSockets 优先，否则自动估算背心挂点）
    ensureMountSockets(host) {
      if (!host || !host.state) return [];
      if (Array.isArray(host.mountSockets) && host.mountSockets.length > 0) {
        return host.mountSockets;
      }
      return updateAutoBackSocket(host);
    },

    // 在同台生物中搜寻一个空闲挂点
    findMountHost(self, allActors, opts = {}) {
      if (!Array.isArray(allActors) || allActors.length === 0) return null;
      const riderId = opts.riderId || (self && self.cachePrefix) || 'rider';
      const preferredCodes = opts.preferredCodes || null;
      const excludeCodes = opts.excludeCodes || null;
      const excludeHost = opts.excludeHost || null;
      const maxDist = opts.maxDist ?? 160;
      const sx = self && self.state ? self.state.x : (opts.x || 0);
      const sy = self && self.state ? self.state.y : (opts.y || 0);

      let best = null;
      let bestScore = -Infinity;

      for (let i = 0; i < allActors.length; i++) {
        const actor = allActors[i];
        if (!actor || actor === self || actor === excludeHost) continue;
        if (!isValidMountHost(actor, opts)) continue;
        const code = (actor.ecoData && actor.ecoData.code) || actor.def.code || '';
        if (excludeCodes && excludeCodes.includes(code)) continue;

        const sockets = MountSystem.ensureMountSockets(actor);
        if (!sockets.length) continue;

        let freeSlot = null;
        for (let k = 0; k < sockets.length; k++) {
          const sl = sockets[k];
          if (!sl.occupiedBy || sl.occupiedBy === riderId) {
            freeSlot = sl;
            break;
          }
        }
        if (!freeSlot) continue;

        const dist = Math.hypot(freeSlot.x - sx, freeSlot.y - sy);
        if (dist > maxDist) continue;

        let score = 100 - dist * 0.45 + (actor.def.footRadius || 10) * 1.4;
        if (preferredCodes && preferredCodes.includes(code)) score += 120;
        if (opts.preferExplicit && !freeSlot.auto) score += 60;
        if (score > bestScore) {
          bestScore = score;
          best = { host: actor, slot: freeSlot };
        }
      }
      return best;
    },

    claimMount(riderId, host, slot) {
      if (!host || !slot) return false;
      if (slot.occupiedBy && slot.occupiedBy !== riderId) return false;
      slot.occupiedBy = riderId;
      if (host.state) {
        host.state._riderCount = (host.state._riderCount || 0) + 1;
      }
      return true;
    },

    releaseMount(riderId, allActors) {
      if (!riderId || !Array.isArray(allActors)) return;
      for (let i = 0; i < allActors.length; i++) {
        const actor = allActors[i];
        if (!actor) continue;
        const lists = [actor.mountSockets, actor._autoMountSockets];
        for (let l = 0; l < lists.length; l++) {
          const arr = lists[l];
          if (!Array.isArray(arr)) continue;
          for (let k = 0; k < arr.length; k++) {
            if (arr[k] && arr[k].occupiedBy === riderId) {
              arr[k].occupiedBy = null;
              if (actor.state && actor.state._riderCount > 0) actor.state._riderCount--;
            }
          }
        }
      }
    },

    // 读取挂点最新世界姿态（自动刷新默认背心挂点）
    getMountWorldPose(host, slot, offsetLocal) {
      if (!host || !slot || !host.state) return null;
      if (slot.auto) updateAutoBackSocket(host);
      const alive = isValidMountHost(host, { allowPlaceholders: true, minFootRadius: 0 });
      let x = slot.x, y = slot.y, z = slot.z;
      const yaw = slot.yaw ?? host.state.yaw ?? 0;
      if (offsetLocal) {
        const [ox, oy] = localToWorldXY(x, y, yaw, offsetLocal.lx || 0, offsetLocal.ly || 0);
        x = ox;
        y = oy;
        z += offsetLocal.lz || 0;
      }
      return { x, y, z, yaw, alive };
    },

    // 飞近 / 弹跳接近并停靠上宿主挂点
    stepApproachAndMount(riderState, host, slot, dt, params, cfg = {}) {
      const pose = MountSystem.getMountWorldPose(host, slot, cfg.offsetLocal);
      if (!pose || !pose.alive) return { mounted: false, lost: true, dist: Infinity };
      const speed = (cfg.speed ?? 26) * (params && params.speed ? params.speed : 1);
      const arriveDist = cfg.arriveDist ?? 2.4;
      const dx = pose.x - riderState.x;
      const dy = pose.y - riderState.y;
      const dz = pose.z - riderState.z;
      const dist = Math.hypot(dx, dy);

      if (dist <= arriveDist) {
        riderState.x = pose.x;
        riderState.y = pose.y;
        riderState.z = pose.z;
        riderState.vx = 0;
        riderState.vy = 0;
        riderState.sortBias = Math.max((host.def.footRadius || 10) * (host.scaleMul || 1) * 1.15, 16);
        riderState.yaw = cfg.matchYaw !== false
          ? wrapAngle(pose.yaw + (cfg.yawOffset || 0))
          : riderState.yaw;
        return { mounted: true, lost: false, dist: 0, x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw };
      }

      const step = Math.min(dist, speed * dt);
      const nx = riderState.x + (dx / Math.max(dist, 0.001)) * step;
      const ny = riderState.y + (dy / Math.max(dist, 0.001)) * step;
      const arc = cfg.arcLift ? Math.sin(clamp(dist / Math.max(cfg.arcSpan || 28, 6), 0, 1) * Math.PI) * cfg.arcLift : 0;
      const nz = lerp(riderState.z, pose.z + arc, expSmooth(dt, 7.5));
      riderState.vx = (nx - riderState.x) / Math.max(dt, 0.001);
      riderState.vy = (ny - riderState.y) / Math.max(dt, 0.001);
      riderState.x = nx;
      riderState.y = ny;
      riderState.z = nz;
      riderState.yaw = wrapAngle(riderState.yaw + wrapAngle(Math.atan2(-dx, dy) - riderState.yaw) * expSmooth(dt, 9.0));
      return { mounted: false, lost: false, dist, x: nx, y: ny, z: nz, yaw: riderState.yaw };
    }
  };

  // 宿主受寄生/附着扰动反馈（供宿主微晃甩身或去找树干蹭背）
  function notifyHostDisturb(host, riderId, intensity = 1.0) {
    if (!host || !host.state) return;
    host.state._disturbTimer = Math.max(host.state._disturbTimer || 0, 1.4);
    host.state._disturbIntensity = clamp(Math.max(host.state._disturbIntensity || 0, intensity), 0, 2);
    host.state._disturbBy = riderId || null;
  }

  function stepHostDisturb(state, dt, time) {
    if (!state || !state._disturbTimer || state._disturbTimer <= 0) {
      return { active: false, shakeYaw: 0, shakeX: 0, shakeY: 0, wantRub: false, intensity: 0 };
    }
    state._disturbTimer = Math.max(0, state._disturbTimer - dt);
    const env = clamp(state._disturbTimer / 1.4, 0, 1);
    const inten = (state._disturbIntensity || 1.0) * env;
    const w = Math.sin(time * 24.0);
    // 偶发产生蹭树冲动，便于大型宿主脚本在巡游中转向木桩/边缘蹭背
    const wantRub = inten > 0.45 && Math.sin(time * 1.1) > 0.65;
    if (state._disturbTimer <= 0) {
      state._disturbIntensity = 0;
      state._disturbBy = null;
    }
    return {
      active: true,
      shakeYaw: w * 0.09 * inten,
      shakeX: w * 0.45 * inten,
      shakeY: Math.cos(time * 24.0) * 0.35 * inten,
      wantRub,
      intensity: inten
    };
  }

  PW.Behaviors = {
    Propulsion,
    EnvFeedback,
    computeEcoAvoidance,
    createAmbushCycle,
    MountSystem,
    notifyHostDisturb,
    stepHostDisturb
  };
})(window.PixelWorkshop);

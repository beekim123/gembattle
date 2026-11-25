'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { clamp, lerp, expSmooth, wrapAngle, localToWorldXY, fbm1 } = PW.Math;

  // =========================================================================
  // 1. 真·P5.js 拖拽 + 最大转角约束物理链（ChainSolver v2）
  //    头一拐弯，后半截身体留在原水路上被一节节拽着走，自然甩出流畅 S 弯！
  // =========================================================================
  class ChainSolver {
    constructor(count, segLen, opts = {}) {
      this.count = count;
      this.segLen = segLen;
      this.maxAngle = opts.maxAngle ?? 0.52; // 相邻节最大弯曲弧度（防折成锐角）
      this.waveFreq = opts.waveFreq ?? 4.2;
      this.wavePhaseStep = opts.wavePhaseStep ?? 0.48;
      this.waveAmp = opts.waveAmp ?? 0.35;
      this.nodes = Array.from({ length: count }, (_, i) => ({
        x: 0, y: -i * segLen, z: 4, yaw: 0
      }));
    }

    reset(rootX, rootY, rootZ, yaw) {
      for (let i = 0; i < this.count; i++) {
        const [wx, wy] = localToWorldXY(rootX, rootY, yaw, 0, -i * this.segLen);
        this.nodes[i].x = wx;
        this.nodes[i].y = wy;
        this.nodes[i].z = rootZ;
        this.nodes[i].yaw = yaw;
      }
    }

    // 真·距离 + 转角约束 + 切线法向行进波（彻底告别“跟着整体旋转的硬扇子”）
    update(dt, rootX, rootY, rootZ, rootYaw, time, cfg = {}) {
      const nodes = this.nodes;
      const segLen = cfg.segLen ?? this.segLen;
      const flex = cfg.flexibility ?? 1.0;
      const maxAng = clamp((cfg.maxAngle ?? this.maxAngle) * (0.65 + flex * 0.55), 0.22, 1.05);
      const fanAngle = cfg.fanAngle ?? 0;
      const waveFreq = cfg.waveFreq ?? this.waveFreq;
      const waveAmp = (cfg.waveAmp ?? this.waveAmp) * flex;
      const wavePhaseStep = cfg.wavePhaseStep ?? this.wavePhaseStep;
      const phaseOffset = cfg.phaseOffset ?? 0;
      const restAlign = cfg.restAlign ?? 0.08; // 极轻柔的归位趋势，保留 92% 真实拖拽惯性
      const zTargetFn = cfg.zTargetFn || (() => rootZ);
      const kz = expSmooth(dt, cfg.zFollowSpeed ?? 11.0);

      // 根节点紧贴身体挂点
      nodes[0].x = rootX;
      nodes[0].y = rootY;
      nodes[0].z = rootZ;
      nodes[0].yaw = rootYaw + fanAngle;

      // 从第 1 节往末节逐节做 P5.js 距离约束 + 最大夹角约束
      for (let i = 1; i < nodes.length; i++) {
        const u = i / Math.max(1, nodes.length - 1);
        const prev = nodes[i - 1];
        const cur = nodes[i];

        // 1) 当前节点相对前一节的方向向量（保留上一帧世界坐标的真实拖拽轨迹！）
        let dx = cur.x - prev.x;
        let dy = cur.y - prev.y;
        let dist = Math.hypot(dx, dy);
        if (dist < 0.001) {
          const [fx, fy] = localToWorldXY(0, 0, prev.yaw, 0, -1);
          dx = fx; dy = fy; dist = 1;
        }

        // 前一节指向后方的基准角（正面 +Y，后方 -Y 对应 yaw + PI）
        let backAng = Math.atan2(dy, dx);
        const prevBackAng = prev.yaw - Math.PI * 0.5; // -Y 在 (cos, sin) 极坐标下为 yaw - PI/2

        // 2) 叠加上极轻柔的游泳推进侧摆 + 扇形张开趋势（只施加柔和角度偏移，不抹杀拖拽弯曲！）
        const swimWave = Math.sin(time * waveFreq - i * wavePhaseStep + phaseOffset) * waveAmp * (0.35 + u * 0.95);
        const desiredBack = prevBackAng + (i === 1 ? fanAngle * 0.35 : 0) + swimWave * 0.35;
        backAng += wrapAngle(desiredBack - backAng) * clamp(restAlign * dt * 60, 0, 0.35);

        // 3) 角度约束（Angle Constraint）：限制相对前一节的最大折角，保证肉体曲线圆润顺滑
        const rel = wrapAngle(backAng - prevBackAng);
        const clampedRel = clamp(rel, -maxAng, maxAng);
        const finalBack = prevBackAng + clampedRel;

        // 4) 严格距离约束（Distance Constraint）
        cur.x = prev.x + Math.cos(finalBack) * segLen;
        cur.y = prev.y + Math.sin(finalBack) * segLen;
        cur.z = lerp(cur.z, zTargetFn(u, i, time), kz);

        // 当前节朝向（指向前一节的方向，即 finalBack + PI/2）
        cur.yaw = wrapAngle(finalBack + Math.PI * 0.5);
      }

      return nodes;
    }
  }

  // =========================================================================
  // 2. 精确 2-Bone 平面解析 IK + 通用多足步态器（2 / 4 / 6 足共用）
  //    支持急转身自动补步、支撑重心偏移量输出、平滑抛物线抬脚与落地冲击事件
  // =========================================================================
  function solveIK2D(hx, hz, tx, tz, L1, L2, bendDir = 1) {
    const dx = tx - hx, dz = tz - hz;
    const rawD = Math.hypot(dx, dz) || 0.0001;
    const minD = Math.abs(L1 - L2) + 0.02;
    const maxD = L1 + L2 - 0.02;
    const d = clamp(rawD, minD, maxD);
    const cosA = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
    const baseAng = Math.atan2(dz, dx);
    const kneeAng = baseAng + bendDir * Math.acos(cosA);
    return {
      kx: hx + Math.cos(kneeAng) * L1,
      kz: hz + Math.sin(kneeAng) * L1,
      ex: hx + (dx / rawD) * d,
      ez: hz + (dz / rawD) * d
    };
  }

  // 矢状面 3D 2-Bone IK：在躯干自身前后矢状面内解算膝肘（前肢肘向后折 kneeSign=-1，后肢膝向前折 kneeSign=+1）
  // 彻底消灭传统「髋->足射线平面」IK 在后足滞后时把膝盖甩到屁股后面、以及过髋时 180° 翻转的奇点
  function solveSagittalLegIK(hx, hy, hz, fx, fy, fz, ayaw, L1, L2, kneeSign, sMul = 1.0) {
    const fwdX = -Math.sin(ayaw), fwdY = Math.cos(ayaw);
    const rightX = Math.cos(ayaw), rightY = Math.sin(ayaw);
    const dx = fx - hx, dy = fy - hy;
    const dFwd = dx * fwdX + dy * fwdY;
    const dSide = dx * rightX + dy * rightY;
    const dZ = fz - hz;
    const rawD = Math.hypot(dFwd, dZ) || 0.001;
    const minD = Math.abs(L1 - L2) + 0.15 * sMul;
    const maxD = L1 + L2 - 0.12 * sMul;
    const d = clamp(rawD, minD, maxD);
    const cosA = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const uFwd = dFwd / rawD;
    const uZ = dZ / rawD;
    const along = L1 * cosA;
    const perp = L1 * sinA * kneeSign;
    const kFwd = along * uFwd + perp * (-uZ);
    const kZ = hz + along * uZ + perp * uFwd;
    const kSide = dSide * 0.45;
    return {
      kx: hx + kFwd * fwdX + kSide * rightX,
      ky: hy + kFwd * fwdY + kSide * rightY,
      kz: Math.max(1.3 * sMul, kZ)
    };
  }

  class MultiLegGaitSolver {
    constructor(legs, opts = {}) {
      const autoMode = legs.length === 2 ? 'biped' : (legs.length === 6 ? 'tripod' : 'walk4');
      this.mode = opts.mode || autoMode; // 'walk4' | 'trot' | 'bound' | 'biped' | 'tripod'
      this.stepThreshold = opts.stepThreshold ?? 5.2;
      this.stepDuration = opts.stepDuration ?? 0.25;
      this.stepHeight = opts.stepHeight ?? 4.6;
      this.strideAnticipation = opts.strideAnticipation ?? 0.50;
      this.settleDelay = opts.settleDelay ?? 0.16;
      this.settleThreshold = opts.settleThreshold ?? 1.05;
      this.idleTime = 0;
      this.lastStepClock = -10;
      this.clock = 0;
      this.gaitPhase = 0;
      this.prevBodyYaw = 0;
      this.hasPrevYaw = false;
      this.lastOrderIdx = -1;

      this.legs = legs.map((l, idx) => {
        const isFront = (l.restY ?? 0) >= 0;
        const isLeft = (l.restX ?? 0) < 0;
        // 自然四拍顺序：左后(0) -> 左前(1) -> 右后(2) -> 右前(3)
        let walkOrder = idx;
        let walkOff = 0, trotOff = 0, boundOff = 0;
        let tripodGroup = l.tripodGroup;
        let tripodOff = 0;
        if (legs.length === 4) {
          if (!isFront && isLeft)       { walkOrder = 0; walkOff = 0.00; trotOff = 0.00; boundOff = 0.00; }
          else if (isFront && isLeft)   { walkOrder = 1; walkOff = 0.25; trotOff = 0.55; boundOff = 0.48; }
          else if (!isFront && !isLeft) { walkOrder = 2; walkOff = 0.50; trotOff = 0.50; boundOff = 0.08; }
          else                          { walkOrder = 3; walkOff = 0.75; trotOff = 0.05; boundOff = 0.56; }
        } else if (legs.length === 6) {
          // 6 足三角步态默认分组：L1+R2+L3 为 0 组（0°），R1+L2+R3 为 1 组（180° 反相）
          if (tripodGroup === undefined) {
            const rowIdx = (l.restY ?? 0) > 2.0 ? 0 : ((l.restY ?? 0) < -2.0 ? 2 : 1);
            tripodGroup = ((isLeft ? 0 : 1) + rowIdx) & 1;
          }
          tripodOff = tripodGroup ? 0.50 : 0.00;
          trotOff = tripodOff;
        }
        return {
          ...l,
          index: idx,
          isFront,
          isLeft,
          walkOrder,
          walkOff,
          trotOff,
          boundOff,
          tripodGroup: tripodGroup ?? 0,
          tripodOff,
          kneeSign: l.kneeSign ?? (isFront ? -1 : 1),
          footX: l.restX,
          footY: l.restY,
          footZ: 0,
          startX: l.restX,
          startY: l.restY,
          targetX: l.restX,
          targetY: l.restY,
          stepping: false,
          stepT: 0,
          curStepDur: this.stepDuration,
          curStepHeight: this.stepHeight,
          isSettling: false,
          cooldown: 0,
          kneeX: l.restX,
          kneeY: l.restY,
          kneeZ: (l.hipZ || 8) * 0.55,
          hipWX: l.hipX,
          hipWY: l.hipY,
          hipWZ: l.hipZ || 8,
          fwdOffset: 0,
          sideOffset: 0,
          strideState: 'mid', // 'forward' | 'mid' | 'back'
          justLanded: false
        };
      });
    }

    reset(bodyX, bodyY, bodyYaw, scaleMul = 1.0, legAnchors = null) {
      this.idleTime = 0;
      this.clock = 0;
      this.gaitPhase = 0;
      this.lastStepClock = -10;
      this.prevBodyYaw = bodyYaw;
      this.hasPrevYaw = true;
      for (const leg of this.legs) {
        const anc = (legAnchors && (legAnchors[leg.id] || legAnchors[leg.index])) || null;
        const ax = anc ? anc.x : bodyX;
        const ay = anc ? anc.y : bodyY;
        const ayaw = anc ? anc.yaw : bodyYaw;
        const [rx, ry] = localToWorldXY(ax, ay, ayaw, leg.restX * scaleMul, leg.restY * scaleMul);
        const [hx, hy] = localToWorldXY(ax, ay, ayaw, leg.hipX * scaleMul, leg.hipY * scaleMul);
        leg.hipWX = hx;
        leg.hipWY = hy;
        leg.anchorYaw = ayaw;
        leg.footX = leg.startX = leg.targetX = rx;
        leg.footY = leg.startY = leg.targetY = ry;
        leg.footZ = 0;
        leg.stepping = false;
        leg.stepT = 0;
        leg.isSettling = false;
        leg.cooldown = 0;
        leg.fwdOffset = 0;
        leg.sideOffset = 0;
        leg.strideState = 'mid';
        leg.justLanded = false;
      }
    }

    update(dt, bodyX, bodyY, bodyZ, bodyYaw, velX, velY, opts = {}) {
      const sMul = opts.scaleMul ?? 1.0;
      const mode = opts.mode || this.mode;
      const stepFreq = opts.stepFreq ?? 1.0;
      const baseStepHeight = opts.stepHeight ?? (this.stepHeight * sMul);
      const baseStepDur = clamp((opts.stepDuration ?? this.stepDuration) / Math.max(0.35, stepFreq), 0.11, 0.48);
      const threshold = (opts.stepThreshold ?? (this.stepThreshold * sMul)) / Math.max(0.55, Math.sqrt(stepFreq));
      const settleThr = (opts.settleThreshold ?? 1.35) * sMul;
      const legAnchors = opts.legAnchors || null;
      const landed = [];

      this.clock += dt;
      const yawRate = this.hasPrevYaw ? Math.abs(wrapAngle(bodyYaw - this.prevBodyYaw)) / Math.max(dt, 0.001) : 0;
      this.prevBodyYaw = bodyYaw;
      this.hasPrevYaw = true;

      const moveSpd = Math.hypot(velX, velY);
      if (moveSpd < 1.35 && yawRate < 0.22) {
        this.idleTime += dt;
      } else {
        this.idleTime = 0;
      }

      // 第一步：更新髋位（支持每条腿挂在独立胸/胯锚点上）、理想落点与距离
      let liftSum = 0;
      let frontLift = 0, rearLift = 0;
      let localRoll = 0, localPitch = 0;
      let steppingCount = 0;
      const isQuadruped = this.legs.length === 4 && mode !== 'biped';
      const isHexapod = this.legs.length === 6 && mode !== 'biped';
      const isMoving = moveSpd > 1.35 || yawRate > 0.22;
      const isSettlingNow = this.idleTime > this.settleDelay;

      if (isQuadruped) {
        // 四足动物专用：位移驱动循环步态 + 支撑期钉地防拖腿 + 矢状面 3D IK（彻底消灭后腿拖行与膝盖后翻）
        const strideLen = Math.max(8.5 * sMul, threshold * 2.45);
        if (isMoving) {
          const dPhase = ((moveSpd / strideLen) + yawRate * 0.22) * dt * clamp(stepFreq, 0.45, 2.0);
          this.gaitPhase = (this.gaitPhase + dPhase) % 1;
        }
        const swingFrac = mode === 'bound' ? 0.48 : (mode === 'trot' ? 0.46 : 0.40);
        const reachHalf = clamp(threshold * 0.66, 2.1 * sMul, 3.8 * sMul);
        const maxBackBehindHip = Math.max(2.8 * sMul, threshold * 0.78);
        const maxFromIdeal = Math.max(4.0 * sMul, threshold * 1.15);
        const activeStepH = Math.max(baseStepHeight, 2.6 * sMul);
        let settlingAny = this.legs.some(l => l.isSettling && l.stepping);

        for (const leg of this.legs) {
          leg.justLanded = false;
          const anc = (legAnchors && (legAnchors[leg.id] || legAnchors[leg.index])) || null;
          const ax = anc ? anc.x : bodyX;
          const ay = anc ? anc.y : bodyY;
          const az = (anc && anc.z !== undefined) ? anc.z : bodyZ;
          const ayaw = anc ? anc.yaw : bodyYaw;
          leg.anchorYaw = ayaw;

          const [hx, hy] = localToWorldXY(ax, ay, ayaw, leg.hipX * sMul, leg.hipY * sMul);
          const hz = az + (leg.hipZ ?? 8) * sMul;
          leg.hipWX = hx; leg.hipWY = hy; leg.hipWZ = hz;

          const [idealX, idealY] = localToWorldXY(ax, ay, ayaw, leg.restX * sMul, leg.restY * sMul);
          leg._idealX = idealX;
          leg._idealY = idealY;
          const fwdX = -Math.sin(ayaw), fwdY = Math.cos(ayaw);
          const rightX = Math.cos(ayaw), rightY = Math.sin(ayaw);

          if (isMoving) {
            leg.isSettling = false;
            const off = mode === 'bound' ? leg.boundOff : (mode === 'trot' ? leg.trotOff : leg.walkOff);
            const phi = (this.gaitPhase + off) % 1;
            const wantSwing = phi < swingFrac;
            const speedRatio = clamp(moveSpd / 12.0, 0.30, 1.12);
            const landX = idealX + fwdX * reachHalf * speedRatio;
            const landY = idealY + fwdY * reachHalf * speedRatio;

            if (wantSwing) {
              if (!leg.stepping) {
                leg.stepping = true;
                leg.startX = leg.footX;
                leg.startY = leg.footY;
              }
              const u = clamp(phi / swingFrac, 0, 1);
              leg.stepT = u;
              const s = u * u * (3 - 2 * u);
              leg.footX = lerp(leg.startX, landX, s);
              leg.footY = lerp(leg.startY, landY, s);
              const arcPow = mode === 'walk4' ? 0.84 : (mode === 'bound' ? 0.74 : 0.78);
              leg.footZ = Math.pow(Math.sin(u * Math.PI), arcPow) * activeStepH * (0.60 + 0.40 * speedRatio);
              liftSum += leg.footZ;
              if (leg.isFront) frontLift += leg.footZ;
              else rearLift += leg.footZ;
              steppingCount++;
            } else {
              if (leg.stepping) {
                leg.stepping = false;
                leg.stepT = 1;
                leg.footX = landX;
                leg.footY = landY;
                leg.footZ = 0;
                leg.justLanded = true;
                landed.push(leg);
              } else {
                leg.footZ = 0;
              }
              // 支撑期钉地同时限制最大髋后滞后，彻底杜绝后腿被拖着走
              const dxH = leg.footX - hx, dyH = leg.footY - hy;
              const fwdFromHip = dxH * fwdX + dyH * fwdY;
              const sideFromHip = dxH * rightX + dyH * rightY;
              if (fwdFromHip < -maxBackBehindHip) {
                leg.footX = hx - maxBackBehindHip * fwdX + sideFromHip * rightX;
                leg.footY = hy - maxBackBehindHip * fwdY + sideFromHip * rightY;
              }
              const dId = Math.hypot(leg.footX - idealX, leg.footY - idealY);
              if (dId > maxFromIdeal && dId > 0.001) {
                const kFix = maxFromIdeal / dId;
                leg.footX = idealX + (leg.footX - idealX) * kFix;
                leg.footY = idealY + (leg.footY - idealY) * kFix;
              }
            }
          } else {
            // 停步收脚：平稳落完空中脚，再依次轻抬收回肩胯正下
            if (leg.stepping && !leg.isSettling) {
              leg.isSettling = true;
              leg.stepT = 0.25;
              leg.startX = leg.footX;
              leg.startY = leg.footY;
              settlingAny = true;
            }
            const dId = Math.hypot(leg.footX - idealX, leg.footY - idealY);
            if (!leg.stepping && !settlingAny && isSettlingNow && dId > settleThr) {
              leg.stepping = true;
              leg.isSettling = true;
              leg.stepT = 0;
              leg.startX = leg.footX;
              leg.startY = leg.footY;
              settlingAny = true;
            }
            if (leg.stepping && leg.isSettling) {
              leg.stepT += dt / 0.17;
              if (leg.stepT >= 1) {
                leg.stepping = false;
                leg.isSettling = false;
                leg.stepT = 1;
                leg.footX = idealX;
                leg.footY = idealY;
                leg.footZ = 0;
                leg.justLanded = true;
                landed.push(leg);
              } else {
                const u = leg.stepT;
                const s = u * u * (3 - 2 * u);
                leg.footX = lerp(leg.startX, idealX, s);
                leg.footY = lerp(leg.startY, idealY, s);
                leg.footZ = Math.sin(u * Math.PI) * activeStepH * 0.48;
                liftSum += leg.footZ;
                steppingCount++;
              }
            } else {
              leg.footZ = 0;
            }
          }
          leg._dist = Math.hypot(idealX - leg.footX, idealY - leg.footY);
        }
      } else if (isHexapod) {
        // 6 足节肢专用：三角步态（Tripod Gait，L1+R2+L3 与 R1+L2+R3 180° 反相，占空比 β≈0.54）
        const strideLen = Math.max(7.2 * sMul, threshold * 2.25);
        if (isMoving) {
          const dPhase = ((moveSpd / strideLen) + yawRate * 0.24) * dt * clamp(stepFreq, 0.45, 2.2);
          this.gaitPhase = (this.gaitPhase + dPhase) % 1;
        }
        const swingFrac = 0.46; // 占空比 β = 0.54，双组交替瞬间有短暂 6 足全接地防悬空
        const reachHalf = clamp(threshold * 0.54, 1.4 * sMul, 2.5 * sMul);
        const maxFromIdeal = Math.max(3.2 * sMul, threshold * 1.08);
        const activeStepH = clamp(baseStepHeight, 1.3 * sMul, 3.0 * sMul);
        // 停步收足时按组收拢，保证另一组 3 足稳稳支撑
        let activeSettleGroup = -1;
        for (const l of this.legs) {
          if (l.isSettling && l.stepping) { activeSettleGroup = l.tripodGroup; break; }
        }
        if (!isMoving && isSettlingNow && activeSettleGroup < 0) {
          let g0Err = 0, g1Err = 0;
          for (const l of this.legs) {
            const anc = (legAnchors && (legAnchors[l.id] || legAnchors[l.index])) || null;
            const ax = anc ? anc.x : bodyX;
            const ay = anc ? anc.y : bodyY;
            const ayaw = anc ? anc.yaw : bodyYaw;
            const [ix, iy] = localToWorldXY(ax, ay, ayaw, l.restX * sMul, l.restY * sMul);
            const d = Math.hypot(ix - l.footX, iy - l.footY);
            if (l.tripodGroup === 0) g0Err = Math.max(g0Err, d);
            else g1Err = Math.max(g1Err, d);
          }
          if (g0Err > settleThr || g1Err > settleThr) {
            activeSettleGroup = g0Err >= g1Err ? 0 : 1;
          }
        }

        for (const leg of this.legs) {
          leg.justLanded = false;
          const anc = (legAnchors && (legAnchors[leg.id] || legAnchors[leg.index])) || null;
          const ax = anc ? anc.x : bodyX;
          const ay = anc ? anc.y : bodyY;
          const az = (anc && anc.z !== undefined) ? anc.z : bodyZ;
          const ayaw = anc ? anc.yaw : bodyYaw;
          leg.anchorYaw = ayaw;

          const [hx, hy] = localToWorldXY(ax, ay, ayaw, leg.hipX * sMul, leg.hipY * sMul);
          const hz = az + (leg.hipZ ?? 4.6) * sMul;
          leg.hipWX = hx; leg.hipWY = hy; leg.hipWZ = hz;

          const [idealX, idealY] = localToWorldXY(ax, ay, ayaw, leg.restX * sMul, leg.restY * sMul);
          leg._idealX = idealX;
          leg._idealY = idealY;
          const fwdX = -Math.sin(ayaw), fwdY = Math.cos(ayaw);

          if (isMoving) {
            leg.isSettling = false;
            const phi = (this.gaitPhase + leg.tripodOff) % 1;
            const wantSwing = phi < swingFrac;
            const speedRatio = clamp(moveSpd / 11.0, 0.32, 1.08);
            const landX = idealX + fwdX * reachHalf * speedRatio;
            const landY = idealY + fwdY * reachHalf * speedRatio;

            if (wantSwing) {
              if (!leg.stepping) {
                leg.stepping = true;
                leg.startX = leg.footX;
                leg.startY = leg.footY;
              }
              const u = clamp(phi / swingFrac, 0, 1);
              leg.stepT = u;
              const s = u * u * (3 - 2 * u);
              leg.footX = lerp(leg.startX, landX, s);
              leg.footY = lerp(leg.startY, landY, s);
              leg.footZ = Math.pow(Math.sin(u * Math.PI), 0.85) * activeStepH * (0.68 + 0.32 * speedRatio);
              liftSum += leg.footZ;
              if (leg.isFront) frontLift += leg.footZ;
              else rearLift += leg.footZ;
              steppingCount++;
            } else {
              if (leg.stepping) {
                leg.stepping = false;
                leg.stepT = 1;
                leg.footX = landX;
                leg.footY = landY;
                leg.footZ = 0;
                leg.justLanded = true;
                landed.push(leg);
              } else {
                leg.footZ = 0;
              }
              // 支撑期钉地，同时约束与理想落点最大间距防止急转交叉打架
              const dId = Math.hypot(leg.footX - idealX, leg.footY - idealY);
              if (dId > maxFromIdeal && dId > 0.001) {
                const kFix = maxFromIdeal / dId;
                leg.footX = idealX + (leg.footX - idealX) * kFix;
                leg.footY = idealY + (leg.footY - idealY) * kFix;
              }
            }
          } else {
            // 停步收足：先平稳落完空中足，再按三角分组轻抬收回理想落点
            if (leg.stepping && !leg.isSettling) {
              leg.isSettling = true;
              leg.stepT = 0.25;
              leg.startX = leg.footX;
              leg.startY = leg.footY;
            }
            const dId = Math.hypot(leg.footX - idealX, leg.footY - idealY);
            if (!leg.stepping && isSettlingNow && activeSettleGroup === leg.tripodGroup && dId > settleThr) {
              leg.stepping = true;
              leg.isSettling = true;
              leg.stepT = 0;
              leg.startX = leg.footX;
              leg.startY = leg.footY;
            }
            if (leg.stepping && leg.isSettling) {
              leg.stepT += dt / 0.16;
              if (leg.stepT >= 1) {
                leg.stepping = false;
                leg.isSettling = false;
                leg.stepT = 1;
                leg.footX = idealX;
                leg.footY = idealY;
                leg.footZ = 0;
                leg.justLanded = true;
                landed.push(leg);
              } else {
                const u = leg.stepT;
                const s = u * u * (3 - 2 * u);
                leg.footX = lerp(leg.startX, idealX, s);
                leg.footY = lerp(leg.startY, idealY, s);
                leg.footZ = Math.sin(u * Math.PI) * activeStepH * 0.55;
                liftSum += leg.footZ;
                steppingCount++;
              }
            } else {
              leg.footZ = 0;
            }
          }
          leg._dist = Math.hypot(idealX - leg.footX, idealY - leg.footY);
        }
      } else {
        // 二足 / 其他足数：保留原阈值交替步态
        for (const leg of this.legs) {
          leg.justLanded = false;
          if (leg.cooldown > 0) leg.cooldown = Math.max(0, leg.cooldown - dt);

          const anc = (legAnchors && (legAnchors[leg.id] || legAnchors[leg.index])) || null;
          const ax = anc ? anc.x : bodyX;
          const ay = anc ? anc.y : bodyY;
          const az = (anc && anc.z !== undefined) ? anc.z : bodyZ;
          const ayaw = anc ? anc.yaw : bodyYaw;
          leg.anchorYaw = ayaw;

          const [hx, hy] = localToWorldXY(ax, ay, ayaw, leg.hipX * sMul, leg.hipY * sMul);
          const hz = az + (leg.hipZ ?? 8) * sMul;
          leg.hipWX = hx; leg.hipWY = hy; leg.hipWZ = hz;

          const [idealX, idealY] = localToWorldXY(ax, ay, ayaw, leg.restX * sMul, leg.restY * sMul);
          leg._idealX = idealX;
          leg._idealY = idealY;
          leg._dist = Math.hypot(idealX - leg.footX, idealY - leg.footY);

          const maxReach = Math.max(threshold * 2.15, ((leg.L1 ?? 6.0) + (leg.L2 ?? 6.2)) * sMul * 0.92);
          if (leg._dist > maxReach && leg._dist > 0.001) {
            const kFix = maxReach / leg._dist;
            leg.footX = idealX + (leg.footX - idealX) * kFix;
            leg.footY = idealY + (leg.footY - idealY) * kFix;
            leg._dist = maxReach;
          }

          if (leg.stepping) {
            steppingCount++;
            leg.stepT += dt / Math.max(0.08, leg.curStepDur);
            if (leg.stepT >= 1) {
              leg.stepT = 1;
              leg.stepping = false;
              leg.isSettling = false;
              leg.footX = leg.targetX;
              leg.footY = leg.targetY;
              leg.footZ = 0;
              leg.cooldown = mode === 'biped' ? 0.04 : 0.055;
              leg.justLanded = true;
              steppingCount--;
              landed.push(leg);
            } else {
              const u = leg.stepT;
              const s = u * u * (3 - 2 * u);
              leg.footX = lerp(leg.startX, leg.targetX, s);
              leg.footY = lerp(leg.startY, leg.targetY, s);
              leg.footZ = Math.pow(Math.sin(u * Math.PI), 0.86) * leg.curStepHeight;
              liftSum += leg.footZ;
              if (leg.isFront) frontLift += leg.footZ;
              else rearLift += leg.footZ;
            }
          } else {
            leg.footZ = 0;
          }
        }

        const startLegStep = (leg, isSettle) => {
          leg.stepping = true;
          leg.stepT = 0;
          leg.isSettling = isSettle;
          leg.startX = leg.footX;
          leg.startY = leg.footY;
          leg.curStepDur = clamp(baseStepDur * (isSettle ? 0.85 : 1.0), 0.10, 0.48);
          leg.curStepHeight = isSettle ? baseStepHeight * 0.42 : baseStepHeight;
          if (isSettle) {
            leg.targetX = leg._idealX;
            leg.targetY = leg._idealY;
          } else {
            leg.targetX = leg._idealX + velX * leg.curStepDur * this.strideAnticipation;
            leg.targetY = leg._idealY + velY * leg.curStepDur * this.strideAnticipation;
          }
          this.lastStepClock = this.clock;
          this.lastOrderIdx = leg.walkOrder;
          steppingCount++;
        };

        if (isSettlingNow) {
          if (steppingCount === 0) {
            let worst = null, maxD = settleThr;
            for (const l of this.legs) {
              if (!l.stepping && l.cooldown <= 0 && l._dist > maxD) { maxD = l._dist; worst = l; }
            }
            if (worst) startLegStep(worst, true);
          }
        } else if (steppingCount === 0) {
          let best = null, bestD = threshold;
          for (const l of this.legs) {
            if (!l.stepping && l.cooldown <= 0 && l._dist > bestD) { bestD = l._dist; best = l; }
          }
          if (best) startLegStep(best, false);
        }
      }

      // 第三步：计算局部重心倾摆、前后跨步偏移与 IK（四足用矢状面 3D IK，二足沿用 2D 平面 IK）
      let stridePulse = 0;
      const stateBand = Math.max(1.25 * sMul, threshold * 0.28);
      for (const leg of this.legs) {
        const ayaw = leg.anchorYaw ?? bodyYaw;
        const fwdDirX = -Math.sin(ayaw), fwdDirY = Math.cos(ayaw);
        const rightDirX = Math.cos(ayaw), rightDirY = Math.sin(ayaw);

        if (leg.stepping) {
          const w = Math.sin(leg.stepT * Math.PI);
          const rollGain = mode === 'biped' ? 0.85 : (mode === 'walk4' ? 0.40 : 0.28);
          const pitchGain = mode === 'bound' ? 0.72 : (mode === 'walk4' ? 0.26 : 0.22);
          localRoll -= Math.sign(leg.restX || 0) * w * rollGain;
          localPitch -= Math.sign(leg.restY || 0) * w * pitchGain;
          stridePulse = Math.max(stridePulse, w);
        }

        const relX = leg.footX - leg._idealX;
        const relY = leg.footY - leg._idealY;
        const fwd = relX * fwdDirX + relY * fwdDirY;
        const side = relX * rightDirX + relY * rightDirY;
        leg.fwdOffset = fwd;
        leg.sideOffset = side;

        if (leg.strideState === 'forward') {
          if (fwd < stateBand * 0.45) leg.strideState = fwd < -stateBand ? 'back' : 'mid';
        } else if (leg.strideState === 'back') {
          if (fwd > -stateBand * 0.45) leg.strideState = fwd > stateBand ? 'forward' : 'mid';
        } else {
          if (fwd > stateBand) leg.strideState = 'forward';
          else if (fwd < -stateBand) leg.strideState = 'back';
        }

        if (isQuadruped) {
          const ik = solveSagittalLegIK(
            leg.hipWX, leg.hipWY, leg.hipWZ, leg.footX, leg.footY, leg.footZ,
            ayaw, (leg.L1 ?? 6.2) * sMul, (leg.L2 ?? 6.4) * sMul, leg.kneeSign, sMul
          );
          leg.kneeX = ik.kx;
          leg.kneeY = ik.ky;
          leg.kneeZ = ik.kz;
        } else {
          const dx = leg.footX - leg.hipWX, dy = leg.footY - leg.hipWY;
          const horiz = Math.hypot(dx, dy) || 0.001;
          const ik = solveIK2D(0, leg.hipWZ, horiz, leg.footZ, (leg.L1 ?? 6.8) * sMul, (leg.L2 ?? 7.4) * sMul, leg.bendDir ?? 1);
          const ratio = ik.kx / horiz;
          leg.kneeX = leg.hipWX + dx * ratio;
          leg.kneeY = leg.hipWY + dy * ratio;
          leg.kneeZ = Math.max(1.2 * sMul, ik.kz);
        }
      }

      // 将局部重心倾摆正确旋转到世界坐标（修复旧版直接加世界 XY 的方向错乱 Bug！）
      const [tiltX, tiltY] = localToWorldXY(0, 0, bodyYaw, localRoll, localPitch);

      return {
        landed,
        liftSum,
        frontLift,
        rearLift,
        tiltX,
        tiltY,
        localRoll,
        localPitch,
        stridePulse,
        steppingCount,
        isSettling: isSettlingNow
      };
    }
  }

  // =========================================================================
  // 3. 二阶弹簧阻尼求解器（SpringDamper1D / SpringDamper3D）
  // =========================================================================
  class SpringDamper1D {
    constructor(initial = 0, stiffness = 90, damping = 10) {
      this.x = initial;
      this.v = 0;
      this.stiffness = stiffness;
      this.damping = damping;
    }

    impulse(dv) { this.v += dv; }

    update(dt, target, stiffness = this.stiffness, damping = this.damping) {
      const sub = Math.min(dt, 0.033);
      const acc = (target - this.x) * stiffness - this.v * damping;
      this.v += acc * sub;
      this.x += this.v * sub;
      return this.x;
    }
  }

  class SpringDamper3D {
    constructor(x = 0, y = 0, z = 0, stiffness = 85, damping = 9) {
      this.x = x; this.y = y; this.z = z;
      this.vx = 0; this.vy = 0; this.vz = 0;
      this.stiffness = stiffness;
      this.damping = damping;
    }

    reset(x, y, z) {
      this.x = x; this.y = y; this.z = z;
      this.vx = this.vy = this.vz = 0;
    }

    impulse(dvx, dvy, dvz) {
      this.vx += dvx; this.vy += dvy; this.vz += dvz;
    }

    update(dt, tx, ty, tz, stiffness = this.stiffness, damping = this.damping) {
      const sub = Math.min(dt, 0.033);
      const ax = (tx - this.x) * stiffness - this.vx * damping;
      const ay = (ty - this.y) * stiffness - this.vy * damping;
      const az = (tz - this.z) * stiffness - this.vz * damping;
      this.vx += ax * sub; this.vy += ay * sub; this.vz += az * sub;
      this.x += this.vx * sub; this.y += this.vy * sub; this.z += this.vz * sub;
      return this;
    }
  }

  // =========================================================================
  // 4. 呼吸缩放与噪声微动（体积守恒 Squash & Stretch：sx * sy * sz ≈ 1）
  // =========================================================================
  function evalBreathing(time, opts = {}) {
    const freq = opts.freq ?? 2.2;
    const amp = opts.amp ?? 0.08;
    const noiseAmp = opts.noiseAmp ?? 0.025;
    const seed = opts.seed ?? 17;
    const pulse = Math.sin(time * freq) * amp + (fbm1(time * 0.9, seed) - 0.5) * 2 * noiseAmp;
    const sz = 1 + pulse;
    const sxy = 1 / Math.sqrt(Math.max(0.55, sz));
    return {
      sx: sxy,
      sy: sxy,
      sz,
      liftOffset: pulse * (opts.liftGain ?? 3.0),
      pulse
    };
  }

  // =========================================================================
  // 5. 挂点跟随追踪器（SocketTracker：单一真源正向运动学）
  // =========================================================================
  class SocketTracker {
    constructor() {
      this.map = Object.create(null);
    }

    setLocal(name, rootX, rootY, rootZ, yaw, lx, ly, lz, scaleMul = 1.0) {
      const [wx, wy] = localToWorldXY(rootX, rootY, yaw, lx * scaleMul, ly * scaleMul);
      this.map[name] = { x: wx, y: wy, z: rootZ + lz * scaleMul, yaw };
      return this.map[name];
    }

    setWorld(name, x, y, z, yaw = 0) {
      this.map[name] = { x, y, z, yaw };
      return this.map[name];
    }

    get(name) {
      return this.map[name] || { x: 0, y: 0, z: 0, yaw: 0 };
    }
  }

  PW.Solvers = {
    ChainSolver,
    solveIK2D,
    solveSagittalLegIK,
    MultiLegGaitSolver,
    SpringDamper1D,
    SpringDamper3D,
    evalBreathing,
    SocketTracker
  };
})(window.PixelWorkshop);

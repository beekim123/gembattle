'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY, fbm1 } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SpringDamper3D, SocketTracker } = PW.Solvers;
  const { EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // M14 · 浮岩构装体（悬浮拼装 / 磁力分离体 · 拓展骨架模板 v3 精制纯生态版）
  // -------------------------------------------------------------------------
  // 【前置调研与三维几何坐标预算】
  // 1. 原型与运动学调研：
  //    - 古代遗迹无物理关节磁力构装体：中央为一颗悬浮多面晶体能量核（外嵌深色金属符箍，
  //      仅晶芯进 glowKeys 自亮），四周由 8 块互不接触的立体浮空石甲靠磁力拼出威严人形
  //      傀儡轮廓（1 面甲头盔 + 2 弧形肩甲 + 2 浮空石拳 + 1 胸甲 + 2 斜向符石环片）。
  //    - 层次化二阶弹簧阻尼（SpringDamper3D）：内层紧跟、外层重甲低刚度欠阻尼，急转弯时
  //      外围石拳（k=36, c=6.2）与肩甲（k=56, c=8.4）自然产生质量惯性甩尾滞后并柔和归位；
  //      胸甲（k=105, c=13.5）与面甲头盔（k=92, c=12.2）紧凑呼应核心。
  //    - 俯视 TILT=0.6 前后遮挡：依据 renderer.js 深度公式
  //      _depth = s*dxW + c*dyW + (lift/sMul)*0.08 + bias，
  //      核心、胸甲、肩甲、石拳、2 块斜向符石环片与公转碎石均保持 bias = 0，
  //      由真实 3D 坐标 (dxW, dyW) 决定前后遮挡，环片公转至核心背后自动被挡、转至前方自动盖核；
  //      仅顶置面甲头盔附加 +0.45 bias 稳居最上层。
  // 2. 三维几何坐标预算（单件 <= 16 格 << 40 格，色表 27 色 <= 48 色，零重色）：
  //    - coreCrystal (14x14x16) : 核心基准 lift = 11.5 (中心世界 Z ≈ 19.5)，多面八面体晶芯 + 金属符箍
  //    - helmMask    (14x14x12) : 聚拢 (0, +0.8, +12.5) / 舒展 (0, +1.2, +16.0)，面甲留清晰磁隙
  //    - chestPlate  (16x10x12) : 聚拢 (0, +6.8, +1.0)  / 舒展 (0, +10.0, +1.8)，中空符槽透出晶核
  //    - pauldronL/R (14x14x12) : 聚拢 (±11.2, -0.5, +6.0) / 舒展 (±15.6, -1.2, +8.6)，弧形重肩甲
  //    - fistL/R     (12x14x12) : 聚拢 (±12.8, +4.2, -5.0) / 舒展 (±17.4, +5.8, -2.4)，棱角石拳
  //    - runeArcA/B  (14x10x8)  : 聚拢 R=11.8 tiltZ=±3.8 / 舒展 R=15.8 tiltZ=±6.2，180° 反相斜轨公转
  //    - pebbleA/B/C (8x8x7~9x8x7) : 地面散落 4 块立体青苔小碎石，完整「微颤->吸起->公转->脉冲坠落」循环
  // 3. 现有内核盘点：
  //    - 直接复用 PW.Math / PW.Voxel / PW.Solvers (SpringDamper1D, SpringDamper3D, SocketTracker) /
  //      PW.Behaviors.EnvFeedback；脚本内自建磁力聚散滑翔转向与 4 块碎石磁吸公转池，不改 core/。
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 古岩主石（3 档）
      stoneDark:      '#484f59',
      stoneMid:       '#6c7580',
      stoneHi:        '#99a3ad',
      // 深刻槽暗岩（3 档）
      slateDark:      '#2c323b',
      slateMid:       '#434b57',
      slateHi:        '#646e7d',
      // 浅风化棱边石（3 档）
      chalkDark:      '#767e87',
      chalkMid:       '#9ca4ad',
      chalkHi:        '#c6cdd4',
      // 遗迹青苔（3 档）
      mossDark:       '#284d32',
      mossMid:        '#447d4d',
      mossHi:         '#73b06b',
      // 深色金属符箍（3 档）
      metalDark:      '#1e232c',
      metalMid:       '#363e4d',
      metalHi:        '#586378',
      // 符箍镶边古铜纹（3 档）
      trimDark:       '#6e5326',
      trimMid:        '#a8823e',
      trimHi:         '#dec06f',
      // 多面晶体外切面（非自亮晶壳，3 档）
      gemDark:        '#165c66',
      gemMid:         '#2696a3',
      gemHi:          '#5cd1db',
      // 仅晶芯进 glowKeys 自亮（3 档）
      coreGlowMid:    '#38e3d8',
      coreGlowHot:    '#99fff5',
      coreGlowBright: '#ebfffd',
      // 地面碎石岩基（3 档）
      pebDark:        '#3d444d',
      pebMid:         '#5e6773',
      pebHi:          '#8893a0'
    },
    glowKeys: ['coreGlowMid', 'coreGlowHot', 'coreGlowBright'],
    parts: [
      'stone', 'slate', 'chalk', 'moss', 'metal', 'trim',
      'gem', 'coreGlow', 'pebble'
    ],
    noCrease: [
      ['stone', 'slate'], ['stone', 'chalk'], ['stone', 'moss'],
      ['metal', 'trim'], ['gem', 'coreGlow'], ['pebble', 'moss'],
      ['stone', 'trim']
    ],
    materials: {
      stone:  ['stoneDark',  'stoneMid',  'stoneHi'],
      slate:  ['slateDark',  'slateMid',  'slateHi'],
      chalk:  ['chalkDark',  'chalkMid',  'chalkHi'],
      moss:   ['mossDark',   'mossMid',   'mossHi'],
      metal:  ['metalDark',  'metalMid',  'metalHi'],
      trim:   ['trimDark',   'trimMid',   'trimHi'],
      gem:    ['gemDark',    'gemMid',    'gemHi'],
      pebble: ['pebDark',    'pebMid',    'pebHi']
    },
    protectedParts: ['coreGlow', 'trim', 'moss']
  });

  // 4 套零重建模换色皮肤（0 禁用字）
  const SKINS = [
    {
      id: 'moss_ruin',
      name: '青苔古岩（遗迹经典）',
      dot: '#447d4d',
      outline: '#0d131a',
      pal: {},
      fx: {
        pulse: '#63f0e4',
        spark: '#c9fffa',
        dust:  '#7d8691',
        moss:  '#58995d'
      }
    },
    {
      id: 'obsidian_magma',
      name: '黑曜熔核（火山款）',
      dot: '#e85d2a',
      outline: '#0d090a',
      pal: {
        stoneDark:      '#1e1c24', stoneMid:      '#322f3b', stoneHi:      '#514d5e',
        slateDark:      '#121017', slateMid:      '#23202b', slateHi:      '#3b3747',
        chalkDark:      '#3d3947', chalkMid:      '#5b5569', chalkHi:      '#7e778f',
        mossDark:       '#5e2116', mossMid:       '#9c3820', mossHi:       '#d45d31',
        metalDark:      '#17141a', metalMid:      '#2d2730', metalHi:      '#4a414f',
        trimDark:       '#7a3c19', trimMid:       '#bd6328', trimHi:       '#f09446',
        gemDark:        '#852414', gemMid:        '#cf441d', gemHi:        '#ff7e38',
        coreGlowMid:    '#ff6224', coreGlowHot:   '#ffb24d', coreGlowBright:'#fff2cc',
        pebDark:        '#211e26', pebMid:        '#383440', pebHi:        '#585363'
      },
      fx: {
        pulse: '#ff7d36',
        spark: '#ffd891',
        dust:  '#57505e',
        moss:  '#bf4c28'
      }
    },
    {
      id: 'jade_snow',
      name: '白玉青芯（雪原款）',
      dot: '#c9d8e0',
      outline: '#121c26',
      pal: {
        stoneDark:      '#8b9ca8', stoneMid:      '#b7c7d1', stoneHi:      '#e3edf2',
        slateDark:      '#5c6f7d', slateMid:      '#8297a6', slateHi:      '#adc0cf',
        chalkDark:      '#a8b9c4', chalkMid:      '#d0dde6', chalkHi:      '#f5fafc',
        mossDark:       '#3c7a8c', mossMid:       '#62adc2', mossHi:       '#a3e0f0',
        metalDark:      '#324252', metalMid:      '#53697d', metalHi:      '#7f98ad',
        trimDark:       '#527080', trimMid:       '#82a8bd', trimHi:       '#c0e0f0',
        gemDark:        '#1d7570', gemMid:        '#35b5ab', gemHi:        '#82ebe0',
        coreGlowMid:    '#42e6cc', coreGlowHot:   '#a3fff0', coreGlowBright:'#edfffc',
        pebDark:        '#748794', pebMid:        '#9eb1bd', pebHi:        '#ccdbe3'
      },
      fx: {
        pulse: '#73f2de',
        spark: '#d9fffa',
        dust:  '#b4c7d4',
        moss:  '#78c7db'
      }
    },
    {
      id: 'redsand_gold',
      name: '赤砂金核（荒漠款）',
      dot: '#c97842',
      outline: '#1a0f0a',
      pal: {
        stoneDark:      '#7a462b', stoneMid:      '#a86742', stoneHi:      '#d49368',
        slateDark:      '#4f2b1a', slateMid:      '#734129', slateHi:      '#9c5f40',
        chalkDark:      '#9c6848', chalkMid:      '#c79069', chalkHi:      '#ebd4b0',
        mossDark:       '#5c4f24', mossMid:       '#8c7938', mossHi:       '#bfb05e',
        metalDark:      '#30231b', metalMid:      '#523d30', metalHi:      '#7a5e4b',
        trimDark:       '#875b17', trimMid:       '#cf932b', trimHi:       '#ffd15c',
        gemDark:        '#996012', gemMid:        '#e09622', gemHi:        '#ffd257',
        coreGlowMid:    '#f5b324', coreGlowHot:   '#ffe073', coreGlowBright:'#fff9db',
        pebDark:        '#6b3d25', pebMid:        '#945838', pebHi:        '#bd7d57'
      },
      fx: {
        pulse: '#ffcb4d',
        spark: '#fff0b3',
        dust:  '#ba835d',
        moss:  '#a89347'
      }
    }
  ];

  // =========================================================================
  // 1. 中央多面晶体能量核（14×14×16）
  //    仅内部八面体晶芯进 glowKeys 自亮，外部紧锁两道深色金属十字符箍与古铜铆钉
  // =========================================================================
  function buildCoreCrystal(makeCanvas) {
    const W = 14, D = 14, H = 16;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    m.fillAABB(-6.2, 6.2, -6.2, 6.2, 1, 14, (x, y, z, X, Y) => {
      const cz = z - 7.5;
      // 八面体多面晶体距离场（|X| + |Y| + |Z|*0.72 <= R）
      const oct = Math.abs(X) + Math.abs(Y) + Math.abs(cz) * 0.72;
      // 微切棱角
      const hex = Math.max(Math.abs(X), Math.abs(Y)) * 0.55 + Math.hypot(X, Y) * 0.45 + Math.abs(cz) * 0.62;
      const d = Math.max(oct - 5.4, hex - 4.7);
      if (d <= 0) {
        // 内部晶芯自亮区（表面透出菱形亮窗，外棱保留非自亮晶壳增强立体切面）
        const inCore = oct <= 3.7 && Math.abs(cz) <= 4.6;
        const onWindow = (Math.abs(X) < 1.9 || Math.abs(Y) < 1.9) && Math.abs(cz) < 3.4;
        if (inCore || onWindow) {
          const kId = (oct < 2.2 && Math.abs(cz) < 2.1)
            ? keyToId.coreGlowBright
            : (oct < 3.4 ? keyToId.coreGlowHot : keyToId.coreGlowMid);
          m.setRaw(x, y, z, kId, partId.coreGlow);
        } else {
          m.setRaw(x, y, z, mat('gem'), partId.gem);
        }
      }
    });

    // 外嵌深色金属符箍：赤道环箍 + 上下两个斜向紧锁卡箍（不遮死亮晶芯）
    m.fillAABB(-6.5, 6.5, -6.5, 6.5, 2, 13, (x, y, z, X, Y) => {
      const cz = z - 7.5;
      const rXY = Math.hypot(X, Y);
      // 1) 中腰断口金属符箍（四角留缺口透出晶芯）
      const onBelt = Math.abs(cz) <= 1.05 && rXY >= 4.0 && rXY <= 5.5 && (Math.abs(X) > 1.6 && Math.abs(Y) > 1.6);
      // 2) 上下金属卡爪（在 X=0 和 Y=0 轴线上抱住晶尖）
      const onArchX = Math.abs(X) <= 1.05 && Math.abs(Math.hypot(Y, cz * 0.85) - 4.7) <= 0.85 && Math.abs(cz) >= 2.2;
      const onArchY = Math.abs(Y) <= 1.05 && Math.abs(Math.hypot(X, cz * 0.85) - 4.7) <= 0.85 && Math.abs(cz) >= 2.2;
      if (onBelt || onArchX || onArchY) {
        const isTrim = (Math.abs(cz) > 4.4 && Math.abs(cz) < 5.3) || (onBelt && Math.abs(cz) < 0.45);
        m.setRaw(x, y, z, isTrim ? mat('trim') : mat('metal'), isTrim ? partId.trim : partId.metal);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.5, headZ: 15, centerZ: 8 });
  }

  // =========================================================================
  // 2. 浮空面甲头盔（14×14×12）
  //    宽厚古石额冠 + 威严倒梯形面甲 + 深凿眉槽 + 顶冠古铜饰条与右侧青苔
  // =========================================================================
  function buildHelmMask(makeCanvas) {
    const W = 14, D = 14, H = 12;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-6.0, 6.0, -5.8, 6.0, 1, 10, (x, y, z, X, Y) => {
      // 上宽下收的威严面甲石块
      const u = clamp((z - 1) / 9, 0, 1);
      const halfW = lerp(3.4, 5.1, smoothstep(0, 0.72, u)) - (u > 0.78 ? (u - 0.78) * 6.5 : 0);
      const halfD = lerp(3.2, 4.6, smoothstep(0, 0.65, u)) - (u > 0.80 ? (u - 0.80) * 5.0 : 0);
      // 略带弧面隆起的前额与面颊
      const frontBulge = Y > 0 ? Math.max(0, 1.3 - Math.abs(X) * 0.25) : 0;
      if (Math.abs(X) > halfW || Y < -halfD * 0.85 || Y > halfD + frontBulge) return;
      // 削去四角棱成多面石雕
      if (Math.abs(X) + Math.abs(Y) > halfW + halfD - 1.55) return;

      // 正面（+Y）深刻凹槽：横眉槽 + 垂直鼻脊凹缝（纯暗岩刻槽，不用自亮）
      const isBrowSlot = Y > halfD - 1.2 && z >= 4 && z <= 5 && Math.abs(X) >= 1.1 && Math.abs(X) <= 3.6;
      if (isBrowSlot && Y > halfD - 0.35) return; // 真正凿出 1 格深凹槽
      const isSlotBack = Y > halfD - 1.5 && z >= 4 && z <= 5 && Math.abs(X) >= 1.1 && Math.abs(X) <= 3.6;

      // 头顶中脊古铜冠条
      const isCrest = Math.abs(X) <= 0.9 && z >= 8 && Y > -2.5 && Y < 3.8;
      // 右上侧与后脑遗迹青苔点缀
      const isMoss = (X > 1.4 && Y < 1.2 && z >= 7) || (X < -2.6 && Y < -1.0 && z >= 5 && z <= 8);
      // 底部一圈金属磁锁边
      const isRim = z <= 2 && (Math.abs(X) > halfW - 1.3 || Y > halfD - 1.1);

      if (isSlotBack) {
        m.setRaw(x, y, z, mat('metal'), partId.metal);
      } else if (isCrest) {
        m.setRaw(x, y, z, mat('trim'), partId.trim);
      } else if (isMoss) {
        m.setRaw(x, y, z, mat('moss'), partId.moss);
      } else if (isRim) {
        m.setRaw(x, y, z, mat('slate'), partId.slate);
      } else if (z >= 9 || Math.abs(X) < 1.1 && Y > 2.6 && z >= 3 && z <= 8) {
        m.setRaw(x, y, z, mat('chalk'), partId.chalk);
      } else {
        m.setRaw(x, y, z, mat('stone'), partId.stone);
      }
    });

    // 双侧额角短石耳棱（增强傀儡威严轮廓）
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 4.2, -0.5, 6.2, s * 5.6, -1.2, 9.2, 1.15, 0.72, mat('slate'), partId.slate, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.2, headZ: 11, centerZ: 6 });
  }

  // =========================================================================
  // 3. 浮空厚胸甲（16×10×12）
  //    倒梯形古石护胸板，中央凿出菱形透窗（让后方晶体核心在正面也能透出），两侧带金属扣与青苔
  // =========================================================================
  function buildChestPlate(makeCanvas) {
    const W = 16, D = 10, H = 12;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-7.2, 7.2, -3.8, 3.8, 1, 10, (x, y, z, X, Y) => {
      const u = clamp((z - 1) / 9, 0, 1);
      // 倒梯形：上宽下尖
      const halfW = lerp(3.1, 6.6, smoothstep(0, 0.85, u));
      // 微微前凸的弧形盾面
      const arcY = 1.1 - (X * X) * 0.042;
      const thick = lerp(1.9, 2.5, Math.sin(u * Math.PI));
      if (Math.abs(X) > halfW) return;
      if (Y < arcY - thick || Y > arcY + thick * 0.78) return;

      // 中央凿出精致菱形透孔（正面透出中央能量核）
      const hole = Math.abs(X) * 0.95 + Math.abs(z - 6.0) * 1.05;
      if (hole < 2.25) return;

      const isHoleRim = hole < 3.25;
      const isMoss = (X < -2.4 && z >= 7 && Y > arcY - 0.5) || (X > 3.5 && z >= 6 && z <= 8 && Y > arcY - 0.3);
      const isGroove = (Math.abs(z - 3.2) < 0.65 || Math.abs(Math.abs(X) - 4.4) < 0.55) && Y > arcY + 0.3;
      const isTopTrim = z >= 9 && Math.abs(X) < 5.5;

      if (isHoleRim) {
        m.setRaw(x, y, z, mat('metal'), partId.metal);
      } else if (isMoss) {
        m.setRaw(x, y, z, mat('moss'), partId.moss);
      } else if (isGroove) {
        m.setRaw(x, y, z, mat('slate'), partId.slate);
      } else if (isTopTrim) {
        m.setRaw(x, y, z, mat('chalk'), partId.chalk);
      } else {
        m.setRaw(x, y, z, mat('stone'), partId.stone);
      }
    });

    // 左右胸甲下缘古铜铆钉
    for (const s of [-1, 1]) {
      m.paintEllipsoid(s * 3.8, 1.5, 5.2, 0.85, 0.85, 0.85, mat('trim'), partId.trim, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.5, headZ: 11, centerZ: 6 });
  }

  // =========================================================================
  // 4. 厚重弧形肩甲（14×14×12，左右各 1 块，带不对称风化苔藓与阶梯石棱）
  // =========================================================================
  function buildPauldron(makeCanvas, sideSign) {
    const W = 14, D = 14, H = 12;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-6.2, 6.2, -6.0, 6.0, 1, 10, (x, y, z, X, Y) => {
      // 局部坐标：sideSign 方向为外侧，朝核心一侧略微内凹弧形包覆
      const outX = X * sideSign;
      // 倾斜厚重石穹顶：外高内低或内高外拱的阶梯肩甲
      const domeZ = 8.8 - Math.pow(Math.max(0, outX - 1.2) * 0.42, 2) - (Y * Y) * 0.08;
      const underZ = 3.2 - outX * 0.42 + (Y * Y) * 0.05;
      const rEll = Math.hypot((outX - 0.4) / 5.4, Y / 5.2);
      if (rEll > 1.0) return;
      if (z > domeZ || z < underZ) return;

      // 内侧底缘金属磁力衬板
      const isInnerMetal = outX < -2.4 && z < underZ + 1.8;
      // 顶棱刻槽与风化浅棱
      const isGroove = Math.abs(Y) < 0.72 && z > domeZ - 1.1 && outX > -1.0;
      const isTrim = Math.abs(outX - 2.6) < 0.75 && Math.abs(Y) < 3.6 && z > domeZ - 1.3;
      // 苔藓（左右稍作错位，避免机械对称）
      const mossShift = sideSign > 0 ? 0.6 : -0.8;
      const isMoss = z > domeZ - 1.5 && outX > 0.2 && (Y * sideSign + mossShift) > 1.2;

      if (isInnerMetal) {
        m.setRaw(x, y, z, mat('metal'), partId.metal);
      } else if (isMoss) {
        m.setRaw(x, y, z, mat('moss'), partId.moss);
      } else if (isTrim) {
        m.setRaw(x, y, z, mat('trim'), partId.trim);
      } else if (isGroove) {
        m.setRaw(x, y, z, mat('slate'), partId.slate);
      } else if (z > domeZ - 1.4 && outX < 1.2) {
        m.setRaw(x, y, z, mat('chalk'), partId.chalk);
      } else {
        m.setRaw(x, y, z, mat('stone'), partId.stone);
      }
    });

    // 外肩加厚护棱石块（强化傀儡霸气宽肩轮廓）
    m.paintCapsule(sideSign * 2.8, -2.2, 4.5, sideSign * 4.5, 2.0, 5.4, 2.1, 1.85, mat('slate'), partId.slate, false);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.6, headZ: 10, centerZ: 6 });
  }

  // =========================================================================
  // 5. 浮空重石拳（12×14×12，左右各 1 只）
  //    粗犷方形指节 + 内扣拇指块 + 腕部深色金属磁箍 + 手背苔藓刻纹
  // =========================================================================
  function buildStoneFist(makeCanvas, sideSign) {
    const W = 12, D = 14, H = 12;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    // 拳背主体（偏 +Y 为拳面，-Y 为腕部）
    m.fillAABB(-4.8, 4.8, -5.8, 5.6, 1, 10, (x, y, z, X, Y) => {
      const outX = X * sideSign;
      // 拳块主体：宽厚多面体
      const inPalm = Math.abs(X) <= 3.7 && Y >= -3.6 && Y <= 4.1 && z >= 2 && z <= 9;
      if (!inPalm) return;
      // 切去外棱角
      if (Math.abs(X) + Math.abs(z - 5.5) > 6.8) return;
      if (Math.abs(X) + Math.abs(Y - 0.2) > 6.9) return;

      // 腕后金属磁箍
      const isWrist = Y <= -2.1;
      // 前方指节沟槽（3 条竖缝区分四指节）
      const isFingerGroove = Y >= 3.0 && z >= 2 && z <= 7 && (Math.abs(X) < 0.5 || Math.abs(Math.abs(X) - 2.2) < 0.45);
      // 手背外侧古铜护棱
      const isKnuckleTrim = Y >= 1.2 && Y <= 2.9 && z >= 8;
      // 外拳背青苔
      const isMoss = outX > 1.2 && Y < 1.2 && Y > -1.8 && z >= 7;

      if (isWrist) {
        m.setRaw(x, y, z, (Y < -2.9 && z >= 4 && z <= 7) ? mat('trim') : mat('metal'), (Y < -2.9 && z >= 4 && z <= 7) ? partId.trim : partId.metal);
      } else if (isFingerGroove) {
        m.setRaw(x, y, z, mat('slate'), partId.slate);
      } else if (isMoss) {
        m.setRaw(x, y, z, mat('moss'), partId.moss);
      } else if (isKnuckleTrim) {
        m.setRaw(x, y, z, mat('chalk'), partId.chalk);
      } else {
        m.setRaw(x, y, z, mat('stone'), partId.stone);
      }
    });

    // 内侧粗壮石拇指块（指向核心一侧，极具辨识度）
    m.paintCapsule(-sideSign * 3.1, -0.4, 3.6, -sideSign * 3.8, 3.2, 4.4, 1.55, 1.35, mat('slate'), partId.slate, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.8, headZ: 10, centerZ: 5 });
  }

  // =========================================================================
  // 6. 绕核斜向符石环片（14×10×8，2 块：A/B 不同刻槽与苔藓点缀）
  //    弯月弧形古石环段，内凹面向核、外拱面凿刻古符槽与青苔，不进 glowKeys
  // =========================================================================
  function buildRuneArc(makeCanvas, variant) {
    const W = 14, D = 10, H = 8;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-6.4, 6.4, -4.4, 4.4, 1, 6, (x, y, z, X, Y) => {
      // 弯月弧片：沿 X 展开，向 +Y 拱出
      const u = X / 5.8;
      if (Math.abs(u) > 1.0) return;
      const curveY = 1.6 - u * u * 3.4;
      const halfThick = lerp(1.75, 0.85, u * u);
      const halfH = lerp(2.25, 1.25, u * u);
      if (Math.abs(Y - curveY) > halfThick) return;
      if (Math.abs(z - 3.5) > halfH) return;

      // 深刻符槽（沿弧片中段凿出 1 格凹槽 + 古铜镶条）
      const isCenterNotch = Math.abs(X) < 1.3 && Math.abs(z - 3.5) < 0.75 && Y > curveY + 0.5;
      if (isCenterNotch) return;

      const isRuneLine = (variant === 0
        ? (Math.abs(Math.abs(X) - 2.6) < 0.55 && Math.abs(z - 3.5) < 1.3)
        : (Math.abs(X) < 3.6 && Math.abs(z - 3.5) < 0.55)) && Y > curveY;
      const isEndCap = Math.abs(u) > 0.76;
      const isMoss = variant === 0
        ? (X > 1.6 && z >= 4.5 && Y >= curveY - 0.4)
        : (X < -1.4 && z >= 4.2 && Y >= curveY - 0.5);

      if (isEndCap) {
        m.setRaw(x, y, z, mat('metal'), partId.metal);
      } else if (isMoss) {
        m.setRaw(x, y, z, mat('moss'), partId.moss);
      } else if (isRuneLine) {
        m.setRaw(x, y, z, mat('trim'), partId.trim);
      } else if (z >= 5) {
        m.setRaw(x, y, z, mat('chalk'), partId.chalk);
      } else {
        m.setRaw(x, y, z, mat('stone'), partId.stone);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.5, headZ: 7, centerZ: 4 });
  }

  // =========================================================================
  // 7. 待机与巡游伴生交互物：遗迹地台散落的立体青苔小碎石（3 种造型组成 4 块）
  //    尺寸 7~9 格，多棱古岩 + 顶面青苔点缀，被磁力吸起公转后脉冲落回地面
  // =========================================================================
  function buildMossPebble(makeCanvas, variant) {
    const dims = [
      { W: 8, D: 8, H: 7, rx: 3.0, ry: 2.6, rz: 2.5 },
      { W: 7, D: 7, H: 6, rx: 2.5, ry: 2.4, rz: 2.1 },
      { W: 9, D: 8, H: 7, rx: 3.3, ry: 2.7, rz: 2.3 }
    ][variant % 3];
    const m = new VoxelModel(dims.W, dims.D, dims.H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-dims.rx - 0.6, dims.rx + 0.6, -dims.ry - 0.6, dims.ry + 0.6, 1, dims.H - 1, (x, y, z, X, Y) => {
      const cz = z - (dims.rz + 0.6);
      const ang = Math.atan2(Y, X);
      const facet = 1 + 0.16 * Math.cos(ang * (variant === 1 ? 4 : 3) + variant * 1.1);
      const d = Math.hypot(X / (dims.rx * facet), Y / (dims.ry * facet), cz / dims.rz);
      if (d > 1.0) return;

      const isMossCap = z >= Math.floor(dims.rz + 1.5) && (variant === 0 ? X > -0.6 : (variant === 1 ? Y > -0.5 : X + Y > -0.4));
      const isTrimVein = variant === 2 && Math.abs(X - Y * 0.4) < 0.55 && z === 3;
      if (isMossCap) {
        m.setRaw(x, y, z, mat('moss'), partId.moss);
      } else if (isTrimVein) {
        m.setRaw(x, y, z, mat('trim'), partId.trim);
      } else {
        m.setRaw(x, y, z, mat('pebble'), partId.pebble);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: dims.rx + 0.3, headZ: dims.H - 1, centerZ: Math.round(dims.H * 0.45) });
  }

  // 8 块浮空石甲件的静态层次配置（内紧外松的质量惯性滞后）
  // 聚拢态 (tight) 拼出紧凑威严人形傀儡，舒展态 (spread) 向外松开拉开明显间隙
  const ARMOR_CFG = [
    {
      id: 'helm', partKey: 'helmMask',
      tight:  { lx:   0.0, ly:  0.8, dz:  13.6 },
      spread: { lx:   0.0, ly:  1.2, dz:  16.8 },
      k: 92, c: 12.2, bobAmp: 0.75, bobFreq: 2.15, phase: 0.4,
      selfSpinAmp: 0.14, selfSpinFreq: 1.05, bias: 0.45
    },
    {
      id: 'chest', partKey: 'chestPlate',
      tight:  { lx:   0.0, ly:  7.6, dz:   0.6 },
      spread: { lx:   0.0, ly: 10.6, dz:   1.5 },
      k: 105, c: 13.5, bobAmp: 0.55, bobFreq: 2.35, phase: 1.3,
      selfSpinAmp: 0.08, selfSpinFreq: 0.90, bias: 0.0
    },
    {
      id: 'pauldronL', partKey: 'pauldronL',
      tight:  { lx: -12.0, ly: -0.6, dz:   6.4 },
      spread: { lx: -16.2, ly: -1.4, dz:   9.0 },
      k: 56, c: 8.4, bobAmp: 1.05, bobFreq: 1.92, phase: 2.2,
      selfSpinAmp: 0.16, selfSpinFreq: 0.85, bias: 0.0
    },
    {
      id: 'pauldronR', partKey: 'pauldronR',
      tight:  { lx:  12.0, ly: -0.6, dz:   6.4 },
      spread: { lx:  16.2, ly: -1.4, dz:   9.0 },
      k: 56, c: 8.4, bobAmp: 1.05, bobFreq: 2.04, phase: 5.1,
      selfSpinAmp: 0.16, selfSpinFreq: 0.88, bias: 0.0
    },
    {
      id: 'fistL', partKey: 'fistL',
      tight:  { lx: -13.6, ly:  4.6, dz:  -5.2 },
      spread: { lx: -18.0, ly:  6.2, dz:  -2.6 },
      k: 36, c: 6.2, bobAmp: 1.35, bobFreq: 1.75, phase: 3.4,
      selfSpinAmp: 0.22, selfSpinFreq: 0.78, bias: 0.0
    },
    {
      id: 'fistR', partKey: 'fistR',
      tight:  { lx:  13.6, ly:  4.6, dz:  -5.2 },
      spread: { lx:  18.0, ly:  6.2, dz:  -2.6 },
      k: 36, c: 6.2, bobAmp: 1.35, bobFreq: 1.86, phase: 0.9,
      selfSpinAmp: 0.22, selfSpinFreq: 0.82, bias: 0.0
    }
  ];

  // 2 块绕核旋转的斜向符石环片（180° 反相公转，bias=0 由真实世界坐标驱动前后深度遮挡）
  const RUNE_ARC_CFG = [
    { id: 'runeArcA', partKey: 'runeArcA', angleOff: 0,       k: 64, c: 9.2, bobAmp: 0.65, bobFreq: 2.5, phase: 1.8 },
    { id: 'runeArcB', partKey: 'runeArcB', angleOff: Math.PI, k: 64, c: 9.2, bobAmp: 0.65, bobFreq: 2.7, phase: 4.9 }
  ];

  // 遗迹地台散落的 4 块立体青苔小碎石初始坐标（距中心 19~25 格自然错开）
  const PEBBLE_HOMES = [
    { key: 'pebbleA', lx: -20.5, ly:  13.0, yaw:  0.45, orbOff: 0.00, orbZ: 12.5 },
    { key: 'pebbleB', lx:  22.0, ly:  11.5, yaw: -1.15, orbOff: 1.57, orbZ: 15.5 },
    { key: 'pebbleC', lx:  18.5, ly: -16.5, yaw:  2.20, orbOff: 3.14, orbZ: 11.0 },
    { key: 'pebbleA', lx: -19.0, ly: -15.0, yaw: -2.45, orbOff: 4.71, orbZ: 14.5 }
  ];

  // =========================================================================
  // 生物定义：M14 · 浮岩构装体
  // =========================================================================
  const Special10Def = {
    id: 'special10_golem',
    code: 'M14',
    name: 'M14 · 浮岩构装体',
    status: 'done',
    tag: 'M14 悬浮拼装 · 磁力散件聚散',
    summary: 'v3 精制：无物理关节磁力构装体，中央多面晶体自亮核 + 8 块独立 SpringDamper3D 浮空石甲聚散双态切换 + 遗迹碎石磁吸公转与脉冲坠落循环',
    defaultHabitat: 'ruins',
    footRadius: 12.5,
    ecoWeight: 1.55,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '自由巡游', loop: true, status: 'done' },
      { id: 'idle',   name: '原地待机', loop: true, status: 'done' }
    ],
    blocks: [
      '多面晶体自亮核与深色金属符箍',
      '8块互不接触浮空石甲独立SpringDamper3D驱动',
      '巡游聚拢急转惯性甩尾 ↔ 待机舒展加速公转',
      '俯视TILT=0.6真实深度遮挡斜向符石环片',
      '地面4块立体青苔碎石震颤吸起公转脉冲坠落循环'
    ],
    soulHabit: '巡游时8块浮空石甲紧缩拼成威严悬浮傀儡滑翔切弯，急转弯时外围石拳与肩甲带明显惯性滞后甩尾再归位；停下待机时石甲缓缓向外舒展拉开间隙，斜向符石环片加速绕核公转，并周期性将地面青苔碎石震颤吸起伴随公转数秒后脉冲释放啪嗒砸回地面溅起碎尘',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        coreCrystal: buildCoreCrystal(makeCanvas),
        helmMask:    buildHelmMask(makeCanvas),
        chestPlate:  buildChestPlate(makeCanvas),
        pauldronL:   buildPauldron(makeCanvas, -1),
        pauldronR:   buildPauldron(makeCanvas,  1),
        fistL:       buildStoneFist(makeCanvas, -1),
        fistR:       buildStoneFist(makeCanvas,  1),
        runeArcA:    buildRuneArc(makeCanvas, 0),
        runeArcB:    buildRuneArc(makeCanvas, 1),
        pebbleA:     buildMossPebble(makeCanvas, 0),
        pebbleB:     buildMossPebble(makeCanvas, 1),
        pebbleC:     buildMossPebble(makeCanvas, 2)
      };

      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      // 聚散双态弹簧：0 = 巡游聚拢态，1 = 待机舒展公转态
      const spreadSpring = new SpringDamper1D(0, 26, 7.2);
      // 晶体核心脉冲冲量弹簧（释放碎石时核心微微一震）
      const corePulseSpring = new SpringDamper1D(0, 120, 9.5);

      // 6 块人形石甲 + 2 块斜向符石环片的独立 SpringDamper3D
      const armorSprings = ARMOR_CFG.map((cfg) => ({
        cfg,
        spring: new SpringDamper3D(0, 0, 11.5 + cfg.tight.dz, cfg.k, cfg.c),
        yaw: 0
      }));
      const arcSprings = RUNE_ARC_CFG.map((cfg) => ({
        cfg,
        spring: new SpringDamper3D(11.8, 0, 15.5, cfg.k, cfg.c),
        yaw: 0
      }));

      // 遗迹地面 4 块立体青苔小碎石状态池
      // cyclePhase: 'rest' -> 'tremble' -> 'lift' -> 'orbit' -> 'fall' -> 'rest'
      const pebbles = PEBBLE_HOMES.map((h, i) => ({
        index: i,
        key: h.key,
        homeX: (opts.homeX ?? 0) + h.lx,
        homeY: (opts.homeY ?? 0) + h.ly,
        x: (opts.homeX ?? 0) + h.lx,
        y: (opts.homeY ?? 0) + h.ly,
        z: 0.35,
        vx: 0, vy: 0, vz: 0,
        yaw: h.yaw,
        orbOff: h.orbOff,
        orbZ: h.orbZ,
        bounces: 0,
        shakeX: 0,
        shakeY: 0
      }));

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 11.5,
        vx: 0, vy: 0,
        yaw: opts.homeYaw ?? 0,
        turnRate: 0,
        coreSpin: 0,
        orbitAngle: 0,

        // 滑翔巡游折返导航（刻意制造清晰大角度切弯以展示外围石拳/肩甲惯性甩尾）
        navX: (opts.homeX ?? 0) + 22,
        navY: (opts.homeY ?? 0) + 12,
        navPause: 0,
        navSeq: 1,

        // 地面碎石磁力吸起互动循环状态机
        // 'rest' (2.2s) -> 'tremble' (1.05s) -> 'lift' (1.25s) -> 'orbit' (3.4s) -> 'fall' (落地收束)
        magPhase: 'rest',
        magT: 0,
        magOrbitAng: 0,
        pulseFlash: 0,
        seed: opts.seed ?? 43
      };

      function pickNextGlideTarget(hx, hy, maxR, sMul) {
        state.navSeq++;
        const curAng = Math.atan2(state.y - hy, state.x - hx);
        // 每次挑一个 105°~160° 明显转角的目标点，诱发优雅急转弯甩尾
        const sign = (state.navSeq % 2 === 0) ? 1 : -1;
        const frac = ((state.navSeq * 47 + state.seed * 13) % 100) / 100;
        const turnAng = curAng + sign * lerp(1.85, 2.75, frac);
        const rad = lerp(22, Math.max(26, maxR - 8 * sMul), ((state.navSeq * 73) % 100) / 100);
        state.navX = hx + Math.cos(turnAng) * rad;
        state.navY = hy + Math.sin(turnAng) * rad;
      }

      function emitCorePulse(vfx, x, y, coreWorldZ, sMul, fxCol) {
        if (!vfx) return;
        vfx.addRipple(x, y, 3.5 * sMul, 23.0 * sMul, 0.58, 2.0);
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * TAU + Math.random() * 0.25;
          const sp = (11 + Math.random() * 14) * sMul;
          vfx.spawnParticle(
            x + Math.cos(a) * 3.0 * sMul,
            y + Math.sin(a) * 3.0 * sMul,
            coreWorldZ,
            Math.cos(a) * sp, Math.sin(a) * sp, (Math.random() - 0.4) * 9 * sMul,
            0.44 + Math.random() * 0.22, 1.55,
            i % 2 === 0 ? fxCol.pulse : fxCol.spark, true, 6
          );
        }
      }

      const instance = {
        def: Special10Def,
        cachePrefix: `special10_golem_${Math.random().toString(36).slice(2, 7)}`,
        parts,
        partListAssets: Object.values(parts),
        state,
        sockets,
        footContacts: [],
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(skinIdx) {
          curSkin = SKINS[((skinIdx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(homeX, homeY, homeYaw) {
          state.x = homeX;
          state.y = homeY;
          state.z = 11.5;
          state.vx = 0;
          state.vy = 0;
          state.yaw = homeYaw;
          state.turnRate = 0;
          state.coreSpin = 0;
          state.orbitAngle = 0;
          state.navX = homeX + 24;
          state.navY = homeY + 12;
          state.navPause = 0;
          state.navSeq = 1;
          state.magPhase = 'rest';
          state.magT = 0;
          state.magOrbitAng = 0;
          state.pulseFlash = 0;

          spreadSpring.x = 0; spreadSpring.v = 0;
          corePulseSpring.x = 0; corePulseSpring.v = 0;

          for (const item of armorSprings) {
            const [wx, wy] = localToWorldXY(homeX, homeY, homeYaw, item.cfg.tight.lx, item.cfg.tight.ly);
            item.spring.reset(wx, wy, 11.5 + item.cfg.tight.dz);
            item.yaw = homeYaw;
          }
          for (const item of arcSprings) {
            const a = item.cfg.angleOff;
            const [wx, wy] = localToWorldXY(homeX, homeY, homeYaw, Math.cos(a) * 11.8, Math.sin(a) * 11.8);
            item.spring.reset(wx, wy, 15.5 + Math.sin(a) * 3.8);
            item.yaw = wrapAngle(homeYaw + a + Math.PI * 0.5);
          }
          for (let i = 0; i < pebbles.length; i++) {
            const p = pebbles[i];
            const h = PEBBLE_HOMES[i];
            p.homeX = homeX + h.lx;
            p.homeY = homeY + h.ly;
            p.x = p.homeX;
            p.y = p.homeY;
            p.z = 0.35;
            p.vx = p.vy = p.vz = 0;
            p.yaw = h.yaw;
            p.bounces = 0;
            p.shakeX = p.shakeY = 0;
          }
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul   = instance.scaleMul;
          const sp     = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const gFreq  = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const spdMul = clamp(params.speed ?? 1.0, 0.3, 2.2);
          const flex   = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));
          const isIdle = !!(eco && (eco.action === 'idle' || eco.patrol === false));
          const hx     = (eco && eco.homeX) || 0;
          const hy     = (eco && eco.homeY) || 0;
          const maxR   = (eco && eco.maxRadius) || 46;
          const fxCol  = curSkin.fx || SKINS[0].fx;

          // -----------------------------------------------------------------
          // 1. 主体悬浮滑翔导航（巡游切弯滑翔 ↔ 待机原地仪轨悬停）
          // -----------------------------------------------------------------
          let isPausing = isIdle;
          if (isIdle) {
            // 原地待机：缓缓回到原点微漂，姿态舒展公转
            const tx = hx + (fbm1(time * 0.35, state.seed) - 0.5) * 4.5 * sMul;
            const ty = hy + (fbm1(time * 0.32, state.seed + 37) - 0.5) * 4.5 * sMul;
            const kPos = expSmooth(dt, 3.2);
            const nx = lerp(state.x, tx, kPos);
            const ny = lerp(state.y, ty, kPos);
            state.vx = (nx - state.x) / Math.max(dt, 0.001);
            state.vy = (ny - state.y) / Math.max(dt, 0.001);
            state.x = nx;
            state.y = ny;
            const idleYaw = ((eco && eco.homeYaw) || 0) + Math.sin(time * 0.45) * 0.28;
            const dyaw = wrapAngle(idleYaw - state.yaw) * expSmooth(dt, 2.6);
            state.yaw = wrapAngle(state.yaw + dyaw);
            state.turnRate = dyaw / Math.max(dt, 0.001);
          } else {
            if (state.navPause > 0) {
              state.navPause -= dt;
              isPausing = true;
              const kStop = expSmooth(dt, 4.5);
              state.vx = lerp(state.vx, 0, kStop);
              state.vy = lerp(state.vy, 0, kStop);
              state.x += state.vx * dt;
              state.y += state.vy * dt;
              state.turnRate = lerp(state.turnRate, 0, kStop);
            } else {
              const dx = state.navX + ((eco && eco.avoidX) || 0) - state.x;
              const dy = state.navY + ((eco && eco.avoidY) || 0) - state.y;
              const dist = Math.hypot(dx, dy);
              if (dist < 7.5 * sMul) {
                // 到达一个空地巡游点后停顿 2.4~3.2 秒，自然演出一次短暂蓄磁舒展再切弯出发
                state.navPause = 2.6;
                pickNextGlideTarget(hx, hy, maxR, sMul);
                isPausing = true;
              } else {
                const desiredYaw = Math.atan2(-dx, dy);
                const yawDiff = wrapAngle(desiredYaw - state.yaw);
                // 灵巧而有分量的急转弯角速度，让外围石拳与肩甲甩出漂亮弧线
                const maxTurn = 3.2 * (0.65 + spdMul * 0.45);
                const stepYaw = clamp(yawDiff, -maxTurn * dt, maxTurn * dt);
                state.yaw = wrapAngle(state.yaw + stepYaw);
                state.turnRate = stepYaw / Math.max(dt, 0.001);

                const align = lerp(0.45, 1.0, smoothstep(-0.25, 0.85, Math.cos(yawDiff)));
                const cruiseSpd = 21.5 * spdMul * align;
                const fwdX = -Math.sin(state.yaw), fwdY = Math.cos(state.yaw);
                const kVel = expSmooth(dt, 4.8);
                state.vx = lerp(state.vx, fwdX * cruiseSpd, kVel);
                state.vy = lerp(state.vy, fwdY * cruiseSpd, kVel);
                state.x += state.vx * dt;
                state.y += state.vy * dt;

                const dC = Math.hypot(state.x - hx, state.y - hy);
                if (dC > maxR) {
                  state.x = hx + (state.x - hx) * (maxR / dC);
                  state.y = hy + (state.y - hy) * (maxR / dC);
                }
              }
            }
          }

          // -----------------------------------------------------------------
          // 2. 聚散双态平滑过渡（巡游聚拢 spread=0 ↔ 待机/蓄磁舒展 spread=1）
          // -----------------------------------------------------------------
          const moveSpd = Math.hypot(state.vx, state.vy);
          const wantSpread = (isIdle || (isPausing && moveSpd < 4.5) || state.magPhase === 'lift' || state.magPhase === 'orbit') ? 1.0 : 0.0;
          const spread = clamp(spreadSpring.update(dt, wantSpread, 24 * sp, clamp(6.8 * dScale, 3.6, 11.5)), -0.05, 1.08);
          const spreadU = clamp(spread, 0, 1);

          // 核心脉冲回弹与悬浮呼吸高度
          if (state.pulseFlash > 0) state.pulseFlash = Math.max(0, state.pulseFlash - dt * 2.2);
          const pulseKick = corePulseSpring.update(dt, 0, 115 * sp, clamp(9.2 * dScale, 4.5, 14.0));
          const coreBob = Math.sin(time * 2.0 * gFreq) * 1.15 * sMul;
          const baseLift = lerp(11.5, 13.4, spreadU) * sMul;
          state.z = baseLift + coreBob + pulseKick * sMul;

          // 晶体能量核持续缓慢自转（舒展蓄磁态转速加快）
          state.coreSpin = wrapAngle(state.coreSpin + dt * lerp(1.1, 2.5, spreadU) * gFreq);
          // 符石环片公转角（巡游态平稳公转 1.15 rad/s，待机舒展态加速至 2.9 rad/s）
          const arcOrbSpeed = lerp(1.15, 2.90, spreadU) * gFreq;
          state.orbitAngle = (state.orbitAngle + dt * arcOrbSpeed) % TAU;

          // -----------------------------------------------------------------
          // 3. 8 块浮空石甲件独立 SpringDamper3D 驱动
          //    含独立相位正弦浮沉、缓慢自转与急转弯质量惯性甩尾
          // -----------------------------------------------------------------
          const coreWorldZ = state.z + 7.5 * sMul;
          // 弹簧刚度受“弹簧弹性”滑条调节，惯性滞后受“尾巴柔韧”滑条轻微增强
          const inertiaFactor = clamp(1.0 / (0.65 + flex * 0.35), 0.55, 1.35);

          for (const item of armorSprings) {
            const cfg = item.cfg;
            const lx = lerp(cfg.tight.lx, cfg.spread.lx, spreadU) * sMul;
            const ly = lerp(cfg.tight.ly, cfg.spread.ly, spreadU) * sMul;
            const dz = lerp(cfg.tight.dz, cfg.spread.dz, spreadU) * sMul;
            const bob = Math.sin(time * cfg.bobFreq * gFreq + cfg.phase) * cfg.bobAmp * (1 + spreadU * 0.35) * sMul;

            // 目标世界坐标（不含人为偏移，急转弯甩尾由较低的刚度 k/c 真实物理滞后自然涌现！）
            const [tx, ty] = localToWorldXY(state.x, state.y, state.yaw, lx, ly);
            const tz = state.z + dz + bob;

            const kEff = cfg.k * sp * inertiaFactor;
            const cEff = cfg.c * dScale * Math.sqrt(inertiaFactor);
            item.spring.update(dt, tx, ty, tz, kEff, clamp(cEff, 2.8, 18.0));

            // 每块石甲缓慢独立微转 + 跟随急转弯轻微滞后偏摆
            const selfTurn = Math.sin(time * cfg.selfSpinFreq * gFreq + cfg.phase) * cfg.selfSpinAmp * (1 + spreadU * 0.65);
            const lagYaw = clamp(-state.turnRate * (cfg.k < 50 ? 0.14 : 0.06), -0.45, 0.45);
            const targetYaw = wrapAngle(state.yaw + selfTurn + lagYaw);
            item.yaw = wrapAngle(item.yaw + wrapAngle(targetYaw - item.yaw) * expSmooth(dt, cfg.k < 50 ? 5.2 : 8.5));
          }

          // 2 块斜向符石环片：绕核倾斜公转 + 独立 SpringDamper3D 滞后
          const orbR = lerp(13.0, 17.0, spreadU) * sMul;
          const orbTiltZ = lerp(4.2, 6.6, spreadU) * sMul;
          for (const item of arcSprings) {
            const cfg = item.cfg;
            const a = state.orbitAngle + cfg.angleOff;
            // 倾斜轨道：沿局部 X/Y 旋转，Z 随 sin(a) 倾斜起伏
            const lx = Math.cos(a) * orbR;
            const ly = Math.sin(a) * orbR;
            const bob = Math.sin(time * cfg.bobFreq * gFreq + cfg.phase) * cfg.bobAmp * sMul;
            const [tx, ty] = localToWorldXY(state.x, state.y, state.yaw, lx, ly);
            const tz = coreWorldZ - 4.8 * sMul + Math.sin(a) * orbTiltZ + bob;

            item.spring.update(dt, tx, ty, tz, cfg.k * sp, clamp(cfg.c * dScale, 3.8, 15.0));
            // 弧片外拱面朝外（法线沿径向，使弯月凹面始终抱向核心）
            item.yaw = wrapAngle(state.yaw + a - Math.PI * 0.5);
          }

          // -----------------------------------------------------------------
          // 4. 地面 4 块立体青苔小碎石磁力互动状态机（待机与巡游均可完整自循环）
          //    rest -> tremble -> lift -> orbit -> fall -> rest
          // -----------------------------------------------------------------
          state.magT += dt;
          state.magOrbitAng = (state.magOrbitAng + dt * 2.25 * gFreq) % TAU;

          if (state.magPhase === 'rest') {
            for (let i = 0; i < pebbles.length; i++) {
              const p = pebbles[i];
              p.shakeX = 0; p.shakeY = 0;
              p.z = lerp(p.z, 0.35 * sMul, expSmooth(dt, 10));
            }
            // 静置 2.2 秒后（待机直接触发，或巡游经过/停顿时触发）进入震颤蓄磁
            const triggerDur = isIdle ? 2.0 : 2.5;
            if (state.magT >= triggerDur) {
              state.magPhase = 'tremble';
              state.magT = 0;
            }
          } else if (state.magPhase === 'tremble') {
            // 阶段 A：地面碎石高频微微震颤，准备脱离地面
            const u = clamp(state.magT / 1.05, 0, 1);
            for (let i = 0; i < pebbles.length; i++) {
              const p = pebbles[i];
              const amp = (0.35 + u * 0.55) * sMul;
              p.shakeX = Math.sin(time * 42 + i * 2.1) * amp;
              p.shakeY = Math.cos(time * 47 + i * 1.7) * amp;
              p.z = 0.35 * sMul + Math.abs(Math.sin(time * 28 + i)) * 0.45 * u * sMul;
            }
            if (u >= 1) {
              state.magPhase = 'lift';
              state.magT = 0;
              // 离地瞬间扬起细小碎尘
              if (vfx) {
                for (const p of pebbles) {
                  vfx.spawnParticle(
                    p.x, p.y, 0.9 * sMul,
                    (Math.random() - 0.5) * 6 * sMul, (Math.random() - 0.5) * 6 * sMul, 6.5 * sMul,
                    0.38, 1.3, fxCol.dust, false, 18
                  );
                }
              }
            }
          } else if (state.magPhase === 'lift') {
            // 阶段 B：被磁力缓缓吸起悬浮到构装体身侧轨道
            const u = clamp(state.magT / 1.25, 0, 1);
            const kLift = expSmooth(dt, 3.8 + u * 3.5);
            const pebOrbR = 19.5 * sMul;
            for (let i = 0; i < pebbles.length; i++) {
              const p = pebbles[i];
              const a = state.magOrbitAng + p.orbOff;
              const tx = state.x + Math.cos(a) * pebOrbR;
              const ty = state.y + Math.sin(a) * pebOrbR;
              const tz = (p.orbZ + Math.sin(a * 2 + time * 2.4) * 2.2) * sMul;
              p.x = lerp(p.x, tx, kLift);
              p.y = lerp(p.y, ty, kLift);
              p.z = lerp(p.z, tz, kLift);
              p.yaw = wrapAngle(p.yaw + dt * 1.8);
              p.shakeX = p.shakeY = 0;
            }
            if (u >= 1) {
              state.magPhase = 'orbit';
              state.magT = 0;
            }
          } else if (state.magPhase === 'orbit') {
            // 阶段 C：悬浮在构装体身侧跟着稳定公转 3.4 秒
            const pebOrbR = 19.5 * sMul;
            const kOrb = expSmooth(dt, 7.5);
            for (let i = 0; i < pebbles.length; i++) {
              const p = pebbles[i];
              const a = state.magOrbitAng + p.orbOff;
              const tx = state.x + Math.cos(a) * pebOrbR;
              const ty = state.y + Math.sin(a) * pebOrbR;
              const tz = (p.orbZ + Math.sin(a + time * 2.6 + i) * 2.6) * sMul;
              p.x = lerp(p.x, tx, kOrb);
              p.y = lerp(p.y, ty, kOrb);
              p.z = lerp(p.z, tz, kOrb);
              p.yaw = wrapAngle(p.yaw + dt * 2.4);
            }
            if (state.magT >= 3.4) {
              // 核心脉冲一闪！碎石失去磁力开始自由落体
              state.magPhase = 'fall';
              state.magT = 0;
              state.pulseFlash = 1.0;
              corePulseSpring.impulse(20.0 * sp);
              emitCorePulse(vfx, state.x, state.y, coreWorldZ, sMul, fxCol);
              for (let i = 0; i < pebbles.length; i++) {
                const p = pebbles[i];
                const outAng = Math.atan2(p.y - state.y, p.x - state.x);
                p.vx = Math.cos(outAng) * 5.2 * sMul;
                p.vy = Math.sin(outAng) * 5.2 * sMul;
                p.vz = 4.5 * sMul;
                p.bounces = 0;
              }
            }
          } else if (state.magPhase === 'fall') {
            // 阶段 D：失磁“啪嗒”落回地面，微弹一下并溅起碎尘，限制在遗迹地台安全半径内
            let allLanded = true;
            const safeR = Math.max(18, maxR - 6 * sMul);
            for (let i = 0; i < pebbles.length; i++) {
              const p = pebbles[i];
              if (p.bounces >= 2 && p.z <= 0.4 * sMul) continue;
              allLanded = false;
              p.vz -= 118.0 * sMul * dt;
              p.x += p.vx * dt;
              p.y += p.vy * dt;
              p.z += p.vz * dt;
              p.yaw = wrapAngle(p.yaw + dt * 3.5);
              // 柔和约束在遗迹地台范围内
              const dC = Math.hypot(p.x - hx, p.y - hy);
              if (dC > safeR) {
                p.x = hx + (p.x - hx) * (safeR / dC);
                p.y = hy + (p.y - hy) * (safeR / dC);
                p.vx *= -0.35;
                p.vy *= -0.35;
              }
              if (p.z <= 0.35 * sMul) {
                p.z = 0.35 * sMul;
                p.bounces++;
                if (p.bounces === 1) {
                  // “啪嗒”落地弹起一小下并溅起碎尘与苔屑
                  p.vz = 14.5 * sMul;
                  p.vx *= 0.42;
                  p.vy *= 0.42;
                  if (vfx) {
                    vfx.addRipple(p.x, p.y, 1.0 * sMul, 6.2 * sMul, 0.35, 1.0);
                    for (let k = 0; k < 4; k++) {
                      const a = (k / 4) * TAU + Math.random() * 0.6;
                      vfx.spawnParticle(
                        p.x, p.y, 0.8 * sMul,
                        Math.cos(a) * 7.5 * sMul, Math.sin(a) * 7.5 * sMul, (5 + Math.random() * 4) * sMul,
                        0.36, 1.25, k === 0 ? fxCol.moss : fxCol.dust, false, 26
                      );
                    }
                  }
                } else {
                  p.vx = p.vy = p.vz = 0;
                }
              }
            }
            if (allLanded || state.magT >= 2.2) {
              state.magPhase = 'rest';
              state.magT = 0;
            }
          }

          // 舒展公转或脉冲时，核心周围偶发逸出极少量晶屑微粒
          if (vfx && (spreadU > 0.65 || state.pulseFlash > 0.2) && Math.random() < dt * (state.pulseFlash > 0.2 ? 14 : 3.5)) {
            const a = Math.random() * TAU;
            const r = (3.5 + Math.random() * 3.5) * sMul;
            vfx.spawnParticle(
              state.x + Math.cos(a) * r,
              state.y + Math.sin(a) * r,
              coreWorldZ + (Math.random() - 0.5) * 4 * sMul,
              Math.cos(a) * 2.5 * sMul, Math.sin(a) * 2.5 * sMul, (3.0 + Math.random() * 4.0) * sMul,
              0.48, 1.15, fxCol.spark, true, -2
            );
          }

          // 地面碎石接地印（贴地清晰，升空后自动缩小变淡）
          instance.footContacts = pebbles.map((p) => ({
            x: p.x + p.shakeX,
            y: p.y + p.shakeY,
            z: p.z,
            r: 2.7 * sMul
          }));

          sockets.setWorld('core', state.x, state.y, coreWorldZ, state.yaw);
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;

          // 1. 中央多面晶体能量核（bias = 0，让公转环片与胸甲真实按 3D 位置产生前后遮挡）
          list.push({
            partKey: 'coreCrystal',
            asset: parts.coreCrystal,
            x: state.x,
            y: state.y,
            lift: Math.max(4.0 * sMul, state.z),
            ro: state.coreSpin,
            bias: 0.0
          });

          // 2. 6 块独立浮空人形石甲（面甲头盔 + 胸甲 + 左右弧形肩甲 + 左右浮空石拳）
          for (const item of armorSprings) {
            list.push({
              partKey: item.cfg.partKey,
              asset: parts[item.cfg.partKey],
              x: item.spring.x,
              y: item.spring.y,
              lift: Math.max(1.2 * sMul, item.spring.z),
              ro: item.yaw,
              bias: item.cfg.bias
            });
          }

          // 3. 2 块绕核旋转的斜向符石环片（bias = 0，严格按俯视 TILT=0.6 的 ry 深度自然前后穿插）
          for (const item of arcSprings) {
            list.push({
              partKey: item.cfg.partKey,
              asset: parts[item.cfg.partKey],
              x: item.spring.x,
              y: item.spring.y,
              lift: Math.max(2.0 * sMul, item.spring.z),
              ro: item.yaw,
              bias: 0.0
            });
          }

          // 4. 遗迹地台 4 块立体青苔小碎石（bias = 0，地面静置与升空公转均正确深度遮挡）
          for (const p of pebbles) {
            list.push({
              partKey: p.key,
              asset: parts[p.key],
              x: p.x + p.shakeX,
              y: p.y + p.shakeY,
              lift: Math.max(0.25, p.z),
              ro: p.yaw,
              bias: 0.0
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Special10Def.id,
            code: Special10Def.code,
            name: Special10Def.name,
            status: Special10Def.status,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            spread: Number(clamp(spreadSpring.x, 0, 1).toFixed(3)),
            magPhase: state.magPhase,
            footRadius: Special10Def.footRadius,
            headZ: 34,
            centerZ: 19,
            blocks: Special10Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map((k) => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Creatures.push(Special10Def);
})(window.PixelWorkshop);

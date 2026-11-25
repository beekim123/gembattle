'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { clamp, lerp, smoothstep, localToWorldXY, pivotToWorldXY, expSmooth } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { MultiLegGaitSolver, SpringDamper1D, SocketTracker } = PW.Solvers;
  const { Propulsion, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 酒3 · 生态卡册老学者（+Y 正前，z=0 贴地，总高约 26 格）
  // 辨识核心：略驼背深绛红金边宽长袍 + 软顶大尖帽 + 垂胸雪白蓬松长卷须
  //           + 背后木制标本背箱（彩纸卷轴、干草药与一株淡青自亮小菇）
  //           + 胸前夸张厚大烫金皮革生态卡册大书（翻开浅米书页与彩墨小图）
  // 清晰铁律：仅标本小菇菌核进 glowKeys，镜片/眼睛/金饰绝不进；0 常态拉伸；<= 48 色 0 重色；0 禁用字
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      skinDark:      '#b58164',
      skinMid:       '#deb092',
      skinHi:        '#fae0c8',
      robeDark:      '#4a1220',
      robeMid:       '#822137',
      robeHi:        '#b83b54',
      goldDark:      '#996b14',
      goldMid:       '#dba125',
      goldHi:        '#ffe06b',
      hatDark:       '#36101c',
      hatMid:        '#631f33',
      hatHi:         '#91354f',
      beardDark:     '#a8adb8',
      beardMid:      '#dce2ed',
      beardHi:       '#f7faff',
      woodDark:      '#4d2f1a',
      woodMid:       '#825330',
      woodHi:        '#ba7e50',
      herbDark:      '#2d5932',
      herbMid:       '#4e8f52',
      herbHi:        '#82c77d',
      scrollDark:    '#275e78',
      scrollMid:     '#4694b5',
      scrollHi:      '#7ecbeb',
      bookDark:      '#3d2114',
      bookMid:       '#6e3c24',
      bookHi:        '#9e5c3b',
      pageDark:      '#baa886',
      pageMid:       '#e8dac0',
      pageHi:        '#fff7e6',
      inkDark:       '#ad2d2d',
      inkMid:        '#e85648',
      inkHi:         '#ff9482',
      brassDark:     '#8c5f18',
      brassMid:      '#cc922b',
      brassHi:       '#ffd166',
      lensDark:      '#6b94a8',
      lensMid:       '#a6d0e3',
      lensHi:        '#dcf4ff',
      bootDark:      '#2b1c15',
      bootMid:       '#4f3527',
      bootHi:        '#785440',
      eyeDark:       '#141118',
      eyeIris:       '#4f6d8a',
      eyeGlint:      '#f0f8ff',
      emissiveMid:   '#38c9b8',
      emissiveHot:   '#9efaf0'
    },
    glowKeys: ['emissiveMid', 'emissiveHot'],
    parts: [
      'foot', 'leg', 'robe', 'trim', 'head', 'beard', 'eye', 'hat', 'hatBand',
      'upperArm', 'forearm', 'hand',
      'box', 'herb', 'scroll', 'shroomStem', 'shroomGlow',
      'bookCover', 'bookTrim', 'page', 'ink', 'brass', 'lens', 'quill'
    ],
    noCrease: [
      ['eye', 'head'], ['beard', 'head'], ['leg', 'foot'],
      ['trim', 'robe'], ['hatBand', 'hat'], ['forearm', 'hand'],
      ['shroomGlow', 'shroomStem'], ['bookTrim', 'bookCover'], ['ink', 'page'], ['lens', 'brass']
    ],
    materials: {
      skin:   ['skinDark',   'skinMid',   'skinHi'],
      robe:   ['robeDark',   'robeMid',   'robeHi'],
      gold:   ['goldDark',   'goldMid',   'goldHi'],
      hat:    ['hatDark',    'hatMid',    'hatHi'],
      beard:  ['beardDark',  'beardMid',  'beardHi'],
      wood:   ['woodDark',   'woodMid',   'woodHi'],
      herb:   ['herbDark',   'herbMid',   'herbHi'],
      scroll: ['scrollDark', 'scrollMid', 'scrollHi'],
      book:   ['bookDark',   'bookMid',   'bookHi'],
      page:   ['pageDark',   'pageMid',   'pageHi'],
      ink:    ['inkDark',    'inkMid',    'inkHi'],
      brass:  ['brassDark',  'brassMid',  'brassHi'],
      lens:   ['lensDark',   'lensMid',   'lensHi'],
      boot:   ['bootDark',   'bootMid',   'bootHi']
    },
    protectedParts: ['eye', 'shroomGlow']
  });

  const SKINS = [
    {
      id: 'crimson_archive',
      name: '绛红典藏',
      dot: '#822137',
      outline: '#1a0c10',
      pal: {}
    },
    {
      id: 'emerald_naturalist',
      name: '深翠博物',
      dot: '#1f694b',
      outline: '#0c1a14',
      pal: {
        robeDark: '#123d2b', robeMid: '#1f694b', robeHi: '#3fa378',
        hatDark:  '#0d2e20', hatMid:  '#18523a', hatHi:  '#318562',
        scrollDark: '#7d3a1c', scrollMid: '#bf5e32', scrollHi: '#f29563'
      }
    },
    {
      id: 'amber_tome',
      name: '暖褐古卷',
      dot: '#7d4f28',
      outline: '#1a120c',
      pal: {
        robeDark: '#472b15', robeMid: '#7d4f28', robeHi: '#b37a47',
        hatDark:  '#362010', hatMid:  '#613c1e', hatHi:  '#916036',
        scrollDark: '#235952', scrollMid: '#3b8c80', scrollHi: '#6ec7b9'
      }
    }
  ];

  // 1. 轻缓双足与软底布靴（大部分藏于宽长袍下摆内）
  function buildLegSeg(makeCanvas, rTop, rBot, hLen) {
    const S = Math.ceil(Math.max(rTop, rBot) * 2 + 3);
    const H = Math.ceil(hLen + 3);
    const m = new VoxelModel(S, S, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 1.0, 0, 0, H - 1.0, rBot, rTop, mat('robe'), partId.leg, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: Math.max(rTop, rBot) });
  }

  function buildBoot(makeCanvas) {
    const m = new VoxelModel(7, 8, 4, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0.9, 1.2, 1.65, 2.35, 1.2, mat('boot'), partId.foot, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 2.4 });
  }

  // 2. 略驼背宽长袍躯干（深绛红镶亮金下摆与前襟边）
  function buildTorso(makeCanvas) {
    const m = new VoxelModel(16, 15, 14, SPEC);
    const { mat, partId } = SPEC;
    m.fillAABB(-6.4, 6.4, -6.0, 6.0, 0, 13, (x, y, z, X, Y) => {
      // 随高度微前倾制造慈祥略驼背体态
      const yShift = lerp(0, 1.4, clamp(z / 12, 0, 1));
      const rx = lerp(5.7, 4.0, clamp(z / 12, 0, 1));
      const ry = lerp(5.1, 3.6, clamp(z / 12, 0, 1));
      const d = Math.hypot(X / rx, (Y - yShift) / ry);
      if (d <= 1.0 && z >= 1 && z <= 12) {
        const isHemTrim = (z === 1 || z === 2) && d >= 0.78;
        const isFrontTrim = (Y - yShift > 2.2) && Math.abs(X) <= 1.1 && z >= 2 && z <= 11;
        const isShoulderTrim = z >= 10 && d >= 0.80;
        const useGold = isHemTrim || isFrontTrim || isShoulderTrim;
        m.setRaw(x, y, z, mat(useGold ? 'gold' : 'robe'), useGold ? partId.trim : partId.robe);
      }
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.0 });
  }

  // 3. 背后木制标本背箱（塞满彩纸卷轴、干草药与一株淡青自亮小菇）
  function buildBackpack(makeCanvas) {
    const m = new VoxelModel(14, 11, 14, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 木制方正背箱主体 + 金色包角
    m.fillAABB(-5.5, 5.5, -4.0, 4.0, 1, 9, (x, y, z, X, Y) => {
      if (Math.abs(X) <= 4.6 && Math.abs(Y) <= 3.0 && z >= 1 && z <= 8) {
        const isCorner = Math.abs(X) >= 3.8 && (z <= 2 || z >= 7);
        m.setRaw(x, y, z, mat(isCorner ? 'gold' : 'wood'), isCorner ? partId.trim : partId.box);
      }
    });
    // 左上插着蓝彩纸卷轴与红墨卷轴
    m.paintCapsule(-2.8, 0.2, 7.6, -3.6, -1.2, 12.2, 1.35, 1.25, mat('scroll'), partId.scroll, true);
    m.paintCapsule(-0.6, 0.6, 7.6, -0.8, -0.6, 11.4, 1.15, 1.05, mat('ink'), partId.ink, true);
    // 中右露出茂密干草药束
    m.paintEllipsoid(1.5, 0.0, 9.4, 1.9, 1.6, 1.8, mat('herb'), partId.herb, true);
    m.paintCapsule(1.4, 0.0, 9.0, 2.8, -1.0, 12.0, 0.95, 0.75, mat('herb'), partId.herb, true);
    // 右上角一株淡青自亮小菇（仅菌核帽芯进 glowKeys）
    m.paintCapsule(3.4, 0.4, 8.0, 3.6, 0.0, 10.6, 0.75, 0.65, mat('page'), partId.shroomStem, true);
    m.paintEllipsoid(3.6, 0.0, 11.4, 1.75, 1.65, 1.15, keyToId.emissiveMid, partId.shroomGlow, true);
    m.paintEllipsoid(3.6, 0.0, 11.8, 1.05, 1.0, 0.75, keyToId.emissiveHot, partId.shroomGlow, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.0 });
  }

  // 4. 慈祥老学者头部（浓白眉 + 柔和锐利双眼）
  function buildHead(makeCanvas) {
    const W = 11, D = 11, H = 10;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const hz = 4.4;
    m.paintEllipsoid(0, 0, hz, 3.8, 3.8, 3.9, mat('skin'), partId.head, true);
    // 脑后及两鬓雪白短发
    m.fillAABB(-4.4, 4.4, -4.4, 2.0, 2, 8, (x, y, z, X, Y) => {
      const r = Math.hypot(X / 4.2, (Y + 0.3) / 4.1, (z - hz) / 4.0);
      if (r <= 1.0 && (Y < 0.8 || Math.abs(X) > 3.0)) {
        m.setRaw(x, y, z, mat('beard'), partId.beard);
      }
    });
    // 浓密雪白双眉
    m.paintCapsule(-2.4, 3.4, hz + 1.8, -0.8, 3.6, hz + 1.9, 0.7, 0.65, mat('beard'), partId.beard, true);
    m.paintCapsule( 0.8, 3.6, hz + 1.9,  2.4, 3.4, hz + 1.8, 0.65, 0.7, mat('beard'), partId.beard, true);
    m.despeckle();
    m.applyArtShading(true);

    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const eyeZ = Math.round(hz + 0.4);
    for (const s of [-1, 1]) {
      const ex = Math.round(hw + s * 1.7);
      let sy = -1;
      for (let y = D - 2; y >= 1; y--) {
        if (m.getPartId(ex, y, eyeZ) === partId.head) { sy = y; break; }
      }
      if (sy < 0) sy = Math.round(hd + 3.6);
      for (const dx of [0, s]) {
        for (const dz of [0, 1]) {
          const kId = (dz === 1 && dx === 0) ? keyToId.eyeGlint : (dx === 0 ? keyToId.eyeDark : keyToId.eyeIris);
          m.setRaw(ex + dx, sy, eyeZ + dz, kId, partId.eye);
        }
      }
    }
    return m.toStripAsset(makeCanvas, { footRadius: 4.0 });
  }

  // 5. 垂胸雪白蓬松长卷须（独立部件，随呼吸与点头轻晃）
  function buildBeard(makeCanvas) {
    const m = new VoxelModel(9, 8, 10, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 1.0, 7.2, 3.2, 2.0, 2.2, mat('beard'), partId.beard, true);
    m.paintCapsule(0, 1.2, 6.8, 0, 2.0, 3.2, 2.6, 1.9, mat('beard'), partId.beard, true);
    m.paintCapsule(0, 2.0, 3.2, 0.6, 1.4, 1.4, 1.75, 1.15, mat('beard'), partId.beard, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.2 });
  }

  // 6. 软顶大尖帽（宽帽檐 + 金帽带 + 略垂弯曲软帽尖）
  function buildHat(makeCanvas) {
    const m = new VoxelModel(16, 16, 12, SPEC);
    const { mat, partId } = SPEC;
    // 宽厚大帽檐
    m.fillAABB(-7.2, 7.2, -7.2, 7.2, 0, 3, (x, y, z, X, Y) => {
      const d = Math.hypot(X / 6.8, Y / 6.6);
      if (d <= 1.0 && z >= 1 && z <= 2) {
        const isTrim = d >= 0.84;
        m.setRaw(x, y, z, mat(isTrim ? 'gold' : 'hat'), isTrim ? partId.hatBand : partId.hat);
      }
    });
    // 金色帽带
    m.paintEllipsoid(0, 0, 3.1, 4.3, 4.2, 1.1, mat('gold'), partId.hatBand, true);
    // 软顶弯尖帽冠（向后微弯，极具学者辨识度）
    m.paintCapsule(0, 0.2, 3.5, -0.4, -1.4, 7.6, 3.9, 2.1, mat('hat'), partId.hat, true);
    m.paintCapsule(-0.4, -1.4, 7.6, -1.2, -4.4, 9.8, 2.0, 1.0, mat('hat'), partId.hat, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.8 });
  }

  // 7. 宽袖两段手臂
  function buildUpperArm(makeCanvas) {
    const m = new VoxelModel(7, 8, 7, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, -1.0, 3.4, 0, 2.2, 2.4, 1.75, 1.65, mat('robe'), partId.upperArm, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.2 });
  }

  function buildForearm(makeCanvas) {
    const m = new VoxelModel(7, 9, 7, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, -1.4, 2.8, 0, 1.6, 2.8, 1.6, 1.5, mat('robe'), partId.forearm, true);
    m.paintEllipsoid(0, 1.5, 2.8, 1.65, 0.85, 1.65, mat('gold'), partId.trim, true);
    m.paintEllipsoid(0, 2.8, 2.8, 1.25, 1.35, 1.2, mat('skin'), partId.hand, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.1 });
  }

  // 8. 标志道具：夸张厚大烫金皮革生态卡册大书（翻开浅米书页 + 彩墨生态小图）
  function buildAlbumBook(makeCanvas) {
    const m = new VoxelModel(16, 12, 8, SPEC);
    const { mat, partId } = SPEC;
    m.fillAABB(-7.2, 7.2, -5.0, 5.0, 0, 7, (x, y, z, X, Y) => {
      // 书页呈微 V 形摊开
      const vLift = Math.abs(X) * 0.22 + Y * 0.14;
      const baseZ = 1.8 + vLift;
      // 厚实烫金皮革封底
      if (Math.abs(X) <= 6.8 && Math.abs(Y) <= 4.6 && z >= Math.floor(baseZ - 0.8) && z <= Math.ceil(baseZ)) {
        const isGoldCorner = Math.abs(X) >= 5.6 && Math.abs(Y) >= 3.4;
        m.setRaw(x, y, z, mat(isGoldCorner ? 'gold' : 'book'), isGoldCorner ? partId.bookTrim : partId.bookCover);
      }
      // 翻开的厚实浅米色书页
      if (Math.abs(X) <= 6.1 && Math.abs(X) >= 0.4 && Math.abs(Y) <= 4.0 && z >= Math.floor(baseZ + 0.6) && z <= Math.ceil(baseZ + 2.0)) {
        m.setRaw(x, y, z, mat('page'), partId.page);
      }
    });
    // 左页绘制绿色生态草图与红墨标注，右页绘制蓝色水生小图与金墨边饰
    m.paintEllipsoid(-3.4, 0.5, 4.6, 1.4, 1.3, 0.65, mat('herb'), partId.ink, true);
    m.paintEllipsoid(-2.6, -1.6, 4.3, 1.0, 0.8, 0.55, mat('ink'), partId.ink, true);
    m.paintEllipsoid( 3.4, 0.6, 4.6, 1.5, 1.2, 0.65, mat('scroll'), partId.ink, true);
    m.paintEllipsoid( 2.8, -1.7, 4.3, 1.2, 0.7, 0.55, mat('gold'), partId.bookTrim, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.5 });
  }

  // 9. 亮铜大放大镜（study 动作端详书页与标本箱；镜片绝不进 glowKeys）
  function buildMagnifier(makeCanvas) {
    const m = new VoxelModel(9, 13, 6, SPEC);
    const { mat, partId } = SPEC;
    // 细长木柄
    m.paintCapsule(0, -4.6, 2.6, 0, -0.6, 2.6, 0.75, 0.85, mat('wood'), partId.box, true);
    // 亮铜圆镜框 + 浅蓝镜片
    m.fillAABB(-3.8, 3.8, -0.5, 6.0, 1, 4, (x, y, z, X, Y) => {
      const d = Math.hypot(X / 3.1, (Y - 2.6) / 3.1);
      if (z >= 2 && z <= 3) {
        if (d <= 1.0 && d >= 0.68) m.setRaw(x, y, z, mat('brass'), partId.brass);
        else if (d < 0.68 && z === 2) m.setRaw(x, y, z, mat('lens'), partId.lens);
      }
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.6 });
  }

  // 10. 大白羽毛笔（record 动作在书页上沙沙速记）
  function buildQuill(makeCanvas) {
    const m = new VoxelModel(7, 11, 11, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, -1.2, 1.0, 0.6, 1.8, 4.8, 0.6, 0.85, mat('brass'), partId.brass, true);
    m.paintCapsule(0.6, 1.8, 4.8, 1.4, 4.2, 9.6, 1.35, 0.8, mat('beard'), partId.quill, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.8 });
  }

  const Def = {
    id: 'npc_album_scholar',
    code: '酒3',
    name: '生态卡册老学者',
    tag: '酒馆核心·生态卡册',
    summary: '略驼背深绛红金边宽长袍 + 软顶大尖帽 + 垂胸雪白长卷须 + 木制标本背箱（含淡青自亮小菇）+ 烫金大卡册',
    defaultHabitat: 'tavern',
    status: 'done',
    footRadius: 8.0,
    ecoWeight: 0.95,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    blocks: ['26 格驼背长袍双足 IK', '两段宽袖 FK 滞后', '标本卷轴背箱与自亮小菇', '胸前摊开烫金生态卡册', '亮铜放大镜端详与羽毛笔速记'],
    soulHabit: '慢悠悠翻看厚大卡册长须微晃 → 掏出亮铜大放大镜仔细端详点头 → 抽出大白羽毛笔沙沙速记',
    actions: [
      { id: 'idle',   name: '翻看卡册', loop: true,  status: 'done' },
      { id: 'study',  name: '放大端详', loop: false, duration: 2.4, status: 'done' },
      { id: 'record', name: '羽笔速记', loop: false, duration: 2.2, status: 'done' },
      { id: 'patrol', name: '背箱慢踱', loop: true,  status: 'done' }
    ],
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        legThigh:  buildLegSeg(makeCanvas, 1.65, 1.45, 3.6),
        legShin:   buildLegSeg(makeCanvas, 1.4, 1.25, 3.4),
        boot:      buildBoot(makeCanvas),
        torso:     buildTorso(makeCanvas),
        backpack:  buildBackpack(makeCanvas),
        head:      buildHead(makeCanvas),
        beard:     buildBeard(makeCanvas),
        hat:       buildHat(makeCanvas),
        upperArm:  buildUpperArm(makeCanvas),
        forearm:   buildForearm(makeCanvas),
        book:      buildAlbumBook(makeCanvas),
        magnifier: buildMagnifier(makeCanvas),
        quill:     buildQuill(makeCanvas)
      };

      const gait = new MultiLegGaitSolver([
        { id: 'L', hipX: -2.1, hipY: 0, hipZ: 6.8, restX: -2.2, restY: 0.2, group: 0, L1: 3.6, L2: 3.8, bendDir: 1 },
        { id: 'R', hipX:  2.1, hipY: 0, hipZ: 6.8, restX:  2.2, restY: 0.2, group: 1, L1: 3.6, L2: 3.8, bendDir: 1 }
      ], { mode: 'biped', stepThreshold: 1.9, stepDuration: 0.20, stepHeight: 1.4, strideAnticipation: 0.36 });

      const headYawSp  = new SpringDamper1D(0, 120, 8.5);
      const beardSwaySp = new SpringDamper1D(0, 95, 5.5);
      const packBobSp  = new SpringDamper1D(0, 130, 6.2);
      const bodyBobSp  = new SpringDamper1D(0, 150, 8.0);

      const state = {
        x: opts.homeX ?? 0, y: opts.homeY ?? 0, z: 0,
        vx: 0, vy: 0, yaw: opts.homeYaw ?? 0,
        walkBlend: 0, stepPhase: 0,
        action: 'idle', actionTime: 0,
        noteCd: 0.3,
        armLYaw: 0, armRYaw: 0,
        foreLYaw: 0, foreRYaw: 0,
        armLLift: 0, armRLift: 0,
        foreLLift: 0, foreRLift: 0,
        headLift: 0, toolMode: 'none'
      };

      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      const instance = {
        def: Def,
        cachePrefix: `npc_album_scholar_${Math.random().toString(36).slice(2, 7)}`,
        parts, partListAssets: Object.values(parts), state, sockets, footContacts: [], scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(idx) {
          curSkin = SKINS[((idx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(hx, hy, hyaw) {
          state.x = hx; state.y = hy; state.yaw = hyaw; state.z = 0;
          state.vx = 0; state.vy = 0; state.walkBlend = 0;
          gait.reset(hx, hy, hyaw);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = params.springiness ?? 1.0;
          const gFreq = params.gaitFreq ?? 1.0;

          const act = (eco && eco.action) || (eco && eco.patrol === true ? 'patrol' : 'idle');
          const actT = (eco && eco.actionTime != null) ? eco.actionTime : time;
          state.action = act;
          state.actionTime = actT;

          if (act === 'patrol') {
            // 背着大标本箱慢吞吞踱步思索
            Propulsion.multiLegWalk(state, dt, time, { ...params, speed: (params.speed ?? 1.0) * 0.56 }, {
              ...eco, patrol: true, walkStyle: 'heavy', baseLift: 0
            });
          } else {
            Propulsion.multiLegWalk(state, dt, time, params, {
              ...eco, patrol: false, baseLift: 0
            });
          }
          state.z = 0;

          const spd = Math.hypot(state.vx, state.vy);
          state.walkBlend = lerp(state.walkBlend, clamp(spd / 6.5, 0, 1), expSmooth(dt, 9));
          state.stepPhase += dt * (2.0 + state.walkBlend * 5.6) * gFreq;

          const gaitRes = gait.update(dt, state.x, state.y, 0, state.yaw, state.vx, state.vy, {
            mode: 'biped',
            scaleMul: sMul,
            stepFreq: gFreq * 0.92,
            stepHeight: 1.4 * sMul,
            stepThreshold: 1.9 * sMul
          });
          state.tiltX = lerp(state.tiltX || 0, gaitRes.tiltX * 0.40 * sMul, expSmooth(dt, 11));
          state.tiltY = lerp(state.tiltY || 0, gaitRes.tiltY * 0.40 * sMul, expSmooth(dt, 11));

          const maxOff = 3.2 * sMul;
          for (const leg of gait.legs) {
            const [ix, iy] = localToWorldXY(state.x, state.y, state.yaw, leg.restX * sMul, leg.restY * sMul);
            const dx = leg.footX - ix, dy = leg.footY - iy;
            const d = Math.hypot(dx, dy);
            if (d > maxOff) {
              leg.footX = ix + (dx / d) * maxOff;
              leg.footY = iy + (dy / d) * maxOff;
            }
          }

          if (gaitRes.landed.length > 0) {
            bodyBobSp.impulse(4.2 * sp);
            packBobSp.impulse(-8.5 * sp);
            beardSwaySp.impulse((Math.sin(state.stepPhase) >= 0 ? 1 : -1) * 4.5 * sp);
            for (const l of gaitRes.landed) {
              EnvFeedback.emitFootstep(vfx, habitat, l.footX, l.footY, 0.38 * sMul);
            }
          }
          instance.footContacts = gait.legs.map(l => ({ x: l.footX, y: l.footY, z: l.footZ, r: 2.0 * sMul }));

          let tgtArmL = 0.34, tgtArmR = -0.34;
          let tgtForeL = 0.52, tgtForeR = -0.52;
          let tgtArmLLift = 0.6, tgtArmRLift = 0.6;
          let tgtForeLLift = 1.2, tgtForeRLift = 1.2;
          let tgtHeadYaw = 0, tgtHeadLift = -0.2;
          state.toolMode = 'none';

          if (act === 'study') {
            // 右手掏出亮铜大放大镜凑近书页仔细端详、频频点头，书页飘出浅金记录微粒
            state.toolMode = 'magnifier';
            const u = clamp(actT / 2.4, 0, 1);
            const env = smoothstep(0.08, 0.25, u) * (1 - smoothstep(0.82, 0.98, u));
            const scan = Math.sin(actT * 3.8);
            const scanLag = Math.sin(actT * 3.8 - 0.80);
            tgtArmL = 0.38; tgtForeL = 0.56;
            tgtArmLLift = 0.9; tgtForeLLift = 1.6;
            tgtArmR = 0.10 + scan * 0.28 * env;
            tgtForeR = 0.28 + scanLag * 0.36 * env;
            tgtArmRLift = 1.2 + 1.4 * env;
            tgtForeRLift = 2.2 + 2.0 * env;
            tgtHeadYaw = scan * 0.22 * env;
            tgtHeadLift = -0.45 * env + Math.sin(actT * 8.5) * 0.32 * env;

            state.noteCd -= dt;
            if (env > 0.45 && state.noteCd <= 0 && vfx) {
              state.noteCd = 0.32;
              const [bx, by] = localToWorldXY(state.x, state.y, state.yaw, (Math.random() - 0.5) * 4.5 * sMul, 6.4 * sMul);
              vfx.spawnParticle(
                bx, by, 11.4 * sMul,
                (Math.random() - 0.5) * 3.5, (Math.random() - 0.5) * 3.5, 6.2 + Math.random() * 3.5,
                0.75, 1.35, '#f5d77a', false, -1.5
              );
            }
          } else if (act === 'record') {
            // 抽出大白羽毛笔在书页上沙沙速记
            state.toolMode = 'quill';
            const u = clamp(actT / 2.2, 0, 1);
            const env = smoothstep(0.08, 0.22, u) * (1 - smoothstep(0.84, 0.98, u));
            const scrib = Math.sin(actT * 15.0);
            const scribLag = Math.sin(actT * 15.0 - 0.78);
            tgtArmL = 0.38; tgtForeL = 0.56;
            tgtArmLLift = 0.8; tgtForeLLift = 1.5;
            tgtArmR = 0.20 + scrib * 0.14 * env;
            tgtForeR = 0.40 + scribLag * 0.26 * env;
            tgtArmRLift = 1.0 + 0.5 * env;
            tgtForeRLift = 1.8 + 0.7 * env + Math.abs(scribLag) * 0.35 * env;
            tgtHeadYaw = 0.08 + Math.sin(actT * 3.5) * 0.14 * env;
            tgtHeadLift = -0.45 * env + Math.sin(actT * 7.5) * 0.18 * env;

            state.noteCd -= dt;
            if (env > 0.4 && state.noteCd <= 0 && vfx) {
              state.noteCd = 0.38;
              const [bx, by] = localToWorldXY(state.x, state.y, state.yaw, 1.2 * sMul, 6.2 * sMul);
              vfx.spawnParticle(
                bx, by, 11.2 * sMul,
                (Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 2.5, 5.5,
                0.62, 1.15, '#ffe38a', false, -1.2
              );
            }
          } else if (act === 'patrol') {
            const sw = Math.sin(state.stepPhase);
            const swLag = Math.sin(state.stepPhase - 0.82);
            tgtArmL = 0.34 + sw * 0.10 * state.walkBlend;
            tgtForeL = 0.52 + swLag * 0.12 * state.walkBlend;
            tgtArmR = -0.34 - sw * 0.10 * state.walkBlend;
            tgtForeR = -0.52 - swLag * 0.12 * state.walkBlend;
            tgtArmLLift = 0.7; tgtForeLLift = 1.3;
            tgtArmRLift = 0.7; tgtForeRLift = 1.3;
            tgtHeadYaw = Math.sin(time * 1.1) * 0.26;
            tgtHeadLift = -0.15;
          } else {
            // idle：慢悠悠低头翻看厚大卡册，长须随呼吸微晃
            const pageSway = Math.sin(time * 1.8);
            const pageLag = Math.sin(time * 1.8 - 0.80);
            tgtArmL = 0.36; tgtForeL = 0.54;
            tgtArmLLift = 0.8 + Math.sin(time * 1.9) * 0.22;
            tgtForeLLift = 1.4 + Math.sin(time * 1.9 - 0.5) * 0.22;
            tgtArmR = -0.26 + pageSway * 0.14;
            tgtForeR = -0.38 + pageLag * 0.22;
            tgtArmRLift = 0.8 + Math.max(0, pageSway) * 0.45;
            tgtForeRLift = 1.4 + Math.max(0, pageLag) * 0.65;
            tgtHeadYaw = pageSway * 0.14;
            tgtHeadLift = -0.30 + Math.sin(time * 1.9) * 0.20;
          }

          const kArm = expSmooth(dt, 12);
          const kFore = expSmooth(dt, 9.5);
          state.armLYaw   = lerp(state.armLYaw,   tgtArmL,  kArm);
          state.armRYaw   = lerp(state.armRYaw,   tgtArmR,  kArm);
          state.foreLYaw  = lerp(state.foreLYaw,  tgtForeL, kFore);
          state.foreRYaw  = lerp(state.foreRYaw,  tgtForeR, kFore);
          state.armLLift  = lerp(state.armLLift,  tgtArmLLift,  kArm);
          state.armRLift  = lerp(state.armRLift,  tgtArmRLift,  kArm);
          state.foreLLift = lerp(state.foreLLift, tgtForeLLift, kFore);
          state.foreRLift = lerp(state.foreRLift, tgtForeRLift, kFore);
          state.headLift  = lerp(state.headLift,  tgtHeadLift,  kArm);

          headYawSp.update(dt, tgtHeadYaw, 120 * sp, 8.5);
          beardSwaySp.update(dt, Math.sin(time * 2.0) * 0.12 + tgtHeadYaw * 0.35, 95 * sp, 5.5);
          packBobSp.update(dt, 0, 130 * sp, 6.2);
          bodyBobSp.update(dt, 0, 150 * sp, 8.0);
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const hYaw = yw + clamp(headYawSp.x, -0.60, 0.60);

          const breath = Math.sin(state.actionTime * 1.9) * 0.32 * (1 - state.walkBlend * 0.4);
          const stepBob = Math.abs(Math.sin(state.stepPhase)) * 0.45 * state.walkBlend;
          const bob = clamp(bodyBobSp.x * 0.05 + breath + stepBob, -0.45, 0.85) * sMul;
          const packBob = clamp(packBobSp.x * 0.08, -0.9, 1.1) * sMul;

          // 1. 双足 IK
          for (let i = 0; i < gait.legs.length; i++) {
            const l = gait.legs[i];
            const hx = l.hipWX + (state.tiltX || 0);
            const hy = l.hipWY + (state.tiltY || 0);
            const hz = l.hipWZ + bob;
            list.push({
              partKey: 'legThigh', asset: parts.legThigh,
              x: lerp(hx, l.kneeX, 0.25), y: lerp(hy, l.kneeY, 0.25),
              lift: Math.max(0, lerp(hz, l.kneeZ, 0.25) - 1.6 * sMul),
              ro: yw, bias: -0.34, symDeg: 90
            });
            list.push({
              partKey: 'legShin', asset: parts.legShin,
              x: lerp(l.kneeX, l.footX, 0.45), y: lerp(l.kneeY, l.footY, 0.45),
              lift: Math.max(0, lerp(l.kneeZ, l.footZ + 1.3 * sMul, 0.45) - 1.5 * sMul),
              ro: yw, bias: -0.28, symDeg: 90
            });
            list.push({
              partKey: 'boot', asset: parts.boot,
              x: l.footX, y: l.footY, lift: Math.max(0, l.footZ),
              ro: yw, bias: -0.22
            });
          }

          // 2. 略驼背宽长袍躯干
          const [tx, ty] = localToWorldXY(state.x + (state.tiltX || 0), state.y + (state.tiltY || 0), yw, 0, 0.2 * sMul);
          list.push({
            partKey: 'torso', asset: parts.torso,
            x: tx, y: ty, lift: 4.2 * sMul + bob, ro: yw, bias: 0.12
          });

          // 3. 背后木制标本背箱（含彩纸卷轴、干草药、淡青自亮小菇）
          const [pkX, pkY] = localToWorldXY(tx, ty, yw, 0, -5.6 * sMul);
          list.push({
            partKey: 'backpack', asset: parts.backpack,
            x: pkX, y: pkY, lift: 7.4 * sMul + bob + packBob, ro: yw, bias: -0.22
          });

          // 4. 头部 + 垂胸雪白蓬松长卷须 + 软顶大尖帽
          const [hx, hy] = localToWorldXY(tx, ty, yw, 0, 1.8 * sMul);
          const headZ = 14.8 * sMul + bob + state.headLift * sMul;
          list.push({
            partKey: 'head', asset: parts.head,
            x: hx, y: hy, lift: headZ, ro: hYaw, bias: 0.34
          });

          const [bdX, bdY] = localToWorldXY(hx, hy, hYaw, 0, 2.2 * sMul);
          list.push({
            partKey: 'beard', asset: parts.beard,
            x: bdX, y: bdY, lift: headZ - 4.2 * sMul,
            ro: hYaw + clamp(beardSwaySp.x, -0.35, 0.35), bias: 0.40
          });

          list.push({
            partKey: 'hat', asset: parts.hat,
            x: hx, y: hy, lift: headZ + 5.8 * sMul, ro: hYaw, bias: 0.48
          });

          // 5. 左右宽袖两段 FK 手臂
          const shZ = 11.8 * sMul + bob;
          const [lShX, lShY] = localToWorldXY(tx, ty, yw, -4.6 * sMul, 1.2 * sMul);
          const lUpYaw = yw + state.armLYaw;
          const [lUpX, lUpY] = pivotToWorldXY(lShX, lShY, lUpYaw, 0, -1.0 * sMul);
          list.push({
            partKey: 'upperArmL', asset: parts.upperArm,
            x: lUpX, y: lUpY, lift: shZ - 1.6 * sMul + state.armLLift * sMul, ro: lUpYaw, bias: 0.18
          });

          const [lElX, lElY] = localToWorldXY(lShX, lShY, lUpYaw, 0, 3.0 * sMul);
          const lFoYaw = yw + state.foreLYaw;
          const [lFoX, lFoY] = pivotToWorldXY(lElX, lElY, lFoYaw, 0, -1.4 * sMul);
          const lHandZ = shZ - 1.8 * sMul + state.foreLLift * sMul;
          list.push({
            partKey: 'forearmL', asset: parts.forearm,
            x: lFoX, y: lFoY, lift: lHandZ, ro: lFoYaw, bias: 0.26
          });

          const [rShX, rShY] = localToWorldXY(tx, ty, yw, 4.6 * sMul, 1.2 * sMul);
          const rUpYaw = yw + state.armRYaw;
          const [rUpX, rUpY] = pivotToWorldXY(rShX, rShY, rUpYaw, 0, -1.0 * sMul);
          list.push({
            partKey: 'upperArmR', asset: parts.upperArm,
            x: rUpX, y: rUpY, lift: shZ - 1.6 * sMul + state.armRLift * sMul, ro: rUpYaw, bias: 0.18
          });

          const [rElX, rElY] = localToWorldXY(rShX, rShY, rUpYaw, 0, 3.0 * sMul);
          const rFoYaw = yw + state.foreRYaw;
          const [rFoX, rFoY] = pivotToWorldXY(rElX, rElY, rFoYaw, 0, -1.4 * sMul);
          const rHandZ = shZ - 1.8 * sMul + state.foreRLift * sMul;
          list.push({
            partKey: 'forearmR', asset: parts.forearm,
            x: rFoX, y: rFoY, lift: rHandZ, ro: rFoYaw, bias: 0.28
          });

          // 6. 胸前摊开的夸张厚大烫金生态卡册大书
          const [bkX, bkY] = localToWorldXY(tx, ty, yw, 0, 6.2 * sMul);
          list.push({
            partKey: 'book', asset: parts.book,
            x: bkX, y: bkY, lift: lHandZ - 0.6 * sMul, ro: yw, bias: 0.36
          });

          // 7. 右手工具（study 放大镜 / record 大白羽毛笔）
          if (state.toolMode === 'magnifier') {
            const [rHdX, rHdY] = localToWorldXY(rElX, rElY, rFoYaw, 0, 4.2 * sMul);
            list.push({
              partKey: 'magnifier', asset: parts.magnifier,
              x: rHdX, y: rHdY, lift: rHandZ + 0.8 * sMul, ro: rFoYaw + 0.35, bias: 0.44
            });
          } else if (state.toolMode === 'quill') {
            const [rHdX, rHdY] = localToWorldXY(rElX, rElY, rFoYaw, 0, 3.8 * sMul);
            list.push({
              partKey: 'quill', asset: parts.quill,
              x: rHdX, y: rHdY, lift: rHandZ + 0.4 * sMul, ro: rFoYaw - 0.25, bias: 0.44
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Def.id, code: Def.code, name: Def.name, outlineMode: 'actorUnified',
            skin: curSkin.id, footRadius: Def.footRadius, headZ: 26, centerZ: 13,
            blocks: Def.blocks, params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Assets.register(Def, 'npc');
})(window.PixelWorkshop);

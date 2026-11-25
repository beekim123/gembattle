/* UI-01 复古奇幻精绘像素皮肤与通用控件 (Code00ArtPacks.uiSkin v1) */
(function (root) {
  'use strict';

  const OUTLINE = '#0c121a';

  const PALETTE = {
    outline: OUTLINE,
    wood: { dark: '#18110c', base: '#261b13', mid: '#3d2b1d', hi: '#694c34', plankA: '#211710', plankB: '#2d2017', grain: '#36261a', groove: '#140e09' },
    brass: { dark: '#5e3d12', base: '#a67424', mid: '#d8a848', hi: '#fff0b4' },
    parchment: { dark: '#7a6340', base: '#cbb68e', mid: '#e4d5b4', hi: '#f7eed6', crease: '#b8a077', speck: '#d6c39d', ink: '#2b1e14' },
    stone: { dark: '#161e1c', base: '#24302d', mid: '#3a4c47', hi: '#526962', crack: '#192220', mossDark: '#385936', moss: '#5f8c58', mossHi: '#8bc07c' },
    tooltip: { dark: '#0f1414', base: '#18201e', mid: '#26312e', hi: '#42524d' },
    buttons: {
      primary:   { dark: '#6e420e', base: '#c48918', mid: '#e6b32e', hi: '#fff2a8', hoverBase: '#d69920', hoverMid: '#f2c444', text: '#fffaf0' },
      secondary: { dark: '#19291e', base: '#2d4a34', mid: '#436b4b', hi: '#8ec48a', hoverBase: '#385c40', hoverMid: '#52805b', text: '#f2f7f0' },
      danger:    { dark: '#521614', base: '#9e2c26', mid: '#d6483c', hi: '#ffaca0', hoverBase: '#b5342c', hoverMid: '#e85b4e', text: '#fff5f2' },
      ghost:     { dark: '#141b19', base: '#24302c', mid: '#384a44', hi: '#86a399', hoverBase: '#2f3f3a', hoverMid: '#485e57', text: '#e8eee9' },
      disabled:  { dark: '#1a1f1e', base: '#2b3230', mid: '#3c4542', hi: '#5c6663', text: '#8d9692' }
    },
    ring: [
      { name: '红', dark: '#7d1e18', base: '#e2483c', hi: '#ffa094' },
      { name: '黄', dark: '#876912', base: '#efc93f', hi: '#fff3a8' },
      { name: '绿', dark: '#1e5e22', base: '#4cb050', hi: '#a0f2a4' },
      { name: '青', dark: '#185e66', base: '#3fbac4', hi: '#a4f4fa' },
      { name: '蓝', dark: '#1c387a', base: '#4474dd', hi: '#a0c4ff' },
      { name: '紫', dark: '#4a2078', base: '#9254cf', hi: '#dab0ff' },
      { name: '白', dark: '#8c8577', base: '#f4f0e6', hi: '#ffffff' }
    ],
    gems: [
      { dark: '#8c1f18', mid: '#d9382b', base: '#ff5a4a', hi: '#ffc0b5' },
      { dark: '#1b6922', mid: '#34a83b', base: '#52d65a', hi: '#b8fcb9' },
      { dark: '#1c3c8c', mid: '#3965d6', base: '#5a8cff', hi: '#bad4ff' }
    ]
  };

  // Deterministic tiny hash for crisp pixel texture grain
  function hash2(x, y, seed) {
    let n = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
    n = ((n ^ (n >> 13)) * 1274126177) | 0;
    return ((n ^ (n >> 16)) >>> 0) / 4294967295;
  }

  function px(ctx, x, y, col, w, h) {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w || 1, h || 1);
  }

  function parseHex(hex) {
    if (typeof hex !== 'string' || hex[0] !== '#') return [255, 255, 255];
    let s = hex.slice(1);
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    const v = parseInt(s, 16);
    if (Number.isNaN(v)) return [255, 255, 255];
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  function shiftColor(hex, delta) {
    const [r, g, b] = parseHex(hex);
    const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
    const nr = delta >= 0 ? r + (255 - r) * delta : r * (1 + delta);
    const ng = delta >= 0 ? g + (255 - g) * delta : g * (1 + delta);
    const nb = delta >= 0 ? b + (255 - b) * delta : b * (1 + delta);
    return '#' + ((1 << 24) | (clamp(nr) << 16) | (clamp(ng) << 8) | clamp(nb)).toString(16).slice(1);
  }

  function defaultMakeCanvas(w, h) {
    const c = root.document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  // Draw a sprite matrix (array of strings) onto a freshly created offscreen canvas
  function bakeSprite(makeCanvas, rows, colorMap) {
    const h = rows.length;
    const w = rows[0].length;
    const cv = makeCanvas(w, h);
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < h; y++) {
      const row = rows[y];
      for (let x = 0; x < w; x++) {
        const ch = row[x];
        if (ch === '.' || ch === ' ') continue;
        const col = colorMap[ch];
        if (col) {
          ctx.fillStyle = col;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    return cv;
  }

  // ---------- 1. Pre-baked 9-Slice Panels (72x72, border 12, tileable 48x48 interior) ----------
  function bakeWoodPanel(makeCanvas) {
    const W = 72, H = 72;
    const cv = makeCanvas(W, H);
    const c = cv.getContext('2d');
    const wd = PALETTE.wood;
    const br = PALETTE.brass;

    // Fill outer frame body with 1px chamfered corners
    px(c, 2, 0, OUTLINE, W - 4, H);
    px(c, 0, 2, OUTLINE, W, H - 4);
    px(c, 1, 1, OUTLINE, W - 2, H - 2);

    // Outer timber bevel
    px(c, 2, 1, wd.dark, W - 4, H - 2);
    px(c, 1, 2, wd.dark, W - 2, H - 4);
    px(c, 2, 2, wd.mid, W - 4, H - 4);
    // Top & left carved highlight rim
    px(c, 3, 2, wd.hi, W - 6, 1);
    px(c, 2, 3, wd.hi, 1, H - 6);
    // Bottom & right deep bevel
    px(c, 3, H - 3, wd.dark, W - 6, 1);
    px(c, W - 3, 3, wd.dark, 1, H - 6);
    px(c, 3, H - 4, wd.plankA, W - 6, 1);
    px(c, W - 4, 3, wd.plankA, 1, H - 6);

    // Inner recessed outline & dark wood groove
    px(c, 6, 6, wd.groove, W - 12, H - 12);
    px(c, 7, 7, wd.hi, W - 14, 1);
    px(c, 7, 7, wd.mid, 1, H - 14);
    px(c, 7, H - 8, wd.groove, W - 14, 1);
    px(c, W - 8, 7, wd.groove, 1, H - 14);

    // Recessed horizontal walnut wood planks (inside 8..63)
    for (let y = 8; y < H - 8; y++) {
      const plankIdx = Math.floor((y - 8) / 8);
      const localY = (y - 8) % 8;
      const baseCol = (plankIdx % 2 === 0) ? wd.base : wd.plankB;
      px(c, 8, y, localY === 0 ? wd.plankA : baseCol, W - 16, 1);
      for (let x = 8; x < W - 8; x++) {
        const h = hash2(x, y, 17);
        if (localY === 1 && h > 0.72) px(c, x, y, wd.grain);
        else if (localY > 1 && h > 0.88) px(c, x, y, wd.grain, 2, 1);
        else if (localY > 2 && h < 0.06) px(c, x, y, wd.plankA);
      }
    }
    // Subtle inner shadow under top/left wood frame
    px(c, 8, 8, wd.dark, W - 16, 1);
    px(c, 8, 8, wd.dark, 1, H - 16);

    // Mid-edge forged brass trim studs (at x=35..36, y=3..4 etc.)
    const drawEdgeStud = (sx, sy) => {
      px(c, sx - 1, sy - 1, OUTLINE, 4, 4);
      px(c, sx, sy, br.mid, 2, 2);
      px(c, sx, sy, br.hi, 1, 1);
      px(c, sx + 1, sy + 1, br.dark, 1, 1);
    };
    drawEdgeStud(35, 3);
    drawEdgeStud(35, H - 5);
    drawEdgeStud(3, 35);
    drawEdgeStud(W - 5, 35);

    // 4 Corner Forged Brass L-Brackets with Rivets (strictly inside 12x12 corners)
    const drawCornerBracket = (flipX, flipY) => {
      const mx = (lx) => (flipX ? W - 1 - lx : lx);
      const my = (ly) => (flipY ? H - 1 - ly : ly);
      const setP = (lx, ly, col) => px(c, mx(lx), my(ly), col);

      // L-plate footprint
      for (let i = 1; i <= 10; i++) {
        for (let t = 1; t <= 4; t++) {
          if (i === 1 && t === 1) continue;
          const isEdge = (i === 10 || t === 4);
          setP(i, t, isEdge ? OUTLINE : br.base);
          setP(t, i, isEdge ? OUTLINE : br.base);
        }
      }
      // Corner solid square fill
      for (let y = 1; y <= 7; y++) {
        for (let x = 1; x <= 7; x++) {
          if (x === 1 && y === 1) continue;
          if (x === 7 || y === 7) setP(x, y, OUTLINE);
          else setP(x, y, br.base);
        }
      }
      // Brass highlight & mid bevel
      for (let i = 2; i <= 9; i++) {
        setP(i, 2, br.mid);
        setP(2, i, br.mid);
        setP(i, 3, br.dark);
        setP(3, i, br.dark);
      }
      for (let y = 2; y <= 6; y++) {
        for (let x = 2; x <= 6; x++) {
          setP(x, y, (x === 2 || y === 2) ? br.hi : (x === 6 || y === 6) ? br.dark : br.mid);
        }
      }
      // Raised corner rivet
      setP(4, 4, br.hi);
      setP(5, 4, br.base);
      setP(4, 5, br.base);
      setP(5, 5, br.dark);
      // Outer dark corner pixels
      setP(1, 2, OUTLINE);
      setP(2, 1, OUTLINE);
    };
    drawCornerBracket(false, false);
    drawCornerBracket(true, false);
    drawCornerBracket(false, true);
    drawCornerBracket(true, true);

    return cv;
  }

  function bakeParchmentPanel(makeCanvas) {
    const W = 72, H = 72;
    const cv = makeCanvas(W, H);
    const c = cv.getContext('2d');
    const pa = PALETTE.parchment;
    const br = PALETTE.brass;

    // Aged scroll silhouette with crisp pixel border
    px(c, 2, 0, OUTLINE, W - 4, H);
    px(c, 0, 2, OUTLINE, W, H - 4);
    px(c, 1, 1, OUTLINE, W - 2, H - 2);

    // Outer tanned leather/aged rim
    px(c, 2, 1, pa.dark, W - 4, H - 2);
    px(c, 1, 2, pa.dark, W - 2, H - 4);
    px(c, 2, 2, pa.base, W - 4, H - 4);
    px(c, 3, 2, pa.hi, W - 6, 1);
    px(c, 2, 3, pa.hi, 1, H - 6);
    px(c, 3, H - 3, pa.dark, W - 6, 1);
    px(c, W - 3, 3, pa.dark, 1, H - 6);

    // Inner parchment body
    px(c, 4, 4, pa.mid, W - 8, H - 8);
    // Stepped soft edge darkening (parchment curl)
    px(c, 4, 4, pa.base, W - 8, 2);
    px(c, 4, H - 6, pa.base, W - 8, 2);
    px(c, 4, 4, pa.base, 2, H - 8);
    px(c, W - 6, 4, pa.base, 2, H - 8);

    // Fine gold-brown inner rule
    px(c, 7, 7, br.base, W - 14, 1);
    px(c, 7, H - 8, br.base, W - 14, 1);
    px(c, 7, 7, br.base, 1, H - 14);
    px(c, W - 8, 7, br.base, 1, H - 14);
    // Warm cream highlight right inside rule
    px(c, 8, 8, pa.hi, W - 16, 1);
    px(c, 8, 8, pa.hi, 1, H - 16);

    // Corner filigree diamonds inside 12x12
    const drawFiligree = (fx, fy) => {
      px(c, fx, fy, pa.dark, 3, 3);
      px(c, fx + 1, fy + 1, br.mid, 1, 1);
      px(c, fx + 1, fy, br.base, 1, 1);
      px(c, fx, fy + 1, br.base, 1, 1);
    };
    drawFiligree(5, 5);
    drawFiligree(W - 8, 5);
    drawFiligree(5, H - 8);
    drawFiligree(W - 8, H - 8);

    // Subtle paper grain speckles & aged crease lines in center (10..61)
    for (let y = 10; y < H - 10; y++) {
      for (let x = 10; x < W - 10; x++) {
        const h = hash2(x, y, 41);
        if (h > 0.93) px(c, x, y, pa.hi);
        else if (h < 0.07) px(c, x, y, pa.speck);
        else if (h < 0.085) px(c, x, y, pa.crease);
      }
    }
    // Faint horizontal parchment fiber weave
    for (let y = 16; y < H - 14; y += 12) {
      for (let x = 12; x < W - 12; x += 3) {
        if (hash2(x, y, 73) > 0.45) px(c, x, y, pa.speck, 2, 1);
      }
    }

    // Tiny vintage edge nicks (in tileable border zone)
    px(c, 28, 1, OUTLINE, 2, 1);
    px(c, 50, H - 2, OUTLINE, 2, 1);
    px(c, 1, 34, OUTLINE, 1, 2);
    return cv;
  }

  function bakeStonePanel(makeCanvas) {
    const W = 72, H = 72;
    const cv = makeCanvas(W, H);
    const c = cv.getContext('2d');
    const st = PALETTE.stone;

    // Stepped ancient carved stone slab outline
    px(c, 3, 0, OUTLINE, W - 6, H);
    px(c, 0, 3, OUTLINE, W, H - 6);
    px(c, 1, 1, OUTLINE, W - 2, H - 2);

    // Outer chiseled stone masonry border
    px(c, 3, 1, st.mid, W - 6, H - 2);
    px(c, 1, 3, st.mid, W - 2, H - 6);
    px(c, 2, 2, st.mid, W - 4, H - 4);

    // Top/left chiseled bevel catch
    px(c, 3, 1, st.hi, W - 6, 1);
    px(c, 2, 2, st.hi, W - 4, 1);
    px(c, 1, 3, st.hi, 1, H - 6);
    px(c, 2, 3, st.hi, 1, H - 6);
    // Bottom/right deep stone undercut
    px(c, 3, H - 2, st.dark, W - 6, 1);
    px(c, 2, H - 3, st.dark, W - 4, 1);
    px(c, W - 2, 3, st.dark, 1, H - 6);
    px(c, W - 3, 3, st.dark, 1, H - 6);

    // Stone block mortar seams on border
    const seams = [12, 26, 44, 59];
    for (let i = 0; i < seams.length; i++) {
      const s = seams[i];
      px(c, s, 1, st.crack, 1, 6);
      px(c, s + 1, 2, st.hi, 1, 4);
      px(c, W - 1 - s, H - 7, st.crack, 1, 6);
      px(c, 1, s, st.crack, 6, 1);
      px(c, W - 7, W - 1 - s, st.crack, 6, 1);
    }

    // Inner recessed stone slab
    px(c, 7, 7, OUTLINE, W - 14, H - 14);
    px(c, 8, 8, st.base, W - 16, H - 16);
    px(c, 8, 8, st.dark, W - 16, 1);
    px(c, 8, 8, st.dark, 1, H - 16);
    px(c, 8, H - 9, st.mid, W - 16, 1);
    px(c, W - 9, 8, st.mid, 1, H - 16);

    // Weathered slate texture & faint brick grid inside
    for (let y = 9; y < H - 9; y++) {
      for (let x = 9; x < W - 9; x++) {
        const h = hash2(x, y, 91);
        if (h > 0.91) px(c, x, y, st.mid);
        else if (h < 0.08) px(c, x, y, st.crack);
      }
    }
    // Carved stone corner notches
    c.clearRect(0, 0, 1, 1);
    c.clearRect(W - 1, 0, 1, 1);
    c.clearRect(0, H - 1, 1, 1);
    c.clearRect(W - 1, H - 1, 1, 1);
    // Corner carved square studs
    const drawStoneCorner = (cx, cy) => {
      px(c, cx, cy, st.crack, 5, 5);
      px(c, cx + 1, cy + 1, st.mid, 3, 3);
      px(c, cx + 1, cy + 1, st.hi, 2, 1);
      px(c, cx + 1, cy + 2, st.hi, 1, 1);
    };
    drawStoneCorner(3, 3);
    drawStoneCorner(W - 8, 3);
    drawStoneCorner(3, H - 8);
    drawStoneCorner(W - 8, H - 8);

    // Hand-placed pixel moss clusters clinging to ancient stone edges & corners
    const mossPixels = [
      // Top-left corner moss
      [3, 1, st.moss], [4, 1, st.mossHi], [5, 1, st.moss], [6, 1, st.mossDark],
      [2, 2, st.mossDark], [3, 2, st.mossHi], [4, 2, st.moss], [5, 2, st.mossDark], [6, 2, st.moss],
      [2, 3, st.moss], [3, 3, st.mossDark], [1, 4, st.moss], [2, 4, st.mossHi], [2, 5, st.mossDark],
      [4, 3, st.moss], [5, 3, st.mossDark],
      // Top-edge crack moss
      [25, 1, st.moss], [26, 1, st.mossHi], [27, 1, st.moss], [26, 2, st.mossDark], [27, 2, st.moss], [26, 3, st.mossDark],
      // Bottom-right corner moss
      [W - 5, H - 2, st.mossDark], [W - 6, H - 2, st.moss], [W - 7, H - 2, st.mossDark],
      [W - 4, H - 3, st.moss], [W - 5, H - 3, st.mossHi], [W - 6, H - 3, st.moss],
      [W - 3, H - 4, st.mossDark], [W - 4, H - 4, st.moss], [W - 3, H - 5, st.moss],
      // Left edge tiny moss tuft
      [1, 43, st.moss], [2, 43, st.mossHi], [2, 44, st.moss], [3, 44, st.mossDark]
    ];
    for (let i = 0; i < mossPixels.length; i++) {
      const [mx, my, mc] = mossPixels[i];
      px(c, mx, my, mc);
    }

    return cv;
  }

  function bakeTooltipPanel(makeCanvas) {
    const W = 72, H = 72;
    const cv = makeCanvas(W, H);
    const c = cv.getContext('2d');
    const tt = PALETTE.tooltip;
    const br = PALETTE.brass;

    // Crisp outer dark border
    px(c, 2, 0, OUTLINE, W - 4, H);
    px(c, 0, 2, OUTLINE, W, H - 4);
    px(c, 1, 1, OUTLINE, W - 2, H - 2);

    // Outer dark bezel
    px(c, 2, 1, tt.mid, W - 4, H - 2);
    px(c, 1, 2, tt.mid, W - 2, H - 4);
    px(c, 2, 2, tt.base, W - 4, H - 4);

    // Warm thin gold inner rim
    px(c, 3, 3, br.base, W - 6, H - 6);
    px(c, 3, 3, br.mid, W - 6, 1);
    px(c, 3, 3, br.mid, 1, H - 6);
    px(c, 3, H - 4, br.dark, W - 6, 1);
    px(c, W - 4, 3, br.dark, 1, H - 6);

    // Dark obsidian-wood core
    px(c, 4, 4, tt.dark, W - 8, H - 8);
    px(c, 5, 5, tt.base, W - 10, H - 10);

    // Subtle crisp pixel texture in tooltip background
    for (let y = 6; y < H - 6; y++) {
      for (let x = 6; x < W - 6; x++) {
        if ((x + y) % 4 === 0 && hash2(x, y, 131) > 0.65) {
          px(c, x, y, '#1d2724');
        }
      }
    }

    // Miniature corner gold finials
    const drawPin = (fx, fy) => {
      px(c, fx, fy, br.hi, 2, 2);
      px(c, fx + 1, fy + 1, br.base, 1, 1);
    };
    drawPin(2, 2);
    drawPin(W - 4, 2);
    drawPin(2, H - 4);
    drawPin(W - 4, H - 4);

    return cv;
  }

  function bakeBarPanel(makeCanvas) {
    const W = 72, H = 32;
    const cv = makeCanvas(W, H);
    const c = cv.getContext('2d');
    const wd = PALETTE.wood;
    const br = PALETTE.brass;

    // Flush dark walnut overhead beam (no wasted top outline)
    for (let y = 0; y < H - 5; y++) {
      const band = (y < 6) ? wd.plankA : (y < 20) ? wd.base : wd.plankB;
      px(c, 0, y, band, W, 1);
      for (let x = 0; x < W; x++) {
        const h = hash2(x, y, 211);
        if (h > 0.87) px(c, x, y, wd.grain, 2, 1);
        else if (h < 0.06) px(c, x, y, wd.dark);
      }
    }
    // Horizontal plank seams
    px(c, 0, 7, wd.dark, W, 1);
    px(c, 0, 8, wd.mid, W, 1);
    px(c, 0, 21, wd.dark, W, 1);

    // Forged vertical beam joinery plates + brass studs inside tileable center (x=35)
    px(c, 35, 0, wd.dark, 2, H - 5);
    px(c, 34, 11, OUTLINE, 4, 4);
    px(c, 35, 12, br.mid, 2, 2);
    px(c, 35, 12, br.hi, 1, 1);

    // Lower forged brass cornice
    px(c, 0, H - 5, wd.groove, W, 1);
    px(c, 0, H - 4, br.hi, W, 1);
    px(c, 0, H - 3, br.mid, W, 1);
    px(c, 0, H - 2, br.dark, W, 1);
    px(c, 0, H - 1, OUTLINE, W, 1);

    // Periodic cornice rivet bumps
    for (let x = 14; x < W - 12; x += 16) {
      px(c, x, H - 4, br.hi, 2, 1);
      px(c, x, H - 3, br.base, 2, 1);
    }

    // Left & right end caps (12px each)
    px(c, 0, 0, OUTLINE, 1, H);
    px(c, 1, 0, wd.mid, 1, H - 5);
    px(c, W - 1, 0, OUTLINE, 1, H);
    px(c, W - 2, 0, wd.dark, 1, H - 5);

    return cv;
  }

  // ---------- 2. Pre-baked 9-Slice Buttons (48x32, slice=8) ----------
  function bakeButtonPlate(makeCanvas, variant, stateName) {
    const W = 48, H = 32;
    const cv = makeCanvas(W, H);
    const c = cv.getContext('2d');
    const pal = (stateName === 'disabled') ? PALETTE.buttons.disabled : (PALETTE.buttons[variant] || PALETTE.buttons.primary);
    const isHover = stateName === 'hover';
    const isPressed = stateName === 'pressed';
    const isDisabled = stateName === 'disabled';

    const topY = isPressed ? 2 : 0;
    const botH = isPressed ? 1 : 3;
    const faceBottom = H - 1 - botH;

    // Outer pixel silhouette with 2px stepped chamfer
    px(c, 2, topY, OUTLINE, W - 4, H - topY);
    px(c, 0, topY + 2, OUTLINE, W, H - topY - 4);
    px(c, 1, topY + 1, OUTLINE, W - 2, H - topY - 2);

    // Lower 3D thick underside lip
    if (!isPressed) {
      px(c, 2, faceBottom, pal.dark, W - 4, botH);
      px(c, 1, faceBottom, pal.dark, W - 2, Math.max(1, botH - 1));
      // Subtle vertical ribs on bottom lip
      for (let x = 8; x < W - 8; x += 8) {
        px(c, x, faceBottom + 1, OUTLINE, 1, Math.max(1, botH - 1));
      }
    }

    // Main button face fill
    const faceBase = isHover ? (pal.hoverBase || pal.base) : pal.base;
    const faceMid = isHover ? (pal.hoverMid || pal.mid) : pal.mid;
    const faceH = faceBottom - (topY + 1);

    px(c, 2, topY + 1, faceBase, W - 4, faceH);
    px(c, 1, topY + 2, faceBase, W - 2, Math.max(1, faceH - 2));

    // Upper lit bevel band (kept strictly inside top 12px slice for seamless vertical tiling)
    const upperH = Math.max(2, Math.min(9, 12 - (topY + 2)));
    px(c, 2, topY + 2, faceMid, W - 4, upperH);

    // Subtle pixel grain inside face
    for (let y = topY + 3; y < faceBottom - 1; y++) {
      for (let x = 4; x < W - 4; x++) {
        const h = hash2(x, y, variant.length * 19 + stateName.length * 7);
        if (h > 0.91 && !isDisabled) px(c, x, y, faceMid);
        else if (h < 0.06) px(c, x, y, pal.dark);
      }
    }

    // Top inner ridge (highlight when normal/hover, recessed dark shadow when pressed)
    if (isPressed) {
      px(c, 2, topY + 1, pal.dark, W - 4, 2);
      px(c, 2, topY + 3, faceBase, W - 4, 1);
      px(c, 2, faceBottom - 1, faceMid, W - 4, 1);
    } else {
      px(c, 2, topY + 1, pal.hi, W - 4, 1);
      if (isHover) {
        px(c, 3, topY + 2, pal.hi, W - 6, 1);
      }
      px(c, 2, topY + 2, pal.hi, 1, Math.max(1, faceH - 3));
      px(c, 2, faceBottom - 1, pal.dark, W - 4, 1);
      px(c, W - 3, topY + 2, pal.dark, 1, Math.max(1, faceH - 3));
    }

    // Corner forged rivets
    const rivetCol = isDisabled ? '#4e5754' : (isHover ? '#fff8d0' : pal.hi);
    const drawPin = (rx, ry) => {
      px(c, rx, ry, pal.dark, 2, 2);
      px(c, rx, ry, rivetCol, 1, 1);
    };
    drawPin(4, topY + 4);
    drawPin(W - 6, topY + 4);
    if (faceBottom - 6 > topY + 6) {
      drawPin(4, faceBottom - 5);
      drawPin(W - 6, faceBottom - 5);
    }

    // Hover extra warm corner catch
    if (isHover && !isDisabled) {
      px(c, 1, topY + 2, pal.hi, 1, Math.max(1, faceH - 4));
      px(c, W - 2, topY + 2, pal.hi, 1, Math.max(1, faceH - 4));
    }

    return cv;
  }

  // ---------- 3. Pre-baked Pixel Sprites (Hearts, Coin, Shields, Gems, Medallions) ----------
  const HEART_FULL = [
    '................',
    '..oooo....oooo..',
    '.oRRRRo..oRRRRo.',
    'oRWHRRRooRRRRRRo',
    'oRWWRRRRRRRRRRRo',
    'oRWRRRRRRRRRRDDo',
    'oRRRRRRRRRRRRDDo',
    '.oRRRRRRRRRRDDo.',
    '..oRRRRRRRRDDo..',
    '...oRRRRRRDDo...',
    '....oRRRRDDo....',
    '.....oRRDDo.....',
    '......oRDo......',
    '.......oo.......',
    '................',
    '................'
  ];

  const HEART_HALF = [
    '................',
    '..oooo....oooo..',
    '.oRRRRo..oEEEEo.',
    'oRWHRRRooEEeeEEo',
    'oRWWRRRRoEeeeeEo',
    'oRWRRRRRoEeeeeEo',
    'oRRRRRRRoEeeeeEo',
    '.oRRRRRRoEeeeEo.',
    '..oRRRRRoEeeEo..',
    '...oRRRRoEeEo...',
    '....oRRRoEEo....',
    '.....oRRoEo.....',
    '......oRo.......',
    '.......oo.......',
    '................',
    '................'
  ];

  const HEART_EMPTY = [
    '................',
    '..oooo....oooo..',
    '.oEEEEo..oEEEEo.',
    'oEEeeEEooEEeeEEo',
    'oEeeeeEooEeeeeEo',
    'oEeeeeeeeeeeeeEo',
    'oEeeeeeeeeeeeSSo',
    '.oEeeeeeeeeeSSo.',
    '..oEeeeeeeeSSo..',
    '...oEeeeeeSSo...',
    '....oEeeeSSo....',
    '.....oEeSSo.....',
    '......oESo......',
    '.......oo.......',
    '................',
    '................'
  ];

  const COIN_GRID = [
    '................',
    '.....oooooo.....',
    '...ooHHMMBBo....',
    '..oHHMMMMMBBo...',
    '.oHHMMDDDDMMBo..',
    '.oHMMDHHMDMBBo..',
    'oHMMDHMMBMDMBBo.',
    'oHMMDHMMBMDMBBo.',
    'oHMMDMBBBMDMBBo.',
    'oHMMDDMBBMDMBBo.',
    '.oBMMDDDDMMBDo..',
    '.oBBMMMMMMBBDo..',
    '..oBBBMMBBBDo...',
    '...ooBBBBDDoo...',
    '.....oooooo.....',
    '................'
  ];

  // 11x13 Faceted Pixel Shield Crest (intact vs cracked)
  const SHIELD_INTACT = [
    '....ooo....',
    '..ooHHHoo..',
    '.oHHMMMHHo.',
    'oHWWMMBBMMo',
    'oHWMBBBBBMo',
    'oHMBBBBBDBo',
    'oMMBBBBDDDo',
    'oMMBBBDDDDo',
    '.oMBBDDDDo.',
    '..oBDDDDo..',
    '...oDDDo...',
    '....oDo....',
    '.....o.....'
  ];

  const SHIELD_BROKEN = [
    '....ooo....',
    '..ooEEEoo..',
    '.oEEeeoEEo.',
    'oEEeooeeCCo',
    'oEeoeeCCeeo',
    'oEeCooeeeeo',
    'oEeeeoCeeeo',
    'oEeeooeeeeo',
    '.oEeeeeSSo.',
    '..oEeeSSo..',
    '...oESSo...',
    '....oSo....',
    '.....o.....'
  ];

  // 12x12 Faceted Gem for Color Ring & Gem Level Bar
  const GEM_FACET = [
    '....oooo....',
    '..ooHHHHoo..',
    '.oHWWMMMMHo.',
    'oHWMMBBBBMBo',
    'oHMBBBBBBBDo',
    'oMBBBBBBBBDo',
    'oMBBBBBBBDD0',
    'oMBBBBBDDDDo',
    'oDBBBBDDDDo.',
    '.oDDDDDDDo..',
    '..ooDDDoo...',
    '....ooo.....'
  ];

  // 14x14 Larger Primary Gem for Gem Level Bar
  const BIG_GEM = [
    '.....oooo.....',
    '...ooHHHHoo...',
    '..oHWWMMMMHo..',
    '.oHWWMMBBBBMo.',
    'oHWMMBBBBBBBDo',
    'oHMBBBBBBBBBDo',
    'oMMBBBBBBBBDD0',
    'oMMBBBBBBBBDD0',
    'oMBBBBBBBBDDDo',
    'oDBBBBBBBDDDDo',
    '.oDBBBBBDDDDo.',
    '..oDBBBDDDDo..',
    '...ooDDDDoo...',
    '.....oooo.....'
  ];

  // Empty bronze ring socket (12x12)
  const SOCKET_EMPTY = [
    '....oooo....',
    '..ooBBBBoo..',
    '.oBBddddBBo.',
    'oBddEEEEddBo',
    'oBdEEEEEEddo',
    'oBdEEEEEEddo',
    'oBdEEEEEEddo',
    'oBdEEEEEEddo',
    'oBddEEEEddMo',
    '.oBMddddMMo.',
    '..ooMMMMoo..',
    '....oooo....'
  ];

  function bakeMedallion(makeCanvas, isDanger) {
    const S = 36;
    const cv = makeCanvas(S, S);
    const c = cv.getContext('2d');
    const br = PALETTE.brass;
    const cx = S / 2 - 0.5;
    const cy = S / 2 - 0.5;

    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const d = Math.hypot(dx, dy);
        if (d > 16.4) continue;
        if (d > 15.1) {
          px(c, x, y, OUTLINE);
        } else if (d > 11.8) {
          // Outer bronze or war-gold ring
          const topLeft = (dx + dy) < -4;
          const botRight = (dx + dy) > 5;
          if (isDanger) {
            px(c, x, y, topLeft ? '#fff2a8' : botRight ? '#8a4b14' : '#e6b32e');
          } else {
            px(c, x, y, topLeft ? br.hi : botRight ? br.dark : br.mid);
          }
        } else if (d > 10.6) {
          px(c, x, y, OUTLINE);
        } else {
          // Recessed seal face
          if (isDanger) {
            const innerCol = d > 8.6 ? '#6b1915' : (dy < -2 ? '#b8322a' : '#8f221d');
            px(c, x, y, innerCol);
          } else {
            const innerCol = d > 8.6 ? '#141a1d' : (dy < -2 ? '#293438' : '#1e272b');
            px(c, x, y, innerCol);
          }
        }
      }
    }

    // 4 Cardinal bronze rivet lugs
    const lugs = [[17, 2], [17, S - 4], [2, 17], [S - 4, 17]];
    for (let i = 0; i < lugs.length; i++) {
      const [lx, ly] = lugs[i];
      px(c, lx - 1, ly - 1, OUTLINE, 4, 4);
      px(c, lx, ly, isDanger ? '#ffe89c' : br.mid, 2, 2);
      px(c, lx, ly, '#fff8d4', 1, 1);
    }

    return cv;
  }

  // ---------- 4. Handcrafted 5x7 Pixel Bitmap Font ----------
  const FONT_RAW = {
    '0': [
      '.###.',
      '##.##',
      '##.##',
      '##.##',
      '##.##',
      '##.##',
      '.###.'
    ],
    '1': [
      '..##.',
      '.###.',
      '..##.',
      '..##.',
      '..##.',
      '..##.',
      '.####'
    ],
    '2': [
      '.###.',
      '##.##',
      '...##',
      '..##.',
      '.##..',
      '##...',
      '#####'
    ],
    '3': [
      '####.',
      '...##',
      '...##',
      '.###.',
      '...##',
      '##.##',
      '.###.'
    ],
    '4': [
      '..##.',
      '.###.',
      '##.##',
      '#####',
      '...##',
      '...##',
      '...##'
    ],
    '5': [
      '#####',
      '##...',
      '####.',
      '...##',
      '...##',
      '##.##',
      '.###.'
    ],
    '6': [
      '.###.',
      '##...',
      '####.',
      '##.##',
      '##.##',
      '##.##',
      '.###.'
    ],
    '7': [
      '#####',
      '##.##',
      '...##',
      '..##.',
      '..##.',
      '.##..',
      '.##..'
    ],
    '8': [
      '.###.',
      '##.##',
      '##.##',
      '.###.',
      '##.##',
      '##.##',
      '.###.'
    ],
    '9': [
      '.###.',
      '##.##',
      '##.##',
      '.####',
      '...##',
      '##.##',
      '.###.'
    ],
    '+': [
      '.....',
      '..#..',
      '..#..',
      '#####',
      '..#..',
      '..#..',
      '.....'
    ],
    '-': [
      '.....',
      '.....',
      '.....',
      '#####',
      '.....',
      '.....',
      '.....'
    ],
    '\u2212': [
      '.....',
      '.....',
      '.....',
      '#####',
      '.....',
      '.....',
      '.....'
    ],
    '\u00d7': [
      '.....',
      '#...#',
      '.#.#.',
      '..#..',
      '.#.#.',
      '#...#',
      '.....'
    ],
    'x': [
      '.....',
      '#...#',
      '.#.#.',
      '..#..',
      '.#.#.',
      '#...#',
      '.....'
    ],
    'X': [
      '.....',
      '#...#',
      '.#.#.',
      '..#..',
      '.#.#.',
      '#...#',
      '.....'
    ],
    '/': [
      '....#',
      '...##',
      '..##.',
      '..#..',
      '.##..',
      '##...',
      '#....'
    ],
    '%': [
      '##..#',
      '##.##',
      '...#.',
      '..#..',
      '.#...',
      '##.##',
      '#..##'
    ],
    '!': [
      '..##.',
      '..##.',
      '..##.',
      '..##.',
      '..##.',
      '.....',
      '..##.'
    ],
    '.': [
      '.....',
      '.....',
      '.....',
      '.....',
      '.....',
      '.##..',
      '.##..'
    ],
    ',': [
      '.....',
      '.....',
      '.....',
      '.....',
      '..##.',
      '..##.',
      '.##..'
    ],
    ' ': [
      '...',
      '...',
      '...',
      '...',
      '...',
      '...',
      '...'
    ]
  };

  // Precompute glyph fill pixels and 8-neighbor outline coordinates once
  const FONT_GLYPHS = {};
  (function buildGlyphMaps() {
    const keys = Object.keys(FONT_RAW);
    for (let k = 0; k < keys.length; k++) {
      const ch = keys[k];
      const rows = FONT_RAW[ch];
      const h = rows.length;
      const w = rows[0].length;
      const fills = [];
      const fillSet = new Set();
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (rows[y][x] === '#') {
            fills.push([x, y]);
            fillSet.add(x + ',' + y);
          }
        }
      }
      const outlineSet = new Set();
      const outlines = [];
      for (let i = 0; i < fills.length; i++) {
        const fx = fills[i][0];
        const fy = fills[i][1];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = fx + dx;
            const ny = fy + dy;
            const key = nx + ',' + ny;
            if (!fillSet.has(key) && !outlineSet.has(key)) {
              outlineSet.add(key);
              outlines.push([nx, ny]);
            }
          }
        }
      }
      // Extra bottom drop-shadow pixels for punchy retro depth
      const dropSet = new Set();
      const drops = [];
      for (let i = 0; i < fills.length; i++) {
        const nx = fills[i][0];
        const ny = fills[i][1] + 2;
        const key = nx + ',' + ny;
        if (!fillSet.has(key) && !outlineSet.has(key) && !dropSet.has(key)) {
          dropSet.add(key);
          drops.push([nx, ny]);
        }
      }
      FONT_GLYPHS[ch] = { w: w, h: h, fills: fills, outlines: outlines, drops: drops };
    }
  })();

  // ---------- 5. Asset Store & Lazy Init ----------
  let assets = null;

  function init(makeCanvas) {
    if (assets) return assets;
    const mk = (typeof makeCanvas === 'function') ? makeCanvas : defaultMakeCanvas;

    const panels = {
      wood: bakeWoodPanel(mk),
      parchment: bakeParchmentPanel(mk),
      stone: bakeStonePanel(mk),
      tooltip: bakeTooltipPanel(mk),
      bar: bakeBarPanel(mk)
    };

    const buttons = {};
    const bVariants = ['primary', 'secondary', 'danger', 'ghost'];
    const bStates = ['normal', 'hover', 'pressed', 'disabled'];
    for (let i = 0; i < bVariants.length; i++) {
      const bv = bVariants[i];
      buttons[bv] = {};
      for (let j = 0; j < bStates.length; j++) {
        const bs = bStates[j];
        buttons[bv][bs] = bakeButtonPlate(mk, bv, bs);
      }
    }

    const heartPalette = {
      o: OUTLINE, R: '#dc322c', W: '#ffffff', H: '#ff968a', D: '#8c1a18',
      E: '#1d2426', e: '#2a3438', S: '#3d4c52'
    };
    const hearts = {
      full: bakeSprite(mk, HEART_FULL, heartPalette),
      half: bakeSprite(mk, HEART_HALF, heartPalette),
      empty: bakeSprite(mk, HEART_EMPTY, heartPalette)
    };

    const coin = bakeSprite(mk, COIN_GRID, {
      o: OUTLINE, H: '#fff4bc', M: '#e6b32e', B: '#b57b1b', D: '#6b420c'
    });

    const shields = [];
    for (let ch = 0; ch < 3; ch++) {
      const g = PALETTE.gems[ch];
      shields.push({
        intact: bakeSprite(mk, SHIELD_INTACT, {
          o: OUTLINE, W: '#ffffff', H: g.hi, M: g.base, B: g.mid, D: g.dark
        }),
        broken: bakeSprite(mk, SHIELD_BROKEN, {
          o: OUTLINE, E: '#1c2224', e: '#2a3336', S: '#3e4a4e', C: g.dark
        })
      });
    }

    const ringGems = [];
    for (let i = 0; i < PALETTE.ring.length; i++) {
      const rc = PALETTE.ring[i];
      ringGems.push(bakeSprite(mk, GEM_FACET, {
        o: OUTLINE, W: '#ffffff', H: rc.hi, M: rc.base, B: rc.base, D: rc.dark, '0': OUTLINE
      }));
    }
    const ringSocket = bakeSprite(mk, SOCKET_EMPTY, {
      o: OUTLINE, B: PALETTE.brass.dark, M: PALETTE.brass.base, d: '#2b2016', E: '#121718'
    });

    const bigGems = [];
    for (let ch = 0; ch < 3; ch++) {
      const g = PALETTE.gems[ch];
      bigGems.push(bakeSprite(mk, BIG_GEM, {
        o: OUTLINE, W: '#ffffff', H: g.hi, M: g.base, B: g.mid, D: g.dark, '0': OUTLINE
      }));
    }

    const medallions = {
      normal: bakeMedallion(mk, false),
      danger: bakeMedallion(mk, true)
    };

    assets = {
      panels: panels,
      buttons: buttons,
      hearts: hearts,
      coin: coin,
      shields: shields,
      ringGems: ringGems,
      ringSocket: ringSocket,
      bigGems: bigGems,
      medallions: medallions
    };
    return assets;
  }

  function ensureAssets() {
    return assets || init();
  }

  // ---------- 6. Crisp Tiled 9-Slice Renderer (Zero Corner Distortion, Zero Grain Stretching) ----------
  function drawTiled9Slice(ctx, img, x, y, w, h, slice) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    const iw = Math.max(2, Math.round(w));
    const ih = Math.max(2, Math.round(h));
    const sw = img.width;
    const sh = img.height;
    const sL = Math.min(slice, Math.floor(iw / 2));
    const sR = Math.min(slice, iw - sL);
    const sT = Math.min(slice, Math.floor(ih / 2));
    const sB = Math.min(slice, ih - sT);
    const srcMidW = Math.max(1, sw - slice * 2);
    const srcMidH = Math.max(1, sh - slice * 2);
    const dstMidW = Math.max(0, iw - sL - sR);
    const dstMidH = Math.max(0, ih - sT - sB);

    // 4 Corners (1:1 crisp, clamped only for ultra-tiny containers)
    ctx.drawImage(img, 0, 0, sL, sT, ix, iy, sL, sT);
    ctx.drawImage(img, sw - sR, 0, sR, sT, ix + iw - sR, iy, sR, sT);
    ctx.drawImage(img, 0, sh - sB, sL, sB, ix, iy + ih - sB, sL, sB);
    ctx.drawImage(img, sw - sR, sh - sB, sR, sB, ix + iw - sR, iy + ih - sB, sR, sB);

    // Top & Bottom edges (tiled horizontally)
    for (let dx = 0; dx < dstMidW; dx += srcMidW) {
      const tw = Math.min(srcMidW, dstMidW - dx);
      ctx.drawImage(img, slice, 0, tw, sT, ix + sL + dx, iy, tw, sT);
      ctx.drawImage(img, slice, sh - sB, tw, sB, ix + sL + dx, iy + ih - sB, tw, sB);
    }

    // Left & Right edges (tiled vertically)
    for (let dy = 0; dy < dstMidH; dy += srcMidH) {
      const th = Math.min(srcMidH, dstMidH - dy);
      ctx.drawImage(img, 0, slice, sL, th, ix, iy + sT + dy, sL, th);
      ctx.drawImage(img, sw - sR, slice, sR, th, ix + iw - sR, iy + sT + dy, sR, th);
    }

    // Center interior (2D tiled for razor-sharp wood/stone/parchment texture)
    for (let dy = 0; dy < dstMidH; dy += srcMidH) {
      const th = Math.min(srcMidH, dstMidH - dy);
      for (let dx = 0; dx < dstMidW; dx += srcMidW) {
        const tw = Math.min(srcMidW, dstMidW - dx);
        ctx.drawImage(img, slice, slice, tw, th, ix + sL + dx, iy + sT + dy, tw, th);
      }
    }
  }

  // Asymmetric-border tiled 9-slice renderer (ideal for buttons with top bevel & thick 3D bottom lip)
  function drawTiled9SliceVH(ctx, img, x, y, w, h, sX, sTop, sBot) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    const iw = Math.max(4, Math.round(w));
    const ih = Math.max(4, Math.round(h));
    const sw = img.width;
    const sh = img.height;
    const sL = Math.min(sX, Math.floor(iw / 2));
    const sR = Math.min(sX, iw - sL);
    const sT = Math.min(sTop, Math.floor(ih / 2));
    const sB = Math.min(sBot, ih - sT);
    const srcMidW = Math.max(1, sw - sX * 2);
    const srcMidH = Math.max(1, sh - sTop - sBot);
    const dstMidW = Math.max(0, iw - sL - sR);
    const dstMidH = Math.max(0, ih - sT - sB);

    ctx.drawImage(img, 0, 0, sL, sT, ix, iy, sL, sT);
    ctx.drawImage(img, sw - sR, 0, sR, sT, ix + iw - sR, iy, sR, sT);
    ctx.drawImage(img, 0, sh - sB, sL, sB, ix, iy + ih - sB, sL, sB);
    ctx.drawImage(img, sw - sR, sh - sB, sR, sB, ix + iw - sR, iy + ih - sB, sR, sB);

    for (let dx = 0; dx < dstMidW; dx += srcMidW) {
      const tw = Math.min(srcMidW, dstMidW - dx);
      ctx.drawImage(img, sX, 0, tw, sT, ix + sL + dx, iy, tw, sT);
      ctx.drawImage(img, sX, sh - sB, tw, sB, ix + sL + dx, iy + ih - sB, tw, sB);
    }
    for (let dy = 0; dy < dstMidH; dy += srcMidH) {
      const th = Math.min(srcMidH, dstMidH - dy);
      ctx.drawImage(img, 0, sTop, sL, th, ix, iy + sT + dy, sL, th);
      ctx.drawImage(img, sw - sR, sTop, sR, th, ix + iw - sR, iy + sT + dy, sR, th);
    }
    for (let dy = 0; dy < dstMidH; dy += srcMidH) {
      const th = Math.min(srcMidH, dstMidH - dy);
      for (let dx = 0; dx < dstMidW; dx += srcMidW) {
        const tw = Math.min(srcMidW, dstMidW - dx);
        ctx.drawImage(img, sX, sTop, tw, th, ix + sL + dx, iy + sT + dy, tw, th);
      }
    }
  }

  // Dedicated 3-slice horizontal tiled renderer for top beam bar (preserves crisp 6px bottom cornice)
  function drawTiledBar(ctx, img, x, y, w, h) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    const iw = Math.max(4, Math.round(w));
    const ih = Math.max(8, Math.round(h));
    const sw = img.width;
    const sh = img.height;
    const side = Math.min(12, Math.floor(iw / 2));
    const midSrcW = sw - 24;
    const midDstW = Math.max(0, iw - side * 2);
    const trimH = Math.min(6, Math.floor(ih / 2));
    const bodySrcH = sh - trimH;
    const bodyDstH = Math.max(0, ih - trimH);

    // Upper timber body (tiled vertically if ih > sh, cropped cleanly if ih < sh)
    for (let dy = 0; dy < bodyDstH; dy += bodySrcH) {
      const th = Math.min(bodySrcH, bodyDstH - dy);
      ctx.drawImage(img, 0, 0, side, th, ix, iy + dy, side, th);
      ctx.drawImage(img, sw - side, 0, side, th, ix + iw - side, iy + dy, side, th);
      for (let dx = 0; dx < midDstW; dx += midSrcW) {
        const tw = Math.min(midSrcW, midDstW - dx);
        ctx.drawImage(img, 12, 0, tw, th, ix + side + dx, iy + dy, tw, th);
      }
    }

    // Crisp 1:1 lower brass cornice
    const trimY = iy + ih - trimH;
    ctx.drawImage(img, 0, sh - trimH, side, trimH, ix, trimY, side, trimH);
    ctx.drawImage(img, sw - side, sh - trimH, side, trimH, ix + iw - side, trimY, side, trimH);
    for (let dx = 0; dx < midDstW; dx += midSrcW) {
      const tw = Math.min(midSrcW, midDstW - dx);
      ctx.drawImage(img, 12, sh - trimH, tw, trimH, ix + side + dx, trimY, tw, trimH);
    }
  }

  // ---------- 7. Exported Draw Functions (All 11 Interfaces) ----------

  function drawPanel(ctx, x, y, w, h, variant, opts) {
    const a = ensureAssets();
    const v = (variant && a.panels[variant]) ? variant : 'wood';
    const o = opts || {};

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (typeof o.alpha === 'number') ctx.globalAlpha *= o.alpha;

    const ix = Math.round(x);
    const iy = Math.round(y);
    const iw = Math.max(4, Math.round(w));
    const ih = Math.max(4, Math.round(h));

    // Crisp pixel drop-ledge for floating tooltip (hard pixel step, zero blur)
    if (v === 'tooltip') {
      ctx.fillStyle = 'rgba(8, 12, 14, 0.55)';
      ctx.fillRect(ix + 3, iy + ih, iw - 2, 2);
      ctx.fillRect(ix + iw, iy + 3, 2, ih - 1);
    }

    if (v === 'bar') {
      drawTiledBar(ctx, a.panels.bar, ix, iy, iw, ih);
    } else {
      const slice = (v === 'tooltip') ? 8 : 12;
      drawTiled9Slice(ctx, a.panels[v], ix, iy, iw, ih, slice);
    }

    // Accent color inlay trim & corner jewel studs
    if (o.accentColor && v !== 'bar') {
      const inset = (v === 'tooltip') ? 4 : 7;
      if (iw > inset * 2 + 4 && ih > inset * 2 + 4) {
        ctx.fillStyle = o.accentColor;
        ctx.globalAlpha *= 0.85;
        ctx.fillRect(ix + inset, iy + inset, iw - inset * 2, 1);
        ctx.fillRect(ix + inset, iy + ih - inset - 1, iw - inset * 2, 1);
        ctx.fillRect(ix + inset, iy + inset, 1, ih - inset * 2);
        ctx.fillRect(ix + iw - inset - 1, iy + inset, 1, ih - inset * 2);

        // Corner accent jewel dots
        const cOff = (v === 'tooltip') ? 2 : 4;
        ctx.globalAlpha = (typeof o.alpha === 'number') ? o.alpha : 1;
        ctx.fillRect(ix + cOff, iy + cOff, 2, 2);
        ctx.fillRect(ix + iw - cOff - 2, iy + cOff, 2, 2);
        ctx.fillRect(ix + cOff, iy + ih - cOff - 2, 2, 2);
        ctx.fillRect(ix + iw - cOff - 2, iy + ih - cOff - 2, 2, 2);
      }
    }

    // Highlight state: bright gold pixel corner ticks & upper catch line
    if (o.highlight && v !== 'bar') {
      const hiCol = o.accentColor || PALETTE.brass.hi;
      ctx.fillStyle = hiCol;
      ctx.fillRect(ix + 2, iy + 1, Math.max(0, iw - 4), 1);
      ctx.fillRect(ix + 1, iy + 2, 1, Math.min(10, ih - 4));
      ctx.fillRect(ix + iw - 2, iy + 2, 1, Math.min(10, ih - 4));
    }

    ctx.restore();
  }

  function drawButton(ctx, x, y, w, h, label, state) {
    const a = ensureAssets();
    const st = state || {};
    const variant = (st.variant && a.buttons[st.variant]) ? st.variant : 'primary';
    const enabled = (st.enabled !== false);
    const pressed = enabled && !!st.pressed;
    const hover = enabled && !pressed && !!st.hover;
    const stateName = !enabled ? 'disabled' : (pressed ? 'pressed' : (hover ? 'hover' : 'normal'));

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    const ix = Math.round(x);
    const iy = Math.round(y);
    const iw = Math.max(16, Math.round(w));
    const ih = Math.max(16, Math.round(h));

    drawTiled9SliceVH(ctx, a.buttons[variant][stateName], ix, iy, iw, ih, 8, 12, 10);

    // Label text with hard 1px pixel dark outline
    if (label !== undefined && label !== null && String(label).length > 0) {
      const text = String(label);
      const fontSize = Math.max(12, Math.round(st.fontSize || 13));
      const pal = enabled ? PALETTE.buttons[variant] : PALETTE.buttons.disabled;
      const tx = Math.round(ix + iw / 2);
      const ty = Math.round(iy + (ih - (pressed ? 0 : 2)) / 2 + (pressed ? 1 : 0));

      ctx.font = '700 ' + fontSize + 'px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Crisp 4-direction + drop pixel outline
      ctx.fillStyle = OUTLINE;
      ctx.fillText(text, tx - 1, ty);
      ctx.fillText(text, tx + 1, ty);
      ctx.fillText(text, tx, ty - 1);
      ctx.fillText(text, tx, ty + 1);
      ctx.fillText(text, tx, ty + 2);

      ctx.fillStyle = hover ? '#ffffff' : pal.text;
      ctx.fillText(text, tx, ty);
    }

    ctx.restore();
  }

  function drawHeart(ctx, cx, cy, size, fillState) {
    const a = ensureAssets();
    const s = Math.max(6, Math.round((size || 9) * 2));
    const sprite = (fillState >= 0.75) ? a.hearts.full : (fillState > 0.1 ? a.hearts.half : a.hearts.empty);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprite, Math.round(cx - s / 2), Math.round(cy - s / 2), s, s);
    ctx.restore();
  }

  function drawCoin(ctx, cx, cy, size) {
    const a = ensureAssets();
    const s = Math.max(6, Math.round((size || 8) * 2));

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(a.coin, Math.round(cx - s / 2), Math.round(cy - s / 2), s, s);
    ctx.restore();
  }

  function drawHpBar(ctx, cx, y, w, hp, maxHp, bar, barsTotal) {
    ensureAssets();
    const totalW = Math.max(40, Math.round(w || 100));
    const barH = 12;
    const bx = Math.round(cx - totalW / 2);
    const by = Math.round(y);
    const safeMax = Math.max(1, Number(maxHp) || 1);
    const safeHp = Math.max(0, Math.round(Number(hp) || 0));
    const ratio = Math.max(0, Math.min(1, safeHp / safeMax));
    const totalBars = Math.max(1, Math.round(Number(barsTotal) || 1));
    const curBar = Math.max(0, Math.round(Number(bar) || 0));
    const remainBars = Math.max(1, totalBars - curBar);

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // Stacked lower-bar backing ledge when multiple bars remain
    if (totalBars > 1 && remainBars > 1) {
      px(ctx, bx + 2, by + barH - 1, OUTLINE, totalW - 4, 4);
      px(ctx, bx + 3, by + barH, '#78261c', totalW - 6, 2);
      px(ctx, bx + 3, by + barH, '#b84b2c', totalW - 6, 1);
    }

    // Outer iron/bronze pixel bar frame
    px(ctx, bx + 1, by, OUTLINE, totalW - 2, barH);
    px(ctx, bx, by + 1, OUTLINE, totalW, barH - 2);
    px(ctx, bx + 1, by + 1, PALETTE.brass.base, totalW - 2, barH - 2);
    px(ctx, bx + 2, by + 1, PALETTE.brass.mid, totalW - 4, 1);
    px(ctx, bx + 2, by + barH - 2, PALETTE.brass.dark, totalW - 4, 1);

    // Recessed inner trough
    const tx = bx + 3;
    const ty = by + 2;
    const tw = totalW - 6;
    const th = barH - 4;
    px(ctx, tx, ty, '#181010', tw, th);
    px(ctx, tx, ty, '#0f0a0a', tw, 1);

    // Stepped pixel crimson HP fill
    const fillW = Math.round(tw * ratio);
    if (fillW > 0) {
      px(ctx, tx, ty, '#8f1b19', fillW, th);
      px(ctx, tx, ty, '#c92d27', fillW, Math.max(1, th - 2));
      px(ctx, tx, ty + 1, '#e8493c', fillW, Math.max(1, th - 4));
      // 1px bright top highlight
      px(ctx, tx, ty, '#ff9885', fillW, 1);
      // Bright leading edge cut
      if (fillW < tw) {
        px(ctx, tx + fillW - 1, ty, '#fff0c8', 1, th);
      }
    }

    // Subtle quarter tick notches
    for (let q = 1; q <= 3; q++) {
      const qx = tx + Math.round((tw * q) / 4);
      px(ctx, qx, ty, 'rgba(12,18,26,0.45)', 1, 2);
      px(ctx, qx, ty + th - 2, 'rgba(12,18,26,0.45)', 1, 2);
    }

    // Bronze decorative end-caps
    px(ctx, bx + 1, by + 2, PALETTE.brass.hi, 1, barH - 4);
    px(ctx, bx + totalW - 2, by + 2, PALETTE.brass.dark, 1, barH - 4);

    // Multi-bar crystal pips on left & remaining multiplier on right
    if (totalBars > 1) {
      const pipSize = 5;
      const pipStep = 7;
      for (let i = 0; i < totalBars; i++) {
        const pxX = bx + 2 + i * pipStep;
        const pxY = by - 8;
        const lit = i < remainBars;
        px(ctx, pxX, pxY, OUTLINE, pipSize, pipSize);
        if (lit) {
          px(ctx, pxX + 1, pxY + 1, '#e8493c', 3, 3);
          px(ctx, pxX + 1, pxY + 1, '#ffd480', 1, 1);
        } else {
          px(ctx, pxX + 1, pxY + 1, '#262e30', 3, 3);
        }
      }
      drawPixelNumber(ctx, '\u00d7' + remainBars, bx + totalW - 1, by - 6, {
        size: 10,
        color: '#ffd24a',
        align: 'right'
      });
    }

    // Pure numeric HP value perched cleanly above bar center
    drawPixelNumber(ctx, String(safeHp), cx, by - 7, {
      size: 11,
      color: '#fff6e8',
      align: 'center'
    });

    ctx.restore();
  }

  function drawShield(ctx, cx, y, shield, shieldMax, broken) {
    const a = ensureAssets();
    const cur = Array.isArray(shield) ? shield : [0, 0, 0];
    const maxArr = Array.isArray(shieldMax) ? shieldMax : [0, 0, 0];

    const groups = [];
    let totalSlots = 0;
    for (let ch = 0; ch < 3; ch++) {
      const m = Math.max(0, Math.round(Number(maxArr[ch]) || 0));
      const cVal = Math.max(0, Math.min(m, Math.round(Number(cur[ch]) || 0)));
      if (m > 0) {
        groups.push({ ch: ch, max: m, cur: cVal });
        totalSlots += m;
      }
    }

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    const pipW = 11;
    const pipH = 13;
    const gap = totalSlots > 9 ? 1 : 2;
    const groupGap = 4;
    const tagW = broken ? 36 : 0;
    const tagGap = (broken && totalSlots > 0) ? 5 : 0;

    let slotsW = 0;
    for (let g = 0; g < groups.length; g++) {
      slotsW += groups[g].max * pipW + (groups[g].max - 1) * gap;
      if (g > 0) slotsW += groupGap;
    }
    const totalW = slotsW + tagGap + tagW;
    let cursorX = Math.round(cx - totalW / 2);
    const sy = Math.round(y);

    for (let g = 0; g < groups.length; g++) {
      const grp = groups[g];
      if (g > 0) cursorX += groupGap;
      const pair = a.shields[grp.ch];
      for (let i = 0; i < grp.max; i++) {
        const isIntact = !broken && (i < grp.cur);
        ctx.drawImage(isIntact ? pair.intact : pair.broken, cursorX, sy, pipW, pipH);
        cursorX += pipW + gap;
      }
      cursorX -= gap;
    }

    if (broken) {
      const tx = cursorX + tagGap;
      const ty = sy;
      const th = 13;
      // Crisp cyan pixel "破盾" badge
      px(ctx, tx + 1, ty, OUTLINE, tagW - 2, th);
      px(ctx, tx, ty + 1, OUTLINE, tagW, th - 2);
      px(ctx, tx + 1, ty + 1, '#3fbac4', tagW - 2, th - 2);
      px(ctx, tx + 2, ty + 1, '#a2f4fa', tagW - 4, 1);
      px(ctx, tx + 2, ty + 2, '#152f36', tagW - 4, th - 4);

      ctx.font = '700 10px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = OUTLINE;
      ctx.fillText('破盾', tx + tagW / 2, ty + th / 2 + 1);
      ctx.fillStyle = '#bffbff';
      ctx.fillText('破盾', tx + tagW / 2, ty + th / 2);
    }

    ctx.restore();
  }

  function drawCountdown(ctx, cx, cy, n, t, danger) {
    const a = ensureAssets();
    const num = Math.max(0, Math.round(Number(n) || 0));
    const isDanger = !!danger || num <= 1;
    const time = Number(t) || 0;

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    const ix = Math.round(cx);
    const iy = Math.round(cy);

    // Pulsing concentric pixel ring for danger state (hard pixel step, zero blur)
    if (isDanger) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 7.5);
      const rOuter = Math.round(18 + pulse * 2);
      ctx.fillStyle = 'rgba(255, 224, 130, ' + (0.35 + pulse * 0.45).toFixed(2) + ')';
      // Crisp octagonal pixel pulse ring
      for (let ang = 0; ang < 16; ang++) {
        const rad = (ang * Math.PI) / 8;
        const rx = Math.round(ix + Math.cos(rad) * rOuter) - 1;
        const ry = Math.round(iy + Math.sin(rad) * rOuter) - 1;
        ctx.fillRect(rx, ry, 2, 2);
      }
      // Diagonal alert pixel ticks
      const tickD = rOuter + 1;
      ctx.fillStyle = '#fff3b0';
      ctx.fillRect(ix - tickD, iy - 1, 2, 2);
      ctx.fillRect(ix + tickD - 1, iy - 1, 2, 2);
      ctx.fillRect(ix - 1, iy - tickD, 2, 2);
      ctx.fillRect(ix - 1, iy + tickD - 1, 2, 2);
    }

    const med = isDanger ? a.medallions.danger : a.medallions.normal;
    ctx.drawImage(med, ix - 18, iy - 18, 36, 36);

    drawPixelNumber(ctx, String(num), ix, iy, {
      size: 16,
      color: isDanger ? '#fff2b0' : '#f7eed6',
      crit: isDanger,
      align: 'center'
    });

    ctx.restore();
  }

  function drawColorRing(ctx, cx, cy, r, collectedMask, cursor, t) {
    const a = ensureAssets();
    const mask = Number(collectedMask) | 0;
    const cur = (cursor === undefined || cursor === null) ? -1 : Math.round(Number(cursor));
    const time = Number(t) || 0;
    const rad = Math.max(18, Math.round(r || 30));
    const ix = Math.round(cx);
    const iy = Math.round(cy);

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // 1. Engraved Bronze Artifact Ring Base (pixel-stepped concentric rings)
    const drawPixelRing = (radius, thickness, col) => {
      ctx.fillStyle = col;
      const steps = Math.max(24, Math.round(radius * 4));
      for (let i = 0; i < steps; i++) {
        const ang = (i / steps) * Math.PI * 2;
        const rx = Math.round(ix + Math.cos(ang) * radius);
        const ry = Math.round(iy + Math.sin(ang) * radius);
        ctx.fillRect(rx - Math.floor(thickness / 2), ry - Math.floor(thickness / 2), thickness, thickness);
      }
    };

    // Dark recessed wheel plate
    drawPixelRing(rad + 4, 3, OUTLINE);
    drawPixelRing(rad + 2, 4, PALETTE.brass.dark);
    drawPixelRing(rad, 5, '#192220');
    drawPixelRing(rad + 2, 2, PALETTE.brass.mid);
    drawPixelRing(rad - 4, 2, PALETTE.brass.dark);
    drawPixelRing(rad - 5, 1, OUTLINE);

    // 6 Engraved bronze spoke ribs connecting outer ring to hub
    for (let i = 0; i < 6; i++) {
      const ang = -Math.PI / 2 + (i * Math.PI) / 3;
      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);
      for (let d = 7; d <= rad - 6; d += 2) {
        const sx = Math.round(ix + cosA * d);
        const sy = Math.round(iy + sinA * d);
        px(ctx, sx - 1, sy - 1, OUTLINE, 3, 3);
        px(ctx, sx, sy, PALETTE.brass.base, 1, 1);
      }
    }

    // Center hub mount
    px(ctx, ix - 8, iy - 6, OUTLINE, 16, 12);
    px(ctx, ix - 6, iy - 8, OUTLINE, 12, 16);
    px(ctx, ix - 7, iy - 7, PALETTE.brass.dark, 14, 14);
    px(ctx, ix - 6, iy - 6, PALETTE.brass.mid, 12, 12);
    ctx.drawImage(a.ringSocket, ix - 6, iy - 6, 12, 12);

    // Helper: draw rotating golden pixel selector bracket around target socket
    const drawSelector = (tx, ty) => {
      const pulse = Math.round(Math.sin(time * 6) * 0.8);
      const off = 8 + pulse;
      const col = '#fff2a8';
      const sub = PALETTE.brass.mid;
      const corners = [
        [-off, -off, 1, 1],
        [off - 1, -off, -1, 1],
        [-off, off - 1, 1, -1],
        [off - 1, off - 1, -1, -1]
      ];
      for (let cIdx = 0; cIdx < 4; cIdx++) {
        const [ox, oy, dx, dy] = corners[cIdx];
        const px0 = tx + ox;
        const py0 = ty + oy;
        px(ctx, px0 - 1, py0 - 1, OUTLINE, 4, 4);
        px(ctx, px0, py0, col, 2, 2);
        px(ctx, px0 + dx * 2, py0, OUTLINE, 2, 2);
        px(ctx, px0 + dx * 2, py0, sub, 1, 1);
        px(ctx, px0, py0 + dy * 2, OUTLINE, 2, 2);
        px(ctx, px0, py0 + dy * 2, sub, 1, 1);
      }
    };

    // 2. Six Color Sockets clockwise from top (0:R, 1:Y, 2:G, 3:C, 4:B, 5:P)
    let count = 0;
    for (let i = 0; i < 6; i++) {
      const ang = -Math.PI / 2 + (i * Math.PI) / 3;
      const sx = Math.round(ix + Math.cos(ang) * rad);
      const sy = Math.round(iy + Math.sin(ang) * rad);
      const collected = ((mask >> i) & 1) === 1;
      if (collected) count++;

      // Outer bronze socket rim
      px(ctx, sx - 7, sy - 5, OUTLINE, 14, 10);
      px(ctx, sx - 5, sy - 7, OUTLINE, 10, 14);
      px(ctx, sx - 6, sy - 6, PALETTE.brass.base, 12, 12);

      if (collected) {
        // Stepped bright aura pixel dots (hard pixel step, zero blur)
        ctx.fillStyle = PALETTE.ring[i].hi;
        ctx.globalAlpha = 0.7;
        ctx.fillRect(sx - 7, sy - 1, 1, 2);
        ctx.fillRect(sx + 6, sy - 1, 1, 2);
        ctx.fillRect(sx - 1, sy - 7, 2, 1);
        ctx.fillRect(sx - 1, sy + 6, 2, 1);
        ctx.globalAlpha = 1;
        ctx.drawImage(a.ringGems[i], sx - 6, sy - 6, 12, 12);
      } else {
        ctx.drawImage(a.ringSocket, sx - 6, sy - 6, 12, 12);
        // Subtle 2x2 color-hint inlay inside empty socket
        px(ctx, sx - 1, sy - 1, PALETTE.ring[i].dark, 2, 2);
      }

      if (cur === i) {
        drawSelector(sx, sy);
      }
    }

    // 3. Center White Crystal Core (lights up on cursor === 6 or full 6/6)
    if (cur === 6 || count === 6) {
      ctx.drawImage(a.ringGems[6], ix - 6, iy - 6, 12, 12);
      if (cur === 6) drawSelector(ix, iy);
    } else {
      // Dormant pale pearl center dot
      px(ctx, ix - 2, iy - 2, '#545b58', 4, 4);
      px(ctx, ix - 1, iy - 1, '#98a19c', 2, 2);
    }

    // 4. Compact Bottom Counter Plaque: "集色 X/6"
    const py = iy + rad + 16;
    const pw = 66;
    const ph = 15;
    const lx = Math.round(ix - pw / 2);
    px(ctx, lx + 1, py, OUTLINE, pw - 2, ph);
    px(ctx, lx, py + 1, OUTLINE, pw, ph - 2);
    px(ctx, lx + 1, py + 1, PALETTE.wood.mid, pw - 2, ph - 2);
    px(ctx, lx + 2, py + 1, PALETTE.brass.mid, pw - 4, 1);
    px(ctx, lx + 2, py + 2, PALETTE.wood.dark, pw - 4, ph - 4);

    ctx.font = '700 10px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labelStr = '集色 ' + count + '/6';
    ctx.fillStyle = OUTLINE;
    ctx.fillText(labelStr, ix, py + ph / 2 + 1);
    ctx.fillStyle = count === 6 ? '#ffe88a' : '#f2eadc';
    ctx.fillText(labelStr, ix, py + ph / 2);

    ctx.restore();
  }

  function drawGemLevelBar(ctx, x, y, w, channelIdx, level, exp, maxExp) {
    const a = ensureAssets();
    const ch = Math.max(0, Math.min(2, Math.round(Number(channelIdx) || 0)));
    const gemPal = PALETTE.gems[ch];
    const lvl = Math.max(1, Math.round(Number(level) || 1));
    const safeMax = Math.max(1, Math.round(Number(maxExp) || 1));
    const safeExp = Math.max(0, Math.round(Number(exp) || 0));
    const ratio = Math.max(0, Math.min(1, safeExp / safeMax));

    const ix = Math.round(x);
    const iy = Math.round(y);
    const iw = Math.max(60, Math.round(w || 104));

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // Left bezel mount + multifaceted primary pixel gem (16x16 footprint)
    px(ctx, ix, iy + 2, OUTLINE, 18, 14);
    px(ctx, ix + 2, iy, OUTLINE, 14, 18);
    px(ctx, ix + 1, iy + 1, PALETTE.brass.dark, 16, 16);
    px(ctx, ix + 2, iy + 2, '#151c1b', 14, 14);
    ctx.drawImage(a.bigGems[ch], ix + 2, iy + 2, 14, 14);

    // Right region: top row (level + exp/maxExp), bottom row (inlaid pixel bar)
    const rx = ix + 21;
    const rw = iw - 21;

    // Level tag (e.g. "2级")
    ctx.font = '700 10px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const lvlStr = lvl + '级';
    ctx.fillStyle = OUTLINE;
    ctx.fillText(lvlStr, rx + 1, iy + 5);
    ctx.fillText(lvlStr, rx, iy + 6);
    ctx.fillStyle = gemPal.hi;
    ctx.fillText(lvlStr, rx, iy + 5);

    // Compact exp fraction on right
    drawPixelNumber(ctx, safeExp + '/' + safeMax, ix + iw - 1, iy + 5, {
      size: 9,
      color: '#e8e0cf',
      align: 'right'
    });

    // Inlaid bronze/stone progress bar trough
    const barY = iy + 10;
    const barH = 8;
    px(ctx, rx + 1, barY, OUTLINE, rw - 2, barH);
    px(ctx, rx, barY + 1, OUTLINE, rw, barH - 2);
    px(ctx, rx + 1, barY + 1, PALETTE.brass.dark, rw - 2, barH - 2);
    px(ctx, rx + 2, barY + 2, '#131918', rw - 4, barH - 4);

    const innerW = rw - 4;
    const fillW = Math.round(innerW * ratio);
    if (fillW > 0) {
      px(ctx, rx + 2, barY + 2, gemPal.dark, fillW, 4);
      px(ctx, rx + 2, barY + 2, gemPal.mid, fillW, 3);
      px(ctx, rx + 2, barY + 2, gemPal.base, fillW, 2);
      px(ctx, rx + 2, barY + 2, gemPal.hi, fillW, 1);
      if (fillW < innerW) {
        px(ctx, rx + 1 + fillW, barY + 2, '#ffffff', 1, 4);
      }
    }

    ctx.restore();
  }

  // ---------- 8. Handcrafted Bitmap Pixel Numbers ----------
  const CRIT_GRAD = ['#fffbe0', '#ffe87a', '#ffc636', '#ff9c1f', '#f26a18', '#d93e16', '#a82214'];
  const RAINBOW_COLS = ['#ff594d', '#ffd645', '#57d95c', '#48dde6', '#5c94ff', '#b86eff', '#f7f3e8'];

  function drawPixelNumber(ctx, str, x, y, opts) {
    ensureAssets();
    const o = opts || {};
    const text = String(str === undefined || str === null ? '' : str);
    if (!text.length) return;

    const size = Math.max(7, Number(o.size) || 16);
    const p = Math.max(1, Math.round((size / 7) * 2) / 2);
    const gap = p;
    const align = o.align || 'left';
    const isCrit = !!o.crit;
    const isRainbow = !!o.rainbow;
    const strokeCol = o.strokeColor || (isCrit ? '#1a0808' : OUTLINE);
    const baseColor = o.color || '#ffffff';

    // Collect glyph entries and measure total width
    const items = [];
    let totalW = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const g = FONT_GLYPHS[ch] || FONT_GLYPHS[' '];
      items.push({ ch: ch, g: g });
      totalW += g.w * p;
      if (i < text.length - 1) totalW += gap;
    }

    let startX = x;
    if (align === 'center') startX = x - totalW / 2;
    else if (align === 'right') startX = x - totalW;
    startX = Math.round(startX * 2) / 2;
    const startY = Math.round((y - (7 * p) / 2) * 2) / 2;

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    const hiColor = shiftColor(baseColor, 0.35);
    const loColor = shiftColor(baseColor, -0.22);

    // Pass 1: Hard pixel outlines + drop thickness
    let cxPos = startX;
    ctx.fillStyle = strokeCol;
    for (let i = 0; i < items.length; i++) {
      const g = items[i].g;
      const outlines = g.outlines;
      for (let j = 0; j < outlines.length; j++) {
        ctx.fillRect(cxPos + outlines[j][0] * p, startY + outlines[j][1] * p, p, p);
      }
      const drops = g.drops;
      for (let j = 0; j < drops.length; j++) {
        ctx.fillRect(cxPos + drops[j][0] * p, startY + drops[j][1] * p, p, p);
      }
      cxPos += g.w * p + gap;
    }

    // Pass 2: Shaded pixel glyph faces
    cxPos = startX;
    let colorIdx = 0;
    for (let i = 0; i < items.length; i++) {
      const ch = items[i].ch;
      const g = items[i].g;
      let rBase = baseColor;
      let rHi = hiColor;
      let rLo = loColor;

      if (isRainbow && ch !== ' ') {
        rBase = RAINBOW_COLS[colorIdx % RAINBOW_COLS.length];
        rHi = shiftColor(rBase, 0.42);
        rLo = shiftColor(rBase, -0.25);
        colorIdx++;
      }

      const fills = g.fills;
      for (let j = 0; j < fills.length; j++) {
        const fx = fills[j][0];
        const fy = fills[j][1];
        if (isCrit) {
          ctx.fillStyle = CRIT_GRAD[Math.min(6, Math.max(0, fy))];
        } else if (fy <= 1) {
          ctx.fillStyle = rHi;
        } else if (fy >= 5) {
          ctx.fillStyle = rLo;
        } else {
          ctx.fillStyle = rBase;
        }
        ctx.fillRect(cxPos + fx * p, startY + fy * p, p, p);
      }

      cxPos += g.w * p + gap;
    }

    ctx.restore();
  }

  // ---------- 9. Global Registration ----------
  root.Code00ArtPacks = root.Code00ArtPacks || {};
  root.Code00ArtPacks.uiSkin = {
    id: 'uiSkin',
    version: 1,
    name: '复古奇幻精绘像素皮肤',
    init: init,
    drawPanel: drawPanel,
    drawButton: drawButton,
    drawHeart: drawHeart,
    drawCoin: drawCoin,
    drawHpBar: drawHpBar,
    drawShield: drawShield,
    drawCountdown: drawCountdown,
    drawColorRing: drawColorRing,
    drawGemLevelBar: drawGemLevelBar,
    drawPixelNumber: drawPixelNumber
  };
})(typeof window !== 'undefined' ? window : globalThis);

(function () {
  'use strict';

  const CARD_W = 62, CARD_H = 88, ART_W = 48, ART_H = 46, SLOT_W = 54, SLOT_H = 76;
  const INK = '#0c121a';
  const RGB_PALS = [
    { mid: '#ff5a4a', hi: '#ffb8ae', lo: '#a62218' },
    { mid: '#52d65a', hi: '#b8ffb8', lo: '#1d7828' },
    { mid: '#5a8cff', hi: '#bcd6ff', lo: '#2046a6' }
  ];

  // 七色宝石参数表（0红 1黄 2绿 3青 4蓝 5紫 6白）
  const GEM_SPECS = [
    { id: 0, rgb: [1, 0, 0], mid: '#e2483c', lo: '#8e1f18', hi: '#ff9e8e', sp: '#fff2ee', bgA: '#2a1214', bgB: '#1d0c0e', wm: '#471d20' },
    { id: 1, rgb: [1, 1, 0], mid: '#efc93f', lo: '#9a7a10', hi: '#fff6b0', sp: '#ffffff', bgA: '#2a2210', bgB: '#1d170b', wm: '#483a1a' },
    { id: 2, rgb: [0, 1, 0], mid: '#4cb050', lo: '#1f6a24', hi: '#a6f2a0', sp: '#ecffea', bgA: '#112616', bgB: '#0c1b10', wm: '#1d4024' },
    { id: 3, rgb: [0, 1, 1], mid: '#3fbac4', lo: '#14727c', hi: '#aef6fa', sp: '#f0ffff', bgA: '#10262a', bgB: '#0b1b1e', wm: '#1a3f46' },
    { id: 4, rgb: [0, 0, 1], mid: '#4474dd', lo: '#1f3f9a', hi: '#9cc4ff', sp: '#eef6ff', bgA: '#121b30', bgB: '#0c1322', wm: '#1e2e52' },
    { id: 5, rgb: [1, 0, 1], mid: '#9254cf', lo: '#561e8c', hi: '#dfb0ff', sp: '#faf0ff', bgA: '#221330', bgB: '#170d22', wm: '#3b2052' },
    { id: 6, rgb: [1, 1, 1], mid: '#f4f0e6', lo: '#9a9684', hi: '#ffffff', sp: '#ffffff', bgA: '#26272c', bgB: '#1b1c21', wm: '#3e4048' }
  ];

  const INSTANT_IDS = ['spring', 'ward', 'shatter', 'surge', 'resonance'];
  const CHAIN_IDS = ['refract', 'prism', 'keep'];
  const CHAIN_DEFAULT_COLOR = { refract: 6, prism: 0, keep: 3 };
  const ARCANA_NAMES = {
    spring: '涌泉抽牌', ward: '护身结界', shatter: '震裂破甲', surge: '魔力沸腾',
    resonance: '双色共鸣', refract: '逆色折射', prism: '倍增棱镜', keep: '凝色留存'
  };
  const CARVE_FALLBACK = {
    sharp:  { bg: '#d44838', bd: '#ff9e8e', ch: '锐' },
    pierce: { bg: '#3296c8', bd: '#9ce6ff', ch: '穿' },
    heavy:  { bg: '#c88a24', bd: '#ffe498', ch: '重' },
    echo:   { bg: '#884ec8', bd: '#dbb4ff', ch: '回' },
    guard:  { bg: '#2c9674', bd: '#96f2d4', ch: '护' },
    drain:  { bg: '#a83058', bd: '#ff9ec0', ch: '吸' }
  };

  const HEX_CACHE = Object.create(null);
  function parseHex(col) {
    let hit = HEX_CACHE[col];
    if (hit) return hit;
    const h = col.charCodeAt(0) === 35 ? col.slice(1) : col;
    const n = parseInt(h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h, 16);
    hit = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    HEX_CACHE[col] = hit;
    return hit;
  }

  // 纯整数像素缓冲：零抗锯齿毛边，输出高锐度复古像素离屏贴图
  function createBuf(w, h) {
    const data = new Uint8ClampedArray(w * h * 4);
    const buf = {
      w, h, data,
      px(x, y, col, a) {
        const ix = x | 0, iy = y | 0;
        if (ix < 0 || ix >= w || iy < 0 || iy >= h) return;
        const idx = (iy * w + ix) << 2;
        if (col === null) { data[idx + 3] = 0; return; }
        const rgb = parseHex(col), alpha = a === undefined ? 255 : a;
        if (alpha >= 255 || data[idx + 3] === 0) {
          data[idx] = rgb[0]; data[idx + 1] = rgb[1]; data[idx + 2] = rgb[2]; data[idx + 3] = alpha;
        } else {
          const t = alpha / 255, inv = 1 - t;
          data[idx] = (rgb[0] * t + data[idx] * inv) | 0;
          data[idx + 1] = (rgb[1] * t + data[idx + 1] * inv) | 0;
          data[idx + 2] = (rgb[2] * t + data[idx + 2] * inv) | 0;
          data[idx + 3] = Math.min(255, data[idx + 3] + alpha);
        }
      },
      rect(x, y, rw, rh, col, a) {
        const x0 = Math.max(0, x | 0), y0 = Math.max(0, y | 0);
        const x1 = Math.min(w, (x + rw) | 0), y1 = Math.min(h, (y + rh) | 0);
        for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) buf.px(xx, yy, col, a);
      },
      dither(x, y, rw, rh, colA, colB, sparse) {
        const x0 = Math.max(0, x | 0), y0 = Math.max(0, y | 0);
        const x1 = Math.min(w, (x + rw) | 0), y1 = Math.min(h, (y + rh) | 0);
        for (let yy = y0; yy < y1; yy++) {
          for (let xx = x0; xx < x1; xx++) {
            const pick = sparse ? (((xx & 1) === 0) && ((yy & 1) === 0)) : (((xx + yy) & 1) === 1);
            buf.px(xx, yy, pick ? colB : colA);
          }
        }
      },
      box(x, y, rw, rh, col) {
        buf.rect(x, y, rw, 1, col); buf.rect(x, y + rh - 1, rw, 1, col);
        buf.rect(x, y, 1, rh, col); buf.rect(x + rw - 1, y, 1, rh, col);
      },
      line(x0, y0, x1, y1, col, thick) {
        let ax = Math.round(x0), ay = Math.round(y0);
        const bx = Math.round(x1), by = Math.round(y1);
        const dx = Math.abs(bx - ax), sx = ax < bx ? 1 : -1;
        const dy = -Math.abs(by - ay), sy = ay < by ? 1 : -1;
        let err = dx + dy;
        while (true) {
          buf.px(ax, ay, col);
          if (thick) { buf.px(ax + 1, ay, col); buf.px(ax, ay + 1, col); }
          if (ax === bx && ay === by) break;
          const e2 = err << 1;
          if (e2 >= dy) { err += dy; ax += sx; }
          if (e2 <= dx) { err += dx; ay += sy; }
        }
      },
      circ(cx, cy, rx, ry, col, dCol) {
        const x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx);
        const y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
        const irx = rx * rx, iry = ry * ry;
        for (let yy = y0; yy <= y1; yy++) {
          const dy = yy - cy;
          for (let xx = x0; xx <= x1; xx++) {
            const dx = xx - cx;
            if ((dx * dx) / irx + (dy * dy) / iry <= 1.02) {
              buf.px(xx, yy, dCol && ((xx + yy) & 1) ? dCol : col);
            }
          }
        }
      },
      poly(pts, col, dCol) {
        const n = pts.length;
        if (n < 3) return;
        let minY = h, maxY = -1;
        for (let i = 0; i < n; i++) {
          if (pts[i][1] < minY) minY = pts[i][1];
          if (pts[i][1] > maxY) maxY = pts[i][1];
        }
        const yStart = Math.max(0, Math.floor(minY)), yEnd = Math.min(h - 1, Math.ceil(maxY));
        const xs = [];
        for (let y = yStart; y <= yEnd; y++) {
          xs.length = 0;
          const sy = y + 0.15;
          for (let i = 0, j = n - 1; i < n; j = i++) {
            const y0 = pts[j][1], y1 = pts[i][1];
            if ((y0 <= sy && y1 > sy) || (y1 <= sy && y0 > sy)) {
              xs.push(pts[j][0] + ((sy - y0) * (pts[i][0] - pts[j][0])) / (y1 - y0));
            }
          }
          xs.sort((a, b) => a - b);
          for (let i = 0; i + 1 < xs.length; i += 2) {
            const lx = Math.max(0, Math.round(xs[i])), rx = Math.min(w - 1, Math.round(xs[i + 1]));
            for (let x = lx; x <= rx; x++) buf.px(x, y, dCol && ((x + y) & 1) ? dCol : col);
          }
        }
        for (let i = 0; i < n; i++) {
          const p0 = pts[i], p1 = pts[(i + 1) % n];
          buf.line(p0[0], p0[1], p1[0], p1[1], col);
        }
      },
      outline(col) {
        const mask = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) mask[i] = data[(i << 2) + 3] > 0 ? 1 : 0;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const p = y * w + x;
            if (mask[p]) continue;
            if ((x > 0 && mask[p - 1]) || (x + 1 < w && mask[p + 1]) ||
                (y > 0 && mask[p - w]) || (y + 1 < h && mask[p + w])) buf.px(x, y, col);
          }
        }
      },
      blit(src, ox, oy) {
        const sw = src.w, sh = src.h, sd = src.data;
        for (let y = 0; y < sh; y++) {
          const dy = y + oy;
          if (dy < 0 || dy >= h) continue;
          for (let x = 0; x < sw; x++) {
            const dx = x + ox;
            if (dx < 0 || dx >= w) continue;
            const si = (y * sw + x) << 2, sa = sd[si + 3];
            if (sa === 0) continue;
            const di = (dy * w + dx) << 2;
            if (sa >= 255 || data[di + 3] === 0) {
              data[di] = sd[si]; data[di + 1] = sd[si + 1]; data[di + 2] = sd[si + 2]; data[di + 3] = sa;
            } else {
              const t = sa / 255, inv = 1 - t;
              data[di] = (sd[si] * t + data[di] * inv) | 0;
              data[di + 1] = (sd[si + 1] * t + data[di + 1] * inv) | 0;
              data[di + 2] = (sd[si + 2] * t + data[di + 2] * inv) | 0;
              data[di + 3] = Math.min(255, data[di + 3] + sa);
            }
          }
        }
      },
      toCanvas(mk) {
        const cv = mk(w, h), c = cv.getContext('2d'), img = c.createImageData(w, h);
        img.data.set(data);
        c.putImageData(img, 0, 0);
        return cv;
      }
    };
    return buf;
  }

  // 通用像素卡牌金属框架与暗纹内腔
  function drawCardChassis(buf, th) {
    const W = CARD_W, H = CARD_H;
    buf.rect(1, 1, W - 2, H - 2, th.mid);
    buf.rect(2, 1, W - 4, 1, th.hi); buf.rect(1, 2, 1, H - 4, th.hi);
    buf.rect(2, H - 2, W - 4, 1, th.lo); buf.rect(W - 2, 2, 1, H - 4, th.lo);
    buf.box(2, 2, W - 4, H - 4, th.mid); buf.box(3, 3, W - 6, H - 6, th.lo);
    buf.rect(3, 3, W - 6, 1, th.hi); buf.rect(3, 3, 1, H - 6, th.hi);

    // 2px 切角硬朗黑边
    buf.rect(2, 0, W - 4, 1, INK); buf.rect(2, H - 1, W - 4, 1, INK);
    buf.rect(0, 2, 1, H - 4, INK); buf.rect(W - 1, 2, 1, H - 4, INK);
    [[1, 1], [W - 2, 1], [1, H - 2], [W - 2, H - 2]].forEach(([x, y]) => buf.px(x, y, INK));
    [[0, 0], [1, 0], [0, 1], [W - 1, 0], [W - 2, 0], [W - 1, 1],
     [0, H - 1], [1, H - 1], [0, H - 2], [W - 1, H - 1], [W - 2, H - 1], [W - 1, H - 2]].forEach(([x, y]) => buf.px(x, y, null));

    buf.box(4, 4, W - 8, H - 8, INK);
    buf.dither(5, 5, W - 10, H - 10, th.bgA, th.bgB, false);
    // 中央暗纹菱格
    buf.line(31, 21, 51, 42, th.wm); buf.line(51, 42, 31, 63, th.wm);
    buf.line(31, 63, 11, 42, th.wm); buf.line(11, 42, 31, 21, th.wm);
    buf.box(7, 18, W - 14, 49, th.wm);

    [[3, 3], [W - 4, 3], [3, H - 4], [W - 4, H - 4]].forEach(([x, y]) => buf.px(x, y, th.rivet));
    if (th.ornate) {
      [[5, 5, 1, 1], [W - 6, 5, -1, 1], [5, H - 6, 1, -1], [W - 6, H - 6, -1, -1]].forEach(([cx, cy, dx, dy]) => {
        buf.px(cx, cy, th.hi); buf.px(cx + dx, cy, th.mid); buf.px(cx, cy + dy, th.mid);
        buf.px(cx + dx * 2, cy, th.lo); buf.px(cx, cy + dy * 2, th.lo);
      });
    }
    // 底部铭牌/雕琢槽
    buf.rect(5, 68, W - 10, 1, INK);
    buf.dither(5, 69, W - 10, 13, th.plaqueA || '#141922', th.plaqueB || '#1b222e', true);
    buf.rect(6, 81, W - 12, 1, th.lo);
    buf.px(7, 75, th.rivet); buf.px(W - 8, 75, th.rivet);
  }

  // 顶部三原色晶孔槽
  function drawRgbSockets(buf, rgb, barCol, trimCol) {
    buf.rect(5, 5, CARD_W - 10, 11, barCol);
    buf.rect(5, 16, CARD_W - 10, 1, INK);
    buf.rect(5, 5, CARD_W - 10, 1, trimCol);
    buf.px(8, 10, trimCol); buf.px(CARD_W - 9, 10, trimCol);
    const xs = [18, 31, 44];
    for (let i = 0; i < 3; i++) {
      const cx = xs[i], cy = 10;
      buf.circ(cx, cy, 4.1, 4.1, INK);
      buf.circ(cx, cy, 3.1, 3.1, trimCol);
      if (rgb[i]) {
        const p = RGB_PALS[i];
        buf.circ(cx, cy, 2.5, 2.5, p.lo);
        buf.circ(cx, cy, 2.0, 2.0, p.mid);
        buf.px(cx - 1, cy - 1, p.hi); buf.px(cx, cy - 1, p.hi); buf.px(cx - 1, cy, '#ffffff');
      } else {
        buf.circ(cx, cy, 2.3, 2.3, '#131820');
        buf.px(cx + 1, cy + 1, '#2a3342');
      }
    }
  }

  // 瞬发秘术顶部菱形徽记
  function drawInstantCrest(buf) {
    buf.rect(5, 5, CARD_W - 10, 11, '#251e48');
    buf.rect(5, 16, CARD_W - 10, 1, INK);
    buf.rect(5, 5, CARD_W - 10, 1, '#8c7ee0');
    buf.rect(10, 10, 13, 2, '#6a5ab8'); buf.rect(11, 10, 11, 1, '#b8aef5');
    buf.rect(39, 10, 13, 2, '#6a5ab8'); buf.rect(40, 10, 11, 1, '#b8aef5');
    buf.poly([[31, 5], [37, 10], [31, 15], [25, 10]], INK);
    buf.poly([[31, 6], [35, 10], [31, 14], [27, 10]], '#9e92ea');
    buf.poly([[31, 7], [33, 10], [31, 13], [29, 10]], '#e8e4ff');
    buf.px(30, 9, '#ffffff');
  }

  // 七色独立切面像素宝石牌
  function buildGemCard(spec, mk) {
    const buf = createBuf(CARD_W, CARD_H);
    drawCardChassis(buf, {
      mid: '#7a7668', hi: '#c2b99e', lo: '#3f3d36', rivet: '#e8c868',
      bgA: spec.bgA, bgB: spec.bgB, wm: spec.wm, plaqueA: '#131820', plaqueB: '#1b222c'
    });
    drawRgbSockets(buf, spec.rgb, '#262b34', '#586070');
    buf.rect(26, 75, 10, 2, spec.lo);
    buf.rect(28, 75, 6, 1, spec.mid);

    const g = createBuf(CARD_W, CARD_H);
    const { mid, lo, hi, sp } = spec;
    if (spec.id === 0) {
      // 0 红：竖长红曜菱尖晶
      g.poly([[31, 19], [44, 43], [31, 66], [18, 43]], mid);
      g.poly([[31, 19], [31, 29], [24, 43], [18, 43]], hi);
      g.poly([[18, 43], [24, 43], [31, 56], [31, 66]], mid, lo);
      g.poly([[44, 43], [31, 66], [31, 56], [38, 43]], lo);
      g.poly([[31, 29], [38, 43], [31, 56], [24, 43]], mid);
      g.poly([[31, 29], [31, 43], [24, 43]], hi, mid);
      g.line(31, 29, 38, 43, lo); g.line(27, 36, 30, 30, sp); g.px(29, 24, sp);
    } else if (spec.id === 1) {
      // 1 黄：宽面琥珀八角盾晶
      g.poly([[21, 23], [41, 23], [48, 31], [48, 51], [40, 62], [22, 62], [14, 51], [14, 31]], mid);
      g.poly([[21, 23], [41, 23], [37, 30], [25, 30]], hi);
      g.poly([[21, 23], [25, 30], [21, 36], [14, 31]], hi);
      g.poly([[48, 31], [48, 51], [41, 49], [41, 36]], lo);
      g.poly([[14, 51], [21, 49], [25, 55], [22, 62]], mid, lo);
      g.poly([[48, 51], [40, 62], [22, 62], [25, 55], [37, 55], [41, 49]], lo);
      g.poly([[25, 30], [37, 30], [41, 36], [41, 49], [37, 55], [25, 55], [21, 49], [21, 36]], mid);
      g.poly([[25, 30], [35, 30], [21, 44], [21, 36]], hi, mid);
      g.line(24, 32, 33, 32, sp); g.line(23, 34, 23, 41, sp);
    } else if (spec.id === 2) {
      // 2 绿：祖母绿长方阶梯切面晶
      g.poly([[20, 21], [42, 21], [46, 25], [46, 60], [42, 64], [20, 64], [16, 60], [16, 25]], mid);
      g.poly([[20, 21], [42, 21], [39, 25], [23, 25]], hi);
      g.poly([[16, 25], [20, 21], [23, 25], [20, 28], [20, 57], [16, 60]], hi);
      g.poly([[46, 25], [46, 60], [42, 64], [39, 59], [42, 56], [42, 28]], lo);
      g.poly([[16, 60], [20, 64], [42, 64], [39, 59], [23, 59]], lo);
      g.rect(21, 27, 20, 31, lo); g.rect(22, 28, 18, 29, mid);
      g.rect(22, 28, 17, 2, hi); g.rect(22, 28, 2, 28, hi);
      g.dither(25, 32, 12, 21, mid, hi, true); g.box(25, 32, 12, 21, lo);
      g.rect(25, 32, 11, 1, sp); g.rect(25, 32, 1, 11, sp); g.rect(27, 35, 3, 2, sp);
    } else if (spec.id === 3) {
      // 3 青：碧海泪滴尖顶晶
      g.poly([[31, 19], [39, 33], [46, 46], [45, 56], [39, 63], [31, 65], [23, 63], [17, 56], [16, 46], [23, 33]], mid);
      g.poly([[31, 19], [31, 34], [24, 45], [16, 46], [23, 33]], hi);
      g.poly([[16, 46], [24, 45], [27, 57], [23, 63], [17, 56]], mid, lo);
      g.poly([[46, 46], [45, 56], [39, 63], [31, 65], [23, 63], [27, 57], [35, 57], [38, 45]], lo);
      g.poly([[31, 30], [38, 45], [35, 57], [27, 57], [24, 45]], mid);
      g.poly([[31, 30], [31, 46], [24, 45]], hi, mid);
      g.line(28, 27, 23, 41, sp); g.px(23, 45, sp); g.px(25, 49, hi);
    } else if (spec.id === 4) {
      // 4 蓝：深蓝风筝盾钻
      g.poly([[22, 22], [40, 22], [47, 33], [31, 66], [15, 33]], mid);
      g.poly([[22, 22], [40, 22], [37, 29], [25, 29]], hi);
      g.poly([[22, 22], [25, 29], [21, 35], [15, 33]], hi);
      g.poly([[47, 33], [31, 66], [31, 54], [41, 35]], lo);
      g.poly([[25, 29], [31, 29], [31, 54], [21, 35]], hi, mid);
      g.poly([[31, 29], [37, 29], [41, 35], [31, 54]], mid, lo);
      g.line(31, 29, 31, 64, lo); g.line(24, 24, 34, 24, sp); g.line(23, 34, 29, 46, sp);
    } else if (spec.id === 5) {
      // 5 紫：紫晶主尖 + 两侧小晶簇
      g.poly([[13, 35], [22, 39], [26, 59], [19, 60], [15, 44]], mid);
      g.poly([[13, 35], [19, 41], [21, 59], [19, 60], [15, 44]], hi);
      g.poly([[19, 41], [22, 39], [26, 59], [21, 59]], lo);
      g.poly([[49, 37], [46, 46], [42, 60], [36, 58], [41, 41]], lo);
      g.poly([[49, 37], [43, 44], [36, 58], [41, 41]], mid);
      g.poly([[31, 19], [39, 31], [38, 61], [31, 65], [24, 61], [23, 31]], mid);
      g.poly([[31, 19], [28, 32], [28, 60], [24, 61], [23, 31]], hi);
      g.poly([[31, 19], [39, 31], [38, 61], [34, 62], [34, 32]], lo);
      g.line(28, 32, 28, 56, sp); g.line(31, 21, 28, 31, sp); g.px(16, 39, sp); g.px(45, 41, hi);
    } else {
      // 6 白：百搭六角棱白晶核（带微红绿蓝切边）
      g.poly([[31, 20], [46, 31], [46, 54], [31, 65], [16, 54], [16, 31]], mid);
      g.poly([[31, 20], [31, 28], [23, 34], [16, 31]], '#ff9e94', '#ffffff');
      g.poly([[31, 20], [46, 31], [39, 34], [31, 28]], '#ffffff');
      g.poly([[16, 31], [23, 34], [23, 51], [16, 54]], '#9cf0a2', '#f4f0e6');
      g.poly([[46, 31], [46, 54], [39, 51], [39, 34]], '#9cc4ff', '#dce8ff');
      g.poly([[16, 54], [23, 51], [31, 57], [31, 65]], '#ccc8ba');
      g.poly([[46, 54], [31, 65], [31, 57], [39, 51]], lo);
      g.poly([[31, 28], [39, 34], [39, 51], [31, 57], [23, 51], [23, 34]], mid);
      g.poly([[31, 28], [39, 34], [23, 51], [23, 34]], sp);
      g.line(31, 35, 31, 48, '#e8e2d4'); g.line(26, 42, 36, 42, '#e8e2d4');
      g.line(31, 35, 31, 47, sp); g.line(27, 41, 35, 41, sp);
    }
    g.outline(INK);
    buf.blit(g, 0, 0);
    return buf.toCanvas(mk);
  }

  // 5 张瞬发秘术牌（银紫深框 + 顶沿菱形瞬发徽记）
  function buildInstantArcana(id, mk) {
    const buf = createBuf(CARD_W, CARD_H);
    drawCardChassis(buf, {
      mid: '#6a5ab8', hi: '#b4a8f2', lo: '#342a68', rivet: '#e8e2ff',
      bgA: '#1a1632', bgB: '#120f24', wm: '#2d2654', plaqueA: '#141028', plaqueB: '#1e183b', ornate: true
    });
    drawInstantCrest(buf);

    const art = createBuf(CARD_W, CARD_H);
    if (id === 'spring') {
      // 涌泉抽牌：石盆涌泉 + 飞出两张卡牌
      art.poly([[17, 55], [45, 55], [41, 63], [21, 63]], '#526070');
      art.rect(18, 55, 26, 2, '#96a8ba'); art.rect(20, 61, 22, 2, '#2b3440');
      art.poly([[27, 55], [35, 55], [37, 36], [31, 29], [25, 36]], '#36a8d8');
      art.poly([[29, 55], [33, 55], [34, 37], [31, 31], [28, 37]], '#a8f2ff');
      art.line(31, 32, 31, 52, '#ffffff');
      art.poly([[25, 38], [18, 43], [16, 50], [21, 47], [26, 44]], '#58c8ec');
      art.poly([[37, 38], [44, 43], [46, 50], [41, 47], [36, 44]], '#58c8ec');
      art.poly([[12, 25], [22, 22], [26, 35], [16, 38]], '#fff3cc');
      art.line(13, 26, 21, 23, '#e0b248'); art.line(16, 30, 21, 29, '#5a8cff');
      art.poly([[39, 21], [49, 25], [44, 38], [34, 34]], '#fff3cc');
      art.line(40, 22, 48, 26, '#e0b248'); art.line(39, 29, 44, 31, '#52d65a');
      art.px(31, 24, '#ffffff'); art.px(27, 26, '#a8f2ff'); art.px(35, 27, '#a8f2ff');
    } else if (id === 'ward') {
      // 护身结界：青白六边形晶盾结界
      art.poly([[31, 21], [47, 30], [47, 52], [31, 62], [15, 52], [15, 30]], '#1a6878');
      art.poly([[31, 21], [31, 26], [20, 33], [20, 49], [15, 52], [15, 30]], '#aef6fa');
      art.poly([[31, 21], [47, 30], [42, 33], [31, 26]], '#6ee2ea');
      art.poly([[31, 26], [42, 33], [42, 49], [31, 57], [20, 49], [20, 33]], '#173e4c', '#1f5262');
      art.line(31, 26, 31, 57, '#4cd4de'); art.line(20, 33, 42, 49, '#4cd4de'); art.line(42, 33, 20, 49, '#4cd4de');
      art.poly([[31, 34], [37, 41], [31, 49], [25, 41]], '#aef6fa');
      art.poly([[31, 36], [34, 41], [31, 46], [28, 41]], '#ffffff');
      art.px(31, 19, '#ffffff'); art.px(49, 29, '#aef6fa'); art.px(13, 29, '#aef6fa');
    } else if (id === 'shatter') {
      // 震裂破甲：斜裂铁盾 + 晶锥击碎
      art.poly([[14, 34], [25, 43], [28, 52], [29, 62], [16, 54]], '#5e6b78');
      art.poly([[16, 37], [23, 44], [26, 58], [18, 52]], '#8a9aa8', '#5e6b78');
      art.poly([[23, 27], [46, 27], [46, 47], [36, 57], [33, 46], [29, 36]], '#4a5662');
      art.poly([[26, 29], [44, 29], [44, 45], [37, 52], [35, 44], [31, 35]], '#788896', '#4a5662');
      art.rect(25, 27, 20, 2, '#c89b3c');
      art.line(24, 38, 33, 55, '#ffe066', true);
      art.px(31, 46, '#ffffff'); art.px(45, 53, '#ff9e8e'); art.px(19, 60, '#a8b8c8'); art.px(41, 22, '#ffe066');
      art.poly([[12, 20], [22, 23], [35, 43], [19, 30]], '#e2483c');
      art.poly([[13, 21], [21, 24], [33, 41], [21, 28]], '#ff9e8e');
      art.line(14, 22, 32, 40, '#ffffff');
    } else if (id === 'surge') {
      // 魔力沸腾：橘红金白晶焰向上翻涌
      art.poly([[31, 21], [38, 32], [44, 28], [46, 44], [42, 58], [31, 63], [20, 58], [16, 44], [18, 29], [24, 34]], '#c83220');
      art.poly([[31, 27], [37, 38], [41, 36], [42, 48], [38, 58], [31, 61], [24, 58], [20, 48], [21, 36], [25, 39]], '#f57c28');
      art.poly([[31, 34], [37, 45], [35, 56], [31, 59], [27, 56], [25, 45]], '#ffe058');
      art.poly([[31, 41], [34, 49], [31, 56], [28, 49]], '#ffffff');
      // 上涌火粒
      art.rect(20, 22, 2, 2, '#ffe058'); art.rect(41, 21, 2, 2, '#ff8e3c'); art.rect(31, 18, 2, 2, '#ffffff');
      art.px(15, 34, '#ff7a28'); art.px(47, 36, '#ffe058');
    } else {
      // resonance 双色共鸣：暖红与冷青双节点弧线共振
      const topArc = [[19, 38], [23, 28], [31, 24], [39, 28], [43, 38]];
      const botArc = [[19, 48], [23, 57], [31, 60], [39, 57], [43, 48]];
      for (let i = 0; i < 4; i++) {
        art.line(topArc[i][0], topArc[i][1], topArc[i + 1][0], topArc[i + 1][1], i < 2 ? '#ff9e64' : '#7ae8ff', true);
        art.line(botArc[i][0], botArc[i][1], botArc[i + 1][0], botArc[i + 1][1], i < 2 ? '#7ae8ff' : '#ff9e64', true);
      }
      art.line(23, 43, 39, 43, '#ffe888', true);
      art.circ(18, 43, 6.2, 6.2, '#8e1f18'); art.circ(18, 43, 4.8, 4.8, '#ff5a4a'); art.circ(17, 42, 2.4, 2.4, '#ffe066'); art.px(16, 41, '#ffffff');
      art.circ(44, 43, 6.2, 6.2, '#1a428a'); art.circ(44, 43, 4.8, 4.8, '#46b8e8'); art.circ(43, 42, 2.4, 2.4, '#b8f8ff'); art.px(42, 41, '#ffffff');
      art.poly([[31, 37], [36, 43], [31, 49], [26, 43]], '#ffe480');
      art.poly([[31, 39], [33, 43], [31, 47], [29, 43]], '#ffffff');
    }
    art.outline(INK);
    buf.blit(art, 0, 0);
    return buf.toCanvas(mk);
  }

  // 入链秘术暖金带色底牌（支持任意 color 0..6）
  function buildChainBase(spec, mk) {
    const buf = createBuf(CARD_W, CARD_H);
    drawCardChassis(buf, {
      mid: '#d8a83e', hi: '#fff0a6', lo: '#7d5410', rivet: '#fff6c4',
      bgA: spec.bgA, bgB: spec.bgB, wm: spec.wm, plaqueA: '#1d160b', plaqueB: '#2b2010', ornate: true
    });
    drawRgbSockets(buf, spec.rgb, '#362712', '#c89834');
    return buf.toCanvas(mk);
  }

  // 3 张入链秘术透明中心插画层（48×46）
  function buildChainArt(id, mk) {
    const art = createBuf(ART_W, ART_H);
    if (id === 'refract') {
      // 逆色折射：白晶棱柱折出补色双芒
      art.line(2, 16, 17, 22, '#fff4cc', true); art.line(2, 16, 17, 22, '#ffffff');
      art.line(29, 21, 45, 11, '#ff5a4a', true); art.line(29, 20, 45, 10, '#ffb4a8');
      art.line(29, 26, 45, 35, '#3fe0ea', true); art.line(29, 25, 45, 34, '#b8ffff');
      art.poly([[24, 7], [36, 36], [12, 36]], '#dce8f6');
      art.poly([[24, 7], [24, 36], [12, 36]], '#ffffff');
      art.poly([[24, 7], [36, 36], [28, 36]], '#98aec8');
      art.line(18, 22, 29, 21, '#ffe498'); art.line(18, 23, 29, 25, '#aef6fa');
      art.px(45, 10, '#ffffff'); art.px(45, 34, '#ffffff');
    } else if (id === 'prism') {
      // 倍增棱镜：嵌套双菱镜 + 像素 ×2
      art.poly([[24, 2], [44, 22], [24, 42], [4, 22]], '#d8a83e');
      art.poly([[24, 2], [24, 7], [9, 22], [4, 22]], '#fff4b0');
      art.poly([[44, 22], [24, 42], [24, 37], [39, 22]], '#7d5410');
      art.poly([[24, 7], [39, 22], [24, 37], [9, 22]], '#aef6fa');
      art.poly([[24, 10], [36, 22], [24, 34], [12, 22]], '#182438', '#22334e');
      art.line(15, 22, 24, 13, '#5278a0');
      const X_G = ['10001', '01010', '00100', '01010', '10001'];
      const TWO_G = ['01110', '10001', '00010', '00100', '01000', '11111'];
      for (let r = 0; r < X_G.length; r++) for (let c = 0; c < 5; c++) if (X_G[r][c] === '1') {
        art.px(16 + c, 21 + r, INK); art.px(16 + c, 20 + r, '#ffe888');
      }
      for (let r = 0; r < TWO_G.length; r++) for (let c = 0; c < 5; c++) if (TWO_G[r][c] === '1') {
        art.px(25 + c, 20 + r, INK); art.px(25 + c, 19 + r, '#ffffff');
      }
    } else {
      // keep 凝色留存：黄铜沙漏封存稳固宝石
      art.rect(12, 4, 24, 4, '#d8a83e'); art.rect(13, 4, 22, 1, '#fff4b0');
      art.rect(12, 38, 24, 4, '#a6761c'); art.rect(13, 38, 22, 1, '#f2cc64');
      art.rect(14, 8, 2, 30, '#b88626'); art.rect(32, 8, 2, 30, '#8a5f14');
      art.poly([[16, 8], [32, 8], [30, 17], [25, 22], [23, 22], [18, 17]], '#325a6a', '#44768a');
      art.poly([[23, 23], [25, 23], [30, 29], [32, 38], [16, 38], [18, 29]], '#284c5c', '#3c6a7e');
      art.line(18, 10, 20, 16, '#b8f4ff'); art.line(18, 35, 20, 29, '#b8f4ff');
      art.poly([[24, 24], [29, 30], [24, 36], [19, 30]], '#efc93f');
      art.poly([[24, 24], [24, 30], [19, 30]], '#fff6b0');
      art.poly([[29, 30], [24, 36], [24, 30]], '#a87810');
      art.px(22, 28, '#ffffff');
      art.poly([[20, 15], [28, 15], [24, 20]], '#e8bc44'); art.px(24, 22, '#fff4b0');
    }
    art.outline(INK);
    return art.toCanvas(mk);
  }

  // 缠藤废牌（破旧枯木 + 暗绿棘藤，无宝石孔）
  function buildJunkCard(mk) {
    const buf = createBuf(CARD_W, CARD_H), W = CARD_W, H = CARD_H;
    buf.dither(2, 2, W - 4, H - 4, '#5a3f28', '#4a321e', false);
    for (let x = 14; x < W - 8; x += 14) { buf.rect(x, 3, 1, H - 6, '#362314'); buf.rect(x + 1, 3, 1, H - 6, '#6e4f34'); }
    buf.line(12, 16, 28, 42, '#24160c'); buf.line(28, 42, 24, 58, '#24160c'); buf.line(48, 28, 38, 46, '#24160c');
    buf.box(1, 1, W - 2, H - 2, '#3d2817'); buf.box(2, 2, W - 4, H - 4, '#725236'); buf.box(0, 0, W, H, INK);
    [[1, 1], [W - 2, 1], [1, H - 2], [W - 2, H - 2], [W - 3, 22], [2, 61]].forEach(([x, y]) => buf.px(x, y, INK));
    [[0, 0], [1, 0], [0, 1], [W - 1, 0], [W - 2, 0], [0, H - 1], [W - 1, H - 1], [W - 1, 22], [W - 2, 22], [0, 61], [1, 61]].forEach(([x, y]) => buf.px(x, y, null));
    [[5, 6], [56, 6], [5, 81], [56, 81]].forEach(([x, y]) => { buf.rect(x, y, 2, 2, '#241a16'); buf.px(x, y, '#8c5a44'); });

    const v = createBuf(W, H);
    const vines = [[[4, 18], [18, 26], [34, 24], [57, 36]], [[57, 14], [40, 32], [24, 48], [5, 62]], [[6, 50], [26, 56], [42, 66], [56, 76]]];
    vines.forEach(pts => {
      for (let j = 0; j < pts.length - 1; j++) {
        v.line(pts[j][0], pts[j][1], pts[j + 1][0], pts[j + 1][1], '#1c421a', true);
        v.line(pts[j][0], pts[j][1] - 1, pts[j + 1][0], pts[j + 1][1] - 1, '#3d7432');
      }
    });
    [[16, 23], [32, 21], [46, 30], [36, 37], [22, 46], [16, 55], [38, 63], [48, 70]].forEach(([tx, ty]) => {
      v.line(tx, ty, tx + 2, ty - 3, '#6e9444'); v.px(tx + 2, ty - 3, '#a64234');
    });
    [[24, 28], [44, 24], [15, 42], [44, 58], [26, 68]].forEach(([lx, ly]) => {
      v.poly([[lx, ly], [lx + 5, ly - 2], [lx + 3, ly + 3]], '#3b7230'); v.px(lx + 2, ly, '#6ca64c');
    });
    v.outline(INK);
    buf.blit(v, 0, 0);
    return buf.toCanvas(mk);
  }

  // 被遮蔽石板牌（青苔暗石板 + 浮雕 ?）
  function buildMaskedCard(mk) {
    const buf = createBuf(CARD_W, CARD_H);
    drawCardChassis(buf, {
      mid: '#525e66', hi: '#82909a', lo: '#2b333a', rivet: '#70808a',
      bgA: '#363f46', bgB: '#2d353c', wm: '#444f58', plaqueA: '#1d242a', plaqueB: '#252e36'
    });
    buf.line(8, 12, 16, 22, '#22282e'); buf.line(16, 22, 14, 30, '#22282e'); buf.line(52, 50, 44, 58, '#22282e');
    [[7, 6, 10, 6], [6, 11, 6, 8], [15, 6, 6, 4], [46, 56, 9, 10], [42, 62, 7, 5]].forEach(([mx, my, mw, mh]) => {
      buf.dither(mx, my, mw, mh, '#3b662c', '#5c8c42', false);
    });
    const Q = ['001111100', '011111110', '111000111', '110000011', '000000111', '000011110',
               '000111000', '000110000', '000110000', '000000000', '000110000', '000110000'];
    for (let r = 0; r < Q.length; r++) for (let c = 0; c < Q[r].length; c++) if (Q[r][c] === '1') {
      buf.rect(23 + c * 2, 22 + r * 3, 2, 3, '#182026');
      buf.rect(22 + c * 2, 21 + r * 3, 2, 3, '#8c9ca6');
      buf.px(22 + c * 2, 21 + r * 3, '#ccd8e0');
    }
    return buf.toCanvas(mk);
  }

  // 常规牌背（深靛蓝木纹 + 黄铜四角饰 + 六色罗盘暗纹）
  function buildCardBack(mk) {
    const buf = createBuf(CARD_W, CARD_H);
    drawCardChassis(buf, {
      mid: '#c4963a', hi: '#f4d87c', lo: '#704d12', rivet: '#fff0a8',
      bgA: '#1d294a', bgB: '#151e38', wm: '#263662', ornate: true
    });
    buf.dither(5, 5, CARD_W - 10, CARD_H - 10, '#1d294a', '#16203c', false);
    for (let x = 11; x < CARD_W - 8; x += 8) buf.rect(x, 6, 1, CARD_H - 12, '#121a30');
    buf.box(7, 7, CARD_W - 14, CARD_H - 14, '#8c641c');
    buf.box(8, 8, CARD_W - 16, CARD_H - 16, '#d8aa46');
    [[6, 6, 1, 1], [55, 6, -1, 1], [6, 81, 1, -1], [55, 81, -1, -1]].forEach(([bx, by, dx, dy]) => {
      for (let k = 0; k < 8; k++) {
        buf.px(bx + dx * k, by, '#f4d87c'); buf.px(bx + dx * k, by + dy, '#a6761c');
        buf.px(bx, by + dy * k, '#f4d87c'); buf.px(bx + dx, by + dy * k, '#a6761c');
      }
    });
    const cx = 31, cy = 44;
    buf.circ(cx, cy, 17, 17, '#101628'); buf.circ(cx, cy, 15.5, 15.5, '#b88a2e');
    buf.circ(cx, cy, 13.5, 13.5, '#192342', '#131b34');
    buf.poly([[cx, cy - 13], [cx + 3, cy], [cx, cy + 13], [cx - 3, cy]], '#d8aa46');
    buf.poly([[cx - 13, cy], [cx, cy - 3], [cx + 13, cy], [cx, cy + 3]], '#b88a2e');
    buf.line(cx - 8, cy - 8, cx + 8, cy + 8, '#7d5a1c'); buf.line(cx + 8, cy - 8, cx - 8, cy + 8, '#7d5a1c');
    const sixCols = ['#e2483c', '#efc93f', '#4cb050', '#3fbac4', '#4474dd', '#9254cf'];
    for (let i = 0; i < 6; i++) {
      const ang = (i * Math.PI) / 3 - Math.PI / 2;
      const px = Math.round(cx + Math.cos(ang) * 14.5), py = Math.round(cy + Math.sin(ang) * 14.5);
      buf.circ(px, py, 2.5, 2.5, INK); buf.circ(px, py, 1.6, 1.6, sixCols[i]);
    }
    buf.circ(cx, cy, 3.2, 3.2, INK); buf.circ(cx, cy, 2.2, 2.2, '#fff4cc');
    return buf.toCanvas(mk);
  }

  // 石刻法阵镶嵌施法链槽
  function buildChainSlot(filled, mk) {
    const buf = createBuf(SLOT_W, SLOT_H), W = SLOT_W, H = SLOT_H;
    buf.dither(1, 1, W - 2, H - 2, '#343e46', '#283038', false);
    buf.rect(2, 1, W - 4, 1, '#586670'); buf.rect(1, 2, 1, H - 4, '#586670');
    buf.rect(2, H - 2, W - 4, 1, '#1a2026'); buf.rect(W - 2, 2, 1, H - 4, '#1a2026');
    buf.box(0, 0, W, H, INK);
    [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]].forEach(([x, y]) => buf.px(x, y, null));
    [[1, 1], [W - 2, 1], [1, H - 2], [W - 2, H - 2]].forEach(([x, y]) => buf.px(x, y, INK));

    buf.box(4, 4, W - 8, H - 8, INK);
    buf.dither(5, 5, W - 10, H - 10, filled ? '#1c2624' : '#161c22', filled ? '#151e1c' : '#11161c', false);
    buf.rect(5, 5, W - 10, 1, INK); buf.rect(5, 5, 1, H - 10, INK);
    buf.rect(6, H - 6, W - 12, 1, '#3c4852'); buf.rect(W - 6, 6, 1, H - 12, '#3c4852');

    const cx = (W / 2) | 0, cy = (H / 2) | 0;
    const runeCol = filled ? '#c89b3c' : '#36444e', runeDim = filled ? '#4e8a5c' : '#252f38';
    const oct = [];
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + Math.PI / 8;
      oct.push([Math.round(cx + Math.cos(a) * 15), Math.round(cy + Math.sin(a) * 15)]);
    }
    for (let i = 0; i < 8; i++) buf.line(oct[i][0], oct[i][1], oct[(i + 1) % 8][0], oct[(i + 1) % 8][1], runeCol);
    buf.line(cx, cy - 10, cx + 10, cy, runeDim); buf.line(cx + 10, cy, cx, cy + 10, runeDim);
    buf.line(cx, cy + 10, cx - 10, cy, runeDim); buf.line(cx - 10, cy, cx, cy - 10, runeDim);
    buf.rect(cx - 1, 7, 2, 4, runeCol); buf.rect(cx - 1, H - 11, 2, 4, runeCol);
    buf.rect(7, cy - 1, 4, 2, runeCol); buf.rect(W - 11, cy - 1, 4, 2, runeCol);
    [[3, 3], [W - 4, 3], [3, H - 4], [W - 4, H - 4]].forEach(([x, y]) => buf.px(x, y, filled ? '#f2d272' : '#6c7c88'));
    if (filled) { buf.circ(cx, cy, 3.2, 3.2, '#f2d272'); buf.circ(cx, cy, 1.8, 1.8, '#8ef096'); }
    else buf.circ(cx, cy, 2.4, 2.4, '#2a353e');
    return buf.toCanvas(mk);
  }

  let ready = false;
  let assets = null;
  const root = typeof window !== 'undefined' ? window : globalThis;
  root.Code00ArtPacks = root.Code00ArtPacks || {};
  const target = root.Code00ArtPacks.cards = root.Code00ArtPacks.cards || {};

  function defaultMakeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function initCards(makeCanvas) {
    const mk = typeof makeCanvas === 'function' ? makeCanvas : defaultMakeCanvas;
    const gems = [], chainBase = [];
    for (let i = 0; i < 7; i++) {
      gems.push(buildGemCard(GEM_SPECS[i], mk));
      chainBase.push(buildChainBase(GEM_SPECS[i], mk));
    }
    const instant = Object.create(null);
    INSTANT_IDS.forEach(id => { instant[id] = buildInstantArcana(id, mk); });
    const chainArt = Object.create(null);
    CHAIN_IDS.forEach(id => { chainArt[id] = buildChainArt(id, mk); });
    assets = {
      gems, instant, chainBase, chainArt,
      junk: buildJunkCard(mk),
      masked: buildMaskedCard(mk),
      back: buildCardBack(mk),
      slotEmpty: buildChainSlot(false, mk),
      slotFilled: buildChainSlot(true, mk)
    };
    ready = true;
    return assets;
  }

  function ensureInit() { if (!ready) initCards(defaultMakeCanvas); }

  function drawFallbackCarveBadge(ctx, cid, x, y) {
    const info = CARVE_FALLBACK[cid] || { bg: '#5a6676', bd: '#b8c4d4', ch: String(cid || '纹').slice(0, 1).toUpperCase() };
    const s = 11, hx = Math.round(x - s / 2), hy = Math.round(y - s / 2);
    ctx.fillStyle = INK; ctx.fillRect(hx - 1, hy - 1, s + 2, s + 2);
    ctx.fillStyle = info.bg; ctx.fillRect(hx, hy, s, s);
    ctx.fillStyle = info.bd; ctx.fillRect(hx, hy, s, 1); ctx.fillRect(hx, hy, 1, s);
    ctx.font = '700 8px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = INK; ctx.fillText(info.ch, x, y + 1);
    ctx.fillStyle = '#ffffff'; ctx.fillText(info.ch, x, y);
  }

  // 四态像素高亮框（near / comp / wild / break）
  function drawFrameHighlight(ctx, frame, t) {
    const hw = CARD_W / 2, hh = CARD_H / 2;
    const x = -hw - 2, y = -hh - 2, w = CARD_W + 4, h = CARD_H + 4, phase = t || 0;
    if (frame === 'near') {
      ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);
      ctx.strokeStyle = '#56e068'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = '#d4ffd8';
      ctx.fillRect(x - 1, y - 1, 5, 2); ctx.fillRect(x - 1, y - 1, 2, 5);
      ctx.fillRect(x + w - 4, y - 1, 5, 2); ctx.fillRect(x + w - 1, y - 1, 2, 5);
      ctx.fillRect(x - 1, y + h - 1, 5, 2); ctx.fillRect(x - 1, y + h - 4, 2, 5);
      ctx.fillRect(x + w - 4, y + h - 1, 5, 2); ctx.fillRect(x + w - 1, y + h - 4, 2, 5);
    } else if (frame === 'comp') {
      const pulse = 0.72 + 0.28 * Math.sin(phase * 5);
      ctx.strokeStyle = INK; ctx.lineWidth = 3.5; ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
      ctx.strokeStyle = '#ffe878'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,' + pulse.toFixed(2) + ')';
      ctx.lineWidth = 1; ctx.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
      // 四角菱芒闪点
      ctx.fillStyle = '#ffffff';
      [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([px, py]) => {
        ctx.fillRect(px - 2, py - 0.5, 4, 1.5); ctx.fillRect(px - 0.5, py - 2, 1.5, 4);
      });
    } else if (frame === 'wild') {
      const segs = ['#ff5a4a', '#efc93f', '#52d65a', '#3fbac4', '#5a8cff', '#b46eff'];
      let idx = Math.floor(phase * 4) % 6;
      ctx.strokeStyle = INK; ctx.lineWidth = 3.5; ctx.strokeRect(x, y, w, h);
      for (let px = x; px < x + w; px += 10) {
        const sw = Math.min(10, x + w - px);
        ctx.fillStyle = segs[idx++ % 6]; ctx.fillRect(px, y - 1, sw, 2);
        ctx.fillStyle = segs[(idx + 2) % 6]; ctx.fillRect(px, y + h - 1, sw, 2);
      }
      for (let py = y; py < y + h; py += 10) {
        const sh = Math.min(10, y + h - py);
        ctx.fillStyle = segs[idx++ % 6]; ctx.fillRect(x - 1, py, 2, sh);
        ctx.fillStyle = segs[(idx + 2) % 6]; ctx.fillRect(x + w - 1, py, 2, sh);
      }
    } else if (frame === 'break') {
      const len = 10;
      const brks = [
        [x - 1, y - 1, len, 2], [x - 1, y - 1, 2, len],
        [x + w - len + 1, y - 1, len, 2], [x + w - 1, y - 1, 2, len],
        [x - 1, y + h - 1, len, 2], [x - 1, y + h - len + 1, 2, len],
        [x + w - len + 1, y + h - 1, len, 2], [x + w - 1, y + h - len + 1, 2, len]
      ];
      ctx.fillStyle = INK;
      brks.forEach(b => ctx.fillRect(b[0] - 1, b[1] - 1, b[2] + 2, b[3] + 2));
      ctx.fillStyle = '#e0483c';
      brks.forEach(b => ctx.fillRect(b[0], b[1], b[2], b[3]));
    }
  }

  // 施法亮边（分层像素块 + 巡游晶芒，零模糊）
  function drawLitAura(ctx, t) {
    const hw = CARD_W / 2, hh = CARD_H / 2, p = 0.65 + 0.35 * Math.sin((t || 0) * 6);
    ctx.strokeStyle = 'rgba(255,224,112,' + (0.38 * p).toFixed(2) + ')';
    ctx.lineWidth = 4; ctx.strokeRect(-hw - 3, -hh - 3, CARD_W + 6, CARD_H + 6);
    ctx.strokeStyle = '#fff4b0'; ctx.lineWidth = 1.6;
    ctx.strokeRect(-hw - 1.5, -hh - 1.5, CARD_W + 3, CARD_H + 3);
    const perim = (CARD_W + CARD_H) * 2;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 4; i++) {
      const d = (((t || 0) * 48 + i * (perim / 4)) % perim + perim) % perim;
      let sx, sy;
      if (d < CARD_W) { sx = -hw + d; sy = -hh - 2; }
      else if (d < CARD_W + CARD_H) { sx = hw + 2; sy = -hh + (d - CARD_W); }
      else if (d < CARD_W * 2 + CARD_H) { sx = hw - (d - CARD_W - CARD_H); sy = hh + 2; }
      else { sx = -hw - 2; sy = hh - (d - CARD_W * 2 - CARD_H); }
      ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3);
    }
  }

  function drawTopTag(ctx, text, color) {
    const fg = color || '#ffe498';
    ctx.font = '700 9px "PingFang SC", "Microsoft YaHei", sans-serif';
    const tw = Math.max(24, Math.ceil(ctx.measureText(text).width) + 10), th = 14;
    const tx = Math.round(-tw / 2), ty = -CARD_H / 2 - 9;
    ctx.fillStyle = INK; ctx.fillRect(tx - 1, ty - 1, tw + 2, th + 2);
    ctx.fillStyle = '#121820'; ctx.fillRect(tx, ty, tw, th);
    ctx.strokeStyle = fg; ctx.lineWidth = 1; ctx.strokeRect(tx + 0.5, ty + 0.5, tw - 1, th - 1);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = fg; ctx.fillText(text, 0, ty + th / 2 + 0.5);
  }

  function drawPlateText(ctx, text, color) {
    const py = CARD_H / 2 - 12.5;
    ctx.font = '700 9.5px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = INK; ctx.fillText(text, 0, py + 1);
    ctx.fillStyle = color; ctx.fillText(text, 0, py);
  }

  function drawCard(ctx, card, opts) {
    ensureInit();
    const c = card || {}, o = opts || {}, hw = CARD_W / 2, hh = CARD_H / 2;
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    if (o.masked) {
      ctx.drawImage(assets.masked, -hw, -hh, CARD_W, CARD_H);
      drawPlateText(ctx, '已遮蔽', '#c6d4dc');
    } else if (c.junk) {
      ctx.drawImage(assets.junk, -hw, -hh, CARD_W, CARD_H);
    } else if (c.arcana && assets.instant[c.arcana]) {
      ctx.drawImage(assets.instant[c.arcana], -hw, -hh, CARD_W, CARD_H);
      drawPlateText(ctx, ARCANA_NAMES[c.arcana] || c.arcana, '#f2ecff');
    } else if (c.arcana && assets.chainArt[c.arcana]) {
      const colIdx = (typeof c.color === 'number' && c.color >= 0 && c.color < 7)
        ? c.color : (CHAIN_DEFAULT_COLOR[c.arcana] || 0);
      ctx.drawImage(assets.chainBase[colIdx], -hw, -hh, CARD_W, CARD_H);
      ctx.drawImage(assets.chainArt[c.arcana], -hw + 7, -hh + 19, ART_W, ART_H);
      drawPlateText(ctx, ARCANA_NAMES[c.arcana] || c.arcana, '#fff2c2');
    } else {
      const colIdx = (typeof c.color === 'number' && c.color >= 0 && c.color < 7) ? c.color : 0;
      ctx.drawImage(assets.gems[colIdx], -hw, -hh, CARD_W, CARD_H);
    }

    if (!o.masked && !c.junk && Array.isArray(c.carve) && c.carve.length > 0) {
      const n = Math.min(c.carve.length, 3), gap = 14, startX = -((n - 1) * gap) / 2, by = hh - 12.5;
      for (let i = 0; i < n; i++) {
        const bx = startX + i * gap;
        if (typeof target.drawCarveBadge === 'function') target.drawCarveBadge(ctx, c.carve[i], bx, by, 12);
        else drawFallbackCarveBadge(ctx, c.carve[i], bx, by);
      }
    }

    if (o.dim) { ctx.fillStyle = 'rgba(10,14,18,0.44)'; ctx.fillRect(-hw + 1, -hh + 1, CARD_W - 2, CARD_H - 2); }
    if (o.frame) drawFrameHighlight(ctx, o.frame, o.t);
    if (o.lit) drawLitAura(ctx, o.t);
    if (o.tag) drawTopTag(ctx, String(o.tag), o.tagColor);
    ctx.restore();
  }

  function drawCardBack(ctx, x, y, scale) {
    ensureInit();
    const sc = scale === undefined ? 1 : scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sc, sc);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(assets.back, -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H);
    ctx.restore();
  }

  function drawChainSlot(ctx, x, y, w, h, state) {
    ensureInit();
    const st = state || {}, sw = w || SLOT_W, sh = h || SLOT_H, hw = sw / 2, hh = sh / 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(st.filled ? assets.slotFilled : assets.slotEmpty, -hw, -hh, sw, sh);

    if (typeof st.index === 'number') {
      ctx.font = '700 8px "PingFang SC", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = st.isNext ? '#ffe888' : (st.filled ? '#c8a654' : '#586874');
      ctx.fillText(String(st.index + 1), 0, hh - 8);
    }

    if (st.isNext) {
      const pad = st.dragging ? 3 : 2, len = Math.max(8, Math.round(sw * 0.22));
      const bx = -hw - pad, by = -hh - pad, bw = sw + pad * 2, bh = sh + pad * 2;
      ctx.strokeStyle = 'rgba(255,224,102,0.55)'; ctx.lineWidth = 1;
      ctx.strokeRect(-hw + 3.5, -hh + 3.5, sw - 7, sh - 7);
      const segs = [
        [bx, by, len, 2.5], [bx, by, 2.5, len],
        [bx + bw - len, by, len, 2.5], [bx + bw - 2.5, by, 2.5, len],
        [bx, by + bh - 2.5, len, 2.5], [bx, by + bh - len, 2.5, len],
        [bx + bw - len, by + bh - 2.5, len, 2.5], [bx + bw - 2.5, by + bh - len, 2.5, len]
      ];
      ctx.fillStyle = INK;
      segs.forEach(s => ctx.fillRect(s[0] - 1, s[1] - 1, s[2] + 2, s[3] + 2));
      ctx.fillStyle = '#ffd858';
      segs.forEach(s => ctx.fillRect(s[0], s[1], s[2], s[3]));
      ctx.fillStyle = '#fff8c8';
      ctx.fillRect(bx, by, 3, 1); ctx.fillRect(bx + bw - 3, by, 3, 1);
      ctx.fillRect(bx, by + bh - 2.5, 3, 1); ctx.fillRect(bx + bw - 3, by + bh - 2.5, 3, 1);
    }
    ctx.restore();
  }

  Object.assign(target, {
    id: 'cards',
    version: 1,
    cardsName: '七色宝石与秘术卡牌',
    CARD_W,
    CARD_H,
    init: initCards,
    initCards,
    drawCard,
    drawCardBack,
    drawChainSlot
  });
})();

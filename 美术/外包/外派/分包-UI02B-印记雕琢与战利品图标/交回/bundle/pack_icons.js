// UI-02B 像素印记、雕琢与战利品图标包
// 合并挂载至 window.Code00ArtPacks.cards，与卡牌包 UI-02A 完全解耦
(function () {
  'use strict';

  const SIZE = 24;
  const INK_C = '#151926';
  const INK_W = '#241610';

  const cache = {
    ready: false,
    seals: Object.create(null),
    loots: Object.create(null),
    carves: Object.create(null)
  };

  function defaultMakeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  // 轻量 24x24 整数像素缓冲 + 自动 1px 外框（不依赖 getImageData）
  function createGrid(s) {
    const buf = new Array(s * s).fill(null);

    function p(x, y, col) {
      const ix = Math.round(x), iy = Math.round(y);
      if (ix >= 0 && ix < s && iy >= 0 && iy < s) buf[iy * s + ix] = col;
    }

    function r(x, y, w, h, col) {
      const x0 = Math.round(x), y0 = Math.round(y);
      const x1 = x0 + Math.round(w), y1 = y0 + Math.round(h);
      for (let yy = y0; yy < y1; yy++) {
        if (yy < 0 || yy >= s) continue;
        const row = yy * s;
        for (let xx = x0; xx < x1; xx++) {
          if (xx >= 0 && xx < s) buf[row + xx] = col;
        }
      }
    }

    function line(x0, y0, x1, y1, col, thick) {
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = Math.round(x0 + (x1 - x0) * t);
        const y = Math.round(y0 + (y1 - y0) * t);
        p(x, y, col);
        if (thick) { p(x + 1, y, col); p(x, y + 1, col); }
      }
    }

    function circ(cx, cy, rad, col) {
      const r2 = rad * rad;
      const x0 = Math.max(0, Math.floor(cx - rad - 1));
      const x1 = Math.min(s - 1, Math.ceil(cx + rad + 1));
      const y0 = Math.max(0, Math.floor(cy - rad - 1));
      const y1 = Math.min(s - 1, Math.ceil(cy + rad + 1));
      for (let y = y0; y <= y1; y++) {
        const dy = y - cy;
        for (let x = x0; x <= x1; x++) {
          const dx = x - cx;
          if (dx * dx + dy * dy <= r2) buf[y * s + x] = col;
        }
      }
    }

    function ring(cx, cy, rOut, rIn, col) {
      const o2 = rOut * rOut, i2 = rIn * rIn;
      for (let y = 0; y < s; y++) {
        const dy = y - cy;
        for (let x = 0; x < s; x++) {
          const dx = x - cx, d2 = dx * dx + dy * dy;
          if (d2 <= o2 && d2 >= i2) buf[y * s + x] = col;
        }
      }
    }

    function dia(cx, cy, rx, ry, col) {
      for (let y = 0; y < s; y++) {
        const dy = Math.abs(y - cy) / ry;
        if (dy > 1) continue;
        for (let x = 0; x < s; x++) {
          if (Math.abs(x - cx) / rx + dy <= 1.02) buf[y * s + x] = col;
        }
      }
    }

    function octBack(bg, rim) {
      for (let y = 2; y <= 21; y++) {
        for (let x = 2; x <= 21; x++) {
          const d = Math.abs(x - 11.5) + Math.abs(y - 11.5);
          if (d <= 15.2) {
            const edge = x === 2 || x === 21 || y === 2 || y === 21 || d >= 13.8;
            buf[y * s + x] = edge ? rim : bg;
          }
        }
      }
    }

    function outline(col, eightWay) {
      const marks = [];
      const dirs = eightWay
        ? [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]
        : [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          if (buf[y * s + x] !== null) continue;
          for (let k = 0; k < dirs.length; k++) {
            const nx = x + dirs[k][0], ny = y + dirs[k][1];
            if (nx >= 0 && nx < s && ny >= 0 && ny < s && buf[ny * s + nx] !== null) {
              marks.push(y * s + x);
              break;
            }
          }
        }
      }
      for (let i = 0; i < marks.length; i++) buf[marks[i]] = col;
    }

    function flush(ctx) {
      for (let y = 0; y < s; y++) {
        const row = y * s;
        let x = 0;
        while (x < s) {
          const col = buf[row + x];
          if (col === null) { x++; continue; }
          let xEnd = x + 1;
          while (xEnd < s && buf[row + xEnd] === col) xEnd++;
          ctx.fillStyle = col;
          ctx.fillRect(x, y, xEnd - x, 1);
          x = xEnd;
        }
      }
    }

    return { p, r, line, circ, ring, dia, octBack, outline, flush };
  }

  function bake(makeCanvas, drawFn, ink, eightWay) {
    const cv = makeCanvas(SIZE, SIZE);
    const ctx = cv.getContext('2d');
    const g = createGrid(SIZE);
    drawFn(g);
    if (ink) g.outline(ink, !!eightWay);
    g.flush(ctx);
    return cv;
  }

  // ==================== 一、10 枚印记图标 + 兜底 ====================
  const SEAL_BUILDERS = {
    // 1. 碎甲白潮：裂开两半的青白小盾 + 中间斜劈白缝
    shatter_tide: [INK_C, (g) => {
      for (let y = 3; y <= 19; y++) {
        const hw = y < 12 ? 7 : Math.max(1, Math.round(7 - (y - 11) * 0.85));
        for (let x = 11 - hw; x <= 12 + hw; x++) {
          const dv = (x - 11.5) + (y - 11.5);
          if (Math.abs(dv) < 1.6) continue;
          const left = dv < 0;
          const sx = left ? x - 1 : x + 1;
          const sy = left ? y - 1 : y + 1;
          if (sx < 1 || sx > 22 || sy < 1 || sy > 22) continue;
          const edge = Math.abs(x - 11.5) >= hw - 0.6 || y === 3;
          let col = left ? '#8ff0ff' : '#58c8e0';
          if (edge) col = left ? '#d4fbff' : '#2e88a6';
          else if (!left && y > 13) col = '#3296b4';
          g.p(sx, sy, col);
        }
      }
      g.line(19, 3, 4, 19, '#ffffff', 1);
      g.line(18, 3, 4, 18, '#c6f8ff', 0);
      g.p(6, 5, '#ffffff'); g.p(17, 17, '#c6f8ff'); g.p(18, 8, '#ffffff');
    }],

    // 2. 孤注破防：向上突刺的尖锥短矛 + 两侧小碎甲片
    desperate: [INK_C, (g) => {
      for (let y = 2; y <= 12; y++) {
        const hw = Math.min(4, Math.floor((y - 1) * 0.45));
        for (let x = 11 - hw; x <= 12 + hw; x++) {
          let col = x <= 11 ? '#9ef4ff' : '#3d9ebb';
          if (x === 11 && y >= 3 && y <= 11) col = '#ffffff';
          if (x === 12 && y >= 4 && y <= 11) col = '#d4fbff';
          g.p(x, y, col);
        }
      }
      g.r(8, 13, 8, 2, '#ffd24a'); g.r(9, 13, 4, 1, '#fff5b8');
      g.r(10, 15, 4, 5, '#7c5032'); g.r(10, 15, 2, 5, '#b07448');
      g.r(9, 20, 6, 2, '#d49a38'); g.r(10, 20, 2, 1, '#fff2a6');
      // 两侧飞溅碎甲片
      g.r(3, 8, 3, 3, '#4c9ab8'); g.p(4, 8, '#8ff0ff');
      g.r(2, 13, 3, 2, '#8ff0ff'); g.p(2, 13, '#ffffff');
      g.r(18, 7, 3, 3, '#3c88a8'); g.p(19, 7, '#8ff0ff');
      g.r(19, 12, 3, 2, '#8ff0ff'); g.p(20, 12, '#ffffff');
    }],

    // 3. 双重合白：两枚交叠的菱形白晶（左微偏、右亮白）
    double_white: [INK_C, (g) => {
      g.dia(8.5, 11.5, 6.2, 8.2, '#96aec8');
      g.dia(8.2, 10.8, 4.6, 6.4, '#cdddf0');
      g.dia(7.6, 9.5, 2.4, 3.6, '#f0f7ff');
      g.dia(14.5, 12.5, 6.8, 8.8, INK_C);
      g.dia(14.5, 12.5, 5.8, 7.8, '#b8cde2');
      g.dia(14.2, 11.8, 4.4, 6.2, '#e8f3ff');
      g.dia(13.6, 10.6, 2.6, 3.8, '#ffffff');
      g.p(13, 8, '#ffffff'); g.p(19, 4, '#ffffff'); g.p(4, 19, '#d4e8ff');
    }],

    // 4. 白潮余韵：中心纯白晶核 + 外圈两层同心像素圆环
    white_echo: [INK_C, (g) => {
      g.ring(11.5, 11.5, 9.6, 8.1, '#9ab4ce');
      g.ring(11.5, 11.5, 9.1, 8.3, '#dcebff');
      g.r(11, 2, 2, 2, '#ffffff'); g.r(11, 20, 2, 2, '#d8ebff');
      g.r(2, 11, 2, 2, '#ffffff'); g.r(20, 11, 2, 2, '#d8ebff');
      g.ring(11.5, 11.5, 6.4, 5.1, '#ffffff');
      g.ring(11.5, 11.5, 6.4, 5.8, '#c0d8f0');
      g.dia(11.5, 11.5, 3.2, 3.2, '#d4e8ff');
      g.dia(11.5, 11.5, 2.1, 2.1, '#ffffff');
    }],

    // 5. 五彩虹桥：红橙黄绿蓝五色像素拱桥 + 粉白云团桥墩
    rainbow_bridge: [INK_C, (g) => {
      const bands = [
        [9.8, 8.4, '#ff5c72'], [8.4, 7.0, '#ff9e3d'],
        [7.0, 5.6, '#ffe24a'], [5.6, 4.2, '#5ce47c'], [4.2, 2.8, '#5eb8ff']
      ];
      for (let y = 3; y <= 17; y++) {
        for (let x = 2; x <= 21; x++) {
          const d = Math.hypot(x - 11.5, y - 16.8);
          for (let i = 0; i < bands.length; i++) {
            if (d <= bands[i][0] && d > bands[i][1]) { g.p(x, y, bands[i][2]); break; }
          }
        }
      }
      g.circ(5, 18, 2.8, '#f0b8ec'); g.circ(4.5, 17, 2.2, '#ffffff');
      g.circ(18.5, 18, 2.8, '#f0b8ec'); g.circ(18, 17, 2.2, '#ffffff');
      g.p(11, 8, '#fff6c8');
    }],

    // 6. 彩环常驻：闭环六色像素圆环 + 中心金色小扣
    ring_keep: [INK_C, (g) => {
      const pal = ['#ff5e78', '#ffa43c', '#ffe44d', '#62e680', '#5ec0ff', '#d48cff'];
      for (let y = 2; y <= 21; y++) {
        for (let x = 2; x <= 21; x++) {
          const dx = x - 11.5, dy = y - 11.5;
          const d = Math.hypot(dx, dy);
          if (d <= 9.4 && d >= 5.5) {
            const idx = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * 6) % 6;
            g.p(x, y, pal[idx]);
          }
        }
      }
      g.r(9, 9, 6, 6, '#b87618'); g.r(9, 9, 5, 5, '#ffd24a');
      g.r(10, 10, 2, 1, '#fff6c0'); g.r(11, 11, 2, 2, INK_W);
      g.p(7, 5, '#ffffff');
    }],

    // 7. 宽裕行囊：暖棕束口布袋 + 金色袋扣与鼓囊轮廓
    wide_bag: [INK_W, (g) => {
      g.r(7, 3, 10, 4, '#a66232'); g.r(8, 3, 8, 2, '#d48e54');
      g.p(9, 4, '#703d1c'); g.p(14, 4, '#703d1c');
      g.circ(11.5, 14.5, 6.8, '#7a4422');
      g.circ(10.8, 13.8, 5.8, '#b26c3a');
      g.circ(9.6, 12.8, 3.6, '#d69258');
      g.r(8, 11, 2, 2, '#f2c48c');
      g.r(7, 7, 10, 2, '#c88418'); g.r(8, 7, 8, 1, '#ffd24a');
      g.r(10, 6, 4, 4, '#ffd24a'); g.r(10, 6, 2, 2, '#fff6be');
      g.r(11, 8, 2, 1, '#8c5210'); g.p(17, 9, '#ffd24a');
    }],

    // 8. 蓄锋待发：斜放的金色剑刃 + 剑格蓄力像素亮块
    hold_edge: [INK_W, (g) => {
      for (let i = 0; i <= 11; i++) {
        const x = 9 + i, y = 14 - i;
        g.p(x, y, '#ffd24a'); g.p(x - 1, y, '#fff6be'); g.p(x, y + 1, '#c48018');
        if (i < 10) g.p(x - 1, y - 1, '#ffe47a');
      }
      g.p(20, 3, '#ffffff'); g.p(19, 3, '#fff6be');
      g.line(5, 12, 11, 18, '#c48018', 1); g.line(6, 12, 11, 17, '#ffd24a', 0);
      g.line(5, 18, 8, 15, '#6e3f24', 1);
      g.r(3, 18, 3, 3, '#ffd24a'); g.p(3, 18, '#fff6be');
      g.r(8, 13, 3, 3, '#ffffff'); g.p(9, 14, '#fff28a');
      g.r(7, 7, 2, 2, '#fff28a'); g.r(15, 14, 2, 2, '#ffd24a');
    }],

    // 9. 越隙相连：两节翠绿锁链中间带一道跨越弧线箭头
    leap: [INK_C, (g) => {
      g.r(2, 12, 7, 8, '#36a654'); g.r(2, 12, 6, 3, '#88f494');
      g.r(4, 14, 3, 4, INK_C); g.p(3, 13, '#e4ffe8');
      g.r(15, 12, 7, 8, '#36a654'); g.r(15, 12, 6, 3, '#88f494');
      g.r(17, 14, 3, 4, INK_C); g.p(16, 13, '#e4ffe8');
      const arc = [[5, 10], [6, 8], [7, 6], [9, 5], [11, 4], [13, 4], [15, 5], [17, 7], [18, 9]];
      for (let i = 0; i < arc.length; i++) {
        g.r(arc[i][0], arc[i][1], 2, 2, i < 5 ? '#9aff9a' : '#64dc78');
        if (i >= 2 && i <= 5) g.p(arc[i][0], arc[i][1], '#eaffec');
      }
      g.r(16, 9, 4, 2, '#9aff9a'); g.r(18, 7, 2, 4, '#ffffff');
    }],

    // 10. 连珠迭浪：三颗斜排渐大的翡翠连珠 + 波浪尾迹
    chain_surge: [INK_C, (g) => {
      g.line(3, 20, 17, 8, '#288248', 1);
      g.line(5, 20, 19, 9, '#48c86c', 0);
      g.line(2, 16, 13, 6, '#3ca85c', 0);
      g.circ(5.5, 17.5, 2.3, '#3aa85a'); g.circ(5.2, 17.0, 1.5, '#9aff9a'); g.p(5, 16, '#ffffff');
      g.circ(11.0, 12.5, 3.2, '#2c964e'); g.circ(10.5, 11.8, 2.3, '#86f690'); g.r(9, 10, 2, 2, '#e4ffe8');
      g.circ(16.8, 7.2, 4.1, '#248846'); g.circ(16.2, 6.6, 3.1, '#78ee86');
      g.circ(15.4, 5.8, 1.8, '#c8ffd0'); g.p(15, 5, '#ffffff');
    }],

    // 兜底：通用古铜像素圆章
    _default: [INK_W, (g) => {
      g.circ(11.5, 11.5, 8.8, '#7c522e');
      g.circ(11.2, 11.0, 7.6, '#ba8652');
      g.ring(11.5, 11.5, 8.4, 7.2, '#e0b47c');
      g.dia(11.5, 11.5, 4.2, 4.2, '#6c4422');
      g.dia(11.5, 11.5, 2.8, 2.8, '#f0cc96');
      g.p(10, 10, '#fff5d8');
    }]
  };

  // ==================== 二、6 枚战利品徽章 + 兜底 ====================
  const LOOT_BUILDERS = {
    // 1. 宝石雕琢：倾斜像素刻刀 + 切面蓝晶
    carve: [INK_C, (g) => {
      g.dia(8.5, 14.5, 6.2, 6.2, '#2476a8');
      g.dia(8.0, 13.8, 4.8, 4.8, '#58c4f4');
      g.r(5, 11, 4, 3, '#a6ecff'); g.p(6, 11, '#ffffff');
      g.line(10, 11, 14, 7, '#d8ecf8', 1); g.p(10, 11, '#ffffff');
      g.line(14, 7, 16, 5, '#90a6be', 1);
      g.line(16, 5, 20, 2, '#b06c38', 1); g.line(16, 4, 19, 2, '#e09e62', 0);
      g.p(14, 11, '#9ef0ff'); g.p(9, 7, '#ffffff');
    }],

    // 2. 秘宝印记：紫金火漆蜡印圆章 + 中心菱纹
    seal: [INK_C, (g) => {
      g.circ(11.5, 11.5, 8.8, '#66329a'); g.circ(11.2, 11.0, 7.8, '#a464e8');
      g.circ(5, 7, 2.0, '#c490ff'); g.circ(18, 16, 2.0, '#783cb4'); g.circ(17, 6, 1.8, '#b478f2');
      g.ring(11.5, 11.5, 6.8, 5.6, '#c490ff');
      g.circ(11.5, 11.5, 5.5, '#542684');
      g.dia(11.5, 11.5, 4.0, 4.4, '#ffd24a');
      g.dia(11.2, 11.0, 2.2, 2.6, '#fff6be');
      g.p(7, 5, '#f0deff');
    }],

    // 3. 秘术牌：金边古卷牌面 + 中心暖黄符纹
    arcana: [INK_W, (g) => {
      g.r(5, 2, 14, 20, '#c4801c'); g.r(5, 2, 13, 19, '#ffd24a');
      g.r(6, 3, 2, 2, '#fff6c4');
      g.r(7, 4, 10, 16, '#38244a'); g.r(7, 4, 9, 14, '#4c3266');
      g.dia(11.5, 11.5, 3.6, 5.2, '#ffd24a');
      g.dia(11.5, 11.5, 1.8, 3.0, '#38244a');
      g.r(11, 10, 2, 3, '#fff6be'); g.r(8, 11, 8, 1, '#ffd24a');
      g.r(11, 5, 2, 2, '#fff29c'); g.r(11, 17, 2, 2, '#ffd24a');
    }],

    // 4. 手牌扩容：三张错开扇形绿边卡牌轮廓
    hand: [INK_C, (g) => {
      g.r(2, 6, 8, 13, '#389e4c'); g.r(3, 7, 6, 11, '#cde6ce');
      g.r(7, 4, 9, 14, '#56c868'); g.r(8, 5, 7, 12, '#e8fae6');
      g.r(12, 6, 9, 14, '#7ae07a'); g.r(13, 7, 7, 12, '#ffffff');
      g.r(13, 7, 7, 1, '#b8ffb8');
      g.r(16, 10, 2, 6, '#38a84e'); g.r(14, 12, 6, 2, '#38a84e');
    }],

    // 5. 疗伤果泉：饱满红浆果配两片嫩绿小叶
    heal: [INK_W, (g) => {
      g.circ(11.5, 14.0, 6.6, '#a62038');
      g.circ(11.2, 13.4, 5.8, '#e83e54');
      g.circ(10.0, 12.2, 3.8, '#ff6a78');
      g.r(8, 10, 2, 3, '#ffd2d8'); g.p(8, 10, '#ffffff');
      g.r(11, 5, 2, 3, '#6e4426');
      g.r(5, 4, 6, 3, '#44b856'); g.r(6, 3, 4, 2, '#86f28a');
      g.r(13, 4, 6, 3, '#3ca44e'); g.r(14, 3, 4, 2, '#7ae07a');
      g.p(7, 4, '#d8ffda');
    }],

    // 6. 属性提升：暖橙向上双箭头 + 底座铁砧
    attr: [INK_W, (g) => {
      g.r(5, 18, 14, 3, '#54647a');
      g.r(7, 16, 10, 2, '#869ab4'); g.r(8, 16, 6, 1, '#c8d8ec');
      for (let row = 0; row < 5; row++) {
        g.r(10 - row, 9 + row, row * 2 + 4, 2, '#d85c18');
        g.r(11 - row, 9 + row, row * 2 + 2, 1, '#ff9a3a');
      }
      g.r(9, 13, 6, 2, INK_W);
      for (let row = 0; row < 5; row++) {
        g.r(10 - row, 3 + row, row * 2 + 4, 2, '#ff8826');
        g.r(11 - row, 3 + row, row * 2 + 2, 1, '#ffca64');
      }
      g.r(11, 3, 2, 2, '#fff5b8');
    }],

    // 兜底：通用金徽像素小袋
    _default: [INK_W, (g) => {
      g.r(8, 4, 8, 3, '#c88820');
      g.circ(11.5, 14, 6.2, '#b87618'); g.circ(11.0, 13.4, 5.0, '#ffd24a');
      g.r(9, 10, 2, 2, '#fff6c4'); g.r(8, 7, 8, 2, '#8c5212');
    }]
  };

  // ==================== 三、4 枚雕琢角标 + 兜底（高对比底托，14px 依然锐利） ====================
  const CARVE_BUILDERS = {
    // 1. 锐切：斜向暖橙利刃斜切角标
    sharp: [INK_W, (g) => {
      g.octBack('#281814', '#8c4c1c');
      for (let i = 0; i < 13; i++) {
        const x = 5 + i, y = 17 - i;
        g.r(x, y, 3, 3, '#d86618'); g.r(x, y, 2, 2, '#ffb04a'); g.p(x, y, '#fff4b8');
      }
      g.r(17, 4, 2, 2, '#ffffff');
      g.r(6, 7, 2, 2, '#ffe088'); g.r(16, 15, 2, 2, '#ffb04a');
    }],

    // 2. 双晶：左右并排两颗亮青小菱晶
    twin: [INK_C, (g) => {
      g.octBack('#142030', '#2a688a');
      g.dia(7.2, 11.5, 3.8, 6.2, '#2d92c4');
      g.dia(7.0, 11.0, 2.6, 4.6, '#7ad8ff'); g.r(6, 8, 2, 3, '#e6fbff');
      g.dia(16.6, 11.5, 3.8, 6.2, '#2d92c4');
      g.dia(16.4, 11.0, 2.6, 4.6, '#7ad8ff'); g.r(15, 8, 2, 3, '#e6fbff');
      g.p(6, 8, '#ffffff'); g.p(15, 8, '#ffffff');
    }],

    // 3. 碎甲：红橙裂盾破口小标
    pierce: [INK_W, (g) => {
      g.octBack('#2a1418', '#862c34');
      g.r(5, 6, 5, 9, '#d8424a'); g.r(5, 6, 4, 4, '#ff7a7a'); g.r(6, 15, 4, 3, '#b8323c');
      g.r(14, 6, 5, 9, '#c83a44'); g.r(14, 6, 4, 4, '#ff7a7a'); g.r(14, 15, 4, 3, '#a42834');
      g.r(11, 5, 2, 4, '#fff29c'); g.r(10, 9, 3, 3, '#ffffff');
      g.r(11, 12, 3, 3, '#ffe078'); g.r(10, 15, 2, 4, '#fff29c');
    }],

    // 4. 溢彩：紫粉四角溅射像素亮芒
    overflow: [INK_C, (g) => {
      g.octBack('#201430', '#6a389e');
      g.r(10, 4, 4, 16, '#9e58ec'); g.r(4, 10, 16, 4, '#9e58ec');
      g.r(11, 5, 2, 14, '#d49aff'); g.r(5, 11, 14, 2, '#d49aff');
      g.dia(11.5, 11.5, 4.2, 4.2, '#ffb6f4'); g.r(10, 10, 4, 4, '#ffffff');
      g.r(5, 5, 2, 2, '#ffb0f0'); g.r(17, 5, 2, 2, '#ffb0f0');
      g.r(5, 17, 2, 2, '#ffb0f0'); g.r(17, 17, 2, 2, '#ffb0f0');
    }],

    // 兜底：通用白灰小菱标
    _default: [INK_C, (g) => {
      g.octBack('#1c222e', '#58667a');
      g.dia(11.5, 11.5, 5.6, 5.6, '#96a6bc');
      g.dia(11.2, 11.0, 3.8, 3.8, '#dce6f2');
      g.r(10, 9, 2, 2, '#ffffff');
    }]
  };

  function initIcons(makeCanvas) {
    if (cache.ready) return;
    const mk = typeof makeCanvas === 'function' ? makeCanvas : defaultMakeCanvas;
    for (const id in SEAL_BUILDERS) {
      cache.seals[id] = bake(mk, SEAL_BUILDERS[id][1], SEAL_BUILDERS[id][0], false);
    }
    for (const id in LOOT_BUILDERS) {
      cache.loots[id] = bake(mk, LOOT_BUILDERS[id][1], LOOT_BUILDERS[id][0], false);
    }
    for (const id in CARVE_BUILDERS) {
      cache.carves[id] = bake(mk, CARVE_BUILDERS[id][1], CARVE_BUILDERS[id][0], true);
    }
    cache.ready = true;
  }

  function ensureReady() {
    if (!cache.ready) initIcons();
  }

  function blit(ctx, img, cx, cy, size) {
    const s = Math.max(1, size);
    const x = Math.round(cx - s * 0.5);
    const y = Math.round(cy - s * 0.5);
    ctx.drawImage(img, x, y, s, s);
    return { x, y, s };
  }

  function drawSealIcon(ctx, sealId, cx, cy, size, opts) {
    ensureReady();
    const s = typeof size === 'number' && size > 0 ? size : 24;
    const o = opts || {};
    const img = cache.seals[sealId] || cache.seals._default;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (o.dim) ctx.globalAlpha *= 0.45;
    const box = blit(ctx, img, cx, cy, s);

    if (o.active) {
      const pulse = typeof o.t === 'number' ? Math.floor(o.t * 3) % 2 : 0;
      const dot = Math.max(2, Math.round(s * 0.12));
      const pad = Math.max(1, Math.round(s * 0.04));
      const x0 = box.x - pad, y0 = box.y - pad;
      const x1 = box.x + box.s - dot + pad, y1 = box.y + box.s - dot + pad;
      const cA = pulse === 0 ? '#fff6b8' : '#ffd24a';
      const cB = pulse === 0 ? '#ffd24a' : '#ffffff';

      ctx.fillStyle = INK_C;
      ctx.fillRect(x0 - 1, y0 - 1, dot + 2, dot + 2);
      ctx.fillRect(x1 - 1, y0 - 1, dot + 2, dot + 2);
      ctx.fillRect(x0 - 1, y1 - 1, dot + 2, dot + 2);
      ctx.fillRect(x1 - 1, y1 - 1, dot + 2, dot + 2);
      ctx.fillStyle = cA;
      ctx.fillRect(x0, y0, dot, dot); ctx.fillRect(x1, y1, dot, dot);
      ctx.fillStyle = cB;
      ctx.fillRect(x1, y0, dot, dot); ctx.fillRect(x0, y1, dot, dot);
    }

    if (typeof o.count === 'number' && o.count > 1) {
      const label = String(Math.floor(o.count));
      const bw = Math.max(10, label.length * 6 + 4), bh = 10;
      const bx = box.x + box.s - bw + 2, by = box.y + box.s - bh + 2;
      ctx.fillStyle = INK_C;
      ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      ctx.fillStyle = '#2d2318';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#ffd24a';
      ctx.fillRect(bx, by, bw, 1);
      ctx.fillStyle = '#fff8dc';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, bx + bw * 0.5, by + bh * 0.5 + 0.5);
    }
    ctx.restore();
  }

  function drawLootBadge(ctx, lootKind, cx, cy, size) {
    ensureReady();
    const s = typeof size === 'number' && size > 0 ? size : 17;
    const img = cache.loots[lootKind] || cache.loots._default;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    blit(ctx, img, cx, cy, s);
    ctx.restore();
  }

  function drawCarveBadge(ctx, kind, cx, cy, size) {
    ensureReady();
    const s = typeof size === 'number' && size > 0 ? size : 14;
    const img = cache.carves[kind] || cache.carves._default;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    blit(ctx, img, cx, cy, s);
    ctx.restore();
  }

  window.Code00ArtPacks = window.Code00ArtPacks || {};
  const host = (window.Code00ArtPacks.cards = window.Code00ArtPacks.cards || {});
  Object.assign(host, {
    iconsVersion: 1,
    iconsName: '像素印记与战利品图标包',
    initIcons,
    drawSealIcon,
    drawLootBadge,
    drawCarveBadge
  });
})();

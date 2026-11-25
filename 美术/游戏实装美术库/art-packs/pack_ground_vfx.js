'use strict';

(function (global) {
  const ROOT = global || (typeof window !== 'undefined' ? window : globalThis);
  ROOT.Code00ArtPacks = ROOT.Code00ArtPacks || {};

  const BIOME_IDS = ['forest', 'swamp', 'meadow', 'ruins', 'canopy', 'camp', 'trade', 'gate'];
  const RAINBOW_HEX = ['#ff4242', '#ff942e', '#ffe03b', '#44d662', '#38c8ff', '#5e72ff', '#d654ff'];
  const TAU = Math.PI * 2;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (e0, e1, x) => {
    const d = e1 - e0;
    const t = clamp(d !== 0 ? (x - e0) / d : 0, 0, 1);
    return t * t * (3 - 2 * t);
  };

  function hash2i(ix, iy, seed) {
    let h = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  function hexRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function buildPeriodicTable(size, cell, seed) {
    const out = new Float32Array(size * size);
    const p = Math.max(1, Math.round(size / cell));
    const inv = 1 / cell;
    for (let y = 0; y < size; y++) {
      const gy = y * inv;
      const iy = Math.floor(gy);
      const fy = gy - iy;
      const uy = fy * fy * (3 - 2 * fy);
      const y0 = ((iy % p) + p) % p;
      const y1 = (y0 + 1) % p;
      const row = y * size;
      for (let x = 0; x < size; x++) {
        const gx = x * inv;
        const ix = Math.floor(gx);
        const fx = gx - ix;
        const ux = fx * fx * (3 - 2 * fx);
        const x0 = ((ix % p) + p) % p;
        const x1 = (x0 + 1) % p;
        const a = hash2i(x0, y0, seed);
        const b = hash2i(x1, y0, seed);
        const c = hash2i(x0, y1, seed);
        const d = hash2i(x1, y1, seed);
        out[row + x] = lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
      }
    }
    return out;
  }

  let noiseTables = null;
  function getNoiseTables() {
    if (!noiseTables) {
      noiseTables = {
        m192: buildPeriodicTable(192, 24, 17),
        n128a: buildPeriodicTable(128, 16, 41),
        n128b: buildPeriodicTable(128, 8, 83),
        n128c: buildPeriodicTable(128, 4, 131)
      };
    }
    return noiseTables;
  }

  // Bayer 4x4 有序像素抖动阈值表 (0..1)
  const BAYER4 = [
    0 / 16,  8 / 16,  2 / 16, 10 / 16,
    12 / 16, 4 / 16, 14 / 16,  6 / 16,
    3 / 16, 11 / 16,  1 / 16,  9 / 16,
    15 / 16, 7 / 16, 13 / 16,  5 / 16
  ];

  // 与 ./core/habitats.js 同源的 8 套地貌色板
  const PAL = {
    forest: {
      deep: hexRgb('#24472c'), mid: hexRgb('#34663c'), hi: hexRgb('#4b8046'), top: hexRgb('#5c9652'),
      dirtD: hexRgb('#493c2c'), dirtM: hexRgb('#5c4b37'), dirtH: hexRgb('#735d42'),
      leafA: hexRgb('#8f7a3d'), leafB: hexRgb('#698c44'), leafC: hexRgb('#ad9148'),
      berryD: hexRgb('#9e2e20'), berryM: hexRgb('#d95736'), berryH: hexRgb('#f79674')
    },
    swamp: {
      mudD: hexRgb('#1b2a1e'), mudM: hexRgb('#243826'), mossM: hexRgb('#365435'), mossH: hexRgb('#507344'),
      bank: hexRgb('#162319'), waterD: hexRgb('#214546'), waterM: hexRgb('#2f5a58'), waterS: hexRgb('#3e736d'),
      ripple: hexRgb('#63a196'), rippleH: hexRgb('#86c2b6'), duckD: hexRgb('#6c944c'), duckH: hexRgb('#94ba6c')
    },
    meadow: {
      deep: hexRgb('#346939'), mid: hexRgb('#488244'), hi: hexRgb('#6ca856'), top: hexRgb('#80bd64'),
      pathD: hexRgb('#6b5e42'), pathM: hexRgb('#857653'), pathH: hexRgb('#9e8e68'),
      flPink: hexRgb('#f5b5c8'), flWhite: hexRgb('#fff4e8'), flYel: hexRgb('#fae078'),
      flCore: hexRgb('#e89e3c'), flStem: hexRgb('#2c5931')
    },
    ruins: {
      seam: hexRgb('#262e2d'), crack: hexRgb('#313a38'),
      stD: hexRgb('#404a48'), stM: hexRgb('#515d5a'), stH: hexRgb('#5d6966'), stHi: hexRgb('#7c8a85'),
      mossD: hexRgb('#3d613b'), mossM: hexRgb('#5a8756'), mossH: hexRgb('#78a86b'),
      wetD: hexRgb('#314a4c'), wetM: hexRgb('#456668')
    },
    canopy: {
      barkD: hexRgb('#3d281b'), barkM: hexRgb('#4f3422'), barkH: hexRgb('#61412b'), barkHi: hexRgb('#7a5234'),
      groove: hexRgb('#2b1b12'),
      mossD: hexRgb('#3b6e39'), mossH: hexRgb('#5e964d'),
      leafD: hexRgb('#1e4526'), leafM: hexRgb('#2f6b36'), leafH: hexRgb('#4d8f47'), leafHi: hexRgb('#6db056')
    },
    camp: {
      gD: hexRgb('#1c3a26'), gM: hexRgb('#24472f'), gH: hexRgb('#2c5236'), gHi: hexRgb('#396642'),
      soilD: hexRgb('#3d342b'), soilM: hexRgb('#524638'), soilH: hexRgb('#695a48'),
      ashD: hexRgb('#262423'), ashM: hexRgb('#383533'), ashH: hexRgb('#4f4b47'),
      pebD: hexRgb('#635e56'), pebH: hexRgb('#857e73')
    },
    trade: {
      roadD: hexRgb('#54442d'), roadM: hexRgb('#6a573a'), roadH: hexRgb('#7d6847'), roadHi: hexRgb('#8a7650'),
      ridge: hexRgb('#9e8960'), peb: hexRgb('#ab9c7c'),
      gD: hexRgb('#25472b'), gM: hexRgb('#356139'), gH: hexRgb('#497a46')
    },
    gate: {
      seam: hexRgb('#2a3431'), stD: hexRgb('#465650'), stM: hexRgb('#4e5e58'), stH: hexRgb('#566660'),
      stHi: hexRgb('#6f8079'), curb: hexRgb('#61736c'),
      mossD: hexRgb('#426b41'), mossH: hexRgb('#608f57'),
      gD: hexRgb('#1c3624'), gM: hexRgb('#294a30'), gH: hexRgb('#38613d')
    }
  };

  let storedMakeCanvas = null;
  const tileCache = Object.create(null);

  function resolveMakeCanvas(fn) {
    if (typeof fn === 'function') return fn;
    if (typeof storedMakeCanvas === 'function') return storedMakeCanvas;
    return function (w, h) {
      const c = ROOT.document.createElement('canvas');
      c.width = Math.max(1, Math.round(w));
      c.height = Math.max(1, Math.round(h));
      return c;
    };
  }

  function init(makeCanvas) {
    if (typeof makeCanvas === 'function') storedMakeCanvas = makeCanvas;
    getNoiseTables();
    return true;
  }

  function putPx(data, size, x, y, rgb) {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
  }

  function putBlock(data, size, x, y, w, h, rgb) {
    const x0 = Math.max(0, x | 0);
    const y0 = Math.max(0, y | 0);
    const x1 = Math.min(size, (x + w) | 0);
    const y1 = Math.min(size, (y + h) | 0);
    for (let yy = y0; yy < y1; yy++) {
      let i = (yy * size + x0) * 4;
      for (let xx = x0; xx < x1; xx++) {
        data[i] = rgb[0];
        data[i + 1] = rgb[1];
        data[i + 2] = rgb[2];
        data[i + 3] = 255;
        i += 4;
      }
    }
  }

  function pack32(rgb) {
    return (0xff000000 | (rgb[2] << 16) | (rgb[1] << 8) | rgb[0]) >>> 0;
  }

  function renderForest(u32, sz, nt, P32) {
    const m192 = nt.m192, n128a = nt.n128a, n128b = nt.n128b, n128c = nt.n128c;
    const half = sz * 0.5, invHalf = 1 / half, invEdge = 1 / 0.22;
    const cDeep = P32.deep, cMid = P32.mid, cHi = P32.hi, cTop = P32.top;
    const cDirtD = P32.dirtD, cDirtM = P32.dirtM, cDirtH = P32.dirtH;
    const basePathW = sz * 0.085;
    for (let y = 0; y < sz; y++) {
      const ny = (y - half) * invHalf;
      const edgeY = ny < 0 ? -ny : ny;
      const y192 = (y % 192) * 192;
      const y128a = (y & 127) << 7;
      const y128b = ((y + 47) & 127) << 7;
      const y128c = ((y * 2 + 19) & 127) << 7;
      const by4 = (y & 3) << 2;
      const rowPx = y * sz;
      const pathCx = half + Math.sin(ny * 2.5 + 0.4) * sz * 0.08 + Math.cos(ny * 4.3) * sz * 0.03;
      let x192 = 0;
      for (let x = 0; x < sz; x++) {
        const nx = (x - half) * invHalf;
        const edgeX = nx < 0 ? -nx : nx;
        const edgeMax = edgeX > edgeY ? edgeX : edgeY;
        let et = (edgeMax - 0.76) * invEdge;
        et = et <= 0 ? 0 : (et >= 1 ? 1 : et * et * (3 - 2 * et));
        const nM = m192[y192 + x192];
        if (++x192 === 192) x192 = 0;
        const nA = n128a[y128a + (x & 127)];
        const nB = n128b[y128b + ((x + 83) & 127)];
        const nC = n128c[y128c + ((x * 2 + 61) & 127)];
        const v = nM * 0.42 + nA * 0.34 + nB * 0.16 + nC * 0.08;
        const bayer = BAYER4[by4 + (x & 3)];
        const dP = x - pathCx + (nA - 0.5) * 18;
        const dPath = dP < 0 ? -dP : dP;
        const pathW = basePathW + (nM - 0.5) * 14;
        let col;
        if (dPath < pathW && edgeMax < 0.94 && (dPath < pathW - 5 || v + bayer * 0.35 < 0.72)) {
          const tread = nB * 0.6 + nC * 0.4;
          col = tread < 0.33 ? cDirtD : (tread > 0.68 ? cDirtH : cDirtM);
        } else if (dPath < pathW + 10 && edgeMax < 0.95 && v + bayer * 0.4 < 0.52) {
          col = cDirtD;
        } else {
          const gVal = v - et * 0.18 + (bayer - 0.5) * 0.14;
          col = gVal < 0.36 ? cDeep : (gVal < 0.62 ? cMid : (gVal < 0.80 ? cHi : cTop));
        }
        u32[rowPx + x] = col;
      }
    }
  }

  function renderSwamp(u32, sz, nt, P32) {
    const m192 = nt.m192, n128a = nt.n128a, n128b = nt.n128b, n128c = nt.n128c;
    const half = sz * 0.5, invHalf = 1 / half, invEdge = 1 / 0.22;
    const cMudD = P32.mudD, cMudM = P32.mudM, cMossM = P32.mossM, cMossH = P32.mossH;
    const cBank = P32.bank, cWD = P32.waterD, cWM = P32.waterM, cWS = P32.waterS;
    const cRip = P32.ripple, cRipH = P32.rippleH;
    for (let y = 0; y < sz; y++) {
      const ny = (y - half) * invHalf;
      const edgeY = ny < 0 ? -ny : ny;
      const y192 = (y % 192) * 192;
      const y128a = (y & 127) << 7;
      const y128b = ((y + 47) & 127) << 7;
      const y128c = ((y * 2 + 19) & 127) << 7;
      const by4 = (y & 3) << 2;
      const rowPx = y * sz;
      let x192 = 0;
      for (let x = 0; x < sz; x++) {
        const nx = (x - half) * invHalf;
        const edgeX = nx < 0 ? -nx : nx;
        const edgeMax = edgeX > edgeY ? edgeX : edgeY;
        let et = (edgeMax - 0.76) * invEdge;
        et = et <= 0 ? 0 : (et >= 1 ? 1 : et * et * (3 - 2 * et));
        const nM = m192[y192 + x192];
        if (++x192 === 192) x192 = 0;
        const nA = n128a[y128a + (x & 127)];
        const nB = n128b[y128b + ((x + 83) & 127)];
        const nC = n128c[y128c + ((x * 2 + 61) & 127)];
        const v = nM * 0.42 + nA * 0.34 + nB * 0.16 + nC * 0.08;
        const bayer = BAYER4[by4 + (x & 3)];
        const puddleScore = nM * 0.56 + nA * 0.32 + nB * 0.12 - et * 0.42;
        let col;
        if (puddleScore > 0.565) {
          const depth = puddleScore - 0.565;
          if (depth < 0.022) col = cBank;
          else if (depth < 0.052) col = (bayer > 0.45 && nC > 0.55) ? cRip : cWS;
          else if (depth > 0.068 && depth < 0.082 && ((x + y) & 1) === 0 && nB > 0.38) col = cRip;
          else if (depth > 0.115 && depth < 0.126 && nC > 0.52) col = cRipH;
          else col = (depth > 0.13 && v > 0.52) ? cWD : cWM;
        } else if (puddleScore > 0.535) {
          col = (nC + bayer * 0.3 > 0.6) ? cMudM : cBank;
        } else {
          const gVal = nA * 0.5 + nB * 0.35 + nC * 0.15 + (bayer - 0.5) * 0.16 - et * 0.15;
          col = gVal < 0.30 ? cMudD : (gVal < 0.56 ? cMudM : (gVal < 0.78 ? cMossM : cMossH));
        }
        u32[rowPx + x] = col;
      }
    }
  }

  function renderMeadow(u32, sz, nt, P32) {
    const m192 = nt.m192, n128a = nt.n128a, n128b = nt.n128b, n128c = nt.n128c;
    const half = sz * 0.5, invHalf = 1 / half, invEdge = 1 / 0.22;
    const cDeep = P32.deep, cMid = P32.mid, cHi = P32.hi, cTop = P32.top;
    const cPD = P32.pathD, cPM = P32.pathM, cPH = P32.pathH;
    const basePathW = sz * 0.068;
    for (let y = 0; y < sz; y++) {
      const ny = (y - half) * invHalf;
      const edgeY = ny < 0 ? -ny : ny;
      const y192 = (y % 192) * 192;
      const y128a = (y & 127) << 7;
      const y128b = ((y + 47) & 127) << 7;
      const y128c = ((y * 2 + 19) & 127) << 7;
      const by4 = (y & 3) << 2;
      const rowPx = y * sz;
      const pathCx = half + Math.sin(ny * 2.1 - 0.5) * sz * 0.11;
      let x192 = 0;
      for (let x = 0; x < sz; x++) {
        const nx = (x - half) * invHalf;
        const edgeX = nx < 0 ? -nx : nx;
        const edgeMax = edgeX > edgeY ? edgeX : edgeY;
        let et = (edgeMax - 0.76) * invEdge;
        et = et <= 0 ? 0 : (et >= 1 ? 1 : et * et * (3 - 2 * et));
        const nM = m192[y192 + x192];
        if (++x192 === 192) x192 = 0;
        const nA = n128a[y128a + (x & 127)];
        const nB = n128b[y128b + ((x + 83) & 127)];
        const nC = n128c[y128c + ((x * 2 + 61) & 127)];
        const v = nM * 0.42 + nA * 0.34 + nB * 0.16 + nC * 0.08;
        const bayer = BAYER4[by4 + (x & 3)];
        const dP = x - pathCx + (nA - 0.5) * 16;
        const dPath = dP < 0 ? -dP : dP;
        const pathW = basePathW + (nB - 0.5) * 10;
        let col;
        if (dPath < pathW && edgeMax < 0.92 && (dPath < pathW - 4 || bayer < 0.58)) {
          const pv = nB * 0.55 + nC * 0.45 + (bayer - 0.5) * 0.14;
          col = pv < 0.34 ? cPD : (pv > 0.68 ? cPH : cPM);
        } else {
          const gVal = v - et * 0.18 + (bayer - 0.5) * 0.14;
          col = gVal < 0.30 ? cDeep : (gVal < 0.58 ? cMid : (gVal < 0.80 ? cHi : cTop));
        }
        u32[rowPx + x] = col;
      }
    }
  }

  function renderRuins(u32, sz, nt, P32) {
    const m192 = nt.m192, n128a = nt.n128a, n128b = nt.n128b, n128c = nt.n128c;
    const half = sz * 0.5, invHalf = 1 / half, invEdge = 1 / 0.22;
    const cSeam = P32.seam, cCrack = P32.crack;
    const cStD = P32.stD, cStM = P32.stM, cStH = P32.stH, cStHi = P32.stHi;
    const cMossD = P32.mossD, cMossM = P32.mossM, cMossH = P32.mossH;
    const cWetD = P32.wetD, cWetM = P32.wetM;
    const rowH = 20;
    for (let y = 0; y < sz; y++) {
      const ny = (y - half) * invHalf;
      const edgeY = ny < 0 ? -ny : ny;
      const y192 = (y % 192) * 192;
      const y128a = (y & 127) << 7;
      const y128b = ((y + 47) & 127) << 7;
      const y128c = ((y * 2 + 19) & 127) << 7;
      const by4 = (y & 3) << 2;
      const rowPx = y * sz;
      const rIdx = (y / rowH) | 0;
      const inY = y - rIdx * rowH;
      const colW = 24 + ((rIdx * 7) % 3) * 4;
      const rowShift = (rIdx * 17) % colW;
      let cIdx = (rowShift / colW) | 0;
      let inX = rowShift - cIdx * colW;
      let slabHash = hash2i(cIdx, rIdx, 509);
      const crackTermY = (inY - rowH * 0.5) * 0.85;
      let x192 = 0;
      for (let x = 0; x < sz; x++) {
        const nx = (x - half) * invHalf;
        const edgeX = nx < 0 ? -nx : nx;
        const edgeMax = edgeX > edgeY ? edgeX : edgeY;
        let et = (edgeMax - 0.76) * invEdge;
        et = et <= 0 ? 0 : (et >= 1 ? 1 : et * et * (3 - 2 * et));
        const nM = m192[y192 + x192];
        if (++x192 === 192) x192 = 0;
        const nA = n128a[y128a + (x & 127)];
        const nB = n128b[y128b + ((x + 83) & 127)];
        const nC = n128c[y128c + ((x * 2 + 61) & 127)];
        const v = nM * 0.42 + nA * 0.34 + nB * 0.16 + nC * 0.08;
        const bayer = BAYER4[by4 + (x & 3)];
        const mossChance = nM * 0.52 + nA * 0.34 + nB * 0.14;
        let col;
        if (inY === 0 || inX === 0) {
          col = mossChance > 0.48 ? cMossM : cSeam;
        } else if (mossChance > 0.67 && (inY <= 3 || inX <= 3 || inY >= rowH - 3 || inX >= colW - 3 || mossChance > 0.77)) {
          col = nC + bayer * 0.25 > 0.65 ? cMossH : (nB < 0.35 ? cMossD : cMossM);
        } else if (nM < 0.24 && nA < 0.42 && edgeMax < 0.80 && inY > 2 && inX > 2) {
          col = (nC > 0.62 && ((x + y) & 1) === 0) ? cWetM : cWetD;
        } else if (inY === 1 || inX === 1) {
          col = slabHash > 0.28 ? cStHi : cStH;
        } else if (inY === rowH - 1 || inX === colW - 1) {
          col = cCrack;
        } else {
          const cr = (inX - colW * 0.45) - crackTermY + (nC - 0.5) * 3;
          if (slabHash > 0.62 && cr > -0.85 && cr < 0.85) {
            col = cCrack;
          } else {
            const sv = slabHash * 0.45 + v * 0.55 + (bayer - 0.5) * 0.12 - et * 0.15;
            col = sv < 0.38 ? cStD : (sv < 0.62 ? cStM : cStH);
          }
        }
        u32[rowPx + x] = col;
        if (++inX === colW) { inX = 0; cIdx++; slabHash = hash2i(cIdx, rIdx, 509); }
      }
    }
  }

  const SIN_LUT = new Float32Array(256);
  for (let i = 0; i < 256; i++) SIN_LUT[i] = Math.sin((i / 256) * TAU);
  const SIN_K = 256 / TAU;

  function renderCanopy(u32, sz, nt, P32) {
    const m192 = nt.m192, n128a = nt.n128a, n128b = nt.n128b, n128c = nt.n128c;
    const half = sz * 0.5, invHalf = 1 / half, invEdge = 1 / 0.22;
    const cBD = P32.barkD, cBM = P32.barkM, cBH = P32.barkH, cBHi = P32.barkHi, cGrv = P32.groove;
    const cMD = P32.mossD, cMH = P32.mossH;
    const cLD = P32.leafD, cLM = P32.leafM, cLH = P32.leafH, cLHi = P32.leafHi;
    for (let y = 0; y < sz; y++) {
      const ny = (y - half) * invHalf;
      const absNy = ny < 0 ? -ny : ny;
      const dy1 = ny + 0.16, dy1sq = dy1 * dy1;
      const dy2 = ny - 0.24, dy2sq = dy2 * dy2;
      const y192 = (y % 192) * 192;
      const y128a = (y & 127) << 7;
      const y128b = ((y + 47) & 127) << 7;
      const y128c = ((y * 2 + 19) & 127) << 7;
      const by4 = (y & 3) << 2;
      const rowPx = y * sz;
      const yWave = y * 0.045;
      let x192 = 0;
      for (let x = 0; x < sz; x++) {
        const nx = (x - half) * invHalf;
        const absNx = nx < 0 ? -nx : nx;
        const nM = m192[y192 + x192];
        if (++x192 === 192) x192 = 0;
        const nA = n128a[y128a + (x & 127)];
        const nB = n128b[y128b + ((x + 83) & 127)];
        const nC = n128c[y128c + ((x * 2 + 61) & 127)];
        const bayer = BAYER4[by4 + (x & 3)];
        const lbA = absNx * 0.96 + (nM - 0.5) * 0.28 + (nA - 0.5) * 0.14;
        const lbB = absNy * 0.90 + (nA - 0.5) * 0.26 + (nB - 0.5) * 0.14;
        const leafBoundary = lbA > lbB ? lbA : lbB;
        let col;
        if (leafBoundary > 0.74) {
          let lbt = (leafBoundary - 0.76) * invEdge;
          lbt = lbt <= 0 ? 0 : (lbt >= 1 ? 1 : lbt * lbt * (3 - 2 * lbt));
          const lf = nA * 0.45 + nB * 0.35 + nC * 0.20 + (bayer - 0.5) * 0.16 - lbt * 0.25;
          col = lf < 0.34 ? cLD : (lf < 0.60 ? cLM : (lf < 0.80 ? cLH : cLHi));
        } else {
          const dx1 = nx - 0.22, dx2 = nx + 0.28;
          const k1sq = dx1 * dx1 + dy1sq;
          const k2sq = dx2 * dx2 + dy2sq;
          let swirl = 0;
          if (k1sq < 0.25) { const t1 = 1 - Math.sqrt(k1sq) * 2.0; swirl += t1 * t1 * t1 * 18; }
          if (k2sq < 0.25) { const t2 = 1 - Math.sqrt(k2sq) * 2.0; swirl += t2 * t2 * t2 * 15; }
          const grainCoord = x * 0.22 + SIN_LUT[((yWave + nM * 4.2) * SIN_K) & 255] * 3.8 + swirl + nA * 5.5;
          const furrow = SIN_LUT[(grainCoord * 1.45 * SIN_K) & 255];
          const barkMoss = nM * 0.55 + nB * 0.45;
          if (barkMoss > 0.74 && furrow < 0.15) col = nC > 0.52 ? cMH : cMD;
          else if (furrow < -0.72) col = cGrv;
          else if (furrow < -0.22) col = cBD;
          else if (furrow < 0.35) col = (bayer > 0.6 && nC > 0.55) ? cBH : cBM;
          else if (furrow < 0.78) col = cBH;
          else col = cBHi;
        }
        u32[rowPx + x] = col;
      }
    }
  }

  function renderCamp(u32, sz, nt, P32) {
    const m192 = nt.m192, n128a = nt.n128a, n128b = nt.n128b, n128c = nt.n128c;
    const half = sz * 0.5, invHalf = 1 / half, invEdge = 1 / 0.22;
    const cGD = P32.gD, cGM = P32.gM, cGH = P32.gH, cGHi = P32.gHi;
    const cSD = P32.soilD, cSM = P32.soilM, cSH = P32.soilH;
    const cAD = P32.ashD, cAM = P32.ashM, cAH = P32.ashH;
    for (let y = 0; y < sz; y++) {
      const ny = (y - half) * invHalf;
      const nysq = ny * ny;
      const edgeY = ny < 0 ? -ny : ny;
      const y192 = (y % 192) * 192;
      const y128a = (y & 127) << 7;
      const y128b = ((y + 47) & 127) << 7;
      const y128c = ((y * 2 + 19) & 127) << 7;
      const by4 = (y & 3) << 2;
      const rowPx = y * sz;
      let x192 = 0;
      for (let x = 0; x < sz; x++) {
        const nx = (x - half) * invHalf;
        const edgeX = nx < 0 ? -nx : nx;
        const edgeMax = edgeX > edgeY ? edgeX : edgeY;
        let et = (edgeMax - 0.76) * invEdge;
        et = et <= 0 ? 0 : (et >= 1 ? 1 : et * et * (3 - 2 * et));
        const nM = m192[y192 + x192];
        if (++x192 === 192) x192 = 0;
        const nA = n128a[y128a + (x & 127)];
        const nB = n128b[y128b + ((x + 83) & 127)];
        const nC = n128c[y128c + ((x * 2 + 61) & 127)];
        const v = nM * 0.42 + nA * 0.34 + nB * 0.16 + nC * 0.08;
        const bayer = BAYER4[by4 + (x & 3)];
        const rDist = Math.sqrt(nx * nx + nysq) + (nM - 0.5) * 0.14 + (nA - 0.5) * 0.07;
        let col;
        if (rDist < 0.13) {
          const av = nB * 0.5 + nC * 0.5 + (bayer - 0.5) * 0.16;
          col = av < 0.38 ? cAD : (av > 0.70 ? cAH : cAM);
        } else if (rDist < 0.30) {
          const sv = nA * 0.45 + nB * 0.35 + nC * 0.20 + (bayer - 0.5) * 0.16;
          if (rDist < 0.17 && bayer < 0.45) col = cAM;
          else col = sv < 0.36 ? cSD : (sv > 0.68 ? cSH : cSM);
        } else if (rDist < 0.35 && bayer + nB * 0.5 < 0.72) {
          col = cSD;
        } else {
          const gv = v - et * 0.20 + (bayer - 0.5) * 0.14;
          col = gv < 0.34 ? cGD : (gv < 0.60 ? cGM : (gv < 0.80 ? cGH : cGHi));
        }
        u32[rowPx + x] = col;
      }
    }
  }

  function renderTrade(u32, sz, nt, P32) {
    const m192 = nt.m192, n128a = nt.n128a, n128b = nt.n128b, n128c = nt.n128c;
    const half = sz * 0.5, invHalf = 1 / half, invEdge = 1 / 0.22;
    const cRD = P32.roadD, cRM = P32.roadM, cRH = P32.roadH, cRHi = P32.roadHi;
    const cRidge = P32.ridge, cPeb = P32.peb;
    const cGD = P32.gD, cGM = P32.gM, cGH = P32.gH;
    const roadHalf = sz * 0.175, rutOff = sz * 0.068;
    for (let y = 0; y < sz; y++) {
      const ny = (y - half) * invHalf;
      const edgeY = ny < 0 ? -ny : ny;
      const y192 = (y % 192) * 192;
      const y128a = (y & 127) << 7;
      const y128b = ((y + 47) & 127) << 7;
      const y128c = ((y * 2 + 19) & 127) << 7;
      const by4 = (y & 3) << 2;
      const rowPx = y * sz;
      const tradePathCx = half + Math.sin(ny * 1.9 + 0.2) * sz * 0.055;
      let x192 = 0;
      for (let x = 0; x < sz; x++) {
        const nx = (x - half) * invHalf;
        const edgeX = nx < 0 ? -nx : nx;
        const edgeMax = edgeX > edgeY ? edgeX : edgeY;
        let et = (edgeMax - 0.76) * invEdge;
        et = et <= 0 ? 0 : (et >= 1 ? 1 : et * et * (3 - 2 * et));
        const nM = m192[y192 + x192];
        if (++x192 === 192) x192 = 0;
        const nA = n128a[y128a + (x & 127)];
        const nB = n128b[y128b + ((x + 83) & 127)];
        const nC = n128c[y128c + ((x * 2 + 61) & 127)];
        const v = nM * 0.42 + nA * 0.34 + nB * 0.16 + nC * 0.08;
        const bayer = BAYER4[by4 + (x & 3)];
        const dxRoad = (x - tradePathCx) + (nM - 0.5) * 14 + (nA - 0.5) * 7;
        const absR = dxRoad < 0 ? -dxRoad : dxRoad;
        let col;
        if (absR < roadHalf) {
          const dL = dxRoad + rutOff, dR = dxRoad - rutOff;
          const dRutL = dL < 0 ? -dL : dL;
          const dRutR = dR < 0 ? -dR : dR;
          const dRut = dRutL < dRutR ? dRutL : dRutR;
          const rv = nA * 0.45 + nB * 0.35 + nC * 0.20 + (bayer - 0.5) * 0.14;
          if (dRut < 4.5) col = rv < 0.58 ? cRD : cRM;
          else if (dRut < 7.2) col = rv > 0.46 ? cRidge : cRHi;
          else if (absR < 8 && nB > 0.68) col = cGM;
          else col = rv < 0.32 ? cRM : (rv > 0.68 ? cRHi : cRH);
        } else if (absR < roadHalf + 11 && bayer + nB * 0.45 < 0.76) {
          col = nC > 0.66 ? cPeb : cRM;
        } else {
          const gv = v - et * 0.18 + (bayer - 0.5) * 0.14;
          col = gv < 0.36 ? cGD : (gv < 0.66 ? cGM : cGH);
        }
        u32[rowPx + x] = col;
      }
    }
  }

  function renderGate(u32, sz, nt, P32) {
    const m192 = nt.m192, n128a = nt.n128a, n128b = nt.n128b, n128c = nt.n128c;
    const half = sz * 0.5, invHalf = 1 / half, invEdge = 1 / 0.22;
    const cSeam = P32.seam, cStD = P32.stD, cStM = P32.stM, cStH = P32.stH, cStHi = P32.stHi, cCurb = P32.curb;
    const cMD = P32.mossD, cMH = P32.mossH;
    const cGD = P32.gD, cGM = P32.gM, cGH = P32.gH;
    const rowH = 18, aveHalf = sz * 0.165, invAve = 1 / (aveHalf * 0.42);
    for (let y = 0; y < sz; y++) {
      const ny = (y - half) * invHalf;
      const edgeY = ny < 0 ? -ny : ny;
      const y192 = (y % 192) * 192;
      const y128a = (y & 127) << 7;
      const y128b = ((y + 47) & 127) << 7;
      const y128c = ((y * 2 + 19) & 127) << 7;
      const by4 = (y & 3) << 2;
      const rowPx = y * sz;
      const rIdx = (y / rowH) | 0;
      const inY = y - rIdx * rowH;
      const rowOff = (rIdx & 1) * 13;
      let x192 = 0;
      for (let x = 0; x < sz; x++) {
        const nx = (x - half) * invHalf;
        const edgeX = nx < 0 ? -nx : nx;
        const edgeMax = edgeX > edgeY ? edgeX : edgeY;
        let et = (edgeMax - 0.76) * invEdge;
        et = et <= 0 ? 0 : (et >= 1 ? 1 : et * et * (3 - 2 * et));
        const nM = m192[y192 + x192];
        if (++x192 === 192) x192 = 0;
        const nA = n128a[y128a + (x & 127)];
        const nB = n128b[y128b + ((x + 83) & 127)];
        const nC = n128c[y128c + ((x * 2 + 61) & 127)];
        const v = nM * 0.42 + nA * 0.34 + nB * 0.16 + nC * 0.08;
        const bayer = BAYER4[by4 + (x & 3)];
        const dxAve = x - half;
        const absA = dxAve < 0 ? -dxAve : dxAve;
        let col;
        if (absA < aveHalf) {
          const isCurb = absA > aveHalf - 8;
          const colW = isCurb ? 14 : 26;
          const ox = x + (isCurb ? 0 : rowOff);
          const cIdx = (ox / colW) | 0;
          const inX = ox - cIdx * colW;
          const sh = hash2i(cIdx, rIdx, 733);
          const curbGap = absA - (aveHalf - 8);
          const seam = inY === 0 || inX === 0 || (curbGap > -1 && curbGap < 1);
          let em = (absA - aveHalf * 0.58) * invAve;
          em = em <= 0 ? 0 : (em >= 1 ? 1 : em * em * (3 - 2 * em));
          const mossVal = nM * 0.45 + nA * 0.35 + em * 0.38;
          if (seam) col = mossVal > 0.52 ? cMH : cSeam;
          else if (mossVal > 0.74 && (inY <= 3 || inX <= 3 || inY >= rowH - 3 || isCurb)) col = nC > 0.5 ? cMH : cMD;
          else if (inY === 1 || inX === 1) col = cStHi;
          else if (isCurb) col = sh > 0.45 ? cCurb : cStH;
          else {
            const sv = sh * 0.4 + v * 0.6 + (bayer - 0.5) * 0.12;
            col = sv < 0.36 ? cStD : (sv < 0.66 ? cStH : cStM);
          }
        } else if (absA < aveHalf + 5 && nB > 0.45) {
          col = cMD;
        } else {
          const gv = v - et * 0.20 + (bayer - 0.5) * 0.14;
          col = gv < 0.36 ? cGD : (gv < 0.66 ? cGM : cGH);
        }
        u32[rowPx + x] = col;
      }
    }
  }

  const BIOME_RENDERERS = {
    forest: renderForest, swamp: renderSwamp, meadow: renderMeadow, ruins: renderRuins,
    canopy: renderCanopy, camp: renderCamp, trade: renderTrade, gate: renderGate
  };

  function buildGroundTile(biomeId, makeCanvas, size) {
    const bid = BIOME_IDS.indexOf(biomeId) >= 0 ? biomeId : 'forest';
    const sz = Math.max(64, Math.round(Number(size) || 384));
    const key = bid + '_' + sz;
    if (tileCache[key]) return tileCache[key];

    const mc = resolveMakeCanvas(makeCanvas);
    const canvas = mc(sz, sz);
    const ctx = canvas.getContext('2d');
    const im = ctx.createImageData(sz, sz);
    const data = im.data;
    const u32 = new Uint32Array(data.buffer, data.byteOffset, sz * sz);
    const nt = getNoiseTables();
    const half = sz * 0.5;
    const invHalf = 1 / half;
    const p = PAL[bid];
    const P32 = {};
    for (const k in p) P32[k] = pack32(p[k]);

    BIOME_RENDERERS[bid](u32, sz, nt, P32);

    // 像素细节盖章（直接写入 ImageData，严格硬像素且零额外画布）
    if (bid === 'forest') {
      for (let i = 0; i < 95; i++) {
        const px = 12 + Math.floor(hash2i(i, 1, 101) * (sz - 24));
        const py = 12 + Math.floor(hash2i(i, 2, 101) * (sz - 24));
        const kind = hash2i(i, 3, 101);
        if (kind < 0.45) {
          putPx(data, sz, px, py, p.deep);
          putPx(data, sz, px + 1, py, p.deep);
          putPx(data, sz, px, py - 1, p.top);
          putPx(data, sz, px + 2, py - 1, p.hi);
        } else if (kind < 0.82) {
          const lc = kind < 0.60 ? p.leafA : (kind < 0.72 ? p.leafB : p.leafC);
          putPx(data, sz, px, py, lc);
          putPx(data, sz, px + 1, py + ((i & 1) ? 0 : 1), lc);
          putPx(data, sz, px - 1, py + 1, p.deep);
        } else {
          if (Math.abs(px - half) > sz * 0.11) {
            putPx(data, sz, px, py, p.berryH);
            putPx(data, sz, px + 1, py, p.berryM);
            putPx(data, sz, px, py + 1, p.berryM);
            putPx(data, sz, px + 1, py + 1, p.berryD);
          }
        }
      }
    } else if (bid === 'swamp') {
      for (let i = 0; i < 110; i++) {
        const px = 16 + Math.floor(hash2i(i, 1, 202) * (sz - 32));
        const py = 16 + Math.floor(hash2i(i, 2, 202) * (sz - 32));
        const idx = (py * sz + px) * 4;
        if (data[idx + 2] >= 70 && data[idx] <= 64) {
          putPx(data, sz, px, py, p.duckH);
          putPx(data, sz, px + 1, py, p.duckD);
          if ((i & 1) === 0) putPx(data, sz, px, py + 1, p.duckD);
          if ((i % 3) === 0) putPx(data, sz, px + 2, py + 1, p.duckH);
        }
      }
    } else if (bid === 'meadow') {
      for (let i = 0; i < 115; i++) {
        const px = 14 + Math.floor(hash2i(i, 1, 303) * (sz - 28));
        const py = 14 + Math.floor(hash2i(i, 2, 303) * (sz - 28));
        const ny = (py - half) * invHalf;
        const pathCx = half + Math.sin(ny * 2.1 - 0.5) * sz * 0.11;
        if (Math.abs(px - pathCx) < sz * 0.09) continue;
        const fPick = hash2i(i, 3, 303);
        const petal = fPick < 0.38 ? p.flPink : (fPick < 0.72 ? p.flWhite : p.flYel);
        const core = fPick >= 0.72 ? p.flWhite : p.flCore;
        putPx(data, sz, px, py + 2, p.flStem);
        putPx(data, sz, px - 1, py, petal);
        putPx(data, sz, px + 1, py, petal);
        putPx(data, sz, px, py - 1, petal);
        putPx(data, sz, px, py + 1, petal);
        putPx(data, sz, px, py, core);
      }
    } else if (bid === 'camp') {
      // 中央篝火土圈炭灰微粒与少量小石子（不画假石圈与假火堆）
      for (let i = 0; i < 64; i++) {
        const ang = hash2i(i, 1, 606) * TAU;
        const rad = (0.04 + hash2i(i, 2, 606) * 0.25) * half;
        const px = Math.round(half + Math.cos(ang) * rad);
        const py = Math.round(half + Math.sin(ang) * rad);
        if (rad < half * 0.13) {
          putPx(data, sz, px, py, (i & 1) ? p.ashH : p.ashD);
        } else {
          putPx(data, sz, px, py, p.pebH);
          putPx(data, sz, px + 1, py, p.pebD);
        }
      }
    } else if (bid === 'trade') {
      for (let i = 0; i < 85; i++) {
        const px = 10 + Math.floor(hash2i(i, 1, 707) * (sz - 20));
        const py = 10 + Math.floor(hash2i(i, 2, 707) * (sz - 20));
        const side = Math.abs(px - half);
        if (side > sz * 0.11 && side < sz * 0.24) {
          putPx(data, sz, px, py, p.peb);
          putPx(data, sz, px + 1, py, p.roadD);
        }
      }
    } else if (bid === 'gate') {
      for (let i = 0; i < 70; i++) {
        const px = 10 + Math.floor(hash2i(i, 1, 808) * (sz - 20));
        const py = 10 + Math.floor(hash2i(i, 2, 808) * (sz - 20));
        if (Math.abs(px - half) > sz * 0.18) {
          putBlock(data, sz, px, py, 2, 1, (i & 1) ? p.mossH : p.gH);
        }
      }
    }

    ctx.putImageData(im, 0, 0);
    const result = { canvas, size: sz, biomeId: bid };
    tileCache[key] = result;
    return result;
  }

  // =========================================================================
  // 3D 像素坐标映射与硬边绘制工具集（零 NaN、零平滑、严格 restore）
  // =========================================================================
  function safeProj(proj, wx, wy, wz) {
    if (typeof proj !== 'function') return null;
    if (!Number.isFinite(wx) || !Number.isFinite(wy) || !Number.isFinite(wz)) return null;
    const p = proj(wx, wy, wz);
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
    return [p[0], p[1], Number.isFinite(p[2]) ? p[2] : 0];
  }

  function estimateUnit(proj) {
    const p0 = safeProj(proj, 0, 0, 0);
    const p1 = safeProj(proj, 0, 0, 10);
    if (!p0 || !p1) return 3;
    const dz = Math.abs(p0[1] - p1[1]);
    const sc = dz > 0.05 ? dz / 8 : 4;
    return clamp(Math.round(sc * 0.58), 2, 6);
  }

  function pxRect(ctx, x, y, w, h, color, alpha) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return;
    const rw = Math.round(w);
    const rh = Math.round(h);
    if (rw <= 0 || rh <= 0) return;
    if (alpha !== undefined) ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), rw, rh);
  }

  function pxCenter(ctx, sx, sy, w, h, color, alpha) {
    pxRect(ctx, sx - w * 0.5, sy - h * 0.5, w, h, color, alpha);
  }

  function pxLine(ctx, x0, y0, x1, y1, size, color, alpha) {
    if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) return;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    const step = Math.max(1, size * 0.85);
    const n = Math.max(1, Math.min(64, Math.ceil(dist / step)));
    if (alpha !== undefined) ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.fillStyle = color;
    const sz = Math.max(1, Math.round(size));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const gx = Math.round((x0 + dx * t - sz * 0.5) / sz) * sz;
      const gy = Math.round((y0 + dy * t - sz * 0.5) / sz) * sz;
      ctx.fillRect(gx, gy, sz, sz);
    }
  }

  function pxDiamond(ctx, sx, sy, r, u, outlineCol, bodyCol, hiCol, alpha) {
    const a = alpha === undefined ? 1 : clamp(alpha, 0, 1);
    const steps = Math.max(1, Math.round(r / u));
    for (let dy = -steps; dy <= steps; dy++) {
      const span = steps - Math.abs(dy);
      pxRect(ctx, sx - (span + 1) * u, sy + dy * u - u * 0.5, (span * 2 + 2) * u, u, outlineCol, a);
    }
    for (let dy = -(steps - 1); dy <= (steps - 1); dy++) {
      const span = Math.max(0, steps - 1 - Math.abs(dy));
      pxRect(ctx, sx - (span + 0.5) * u, sy + dy * u - u * 0.5, (span * 2 + 1) * u, u, bodyCol, a);
    }
    if (hiCol && steps >= 2) {
      pxCenter(ctx, sx - u * 0.5, sy - u * 0.5, u * Math.max(1, steps - 1), u * Math.max(1, steps - 1), hiCol, a);
    }
  }

  // =========================================================================
  // 1. 生态 3D 像素微粒（drawGroundAmbient3D）
  // =========================================================================
  function drawGroundAmbient3D(ctx, biomeId, proj, time, wind) {
    if (!ctx || typeof proj !== 'function') return;
    const bid = BIOME_IDS.indexOf(biomeId) >= 0 ? biomeId : 'forest';
    const t = Number.isFinite(time) ? time : 0;
    const wMul = Number.isFinite(wind) ? clamp(wind, 0.2, 4) : 1;
    const u = estimateUnit(proj);
    const items = [];

    ctx.save();
    try {
      ctx.imageSmoothingEnabled = false;

      if (bid === 'forest') {
        for (let i = 0; i < 24; i++) {
          const seed = hash2i(i, 7, 11);
          const life = ((t * (0.14 + seed * 0.08) + seed * 7.3) % 1 + 1) % 1;
          const x0 = (hash2i(i, 1, 13) - 0.5) * 165;
          const y0 = (hash2i(i, 2, 13) - 0.5) * 140;
          const wx = x0 + life * 24 * wMul + Math.sin(t * 2.1 + i) * 5;
          const wy = y0 + Math.cos(t * 1.7 + i * 1.3) * 4;
          const wz = (1 - life) * 56;
          const p = safeProj(proj, wx, wy, wz);
          if (!p) continue;
          const fade = Math.min(1, life * 6) * Math.min(1, (1 - life) * 5);
          const col = i % 3 === 0 ? '#d6b44b' : (i % 3 === 1 ? '#5da854' : '#89ba54');
          items.push({ d: p[2], fn: () => {
            const flip = Math.sin(t * 4.5 + i) > 0;
            pxCenter(ctx, p[0], p[1] + u * 0.5, u * 1.2, u * 0.8, '#1f3822', fade * 0.65);
            pxCenter(ctx, p[0], p[1], flip ? u * 1.4 : u, flip ? u * 0.9 : u * 1.3, col, fade * 0.92);
          }});
        }
        for (let i = 0; i < 2; i++) {
          const cycle = ((t * 0.22 + i * 0.53) % 1 + 1) % 1;
          const ang = hash2i(i + Math.floor(t * 0.22 + i * 0.53), 9, 19) * TAU;
          const rad = 52 + hash2i(i, 4, 19) * 32;
          const wx = Math.cos(ang) * rad;
          const wy = Math.sin(ang) * rad;
          let wz = 0;
          let alpha = 0;
          if (cycle < 0.35) {
            const k = cycle / 0.35;
            wz = (1 - k * k) * 48;
            alpha = Math.min(1, k * 5);
          } else if (cycle < 0.55) {
            const k = (cycle - 0.35) / 0.20;
            wz = Math.sin(k * Math.PI) * 9;
            alpha = 1;
          } else if (cycle < 0.72) {
            const k = (cycle - 0.55) / 0.17;
            wz = Math.sin(k * Math.PI) * 3;
            alpha = 1 - k;
          }
          if (alpha > 0.02) {
            const p = safeProj(proj, wx, wy, wz);
            if (p) {
              items.push({ d: p[2], fn: () => {
                pxCenter(ctx, p[0], p[1], u * 1.6, u * 1.6, '#7a1f18', alpha);
                pxCenter(ctx, p[0], p[1], u * 1.1, u * 1.1, '#e34f36', alpha);
                pxRect(ctx, p[0] - u * 0.4, p[1] - u * 0.4, u * 0.5, u * 0.5, '#ffad8c', alpha);
              }});
            }
          }
        }
      } else if (bid === 'swamp') {
        for (let i = 0; i < 7; i++) {
          const seed = hash2i(i, 3, 21);
          const life = ((t * (0.36 + seed * 0.18) + seed * 4.1) % 1 + 1) % 1;
          const wx = (hash2i(i, 1, 23) - 0.5) * 120;
          const wy = (hash2i(i, 2, 23) - 0.5) * 100;
          const rad = 2 + life * 12;
          const alpha = (1 - life) * 0.75;
          const pC = safeProj(proj, wx, wy, 0.2);
          if (pC) {
            items.push({ d: pC[2] - 1, fn: () => {
              const segs = 12;
              for (let s = 0; s < segs; s++) {
                const a = (s / segs) * TAU;
                const pt = safeProj(proj, wx + Math.cos(a) * rad, wy + Math.sin(a) * rad, 0.2);
                if (pt) pxCenter(ctx, pt[0], pt[1], u, u, '#78baa8', alpha);
              }
            }});
          }
          const bLife = ((t * (0.45 + seed * 0.2) + seed * 9.2) % 1 + 1) % 1;
          const pb = safeProj(proj, wx + Math.sin(t * 3 + i) * 1.5, wy, bLife * 18);
          if (pb) {
            items.push({ d: pb[2], fn: () => {
              if (bLife < 0.85) {
                const sz = u * (1.2 + bLife * 0.6);
                pxCenter(ctx, pb[0], pb[1], sz, sz, '#4c8f82', 0.85);
                pxCenter(ctx, pb[0], pb[1], Math.max(1, sz - u * 0.5), Math.max(1, sz - u * 0.5), '#b8f0e4', 0.8);
              } else {
                const spread = (bLife - 0.85) * 28 * u;
                const fa = (1 - bLife) / 0.15;
                pxCenter(ctx, pb[0] - spread, pb[1] - spread * 0.6, u * 0.7, u * 0.7, '#d4faf0', fa);
                pxCenter(ctx, pb[0] + spread, pb[1] - spread * 0.6, u * 0.7, u * 0.7, '#d4faf0', fa);
                pxCenter(ctx, pb[0] - spread, pb[1] + spread * 0.6, u * 0.7, u * 0.7, '#d4faf0', fa);
                pxCenter(ctx, pb[0] + spread, pb[1] + spread * 0.6, u * 0.7, u * 0.7, '#d4faf0', fa);
              }
            }});
          }
        }
        for (let i = 0; i < 6; i++) {
          const wx = (((hash2i(i, 5, 29) * 160 + t * 5 * wMul) % 160) + 160) % 160 - 80;
          const wy = (hash2i(i, 6, 29) - 0.5) * 110;
          const wz = 3 + (i % 3) * 2.5;
          const pm = safeProj(proj, wx, wy, wz);
          if (pm) {
            items.push({ d: pm[2], fn: () => {
              pxCenter(ctx, pm[0], pm[1], u * 10, u * 1.4, '#a6d6b8', 0.14);
              pxCenter(ctx, pm[0] + u * 2, pm[1] - u, u * 6, u, '#c4e8d2', 0.10);
            }});
          }
        }
      } else if (bid === 'meadow') {
        for (let i = 0; i < 28; i++) {
          const s1 = hash2i(i, 1, 31);
          const s2 = hash2i(i, 2, 31);
          const wx = ((((s1 * 170 + t * (5 + s2 * 4) * wMul) % 170) + 170) % 170) - 85;
          const wy = (s2 - 0.5) * 130 + Math.sin(t * 1.3 + i) * 6;
          const wz = 4 + ((i * 7) % 36) + Math.sin(t * 2.4 + i * 1.7) * 4;
          const p = safeProj(proj, wx, wy, wz);
          if (!p) continue;
          const tw = 0.45 + 0.55 * Math.sin(t * 3.8 + i * 2.1);
          const col = i % 3 === 0 ? '#fff5bd' : (i % 3 === 1 ? '#fae078' : '#f5c256');
          items.push({ d: p[2], fn: () => {
            pxCenter(ctx, p[0], p[1], u * (i % 4 === 0 ? 1.2 : 0.85), u * (i % 4 === 0 ? 1.2 : 0.85), col, tw * 0.9);
          }});
        }
      } else if (bid === 'ruins') {
        for (let i = 0; i < 18; i++) {
          const s = hash2i(i, 1, 41);
          const life = ((t * (0.14 + s * 0.08) + s * 6.7) % 1 + 1) % 1;
          const wx = (hash2i(i, 2, 41) - 0.5) * 145 + Math.sin(t * 1.5 + i) * 3;
          const wy = (hash2i(i, 3, 41) - 0.5) * 125;
          const wz = life * 44;
          const p = safeProj(proj, wx, wy, wz);
          if (!p) continue;
          const fa = Math.sin(life * Math.PI);
          items.push({ d: p[2], fn: () => {
            pxCenter(ctx, p[0], p[1], u, u, i % 2 === 0 ? '#7ad4ae' : '#b4f0d4', fa * 0.85);
          }});
        }
        for (let i = 0; i < 8; i++) {
          const s = hash2i(i, 4, 43);
          const life = ((t * (0.18 + s * 0.06) + s * 5.1) % 1 + 1) % 1;
          const wx = (hash2i(i, 5, 43) - 0.5) * 110 + Math.sin(t * 2 + i) * 2.5;
          const wy = (hash2i(i, 6, 43) - 0.5) * 95;
          const wz = 2 + life * 26;
          const p = safeProj(proj, wx, wy, wz);
          if (!p) continue;
          const fa = Math.sin(life * Math.PI) * 0.24;
          items.push({ d: p[2], fn: () => {
            pxCenter(ctx, p[0], p[1], u * 1.6, u * 2.2, '#e6f0e8', fa);
          }});
        }
      } else if (bid === 'canopy') {
        for (let i = 0; i < 10; i++) {
          const s = hash2i(i, 1, 51);
          const life = ((t * (0.55 + s * 0.35) * wMul + s * 4.3) % 1 + 1) % 1;
          const wx = lerp(-95, 95, life);
          const wy = (hash2i(i, 2, 51) - 0.5) * 130 + (life - 0.5) * 22;
          const wz = 8 + hash2i(i, 3, 51) * 42;
          const p0 = safeProj(proj, wx, wy, wz);
          const p1 = safeProj(proj, wx - 14 * wMul, wy - 3, wz + 2);
          if (p0 && p1) {
            const fa = Math.sin(life * Math.PI) * 0.42;
            items.push({ d: p0[2], fn: () => {
              pxLine(ctx, p0[0], p0[1], p1[0], p1[1], Math.max(1, u * 0.65), '#c9edcc', fa);
            }});
          }
        }
        for (let i = 0; i < 22; i++) {
          const s = hash2i(i, 4, 53);
          const life = ((t * (0.42 + s * 0.28) * wMul + s * 8.1) % 1 + 1) % 1;
          const wx = lerp(-90, 90, life);
          const wy = (hash2i(i, 5, 53) - 0.5) * 135 + Math.sin(t * 5 + i) * 6;
          const wz = 6 + ((1 - life) * 38 + hash2i(i, 6, 53) * 18);
          const p = safeProj(proj, wx, wy, wz);
          if (!p) continue;
          const fa = Math.sin(life * Math.PI);
          const col = i % 3 === 0 ? '#4d9c46' : (i % 3 === 1 ? '#7ec758' : '#b5e378');
          items.push({ d: p[2], fn: () => {
            pxCenter(ctx, p[0], p[1], u * 1.4, u * 0.9, col, fa * 0.92);
          }});
        }
      } else if (bid === 'camp') {
        for (let i = 0; i < 26; i++) {
          const s = hash2i(i, 1, 61);
          const life = ((t * (0.28 + s * 0.20) + s * 9.7) % 1 + 1) % 1;
          const ang = s * TAU + life * 4.8 + t * 0.6;
          const rad = 3 + life * 16 + Math.sin(life * 8 + i) * 2.5;
          const wx = Math.cos(ang) * rad;
          const wy = Math.sin(ang) * rad;
          const wz = 2 + life * 54;
          const p = safeProj(proj, wx, wy, wz);
          if (!p) continue;
          const fa = Math.min(1, life * 7) * (1 - life);
          const col = life < 0.35 ? '#fff08c' : (life < 0.70 ? '#ff9838' : '#e04822');
          const sz = life < 0.5 ? u * 1.15 : u * 0.8;
          items.push({ d: p[2], fn: () => {
            pxCenter(ctx, p[0], p[1], sz, sz, col, fa);
          }});
        }
      } else if (bid === 'trade') {
        for (let i = 0; i < 22; i++) {
          const s1 = hash2i(i, 1, 71);
          const s2 = hash2i(i, 2, 71);
          const wx = ((((s1 * 150 + t * (6 + s2 * 5) * wMul) % 150) + 150) % 150) - 75;
          const wy = (s2 - 0.5) * 130;
          const wz = 2 + hash2i(i, 3, 71) * 16 + Math.sin(t * 2 + i) * 2;
          const p = safeProj(proj, wx, wy, wz);
          if (!p) continue;
          const fa = 0.35 + 0.35 * Math.sin(t * 2.5 + i);
          items.push({ d: p[2], fn: () => {
            pxCenter(ctx, p[0], p[1], u * 0.9, u * 0.9, i % 2 === 0 ? '#e8d09e' : '#c7ab75', fa);
          }});
        }
      } else {
        for (let i = 0; i < 20; i++) {
          const s = hash2i(i, 1, 81);
          const life = ((t * (0.16 + s * 0.10) + s * 6.3) % 1 + 1) % 1;
          const wx = (hash2i(i, 2, 81) - 0.5) * 110 + Math.sin(t * 1.8 + i) * 4 * wMul;
          const wy = -48 + hash2i(i, 3, 81) * 86;
          const wz = (1 - life) * 50;
          const p = safeProj(proj, wx, wy, wz);
          if (!p) continue;
          const fa = Math.min(1, life * 6) * Math.min(1, (1 - life) * 5);
          const col = i % 3 === 0 ? '#94c77b' : (i % 3 === 1 ? '#649e5c' : '#4a7a48');
          items.push({ d: p[2], fn: () => {
            pxCenter(ctx, p[0], p[1], u, u, col, fa * 0.88);
          }});
        }
      }

      items.sort((a, b) => a.d - b.d);
      for (let i = 0; i < items.length; i++) items[i].fn();
    } finally {
      ctx.restore();
    }
  }

  // =========================================================================
  // 2. 主角施法弹道 3D 特效（drawSpellBolt3D）
  // =========================================================================
  const BOLT_PAL = {
    red:     { out: '#541218', body: '#d93232', mid: '#ff6e4a', core: '#fff2d6' },
    green:   { out: '#104022', body: '#2bb85a', mid: '#72e67c', core: '#edffe0' },
    blue:    { out: '#102854', body: '#2c76e6', mid: '#6bc4ff', core: '#e8faff' },
    white:   { out: '#3a4a5c', body: '#9ebad1', mid: '#dff0fa', core: '#ffffff' },
    rainbow: { out: '#2e1c47', body: '#ff527a', mid: '#ffe04d', core: '#ffffff' }
  };

  function drawSpellBolt3D(ctx, bolt, proj) {
    if (!ctx || !bolt || typeof proj !== 'function') return;
    const from = Array.isArray(bolt.from) ? bolt.from : [0, 30, 14];
    const to = Array.isArray(bolt.to) ? bolt.to : [0, -26, 12];
    const k = clamp(Number.isFinite(bolt.k) ? bolt.k : 0, 0, 1);
    const art = BOLT_PAL[bolt.art] ? bolt.art : 'white';
    const big = !!bolt.big;
    const pal = BOLT_PAL[art];
    const u = estimateUnit(proj);
    const arcH = big ? 16 : 11;

    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const lenXY = Math.hypot(dx, dy) || 1;
    const perpX = -dy / lenXY;
    const perpY = dx / lenXY;

    function posAt(t) {
      return [
        lerp(from[0], to[0], t),
        lerp(from[1], to[1], t),
        lerp(from[2] || 0, to[2] || 0, t) + Math.sin(t * Math.PI) * arcH
      ];
    }

    const drawList = [];
    ctx.save();
    try {
      ctx.imageSmoothingEnabled = false;

      const trailN = big ? 6 : 5;
      for (let i = trailN; i >= 1; i--) {
        const tt = Math.max(0, k - i * 0.058);
        if (k < 0.01 && i > 1) continue;
        const pos = posAt(tt);
        const swirlAng = k * 14 - i * 1.1;
        const swirlR = (big ? 2.4 : 1.5) * (i / trailN);
        const wx = pos[0] + perpX * Math.cos(swirlAng) * swirlR;
        const wy = pos[1] + perpY * Math.cos(swirlAng) * swirlR;
        const wz = pos[2] + Math.sin(swirlAng) * swirlR;
        const p = safeProj(proj, wx, wy, wz);
        if (!p) continue;
        const ratio = 1 - i / (trailN + 1);
        const sz = Math.max(u, u * (big ? 3.2 : 2.3) * ratio);
        const cBody = art === 'rainbow' ? RAINBOW_HEX[(i + Math.floor(k * 12)) % RAINBOW_HEX.length] : (i <= 2 ? pal.mid : pal.body);
        const alpha = clamp(0.25 + ratio * 0.72, 0, 1);
        drawList.push({ d: p[2], fn: () => {
          pxCenter(ctx, p[0], p[1], sz + u * 0.8, sz + u * 0.8, pal.out, alpha * 0.8);
          pxCenter(ctx, p[0], p[1], sz, sz, cBody, alpha);
          if (i <= 2) pxCenter(ctx, p[0], p[1], Math.max(u * 0.6, sz * 0.45), Math.max(u * 0.6, sz * 0.45), pal.core, alpha);
        }});
      }

      const headW = posAt(k);
      const hp = safeProj(proj, headW[0], headW[1], headW[2]);
      if (hp) {
        const headR = u * (big ? 3.8 : 2.7);
        const headBody = art === 'rainbow' ? RAINBOW_HEX[Math.floor(k * 14) % RAINBOW_HEX.length] : pal.body;
        const headHi = art === 'rainbow' ? RAINBOW_HEX[(Math.floor(k * 14) + 2) % RAINBOW_HEX.length] : pal.mid;
        drawList.push({ d: hp[2] + 0.5, fn: () => {
          pxDiamond(ctx, hp[0], hp[1], headR, u, pal.out, headBody, headHi, 1);
          pxCenter(ctx, hp[0], hp[1], u * (big ? 1.8 : 1.2), u * (big ? 1.8 : 1.2), pal.core, 1);
          const arm = headR + u * 0.8;
          pxCenter(ctx, hp[0] - arm, hp[1], u, u, pal.core, 0.9);
          pxCenter(ctx, hp[0] + arm, hp[1], u, u, pal.core, 0.9);
          pxCenter(ctx, hp[0], hp[1] - arm, u, u, pal.core, 0.9);
          pxCenter(ctx, hp[0], hp[1] + arm, u, u, pal.core, 0.9);
        }});

        if (big) {
          for (let s = 0; s < 4; s++) {
            const oa = k * 12 + (s * TAU) / 4;
            const ox = headW[0] + perpX * Math.cos(oa) * 6.5;
            const oy = headW[1] + perpY * Math.cos(oa) * 6.5;
            const oz = headW[2] + Math.sin(oa) * 6.5;
            const op = safeProj(proj, ox, oy, oz);
            if (!op) continue;
            const scCol = art === 'rainbow' ? RAINBOW_HEX[(s * 2 + Math.floor(k * 10)) % RAINBOW_HEX.length] : pal.mid;
            drawList.push({ d: op[2], fn: () => {
              pxCenter(ctx, op[0], op[1], u * 1.4, u * 1.4, pal.out, 0.9);
              pxCenter(ctx, op[0], op[1], u * 0.9, u * 0.9, scCol, 1);
            }});
          }
        }
      }

      drawList.sort((a, b) => a.d - b.d);
      for (let i = 0; i < drawList.length; i++) drawList[i].fn();
    } finally {
      ctx.restore();
    }
  }

  // =========================================================================
  // 3. 主角爆发与防御 3D 波纹特效（drawImpactWave3D）
  // =========================================================================
  function drawImpactWave3D(ctx, kind, centerW, k, proj) {
    if (!ctx || typeof proj !== 'function') return;
    const kk = clamp(Number.isFinite(k) ? k : 0, 0, 1);
    const cW = Array.isArray(centerW) ? centerW : [0, 0, 4];
    const cx = Number.isFinite(cW[0]) ? cW[0] : 0;
    const cy = Number.isFinite(cW[1]) ? cW[1] : 0;
    const cz = Number.isFinite(cW[2]) ? cW[2] : 4;
    const u = estimateUnit(proj);
    const drawList = [];

    ctx.save();
    try {
      ctx.imageSmoothingEnabled = false;

      if (kind === 'white_wave') {
        const ease = 1 - Math.pow(1 - kk, 2.2);
        const rad = 4 + ease * 38;
        const fade = clamp(1 - smoothstep(0.55, 1, kk), 0, 1);
        const ringZ = Math.max(0.6, cz * 0.35);

        const corners = [
          [cx + rad, cy, ringZ], [cx, cy + rad, ringZ],
          [cx - rad, cy, ringZ], [cx, cy - rad, ringZ]
        ];
        for (let e = 0; e < 4; e++) {
          const a = corners[e];
          const b = corners[(e + 1) & 3];
          const pa = safeProj(proj, a[0], a[1], a[2]);
          const pb = safeProj(proj, b[0], b[1], b[2]);
          if (pa && pb) {
            const dMid = (pa[2] + pb[2]) * 0.5;
            drawList.push({ d: dMid, fn: () => {
              pxLine(ctx, pa[0], pa[1], pb[0], pb[1], u * 1.9, '#4c6378', fade * 0.85);
              pxLine(ctx, pa[0], pa[1], pb[0], pb[1], u * 1.1, '#ffffff', fade);
            }});
          }
        }
        const rad2 = Math.max(2, rad * 0.62);
        for (let s = 0; s < 16; s++) {
          const ang = (s / 16) * TAU + kk * 1.2;
          const p = safeProj(proj, cx + Math.cos(ang) * rad2, cy + Math.sin(ang) * rad2, ringZ + 1.5);
          if (p) {
            drawList.push({ d: p[2], fn: () => {
              pxCenter(ctx, p[0], p[1], u * 1.3, u * 1.3, '#d6f0ff', fade * 0.85);
            }});
          }
        }
        for (let i = 0; i < 14; i++) {
          const ang = (i / 14) * TAU + hash2i(i, 1, 91) * 0.35;
          const dist = 5 + ease * (24 + hash2i(i, 2, 91) * 18);
          const vz = 14 + hash2i(i, 3, 91) * 14;
          const wz = Math.max(0.5, cz + vz * kk - 22 * kk * kk);
          const p = safeProj(proj, cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist, wz);
          if (p) {
            drawList.push({ d: p[2], fn: () => {
              pxCenter(ctx, p[0], p[1], u * 1.6, u * 1.6, '#56708a', fade * 0.9);
              pxCenter(ctx, p[0], p[1], u, u, '#ffffff', fade);
              pxCenter(ctx, p[0] - u * 1.1, p[1], u * 0.7, u * 0.7, '#d4f2ff', fade * 0.8);
              pxCenter(ctx, p[0] + u * 1.1, p[1], u * 0.7, u * 0.7, '#d4f2ff', fade * 0.8);
            }});
          }
        }
      } else if (kind === 'rainbow_burst') {
        for (let r = 0; r < 3; r++) {
          const rk = clamp((kk - r * 0.14) / 0.72, 0, 1);
          if (rk <= 0 || rk >= 1) continue;
          const ease = 1 - Math.pow(1 - rk, 2);
          const rad = 5 + ease * (32 + r * 8);
          const rz = Math.max(0.8, cz * 0.4 + r * 4.5 + ease * 6);
          const fade = Math.sin(rk * Math.PI);
          const segs = 28;
          for (let s = 0; s < segs; s++) {
            const ang = (s / segs) * TAU + rk * 1.5 * (r % 2 === 0 ? 1 : -1);
            const p = safeProj(proj, cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad, rz);
            if (!p) continue;
            const col = RAINBOW_HEX[(s + r * 2) % RAINBOW_HEX.length];
            drawList.push({ d: p[2], fn: () => {
              pxCenter(ctx, p[0], p[1], u * 2.1, u * 2.1, '#26183b', fade * 0.8);
              pxCenter(ctx, p[0], p[1], u * 1.4, u * 1.4, col, fade);
            }});
          }
        }
        for (let i = 0; i < 28; i++) {
          const ang = hash2i(i, 1, 97) * TAU;
          const spd = 12 + hash2i(i, 2, 97) * 28;
          const vz = 28 + hash2i(i, 3, 97) * 26;
          const wz = Math.max(0.5, cz + vz * kk - 44 * kk * kk);
          const dist = spd * kk;
          const p = safeProj(proj, cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist, wz);
          if (!p) continue;
          const col = RAINBOW_HEX[i % RAINBOW_HEX.length];
          const fade = clamp(1 - smoothstep(0.65, 1, kk), 0, 1);
          drawList.push({ d: p[2], fn: () => {
            pxCenter(ctx, p[0], p[1], u * 1.9, u * 1.9, '#231636', fade * 0.85);
            pxCenter(ctx, p[0], p[1], u * 1.3, u * 1.3, col, fade);
            pxRect(ctx, p[0] - u * 0.5, p[1] - u * 0.5, u * 0.6, u * 0.6, '#ffffff', fade * 0.9);
          }});
        }
      } else if (kind === 'shield_shatter') {
        for (let i = 0; i < 16; i++) {
          const ang = (i / 16) * TAU + (hash2i(i, 1, 107) - 0.5) * 0.35;
          const initR = 8 + hash2i(i, 2, 107) * 5;
          const outSpd = 18 + hash2i(i, 3, 107) * 22;
          const vz = 16 + hash2i(i, 4, 107) * 18;
          const z0 = cz + (hash2i(i, 5, 107) - 0.4) * 10;
          let wz = z0 + vz * kk - 48 * kk * kk;
          if (wz < 0.5) wz = Math.min(6, Math.abs(wz) * 0.35);
          const dist = initR + outSpd * kk;
          const p = safeProj(proj, cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist, wz);
          if (!p) continue;
          const fade = clamp(1 - smoothstep(0.68, 1, kk), 0, 1);
          const sz = u * (i % 3 === 0 ? 2.4 : 1.8);
          drawList.push({ d: p[2], fn: () => {
            pxDiamond(ctx, p[0], p[1], sz, u, '#1e4a5c', '#52cbe0', '#ebfcff', fade);
          }});
        }
      } else if (kind === 'ward_block' || true) {
        // 护壁格挡：主角身前展开六边形青白像素盾阵并弹开火屑
        const fade = Math.sin(clamp(kk, 0, 1) * Math.PI);
        const expand = smoothstep(0, 0.25, kk);
        const faceY = cy - 9;
        const hexCenters = [
          [0, 0], [8.5, 0], [-8.5, 0],
          [4.3, 7.2], [-4.3, 7.2], [4.3, -7.2], [-4.3, -7.2]
        ];
        for (let h = 0; h < hexCenters.length; h++) {
          const ox = hexCenters[h][0] * expand;
          const oz = hexCenters[h][1] * expand;
          const hexR = 4.6 * expand;
          const pc = safeProj(proj, cx + ox, faceY, cz + oz);
          if (!pc) continue;
          drawList.push({ d: pc[2], fn: () => {
            const verts = [];
            for (let v = 0; v < 6; v++) {
              const a = (v / 6) * TAU + Math.PI / 6;
              const pv = safeProj(proj, cx + ox + Math.cos(a) * hexR, faceY, cz + oz + Math.sin(a) * hexR);
              if (pv) verts.push(pv);
            }
            if (verts.length === 6) {
              pxCenter(ctx, pc[0], pc[1], u * 3.2 * expand, u * 3.2 * expand, '#5ce0f5', fade * 0.24);
              for (let v = 0; v < 6; v++) {
                const a = verts[v];
                const b = verts[(v + 1) % 6];
                pxLine(ctx, a[0], a[1], b[0], b[1], Math.max(1, u * 0.9), h === 0 ? '#ebfcff' : '#7ae8fa', fade * 0.95);
              }
            }
          }});
        }
        for (let i = 0; i < 10; i++) {
          const ang = (hash2i(i, 1, 113) - 0.5) * 2.4;
          const dist = 3 + kk * (18 + hash2i(i, 2, 113) * 16);
          const wx = cx + Math.sin(ang) * dist;
          const wy = faceY - kk * (10 + hash2i(i, 3, 113) * 14);
          const wz = cz + Math.cos(ang) * dist * 0.7 - 16 * kk * kk;
          const ps = safeProj(proj, wx, wy, Math.max(0.5, wz));
          if (ps) {
            drawList.push({ d: ps[2] + 0.5, fn: () => {
              pxCenter(ctx, ps[0], ps[1], u * 1.3, u * 1.3, '#ff8e36', fade);
              pxCenter(ctx, ps[0], ps[1], u * 0.7, u * 0.7, '#fff4b0', fade);
            }});
          }
        }
      }

      drawList.sort((a, b) => a.d - b.d);
      for (let i = 0; i < drawList.length; i++) drawList[i].fn();
    } finally {
      ctx.restore();
    }
  }

  // =========================================================================
  // 4. 8 只怪专属 3D 像素出手特效（drawAttackFx3D）
  // =========================================================================
  function drawAttackFx3D(ctx, kind, k, fromW, toW, proj) {
    if (!ctx || typeof proj !== 'function') return;
    const kk = clamp(Number.isFinite(k) ? k : 0, 0, 1);
    const f = Array.isArray(fromW) ? fromW : [0, -26, 12];
    const t = Array.isArray(toW) ? toW : [0, 30, 10];
    const fx = Number.isFinite(f[0]) ? f[0] : 0;
    const fy = Number.isFinite(f[1]) ? f[1] : -26;
    const fz = Number.isFinite(f[2]) ? f[2] : 12;
    const tx = Number.isFinite(t[0]) ? t[0] : 0;
    const ty = Number.isFinite(t[1]) ? t[1] : 30;
    const tz = Number.isFinite(t[2]) ? t[2] : 10;
    const dx = tx - fx;
    const dy = ty - fy;
    const lenXY = Math.hypot(dx, dy) || 1;
    const dirX = dx / lenXY;
    const dirY = dy / lenXY;
    const perpX = -dirY;
    const perpY = dirX;
    const u = estimateUnit(proj);
    const drawList = [];

    ctx.save();
    try {
      ctx.imageSmoothingEnabled = false;

      if (kind === 'spit') {
        if (kk < 0.62) {
          const fk = kk / 0.62;
          for (let tr = 3; tr >= 0; tr--) {
            const tk = Math.max(0, fk - tr * 0.06);
            const wx = lerp(fx, tx, tk);
            const wy = lerp(fy, ty, tk);
            const wz = lerp(fz, Math.max(2, tz * 0.4), tk) + Math.sin(tk * Math.PI) * 20;
            const p = safeProj(proj, wx, wy, wz);
            if (!p) continue;
            const sc = tr === 0 ? 1 : (0.68 - tr * 0.14);
            drawList.push({ d: p[2], fn: () => {
              pxDiamond(ctx, p[0], p[1], u * 3.0 * sc, u, '#16454f', '#2da89e', '#8af2e2', tr === 0 ? 1 : 0.78);
              if (tr === 0) pxRect(ctx, p[0] - u, p[1] - u, u, u, '#e8fffb', 1);
            }});
          }
        } else {
          const sk = (kk - 0.62) / 0.38;
          const fade = clamp(1 - sk, 0, 1);
          const ringR = 3 + sk * 18;
          for (let s = 0; s < 14; s++) {
            const ang = (s / 14) * TAU;
            const pr = safeProj(proj, tx + Math.cos(ang) * ringR, ty + Math.sin(ang) * ringR, 0.5);
            if (pr) {
              drawList.push({ d: pr[2], fn: () => {
                pxCenter(ctx, pr[0], pr[1], u * 1.4, u * 1.4, '#4ec7ba', fade * 0.85);
              }});
            }
          }
          for (let i = 0; i < 10; i++) {
            const ang = (i / 10) * TAU + hash2i(i, 1, 121) * 0.4;
            const dist = 2 + sk * (14 + hash2i(i, 2, 121) * 14);
            const wz = Math.max(0.5, 4 + (16 + hash2i(i, 3, 121) * 12) * sk - 34 * sk * sk);
            const pd = safeProj(proj, tx + Math.cos(ang) * dist, ty + Math.sin(ang) * dist, wz);
            if (pd) {
              drawList.push({ d: pd[2], fn: () => {
                pxCenter(ctx, pd[0], pd[1], u * 1.7, u * 1.7, '#184a54', fade);
                pxCenter(ctx, pd[0], pd[1], u * 1.1, u * 1.1, '#72e6d8', fade);
              }});
            }
          }
        }
      } else if (kind === 'puff') {
        const travelK = Math.min(1, kk / 0.72);
        for (let i = 0; i < 6; i++) {
          const pk = clamp(travelK - i * 0.085, 0, 1);
          if (pk <= 0) continue;
          const sway = Math.sin(pk * 11 + i * 1.7) * 3.5;
          const hop = Math.abs(Math.sin(pk * 8 + i)) * 4.5;
          const wx = lerp(fx, tx, pk) + perpX * sway;
          const wy = lerp(fy, ty, pk) + perpY * sway;
          const wz = lerp(fz * 0.65, tz * 0.75, pk) + hop;
          const p = safeProj(proj, wx, wy, wz);
          if (!p) continue;
          const fade = kk > 0.78 ? clamp((1 - kk) / 0.22, 0, 1) : 1;
          const sz = u * (2.6 - i * 0.22);
          drawList.push({ d: p[2], fn: () => {
            pxCenter(ctx, p[0], p[1], sz + u, sz * 0.8 + u, '#5e6b63', fade * 0.85);
            pxCenter(ctx, p[0], p[1], sz, sz * 0.85, '#d3ded4', fade);
            pxCenter(ctx, p[0] - u * 0.4, p[1] - u * 0.4, sz * 0.7, sz * 0.6, '#f7fcf7', fade);
          }});
        }
        if (kk > 0.64) {
          const ik = (kk - 0.64) / 0.36;
          const fade = 1 - ik;
          const pt = safeProj(proj, tx, ty, tz);
          if (pt) {
            const arm = u * (2 + ik * 9);
            drawList.push({ d: pt[2] + 1, fn: () => {
              pxLine(ctx, pt[0] - arm, pt[1], pt[0] + arm, pt[1], u * 1.4, '#ffffff', fade);
              pxLine(ctx, pt[0], pt[1] - arm, pt[0], pt[1] + arm, u * 1.4, '#ffffff', fade);
              pxCenter(ctx, pt[0], pt[1], u * 3, u * 3, '#fff6c4', fade);
            }});
          }
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU;
            const d = 3 + ik * 14;
            const ps = safeProj(proj, tx + Math.cos(a) * d, ty + Math.sin(a) * d, tz + Math.sin(ik * Math.PI) * 6);
            if (ps) {
              drawList.push({ d: ps[2], fn: () => {
                pxCenter(ctx, ps[0], ps[1], u * 1.3, u * 1.3, '#edf7ee', fade);
              }});
            }
          }
        }
      } else if (kind === 'club') {
        const swingK = clamp(kk / 0.52, 0, 1);
        const swingEase = swingK * swingK;
        const clubFade = kk < 0.72 ? 1 : clamp((1 - kk) / 0.28, 0, 1);
        const pivotW = [tx - dirX * 9, ty - dirY * 9, tz + 8];
        const angNow = lerp(-2.25, 0.28, swingEase);

        if (swingK > 0.15) {
          const steps = 6;
          for (let s = 0; s < steps; s++) {
            const a = lerp(Math.max(-2.25, angNow - 1.35), angNow, s / steps);
            const tipX = pivotW[0] + dirX * Math.cos(a) * 18;
            const tipY = pivotW[1] + dirY * Math.cos(a) * 18;
            const tipZ = pivotW[2] - Math.sin(a) * 18;
            const pa = safeProj(proj, tipX, tipY, Math.max(1, tipZ));
            if (pa) {
              drawList.push({ d: pa[2] - 0.2, fn: () => {
                pxCenter(ctx, pa[0], pa[1], u * 1.8, u * 1.8, '#e3c48f', (s / steps) * 0.55 * clubFade);
              }});
            }
          }
        }
        const h0 = safeProj(proj, pivotW[0], pivotW[1], pivotW[2]);
        const h1 = safeProj(proj,
          pivotW[0] + dirX * Math.cos(angNow) * 18,
          pivotW[1] + dirY * Math.cos(angNow) * 18,
          Math.max(2, pivotW[2] - Math.sin(angNow) * 18)
        );
        if (h0 && h1) {
          drawList.push({ d: Math.max(h0[2], h1[2]) + 0.5, fn: () => {
            pxLine(ctx, h0[0], h0[1], h1[0], h1[1], u * 2.1, '#3b2212', clubFade);
            pxLine(ctx, h0[0], h0[1], h1[0], h1[1], u * 1.3, '#7d4d2a', clubFade);
            pxCenter(ctx, h1[0], h1[1], u * 3.8, u * 3.8, '#3b2212', clubFade);
            pxCenter(ctx, h1[0], h1[1], u * 2.7, u * 2.7, '#8f5a32', clubFade);
            pxCenter(ctx, h1[0], h1[1], u * 2.8, u * 0.9, '#9ba6ab', clubFade);
          }});
        }
        if (kk > 0.46) {
          const ik = (kk - 0.46) / 0.54;
          const fade = clamp(1 - smoothstep(0.55, 1, ik), 0, 1);
          const crackLen = 4 + smoothstep(0, 0.35, ik) * 18;
          for (let b = 0; b < 5; b++) {
            const ba = (b / 5) * TAU + 0.3;
            const p0 = safeProj(proj, tx, ty, 0.3);
            const pM = safeProj(proj, tx + Math.cos(ba + 0.18) * crackLen * 0.55, ty + Math.sin(ba + 0.18) * crackLen * 0.55, 0.3);
            const pE = safeProj(proj, tx + Math.cos(ba) * crackLen, ty + Math.sin(ba) * crackLen, 0.3);
            if (p0 && pM && pE) {
              drawList.push({ d: p0[2] - 1, fn: () => {
                pxLine(ctx, p0[0], p0[1], pM[0], pM[1], u, '#261e1a', fade * 0.9);
                pxLine(ctx, pM[0], pM[1], pE[0], pE[1], Math.max(1, u * 0.75), '#3d3028', fade * 0.85);
              }});
            }
          }
          for (let r = 0; r < 12; r++) {
            const ra = (r / 12) * TAU + hash2i(r, 1, 131) * 0.4;
            const rd = 3 + ik * (12 + hash2i(r, 2, 131) * 15);
            const rz = Math.max(0.5, (15 + hash2i(r, 3, 131) * 14) * ik - 32 * ik * ik);
            const pr = safeProj(proj, tx + Math.cos(ra) * rd, ty + Math.sin(ra) * rd, rz);
            if (pr) {
              drawList.push({ d: pr[2], fn: () => {
                pxCenter(ctx, pr[0], pr[1], u * 1.7, u * 1.7, '#38302a', fade);
                pxCenter(ctx, pr[0], pr[1], u * 1.1, u * 1.1, r % 2 === 0 ? '#8c7e6c' : '#695b49', fade);
              }});
            }
          }
        }
      } else if (kind === 'petals') {
        for (let i = 0; i < 9; i++) {
          const delay = i * 0.045;
          const pk = clamp((kk - delay) / (1 - delay * 0.8), 0, 1);
          if (pk <= 0) continue;
          const fade = Math.min(1, pk * 6) * clamp(1 - smoothstep(0.82, 1, pk), 0, 1);
          const spiralR = Math.sin(pk * Math.PI) * (9 + (i % 3) * 3.5);
          const ang = pk * 9.5 + (i / 9) * TAU;
          const wx = lerp(fx, tx, pk) + perpX * Math.cos(ang) * spiralR;
          const wy = lerp(fy, ty, pk) + perpY * Math.cos(ang) * spiralR;
          const wz = lerp(fz, tz, pk) + Math.sin(ang) * spiralR * 0.75 + Math.sin(pk * Math.PI) * 5;
          const p = safeProj(proj, wx, wy, Math.max(0.5, wz));
          if (!p) continue;
          const col = i % 3 === 0 ? '#fff2f6' : (i % 3 === 1 ? '#f7b2c8' : '#e684a6');
          const flip = Math.sin(kk * 18 + i) > 0;
          drawList.push({ d: p[2], fn: () => {
            pxCenter(ctx, p[0], p[1], flip ? u * 2.2 : u * 1.4, flip ? u * 1.4 : u * 2.2, '#994060', fade * 0.85);
            pxCenter(ctx, p[0], p[1], flip ? u * 1.6 : u, flip ? u : u * 1.6, col, fade);
          }});
        }
      } else if (kind === 'fruit') {
        if (kk < 0.65) {
          const fk = kk / 0.65;
          const wx = lerp(fx, tx, fk);
          const wy = lerp(fy, ty, fk);
          const wz = lerp(fz + 2, tz, fk) + Math.sin(fk * Math.PI) * 28;
          const p = safeProj(proj, wx, wy, wz);
          if (p) {
            drawList.push({ d: p[2], fn: () => {
              pxDiamond(ctx, p[0], p[1], u * 3.2, u, '#6b1416', '#d92e28', '#ff7c5c', 1);
              const stemX = p[0] + Math.cos(fk * 10) * u * 2.4;
              const stemY = p[1] - Math.sin(fk * 10) * u * 1.4 - u * 2.2;
              pxCenter(ctx, stemX, stemY, u * 1.4, u * 1.4, '#296b27', 1);
              pxCenter(ctx, stemX + u * 0.8, stemY - u * 0.4, u * 1.2, u * 0.9, '#52ba4a', 1);
            }});
          }
        } else {
          const sk = (kk - 0.65) / 0.35;
          const fade = clamp(1 - sk * 0.92, 0, 1);
          const pt = safeProj(proj, tx, ty, tz);
          if (pt) {
            drawList.push({ d: pt[2], fn: () => {
              const r = u * (2.2 + sk * 4.5);
              pxDiamond(ctx, pt[0], pt[1], r, u, '#6b0f16', '#c9242e', '#ff6e66', fade * 0.85);
            }});
          }
          for (let i = 0; i < 14; i++) {
            const ang = (i / 14) * TAU + hash2i(i, 1, 149) * 0.35;
            const dist = 3 + sk * (14 + hash2i(i, 2, 149) * 16);
            const wz = Math.max(0.4, tz + (12 + hash2i(i, 3, 149) * 14) * sk - 36 * sk * sk);
            const pd = safeProj(proj, tx + Math.cos(ang) * dist, ty + Math.sin(ang) * dist, wz);
            if (pd) {
              drawList.push({ d: pd[2], fn: () => {
                pxCenter(ctx, pd[0], pd[1], u * 1.8, u * 1.8, '#7a1118', fade);
                pxCenter(ctx, pd[0], pd[1], u * 1.1, u * 1.1, i % 2 === 0 ? '#e3323b' : '#ff7066', fade);
              }});
            }
          }
        }
      } else if (kind === 'claw') {
        const faceX = tx - dirX * 7;
        const faceY = ty - dirY * 7;
        const fade = clamp(1 - smoothstep(0.58, 1, kk), 0, 1);
        for (let s = 0; s < 3; s++) {
          const sk = clamp((kk - s * 0.08) / 0.55, 0, 1);
          if (sk <= 0) continue;
          const off = (s - 1) * 5.2;
          const segs = 9;
          const maxSeg = Math.max(1, Math.floor(segs * sk));
          for (let i = 0; i < maxSeg; i++) {
            const t0 = i / segs;
            const t1 = (i + 1) / segs;
            const a0 = lerp(-12, 12, t0);
            const a1 = lerp(-12, 12, t1);
            const bow0 = Math.sin(t0 * Math.PI) * 3.5;
            const bow1 = Math.sin(t1 * Math.PI) * 3.5;
            const p0 = safeProj(proj, faceX + perpX * (a0 + off) - dirX * bow0, faceY + perpY * (a0 + off) - dirY * bow0, tz + 9 - a0 * 0.65);
            const p1 = safeProj(proj, faceX + perpX * (a1 + off) - dirX * bow1, faceY + perpY * (a1 + off) - dirY * bow1, tz + 9 - a1 * 0.65);
            if (p0 && p1) {
              const thick = 0.6 + Math.sin(((t0 + t1) * 0.5) * Math.PI) * 0.9;
              drawList.push({ d: (p0[2] + p1[2]) * 0.5, fn: () => {
                pxLine(ctx, p0[0], p0[1], p1[0], p1[1], u * 2.2 * thick, '#781212', fade * 0.9);
                pxLine(ctx, p0[0], p0[1], p1[0], p1[1], u * 1.4 * thick, '#f23b24', fade);
                pxLine(ctx, p0[0], p0[1], p1[0], p1[1], Math.max(1, u * 0.7 * thick), '#fff7db', fade);
              }});
            }
          }
        }
      } else if (kind === 'bite') {
        const jawOpen = kk < 0.34
          ? lerp(4, 15, smoothstep(0, 0.34, kk))
          : (kk < 0.54 ? lerp(15, 0.8, smoothstep(0.34, 0.54, kk)) : lerp(0.8, 3, smoothstep(0.54, 1, kk)));
        const fade = clamp(1 - smoothstep(0.68, 1, kk), 0, 1);

        for (let row = 0; row < 2; row++) {
          const isUpper = row === 0;
          const cnt = isUpper ? 5 : 4;
          for (let i = 0; i < cnt; i++) {
            const lat = (i - (cnt - 1) * 0.5) * 4.8;
            const curveY = Math.cos(((i + 0.5) / cnt - 0.5) * Math.PI) * 3.5;
            const wx = tx + perpX * lat - dirX * (4 + curveY);
            const wy = ty + perpY * lat - dirY * (4 + curveY);
            const wz = tz + (isUpper ? jawOpen : -jawOpen * 0.75);
            const p = safeProj(proj, wx, wy, Math.max(0.5, wz));
            if (!p) continue;
            const fangH = (i === 0 || i === cnt - 1) ? 4 : 3;
            drawList.push({ d: p[2], fn: () => {
              const dir = isUpper ? 1 : -1;
              for (let s = 0; s < fangH; s++) {
                const wPx = Math.max(1, fangH - s);
                pxCenter(ctx, p[0], p[1] + dir * s * u, (wPx + 1) * u, u * 1.1, '#3b2c38', fade);
                pxCenter(ctx, p[0], p[1] + dir * s * u, wPx * u, u, s === 0 ? '#d9c8a9' : '#f7f0de', fade);
              }
            }});
          }
        }
        if (kk > 0.50) {
          const ik = (kk - 0.50) / 0.50;
          const sf = 1 - ik;
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * TAU;
            const d = 2 + ik * 16;
            const ps = safeProj(proj, tx + perpX * Math.cos(a) * d, ty + perpY * Math.cos(a) * d, tz + Math.sin(a) * d * 0.7);
            if (ps) {
              drawList.push({ d: ps[2] + 0.5, fn: () => {
                pxCenter(ctx, ps[0], ps[1], u * 1.5, u * 1.5, '#ff8f42', sf);
                pxCenter(ctx, ps[0], ps[1], u * 0.8, u * 0.8, '#fff7cc', sf);
              }});
            }
          }
        }
      } else if (kind === 'roots' || true) {
        const rootCfg = [
          { ang: 0.2,  dist: 7.5, maxH: 22, lean: 2.2, delay: 0.00 },
          { ang: 1.5,  dist: 9.0, maxH: 19, lean: 3.0, delay: 0.06 },
          { ang: 2.7,  dist: 8.0, maxH: 24, lean: 2.5, delay: 0.10 },
          { ang: 4.1,  dist: 9.5, maxH: 18, lean: 2.8, delay: 0.04 },
          { ang: 5.3,  dist: 7.0, maxH: 21, lean: 2.0, delay: 0.12 }
        ];
        for (let r = 0; r < rootCfg.length; r++) {
          const rc = rootCfg[r];
          const rk = clamp((kk - rc.delay) / (1 - rc.delay), 0, 1);
          if (rk <= 0) continue;
          const rise = rk < 0.45 ? smoothstep(0, 0.45, rk) : (rk < 0.75 ? 1 : 1 - smoothstep(0.75, 1, rk));
          const curH = rc.maxH * rise;
          if (curH < 1) continue;
          const bx = tx + Math.cos(rc.ang) * rc.dist;
          const by = ty + Math.sin(rc.ang) * rc.dist;
          const segs = 6;
          for (let s = 0; s < segs; s++) {
            const frac = s / segs;
            const wz = frac * curH;
            const lean = frac * frac * rc.lean;
            const wx = bx - Math.cos(rc.ang) * lean + Math.sin(frac * 4 + r) * 0.9;
            const wy = by - Math.sin(rc.ang) * lean;
            const p = safeProj(proj, wx, wy, wz);
            if (!p) continue;
            const wBlk = Math.max(u, u * (3.1 - frac * 2.0));
            const hBlk = Math.max(u, u * 2.1);
            const col = s === segs - 1 ? '#578c46' : (s % 2 === 0 ? '#664026' : '#855635');
            drawList.push({ d: p[2] + frac * 0.1, fn: () => {
              pxCenter(ctx, p[0], p[1], wBlk + u * 0.9, hBlk + u * 0.6, '#2e1c10', 1);
              pxCenter(ctx, p[0], p[1], wBlk, hBlk, col, 1);
            }});
          }
        }
        for (let i = 0; i < 14; i++) {
          const ang = (i / 14) * TAU + hash2i(i, 1, 163) * 0.4;
          const dist = 5 + kk * (14 + hash2i(i, 2, 163) * 14);
          const wz = Math.max(0.4, (16 + hash2i(i, 3, 163) * 14) * kk - 34 * kk * kk);
          const pd = safeProj(proj, tx + Math.cos(ang) * dist, ty + Math.sin(ang) * dist, wz);
          if (!pd) continue;
          const fade = clamp(1 - smoothstep(0.62, 1, kk), 0, 1);
          drawList.push({ d: pd[2], fn: () => {
            pxCenter(ctx, pd[0], pd[1], u * 1.6, u * 1.6, '#2b1e14', fade);
            pxCenter(ctx, pd[0], pd[1], u * 1.0, u * 1.0, i % 3 === 0 ? '#4d7a3c' : '#6e5236', fade);
          }});
        }
      }

      drawList.sort((a, b) => a.d - b.d);
      for (let i = 0; i < drawList.length; i++) drawList[i].fn();
    } finally {
      ctx.restore();
    }
  }

  ROOT.Code00ArtPacks.groundVfx = {
    id: 'groundVfx',
    version: 1,
    name: '六生态可旋转像素地面与3D战斗特效',
    BIOME_IDS: BIOME_IDS.slice(),
    init,
    buildGroundTile,
    drawGroundAmbient3D,
    drawSpellBolt3D,
    drawImpactWave3D,
    drawAttackFx3D
  };
})(typeof window !== 'undefined' ? window : globalThis);

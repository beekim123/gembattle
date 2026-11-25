'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { clamp, distSeg3Sq, distTri3Sq, hexToRgba } = PW.Math;

  const MAT_BASE = 128;

  // 创建独立调色板上下文（支持 <= 48 色校验、自亮键隔离、零重建模换色）
  function createPaletteSpec(config) {
    const pal = config.pal || {};
    const glowKeys = new Set(config.glowKeys || ['emissiveMid', 'emissiveHot', 'emissiveCore']);
    const keys = Object.keys(pal);
    if (keys.length > 48) {
      throw new Error(`Palette exceeds 48 colors (${keys.length})`);
    }
    const keyToId = Object.create(null);
    const idToKey = [null];
    const idToRgba = [null];
    const glowIdSet = new Set();

    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const id = i + 1;
      keyToId[k] = id;
      idToKey[id] = k;
      idToRgba[id] = hexToRgba(pal[k]);
      if (glowKeys.has(k)) glowIdSet.add(id);
    }

    const partNames = ['none', ...(config.parts || [])];
    const partId = Object.create(null);
    for (let i = 0; i < partNames.length; i++) partId[partNames[i]] = i;

    const numParts = partNames.length;
    const noCreaseLut = new Uint8Array(numParts * numParts);
    for (const pair of (config.noCrease || [])) {
      const ia = partId[pair[0]], ib = partId[pair[1]];
      if (ia && ib) {
        noCreaseLut[ia * numParts + ib] = 1;
        noCreaseLut[ib * numParts + ia] = 1;
      }
    }

    const matNames = [null, ...(config.materials ? Object.keys(config.materials) : [])];
    const matId = Object.create(null);
    const rampsByMat = Object.create(null);
    for (let i = 1; i < matNames.length; i++) {
      const mName = matNames[i];
      matId[mName] = i;
      const rampKeys = config.materials[mName];
      rampsByMat[i] = rampKeys.map(rk => keyToId[rk]);
    }

    const mat = (name) => MAT_BASE + matId[name];
    const protectedParts = new Set((config.protectedParts || ['eye']).map(n => partId[n]).filter(Boolean));

    function buildRgbaTable(skin) {
      const tbl = idToRgba.slice();
      if (skin && skin.pal) {
        for (const k in skin.pal) {
          const id = keyToId[k];
          if (id) tbl[id] = hexToRgba(skin.pal[k]);
        }
      }
      return tbl;
    }

    return {
      pal, keys, keyToId, idToKey, idToRgba, glowKeys, glowIdSet,
      partNames, partId, numParts, noCreaseLut,
      matId, rampsByMat, mat, protectedParts, buildRgbaTable
    };
  }

  // 零重建模换色：直接按 Uint8Array 索引刷写长条图集 ImageData
  function recolorAsset(asset, rgbaTable, glowIdSet) {
    const { w, d, h, grid, activeLayers, glowLayers, glowSlot, strip, glowStrip, sim, eim } = asset;
    const stripW = w * h;
    const glowW = w * glowLayers.length;
    const sData = sim.data;
    const eData = eim ? eim.data : null;

    for (let li = 0; li < activeLayers.length; li++) {
      const z = activeLayers[li];
      const gxOff = z * w;
      const gSlot = glowSlot[z];
      const zBase = z * d * w;
      for (let y = 0; y < d; y++) {
        const row = zBase + y * w;
        const sRow = y * stripW + gxOff;
        const eRow = gSlot >= 0 ? (y * glowW + gSlot * w) : -1;
        for (let x = 0; x < w; x++) {
          const id = grid[row + x];
          if (!id) continue;
          const rgba = rgbaTable[id];
          const si = (sRow + x) * 4;
          sData[si] = rgba[0]; sData[si + 1] = rgba[1]; sData[si + 2] = rgba[2]; sData[si + 3] = 255;
          if (eData && eRow >= 0 && glowIdSet.has(id)) {
            const ei = (eRow + x) * 4;
            eData[ei] = rgba[0]; eData[ei + 1] = rgba[1]; eData[ei + 2] = rgba[2]; eData[ei + 3] = 255;
          }
        }
      }
    }
    strip.getContext('2d').putImageData(sim, 0, 0);
    if (glowStrip && eim) glowStrip.getContext('2d').putImageData(eim, 0, 0);
    // 版本号 +1：渲染器里这个部件的旧烘焙图自动作废（换色不用再手动清缓存）
    asset.rev = (asset.rev | 0) + 1;
  }

  class VoxelModel {
    constructor(w, d, h, spec) {
      this.w = w; this.d = d; this.h = h;
      this.spec = spec;
      const len = w * d * h;
      this.grid = new Uint8Array(len);
      this.parts = new Uint8Array(len);
    }

    idx(x, y, z) { return (z * this.d + y) * this.w + x; }
    inB(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.w && y < this.d && z < this.h; }
    getId(x, y, z) { return this.inB(x, y, z) ? this.grid[this.idx(x, y, z)] : 0; }
    getPartId(x, y, z) { return this.inB(x, y, z) ? this.parts[this.idx(x, y, z)] : 0; }

    setRaw(x, y, z, val, partId) {
      if (!this.inB(x, y, z)) return;
      const i = this.idx(x, y, z);
      this.grid[i] = val;
      this.parts[i] = partId;
    }

    fillAABB(X0, X1, Y0, Y1, Z0, Z1, fn) {
      const hw = this.w * 0.5 - 0.5, hd = this.d * 0.5 - 0.5;
      const x0 = clamp(Math.floor(X0 + hw), 0, this.w - 1);
      const x1 = clamp(Math.ceil(X1 + hw),  0, this.w - 1);
      const y0 = clamp(Math.floor(Y0 + hd), 0, this.d - 1);
      const y1 = clamp(Math.ceil(Y1 + hd),  0, this.d - 1);
      const z0 = clamp(Math.floor(Z0),      0, this.h - 1);
      const z1 = clamp(Math.ceil(Z1),       0, this.h - 1);
      for (let z = z0; z <= z1; z++) {
        for (let y = y0; y <= y1; y++) {
          const Y = y - hd;
          for (let x = x0; x <= x1; x++) fn(x, y, z, x - hw, Y);
        }
      }
    }

    paintCapsule(ax, ay, az, bx, by, bz, r0, r1, val, partId, overwrite = true) {
      const pad = Math.max(r0, r1) + 0.6;
      this.fillAABB(
        Math.min(ax, bx) - pad, Math.max(ax, bx) + pad,
        Math.min(ay, by) - pad, Math.max(ay, by) + pad,
        Math.min(az, bz) - pad, Math.max(az, bz) + pad,
        (x, y, z, X, Y) => {
          const i = this.idx(x, y, z);
          if (!overwrite && this.grid[i]) return;
          const [d2, t] = distSeg3Sq(X, Y, z, ax, ay, az, bx, by, bz);
          const r = r0 + (r1 - r0) * t;
          if (d2 <= r * r) { this.grid[i] = val; this.parts[i] = partId; }
        }
      );
    }

    paintEllipsoid(cx, cy, cz, rx, ry, rz, val, partId, overwrite = true) {
      this.fillAABB(
        cx - rx - 0.5, cx + rx + 0.5,
        cy - ry - 0.5, cy + ry + 0.5,
        cz - rz - 0.5, cz + rz + 0.5,
        (x, y, z, X, Y) => {
          const i = this.idx(x, y, z);
          if (!overwrite && this.grid[i]) return;
          const dx = (X - cx) / rx, dy = (Y - cy) / ry, dz = (z - cz) / rz;
          if (dx * dx + dy * dy + dz * dz <= 1.0) { this.grid[i] = val; this.parts[i] = partId; }
        }
      );
    }

    paintFinTri(a, b, c, halfThick, val, partId, overwrite = false) {
      const pad = halfThick + 0.6;
      const ht2 = halfThick * halfThick;
      this.fillAABB(
        Math.min(a[0], b[0], c[0]) - pad, Math.max(a[0], b[0], c[0]) + pad,
        Math.min(a[1], b[1], c[1]) - pad, Math.max(a[1], b[1], c[1]) + pad,
        Math.min(a[2], b[2], c[2]) - pad, Math.max(a[2], b[2], c[2]) + pad,
        (x, y, z, X, Y) => {
          const i = this.idx(x, y, z);
          if (!overwrite && this.grid[i]) return;
          if (distTri3Sq(X, Y, z, a, b, c) <= ht2) { this.grid[i] = val; this.parts[i] = partId; }
        }
      );
    }

    despeckle(protectedParts = this.spec.protectedParts) {
      const src = this.grid.slice(), prt = this.parts.slice();
      const { w, d, h } = this;
      const at = (x, y, z) => (x >= 0 && y >= 0 && z >= 0 && x < w && y < d && z < h) ? src[(z * d + y) * w + x] : 0;
      for (let z = 0; z < h; z++) for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) {
        const i = (z * d + y) * w + x;
        if (!src[i] || protectedParts.has(prt[i])) continue;
        if (!at(x+1,y,z) && !at(x-1,y,z) && !at(x,y+1,z) && !at(x,y-1,z) && !at(x,y,z+1) && !at(x,y,z-1)) {
          this.grid[i] = 0; this.parts[i] = 0;
        }
      }
    }

    applyArtShading(keepSoftBottom = true) {
      const { w, d, h, spec } = this;
      const { numParts, noCreaseLut, rampsByMat } = spec;
      const src = this.grid.slice(), prt = this.parts.slice();
      const atG = (x, y, z) => (x >= 0 && y >= 0 && z >= 0 && x < w && y < d && z < h) ? src[(z * d + y) * w + x] : 0;
      const atP = (x, y, z) => (x >= 0 && y >= 0 && z >= 0 && x < w && y < d && z < h) ? prt[(z * d + y) * w + x] : 0;

      const pMinZ = new Int16Array(numParts).fill(999);
      const pMaxZ = new Int16Array(numParts).fill(-1);
      for (let z = 0; z < h; z++) for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) {
        const p = prt[(z * d + y) * w + x];
        if (p) { if (z < pMinZ[p]) pMinZ[p] = z; if (z > pMaxZ[p]) pMaxZ[p] = z; }
      }

      const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,-1]];
      for (let z = 0; z < h; z++) for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) {
        const i = (z * d + y) * w + x;
        const v = src[i];
        if (v < MAT_BASE) continue;
        const ramp = rampsByMat[v - MAT_BASE];
        if (!ramp) continue;

        const myP = prt[i];
        const topEmpty = !atG(x, y, z + 1);
        const botEmpty = z > 0 && !atG(x, y, z - 1);

        let crease = false;
        const lutRow = myP * numParts;
        for (let k = 0; k < 5; k++) {
          const np = atP(x + dirs[k][0], y + dirs[k][1], z + dirs[k][2]);
          if (np && np !== myP && !noCreaseLut[lutRow + np]) { crease = true; break; }
        }

        let upperOcc = 0;
        if (!topEmpty) {
          for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (atG(x + ox, y + oy, z + 1)) upperOcc++;
        }

        const span = Math.max(1, pMaxZ[myP] - pMinZ[myP]);
        const localZ = (z - pMinZ[myP]) / span;
        let idx = 1;
        if (botEmpty || (!keepSoftBottom && z === 0)) idx = 0;
        else if (crease && !topEmpty) idx = 0;
        else if (upperOcc >= 8 && localZ < 0.36) idx = 0;
        else if (topEmpty) idx = (crease || upperOcc >= 8) ? 1 : 2;
        else if (span >= 12 && localZ < 0.14) idx = 0;
        else idx = 1;
        this.grid[i] = ramp[clamp(idx, 0, ramp.length - 1)];
      }
    }

    toStripAsset(makeCanvas, meta = {}) {
      const { w, d, h, spec } = this;
      const activeLayers = [], glowLayers = [];
      for (let z = 0; z < h; z++) {
        let hasPx = false, hasGlow = false;
        const zBase = z * d * w;
        for (let i = 0; i < d * w; i++) {
          const id = this.grid[zBase + i];
          if (!id) continue;
          hasPx = true;
          if (spec.glowIdSet.has(id)) hasGlow = true;
        }
        if (hasPx) activeLayers.push(z);
        if (hasGlow) glowLayers.push(z);
      }

      const strip = makeCanvas(w * h, d);
      const sim = strip.getContext('2d').createImageData(w * h, d);
      const hasGlow = glowLayers.length > 0;
      const glowStrip = hasGlow ? makeCanvas(w * glowLayers.length, d) : null;
      const eim = glowStrip ? glowStrip.getContext('2d').createImageData(w * glowLayers.length, d) : null;
      const glowSlot = new Int16Array(h).fill(-1);
      for (let i = 0; i < glowLayers.length; i++) glowSlot[glowLayers[i]] = i;

      const foot = makeCanvas(w, d);
      const fg = foot.getContext('2d');
      const fim = fg.createImageData(w, d);
      for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) {
        for (let z = 0; z < h; z++) {
          if (this.grid[(z * d + y) * w + x]) {
            const fi = (y * w + x) * 4;
            fim.data[fi] = 10; fim.data[fi + 1] = 16; fim.data[fi + 2] = 24; fim.data[fi + 3] = 255;
            break;
          }
        }
      }
      fg.putImageData(fim, 0, 0);

      const asset = {
        w, d, h, grid: this.grid,
        strip, glowStrip, sim, eim,
        glowSlot, activeLayers, glowLayers,
        footShadow: foot,
        spec,
        meta: {
          footRadius: meta.footRadius || Math.min(w, d) * 0.36,
          headZ: meta.headZ || (activeLayers.length ? activeLayers[activeLayers.length - 1] + 2 : h),
          centerZ: meta.centerZ || Math.round(h * 0.5)
        }
      };
      recolorAsset(asset, spec.idToRgba, spec.glowIdSet);
      return asset;
    }
  }

  PW.Voxel = { MAT_BASE, createPaletteSpec, recolorAsset, VoxelModel };
})(window.PixelWorkshop);

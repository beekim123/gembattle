'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const smin = (a, b, k) => {
    const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1);
    return lerp(b, a, h) - k * h * (1 - h);
  };
  const expSmooth = (dt, speed) => 1 - Math.exp(-Math.max(0, dt) * speed);
  const wrapAngle = (a) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  const lerpAngle = (a, b, t) => a + wrapAngle(b - a) * t;

  // 局部坐标转世界坐标（正面 +Y，绕 Z 轴旋转 yaw）
  function localToWorldXY(rx, ry, yaw, lx, ly) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    return [rx + cy * lx - sy * ly, ry + sy * lx + cy * ly];
  }

  // 关节枢轴锁死摆放：若部件真实旋转轴在局部 (px, py)，返回体素盒中心的世界坐标
  function pivotToWorldXY(jointX, jointY, partYaw, pivotX, pivotY) {
    return localToWorldXY(jointX, jointY, partYaw, -pivotX, -pivotY);
  }

  // 绕 X 轴向前倾倒（pitch > 0 时 +Z 倒向 +Y）
  function pitchPt(pt, pitch, pivotY, pivotZ) {
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const dy = pt[1] - pivotY, dz = pt[2] - pivotZ;
    return [pt[0], pivotY + dy * cp + dz * sp, pivotZ - dy * sp + dz * cp];
  }

  function distSeg3Sq(px, py, pz, ax, ay, az, bx, by, bz) {
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const apx = px - ax, apy = py - ay, apz = pz - az;
    const denom = abx * abx + aby * aby + abz * abz || 1;
    const t = clamp((apx * abx + apy * aby + apz * abz) / denom, 0, 1);
    const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
    return [dx * dx + dy * dy + dz * dz, t];
  }

  function distTri3Sq(px, py, pz, a, b, c) {
    const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
    const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
    const apx = px - a[0], apy = py - a[1], apz = pz - a[2];
    const d1 = abx * apx + aby * apy + abz * apz;
    const d2 = acx * apx + acy * apy + acz * apz;
    if (d1 <= 0 && d2 <= 0) return apx * apx + apy * apy + apz * apz;
    const bpx = px - b[0], bpy = py - b[1], bpz = pz - b[2];
    const d3 = abx * bpx + aby * bpy + abz * bpz;
    const d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) return bpx * bpx + bpy * bpy + bpz * bpz;
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) {
      const v = d1 / (d1 - d3);
      const qx = apx - abx * v, qy = apy - aby * v, qz = apz - abz * v;
      return qx * qx + qy * qy + qz * qz;
    }
    const cpx = px - c[0], cpy = py - c[1], cpz = pz - c[2];
    const d5 = abx * cpx + aby * cpy + abz * cpz;
    const d6 = acx * cpx + acy * cpy + acz * cpz;
    if (d6 >= 0 && d5 <= d6) return cpx * cpx + cpy * cpy + cpz * cpz;
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) {
      const w = d2 / (d2 - d6);
      const qx = apx - acx * w, qy = apy - acy * w, qz = apz - acz * w;
      return qx * qx + qy * qy + qz * qz;
    }
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
      const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
      const qx = bpx - (c[0] - b[0]) * w, qy = bpy - (c[1] - b[1]) * w, qz = bpz - (c[2] - b[2]) * w;
      return qx * qx + qy * qy + qz * qz;
    }
    const denom = 1 / (va + vb + vc || 1);
    const v = vb * denom, w = vc * denom;
    const qx = apx - abx * v - acx * w, qy = apy - aby * v - acy * w, qz = apz - abz * v - acz * w;
    return qx * qx + qy * qy + qz * qz;
  }

  function hash2i(ix, iy, seed) {
    let h = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  function periodicNoise2(x, y, periodX, periodY, cell, seed) {
    const gx = x / cell, gy = y / cell;
    const px = Math.max(1, Math.round(periodX / cell));
    const py = Math.max(1, Math.round(periodY / cell));
    const ix = Math.floor(gx), iy = Math.floor(gy);
    const fx = gx - ix, fy = gy - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const wMod = (v, m) => ((v % m) + m) % m;
    const x0 = wMod(ix, px), x1 = wMod(ix + 1, px);
    const y0 = wMod(iy, py), y1 = wMod(iy + 1, py);
    return lerp(
      lerp(hash2i(x0, y0, seed), hash2i(x1, y0, seed), ux),
      lerp(hash2i(x0, y1, seed), hash2i(x1, y1, seed), ux),
      uy
    );
  }

  // 1D/2D 连续平滑值噪声（P5.js noise 风格，用于自然漂浮、微动与呼吸）
  function valueNoise1(x, seed = 11) {
    const ix = Math.floor(x);
    const fx = x - ix;
    const u = fx * fx * (3 - 2 * fx);
    return lerp(hash2i(ix, 0, seed), hash2i(ix + 1, 0, seed), u);
  }

  function fbm1(x, seed = 11, octaves = 3) {
    let sum = 0, amp = 0.5, freq = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += valueNoise1(x * freq, seed + i * 31) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2.03;
    }
    return sum / (norm || 1);
  }

  function hexToRgba(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
  }

  PW.Math = {
    TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, lerpAngle,
    localToWorldXY, pivotToWorldXY, pitchPt, distSeg3Sq, distTri3Sq,
    hash2i, periodicNoise2, valueNoise1, fbm1, hexToRgba
  };
})(window.PixelWorkshop);

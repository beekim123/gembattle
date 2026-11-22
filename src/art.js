// 画师交的像素堆叠美术（art/<版本>/art-data.js）：切片长条 → 模型，换掉代码生成的那些
// 没有 ART_DATA 或加了 ?art=0 就还用代码生成的
const ART = { on: false, pal: {}, glow: new Set(), base: [], patch: [], dot: [], tiko: null, stand: null, walk: null };
let EMIT = null;   // 画物件时同时往发光层画会发光的像素（renderWorld 里设）

const artHex = h => { const v = parseInt(h.slice(1, 7), 16); return [v >> 16, (v >> 8) & 255, v & 255]; };
function artCol(key, fb) { return ART.pal[key] ? artHex(ART.pal[key]) : fb; }

function artImage(src) {
  return new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = bad; im.src = src; });
}
function artPixels(im) {
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const g = c.getContext('2d'); g.drawImage(im, 0, 0);
  return { c, d: g.getImageData(0, 0, im.width, im.height) };
}
// 一张长条 → { sx, sy, sz, slices, em }，空层是 null；em 是只有发光像素的切片
function artModel(im, w, d) {
  const { d: px } = artPixels(im), n = Math.round(im.width / w), slices = [], em = [];
  let anyGlow = false;
  for (let z = 0; z < n; z++) {
    const c = document.createElement('canvas'); c.width = w; c.height = d;
    const e = document.createElement('canvas'); e.width = w; e.height = d;
    const a = c.getContext('2d').createImageData(w, d), b = e.getContext('2d').createImageData(w, d);
    let any = false, glow = false;
    for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) {
      const si = (y * im.width + z * w + x) * 4; if (px.data[si + 3] < 128) continue;
      const di = (y * w + x) * 4; any = true;
      for (let k = 0; k < 3; k++) a.data[di + k] = px.data[si + k]; a.data[di + 3] = 255;
      const rgb = (px.data[si] << 16) | (px.data[si + 1] << 8) | px.data[si + 2];
      if (ART.glow.has(rgb)) { glow = true; for (let k = 0; k < 3; k++) b.data[di + k] = px.data[si + k]; b.data[di + 3] = 255; }
    }
    c.getContext('2d').putImageData(a, 0, 0); slices.push(any ? c : null);
    if (glow) { e.getContext('2d').putImageData(b, 0, 0); em.push(e); anyGlow = true; } else em.push(null);
  }
  return { sx: w, sy: d, sz: n, slices, em: anyGlow ? em : null };
}

async function loadArt() {
  const D = window.ART_DATA;
  if (!D || /[?&]art=0/.test(location.search)) return false;
  const P = D.palette, cols = P['颜色'] || P;
  ART.pal = cols;
  for (const k of P['发光'] || []) if (cols[k]) { const [r, g, b] = artHex(cols[k]); ART.glow.add((r << 16) | (g << 8) | b); }
  const img = {};
  await Promise.all(Object.entries(D.images).map(async ([p, src]) => { img[p] = await artImage(src); }));
  const byCat = {};
  for (const m of D.manifest['模型']) {
    const frames = m['帧'].map(p => artModel(img[p], m['每层宽'], m['每层深']));
    (byCat[m['分类']] = byCat[m['分类']] || []).push({ name: m['名字'], frames });
  }
  const one = cat => (byCat[cat] || []).map(x => x.frames[0]);
  const fill = (list, n) => list.length ? Array.from({ length: n }, (_, i) => list[i % list.length]) : null;
  const swap = (key, list, n) => { const f = fill(list, n); if (f) MODELS[key] = f; };
  swap('live', one('活树'), 6); swap('dead', one('枯树'), 4); swap('bush', one('灌木'), 4); swap('grass', one('草丛'), 4);
  swap('reeds', one('芦苇'), 3); swap('rocks', one('石头'), 5); swap('stumps', one('树桩'), 2); swap('fungus', one('发光蘑菇'), 2);
  if (one('石碑')[0]) MODELS.stone = one('石碑')[0];
  const hero = byCat['主角'] || [];
  ART.stand = (hero.find(x => x.name === '主角-站') || {}).frames?.[0] || null;
  ART.walk = (hero.find(x => x.name === '主角-走') || {}).frames || null;
  ART.tiko = ((byCat['提可'] || [])[0] || {}).frames || null;
  const gm = D.manifest['地面'] || {};
  ART.base = (gm['底'] || []).map(p => artPixels(img[p]).d);
  ART.patch = (gm['块'] || []).map(p => img[p]);
  ART.dot = (gm['点缀'] || []).map(p => img[p]);
  ART.on = true;
  return true;
}

// 地面底色：每块地按位置挑一张底图（64×64 = 一块地），四边无缝
function artBaseCol(gx, gy) {
  const n = ART.base.length, cx = Math.floor(gx / CH), cy = Math.floor(gy / CH);
  const t = ART.base[(hash(cx, cy, 3, 77) * n) | 0], x = ((Math.floor(gx) % CH) + CH) % CH, y = ((Math.floor(gy) % CH) + CH) % CH;
  const i = (y * t.width + (x % t.width)) * 4;
  return [t.data[i], t.data[i + 1], t.data[i + 2]];
}
// 在一块地上撒苔藓 / 泥 / 落叶堆和点缀；bad(x, y) 为真的地方（水、路、空地中间）不放；块整个放在这块地里面，不跨接缝
function artDecorate(gc, ox, oy, r, patches, dots, bad) {
  for (let i = 0; i < patches && ART.patch.length; i++) {
    const im = ART.patch[(r() * ART.patch.length) | 0], x = (r() * (CH - im.width)) | 0, y = (r() * (CH - im.height)) | 0;
    const pts = [[.5, .5], [0, 0], [1, 0], [0, 1], [1, 1]];
    if (pts.some(([u, v]) => bad(ox + x + u * im.width, oy + y + v * im.height))) continue;
    gc.drawImage(im, x, y);
  }
  for (let i = 0; i < dots && ART.dot.length; i++) {
    const im = ART.dot[(r() * ART.dot.length) | 0], x = (r() * (CH - im.width)) | 0, y = (r() * (CH - im.height)) | 0;
    if (bad(ox + x, oy + y)) continue;
    gc.drawImage(im, x, y);
  }
}
// 主角当前帧：有画师的就用站 / 走，没有就用代码生成的
function heroModel(moving, walk) {
  if (ART.on && ART.stand && ART.walk) return moving ? ART.walk[Math.floor(walk) % ART.walk.length] : ART.stand;
  return MODELS.player[moving ? [1, 0, 2, 0][Math.floor(walk) % 4] : 0];
}

// 色块模式（?art=blocks）的静态地面：一张 960×540 的底图（烘焙一次，以后每帧只贴图）。
// 构图铁律：不画圆台；摆件只在左右两翼和上方远景，中央留给怪、主角和手牌；整层压暗 15%。
// 接了像素美术的世界舞台（world-stage.js）时不再走这里：地面是 UI-04 的地砖，摆件是 3D 模型。
// bakeGround 的 props 开关就是为此留的：props = false 时不画任何假树、假帐篷、假石门、假树洞、假水洼，只剩地面本身。
export const W = 960, H = 540;

export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function base(c, biome) {
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, biome.groundTop); g.addColorStop(1, biome.groundBottom);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
}
function patches(c, biome, r, n = 150) {
  for (let i = 0; i < n; i++) {
    c.globalAlpha = 0.14 + r() * 0.18; c.fillStyle = biome.patch;
    c.beginPath(); c.ellipse(r() * W, r() * H, 14 + r() * 50, 6 + r() * 20, 0, 0, Math.PI * 2); c.fill();
  }
  c.globalAlpha = 1;
}
function grass(c, r, n = 520) {
  c.lineWidth = 1.4;
  for (let i = 0; i < n; i++) {
    const x = r() * W, y = r() * H, hgt = 3 + r() * 6;
    c.strokeStyle = r() < 0.5 ? 'rgba(20,50,24,0.5)' : 'rgba(150,210,110,0.35)';
    c.beginPath(); c.moveTo(x, y); c.lineTo(x - 1.5, y - hgt); c.moveTo(x, y); c.lineTo(x + 1.5, y - hgt * 0.8); c.stroke();
  }
}
function leaves(c, biome, r, n = 110, alpha = 0.55) {
  for (let i = 0; i < n; i++) {
    c.fillStyle = biome.leaf[(r() * 3) | 0]; c.globalAlpha = alpha;
    c.save(); c.translate(r() * W, r() * H); c.rotate(r() * 6.28);
    c.beginPath(); c.ellipse(0, 0, 4 + r() * 3, 2 + r() * 1.5, 0, 0, Math.PI * 2); c.fill(); c.restore();
  }
  c.globalAlpha = 1;
}
function fruits(c, biome, r, n = 16) {
  for (let i = 0; i < n; i++) {
    const x = r() * W, y = 60 + r() * (H - 60);
    c.beginPath(); c.arc(x, y, 3 + r() * 1.5, 0, Math.PI * 2); c.fillStyle = biome.fruit; c.fill();
    c.beginPath(); c.arc(x - 1, y - 1.2, 1, 0, Math.PI * 2); c.fillStyle = 'rgba(255,255,255,0.55)'; c.fill();
  }
}
function finish(c, biome) {
  c.fillStyle = 'rgba(0,0,0,0.15)'; c.fillRect(0, 0, W, H);          // 压暗 15%，让战区跳出来
  const v = c.createRadialGradient(W / 2, H * 0.52, H * 0.35, W / 2, H * 0.52, W * 0.66);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, biome.vignette);
  c.fillStyle = v; c.fillRect(0, 0, W, H);
}

// ---------- 摆件（2D 简笔，第 3 步换工坊模型） ----------
function tree(c, x, trunkW, top, bottom, canopyR, r) {
  c.fillStyle = '#4a3320'; c.fillRect(x - trunkW / 2, top, trunkW, bottom - top);
  c.fillStyle = '#5c4129'; c.fillRect(x - trunkW / 2, top, trunkW * 0.35, bottom - top);
  c.fillStyle = '#4a3320';
  c.beginPath(); c.moveTo(x - trunkW / 2, bottom); c.quadraticCurveTo(x - trunkW, bottom, x - trunkW * 1.3, bottom + 6); c.lineTo(x + trunkW * 1.3, bottom + 6); c.quadraticCurveTo(x + trunkW, bottom, x + trunkW / 2, bottom); c.fill();
  const shades = ['#1d4426', '#265a30', '#2e6a38', '#1a3a22'];
  for (let i = 0; i < 16; i++) {
    c.fillStyle = shades[(r() * 4) | 0];
    c.beginPath(); c.arc(x + (r() - 0.5) * canopyR * 1.8, top + (r() - 0.6) * canopyR * 1.1, canopyR * (0.35 + r() * 0.3), 0, 6.3); c.fill();
  }
  for (let i = 0; i < 7; i++) {
    c.beginPath(); c.arc(x + (r() - 0.5) * canopyR * 1.6, top + (r() - 0.4) * canopyR * 0.9, 3, 0, 6.3); c.fillStyle = '#c8402e'; c.fill();
  }
}
function forestWings(c, r) {
  tree(c, 56, 30, 110, 250, 80, r);
  tree(c, 916, 28, 96, 236, 76, r);
  c.fillStyle = '#5a3f26'; c.beginPath(); c.roundRect(836, 296, 140, 34, 14); c.fill();
  c.fillStyle = '#3d6a38'; c.beginPath(); c.roundRect(846, 292, 90, 12, 6); c.fill();
  c.fillStyle = '#3a2816'; c.beginPath(); c.ellipse(838, 313, 6, 16, 0, 0, 6.3); c.fill();
  for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(868 + i * 12, 290 - (i % 2) * 4, 4, 0, 6.3); c.fillStyle = '#c8402e'; c.fill(); }
}
function flowerCluster(c, r, x, y, n) {
  for (let i = 0; i < n; i++) {
    const fx = x + (r() - 0.5) * 70, fy = y + (r() - 0.5) * 26;
    c.strokeStyle = '#2f6a30'; c.lineWidth = 2; c.beginPath(); c.moveTo(fx, fy + 22); c.lineTo(fx, fy); c.stroke();
    c.fillStyle = ['#f6a8c4', '#fbf0d0', '#f6d878'][(r() * 3) | 0];
    for (let k = 0; k < 5; k++) { const a = k * 1.2566; c.beginPath(); c.arc(fx + Math.cos(a) * 5, fy + Math.sin(a) * 5, 3.6, 0, 6.3); c.fill(); }
    c.beginPath(); c.arc(fx, fy, 3, 0, 6.3); c.fillStyle = '#e8a030'; c.fill();
  }
}
function meadowWings(c, r) {
  flowerCluster(c, r, 60, 190, 9); flowerCluster(c, r, 76, 300, 8); flowerCluster(c, r, 900, 210, 9); flowerCluster(c, r, 884, 310, 8);
  c.fillStyle = '#3f8a3c'; c.beginPath(); c.ellipse(70, 96, 36, 54, 0, 0, 6.3); c.fill();
  c.fillStyle = '#f0a0bc'; c.beginPath(); c.moveTo(34, 80); c.quadraticCurveTo(70, 8, 106, 80); c.quadraticCurveTo(70, 46, 34, 80); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.ellipse(58, 70, 5, 8, 0.4, 0, 6.3); c.fill();
}
function stump(c, x, y, w, h, r) {            // 沼泽板根枯木桩
  c.fillStyle = '#3a2c20';
  c.beginPath(); c.moveTo(x - w, y); c.quadraticCurveTo(x - w * 0.6, y - h * 0.3, x - w * 0.4, y - h); c.lineTo(x + w * 0.4, y - h); c.quadraticCurveTo(x + w * 0.6, y - h * 0.3, x + w, y); c.closePath(); c.fill();
  c.fillStyle = '#4d3a2a'; c.fillRect(x - w * 0.4, y - h, w * 0.3, h);
  c.fillStyle = '#2a2018'; c.beginPath(); c.ellipse(x, y - h, w * 0.4, 5, 0, 0, 6.3); c.fill();
  for (let i = 0; i < 3; i++) { c.fillStyle = '#6aa070'; c.beginPath(); c.ellipse(x + (r() - 0.5) * w * 2, y + 3, 7 + r() * 4, 3, 0, 0, 6.3); c.fill(); }
}
function pool(c, x, y, rx, ry, color, r, pads = 3) {
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(x, y + 2, rx + 3, ry + 3, 0, 0, 6.3); c.fill();
  c.fillStyle = color; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 6.3); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.10)'; c.beginPath(); c.ellipse(x - rx * 0.2, y - ry * 0.3, rx * 0.5, ry * 0.3, 0, 0, 6.3); c.fill();
  for (let i = 0; i < pads; i++) {
    const px = x + (r() - 0.5) * rx * 1.4, py = y + (r() - 0.5) * ry * 1.2;
    c.fillStyle = '#5a9a5a'; c.beginPath(); c.arc(px, py, 6, 0.3, 6.0); c.lineTo(px, py); c.fill();
  }
}

// ---------- 各生态 ----------
const PAINTERS = {
  forest(c, b, r, P) {
    base(c, b); patches(c, b, r); grass(c, r); leaves(c, b, r); fruits(c, b, r); if (P) forestWings(c, r);
  },
  meadow(c, b, r, P) {
    base(c, b); patches(c, b, r); grass(c, r);
    for (let i = 0; i < 150; i++) {
      const x = r() * W, y = 30 + r() * (H - 30), col = b.leaf[(r() * 3) | 0];
      c.fillStyle = col;
      for (let k = 0; k < 5; k++) { const a = k * 1.2566; c.beginPath(); c.arc(x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.6, 1.7, 0, 6.3); c.fill(); }
      c.beginPath(); c.arc(x, y, 1.4, 0, 6.3); c.fillStyle = '#e8a030'; c.fill();
    }
    if (P) meadowWings(c, r);
  },
  swamp(c, b, r, P) {
    base(c, b); patches(c, b, r, 170);
    // 泥地里的水洼：中央留净空，水洼挤在两翼和上沿
    const pools = [[120, 150, 90, 28], [150, 330, 70, 22], [840, 170, 96, 30], [810, 350, 72, 24], [480, 78, 120, 20], [300, 470, 80, 14], [680, 480, 90, 14]];
    if (P) for (const [x, y, rx, ry] of pools) pool(c, x, y, rx, ry, b.water, r);
    grass(c, r, 260); leaves(c, b, r, 50, 0.4);
    for (let i = 0; i < 40; i++) {                       // 芦苇
      const x = (r() < 0.5 ? r() * 200 : 760 + r() * 200), y = 90 + r() * 330;
      c.strokeStyle = '#4e7a4a'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 4, y - 16 - r() * 14); c.stroke();
    }
    if (P) { stump(c, 46, 260, 30, 96, r); stump(c, 918, 244, 26, 84, r); }
  },
  ruins(c, b, r, P) {
    base(c, b);
    // 青灰古石板拼地：一格一格，颜色略有深浅，缝里长青苔
    const tw = 64, th = 38;
    for (let y = 0, row = 0; y < H + th; y += th, row++) {
      for (let x = -(row % 2) * tw / 2; x < W + tw; x += tw) {
        const k = r();
        c.fillStyle = k < 0.33 ? '#454f4d' : k < 0.66 ? '#4d5856' : '#566260';
        c.fillRect(x + 1.5, y + 1.5, tw - 3, th - 3);
        c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(x + 1.5, y + 1.5, tw - 3, 3);
        if (r() < 0.25) { c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x + 6 + r() * 40, y + 4); c.lineTo(x + 10 + r() * 40, y + th - 4); c.stroke(); }
      }
    }
    for (let i = 0; i < 260; i++) {                      // 石缝里的青苔
      const x = r() * W, y = r() * H;
      c.fillStyle = b.moss; c.globalAlpha = 0.25 + r() * 0.3;
      c.beginPath(); c.ellipse(x, y, 3 + r() * 9, 1.5 + r() * 3, 0, 0, 6.3); c.fill();
    }
    c.globalAlpha = 1;
    if (!P) return;
    for (const [x, y, rx, ry] of [[150, 330, 50, 16], [820, 150, 44, 14], [730, 400, 38, 12]]) pool(c, x, y, rx, ry, b.water, r, 0);
    // 上沿居中：破损苔藓遗迹拱门（只画远景，不挡战区）
    c.fillStyle = '#394240'; c.fillRect(372, 30, 34, 84); c.fillRect(554, 44, 34, 70);
    c.fillStyle = '#434d4b'; c.beginPath(); c.moveTo(366, 38); c.lineTo(594, 52); c.lineTo(588, 70); c.lineTo(372, 58); c.closePath(); c.fill();
    c.fillStyle = b.moss; c.globalAlpha = 0.7; c.fillRect(372, 30, 12, 20); c.fillRect(560, 44, 26, 8); c.fillRect(372, 90, 10, 24); c.globalAlpha = 1;
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.moveTo(406, 114); c.lineTo(554, 114); c.lineTo(554, 62); c.quadraticCurveTo(480, 30, 406, 62); c.fill();
    // 右侧：刻纹古石碑
    c.fillStyle = '#4a5452'; c.beginPath(); c.moveTo(886, 262); c.lineTo(904, 90); c.lineTo(928, 90); c.lineTo(944, 262); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(160,210,160,0.45)'; c.lineWidth = 1.5;
    for (let k = 0; k < 6; k++) { c.beginPath(); c.moveTo(908, 108 + k * 24); c.lineTo(924, 108 + k * 24 + 4); c.stroke(); }
    c.fillStyle = b.moss; c.globalAlpha = 0.7; c.fillRect(888, 238, 56, 24); c.globalAlpha = 1;
  },
  canopy(c, b, r, P) {
    // 树冠下面是翻涌的叶海
    c.fillStyle = '#16331e'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 160; i++) {
      c.fillStyle = ['#1f4a2c', '#255a34', '#183c24', '#2b6a3a'][(r() * 4) | 0]; c.globalAlpha = 0.8;
      c.beginPath(); c.arc(r() * W, r() * H, 14 + r() * 28, 0, 6.3); c.fill();
    }
    c.globalAlpha = 1;
    // 宽阔沧桑的巨枝木纹平台：一块大的椭圆形木平台，外缘露出叶海
    const grad = c.createLinearGradient(0, 40, 0, 520); grad.addColorStop(0, b.groundTop); grad.addColorStop(1, b.groundBottom);
    c.fillStyle = grad; c.beginPath(); c.ellipse(W / 2, H / 2 + 20, 530, 270, 0, 0, 6.3); c.fill();
    c.strokeStyle = 'rgba(30,18,10,0.55)'; c.lineWidth = 2; c.stroke();
    c.lineWidth = 1.4;
    for (let i = 0; i < 90; i++) {                       // 木纹：横向细线
      const y = 60 + r() * 470, x = 60 + r() * 780, len = 80 + r() * 220;
      c.strokeStyle = r() < 0.5 ? 'rgba(30,18,10,0.35)' : 'rgba(150,100,60,0.22)';
      c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + len * 0.3, y + (r() - 0.5) * 6, x + len * 0.7, y + (r() - 0.5) * 6, x + len, y); c.stroke();
    }
    for (let i = 0; i < 26; i++) {                       // 苔斑
      c.fillStyle = 'rgba(80,130,70,0.35)'; c.beginPath(); c.ellipse(120 + r() * 720, 80 + r() * 420, 8 + r() * 22, 3 + r() * 6, 0, 0, 6.3); c.fill();
    }
    if (!P) return;
    // 上缘横铺一根苔皮粗枝，枝上有水洼
    c.fillStyle = '#4a321f'; c.beginPath(); c.roundRect(-20, 28, 1000, 40, 18); c.fill();
    c.fillStyle = '#5e4129'; c.beginPath(); c.roundRect(-20, 28, 1000, 12, 8); c.fill();
    c.fillStyle = b.sea; c.globalAlpha = 0.5; for (let i = 0; i < 18; i++) c.fillRect(r() * 960, 30 + r() * 6, 20 + r() * 40, 5); c.globalAlpha = 1;
    pool(c, 700, 50, 60, 8, '#2f5a58', r, 0);
    // 左右各挂一团附生蕨和垂果枝
    for (const sx of [70, 890]) {
      c.fillStyle = '#2a6a36'; for (let k = 0; k < 9; k++) { c.beginPath(); c.ellipse(sx + (k - 4) * 9, 120 + Math.abs(k - 4) * 6, 30, 7, (k - 4) * 0.3, 0, 6.3); c.fill(); }
      c.strokeStyle = '#4a321f'; c.lineWidth = 3; c.beginPath(); c.moveTo(sx - 30, 70); c.quadraticCurveTo(sx, 130, sx + 30, 70); c.stroke();
      for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(sx - 18 + k * 12, 150 + (k % 2) * 8, 5, 0, 6.3); c.fillStyle = '#c8402e'; c.fill(); }
    }
  },
  camp(c, b, r, P) {
    base(c, b); patches(c, b, r); grass(c, r); leaves(c, b, r, 70, 0.4);
    // 暖橘地照：以营火为中心
    const g = c.createRadialGradient(480, 250, 10, 480, 250, 300); g.addColorStop(0, 'rgba(255,150,60,0.30)'); g.addColorStop(1, 'rgba(255,150,60,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    if (!P) return;
    // 围着火的几块石头和倒木座
    for (let k = 0; k < 9; k++) {
      const a = k / 9 * Math.PI * 2, x = 480 + Math.cos(a) * 74, y = 262 + Math.sin(a) * 30;
      c.fillStyle = '#4c4a44'; c.beginPath(); c.ellipse(x, y, 11, 8, 0, 0, 6.3); c.fill(); c.fillStyle = '#6a675c'; c.beginPath(); c.ellipse(x - 2, y - 2, 7, 4, 0, 0, 6.3); c.fill();
    }
    c.fillStyle = '#5a3f26'; c.beginPath(); c.roundRect(120, 330, 130, 28, 12); c.fill();
    c.fillStyle = '#4a321f'; c.beginPath(); c.ellipse(122, 344, 6, 14, 0, 0, 6.3); c.fill();
    tree(c, 50, 30, 100, 250, 80, r); tree(c, 912, 28, 90, 240, 76, r);
    // 树洞石碑
    c.fillStyle = '#51564f'; c.beginPath(); c.roundRect(814, 270, 70, 70, 14); c.fill(); c.fillStyle = '#1a1c18'; c.beginPath(); c.ellipse(849, 312, 16, 22, 0, 0, 6.3); c.fill();
  },
  trade(c, b, r, P) {
    base(c, b); patches(c, b, r, 100); grass(c, r, 300);
    // 压实的林间土路：一条横穿的宽带，车辙两道
    c.fillStyle = '#8a7650'; c.beginPath(); c.moveTo(0, 300); c.bezierCurveTo(300, 270, 640, 330, 960, 296); c.lineTo(960, 430); c.bezierCurveTo(640, 462, 300, 410, 0, 440); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(60,44,24,0.45)'; c.lineWidth = 3;
    for (const dy of [340, 388]) { c.beginPath(); c.moveTo(0, dy); c.bezierCurveTo(300, dy - 30, 640, dy + 28, 960, dy - 6); c.stroke(); }
    for (let i = 0; i < 150; i++) { c.fillStyle = r() < 0.5 ? 'rgba(60,44,24,0.25)' : 'rgba(210,190,140,0.2)'; c.fillRect(r() * W, 290 + r() * 150, 3 + r() * 5, 2); }
    if (!P) return;
    tree(c, 50, 30, 100, 250, 80, r); tree(c, 912, 28, 90, 240, 76, r);
    // 行商的野外帐篷（左后）和岔路木牌、木箱（右）
    c.fillStyle = '#8a3a2c'; c.beginPath(); c.moveTo(150, 250); c.lineTo(240, 140); c.lineTo(330, 250); c.closePath(); c.fill();
    c.fillStyle = '#c8a050'; c.beginPath(); c.moveTo(210, 250); c.lineTo(240, 140); c.lineTo(270, 250); c.closePath(); c.fill();
    c.fillStyle = '#2a1c12'; c.beginPath(); c.moveTo(222, 250); c.lineTo(240, 190); c.lineTo(258, 250); c.closePath(); c.fill();
    c.fillStyle = '#5a3f26'; c.fillRect(150, 248, 180, 6);
    c.fillStyle = '#6a4a2a'; c.fillRect(740, 240, 56, 40); c.fillRect(780, 262, 44, 32); c.strokeStyle = '#3a2816'; c.lineWidth = 2; c.strokeRect(740, 240, 56, 40); c.strokeRect(780, 262, 44, 32);
    c.fillStyle = '#5a3f26'; c.fillRect(870, 190, 6, 100); c.fillStyle = '#7a5a34'; c.fillRect(846, 196, 52, 16); c.fillRect(850, 222, 48, 14);
  },
  gate(c, b, r, P) {
    base(c, b); patches(c, b, r, 120); grass(c, r, 300); leaves(c, b, r, 60, 0.35);
    // 青石林道岔口：一条直直的石板路通向石门（路是地面，门才是摆件）
    c.fillStyle = '#566660'; c.beginPath(); c.moveTo(380, 540); c.lineTo(580, 540); c.lineTo(540, 200); c.lineTo(420, 200); c.closePath(); c.fill();
    for (let k = 0; k < 12; k++) { const y = 210 + k * 28; c.strokeStyle = 'rgba(0,0,0,0.22)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(420 - (y - 200) * 0.1, y); c.lineTo(540 + (y - 200) * 0.1, y); c.stroke(); }
    if (!P) return;
    // 青苔石门横立中景
    c.fillStyle = '#4a5855'; c.fillRect(350, 70, 56, 150); c.fillRect(554, 70, 56, 150);
    c.fillStyle = '#566663'; c.beginPath(); c.moveTo(330, 80); c.lineTo(630, 80); c.lineTo(610, 52); c.lineTo(350, 52); c.closePath(); c.fill();
    c.fillStyle = '#1a2422'; c.fillRect(406, 90, 148, 130);
    c.fillStyle = b.moss; c.globalAlpha = 0.75;
    c.fillRect(350, 70, 56, 18); c.fillRect(554, 70, 56, 12); c.fillRect(350, 170, 20, 50); c.fillRect(590, 150, 20, 70); c.fillRect(380, 52, 90, 8);
    c.globalAlpha = 1;
    tree(c, 50, 30, 100, 250, 80, r); tree(c, 912, 28, 90, 240, 76, r);
  },
};

export function bakeGround(biome, seed, { props = true } = {}) {
  const cv = document.createElement('canvas');
  cv.width = W * 2; cv.height = H * 2;
  const c = cv.getContext('2d'); c.scale(2, 2);
  const r = rng(seed);
  (PAINTERS[biome.id] || PAINTERS.forest)(c, biome, r, props);
  finish(c, biome);
  return cv;
}

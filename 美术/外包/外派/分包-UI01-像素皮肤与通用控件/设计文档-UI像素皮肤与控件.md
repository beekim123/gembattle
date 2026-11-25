# 设计文档：UI-01 复古奇幻像素皮肤与通用控件（`Code00ArtPacks.uiSkin`）

## 一、美术风格与定位（彻底消灭 PPT 黑框感）

- **项目画面语境**：code00 是一款**俯视像素堆叠（Sprite Stacking）伪 3D 卡牌肉鸽**，画面基准为 `1920×1080`（游戏内逻辑坐标使用 `960×540` 布局单位，1 布局单位 = 2 物理像素），角色与建筑均带有硬朗的 `#0c121a` 像素描边与高对比暖奇幻手绘体素色阶。
- **核心 UI 基调**：**复古奇幻精绘像素风（暗胡桃木 / 暖羊皮纸 / 苔藓青石 / 锻打黄铜铆钉镶边）**，参考《星露谷物语》《八方旅人》《小丑牌》的实体器物触感，与工坊 3D 像素角色、营火、酒馆和青苔石门 100% 融为一体。
- **反面教材（严禁出现）**：
  - 严禁画单调的 `rgba(14,22,16,0.95) + 1px solid white` 圆角 PPT 矩形；
  - 严禁使用大面积高斯模糊阴影（`ctx.shadowBlur`）或滤镜（`ctx.filter`）；
  - 严禁依赖外部图片、外部字体或网络资源，必须全部用原生 Canvas 2D **像素级程序化绘制并预烘焙到小型离屏图集**，缩放绘制时开启 `ctx.imageSmoothingEnabled = false` 保持像素颗粒锐利。

---

## 二、统一核心色板（与游戏及工坊 100% 同步）

| 材质 / 用途 | 深暗边 / 描边 | 主体底色 | 中间层 / 浮雕 | 高亮沿 / 点缀 |
|---|---|---|---|---|
| **硬像素描边** | `#0c121a` | — | — | — |
| **暗胡桃木框 (`wood`)** | `#18110c` | `#261b13` | `#3d2b1d` | `#694c34` |
| **黄铜金属边 / 铆钉** | `#5e3d12` | `#a67424` | `#d8a848` | `#fff0b4` |
| **暖羊皮纸 (`parchment`)** | `#7a6340` | `#cbb68e` | `#e4d5b4` | `#f7eed6`（文字用 `#2b1e14`） |
| **苔藓青石 (`stone`)** | `#161e1c` | `#24302d` | `#3a4c47` | `#5f8c58`（青苔边缀） |
| **主钮暖金 (`primary`)** | `#6e420e` | `#c48918` | `#e6b32e` | `#fff2a8` |
| **次钮林木 (`secondary`)** | `#19291e` | `#2d4a34` | `#436b4b` | `#8ec48a` |
| **危险朱红 (`danger`)** | `#521614` | `#9e2c26` | `#d6483c` | `#ffaca0` |
| **色环六色 + 白** | 红 `#e2483c` · 黄 `#efc93f` · 绿 `#4cb050` · 青 `#3fbac4` · 蓝 `#4474dd` · 紫 `#9254cf` · 白 `#f4f0e6` |
| **宝石三原色** | 红 `#ff5a4a` · 绿 `#52d65a` · 蓝 `#5a8cff` |

---

## 三、技术与性能硬红线（`verify.mjs` 自动查杀）

1. **挂载规范**：脚本运行在浏览器 `<script>` 全局环境中，必须登记到：
   ```js
   window.Code00ArtPacks = window.Code00ArtPacks || {};
   window.Code00ArtPacks.uiSkin = { id: 'uiSkin', version: 1, name: '...', ... };
   ```
2. **严禁使用 `ctx.filter`**（源码出现 `.filter` 赋值直接判失败！这是 v2 此前 4K 掉到 25 帧的罪魁祸首）。
3. **严禁使用 `ctx.shadowBlur`**（发光与层次一律用双层像素色阶描边、阶梯像素高光、半透明同心环实现）。
4. **严禁加载外部图片 / 字体 / 网络 URL**（不得出现 `new Image()`、`fetch(`、`http://`、`https://`）。
5. **离屏贴图内存上限 ≤ `2 MB`**（所有预烘焙离屏画布总字节 `sum(w * h * 4) <= 2 * 1024 * 1024`，单张建议 `<= 256×256`）。
6. **严守全项目零禁用字**：任何字符串字面量中严禁出现十个禁用字及「守×者」「×之×」格式（具体正则见 `verify.mjs`）。
7. **状态整洁**：每次绘制函数结束前必须恢复 `ctx` 状态（`ctx.save() / ctx.restore()`），不污染调用方的 `fillStyle / strokeStyle / globalAlpha / imageSmoothingEnabled / font`。

---

## 四、必须实现的 10 个导出接口（精确签名）

所有坐标和尺寸均以 **`960×540` 布局单位** 传入（调用方画布已按 `scale` 缩放至 1080p/4K，绘制像素件时注意对齐 1 像素或 0.5 像素阶梯网格并关闭平滑）。

### 1. `init(makeCanvas)`
- 可选幂等初始化函数（不传 `makeCanvas` 时默认 `document.createElement('canvas')`）；若调用方未手动调 `init`，首次调用任意 `draw*` 时必须自动懒初始化。
- 在初始化阶段把 9-slice 面板瓦片、按钮瓦片、像素图标精灵预烘焙到少量离屏小画布中（总耗时 ≤ `40ms`）。

### 2. `drawPanel(ctx, x, y, w, h, variant = 'wood', opts = {})`
- 使用 **像素 9-slice（九宫格切片）** 绘制容器，保证任意宽高的面板四角铜饰/铆钉/切角绝不拉伸变形！
- `variant` 必须支持全部 5 套：
  - `'wood'`：暗胡桃木纹底 + 双层深木框 + 四角黄铜折角钉饰（用于主面板、结算、选项底板）
  - `'parchment'`：暖羊皮纸质地 + 微斑点纸纹 + 压暗折痕边 + 细金内线（用于重要信息卡、卷轴底）
  - `'stone'`：青苔古石板框 + 阶梯缺口砖角 + 少量像素青苔缀边（用于战斗仪表、路线图卡片）
  - `'tooltip'`：紧凑深色木石浮框 + 细暖金内描边 + 明确外暗边（用于悬停详情）
  - `'bar'`：顶栏专用暗木横梁条 + 底部铜线收边（无多余顶边，适合贴屏顶 `y=0, h=32`）
- `opts`：`{ accentColor?: string, highlight?: boolean, alpha?: number }`（传入 `accentColor` 时在内框边线/四角饰点透出该强调色）。

### 3. `drawButton(ctx, x, y, w, h, label, state = {})`
- 使用像素 9-slice 绘制 3 态游戏按钮，立体按压感明显（上沿亮像素边 + 下沿厚重暗底；`pressed` 时整体下沉 1~2 布局单位且收起底厚）。
- `state`：`{ variant?: 'primary'|'secondary'|'danger'|'ghost', hover?: boolean, pressed?: boolean, enabled?: boolean, fontSize?: number }`
- 文字居中、最小字号不低于 `12`（即 1080p 下 `24px`），带清晰像素暗描边便于阅读。

### 4. `drawHeart(ctx, cx, cy, size, fillState)`
- 精绘像素风格红心（含清晰深色轮廓、左上角 2 像素白色高点、内部明暗色阶），绝不用平滑贝塞尔矢量心！
- `fillState`：`1`（满心，鲜红饱满）| `0.5`（左半红心 + 右半空槽，切口整齐清晰）| `0`（空心石槽底）。

### 5. `drawCoin(ctx, cx, cy, size)`
- 精绘像素黄铜金币徽记（圆润八角像素硬币 + 内圈浮雕菱纹 + 左上高点）。

### 6. `drawHpBar(ctx, cx, y, w, hp, maxHp, bar, barsTotal)`
- 怪物头顶精致血条（中心 `cx`，顶边 `y`，总宽 `w` 约 `92~116`）：
  - 外框为锻铁/青铜像素槽，内部鲜红渐变阶梯像素血槽 + 顶沿 1px 高亮；
  - `barsTotal > 1` 时在血条左/右侧画清晰的多重血条阶梯小晶格或叠层背槽，并标注剩余条数；
  - 血条正上方/内侧清晰显示纯数字当前血量（调用 `drawPixelNumber`）。

### 7. `drawShield(ctx, cx, y, shield, shieldMax, broken)`
- `shield` / `shieldMax` 为 `[红, 绿, 蓝]` 三元素数组（如 `[3, 0, 3]`）。
- 每格护盾画成**棱面菱形/盾形像素晶格**（不再是死板小方框！）：未削的饱满高亮带切面、已削掉的呈碎裂暗框；`broken === true` 时在右侧显示清晰的青色像素「破盾」小签。

### 8. `drawCountdown(ctx, cx, cy, n, t, danger)`
- 怪物出手倒计时徽章：青铜镶边像素圆章（`danger || n <= 1` 时切换为警示朱红底 + 金白外圈脉冲呼吸，无 `shadowBlur`），中央用 `drawPixelNumber` 绘制大号锐利数字 `n`。

### 9. `drawColorRing(ctx, cx, cy, r, collectedMask, cursor, t)`
- 战斗左侧「六色集色法环」器物式仪表：
  - 外圈为精绘青铜雕纹环座，按正上方顺时针 60° 分布红/黄/绿/青/蓝/紫 6 个圆形镶孔；
  - `(collectedMask >> i) & 1` 为真时对应孔位嵌满明亮切面宝石并泛阶梯微圈；未集齐为深凹空槽；
  - 圆心为白色晶核（`cursor === 6` 时亮起）；`cursor` 指向 `0..5` 时该孔外圈显示旋转的像素金框/指针；
  - 环底显示紧凑的 `集色 X/6`。

### 10. `drawGemLevelBar(ctx, x, y, w, channelIdx, level, exp, maxExp)`
- 战斗左侧红(`0`)/绿(`1`)/蓝(`2`) 宝石等级横条：左侧嵌一颗对应色多面体小像素宝石 + 紧凑级数（如 `1级`）+ 镶边像素进度槽（按 `exp / maxExp` 填充对应色阶梯条）。

### 11. `drawPixelNumber(ctx, str, x, y, opts = {})`
- **自绘点阵像素数字字体**（支持字符：`0-9`、`+`、`-`、`−`、`×`、`/`、`%`、`!`、`.`、`,`、空格），每个字符基于手工精修的 `5×7` 或 `6×8` 像素位图绘制，带硬朗 1px 像素暗描边与顶部高阶色！
- `opts`：`{ size?: number, color?: string, strokeColor?: string, align?: 'left'|'center'|'right', crit?: boolean, rainbow?: boolean }`
  - `crit: true` 时呈现金橙梯度暴击厚重像素字；
  - `rainbow: true` 时每个数字依次循环着七色环颜色，极具爆发爽感！
- 必须确保纯数字显示（如 `52381`），绝不做万/亿缩写。

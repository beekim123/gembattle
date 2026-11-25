# 建筑

一栋一个脚本，放在这个目录。脚本末尾 `PixelWorkshop.Assets.register(Def, 'building')`，`../index.html` 的「建筑」那段加一行 script，文件名和 id 用 `building_` 开头。

## 最简单的写法

建筑不会走，实例只要这几样：

```js
const Def = {
  id: 'building_xxx', name: '……', defaultHabitat: 'forest',
  createInstance(makeCanvas) {
    const parts = { wall: buildWall(makeCanvas), roof: buildRoof(makeCanvas) };
    const state = { x: 0, y: 0, z: 0, yaw: 0 };
    return {
      def: Def, parts, partListAssets: Object.values(parts), state, scaleMul: 1,
      reset(x, y, yaw) { state.x = x; state.y = y; state.yaw = yaw; },
      update(dt, time, params, habitat, vfx, eco) { /* 旗子、炊烟这类小动静写这里 */ },
      buildPartList() {
        return [
          { asset: parts.wall, x: state.x, y: state.y, lift: 0, ro: state.yaw, bias: 0 },
          { asset: parts.roof, x: state.x, y: state.y, lift: 12, ro: state.yaw, bias: 0.1 }
        ];
      }
    };
  }
};
PixelWorkshop.Assets.register(Def, 'building');
```

体素建模用 `PW.Voxel.createPaletteSpec` + `VoxelModel`，跟怪一样（`fillAABB`、`paintCapsule`、`paintEllipsoid`，最后 `applyArtShading` 和 `toStripAsset`）。

## 大块头要拆开（性能）

渲染器按「部件 × 角度」烘焙进一张总量封顶 28MB 的图集（超过 32MB Chrome 会突然变慢，见 `../文档/性能与流畅度-2026-11-23.md`）。部件越大：

- 一张图越大（面积按边长平方涨）；
- 角度档位越细（大部件转一点点边缘就挪很远，档位自动变密）；
- 烘焙一张越慢（每帧烘焙预算只有 2.5ms，超了会先借相邻角度顶一帧）。

所以：

- **一个部件别超过 40 格见方左右**。整栋房子拆成墙、屋顶、门、窗、烟囱几块，摆在一起；
- **重复的东西做一个部件用多次**（同样的窗户、栅栏、瓦片列），只占一份贴图；
- **左右对称就做成对称的**：渲染器会发现，只烘一半角度；
- 放上台以后打开预览台左上角的性能浮层（P）看「贴图」和「烘焙」两行。

这几条是按渲染器的做法推出来的，还没拿真建筑实测过。做第一栋的时候顺手量一下，把数字补在这里。

## 建筑制作清单与同步生成提示词

4 个建筑标杆（`B01` 酒馆工会木屋、`B02` 商贩帐篷、`B03` 层间出口石门、`B04` 破损苔藓遗迹拱门）已整合进酒馆与生态场景同步生成提示词中：
- 总清单：`../文档/酒馆NPC与生态场景制作清单.md`
- `B01`：`../文档/提示词-酒馆NPC/00-酒馆地台与核心建筑室内件.md`
- `B02` / `B03`：`../文档/提示词-生态场景/02-探索通用营地石门-S04-S05-B02-B03.md`
- `B04`：`../文档/提示词-生态场景/10-T15溶洞-T16古石遗迹-B04标杆.md`

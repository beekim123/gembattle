'use strict';

// 自动生成，别手改。来源：文档/生物图鉴与逐只精制规划.md + 文档/全品类模板规划与参考.md
// 重新生成：node tools/sync-catalog.js
window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Catalog = {
  "source": "文档/生物图鉴与逐只精制规划.md",
  "templateSource": "文档/全品类模板规划与参考.md",
  "groups": [
    "天上",
    "河湖",
    "海和冰",
    "林地地面",
    "树上",
    "沙漠",
    "地下、洞穴",
    "沼泽",
    "项目已有扩展生物",
    "拓展骨架模板"
  ],
  "typeGroups": [
    {
      "code": "M01",
      "name": "脉冲漂浮 / 悬停",
      "label": "M01 脉冲漂浮 / 悬停",
      "sample": "天1 当扈、天2 红囊、特3 妖精",
      "covers": "天1、天2、特3",
      "spec": "噪声漂浮、水母式脉冲推进、多束级联弹簧须/飘带、空中交互物循环",
      "status": "done"
    },
    {
      "code": "M02",
      "name": "振翅飞行",
      "label": "M02 振翅飞行",
      "sample": "特2 翼蝠、特8 赤焰飞龙",
      "covers": "天3、泽3、特2、特8",
      "spec": "三段翼振翅滑翔（Flap-and-Glide）、升沉相位滞后、高度接地印",
      "status": "draft"
    },
    {
      "code": "M03",
      "name": "水生脉冲泳 / 半潜人鱼",
      "label": "M03 水生脉冲泳 / 半潜人鱼",
      "sample": "海1 狼鲸、水3 十身鱼、特7 海妖",
      "covers": "水3、水5、海1、特7",
      "spec": "Burst-and-Glide 摆尾加速、俯仰潜浮、`submerge` 水色染色、破水白沫与 V 形尾迹",
      "status": "done"
    },
    {
      "code": "M04",
      "name": "超长拖拽链（蛇 / 游龙）",
      "label": "M04 超长拖拽链（蛇 / 游龙）",
      "sample": "特9 东方游龙、特6 魔蛇",
      "covers": "天4、沙1、特6、特9",
      "spec": "拉长胶囊节高重叠防串珠、`ChainSolver` 距离+转角约束、三维起伏纵波、节点锚定爪",
      "status": "done"
    },
    {
      "code": "M05",
      "name": "软体弹跳 / 两栖蛙跳",
      "label": "M05 软体弹跳 / 两栖蛙跳",
      "sample": "特1 史莱姆、特5 鱼人",
      "covers": "特1、特5",
      "spec": "四阶段蓄力弹跳、低阻尼果冻回弹、半透 `opacity` 壳体透出腹中物",
      "status": "draft"
    },
    {
      "code": "M06",
      "name": "二足走跑",
      "label": "M06 二足走跑",
      "sample": "树4 吐火竹鸡、特4 哥布林",
      "covers": "树4、特4",
      "spec": "`biped` 交替步态、髋锁大腿 + 反折踝/屈膝真 IK、左右横滚摆步、禽类点步",
      "status": "done"
    },
    {
      "code": "M07",
      "name": "四足稳走 / 小跑 / 腾跃",
      "label": "M07 四足稳走 / 小跑 / 腾跃",
      "sample": "沙4 弯角犀、地3 五尾红豹、泽1 牛犊、水1 水兽、地1 肚嘴巨兽",
      "covers": "水1、地1、地3、地4、沙3、沙4、沙5、泽1、泽2",
      "spec": "`walk4 / trot / bound` 分化步态、独立 `pelvis` 锚点防转弯脱胯、停步自动收脚、自然弧线行进",
      "status": "done"
    },
    {
      "code": "M08",
      "name": "软体蠕动缩壳",
      "label": "M08 软体蠕动缩壳",
      "sample": "洞4 拼骨幼虫",
      "covers": "洞1、洞4",
      "spec": "脉冲蠕动前进、多套随机拼装背壳、受惊缩壳发抖与探头张望状态机",
      "status": "done"
    },
    {
      "code": "M09",
      "name": "多足节肢 / 硬壳虫类（6~8 足）",
      "label": "M09 多足节肢 / 硬壳虫类（6~8 足）",
      "sample": "海2 · 冰下甲壳兽（sea2_qalupalik）",
      "covers": "海2",
      "spec": "扩展 `MultiLegGaitSolver` 支持 6 足三角步态（Tripod Gait）、硬壳节肢分节着色",
      "status": "done"
    },
    {
      "code": "M10",
      "name": "扎根固定本体 + 派生子实体",
      "label": "M10 扎根固定本体 + 派生子实体",
      "sample": "树2 · 走果巨树（tree2_waqwaq）或 地2",
      "covers": "地2、树1、树2、洞2",
      "spec": "本体扎根微摆、枝茎弹簧晃动 + 成熟子体脱落 → 落地独立爬行与回收",
      "status": "done"
    },
    {
      "code": "M11",
      "name": "单足重击弹跳（非对称奇异体型）",
      "label": "M11 单足重击弹跳（非对称奇异体型）",
      "sample": "洞3 · 单腿雷牛（cave3_kui）",
      "covers": "洞3",
      "spec": "区别于软果冻的刚性单足支撑平衡、蓄力屈膝起跳、落地重击震落碎屑",
      "status": "done"
    },
    {
      "code": "M12",
      "name": "动态变形 / 实时成长装配",
      "label": "M12 动态变形 / 实时成长装配",
      "sample": "树3 · 伸缩树人（tree3_leshy）或 沙2",
      "covers": "树3、沙2",
      "spec": "运行时脊柱节数动态伸缩（参天巨木 ↔ 矮灌木），或吞物后背甲实时新增立体挂件",
      "status": "done"
    },
    {
      "code": "M13",
      "name": "集群协同编队（单资产多只）",
      "label": "M13 集群协同编队（单资产多只）",
      "sample": "海4 · 文鳐鱼群（sea4_wenyao）或 水2",
      "covers": "水2、海4",
      "spec": "单脚本驱动 4~6 只同模共享贴图编队，齐刷刷破水展翼滑翔再落水溅花",
      "status": "done"
    },
    {
      "code": "M14",
      "name": "悬浮拼装 / 磁力分离体",
      "label": "M14 悬浮拼装 / 磁力分离体",
      "sample": "浮岩构装体（special10_golem）",
      "covers": "拓展构装体 / 元素怪",
      "spec": "无物理关节的散件聚合：多块浮空岩甲独立轨道公转/自转、受惊聚散",
      "status": "done"
    },
    {
      "code": "M15",
      "name": "辐射对称多触手攀爬",
      "label": "M15 辐射对称多触手攀爬",
      "sample": "陆行八爪（special11_octo）",
      "covers": "拓展多触手软体怪",
      "spec": "6~8 条辐射触手轮流前探吸附拉拽身体前行，区别于定向前游鱼尾",
      "status": "done"
    },
    {
      "code": "M16",
      "name": "超巨型半身 / 拆块 Boss（80~140 格）",
      "label": "M16 超巨型半身 / 拆块 Boss（80~140 格）",
      "sample": "海3 · 浮岛巨兽（sea3_hafgufa）或 水4",
      "covers": "水4、海3",
      "spec": "大块头（> 40 格）拆块拼接零缝隙、严控 28MB 图集上限、背上承载微型生态",
      "status": "done"
    },
    {
      "code": "M17",
      "name": "双体共生 / 骑乘组合",
      "label": "M17 双体共生 / 骑乘组合",
      "sample": "骑兽猎手（special12_rider）",
      "covers": "拓展骑乘精英 / 双子怪",
      "spec": "坐骑奔跑步态 + 骑手上身颠簸弹簧 + 双主体独立朝向协同，不穿模不脱座",
      "status": "done"
    }
  ],
  "knownAssets": {
    "特1": "slime_jelly",
    "特2": "bat_cavern",
    "特3": "fairy_meadow",
    "特4": "goblin_scout",
    "特5": "murloc_tide",
    "特6": "snake_wyrm",
    "特7": "siren_tide",
    "特8": "feilong_drake",
    "特9": "special9_long"
  },
  "assetTimes": {
    "bat_cavern": {
      "file": "creatures/bat.js",
      "createdAt": 1795447708413,
      "updatedAt": 1795482783375,
      "createdLabel": "11-23 10:28",
      "updatedLabel": "11-23 20:13"
    },
    "cave1_tatzelwurm": {
      "file": "creatures/cave1_tatzelwurm.js",
      "createdAt": 1795538854636,
      "updatedAt": 1795538854636,
      "createdLabel": "11-24 11:47",
      "updatedLabel": "11-24 11:47"
    },
    "cave2_cuelebre": {
      "file": "creatures/cave2_cuelebre.js",
      "createdAt": 1795538856403,
      "updatedAt": 1795539102174,
      "createdLabel": "11-24 11:47",
      "updatedLabel": "11-24 11:51"
    },
    "cave3_kui": {
      "file": "creatures/cave3_kui.js",
      "createdAt": 1795502754030,
      "updatedAt": 1795503764124,
      "createdLabel": "11-24 01:45",
      "updatedLabel": "11-24 02:02"
    },
    "cave4_tupilak": {
      "file": "creatures/cave4_tupilak.js",
      "createdAt": 1795492893211,
      "updatedAt": 1795493027770,
      "createdLabel": "11-23 23:01",
      "updatedLabel": "11-23 23:03"
    },
    "cave5_mycelium_web": {
      "file": "creatures/cave5_mycelium_web.js",
      "createdAt": 1795524040096,
      "updatedAt": 1795524089689,
      "createdLabel": "11-24 07:40",
      "updatedLabel": "11-24 07:41"
    },
    "earth10_bark_cleaner": {
      "file": "creatures/earth10_bark_cleaner.js",
      "createdAt": 1795538669078,
      "updatedAt": 1795538669078,
      "createdLabel": "11-24 11:44",
      "updatedLabel": "11-24 11:44"
    },
    "earth1_belly_maw": {
      "file": "creatures/earth1_belly_maw.js",
      "createdAt": 1795445947283,
      "updatedAt": 1795500605199,
      "createdLabel": "11-23 09:59",
      "updatedLabel": "11-24 01:10"
    },
    "earth2_barometz": {
      "file": "creatures/earth2_barometz.js",
      "createdAt": 1795538775883,
      "updatedAt": 1795538775883,
      "createdLabel": "11-24 11:46",
      "updatedLabel": "11-24 11:46"
    },
    "earth3_zheng": {
      "file": "creatures/earth3_zheng.js",
      "createdAt": 1795492858212,
      "updatedAt": 1795500081100,
      "createdLabel": "11-23 23:00",
      "updatedLabel": "11-24 01:01"
    },
    "earth4_shadhavar": {
      "file": "creatures/earth4_shadhavar.js",
      "createdAt": 1795538777555,
      "updatedAt": 1795538986000,
      "createdLabel": "11-24 11:46",
      "updatedLabel": "11-24 11:49"
    },
    "earth5_rib_crawler": {
      "file": "creatures/earth5_rib_crawler.js",
      "createdAt": 1795527049633,
      "updatedAt": 1795529089650,
      "createdLabel": "11-24 08:30",
      "updatedLabel": "11-24 09:04"
    },
    "earth6_long_arm": {
      "file": "creatures/earth6_long_arm.js",
      "createdAt": 1795526984906,
      "updatedAt": 1795528676306,
      "createdLabel": "11-24 08:29",
      "updatedLabel": "11-24 08:57"
    },
    "earth7_petal_elytra": {
      "file": "creatures/earth7_petal_elytra.js",
      "createdAt": 1795538561910,
      "updatedAt": 1795538677446,
      "createdLabel": "11-24 11:42",
      "updatedLabel": "11-24 11:44"
    },
    "earth8_host_bloom": {
      "file": "creatures/earth8_host_bloom.js",
      "createdAt": 1795523969139,
      "updatedAt": 1795525060174,
      "createdLabel": "11-24 07:39",
      "updatedLabel": "11-24 07:57"
    },
    "earth9_bone_shears": {
      "file": "creatures/earth9_bone_shears.js",
      "createdAt": 1795538811381,
      "updatedAt": 1795538961540,
      "createdLabel": "11-24 11:46",
      "updatedLabel": "11-24 11:49"
    },
    "fairy_meadow": {
      "file": "creatures/fairy.js",
      "createdAt": 1795447711327,
      "updatedAt": 1795484445241,
      "createdLabel": "11-23 10:28",
      "updatedLabel": "11-23 20:40"
    },
    "feilong_drake": {
      "file": "creatures/feilong.js",
      "createdAt": 1795447576312,
      "updatedAt": 1795451398828,
      "createdLabel": "11-23 10:26",
      "updatedLabel": "11-23 11:29"
    },
    "fire1_slab_shedder": {
      "file": "creatures/fire1_slab_shedder.js",
      "createdAt": 1795523999986,
      "updatedAt": 1795524212024,
      "createdLabel": "11-24 07:39",
      "updatedLabel": "11-24 07:43"
    },
    "fire2_lava_roller": {
      "file": "creatures/fire2_lava_roller.js",
      "createdAt": 1795527071722,
      "updatedAt": 1795527071723,
      "createdLabel": "11-24 08:31",
      "updatedLabel": "11-24 08:31"
    },
    "goblin_scout": {
      "file": "creatures/goblin.js",
      "createdAt": 1795447579346,
      "updatedAt": 1795498684813,
      "createdLabel": "11-23 10:26",
      "updatedLabel": "11-24 00:38"
    },
    "marsh1_camahueto": {
      "file": "creatures/marsh1_camahueto.js",
      "createdAt": 1795492885910,
      "updatedAt": 1795500598560,
      "createdLabel": "11-23 23:01",
      "updatedLabel": "11-24 01:09"
    },
    "marsh2_huashe": {
      "file": "creatures/marsh2_huashe.js",
      "createdAt": 1795538943827,
      "updatedAt": 1795538943827,
      "createdLabel": "11-24 11:49",
      "updatedLabel": "11-24 11:49"
    },
    "marsh3_peuchen": {
      "file": "creatures/marsh3_peuchen.js",
      "createdAt": 1795538680966,
      "updatedAt": 1795538680966,
      "createdLabel": "11-24 11:44",
      "updatedLabel": "11-24 11:44"
    },
    "marsh4_tri_neck": {
      "file": "creatures/marsh4_tri_neck.js",
      "createdAt": 1795527064649,
      "updatedAt": 1795527064649,
      "createdLabel": "11-24 08:31",
      "updatedLabel": "11-24 08:31"
    },
    "marsh5_thermal_swarm": {
      "file": "creatures/marsh5_thermal_swarm.js",
      "createdAt": 1795538813314,
      "updatedAt": 1795539029374,
      "createdLabel": "11-24 11:46",
      "updatedLabel": "11-24 11:50"
    },
    "marsh6_stilt_walker": {
      "file": "creatures/marsh6_stilt_walker.js",
      "createdAt": 1795527033225,
      "updatedAt": 1795528882028,
      "createdLabel": "11-24 08:30",
      "updatedLabel": "11-24 09:01"
    },
    "murloc_tide": {
      "file": "creatures/murloc.js",
      "createdAt": 1795447714176,
      "updatedAt": 1795484289589,
      "createdLabel": "11-23 10:28",
      "updatedLabel": "11-23 20:38"
    },
    "ruins1_grid_armor": {
      "file": "creatures/ruins1_grid_armor.js",
      "createdAt": 1795527080816,
      "updatedAt": 1795527255805,
      "createdLabel": "11-24 08:31",
      "updatedLabel": "11-24 08:34"
    },
    "ruins2_flip_slab": {
      "file": "creatures/ruins2_flip_slab.js",
      "createdAt": 1795538479894,
      "updatedAt": 1795538479894,
      "createdLabel": "11-24 11:41",
      "updatedLabel": "11-24 11:41"
    },
    "sand1_worm": {
      "file": "creatures/sand1_worm.js",
      "createdAt": 1795521264227,
      "updatedAt": 1795523174662,
      "createdLabel": "11-24 06:54",
      "updatedLabel": "11-24 07:26"
    },
    "sand2_bulgasari": {
      "file": "creatures/sand2_bulgasari.js",
      "createdAt": 1795538938374,
      "updatedAt": 1795538938374,
      "createdLabel": "11-24 11:48",
      "updatedLabel": "11-24 11:48"
    },
    "sand3_fei": {
      "file": "creatures/sand3_fei.js",
      "createdAt": 1795538940135,
      "updatedAt": 1795539108114,
      "createdLabel": "11-24 11:49",
      "updatedLabel": "11-24 11:51"
    },
    "sand4_karkadann": {
      "file": "creatures/sand4_karkadann.js",
      "createdAt": 1795493010967,
      "updatedAt": 1795500600815,
      "createdLabel": "11-23 23:03",
      "updatedLabel": "11-24 01:10"
    },
    "sand5_ammit": {
      "file": "creatures/sand5_ammit.js",
      "createdAt": 1795538941974,
      "updatedAt": 1795538941974,
      "createdLabel": "11-24 11:49",
      "updatedLabel": "11-24 11:49"
    },
    "sand6_mirage_pool": {
      "file": "creatures/sand6_mirage_pool.js",
      "createdAt": 1795523945286,
      "updatedAt": 1795524030778,
      "createdLabel": "11-24 07:39",
      "updatedLabel": "11-24 07:40"
    },
    "sand7_salt_slug": {
      "file": "creatures/sand7_salt_slug.js",
      "createdAt": 1795524112924,
      "updatedAt": 1795526811147,
      "createdLabel": "11-24 07:41",
      "updatedLabel": "11-24 08:26"
    },
    "sand8_hammer_claw": {
      "file": "creatures/sand8_hammer_claw.js",
      "createdAt": 1795527107369,
      "updatedAt": 1795527107369,
      "createdLabel": "11-24 08:31",
      "updatedLabel": "11-24 08:31"
    },
    "sea1_akhlut": {
      "file": "creatures/sea1_akhlut.js",
      "createdAt": 1795492863385,
      "updatedAt": 1795499848605,
      "createdLabel": "11-23 23:01",
      "updatedLabel": "11-24 00:57"
    },
    "sea2_qalupalik": {
      "file": "creatures/sea2_qalupalik.js",
      "createdAt": 1795502811991,
      "updatedAt": 1795503537027,
      "createdLabel": "11-24 01:46",
      "updatedLabel": "11-24 01:58"
    },
    "sea3_hafgufa": {
      "file": "creatures/sea3_hafgufa.js",
      "createdAt": 1795505048688,
      "updatedAt": 1795505740712,
      "createdLabel": "11-24 02:24",
      "updatedLabel": "11-24 02:35"
    },
    "sea4_wenyao": {
      "file": "creatures/sea4_wenyao.js",
      "createdAt": 1795504715361,
      "updatedAt": 1795505775361,
      "createdLabel": "11-24 02:18",
      "updatedLabel": "11-24 02:36"
    },
    "sea5_puzzle_swarm": {
      "file": "creatures/sea5_puzzle_swarm.js",
      "createdAt": 1795538459549,
      "updatedAt": 1795538548511,
      "createdLabel": "11-24 11:40",
      "updatedLabel": "11-24 11:42"
    },
    "sea6_vortex_water": {
      "file": "creatures/sea6_vortex_water.js",
      "createdAt": 1795538483230,
      "updatedAt": 1795538581424,
      "createdLabel": "11-24 11:41",
      "updatedLabel": "11-24 11:43"
    },
    "sea7_raft_stack": {
      "file": "creatures/sea7_raft_stack.js",
      "createdAt": 1795538625126,
      "updatedAt": 1795538625126,
      "createdLabel": "11-24 11:43",
      "updatedLabel": "11-24 11:43"
    },
    "sea8_ice_tentacles": {
      "file": "creatures/sea8_ice_tentacles.js",
      "createdAt": 1795538857968,
      "updatedAt": 1795539102174,
      "createdLabel": "11-24 11:47",
      "updatedLabel": "11-24 11:51"
    },
    "siren_tide": {
      "file": "creatures/siren.js",
      "createdAt": 1795447563817,
      "updatedAt": 1795486435397,
      "createdLabel": "11-23 10:26",
      "updatedLabel": "11-23 21:13"
    },
    "sky1_danghu": {
      "file": "creatures/sky1_danghu.js",
      "createdAt": 1795489736430,
      "updatedAt": 1795491407524,
      "createdLabel": "11-23 22:08",
      "updatedLabel": "11-23 22:36"
    },
    "sky2_red_sac": {
      "file": "creatures/sky2_red_sac.js",
      "createdAt": 1795445944196,
      "updatedAt": 1795479808888,
      "createdLabel": "11-23 09:59",
      "updatedLabel": "11-23 19:23"
    },
    "sky3_impundulu": {
      "file": "creatures/sky3_impundulu.js",
      "createdAt": 1795538679138,
      "updatedAt": 1795539024945,
      "createdLabel": "11-24 11:44",
      "updatedLabel": "11-24 11:50"
    },
    "sky4_bakunawa": {
      "file": "creatures/sky4_bakunawa.js",
      "createdAt": 1795538875759,
      "updatedAt": 1795539026586,
      "createdLabel": "11-24 11:47",
      "updatedLabel": "11-24 11:50"
    },
    "sky5_grass_glider": {
      "file": "creatures/sky5_grass_glider.js",
      "createdAt": 1795527024557,
      "updatedAt": 1795527088539,
      "createdLabel": "11-24 08:30",
      "updatedLabel": "11-24 08:31"
    },
    "sky6_cloud_snare": {
      "file": "creatures/sky6_cloud_snare.js",
      "createdAt": 1795538778459,
      "updatedAt": 1795538778459,
      "createdLabel": "11-24 11:46",
      "updatedLabel": "11-24 11:46"
    },
    "sky7_sheet_stack": {
      "file": "creatures/sky7_sheet_stack.js",
      "createdAt": 1795538623417,
      "updatedAt": 1795538623418,
      "createdLabel": "11-24 11:43",
      "updatedLabel": "11-24 11:43"
    },
    "sky8_bolt_licker": {
      "file": "creatures/sky8_bolt_licker.js",
      "createdAt": 1795538780475,
      "updatedAt": 1795538780475,
      "createdLabel": "11-24 11:46",
      "updatedLabel": "11-24 11:46"
    },
    "slime_jelly": {
      "file": "creatures/slime.js",
      "createdAt": 1795489900012,
      "updatedAt": 1795489900015,
      "createdLabel": "11-23 22:11",
      "updatedLabel": "11-23 22:11"
    },
    "snake_wyrm": {
      "file": "creatures/snake.js",
      "createdAt": 1795447560733,
      "updatedAt": 1795487304283,
      "createdLabel": "11-23 10:26",
      "updatedLabel": "11-23 21:28"
    },
    "special10_golem": {
      "file": "creatures/special10_golem.js",
      "createdAt": 1795504938252,
      "updatedAt": 1795505356991,
      "createdLabel": "11-24 02:22",
      "updatedLabel": "11-24 02:29"
    },
    "special11_octo": {
      "file": "creatures/special11_octo.js",
      "createdAt": 1795504855484,
      "updatedAt": 1795505257556,
      "createdLabel": "11-24 02:20",
      "updatedLabel": "11-24 02:27"
    },
    "special12_rider": {
      "file": "creatures/special12_rider.js",
      "createdAt": 1795504987870,
      "updatedAt": 1795505480448,
      "createdLabel": "11-24 02:23",
      "updatedLabel": "11-24 02:31"
    },
    "special9_long": {
      "file": "creatures/special9_long.js",
      "createdAt": 1795500334017,
      "updatedAt": 1795504675563,
      "createdLabel": "11-24 01:05",
      "updatedLabel": "11-24 02:17"
    },
    "tree1_hanging_sac": {
      "file": "creatures/tree1_hanging_sac.js",
      "createdAt": 1795524002741,
      "updatedAt": 1795524553142,
      "createdLabel": "11-24 07:40",
      "updatedLabel": "11-24 07:49"
    },
    "tree2_waqwaq": {
      "file": "creatures/tree2_waqwaq.js",
      "createdAt": 1795504965288,
      "updatedAt": 1795505494392,
      "createdLabel": "11-24 02:22",
      "updatedLabel": "11-24 02:31"
    },
    "tree3_leshy": {
      "file": "creatures/tree3_leshy.js",
      "createdAt": 1795502976265,
      "updatedAt": 1795503704290,
      "createdLabel": "11-24 01:49",
      "updatedLabel": "11-24 02:01"
    },
    "tree4_basan": {
      "file": "creatures/tree4_basan.js",
      "createdAt": 1795493002060,
      "updatedAt": 1795498676489,
      "createdLabel": "11-23 23:03",
      "updatedLabel": "11-24 00:37"
    },
    "tree5_bamboo_launcher": {
      "file": "creatures/tree5_bamboo_launcher.js",
      "createdAt": 1795538453187,
      "updatedAt": 1795538453188,
      "createdLabel": "11-24 11:40",
      "updatedLabel": "11-24 11:40"
    },
    "tree6_ratchet_bamboo": {
      "file": "creatures/tree6_ratchet_bamboo.js",
      "createdAt": 1795538782416,
      "updatedAt": 1795538857410,
      "createdLabel": "11-24 11:46",
      "updatedLabel": "11-24 11:47"
    },
    "water1_ahuizotl": {
      "file": "creatures/water1_ahuizotl.js",
      "createdAt": 1795492778183,
      "updatedAt": 1795500602973,
      "createdLabel": "11-23 22:59",
      "updatedLabel": "11-24 01:10"
    },
    "water2_jingwei": {
      "file": "creatures/water2_jingwei.js",
      "createdAt": 1795538809733,
      "updatedAt": 1795538809733,
      "createdLabel": "11-24 11:46",
      "updatedLabel": "11-24 11:46"
    },
    "water3_ten_tail": {
      "file": "creatures/water3_ten_tail.js",
      "createdAt": 1795445941232,
      "updatedAt": 1795479883265,
      "createdLabel": "11-23 09:59",
      "updatedLabel": "11-23 19:24"
    },
    "water4_eco_turtle": {
      "file": "creatures/water4_eco_turtle.js",
      "createdAt": 1795523993711,
      "updatedAt": 1795524551444,
      "createdLabel": "11-24 07:39",
      "updatedLabel": "11-24 07:49"
    },
    "water5_fin_fish": {
      "file": "creatures/water5_fin_fish.js",
      "createdAt": 1795538873983,
      "updatedAt": 1795538873983,
      "createdLabel": "11-24 11:47",
      "updatedLabel": "11-24 11:47"
    },
    "water7_tether_rider": {
      "file": "creatures/water7_tether_rider.js",
      "createdAt": 1795538670741,
      "updatedAt": 1795538670741,
      "createdLabel": "11-24 11:44",
      "updatedLabel": "11-24 11:44"
    },
    "npc_album_scholar": {
      "file": "npc/npc_album_scholar.js",
      "createdAt": 1795573815626,
      "updatedAt": 1795573815626,
      "createdLabel": "11-24 21:30",
      "updatedLabel": "11-24 21:30"
    },
    "npc_expedition_guide": {
      "file": "npc/npc_expedition_guide.js",
      "createdAt": 1795573793241,
      "updatedAt": 1795573976171,
      "createdLabel": "11-24 21:29",
      "updatedLabel": "11-24 21:32"
    },
    "npc_gear_smith": {
      "file": "npc/npc_gear_smith.js",
      "createdAt": 1795573813309,
      "updatedAt": 1795573813309,
      "createdLabel": "11-24 21:30",
      "updatedLabel": "11-24 21:30"
    },
    "npc_guild_clerk": {
      "file": "npc/npc_guild_clerk.js",
      "createdAt": 1795573811252,
      "updatedAt": 1795573908942,
      "createdLabel": "11-24 21:30",
      "updatedLabel": "11-24 21:31"
    },
    "npc_mage": {
      "file": "npc/npc_mage.js",
      "createdAt": 1795573629641,
      "updatedAt": 1795573732644,
      "createdLabel": "11-24 21:27",
      "updatedLabel": "11-24 21:28"
    },
    "npc_rogue": {
      "file": "npc/npc_rogue.js",
      "createdAt": 1795573715076,
      "updatedAt": 1795573970024,
      "createdLabel": "11-24 21:28",
      "updatedLabel": "11-24 21:32"
    },
    "npc_support": {
      "file": "npc/npc_support.js",
      "createdAt": 1795573799604,
      "updatedAt": 1795573979740,
      "createdLabel": "11-24 21:29",
      "updatedLabel": "11-24 21:32"
    },
    "npc_tavern_bard": {
      "file": "npc/npc_tavern_bard.js",
      "createdAt": 1795573735250,
      "updatedAt": 1795573735250,
      "createdLabel": "11-24 21:28",
      "updatedLabel": "11-24 21:28"
    },
    "npc_tavern_keeper": {
      "file": "npc/npc_tavern_keeper.js",
      "createdAt": 1795573632000,
      "updatedAt": 1795573811531,
      "createdLabel": "11-24 21:27",
      "updatedLabel": "11-24 21:30"
    },
    "npc_tavern_veteran": {
      "file": "npc/npc_tavern_veteran.js",
      "createdAt": 1795573737256,
      "updatedAt": 1795573737256,
      "createdLabel": "11-24 21:28",
      "updatedLabel": "11-24 21:28"
    },
    "npc_vanguard": {
      "file": "npc/npc_vanguard.js",
      "createdAt": 1795573712275,
      "updatedAt": 1795573966657,
      "createdLabel": "11-24 21:28",
      "updatedLabel": "11-24 21:32"
    },
    "npc_warrior": {
      "file": "npc/npc_warrior.js",
      "createdAt": 1795573796075,
      "updatedAt": 1795573796075,
      "createdLabel": "11-24 21:29",
      "updatedLabel": "11-24 21:29"
    },
    "building_camp_tent": {
      "file": "buildings/building_camp_tent.js",
      "createdAt": 1795573744344,
      "updatedAt": 1795573744345,
      "createdLabel": "11-24 21:29",
      "updatedLabel": "11-24 21:29"
    },
    "building_guild": {
      "file": "buildings/building_guild.js",
      "createdAt": 1795573709103,
      "updatedAt": 1795573902140,
      "createdLabel": "11-24 21:28",
      "updatedLabel": "11-24 21:31"
    },
    "building_ruin_arch": {
      "file": "buildings/building_ruin_arch.js",
      "createdAt": 1795574440181,
      "updatedAt": 1795574440181,
      "createdLabel": "11-24 21:40",
      "updatedLabel": "11-24 21:40"
    },
    "building_stone_gate": {
      "file": "buildings/building_stone_gate.js",
      "createdAt": 1795573746494,
      "updatedAt": 1795573746494,
      "createdLabel": "11-24 21:29",
      "updatedLabel": "11-24 21:29"
    },
    "scene_campfire": {
      "file": "scenes/scene_campfire.js",
      "createdAt": 1795573564792,
      "updatedAt": 1795573564792,
      "createdLabel": "11-24 21:26",
      "updatedLabel": "11-24 21:26"
    },
    "scene_crates_sign": {
      "file": "scenes/scene_crates_sign.js",
      "createdAt": 1795573567459,
      "updatedAt": 1795573567459,
      "createdLabel": "11-24 21:26",
      "updatedLabel": "11-24 21:26"
    },
    "scene_flora_cluster": {
      "file": "scenes/scene_flora_cluster.js",
      "createdAt": 1795574277614,
      "updatedAt": 1795574447073,
      "createdLabel": "11-24 21:37",
      "updatedLabel": "11-24 21:40"
    },
    "scene_forest_tree": {
      "file": "scenes/scene_forest_tree.js",
      "createdAt": 1795573569934,
      "updatedAt": 1795573569934,
      "createdLabel": "11-24 21:26",
      "updatedLabel": "11-24 21:26"
    },
    "scene_rock_hollow": {
      "file": "scenes/scene_rock_hollow.js",
      "createdAt": 1795573572570,
      "updatedAt": 1795573572570,
      "createdLabel": "11-24 21:26",
      "updatedLabel": "11-24 21:26"
    },
    "scene_t01_fluff_cloud": {
      "file": "scenes/scene_t01_fluff_cloud.js",
      "createdAt": 1795574347293,
      "updatedAt": 1795574472143,
      "createdLabel": "11-24 21:39",
      "updatedLabel": "11-24 21:41"
    },
    "scene_t01_sky_pillar": {
      "file": "scenes/scene_t01_sky_pillar.js",
      "createdAt": 1795574350884,
      "updatedAt": 1795574350884,
      "createdLabel": "11-24 21:39",
      "updatedLabel": "11-24 21:39"
    },
    "scene_t02_charged_cairn": {
      "file": "scenes/scene_t02_charged_cairn.js",
      "createdAt": 1795574357134,
      "updatedAt": 1795574357134,
      "createdLabel": "11-24 21:39",
      "updatedLabel": "11-24 21:39"
    },
    "scene_t02_thunder_spire": {
      "file": "scenes/scene_t02_thunder_spire.js",
      "createdAt": 1795574353860,
      "updatedAt": 1795574475368,
      "createdLabel": "11-24 21:39",
      "updatedLabel": "11-24 21:41"
    },
    "scene_t03_lotus_reed": {
      "file": "scenes/scene_t03_lotus_reed.js",
      "createdAt": 1795574337192,
      "updatedAt": 1795574337192,
      "createdLabel": "11-24 21:38",
      "updatedLabel": "11-24 21:38"
    },
    "scene_t03_warm_vent_rock": {
      "file": "scenes/scene_t03_warm_vent_rock.js",
      "createdAt": 1795574333470,
      "updatedAt": 1795574534917,
      "createdLabel": "11-24 21:38",
      "updatedLabel": "11-24 21:42"
    },
    "scene_t04_cobble_crevice": {
      "file": "scenes/scene_t04_cobble_crevice.js",
      "createdAt": 1795574340136,
      "updatedAt": 1795574340136,
      "createdLabel": "11-24 21:39",
      "updatedLabel": "11-24 21:39"
    },
    "scene_t04_driftwood_weir": {
      "file": "scenes/scene_t04_driftwood_weir.js",
      "createdAt": 1795574342244,
      "updatedAt": 1795574342244,
      "createdLabel": "11-24 21:39",
      "updatedLabel": "11-24 21:39"
    },
    "scene_t05_ice_floe_hole": {
      "file": "scenes/scene_t05_ice_floe_hole.js",
      "createdAt": 1795574204438,
      "updatedAt": 1795574416194,
      "createdLabel": "11-24 21:36",
      "updatedLabel": "11-24 21:40"
    },
    "scene_t05_ice_ridge": {
      "file": "scenes/scene_t05_ice_ridge.js",
      "createdAt": 1795574201405,
      "updatedAt": 1795574524434,
      "createdLabel": "11-24 21:36",
      "updatedLabel": "11-24 21:42"
    },
    "scene_t06_floating_kelp": {
      "file": "scenes/scene_t06_floating_kelp.js",
      "createdAt": 1795574376263,
      "updatedAt": 1795574376263,
      "createdLabel": "11-24 21:39",
      "updatedLabel": "11-24 21:39"
    },
    "scene_t06_sea_stack": {
      "file": "scenes/scene_t06_sea_stack.js",
      "createdAt": 1795574372935,
      "updatedAt": 1795574372936,
      "createdLabel": "11-24 21:39",
      "updatedLabel": "11-24 21:39"
    },
    "scene_t07_coral_colony": {
      "file": "scenes/scene_t07_coral_colony.js",
      "createdAt": 1795574415904,
      "updatedAt": 1795574415904,
      "createdLabel": "11-24 21:40",
      "updatedLabel": "11-24 21:40"
    },
    "scene_t07_giant_clam_reef": {
      "file": "scenes/scene_t07_giant_clam_reef.js",
      "createdAt": 1795574420965,
      "updatedAt": 1795574420966,
      "createdLabel": "11-24 21:40",
      "updatedLabel": "11-24 21:40"
    },
    "scene_t08_mangrove_stump": {
      "file": "scenes/scene_t08_mangrove_stump.js",
      "createdAt": 1795574425995,
      "updatedAt": 1795574425995,
      "createdLabel": "11-24 21:40",
      "updatedLabel": "11-24 21:40"
    },
    "scene_t08_tidepool_rock": {
      "file": "scenes/scene_t08_tidepool_rock.js",
      "createdAt": 1795574423560,
      "updatedAt": 1795574423560,
      "createdLabel": "11-24 21:40",
      "updatedLabel": "11-24 21:40"
    },
    "scene_t09_fallen_fruit_log": {
      "file": "scenes/scene_t09_fallen_fruit_log.js",
      "createdAt": 1795573574875,
      "updatedAt": 1795573574875,
      "createdLabel": "11-24 21:26",
      "updatedLabel": "11-24 21:26"
    },
    "scene_t10_giant_bud": {
      "file": "scenes/scene_t10_giant_bud.js",
      "createdAt": 1795574274815,
      "updatedAt": 1795574274815,
      "createdLabel": "11-24 21:37",
      "updatedLabel": "11-24 21:37"
    },
    "scene_t11_canopy_bough": {
      "file": "scenes/scene_t11_canopy_bough.js",
      "createdAt": 1795574280527,
      "updatedAt": 1795574280527,
      "createdLabel": "11-24 21:38",
      "updatedLabel": "11-24 21:38"
    },
    "scene_t11_epiphyte_nest": {
      "file": "scenes/scene_t11_epiphyte_nest.js",
      "createdAt": 1795574283370,
      "updatedAt": 1795574283370,
      "createdLabel": "11-24 21:38",
      "updatedLabel": "11-24 21:38"
    },
    "scene_t12_bamboo_clump": {
      "file": "scenes/scene_t12_bamboo_clump.js",
      "createdAt": 1795574305265,
      "updatedAt": 1795574305265,
      "createdLabel": "11-24 21:38",
      "updatedLabel": "11-24 21:38"
    },
    "scene_t12_bamboo_stone_shrine": {
      "file": "scenes/scene_t12_bamboo_stone_shrine.js",
      "createdAt": 1795574308844,
      "updatedAt": 1795574308844,
      "createdLabel": "11-24 21:38",
      "updatedLabel": "11-24 21:38"
    },
    "scene_t15_cave_rib_crystal": {
      "file": "scenes/scene_t15_cave_rib_crystal.js",
      "createdAt": 1795574437808,
      "updatedAt": 1795574437808,
      "createdLabel": "11-24 21:40",
      "updatedLabel": "11-24 21:40"
    },
    "scene_t15_stalagmite_shroom": {
      "file": "scenes/scene_t15_stalagmite_shroom.js",
      "createdAt": 1795574435348,
      "updatedAt": 1795574597166,
      "createdLabel": "11-24 21:40",
      "updatedLabel": "11-24 21:43"
    },
    "scene_t16_moss_obelisk": {
      "file": "scenes/scene_t16_moss_obelisk.js",
      "createdAt": 1795574442662,
      "updatedAt": 1795574442662,
      "createdLabel": "11-24 21:40",
      "updatedLabel": "11-24 21:40"
    },
    "scene_t17_swamp_cypress": {
      "file": "scenes/scene_t17_swamp_cypress.js",
      "createdAt": 1795574399377,
      "updatedAt": 1795574399377,
      "createdLabel": "11-24 21:39",
      "updatedLabel": "11-24 21:39"
    },
    "scene_t18_magma_vent": {
      "file": "scenes/scene_t18_magma_vent.js",
      "createdAt": 1795574401865,
      "updatedAt": 1795574401865,
      "createdLabel": "11-24 21:40",
      "updatedLabel": "11-24 21:40"
    },
    "scene_t19_rib_arch": {
      "file": "scenes/scene_t19_rib_arch.js",
      "createdAt": 1795574464678,
      "updatedAt": 1795574519330,
      "createdLabel": "11-24 21:41",
      "updatedLabel": "11-24 21:41"
    },
    "scene_t19_skull_fungus": {
      "file": "scenes/scene_t19_skull_fungus.js",
      "createdAt": 1795574467772,
      "updatedAt": 1795574584044,
      "createdLabel": "11-24 21:41",
      "updatedLabel": "11-24 21:43"
    },
    "scene_t21_mineral_chimney": {
      "file": "scenes/scene_t21_mineral_chimney.js",
      "createdAt": 1795574406234,
      "updatedAt": 1795574406235,
      "createdLabel": "11-24 21:40",
      "updatedLabel": "11-24 21:40"
    },
    "scene_t21_travertine_pool": {
      "file": "scenes/scene_t21_travertine_pool.js",
      "createdAt": 1795574404146,
      "updatedAt": 1795574531070,
      "createdLabel": "11-24 21:40",
      "updatedLabel": "11-24 21:42"
    },
    "scene_tavern_bar": {
      "file": "scenes/scene_tavern_bar.js",
      "createdAt": 1795573713934,
      "updatedAt": 1795573713934,
      "createdLabel": "11-24 21:28",
      "updatedLabel": "11-24 21:28"
    },
    "scene_tavern_hearth_board": {
      "file": "scenes/scene_tavern_hearth_board.js",
      "createdAt": 1795573716535,
      "updatedAt": 1795573716535,
      "createdLabel": "11-24 21:28",
      "updatedLabel": "11-24 21:28"
    }
  },
  "templates": {
    "npc": [
      {
        "code": "N01",
        "category": "npc",
        "typeCode": "N01",
        "typeName": "标准远程法系人形（主角标杆）",
        "typeLabel": "N01 标准远程法系人形（主角标杆）",
        "name": "宝石卡牌法师",
        "suggestedId": "npc_mage",
        "covers": "主角、法系队友",
        "spec": "人类头身比、大臂/小臂滞后两段手臂、斗篷长袍弹簧、非循环 `actions`（抬杖施法）",
        "status": "done"
      },
      {
        "code": "N02",
        "category": "npc",
        "typeCode": "N02",
        "typeName": "重甲持盾近战人形（坦克 / 战士）",
        "typeLabel": "N02 重甲持盾近战人形（坦克 / 战士）",
        "name": "重甲盾卫",
        "suggestedId": "npc_vanguard",
        "covers": "坦克 / 战士队友",
        "spec": "厚重肩甲胸甲分块、左手大盾/右手重武器双持零穿模、举盾格挡动作",
        "status": "done"
      },
      {
        "code": "N03",
        "category": "npc",
        "typeCode": "N03",
        "typeName": "轻甲高机动人形（刺客 / 游侠）",
        "typeLabel": "N03 轻甲高机动人形（刺客 / 游侠）",
        "name": "轻甲双刃",
        "suggestedId": "npc_rogue",
        "covers": "刺客 / 游侠队友",
        "spec": "飘带围巾拖拽链、低身前倾疾跑姿态、高频折返与双刃动作",
        "status": "done"
      },
      {
        "code": "N04",
        "category": "npc",
        "typeCode": "N04",
        "typeName": "大厅生活交互型 NPC（站桩 / 摊位）",
        "typeLabel": "N04 大厅生活交互型 NPC（站桩 / 摊位）",
        "name": "酒馆吧台老板",
        "suggestedId": "npc_tavern_keeper",
        "covers": "工会接待员、装备商、招募官",
        "spec": "带小推车/柜台半固定人形，招手、点金币、整理货架等生活化非循环 `actions`",
        "status": "done"
      }
    ],
    "building": [
      {
        "code": "B01",
        "category": "building",
        "typeCode": "B01",
        "typeName": "单体木石房屋",
        "typeLabel": "B01 单体木石房屋",
        "name": "林间工会木屋",
        "suggestedId": "building_guild",
        "covers": "大厅建筑、驿站、民居",
        "spec": "实测大块拆件规矩（单块 ≤ 40 格、墙/瓦顶/门窗对称复用）、晃动招牌与烟囱炊烟",
        "status": "done"
      },
      {
        "code": "B02",
        "category": "building",
        "typeCode": "B02",
        "typeName": "布艺帐篷 / 营地摊位",
        "typeLabel": "B02 布艺帐篷 / 营地摊位",
        "name": "野外商贩布艺帐篷",
        "suggestedId": "building_camp_tent",
        "covers": "商店摊位、招募帐篷、休憩营地",
        "spec": "柔和曲面帆布顶篷体素画法、木桩支架、货架小物件摆放与布帘微风飘动",
        "status": "done"
      },
      {
        "code": "B03",
        "category": "building",
        "typeCode": "B03",
        "typeName": "高耸石门 / 塔楼",
        "typeLabel": "B03 高耸石门 / 塔楼",
        "name": "层间探索出口石门",
        "suggestedId": "building_stone_gate",
        "covers": "层间石门、高塔、遗迹大门",
        "spec": "竖向高建筑（> 48 格）俯视纵深比例、大门开合与符文微亮激活态",
        "status": "done"
      },
      {
        "code": "B04",
        "category": "building",
        "typeCode": "B04",
        "typeName": "破损遗迹 / 残垣断壁",
        "typeLabel": "B04 破损遗迹 / 残垣断壁",
        "name": "苔藓遗迹拱门",
        "suggestedId": "building_ruin_arch",
        "covers": "遗迹探索区地标、古战场掩体",
        "spec": "非对称破损断口、垂藤苔藓与碎石裂纹纹理，消除工整积木感",
        "status": "done"
      }
    ],
    "scene": [
      {
        "code": "S01",
        "category": "scene",
        "typeCode": "S01",
        "typeName": "分层树冠乔木（可半透遮挡）",
        "typeLabel": "S01 分层树冠乔木（可半透遮挡）",
        "name": "林间落果古树",
        "suggestedId": "scene_forest_tree",
        "covers": "森林空地、战斗场地背景树",
        "spec": "树干与 2~3 层树冠拆件（主角走树下时仅树冠降 `opacity`）、同屏多棵共享贴图、落叶微粒",
        "status": "done"
      },
      {
        "code": "S02",
        "category": "scene",
        "typeCode": "S02",
        "typeName": "低矮植被 / 可压弯草花丛",
        "typeLabel": "S02 低矮植被 / 可压弯草花丛",
        "name": "摇曳草花簇",
        "suggestedId": "scene_flora_cluster",
        "covers": "草坪、花甸、林下蘑菇水草",
        "spec": "轻量高频复用品、风浪摇摆与角色路过弹簧压弯反馈",
        "status": "done"
      },
      {
        "code": "S03",
        "category": "scene",
        "typeCode": "S03",
        "typeName": "自然地貌 / 隐藏树洞与石碑",
        "typeLabel": "S03 自然地貌 / 隐藏树洞与石碑",
        "name": "藏物树洞与歇脚石碑",
        "suggestedId": "scene_rock_hollow",
        "covers": "探索隐藏拾取点、歇脚石碑、矿簇",
        "spec": "常态融入环境 ↔ 走近微颤或逸出自亮微粒提示可互动的状态切换",
        "status": "done"
      },
      {
        "code": "S04",
        "category": "scene",
        "typeCode": "S04",
        "typeName": "动态火源 / 水源微生态摆件",
        "typeLabel": "S04 动态火源 / 水源微生态摆件",
        "name": "营地暖火堆",
        "suggestedId": "scene_campfire",
        "covers": "营火、火盆、冒泡泉眼、瀑布池",
        "spec": "动态分层火苗体素、上升火屑与轻烟微粒、地面暖色范围晕染",
        "status": "done"
      },
      {
        "code": "S05",
        "category": "scene",
        "typeCode": "S05",
        "typeName": "可破坏 / 可开启人造小物件",
        "typeLabel": "S05 可破坏 / 可开启人造小物件",
        "name": "岔路木牌与战利品宝箱",
        "suggestedId": "scene_crates_sign",
        "covers": "探索出口牌子、木箱、战利品宝箱",
        "spec": "成组小道具规范，宝箱带「闭合 → 弹开 → 冒金屑」多态 `actions`",
        "status": "done"
      }
    ],
    "vfx": [
      {
        "code": "V01",
        "category": "vfx",
        "typeCode": "V01",
        "typeName": "投射物与法术弹丸",
        "typeLabel": "V01 投射物与法术弹丸",
        "name": "投射物与法术弹丸",
        "suggestedId": "vfx_v01",
        "covers": "战斗施法轨迹、远程怪弹幕",
        "spec": "高速飞行自转、拖尾粒子、命中碎裂反馈",
        "status": "todo"
      },
      {
        "code": "V02",
        "category": "vfx",
        "typeCode": "V02",
        "typeName": "地面战利品与掉落物",
        "typeLabel": "V02 地面战利品与掉落物",
        "name": "地面战利品与掉落物",
        "suggestedId": "vfx_v02",
        "covers": "掉落金币、任务收集品",
        "spec": "极小体素（8~14 格）高辨识度轮廓、悬浮慢转、落地弹跳",
        "status": "todo"
      },
      {
        "code": "V03",
        "category": "vfx",
        "typeCode": "V03",
        "typeName": "周期机械 / 地形机关",
        "typeLabel": "V03 周期机械 / 地形机关",
        "name": "周期机械 / 地形机关",
        "suggestedId": "vfx_v03",
        "covers": "遗迹陷阱、机关门",
        "spec": "纯硬边机械匀速/顿挫旋转、周期触发反馈",
        "status": "todo"
      }
    ]
  },
  "items": [
    {
      "code": "天1",
      "group": "天上",
      "typeCode": "M01",
      "typeName": "脉冲漂浮 / 悬停",
      "typeLabel": "M01 脉冲漂浮 / 悬停",
      "status": "todo",
      "ref": "《山海经》当扈",
      "nick": "长须鸟",
      "size": "小（成群）",
      "look": "野鸡大小、无翼，下巴垂一大蓬多层长须，冠羽清晰",
      "habit": "成群在树冠上空兜圈；长须像水母伞般一张一合脉冲推进，啄食飘浮孢子",
      "blocks": "脉冲水母推进 + 多束弹簧长须 + 集群跟随",
      "habitats": [
        "高空云海",
        "巨木树冠"
      ],
      "createdAt": 1795489736430,
      "updatedAt": 1795491407524,
      "createdLabel": "11-23 22:08",
      "updatedLabel": "11-23 22:36"
    },
    {
      "code": "天2",
      "group": "天上",
      "typeCode": "M01",
      "typeName": "脉冲漂浮 / 悬停",
      "typeLabel": "M01 脉冲漂浮 / 悬停",
      "status": "draft",
      "ref": "《山海经》帝江 + 僧帽水母",
      "nick": "无脸红囊",
      "size": "中（几只同漂）",
      "look": "无脸红色半透鼓囊（带脉络与群落拼合感），下垂 6 条细长弹簧腿 + 4 片薄膜翅",
      "habit": "随气流漂浮并集体转圈换向；红囊周期鼓胀蓄气、收缩拍翅微跃",
      "blocks": "噪声漂浮 + 果冻二阶弹簧 + 6 条多节弹簧腿 + 4 片三段翅",
      "habitats": [
        "高空云海"
      ],
      "createdAt": 1795445944196,
      "updatedAt": 1795479808888,
      "createdLabel": "11-23 09:59",
      "updatedLabel": "11-23 19:23"
    },
    {
      "code": "天3",
      "group": "天上",
      "typeCode": "M02",
      "typeName": "振翅飞行",
      "typeLabel": "M02 振翅飞行",
      "status": "done",
      "ref": "南非传说 Impundulu",
      "nick": "",
      "size": "中",
      "look": "黑白极强对比大鸟，羽尖为硬刺结构，尾羽锐利",
      "habit": "暴雨云间高飞盘旋；强力拍翼时羽尖之间跳跃像素小电弧，落地振羽抖电",
      "blocks": "拍翅升沉飞行 + 三段硬羽振翅 + 挂点电弧微粒",
      "habitats": [
        "雷云峰顶"
      ],
      "createdAt": 1795538679138,
      "updatedAt": 1795539024945,
      "createdLabel": "11-24 11:44",
      "updatedLabel": "11-24 11:50"
    },
    {
      "code": "天4",
      "group": "天上",
      "typeCode": "M04",
      "typeName": "超长拖拽链（蛇 / 游龙）",
      "typeLabel": "M04 超长拖拽链（蛇 / 游龙）",
      "status": "done",
      "ref": "菲律宾 Bakunawa + 鲲鹏",
      "nick": "吞天长蛇",
      "size": "大",
      "look": "多对长鳍翼的巨型长蛇（水5成年态），画面只放得下一段蜿蜒巨身",
      "habit": "高空极慢巡游；周期性缓缓张开巨口横扫吞食一整片天2群落",
      "blocks": "超长拖拽约束蛇链 + 多对滞后鳍翼 + 张口吞食习性",
      "habitats": [
        "高空云海"
      ],
      "createdAt": 1795538875759,
      "updatedAt": 1795539026586,
      "createdLabel": "11-24 11:47",
      "updatedLabel": "11-24 11:50"
    },
    {
      "code": "水1",
      "group": "河湖",
      "typeCode": "M07",
      "typeName": "四足稳走 / 小跑 / 腾跃",
      "typeLabel": "M07 四足稳走 / 小跑 / 腾跃",
      "status": "done",
      "ref": "阿兹特克 Ahuizotl",
      "nick": "尾手水兽",
      "size": "小",
      "look": "犬形水兽，出水时湿毛竖成尖刺；长尾末端是一只五指灵巧手",
      "habit": "岸边涉水游走；蹲在水边把长尾伸进石缝里摸索掏螺/掏蟹，偶尔学幼兽轻叫引波纹",
      "blocks": "4 足涉水 IK + 链式长尾 + 尾手挂点掏石缝习性",
      "habitats": [
        "石缝河湾"
      ],
      "createdAt": 1795492778183,
      "updatedAt": 1795500602973,
      "createdLabel": "11-23 22:59",
      "updatedLabel": "11-24 01:10"
    },
    {
      "code": "水2",
      "group": "河湖",
      "typeCode": "M13",
      "typeName": "集群协同编队（单资产多只）",
      "typeLabel": "M13 集群协同编队（单资产多只）",
      "status": "done",
      "ref": "《山海经》精卫",
      "nick": "衔石小鸟",
      "size": "小（成群）",
      "look": "精巧小鸟，喙中永远叼着石子或短木枝，羽色分明",
      "habit": "成群在河湾上空低飞、俯冲扔石子激起水花，偶尔落在水4巨背上歇脚",
      "blocks": "轻盈拍翅飞行 + 集群轨道 + 衔石抛落水花习性",
      "habitats": [
        "石缝河湾",
        "河湖深潭"
      ],
      "createdAt": 1795538809733,
      "updatedAt": 1795538809733,
      "createdLabel": "11-24 11:46",
      "updatedLabel": "11-24 11:46"
    },
    {
      "code": "水3",
      "group": "河湖",
      "typeCode": "M03",
      "typeName": "水生脉冲泳 / 半潜人鱼",
      "typeLabel": "M03 水生脉冲泳 / 半潜人鱼",
      "status": "draft",
      "ref": "《山海经》何罗鱼 + 鮟鱇",
      "nick": "一头十身鱼",
      "size": "中",
      "look": "宽大鱼头拖着 10 条独立雄鱼长身，鳞纹与腹鳍细腻",
      "habit": "深潭巡游时 10 条鱼身如折扇张合搅泥觅食；周期性聚尾冲刺后再次散开",
      "blocks": "脉冲游泳 + 10 根真拖拽物理链 + 破水白沫 + 搅泥微粒",
      "habitats": [
        "河湖深潭"
      ],
      "createdAt": 1795445941232,
      "updatedAt": 1795479883265,
      "createdLabel": "11-23 09:59",
      "updatedLabel": "11-23 19:24"
    },
    {
      "code": "水4",
      "group": "河湖",
      "typeCode": "M16",
      "typeName": "超巨型半身 / 拆块 Boss（80~140 格）",
      "typeLabel": "M16 超巨型半身 / 拆块 Boss（80~140 格）",
      "status": "done",
      "ref": "毛利 Taniwha + 《山海经》旋龟",
      "nick": "巨龟",
      "size": "大",
      "look": "鸟头鳖尾巨龟，宽阔背甲长满摇曳水草与苔石",
      "habit": "河道深处极慢挪动；偶尔沉身翻动引发河面大波浪，叫声震出环纹；背上可栖水2与水1",
      "blocks": "4 足沉重涉水步态 + 背甲弹簧水草 + 翻身造浪习性",
      "habitats": [
        "河湖深潭"
      ],
      "createdAt": 1795523993711,
      "updatedAt": 1795524551444,
      "createdLabel": "11-24 07:39",
      "updatedLabel": "11-24 07:49"
    },
    {
      "code": "水5",
      "group": "河湖",
      "typeCode": "M03",
      "typeName": "水生脉冲泳 / 半潜人鱼",
      "typeLabel": "M03 水生脉冲泳 / 半潜人鱼",
      "status": "done",
      "ref": "天4幼年态",
      "nick": "大鱼",
      "size": "中",
      "look": "粗壮长鳍大鱼，鱼鳍随成长修长飘逸",
      "habit": "深水巡游捕食水3；周期性加速冲刺并跃出水面短暂滞空滑翔再入水",
      "blocks": "脉冲游泳 + 鱼尾链 + 蓄力跃水破浪习性",
      "habitats": [
        "河湖深潭"
      ],
      "createdAt": 1795538873983,
      "updatedAt": 1795538873983,
      "createdLabel": "11-24 11:47",
      "updatedLabel": "11-24 11:47"
    },
    {
      "code": "海1",
      "group": "海和冰",
      "typeCode": "M03",
      "typeName": "水生脉冲泳 / 半潜人鱼",
      "typeLabel": "M03 水生脉冲泳 / 半潜人鱼",
      "status": "done",
      "ref": "因纽特 Akhlut",
      "nick": "狼鲸",
      "size": "中",
      "look": "前半身苍狼（双前爪+狼首鬃毛），后半身黑白虎鲸躯干与宽大尾鳍",
      "habit": "冰面上用前爪配合甩尾奔跑留雪印，遇到冰缝一头扎进水下切换流畅摆尾潜游",
      "blocks": "双态切换（冰面奔跑 / 冰下脉冲泳）+ 虎鲸尾链 + 雪印",
      "habitats": [
        "极地冰缝"
      ],
      "createdAt": 1795492863385,
      "updatedAt": 1795499848605,
      "createdLabel": "11-23 23:01",
      "updatedLabel": "11-24 00:57"
    },
    {
      "code": "海2",
      "group": "海和冰",
      "typeCode": "M09",
      "typeName": "多足节肢 / 硬壳虫类（6~8 足）",
      "typeLabel": "M09 多足节肢 / 硬壳虫类（6~8 足）",
      "status": "done",
      "ref": "因纽特 Qalupalik",
      "nick": "",
      "size": "中",
      "look": "冰下大型甲壳兽（非人形），多节步足，背部隆起鼓鼓育儿袋",
      "habit": "冰下缓慢潜游，靠近时育儿袋搏动并在冰面传出一圈圈嗡嗡震动波纹",
      "blocks": "6 足水下步态 + 育儿袋呼吸缩放 + 冰面震波反馈",
      "habitats": [
        "极地冰缝"
      ],
      "createdAt": 1795502811991,
      "updatedAt": 1795503537027,
      "createdLabel": "11-24 01:46",
      "updatedLabel": "11-24 01:58"
    },
    {
      "code": "海3",
      "group": "海和冰",
      "typeCode": "M16",
      "typeName": "超巨型半身 / 拆块 Boss（80~140 格）",
      "typeLabel": "M16 超巨型半身 / 拆块 Boss（80~140 格）",
      "status": "done",
      "ref": "《国王之镜》Hafgufa",
      "nick": "岛屿巨怪",
      "size": "大",
      "look": "背部积沙长草、有海鸟落脚的小岛状巨兽，仅露出巨背与巨口",
      "habit": "平时如浮岛微沉微浮；进食时缓缓浮起张开巨口吐出食糜微粒，引小鱼汇聚后猛然合口",
      "blocks": "扎根微浮 + 巨口开合动画 + 食糜挂点吸引小鱼生态",
      "habitats": [
        "远洋浮岛海域"
      ],
      "createdAt": 1795505048688,
      "updatedAt": 1795505740712,
      "createdLabel": "11-24 02:24",
      "updatedLabel": "11-24 02:35"
    },
    {
      "code": "海4",
      "group": "海和冰",
      "typeCode": "M13",
      "typeName": "集群协同编队（单资产多只）",
      "typeLabel": "M13 集群协同编队（单资产多只）",
      "status": "done",
      "ref": "《山海经》文鳐鱼",
      "nick": "翅鲤",
      "size": "小（成群）",
      "look": "白首赤喙、青纹鲤身，生有一对舒展鸟翼",
      "habit": "成群游动，周期性齐刷刷冲破海面展翼滑翔一大段再落水溅花",
      "blocks": "集群游泳 + 破水展翼滑翔双态 + 涟漪白沫",
      "habitats": [
        "远洋浮岛海域"
      ],
      "createdAt": 1795504715361,
      "updatedAt": 1795505775361,
      "createdLabel": "11-24 02:18",
      "updatedLabel": "11-24 02:36"
    },
    {
      "code": "地1",
      "group": "林地地面",
      "typeCode": "M07",
      "typeName": "四足稳走 / 小跑 / 腾跃",
      "typeLabel": "M07 四足稳走 / 小跑 / 腾跃",
      "status": "draft",
      "ref": "亚马逊 Mapinguari",
      "nick": "肚嘴巨兽",
      "size": "大",
      "look": "大地懒体型、浓密赤红长毛，小脑袋只管张望，肚皮正中一张竖裂巨嘴，脚掌朝后长",
      "habit": "可四足沉稳迈步，也能人立起来俯身用肚嘴贴地扒拉落果，伴随发酵果雾微粒与反方向足印",
      "blocks": "4 足弯膝 IK + 四足/直立双姿 + 竖裂肚嘴开合 + 长毛弹簧",
      "habitats": [
        "林地落果空坪"
      ],
      "createdAt": 1795445947283,
      "updatedAt": 1795500605199,
      "createdLabel": "11-23 09:59",
      "updatedLabel": "11-24 01:10"
    },
    {
      "code": "地2",
      "group": "林地地面",
      "typeCode": "M10",
      "typeName": "扎根固定本体 + 派生子实体",
      "typeLabel": "M10 扎根固定本体 + 派生子实体",
      "status": "done",
      "ref": "鞑靼植物羊",
      "nick": "植物羊",
      "size": "小（成片）",
      "look": "地面长出弯曲绿茎，末端连着一只毛茸茸圆润小羊",
      "habit": "根部固定，小羊低头绕茎一圈啃草、摇尾抖耳；草吃完后茎叶泛黄微萎再循环",
      "blocks": "扎根固定 + 链式弯茎 + 啃草抬头低头习性",
      "habitats": [
        "林地落果空坪"
      ],
      "createdAt": 1795538775883,
      "updatedAt": 1795538775883,
      "createdLabel": "11-24 11:46",
      "updatedLabel": "11-24 11:46"
    },
    {
      "code": "地3",
      "group": "林地地面",
      "typeCode": "M07",
      "typeName": "四足稳走 / 小跑 / 腾跃",
      "typeLabel": "M07 四足稳走 / 小跑 / 腾跃",
      "status": "done",
      "ref": "《山海经》狰",
      "nick": "五尾红豹",
      "size": "中",
      "look": "赤红修长巨豹，额头一根短独角，身后 5 条长尾",
      "habit": "敏捷四足小跑巡猎；遇到岩石会停步用独角“当当”敲石划地盘，受惊时 5 条尾巴猛然炸开成扇面",
      "blocks": "4 足敏捷 IK + 5 根拖拽长尾 + 敲石震纹与开扇威吓",
      "habitats": [
        "林地落果空坪"
      ],
      "createdAt": 1795492858212,
      "updatedAt": 1795500081100,
      "createdLabel": "11-23 23:00",
      "updatedLabel": "11-24 01:01"
    },
    {
      "code": "地4",
      "group": "林地地面",
      "typeCode": "M07",
      "typeName": "四足稳走 / 小跑 / 腾跃",
      "typeLabel": "M07 四足稳走 / 小跑 / 腾跃",
      "status": "done",
      "ref": "波斯 Shadhavar",
      "nick": "空心角瞪羚",
      "size": "中（成群）",
      "look": "优雅瞪羚体态，头顶一棵分出数十叉的空心树角，角杈间停着小鸟",
      "habit": "成群在林间空地踱步吃草；微风吹过时空心角发出律动音环，头顶小鸟随之蹦跳",
      "blocks": "4 足轻盈步态 + 弹簧多叉角 + 随风声波环与停驻小鸟",
      "habitats": [
        "林地落果空坪",
        "花丛草甸"
      ],
      "createdAt": 1795538777555,
      "updatedAt": 1795538986000,
      "createdLabel": "11-24 11:46",
      "updatedLabel": "11-24 11:49"
    },
    {
      "code": "树1",
      "group": "树上",
      "typeCode": "M10",
      "typeName": "扎根固定本体 + 派生子实体",
      "typeLabel": "M10 扎根固定本体 + 派生子实体",
      "status": "done",
      "ref": "澳洲 Yara-ma-yha-who + 彩带吸虫",
      "nick": "",
      "size": "中",
      "look": "倒挂在树枝上的隐蔽躯体，垂下一截一鼓一鼓鲜红脉动长肉囊",
      "habit": "平时晃动红肉囊当诱饵吸引路过小生物；周期性骤然垂落罩地再迅速缩回树冠",
      "blocks": "倒挂弹簧垂链 + 肉囊脉动呼吸 + 骤降捕食回缩习性",
      "habitats": [
        "巨木树冠"
      ],
      "createdAt": 1795524002741,
      "updatedAt": 1795524553142,
      "createdLabel": "11-24 07:40",
      "updatedLabel": "11-24 07:49"
    },
    {
      "code": "树2",
      "group": "树上",
      "typeCode": "M10",
      "typeName": "扎根固定本体 + 派生子实体",
      "typeLabel": "M10 扎根固定本体 + 派生子实体",
      "status": "done",
      "ref": "Waq-waq 树",
      "nick": "走果巨树",
      "size": "大（固定）",
      "look": "苍劲巨树本体，枝梢垂挂多颗会蠕动的囊果（非人头）",
      "habit": "巨树主干扎根微摆；熟透的囊果周期性脱离枝头落地发出一圈叫声波纹，长出小脚自己爬走钻土",
      "blocks": "扎根呼吸 + 弹簧树枝 + 成熟囊果脱落爬行子实体",
      "habitats": [
        "巨木树冠"
      ],
      "createdAt": 1795504965288,
      "updatedAt": 1795505494392,
      "createdLabel": "11-24 02:22",
      "updatedLabel": "11-24 02:31"
    },
    {
      "code": "树3",
      "group": "树上",
      "typeCode": "M12",
      "typeName": "动态变形 / 实时成长装配",
      "typeLabel": "M12 动态变形 / 实时成长装配",
      "status": "done",
      "ref": "斯拉夫 Leshy",
      "nick": "伸缩巨兽",
      "size": "大（体型可变）",
      "look": "苔藓、树皮与断鹿角拼搭出的高大林木身躯，多节可伸缩躯干",
      "habit": "巡游时走进林区深处会一节节拔高成参天树人，走到空地边缘又一节节缩成矮灌木，走过处冒出嫩芽",
      "blocks": "多节伸缩脊柱 + 2 足沉重步态 + 步履生芽习性",
      "habitats": [
        "巨木树冠",
        "林地落果空坪"
      ],
      "createdAt": 1795502976265,
      "updatedAt": 1795503704290,
      "createdLabel": "11-24 01:49",
      "updatedLabel": "11-24 02:01"
    },
    {
      "code": "树4",
      "group": "树上",
      "typeCode": "M06",
      "typeName": "二足走跑",
      "typeLabel": "M06 二足走跑",
      "status": "done",
      "ref": "日本 Basan",
      "nick": "吐火竹鸡",
      "size": "小~中",
      "look": "火鸡体型、鲜红大鸡冠，尾羽与翅羽如细长竹叶层叠",
      "habit": "竹林间昂首阔步啄行；周期性鼓起喉囊吐出一小团不烫人的淡蓝/青白冷火逼出竹节小虫并啄食",
      "blocks": "2 足禽类点步 + 羽尾弹簧 + 吐冷火啄虫习性",
      "habitats": [
        "翠绿竹林"
      ],
      "createdAt": 1795493002060,
      "updatedAt": 1795498676489,
      "createdLabel": "11-23 23:03",
      "updatedLabel": "11-24 00:37"
    },
    {
      "code": "沙1",
      "group": "沙漠",
      "typeCode": "M04",
      "typeName": "超长拖拽链（蛇 / 游龙）",
      "typeLabel": "M04 超长拖拽链（蛇 / 游龙）",
      "status": "done",
      "ref": "蒙古死亡蠕虫 Olgoi-khorkhoi",
      "nick": "",
      "size": "中",
      "look": "粗短鲜红环状体节，首尾对称难分正反，表皮带湿润肉褶",
      "habit": "平时半埋沙下顺风纹蠕动拱出沙垄；偶发整条钻出沙面翻滚舒展再迅速潜沙",
      "blocks": "蠕动伸缩体节链 + 沙垄扬尘 + 钻沙半潜淡化",
      "habitats": [
        "戈壁沙丘"
      ],
      "createdAt": 1795521264227,
      "updatedAt": 1795523174662,
      "createdLabel": "11-24 06:54",
      "updatedLabel": "11-24 07:26"
    },
    {
      "code": "沙2",
      "group": "沙漠",
      "typeCode": "M12",
      "typeName": "动态变形 / 实时成长装配",
      "typeLabel": "M12 动态变形 / 实时成长装配",
      "status": "done",
      "ref": "韩国不可杀伊",
      "nick": "吞铁兽",
      "size": "大（渐大）",
      "look": "无嘴厚重兽躯，腹底垂挂细密根须，身上嵌满刀剑、铁锅、铜片等金属杂物",
      "habit": "缓慢巡行，停在金属碎片上伸出腹底根须将其吸进体内，每吃一样体型微涨一圈并新嵌金属件",
      "blocks": "4 足沉重步态 + 腹底弹簧根须 + 吞铁成长习性",
      "habitats": [
        "戈壁沙丘"
      ],
      "createdAt": 1795538938374,
      "updatedAt": 1795538938374,
      "createdLabel": "11-24 11:48",
      "updatedLabel": "11-24 11:48"
    },
    {
      "code": "沙3",
      "group": "沙漠",
      "typeCode": "M07",
      "typeName": "四足稳走 / 小跑 / 腾跃",
      "typeLabel": "M07 四足稳走 / 小跑 / 腾跃",
      "status": "done",
      "ref": "《山海经》蜚",
      "nick": "枯竭独目牛",
      "size": "大",
      "look": "干裂泥土般龟裂身躯，苍白牛首、正中独目，身后拖着一条长蛇尾",
      "habit": "缓慢沉重前行，脚下走过之处地面瞬间干裂泛黄、草叶枯萎飘散，蛇尾拖出沙沟",
      "blocks": "4 足重步 IK + 拖拽蛇尾链 + 走过枯竭地表印",
      "habitats": [
        "戈壁沙丘"
      ],
      "createdAt": 1795538940135,
      "updatedAt": 1795539108114,
      "createdLabel": "11-24 11:49",
      "updatedLabel": "11-24 11:51"
    },
    {
      "code": "沙4",
      "group": "沙漠",
      "typeCode": "M07",
      "typeName": "四足稳走 / 小跑 / 腾跃",
      "typeLabel": "M07 四足稳走 / 小跑 / 腾跃",
      "status": "done",
      "ref": "波斯 Karkadann",
      "nick": "",
      "size": "中~大",
      "look": "厚甲犀牛体型，鼻端一根带年轮沟纹的黑色弯角，角尖常停一只斑鸠小鸟",
      "habit": "平时脾气暴躁低头刨沙蓄势；角上斑鸠一开口唱歌（飘出音环），它就立刻安静下来眯眼摇耳",
      "blocks": "4 足重兽步态 + 刨沙扬尘 + 角上斑鸠安抚互动习性",
      "habitats": [
        "戈壁沙丘",
        "沙漠绿洲水边"
      ],
      "createdAt": 1795493010967,
      "updatedAt": 1795500600815,
      "createdLabel": "11-23 23:03",
      "updatedLabel": "11-24 01:10"
    },
    {
      "code": "沙5",
      "group": "沙漠",
      "typeCode": "M07",
      "typeName": "四足稳走 / 小跑 / 腾跃",
      "typeLabel": "M07 四足稳走 / 小跑 / 腾跃",
      "status": "done",
      "ref": "古埃及 Ammit",
      "nick": "",
      "size": "中",
      "look": "鳄鱼长吻头、雄狮鬃毛前身、圆滚河马后身，拼接过渡自然",
      "habit": "绿洲水边半潜伏仅露双眼与鼻孔，缓慢涉水巡视，偶发张鳄口打哈欠露出利齿",
      "blocks": "4 足水陆步态 + 鳄尾链 + 绿洲半潜伏击习性",
      "habitats": [
        "沙漠绿洲水边"
      ],
      "createdAt": 1795538941974,
      "updatedAt": 1795538941974,
      "createdLabel": "11-24 11:49",
      "updatedLabel": "11-24 11:49"
    },
    {
      "code": "洞1",
      "group": "地下、洞穴",
      "typeCode": "M08",
      "typeName": "软体蠕动缩壳",
      "typeLabel": "M08 软体蠕动缩壳",
      "status": "done",
      "ref": "阿尔卑斯 Tatzelwurm",
      "nick": "猫头蛇",
      "size": "小",
      "look": "大眼大耳猫首、修长蛇身，仅有两只敏捷前爪",
      "habit": "岩缝间靠双前爪交替爬行拖着长尾；时不时停下竖起猫耳倾听岩壁动静再猛扑一小段",
      "blocks": "2 前爪爬行 IK + 拖拽蛇尾链 + 竖耳倾听习性",
      "habitats": [
        "地下暗河溶洞"
      ],
      "createdAt": 1795538854636,
      "updatedAt": 1795538854636,
      "createdLabel": "11-24 11:47",
      "updatedLabel": "11-24 11:47"
    },
    {
      "code": "洞2",
      "group": "地下、洞穴",
      "typeCode": "M10",
      "typeName": "扎根固定本体 + 派生子实体",
      "typeLabel": "M10 扎根固定本体 + 派生子实体",
      "status": "done",
      "ref": "西班牙 Cuélebre",
      "nick": "岩壁巨蛇",
      "size": "大",
      "look": "覆满石板厚鳞的巨蛇，背生一对小翼，后半截身躯与岩层融为一体，唯独喉咙柔软搏动",
      "habit": "固定盘踞岩台，仅前半身与喉咙缓慢呼吸、小翼微抖；周期性抖落厚重石鳞引来洞穴小生物",
      "blocks": "固定盘踞 + 颈部慢链摆动 + 喉咙搏动与掉鳞习性",
      "habitats": [
        "地下暗河溶洞"
      ],
      "createdAt": 1795538856403,
      "updatedAt": 1795539102174,
      "createdLabel": "11-24 11:47",
      "updatedLabel": "11-24 11:51"
    },
    {
      "code": "洞3",
      "group": "地下、洞穴",
      "typeCode": "M11",
      "typeName": "单足重击弹跳（非对称奇异体型）",
      "typeLabel": "M11 单足重击弹跳（非对称奇异体型）",
      "status": "done",
      "ref": "《山海经》夔",
      "nick": "单腿雷牛",
      "size": "中",
      "look": "青灰无角壮牛，只有一条粗壮独腿，身躯浑圆有力",
      "habit": "单腿蓄力压扁弹跳前行；每次落地震出环形岩尘与声波，震落上方石笋碎屑后低头啃食",
      "blocks": "单足蓄力弹跳 + 二阶落地压扁弹簧 + 震地落屑习性",
      "habitats": [
        "地下暗河溶洞"
      ],
      "createdAt": 1795502754030,
      "updatedAt": 1795503764124,
      "createdLabel": "11-24 01:45",
      "updatedLabel": "11-24 02:02"
    },
    {
      "code": "洞4",
      "group": "地下、洞穴",
      "typeCode": "M08",
      "typeName": "软体蠕动缩壳",
      "typeLabel": "M08 软体蠕动缩壳",
      "status": "done",
      "ref": "格陵兰 Tupilak + 石蛾幼虫",
      "nick": "拼骨幼虫",
      "size": "小",
      "look": "柔软苍白软体核心，背上背着由随机零碎兽骨、肋骨、小颅骨拼搭的拼装骨壳",
      "habit": "慢吞吞在洞底爬行捡拾骨渣；受惊时整只缩进骨壳里微微发抖，探头确认安全再爬",
      "blocks": "软体蠕动 + 弹簧拼装骨壳 + 拾骨补壳与缩壳习性",
      "habitats": [
        "地下暗河溶洞"
      ],
      "createdAt": 1795492893211,
      "updatedAt": 1795493027770,
      "createdLabel": "11-23 23:01",
      "updatedLabel": "11-23 23:03"
    },
    {
      "code": "泽1",
      "group": "沼泽",
      "typeCode": "M07",
      "typeName": "四足稳走 / 小跑 / 腾跃",
      "typeLabel": "M07 四足稳走 / 小跑 / 腾跃",
      "status": "done",
      "ref": "智利 Camahueto",
      "nick": "破土牛犊",
      "size": "小→大",
      "look": "幼年仅泥面露出一截青角；成年为青灰独角大牛犊，蹄带泥浆",
      "habit": "双态循环：先半埋泥潭只露独角微微震动蓄积水汽，随后破泥跃出猛然奔跑冲刺留下一道水沟",
      "blocks": "潜泥/破土双态 + 4 足奔跑 IK + 冲刺留水迹习性",
      "habitats": [
        "沼泽泥潭"
      ],
      "createdAt": 1795492885910,
      "updatedAt": 1795500598560,
      "createdLabel": "11-23 23:01",
      "updatedLabel": "11-24 01:09"
    },
    {
      "code": "泽2",
      "group": "沼泽",
      "typeCode": "M07",
      "typeName": "四足稳走 / 小跑 / 腾跃",
      "typeLabel": "M07 四足稳走 / 小跑 / 腾跃",
      "status": "done",
      "ref": "《山海经》化蛇",
      "nick": "",
      "size": "中",
      "look": "豺狼身躯（非人脸）、背生一对鸟翼，却四肢收贴地面像蛇一样扭动爬行",
      "habit": "贴地蛇行游走、双翼不飞只随扭动开合平衡；遇低气压前兆时集体钻泥惊窜并呼啸出声波环",
      "blocks": "贴地蛇行拖拽链 + 鸟翼辅助平衡 + 涨水惊窜习性",
      "habitats": [
        "沼泽泥潭"
      ],
      "createdAt": 1795538943827,
      "updatedAt": 1795538943827,
      "createdLabel": "11-24 11:49",
      "updatedLabel": "11-24 11:49"
    },
    {
      "code": "泽3",
      "group": "沼泽",
      "typeCode": "M02",
      "typeName": "振翅飞行",
      "typeLabel": "M02 振翅飞行",
      "status": "done",
      "ref": "智利 Peuchen",
      "nick": "",
      "size": "中",
      "look": "细长毒蛇身、一对宽大蝙蝠膜翅，头顶一对精致小鹿角",
      "habit": "沼泽低空盘旋滑翔；周期性悬停张口发出尖锐震波环，随后俯冲贴水掠过",
      "blocks": "拍翅滑翔飞行 + 拖拽细蛇尾 + 低空尖啸震波习性",
      "habitats": [
        "沼泽泥潭"
      ],
      "createdAt": 1795538680966,
      "updatedAt": 1795538680966,
      "createdLabel": "11-24 11:44",
      "updatedLabel": "11-24 11:44"
    },
    {
      "code": "特1",
      "group": "项目已有扩展生物",
      "typeCode": "M05",
      "typeName": "软体弹跳 / 两栖蛙跳",
      "typeLabel": "M05 软体弹跳 / 两栖蛙跳",
      "status": "draft",
      "ref": "弹性史莱姆",
      "nick": "史莱姆",
      "size": "小~中",
      "look": "晶莹胶质水滴外层 + 内部独立悬浮亮核与小气泡",
      "habit": "四阶段真实蓄力弹跳，砸地二次果冻衰减回弹，内核滞后砸下再弹起；沼泽边吞食腐殖微粒",
      "blocks": "四阶段弹跳 + 低阻尼果冻弹簧 + 滞后内核弹簧",
      "habitats": [
        "沼泽泥潭"
      ],
      "createdAt": 1795489900012,
      "updatedAt": 1795489900015,
      "createdLabel": "11-23 22:11",
      "updatedLabel": "11-23 22:11"
    },
    {
      "code": "特2",
      "group": "项目已有扩展生物",
      "typeCode": "M02",
      "typeName": "振翅飞行",
      "typeLabel": "M02 振翅飞行",
      "status": "draft",
      "ref": "洞窟翼蝠",
      "nick": "洞窟翼蝠",
      "size": "小~中",
      "look": "绒毛小身躯、雷达大耳、宽大三段皮膜翼与细小利爪",
      "habit": "拍两下展翼滑翔（Flap-and-Glide）节律，升沉相位滞后于翼下拍，大耳独立雷达微转",
      "blocks": "拍翼滑翔 + 三段振翅 + 高度接地印",
      "habitats": [
        "地下暗河溶洞"
      ],
      "createdAt": 1795447708413,
      "updatedAt": 1795482783375,
      "createdLabel": "11-23 10:28",
      "updatedLabel": "11-23 20:13"
    },
    {
      "code": "特3",
      "group": "项目已有扩展生物",
      "typeCode": "M01",
      "typeName": "脉冲漂浮 / 悬停",
      "typeLabel": "M01 脉冲漂浮 / 悬停",
      "status": "draft",
      "ref": "林间妖精",
      "nick": "林间妖精",
      "size": "小",
      "look": "纤细花瓣裙身、花冠亮核、4 片高频蝶翼与 3 束长发飘带",
      "habit": "蜂鸟式悬停轻舞与灵巧折线穿飞，沿途轻洒花粉微粒，与地4共享花甸生态",
      "blocks": "高频三段蝶翼 + 蜂鸟悬停穿飞 + 飘带弹簧链",
      "habitats": [
        "花丛草甸"
      ],
      "createdAt": 1795447711327,
      "updatedAt": 1795484445241,
      "createdLabel": "11-23 10:28",
      "updatedLabel": "11-23 20:40"
    },
    {
      "code": "特4",
      "group": "项目已有扩展生物",
      "typeCode": "M06",
      "typeName": "二足走跑",
      "typeLabel": "M06 二足走跑",
      "status": "draft",
      "ref": "苔绿哥布林",
      "nick": "",
      "size": "小~中",
      "look": "尖长抖动大耳、鼓胀行囊、矮身微蹲、手持短刃",
      "habit": "原地贼眉鼠眼四处张望抖耳，突然压低身子高频小碎步窜向新点，落地出尘土",
      "blocks": "2 足高频 IK + 矮身窜行 + 短刃/耳朵弹簧",
      "habitats": [
        "林地落果空坪",
        "苔藓古石"
      ],
      "createdAt": 1795447579346,
      "updatedAt": 1795498684813,
      "createdLabel": "11-23 10:26",
      "updatedLabel": "11-24 00:38"
    },
    {
      "code": "特5",
      "group": "项目已有扩展生物",
      "typeCode": "M05",
      "typeName": "软体弹跳 / 两栖蛙跳",
      "typeLabel": "M05 软体弹跳 / 两栖蛙跳",
      "status": "draft",
      "ref": "滩涂鱼人",
      "nick": "滩涂鱼人",
      "size": "中",
      "look": "两栖微蹲躯干、大凸鱼眼、背棘鳃鳍与骨叉",
      "habit": "浅滩低蹲鼓鳃呼吸，连续蛙跳扑水溅出白浪与涟漪，落地果冻缓冲压扁",
      "blocks": "水陆蛙跳推进 + 落地溅花 + 骨叉弹簧",
      "habitats": [
        "潮汐滩涂"
      ],
      "createdAt": 1795447714176,
      "updatedAt": 1795484289589,
      "createdLabel": "11-23 10:28",
      "updatedLabel": "11-23 20:38"
    },
    {
      "code": "特6",
      "group": "项目已有扩展生物",
      "typeCode": "M04",
      "typeName": "超长拖拽链（蛇 / 游龙）",
      "typeLabel": "M04 超长拖拽链（蛇 / 游龙）",
      "status": "draft",
      "ref": "鳞甲魔蛇",
      "nick": "",
      "size": "中",
      "look": "棱角蛇首、背脊骨棱、14 节密排厚鳞蛇身与红信",
      "habit": "14 节真拖拽约束蜿蜒游走，停顿盘踞抬首张望并吞吐红信",
      "blocks": "14 节拖拽蛇链 + 盘踞抬首 + 挂点吐信",
      "habitats": [
        "苔藓古石遗迹"
      ],
      "createdAt": 1795447560733,
      "updatedAt": 1795487304283,
      "createdLabel": "11-23 10:26",
      "updatedLabel": "11-23 21:28"
    },
    {
      "code": "特7",
      "group": "项目已有扩展生物",
      "typeCode": "M03",
      "typeName": "水生脉冲泳 / 半潜人鱼",
      "typeLabel": "M03 水生脉冲泳 / 半潜人鱼",
      "status": "draft",
      "ref": "潮汐海妖",
      "nick": "潮汐海妖",
      "size": "中",
      "look": "珊瑚贝冠、清晰五官、高腰贝壳水裙、双叶大尾鳍与三束飘发",
      "habit": "浅海环礁脉冲摆尾潜浮游弋，高腰零穿模，破水白沫弧与 V 形尾迹",
      "blocks": "脉冲游泳 + 拖拽鱼尾链 + 锁枢轴尾鳍 + 飘发弹簧",
      "habitats": [
        "浅海环礁"
      ],
      "createdAt": 1795447563817,
      "updatedAt": 1795486435397,
      "createdLabel": "11-23 10:26",
      "updatedLabel": "11-23 21:13"
    },
    {
      "code": "特8",
      "group": "项目已有扩展生物",
      "typeCode": "M02",
      "typeName": "振翅飞行",
      "typeLabel": "M02 振翅飞行",
      "status": "draft",
      "ref": "赤焰飞龙",
      "nick": "",
      "size": "中~大",
      "look": "多节独立龙颈、双角龙头、宽大三段龙翼、6 节龙尾与火屑微粒",
      "habit": "火山高空强拍双翼拔高滞空，展翼压弯滑翔掠过，龙头独立环视下方",
      "blocks": "三段振翅升沉 + 龙颈环视 + 6 节拖拽龙尾",
      "habitats": [
        "熔岩火山口"
      ],
      "createdAt": 1795447576312,
      "updatedAt": 1795451398828,
      "createdLabel": "11-23 10:26",
      "updatedLabel": "11-23 11:29"
    },
    {
      "code": "特9",
      "group": "项目已有扩展生物",
      "typeCode": "M04",
      "typeName": "超长拖拽链（蛇 / 游龙）",
      "typeLabel": "M04 超长拖拽链（蛇 / 游龙）",
      "status": "done",
      "ref": "东方游龙",
      "nick": "",
      "size": "大",
      "look": "双档精雕龙头、分叉鹿角、双条飘逸龙须、20 节拉长胶囊密排龙躯（背脊锯齿鳍鬃 + 暖金横纹腹甲）、4 只锚定五趾龙爪、赤金戏珠与 5 朵立体祥云",
      "habit": "云海高空三维翻腾 8 字追逐戏珠并偶发轻顶；原地待机进入盘龙戏珠闭环，大圆环绕并周期吐云托珠旋升回落；水域自动半潜破水",
      "blocks": "20 节拖拽转角约束链 + 三维腾云纵波 + 节点锚定龙爪 + 弹簧龙须 + 戏珠祥云交互",
      "habitats": [
        "高空云海",
        "河湖深潭"
      ],
      "createdAt": 1795500334017,
      "updatedAt": 1795504675563,
      "createdLabel": "11-24 01:05",
      "updatedLabel": "11-24 02:17"
    },
    {
      "code": "M14",
      "group": "拓展骨架模板",
      "typeCode": "M14",
      "typeName": "悬浮拼装 / 磁力分离体",
      "typeLabel": "M14 悬浮拼装 / 磁力分离体",
      "status": "done",
      "ref": "浮岩构装体（special10_golem）",
      "nick": "悬浮拼装 / 磁力分离体",
      "size": "中~大",
      "look": "浮岩构装体（special10_golem）",
      "habit": "无物理关节的散件聚合：多块浮空岩甲独立轨道公转/自转、受惊聚散",
      "blocks": "拓展构装体 / 元素怪",
      "habitats": [
        "林地落果空坪"
      ],
      "suggestedId": "special10_golem",
      "isTemplateOnly": true,
      "createdAt": 0,
      "updatedAt": 0,
      "createdLabel": "",
      "updatedLabel": ""
    },
    {
      "code": "M15",
      "group": "拓展骨架模板",
      "typeCode": "M15",
      "typeName": "辐射对称多触手攀爬",
      "typeLabel": "M15 辐射对称多触手攀爬",
      "status": "done",
      "ref": "陆行八爪（special11_octo）",
      "nick": "辐射对称多触手攀爬",
      "size": "中~大",
      "look": "陆行八爪（special11_octo）",
      "habit": "6~8 条辐射触手轮流前探吸附拉拽身体前行，区别于定向前游鱼尾",
      "blocks": "拓展多触手软体怪",
      "habitats": [
        "林地落果空坪"
      ],
      "suggestedId": "special11_octo",
      "isTemplateOnly": true,
      "createdAt": 0,
      "updatedAt": 0,
      "createdLabel": "",
      "updatedLabel": ""
    },
    {
      "code": "M17",
      "group": "拓展骨架模板",
      "typeCode": "M17",
      "typeName": "双体共生 / 骑乘组合",
      "typeLabel": "M17 双体共生 / 骑乘组合",
      "status": "done",
      "ref": "骑兽猎手（special12_rider）",
      "nick": "双体共生 / 骑乘组合",
      "size": "中~大",
      "look": "骑兽猎手（special12_rider）",
      "habit": "坐骑奔跑步态 + 骑手上身颠簸弹簧 + 双主体独立朝向协同，不穿模不脱座",
      "blocks": "拓展骑乘精英 / 双子怪",
      "habitats": [
        "林地落果空坪"
      ],
      "suggestedId": "special12_rider",
      "isTemplateOnly": true,
      "createdAt": 0,
      "updatedAt": 0,
      "createdLabel": "",
      "updatedLabel": ""
    }
  ]
};

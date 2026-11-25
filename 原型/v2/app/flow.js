// 一趟的流程：标题 → 路线图 → 节点（战斗 / 营火 / 行商 / 偶遇）→ 战利品 → 路线图 → …… → 界门 → …… → 首领 → 结算。
// 规则都在 run-rules / battle-rules，这里只负责「现在该显示哪个场景」。
import {
  createTrip, enterNode, nodeOf, startBattle, battleDef, winBattle, loseBattle, finishNode, gateChoose, isFight,
} from '../modules/run-rules/index.js';
import { BattleScene } from './scenes/battle-scene.js';
import { MapScene } from './scenes/map-scene.js';
import { PanelScene } from './scenes/panel-scene.js';

export class Flow {
  constructor() {
    this.battle = new BattleScene({ mode: 'trip' });
    this.map = new MapScene();
    this.panel = new PanelScene();
    this.tutorial = null;
    this.trip = null;
    this.cur = this.panel;
    this.toTitle();
  }

  toTitle() { this.tutorial = null; this.panel.title({ onStart: () => this.startTrip(), onTutorial: () => this.startTutorial() }); this.cur = this.panel; }
  startTutorial() { this.tutorial = new BattleScene({ mode: 'tutorial' }); this.cur = this.tutorial; }
  startTrip(seed = (Math.random() * 1e6) | 0) { this.trip = createTrip(seed); this.toMap(); }

  toMap() {
    this.map.show(this.trip, { onPick: id => this.pick(id), onRestart: () => this.toTitle() });
    this.cur = this.map;
  }

  pick(id) {
    const trip = this.trip, node = enterNode(trip, id);
    if (!node) return;
    if (isFight(node)) {
      const b = startBattle(trip, node);
      this.battle.beginTrip(trip, node, battleDef(node), b, {
        onWin: bb => this.onWin(node, bb), onLose: () => this.toSummary(), onRestart: () => this.toTitle(),
      });
      this.cur = this.battle;
    } else if (node.type === 'camp') { this.panel.camp(trip, { onDone: () => this.nodeDone() }); this.cur = this.panel; }
    else if (node.type === 'shop') { this.panel.shop(trip, { onLeave: () => this.nodeDone() }); this.cur = this.panel; }
    else if (node.type === 'event') { this.panel.event(trip, node, { onDone: () => this.nodeDone() }); this.cur = this.panel; }
  }

  onWin(node, b) {
    const res = winBattle(this.trip, node, b);
    if (this.trip.ended) { this.toSummary(); return; }
    if (res.loot) { this.panel.loot(this.trip, res.loot, { onDone: () => this.nodeDone() }); this.cur = this.panel; }
    else this.nodeDone();
  }

  nodeDone() {
    finishNode(this.trip);
    if (this.trip.gatePending) { this.panel.gate(this.trip, { onChoose: c => this.onGate(c) }); this.cur = this.panel; }
    else this.toMap();
  }
  onGate(choice) {
    gateChoose(this.trip, choice);
    if (this.trip.ended) this.toSummary(); else this.toMap();
  }

  toSummary() {
    if (!this.trip.ended) loseBattle(this.trip);
    this.panel.summary(this.trip, { onAgain: () => this.startTrip() });
    this.cur = this.panel;
  }

  // 输入和主循环都只认 cur
  update(dt) { this.cur.update(dt); }
  draw(ctx) { this.cur.draw(ctx); }
  pointerMove(x, y) { this.cur.pointerMove(x, y); }
  pointerDown(x, y) { this.cur.pointerDown(x, y); }
  pointerUp(x, y) { this.cur.pointerUp(x, y); }
  key(k) { this.cur.key(k); }
  cancelDrag() { if (this.cur.drag) this.cur.drag = null; }
}

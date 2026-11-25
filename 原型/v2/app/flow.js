// 一趟的流程：标题 → 路线图 → 节点（战斗 / 营火 / 行商 / 偶遇）→ 战利品 → 路线图 → …… → 界门 → …… → 首领 → 结算。
// 规则都在 run-rules / battle-rules，这里只负责「现在该显示哪个场景」。
import {
  createTrip, enterNode, nodeOf, startBattle, battleDef, winBattle, loseBattle, finishNode, gateChoose, isFight, shopStock, summarize,
} from '../modules/run-rules/index.js';
import { ENCOUNTERS, EVENTS } from '../modules/content/index.js';
import { createBattle } from '../modules/battle-rules/index.js';
import { audio } from '../modules/audio/index.js';
import { recorder } from './record.js';
import { AudioBar } from '../modules/ui/index.js';
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
    this.audioBar = new AudioBar(audio);            // 顶栏的音乐 / 音效按钮，所有画面共用
    this.cur = this.panel;
    this.toTitle();
  }

  toTitle() { if (this.trip && !this.trip.ended) recorder.finish(summarize(this.trip)); this.tutorial = null; this.panel.title({ onStart: () => this.startTrip(), onTutorial: () => this.startTutorial() }); this.cur = this.panel; }
  startTutorial() { this.tutorial = new BattleScene({ mode: 'tutorial' }); this.cur = this.tutorial; }
  startTrip(seed = (Math.random() * 1e6) | 0) { this.trip = createTrip(seed); recorder.startTrip(this.trip); this.toMap(); }

  toMap() {
    audio.scene('explore', { biome: 'forest' });
    this.map.show(this.trip, { onPick: id => this.pick(id), onRestart: () => this.toTitle() });
    this.cur = this.map;
  }

  pick(id) {
    const trip = this.trip, node = enterNode(trip, id);
    if (!node) return;
    audio.sfx('click');
    recorder.progress(node.step);
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
    recorder.progress(this.trip.step);
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
    recorder.finish(summarize(this.trip));
    this.panel.summary(this.trip, { onAgain: () => this.startTrip() });
    this.cur = this.panel;
  }

  // 只用来测试和截图：?show=title|map|camp|shop|gate|event|summary|summary-defeat|enc:<遭遇 id>（可加 &biome=<生态 id>）
  debugShow(name, biome) {
    const trip = this.trip = createTrip(Number(new URLSearchParams(location.search).get('seed')) || 5);
    trip.gold = 120;
    const idle = { onDone() {}, onLeave() {}, onChoose() {}, onAgain: () => this.toTitle() };
    if (name === 'title') this.toTitle();
    else if (name === 'map') this.toMap();
    else if (name === 'camp') { this.panel.camp(trip, idle); this.cur = this.panel; }
    else if (name === 'shop') { trip.shop = shopStock(trip); this.panel.shop(trip, idle); this.cur = this.panel; }
    else if (name === 'gate') { this.panel.gate(trip, idle); this.cur = this.panel; }
    else if (name === 'event') { const id = Object.keys(EVENTS)[0]; this.panel.event(trip, { eventId: id, type: 'event', step: 2 }, idle); this.cur = this.panel; }
    else if (name === 'summary' || name === 'summary-defeat') { trip.step = 8; trip.ended = { kind: name === 'summary' ? 'victory' : 'defeat' }; this.panel.summary(trip, idle); this.cur = this.panel; }
    else if (name.startsWith('enc:')) {
      const enc = ENCOUNTERS[name.slice(4)];
      const def = { ...enc, title: `第 1 步 · ${enc.title}`, biome: biome || enc.biome };
      this.battle.beginTrip(trip, { type: enc.kind === 'boss' ? 'boss' : enc.kind === 'elite' ? 'elite' : 'battle', step: 1, loot: null }, def, createBattle(trip, def), {
        onWin() {}, onLose() {}, onRestart: () => this.toTitle(),
      });
      this.cur = this.battle;
    }
  }

  // 输入和主循环都只认 cur
  update(dt) { this.cur.update(dt); }
  draw(ctx) { this.cur.draw(ctx); this.audioBar.draw(ctx); }
  // 音量条在最上层：鼠标在它上面时，下面的画面当作没碰到
  pointerMove(x, y) { if (this.audioBar.pointerMove(x, y)) this.cur.pointerMove(-99, -99); else this.cur.pointerMove(x, y); }
  pointerDown(x, y, btn = 0) { if (this.audioBar.pointerDown(x, y)) return; this.cur.pointerDown(x, y, btn); }
  pointerUp(x, y, btn = 0) { if (this.audioBar.pointerUp()) return; this.cur.pointerUp(x, y, btn); }
  key(k) { this.cur.key(k); }
  wheel(dy) { if (this.cur.wheel) this.cur.wheel(dy); }
  cancelDrag() { this.audioBar.pointerUp(); if (this.cur.drag) this.cur.drag = null; if (this.cur.viewIn) this.cur.viewIn.cancel(); }
}

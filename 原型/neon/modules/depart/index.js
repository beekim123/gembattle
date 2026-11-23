// modules/depart/ 唯一对外入口：出发（挑地点、穿脱装备、拼出发包）。
export { SLOTS, SLOT_LABEL, slotOptions, equipGear, cycleGear, buildDepartPacket } from './rules/depart-rules.js';
export { createDepartView } from './view/depart-view.js';

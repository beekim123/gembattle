import { createRecorder, formatRecord, fmtDuration, MAX_THINK_SEC } from '../record.js';
import { createTrip, summarize } from '../index.js';

const clock = () => { let t = 1_000_000; const f = () => t; f.adv = sec => { t += sec * 1000; }; return f; };

export default function (t) {
  t.test('试玩记录：时长、趟数、到达步数、结局、平均思考秒数、撤回次数、印记与雕琢都在里面', () => {
    const now = clock(), rec = createRecorder(now);
    const trip = createTrip(11);
    rec.startTrip(trip);
    rec.beginTurn(); now.adv(10); rec.endTurn();
    rec.beginTurn(); now.adv(20); rec.endTurn();
    rec.undo(); rec.undo(); rec.undo();
    trip.step = 5; trip.ended = { kind: 'retreat' };
    trip.player.seals.push('doubleWhite');
    trip.stats.carves.push({ color: 0, kind: 'sharp' });
    rec.finish(summarize(trip));
    now.adv(95);
    const txt = rec.text();
    t.assert.match(txt, /试玩时长：2 分 5 秒/);
    t.assert.match(txt, /开了几趟：1 趟/);
    t.assert.match(txt, /结果：见好就收，折返结算/);
    t.assert.match(txt, /走到：第 5 步（共 8 步）/);
    t.assert.match(txt, /回合数：2，平均思考 15\.0 秒 \/ 回合/);
    t.assert.match(txt, /撤回次数：3/);
    t.assert.match(txt, /秘宝印记：/);
    t.assert.match(txt, /宝石雕琢：红牌/);
  });

  t.test('试玩记录：多趟、阵亡、通关、中途重开都分得清；没打完的最后一趟用实时进度', () => {
    const now = clock(), rec = createRecorder(now);
    const a = createTrip(1), b = createTrip(2), c = createTrip(3);
    rec.startTrip(a); a.step = 3; a.ended = { kind: 'defeat' }; rec.finish(summarize(a));
    rec.startTrip(b); rec.progress(4);                               // 打到第 4 步重开
    rec.startTrip(c); c.step = 6;
    const txt = rec.text(summarize(c));
    t.assert.match(txt, /开了几趟：3 趟/);
    t.assert.match(txt, /阵亡，战利品尽失/);
    t.assert.match(txt, /中途退出（没打完）/);
    t.assert.match(txt, /走到：第 4 步/);
    t.assert.match(txt, /还在进行中/);
    t.assert.match(txt, /走到：第 6 步/);
    c.step = 8; c.ended = { kind: 'victory' }; rec.finish(summarize(c));
    t.assert.match(rec.text(), /击败千丈古树精，通关/);
  });

  t.test('试玩记录：思考时间单回合封顶；没有开趟（教学仗）时不记', () => {
    const now = clock(), rec = createRecorder(now);
    rec.beginTurn(); now.adv(50); rec.endTurn(); rec.undo();
    t.assert.equal(rec.r.trips.length, 0);
    rec.startTrip(createTrip(5));
    rec.beginTurn(); now.adv(9999); rec.endTurn();
    t.assert.equal(rec.r.trips[0].turns[0], MAX_THINK_SEC);
    rec.endTurn();                                                   // 重复结束不会多记
    t.assert.equal(rec.r.trips[0].turns.length, 1);
  });

  t.test('试玩记录：时间格式、文字里没有禁用字', () => {
    t.assert.equal(fmtDuration(0), '0 秒'); t.assert.equal(fmtDuration(59.6), '1 分 0 秒'); t.assert.equal(fmtDuration(3725), '62 分 5 秒');
    const now = clock(), rec = createRecorder(now), trip = createTrip(2);
    rec.startTrip(trip); trip.ended = { kind: 'victory' }; rec.finish(summarize(trip));
    t.assert.doesNotMatch(rec.text(), /[\u706f\u70ec\u5f71\u591c\u9b42\u566c\u5e7d\u6e0a\u661f\u5149\u4e4b]/);
  });
}

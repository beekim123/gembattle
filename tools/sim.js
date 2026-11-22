// 粗算链伤害：起手牌组、倍率每次施法从 ×1 起、手牌留着（上限 10）、抽 2,3,4,5,6。
// 比较「每回合都打」和「攒到 N 张再打」。用法：node tools/sim.js
// 这是设计阶段的粗算，规则改了要跟着改；正式调数值时换成读 src/rules.js 的版本。
const MASK = [1,3,2,6,4,5,7];   // 红黄绿青蓝紫白：1 红 2 绿 4 蓝
const pc = m => (m&1)+((m>>1)&1)+((m>>2)&1);
function rng(s){return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296}}
// 从手牌里找能接成的最长链（小手牌暴力 DFS，限制深度）
function bestChain(hand){
  const cards = hand.map((c,i)=>({c,i})).filter(x=>x.c!=='g');
  let best={dmg:0,seq:[]};
  const used=new Array(cards.length).fill(false);
  let nodes=0;
  function dfs(last, mult, lamps, rainbow, dmg, seq){
    if(++nodes>40000) return;
    if(dmg>best.dmg) best={dmg,seq:seq.slice(),mult};
    for(let k=0;k<cards.length;k++){ if(used[k]) continue; const c=cards[k].c, m=MASK[c];
      let nm=mult, extra=0;
      if(last>=0){ const lm=MASK[last]; if(m&lm) nm=mult*(rainbow?3:2); else if((m|lm)===7){nm=mult*(rainbow?3:2); extra=3;} else continue; }
      let nl=lamps; if(c<6) nl|=1<<c; const nr=rainbow||nl===63;
      used[k]=true; seq.push(cards[k].i);
      dfs(c,nm,nl,nr,dmg+(pc(m)+extra)*100*nm,seq);
      seq.pop(); used[k]=false; }
  }
  dfs(-1,1,0,false,0,[]);
  return best;
}
function fight(seed, holdTo, cd=3, turns=6){
  const r=rng(seed); const deck=[0,0,2,2,4,4,1,3,5,6,'g','g'];
  let draw=deck.slice().sort(()=>r()-.5), disc=[], hand=[], count=cd; const out=[];
  for(let t=1;t<=turns;t++){
    const n=Math.min(6,1+t);
    for(let i=0;i<n;i++){ if(hand.length>=10) break; if(!draw.length) draw=disc.splice(0).sort(()=>r()-.5); if(draw.length) hand.push(draw.pop()); }
    let dmg=0, mult=1, len=0;
    if(hand.length>=holdTo || count===1 || t===turns){
      const b=bestChain(hand); dmg=b.dmg; mult=b.mult||1; len=b.seq.length;
      const set=new Set(b.seq); disc.push(...hand.filter((c,i)=>set.has(i))); hand=hand.filter((c,i)=>!set.has(i));
    }
    out.push({t,dmg,mult,len});
    count--; if(count<=0) count=cd;
  }
  return out;
}
const N=400;
for (const hold of [2,5,8,10]) {
  const per={}; const cum={};
  for(let s=1;s<=N;s++){ let c=0; for(const o of fight(s*7919,hold)){ (per[o.t]=per[o.t]||[]).push(o); c+=o.dmg; (cum[o.t]=cum[o.t]||[]).push(c);} }
  const med=a=>{a=a.slice().sort((x,y)=>x-y);return a[a.length>>1]};
  console.log(`\n攒到 ${hold} 张再打：`);
  for(const t in per) console.log(`  回合${t}: 这回合伤害中位 ${med(per[t].map(o=>o.dmg))}  链长中位 ${med(per[t].map(o=>o.len))}  最高倍率中位 ×${med(per[t].map(o=>o.mult))}  累计中位 ${med(cum[t])}`);
}

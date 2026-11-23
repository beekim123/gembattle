// 跨场景留着的东西：场景每次切换都会重新建，这一趟（run）和存档放在这里。
// 只在 app/ 里用。
export const session = {
  run: null, // 正在走的一趟（run-rules 的 createRun）
  depart: null, // 出发包
  summary: null, // 这一趟结束以后的结果
  save: null, // 存档（阶段 3）
  onSettled: null, // 结算以后怎么写存档（阶段 3）
};

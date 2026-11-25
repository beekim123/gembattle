// 试玩记录：整个页面共用一个记录器，战斗画面记回合、思考时间和撤回，流程记趟数，结算页一键复制。
import { createRecorder } from '../modules/run-rules/index.js';
export const recorder = createRecorder();

// 复制到剪贴板：先用现代接口，不行就退回老办法，再不行让玩家手动复制
export async function copyText(str) {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(str); return true; } } catch { /* 往下退 */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = str; ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove();
    if (ok) return true;
  } catch { /* 往下退 */ }
  try { window.prompt('自动复制没成功，请手动全选复制下面的文字：', str); } catch { /* 没有 prompt 就算了 */ }
  return false;
}

#!/bin/bash
# 双击此脚本：先跑 node verify.mjs 硬校验，再自动开本地服务并用浏览器打开 preview.html 验收！
cd "$(dirname "$0")" || exit 1

echo "=== 第一步：运行格式与零 NaN 自动校验 ==="
if command -v node >/dev/null 2>&1; then
  node verify.mjs
else
  echo "⚠️ 未检测到 Node.js，跳过 verify.mjs，直接打开浏览器预览"
fi

PORT=8130
echo ""
echo "=== 第二步：启动本地预览服务 http://localhost:${PORT}/preview.html ==="
echo "关掉这个终端窗口即可停止服务。"
(sleep 1 && open "http://localhost:${PORT}/preview.html") &
python3 -m http.server "${PORT}" --bind 127.0.0.1

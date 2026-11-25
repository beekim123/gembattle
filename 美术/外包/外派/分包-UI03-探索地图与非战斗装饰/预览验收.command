#!/bin/bash
cd "$(dirname "$0")" || exit 1

echo "=== 第一步：运行 UI-03 自动化硬校验 ==="
if command -v node >/dev/null 2>&1; then
  node verify.mjs
else
  echo "⚠️ 未检测到 Node.js，跳过 verify.mjs"
fi

PORT=8133
echo ""
echo "=== 第二步：启动本地预览服务 http://localhost:${PORT}/preview.html ==="
echo "关掉这个终端窗口即可停止服务。"
(sleep 1 && open "http://localhost:${PORT}/preview.html") &
python3 -m http.server "${PORT}" --bind 127.0.0.1

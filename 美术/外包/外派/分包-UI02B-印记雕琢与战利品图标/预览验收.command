#!/bin/bash
cd "$(dirname "$0")" || exit 1
echo "=== 1. 运行自动化硬红线校验 (node verify.mjs) ==="
node verify.mjs
STATUS=$?
if [ $STATUS -ne 0 ]; then
  echo ""
  echo "❌ 校验未通过，请先打回外包修复后再目检。"
  read -r -p "按回车键退出..."
  exit $STATUS
fi

PORT=8136
echo ""
echo "=== 2. 启动本地验收台：http://localhost:${PORT}/preview.html ==="
(sleep 1 && open "http://localhost:${PORT}/preview.html") &
python3 -m http.server ${PORT}

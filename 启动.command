#!/bin/bash
# 双击启动：第一次会先装 Electron，以后直接开窗口。
cd "$(dirname "$0")"
if [ ! -d node_modules/electron ]; then
  echo "第一次启动，先安装 Electron……"
  npm install --no-audit --no-fund || { echo "安装失败"; read -n 1; exit 1; }
fi
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron .

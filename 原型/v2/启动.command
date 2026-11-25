#!/bin/zsh
# 双击这个文件：开本地小服务，自动用浏览器打开 v2 原型。关掉这个窗口就停了。
cd "${0:A:h}"

# 双击打开时不会读 ~/.zshrc，用 nvm 或 Homebrew 装的 node 要自己找一下
if ! command -v node >/dev/null 2>&1; then
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
fi
if ! command -v node >/dev/null 2>&1; then
  for d in /opt/homebrew/bin /usr/local/bin; do
    [ -x "$d/node" ] && export PATH="$d:$PATH" && break
  done
fi
if ! command -v node >/dev/null 2>&1; then
  echo "没找到 node。请先安装 Node.js（https://nodejs.org），再双击这个文件。"
  read -k 1 "?按任意键关掉……"
  exit 1
fi

node tools/serve.js --open

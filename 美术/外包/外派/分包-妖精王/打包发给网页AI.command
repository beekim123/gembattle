#!/bin/bash
# 双击此脚本：自动把当前外包目录的所有文档与代码合并成一个 all_in_one.txt，直接拖进网页端 AI 对话框即可。
cd "$(dirname "$0")" || exit 1

python3 - <<'PY'
import os

exts = ('.md', '.js', '.mjs', '.html')
skip_names = {'all_in_one.txt', '.DS_Store'}
entries = []

for root, dirs, files in os.walk('.'):
    dirs[:] = sorted(d for d in dirs if not d.startswith('.') and d not in ('__MACOSX', '交回'))
    for f in sorted(files):
        if f.startswith('._') or f in skip_names or not f.endswith(exts):
            continue
        rel = os.path.normpath(os.path.join(root, f))
        if rel.startswith('bundle' + os.sep) and f != 'README.md':
            continue
        entries.append(rel)

priority = ['README.md', '开工提示词.md', '设计文档-妖精王.md', 'bundle/README.md']
def sort_key(p):
    norm = p.replace('\\', '/')
    return (0, priority.index(norm)) if norm in priority else (1, norm)

entries.sort(key=sort_key)

with open('all_in_one.txt', 'w', encoding='utf-8') as out:
    out.write('# 外包项目合集（由 打包发给网页AI.command 自动生成）\n')
    out.write('# 包含文件清单：\n')
    for rel in entries:
        out.write(f'#   - {rel}\n')
    out.write('\n')
    for rel in entries:
        out.write(f'\n===== FILE: ./{rel} =====\n')
        with open(rel, 'r', encoding='utf-8', errors='replace') as fh:
            out.write(fh.read())
        out.write('\n')

size_kb = os.path.getsize('all_in_one.txt') / 1024
print(f'✅ 已生成 all_in_one.txt（共合并 {len(entries)} 个文件，{size_kb:.1f} KB）')
print('直接把 all_in_one.txt 拖进网页端 AI 对话框即可开工！')
PY

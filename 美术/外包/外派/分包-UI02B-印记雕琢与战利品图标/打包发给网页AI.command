#!/bin/bash
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

head_priority = ['README.md', '设计文档-印记雕琢与战利品图标.md', 'bundle/README.md']
def sort_key(p):
    norm = p.replace('\\', '/')
    if norm == '开工提示词.md':
        return (2, 0)
    if norm in head_priority:
        return (0, head_priority.index(norm))
    return (1, norm)

entries.sort(key=sort_key)

with open('all_in_one.txt', 'w', encoding='utf-8') as out:
    out.write('# 外包项目合集（UI-02B 印记、雕琢与战利品图标 · 轻量包）\n')
    out.write('# 目标交付压缩包：bundle_ui02b_icons.zip\n')
    out.write('# 包含文件清单（开工提示词.md 压轴在最末尾）：\n')
    for rel in entries:
        out.write(f'#   - {rel}\n')
    out.write('\n')
    for rel in entries:
        out.write(f'\n===== FILE: ./{rel} =====\n')
        with open(rel, 'r', encoding='utf-8', errors='replace') as fh:
            out.write(fh.read())
        out.write('\n')

size_kb = os.path.getsize('all_in_one.txt') / 1024
print(f'✅ 已生成 all_in_one.txt（共合并 {len(entries)} 个文件，{size_kb:.1f} KB；开工提示词.md 已置底）')
print('发包口令：严格按附件末尾的 开工提示词.md 开发。务必用单个脚本一次性生成 3 个文件、自检并打包出可下载的 bundle_ui02b_icons.zip；正文严禁贴任何代码、JSON 或文档内容，若未打包完成直接停下汇报进度。')
PY

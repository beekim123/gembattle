# 把 art/<版本>/ 里的 png 和清单打成一个 js（图片转成 data URL），游戏在 file:// 下也能读像素
# 用法：python3 art/打包美术.py neo-1
import base64, json, os, sys
d = os.path.join(os.path.dirname(os.path.abspath(__file__)), sys.argv[1] if len(sys.argv) > 1 else 'neo-1')
man = json.load(open(os.path.join(d, '模型清单.json'), encoding='utf-8'))
pal = json.load(open(os.path.join(d, man.get('颜色表', '颜色表.json')), encoding='utf-8'))
paths = [p for m in man['模型'] for p in m['帧']] + [p for k in ('底', '块', '点缀') for p in man.get('地面', {}).get(k, [])]
imgs = {p: 'data:image/png;base64,' + base64.b64encode(open(os.path.join(d, p), 'rb').read()).decode() for p in paths}
out = os.path.join(d, 'art-data.js')
open(out, 'w', encoding='utf-8').write('window.ART_DATA = ' + json.dumps({'manifest': man, 'palette': pal, 'images': imgs}, ensure_ascii=False) + ';\n')
print('写好', out, len(imgs), '张图', os.path.getsize(out) // 1024, 'KB')

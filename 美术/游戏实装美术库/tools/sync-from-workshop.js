#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LIB_DIR = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(LIB_DIR, 'manifest.json');
const CHECK_ONLY = process.argv.includes('--check');

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function main() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('[ERROR] 未找到 manifest.json:', MANIFEST_PATH);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const srcRoot = path.resolve(LIB_DIR, manifest.sourceWorkshop || '../像素堆叠生物工坊');

  const items = [];
  for (const [group, list] of Object.entries(manifest.groups || {})) {
    for (const item of list) {
      items.push({ group, ...item });
    }
  }

  let copied = 0;
  let unchanged = 0;
  let mismatches = 0;
  let missing = 0;

  for (const item of items) {
    const srcPath = path.join(srcRoot, item.path);
    const dstPath = path.join(LIB_DIR, item.path);

    if (!fs.existsSync(srcPath)) {
      console.error(`[MISSING] 源文件不存在: ${item.path}`);
      missing++;
      continue;
    }

    const srcBuf = fs.readFileSync(srcPath);
    const srcHash = sha256(srcBuf);
    const dstExists = fs.existsSync(dstPath);
    const dstHash = dstExists ? sha256(fs.readFileSync(dstPath)) : '';

    if (dstExists && srcHash === dstHash) {
      unchanged++;
      continue;
    }

    if (CHECK_ONLY) {
      console.error(`[DIFF] ${item.path} (${dstExists ? '内容不一致' : '目标缺失'})`);
      mismatches++;
      continue;
    }

    fs.mkdirSync(path.dirname(dstPath), { recursive: true });
    fs.writeFileSync(dstPath, srcBuf);
    // 写后立即回读校验 SHA-256
    const verifyHash = sha256(fs.readFileSync(dstPath));
    if (verifyHash !== srcHash) {
      console.error(`[VERIFY FAIL] ${item.path}`);
      mismatches++;
    } else {
      copied++;
    }
  }

  const modeLabel = CHECK_ONLY ? '校验模式' : '单向同步';
  console.log(`[${modeLabel}] 清单总计 ${items.length} 个资产 | 已更新 ${copied} | 已一致 ${unchanged} | 差异 ${mismatches} | 缺失 ${missing}`);

  if (missing > 0 || mismatches > 0) {
    process.exit(1);
  }
  if (manifest.totalCount && items.length !== manifest.totalCount) {
    console.error(`[ERROR] manifest.totalCount=${manifest.totalCount} 与实际条目数 ${items.length} 不符`);
    process.exit(1);
  }
  console.log(`校验通过：全部 ${items.length} 个实装资产与总工坊 100% 一致。`);
}

main();

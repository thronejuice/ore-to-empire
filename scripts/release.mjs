#!/usr/bin/env node
/**
 * Builds release folders: releases/v<version>/
 *   index.html                  the game as one self-contained file (double-click to play)
 *   CHANGES.md                  what changed, copied from CHANGELOG.md
 *   update-from-v<prev>.patch   source changes since the previous version (git apply)
 *
 * Usage
 *   npm run release -- 0.7.1      build one version (tag v0.7.1 must exist)
 *   npm run release -- --all      rebuild every tagged version
 *
 * Each release's index.html saves under its own key (ore-to-empire/save/v<version>),
 * so opening an old version never overwrites the save of a newer one.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
const semver = (v) => v.replace(/^v/, '').split('.').map(Number);
const cmp = (a, b) => {
  const x = semver(a);
  const y = semver(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};

const tags = git('tag', '--list', 'v*').split('\n').filter(Boolean).sort(cmp);
const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');

function section(version) {
  const re = new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\][^\\n]*\\n([\\s\\S]*?)(?=^## \\[|$(?![\\s\\S]))`, 'm');
  const m = changelog.match(re);
  const title = changelog.match(new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\][^\\n]*`, 'm'));
  return m ? { title: title[0].replace(/^## /, ''), body: m[1].trim() } : null;
}

function build(tag) {
  const version = tag.slice(1);
  const prev = tags[tags.indexOf(tag) - 1];
  const out = join(root, 'releases', tag);
  mkdirSync(out, { recursive: true });

  // 1. playable single-file build from that exact commit
  const tmp = mkdtempSync(join(tmpdir(), `ote-${version}-`));
  const wt = join(tmp, 'src');
  git('worktree', 'add', '--detach', wt, tag);
  try {
    symlinkSync(join(root, 'node_modules'), join(wt, 'node_modules'), 'dir');
    execFileSync('npx', ['vite', 'build', '--mode', 'single', '--outDir', join(tmp, 'dist'), '--logLevel', 'error'], { cwd: wt, stdio: 'inherit' });
    let html = readFileSync(join(tmp, 'dist', 'index.html'), 'utf8');
    html = html.replace(/ore-to-empire\/save(?!\/)/g, `ore-to-empire/save/${tag}`);
    writeFileSync(join(out, 'index.html'), html);
  } finally {
    git('worktree', 'remove', '--force', wt);
    rmSync(tmp, { recursive: true, force: true });
  }

  // 2. patch from the previous version (source only)
  let patchName = null;
  let stat = '';
  if (prev) {
    patchName = `update-from-${prev}.patch`;
    const exclude = [':(exclude)releases'];
    writeFileSync(join(out, patchName), git('diff', '--binary', prev, tag, '--', '.', ...exclude) + '\n');
    stat = git('diff', '--stat=100', prev, tag, '--', '.', ...exclude);
  }

  // 3. CHANGES.md
  const s = section(version);
  const lines = [
    `# Ore to Empire ${tag}`,
    '',
    s ? `**${s.title}**` : '',
    '',
    s ? s.body : '_(ไม่มีรายละเอียดใน CHANGELOG.md)_',
    '',
    '---',
    '',
    '## ไฟล์ในโฟลเดอร์นี้',
    '',
    '- `index.html` — เปิดด้วยเบราว์เซอร์เพื่อเล่นเวอร์ชันนี้ได้ทันที (เซฟแยกจากเวอร์ชันอื่น)',
  ];
  if (patchName) {
    lines.push(
      `- \`${patchName}\` — โค้ดที่เปลี่ยนจาก ${prev}`,
      '',
      `## อัปเดตโค้ดจาก ${prev} เป็น ${tag}`,
      '',
      'ถ้าโฟลเดอร์โปรเจกต์มีประวัติ git (มาจาก zip ชุดนี้):',
      '',
      '```bash',
      `git checkout ${tag}`,
      'npm install',
      '```',
      '',
      `ถ้าโฟลเดอร์เป็นโค้ด ${prev} แบบไม่มี git:`,
      '',
      '```bash',
      `git apply releases/${tag}/${patchName}`,
      'npm install',
      '```',
      '',
      '## ไฟล์ที่เปลี่ยน',
      '',
      '```',
      stat,
      '```',
    );
  }
  writeFileSync(join(out, 'CHANGES.md'), lines.join('\n') + '\n');
  console.log(`built releases/${tag}${prev ? ` (patch from ${prev})` : ''}`);
}

function index() {
  const dir = join(root, 'releases');
  const built = readdirSync(dir).filter((d) => /^v\d/.test(d) && existsSync(join(dir, d, 'index.html'))).sort(cmp).reverse();
  const rows = built.map((tag) => {
    const s = section(tag.slice(1));
    const summary = s ? (s.body.split('\n').find((l) => l.startsWith('- ')) ?? '').replace(/^- /, '').replace(/\*\*/g, '') : '';
    const date = s ? (s.title.match(/\d{4}-\d{2}-\d{2}/) ?? [''])[0] : '';
    return `| [${tag}](${tag}/CHANGES.md) | ${date} | ${summary} | [เล่น](${tag}/index.html) |`;
  });
  const md = [
    '# Releases',
    '',
    'แต่ละโฟลเดอร์คือหนึ่งเวอร์ชัน: `index.html` (เล่นได้ทันที), `CHANGES.md` (สรุปการเปลี่ยนแปลง) และไฟล์ patch จากเวอร์ชันก่อนหน้า',
    'รายละเอียดทั้งหมดอยู่ใน [CHANGELOG.md](../CHANGELOG.md)',
    '',
    '| เวอร์ชัน | วันที่ | สรุป | |',
    '|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
  writeFileSync(join(dir, 'README.md'), md);
}

const arg = process.argv[2];
if (!arg) {
  console.error('usage: npm run release -- <version> | --all');
  process.exit(1);
}
const targets = arg === '--all' ? tags : [arg.startsWith('v') ? arg : `v${arg}`];
for (const t of targets) {
  if (!tags.includes(t)) {
    console.error(`tag ${t} not found — create it first: git tag -a ${t} -m "..."`);
    process.exit(1);
  }
  build(t);
}
index();

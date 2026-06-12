#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function sanitizeName(name) {
  if (typeof name !== 'string') return '';
  // Remove replacement char and control chars, replace forbidden with '_'
  return name
    .replace(/\uFFFD/g, '')
    .replace(/\0/g, '')
    .replace(/[\\/<>:\"|?*]/g, '_')
    .replace(/[\x00-\x1F\x7F-\xFF]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function uniqueDest(dest) {
  if (!fs.existsSync(dest)) return dest;
  const dir = path.dirname(dest);
  const base = path.basename(dest, path.extname(dest));
  const ext = path.extname(dest);
  let i = 1;
  while (true) {
    const candidate = path.join(dir, `${base}_${i}${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
    i += 1;
  }
}

function walkAndSanitize(root) {
  const items = fs.readdirSync(root, { withFileTypes: true });
  for (const it of items) {
    const oldPath = path.join(root, it.name);
    if (it.isDirectory()) {
      walkAndSanitize(oldPath);
      const newName = sanitizeName(it.name);
      if (newName && newName !== it.name) {
        const dest = path.join(root, newName);
        const final = uniqueDest(dest);
        fs.renameSync(oldPath, final);
        console.log(`Renomeado: ${oldPath} -> ${final}`);
      }
    } else {
      const newName = sanitizeName(it.name);
      if (newName && newName !== it.name) {
        const dest = path.join(root, newName);
        const final = uniqueDest(dest);
        fs.renameSync(oldPath, final);
        console.log(`Renomeado: ${oldPath} -> ${final}`);
      }
    }
  }
}

function sanitizeDirectory(dir) {
  const target = dir || process.cwd();
  if (!fs.existsSync(target)) {
    throw new Error(`Diretorio nao encontrado: ${target}`);
  }
  walkAndSanitize(path.resolve(target));
}

if (require.main === module) {
  const dir = process.argv[2] || process.cwd();
  try {
    sanitizeDirectory(dir);
    console.log('Sanitizacao concluida.');
  } catch (e) {
    console.error('Erro:', e && e.message);
    process.exit(1);
  }
}

module.exports = { sanitizeDirectory };

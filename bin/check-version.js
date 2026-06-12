#!/usr/bin/env node
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const versionFile = path.join(projectRoot, 'version');
const repoOwner = 'GS-IsoXex';
const repoName = 'GS-IsoXex';
const repoUrl = `https://github.com/${repoOwner}/${repoName}`;
const rawVersionUrl = `https://raw.githubusercontent.com/${repoOwner}/${repoName}/refs/heads/main/version`;

function readLocalVersion() {
  try {
    return fs.readFileSync(versionFile, 'utf8').trim();
  } catch {
    return '0.0.0';
  }
}

function fetchUrl(url, maxRedirects) {
  maxRedirects = maxRedirects || 3;
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'GS-IsoXex' },
      timeout: 15000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (maxRedirects <= 0) {
          reject(new Error('Too many redirects'));
          return;
        }
        fetchUrl(res.headers.location, maxRedirects - 1).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data.trim()));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

function compareSemver(a, b) {
  const left = a.replace(/^v/i, '').split('.').map((v) => Number(v) || 0);
  const right = b.replace(/^v/i, '').split('.').map((v) => Number(v) || 0);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const an = left[i] || 0;
    const bn = right[i] || 0;
    if (an < bn) return -1;
    if (an > bn) return 1;
  }
  return 0;
}

function createProgressBar(pct, width) {
  width = width || 30;
  const filled = Math.round((width * pct) / 100);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function hasGit() {
  try {
    const r = spawnSync('git', ['--version'], { stdio: 'ignore' });
    return r.status === 0;
  } catch { return false; }
}

function gitPull() {
  try {
    const r = spawnSync('git', ['pull', '--ff-only'], { cwd: projectRoot, stdio: 'inherit' });
    return r.status === 0;
  } catch { return false; }
}

function extractZip(zipPath, extractDir) {
  const cmd = `Expand-Archive -LiteralPath "${zipPath}" -DestinationPath "${extractDir}" -Force`;
  const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', cmd], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || 'Expand-Archive failed').trim());
}

function copyDirectory(src, dest) {
  const stat = fs.lstatSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      if (entry === '.git') continue;
      copyDirectory(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

async function doCheck() {
  const local = readLocalVersion();
  let remote = '';
  // Try raw version URL first, fall back to GitHub API
  try {
    remote = await fetchUrl(rawVersionUrl);
  } catch {
    try {
      const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`;
      const release = await new Promise((resolve, reject) => {
        https.get(apiUrl, { headers: { 'User-Agent': 'GS-IsoXex', Accept: 'application/vnd.github.v3+json' }, timeout: 10000 }, (res) => {
          let data = '';
          if (res.statusCode !== 200) { reject(new Error(`API ${res.statusCode}`)); return; }
          res.on('data', (c) => { data += c; });
          res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject).on('timeout', function () { this.destroy(); reject(new Error('API timed out')); });
      });
      remote = (release.tag_name || release.name || '').replace(/^v/i, '');
    } catch {
      console.log(`CHECK|${local}||error`);
      return;
    }
  }
  const available = compareSemver(local, remote) < 0 ? '1' : '0';
  console.log(`CHECK|${local}|${remote}|${available}|${repoUrl}`);
}

async function doUpdate() {
  const local = readLocalVersion();

  const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`;
  let release;
  try {
    release = await new Promise((resolve, reject) => {
      https.get(apiUrl, { headers: { 'User-Agent': 'GS-IsoXex', Accept: 'application/vnd.github.v3+json' } }, (res) => {
        let data = '';
        if (res.statusCode !== 200) { reject(new Error(`GitHub API ${res.statusCode}`)); return; }
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });
  } catch {
    // fallback: use main branch zip
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-isoxex-update-'));
    const zipPath = path.join(tempDir, 'gs-isoxex.zip');
    const extractDir = path.join(tempDir, 'extracted');
    const zipUrl = `${repoUrl}/archive/refs/heads/main.zip`;

    console.log(`Baixando atualização de ${repoUrl}...`);
    await downloadWithProgress(zipUrl, zipPath);
    console.log(`Extraindo...`);
    fs.mkdirSync(extractDir, { recursive: true });
    extractZip(zipPath, extractDir);

    const entries = fs.readdirSync(extractDir).filter(n => n !== '.DS_Store');
    if (entries.length !== 1) throw new Error('Estrutura inesperada do pacote.');
    copyDirectory(path.join(extractDir, entries[0]), projectRoot);

    const ver = readLocalVersion();
    console.log(`Atualizado: ${local} -> ${ver}`);
    return;
  }

  const remoteVersion = (release.tag_name || release.name || '').replace(/^v/i, '');
  if (compareSemver(local, remoteVersion) >= 0) {
    console.log(`Já está na versão mais recente (${local}).`);
    return;
  }

  const zipballUrl = release.zipball_url || `${repoUrl}/archive/refs/tags/${release.tag_name}.zip`;

  // Try git pull first if available
  if (fs.existsSync(path.join(projectRoot, '.git')) && hasGit()) {
    console.log(`Atualizando com git pull...`);
    if (gitPull()) {
      const ver = readLocalVersion();
      console.log(`Atualizado: ${local} -> ${ver}`);
      return;
    }
    console.log(`git pull falhou, baixando pacote...`);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-isoxex-update-'));
  const zipPath = path.join(tempDir, 'gs-isoxex.zip');
  const extractDir = path.join(tempDir, 'extracted');

  console.log(`Baixando ${remoteVersion}...`);
  await downloadWithProgress(zipballUrl, zipPath);

  console.log(`Extraindo...`);
  fs.mkdirSync(extractDir, { recursive: true });
  extractZip(zipPath, extractDir);

  const entries = fs.readdirSync(extractDir).filter(n => n !== '.DS_Store');
  if (entries.length !== 1) throw new Error('Estrutura inesperada do pacote.');
  copyDirectory(path.join(extractDir, entries[0]), projectRoot);

  const ver = readLocalVersion();
  console.log(`Atualizado: ${local} -> ${ver}`);
}

function downloadWithProgress(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'GS-IsoXex', Accept: 'application/octet-stream' },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadWithProgress(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let downloaded = 0;
      let lastPct = -1;
      const file = fs.createWriteStream(dest);

      res.on('data', (chunk) => {
        downloaded += chunk.length;
        if (total > 0) {
          const pct = Math.round((downloaded / total) * 100);
          if (pct !== lastPct) {
            lastPct = pct;
            const bar = createProgressBar(pct);
            process.stdout.write(`\r\x1b[K${bar} ${pct}%`);
          }
        }
      });

      res.pipe(file);
      file.on('finish', () => {
        process.stdout.write('\n');
        file.close(resolve);
      });
      file.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] === 'update' ? 'update' : 'check';

  try {
    if (mode === 'update') {
      await doUpdate();
    } else {
      await doCheck();
    }
    process.exit(0);
  } catch (error) {
    console.error(`ERROR|${error.message.replace(/\r?\n/g, ' ')}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

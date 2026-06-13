#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const os = require('os');
const readline = require('readline');
const { spawnSync, spawn } = require('child_process');
const extractXiso = require('../index');
let unrar = null;
try {
  unrar = require('unrar.js');
} catch (e) {
}
let decompress = null;
try {
  decompress = require('decompress');
} catch (e) {
}
let AdmZip = null;
try {
  AdmZip = require('adm-zip');
} catch (e) {
}
let path7za = null;
try {
  path7za = require('7zip-bin').path7za;
} catch (e) {
}

const LOG_PATH = path.resolve(__dirname, '../extract.log');
function timestamp() {
  const d = new Date();
  return d.toISOString().replace('T', ' ').replace(/\.\d+Z/, '');
}
try {
  const logStream = fs.createWriteStream(LOG_PATH, { flags: 'a', encoding: 'utf8' });
  const origLog = console.log.bind(console);
  const origError = console.error.bind(console);
  console.log = (...args) => {
    const line = `[${timestamp()}] ${args.join(' ')}`;
    try { logStream.write(line + '\n'); } catch (e) {}
    origLog(...args);
  };
  console.error = (...args) => {
    const line = `[${timestamp()}] ${args.join(' ')}`;
    try { logStream.write(line + '\n'); } catch (e) {}
    origError(...args);
  };
  process.on('exit', () => { try { logStream.end(); } catch (e) {} });
} catch (e) {
}

const CONFIG_PATH = path.resolve(__dirname, '../config.json');
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

function createProgressBar(current, total, width = 30) {
  const filledWidth = total === 0 ? width : Math.round((width * current) / total);
  const emptyWidth = width - filledWidth;
  const bar = '█'.repeat(filledWidth) + '░'.repeat(emptyWidth);
  return `[${bar}]`;
}

function formatETA(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

function truncateText(text, maxLen) {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen - 3) + '...';
}

function clearLine() {
  readline.cursorTo(process.stdout, 0);
  readline.clearLine(process.stdout, 0);
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return {
      isoDir: path.resolve(__dirname, '../iso'),
      outputDir: path.resolve(__dirname, '../iso'),
      deleteSystemUpdate: false,
      deleteIsoAfterExtract: false,
    };
  }

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  return {
    isoDir: config.isoDir ? path.resolve(__dirname, '..', config.isoDir) : path.resolve(__dirname, '../iso'),
    outputDir: config.outputDir ? path.resolve(__dirname, '..', config.outputDir) : null,
    deleteSystemUpdate: !!config.deleteSystemUpdate,
    deleteIsoAfterExtract: !!config.deleteIsoAfterExtract,
    sevenZipPath: config.sevenZipPath ? path.resolve(__dirname, '..', config.sevenZipPath) : null,
    unrarPath: config.unrarPath ? path.resolve(__dirname, '..', config.unrarPath) : null,
  };
}

function findAllXisos(dir) {
  if (!fs.existsSync(dir)) {
    console.log(`${COLORS.yellow}Pasta "${dir}" não encontrada. Criando...${COLORS.reset}`);
    fs.mkdirSync(dir, { recursive: true });
    return [];
  }
  const files = fs.readdirSync(dir);
  return files
    .filter((f) => {
      const lower = f.toLowerCase();
      return lower.endsWith('.xiso') || lower.endsWith('.iso');
    })
    .map((f) => path.join(dir, f));
}

function find7zExecutable(preferredPath) {
  if (preferredPath && fs.existsSync(preferredPath)) {
    console.log(`Using configured 7-Zip: ${preferredPath}`);
    return preferredPath;
  }
  const candidates = [];
  if (process.env.PATH) {
    const pathEntries = process.env.PATH.split(path.delimiter);
    for (const entry of pathEntries) {
      if (!entry) continue;
      const candidate = path.join(entry, '7z.exe');
      candidates.push(candidate);
    }
  }
  if (process.env['ProgramFiles']) {
    candidates.push(path.join(process.env['ProgramFiles'], '7-Zip', '7z.exe'));
  }
  if (process.env['ProgramFiles(x86)']) {
    candidates.push(path.join(process.env['ProgramFiles(x86)'], '7-Zip', '7z.exe'));
  }
  candidates.push('C:\\Program Files\\7-Zip\\7z.exe');
  candidates.push('C:\\Program Files (x86)\\7-Zip\\7z.exe');

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        console.log(`Found system 7-Zip: ${candidate}`);
        return candidate;
      }
    } catch (e) {
      continue;
    }
  }

  try {
    const res = spawnSync('7z', ['--help'], { stdio: 'ignore' });
    if (res.status === 0 || res.status === 1 || res.status === null) {
      console.log('Using 7z from PATH');
      return '7z';
    }
  } catch (e) {
  }
  if (path7za && fs.existsSync(path7za)) {
    console.log(`Using bundled 7-Zip: ${path7za}`);
    return path7za;
  }

  return null;
}

function findUnrarExecutable(preferredPath) {
  if (preferredPath && fs.existsSync(preferredPath)) {
    return preferredPath;
  }
  try {
    const toolsDir = path.join(__dirname, '..', 'tools');
    const projectUnrar = path.join(toolsDir, 'UnRAR.exe');
    const projectUnrarLower = path.join(toolsDir, 'unrar.exe');
    if (fs.existsSync(projectUnrar)) return projectUnrar;
    if (fs.existsSync(projectUnrarLower)) return projectUnrarLower;
    if (fs.existsSync(toolsDir)) {
      const candidates = fs.readdirSync(toolsDir).filter((n) => /^(unrar)[^\\/]*\.exe$/i.test(n));
      if (candidates.length > 0) return path.join(toolsDir, candidates[0]);
    }
  } catch (e) {}

  const candidates = [];
  if (process.env.PATH) {
    const pathEntries = process.env.PATH.split(path.delimiter);
    for (const entry of pathEntries) {
      if (!entry) continue;
      const candidate = path.join(entry, 'unrar.exe');
      candidates.push(candidate);
    }
  }
  candidates.push('C:\\Program Files\\RAR\\UnRAR.exe');
  candidates.push('C:\\Program Files (x86)\\RAR\\UnRAR.exe');
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch (e) {}
  }
  try {
    const r = spawnSync('unrar', [''], { stdio: 'ignore' });
    if (r && (r.status === 0 || r.status === 1 || r.status === null)) return 'unrar';
  } catch (e) {}
  return null;
}

async function extractArchiveWith7z(archivePath, outDir, executable) {
  fs.mkdirSync(outDir, { recursive: true });
  const execPath = executable || '7z';
  const resolved = resolveExecutable(execPath) || path7za || execPath;

  const args = ['x', '-y', `-o${outDir}`, archivePath, '-bsp1'];

  return new Promise((resolve, reject) => {
    let lastPercent = 0;
    let stdoutBuffer = '';
    let child;
    try {
      child = spawn(resolved, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      return reject(err);
    }

    const maxNameWidth = 40;
    const displayName = truncateText(path.basename(archivePath), maxNameWidth);

    child.stdout.on('data', (chunk) => {
      try {
        const s = chunk.toString('utf8');
        stdoutBuffer += s;
        const matches = s.match(/(\d{1,3})%/g);
        if (matches && matches.length > 0) {
          const m = matches[matches.length - 1];
          const pct = parseInt(m.replace('%', ''), 10);
          if (!Number.isNaN(pct)) {
            lastPercent = pct;
            const bar = createProgressBar(pct, 100, 30);
            clearLine();
            process.stdout.write(`${COLORS.cyan}Extraindo:${COLORS.reset} ${displayName} ${bar} ${pct}%`);
          }
        }
      } catch (e) {
      }
    });

    child.stderr.on('data', (chunk) => {
      try {
        const s = chunk.toString('utf8');
        const matches = s.match(/(\d{1,3})%/g);
        if (matches && matches.length > 0) {
          const m = matches[matches.length - 1];
          const pct = parseInt(m.replace('%', ''), 10);
          if (!Number.isNaN(pct)) {
            lastPercent = pct;
            const bar = createProgressBar(pct, 100, 30);
            clearLine();
            process.stdout.write(`${COLORS.cyan}Extraindo:${COLORS.reset} ${displayName} ${bar} ${pct}%`);
          }
        }
      } catch (e) {}
    });

    child.on('error', (err) => {
      reject(err);
    });

    child.on('close', (code) => {
      try { process.stdout.write('\n'); } catch (e) {}
      if (code === 0) return resolve();
      const stdout = stdoutBuffer || '';
      return reject(new Error(`${resolved} failed (code ${code}). output: ${stdout.trim()}`));
    });
  });
}

function resolveExecutable(name) {
  try {
    if (!name) return null;
    if (path.isAbsolute(name) && fs.existsSync(name)) return name;
    if (process.platform === 'win32') {
      const r = spawnSync('where', [name], { encoding: 'utf8' });
      if (r && r.status === 0 && r.stdout) {
        const lines = r.stdout.split(/\r?\n/).filter(Boolean);
        for (const l of lines) {
          if (fs.existsSync(l)) return l.trim();
        }
      }
    } else {
      const r = spawnSync('which', [name], { encoding: 'utf8' });
      if (r && r.status === 0 && r.stdout) {
        const p = r.stdout.split(/\r?\n/)[0].trim();
        if (fs.existsSync(p)) return p;
      }
    }
  } catch (e) {
  }
  return null;
}

function extractZipWithPowershell(archivePath, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const cmd = `Expand-Archive -Force -LiteralPath ${wrapPathForPowershell(archivePath)} -DestinationPath ${wrapPathForPowershell(outDir)}`;
  const res = spawnSync('powershell', ['-NoProfile', '-Command', cmd], { stdio: 'inherit' });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`PowerShell Expand-Archive failed with code ${res.status}`);
}

async function extractZipWithNode(archivePath, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  if (AdmZip) {
    const zip = new AdmZip(archivePath);
    zip.extractAllTo(outDir, true);
    return;
  }
  if (decompress) {
    await decompress(archivePath, outDir);
    return;
  }
  throw new Error('Nenhum extrator ZIP em Node instalado (adm-zip ou decompress).');
}

function wrapPathForPowershell(p) {
  return `\'${p.replace(/'/g, "''")}\'`;
}

function toNamespacedPath(p) {
  if (process.platform === 'win32' && typeof p === 'string') {
    return path.toNamespacedPath(p);
  }
  return p;
}

function findFilesRecursively(dir, exts) {
  const results = [];
  const nsDir = toNamespacedPath(dir);
  if (!fs.existsSync(nsDir)) return results;
  let items;
  try {
    items = fs.readdirSync(nsDir, { withFileTypes: true });
  } catch (e) {
    return results;
  }
  for (const it of items) {
    const p = path.join(dir, it.name);
    if (it.isDirectory()) {
      results.push(...findFilesRecursively(p, exts));
    } else {
      const lower = it.name.toLowerCase();
      for (const e of exts) {
        if (lower.endsWith(e)) {
          results.push(p);
          break;
        }
      }
    }
  }
  return results;
}

function extractRarWithUnrar(archivePath, outDir) {
  return new Promise((resolve, reject) => {
    if (!unrar || typeof unrar.unrar !== 'function') {
      return reject(new Error('unrar.js não está disponível ou não possui a função unrar. Instale com: npm install unrar.js'));
    }
    fs.mkdirSync(outDir, { recursive: true });
    try {
      const maxNameWidth = 40;
      const displayName = truncateText(path.basename(archivePath), maxNameWidth);
      const options = {
        onProgress: (p) => {
          try {
            let pct = 0;
            if (typeof p === 'number') {
              pct = p > 0 && p <= 1 ? Math.round(p * 100) : Math.round(p);
            } else if (p && typeof p.percent === 'number') {
              pct = Math.round(p.percent);
            }
            if (pct >= 0) {
              const bar = createProgressBar(pct, 100, 30);
              clearLine();
              process.stdout.write(`${COLORS.cyan}Extraindo:${COLORS.reset} ${displayName} ${bar} ${pct}%`);
            }
          } catch (e) {}
        },
      };
      unrar.unrar(archivePath, outDir, options, (err, files) => {
        if (err) {
          process.stdout.write('\n');
          return reject(new Error(typeof err === 'string' ? err : (err && err.message) || String(err)));
        }
        process.stdout.write('\n');
        resolve(files || []);
      });
    } catch (e) {
      reject(e);
    }
  });
}

function sanitizeFolderName(name) {
  return name
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function extractArchiveToTemp(archivePath, tempDir, config, sevenZipExe) {
  const archExt = path.extname(archivePath).toLowerCase();
  const archName = path.basename(archivePath);

  fs.mkdirSync(tempDir, { recursive: true });
  console.log(`Extraindo arquivo compactado: ${archName}`);

  let extracted = false;
  let lastError = null;

  if (archExt === '.rar' && unrar) {
    try {
      const stats = fs.statSync(archivePath);
      const sizeLimit = 200 * 1024 * 1024;
      if (stats.size <= sizeLimit) {
        await extractRarWithUnrar(archivePath, tempDir);
        extracted = true;
      } else {
        console.log(`RAR muito grande (${formatBytes(stats.size)}). Pulando fallback unrar.js.`);
      }
    } catch (err) {
      console.warn(`Falha ao extrair RAR com unrar.js: ${err.message}`);
      lastError = err;
    }
  }

  if (!extracted && sevenZipExe) {
    try {
      await extractArchiveWith7z(archivePath, tempDir, sevenZipExe);
      extracted = true;
    } catch (err) {
      lastError = err;
      console.warn(`Falha ao extrair ${archName} com 7-Zip: ${err.message}`);
    }
  }

  if (!extracted && archExt === '.rar') {
    const unrarExe = resolveExecutable(config.unrarPath || 'unrar') || findUnrarExecutable(config.unrarPath);
    if (unrarExe) {
      try {
        console.log(`${COLORS.cyan}Extraindo:${COLORS.reset} ${archName} (via ${path.basename(unrarExe)})`);
        const res = spawnSync(unrarExe, ['x', '-y', archivePath, tempDir], { stdio: 'inherit' });
        if (res.error) throw res.error;
        if (res.status === 0) {
          extracted = true;
        } else {
          console.warn(`unrar returned code ${res.status}`);
        }
      } catch (err) {
        console.warn(`Falha ao extrair com unrar CLI: ${err.message}`);
      }
    } else {
      console.warn('Nenhum UnRAR CLI encontrado (procure por tools/UnRAR.exe ou instale UnRAR/WinRAR no sistema).');
    }
  }

  if (!extracted && archExt === '.zip') {
    if (AdmZip || decompress) {
      try {
        console.log(`${COLORS.cyan}Extraindo:${COLORS.reset} ${archName} (via Node)`);
        await extractZipWithNode(archivePath, tempDir);
        extracted = true;
      } catch (err) {
        console.warn(`Falha ao extrair ZIP com Node: ${err.message}`);
      }
    }
    if (!extracted && !sevenZipExe) {
      try {
        console.log(`${COLORS.cyan}Extraindo:${COLORS.reset} ${archName} (via PowerShell)`);
        extractZipWithPowershell(archivePath, tempDir);
        extracted = true;
      } catch (err) {
        console.warn(`Falha no fallback PowerShell para ${archName}: ${err.message}`);
      }
    }
  }

  return extracted;
}

async function extractAndConvert(isoPath, targetDir, index, total, numWorkers, config) {
  const basename = path.basename(isoPath, path.extname(isoPath));
  const sanitizedName = sanitizeFolderName(basename);
  const finalDir = targetDir || (config.outputDir
    ? path.join(config.outputDir, sanitizedName)
    : path.join(path.dirname(isoPath), sanitizedName));

  const nsPath = toNamespacedPath(isoPath);
  const errMsg = `Não foi possível acessar o arquivo ISO: ${basename}`;
  let isoSize;
  let fd;
  try {
    fd = fs.openSync(nsPath, 'r');
    isoSize = fs.fstatSync(fd).size;
    fs.closeSync(fd);
    fd = null;
  } catch (e) {
    if (fd) { try { fs.closeSync(fd); } catch (_) {} }
    try {
      fd = fs.openSync(isoPath, 'r');
      isoSize = fs.fstatSync(fd).size;
      fs.closeSync(fd);
      fd = null;
    } catch (e2) {
      throw new Error(`${errMsg} — ${e2.message}`);
    }
  }
  if (!isoSize || isoSize === 0) {
    throw new Error(`${errMsg} — arquivo vazio (0 bytes)`);
  }

  console.log(
    `${COLORS.cyan}[${index}/${total}]${COLORS.reset} ${COLORS.bright}Convertendo:${COLORS.reset} ${basename} (${formatBytes(isoSize)})`,
  );

  let totalExtracted = 0;
  let lastProgressUpdate = 0;
  let lastDisplayedPct = -1;
  const PROGRESS_THROTTLE_MS = 200;
  const perFileProgress = new Map();

  extractXiso.setProgressCallback((progress) => {
    try {
      if (progress.type === 'fileStart') {
        perFileProgress.set(progress.path, 0);
        return;
      }

      if (progress.type === 'fileProgress') {
        const last = perFileProgress.get(progress.path) || 0;
        const delta = Math.max(0, progress.extracted - last);
        if (delta > 0) {
          totalExtracted += delta;
          perFileProgress.set(progress.path, progress.extracted);
        }
        const now = Date.now();
        if (now - lastProgressUpdate < PROGRESS_THROTTLE_MS) return;
        lastProgressUpdate = now;
        const overallPct = isoSize === 0 ? 0 : Math.round((totalExtracted / isoSize) * 100);
        lastDisplayedPct = overallPct;
        const bar = createProgressBar(overallPct, 100, 30);
        const elapsed = (Date.now() - startTime) / 1000;
        const spd = totalExtracted / (elapsed || 0.001);
        const remaining = isoSize - totalExtracted;
        const eta = formatETA(remaining / (spd || 0.001));
        clearLine();
        process.stdout.write(`${COLORS.cyan}[${index}/${total}]${COLORS.reset} ${COLORS.bright}Convertendo:${COLORS.reset} ${basename} ${bar} ${overallPct}% ${COLORS.yellow}ETA: ${eta}${COLORS.reset} ${COLORS.cyan}${formatBytes(spd)}/s${COLORS.reset}`);
      }

      if (progress.type === 'fileComplete') {
        perFileProgress.set(progress.path, progress.size || perFileProgress.get(progress.path) || 0);
        const prev = perFileProgress.get(progress.path) || 0;
        if (prev > totalExtracted) totalExtracted = prev;
        const overallPct = isoSize === 0 ? 100 : Math.round((totalExtracted / isoSize) * 100);
        const now = Date.now();
        if (overallPct <= lastDisplayedPct && now - lastProgressUpdate < PROGRESS_THROTTLE_MS) return;
        lastProgressUpdate = now;
        lastDisplayedPct = overallPct;
        const bar = createProgressBar(overallPct, 100, 30);
        const elapsed = (Date.now() - startTime) / 1000;
        const spd = totalExtracted / (elapsed || 0.001);
        const remaining = isoSize - totalExtracted;
        const eta = remaining > 0 ? formatETA(remaining / (spd || 0.001)) : '0s';
        clearLine();
        process.stdout.write(`${COLORS.green}✓ [${index}/${total}]${COLORS.reset} ${basename} ${bar} ${overallPct}% ${COLORS.yellow}ETA: ${eta}${COLORS.reset} ${COLORS.cyan}${formatBytes(spd)}/s${COLORS.reset}`);
      }
    } catch (e) {
    }
  });

  const startTime = Date.now();
  let result;

  try {
    result = await extractXiso.extractXisoSync(isoPath, finalDir, {
      skipSystemUpdate: config.deleteSystemUpdate,
    });
  } catch (e) {
    if (e && e.stack) console.error(e.stack);
    throw e;
  } finally {
    extractXiso.setProgressCallback(null);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  const spd = (isoSize / (1024 * 1024) / duration).toFixed(2);

  if (result && result.outputDir) {
    try {
      const sanitizer = require('./sanitize-extracted-filenames');
      try {
        sanitizer.sanitizeDirectory(result.outputDir);
      } catch (e) {
      }
    } catch (e) {
    }
  }

  clearLine();
  console.log(
    `${COLORS.green}✓ [${index}/${total}]${COLORS.reset} ${basename} - ${result.items.length} itens extraídos em ${duration}s (${spd} MB/s)`,
  );
  return result;
}

async function main() {
  console.log(`${COLORS.bright}${COLORS.cyan}=== Extract-XISO Node.js v0.1.0 ===${COLORS.reset}\n`);

  const argv = process.argv.slice(2);
  const quiet = argv.includes('-q');
  const config = loadConfig();
  const numWorkers = os.cpus().length;

  if (!quiet) {
    console.log(`${COLORS.cyan}Configuração:${COLORS.reset}`);
    console.log(`  ISO Dir: ${config.isoDir}`);
    console.log(`  Saída: ${config.outputDir ? config.outputDir : 'mesma pasta do arquivo ISO'}`);
    console.log(`  Apagar $SystemUpdate: ${config.deleteSystemUpdate ? 'Sim' : 'Não'}`);
    console.log(`  Apagar ISO após extração: ${config.deleteIsoAfterExtract ? 'Sim' : 'Não'}`);
    console.log();
  }

  const sevenZipExe = find7zExecutable(config.sevenZipPath);
  const have7z = Boolean(sevenZipExe);
  if (!have7z) {
    console.log('Aviso: 7z nao encontrado no PATH — tentaremos fallback para .zip com PowerShell. Outros formatos serao ignorados.');
  }

  const nativePaths = findAllXisos(config.isoDir);
  const nativeXisos = nativePaths.map((p) => ({ isoPath: path.resolve(p), source: 'native' }));

  const archiveExts = ['.zip', '.rar', '.7z', '.tar', '.tar.gz', '.tgz'];
  let archives = [];
  if (fs.existsSync(config.isoDir)) {
    const files = fs.readdirSync(config.isoDir);
    archives = files.filter((f) => {
      const lower = f.toLowerCase();
      return archiveExts.some((ext) => lower.endsWith(ext));
    }).map((f) => path.join(config.isoDir, f));
  }

  const totalExpected = nativeXisos.length + archives.length;
  if (totalExpected === 0) {
    console.log(`${COLORS.yellow}Nenhum arquivo .iso/.xiso ou compactado encontrado em "${config.isoDir}"${COLORS.reset}`);
    console.log(`${COLORS.cyan}Coloque seus arquivos nessa pasta e execute novamente.${COLORS.reset}`);
    process.exitCode = 2;
    return;
  }

  console.log(`${COLORS.bright}Encontrados ${COLORS.green}${nativeXisos.length} ISO(s) nativo(s)${COLORS.reset}${COLORS.bright} e ${COLORS.green}${archives.length} arquivo(s) compactado(s)${COLORS.reset}${COLORS.bright}${COLORS.reset}\n`);

  const startTime = Date.now();
  let successCount = 0;
  let failCount = 0;
  let itemIndex = 0;

  for (const native of nativeXisos) {
    itemIndex += 1;
    try {
      await extractAndConvert(native.isoPath, null, itemIndex, totalExpected, numWorkers, config);
      successCount += 1;

      if (config.deleteIsoAfterExtract) {
        try {
          fs.unlinkSync(native.isoPath);
          console.log(`${COLORS.yellow}ISO removido:${COLORS.reset} ${path.basename(native.isoPath)}`);
        } catch (err) {
          console.warn(`${COLORS.red}Falha ao apagar ISO:${COLORS.reset} ${err.message}`);
        }
      }
    } catch (error) {
      failCount += 1;
      clearLine();
      console.log(
        `${COLORS.red}✗ [${itemIndex}/${totalExpected}]${COLORS.reset} Erro ao extrair ${path.basename(native.isoPath)}: ${error.message}`,
      );
    }
  }

  for (let i = 0; i < archives.length; i += 1) {
    const arch = archives[i];
    const archName = path.basename(arch);
    itemIndex += 1;

    const shortId = `xi_${Date.now().toString(36)}_${i}`;
    const tempDir = path.join(os.tmpdir(), shortId);

    let archiveDeleted = false;

    try {
      const extracted = await extractArchiveToTemp(arch, tempDir, config, sevenZipExe);
      if (!extracted) {
        console.warn(`Não foi possível extrair ${archName}. Pulando.`);
        failCount += 1;
        continue;
      }

      const isos = findFilesRecursively(tempDir, ['.iso', '.xiso']);
      if (isos.length === 0) {
        console.warn(`Nenhum arquivo ISO/XISO encontrado dentro de ${archName}`);
        failCount += 1;
        continue;
      }

      console.log(`Encontrados ${isos.length} arquivo(s) ISO/XISO em ${archName}`);

      for (const isoFile of isos) {
        try {
          const isoRegular = path.resolve(isoFile);
          if (!fs.existsSync(toNamespacedPath(isoRegular))) {
            console.warn(`Arquivo ISO não encontrado em: ${isoFile}`);
            continue;
          }
          const result = await extractAndConvert(isoRegular, null, itemIndex, totalExpected, numWorkers, config);

          if (config.deleteIsoAfterExtract && !archiveDeleted) {
            try {
              fs.unlinkSync(arch);
              archiveDeleted = true;
              console.log(`${COLORS.yellow}Arquivo compactado removido:${COLORS.reset} ${arch}`);
            } catch (err) {
              console.warn(`${COLORS.red}Falha ao apagar arquivo fonte:${COLORS.reset} ${err.message}`);
            }
          }

          successCount += 1;
        } catch (error) {
          failCount += 1;
          clearLine();
          console.log(
            `${COLORS.red}✗ [${itemIndex}/${totalExpected}]${COLORS.reset} Erro ao extrair ISO de ${archName}: ${error.message}`,
          );
        }
      }
    } catch (error) {
      failCount += 1;
      console.warn(`${COLORS.red}Falha ao processar ${archName}:${COLORS.reset} ${error.message}`);
    } finally {
      if (tempDir && fs.existsSync(tempDir)) {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (err) {
          console.warn(`${COLORS.red}Falha ao limpar temp:${COLORS.reset} ${err.message}`);
        }
      }
    }
  }

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n${COLORS.bright}=== Resumo ===${COLORS.reset}`);
  console.log(`${COLORS.green}Sucesso: ${successCount}${COLORS.reset}`);
  if (failCount > 0) {
    console.log(`${COLORS.red}Falhas: ${failCount}${COLORS.reset}`);
  }
  console.log(`${COLORS.cyan}Tempo total: ${totalDuration}s${COLORS.reset}`);
  console.log(`${COLORS.cyan}Pasta de saída: subpastas criadas junto aos arquivos .iso${COLORS.reset}\n`);
  process.exitCode = successCount > 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(`${COLORS.red}Erro fatal: ${error.message}${COLORS.reset}`);
  process.exit(1);
});

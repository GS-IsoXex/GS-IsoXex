#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const extractXiso = require('../index');
let unrar = null;
try {
  unrar = require('unrar.js');
} catch (e) {
  // unrar.js may not be installed
}
let decompress = null;
try {
  decompress = require('decompress');
} catch (e) {
  // decompress may not be installed
}
let AdmZip = null;
try {
  AdmZip = require('adm-zip');
} catch (e) {
  // adm-zip may not be installed
}
let path7za = null;
try {
  path7za = require('7zip-bin').path7za;
} catch (e) {
  // 7zip-bin may not be installed; fallback to system 7z
}

// Logger: grava também em extract.log para depuração
const LOG_PATH = path.resolve(__dirname, '../extract.log');
try {
  const logStream = fs.createWriteStream(LOG_PATH, { flags: 'a', encoding: 'utf8' });
  const origLog = console.log.bind(console);
  const origError = console.error.bind(console);
  console.log = (...args) => {
    try { logStream.write(args.join(' ') + '\n'); } catch (e) {}
    origLog(...args);
  };
  console.error = (...args) => {
    try { logStream.write(args.join(' ') + '\n'); } catch (e) {}
    origError(...args);
  };
  process.on('exit', () => { try { logStream.end(); } catch (e) {} });
} catch (e) {
  // Não fatal: se não puder criar o log, continuar normalmente
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

const deletedArchivePaths = new Set();

function createProgressBar(current, total, width = 30) {
  const filledWidth = total === 0 ? width : Math.round((width * current) / total);
  const emptyWidth = width - filledWidth;
  const bar = '█'.repeat(filledWidth) + '░'.repeat(emptyWidth);
  return `[${bar}]`;
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

function clearLine() {
  process.stdout.write('\r\x1b[K');
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
  // Prefer system 7-Zip installations (full feature set) before the bundled 7za
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
    // ignore
  }
  // Fallback to bundled 7za if present
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
  // Check project-local tools folder first
  try {
    const toolsDir = path.join(__dirname, '..', 'tools');
    const projectUnrar = path.join(toolsDir, 'UnRAR.exe');
    const projectUnrarLower = path.join(toolsDir, 'unrar.exe');
    if (fs.existsSync(projectUnrar)) return projectUnrar;
    if (fs.existsSync(projectUnrarLower)) return projectUnrarLower;
    // Accept variants like unrarw64.exe, unrarx64.exe, etc.
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

function extractArchiveWith7z(archivePath, outDir, executable) {
  fs.mkdirSync(outDir, { recursive: true });
  const execPath = executable || '7z';
  // Resolve '7z' to an absolute path when possible; otherwise prefer bundled path7za
  const resolved = resolveExecutable(execPath) || path7za || execPath;
  const args = ['x', '-y', `-o${outDir}`, archivePath];
  // Capture output so we can inspect stderr for specific errors
  const res = spawnSync(resolved, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    const ext = path.extname(archivePath).toLowerCase();
    const stderr = (res.stderr || '').toString();
    const stdout = (res.stdout || '').toString();
    const msg = `${resolved} failed (code ${res.status}). stdout: ${stdout.trim()} stderr: ${stderr.trim()}`;
    if (ext === '.rar') {
      throw new Error(`${msg}`);
    }
    throw new Error(msg);
  }
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
    // ignore
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
  // Prefer adm-zip (synchronous) if available
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
  // Escapa aspas simples e envolve entre aspas simples para o PowerShell
  return `\'${p.replace(/'/g, "''")}\'`;
}

function findFilesRecursively(dir, exts) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const items = fs.readdirSync(dir, { withFileTypes: true });
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
      const options = {
        onProgress: (p) => {
          // opcional: podemos logar progresso se quisermos
        },
      };
      unrar.unrar(archivePath, outDir, options, (err, files) => {
        if (err) {
          return reject(new Error(typeof err === 'string' ? err : (err && err.message) || String(err)));
        }
        resolve(files || []);
      });
    } catch (e) {
      reject(e);
    }
  });
}

async function extractArchivesAndCollectIsos(isoDir) {
  const archiveExts = ['.zip', '.rar', '.7z', '.tar', '.tar.gz', '.tgz'];
  const results = [];
  if (!fs.existsSync(isoDir)) return { isos: results, tempBase: null };

  const files = fs.readdirSync(isoDir);
  const archives = files.filter((f) => {
    const lower = f.toLowerCase();
    return archiveExts.some((ext) => lower.endsWith(ext));
  }).map((f) => path.join(isoDir, f));

  if (archives.length === 0) return { isos: results, tempBase: null };

  const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'extract-xiso-'));
  const config = loadConfig();
  const sevenZipExe = find7zExecutable(config.sevenZipPath);
  const have7z = Boolean(sevenZipExe);
  if (!have7z) {
    console.log('Aviso: 7z nao encontrado no PATH — tentaremos fallback para arquivos .zip usando PowerShell Expand-Archive quando possivel. Outros formatos serao ignorados.');
  }

  for (const arch of archives) {
    const archExt = path.extname(arch).toLowerCase();
    const archName = path.basename(arch);
    try {
      const name = path.basename(arch, path.extname(arch));
      const outDir = path.join(tempBase, name);
      console.log(`Extraindo arquivo compactado: ${arch} -> ${outDir}`);
      
      let extracted = false;
      let lastError = null;
      
      // Tentar extrair RAR com unrar.js primeiro, mas evite para arquivos muito grandes
      if (archExt === '.rar' && unrar) {
        try {
          const stats = fs.statSync(arch);
          const sizeLimit = 200 * 1024 * 1024; // 200 MB
          if (stats.size <= sizeLimit) {
            await extractRarWithUnrar(arch, outDir);
            extracted = true;
          } else {
            console.log(`RAR muito grande (${formatBytes(stats.size)}). Pulando fallback unrar.js.`);
          }
        } catch (err) {
          console.warn(`Falha ao extrair RAR com unrar.js: ${err.message}`);
          lastError = err;
        }
      }
      
      // Estratégia de extração com 7z
      if (!extracted && have7z) {
        try {
          extractArchiveWith7z(arch, outDir, sevenZipExe);
          extracted = true;
        } catch (err) {
          lastError = err;
          // Mensagem genérica para falha no 7z
          console.warn(`Falha ao extrair ${archName} com ${sevenZipExe || '7z'}: ${err.message}`);
        }
      }

      // Se ainda não extraído e for RAR, tentar fallback para unrar CLI se disponível
          if (!extracted && archExt === '.rar') {
            // Prefer resolved executable (checks tools/ and PATH)
            const unrarExe = resolveExecutable(config.unrarPath || 'unrar') || findUnrarExecutable(config.unrarPath);
            if (unrarExe) {
              try {
                console.log(`Tentando extrair RAR com: ${unrarExe}`);
                const res = spawnSync(unrarExe, ['x', '-y', arch, outDir], { stdio: 'inherit' });
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
              console.warn('Consulte tools/README-unrar.md para instruções de obtenção de um UnRAR portátil.');
            }
      }
      
      // ZIP extraction: use Node-native extractor when available, otherwise fallback to PowerShell if 7z is unavailable
      if (!extracted && archExt === '.zip') {
        if (AdmZip || decompress) {
          try {
            console.log(`Extraindo ZIP com Node (adm-zip/decompress): ${archName}`);
            await extractZipWithNode(arch, outDir);
            extracted = true;
          } catch (err) {
            console.warn(`Falha ao extrair ZIP com Node: ${err.message}`);
            // continue to other fallbacks
          }
        }
        if (!extracted && !have7z) {
          try {
            console.log(`Tentando extrair ZIP com PowerShell: ${archName}`);
            extractZipWithPowershell(arch, outDir);
            extracted = true;
          } catch (err) {
            console.warn(`Falha no fallback PowerShell para ${archName}: ${err.message}`);
          }
        }
      }
      
      // Se conseguiu extrair, procurar por ISOs
      if (extracted) {
        const isos = findFilesRecursively(outDir, ['.iso', '.xiso']);
        if (isos.length > 0) {
          console.log(`Encontrados ${isos.length} arquivo(s) ISO/XISO em ${archName}`);
          for (const p of isos) {
            results.push({ isoPath: path.resolve(p), source: 'archive', archivePath: arch });
          }
        } else {
          console.warn(`Nenhum arquivo ISO/XISO encontrado dentro de ${archName}`);
        }
      } else {
        console.warn(`Não foi possível extrair ${archName}. Formato pode não ser suportado.`);
      }
    } catch (err) {
      console.warn(`Falha ao processar ${archName}: ${err.message}`);
    }
  }

  return { isos: results, tempBase };
}

function sanitizeFolderName(name) {
  return name
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function extractWithProgress(isoObj, outputDir, index, total, numWorkers) {
  const config = loadConfig();
  const isoPath = isoObj.isoPath;
  const basename = path.basename(isoPath, path.extname(isoPath));
  const sanitizedName = sanitizeFolderName(basename);
  const targetDir = config.outputDir
    ? path.join(config.outputDir, sanitizedName)
    : path.join(path.dirname(isoPath), sanitizedName);
  console.log(
    `${COLORS.cyan}[${index}/${total}]${COLORS.reset} ${COLORS.bright}Extraindo:${COLORS.reset} ${basename}`,
  );

    try {
    const stats = fs.statSync(isoPath);
    const isoSize = stats.size;
    let lastPercent = 0;

    extractXiso.setProgressCallback((progress) => {
      if (progress.type === 'fileStart') {
        lastPercent = 0;
        const bar = createProgressBar(0, progress.size, 30);
        clearLine();
        process.stdout.write(
          `${COLORS.cyan}[${index}/${total}]${COLORS.reset} ${COLORS.bright}Extraindo:${COLORS.reset} ${basename} ${bar} 0%`,
        );
        return;
      }
      if (progress.type === 'fileProgress') {
        const bar = createProgressBar(progress.extracted, progress.size, 30);
        clearLine();
        process.stdout.write(
          `${COLORS.cyan}[${index}/${total}]${COLORS.reset} ${COLORS.bright}Extraindo:${COLORS.reset} ${basename} ${bar} ${progress.percent}%`,
        );
        lastPercent = progress.percent;
      }
      if (progress.type === 'fileComplete') {
        clearLine();
        process.stdout.write(
          `${COLORS.green}✓ [${index}/${total}]${COLORS.reset} ${basename} - ${progress.size} bytes extraídos`,
        );
      }
    });

    const startTime = Date.now();
    console.log('DEBUG: calling extractXisoParallel', { isoPath, targetDir, numWorkers });
    let result;
    let extractionSucceeded = false;

    try {
      result = await extractXiso.extractXisoParallel(isoPath, targetDir, {
        skipSystemUpdate: config.deleteSystemUpdate,
        numWorkers,
      });
      extractionSucceeded = true;
    } catch (e) {
      console.error('DEBUG: caught error from extractXisoParallel. typeof:', typeof e);
      try {
        console.error('DEBUG: error (stringified):', JSON.stringify(e, Object.getOwnPropertyNames(e)));
      } catch (jsonErr) {
        console.error('DEBUG: error stringify failed:', jsonErr && jsonErr.message);
      }
      if (e && e.stack) console.error(e.stack);
      throw e;
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const speed = (isoSize / (1024 * 1024) / duration).toFixed(2);

    // Apagar fonte somente se configurado e se a extração foi bem-sucedida
    if (config.deleteIsoAfterExtract && extractionSucceeded) {
      try {
        if (isoObj.source === 'archive' && isoObj.archivePath) {
          if (!deletedArchivePaths.has(isoObj.archivePath)) {
            fs.unlinkSync(isoObj.archivePath);
            deletedArchivePaths.add(isoObj.archivePath);
            console.log(`${COLORS.yellow}Arquivo compactado removido:${COLORS.reset} ${isoObj.archivePath}`);
          }
        } else {
          fs.unlinkSync(isoPath);
          console.log(`${COLORS.yellow}Arquivo ISO removido:${COLORS.reset} ${isoPath}`);
        }
      } catch (err) {
        console.warn(`${COLORS.red}Falha ao apagar arquivo fonte:${COLORS.reset} ${err.message}`);
      }
    }

    clearLine();
    console.log(
      `${COLORS.green}✓ [${index}/${total}]${COLORS.reset} ${basename} - ${result.items.length} itens extraídos em ${duration}s (${speed} MB/s)`,
    );
    return result;
  } catch (error) {
    clearLine();
    console.log(
      `${COLORS.red}✗ [${index}/${total}]${COLORS.reset} Erro ao extrair ${basename}: ${error.message}`,
    );
    // Mostrar stack completa para depuração
    if (error && error.stack) {
      console.error(error.stack);
    }
    throw error;
  }
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
    console.log(`  Apagar ISO após extração: ${config.deleteIsoAfterExtract ? 'Sim' : 'Não'} (inclui também arquivos compactados)`);
    console.log();
  }

  // Procurar ISOs e também dentro de arquivos compactados
  const nativePaths = findAllXisos(config.isoDir);
  const nativeXisos = nativePaths.map((p) => ({ isoPath: path.resolve(p), source: 'native' }));
  const archiveResult = await extractArchivesAndCollectIsos(config.isoDir); // returns { isos, tempBase }
  const archiveXisos = archiveResult.isos || [];
  const tempBase = archiveResult.tempBase || null;
  const xisos = nativeXisos.concat(archiveXisos);

  if (xisos.length === 0) {
    console.log(`${COLORS.yellow}Nenhum arquivo .iso ou .xiso encontrado em "${config.isoDir}"${COLORS.reset}`);
    console.log(`${COLORS.cyan}Coloque seus arquivos .iso ou .xiso nessa pasta e execute novamente.${COLORS.reset}`);
    // sinaliza falha para o caller (batch) quando não há arquivos para processar
    process.exitCode = 2;
    return;
  }

  console.log(
    `${COLORS.bright}Encontrados ${COLORS.green}${xisos.length}${COLORS.reset}${COLORS.bright} arquivo(s) .iso/.xiso:${COLORS.reset}\n`,
  );
  xisos.forEach((f, i) => {
    const size = fs.statSync(f.isoPath).size;
    console.log(`  ${i + 1}. ${path.basename(f.isoPath)} (${formatBytes(size)})`);
  });
  console.log();

  // Iniciar extração
  const startTime = Date.now();
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < xisos.length; i += 1) {
    try {
      await extractWithProgress(xisos[i], null, i + 1, xisos.length, numWorkers);
      successCount += 1;
    } catch {
      failCount += 1;
    }
  }

  // limpar pasta temporária criada para extrair archives (se existir)
  if (tempBase) {
    try {
      fs.rmSync(tempBase, { recursive: true, force: true });
      console.log(`${COLORS.cyan}Pastas temporarias removidas: ${tempBase}${COLORS.reset}`);
    } catch (err) {
      console.warn(`${COLORS.red}Falha ao limpar temporarios:${COLORS.reset} ${err.message}`);
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
  // Define código de saída: 0 se houve pelo menos uma extração bem-sucedida, 1 caso contrário
  process.exitCode = successCount > 0 ? 0 : 1;

}

main().catch((error) => {
  console.error(`${COLORS.red}Erro fatal: ${error.message}${COLORS.reset}`);
  process.exit(1);
});

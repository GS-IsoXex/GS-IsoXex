#!/usr/bin/env node

/**
 * Ferramenta de Debug para arquivos XISO
 * Mostra informações detalhadas sobre um arquivo ISO
 */

const fs = require('fs');
const path = require('path');
const extractXiso = require('../index');

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
};

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

function main() {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) {
    console.log(`
${COLORS.bright}Ferramenta de Debug XISO${COLORS.reset}

${COLORS.bright}Uso:${COLORS.reset}
  node bin/debug.js <arquivo.xiso> [opções]

${COLORS.bright}Opções:${COLORS.reset}
  -l, --list          Lista todos os arquivos
  -s, --stats         Mostra estatísticas
  -t, --tree          Mostra árvore de diretórios
  -h, --help          Mostra esta mensagem
    `);
    return;
  }

  const isoPath = argv[0];
  const showList = argv.includes('-l') || argv.includes('--list');
  const showStats = argv.includes('-s') || argv.includes('--stats');
  const showTree = argv.includes('-t') || argv.includes('--tree');

  if (!fs.existsSync(isoPath)) {
    console.error(`${COLORS.red}Erro: Arquivo não encontrado: ${isoPath}${COLORS.reset}`);
    process.exit(1);
  }

  try {
    console.log(`\n${COLORS.cyan}${COLORS.bright}=== Análise de XISO ===${COLORS.reset}\n`);

    // Informações do arquivo
    const stats = fs.statSync(isoPath);
    console.log(`${COLORS.bright}Arquivo:${COLORS.reset} ${path.basename(isoPath)}`);
    console.log(`${COLORS.bright}Tamanho:${COLORS.reset} ${formatBytes(stats.size)}`);
    console.log(`${COLORS.bright}Caminho:${COLORS.reset} ${isoPath}`);
    console.log(`${COLORS.bright}Modificado:${COLORS.reset} ${stats.mtime.toLocaleString('pt-BR')}\n`);

    // Verificação da estrutura
    console.log(`${COLORS.bright}Verificando estrutura...${COLORS.reset}`);
    const verification = extractXiso.verifyXisoSync(isoPath);
    console.log(`${COLORS.green}✓ XISO Válido!${COLORS.reset}`);
    console.log(`${COLORS.bright}Setor raiz:${COLORS.reset} 0x${verification.rootDirSector.toString(16)}`);
    console.log(`${COLORS.bright}Tamanho dir:${COLORS.reset} ${verification.rootDirSize} bytes`);
    console.log(`${COLORS.bright}Offset:${COLORS.reset} 0x${verification.xboxDiscLseek.toString(16)}\n`);

    // Listagem
    if (showList || showTree) {
      console.log(`${COLORS.bright}Lendo conteúdo...${COLORS.reset}`);
      const files = extractXiso.listXisoSync(isoPath);

      if (showStats) {
        const fileCount = files.filter(f => f.type === 'file').length;
        const dirCount = files.filter(f => f.type === 'directory').length;
        const totalSize = files.reduce((sum, f) => sum + f.size, 0);

        console.log(`${COLORS.bright}Estatísticas:${COLORS.reset}`);
        console.log(`  Arquivos: ${fileCount}`);
        console.log(`  Diretórios: ${dirCount}`);
        console.log(`  Total de itens: ${files.length}`);
        console.log(`  Tamanho total: ${formatBytes(totalSize)}\n`);
      }

      if (showList) {
        console.log(`${COLORS.bright}Conteúdo completo:${COLORS.reset}\n`);
        files.forEach(item => {
          const icon = item.type === 'directory' ? '📁' : '📄';
          const size = item.type === 'file' ? ` ${COLORS.gray}(${formatBytes(item.size)})${COLORS.reset}` : '';
          console.log(`${icon} ${item.path}${size}`);
        });
      }

      if (showTree) {
        console.log(`${COLORS.bright}Estrutura de diretórios:${COLORS.reset}\n`);
        const buildTree = (items, prefix = '') => {
          const grouped = {};
          items.forEach(item => {
            const depth = (item.path.match(/\//g) || []).length;
            if (depth === Object.keys(grouped).length) {
              const last = item.path.split('/').pop();
              if (item.type === 'directory') {
                console.log(`${prefix}├── 📁 ${last}/`);
              } else {
                console.log(`${prefix}├── 📄 ${last} ${COLORS.gray}(${formatBytes(item.size)})${COLORS.reset}`);
              }
            }
          });
        };

        buildTree(files);
      }
    } else if (!showStats) {
      // Estatísticas por padrão
      const files = extractXiso.listXisoSync(isoPath);
      const fileCount = files.filter(f => f.type === 'file').length;
      const dirCount = files.filter(f => f.type === 'directory').length;
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);

      console.log(`${COLORS.bright}Estatísticas:${COLORS.reset}`);
      console.log(`  Arquivos: ${fileCount}`);
      console.log(`  Diretórios: ${dirCount}`);
      console.log(`  Total de itens: ${files.length}`);
      console.log(`  Tamanho total: ${formatBytes(totalSize)}\n`);
    }

    console.log(`${COLORS.green}✓ Análise concluída!${COLORS.reset}\n`);
  } catch (error) {
    console.error(`${COLORS.red}Erro: ${error.message}${COLORS.reset}\n`);
    process.exit(1);
  }
}

main();

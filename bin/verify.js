#!/usr/bin/env node

/**
 * Script de Verificação e Testes
 * Valida se o ambiente está configurado corretamente
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

function test(name, fn) {
  try {
    fn();
    console.log(`${COLORS.green}✓${COLORS.reset} ${name}`);
    return true;
  } catch (error) {
    console.log(`${COLORS.red}✗${COLORS.reset} ${name}: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log(`\n${COLORS.cyan}${COLORS.bright}=== Verificação do Ambiente ===${COLORS.reset}\n`);

  let passed = 0;
  let failed = 0;

  // 1. Verificar Node.js
  if (test('Node.js detectado', () => {
    if (process.version < 'v14.0.0') throw new Error('Node.js 14+ requerido');
  })) passed += 1; else failed += 1;

  // 2. Verificar módulos
  if (test('Módulo "fs" disponível', () => {
    require('fs');
  })) passed += 1; else failed += 1;

  if (test('Módulo "path" disponível', () => {
    require('path');
  })) passed += 1; else failed += 1;

  if (test('Módulo "worker_threads" disponível', () => {
    require('worker_threads');
  })) passed += 1; else failed += 1;

  // 3. Verificar estrutura de pastas
  const projectDir = path.resolve(__dirname, '..');
  
  if (test('Pasta do projeto acessível', () => {
    if (!fs.existsSync(projectDir)) throw new Error('Pasta não encontrada');
  })) passed += 1; else failed += 1;

  if (test('Arquivo index.js existe', () => {
    const indexPath = path.join(projectDir, 'index.js');
    if (!fs.existsSync(indexPath)) throw new Error('index.js não encontrado');
  })) passed += 1; else failed += 1;

  if (test('Arquivo bin/extract.js existe', () => {
    const extractPath = path.join(projectDir, 'bin', 'extract.js');
    if (!fs.existsSync(extractPath)) throw new Error('bin/extract.js não encontrado');
  })) passed += 1; else failed += 1;

  if (test('Arquivo worker.js existe', () => {
    const workerPath = path.join(projectDir, 'worker.js');
    if (!fs.existsSync(workerPath)) throw new Error('worker.js não encontrado');
  })) passed += 1; else failed += 1;

  // 4. Verificar pastas de dados
  const isoDir = path.join(projectDir, 'iso');
  const outputDir = path.join(projectDir, 'output');

  if (test('Pasta "iso" existe', () => {
    if (!fs.existsSync(isoDir)) {
      fs.mkdirSync(isoDir, { recursive: true });
    }
  })) passed += 1; else failed += 1;

  if (test('Pasta "output" existe', () => {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  })) passed += 1; else failed += 1;

  // 5. Testar módulo de extração
  if (test('Módulo extractXiso carregável', () => {
    const extractXiso = require('../index');
    if (!extractXiso.listXisoSync) throw new Error('listXisoSync não encontrado');
    if (!extractXiso.extractXisoSync) throw new Error('extractXisoSync não encontrado');
    if (!extractXiso.verifyXisoSync) throw new Error('verifyXisoSync não encontrado');
  })) passed += 1; else failed += 1;

  // 6. Verificar ambiente do sistema
  console.log(`\n${COLORS.cyan}${COLORS.bright}=== Informações do Sistema ===${COLORS.reset}\n`);

  console.log(`${COLORS.bright}Node.js:${COLORS.reset} ${process.version}`);
  console.log(`${COLORS.bright}NPM:${COLORS.reset} ${require('child_process').execSync('npm --version').toString().trim()}`);
  console.log(`${COLORS.bright}Plataforma:${COLORS.reset} ${process.platform} (${process.arch})`);
  console.log(`${COLORS.bright}Processadores:${COLORS.reset} ${os.cpus().length} núcleos`);
  console.log(`${COLORS.bright}Modelo CPU:${COLORS.reset} ${os.cpus()[0].model}`);
  console.log(`${COLORS.bright}Memória RAM:${COLORS.reset} ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`);
  console.log(`${COLORS.bright}Memória Livre:${COLORS.reset} ${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB`);

  // 7. Verificar ISOs
  console.log(`\n${COLORS.cyan}${COLORS.bright}=== Procurando ISOs ===${COLORS.reset}\n`);

  const isoFiles = fs.readdirSync(isoDir).filter(f => f.endsWith('.xiso'));
  if (isoFiles.length === 0) {
    console.log(`${COLORS.yellow}⚠${COLORS.reset}  Nenhum arquivo .xiso encontrado em ${isoDir}`);
    console.log(`${COLORS.yellow}   Coloque seus arquivos .xiso nessa pasta para testar.${COLORS.reset}`);
  } else {
    console.log(`${COLORS.green}✓${COLORS.reset}  Encontrados ${isoFiles.length} arquivo(s) XISO:`);
    isoFiles.forEach(file => {
      const size = fs.statSync(path.join(isoDir, file)).size;
      const sizeGB = (size / 1024 / 1024 / 1024).toFixed(2);
      console.log(`   - ${file} (${sizeGB} GB)`);
    });
  }

  // 8. Resumo
  console.log(`\n${COLORS.cyan}${COLORS.bright}=== Resultado ===${COLORS.reset}\n`);

  const total = passed + failed;
  const percentage = ((passed / total) * 100).toFixed(0);

  console.log(`${COLORS.bright}Testes Passados:${COLORS.reset} ${COLORS.green}${passed}/${total}${COLORS.reset}`);

  if (failed > 0) {
    console.log(`${COLORS.bright}Testes Falhados:${COLORS.reset} ${COLORS.red}${failed}/${total}${COLORS.reset}`);
  }

  console.log(`${COLORS.bright}Taxa de Sucesso:${COLORS.reset} ${percentage}%`);

  if (percentage === '100') {
    console.log(`\n${COLORS.green}${COLORS.bright}✓ Ambiente verificado! Pronto para extrair ISOs.${COLORS.reset}`);
    console.log(`${COLORS.cyan}Execute: node bin/extract.js${COLORS.reset}\n`);
    return 0;
  } else {
    console.log(`\n${COLORS.red}${COLORS.bright}✗ Alguns testes falharam. Verifique acima.${COLORS.reset}\n`);
    return 1;
  }
}

main().then(code => process.exit(code)).catch(err => {
  console.error(`${COLORS.red}Erro fatal:${COLORS.reset} ${err.message}`);
  process.exit(1);
});

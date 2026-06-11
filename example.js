/**
 * Exemplo de uso da API extract-xiso-node
 * 
 * Demonstra como usar o módulo como biblioteca em aplicações Node.js
 */

const path = require('path');
const fs = require('fs');
const extractXiso = require('./index');

async function example() {
  console.log('=== Extract-XISO API Examples ===\n');

  // Exemplo 1: Verificar se um ISO é válido
  console.log('--- Exemplo 1: Verificar ISO ---');
  try {
    const isoPath = path.join(__dirname, 'iso', 'example.xiso');
    
    if (fs.existsSync(isoPath)) {
      const verification = extractXiso.verifyXisoSync(isoPath);
      console.log(`✓ ISO válido!`);
      console.log(`  - Setor raiz: ${verification.rootDirSector}`);
      console.log(`  - Tamanho dir: ${verification.rootDirSize} bytes`);
      console.log(`  - Offset: ${verification.xboxDiscLseek}`);
    } else {
      console.log(`✗ Arquivo não encontrado: ${isoPath}`);
    }
  } catch (error) {
    console.log(`✗ Erro: ${error.message}`);
  }

  console.log('\n--- Exemplo 2: Listar arquivos ---');
  try {
    const isoPath = path.join(__dirname, 'iso', 'example.xiso');
    
    if (fs.existsSync(isoPath)) {
      const files = extractXiso.listXisoSync(isoPath);
      console.log(`✓ Encontrados ${files.length} itens:`);
      
      // Mostrar primeiros 5 itens
      files.slice(0, 5).forEach((item, idx) => {
        const icon = item.type === 'directory' ? '📁' : '📄';
        console.log(`  ${icon} ${item.path} (${item.size} bytes)`);
      });
      
      if (files.length > 5) {
        console.log(`  ... e mais ${files.length - 5} itens`);
      }
    } else {
      console.log(`✗ Arquivo não encontrado: ${isoPath}`);
    }
  } catch (error) {
    console.log(`✗ Erro: ${error.message}`);
  }

  console.log('\n--- Exemplo 3: Extrair ISO (Async) ---');
  try {
    const isoPath = path.join(__dirname, 'iso', 'example.xiso');
    
    if (fs.existsSync(isoPath)) {
      console.log('Iniciando extração...');
      
      // Configurar callback de progresso
      extractXiso.setProgressCallback((progress) => {
        if (progress.type === 'start') {
          console.log(`  → Iniciando: ${path.basename(progress.file)}`);
        } else if (progress.type === 'complete') {
          console.log(`  ✓ Concluído: ${path.basename(progress.file)}`);
        } else if (progress.type === 'error') {
          console.log(`  ✗ Erro: ${progress.error}`);
        }
      });

      const result = await extractXiso.extractXisoParallel(
        isoPath,
        path.join(__dirname, 'output', 'example'),
        { skipSystemUpdate: false }
      );

      console.log(`✓ Extração concluída!`);
      console.log(`  - Pasta: ${result.outputDir}`);
      console.log(`  - Itens: ${result.items.length}`);
    } else {
      console.log(`✗ Arquivo não encontrado: ${isoPath}`);
    }
  } catch (error) {
    console.log(`✗ Erro: ${error.message}`);
  }

  console.log('\n--- Exemplo 4: Extrair múltiplos ISOs ---');
  try {
    const isoDir = path.join(__dirname, 'iso');
    
    if (fs.existsSync(isoDir)) {
      const files = fs.readdirSync(isoDir)
        .filter(f => f.endsWith('.xiso'))
        .map(f => path.join(isoDir, f));

      if (files.length === 0) {
        console.log(`✗ Nenhum arquivo .xiso encontrado em ${isoDir}`);
      } else {
        console.log(`Encontrados ${files.length} arquivo(s).`);
        
        // Configurar callback
        extractXiso.setProgressCallback((progress) => {
          console.log(
            `[${progress.index}/${progress.total}] ${progress.type}: ${path.basename(progress.file)}`
          );
        });

        // Extrair todos em paralelo
        const results = await extractXiso.extractMultipleXisos(
          files,
          path.join(__dirname, 'output'),
          { skipSystemUpdate: false }
        );

        console.log(`\n✓ Todos os ISOs extraídos!`);
        console.log(`  - Total de ISOs: ${results.length}`);
      }
    } else {
      console.log(`✗ Pasta não encontrada: ${isoDir}`);
    }
  } catch (error) {
    console.log(`✗ Erro: ${error.message}`);
  }

  console.log('\n--- Informações do Sistema ---');
  console.log(`  - CPU Cores: ${extractXiso.getOptimalWorkerCount()}`);
  console.log(`  - Node.js: ${process.version}`);
  console.log(`  - Platform: ${process.platform}`);
  console.log(`  - Arch: ${process.arch}`);
  console.log('');
}

// Executar exemplo
example().catch(console.error);

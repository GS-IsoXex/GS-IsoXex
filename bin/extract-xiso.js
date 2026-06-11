#!/usr/bin/env node

const path = require('path');
const { listXisoSync, extractXisoSync } = require('../index');

function printUsage() {
  console.log('Usage: extract-xiso-node [-l] [-d <directory>] [-s] <image.xiso>');
  console.log('  -l             List files inside the XISO');
  console.log('  -d <directory> Output directory for extraction');
  console.log('  -s             Skip $SystemUpdate folder');
}

function main() {
  const argv = process.argv.slice(2);
  let mode = 'extract';
  let destination = null;
  let skipSystemUpdate = false;
  const paths = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-l') {
      mode = 'list';
    } else if (arg === '-d') {
      destination = argv[++i];
    } else if (arg === '-s') {
      skipSystemUpdate = true;
    } else if (arg === '-h' || arg === '--help') {
      printUsage();
      return;
    } else {
      paths.push(arg);
    }
  }

  if (paths.length !== 1) {
    printUsage();
    process.exit(1);
  }

  const isoPath = path.resolve(process.cwd(), paths[0]);

  try {
    if (mode === 'list') {
      const items = listXisoSync(isoPath, { skipSystemUpdate });
      items.forEach((item) => {
        console.log(`${item.type.toUpperCase()}: ${item.path}${item.type === 'file' ? ` (${item.size} bytes)` : ''}`);
      });
    } else {
      const result = extractXisoSync(isoPath, destination, { skipSystemUpdate });
      console.log(`Extracted ${result.items.length} entries to ${result.outputDir}`);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();

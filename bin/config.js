const fs = require('fs');
const path = require('path');

const configPath = path.resolve(__dirname, '../config.json');
const defaults = {
  isoDir: 'iso',
  outputDir: 'iso',
  deleteSystemUpdate: false,
  deleteIsoAfterExtract: false,
};

function readConfig() {
  if (!fs.existsSync(configPath)) {
    return { ...defaults };
  }

  const data = fs.readFileSync(configPath, 'utf8');
  try {
    return { ...defaults, ...JSON.parse(data) };
  } catch (error) {
    console.error(`Erro ao ler config.json: ${error.message}`);
    process.exit(1);
  }
}

function writeConfig(config) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === '--help') {
  console.log('Usage: node bin/config.js --init');
  console.log('       node bin/config.js --get');
  console.log('       node bin/config.js --set <key> <value>');
  console.log('       node bin/config.js --reset');
  process.exit(0);
}

if (command === '--init') {
  if (!fs.existsSync(configPath)) {
    writeConfig(defaults);
  }
  process.exit(0);
}

if (command === '--get') {
  const config = readConfig();
  console.log(`ISO_DIR=${config.isoDir}`);
  console.log(`OUTPUT_DIR=${config.outputDir}`);
  console.log(`DELETE_SYSTEM_UPDATE=${config.deleteSystemUpdate}`);
  console.log(`DELETE_ISO_AFTER_EXTRACT=${config.deleteIsoAfterExtract}`);
  process.exit(0);
}

if (command === '--set') {
  const key = args[1];
  const value = args.slice(2).join(' ').trim();
  if (!key) {
    console.error('Chave obrigatória para --set.');
    process.exit(1);
  }
  const config = readConfig();
  if (!Object.prototype.hasOwnProperty.call(defaults, key)) {
    console.error(`Chave desconhecida: ${key}`);
    process.exit(1);
  }
  if (typeof defaults[key] === 'boolean') {
    config[key] = /^(true|1|yes)$/i.test(value);
  } else {
    config[key] = value || defaults[key];
  }
  writeConfig(config);
  process.exit(0);
}

if (command === '--reset') {
  writeConfig(defaults);
  process.exit(0);
}

console.error(`Comando desconhecido: ${command}`);
process.exit(1);

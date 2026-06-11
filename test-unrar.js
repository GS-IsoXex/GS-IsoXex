(async ()=>{
  const path = require('path');
  const fs = require('fs');
  try{
    const { unrar, unrarSync } = require('unrar.js');
    const archive = path.resolve(__dirname, 'iso', "Dante's Inferno (USA) (En,Fr,Es).rar");
    const out = path.resolve(__dirname, 'tmp-unrar-test');
    console.log('archive:', archive);
    if(!fs.existsSync(archive)){
      console.error('Archive not found:', archive);
      process.exit(2);
    }
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });
    console.log('Calling unrar.js...');
    await unrar(archive, out);
    console.log('Extraction finished. Listing extracted files:');
    const list = fs.readdirSync(out);
    console.log(list.slice(0,20));
  }catch(e){
    console.error('Error using unrar.js:', e && e.message ? e.message : e);
    if(e && e.stack) console.error(e.stack);
    process.exit(1);
  }
})();
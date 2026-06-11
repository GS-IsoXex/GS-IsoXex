const https = require('https');
const http = require('http');
const fs = require('fs');
const { spawnSync } = require('child_process');
const path = require('path');

const urls = [
  'https://www.rarlab.com/rar/unrarw64.exe',
  'https://www.rarlab.com/rar/unrarx64.exe',
  'https://www.rarlab.com/rar/unrar.exe',
  'https://www.rarlab.com/rar/UnRAR.exe'
];

const toolsDir = path.join(__dirname, '..', 'tools');
fs.mkdirSync(toolsDir, { recursive: true });

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, (res) => {
      if (res.statusCode >= 300 && res.headers.location) {
        // follow redirect
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', (err) => { try { fs.unlinkSync(dest); } catch (e) {} ; reject(err); });
    }).on('error', reject);
    req.setTimeout(30000, () => { req.abort(); reject(new Error('timeout')); });
  });
}

(async () => {
  for (const u of urls) {
    console.log('Trying', u);
    const dest = path.join(toolsDir, 'unrar_cand.exe');
    try {
      await download(u, dest);
      const size = fs.statSync(dest).size;
      console.log('Downloaded size:', size);
      let res = spawnSync(dest, ['--help'], { encoding: 'utf8', windowsHide: true, maxBuffer: 20 * 1024 * 1024 });
      let out = (res.stdout || '') + (res.stderr || '');
      if (!out) {
        res = spawnSync(dest, [], { encoding: 'utf8', windowsHide: true, maxBuffer: 20 * 1024 * 1024 });
        out = (res.stdout || '') + (res.stderr || '');
      }
      if (/Usage|unrar|UNRAR|List of commands|Usage:/i.test(out)) {
        const final = path.join(toolsDir, 'UnRAR.exe');
        fs.renameSync(dest, final);
        console.log('Saved', final, 'from', u);
        process.exit(0);
      } else {
        console.log('Candidate not CLI (help not detected). Deleting');
        try { fs.unlinkSync(dest); } catch (e) {}
      }
    } catch (err) {
      console.log('Failed to download or run:', err.message);
      try { fs.unlinkSync(dest); } catch (e) {}
    }
  }
  console.log('No working CLI found. See tools/README-unrar.md');
  process.exit(1);
})();

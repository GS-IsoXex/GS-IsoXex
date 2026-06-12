#!/usr/bin/env node
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const pkgPath = path.join(projectRoot, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const repoOwner = 'GS-IsoXex';
const repoName = 'GS-IsoXex';
const githubApiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`;
const repoUrl = `https://github.com/${repoOwner}/${repoName}`;
const userAgent = `${pkg.name}/${pkg.version}`;

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': userAgent,
        Accept: 'application/vnd.github.v3+json',
      },
    }, (res) => {
      let data = '';
      if (res.statusCode !== 200) {
        reject(new Error(`GitHub API returned ${res.statusCode}`));
        return;
      }
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': userAgent,
        Accept: 'application/octet-stream',
      },
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed: HTTP ${res.statusCode}`));
        return;
      }
      const fileStream = fs.createWriteStream(destination);
      res.pipe(fileStream);
      fileStream.on('finish', () => fileStream.close(resolve));
      fileStream.on('error', reject);
    });

    req.on('error', reject);
    req.end();
  });
}

function stripVersion(value) {
  return String(value || '').replace(/^v/i, '');
}

function compareSemver(a, b) {
  const left = stripVersion(a).split('.').map((v) => Number(v) || 0);
  const right = stripVersion(b).split('.').map((v) => Number(v) || 0);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const aNum = left[i] || 0;
    const bNum = right[i] || 0;
    if (aNum < bNum) return -1;
    if (aNum > bNum) return 1;
  }
  return 0;
}

function hasGit() {
  try {
    const result = spawnSync('git', ['--version'], { stdio: 'ignore' });
    return result.status === 0;
  } catch (error) {
    return false;
  }
}

function gitPull() {
  try {
    const result = spawnSync('git', ['pull', '--ff-only'], {
      cwd: projectRoot,
      stdio: 'inherit',
    });
    return result.status === 0;
  } catch (error) {
    return false;
  }
}

function extractZip(zipPath, extractDir) {
  const command = `Expand-Archive -LiteralPath \"${zipPath}\" -DestinationPath \"${extractDir}\" -Force`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8' });
  if (result.status !== 0) {
    const message = result.stderr || result.stdout || 'Expand-Archive failed';
    throw new Error(message.trim());
  }
}

function copyDirectory(src, dest) {
  const stat = fs.lstatSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    for (const entry of fs.readdirSync(src)) {
      if (entry === '.git') continue;
      const sourcePath = path.join(src, entry);
      const destPath = path.join(dest, entry);
      copyDirectory(sourcePath, destPath);
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

async function getRepoDefaultBranch() {
  const repoInfo = await httpsGetJson(`https://api.github.com/repos/${repoOwner}/${repoName}`);
  return repoInfo.default_branch || 'main';
}

async function fetchRemotePackageJson(defaultBranch) {
  const contentUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/package.json?ref=${defaultBranch}`;
  const fileInfo = await httpsGetJson(contentUrl);
  if (fileInfo && fileInfo.content) {
    const decoded = Buffer.from(fileInfo.content, fileInfo.encoding || 'base64').toString('utf8');
    return JSON.parse(decoded);
  }
  throw new Error('Unable to fetch remote package.json.');
}

async function getLatestRelease() {
  let release;
  try {
    release = await httpsGetJson(githubApiUrl);
  } catch (error) {
    if (error.message.includes('404')) {
      return null;
    }
    throw error;
  }

  const tagName = release.tag_name || release.name || '';
  const zipballUrl = release.zipball_url || `${repoUrl}/archive/refs/tags/${tagName}.zip`;
  const htmlUrl = release.html_url || repoUrl;
  return {
    tagName,
    remoteVersion: stripVersion(tagName),
    zipballUrl,
    htmlUrl,
    source: 'release',
  };
}

async function getLatestRemoteVersion() {
  const release = await getLatestRelease();
  if (release) {
    return release;
  }

  const defaultBranch = await getRepoDefaultBranch();
  const remotePkg = await fetchRemotePackageJson(defaultBranch);
  const remoteVersion = stripVersion(remotePkg.version || '0.0.0');
  return {
    tagName: remoteVersion,
    remoteVersion,
    zipballUrl: `${repoUrl}/archive/refs/heads/${defaultBranch}.zip`,
    htmlUrl: `${repoUrl}/tree/${defaultBranch}`,
    source: 'branch',
  };
}

async function checkUpdate() {
  const release = await getLatestRemoteVersion();
  const localVersion = pkg.version;
  const compareResult = compareSemver(localVersion, release.remoteVersion);
  const updateAvailable = compareResult < 0 ? '1' : '0';
  console.log(`CHECK|${localVersion}|${release.remoteVersion}|${updateAvailable}|${release.htmlUrl}`);
}

async function performUpdate() {
  const release = await getLatestRelease();
  const localVersion = pkg.version;
  if (compareSemver(localVersion, release.remoteVersion) >= 0) {
    console.log(`LATEST|${localVersion}|${release.remoteVersion}`);
    return;
  }

  if (fs.existsSync(path.join(projectRoot, '.git')) && hasGit()) {
    if (gitPull()) {
      console.log(`UPDATED|git|${release.remoteVersion}`);
      return;
    }
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-isoxex-update-'));
  const zipPath = path.join(tempDir, 'gs-isoxex.zip');
  const extractDir = path.join(tempDir, 'source');

  await downloadFile(release.zipballUrl, zipPath);
  fs.mkdirSync(extractDir, { recursive: true });
  extractZip(zipPath, extractDir);

  const extractedEntries = fs.readdirSync(extractDir).filter((name) => name !== '.DS_Store');
  if (extractedEntries.length !== 1) {
    throw new Error('Estrutura inesperada do package extraído.');
  }

  const sourceRoot = path.join(extractDir, extractedEntries[0]);
  copyDirectory(sourceRoot, projectRoot);
  console.log(`UPDATED|zip|${release.remoteVersion}`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] === '--update' ? 'update' : 'check';

  try {
    if (command === 'update') {
      await performUpdate();
      process.exit(0);
    }
    await checkUpdate();
    process.exit(0);
  } catch (error) {
    console.error(`ERROR|${error.message.replace(/\r?\n/g, ' ')}`);
    process.exit(1);
  }
}

main();

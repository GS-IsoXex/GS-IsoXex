const fs = require('fs');
const path = require('path');
const os = require('os');
const { Worker } = require('worker_threads');

const XISO_HEADER_OFFSET = 0x10000;
const XISO_HEADER_DATA = Buffer.from('MICROSOFT*XBOX*MEDIA', 'ascii');
const XISO_HEADER_DATA_LENGTH = 20;
const GLOBAL_LSEEK_OFFSET = 0x0fd90000;
const XGD3_LSEEK_OFFSET = 0x02080000;
const XGD1_LSEEK_OFFSET = 0x18300000;
const XISO_SECTOR_SIZE = 2048;
const XISO_FILETIME_SIZE = 8;
const XISO_UNUSED_SIZE = 0x7c8;
const XISO_TABLE_OFFSET_SIZE = 2;
const XISO_SECTOR_OFFSET_SIZE = 4;
const XISO_DIRTABLE_SIZE = 4;
const XISO_FILESIZE_SIZE = 4;
const XISO_ATTRIBUTES_SIZE = 1;
const XISO_FILENAME_LENGTH_SIZE = 1;
const XISO_PAD_SHORT = 0xffff;
const XISO_ATTRIBUTE_DIR = 0x10;
const XISO_DWORD_SIZE = 4;
const READWRITE_BUFFER_SIZE = 0x00200000;
const CHUNK_SIZE = 0x01000000; // 16 MB

let progressCallback = null;
let lastProgressUpdate = 0;

function readBufferSync(fd, size, position) {
  const buffer = Buffer.alloc(size);
  const bytes = fs.readSync(fd, buffer, 0, size, position);
  if (bytes !== size) {
    throw new Error(`Unable to read ${size} bytes from ISO at offset ${position}. Received ${bytes}.`);
  }
  return buffer;
}

function findHeaderOffset(fd, isoPath) {
  const buffer = readBufferSync(fd, XISO_HEADER_DATA_LENGTH, XISO_HEADER_OFFSET);
  if (buffer.equals(XISO_HEADER_DATA)) {
    return XISO_HEADER_OFFSET;
  }

  const candidates = [
    XISO_HEADER_OFFSET + GLOBAL_LSEEK_OFFSET,
    XISO_HEADER_OFFSET + XGD3_LSEEK_OFFSET,
    XISO_HEADER_OFFSET + XGD1_LSEEK_OFFSET,
  ];

  for (const offset of candidates) {
    const candidate = readBufferSync(fd, XISO_HEADER_DATA_LENGTH, offset);
    if (candidate.equals(XISO_HEADER_DATA)) {
      return offset;
    }
  }

  throw new Error(`${isoPath} does not appear to be a valid Xbox XISO image.`);
}

function verifyXisoSync(isoPath) {
  const fd = fs.openSync(isoPath, 'r');
  try {
    const headerOffset = findHeaderOffset(fd, isoPath);
    const basePosition = headerOffset + XISO_HEADER_DATA_LENGTH;

    const sectorBuffer = readBufferSync(fd, XISO_SECTOR_OFFSET_SIZE, basePosition);
    const dirSizeBuffer = readBufferSync(fd, XISO_DIRTABLE_SIZE, basePosition + XISO_SECTOR_OFFSET_SIZE);

    const rootDirSector = sectorBuffer.readUInt32LE(0);
    const rootDirSize = dirSizeBuffer.readUInt32LE(0);

    const verifyPosition = basePosition + XISO_SECTOR_OFFSET_SIZE + XISO_DIRTABLE_SIZE + XISO_FILETIME_SIZE + XISO_UNUSED_SIZE;
    const verifyBuffer = readBufferSync(fd, XISO_HEADER_DATA_LENGTH, verifyPosition);
    if (!verifyBuffer.equals(XISO_HEADER_DATA)) {
      throw new Error(`${isoPath} appears to be corrupt or not a valid Xbox XISO.`);
    }

    return {
      fd,
      rootDirSector,
      rootDirSize,
      xboxDiscLseek: headerOffset - XISO_HEADER_OFFSET,
    };
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
}

function sanitizeXisoFilename(filename) {
  if (typeof filename !== 'string') {
    return '';
  }

  return filename
    .replace(/\0/g, '')
    .replace(/\uFFFD/g, '')
    .replace(/[\\/<>:"|?*]/g, '_')
    .replace(/[\x00-\x1F\x7F-\xFF]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function decodeXisoFilename(buffer) {
  if (!Buffer.isBuffer(buffer)) return '';

  // Heuristic: if many zero bytes are present, it's likely UTF-16LE
  let zeroCount = 0;
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === 0) zeroCount++;
  }
  const zeroRatio = buffer.length > 0 ? zeroCount / buffer.length : 0;
  try {
    let result;
    if (zeroRatio > 0.3 && buffer.length % 2 === 0) {
      result = buffer.toString('utf16le').replace(/\0/g, '');
    } else {
      const latin = buffer.toString('latin1');
      if (latin.includes('\uFFFD')) {
        result = buffer.toString('utf8').replace(/\0/g, '');
      } else {
        result = latin;
      }
    }

    // If the decoded result has non-ASCII garbage, try to recover
    // by finding the first valid printable ASCII segment in the raw buffer
    if (/[\x7F-\xFF]/.test(result)) {
      const recovered = recoverAsciiFilename(buffer);
      if (recovered) return recovered;
    }

    return result;
  } catch (e) {
    try { return buffer.toString('utf8').replace(/\0/g, ''); } catch (ee) { return buffer.toString('latin1').replace(/\0/g, ''); }
  }
}

function recoverAsciiFilename(buffer) {
  // Find the longest leading sequence of printable ASCII bytes
  // (0x20-0x7E), stopping at NUL, 0xFF padding, or non-printable bytes
  let validEnd = 0;
  for (let i = 0; i < buffer.length; i++) {
    const b = buffer[i];
    if (b >= 0x20 && b <= 0x7E) {
      validEnd = i + 1;
    } else if (b === 0 || b === 0xFF) {
      break;
    } else {
      // non-printable, non-padding byte; stop here
      break;
    }
  }
  if (validEnd > 0) {
    return buffer.slice(0, validEnd).toString('latin1');
  }
  return null;
}

function validateFilename(filename) {
  if (!filename || filename === '.' || filename === '..' || filename.includes('/') || filename.includes('\\')) {
    throw new Error(`Invalid filename in XISO: ${filename}`);
  }
}

function extractFileSync(fd, startSector, size, outputDir, itemPath, xboxDiscLseek) {
  const outPath = path.join(outputDir, itemPath);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  if (progressCallback) {
    progressCallback({
      type: 'fileStart',
      path: itemPath,
      outputPath: outPath,
      size,
    });
  }

  const fileFd = fs.openSync(outPath, 'w');
  try {
    let remaining = size;
    let offset = startSector * XISO_SECTOR_SIZE + xboxDiscLseek;
    const buffer = Buffer.alloc(Math.min(READWRITE_BUFFER_SIZE, remaining || 1));
    let extracted = 0;

    while (remaining > 0) {
      const toRead = Math.min(buffer.length, remaining);
      const bytesRead = fs.readSync(fd, buffer, 0, toRead, offset);
      if (bytesRead <= 0) {
        throw new Error(`Truncated file while extracting ${itemPath}. Expected ${size}, read ${size - remaining}.`);
      }
      fs.writeSync(fileFd, buffer, 0, bytesRead);
      extracted += bytesRead;
      remaining -= bytesRead;
      offset += bytesRead;

      if (progressCallback && size > 0) {
        progressCallback({
          type: 'fileProgress',
          path: itemPath,
          outputPath: outPath,
          size,
          extracted,
          percent: Math.round((extracted / size) * 100),
        });
      }
    }

    if (progressCallback) {
      progressCallback({
        type: 'fileComplete',
        path: itemPath,
        outputPath: outPath,
        size,
      });
    }
  } finally {
    fs.closeSync(fileFd);
  }
}

function traverseDirectorySync(fd, dirStart, currentPath, opts, results) {
  const isoSize = fs.fstatSync(fd).size;

  function isInBounds(offset, size) {
    return offset >= 0 && size >= 0 && offset + size <= isoSize;
  }

  // Manual stack for in-order BST traversal within a single directory.
  // When a left child is found, save the current entry+right-sibling info
  // on the stack, then descend to the left child position.
  // When a subtree is exhausted, pop from stack and process the deferred entry.
  function processEntry(entry, itemPath) {
    const skipSU = opts.skipSystemUpdate && itemPath.toLowerCase().includes('$systemupdate');
    if (skipSU) return;

    if (entry.attributes & XISO_ATTRIBUTE_DIR) {
      const dirOffset = entry.startSector * XISO_SECTOR_SIZE + opts.xboxDiscLseek;
      if (isInBounds(dirOffset, XISO_SECTOR_SIZE)) {
        if (opts.mode === 'extract') {
          fs.mkdirSync(path.join(opts.outputDir, itemPath), { recursive: true });
        }
        results.push({ type: 'directory', path: itemPath, size: 0 });
        traverseDirectorySync(fd, dirOffset, itemPath, opts, results);
      }
    } else {
      if (opts.mode === 'extract') {
        extractFileSync(fd, entry.startSector, entry.fileSize, opts.outputDir, itemPath, opts.xboxDiscLseek);
      }
      results.push({ type: 'file', path: itemPath, size: entry.fileSize, startSector: entry.startSector });
    }
  }

  const stack = [];
  let pos = dirStart;
  let curPath = currentPath;
  let lOffset = 0;

  outer:
  while (true) {
    while (true) {
      if (!isInBounds(pos, XISO_TABLE_OFFSET_SIZE)) {
        break outer;
      }

      const tmpBuffer = readBufferSync(fd, XISO_TABLE_OFFSET_SIZE, pos);
      let tmp = tmpBuffer.readUInt16LE(0);
      pos += XISO_TABLE_OFFSET_SIZE;

      if (tmp === XISO_PAD_SHORT) {
        if (lOffset === 0) {
          break;
        }

        const offsetBytes = lOffset * XISO_DWORD_SIZE;
        const pad = (XISO_SECTOR_SIZE - (offsetBytes % XISO_SECTOR_SIZE)) % XISO_SECTOR_SIZE;
        lOffset = offsetBytes + pad;
        const newPos = dirStart + lOffset;
        if (!isInBounds(newPos, XISO_TABLE_OFFSET_SIZE)) {
          break;
        }
        pos = newPos;
        continue;
      }

      const leftOffset = tmp;
      const entrySize = XISO_TABLE_OFFSET_SIZE + XISO_SECTOR_OFFSET_SIZE + XISO_FILESIZE_SIZE + XISO_ATTRIBUTES_SIZE + XISO_FILENAME_LENGTH_SIZE;
      if (!isInBounds(pos, entrySize)) {
        break;
      }
      const entryBuffer = readBufferSync(fd, entrySize, pos);

      const rOffset = entryBuffer.readUInt16LE(0);
      const startSector = entryBuffer.readUInt32LE(2);
      const fileSize = entryBuffer.readUInt32LE(6);
      const attributes = entryBuffer.readUInt8(10);
      let filenameLength = entryBuffer.readUInt8(11);

      pos += entrySize;
      if (filenameLength > 255 || !isInBounds(pos, filenameLength)) {
        filenameLength = 0;
      }
      let filename = '';
      if (filenameLength > 0) {
        const nameBuffer = readBufferSync(fd, filenameLength, pos);
        filename = decodeXisoFilename(nameBuffer);
      }
      pos += filenameLength;

      filename = sanitizeXisoFilename(filename);

      if (!filename || filename === '.' || filename === '..') {
        if (rOffset !== 0) {
          pos = dirStart + rOffset * XISO_DWORD_SIZE;
          lOffset = rOffset;
          continue;
        }
        break;
      }

      validateFilename(filename);

      if (leftOffset !== 0) {
        const leftPos = dirStart + leftOffset * XISO_DWORD_SIZE;
        if (isInBounds(leftPos, XISO_TABLE_OFFSET_SIZE)) {
          // Defer entry + right siblings; descend into left child
          stack.push({
            rOffset,
            startSector,
            fileSize,
            attributes,
            filename,
            path: curPath,
          });
          pos = leftPos;
          lOffset = 0;
          continue outer;
        }
      }

      const itemPath = curPath ? path.join(curPath, filename) : filename;
      processEntry({ startSector, fileSize, attributes }, itemPath);

      if (rOffset !== 0) {
        pos = dirStart + rOffset * XISO_DWORD_SIZE;
        lOffset = rOffset;
        continue;
      }

      break;
    }

    // No more entries at this level; process deferred entries from stack
    while (stack.length > 0) {
      const entry = stack.pop();
      const itemPath = entry.path ? path.join(entry.path, entry.filename) : entry.filename;
      processEntry(entry, itemPath);

      if (entry.rOffset !== 0) {
        pos = dirStart + entry.rOffset * XISO_DWORD_SIZE;
        lOffset = entry.rOffset;
        continue outer;
      }
    }

    break;
  }
}

function listXisoSync(isoPath, options = {}) {
  const verified = verifyXisoSync(isoPath);
  try {
    const rootDirStart = verified.rootDirSector * XISO_SECTOR_SIZE + verified.xboxDiscLseek;
    const results = [];

    traverseDirectorySync(verified.fd, rootDirStart, '', {
      mode: 'list',
      outputDir: null,
      xboxDiscLseek: verified.xboxDiscLseek,
      skipSystemUpdate: !!options.skipSystemUpdate,
    }, results);

    return results;
  } finally {
    fs.closeSync(verified.fd);
  }
}

function extractXisoSync(isoPath, destinationDir, options = {}) {
  const verified = verifyXisoSync(isoPath);
  try {
    let outputDir = destinationDir;
    if (!outputDir) {
      const name = path.basename(isoPath, path.extname(isoPath));
      outputDir = path.join(path.dirname(isoPath), name);
    }
    fs.mkdirSync(outputDir, { recursive: true });

    const results = [];
    const rootDirStart = verified.rootDirSector * XISO_SECTOR_SIZE + verified.xboxDiscLseek;

    traverseDirectorySync(verified.fd, rootDirStart, '', {
      mode: 'extract',
      outputDir,
      xboxDiscLseek: verified.xboxDiscLseek,
      skipSystemUpdate: !!options.skipSystemUpdate,
    }, results);

    return { outputDir, items: results };
  } finally {
    fs.closeSync(verified.fd);
  }
}

function setProgressCallback(callback) {
  progressCallback = callback;
}

function createWorkerPool(numWorkers = os.cpus().length) {
  const workers = [];
  const queue = [];
  const pending = new Map();
  const fileProgressState = new Map();

  function dispatch(workerObj, work) {
    workerObj.busy = true;
    pending.set(workerObj, work);
    workerObj.worker.postMessage(work.task);
  }

  function tryDispatch() {
    const idleWorker = workers.find((w) => !w.busy);
    if (!idleWorker || queue.length === 0) {
      return;
    }
    const work = queue.shift();
    dispatch(idleWorker, work);
  }

  function emitProgress(progress) {
    if (progress.type === 'chunkProgress') {
      const key = progress.path;
      const extracted = (fileProgressState.get(key) || 0) + progress.delta;
      fileProgressState.set(key, extracted);
      if (progressCallback) {
        progressCallback({
          type: 'fileProgress',
          path: progress.path,
          outputPath: progress.outputPath,
          size: progress.size,
          extracted,
          percent: Math.round((extracted / progress.size) * 100),
        });
      }
      return;
    }

    if (progressCallback) {
      progressCallback(progress);
    }
  }

  function createWorker(i) {
    const worker = new Worker(path.join(__dirname, 'worker.js'));
    const workerObj = { worker, busy: false };

    worker.on('message', (message) => {
      if (message.type === 'progress') {
        emitProgress(message.progress);
        return;
      }

      const work = pending.get(workerObj);
      if (!work) {
        return;
      }

      pending.delete(workerObj);
      workerObj.busy = false;

      if (message.type === 'done') {
        work.resolve(message.result);
      } else if (message.type === 'error') {
        work.reject(new Error(message.error));
      }

      tryDispatch();
    });

    worker.on('error', (error) => {
      const work = pending.get(workerObj);
      if (work) {
        pending.delete(workerObj);
        work.reject(error);
      }
      workerObj.busy = false;
      tryDispatch();
    });

    workers.push(workerObj);
  }

  for (let i = 0; i < numWorkers; i += 1) {
    createWorker(i);
  }

  return {
    execute: (task) => new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      tryDispatch();
    }),
    terminate: () => {
      workers.forEach((w) => w.worker.terminate());
    },
  };
}

async function extractXisoParallel(isoPath, destinationDir, options = {}) {
  const verified = verifyXisoSync(isoPath);
  try {
    let outputDir = destinationDir;
    if (!outputDir) {
      const name = path.basename(isoPath, path.extname(isoPath));
      outputDir = path.join(path.dirname(isoPath), name);
    }
    fs.mkdirSync(outputDir, { recursive: true });

    const entries = [];
    const rootDirStart = verified.rootDirSector * XISO_SECTOR_SIZE + verified.xboxDiscLseek;

    traverseDirectorySync(verified.fd, rootDirStart, '', {
      mode: 'list',
      outputDir: null,
      xboxDiscLseek: verified.xboxDiscLseek,
      skipSystemUpdate: !!options.skipSystemUpdate,
    }, entries);

    fs.closeSync(verified.fd);

    const directories = entries.filter((entry) => entry.type === 'directory');
    const files = entries.filter((entry) => entry.type === 'file');

    directories.forEach((entry) => {
      fs.mkdirSync(path.join(outputDir, entry.path), { recursive: true });
    });

    const numWorkers = options.numWorkers && options.numWorkers > 1 ? options.numWorkers : 1;

    if (numWorkers > 1 && files.length > 0) {
      const pool = createWorkerPool(numWorkers);
      const tasks = [];

      files.forEach((fileEntry) => {
        const outputPath = path.join(outputDir, fileEntry.path);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        const fileFd = fs.openSync(outputPath, 'w');
        try {
          fs.ftruncateSync(fileFd, fileEntry.size);
        } finally {
          fs.closeSync(fileFd);
        }

        if (fileEntry.size === 0) {
          tasks.push(Promise.resolve({ path: fileEntry.path, size: 0 }));
          return;
        }

        const chunkCount = Math.max(1, Math.ceil(fileEntry.size / CHUNK_SIZE));
        if (progressCallback) {
          progressCallback({
            type: 'fileStart',
            path: fileEntry.path,
            outputPath,
            size: fileEntry.size,
          });
        }

        for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
          const chunkOffset = chunkIndex * CHUNK_SIZE;
          const chunkLength = Math.min(CHUNK_SIZE, fileEntry.size - chunkOffset);
          tasks.push(pool.execute({
            isoPath,
            outputPath,
            itemPath: fileEntry.path,
            startSector: fileEntry.startSector,
            size: fileEntry.size,
            chunkOffset,
            chunkLength,
            xboxDiscLseek: verified.xboxDiscLseek,
          }));
        }
      });

      await Promise.all(tasks);
      if (progressCallback) {
        files.forEach((fileEntry) => {
          const outputPath = path.join(outputDir, fileEntry.path);
          progressCallback({
            type: 'fileComplete',
            path: fileEntry.path,
            outputPath,
            size: fileEntry.size,
          });
        });
      }
      pool.terminate();
    } else {
      const fd = fs.openSync(isoPath, 'r');
      try {
        files.forEach((fileEntry) => {
          extractFileSync(fd, fileEntry.startSector, fileEntry.size, outputDir, fileEntry.path, verified.xboxDiscLseek);
        });
      } finally {
        fs.closeSync(fd);
      }
    }

    return { outputDir, items: entries };
  } catch (error) {
    throw error;
  }
}

function extractMultipleXisos(isoPaths, baseOutputDir, options = {}) {
  return Promise.all(isoPaths.map((isoPath, idx) => {
    const dir = path.join(baseOutputDir, path.basename(isoPath, path.extname(isoPath)));
    if (progressCallback) {
      progressCallback({ type: 'start', file: isoPath, index: idx, total: isoPaths.length });
    }
    return extractXisoParallel(isoPath, dir, options)
      .then((result) => {
        if (progressCallback) {
          progressCallback({ type: 'complete', file: isoPath, index: idx, total: isoPaths.length, result });
        }
        return result;
      })
      .catch((error) => {
        if (progressCallback) {
          progressCallback({ type: 'error', file: isoPath, index: idx, total: isoPaths.length, error });
        }
        throw error;
      });
  }));
}

module.exports = {
  listXisoSync,
  extractXisoSync,
  extractXisoParallel,
  extractMultipleXisos,
  verifyXisoSync,
  setProgressCallback,
  createWorkerPool,
  getOptimalWorkerCount: () => os.cpus().length,
};

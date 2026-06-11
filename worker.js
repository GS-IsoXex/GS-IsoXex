const { parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');

const XISO_SECTOR_SIZE = 2048;

function sendProgress(progress) {
  parentPort.postMessage({ type: 'progress', progress });
}

function extractChunkTask(task) {
  const { isoPath, outputPath, itemPath, startSector, size, chunkOffset, chunkLength, xboxDiscLseek } = task;
  const outDir = path.dirname(outputPath);
  fs.mkdirSync(outDir, { recursive: true });

  const isoFd = fs.openSync(isoPath, 'r');
  const fileFd = fs.openSync(outputPath, 'r+');
  try {
    let remaining = chunkLength;
    let offset = startSector * XISO_SECTOR_SIZE + xboxDiscLseek + chunkOffset;
    const buffer = Buffer.alloc(Math.min(0x00200000, remaining || 1));
    let extracted = 0;

    while (remaining > 0) {
      const toRead = Math.min(buffer.length, remaining);
      const bytesRead = fs.readSync(isoFd, buffer, 0, toRead, offset);
      if (bytesRead <= 0) {
        throw new Error(`Truncated chunk while extracting ${itemPath}. Expected ${chunkLength}, read ${chunkLength - remaining}.`);
      }
      fs.writeSync(fileFd, buffer, 0, bytesRead, chunkOffset + extracted);
      extracted += bytesRead;
      remaining -= bytesRead;
      offset += bytesRead;

      if (chunkLength > 0) {
        sendProgress({
          type: 'chunkProgress',
          path: itemPath,
          outputPath,
          size,
          delta: bytesRead,
        });
      }
    }
  } finally {
    fs.closeSync(fileFd);
    fs.closeSync(isoFd);
  }
}

parentPort.on('message', (task) => {
  try {
    extractChunkTask(task);
    parentPort.postMessage({ type: 'done', result: { path: task.itemPath, size: task.chunkLength } });
  } catch (error) {
    parentPort.postMessage({ type: 'error', error: error.message });
  }
});

const fs = require('fs');
const path = require('path');

const BASE_DIR = path.resolve(__dirname, '../../');
const DIST_DIR = path.resolve(BASE_DIR, 'frontend/dist');

function normalizePath(filePath) {
  return String(filePath || '')
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '');
}

function ensureInside(basePath, targetPath) {
  return targetPath === basePath || targetPath.startsWith(basePath + path.sep);
}

function clearDist() {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

function restoreCompiledFilesToDisk(files) {
  clearDist();

  let restoredCount = 0;
  let skippedCount = 0;

  for (const row of Array.isArray(files) ? files : []) {
    const normalizedPath = normalizePath(row.file_path);
    if (!normalizedPath.startsWith('frontend/dist/')) {
      skippedCount++;
      continue;
    }

    const relative = normalizedPath.slice('frontend/dist/'.length);
    const fullPath = path.resolve(DIST_DIR, relative);
    if (!ensureInside(DIST_DIR, fullPath)) {
      skippedCount++;
      continue;
    }

    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, row.file_content || '', 'utf8');
    restoredCount++;
  }

  return { restoredCount, skippedCount };
}

module.exports = { restoreCompiledFilesToDisk, DIST_DIR };

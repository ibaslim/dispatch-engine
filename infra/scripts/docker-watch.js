const fs = require('fs');
const path = require('path');

let chokidar;
try {
  chokidar = require('chokidar');
} catch (e) {
  try {
    chokidar = require('../../node_modules/chokidar');
  } catch (err) {
    console.error('[Docker Watcher] chokidar not found, skipping file polling watcher.');
    process.exit(0);
  }
}

const rootDir = path.resolve(__dirname, '../..');
const srcDir = path.join(rootDir, 'apps/driver-mobile/src');
const appDir = path.join(rootDir, 'apps/driver-mobile/app');

console.log('[Docker Watcher] Starting cross-platform file watcher for Fast Refresh...');

const touchedRecently = new Set();

const watcher = chokidar.watch([srcDir, appDir], {
  usePolling: true,
  interval: 800,
  binaryInterval: 1500,
  ignoreInitial: true,
});

watcher.on('all', (event, filePath) => {
  if (event !== 'change' && event !== 'add') return;
  if (touchedRecently.has(filePath)) return;

  touchedRecently.add(filePath);
  setTimeout(() => touchedRecently.delete(filePath), 1500);

  console.log(`[Docker Watcher] File changed (${event}): ${path.basename(filePath)} -> Triggering Metro Fast Refresh`);
  const now = new Date();
  try {
    fs.utimesSync(filePath, now, now);
  } catch (e) {
    // Ignore if file was unlinked or locked
  }
});

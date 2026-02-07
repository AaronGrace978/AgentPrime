/**
 * Auto-Updater Module
 * Handles automatic updates using electron-updater
 */

import { autoUpdater } from 'electron-updater';
import { BrowserWindow } from 'electron';
import log from 'electron-log';

// Configure logging
autoUpdater.logger = log;
log.transports.file.level = 'info';

let mainWindow: BrowserWindow | null = null;

/**
 * Initialize auto-updater
 * Only runs in production (packaged) builds
 */
export function initializeAutoUpdater(window: BrowserWindow | null): void {
  mainWindow = window;

  // Only enable auto-updater in production
  if (process.env.NODE_ENV === 'development' || !require('electron').app.isPackaged) {
    log.info('[AutoUpdater] Disabled in development mode');
    return;
  }

  log.info('[AutoUpdater] Initializing...');

  // Configure auto-updater
  autoUpdater.autoDownload = false; // Don't auto-download, let user choose
  autoUpdater.autoInstallOnAppQuit = true; // Install on app quit if update is ready

  // Check for updates on startup (after a delay)
  setTimeout(() => {
    checkForUpdates();
  }, 5000); // Wait 5 seconds after app start

  // Check for updates every 4 hours
  setInterval(() => {
    checkForUpdates();
  }, 4 * 60 * 60 * 1000); // 4 hours

  // Event handlers
  autoUpdater.on('checking-for-update', () => {
    log.info('[AutoUpdater] Checking for updates...');
    sendStatusToWindow('checking-for-update');
  });

  autoUpdater.on('update-available', (info) => {
    log.info('[AutoUpdater] Update available:', info.version);
    sendStatusToWindow('update-available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('[AutoUpdater] Update not available. Current version is latest.');
    sendStatusToWindow('update-not-available', {
      version: info.version
    });
  });

  autoUpdater.on('error', (err) => {
    log.error('[AutoUpdater] Error:', err);
    sendStatusToWindow('update-error', {
      message: err.message
    });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const percent = Math.round(progressObj.percent);
    log.info(`[AutoUpdater] Download progress: ${percent}%`);
    sendStatusToWindow('download-progress', {
      percent,
      transferred: progressObj.transferred,
      total: progressObj.total
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('[AutoUpdater] Update downloaded:', info.version);
    sendStatusToWindow('update-downloaded', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes
    });
  });
}

/**
 * Check for updates manually
 */
export function checkForUpdates(): void {
  if (process.env.NODE_ENV === 'development' || !require('electron').app.isPackaged) {
    log.info('[AutoUpdater] Skipping update check in development mode');
    return;
  }

  log.info('[AutoUpdater] Checking for updates...');
  autoUpdater.checkForUpdates().catch((err) => {
    log.error('[AutoUpdater] Failed to check for updates:', err);
    sendStatusToWindow('update-error', {
      message: err.message
    });
  });
}

/**
 * Download the available update
 */
export function downloadUpdate(): void {
  if (process.env.NODE_ENV === 'development' || !require('electron').app.isPackaged) {
    log.warn('[AutoUpdater] Cannot download update in development mode');
    return;
  }

  log.info('[AutoUpdater] Starting download...');
  autoUpdater.downloadUpdate().catch((err) => {
    log.error('[AutoUpdater] Failed to download update:', err);
    sendStatusToWindow('update-error', {
      message: err.message
    });
  });
}

/**
 * Install the downloaded update and restart the app
 */
export function installUpdate(): void {
  if (process.env.NODE_ENV === 'development' || !require('electron').app.isPackaged) {
    log.warn('[AutoUpdater] Cannot install update in development mode');
    return;
  }

  log.info('[AutoUpdater] Installing update and restarting...');
  autoUpdater.quitAndInstall(false, true); // isSilent, isForceRunAfter
}

/**
 * Send update status to renderer process
 */
function sendStatusToWindow(event: string, data?: any): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('auto-updater-status', {
      event,
      data
    });
  }
}

/**
 * Get current app version
 */
export function getAppVersion(): string {
  return require('electron').app.getVersion();
}


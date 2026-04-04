import { app, BrowserWindow, dialog, Menu, Tray, nativeImage } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'node:path';
import { openDatabase } from './db/database';
import { AutomationEngine } from './engine/automation-engine';
import { TriggerManager } from './engine/trigger-manager';
import { registerIpcHandlers } from './ipc-handlers';
import { startApiServer } from './api-server';
import { readStoredEntitlementKey } from './entitlement';
import { getLicenseApiUrl, getLicenseMode, refreshLicenseOnline } from './license-remote';

const isDev = process.argv.includes('--dev');

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let apiStop: (() => void) | null = null;
let isQuitting = false;
/** Held for graceful WAL checkpoint + close on quit (avoids “lost” data after abrupt dev restarts). */
let appDb: ReturnType<typeof openDatabase> | null = null;

function shutdownDatabase(): void {
  if (!appDb) return;
  const d = appDb;
  appDb = null;
  try {
    d.pragma('wal_checkpoint(TRUNCATE)');
  } catch (e) {
    console.error('[taskforge] wal_checkpoint failed', e);
  }
  try {
    d.close();
  } catch (e) {
    console.error('[taskforge] database close failed', e);
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0a0a0a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  if (isDev) {
    void mainWindow.loadURL('http://127.0.0.1:4200');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexHtml = path.join(__dirname, '../dist/taskforge/browser/index.html');
    void mainWindow.loadFile(indexHtml);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    mainWindow?.hide();
  });
}

function createTray(): void {
  const iconCandidates = [
    path.join(__dirname, '../public/favicon.ico'),
    path.join(app.getAppPath(), 'public/favicon.ico'),
  ];
  let img = nativeImage.createEmpty();
  for (const p of iconCandidates) {
    try {
      const i = nativeImage.createFromPath(p);
      if (!i.isEmpty()) {
        img = i;
        break;
      }
    } catch {
      /* try next */
    }
  }
  tray = new Tray(img);
  tray.setToolTip('TaskForge');
  const menu = Menu.buildFromTemplate([
    {
      label: 'Open TaskForge',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    } else {
      createWindow();
    }
  });
}

void app
  .whenReady()
  .then(() => {
    if (process.platform === 'win32') {
      app.setAppUserModelId('app.taskforge.desktop');
    }
    if (process.platform !== 'darwin') {
      Menu.setApplicationMenu(null);
    }

    let db: ReturnType<typeof openDatabase>;
    try {
      db = openDatabase();
      appDb = db;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      dialog.showErrorBox(
        'TaskForge — database could not start',
        [
          'The SQLite native add-on (better-sqlite3) is not built for this Electron version.',
          '',
          'From the project folder run:',
          '  npm run rebuild:native',
          '',
          msg,
        ].join('\n')
      );
      app.quit();
      return;
    }

    const engine = new AutomationEngine(
      db,
      (payload) => {
        mainWindow?.webContents.send('logs:new', payload);
      },
      (step) => {
        mainWindow?.webContents.send('logs:stepProgress', step);
      }
    );
    const triggers = new TriggerManager(db, engine);
    registerIpcHandlers(db, engine, triggers, () => mainWindow);
    apiStop = startApiServer(db, engine, triggers).stop;

    const licenseUrl = getLicenseApiUrl();
    const licenseMode = getLicenseMode();
    if (licenseUrl && licenseMode !== 'local' && readStoredEntitlementKey(db).trim()) {
      void refreshLicenseOnline(db).catch(() => undefined);
    }

    triggers.reloadFromDatabase();
    triggers.runStartupTriggers();

    createWindow();
    createTray();

    if (app.isPackaged) {
      autoUpdater.checkForUpdatesAndNotify().catch(() => undefined);
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else mainWindow?.show();
    });
  })
  .catch((e) => {
    console.error(e);
    dialog.showErrorBox('TaskForge', e instanceof Error ? e.message : String(e));
    app.quit();
  });

app.on('window-all-closed', () => {
  /* keep running in tray on Windows */
});

app.on('before-quit', () => {
  isQuitting = true;
  apiStop?.();
  shutdownDatabase();
});

process.once('SIGINT', () => {
  void app.quit();
});
process.once('SIGTERM', () => {
  void app.quit();
});

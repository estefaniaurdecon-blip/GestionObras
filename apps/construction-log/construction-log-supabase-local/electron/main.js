const { app, BrowserWindow, Menu, ipcMain, session } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const isDev = process.env.NODE_ENV === 'development';

// IMPORTANT: Use ASCII-only name to avoid UTF-8 encoding issues with Supabase Auth
// The original name "Sistema de Gestión de Obras" contains ó which causes
// "invalid byte sequence for encoding UTF8" errors when creating sessions
app.setName('Sistema de Gestion de Obras');

// Custom User-Agent without special characters to prevent Supabase Auth encoding errors
const SAFE_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) SistemaGestionObras/2.0 Chrome/120.0.0.0 Electron/28.0.0 Safari/537.36';

// Función para limpiar datos de sesión corruptos - EXHAUSTIVA
async function clearCorruptedSessionData() {
  try {
    const ses = session.defaultSession;
    
    // Limpiar TODOS los datos de almacenamiento
    await ses.clearStorageData({
      storages: [
        'appcache',
        'cookies', 
        'filesystem',
        'indexdb',
        'localstorage',
        'sessionstorage',
        'shadercache',
        'websql',
        'serviceworkers',
        'cachestorage'
      ],
      quotas: ['temporary', 'persistent', 'syncable']
    });
    
    // Limpiar caché HTTP también
    await ses.clearCache();
    
    // Limpiar datos de autenticación HTTP
    await ses.clearAuthCache();
    
    console.log('[Electron] Cleared ALL session storage data, cache, and auth cache');
  } catch (error) {
    console.error('[Electron] Error clearing session data:', error);
    // Intentar limpieza parcial si la completa falla
    try {
      const ses = session.defaultSession;
      await ses.clearStorageData({ storages: ['localstorage', 'sessionstorage'] });
      console.log('[Electron] Partial cleanup completed');
    } catch (e) {
      console.error('[Electron] Partial cleanup also failed:', e);
    }
  }
}

// Manejar el lock de instancia única - permitir múltiples instancias si hay problemas con el lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Si no obtenemos el lock, intentar liberar cualquier lock antiguo y reintentar
  app.releaseSingleInstanceLock();
  // Salir silenciosamente - esto permite que una nueva instalación funcione
  app.quit();
} else {
  // Si otra instancia intenta iniciarse, enfocar nuestra ventana
  app.on('second-instance', () => {
    const allWindows = BrowserWindow.getAllWindows();
    if (allWindows.length > 0) {
      const mainWindow = allWindows[0];
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createSplashWindow() {
  const splashPath = path.join(__dirname, '../resources', 'splash.png');
  
  const splash = new BrowserWindow({
    width: 800,
    height: 450,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    center: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  // Crear HTML simple para mostrar la splash screen
  const splashHTML = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          * { margin: 0; padding: 0; }
          body { 
            display: flex; 
            justify-content: center; 
            align-items: center; 
            height: 100vh;
            background: transparent;
            overflow: hidden;
          }
          img { 
            width: 100%; 
            height: 100%; 
            object-fit: contain;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          }
        </style>
      </head>
      <body>
        <img src="${pathToFileURL(splashPath).href}" alt="Loading...">
      </body>
    </html>
  `;

  splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHTML)}`);
  return splash;
}

function createWindow() {
  // Mostrar splash screen
  const splash = createSplashWindow();

  // Crear la ventana del navegador
  const iconPath = path.join(__dirname, '../resources', 'icon.png');

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Sistema de Gestión de Obras',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: isDev,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: iconPath,
    show: false, // No mostrar hasta que esté listo
    titleBarStyle: 'default',
  });

  // Cargar la aplicación
  if (isDev) {
    mainWindow.loadURL('http://localhost:8080');
    // Abrir DevTools en desarrollo
    mainWindow.webContents.openDevTools();
  } else {
    // En producción, cargar desde la ruta correcta del paquete con rutas de respaldo y registros
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      const logMsg = `[${new Date().toISOString()}] did-fail-load: ${errorCode} ${errorDescription} | URL: ${validatedURL}\n`;
      try {
        const logPath = path.join(app.getPath('userData'), 'electron-load.log');
        fs.appendFileSync(logPath, logMsg);
      } catch {}
      try {
        require('electron').dialog.showErrorBox('Error cargando la aplicación', `${errorDescription}`);
      } catch {}
    });

    // Rutas candidatas - extraResources copia dist/ a resources/dist/
    const candidates = [
      // extraResources copia a resources/dist/
      path.join(process.resourcesPath || '', 'dist', 'index.html'),
      // Fallback: dentro del asar
      path.join(__dirname, '..', 'dist', 'index.html'),
      path.join(app.getAppPath() || '', 'dist', 'index.html'),
    ];

    // Registrar diagnóstico con todas las rutas probadas y si existen
    try {
      const logPath = path.join(app.getPath('userData'), 'electron-load.log');
      const info = [
        `[${new Date().toISOString()}] startup` ,
        `__dirname=${__dirname}` ,
        `resourcesPath=${process.resourcesPath}` ,
        `appPath=${app.getAppPath()}` ,
        'Candidates:',
        ...candidates.map(p => `${p} exists=${(() => { try { return fs.existsSync(p); } catch { return false; } })()}`)
      ].join('\n');
      fs.appendFileSync(logPath, info + '\n');
    } catch {}

    const chosen = candidates.find(p => {
      try { return fs.existsSync(p); } catch { return false; }
    });

    if (chosen) {
      try {
        // loadFile maneja correctamente rutas file y dentro de asar
        mainWindow.loadFile(chosen);
      } catch {
        mainWindow.loadURL(pathToFileURL(chosen).href);
      }
    } else {
      const message = `No se encontró index.html en rutas esperadas:\n${candidates.join('\n')}`;
      try {
        require('electron').dialog.showErrorBox('Archivo no encontrado', message);
      } catch {}
    }
  }

  // Mostrar ventana cuando esté lista y cerrar splash
  mainWindow.once('ready-to-show', () => {
    mainWindow.setTitle('Sistema de Gestión de Obras');
    
    // Pequeño delay para transición suave
    setTimeout(() => {
      mainWindow.show();
      splash.close();
    }, 500);
  });

  // Manejar enlaces externos
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Configurar autoUpdater con soporte para delta updates
if (!isDev) {
  // Habilitar descarga automática para delta updates (son pequeñas)
  autoUpdater.autoDownload = false; // Mantenemos manual para control
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  
  // Configurar logging detallado para debug
  autoUpdater.logger = require('electron-log');
  autoUpdater.logger.transports.file.level = 'info';
  
  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Checking for update...');
  });
  
  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info.version);
    console.log('[AutoUpdater] Release notes:', info.releaseNotes);
    // Notificar al renderer
    const allWindows = BrowserWindow.getAllWindows();
    if (allWindows.length > 0) {
      allWindows[0].webContents.send('update-available', info);
    }
  });
  
  autoUpdater.on('update-not-available', (info) => {
    console.log('[AutoUpdater] Update not available, current version is latest');
  });
  
  autoUpdater.on('download-progress', (progressObj) => {
    const logMessage = `[AutoUpdater] Download progress: ${progressObj.percent.toFixed(1)}%`;
    console.log(logMessage);
    console.log(`[AutoUpdater] Speed: ${(progressObj.bytesPerSecond / 1024).toFixed(1)} KB/s`);
    console.log(`[AutoUpdater] Downloaded: ${(progressObj.transferred / 1024 / 1024).toFixed(2)} MB / ${(progressObj.total / 1024 / 1024).toFixed(2)} MB`);
    
    // Enviar progreso al renderer
    const allWindows = BrowserWindow.getAllWindows();
    if (allWindows.length > 0) {
      allWindows[0].webContents.send('download-progress', progressObj);
    }
  });
  
  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Update downloaded:', info.version);
    console.log('[AutoUpdater] Will install on quit');
    
    // Notificar al renderer
    const allWindows = BrowserWindow.getAllWindows();
    if (allWindows.length > 0) {
      allWindows[0].webContents.send('update-downloaded', info);
    }
  });
  
  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Error:', err.message);
    // No es crítico, el flujo manual sigue funcionando
  });
}

// IPC handlers para actualización manual
ipcMain.handle('download-update', async () => {
  if (!isDev) {
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error) {
      console.error('Error downloading update:', error);
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: 'Dev mode' };
});

// IPC handler para limpiar sesión corrupta
ipcMain.handle('clear-session-data', async () => {
  try {
    await clearCorruptedSessionData();
    return { success: true };
  } catch (error) {
    console.error('Error clearing session:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('install-update', () => {
  if (!isDev) {
    autoUpdater.quitAndInstall(false, true);
  }
});

// Nuevo flujo mejorado: descargar .exe desde URL y ejecutar instalador
// Optimizado para actualizaciones automáticas sin desinstalar
const os = require('os');
const https = require('https');
const http = require('http');
const { spawn, execSync } = require('child_process');

// Función para seguir redirecciones y descargar archivo
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    
    const request = protocol.get(url, (response) => {
      // Manejar redirecciones (301, 302, 303, 307, 308)
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlinkSync(destPath); // Eliminar archivo vacío
        return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
      }
      
      if (response.statusCode !== 200) {
        file.close();
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve(destPath);
      });
      
      file.on('error', (err) => {
        fs.unlink(destPath, () => {}); // Limpiar archivo parcial
        reject(err);
      });
    });
    
    request.on('error', (err) => {
      file.close();
      fs.unlink(destPath, () => {});
      reject(err);
    });
    
    // Timeout de 5 minutos para descargas grandes
    request.setTimeout(300000, () => {
      request.destroy();
      reject(new Error('Download timeout'));
    });
  });
}

// Función para cerrar cualquier instancia previa de la app
function closeExistingInstances() {
  try {
    if (process.platform === 'win32') {
      // Intentar cerrar gracefully primero, luego forzar
      execSync('taskkill /im "Sistema de Gestion de Obras.exe" /f', { stdio: 'ignore' });
    }
  } catch (e) {
    // Ignorar error si el proceso no está corriendo
    console.log('[Updates] No existing instances to close or already closed');
  }
}

ipcMain.handle('download-and-install-from-url', async (_event, url) => {
  console.log('[Updates] download-and-install-from-url called with URL:', url);
  
  if (isDev) {
    console.log('[Updates] Skipping update in dev mode');
    return { success: false, error: 'Dev mode' };
  }

  if (process.platform !== 'win32') {
    console.log('[Updates] Non-Windows platform, opening in browser');
    try { require('electron').shell.openExternal(url); } catch {}
    return { success: false, error: 'Unsupported platform - opened in browser' };
  }

  try {
    // Crear nombre de archivo único en temp
    const tempFile = path.join(os.tmpdir(), `SistemaGestionObras-Update-${Date.now()}.exe`);
    console.log('[Updates] Downloading to:', tempFile);
    
    // Descargar el instalador
    await downloadFile(url, tempFile);
    console.log('[Updates] Download complete');
    
    // Verificar que el archivo existe y tiene tamaño razonable (>1MB)
    const stats = fs.statSync(tempFile);
    if (stats.size < 1000000) {
      throw new Error(`Downloaded file too small: ${stats.size} bytes`);
    }
    console.log('[Updates] File size:', (stats.size / 1024 / 1024).toFixed(2), 'MB');
    
    // Ejecutar instalador en modo silencioso
    // Con oneClick: true, solo se necesita /S
    console.log('[Updates] Launching installer in silent mode...');
    const installer = spawn(tempFile, ['/S'], { 
      detached: true, 
      stdio: 'ignore',
      windowsHide: true
    });
    installer.unref();
    
    console.log('[Updates] Installer launched, quitting app in 2 seconds...');
    
    // Dar tiempo al instalador para iniciarse, luego cerrar la app
    setTimeout(() => {
      console.log('[Updates] Quitting app for update...');
      app.quit();
    }, 2000);
    
    return { success: true };
    
  } catch (error) {
    console.error('[Updates] Error during update:', error);
    return { success: false, error: error.message };
  }
});

// Handler adicional para verificar si hay actualizaciones pendientes al iniciar
ipcMain.handle('check-pending-update', async () => {
  // Buscar archivos de actualización descargados pero no instalados
  const tempDir = os.tmpdir();
  try {
    const files = fs.readdirSync(tempDir);
    const updateFiles = files.filter(f => f.startsWith('SistemaGestionObras-Update-') && f.endsWith('.exe'));
    
    // Limpiar actualizaciones antiguas (>24 horas)
    const now = Date.now();
    for (const file of updateFiles) {
      const filePath = path.join(tempDir, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > 24 * 60 * 60 * 1000) {
        fs.unlinkSync(filePath);
        console.log('[Updates] Cleaned old update file:', file);
      }
    }
  } catch (e) {
    console.log('[Updates] Error checking pending updates:', e.message);
  }
  return { success: true };
});


// Este método se llamará cuando Electron haya terminado la inicialización
app.whenReady().then(() => {
  // Set a safe User-Agent to prevent UTF-8 encoding errors with Supabase Auth
  // This is critical: the default User-Agent may contain non-ASCII characters
  // from the app name which causes "invalid byte sequence for encoding UTF8" errors
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['User-Agent'] = SAFE_USER_AGENT;
    callback({ requestHeaders: details.requestHeaders });
  });
  
  createWindow();
  
  // Verificar actualizaciones al iniciar (deshabilitado: usamos flujo propio basado en URL)
  // if (!isDev) {
  //   setTimeout(() => {
  //     autoUpdater.checkForUpdates();
  //   }, 3000);
  // }

});

// Salir cuando todas las ventanas estén cerradas, excepto en macOS
// Note: Removed unused electronAppQuit variable (was missing const/let declaration)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Configurar el menú de la aplicación
const template = [
  {
    label: 'Archivo',
    submenu: [
      {
        label: 'Salir',
        accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
        click: () => app.quit()
      }
    ]
  },
  {
    label: 'Ver',
    submenu: [
      { role: 'reload', label: 'Recargar' },
      { role: 'forceReload', label: 'Forzar Recarga' },
      { role: 'toggleDevTools', label: 'Herramientas de Desarrollador' },
      { type: 'separator' },
      { role: 'resetZoom', label: 'Zoom Normal' },
      { role: 'zoomIn', label: 'Acercar' },
      { role: 'zoomOut', label: 'Alejar' },
      { type: 'separator' },
      { role: 'togglefullscreen', label: 'Pantalla Completa' }
    ]
  }
];

const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);

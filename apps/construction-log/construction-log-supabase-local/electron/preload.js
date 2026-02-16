const { contextBridge, ipcRenderer } = require('electron');

// Get version safely - in production the package.json path is different
let appVersion = '0.0.0';
try {
  // Try multiple paths for packaged app compatibility
  const possiblePaths = [
    '../package.json',
    '../../package.json', 
    '../../../package.json'
  ];
  for (const p of possiblePaths) {
    try {
      appVersion = require(p).version;
      break;
    } catch {}
  }
} catch {
  console.warn('[Preload] Could not read package.json version');
}

// Exponer API segura al renderer
contextBridge.exposeInMainWorld('electronAPI', {
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  // Descarga e instala un instalador desde URL (Windows) - actualización automática
  downloadAndInstallFromUrl: (url) => ipcRenderer.invoke('download-and-install-from-url', url),
  // Limpiar datos de sesión corruptos
  clearSessionData: () => ipcRenderer.invoke('clear-session-data'),
  // Verificar actualizaciones pendientes
  checkPendingUpdate: () => ipcRenderer.invoke('check-pending-update'),
  // Información de la plataforma
  getPlatform: () => process.platform,
  getVersion: () => appVersion,
});
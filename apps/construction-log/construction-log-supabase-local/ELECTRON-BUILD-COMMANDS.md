# 💻 Comandos de Build Electron - Referencia Rápida

## 🎯 Comandos Principales

### Build Completo con Versión (Producción)
```bash
node scripts/build-electron-complete.cjs
```
✅ Incrementa versión  
✅ Build web + iconos + instalador  
✅ Genera metadata auto-updater  
✅ Organiza en `electron-release/`  

---

### Build Rápido (Desarrollo)
```bash
node scripts/build-electron-quick.cjs
```
✅ Solo ejecutable (sin instalador)  
✅ Sin incremento de versión  
✅ Rápido para pruebas  
✅ Output: `release/win-unpacked/`  

---

### Publicar Actualización
```bash
node scripts/publish-electron-update.cjs
```
📤 Guía interactiva  
📤 Genera metadata  
📤 SQL para base de datos  

---

### Modo Desarrollo (con Hot Reload)
```bash
node scripts/dev-electron.cjs
```
⚡ Vite dev server + Electron  
⚡ Hot reload activo  
⚡ DevTools abierto  

---

## 📋 Comandos de Desarrollo

### Ejecutar en Desarrollo
```bash
# Con hot reload
npm run dev &
npx electron .

# O usar el script
node scripts/dev-electron.cjs
```

### Build Manual
```bash
# Web build
npm run build

# Electron build Windows
npx electron-builder --win

# Electron build sin instalador (más rápido)
npx electron-builder --win --dir
```

### Validar Iconos
```bash
# Validar formato
node scripts/validate-icon.cjs

# Convertir PNG a ICO
node scripts/convert-icon-to-ico.cjs
```

---

## 🔄 Flujos de Trabajo

### 1. Primera Configuración
```bash
git pull
npm install
node scripts/build-electron-complete.cjs
```

### 2. Desarrollo Iterativo
```bash
# Hacer cambios...
node scripts/build-electron-quick.cjs

# Ejecutar
release/win-unpacked/Sistema de Gestion de Obras.exe
```

### 3. Release para Producción
```bash
# Build con versión
node scripts/build-electron-complete.cjs

# Publicar update
node scripts/publish-electron-update.cjs

# Subir archivo a servidor
# Registrar en base de datos (seguir instrucciones del script)
```

### 4. Hot Reload Development
```bash
# Terminal 1: Vite dev server
npm run dev

# Terminal 2: Electron (espera a que Vite esté listo)
NODE_ENV=development npx electron .

# O simplemente:
node scripts/dev-electron.cjs
```

---

## 🆘 Troubleshooting Rápido

### "electron-builder not found"
```bash
npm install
```

### "Icon invalid"
```bash
# Verifica resources/icon.png (mínimo 256x256)
# Regenera ICO
node scripts/convert-icon-to-ico.cjs
```

### "Build failed"
```bash
# Limpiar y reintentar
rm -rf release/ electron-release/
npm run build
node scripts/build-electron-complete.cjs
```

### "Auto-updater no funciona"
```bash
# Verifica:
# 1. latest.yml en servidor
# 2. URL en electron-builder.config.js
# 3. Versión en DB mayor que la instalada
# 4. Logs: abrir DevTools en app Electron
```

---

## 📁 Ubicaciones de Archivos

### Builds Generados
```
electron-release/
├── Sistema-Gestion-Obras-2.3.5-win-2025-11-30.exe  # Instalador
├── latest.yml                                        # Metadata updater
└── update-2.3.5.json                                 # Info publicación

release/
├── win-unpacked/                                     # Ejecutable directo
└── Sistema-de-Gestion-de-Obras-Setup-2.3.5.exe     # Instalador
```

### Archivos de Configuración
```
electron/
├── main.js           # Main process (auto-updater aquí)
└── preload.js        # Preload script

resources/
├── icon.png          # Icono principal
├── icon.ico          # Generado para Windows
└── splash.png        # Splash screen

electron-builder.config.js  # Config builder y auto-updater
```

---

## 💡 Tips Profesionales

### 1. Build y ejecutar en un comando
```bash
node scripts/build-electron-quick.cjs && ./release/win-unpacked/Sistema\ de\ Gestion\ de\ Obras.exe
```

### 2. Watch mode para desarrollo
```bash
# Terminal 1
npm run dev

# Terminal 2
nodemon --watch src --exec "node scripts/build-electron-quick.cjs"
```

### 3. Limpiar cache antes de build importante
```bash
rm -rf release/ electron-release/ dist/ node_modules/.cache
npm run build
node scripts/build-electron-complete.cjs
```

### 4. Verificar tamaño del build
```bash
du -sh electron-release/Sistema-*.exe
# Debería ser ~80-120 MB para app Electron con React
```

### 5. Testear instalador localmente
```bash
# Instalar en directorio temporal
./electron-release/Sistema-Gestion-Obras-2.3.5-win-*.exe /S /D=C:\temp\test-install

# Verificar instalación
cd C:\temp\test-install
./Sistema\ de\ Gestion\ de\ Obras.exe
```

---

## 🔄 Auto-Updater

### Verificar Actualizaciones Manualmente (En Dev Mode)
```javascript
// En electron/main.js, agregar temporalmente:
ipcMain.handle('check-updates-manual', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return result;
  } catch (error) {
    return { error: error.message };
  }
});

// Luego en la app:
window.electronAPI.checkUpdatesManual();
```

### Logs de Auto-Updater
```javascript
// Ver logs en electron/main.js
autoUpdater.logger = console;
autoUpdater.logger.transports.file.level = 'info';

// Los logs aparecerán en:
// Windows: %APPDATA%\Sistema de Gestion de Obras\logs\
```

### Simular Update Localmente
```bash
# 1. Servir archivos localmente
cd electron-release
python -m http.server 8000

# 2. En electron-builder.config.js cambiar temporalmente:
publish: {
  provider: 'generic',
  url: 'http://localhost:8000/'
}

# 3. Build y probar
node scripts/build-electron-complete.cjs
```

---

## 📊 Tamaños Típicos

| Componente | Tamaño |
|------------|--------|
| Instalador .exe | 80-120 MB |
| Ejecutable sin comprimir | 150-200 MB |
| latest.yml | 1-2 KB |
| update.json | 1 KB |

---

## 🎯 Checklist Pre-Release

```bash
✅ git commit -am "Pre-release v2.3.5"
✅ git tag v2.3.5
✅ node scripts/build-electron-complete.cjs
✅ Probar instalador localmente
✅ node scripts/publish-electron-update.cjs
✅ Subir .exe a servidor
✅ Registrar en base de datos
✅ Verificar que usuarios vean notificación
✅ git push && git push --tags
```

---

## 📚 Scripts Disponibles

| Script | Comando | Uso |
|--------|---------|-----|
| Build Completo | `node scripts/build-electron-complete.cjs` | Producción |
| Build Rápido | `node scripts/build-electron-quick.cjs` | Desarrollo |
| Publicar Update | `node scripts/publish-electron-update.cjs` | Distribución |
| Dev Mode | `node scripts/dev-electron.cjs` | Hot reload |
| Validar Icono | `node scripts/validate-icon.cjs` | Verificación |
| Convertir Icono | `node scripts/convert-icon-to-ico.cjs` | Assets |

---

**✨ ¡Listo para crear apps de escritorio profesionales con auto-actualización!**

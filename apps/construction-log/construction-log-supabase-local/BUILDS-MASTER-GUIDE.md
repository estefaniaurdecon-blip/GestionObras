# 🚀 Guía Maestra de Builds - Sistema Completo

## 📚 Navegación Rápida

### 🎯 Guías Principales
- [BUILD-COMPARISON.md](./BUILD-COMPARISON.md) - **Comparación Android vs Electron**
- [BUILD-ANDROID-GUIDE.md](./BUILD-ANDROID-GUIDE.md) - **Guía completa Android**
- [BUILD-ELECTRON-GUIDE.md](./BUILD-ELECTRON-GUIDE.md) - **Guía completa Electron**

### ⚡ Referencias Rápidas
- [ANDROID-BUILD-COMMANDS.md](./ANDROID-BUILD-COMMANDS.md) - Comandos Android
- [ELECTRON-BUILD-COMMANDS.md](./ELECTRON-BUILD-COMMANDS.md) - Comandos Electron

### 🚀 Inicio Rápido
- [QUICK-START-ANDROID.md](./QUICK-START-ANDROID.md) - Setup Android en 3 pasos

---

## 🎯 ¿Qué Necesitas Hacer?

### "Quiero construir para producción"

**Android:**
```bash
node scripts/build-android-apk.cjs
# ✅ APK en: android-release/
```

**Electron:**
```bash
node scripts/build-electron-complete.cjs
# ✅ EXE en: electron-release/
```

**Ambas:**
```bash
./scripts/build-all.sh
# ✅ Todo en sus carpetas respectivas
```

---

### "Necesito probar rápidamente"

**Android:**
```bash
node scripts/build-android-quick.cjs
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

**Electron:**
```bash
node scripts/build-electron-quick.cjs
./release/win-unpacked/Sistema de Gestion de Obras.exe
```

---

### "Quiero publicar una actualización"

**Android:**
1. Build: `node scripts/build-android-apk.cjs`
2. Subir Release APK a Google Play Console
3. Completar metadata y publicar

**Electron:**
1. Build: `node scripts/build-electron-complete.cjs`
2. Publicar: `node scripts/publish-electron-update.cjs`
3. Seguir instrucciones en pantalla
4. ✅ Usuarios reciben update automáticamente

---

### "Es mi primera vez configurando"

**Android:**
```bash
git pull
npm install
node scripts/setup-android-assets.cjs
node scripts/setup-android-signing.cjs  # Opcional
node scripts/build-android-apk.cjs
```

**Electron:**
```bash
git pull
npm install
node scripts/build-electron-complete.cjs
```

---

## 📊 Scripts Disponibles

### Android

| Script | Propósito | Tiempo |
|--------|-----------|--------|
| `build-android-apk.cjs` | Build completo con versión | 3-5 min |
| `build-android-quick.cjs` | Build rápido para testing | 1-2 min |
| `setup-android-assets.cjs` | Generar iconos y splash | 30 seg |
| `setup-android-signing.cjs` | Configurar firma (1 vez) | 2 min |

### Electron

| Script | Propósito | Tiempo |
|--------|-----------|--------|
| `build-electron-complete.cjs` | Build completo con versión | 4-8 min |
| `build-electron-quick.cjs` | Build rápido para testing | 2-4 min |
| `publish-electron-update.cjs` | Publicar actualización | Interactivo |
| `dev-electron.cjs` | Modo desarrollo con hot reload | - |

### Utilidades

| Script | Propósito |
|--------|-----------|
| `version-bump.cjs` | Incrementar versión manualmente |
| `validate-icon.cjs` | Validar formato de icono |
| `convert-icon-to-ico.cjs` | Convertir PNG a ICO |

---

## 🔄 Flujo de Trabajo Típico

### Día a Día (Desarrollo)

```bash
# 1. Hacer cambios en código
# ...edit files...

# 2. Test rápido
node scripts/build-android-quick.cjs     # O Electron
adb install -r android/app/.../app-debug.apk

# 3. Verificar que funciona
# ...test on device...

# 4. Repetir
```

### Cada Sprint/Release

```bash
# 1. Commit cambios
git commit -am "Sprint 23 completado"

# 2. Build producción
node scripts/build-android-apk.cjs
node scripts/build-electron-complete.cjs

# 3. Distribuir
# Android: Google Play
# Electron: Auto-updater

# 4. Tag versión
git tag v2.3.6
git push --tags
```

### Hotfix Urgente

```bash
# 1. Fix rápido
# ...fix bug...

# 2. Build inmediato
node scripts/build-android-quick.cjs  # Para verificar
node scripts/build-android-apk.cjs    # Para release

# 3. Distribución express
# Android: Upload express a Play Store
# Electron: Marca como obligatorio en publish script
```

---

## 📂 Estructura de Salida

```
proyecto/
├── android-release/              # Builds Android
│   ├── Sistema-*-debug-*.apk
│   └── Sistema-*-release-*.apk
│
├── electron-release/             # Builds Electron
│   ├── Sistema-*-win-*.exe
│   ├── latest.yml
│   └── update-*.json
│
├── release/                      # Temp Electron
│   └── win-unpacked/
│
└── android/                      # Proyecto Android
    └── app/build/outputs/
```

---

## 🎯 Checklist Completo

### Pre-Build

```
[ ] Código comiteado
[ ] Tests pasando
[ ] Sin console.errors
[ ] Assets actualizados (iconos/splash)
[ ] Versión correcta en package.json
```

### Android Build

```
[ ] Assets generados (si es primera vez)
[ ] Signing configurado (para release)
[ ] Build ejecutado sin errores
[ ] APK probado en dispositivo físico
[ ] Permisos funcionando correctamente
```

### Electron Build

```
[ ] Icono validado
[ ] Build ejecutado sin errores
[ ] Instalador probado localmente
[ ] Splash screen visible
[ ] Auto-updater configurado
```

### Post-Build

```
[ ] Archivos organizados en carpetas release
[ ] Tamaños de archivo razonables
[ ] Versiones etiquetadas en git
[ ] Documentación actualizada
```

### Distribución

**Android:**
```
[ ] APK subido a Play Console
[ ] Screenshots actualizados
[ ] Release notes escritos
[ ] Release publicado
```

**Electron:**
```
[ ] EXE subido a servidor
[ ] URL pública obtenida
[ ] Actualización registrada en DB
[ ] Usuarios notificados
```

---

## 🆘 Troubleshooting Universal

### "Build falla con error genérico"

```bash
# 1. Limpiar todo
rm -rf node_modules
rm -rf android/build
rm -rf release
rm -rf electron-release

# 2. Reinstalar
npm install

# 3. Rebuild
npm run build

# 4. Intentar de nuevo
node scripts/build-[platform]-apk.cjs
```

### "Versión no incrementa"

```bash
# Manual override
npm version patch  # 2.3.4 → 2.3.5

# O editar package.json directamente
# Luego build normal
```

### "Assets no se generan correctamente"

```bash
# Android
node scripts/setup-android-assets.cjs

# Electron
node scripts/validate-icon.cjs
node scripts/convert-icon-to-ico.cjs
```

### "Auto-updater no funciona (Electron)"

```bash
# Verificar:
# 1. latest.yml en servidor
cat electron-release/latest.yml

# 2. URL en config
grep "url" electron-builder.config.js

# 3. Versión en DB mayor
# SELECT version FROM app_versions ORDER BY created_at DESC LIMIT 1;

# 4. Logs de electron
# Abrir DevTools en la app
```

---

## 💡 Tips Profesionales

### 1. Automatiza el proceso completo

```bash
# scripts/release.sh
#!/bin/bash
VERSION=$(node -p "require('./package.json').version")

echo "🚀 Releasing v$VERSION"

# Build todas las plataformas
node scripts/build-android-apk.cjs
node scripts/build-electron-complete.cjs

# Crear release notes automático
git log --oneline $(git describe --tags --abbrev=0)..HEAD > RELEASE_NOTES.txt

echo "✅ Release v$VERSION ready!"
echo "📱 Android: android-release/"
echo "💻 Electron: electron-release/"
echo "📝 Notes: RELEASE_NOTES.txt"
```

### 2. Mantén versiones sincronizadas

```bash
# Siempre usar el mismo version-bump
node scripts/version-bump.cjs

# Luego build ambas plataformas
# Android y Electron tendrán la misma versión
```

### 3. Testing matrix

```bash
# Android: Probar en múltiples dispositivos
adb devices  # Lista dispositivos
for device in $(adb devices | grep device | cut -f1); do
    adb -s $device install -r app.apk
done

# Electron: Probar en múltiples PCs
# Compartir el instalador por red local
```

### 4. Backups automáticos

```bash
# Antes de cada build
git commit -am "Pre-build backup $(date +%Y%m%d_%H%M%S)"
git tag "backup-$(date +%Y%m%d_%H%M%S)"

# Luego build
node scripts/build-android-apk.cjs
```

---

## 📊 Métricas de Build

### Tiempos Típicos

| Acción | Android | Electron |
|--------|---------|----------|
| Quick Build | 1-2 min | 2-4 min |
| Full Build | 3-5 min | 4-8 min |
| Assets Setup | 30 seg | N/A |
| Signing Setup | 2 min | N/A |

### Tamaños Típicos

| Output | Android | Electron |
|--------|---------|----------|
| Debug | 25-35 MB | N/A |
| Release | 20-30 MB | 80-120 MB |
| Assets | < 1 MB | < 5 MB |

---

## 🎓 Aprendizaje Progresivo

### Nivel 1: Básico
- Ejecutar builds completos
- Instalar en dispositivos de prueba
- Seguir guías paso a paso

**Leer:**
- [QUICK-START-ANDROID.md](./QUICK-START-ANDROID.md)
- [README-ELECTRON.md](./README-ELECTRON.md)

### Nivel 2: Intermedio
- Usar builds rápidos para desarrollo
- Configurar firma y auto-updater
- Personalizar configuraciones

**Leer:**
- [BUILD-ANDROID-GUIDE.md](./BUILD-ANDROID-GUIDE.md)
- [BUILD-ELECTRON-GUIDE.md](./BUILD-ELECTRON-GUIDE.md)

### Nivel 3: Avanzado
- Automatizar flujos completos
- CI/CD integration
- Multi-plataforma simultáneo

**Leer:**
- [BUILD-COMPARISON.md](./BUILD-COMPARISON.md)
- Documentación de electron-builder
- Documentación de Gradle

---

## 🔗 Enlaces Útiles

### Documentación Oficial
- [Capacitor](https://capacitorjs.com/docs)
- [Android Gradle](https://developer.android.com/studio/build)
- [Electron](https://www.electronjs.org/docs)
- [electron-builder](https://www.electron.build/)

### Herramientas
- [Android Studio](https://developer.android.com/studio)
- [Visual Studio Code](https://code.visualstudio.com/)
- [Git](https://git-scm.com/)

---

## 🎯 Resumen Ultra-Rápido

```bash
# 📱 ANDROID
# Desarrollo
node scripts/build-android-quick.cjs && adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# Producción
node scripts/build-android-apk.cjs
# Subir a Google Play

# 💻 ELECTRON
# Desarrollo
node scripts/build-electron-quick.cjs && ./release/win-unpacked/App.exe

# Producción
node scripts/build-electron-complete.cjs
node scripts/publish-electron-update.cjs
# Auto-updater maneja el resto

# ✅ ¡LISTO!
```

---

**🎉 Con esta guía maestra, tienes todo lo necesario para builds profesionales en ambas plataformas!**

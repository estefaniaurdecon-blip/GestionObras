# 🚀 Comandos de Build Android - Referencia Rápida

## 🎯 Comandos Principales

### Build Completo con Versión (Producción)
```bash
node scripts/build-android-apk.cjs
```
✅ Incrementa versión  
✅ Build web + sync + APKs  
✅ Debug + Release APKs  
✅ Organiza en `android-release/`  

---

### Build Rápido (Desarrollo)
```bash
node scripts/build-android-quick.cjs
```
✅ Solo Debug APK  
✅ Sin incremento de versión  
✅ Rápido para pruebas  

---

### Configurar Firma (Primera vez)
```bash
node scripts/setup-android-signing.cjs
```
🔐 Crea keystore  
🔐 Configura build.gradle  
🔐 Genera respaldo de información  

---

### Configurar Assets (Primera vez)
```bash
node scripts/setup-android-assets.cjs
```
🎨 Genera iconos (todos los tamaños)  
🎨 Genera splash screens  
🎨 Configura Capacitor Assets  

---

## 📋 Comandos Útiles Adicionales

### Instalar APK en Dispositivo
```bash
# Instalar Debug APK
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# Instalar Release APK
adb install -r android-release/Sistema-Gestion-Obras-*-release-*.apk

# Forzar reinstalación (desinstala primero)
adb uninstall com.partesdetrabajo.app
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

### Ver Logs en Tiempo Real
```bash
# Logs generales
adb logcat

# Filtrar por app
adb logcat | grep "Sistema"

# Limpiar logs y empezar de nuevo
adb logcat -c && adb logcat
```

### Build Manual (sin scripts)
```bash
# Web build
npm run build

# Sync Capacitor
npx cap sync android

# Debug APK
cd android && ./gradlew assembleDebug

# Release APK
cd android && ./gradlew assembleRelease

# Limpiar build
cd android && ./gradlew clean
```

### Generar AAB (Para Google Play)
```bash
cd android
./gradlew bundleRelease
# AAB en: app/build/outputs/bundle/release/app-release.aab
```

### Versión Manual
```bash
# Incrementar versión patch (2.3.4 → 2.3.5)
npm version patch

# Incrementar versión minor (2.3.4 → 2.4.0)
npm version minor

# Incrementar versión major (2.3.4 → 3.0.0)
npm version major
```

---

## 🔄 Flujos de Trabajo Comunes

### 1. Primera Configuración
```bash
git pull
npm install
node scripts/setup-android-assets.cjs
node scripts/setup-android-signing.cjs
node scripts/build-android-apk.cjs
```

### 2. Desarrollo Iterativo
```bash
# Hacer cambios en código...
node scripts/build-android-quick.cjs
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### 3. Release para Producción
```bash
git commit -am "Version x.x.x ready"
node scripts/build-android-apk.cjs
# Subir Release APK a Google Play
```

### 4. Actualización de Assets
```bash
# Después de cambiar icon.png o splash.png
node scripts/setup-android-assets.cjs
npm run build
npx cap sync android
```

---

## 🆘 Troubleshooting Rápido

### "Gradle not found"
```bash
# Verifica ANDROID_HOME
echo $ANDROID_HOME

# Si no está configurado, instala Android Studio
# y configura ANDROID_HOME en tu .bashrc o .zshrc
```

### "Java version error"
```bash
# Necesitas JDK 17
java -version

# Instala JDK 17 y configura JAVA_HOME
```

### "APK no instala"
```bash
# Desinstala versión anterior
adb uninstall com.partesdetrabajo.app

# Reinstala
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### "Release APK falla"
```bash
# Verifica que tengas keystore configurado
ls android/key.properties
ls android/my-release-key.jks

# Si no existe, configura firma
node scripts/setup-android-signing.cjs
```

### "Build muy lento"
```bash
# Limpia cache de Gradle
cd android
./gradlew clean
./gradlew --stop

# También limpia node_modules si es necesario
rm -rf node_modules
npm install
```

---

## 📁 Ubicaciones de Archivos

### APKs Generados
```
android/app/build/outputs/apk/debug/app-debug.apk
android/app/build/outputs/apk/release/app-release.apk
android-release/Sistema-Gestion-Obras-*-debug-*.apk
android-release/Sistema-Gestion-Obras-*-release-*.apk
```

### AABs Generados
```
android/app/build/outputs/bundle/release/app-release.aab
```

### Archivos de Firma (Sensibles)
```
android/my-release-key.jks              # BACKUP CRÍTICO
android/key.properties                   # Git-ignored
android/KEYSTORE-INFO-PRIVATE.txt       # Git-ignored
```

---

## 💡 Tips Profesionales

1. **Siempre commitea antes de build de producción:**
   ```bash
   git commit -am "Pre-build backup"
   ```

2. **Automatiza instalación después de build:**
   ```bash
   node scripts/build-android-quick.cjs && adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```

3. **Mantén respaldo de keystore:**
   ```bash
   cp android/my-release-key.jks ~/safe-backup/
   cp android/KEYSTORE-INFO-PRIVATE.txt ~/safe-backup/
   ```

4. **Prueba en múltiples dispositivos:**
   ```bash
   # Lista dispositivos conectados
   adb devices
   
   # Instala en dispositivo específico
   adb -s <device-id> install -r app.apk
   ```

5. **Reduce tamaño de APK (ya configurado en scripts):**
   - Usa Release build (optimizado automáticamente)
   - Minificación habilitada
   - ProGuard/R8 activo

---

## 📚 Documentación Completa

- [BUILD-ANDROID-GUIDE.md](./BUILD-ANDROID-GUIDE.md) - Guía completa
- [README-APK.md](./README-APK.md) - Configuración manual
- [ANDROID-SETUP.md](./ANDROID-SETUP.md) - Assets y configuración
- [QUICK-START-ANDROID.md](./QUICK-START-ANDROID.md) - Inicio rápido

---

## 🎯 Scripts Disponibles

| Script | Comando | Uso |
|--------|---------|-----|
| Build Completo | `node scripts/build-android-apk.cjs` | Producción/Release |
| Build Rápido | `node scripts/build-android-quick.cjs` | Desarrollo/Pruebas |
| Setup Firma | `node scripts/setup-android-signing.cjs` | Primera vez |
| Setup Assets | `node scripts/setup-android-assets.cjs` | Primera vez |
| Bump Version | `node scripts/version-bump.cjs` | Manual |
| Post Sync | (Automático con `cap sync`) | Configuración |

---

**✨ ¡Listo para construir apps Android profesionales!**

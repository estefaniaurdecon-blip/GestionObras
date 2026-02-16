# 🤖 Guía Completa de Build Automático - Android APK

## 📋 Scripts Disponibles

### 1️⃣ Build Completo con Versión (Recomendado para Releases)
```bash
node scripts/build-android-apk.cjs
```

**Qué hace:**
- ✅ Incrementa automáticamente la versión (package.json y build.gradle)
- ✅ Construye la aplicación web
- ✅ Sincroniza con Capacitor
- ✅ Actualiza versionCode en build.gradle
- ✅ Genera Debug APK
- ✅ Genera Release APK (si hay keystore configurado)
- ✅ Organiza APKs en carpeta `android-release/` con nombres descriptivos

**Resultado:**
```
android-release/
├── Sistema-Gestion-Obras-2.3.5-debug-2025-11-30.apk
└── Sistema-Gestion-Obras-2.3.5-release-2025-11-30.apk
```

### 2️⃣ Build Rápido (Para Pruebas)
```bash
node scripts/build-android-quick.cjs
```

**Qué hace:**
- ✅ Construye web
- ✅ Sincroniza con Android
- ✅ Genera solo Debug APK
- ❌ NO incrementa versión

**Uso:** Pruebas rápidas durante desarrollo.

### 3️⃣ Configurar Firma (Solo Primera Vez)
```bash
node scripts/setup-android-signing.cjs
```

**Qué hace:**
- 🔐 Crea keystore para firmar Release APK
- 🔐 Genera key.properties
- 🔐 Actualiza build.gradle con configuración de firma
- 🔐 Crea respaldo de información de firma

**IMPORTANTE:** Solo necesitas ejecutar esto UNA VEZ. Guarda la información generada en lugar seguro.

## 🚀 Flujo de Trabajo Recomendado

### Primera Vez (Setup)

```bash
# 1. Clonar proyecto
git pull
npm install

# 2. Configurar assets (iconos y splash)
node scripts/setup-android-assets.cjs

# 3. Configurar firma para Release (OPCIONAL pero recomendado)
node scripts/setup-android-signing.cjs

# 4. Primer build
node scripts/build-android-apk.cjs
```

### Desarrollo Diario

**Para pruebas rápidas:**
```bash
node scripts/build-android-quick.cjs
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

**Para release/versión:**
```bash
node scripts/build-android-apk.cjs
```

## 📱 Gestión de Versiones

### Versión Automática
El script `build-android-apk.cjs` incrementa automáticamente:
- `package.json` → version (2.3.4 → 2.3.5)
- `build.gradle` → versionCode (auto-incremento)
- `build.gradle` → versionName (sincronizado con package.json)

### Versión Manual
Si necesitas control específico:

```bash
# Editar manualmente package.json
npm version patch  # 2.3.4 → 2.3.5
npm version minor  # 2.3.4 → 2.4.0
npm version major  # 2.3.4 → 3.0.0

# Luego build
node scripts/build-android-apk.cjs
```

## 🔐 Configuración de Firma (Release APK)

### ¿Por qué necesito firma?

- **Debug APK**: No requiere firma especial, usa firma de debug automática
- **Release APK**: Requiere tu propia firma para:
  - Publicar en Google Play Store
  - Actualizaciones de la app (misma firma = puede actualizar)
  - Distribución profesional

### Setup de Firma

```bash
node scripts/setup-android-signing.cjs
```

El script te pedirá:
1. Contraseña del keystore
2. Contraseña de la clave
3. Alias de la clave
4. Información de identificación (nombre, organización, país)

**⚠️ CRÍTICO:**
- Guarda el archivo `KEYSTORE-INFO-PRIVATE.txt` en lugar seguro
- Haz backup de `my-release-key.jks`
- Si pierdes el keystore, NO podrás actualizar la app en Google Play

### Archivos Generados

```
android/
├── my-release-key.jks              # Keystore (CRÍTICO - hacer backup)
├── key.properties                   # Configuración (git-ignored)
└── KEYSTORE-INFO-PRIVATE.txt       # Info de respaldo (git-ignored)
```

Estos archivos están automáticamente en `.gitignore` por seguridad.

## 📦 Tipos de APK

### Debug APK
- **Uso:** Desarrollo y pruebas
- **Firma:** Automática (debug)
- **Tamaño:** Más grande (incluye debug info)
- **Ubicación:** `android/app/build/outputs/apk/debug/`

### Release APK
- **Uso:** Distribución y Google Play
- **Firma:** Tu keystore personal
- **Tamaño:** Optimizado y minificado
- **Ubicación:** `android/app/build/outputs/apk/release/`

## 🎯 Casos de Uso Comunes

### Caso 1: "Necesito probar cambios rápidamente"
```bash
node scripts/build-android-quick.cjs
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### Caso 2: "Voy a publicar una nueva versión"
```bash
node scripts/build-android-apk.cjs
# Luego sube el Release APK a Google Play Console
```

### Caso 3: "Necesito compartir APK con cliente"
```bash
# Si tienes keystore configurado
node scripts/build-android-apk.cjs
# Comparte: android-release/Sistema-Gestion-Obras-*-release-*.apk

# Si no tienes keystore (solo pruebas)
node scripts/build-android-quick.cjs
# Comparte: android/app/build/outputs/apk/debug/app-debug.apk
```

### Caso 4: "Instalé app anterior, nueva no instala"
```bash
# Desinstalar versión anterior primero
adb uninstall com.partesdetrabajo.app

# Luego instalar nueva
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

## 🔧 Troubleshooting

### Error: "Gradle not found"
```bash
# Asegúrate de tener Android SDK
# Opción 1: Abrir proyecto en Android Studio
# Opción 2: Verificar ANDROID_HOME
echo $ANDROID_HOME  # Linux/Mac
echo %ANDROID_HOME%  # Windows
```

### Error: "Java version incompatible"
```bash
# Necesitas JDK 17
# Verifica tu versión
java -version

# Si no es JDK 17, instala y configura JAVA_HOME
```

### Error: "No such file: my-release-key.jks"
```bash
# El Release APK necesita keystore
# Opción 1: Configurar firma
node scripts/setup-android-signing.cjs

# Opción 2: Solo usar Debug APK
node scripts/build-android-quick.cjs
```

### Error: "Build failed" genérico
```bash
# Limpiar y reintentar
cd android
./gradlew clean
cd ..
node scripts/build-android-apk.cjs
```

### APK muy grande (>100MB)
```bash
# Normal para Debug APK
# El Release APK es más pequeño (optimizado)
node scripts/build-android-apk.cjs  # Usa el Release APK
```

## 📊 Estructura de Directorios

```
proyecto/
├── android/                        # Proyecto Android
│   ├── app/
│   │   └── build/
│   │       └── outputs/
│   │           └── apk/
│   │               ├── debug/     # Debug APKs
│   │               └── release/   # Release APKs
│   ├── my-release-key.jks        # Keystore (git-ignored)
│   ├── key.properties            # Config firma (git-ignored)
│   └── KEYSTORE-INFO-PRIVATE.txt # Backup info (git-ignored)
├── android-release/               # APKs organizados (auto-creado)
│   ├── Sistema-Gestion-Obras-2.3.5-debug-2025-11-30.apk
│   └── Sistema-Gestion-Obras-2.3.5-release-2025-11-30.apk
└── scripts/
    ├── build-android-apk.cjs     # Build completo
    ├── build-android-quick.cjs   # Build rápido
    └── setup-android-signing.cjs # Configurar firma
```

## 🚀 Publicar en Google Play

1. **Preparar Release APK:**
   ```bash
   node scripts/build-android-apk.cjs
   ```

2. **Ir a Google Play Console:**
   - https://play.google.com/console

3. **Subir APK:**
   - Production → Create new release
   - Upload: `android-release/Sistema-Gestion-Obras-*-release-*.apk`
   - Completar release notes
   - Review y publish

4. **Versiones Futuras:**
   - Simplemente ejecuta `build-android-apk.cjs` de nuevo
   - La versión se incrementa automáticamente
   - Sube el nuevo APK a Google Play

## 💡 Tips Pro

1. **Backup automático antes de build:**
   ```bash
   git commit -am "Pre-build backup"
   node scripts/build-android-apk.cjs
   ```

2. **Instalar inmediatamente después de build:**
   ```bash
   node scripts/build-android-quick.cjs && adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```

3. **Ver logs durante instalación:**
   ```bash
   adb install -r app.apk
   adb logcat | grep "Sistema"
   ```

4. **Generar AAB en lugar de APK (para Google Play):**
   ```bash
   cd android
   ./gradlew bundleRelease
   # AAB en: app/build/outputs/bundle/release/
   ```

## 📚 Referencias

- [README-APK.md](./README-APK.md) - Guía manual detallada
- [ANDROID-SETUP.md](./ANDROID-SETUP.md) - Configuración de assets
- [QUICK-START-ANDROID.md](./QUICK-START-ANDROID.md) - Inicio rápido
- [Android Developer Docs](https://developer.android.com/studio/publish/app-signing)

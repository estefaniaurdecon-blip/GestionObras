# 🚀 Quick Start - Android con Nuevos Assets

## Configuración Rápida en 3 Pasos

### 1️⃣ Clonar y Setup Inicial
```bash
git pull
npm install
```

### 2️⃣ Generar Assets (Iconos y Splash Screen)
```bash
node scripts/setup-android-assets.cjs
```

Este script automáticamente:
- ✅ Genera icono de 192x192
- ✅ Instala @capacitor/assets (si es necesario)
- ✅ Genera todos los tamaños de iconos para Android
- ✅ Genera splash screens en todas las densidades

### 3️⃣ Compilar y Ejecutar
```bash
npm run build
npx cap sync android
npx cap run android
```

## 🎨 Resultado

Tu app Android tendrá:
- ✅ Nuevo icono profesional en el launcher
- ✅ Splash screen con branding al iniciar
- ✅ Nombre actualizado: "Sistema de Gestión de Obras"

## 🔄 Actualizaciones Futuras

Después de hacer `git pull` de nuevas actualizaciones:

```bash
npm install
npm run build
npx cap sync android
```

El comando `npx cap sync` ejecuta automáticamente `post-cap-sync.cjs` que regenera los assets necesarios.

## 📱 Generar APK para Distribución

### Debug APK (Pruebas)
```bash
cd android
./gradlew assembleDebug
```

APK en: `android/app/build/outputs/apk/debug/`

### Release APK (Producción)

Consulta [README-APK.md](./README-APK.md) para instrucciones completas de firma y distribución.

## 🆘 Problemas Comunes

### "Assets no se generan"
```bash
# Instalar manualmente y reintentar
npm install --save-dev @capacitor/assets
node scripts/setup-android-assets.cjs
```

### "Icono antiguo todavía aparece"
```bash
# Limpiar y reconstruir
cd android
./gradlew clean
cd ..
npm run build
npx cap sync android
```

### "No se ve el splash screen"
Verifica en `capacitor.config.ts` que la configuración de SplashScreen esté presente.

## 📚 Documentación Completa

- [README-APK.md](./README-APK.md) - Guía completa de Android
- [ANDROID-SETUP.md](./ANDROID-SETUP.md) - Detalles de configuración de assets
- [Capacitor Assets Docs](https://github.com/ionic-team/capacitor-assets)

# Guía para Generar APK de Producción

Esta guía te llevará paso a paso para generar un APK firmado y listo para publicar en Google Play Store.

## 📋 Requisitos Previos

1. Node.js instalado
2. Android Studio instalado (con SDK de Android)
3. Java JDK instalado
4. Proyecto sincronizado con Capacitor

## 🚀 Pasos para Generar APK de Producción

### 1. Configuración Inicial (Solo la primera vez)

Primero, asegúrate de tener la carpeta `android`:

```bash
npm install
npm run build
npx cap add android
npx cap sync android
```

### 2. Configurar Firma Digital (Solo la primera vez)

Ejecuta el script de configuración:

```bash
node scripts/setup-android-signing.cjs
```

Este script te pedirá:
- Contraseña para el keystore (mínimo 6 caracteres)
- Contraseña para la clave (puede ser la misma)
- Alias de la clave (puedes usar el predeterminado)
- Tu nombre y apellido
- Nombre de tu organización
- Ciudad, Estado/Provincia
- Código de país (ej. ES, MX, AR)

**⚠️ MUY IMPORTANTE:**
- Guarda la contraseña en un lugar seguro
- Haz backup de los archivos `android/my-release-key.keystore` y `android/key.properties`
- Si pierdes estos archivos, NO podrás actualizar tu app en Play Store

### 3. Generar APK de Producción

Una vez configurada la firma, ejecuta:

```bash
node scripts/build-android-release.cjs
```

Este script automáticamente:
- ✅ Incrementa la versión de la app
- ✅ Actualiza los metadatos de Android
- ✅ Construye la aplicación web
- ✅ Sincroniza con Capacitor
- ✅ Genera el APK firmado de producción

### 4. Ubicar el APK

El APK estará en:
```
android/app/build/outputs/apk/release/Sistema-de-Gestion-de-Obras-[version]-release.apk
```

## 🔄 Actualizaciones Posteriores

Para generar nuevas versiones:

```bash
node scripts/build-android-release.cjs
```

El script incrementará automáticamente la versión.

## 📱 Tipos de Build

| Comando | Tipo | Uso |
|---------|------|-----|
| `gradlew assembleDebug` | Debug | Desarrollo y pruebas |
| `gradlew assembleRelease` | Release | Play Store (requiere firma) |

## 🎯 Diferencias Debug vs Release

### APK Debug
- ❌ No está firmado profesionalmente
- ❌ No optimizado
- ❌ NO apto para Play Store
- ✅ Fácil de instalar para pruebas
- ✅ Más rápido de compilar

### APK Release
- ✅ Firmado con tu keystore
- ✅ Optimizado y minificado
- ✅ Listo para Google Play Store
- ✅ Versión profesional
- ⚠️ Requiere configuración de firma

## 🛡️ Seguridad del Keystore

**NUNCA:**
- ❌ Subas el keystore a repositorios públicos
- ❌ Compartas la contraseña públicamente
- ❌ Pierdas el archivo .keystore

**SIEMPRE:**
- ✅ Haz backup del keystore
- ✅ Guarda la contraseña en un gestor de contraseñas
- ✅ Mantén copias en lugares seguros

## 📦 Subir a Play Store

1. Ve a [Google Play Console](https://play.google.com/console)
2. Selecciona tu app
3. Ve a "Producción" → "Crear nueva versión"
4. Sube el APK/AAB desde `android/app/build/outputs/apk/release/`
5. Completa la información de la versión
6. Envía para revisión

## 🐛 Solución de Problemas

### Error: "SDK not found"
```bash
# Configura ANDROID_HOME en tu sistema
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools
```

### Error: "Keystore not found"
Ejecuta nuevamente: `node scripts/setup-android-signing.cjs`

### Error: "gradlew: command not found"
```bash
cd android
chmod +x gradlew
./gradlew assembleRelease
```

### APK muy grande
El APK de producción incluye optimizaciones, pero si es muy grande:
- Revisa las imágenes (comprímelas)
- Considera usar AAB en lugar de APK
- Revisa dependencias no utilizadas

## 📊 Versionado

La versión se maneja automáticamente con el sistema Semantic Versioning:
- `MAJOR.MINOR.PATCH` (ej. 2.0.4)
- El script incrementa el PATCH automáticamente
- Para cambios mayores, edita `package.json` manualmente antes de compilar

## ✅ Checklist Pre-Publicación

- [ ] APK generado con `build-android-release.cjs`
- [ ] APK probado en dispositivo real
- [ ] Keystore respaldado
- [ ] Contraseña guardada de forma segura
- [ ] Versión correcta en la app
- [ ] Screenshots y metadatos preparados para Play Store
- [ ] Política de privacidad publicada

## 🔗 Enlaces Útiles

- [Google Play Console](https://play.google.com/console)
- [Documentación Capacitor](https://capacitorjs.com/docs/android)
- [Guía de publicación Android](https://developer.android.com/studio/publish)

---

**¿Necesitas ayuda?** Revisa los logs de error en `android/app/build/outputs/logs/` o consulta la documentación oficial de Android.

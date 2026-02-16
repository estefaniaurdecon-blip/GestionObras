# Instalación y Configuración de la APK

## 🎨 Nuevos Assets (Iconos y Splash Screen)

La app ahora incluye nuevos elementos visuales profesionales:

### ✅ Icono de la App
- Diseño profesional con casco de construcción y planos
- Optimizado para diferentes tamaños de pantalla
- Con transparencia para mejor integración

### ✅ Splash Screen
- Pantalla de carga con gradiente naranja-azul
- Logo y nombre de la app
- Transición suave al contenido

### 📱 Generación Automática de Assets

Los iconos y splash screens se generan automáticamente ejecutando:

```bash
# Después de git pull
npm install

# Generar assets de Android (iconos y splash en todos los tamaños)
npx @capacitor/assets generate --android

# Sincronizar con Android
npm run build
npx cap sync android
```

**Nota**: El comando `npx cap sync` ejecuta automáticamente `scripts/post-cap-sync.cjs` que genera los iconos base en formato 192x192.

## Requisitos Previos para Generar la APK

### 1. Configuración del Proyecto

Después de hacer `git pull` del proyecto, ejecuta:

```bash
npm install
npx cap sync
npm run build
```

### 2. Permisos Necesarios en Android

La aplicación necesita los siguientes permisos en `android/app/src/main/AndroidManifest.xml`:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    
    <!-- Permisos necesarios para la aplicación -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" 
                     android:maxSdkVersion="32" />
    <uses-permission android:name="android.permission.CAMERA" />
    
    <!-- Para Android 13+ (API 33+) -->
    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
    <uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
    <uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />
    
    <application
        android:allowBackup="true"
        android:requestLegacyExternalStorage="true"
        android:usesCleartextTraffic="true">
        <!-- ... resto de la configuración ... -->
    </application>
</manifest>
```

### 3. Configuración de Gradle

Asegúrate de que `android/app/build.gradle` incluya:

```gradle
android {
    namespace "com.partesdetrabajo.app"
    compileSdk 34
    
    defaultConfig {
        minSdk 22
        targetSdk 34
    }
}
```

## Generar la APK

### Opción 1: APK de Debug (Pruebas)

```bash
cd android
./gradlew assembleDebug
```

La APK se generará en: `android/app/build/outputs/apk/debug/app-debug.apk`

### Opción 2: APK de Release (Producción)

1. Primero, necesitas generar una keystore (solo la primera vez):

```bash
keytool -genkey -v -keystore my-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias my-key-alias
```

2. Configura `android/key.properties`:

```properties
storePassword=tu-contraseña
keyPassword=tu-contraseña
keyAlias=my-key-alias
storeFile=../my-release-key.jks
```

3. Genera la APK firmada:

```bash
cd android
./gradlew assembleRelease
```

La APK se generará en: `android/app/build/outputs/apk/release/app-release.apk`

## Instalación en el Dispositivo

### Método 1: Usando ADB

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### Método 2: Transferencia Directa

1. Transfiere el archivo APK al dispositivo (USB, email, etc.)
2. En el dispositivo, ve a Configuración > Seguridad > Orígenes desconocidos (habilitar)
3. Abre el archivo APK con un administrador de archivos
4. Acepta los permisos solicitados

## Solución de Problemas Comunes

### Error: "Los partes de trabajo no se generan"

**Causa**: Problemas con permisos de almacenamiento o configuración de jsPDF.

**Soluciones**:

1. **Verificar permisos en tiempo de ejecución**:
   - Al instalar la APK, asegúrate de aceptar TODOS los permisos solicitados
   - Ve a Configuración > Aplicaciones > Partes de Trabajo > Permisos
   - Habilita: Almacenamiento, Cámara

2. **Logs de depuración**:
   ```bash
   adb logcat | grep -i "pdf\|capacitor\|filesystem"
   ```

3. **Limpiar caché**:
   ```bash
   cd android
   ./gradlew clean
   npm run build
   npx cap sync
   ```

### Error: "App no instalada"

**Causa**: Conflicto con versión anterior o firma incorrecta.

**Solución**:
```bash
adb uninstall com.partesdetrabajo.app
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

### Error: "Archivo PDF no se guarda"

**Causa**: Directorio de almacenamiento no accesible.

**Solución**:
- La app ahora usa `Directory.Documents` que es más confiable
- Los archivos se guardan en la carpeta de documentos del dispositivo
- Se abre automáticamente un diálogo para compartir/abrir el PDF

### Error al compilar: "SDK not found"

**Solución**:
1. Instala Android Studio
2. Abre el proyecto `android/` en Android Studio
3. Acepta las actualizaciones de SDK sugeridas
4. Vuelve a intentar la compilación

## Verificación Post-Instalación

1. **Abrir la app** y verificar que carga correctamente
2. **Probar inicio de sesión** con credenciales válidas
3. **Crear un parte de trabajo** simple
4. **Generar PDF** y verificar que:
   - Aparece el diálogo de compartir
   - El archivo se puede abrir con un lector PDF
   - El contenido del PDF es correcto

## Actualización de la App

Para actualizar una versión ya instalada:

1. Incrementa el `versionCode` en `android/app/build.gradle`:
```gradle
defaultConfig {
    versionCode 2  // Incrementar
    versionName "1.1"  // Actualizar
}
```

2. Compila la nueva APK
3. Instala sobre la versión anterior (no es necesario desinstalar)

## Notas Importantes

- **Compilación local**: El archivo `capacitor.config.ts` está configurado para usar archivos locales (no el servidor de desarrollo). Esto es correcto para la APK.
- **Primera ejecución**: La primera vez que se ejecuta la app, puede tardar más en cargar.
- **Conexión a Internet**: La app requiere conexión para sincronizar con Supabase.
- **Almacenamiento**: Los PDFs se guardan en la carpeta "Documents" del dispositivo.

## Contacto y Soporte

Si encuentras problemas adicionales, revisa:
1. Los logs de Android Studio / ADB
2. La consola del navegador web (versión web de la app)
3. Los mensajes de error mostrados en la app

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('📱 ========================================');
console.log('📱 Build Automático de APK Android');
console.log('📱 ========================================\n');

// Función para leer la versión actual
function getCurrentVersion() {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8')
  );
  return packageJson.version;
}

// Función para actualizar build.gradle con la nueva versión
function updateBuildGradle(version) {
  const gradlePath = path.join(__dirname, '../android/app/build.gradle');
  
  if (!fs.existsSync(gradlePath)) {
    console.log('⚠️  build.gradle no encontrado. Ejecuta "npx cap add android" primero.');
    return false;
  }

  let gradleContent = fs.readFileSync(gradlePath, 'utf8');
  
  // Extraer el versionCode actual y incrementarlo
  const versionCodeMatch = gradleContent.match(/versionCode\s+(\d+)/);
  const currentVersionCode = versionCodeMatch ? parseInt(versionCodeMatch[1]) : 1;
  const newVersionCode = currentVersionCode + 1;
  
  // Actualizar versionCode y versionName
  gradleContent = gradleContent.replace(
    /versionCode\s+\d+/,
    `versionCode ${newVersionCode}`
  );
  gradleContent = gradleContent.replace(
    /versionName\s+"[^"]+"/,
    `versionName "${version}"`
  );
  
  fs.writeFileSync(gradlePath, gradleContent);
  console.log(`✅ build.gradle actualizado: versionCode ${newVersionCode}, versionName "${version}"`);
  return true;
}

// Función para crear el directorio de release si no existe
function ensureReleaseDir() {
  const releaseDir = path.join(__dirname, '../android-release');
  if (!fs.existsSync(releaseDir)) {
    fs.mkdirSync(releaseDir, { recursive: true });
  }
  return releaseDir;
}

// Función para copiar y renombrar APKs
function copyApks(version, releaseDir) {
  const debugApk = path.join(__dirname, '../android/app/build/outputs/apk/debug/app-debug.apk');
  const releaseApk = path.join(__dirname, '../android/app/build/outputs/apk/release/app-release.apk');
  
  const timestamp = new Date().toISOString().split('T')[0];
  
  // Copiar debug APK si existe
  if (fs.existsSync(debugApk)) {
    const debugDest = path.join(releaseDir, `Sistema-Gestion-Obras-${version}-debug-${timestamp}.apk`);
    fs.copyFileSync(debugApk, debugDest);
    console.log(`✅ Debug APK copiado: ${path.basename(debugDest)}`);
  }
  
  // Copiar release APK si existe
  if (fs.existsSync(releaseApk)) {
    const releaseDest = path.join(releaseDir, `Sistema-Gestion-Obras-${version}-release-${timestamp}.apk`);
    fs.copyFileSync(releaseApk, releaseDest);
    console.log(`✅ Release APK copiado: ${path.basename(releaseDest)}`);
  }
}

// Función principal
async function buildAndroid() {
  try {
    // Paso 1: Incrementar versión
    console.log('📌 Paso 1: Incrementando versión...\n');
    execSync('node scripts/version-bump.cjs', { stdio: 'inherit' });
    
    const currentVersion = getCurrentVersion();
    console.log(`\n✅ Nueva versión: ${currentVersion}\n`);
    
    // Paso 2: Construir la aplicación web
    console.log('📦 Paso 2: Construyendo aplicación web...\n');
    execSync('npm run build', { stdio: 'inherit' });
    console.log('\n✅ Build web completado\n');
    
    // Paso 3: Sincronizar con Android
    console.log('🔄 Paso 3: Sincronizando con Android...\n');
    execSync('npx cap sync android', { stdio: 'inherit' });
    console.log('\n✅ Sincronización completada\n');
    
    // Paso 4: Actualizar build.gradle
    console.log('⚙️  Paso 4: Actualizando build.gradle...\n');
    if (!updateBuildGradle(currentVersion)) {
      process.exit(1);
    }
    console.log('');
    
    // Paso 5: Limpiar build anterior
    console.log('🧹 Paso 5: Limpiando builds anteriores...\n');
    try {
      execSync('cd android && ./gradlew clean', { stdio: 'inherit' });
      console.log('\n✅ Limpieza completada\n');
    } catch (error) {
      console.log('⚠️  No se pudo limpiar (es normal en primera ejecución)\n');
    }
    
    // Paso 6: Construir Debug APK
    console.log('🔨 Paso 6: Construyendo Debug APK...\n');
    execSync('cd android && ./gradlew assembleDebug', { stdio: 'inherit' });
    console.log('\n✅ Debug APK construido\n');
    
    // Paso 7: Construir Release APK (si existe keystore)
    const keystorePath = path.join(__dirname, '../android/key.properties');
    if (fs.existsSync(keystorePath)) {
      console.log('🔨 Paso 7: Construyendo Release APK...\n');
      execSync('cd android && ./gradlew assembleRelease', { stdio: 'inherit' });
      console.log('\n✅ Release APK construido\n');
    } else {
      console.log('⚠️  Paso 7: Release APK omitido (no hay keystore configurado)\n');
      console.log('   Para generar Release APK, configura android/key.properties\n');
    }
    
    // Paso 8: Copiar APKs al directorio de release
    console.log('📦 Paso 8: Organizando archivos APK...\n');
    const releaseDir = ensureReleaseDir();
    copyApks(currentVersion, releaseDir);
    
    // Resumen final
    console.log('\n✨ ========================================');
    console.log('✨ Build Completado Exitosamente');
    console.log('✨ ========================================\n');
    console.log(`📱 Versión: ${currentVersion}`);
    console.log(`📂 APKs disponibles en: android-release/\n`);
    console.log('📋 Archivos generados:');
    
    const files = fs.readdirSync(releaseDir).filter(f => f.includes(currentVersion));
    files.forEach(file => {
      const filePath = path.join(releaseDir, file);
      const stats = fs.statSync(filePath);
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      console.log(`   - ${file} (${sizeMB} MB)`);
    });
    
    console.log('\n💡 Próximos pasos:');
    console.log('   1. Instalar Debug APK para pruebas:');
    console.log('      adb install -r android-release/Sistema-Gestion-Obras-*-debug-*.apk');
    console.log('   2. Para Release APK, primero configura signing (ver README-APK.md)');
    console.log('   3. Publica en Google Play o distribuye directamente\n');
    
  } catch (error) {
    console.error('\n❌ Error durante el build:', error.message);
    console.log('\n💡 Soluciones posibles:');
    console.log('   1. Verifica que Android Studio esté instalado');
    console.log('   2. Ejecuta: npx cap add android (si es primera vez)');
    console.log('   3. Verifica JAVA_HOME y ANDROID_HOME');
    console.log('   4. Revisa los logs arriba para más detalles\n');
    process.exit(1);
  }
}

// Ejecutar el build
buildAndroid();

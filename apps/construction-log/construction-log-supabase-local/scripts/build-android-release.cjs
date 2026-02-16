const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Construyendo APK de PRODUCCIÓN firmado...\n');

// Verificar que existe la configuración de firma
const keyPropertiesPath = path.join(__dirname, '../android/key.properties');
const keystorePath = path.join(__dirname, '../android/my-release-key.keystore');

if (!fs.existsSync(keyPropertiesPath) || !fs.existsSync(keystorePath)) {
  console.error('❌ No se encontró la configuración de firma.');
  console.log('\n   Ejecuta primero: node scripts/setup-android-signing.cjs\n');
  process.exit(1);
}

// Verificar configuración de Capacitor (no debe tener URL remota para producción)
console.log('🔍 Verificando configuración de Capacitor...');
const capacitorConfigPath = path.join(__dirname, '../capacitor.config.ts');
if (fs.existsSync(capacitorConfigPath)) {
  const configContent = fs.readFileSync(capacitorConfigPath, 'utf8');
  if (configContent.includes('url:') && configContent.includes('lovableproject.com')) {
    console.error('❌ ERROR: capacitor.config.ts contiene una URL de servidor remoto');
    console.error('   La APK de producción NO funcionará con una URL remota.');
    console.error('   Comenta o elimina la sección "server" en capacitor.config.ts\n');
    process.exit(1);
  }
}
console.log('✅ Configuración OK\n');

try {
  // 1. Incrementar versión
  console.log('📌 Incrementando versión...');
  execSync('node scripts/version-bump.cjs patch', { stdio: 'inherit' });

  // 2. Leer la nueva versión
  const packagePath = path.join(__dirname, '../package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const newVersion = packageJson.version;
  
  console.log(`✅ Versión: ${newVersion}\n`);

  // 3. Actualizar strings.xml
  console.log('📱 Actualizando metadatos...');
  execSync('node scripts/configure-android-metadata.cjs', { stdio: 'inherit' });

  // 4. Construir web app
  console.log('\n📦 Construyendo aplicación web...');
  execSync('npm run build', { stdio: 'inherit' });

  // Verificar que dist existe y tiene contenido
  const distPath = path.join(__dirname, '../dist');
  if (!fs.existsSync(distPath)) {
    throw new Error('La carpeta dist no existe. El build falló.');
  }
  const distFiles = fs.readdirSync(distPath);
  console.log(`📁 Archivos en dist: ${distFiles.length} archivos`);
  if (!distFiles.includes('index.html')) {
    throw new Error('index.html no encontrado en dist. El build falló.');
  }
  console.log('✅ Build web verificado\n');

  // 5. Sincronizar con Capacitor
  console.log('🔄 Sincronizando con Capacitor...');
  execSync('npx cap sync android', { stdio: 'inherit' });
  
  // Verificar que los assets se copiaron correctamente
  const assetsPath = path.join(__dirname, '../android/app/src/main/assets/public');
  if (fs.existsSync(assetsPath)) {
    const assetFiles = fs.readdirSync(assetsPath);
    console.log(`📁 Assets copiados a Android: ${assetFiles.length} archivos`);
    if (!assetFiles.includes('index.html')) {
      console.error('⚠️  ADVERTENCIA: index.html NO encontrado en assets de Android');
    }
  } else {
    throw new Error('Carpeta de assets de Android no encontrada después de sync');
  }
  console.log('✅ Sync completado\n');

  // 6. Construir APK firmado
  console.log('⚡ Construyendo APK de producción firmado...');
  const isWindows = process.platform === 'win32';
  const gradlewCmd = isWindows ? 'gradlew.bat' : './gradlew';
  execSync(`cd android && ${gradlewCmd} assembleRelease`, { stdio: 'inherit' });

  const apkPath = path.join(__dirname, '../android/app/build/outputs/apk/release');
  
  if (!fs.existsSync(apkPath)) {
    console.error('❌ No se encontró el directorio de salida del APK');
    process.exit(1);
  }
  
  // Buscar cualquier archivo APK generado
  const apkFiles = fs.readdirSync(apkPath).filter(f => f.endsWith('.apk'));
  
  if (apkFiles.length === 0) {
    console.error('❌ No se encontró ningún archivo APK generado');
    console.log(`   Buscado en: ${apkPath}`);
    process.exit(1);
  }
  
  // Usar el primer APK encontrado
  const originalApk = apkFiles[0];
  const fullApkPath = path.join(apkPath, originalApk);
  
  // Renombrar el APK con el nombre de la app y versión
  const newApkName = `Partes-de-Trabajo-${newVersion}-release.apk`;
  const newApkPath = path.join(apkPath, newApkName);
  fs.copyFileSync(fullApkPath, newApkPath);
  
  console.log('\n✅ ¡APK de PRODUCCIÓN generado exitosamente!\n');
  console.log('📁 Ubicación:');
  console.log(`   ${newApkPath}`);
  console.log(`\n📦 Versión: ${newVersion}`);
  console.log('🎯 Este APK está firmado y listo para Google Play Store\n');

} catch (error) {
  console.error('\n❌ Error durante la construcción:', error.message);
  process.exit(1);
}

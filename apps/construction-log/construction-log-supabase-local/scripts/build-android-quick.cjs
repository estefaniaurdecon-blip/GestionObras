const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('⚡ ========================================');
console.log('⚡ Build Rápido - Solo Debug APK');
console.log('⚡ ========================================\n');

// NO incrementa versión, solo construye rápido para pruebas

async function quickBuild() {
  try {
    // Paso 0: Verificar que no hay URL de servidor remoto
    console.log('🔍 Paso 0: Verificando configuración de Capacitor...\n');
    const capacitorConfigPath = path.join(__dirname, '../capacitor.config.ts');
    if (fs.existsSync(capacitorConfigPath)) {
      const configContent = fs.readFileSync(capacitorConfigPath, 'utf8');
      if (configContent.includes('url:') && configContent.includes('lovableproject.com')) {
        console.log('⚠️  ADVERTENCIA: capacitor.config.ts contiene una URL de servidor remoto');
        console.log('⚠️  Para producción, esto debe ser eliminado o la app no funcionará offline\n');
      } else {
        console.log('✅ Configuración de Capacitor OK (sin servidor remoto)\n');
      }
    }

    // Paso 1: Build web
    console.log('📦 Paso 1: Build web...\n');
    execSync('npm run build', { stdio: 'inherit' });
    console.log('\n✅ Build web completado\n');
    
    // Verificar que dist existe y tiene contenido
    const distPath = path.join(__dirname, '../dist');
    if (!fs.existsSync(distPath)) {
      throw new Error('La carpeta dist no existe. El build falló.');
    }
    const distFiles = fs.readdirSync(distPath);
    console.log(`📁 Archivos en dist: ${distFiles.length} archivos\n`);
    
    // Paso 2: Sync Android
    console.log('🔄 Paso 2: Sync Android...\n');
    execSync('npx cap sync android', { stdio: 'inherit' });
    console.log('\n✅ Sync completado\n');
    
    // Verificar que los assets se copiaron correctamente
    const assetsPath = path.join(__dirname, '../android/app/src/main/assets/public');
    if (fs.existsSync(assetsPath)) {
      const assetFiles = fs.readdirSync(assetsPath);
      console.log(`📁 Assets copiados a Android: ${assetFiles.length} archivos\n`);
      if (assetFiles.includes('index.html')) {
        console.log('✅ index.html encontrado en assets\n');
      } else {
        console.log('⚠️  ADVERTENCIA: index.html NO encontrado en assets\n');
      }
    } else {
      console.log('⚠️  ADVERTENCIA: Carpeta de assets no encontrada\n');
    }
    
    // Paso 3: Build Debug APK
    console.log('🔨 Paso 3: Build Debug APK...\n');
    const isWindows = process.platform === 'win32';
    const gradleCmd = isWindows ? 'cd android && gradlew.bat assembleDebug' : 'cd android && ./gradlew assembleDebug';
    execSync(gradleCmd, { stdio: 'inherit' });
    console.log('\n✅ Debug APK construido\n');
    
    // Ubicación del APK
    const apkPath = path.join(__dirname, '../android/app/build/outputs/apk/debug/app-debug.apk');
    
    if (fs.existsSync(apkPath)) {
      const stats = fs.statSync(apkPath);
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      
      console.log('✅ ========================================');
      console.log('✅ Build Rápido Completado');
      console.log('✅ ========================================\n');
      console.log(`📱 APK Debug: android/app/build/outputs/apk/debug/app-debug.apk`);
      console.log(`📊 Tamaño: ${sizeMB} MB\n`);
      console.log('💡 Instalar en dispositivo:');
      console.log('   adb install -r android/app/build/outputs/apk/debug/app-debug.apk\n');
      console.log('📝 Nota: Este build NO incrementa la versión (para pruebas rápidas)\n');
    } else {
      console.log('⚠️  APK no encontrado en la ubicación esperada');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

quickBuild();

const { execSync } = require('child_process');

console.log('🔄 Ejecutando configuraciones post-sync...\n');

try {
  // Generar iconos de Android
  console.log('📱 Generando iconos...');
  execSync('node scripts/generate-android-icons.cjs', { stdio: 'inherit' });
  
  // Configurar permisos de Android
  execSync('node scripts/configure-android-permissions.cjs', { stdio: 'inherit' });
  
  // Configurar el nombre del APK
  execSync('node scripts/configure-android-apk.cjs', { stdio: 'inherit' });
  
  // Configurar metadatos de la aplicación
  execSync('node scripts/configure-android-metadata.cjs', { stdio: 'inherit' });
  
  console.log('\n✅ Configuraciones completadas');
} catch (error) {
  console.error('❌ Error en las configuraciones:', error.message);
  process.exit(1);
}

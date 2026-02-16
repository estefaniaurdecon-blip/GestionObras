const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Construyendo AAB (App Bundle) de PRODUCCIÓN firmado...\n');

// Verificar que existe la configuración de firma
const keyPropertiesPath = path.join(__dirname, '../android/key.properties');
const keystorePath = path.join(__dirname, '../android/my-release-key.keystore');

if (!fs.existsSync(keyPropertiesPath) || !fs.existsSync(keystorePath)) {
  console.error('❌ No se encontró la configuración de firma.');
  console.log('\n   Ejecuta primero: node scripts/setup-android-signing.cjs\n');
  process.exit(1);
}

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

  // 5. Sincronizar con Capacitor
  console.log('\n🔄 Sincronizando con Capacitor...');
  execSync('npx cap sync android', { stdio: 'inherit' });

  // 6. Construir AAB firmado (App Bundle)
  console.log('\n⚡ Construyendo App Bundle (AAB) de producción firmado...');
  const isWindows = process.platform === 'win32';
  const gradlewCmd = isWindows ? 'gradlew.bat' : './gradlew';
  execSync(`cd android && ${gradlewCmd} bundleRelease`, { stdio: 'inherit' });

  const aabPath = path.join(__dirname, '../android/app/build/outputs/bundle/release');
  const aabFile = 'app-release.aab';
  const fullAabPath = path.join(aabPath, aabFile);
  
  if (fs.existsSync(fullAabPath)) {
    // Renombrar el AAB con el nombre de la app y versión
    const newAabName = `Partes-de-Trabajo-${newVersion}-release.aab`;
    const newAabPath = path.join(aabPath, newAabName);
    fs.copyFileSync(fullAabPath, newAabPath);
    
    console.log('\n✅ ¡App Bundle (AAB) de PRODUCCIÓN generado exitosamente!\n');
    console.log('📁 Ubicación:');
    console.log(`   ${newAabPath}`);
    console.log(`\n📦 Versión: ${newVersion}`);
    console.log('🎯 Este AAB está firmado y listo para Google Play Store');
    console.log('📋 Formato requerido por Google Play para publicación en Producción\n');
  } else {
    console.error('❌ No se encontró el archivo AAB generado');
    process.exit(1);
  }

} catch (error) {
  console.error('\n❌ Error durante la construcción:', error.message);
  process.exit(1);
}

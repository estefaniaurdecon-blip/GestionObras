const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Iniciando construcción de la aplicación Android...');

try {
  // 0. Incrementar versión automáticamente
  console.log('📌 Incrementando versión automáticamente...');
  execSync('node scripts/version-bump.cjs patch', { stdio: 'inherit' });

  // 1. Leer la nueva versión del package.json
  const packagePath = path.join(__dirname, '../package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const newVersion = packageJson.version;
  
  console.log(`✅ Nueva versión: ${newVersion}`);

  // 2. Actualizar version en strings.xml
  console.log('📱 Actualizando metadatos de Android...');
  const stringsPath = path.join(__dirname, '../android/app/src/main/res/values/strings.xml');
  const stringsDir = path.dirname(stringsPath);
  
  if (!fs.existsSync(stringsDir)) {
    fs.mkdirSync(stringsDir, { recursive: true });
  }
  
  const stringsContent = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Sistema de Gestion de Obras</string>
    <string name="title_activity_main">Sistema de Gestion de Obras</string>
    <string name="package_name">com.partesdetrabajo.app</string>
    <string name="custom_url_scheme">com.partesdetrabajo.app</string>
    <string name="version_name">${newVersion}</string>
    <string name="creator_name">Tony Bautista</string>
</resources>
`;
  
  fs.writeFileSync(stringsPath, stringsContent);
  console.log(`✅ Versión ${newVersion} actualizada en strings.xml`);

  // 3. Actualizar versionName en build.gradle
  const gradlePath = path.join(__dirname, '../android/app/build.gradle');
  
  if (fs.existsSync(gradlePath)) {
    let gradleContent = fs.readFileSync(gradlePath, 'utf8');
    
    if (gradleContent.includes('versionName')) {
      gradleContent = gradleContent.replace(/versionName\s+"[^"]*"/, `versionName "${newVersion}"`);
      fs.writeFileSync(gradlePath, gradleContent);
      console.log(`✅ Versión ${newVersion} actualizada en build.gradle`);
    }
  }

  // 4. Construir la aplicación web
  console.log('📦 Construyendo la aplicación web...');
  execSync('npm run build', { stdio: 'inherit' });

  // 5. Sincronizar con Capacitor
  console.log('🔄 Sincronizando con Capacitor...');
  execSync('npx cap sync android', { stdio: 'inherit' });

  // 6. Construir el APK
  console.log('⚡ Construyendo APK...');
  execSync('cd android && ./gradlew assembleRelease', { stdio: 'inherit' });

  console.log('✅ ¡APK construido exitosamente!');
  console.log(`📁 El APK está en: android/app/build/outputs/apk/release/`);
  console.log(`📦 Versión: ${newVersion}`);

} catch (error) {
  console.error('❌ Error durante la construcción:', error.message);
  process.exit(1);
}

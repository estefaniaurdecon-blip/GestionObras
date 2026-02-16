const fs = require('fs');
const path = require('path');

console.log('📱 Configurando metadatos de la aplicación Android...');

const stringsPath = path.join(__dirname, '../android/app/src/main/res/values/strings.xml');
const stringsDir = path.dirname(stringsPath);

// Crear directorio si no existe
if (!fs.existsSync(stringsDir)) {
  fs.mkdirSync(stringsDir, { recursive: true });
}

// Leer la versión actual del package.json
const packagePath = path.join(__dirname, '../package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const currentVersion = packageJson.version || '2.0.4';

// Contenido del archivo strings.xml con metadatos correctos
const stringsContent = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Sistema de Gestion de Obras</string>
    <string name="title_activity_main">Sistema de Gestion de Obras</string>
    <string name="package_name">com.partesdetrabajo.app</string>
    <string name="custom_url_scheme">com.partesdetrabajo.app</string>
    <string name="version_name">${currentVersion}</string>
    <string name="creator_name">Tony Bautista</string>
</resources>
`;

fs.writeFileSync(stringsPath, stringsContent);
console.log('✅ Archivo strings.xml creado/actualizado con metadatos correctos');

// Verificar y actualizar build.gradle si existe
const gradlePath = path.join(__dirname, '../android/app/build.gradle');

if (fs.existsSync(gradlePath)) {
  let gradleContent = fs.readFileSync(gradlePath, 'utf8');
  
  // Actualizar versionName si existe
  if (gradleContent.includes('versionName')) {
    gradleContent = gradleContent.replace(/versionName\s+"[^"]*"/, `versionName "${currentVersion}"`);
    fs.writeFileSync(gradlePath, gradleContent);
    console.log(`✅ Versión actualizada a ${currentVersion} en build.gradle`);
  }
}

console.log('\n📦 Metadatos configurados:');
console.log('   Nombre: Sistema de Gestion de Obras');
console.log(`   Versión: ${currentVersion}`);
console.log('   Creador: Tony Bautista\n');

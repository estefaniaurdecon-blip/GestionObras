const fs = require('fs');
const path = require('path');

console.log('📱 Configurando nombre del APK de Android...');

const gradlePath = path.join(__dirname, '../android/app/build.gradle');

if (!fs.existsSync(gradlePath)) {
  console.log('⚠️  No se encontró android/app/build.gradle');
  console.log('   Ejecuta "npx cap add android" primero');
  process.exit(1);
}

let gradleContent = fs.readFileSync(gradlePath, 'utf8');

// Configurar el nombre del archivo APK y metadatos
const apkNameConfig = `
    // Configuración personalizada del nombre del APK y metadatos
    applicationVariants.all { variant ->
        variant.outputs.all { output ->
            def version = variant.versionName
            def buildType = variant.buildType.name
            outputFileName = "Sistema-de-Gestion-de-Obras-\${version}-\${buildType}.apk"
        }
    }
`;

// Buscar la sección android { }
if (gradleContent.includes('applicationVariants.all')) {
  console.log('✅ La configuración del nombre del APK ya existe');
} else {
  // Agregar la configuración después de defaultConfig
  const defaultConfigEnd = gradleContent.indexOf('}', gradleContent.indexOf('defaultConfig {'));
  
  if (defaultConfigEnd !== -1) {
    gradleContent = gradleContent.slice(0, defaultConfigEnd + 1) + 
                   '\n' + apkNameConfig + 
                   gradleContent.slice(defaultConfigEnd + 1);
    
    fs.writeFileSync(gradlePath, gradleContent);
    console.log('✅ Configuración del nombre del APK agregada');
  } else {
    console.log('⚠️  No se pudo encontrar la sección defaultConfig');
  }
}

console.log('\n📦 El APK se generará como: Sistema-de-Gestion-de-Obras-[version]-[buildType].apk');
console.log('   Ejemplo: Sistema-de-Gestion-de-Obras-2.0.0-debug.apk\n');

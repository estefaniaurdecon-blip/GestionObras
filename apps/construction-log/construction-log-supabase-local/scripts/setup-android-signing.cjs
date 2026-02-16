const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function setupSigning() {
  console.log('🔐 Configuración de firma para Android Release\n');
  
  const keystorePath = path.join(__dirname, '../android/my-release-key.keystore');
  const keyPropertiesPath = path.join(__dirname, '../android/key.properties');
  
  // Verificar si ya existe
  if (fs.existsSync(keystorePath)) {
    const overwrite = await question('⚠️  Ya existe un keystore. ¿Deseas crear uno nuevo? (s/N): ');
    if (overwrite.toLowerCase() !== 's') {
      console.log('ℹ️ No se creará un nuevo keystore. Verificando/actualizando configuración de firma en build.gradle...');
      await updateBuildGradle();
      console.log('✅ Configuración de firma verificada/actualizada');
      rl.close();
      return;
    }
  }
  
  console.log('\n📝 Necesitarás ingresar la siguiente información:');
  console.log('   - Contraseña del keystore (mínimo 6 caracteres)');
  console.log('   - Nombre y apellido');
  console.log('   - Organización');
  console.log('   - Ciudad, Estado, País\n');
  
  const storePassword = await question('Contraseña del keystore: ');
  const keyPassword = await question('Contraseña de la clave (Enter para usar la misma): ') || storePassword;
  const keyAlias = await question('Alias de la clave (Enter para usar "my-key-alias"): ') || 'my-key-alias';
  
  const name = await question('Nombre y apellido: ');
  const organization = await question('Organización: ');
  const city = await question('Ciudad: ');
  const state = await question('Estado/Provincia: ');
  const country = await question('Código de país (ej. ES, MX, AR): ');
  
  console.log('\n🔑 Generando keystore...');
  
  try {
    // Generar keystore
    const dname = `CN=${name}, O=${organization}, L=${city}, ST=${state}, C=${country}`;
    const keystoreCmd = `keytool -genkey -v -keystore "${keystorePath}" -alias "${keyAlias}" -keyalg RSA -keysize 2048 -validity 10000 -storepass "${storePassword}" -keypass "${keyPassword}" -dname "${dname}"`;
    
    execSync(keystoreCmd, { stdio: 'inherit' });
    console.log('✅ Keystore generado exitosamente');
    
    // Crear key.properties
    const keyPropertiesContent = `storePassword=${storePassword}
keyPassword=${keyPassword}
keyAlias=${keyAlias}
storeFile=my-release-key.keystore
`;
    
    fs.writeFileSync(keyPropertiesPath, keyPropertiesContent);
    console.log('✅ Archivo key.properties creado');
    
    // Actualizar build.gradle
    await updateBuildGradle();
    
    console.log('\n✅ ¡Configuración completada!\n');
    console.log('⚠️  IMPORTANTE: Guarda estos archivos de forma segura:');
    console.log(`   - ${keystorePath}`);
    console.log(`   - ${keyPropertiesPath}`);
    console.log('\n   Si los pierdes, NO podrás actualizar tu app en Play Store.\n');
    console.log('📦 Ahora puedes ejecutar: npm run build-android-release\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  rl.close();
}

async function updateBuildGradle() {
  const gradlePath = path.join(__dirname, '../android/app/build.gradle');
  
  if (!fs.existsSync(gradlePath)) {
    console.log('⚠️  build.gradle no encontrado. Ejecuta "npx cap sync android" primero.');
    return;
  }
  
  let gradleContent = fs.readFileSync(gradlePath, 'utf8');
  
  // Verificar si ya tiene la configuración
  if (gradleContent.includes('signingConfigs')) {
    console.log('✅ build.gradle ya tiene configuración de firma');
    return;
  }
  
  // Agregar configuración de firma
  const signingConfig = `
    def keystorePropertiesFile = rootProject.file("key.properties")
    def keystoreProperties = new Properties()
    if (keystorePropertiesFile.exists()) {
        keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
    }
`;

  const signingConfigsBlock = `
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
            }
        }
    }
`;

  // Insertar después de "android {"
  const androidIndex = gradleContent.indexOf('android {');
  if (androidIndex !== -1) {
    const insertIndex = gradleContent.indexOf('\n', androidIndex) + 1;
    gradleContent = gradleContent.slice(0, insertIndex) + signingConfig + gradleContent.slice(insertIndex);
  }
  
  // Insertar signingConfigs antes de buildTypes (sin modificar la estructura existente)
  const buildTypesIndex = gradleContent.indexOf('buildTypes {');
  if (buildTypesIndex !== -1 && !gradleContent.includes('signingConfigs {')) {
    gradleContent = gradleContent.slice(0, buildTypesIndex) + signingConfigsBlock + '\n    ' + gradleContent.slice(buildTypesIndex);
  }
  
  // Asegurar que release incluya la firma sin reemplazar el bloque completo
  if (!gradleContent.includes('signingConfig signingConfigs.release')) {
    gradleContent = gradleContent.replace(/release\s*\{/, 'release {\n            signingConfig signingConfigs.release');
  }
  
  fs.writeFileSync(gradlePath, gradleContent);
  console.log('✅ build.gradle actualizado con configuración de firma');
}

setupSigning();

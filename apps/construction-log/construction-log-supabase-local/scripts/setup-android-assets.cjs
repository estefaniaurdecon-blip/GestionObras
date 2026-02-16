const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🎨 Configurando assets de Android (iconos y splash screen)...\n');

try {
  // 1. Generar iconos de 192px
  console.log('📱 Paso 1: Generando iconos base...');
  execSync('node scripts/generate-android-icons.cjs', { stdio: 'inherit' });
  
  // 2. Verificar que @capacitor/assets está instalado
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  if (!packageJson.devDependencies['@capacitor/assets']) {
    console.log('\n📦 Instalando @capacitor/assets...');
    execSync('npm install --save-dev @capacitor/assets', { stdio: 'inherit' });
  }
  
  // 3. Generar todos los assets de Capacitor
  console.log('\n🎨 Paso 2: Generando todos los assets de Android...');
  console.log('   (Esto incluye iconos en todos los tamaños y splash screens)\n');
  execSync('npx @capacitor/assets generate --android', { stdio: 'inherit' });
  
  console.log('\n✅ Assets de Android generados exitosamente!');
  console.log('\n📋 Próximos pasos:');
  console.log('   1. npm run build');
  console.log('   2. npx cap sync android');
  console.log('   3. npx cap run android\n');
  
} catch (error) {
  console.error('\n❌ Error generando assets:', error.message);
  console.log('\n💡 Intenta ejecutar los comandos manualmente:');
  console.log('   1. node scripts/generate-android-icons.cjs');
  console.log('   2. npm install --save-dev @capacitor/assets');
  console.log('   3. npx @capacitor/assets generate --android\n');
  process.exit(1);
}
